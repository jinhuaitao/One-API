/**
 * oneapi-gateway — One-API 风格的 AI 网关 (Cloudflare Workers + R2)
 *
 * 对外接口（OpenAI 兼容）：
 *  - GET  /v1/models              模型列表（按已启用渠道聚合，受密钥「允许模型」限制）
 *  - POST /v1/chat/completions    聊天补全（支持 stream 流式透传）
 *  - POST /v1/completions         文本补全
 *  - POST /v1/embeddings          向量
 *
 * 渠道类型：
 *  - openai    ：OpenAI 兼容接口，直接透传（OpenAI / DeepSeek / Moonshot / 通义 等）
 *  - anthropic ：Anthropic 原生 /v1/messages，网关自动完成 OpenAI ↔ Anthropic 格式互转
 *
 * 路由与容错：
 *  - 按请求 model 匹配渠道 → 按 priority 分组 → 组内按 weight 加权随机 → 失败自动切换
 *  - 单渠道支持多 Key（英文逗号分隔），随机起点轮询，单个 Key 失败自动换下一个
 *  - 可配置请求超时（默认 60s，作用于首字节）与瞬时错误重试（429/5xx/网络异常）
 *
 * 流式（SSE）健壮性：
 *  - 收尾守卫（guardSSEStream）：上游中途断开时不再让错误冒泡成「连接被重置」，
 *    而是补一个 error 事件 + data: [DONE] 后正常收尾，客户端能拿到明确结束
 *  - 静默超时（stream_idle_timeout_ms）：流式响应单独有读超时，
 *    上游长时间零字节即主动断开并收尾（request_timeout_ms 只覆盖首字节）
 *  - 结束原因可观测：日志记录 finish = complete / client_abort / upstream_error / timeout
 *  - 上游未发送 [DONE] 时由网关补发；Anthropic 的 ping 心跳会转发为 SSE 注释保活
 *
 * 数据（全部存放于 R2）：
 *  - data/channels.json   渠道配置
 *  - data/keys.json       网关密钥
 *  - data/settings.json   网关设置（定价、超时、日志保留期等）
 *  - data/stats/<日期>.json  按天聚合的统计（请求数 / Tokens / 费用 / 分模型分渠道分密钥）
 *  - logs/<日期>/<倒序时间戳>-<随机>.json  请求日志（key 倒序，列表天然按时间倒序）
 *
 * 环境变量 / 绑定：
 *  - R2        : r2_buckets 绑定（wrangler.toml），bucket 由构建脚本自动创建
 *  - ADMIN_KEY : 管理员密钥，请设为 Secret（管理后台 + 管理 API 鉴权）
 */

import { ADMIN_HTML } from './admin-ui.js';

const VERSION = '2.0.0';
const CHANNELS_KEY = 'data/channels.json';
const KEYS_KEY = 'data/keys.json';
const SETTINGS_KEY = 'data/settings.json';
const STATS_PREFIX = 'data/stats/';
const LOG_PREFIX = 'logs/';
/** 13 位时间戳上限，用于生成「越大越新」的倒序 key */
const LOG_TS_MAX = 9999999999999;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...extra,
    },
  });

const err = (message, status = 400, code = 'error') =>
  json({ error: { message, code } }, status);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const rand = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
const reqId = () => 'req_' + Date.now().toString(36) + rand(6);

/**
 * 按配置的时区偏移计算「当地日期」（YYYY-MM-DD）。
 *
 * Worker 运行在 UTC，若直接用 toISOString() 取日期，会与控制台（浏览器本地时区）
 * 相差一天：例如北京时间凌晨 2 点写入的日志会被归到「UTC 前一天」，
 * 而控制台默认查询当天 → 查询结果为空。因此统一用可配置的时区偏移换算。
 */
function dateStr(ts, offsetMinutes) {
  const t = (ts == null ? Date.now() : ts) + (Number(offsetMinutes) || 0) * 60000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 同上，取「当地小时」（0-23），用于统计里的小时分布 */
function hourStr(ts, offsetMinutes) {
  const t = (ts == null ? Date.now() : ts) + (Number(offsetMinutes) || 0) * 60000;
  return String(new Date(t).getUTCHours());
}

function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
/** 保留 8 位小数，避免浮点误差累积 */
const round8 = (n) => Math.round((Number(n) || 0) * 1e8) / 1e8;

/* ---------------- 渠道 API Key（支持多 Key） ---------------- */

/**
 * 解析渠道的 API Key：支持用英文逗号分隔多个 Key。
 * 例如："sk-a,sk-b,sk-c" 会被解析为 3 个 Key。
 * 请求时会随机轮询起点，单个 Key 失败自动尝试下一个 Key。
 */
function channelKeys(channel) {
  return String(channel.api_key || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

/* ---------------- R2 数据层 ---------------- */

async function r2GetJson(env, key, fallback) {
  try {
    const obj = await env.R2.get(key);
    if (!obj) return fallback;
    return await obj.json();
  } catch {
    return fallback;
  }
}

async function r2PutJson(env, key, value) {
  await env.R2.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

/**
 * 按对象名串行化「读-改-写」。
 *
 * R2 没有 CAS，统计与密钥用量都是「读整个 JSON → 改 → 写回」，
 * 并发请求会互相覆盖（丢计数、用量被回退）。
 * 这里用一把 per-key 的 promise 队列把同一 isolate 内的并发写排成队，
 * 能消除绝大多数丢更新；跨 isolate 的竞态依然存在，
 * 需要精确对账时请以请求日志为准（或改用 Durable Objects）。
 */
const rwLocks = new Map();

function withLock(name, fn) {
  const prev = rwLocks.get(name) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => {},
    () => {}
  );
  rwLocks.set(name, tail);
  tail.then(() => {
    if (rwLocks.get(name) === tail) rwLocks.delete(name);
  });
  return run;
}

/**
 * 热路径短 TTL 缓存。
 *
 * /v1/* 的每次代理请求都要读 channels.json（选渠道）与 keys.json（鉴权 + 配额），
 * 但这两份数据极少变动。未缓存时每个请求固定要多付 2 次 R2 往返，
 * 直接体现在首字节延迟上（上游再快也白搭）。
 *
 * 缓存窗口取得很短（渠道 3s / 密钥 1s），并且管理后台的保存接口会主动失效，
 * 因此「在控制台改完立刻生效」的语义不受影响；只有绕过控制台直接改 R2 的场景
 * 才会有最多一个窗口的延迟，这对本项目的使用方式是可接受的。
 */
const hotCache = new Map(); // r2 key -> { at, value }

async function cachedJson(env, key, fallback, ttlMs) {
  const now = Date.now();
  const hit = hotCache.get(key);
  if (hit && now - hit.at < (ttlMs || 2000)) return hit.value;
  const value = await r2GetJson(env, key, fallback);
  hotCache.set(key, { at: now, value });
  return value;
}

function invalidateCache(...keys) {
  for (const k of keys) hotCache.delete(k);
}

/** 渠道配置的缓存窗口（路由用；变更极少，可以放宽一点） */
const CHANNELS_TTL_MS = 3000;
/** 密钥的缓存窗口（鉴权 + 配额，安全相关，取更短的窗口） */
const KEYS_TTL_MS = 1000;

/* ---------------- 设置 ---------------- */

function defaultSettings() {
  return {
    /** 是否允许用 ADMIN_KEY 直接作为网关密钥调用 /v1/*（便于自测） */
    allow_admin_key_as_api_key: true,
    /** 上游请求超时（毫秒，首字节） */
    request_timeout_ms: 60000,
    /** 瞬时错误（429/5xx/网络异常）在同一 Key 上的额外重试次数 */
    retries: 1,
    /**
     * 流式响应的「静默超时」（毫秒）：上游超过该时长一个字节都没下发，
     * 即判定为断流，网关主动断开上游并给客户端一个可解析的收尾。
     * 注意 request_timeout_ms 只作用于「首字节」，无法覆盖流中途卡死的情况，
     * 因此流式必须单独有这个读超时。
     */
    stream_idle_timeout_ms: 60000,
    /**
     * 流式响应的「下游保活间隔」（毫秒）：网关超过该时长没有向调用方下发任何字节时，
     * 主动补一条 SSE 注释（`: ka\n\n`）。标准 SSE 客户端会忽略注释行，
     * 但链路上的 nginx / CDN / 客户端读超时因此不会遇到「零字节窗口」，
     * 模型长思考、上游排队时不再被中途掐断。
     * 与 stream_idle_timeout_ms 互补：后者管「上游→网关」，本项管「网关→调用方」。
     * 0 = 关闭。
     */
    stream_keepalive_ms: 15000,
    /** 请求日志保留天数（供「清理日志」使用） */
    log_retention_days: 30,
    /**
     * 统计与日志使用的时区偏移（分钟）。默认 480 = UTC+8（北京时间）。
     * Worker 运行在 UTC，若为 0，则北京时间凌晨写入的日志会被归到前一天，
     * 导致控制台按「今天」查询时为空。
     */
    timezone_offset_minutes: 480,
    /** 额外对外暴露的模型名（不影响路由，仅用于 /v1/models 展示） */
    custom_models: [],
    /** 默认定价（美元 / 每 100 万 Tokens） */
    default_pricing: { in: 0, out: 0 },
    /** 按模型定价：{ "gpt-4o-mini": { "in": 0.15, "out": 0.6 } } */
    pricing: {},
  };
}

function normalizeSettings(raw) {
  const d = defaultSettings();
  const s = { ...d, ...(raw || {}) };
  s.allow_admin_key_as_api_key = s.allow_admin_key_as_api_key !== false;
  s.request_timeout_ms = clampInt(s.request_timeout_ms, 1000, 600000, d.request_timeout_ms);
  s.retries = clampInt(s.retries, 0, 5, d.retries);
  s.stream_idle_timeout_ms = clampInt(
    s.stream_idle_timeout_ms,
    5000,
    600000,
    d.stream_idle_timeout_ms
  );
  s.stream_keepalive_ms = clampInt(
    s.stream_keepalive_ms,
    0,
    600000,
    d.stream_keepalive_ms
  );
  s.log_retention_days = clampInt(s.log_retention_days, 1, 3650, d.log_retention_days);
  s.timezone_offset_minutes = clampInt(
    s.timezone_offset_minutes,
    -720,
    840,
    d.timezone_offset_minutes
  );
  s.custom_models = Array.isArray(s.custom_models)
    ? s.custom_models.map((m) => String(m).trim()).filter(Boolean)
    : [];
  const normP = (p) => ({ in: clampNum(p && p.in, 0, 1e6, 0), out: clampNum(p && p.out, 0, 1e6, 0) });
  s.default_pricing = normP(s.default_pricing);
  const pricing = {};
  if (s.pricing && typeof s.pricing === 'object') {
    for (const [m, p] of Object.entries(s.pricing)) {
      const name = String(m).trim();
      if (name) pricing[name] = normP(p);
    }
  }
  s.pricing = pricing;
  return s;
}

/** 依据定价表计算一次请求的费用（美元） */
function usageCost(settings, model, usage) {
  if (!usage) return 0;
  const p =
    (settings && settings.pricing && settings.pricing[model]) ||
    (settings && settings.default_pricing) ||
    { in: 0, out: 0 };
  const pin = Number(p.in) || 0;
  const pout = Number(p.out) || 0;
  return round8(
    ((usage.prompt_tokens || 0) / 1e6) * pin +
      ((usage.completion_tokens || 0) / 1e6) * pout
  );
}

/* ---------------- 种子数据 ---------------- */

function defaultChannels() {
  return [
    {
      id: 'demo',
      name: '示例渠道（未启用）',
      type: 'openai',
      base_url: 'https://api.openai.com',
      api_key: '',
      models: ['gpt-4o-mini'],
      model_map: {},
      headers: {},
      priority: 100,
      weight: 1,
      enabled: false,
    },
    {
      id: 'demo-anthropic',
      name: '示例渠道-Anthropic（未启用）',
      type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: '',
      models: ['claude-sonnet-4-5'],
      model_map: {},
      headers: {},
      default_max_tokens: 4096,
      priority: 100,
      weight: 1,
      enabled: false,
    },
  ];
}

/**
 * 种子数据是否已就绪。
 *
 * 模块级标记：单个 isolate 内只真正检查一次。否则每个请求（含 /v1/* 代理）
 * 都要额外做 3 次串行 R2 GET，白白抬高首字节延迟。
 * 即使标记失效（新的 isolate），下面的检查也是幂等的，最坏情况只是多读一次。
 */
let seeded = false;

/** 首次访问时初始化 R2 数据结构（幂等，且单个 isolate 内只执行一次） */
async function ensureSeed(env) {
  if (seeded) return;
  try {
    // 三个检查彼此独立，并行发起，避免串行等待
    const [ch, ks, st] = await Promise.all([
      env.R2.get(CHANNELS_KEY),
      env.R2.get(KEYS_KEY),
      env.R2.get(SETTINGS_KEY),
    ]);
    const writes = [];
    if (!ch) writes.push(r2PutJson(env, CHANNELS_KEY, defaultChannels()));
    if (!ks) writes.push(r2PutJson(env, KEYS_KEY, []));
    if (!st) writes.push(r2PutJson(env, SETTINGS_KEY, defaultSettings()));
    if (writes.length) await Promise.all(writes);
    seeded = true;
  } catch {
    // 初始化失败不阻断请求，下次请求会重试
  }
}

/**
 * 设置的内存缓存（短 TTL）。
 *
 * 设置在每个请求里都会被读到，但改动极少；缓存 2 秒可显著减少 R2 往返，
 * 同时保证管理后台保存后几乎立刻生效（保存接口会主动失效缓存）。
 */
let settingsCache = { at: 0, value: null };
const SETTINGS_TTL_MS = 2000;

function invalidateSettingsCache() {
  settingsCache = { at: 0, value: null };
}

async function loadSettings(env) {
  const now = Date.now();
  if (settingsCache.value && now - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value;
  }
  const s = normalizeSettings(await r2GetJson(env, SETTINGS_KEY, null));
  settingsCache = { at: now, value: s };
  return s;
}

/* ---------------- 鉴权 ---------------- */

function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** 网关 API Key 鉴权（/v1/*） */
async function authApiKey(env, request, settings) {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      res: err(
        '缺少 API Key，请在 Authorization 头中携带 Bearer Token',
        401,
        'unauthorized'
      ),
    };
  }
  if (env.ADMIN_KEY && token === env.ADMIN_KEY) {
    if (settings && settings.allow_admin_key_as_api_key === false) {
      return {
        ok: false,
        res: err('已禁用 ADMIN_KEY 直接调用，请使用网关密钥', 401, 'admin_key_disabled'),
      };
    }
    return { ok: true, admin: true, name: 'admin', record: null };
  }
  // 走短 TTL 缓存：密钥校验是每个 /v1/* 请求的必经步骤，省下这次 R2 往返很值。
  // 控制台保存密钥会主动失效缓存，所以「禁用后立即生效」不受影响。
  const keys = await cachedJson(env, KEYS_KEY, [], KEYS_TTL_MS);
  const rec = keys.find((k) => k.key === token);
  if (!rec) {
    return { ok: false, res: err('无效的 API Key', 401, 'invalid_key') };
  }
  if (rec.enabled === false) {
    return { ok: false, res: err('该 API Key 已被禁用', 401, 'key_disabled') };
  }
  if (rec.expires_at && Date.now() > Date.parse(rec.expires_at)) {
    return { ok: false, res: err('该 API Key 已过期', 401, 'key_expired') };
  }
  if (rec.quota_tokens > 0 && (rec.used_tokens || 0) >= rec.quota_tokens) {
    return {
      ok: false,
      res: err('该 Key 的 Token 配额已用完', 429, 'quota_exceeded'),
    };
  }
  return { ok: true, admin: false, name: rec.name || 'key', record: rec };
}

/** 管理后台鉴权（/api/admin/*） */
function requireAdmin(env, request) {
  const url = new URL(request.url);
  const key =
    request.headers.get('X-Admin-Key') || url.searchParams.get('admin_key');
  if (!env.ADMIN_KEY) {
    return {
      ok: false,
      res: err(
        '尚未设置 ADMIN_KEY，请在 Cloudflare 控制台将其添加为 Secret 后重试',
        500,
        'admin_key_missing'
      ),
    };
  }
  if (key !== env.ADMIN_KEY) {
    return { ok: false, res: err('Admin Key 不正确', 401, 'unauthorized') };
  }
  return { ok: true };
}

/* ---------------- 渠道路由 ---------------- */

/** 按权重随机打乱一组渠道（权重越大越可能排在前面） */
function weightedShuffle(arr) {
  const items = arr.map((c) => ({ c, w: Math.max(1, Number(c.weight) || 1) }));
  const out = [];
  while (items.length) {
    const total = items.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    let idx = items.length - 1;
    for (let k = 0; k < items.length; k++) {
      r -= items[k].w;
      if (r <= 0) {
        idx = k;
        break;
      }
    }
    out.push(items.splice(idx, 1)[0].c);
  }
  return out;
}

/** 按模型挑选可用渠道（优先级数字越小越优先，同优先级按权重加权随机）
 *  Anthropic 原生渠道仅支持 /v1/chat/completions（OpenAI 侧接口名） */
function pickChannels(channels, model, path) {
  const list = (channels || []).filter((c) => {
    if (!c.enabled || channelKeys(c).length === 0 || !c.base_url) return false;
    const models = c.models || [];
    if (!models.includes('*') && !models.includes(model)) return false;
    if ((c.type || 'openai') === 'anthropic' && path !== '/v1/chat/completions')
      return false;
    return true;
  });
  list.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const out = [];
  let i = 0;
  while (i < list.length) {
    let j = i;
    const p = list[i].priority ?? 100;
    while (j < list.length && (list[j].priority ?? 100) === p) j++;
    out.push(...weightedShuffle(list.slice(i, j)));
    i = j;
  }
  return out;
}

/** 判断上游状态码是否值得在同一 Key 上重试 */
function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ms = clampInt(timeoutMs, 1000, 600000, 60000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // 超时只作用于「首字节」：响应头返回后即清除定时器，不打断后续流式传输。
    // 流式传输中途卡死由 guardSSEStream 的静默超时负责；
    // 非流式响应体的读取由 withBodyTimeout 负责。
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 计算一次上游请求实际生效的超时（渠道可单独覆盖） */
function channelTimeoutMs(channel, settings) {
  return clampInt(
    (channel && channel.timeout_ms) || (settings && settings.request_timeout_ms) || 60000,
    1000,
    600000,
    60000
  );
}

/**
 * 非流式响应：给「读取响应体」也加上超时。
 *
 * fetchWithTimeout 只覆盖到响应头（首字节），若上游发完响应头后卡住不吐 body，
 * 非流式请求同样会无限挂起。这里用 Promise.race 兜底，超时后主动 cancel 上游 body。
 */
async function withBodyTimeout(res, timeoutMs, read) {
  const ms = clampInt(timeoutMs, 1000, 600000, 60000);
  let timer = null;
  try {
    return await Promise.race([
      read(res),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try {
            if (res.body) res.body.cancel().catch(() => {});
          } catch {
            // 忽略
          }
          reject(new Error(`读取上游响应体超时（${ms}ms）`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------------- Anthropic 原生渠道（格式翻译） ---------------- */

function mapAnthropicStopReason(reason) {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

function anthropicImageBlock(url) {
  const m = String(url).match(/^data:([^;]+);base64,(.+)$/s);
  if (m) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: m[1], data: m[2] },
    };
  }
  if (/^https?:\/\//i.test(url)) {
    return { type: 'image', source: { type: 'url', url } };
  }
  return null;
}

/** OpenAI Chat Completions 请求 → Anthropic Messages 请求 */
function openaiToAnthropic(body, channel) {
  const model =
    channel.model_map && channel.model_map[body.model]
      ? channel.model_map[body.model]
      : body.model;

  const systemParts = [];
  const messages = [];
  // Anthropic 要求相邻消息角色交替，连续同角色消息合并
  const pushMsg = (role, content) => {
    if (!content.length) return;
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content = last.content.concat(content);
    } else {
      messages.push({ role, content: content.slice() });
    }
  };
  const textOf = (c) => (typeof c === 'string' ? c : JSON.stringify(c ?? ''));

  for (const m of body.messages || []) {
    // system / developer 统一折叠为 Anthropic 的 system
    if (m.role === 'system' || m.role === 'developer') {
      if (m.content) systemParts.push(textOf(m.content));
      continue;
    }
    // OpenAI tool 结果 → Anthropic tool_result（必须挂在 user role 下）
    if (m.role === 'tool') {
      const blocks = [];
      const parts =
        typeof m.content === 'string'
          ? [{ type: 'text', text: m.content }]
          : m.content || [];
      for (const p of parts) {
        if (p.type === 'text' && p.text) blocks.push({ type: 'text', text: p.text });
      }
      pushMsg('user', [
        {
          type: 'tool_result',
          tool_use_id: m.tool_call_id || '',
          content: blocks.length ? blocks : '',
        },
      ]);
      continue;
    }

    const blocks = [];
    const parts =
      typeof m.content === 'string'
        ? [{ type: 'text', text: m.content }]
        : m.content || [];
    for (const p of parts) {
      if (p.type === 'text' && p.text) {
        blocks.push({ type: 'text', text: p.text });
      } else if (p.type === 'image_url' && p.image_url && p.image_url.url) {
        const img = anthropicImageBlock(p.image_url.url);
        if (img) blocks.push(img);
      }
    }
    // assistant 的 tool_calls → Anthropic tool_use
    for (const tc of m.tool_calls || []) {
      let input = {};
      try {
        input = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        input = {};
      }
      blocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function?.name || '',
        input,
      });
    }
    pushMsg(m.role === 'assistant' ? 'assistant' : 'user', blocks);
  }

  const out = {
    model,
    max_tokens: body.max_tokens || channel.default_max_tokens || 4096,
    messages,
  };
  if (systemParts.length) out.system = systemParts.join('\n\n');
  // Anthropic temperature 上限为 1，做钳制避免上游报错
  if (body.temperature !== undefined)
    out.temperature = Math.min(Math.max(body.temperature, 0), 1);
  if (body.top_p !== undefined) out.top_p = body.top_p;
  if (body.stop)
    out.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];

  // tools 翻译：OpenAI function tools → Anthropic tools
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools
      .filter((t) => t.type === 'function' && t.function?.name)
      .map((t) => ({
        name: t.function.name,
        description: t.function.description || '',
        input_schema: t.function.parameters || { type: 'object', properties: {} },
      }));
    const tc = body.tool_choice;
    if (tc === 'auto') out.tool_choice = { type: 'auto' };
    else if (tc === 'required') out.tool_choice = { type: 'any' };
    else if (tc && typeof tc === 'object' && tc.type === 'function')
      out.tool_choice = { type: 'tool', name: tc.function.name };
  }

  if (body.stream) out.stream = true;
  return out;
}

/** Anthropic Messages 响应 → OpenAI Chat Completions 响应（非流式） */
function anthropicToOpenAI(data, model) {
  const texts = [];
  const toolCalls = [];
  for (const b of data.content || []) {
    if (b.type === 'text' && b.text) texts.push(b.text);
    else if (b.type === 'tool_use')
      toolCalls.push({
        id: b.id,
        type: 'function',
        function: {
          name: b.name,
          arguments: JSON.stringify(b.input ?? {}),
        },
      });
  }
  const message = {
    role: 'assistant',
    content: texts.length ? texts.join('') : null,
  };
  if (toolCalls.length) message.tool_calls = toolCalls;
  const usage = data.usage || {};
  const rawId = String(data.id || '').replace(/^msg_/, '');
  return {
    id: 'chatcmpl-' + (rawId || Math.random().toString(36).slice(2)),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: mapAnthropicStopReason(data.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: usage.input_tokens || 0,
      completion_tokens: usage.output_tokens || 0,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
  };
}

/** Anthropic SSE → OpenAI SSE（流式翻译）
 *  onFinish 可选回调：结束（正常或异常）时返回 (usage, finish)，
 *  usage 从 message_start / message_delta 事件中提取，拿不到则为 null；
 *  finish 取值 complete / client_abort / upstream_error / timeout。
 *  idleMs > 0 时启用静默超时。 */
function anthropicStreamToOpenAI(
  upstreamBody,
  model,
  onFinish = () => {},
  idleMs = 0,
  keepaliveMs = 0
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const created = Math.floor(Date.now() / 1000);
  let msgId = 'chatcmpl-' + Math.random().toString(36).slice(2);
  let buffer = '';
  let stopReason = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let usageSettled = false;
  const toolIndexByBlock = {};
  let toolCounter = 0;

  const settleUsage = (u, finish, meta) => {
    if (usageSettled) return;
    usageSettled = true;
    try {
      onFinish(u, finish || 'complete', meta);
    } catch {
      // 忽略
    }
  };

  const sse = (controller, obj) =>
    controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n'));
  const chunk = (delta, finish_reason) => ({
    id: msgId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finish_reason || null }],
  });

  const handle = (event, p, controller) => {
    if (event === 'message_start') {
      if (p.message && p.message.id)
        msgId = 'chatcmpl-' + String(p.message.id).replace(/^msg_/, '');
      const u = p.message && p.message.usage;
      if (u) {
        inputTokens = u.input_tokens || 0;
        outputTokens = u.output_tokens || 0;
      }
      sse(controller, chunk({ role: 'assistant' }));
    } else if (event === 'content_block_start') {
      const b = p.content_block || {};
      if (b.type === 'tool_use') {
        const ti = toolCounter++;
        toolIndexByBlock[p.index] = ti;
        sse(
          controller,
          chunk({
            tool_calls: [
              {
                index: ti,
                id: b.id,
                type: 'function',
                function: { name: b.name, arguments: '' },
              },
            ],
          })
        );
      }
    } else if (event === 'content_block_delta') {
      const d = p.delta || {};
      if (d.type === 'text_delta' && d.text) {
        sse(controller, chunk({ content: d.text }));
      } else if (d.type === 'input_json_delta' && d.partial_json) {
        const ti = toolIndexByBlock[p.index] ?? 0;
        sse(
          controller,
          chunk({
            tool_calls: [{ index: ti, function: { arguments: d.partial_json } }],
          })
        );
      }
    } else if (event === 'message_delta') {
      if (p.delta && p.delta.stop_reason)
        stopReason = mapAnthropicStopReason(p.delta.stop_reason);
      if (p.usage && typeof p.usage.output_tokens === 'number')
        outputTokens = p.usage.output_tokens;
    } else if (event === 'message_stop') {
      sse(controller, chunk({}, stopReason || 'stop'));
    } else if (event === 'ping') {
      // Anthropic 用 ping 保活。必须转发：模型长时间「思考」时若链路零字节，
      // 中间的 nginx / CDN / 客户端读超时会主动掐断连接，用户看到的就是断流。
      controller.enqueue(encoder.encode(': ping\n\n'));
    }
    // content_block_stop 等事件无需转发
  };

  const transform = new TransformStream({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      // 容忍 CRLF：部分 Anthropic 兼容中转（套一层的网关）会输出 \r\n，
      // 只按 \n\n 切分会永远拼不出一个完整事件，表现为「流式翻译零输出」。
      // 对整个缓冲区做替换，因此 \r 与 \n 落在两个分片里也能正确合并。
      if (buffer.indexOf('\r') >= 0) buffer = buffer.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = '';
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          handle(event, JSON.parse(data), controller);
        } catch {
          // 忽略无法解析的事件
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      const total = inputTokens + outputTokens;
      settleUsage(
        total > 0
          ? {
              prompt_tokens: inputTokens,
              completion_tokens: outputTokens,
              total_tokens: total,
            }
          : null,
        'complete'
      );
    },
  });

  // 上游错误交给 guardSSEStream 统一收尾并上报结束原因
  // （正常路径由 flush 先结算 usage，settleUsage 自带幂等保护）
  upstreamBody.pipeTo(transform.writable).catch(() => {});
  return guardSSEStream(transform.readable, {
    onFinish: (reason, meta) => settleUsage(null, reason, meta),
    idleMs,
    keepaliveMs,
  });
}

/**
 * 把单个 SSE 数据块里的 model 字段改写为「网关模型名」，顺带提取 usage。
 *
 * - 只有当整块都由 data: 行组成、且每行都是合法 JSON 时才重写（保留 [DONE]）；
 *   出现 event: / id: / retry: 或非 JSON 数据时，整块原样返回，避免破坏协议。
 * - usage 提取依赖上游支持 stream_options.include_usage（[DONE] 前会有一个只带 usage 的 chunk）。
 * - 快路径：既不含 "model" 也不含 "usage" 的块直接原样返回，跳过 JSON 解析/序列化。
 *   这一步很关键——长回答有上千个 chunk，每个都 parse+stringify 会累积大量 CPU 时间，
 *   越过 Workers 的 CPU 时限后请求会被运行时直接终止，表现就是「流到一半断掉」。
 */
function rewriteSseBlock(raw, model, onUsage) {
  if (!raw.includes('"model"') && !raw.includes('"usage"')) return raw;

  const lines = raw.split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith('data:')) return raw; // 非纯 data 块，原样透传
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') {
      out.push('data: [DONE]');
      continue;
    }
    let obj = null;
    try {
      obj = JSON.parse(payload);
    } catch {
      return raw; // 非 JSON，原样透传
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return raw;
    if (obj.usage && typeof obj.usage.total_tokens === 'number') onUsage(obj.usage);
    // 回显网关模型名，让调用方看到的始终是自己请求的那个名字
    if (obj.model !== undefined) obj.model = model;
    out.push('data: ' + JSON.stringify(obj));
  }
  return out.length ? out.join('\n') : raw;
}

/** 判断一个 SSE 块是否是结束标记（精确匹配，避免把正文里的 "[DONE]" 误判） */
const isDoneBlock = (raw) => /^\s*data:\s*\[DONE\]\s*$/m.test(raw);

/**
 * 给 SSE 流套一层「收尾守卫」。
 *
 * 解决断流的核心：上游中途断开时，如果直接让错误冒泡，
 * 客户端看到的是一次「连接被重置」——既不完整、也无法判断是网关问题还是上游问题。
 * 这里把异常转换成一次可控收尾：补一个 error 事件 + data: [DONE] 再正常 close，
 * 客户端能拿到明确结束，而不是 TCP 层被掐断。
 *
 * 同时负责四件事：
 *  - 静默超时（idleMs）：上游超过该时长一个字节都没下发，主动断开上游并收尾；
 *  - 下游保活（keepaliveMs）：网关超过该时长没有向调用方下发任何字节时，
 *    主动补一条 SSE 注释（`: ka\n\n`）。标准客户端会忽略注释行，但链路上的
 *    nginx / CDN / 客户端读超时因此不会再遇到「零字节窗口」——
 *    模型长思考、上游排队时不再被中途掐断。与 idleMs 互补：一个管上游→网关，一个管网关→调用方；
 *  - 结束原因回报（onFinish）：complete / client_abort / upstream_error / timeout，
 *    让「断流」第一次变得可观测；
 *  - 诊断信息（onFinish 第二个参数）：{ bytes, first_byte }——已向调用方转发的字节数、
 *    是否收到过上游首块，用于区分「上游从没吐过字」和「吐到一半停了」。
 */
function guardSSEStream(src, { onFinish, idleMs = 0, keepaliveMs = 0 } = {}) {
  const encoder = new TextEncoder();
  let reader = null;
  let idleTimer = null;
  let kaTimer = null;
  let settled = false;
  let timedOut = false;
  let closed = false;
  let bytesOut = 0;
  let gotFirst = false;
  let lastOutAt = 0;
  let controllerRef = null; // start() 里赋值，供保活定时器向下游写注释用
  // 保活定时器的检查周期：约 keepaliveMs / 4，并夹在 [50ms, keepaliveMs] 之间。
  // 上界保证注释下发时刻不会比配置的间隔更晚；下界避免极小配置把 isolate 唤醒成空转。
  const KA_TICK =
    keepaliveMs > 0
      ? Math.min(Math.max(50, Math.floor(keepaliveMs / 4)), Math.max(50, keepaliveMs))
      : 0;

  const meta = () => ({ bytes: bytesOut, first_byte: gotFirst });

  const settle = (reason) => {
    if (settled) return;
    settled = true;
    try {
      onFinish(reason, meta());
    } catch {
      // 忽略
    }
  };

  const clearIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const clearKa = () => {
    if (kaTimer) {
      clearInterval(kaTimer);
      kaTimer = null;
    }
  };

  const clearTimers = () => {
    clearIdle();
    clearKa();
  };

  /** 异常收尾报文：一个可解析的 error 事件 + [DONE]，让调用方拿到明确结束而非 TCP 重置 */
  const tail = (reason) => {
    const message =
      reason === 'timeout'
        ? '上游超过静默超时未返回数据，网关已中断本次流式响应'
        : '上游流式响应中途中断，网关已提前结束本次流式响应';
    return (
      'data: ' +
      JSON.stringify({
        error: { message, type: 'gateway_stream_error', code: reason },
      }) +
      '\n\n' +
      'data: [DONE]\n\n'
    );
  };

  /** 武装下游保活：常驻定时器 + 时间戳比较。
   *
   *  原实现每向调用方写一个 chunk 都要 clearInterval + setInterval，
   *  一次长回答上千个 chunk 就是上千次定时器创建 / 销毁 —— 这些开销都记在
   *  Workers 的 CPU 时间里，而免费版只有 10ms。改成常驻定时器后，写路径
   *  只更新一个时间戳，定时器数量恒定为 1，对外语义（超过 keepaliveMs
   *  没下发任何字节就补一条 SSE 注释）完全不变。 */
  const armKa = () => {
    if (!keepaliveMs || kaTimer || closed) return;
    lastOutAt = Date.now();
    kaTimer = setInterval(() => {
      if (closed) {
        clearKa();
        return;
      }
      if (Date.now() - lastOutAt < keepaliveMs) return;
      try {
        controllerRef.enqueue(encoder.encode(': ka\n\n'));
        bytesOut += 6;
        lastOutAt = Date.now();
      } catch {
        closed = true;
        clearKa();
      }
    }, KA_TICK);
  };

  /** 向调用方下发字节的统一入口：统计字节数并刷新「最后下发时刻」，供保活定时器判断 */
  const out = (controller, bytes) => {
    if (closed) return;
    try {
      controller.enqueue(bytes);
      bytesOut += bytes.byteLength;
      lastOutAt = Date.now();
    } catch {
      closed = true;
      clearKa();
    }
  };

  return new ReadableStream({
    async start(controller) {
      controllerRef = controller;
      reader = src.getReader();
      const arm = () => {
        if (!idleMs) return;
        clearIdle();
        idleTimer = setTimeout(() => {
          timedOut = true;
          // 主动断开上游：挂起的 read() 会以 done 结束，随后走超时收尾
          try {
            reader.cancel('idle-timeout');
          } catch {
            // 忽略
          }
        }, idleMs);
      };

      try {
        arm();
        armKa(); // 首块之前下游同样是零字节：长 prompt / 上游排队期间靠它保活
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          gotFirst = true;
          arm();
          out(controller, value);
        }
        clearTimers();
        if (timedOut) {
          out(controller, encoder.encode(tail('timeout')));
          settle('timeout');
        } else {
          settle('complete');
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // 忽略
        }
      } catch (e) {
        clearTimers();
        if (!settled) {
          out(controller, encoder.encode(tail('upstream_error')));
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // 忽略
        }
        settle(e && e.name === 'AbortError' ? 'timeout' : 'upstream_error');
      }
    },
    cancel(reason) {
      clearTimers();
      closed = true;
      settle('client_abort');
      try {
        if (reader) reader.cancel(reason);
      } catch {
        // 忽略
      }
    },
  });
}

/**
 * 透传 OpenAI SSE 流：逐块改写 model 为网关模型名，并提取末尾的 usage。
 * 数据内容除 model 字段外保持不变，不影响流式体验；
 * 结束（正常或异常）时通过 onFinish(usage, finish) 回调上报，
 * finish 取值：complete / client_abort / upstream_error / timeout。
 * idleMs > 0 时启用静默超时（上游超过该时长无任何字节即判定断流）。
 */
function rewriteOpenAISSE(
  upstreamBody,
  model,
  onFinish = () => {},
  idleMs = 0,
  keepaliveMs = 0
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let usage = null;
  let settled = false;
  let sawDone = false;

  const done = (finish, meta) => {
    if (settled) return;
    settled = true;
    try {
      onFinish(usage, finish, meta);
    } catch {
      // 忽略
    }
  };
  const capture = (u) => {
    usage = u;
  };

  const transform = new TransformStream({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true }).replace(/\r\n?/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (isDoneBlock(raw)) sawDone = true;
        controller.enqueue(encoder.encode(rewriteSseBlock(raw, model, capture) + '\n\n'));
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        if (isDoneBlock(buffer)) sawDone = true;
        controller.enqueue(encoder.encode(rewriteSseBlock(buffer, model, capture)));
      }
      // 部分兼容上游不会发送 [DONE]，由网关补上，避免客户端一直等不到流结束
      if (!sawDone) controller.enqueue(encoder.encode('\n\ndata: [DONE]\n\n'));
      done('complete');
    },
  });

  // 上游错误不再在这里吞掉：交给 guardSSEStream 统一收尾并上报结束原因
  upstreamBody.pipeTo(transform.writable).catch(() => {});
  return guardSSEStream(transform.readable, {
    onFinish: done,
    idleMs,
    keepaliveMs,
  });
}

/* ---------------- 上游转发 ---------------- */

function upstreamHeaders(channel, base) {
  const extra = channel.headers && typeof channel.headers === 'object' ? channel.headers : {};
  return { ...base, ...extra };
}

/**
 * 已知不支持 stream_options 的渠道（模块级 best-effort）。
 * 命中后不再注入该参数，省掉每个请求都白试一次的开销。
 */
const usageUnsupportedChannels = new Set();

const channelTag = (ch) => String(ch.id || ch.name || ch.base_url || 'unknown');

async function forwardOpenAI(channel, apiKey, path, payload, settings) {
  const url = channel.base_url.replace(/\/+$/, '') + path;
  const body = { ...payload };
  // model_map：网关模型名 -> 渠道侧真实模型名
  if (body.model && channel.model_map && channel.model_map[body.model]) {
    body.model = channel.model_map[body.model];
  }
  // 流式请求尝试索取 usage（用于精确统计 token）；上游不支持该参数时自动降级重试
  const wantUsage =
    body.stream &&
    path === '/v1/chat/completions' &&
    !usageUnsupportedChannels.has(channelTag(channel));
  if (wantUsage) {
    body.stream_options = { ...(body.stream_options || {}), include_usage: true };
  }
  const timeout = channelTimeoutMs(channel, settings);
  const doFetch = (b) =>
    fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: upstreamHeaders(channel, {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        }),
        body: JSON.stringify(b),
      },
      timeout
    );

  let res = await doFetch(body);

  // 降级：上游不接受 stream_options 时去掉该参数重试。
  // 不局限于 HTTP 400 —— 实测上游可能返回 422 / 404，或用别的文案报「参数不支持」。
  // 只克隆响应体做探测，不消耗原响应，保证失败路径仍能拿到完整错误信息。
  if (wantUsage && res.status >= 400 && res.status < 500) {
    let text = '';
    try {
      text = await res.clone().text();
    } catch {
      // 拿不到文本就只按状态码判断
    }
    const looksUnsupported =
      res.status === 400 ||
      /stream_options|include_usage|unsupported|unrecognized|unknown|invalid|extra/i.test(
        text
      );
    if (looksUnsupported) {
      usageUnsupportedChannels.add(channelTag(channel));
      const fallback = { ...body };
      delete fallback.stream_options;
      let retry = null;
      try {
        retry = await doFetch(fallback);
      } catch {
        retry = null;
      }
      if (retry && retry.ok) {
        // 释放原响应体，避免未消费的子请求一直挂着
        try {
          await res.body?.cancel();
        } catch {
          // 忽略
        }
        res = retry;
      } else if (retry) {
        try {
          await retry.body?.cancel();
        } catch {
          // 忽略
        }
      }
    }
  }
  return { res, translated: false };
}

async function forwardAnthropic(channel, apiKey, payload, settings) {
  const url = channel.base_url.replace(/\/+$/, '') + '/v1/messages';
  const timeout = channelTimeoutMs(channel, settings);
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: upstreamHeaders(channel, {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': channel.anthropic_version || '2023-06-01',
      }),
      body: JSON.stringify(openaiToAnthropic(payload, channel)),
    },
    timeout
  );
  return { res, translated: true };
}

/** 按渠道类型分发：openai 走 OpenAI 兼容接口，anthropic 走原生 /v1/messages 并翻译格式 */
async function forwardOnce(channel, apiKey, path, payload, settings) {
  if ((channel.type || 'openai') === 'anthropic') {
    return forwardAnthropic(channel, apiKey, payload, settings);
  }
  return forwardOpenAI(channel, apiKey, path, payload, settings);
}

/* ---------------- 日志 / 统计 / 用量 ---------------- */

/** 记录请求日志到 R2。key 使用「倒序时间戳」，使 R2 列表天然按时间从新到旧返回 */
async function logUsage(env, entry, settings) {
  try {
    const day = dateStr(Date.now(), settings && settings.timezone_offset_minutes);
    const inverted = String(LOG_TS_MAX - Date.now()).padStart(13, '0');
    const key = `${LOG_PREFIX}${day}/${inverted}-${rand(6)}.json`;
    const { auth, ...rest } = entry;
    await env.R2.put(
      key,
      JSON.stringify({
        ts: nowIso(),
        key_name: auth?.name,
        is_admin: !!auth?.admin,
        ...rest,
      })
    );
  } catch {
    // 日志失败不影响主流程
  }
}

function emptyDaily(date) {
  return {
    date,
    requests: 0,
    ok: 0,
    failed: 0,
    tokens: 0,
    cost: 0,
    streams: 0,
    streams_aborted: 0,
    latency_sum: 0,
    latency_n: 0,
    models: {},
    channels: {},
    keys: {},
    hours: {},
  };
}

function bumpBucket(map, name, entry) {
  const k = name || '(未知)';
  const b = map[k] || (map[k] = { requests: 0, ok: 0, failed: 0, tokens: 0, cost: 0 });
  b.requests++;
  if (entry.ok) b.ok++;
  else b.failed++;
  b.tokens += entry.tokens || 0;
  b.cost = round8(b.cost + (entry.cost || 0));
}

/** 按天聚合统计（同一 isolate 内按天串行化，尽量避免并发丢计数） */
async function bumpStats(env, entry, settings) {
  try {
    const date = dateStr(Date.now(), settings && settings.timezone_offset_minutes);
    const key = STATS_PREFIX + date + '.json';
    await withLock(key, async () => {
      const s = (await r2GetJson(env, key, null)) || emptyDaily(date);
      s.requests = (s.requests || 0) + 1;
      if (entry.ok) s.ok = (s.ok || 0) + 1;
      else s.failed = (s.failed || 0) + 1;
      s.tokens = (s.tokens || 0) + (entry.tokens || 0);
      s.cost = round8((s.cost || 0) + (entry.cost || 0));
      if (entry.stream) s.streams = (s.streams || 0) + 1;
      if (entry.stream && entry.finish && entry.finish !== 'complete') {
        s.streams_aborted = (s.streams_aborted || 0) + 1;
      }
      s.latency_sum = (s.latency_sum || 0) + (entry.ms || 0);
      s.latency_n = (s.latency_n || 0) + 1;
      s.models = s.models || {};
      s.channels = s.channels || {};
      s.keys = s.keys || {};
      s.hours = s.hours || {};
      bumpBucket(s.models, entry.model, entry);
      bumpBucket(s.channels, entry.channel, entry);
      bumpBucket(s.keys, entry.key_name, entry);
      const hour = hourStr(Date.now(), settings && settings.timezone_offset_minutes);
      s.hours[hour] = (s.hours[hour] || 0) + 1;
      await r2PutJson(env, key, s);
    });
  } catch {
    // 统计失败不影响主流程
  }
}

/** 累加 Key 的用量与费用（按 keys.json 串行化，避免并发覆盖） */
async function bumpKeyUsage(env, auth, tokens, cost) {
  if (!auth || auth.admin || !auth.record) return;
  try {
    await withLock(KEYS_KEY, async () => {
      const keys = await r2GetJson(env, KEYS_KEY, []);
      const rec = keys.find((k) => k.key === auth.record.key);
      if (rec) {
        rec.used_tokens = (rec.used_tokens || 0) + (tokens || 0);
        rec.requests = (rec.requests || 0) + 1;
        rec.used_cost = round8((rec.used_cost || 0) + (cost || 0));
        rec.last_used_at = nowIso();
        await r2PutJson(env, KEYS_KEY, keys);
        // 顺手把热缓存指向刚写回的最新数组：这样紧接着的鉴权请求看到的
        // 就是含本次用量的数据，配额判断不会因为缓存而滞后。
        // 只替换值、保留原 at，因此不会变相延长 TTL。
        const hit = hotCache.get(KEYS_KEY);
        if (hit) hotCache.set(KEYS_KEY, { at: hit.at, value: keys });
      }
    });
  } catch {
    // 用量统计失败不影响主流程
  }
}

/** 统一落库：日志 + 统计 + 密钥用量（全部走 waitUntil，不阻塞响应） */
function recordRequest(env, ctx, o) {
  const cost = usageCost(o.settings, o.model, o.usage);
  const tokens = (o.usage && o.usage.total_tokens) || o.tokens || 0;
  ctx.waitUntil(
    (async () => {
      await logUsage(env, {
        auth: o.auth,
        request_id: o.request_id,
        model: o.model,
        channel: o.channel,
        ok: o.ok,
        stream: !!o.stream,
        // 流式结束原因：complete / client_abort / upstream_error / timeout
        finish: o.stream ? o.finish || 'complete' : undefined,
        tokens,
        cost,
        ms: o.ms,
        retries: o.retries || 0,
        usage_missing: !!o.stream && !o.usage,
        error: o.error,
      }, o.settings);
      await bumpStats(env, {
        model: o.model,
        channel: o.channel,
        key_name: o.auth && o.auth.name,
        ok: o.ok,
        stream: !!o.stream,
        finish: o.finish,
        tokens,
        cost,
        ms: o.ms,
      }, o.settings);
      if (o.ok) await bumpKeyUsage(env, o.auth, tokens, cost);
    })().catch(() => {})
  );
}

/* ---------------- 代理主流程 ---------------- */

async function handleProxy(env, ctx, request, path, auth, settings) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('请求体必须是合法 JSON', 400, 'invalid_json');
  }
  if (!body.model) return err('缺少 model 参数', 400, 'missing_model');

  // 密钥级模型白名单
  if (!auth.admin && auth.record) {
    const allowed = auth.record.allowed_models;
    if (
      Array.isArray(allowed) &&
      allowed.length &&
      !allowed.includes('*') &&
      !allowed.includes(body.model)
    ) {
      return err(`该密钥不允许调用模型 ${body.model}`, 403, 'model_forbidden');
    }
  }

  const channels = await cachedJson(env, CHANNELS_KEY, [], CHANNELS_TTL_MS);
  const candidates = pickChannels(channels, body.model, path);
  const requestId = reqId();
  const started = Date.now();

  if (candidates.length === 0) {
    recordRequest(env, ctx, {
      auth,
      settings,
      request_id: requestId,
      model: body.model,
      channel: null,
      ok: false,
      ms: 0,
      error: 'no_channel',
    });
    return err(`没有可用渠道支持模型 ${body.model}`, 503, 'no_channel');
  }

  const failures = [];
  const retries = settings.retries | 0;

  for (const ch of candidates) {
    // 同一渠道可配多个 API Key（逗号分隔）：随机起点轮询，单个 Key 失败自动试下一个 Key
    const keys = channelKeys(ch);
    const start = Math.floor(Math.random() * keys.length);
    for (let ki = 0; ki < keys.length; ki++) {
      const keyIdx = (start + ki) % keys.length;
      const apiKey = keys[keyIdx];
      const tag = keys.length > 1 ? ` [Key${keyIdx + 1}/${keys.length}]` : '';

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const timeoutMs = channelTimeoutMs(ch, settings);
          const { res: upstream, translated } = await forwardOnce(
            ch,
            apiKey,
            path,
            body,
            settings
          );
          if (!upstream.ok) {
            const text = await withBodyTimeout(upstream, timeoutMs, (r) => r.text()).catch(
              () => ''
            );
            failures.push(
              `${ch.name}${tag}: HTTP ${upstream.status} ${text.slice(0, 200)}`
            );
            if (attempt < retries && isRetryableStatus(upstream.status)) {
              await sleep(200 * (attempt + 1));
              continue;
            }
            break; // 换下一个 Key
          }

          // 是否真的是 SSE：部分上游会无视 stream:true 直接返回 JSON，
          // 此时不能硬套 text/event-stream，否则客户端按 SSE 解析必然失败。
          const upstreamCT = upstream.headers.get('content-type') || '';
          const isSse = !upstreamCT || /text\/event-stream/i.test(upstreamCT);

          // 流式请求：OpenAI 渠道透传 SSE 并解析 usage，Anthropic 渠道翻译为 OpenAI 格式 SSE 并提取 usage
          if (body.stream && isSse) {
            if (!upstream.body) {
              failures.push(`${ch.name}${tag}: 上游返回 200 但没有流式响应体`);
              break; // 换下一个 Key
            }
            let resolveFinish;
            const finishPromise = new Promise((r) => {
              resolveFinish = r;
            });
            // finish: complete / client_abort / upstream_error / timeout
            // meta: { bytes, first_byte } — 已转发字节数 / 是否收到过上游首块（断流诊断用）
            const onFinish = (usage, finish, meta) =>
              resolveFinish({ usage, finish: finish || 'complete', meta });
            const streamBody = translated
              ? anthropicStreamToOpenAI(
                  upstream.body,
                  body.model,
                  onFinish,
                  settings.stream_idle_timeout_ms,
                  settings.stream_keepalive_ms
                )
              : rewriteOpenAISSE(
                  upstream.body,
                  body.model,
                  onFinish,
                  settings.stream_idle_timeout_ms,
                  settings.stream_keepalive_ms
                );
            ctx.waitUntil(
              finishPromise
                .then(({ usage, finish, meta }) =>
                  recordRequest(env, ctx, {
                    auth,
                    settings,
                    request_id: requestId,
                    model: body.model,
                    channel: ch.name,
                    // 客户端主动取消不算网关失败；上游中断/超时才算
                    ok: finish === 'complete' || finish === 'client_abort',
                    stream: true,
                    finish,
                    // 断流诊断：bytes=已向调用方转发的字节数，first_byte=是否收到过上游首块
                    stream_meta: meta || null,
                    usage,
                    ms: Date.now() - started,
                    retries: attempt,
                    error:
                      finish === 'complete' || finish === 'client_abort'
                        ? undefined
                        : `stream_${finish}`,
                  })
                )
                .catch(() => {})
            );
            return new Response(streamBody, {
              status: upstream.status,
              headers: {
                'Content-Type': upstreamCT || 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no',
                'X-Request-Id': requestId,
                ...CORS,
              },
            });
          }

          // 非流式：Anthropic 响应翻译为 OpenAI 格式（含 usage，可正常计费）
          const data = translated
            ? anthropicToOpenAI(
                await withBodyTimeout(upstream, timeoutMs, (r) => r.json()),
                body.model
              )
            : await withBodyTimeout(upstream, timeoutMs, (r) => r.json());
          // 回显网关模型名：上游可能把 model 改写为真实模型名（如 deepseek-v4-flash-0731），
          // 这里统一还原为调用方请求的名字，避免调用方看到渠道内部名称
          if (data && typeof data === 'object' && !Array.isArray(data) && data.model !== undefined) {
            data.model = body.model;
          }
          recordRequest(env, ctx, {
            auth,
            settings,
            request_id: requestId,
            model: body.model,
            channel: ch.name,
            ok: true,
            usage: data?.usage || null,
            ms: Date.now() - started,
            retries: attempt,
          });
          return json(data, 200, { 'X-Request-Id': requestId });
        } catch (e) {
          const msg = e && e.name === 'AbortError' ? '请求上游超时' : e.message || String(e);
          failures.push(`${ch.name}${tag}: ${msg}`);
          if (attempt < retries) {
            await sleep(200 * (attempt + 1));
            continue;
          }
          break; // 换下一个 Key
        }
      }
    }
  }

  recordRequest(env, ctx, {
    auth,
    settings,
    request_id: requestId,
    model: body.model,
    channel: null,
    ok: false,
    ms: Date.now() - started,
    error: failures.join(' | ').slice(0, 500),
  });
  return err(
    `所有渠道均失败: ${failures.join(' | ').slice(0, 500)}`,
    502,
    'upstream_failed'
  );
}

/* ---------------- 日志查询 / 统计聚合 ---------------- */

function summarizeLog(key, d) {
  return {
    key,
    ts: d.ts,
    request_id: d.request_id || '',
    key_name: d.key_name,
    is_admin: !!d.is_admin,
    model: d.model,
    channel: d.channel,
    ok: d.ok,
    tokens: d.tokens || 0,
    cost: d.cost || 0,
    ms: d.ms || 0,
    stream: !!d.stream,
    // 流式结束原因：complete / client_abort / upstream_error / timeout
    finish: d.finish || '',
    usage_missing: !!d.usage_missing,
    retries: d.retries || 0,
    error: d.error ? String(d.error).slice(0, 300) : '',
  };
}

function matchLog(l, f) {
  if (f.ok === 'ok' && !l.ok) return false;
  if (f.ok === 'fail' && l.ok) return false;
  if (f.stream === '1' && !l.stream) return false;
  if (f.finish === 'abnormal' && (!l.finish || l.finish === 'complete')) return false;
  if (f.model && String(l.model || '').toLowerCase().indexOf(f.model.toLowerCase()) < 0)
    return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [l.key_name, l.model, l.channel, l.error, l.request_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (hay.indexOf(q) < 0) return false;
  }
  return true;
}

/** 列出某天的日志（倒序）。R2 list 天然按倒序时间戳返回，因此游标翻页即「更旧的一页」 */
async function listLogs(env, date, opts) {
  const limit = clampInt(opts.limit, 1, 500, 50);
  const prefix = `${LOG_PREFIX}${date}/`;
  const listed = await env.R2.list({
    prefix,
    limit,
    cursor: opts.cursor || undefined,
  });
  const keys = listed.objects.map((o) => o.key);
  const items = [];
  for (let i = 0; i < keys.length; i += 25) {
    const batch = await Promise.all(
      keys.slice(i, i + 25).map(async (k) => {
        try {
          const o = await env.R2.get(k);
          if (!o) return null;
          return summarizeLog(k, await o.json());
        } catch {
          return null;
        }
      })
    );
    for (const b of batch) if (b) items.push(b);
  }
  const logs = items.filter((l) => matchLog(l, opts));
  return {
    date,
    logs,
    cursor: listed.truncated ? listed.cursor || null : null,
    scanned: keys.length,
  };
}

/** 列出有日志的日期（近 N 天，从新到旧） */
async function listLogDates(env, days) {
  const listed = await env.R2.list({ prefix: LOG_PREFIX, delimiter: '/' });
  const dates = (listed.delimitedPrefixes || [])
    .map((p) => p.slice(LOG_PREFIX.length).replace(/\/$/, ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
  return days ? dates.slice(0, days) : dates;
}

function toSortedList(map, limit) {
  return Object.entries(map || {})
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit || 12);
}

/** 聚合最近 N 天的统计 */
async function loadStats(env, days, settings) {
  const n = clampInt(days, 1, 90, 14);
  const offset = settings && settings.timezone_offset_minutes;
  const dates = [];
  const base = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    dates.push(dateStr(base - i * 86400000, offset));
  }
  const totals = {
    requests: 0,
    ok: 0,
    failed: 0,
    tokens: 0,
    cost: 0,
    streams: 0,
    streams_aborted: 0,
    latency_sum: 0,
    latency_n: 0,
  };
  const models = {};
  const channels = {};
  const keys = {};
  const dayList = [];

  // 并行读取：原实现是 for + await 串行，30 天视图要等 30 次 R2 往返依次完成，
  // 后台首屏因此慢得肉眼可见。改成一次并发拉取后，这段延迟从 O(n) 降到 O(1)。
  const dayStats = await Promise.all(
    dates.map((date) => r2GetJson(env, STATS_PREFIX + date + '.json', null))
  );
  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const s = dayStats[di] || emptyDaily(date);
    dayList.push({
      date,
      requests: s.requests || 0,
      ok: s.ok || 0,
      failed: s.failed || 0,
      tokens: s.tokens || 0,
      cost: s.cost || 0,
      streams: s.streams || 0,
      streams_aborted: s.streams_aborted || 0,
      avg_ms: s.latency_n ? Math.round(s.latency_sum / s.latency_n) : 0,
      hours: s.hours || {},
    });
    totals.requests += s.requests || 0;
    totals.ok += s.ok || 0;
    totals.failed += s.failed || 0;
    totals.tokens += s.tokens || 0;
    totals.cost = round8(totals.cost + (s.cost || 0));
    totals.streams += s.streams || 0;
    totals.streams_aborted += s.streams_aborted || 0;
    totals.latency_sum += s.latency_sum || 0;
    totals.latency_n += s.latency_n || 0;
    mergeBuckets(models, s.models);
    mergeBuckets(channels, s.channels);
    mergeBuckets(keys, s.keys);
  }

  // 上一周期合计（概览环比用）：再往前取同样 n 天，只累加总量类指标。
  // 多 n 次 R2 读对免费版额度无压力，换来仪表盘「较上一周期」的专业可读性。
  let prev_totals = null;
  if (n >= 2) {
    const pt = {
      requests: 0,
      ok: 0,
      failed: 0,
      tokens: 0,
      cost: 0,
      streams: 0,
      streams_aborted: 0,
    };
    // 同样并行读取，避免「为了一个环比数字再多等 n 次串行往返」
    const prevDates = [];
    for (let i = n; i < 2 * n; i++) prevDates.push(dateStr(base - i * 86400000, offset));
    const prevStats = await Promise.all(
      prevDates.map((date) => r2GetJson(env, STATS_PREFIX + date + '.json', null))
    );
    for (const ps of prevStats) {
      const s = ps || {};
      pt.requests += s.requests || 0;
      pt.ok += s.ok || 0;
      pt.failed += s.failed || 0;
      pt.tokens += s.tokens || 0;
      pt.cost = round8(pt.cost + (s.cost || 0));
      pt.streams += s.streams || 0;
      pt.streams_aborted += s.streams_aborted || 0;
    }
    prev_totals = pt;
  }

  return {
    days: dayList,
    prev_totals,
    totals: {
      requests: totals.requests,
      ok: totals.ok,
      failed: totals.failed,
      tokens: totals.tokens,
      cost: totals.cost,
      streams: totals.streams,
      streams_aborted: totals.streams_aborted,
      avg_ms: totals.latency_n ? Math.round(totals.latency_sum / totals.latency_n) : 0,
      success_rate: totals.requests
        ? Math.round((totals.ok / totals.requests) * 1000) / 10
        : 0,
    },
    models: toSortedList(models, 12),
    channels: toSortedList(channels, 12),
    keys: toSortedList(keys, 12),
  };
}

function mergeBuckets(target, src) {
  for (const [name, v] of Object.entries(src || {})) {
    const t = target[name] || (target[name] = { requests: 0, ok: 0, failed: 0, tokens: 0, cost: 0 });
    t.requests += v.requests || 0;
    t.ok += v.ok || 0;
    t.failed += v.failed || 0;
    t.tokens += v.tokens || 0;
    t.cost = round8(t.cost + (v.cost || 0));
  }
}

/** 删除某个前缀下的全部对象（分页遍历 + 批量删除） */
async function deletePrefix(env, prefix) {
  let deleted = 0;
  let cursor;
  do {
    const listed = await env.R2.list({ prefix, limit: 200, cursor });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length) {
      // R2 的 delete 支持直接传数组（单次上限 1000），
      // 比逐个 await 少 199 次往返 —— 清理上万条日志时差别很明显
      try {
        await env.R2.delete(keys);
        deleted += keys.length;
      } catch {
        // 批量删除失败时退回逐个删除，避免一个坏 key 让整批清理失败
        for (const k of keys) {
          try {
            await env.R2.delete(k);
            deleted++;
          } catch {
            // 忽略单个删除失败
          }
        }
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

/* ---------------- 渠道连通性测试 ---------------- */

/** 测试单个渠道的每个 Key，返回逐 Key 结果 */
async function testChannel(env, ch, settings) {
  const keys = channelKeys(ch);
  if (!keys.length) {
    return { ok: false, keys: [], error: '该渠道未配置 API Key' };
  }
  const model = (ch.models || []).find((m) => m !== '*') || 'test';
  const timeoutMs = channelTimeoutMs(ch, settings);
  const results = [];
  for (let i = 0; i < keys.length; i++) {
    const started = Date.now();
    try {
      const { res: upstream, translated } = await forwardOnce(
        ch,
        keys[i],
        '/v1/chat/completions',
        { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 16 },
        settings
      );
      const ms = Date.now() - started;
      if (!upstream.ok) {
        const text = await withBodyTimeout(upstream, timeoutMs, (r) => r.text()).catch(
          () => ''
        );
        results.push({
          index: i + 1,
          ok: false,
          ms,
          http_status: upstream.status,
          error: text.slice(0, 300) || `HTTP ${upstream.status}`,
        });
        continue;
      }
      const data = await withBodyTimeout(upstream, timeoutMs, (r) => r.json()).catch(
        () => null
      );
      let snippet = '';
      if (translated && data) {
        snippet = (data.content || [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .slice(0, 200);
      } else if (data && data.choices && data.choices[0]) {
        snippet = String(data.choices[0].message?.content || '').slice(0, 200);
      }
      results.push({ index: i + 1, ok: true, ms, http_status: upstream.status, snippet });
    } catch (e) {
      results.push({
        index: i + 1,
        ok: false,
        ms: Date.now() - started,
        error: String((e && e.message) || e).slice(0, 300),
      });
    }
  }
  return { ok: results.some((r) => r.ok), keys: results };
}

/** 记录渠道健康状态到渠道配置（best-effort，与后台编辑共用同一把锁避免互相覆盖） */
async function saveChannelHealth(env, channelId, health) {
  try {
    await withLock(CHANNELS_KEY, async () => {
      const channels = await r2GetJson(env, CHANNELS_KEY, []);
      const idx = channels.findIndex((c) => c.id === channelId);
      if (idx < 0) return;
      channels[idx].health = { ...health, checked_at: nowIso() };
      await r2PutJson(env, CHANNELS_KEY, channels);
      invalidateCache(CHANNELS_KEY);
    });
  } catch {
    // 忽略
  }
}

/* ---------------- 管理 API ---------------- */

async function handleAdmin(env, ctx, request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const gate = requireAdmin(env, request);
  if (!gate.ok) return gate.res;

  /* ---- 鉴权探针 ----
   * 不读 R2、不依赖任何数据，用于控制台单独判断「这个 Admin Key 是否有效」。
   * 这样「数据接口临时故障」就不会被误判成「登录失效」。 */
  if (path === '/api/admin/ping') {
    return json({ ok: true, time: nowIso() });
  }

  const settings = await loadSettings(env);

  /* ---- 设置 ---- */
  if (path === '/api/admin/settings' && request.method === 'GET') {
    return json(settings);
  }
  if (path === '/api/admin/settings' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return err('请求体应为 JSON 对象', 400, 'invalid_body');
    const next = normalizeSettings({ ...settings, ...body });
    await r2PutJson(env, SETTINGS_KEY, next);
    invalidateSettingsCache(); // 立即生效，不等 TTL 过期
    return json({ ok: true, settings: next });
  }

  /* ---- 渠道 ---- */
  if (path === '/api/admin/channels' && request.method === 'GET') {
    return json(await r2GetJson(env, CHANNELS_KEY, []));
  }
  if (path === '/api/admin/channels' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.channels)) {
      return err('请求体应为 {channels: [...]}', 400, 'invalid_body');
    }
    // 与健康巡检共用一把锁，避免刚保存的配置被并发的巡检写回覆盖
    await withLock(CHANNELS_KEY, () => r2PutJson(env, CHANNELS_KEY, body.channels));
    invalidateCache(CHANNELS_KEY); // 热路径缓存立即失效，改动即时生效
    return json({ ok: true });
  }

  /* ---- 密钥 ---- */
  if (path === '/api/admin/keys' && request.method === 'GET') {
    return json(await r2GetJson(env, KEYS_KEY, []));
  }
  if (path === '/api/admin/keys' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.keys)) {
      return err('请求体应为 {keys: [...]}', 400, 'invalid_body');
    }
    // 与用量累加共用一把锁，避免编辑被并发请求的用量写回覆盖
    await withLock(KEYS_KEY, () => r2PutJson(env, KEYS_KEY, body.keys));
    invalidateCache(KEYS_KEY); // 禁用 / 改配额后立即生效，不等待 TTL
    return json({ ok: true });
  }

  /* ---- 统计 ---- */
  if (path === '/api/admin/stats' && request.method === 'GET') {
    const days = url.searchParams.get('days') || 14;
    return json(await loadStats(env, days, settings));
  }

  /* ---- 日志 ---- */
  if (path === '/api/admin/logs/dates' && request.method === 'GET') {
    return json({
      dates: await listLogDates(env, 60),
      today: dateStr(Date.now(), settings.timezone_offset_minutes),
    });
  }
  if (path === '/api/admin/logs/summary' && request.method === 'GET') {
    const date =
      url.searchParams.get('date') || dateStr(Date.now(), settings.timezone_offset_minutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('日期格式应为 YYYY-MM-DD', 400, 'bad_date');
    const out = await listLogs(env, date, {
      limit: url.searchParams.get('limit') || 50,
      cursor: url.searchParams.get('cursor') || undefined,
      ok: url.searchParams.get('ok') || '',
      stream: url.searchParams.get('stream') || '',
      finish: url.searchParams.get('finish') || '',
      model: url.searchParams.get('model') || '',
      q: url.searchParams.get('q') || '',
    });
    return json(out);
  }
  if (path === '/api/admin/log' && request.method === 'GET') {
    const key = url.searchParams.get('key') || '';
    if (!key.startsWith(LOG_PREFIX)) return err('非法 key', 400, 'bad_key');
    const obj = await env.R2.get(key);
    if (!obj) return err('日志不存在', 404, 'not_found');
    return json(await obj.json());
  }
  if (path === '/api/admin/logs/cleanup' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const keep = clampInt(
      body && body.days != null ? body.days : settings.log_retention_days,
      1,
      3650,
      settings.log_retention_days
    );
    const cutoff = dateStr(Date.now() - keep * 86400000, settings.timezone_offset_minutes);
    const dates = await listLogDates(env, 0);
    const victims = dates.filter((d) => d < cutoff);
    let removed = 0;
    for (const d of victims) {
      removed += await deletePrefix(env, `${LOG_PREFIX}${d}/`);
      await env.R2.delete(STATS_PREFIX + d + '.json').catch(() => {});
    }
    return json({ ok: true, keep_days: keep, cutoff, removed_dates: victims.length, removed_logs: removed });
  }
  // 清空日志：scope=day 清空指定日期（默认今天），scope=all 清空全部日志与统计
  if (path === '/api/admin/logs/clear' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const scope = body && body.scope === 'all' ? 'all' : 'day';
    if (scope === 'all') {
      const removedLogs = await deletePrefix(env, LOG_PREFIX);
      const removedStats = await deletePrefix(env, STATS_PREFIX);
      return json({ ok: true, scope: 'all', removed_logs: removedLogs, removed_stats: removedStats });
    }
    const date =
      (body && body.date) || dateStr(Date.now(), settings.timezone_offset_minutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return err('日期格式应为 YYYY-MM-DD', 400, 'bad_date');
    }
    const removed = await deletePrefix(env, `${LOG_PREFIX}${date}/`);
    await env.R2.delete(STATS_PREFIX + date + '.json').catch(() => {});
    return json({ ok: true, scope: 'day', date, removed_logs: removed });
  }

  /* ---- 测试 ---- */
  if (path === '/api/admin/test-channel' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const channels = await r2GetJson(env, CHANNELS_KEY, []);
    const ch = channels.find((c) => c.id === (body && body.id));
    if (!ch) return err('渠道不存在', 404, 'not_found');
    const r = await testChannel(env, ch, settings);
    if (!r.error) {
      const firstOk = (r.keys || []).find((k) => k.ok);
      ctx.waitUntil(
        saveChannelHealth(env, ch.id, {
          ok: !!r.ok,
          ms: firstOk ? firstOk.ms : ((r.keys || [])[0] || {}).ms || 0,
          message: r.ok ? '' : String(((r.keys || [])[0] || {}).error || '测试失败').slice(0, 200),
        })
      );
    }
    return json(r);
  }
  if (path === '/api/admin/test-all' && request.method === 'POST') {
    const channels = await r2GetJson(env, CHANNELS_KEY, []);
    const results = [];
    for (const ch of channels) {
      if (!ch.enabled) {
        results.push({ id: ch.id, name: ch.name, skipped: true, ok: false });
        continue;
      }
      const r = await testChannel(env, ch, settings);
      const firstOk = (r.keys || []).find((k) => k.ok);
      const health = {
        ok: !!r.ok,
        ms: firstOk ? firstOk.ms : ((r.keys || [])[0] || {}).ms || 0,
        message: r.ok ? '' : String(((r.keys || [])[0] || {}).error || r.error || '测试失败').slice(0, 200),
      };
      results.push({ id: ch.id, name: ch.name, ok: !!r.ok, keys: r.keys, error: r.error });
      await saveChannelHealth(env, ch.id, health);
    }
    return json({ ok: results.some((r) => r.ok), results });
  }
  if (path === '/api/admin/test-route' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const model = body && body.model;
    if (!model) return err('请提供 model', 400, 'missing_model');
    const channels = await r2GetJson(env, CHANNELS_KEY, []);
    const candidates = pickChannels(channels, model, '/v1/chat/completions');
    if (!candidates.length) return json({ ok: false, model, candidates: [], error: '没有可用渠道支持该模型' });
    const attempts = [];
    const started = Date.now();
    let answer = null;
    for (const ch of candidates) {
      const keys = channelKeys(ch);
      const apiKey = keys[0];
      try {
        const { res, translated } = await forwardOnce(
          ch,
          apiKey,
          '/v1/chat/completions',
          { model, messages: [{ role: 'user', content: body.prompt || 'ping' }], max_tokens: 32 },
          settings
        );
        if (!res.ok) {
          const text = await withBodyTimeout(res, channelTimeoutMs(ch, settings), (r) =>
            r.text()
          ).catch(() => '');
          attempts.push({ channel: ch.name, ok: false, http_status: res.status, error: text.slice(0, 200) });
          continue;
        }
        const data = translated
          ? anthropicToOpenAI(
              await withBodyTimeout(res, channelTimeoutMs(ch, settings), (r) => r.json()),
              model
            )
          : await withBodyTimeout(res, channelTimeoutMs(ch, settings), (r) => r.json());
        answer = data && data.choices && data.choices[0] ? String(data.choices[0].message?.content || '') : '';
        attempts.push({ channel: ch.name, ok: true, http_status: res.status });
        break;
      } catch (e) {
        attempts.push({ channel: ch.name, ok: false, error: String((e && e.message) || e).slice(0, 200) });
      }
    }
    return json({
      ok: !!answer,
      model,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, priority: c.priority ?? 100, weight: c.weight || 1 })),
      attempts,
      answer,
      ms: Date.now() - started,
    });
  }

  return err('未知管理接口', 404, 'not_found');
}

/* ---------------- 入口 ---------------- */

export default {
  async fetch(request, env, ctx) {
    if (!env.R2) {
      return err(
        'R2 绑定缺失：请确认 wrangler.toml 中的 [[r2_buckets]] 已配置且 bucket 已创建（构建脚本会自动创建）',
        500,
        'r2_missing'
      );
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 懒初始化 R2 数据结构（幂等）
    await ensureSeed(env);

    if (path === '/' && request.method === 'GET') {
      return json({
        name: 'oneapi-gateway',
        version: VERSION,
        r2: 'bound',
        admin: '/admin',
        endpoints: ['/v1/models', '/v1/chat/completions', '/v1/completions', '/v1/embeddings'],
      });
    }

    if ((path === '/healthz' || path === '/health') && request.method === 'GET') {
      return json({ status: 'ok', version: VERSION, time: nowIso() });
    }

    if (path === '/admin' && request.method === 'GET') {
      return new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    if (path.startsWith('/api/admin/')) {
      return handleAdmin(env, ctx, request);
    }

    const settings = await loadSettings(env);

    if (path === '/v1/models' && request.method === 'GET') {
      const auth = await authApiKey(env, request, settings);
      if (!auth.ok) return auth.res;
      const channels = await cachedJson(env, CHANNELS_KEY, [], CHANNELS_TTL_MS);
      let models = [
        ...new Set(
          channels
            .filter((c) => c.enabled)
            .flatMap((c) => c.models || [])
            .filter((m) => m !== '*')
        ),
      ];
      models = [...new Set([...models, ...(settings.custom_models || [])])];
      if (!auth.admin && auth.record && Array.isArray(auth.record.allowed_models) &&
          auth.record.allowed_models.length && !auth.record.allowed_models.includes('*')) {
        const allow = auth.record.allowed_models;
        models = models.filter((m) => allow.includes(m));
      }
      return json({
        object: 'list',
        data: models.sort().map((id) => ({
          id,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'gateway',
        })),
      });
    }

    if (
      request.method === 'POST' &&
      ['/v1/chat/completions', '/v1/completions', '/v1/embeddings'].includes(path)
    ) {
      const auth = await authApiKey(env, request, settings);
      if (!auth.ok) return auth.res;
      return handleProxy(env, ctx, request, path, auth, settings);
    }

    return err('Not Found', 404, 'not_found');
  },
};

// 导出纯函数，便于单测（wrangler 只使用 default 导出）
export {
  openaiToAnthropic,
  anthropicToOpenAI,
  anthropicStreamToOpenAI,
  rewriteSseBlock,
  rewriteOpenAISSE,
  guardSSEStream,
  withBodyTimeout,
  channelTimeoutMs,
  usageCost,
  normalizeSettings,
  pickChannels,
  channelKeys,
};
