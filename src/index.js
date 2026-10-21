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

const VERSION = '2.3.0';
const CHANNELS_KEY = 'data/channels.json';
const KEYS_KEY = 'data/keys.json';
const SETTINGS_KEY = 'data/settings.json';
const ACCOUNTS_KEY = 'data/accounts.json';
const SESSIONS_KEY = 'data/sessions.json';
const PLANS_KEY = 'data/plans.json';
const PLAN_REQUESTS_KEY = 'data/plan-requests.json';
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

/** 读取 JSON 请求体：解析失败或不是对象都返回 null，由调用方给 400 */
async function readJsonBody(request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

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

/* ----------------- 渠道 API Key（支持多 Key） ----------------- */

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

/* ----------------- R2 数据层 ----------------- */

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
const hotPending = new Map(); // r2 key -> in-flight Promise：并发 miss 时同 key 只发一次 R2 读（single-flight）

async function cachedJson(env, key, fallback, ttlMs) {
  const now = Date.now();
  const hit = hotCache.get(key);
  if (hit && now - hit.at < (ttlMs || 2000)) return hit.value;
  // single-flight：冷启动瞬间多个并发请求同时 miss 时，只有第一个真正读 R2，
  // 其余共享同一个 Promise —— 避免缓存击穿把 1 次读放大成 N 次。
  const pending = hotPending.get(key);
  if (pending) return pending;
  const p = (async () => {
    const value = await r2GetJson(env, key, fallback);
    hotCache.set(key, { at: Date.now(), value });
    return value;
  })();
  hotPending.set(key, p);
  p.finally(() => hotPending.delete(key)).catch(() => {});
  return p;
}

function invalidateCache(...keys) {
  for (const k of keys) hotCache.delete(k);
}

/** 渠道配置的缓存窗口（路由用；变更极少，可以放宽一点） */
const CHANNELS_TTL_MS = 1000;
/** 密钥的缓存窗口（鉴权 + 配额，安全相关，取更短的窗口） */
const KEYS_TTL_MS = 1000;

/* ---------------- 设置 ---------------- */

function defaultSettings() {
  return {
    /** 是否允许用 ADMIN_KEY 直接作为网关密钥调用 /v1/*（便于自测） */
    allow_admin_key_as_api_key: true,
    /** 上游请求超时（毫秒，作用于等待上游响应头阶段）：很多上游在出首个
     * token 前不发响应头，排队/预填充都算在这段里，60s 很容易误杀慢启动，
     * 因此默认放宽到 180s，与流式静默超时对齐（渠道可单独覆盖）。 */
    request_timeout_ms: 180000,
    /** 瞬时错误（429/5xx/网络异常）在同一 Key 上的额外重试次数 */
    retries: 1,
    /**
     * 流式响应的「静默超时」（毫秒）：上游超过该时长一个字节都没下发，
     * 即判定为断流，网关主动断开上游并给客户端一个可解析的收尾。
     * 注意 request_timeout_ms 只作用于「首字节」，无法覆盖流中途卡死的情况，
     * 因此流式必须单独有这个读超时。
     */
    stream_idle_timeout_ms: 180000,
    /**
     * 流式响应的「首字节超时」（毫秒）：收到上游第一个字节之前用这个时长判定
     * 静默，之后回落到 stream_idle_timeout_ms。长 prompt（几十 KB 上下文）在
     * 慢渠道 / 大模型上，出首 token 前的排队 + 推理远比流中途的停顿更久，
     * 用同一个较短的静默超时会把「上游正在算」误判成断流，因此默认给到
     * 300s，比流中途的静默超时更宽。0 = 与 stream_idle_timeout_ms
     * 相同（旧行为）。
     */
    stream_first_byte_ms: 300000,
    /**
     * 流式响应的「下游保活间隔」（毫秒）：网关超过该时长没有向调用方下发任何字节时，
     * 主动补一条 SSE 注释（`: ka\n\n`）。标准 SSE 客户端会忽略注释行，
     * 但链路上的 nginx / CDN / 客户端读超时因此不会遇到「零字节窗口」，
     * 模型长思考、上游排队时不再被中途掐断。
     * 与 stream_idle_timeout_ms 互补：后者管「上游→网关」，本项管「网关→调用方」。
     * 0 = 关闭。
     */
    stream_keepalive_ms: 15000,
    /**
     * 渠道熔断：同一渠道「连续」上游失败达到该次数后临时熔断（选渠道时跳过），
     * 冷却期结束自动放行（半开），再失败则重新熔断；任一次成功即清零计数。
     * 只统计渠道侧的失败（5xx / 408 / 429 / 网络异常 / 流中断 / 网关流超时），
     * 4xx 参数与鉴权错误以及客户端主动取消不计。0 = 关闭熔断。
     */
    breaker_error_threshold: 3,
    /** 熔断冷却时长（毫秒）：打开后经过该时长自动放行试探 */
    breaker_cooldown_ms: 300000,
    /**
     * 长任务分流阈值：请求体里的 max_tokens >= 该值时视为「长输出任务」，
     * 挑选渠道时把未勾选「长输出稳定」的渠道排到最后（仍可用，只是靠后）。
     * 0 = 关闭分流。对长流经常在尾部被上游切断的渠道，把它的长任务让给更稳的渠道。
     */
    long_task_min_tokens: 0,
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
    /**
     * 密钥默认 RPM（每分钟请求数）软上限：0 = 不限。
     * 未单独设置 rpm 的密钥沿用此值；密钥自己的 rpm 优先（0 = 该 Key 不限）。
     * 注意：Workers 无共享内存，这是 isolate 级软限制（多实例时实际上限 ≈ 配置值 × 实例数），
     * 用于防单 Key 打爆上游，不是计费级强配额。
     */
    rpm_default: 0,
    /**
     * 渠道巡检失败 → Telegram 通知：填 bot token 与 chat_id 后生效。
     * tg_notify_down：渠道由正常转异常时告警；tg_notify_up：恢复时报告（默认关，避免吵）。
     * 通知只在巡检（控制台「全部测试」/单渠道测试）发现状态翻转时发送，频率天然受控。
     */
    tg_bot_token: '',
    tg_chat_id: '',
    tg_notify_down: true,
    tg_notify_up: false,
    /**
     * R2 每日自动备份：每天首个请求把 channels/keys/settings 快照到 backup/<日期>.json，
     * 保留最近 backup_keep_days 份（超期自动清理）。0 = 关闭自动备份。
     */
    backup_keep_days: 7,
    /**
     * 定时巡检间隔（分钟）：Cron 每 10 分钟唤起一次，巡检按这个间隔节流。
     * 巡检会对每个启用渠道的每个 Key 各发一次真实小请求（耗少量上游额度），
     * 状态翻转时按 tg_notify_down / tg_notify_up 发 Telegram 通知。
     * 0 = 关闭定时巡检（每日日志清理与备份兜底不受影响）。
     */
    patrol_interval_min: 30,
    /**
     * 是否允许自助注册普通账号。默认关闭：网关一旦暴露在公网，
     * 开放注册就等于开放资源，由管理员在「网关设置 → 账号与安全」里按需打开。
     */
    allow_registration: false,
    /** 是否允许通过「安全问题」自助找回密码（账号未设置问题时不可用） */
    allow_password_recovery: true,
    /**
     * 自助注册的新账号默认可用的 Token 配额（跨该账号所有密钥累计）。
     * 0 = 不限；管理员可对单个账号单独调整。
     */
    default_user_quota_tokens: 0,
  };
}

function normalizeSettings(raw) {
  const d = defaultSettings();
  const s = { ...d, ...(raw || {}) };
  s.allow_admin_key_as_api_key = s.allow_admin_key_as_api_key !== false;
  s.request_timeout_ms = clampInt(s.request_timeout_ms, 1000, 600000, d.request_timeout_ms);
  s.retries = clampInt(s.retries, 0, 5, d.retries);
  s.breaker_error_threshold = clampInt(
    s.breaker_error_threshold,
    0,
    20,
    d.breaker_error_threshold
  );
  s.breaker_cooldown_ms = clampInt(
    s.breaker_cooldown_ms,
    10000,
    1800000,
    d.breaker_cooldown_ms
  );
  s.long_task_min_tokens = clampInt(
    s.long_task_min_tokens,
    0,
    200000,
    d.long_task_min_tokens
  );
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
  s.stream_first_byte_ms = clampInt(
    s.stream_first_byte_ms,
    0,
    600000,
    d.stream_first_byte_ms
  );
  s.log_retention_days = clampInt(s.log_retention_days, 1, 3650, d.log_retention_days);
  s.patrol_interval_min = clampInt(s.patrol_interval_min, 0, 1440, d.patrol_interval_min);
  s.timezone_offset_minutes = clampInt(
    s.timezone_offset_minutes,
    -720,
    840,
    d.timezone_offset_minutes
  );
  s.custom_models = Array.isArray(s.custom_models)
    ? s.custom_models.map((m) => String(m).trim()).filter(Boolean)
    : [];
  // RPM 软上限与备份保留份数
  s.rpm_default = clampInt(s.rpm_default, 0, 100000, 0);
  s.backup_keep_days = clampInt(s.backup_keep_days, 0, 365, 7);
  // Telegram 通知配置
  s.tg_bot_token = String(s.tg_bot_token || '').trim();
  s.tg_chat_id = String(s.tg_chat_id || '').trim();
  s.tg_notify_down = s.tg_notify_down !== false;
  s.tg_notify_up = s.tg_notify_up === true;
  // 账号与安全
  s.allow_registration = s.allow_registration === true;
  s.allow_password_recovery = s.allow_password_recovery !== false;
  s.default_user_quota_tokens = clampInt(
    s.default_user_quota_tokens,
    0,
    1e12,
    0
  );
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
    const [ch, ks, st, ac, se, pl, pr] = await Promise.all([
      env.R2.get(CHANNELS_KEY),
      env.R2.get(KEYS_KEY),
      env.R2.get(SETTINGS_KEY),
      env.R2.get(ACCOUNTS_KEY),
      env.R2.get(SESSIONS_KEY),
      env.R2.get(PLANS_KEY),
      env.R2.get(PLAN_REQUESTS_KEY),
    ]);
    const writes = [];
    if (!ch) writes.push(r2PutJson(env, CHANNELS_KEY, defaultChannels()));
    if (!ks) writes.push(r2PutJson(env, KEYS_KEY, []));
    if (!st) writes.push(r2PutJson(env, SETTINGS_KEY, defaultSettings()));
    if (!ac) writes.push(r2PutJson(env, ACCOUNTS_KEY, []));
    if (!se) writes.push(r2PutJson(env, SESSIONS_KEY, []));
    if (!pl) writes.push(r2PutJson(env, PLANS_KEY, []));
    if (!pr) writes.push(r2PutJson(env, PLAN_REQUESTS_KEY, []));
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
  if (env.ADMIN_KEY && (await safeEqual(token, env.ADMIN_KEY))) {
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
  // 匹配按 SHA-256 哈希进行（存储不落明文）；老数据（仍有 key 明文字段）兼容明文匹配，
  // 命中后由控制台 GET 密钥页时惰性迁移，双格式并存期间不影响鉴权。
  const keys = await cachedJson(env, KEYS_KEY, [], KEYS_TTL_MS);
  const tokenHash = await sha256Hex(token);
  const rec = keys.find(
    (k) => (k.key_hash ? k.key_hash === tokenHash : typeof k.key === 'string' && k.key === token)
  );
  if (!rec) {
    return { ok: false, res: err('无效的 API Key', 401, 'invalid_key') };
  }
  if (rec.enabled === false) {
    return { ok: false, res: err('该 API Key 已被禁用', 401, 'key_disabled') };
  }
  // 普通用户自助创建的密钥：账号被禁用 / 套餐到期 / 账号级配额用尽时一并失效。
  // 账号数据走 5s 短缓存；控制台改账号会主动失效，生效延迟最多 5 秒。
  let owner = null;
  if (rec.owner_id) {
    const accounts = await cachedJson(env, ACCOUNTS_KEY, [], ACCOUNTS_TTL_MS);
    owner = (accounts || []).find((a) => a.id === rec.owner_id);
    if (!owner || owner.enabled === false) {
      return { ok: false, res: err('该密钥所属账号已被禁用', 403, 'owner_disabled') };
    }
    if (owner.plan_expires_at && Date.now() > Date.parse(owner.plan_expires_at)) {
      return {
        ok: false,
        res: err('该账号的套餐已到期，请联系管理员续费或更换套餐', 403, 'plan_expired'),
      };
    }
    const accountQuota = Number(owner.quota_tokens) || 0;
    if (accountQuota > 0) {
      const used = keys
        .filter((k) => k.owner_id === rec.owner_id)
        .reduce((sum, k) => sum + (Number(k.used_tokens) || 0), 0);
      if (used >= accountQuota) {
        return {
          ok: false,
          res: err('该账号的 Token 配额已用完', 429, 'account_quota_exceeded'),
        };
      }
    }
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
  return { ok: true, admin: false, name: rec.name || 'key', record: rec, owner };
}

/**
 * 当前调用方可用的模型白名单：密钥白名单 ∩ 套餐白名单。
 * 返回 null 表示不限；返回数组表示只允许数组内的模型。
 */
function authAllowedModels(auth) {
  if (!auth || auth.admin || !auth.record) return null;
  const keyAllow = Array.isArray(auth.record.allowed_models) ? auth.record.allowed_models : [];
  const planAllow =
    auth.owner && Array.isArray(auth.owner.plan_allowed_models)
      ? auth.owner.plan_allowed_models
      : [];
  const keyLimited = keyAllow.length > 0 && !keyAllow.includes('*');
  const planLimited = planAllow.length > 0 && !planAllow.includes('*');
  if (!keyLimited && !planLimited) return null;
  if (keyLimited && planLimited) return keyAllow.filter((m) => planAllow.includes(m));
  return keyLimited ? keyAllow : planAllow;
}

/** 管理后台鉴权（/api/admin/*） */
/** 恒定时间字符串比较：先把两侧都 SHA-256 归一到 32 字节定长，再逐字节异或。
 *  直接 === 的耗时随匹配前缀长度变化，管理接口公网可达，值得防时序侧信道。 */
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const ua = new Uint8Array(x);
  const ub = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

/** SHA-256 → 小写 hex。网关密钥只存哈希不存明文：R2 桶泄露时密钥不跟着裸奔。 */
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.prototype.map
    .call(new Uint8Array(buf), (b) => ('0' + b.toString(16)).slice(-2))
    .join('');
}

/** 把含明文 key 的条目归一化为 { key_hash, key_prefix }（幂等，原数组就地修改）。
 *  触发点：控制台保存密钥（整包提交）、打开控制台密钥页（GET 惰性迁移老数据）。 */
async function hashKeyRecords(list) {
  for (const k of list || []) {
    if (k && typeof k.key === 'string' && k.key) {
      k.key_hash = await sha256Hex(k.key);
      k.key_prefix = String(k.key).slice(0, 12);
      delete k.key;
    }
  }
  return list || [];
}

/* ---------------- 账号 / 会话 ----------------
 *
 * 账号存放在 data/accounts.json，会话存放在 data/sessions.json（只存 token 的
 * SHA-256，R2 泄露时不能直接拿来登录）。密码与安全问题答案都用 PBKDF2-SHA256
 * + 随机盐存储，从不落明文。
 *
 * 角色：
 *  - admin：完整控制台（渠道 / 全部密钥 / 日志 / 设置 / 账号管理）
 *  - user ：只能登录「我的密钥」，创建和管理自己名下的网关密钥
 *
 * 首次部署（accounts 为空）时由 /api/auth/setup 创建第一个管理员；
 * 环境变量 ADMIN_KEY 仍作为应急凭据：带上 X-Admin-Key 即可绕过账号体系访问
 * 管理接口，用于忘记密码 / 账号被锁时的自救。
 */

const SESSION_TTL_MS = 7 * 86400000;
/**
 * PBKDF2 迭代次数。Workers 免费版单请求 CPU 上限 10ms，10 万次迭代会直接越线
 * 被 1102 强杀；1 万次在本机约 6ms，配合 8 位以上密码与登录限流足够。
 * 记录里保存 iterations，未来调整不影响老账号校验。
 */
const PBKDF2_ITERATIONS = 10000;
const MAX_ACCOUNTS = 500;
const MAX_KEYS_PER_USER = 20;
const MAX_PLANS = 100;
const MAX_PLAN_REQUESTS_KEPT = 500;
const ACCOUNTS_TTL_MS = 5000;

/** 账号不存在时也跑一次哈希，避免用响应耗时枚举用户名 */
const DUMMY_SECRET = {
  algo: 'pbkdf2-sha256',
  iterations: PBKDF2_ITERATIONS,
  salt: '00000000000000000000000000000000',
  hash: '0000000000000000000000000000000000000000000000000000000000000000',
};

function randomHex(nBytes) {
  const a = new Uint8Array(nBytes);
  crypto.getRandomValues(a);
  return Array.prototype.map
    .call(a, (b) => ('0' + b.toString(16)).slice(-2))
    .join('');
}

function hexToBytes(hex) {
  const s = String(hex || '');
  const out = new Uint8Array(Math.floor(s.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

/** 定长字节比较：哈希比对不应因前缀匹配长度不同而提前返回 */
function bytesEqual(a, b) {
  const x = a instanceof Uint8Array ? a : hexToBytes(a);
  const y = b instanceof Uint8Array ? b : hexToBytes(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations: iterations | 0 || PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );
  return Array.prototype.map
    .call(new Uint8Array(bits), (b) => ('0' + b.toString(16)).slice(-2))
    .join('');
}

async function makeSecret(value) {
  const salt = randomHex(16);
  return {
    algo: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    salt,
    hash: await pbkdf2Hex(value, salt, PBKDF2_ITERATIONS),
  };
}

async function verifySecret(value, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const hash = await pbkdf2Hex(value, rec.salt, rec.iterations);
  return bytesEqual(hash, rec.hash);
}

/** 安全问题答案归一化：去首尾空白、统一小写、忽略所有空白，减少「看起来一样却不对」 */
const normalizeAnswer = (s) =>
  String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

/**
 * 用户名支持两种形式：
 * 1) 普通用户名：2~24 位中英文、数字、下划线、短横线；
 * 2) 邮箱地址：总长 ≤254，@ 前 ≤64，域名需含点号且以 2 位以上字母结尾。
 * 返回空串表示合法，否则返回可直接展示给用户的具体原因。
 */
function usernameError(raw) {
  const u = String(raw == null ? '' : raw).trim();
  if (!u) return '请填写用户名或邮箱';
  if (u.includes('@')) {
    if (u.length > 254) return '邮箱地址最长 254 个字符';
    if (/\s/.test(u)) return '邮箱地址不能包含空格';
    const at = u.lastIndexOf('@');
    const local = u.slice(0, at);
    const domain = u.slice(at + 1);
    if (!local) return '邮箱缺少 @ 前的账号部分，例如 name@example.com';
    if (local.length > 64) return '邮箱 @ 前的部分最多 64 个字符';
    if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return '邮箱 @ 前只能使用字母、数字和 . _ % + -';
    if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      return '邮箱 @ 前的点号不能位于开头、结尾或连续出现';
    }
    if (!domain) return '邮箱缺少 @ 后的域名，例如 name@example.com';
    if (domain.length > 253) return '邮箱域名最长 253 个字符';
    if (!/^[A-Za-z0-9.-]+$/.test(domain)) return '邮箱域名只能包含字母、数字、点号和短横线';
    const labels = domain.split('.');
    if (labels.length < 2 || labels.some((x) => !x)) {
      return '邮箱域名格式不正确，例如 example.com';
    }
    if (labels.some((x) => x.length > 63)) return '邮箱域名单段最长 63 个字符';
    if (labels.some((x) => x.startsWith('-') || x.endsWith('-'))) {
      return '邮箱域名中的短横线不能位于开头或结尾';
    }
    if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1])) {
      return '邮箱域名结尾需为 2 位以上字母，例如 .com';
    }
    return '';
  }
  if (u.length < 2) return '用户名至少 2 个字符；也可填写邮箱地址';
  if (u.length > 24) return '用户名最多 24 个字符；如需更长请使用邮箱';
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5-]+$/.test(u)) {
    return '用户名只能包含中英文、数字、下划线或短横线；如需使用 @ 或点号请填写完整邮箱';
  }
  return '';
}

const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128;
const validQuestion = (q) => typeof q === 'string' && q.trim().length >= 2 && q.trim().length <= 100;
const validAnswer = (a) => {
  const n = normalizeAnswer(a);
  return n.length >= 1 && n.length <= 100;
};

function planStatusOf(a) {
  if (!a || !a.plan_id) return 'none';
  if (a.plan_expires_at && Date.parse(a.plan_expires_at) <= Date.now()) return 'expired';
  return 'active';
}

function publicAccount(a) {
  const planStatus = planStatusOf(a);
  const expires = a.plan_expires_at || '';
  return {
    id: a.id,
    username: a.username,
    role: a.role === 'admin' ? 'admin' : 'user',
    enabled: a.enabled !== false,
    created_at: a.created_at || '',
    last_login_at: a.last_login_at || '',
    has_recovery: !!(a.security && a.security.hash),
    quota_tokens: a.quota_tokens || 0,
    plan_id: a.plan_id || '',
    plan_name: a.plan_name || '',
    plan_price: a.plan_price || 0,
    plan_rpm: a.plan_rpm || 0,
    plan_allowed_models: Array.isArray(a.plan_allowed_models) ? a.plan_allowed_models : [],
    plan_started_at: a.plan_started_at || '',
    plan_expires_at: expires,
    plan_status: planStatus,
    plan_days_left:
      planStatus === 'active' && expires
        ? Math.max(0, Math.ceil((Date.parse(expires) - Date.now()) / 86400000))
        : 0,
  };
}

/* ---- 套餐 ---- */

function normalizePlanModels(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    const name = String(m == null ? '' : m).trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 200);
}

function buildPlan(input, base) {
  const now = nowIso();
  return {
    id: (base && base.id) || 'plan_' + Date.now().toString(36) + rand(4),
    name: String((input && input.name) || '').trim().slice(0, 40),
    description: String((input && input.description) || '').trim().slice(0, 300),
    price: clampNum(input && input.price, 0, 1e9, 0),
    quota_tokens: clampInt(input && input.quota_tokens, 0, 1e12, 0),
    duration_days: clampInt(input && input.duration_days, 0, 3650, 30),
    rpm: clampInt(input && input.rpm, 0, 100000, 0),
    allowed_models: normalizePlanModels(input && input.allowed_models),
    enabled: !(input && input.enabled === false),
    created_at: (base && base.created_at) || now,
    updated_at: now,
  };
}

/** 套餐条款快照：申请、审批、账号字段都只认这份快照，之后改套餐不影响已生效的周期 */
function planTerms(plan) {
  return {
    plan_id: plan.id,
    plan_name: plan.name,
    plan_price: Number(plan.price) || 0,
    plan_rpm: Number(plan.rpm) || 0,
    plan_allowed_models: normalizePlanModels(plan.allowed_models),
    plan_duration_days: Number(plan.duration_days) || 0,
  };
}

function requestAsPlan(r) {
  return {
    id: r.plan_id,
    name: r.plan_name,
    price: r.price,
    quota_tokens: r.quota_tokens,
    duration_days: r.duration_days,
    rpm: r.rpm,
    allowed_models: r.allowed_models || [],
  };
}

/**
 * 把套餐条款写到账号上。
 * 同套餐续费时有效期从当前到期时间顺延（不吞掉剩余天数）；换套餐则从现在重新起算。
 * 配额取套餐配额，账号名下密钥的用量由调用方清零，形成新的计费周期。
 */
function applyPlanToAccount(a, plan, at) {
  const now = at || Date.now();
  const terms = planTerms(plan);
  const sameActive =
    a.plan_id === terms.plan_id &&
    !!a.plan_expires_at &&
    Date.parse(a.plan_expires_at) > now;
  const base = sameActive ? Date.parse(a.plan_expires_at) : now;
  Object.assign(a, terms);
  a.plan_started_at = new Date(now).toISOString();
  a.plan_expires_at =
    terms.plan_duration_days > 0
      ? new Date(base + terms.plan_duration_days * 86400000).toISOString()
      : '';
  a.quota_tokens = Number(plan.quota_tokens) || 0;
  a.updated_at = new Date(now).toISOString();
}

/** 清除套餐：保留当前配额，只解除套餐标识与到期时间（管理员显式操作） */
function clearPlanFromAccount(a) {
  delete a.plan_id;
  delete a.plan_name;
  delete a.plan_price;
  delete a.plan_rpm;
  delete a.plan_allowed_models;
  delete a.plan_started_at;
  delete a.plan_expires_at;
  delete a.plan_duration_days;
  delete a.last_plan_request_id;
  a.updated_at = nowIso();
}

/** 清零账号名下所有密钥的用量（新计费周期开始）。返回是否有写入。 */
async function resetOwnedKeyUsage(env, accountId) {
  let changed = false;
  await withLock(KEYS_KEY, async () => {
    const keys = (await r2GetJson(env, KEYS_KEY, [])) || [];
    for (const k of keys) {
      if (k.owner_id !== accountId) continue;
      if (k.used_tokens || k.requests || k.used_cost) {
        k.used_tokens = 0;
        k.requests = 0;
        k.used_cost = 0;
        changed = true;
      }
    }
    if (changed) await r2PutJson(env, KEYS_KEY, keys);
  });
  if (changed) invalidateCache(KEYS_KEY);
  return changed;
}

/** 只保留全部待审核申请 + 最近若干条已处理记录，避免文档无限增长 */
function trimPlanRequests(list) {
  if (list.length <= MAX_PLAN_REQUESTS_KEPT + 50) return list;
  const pending = list.filter((r) => r.status === 'pending');
  const decided = list
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, MAX_PLAN_REQUESTS_KEPT);
  return pending.concat(decided);
}

function enabledAdminCount(list) {
  return (list || []).filter((a) => a.role === 'admin' && a.enabled !== false).length;
}

async function loadAccounts(env) {
  const list = await r2GetJson(env, ACCOUNTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

async function buildAccount(input, role) {
  const username = String(input.username || '').trim();
  const now = nowIso();
  const security =
    input.question && input.answer
      ? {
          question: String(input.question).trim(),
          ...(await makeSecret(normalizeAnswer(input.answer))),
        }
      : null;
  return {
    id: 'usr_' + Date.now().toString(36) + rand(4),
    username,
    username_lower: username.toLowerCase(),
    role: role === 'admin' ? 'admin' : 'user',
    enabled: true,
    password: await makeSecret(input.password),
    security,
    quota_tokens: clampInt(input.quota_tokens, 0, 1e12, 0),
    created_at: now,
    updated_at: now,
    last_login_at: '',
  };
}

function publicKeyView(k) {
  return {
    id: k.id || '',
    name: k.name || '',
    key_prefix: k.key_prefix || '',
    enabled: k.enabled !== false,
    quota_tokens: k.quota_tokens || 0,
    used_tokens: k.used_tokens || 0,
    requests: k.requests || 0,
    used_cost: k.used_cost || 0,
    rpm: k.rpm == null ? null : k.rpm,
    allowed_models: Array.isArray(k.allowed_models) ? k.allowed_models : [],
    expires_at: k.expires_at || '',
    note: k.note || '',
    created_at: k.created_at || '',
    last_used_at: k.last_used_at || '',
  };
}

/* ---- 登录 / 注册 / 找回 的简易限流（isolate 级，防在线撞库） ---- */

const authThrottle = new Map();

function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    String(request.headers.get('X-Forwarded-For') || '')
      .split(',')[0]
      .trim() ||
    'local'
  );
}

/** 固定窗口计数：超过 max 次返回 false。只用内存，重启 isolate 即清零，够用。 */
function throttleHit(kind, id, max, windowMs) {
  const key = kind + ':' + id;
  const now = Date.now();
  let b = authThrottle.get(key);
  if (!b || now - b.at >= windowMs) {
    b = { at: now, n: 0 };
    authThrottle.set(key, b);
  }
  b.n++;
  if (authThrottle.size > 5000) {
    const stale = Array.from(authThrottle.entries())
      .sort((a, b2) => a[1].at - b2[1].at)
      .slice(0, Math.ceil(authThrottle.size / 2));
    for (const [k] of stale) authThrottle.delete(k);
  }
  return b.n <= max;
}

/* ---- 会话 ---- */

async function createSession(env, account) {
  const token = randomHex(32);
  const now = Date.now();
  const rec = {
    token_hash: await sha256Hex(token),
    user_id: account.id,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  await withLock(SESSIONS_KEY, async () => {
    const list = (await r2GetJson(env, SESSIONS_KEY, [])) || [];
    const alive = list
      .filter((s) => s && s.expires_at && Date.parse(s.expires_at) > now)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(-400);
    alive.push(rec);
    await r2PutJson(env, SESSIONS_KEY, alive);
  });
  return { token, expires_at: rec.expires_at };
}

async function revokeSessions(env, userId, exceptHash) {
  await withLock(SESSIONS_KEY, async () => {
    const list = (await r2GetJson(env, SESSIONS_KEY, [])) || [];
    const now = Date.now();
    const keep = list.filter((s) => {
      if (!s || (s.expires_at && Date.parse(s.expires_at) <= now)) return false;
      if (userId && s.user_id === userId && s.token_hash !== exceptHash) return false;
      if (!userId && s.token_hash === exceptHash) return false;
      return true;
    });
    await r2PutJson(env, SESSIONS_KEY, keep);
  });
}

/** 解析请求身份：账号会话优先，ADMIN_KEY 作为应急凭据兜底 */
async function authenticate(env, request) {
  const url = new URL(request.url);
  const adminKey =
    request.headers.get('X-Admin-Key') || url.searchParams.get('admin_key') || '';
  if (env.ADMIN_KEY && adminKey && (await safeEqual(adminKey, env.ADMIN_KEY))) {
    return {
      ok: true,
      emergency: true,
      role: 'admin',
      account: null,
      tokenHash: '',
      user: {
        id: 'admin_key',
        username: 'ADMIN_KEY（应急）',
        role: 'admin',
        enabled: true,
        emergency: true,
        has_recovery: false,
        quota_tokens: 0,
      },
    };
  }

  const token = request.headers.get('X-Session-Token') || '';
  if (!token) {
    return { ok: false, res: err('请先登录后再访问', 401, 'login_required') };
  }
  const tokenHash = await sha256Hex(token);
  const sessions = (await r2GetJson(env, SESSIONS_KEY, [])) || [];
  const session = sessions.find((s) => s && s.token_hash === tokenHash);
  if (!session) {
    return { ok: false, res: err('登录状态已失效，请重新登录', 401, 'session_invalid') };
  }
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) {
    return { ok: false, res: err('登录已过期，请重新登录', 401, 'session_expired') };
  }
  const accounts = await loadAccounts(env);
  const acc = accounts.find((a) => a.id === session.user_id);
  if (!acc) {
    return { ok: false, res: err('账号不存在，请重新登录', 401, 'account_missing') };
  }
  if (acc.enabled === false) {
    return { ok: false, res: err('该账号已被禁用，请联系管理员', 403, 'account_disabled') };
  }
  return {
    ok: true,
    emergency: false,
    role: acc.role === 'admin' ? 'admin' : 'user',
    account: acc,
    tokenHash,
    user: publicAccount(acc),
  };
}

/** 管理接口鉴权：需要 admin 角色（账号管理员或应急 ADMIN_KEY） */
async function requireAdmin(env, request) {
  const auth = await authenticate(env, request);
  if (!auth.ok) return auth;
  if (auth.role !== 'admin') {
    return { ok: false, res: err('需要管理员权限', 403, 'forbidden') };
  }
  return auth;
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

/* ---------------- 渠道健康：熔断降权 + 长任务分流 ---------------- */

/** 健康状态持久化键（R2）：isolate 重建后恢复熔断状态用，best-effort */
const CHANNEL_HEALTH_KEY = 'data/channel-health.json';

/**
 * 内存态渠道健康表：{ [渠道名]: { fails: 连续失败数, openedUntil: 熔断截止ts, lastAt: 最近失败ts } }
 * 内存为主（热路径零开销），R2 异步持久化。多 isolate 并发写靠 withLock 串行，
 * 短周期状态以「最近写入者」为准，误差一次失败计数以内，可接受。
 */
const CH_HEALTH_MEM = new Map();
let chHealthLoaded = false;

/** 懒加载：首个请求触发一次异步恢复，不阻塞当前请求（首请求用空状态，误差可接受） */
function ensureChHealthLoaded(env) {
  if (chHealthLoaded) return;
  chHealthLoaded = true;
  r2GetJson(env, CHANNEL_HEALTH_KEY, {})
    .then((saved) => {
      if (saved && typeof saved === 'object') {
        for (const k of Object.keys(saved)) {
          const v = saved[k];
          if (v && typeof v === 'object' && !CH_HEALTH_MEM.has(k)) {
            CH_HEALTH_MEM.set(k, {
              fails: v.fails | 0,
              openedUntil: v.openedUntil | 0,
              lastAt: v.lastAt | 0,
            });
          }
        }
      }
    })
    .catch(() => {});
}

/** 持久化（后台写，失败不影响主流程） */
function persistChHealth(env, ctx) {
  const snap = {};
  for (const [k, v] of CH_HEALTH_MEM) snap[k] = v;
  ctx.waitUntil(
    withLock(CHANNEL_HEALTH_KEY, () => r2PutJson(env, CHANNEL_HEALTH_KEY, snap)).catch(
      () => {}
    )
  );
}

/** 渠道是否正在熔断（openedUntil 晚于当前时间） */
function isChannelOpen(name, settings) {
  const st = name && CH_HEALTH_MEM.get(name);
  if (!st) return false;
  const threshold = (settings && settings.breaker_error_threshold) | 0;
  if (threshold <= 0) return false; // 熔断关闭
  const cooldown = (settings && settings.breaker_cooldown_ms) | 0;
  return st.openedUntil > Date.now() && cooldown > 0;
}

/** 记一次渠道侧失败：连续计数 +1，达到阈值即熔断（半开机制见 isChannelOpen） */
function markChannelFailure(env, ctx, name, settings) {
  if (!name) return;
  const threshold = (settings && settings.breaker_error_threshold) | 0;
  if (threshold <= 0) return; // 熔断关闭
  ensureChHealthLoaded(env);
  const st = CH_HEALTH_MEM.get(name) || { fails: 0, openedUntil: 0, lastAt: 0 };
  st.fails += 1;
  st.lastAt = Date.now();
  if (st.fails >= threshold) {
    const cooldown = (settings && settings.breaker_cooldown_ms) | 0;
    if (cooldown > 0) {
      st.openedUntil = Date.now() + cooldown;
      st.fails = threshold; // 半开失败后继续累计，不再膨胀
    }
  }
  CH_HEALTH_MEM.set(name, st);
  persistChHealth(env, ctx);
}

/** 记一次成功：清零连续失败计数（熔断中的渠道成功 = 半开恢复） */
function markChannelSuccess(env, ctx, name) {
  if (!name) return;
  ensureChHealthLoaded(env);
  const st = CH_HEALTH_MEM.get(name);
  if (!st) return;
  if (st.fails > 0 || st.openedUntil > Date.now()) {
    st.fails = 0;
    st.openedUntil = 0;
    CH_HEALTH_MEM.set(name, st);
    persistChHealth(env, ctx);
  }
}

/**
 * 熔断过滤：跳过熔断中的渠道；若过滤后一个不剩则全部放行（兜底——
 * 全部熔断时宁可照常轮询拿失败日志，也不直接 503）。
 */
function filterHealthyCandidates(candidates, settings) {
  const open = candidates.filter((c) => !isChannelOpen(c.name, settings));
  if (open.length > 0) return open;
  // 全部熔断：保留原顺序继续尝试（渠道名字供日志甄别）
  return candidates;
}

/**
 * 长任务分流：请求声明了大 max_tokens 时，把「长输出稳定」未勾选的渠道
 * 排到候选队尾（稳定分区——不剔除，保留优先级组内相对顺序，兜底仍可用）。
 */
function partitionByLongTask(candidates) {
  const prefer = candidates.filter((c) => c.long_output_ok !== false);
  const defer = candidates.filter((c) => c.long_output_ok === false);
  return prefer.concat(defer);
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

/**
 * SSE 文本行尾归一化器（逐片调用）：把 \r\n 与孤立的 \r 都归一为 \n。
 *
 * 与「对整个缓冲区做 replace」相比开销只跟新分片大小有关；分片末尾的
 * \r 先暂存、等下一片首字节到齐再判定是 \r\n 还是孤立 \r，因此
 * \r 与 \n 落在两个分片里也能正确合并（旧实现对整个 buffer 替换
 * 靠的正是这一点，现在用常数级状态达到同样效果）。
 * flush() 返回流结束时仍暂存的行尾（一个 \n），无暂存时返回空串。
 */
function createEolNormalizer() {
  let heldCr = false;
  return {
    push(text) {
      let t = heldCr ? '\r' + text : text;
      heldCr = false;
      if (t.endsWith('\r')) {
        heldCr = true;
        t = t.slice(0, -1);
      }
      return t.replace(/\r\n|\r/g, '\n');
    },
    flush() {
      if (!heldCr) return '';
      heldCr = false;
      return '\n';
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
  keepaliveMs = 0,
  firstByteMs = 0
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
  // 「上游→网关」方向的活动时间戳：Anthropic 兼容渠道里 content_block_stop、
  // 未知事件等块会被解析层静默丢弃、不向下游写出，但连接实际是活的。
  // guardSSEStream 借它区分「上游在说话」与「上游真的断了」。
  const activityRef = { lastUpstreamAt: Date.now() };

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

  const norm = createEolNormalizer();
  const transform = new TransformStream({
    transform(bytes, controller) {
      activityRef.lastUpstreamAt = Date.now();
      // 容忍 CRLF：部分 Anthropic 兼容中转（套一层的网关）会输出 \r\n，
      // 只按 \n\n 切分会永远拼不出一个完整事件，表现为「流式翻译零输出」。
      // 逐片归一化（跨分片的 \r 由 norm 暂存拼接），不再对整个缓冲区做替换。
      buffer += norm.push(decoder.decode(bytes, { stream: true }));
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
  // （正常路径由 flush 先结算 usage，settleUsage 自带幂等保护）；
  // pipeTo 的拒绝原因同样留存并合并透传，理由同 rewriteOpenAISSE。
  let pipeError = '';
  upstreamBody.pipeTo(transform.writable).catch((e) => {
    pipeError = String((e && e.message) || e || '').slice(0, 200);
  });
  return guardSSEStream(transform.readable, {
    onFinish: (reason, meta) =>
      settleUsage(
        null,
        reason,
        pipeError && !(meta && meta.error) ? { ...(meta || {}), error: pipeError } : meta
      ),
    idleMs,
    keepaliveMs,
    firstByteMs,
    activityRef,
  });
}

/**
 * 轻量 model 改写（无 usage 的单行块专用）：用 indexOf 扫描定位顶层
 * "model" 字符串值，相同则整块原样返回、不同则只替换那一个值，其余
 * 字节不动，不做整对象 parse/stringify。返回 null 表示不宜轻量处理
 * （多行块、非纯 data 块、值带转义、模型名含特殊字符等），由分发入口
 * 回落完整路径，语义与旧实现保持一致。
 *
 * 依据：OpenAI 风格 chunk 中第一个未转义的 "model" 键即顶层字段——
 * 正文文本里的引号在 JSON 中必是转义形态，拼不出 "model": "..."
 * 这样的连续形态，不会误命中内容。
 */
function tryLightModelRewrite(raw, model) {
  // 多行块直接回落完整路径：单行块是绝对主流，热路径只做 indexOf 扫描，
  // 不split、不正则、不解析。模型名含引号/反斜杠时不适合拼回 JSON，回落。
  if (raw.indexOf('\n') >= 0) return null;
  if (model.indexOf('"') >= 0 || model.indexOf('\\') >= 0) return null;
  const t = raw.trim();
  if (!t.startsWith('data:')) return null;
  const payload = t.slice(5).trim();
  if (payload === '[DONE]') return raw;
  if (!payload.startsWith('{')) return null;
  const ki = payload.indexOf('"model"');
  if (ki < 0) return raw;
  let i = ki + 7;
  while (payload[i] === ' ') i++;
  if (payload[i] !== ':') return null;
  i++;
  while (payload[i] === ' ') i++;
  if (payload[i] !== '"') return null;
  const valStart = i + 1;
  const valEnd = payload.indexOf('"', valStart);
  if (valEnd < 0) return null;
  const val = payload.slice(valStart, valEnd);
  if (val.indexOf('\\') >= 0) return null;
  if (val === model) return raw;
  return 'data: ' + payload.slice(0, valStart) + model + payload.slice(valEnd);
}

/**
 * 把单个 SSE 数据块里的 model 字段改写为「网关模型名」，顺带提取 usage（分发入口）。
 *
 * - 不含 "model" / "usage"：原样返回（原有快路径）；
 * - 只含 "model" 不含 "usage"：走轻量改写。典型 chunk 里 model 与网关名
 *   相同时整块零解析透传，不同也只替换那一个值——长回答上千个 chunk 时，
 *   省下的正是逐块整对象 parse/stringify 的 CPU 大头；
 * - 含 "usage"：走完整路径精确提取（一股流里只有一两块，成本可忽略）。
 */
function rewriteSseBlock(raw, model, onUsage) {
  const hasModel = raw.includes('"model"');
  const hasUsage = raw.includes('"usage"');
  if (!hasModel && !hasUsage) return raw;
  if (!hasUsage) {
    const light = tryLightModelRewrite(raw, model);
    if (light !== null) return light;
  }
  return rewriteSseBlockFull(raw, model, onUsage);
}

/**
 * 【完整路径】把单个 SSE 数据块里的 model 字段改写为「网关模型名」，顺带提取 usage。
 *
 * - 只有当整块都由 data: 行组成、且每行都是合法 JSON 时才重写（保留 [DONE]）；
 *   出现 event: / id: / retry: 或非 JSON 数据时，整块原样返回，避免破坏协议。
 * - usage 提取依赖上游支持 stream_options.include_usage（[DONE] 前会有一个只带 usage 的 chunk）。
 * - 快路径：既不含 "model" 也不含 "usage" 的块直接原样返回，跳过 JSON 解析/序列化。
 *   这一步很关键——长回答有上千个 chunk，每个都 parse+stringify 会累积大量 CPU 时间，
 *   越过 Workers 的 CPU 时限后请求会被运行时直接终止，表现就是「流到一半断掉」。
 */
function rewriteSseBlockFull(raw, model, onUsage) {
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
function guardSSEStream(src, {
  onFinish,
  idleMs = 0,
  keepaliveMs = 0,
  firstByteMs = 0,
  activityRef = null
} = {}) {
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
  let nextKaAt = 0; // 下次应发保活注释的绝对时刻；写入路径只更新它，不重排定时器
  let controllerRef = null; // start() 里赋值，供保活定时器向下游写注释用

  let errorDetail = '';
  const meta = () => ({
    bytes: bytesOut,
    first_byte: gotFirst,
    ...(errorDetail ? { error: errorDetail } : {}),
  });

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
      clearTimeout(kaTimer);
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

  /** 武装下游保活：自调度 setTimeout 链 + 「下次应发时刻」对齐。
   *
   *  v1 每写一个 chunk 都 clearInterval + setInterval（一次长回答上千次定时器
   *  创建/销毁，吃免费版 10ms CPU 限额）；v2 改常驻 setInterval 后开销恒定，
   *  但检查周期（keepaliveMs/4）的相位会把实际注释间隔放大到
   *  ⌈keepaliveMs / tick⌉ × tick，非 4 的倍数配置最坏漂移 +25%。
   *  现在：醒来时刻直接对齐 nextKaAt —— 写入路径只更新时间戳（不重排），
   *  定时器醒来若未到点就按剩余时间重排；注释间隔与配置严格一致，
   *  定时器数量仍恒定为 1，写路径零额外开销。 */
  const armKa = () => {
    if (!keepaliveMs || kaTimer || closed) return;
    lastOutAt = Date.now();
    nextKaAt = lastOutAt + keepaliveMs;
    const stepKa = () => {
      if (closed) {
        clearKa();
        return;
      }
      const now = Date.now();
      if (now >= nextKaAt) {
        try {
          controllerRef.enqueue(encoder.encode(': ka\n\n'));
          bytesOut += 6;
          lastOutAt = now;
        } catch {
          closed = true;
          clearKa();
          return;
        }
      }
      nextKaAt = lastOutAt + keepaliveMs;
      kaTimer = setTimeout(stepKa, Math.max(1, nextKaAt - Date.now()));
    };
    kaTimer = setTimeout(stepKa, Math.max(1, nextKaAt - Date.now()));
  };

  /** 向调用方下发字节的统一入口：统计字节数并刷新「最后下发时刻」，
   *  供保活定时器判断（同时顺延下次应发时刻，避免数据流正常时误发注释） */
  const out = (controller, bytes) => {
    if (closed) return;
    try {
      controller.enqueue(bytes);
      bytesOut += bytes.byteLength;
      lastOutAt = Date.now();
      if (keepaliveMs) nextKaAt = lastOutAt + keepaliveMs;
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
        // 首字节与中途静默分离：长 prompt / 慢渠道出首 token 前的排队 + 推理
        // 远比流中途的停顿更久，统一用 idleMs 会把「上游正在算」误判成断流。
        const wait = gotFirst ? idleMs : (firstByteMs || idleMs);
        idleTimer = setTimeout(() => {
          // 结构性防误判：解析层（rewriteOpenAISSE / anthropicStreamToOpenAI）
          // 可能静默丢弃非数据块（未知事件、注释行）而不向下游写出任何字节，
          // 但「上游→网关」方向最近仍有字节到达 —— 上游活着，继续等而不是掐。
          if (
            activityRef &&
            activityRef.lastUpstreamAt &&
            Date.now() - activityRef.lastUpstreamAt < wait
          ) {
            arm();
            return;
          }
          timedOut = true;
          // 主动断开上游：挂起的 read() 会以 done 结束，随后走超时收尾
          try {
            reader.cancel('idle-timeout');
          } catch {
            // 忽略
          }
        }, wait);
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
        // 上游错误原文留进诊断信息：否则日志里只剩 upstream_error，
        // 看不到上游到底是断连、限流还是协议错误，无从定性断流。
        errorDetail = String((e && e.message) || e || '').slice(0, 200);
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
  keepaliveMs = 0,
  firstByteMs = 0
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let usage = null;
  let settled = false;
  let sawDone = false;
  // 「上游→网关」方向的活动时间戳：只要上游还有字节进来（哪怕最终被解析层
  // 丢弃），就说明连接活着。guardSSEStream 借它避免把「解析层丢弃非数据块」
  // 误判成上游断流。
  const activityRef = { lastUpstreamAt: Date.now() };

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

  const norm = createEolNormalizer();
  const transform = new TransformStream({
    transform(bytes, controller) {
      activityRef.lastUpstreamAt = Date.now();
      buffer += norm.push(decoder.decode(bytes, { stream: true }));
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (isDoneBlock(raw)) sawDone = true;
        controller.enqueue(encoder.encode(rewriteSseBlock(raw, model, capture) + '\n\n'));
      }
    },
    flush(controller) {
      buffer += norm.flush();
      if (buffer.trim()) {
        if (isDoneBlock(buffer)) sawDone = true;
        controller.enqueue(encoder.encode(rewriteSseBlock(buffer, model, capture)));
      }
      // 部分兼容上游不会发送 [DONE]，由网关补上，避免客户端一直等不到流结束
      if (!sawDone) controller.enqueue(encoder.encode('\n\ndata: [DONE]\n\n'));
      done('complete');
    },
  });

  // 上游错误不再在这里吞掉：交给 guardSSEStream 统一收尾并上报结束原因；
  // 同时把 pipeTo 的拒绝原因留存一份，守卫 meta 里没有时合并透传给日志。
  let pipeError = '';
  upstreamBody.pipeTo(transform.writable).catch((e) => {
    pipeError = String((e && e.message) || e || '').slice(0, 200);
  });
  return guardSSEStream(transform.readable, {
    onFinish: (finish, meta) =>
      done(finish, pipeError && !(meta && meta.error) ? { ...(meta || {}), error: pipeError } : meta),
    idleMs,
    keepaliveMs,
    firstByteMs,
    activityRef,
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
      const rec = keys.find(
        (k) =>
          (auth.record.key_hash && k.key_hash === auth.record.key_hash) ||
          (auth.record.key && k.key === auth.record.key)
      );
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
        // 流式诊断信息（bytes / first_byte / error）：此前调用方传了却没落库，
        // README 让用户看的 stream_meta 在日志里根本不存在，这里补上。
        stream_meta: o.stream ? o.stream_meta || null : undefined,
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

  // 密钥 RPM 软限流（isolate 级，防单 Key 打爆上游；强配额走 quota_tokens）
  if (!checkRpm(auth, settings)) {
    recordRequest(env, ctx, {
      auth,
      settings,
      request_id: reqId(),
      model: body.model,
      channel: null,
      ok: false,
      ms: 0,
      error: 'rate_limited',
    });
    return err(
      '该 Key 已达到每分钟请求数（RPM）上限，请稍后再试',
      429,
      'rate_limited'
    );
  }

  // 密钥级 + 套餐级模型白名单（取交集）
  if (!auth.admin) {
    const allowed = authAllowedModels(auth);
    if (allowed && !allowed.includes(body.model)) {
      return err(`当前密钥或套餐不允许调用模型 ${body.model}`, 403, 'model_forbidden');
    }
  }

  const channels = await cachedJson(env, CHANNELS_KEY, [], CHANNELS_TTL_MS);
  let candidates = pickChannels(channels, body.model, path);
  // 长任务分流：声明了大 max_tokens 的请求把「长输出稳定」未勾选的渠道排到队尾
  if ((settings.long_task_min_tokens | 0) > 0) {
    const wantLong = Number(body.max_tokens || 0) >= settings.long_task_min_tokens;
    if (wantLong) candidates = partitionByLongTask(candidates);
  }
  // 熔断过滤：跳过熔断中的渠道（全部熔断时兜底放行，详见 filterHealthyCandidates）
  if ((settings.breaker_error_threshold | 0) > 0) {
    candidates = filterHealthyCandidates(candidates, settings);
  }
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
            // 渠道侧失败（5xx / 408 / 429）计入熔断；4xx 参数与鉴权问题是调用方的问题
            if (upstream.status >= 500 || upstream.status === 408 || upstream.status === 429) {
              markChannelFailure(env, ctx, ch.name, settings);
            }
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
              markChannelFailure(env, ctx, ch.name, settings);
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
                  settings.stream_keepalive_ms,
                  settings.stream_first_byte_ms
                )
              : rewriteOpenAISSE(
                  upstream.body,
                  body.model,
                  onFinish,
                  settings.stream_idle_timeout_ms,
                  settings.stream_keepalive_ms,
                  settings.stream_first_byte_ms
                );
            ctx.waitUntil(
              finishPromise
                .then(({ usage, finish, meta }) => {
                  // 渠道健康上报：上游中断/网关超时都算渠道侧失败（太慢也算），
                  // 客户端主动取消不动计数，正常完成清零（半开恢复）。
                  if (finish === 'upstream_error' || finish === 'timeout') {
                    markChannelFailure(env, ctx, ch.name, settings);
                  } else if (finish === 'complete') {
                    markChannelSuccess(env, ctx, ch.name);
                  }
                  return recordRequest(env, ctx, {
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
                        : `stream_${finish}${meta && meta.error ? ': ' + meta.error : ''}`,
                  });
                })
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
          markChannelSuccess(env, ctx, ch.name);
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
          // 网络异常 / 首字节超时都是渠道侧失败，计入熔断
          markChannelFailure(env, ctx, ch.name, settings);
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
  // 对下游脱敏：渠道名与上游错误原文只进管理日志（上方 recordRequest 已记录
  // 完整 failures），返回给调用方的只有笼统文案 + request_id，凭 id 可在
  // 控制台日志里对上详情，避免持钥人从报错里摸清渠道结构与上游细节。
  return err(
    `所有渠道均失败，请稍后重试（request_id: ${requestId}）`,
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
    stream_meta: d.stream_meta || null,
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
  // limit 上限 40：list 1 次 + 逐条 get 40 次 = 41 次 subrequest，加鉴权/设置读取
  // 仍须落在免费版「单请求 50 次 subrequest」硬顶之内（旧上限 500 必炸）。
  const limit = clampInt(opts.limit, 1, 40, 40);
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
  // 上限 22：当期 + 环比两次窗口 = 44 次 R2 读，必须落在 Cloudflare Workers
  // 免费版「单请求 50 次 subrequest」硬顶之内（90 天 = 180 读必炸，30 天 = 60 读也炸）。
  // 想看更长趋势请依赖每日自动备份里的 backup/<日期>.json 快照。
  const n = clampInt(days, 1, 22, 14);
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
    const listed = await env.R2.list({ prefix, limit: 1000, cursor });
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
/* ---------------- 密钥 RPM 软限流（isolate 内存固定窗口） ---------------- */

const rpmBuckets = new Map(); // key 标识 -> { winStart, count }

/** 固定 60s 窗口计数：先自增再判断，保证被拒的请求也占用本窗口的名额 */
function rpmHit(id, limit) {
  const now = Date.now();
  let b = rpmBuckets.get(id);
  if (!b || now - b.winStart >= 60000) {
    b = { winStart: now, count: 0 };
    rpmBuckets.set(id, b);
  }
  b.count++;
  if (rpmBuckets.size > 10000) {
    // LRU 淘汰最旧的一半，而不是整表 clear()——整表清零等于给所有 Key
    // （包括正在被滥用的）同时发一枚「免限流窗口」，也误伤正常用户
    const stale = Array.from(rpmBuckets.entries())
      .sort((a, b2) => a[1].winStart - b2[1].winStart)
      .slice(0, Math.ceil(rpmBuckets.size / 2));
    for (const [sid] of stale) rpmBuckets.delete(sid);
  }
  return b.count <= limit;
}

/**
 * 密钥 RPM（每分钟请求数）检查：固定 60s 窗口计数。
 * - 密钥自己的 rpm 字段优先；未设置（null/undefined）时用 settings.rpm_default；0 = 不限。
 * - 套餐可再叠加一层「账号级 RPM」：该账号名下所有密钥合计不能超过套餐上限。
 *   两层是「与」关系：各自独立计数，任意一层超限都拒绝。
 * - Workers 无跨实例共享内存，这是 isolate 级软限制（多实例时实际上限 ≈ 配置 × 实例数），
 *   用于「防单 Key 瞬时打爆上游」；计费级强配额请看 quota_tokens（走 R2 精确累加）。
 */
function checkRpm(auth, settings) {
  if (!auth || auth.admin) return true; // ADMIN_KEY 直调不参与限流
  const rec = auth.record;
  if (!rec) return true;
  const keyRpm =
    rec.rpm == null || rec.rpm === '' ? (settings && settings.rpm_default) | 0 : rec.rpm | 0;
  const planRpm = auth.owner ? Number(auth.owner.plan_rpm) || 0 : 0;
  let ok = true;
  // 两层都要计数：不能短路，否则超限的那层窗口会缺计数
  if (keyRpm > 0) {
    if (!rpmHit('key:' + (rec.id || rec.name || '?'), keyRpm)) ok = false;
  }
  if (planRpm > 0) {
    if (!rpmHit('acct:' + auth.owner.id, planRpm)) ok = false;
  }
  return ok;
}

/* ---------------- Telegram 通知 ---------------- */

/** Telegram Bot 消息：返回 { ok, detail }，失败不抛异常（通知失败不影响主流程），8s 超时防挂起 */
async function sendTelegram(settings, text) {
  const token = settings && settings.tg_bot_token;
  const chatId = settings && settings.tg_chat_id;
  if (!token || !chatId) {
    return { ok: false, detail: '未配置 Bot Token 或 Chat ID' };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) return { ok: true, detail: '' };
    // 透传 Telegram 的错误描述，并附上最常见的两条人工排查提示
    let detail = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      if (d && d.description) detail += `：${d.description}`;
    } catch {
      // 忽略解析失败
    }
    if (res.status === 401) detail += '（Bot Token 无效）';
    else if (res.status === 400 && /chat not found/i.test(detail)) {
      detail += '（Chat ID 不正确，或还没有向该 Bot 发送过任何消息）';
    }
    return { ok: false, detail };
  } catch (e) {
    const msg =
      e && e.name === 'AbortError'
        ? '请求超时（8s）—— 当前网络无法到达 api.telegram.org'
        : '网络请求失败：' + ((e && e.message) || '未知错误');
    return { ok: false, detail: msg };
  }
}

/* ---------------- R2 每日自动备份 ---------------- */

let lastBackupDate = ''; // isolate 级去重：每天最多触发一次快照

/**
 * 每日惰性备份：每天首个请求把 channels/keys/settings 快照到 backup/<日期>.json，
 * 保留最近 backup_keep_days 份（0 = 关闭）。无 cron 依赖；失败完全静默。
 * 恢复入口：管理端 /api/admin/restore（控制台「备份与恢复」）。
 */
async function maybeAutoBackup(env, ctx, settings) {
  try {
    const keep = (settings && settings.backup_keep_days) | 0;
    if (keep <= 0) return;
    const today = dateStr(Date.now(), settings && settings.timezone_offset_minutes);
    if (today === lastBackupDate) return;
    lastBackupDate = today; // 先记日期再备份：备份失败明天重试，避免每个请求都重试
    const [channels, keys, settingsSnap, accounts, plans, planRequests] = await Promise.all([
      r2GetJson(env, CHANNELS_KEY, []),
      r2GetJson(env, KEYS_KEY, []),
      r2GetJson(env, SETTINGS_KEY, {}),
      r2GetJson(env, ACCOUNTS_KEY, []),
      r2GetJson(env, PLANS_KEY, []),
      r2GetJson(env, PLAN_REQUESTS_KEY, []),
    ]);
    const snap = {
      type: 'oneapi-gateway-backup',
      version: 3,
      created_at: nowIso(),
      channels,
      keys,
      settings: settingsSnap,
      // 账号快照含密码/密保答案的哈希（不可逆），用于灾备恢复登录能力
      accounts,
      plans,
      plan_requests: planRequests,
    };
    await r2PutJson(env, `backup/${today}.json`, snap);
    // 清理超期份数（YYYY-MM-DD 字典序即时间序）
    const listed = await env.R2.list({ prefix: 'backup/', limit: 1000 });
    const old = listed.objects
      .map((o) => o.key)
      .filter((k) => k !== `backup/${today}.json`)
      .sort();
    const overflow = old.length - (keep - 1);
    if (overflow > 0) {
      const toDelete = old.slice(0, overflow);
      try {
        await env.R2.delete(toDelete);
      } catch {
        for (const k of toDelete) {
          try {
            await env.R2.delete(k);
          } catch {
            // 忽略单个失败
          }
        }
      }
    }
  } catch {
    // 备份失败不影响主流程
  }
}

async function saveChannelHealth(env, channelId, health, { settings, ctx } = {}) {
  try {
    let notifyText = null;
    await withLock(CHANNELS_KEY, async () => {
      const channels = await r2GetJson(env, CHANNELS_KEY, []);
      const idx = channels.findIndex((c) => c.id === channelId);
      if (idx < 0) return;
      const prev = channels[idx].health;
      channels[idx].health = { ...health, checked_at: nowIso() };
      await r2PutJson(env, CHANNELS_KEY, channels);
      invalidateCache(CHANNELS_KEY);
      // 渠道状态翻转 → Telegram 通知（只在巡检触发，频率天然受控；
      // 首次巡检没有旧状态，不打扰）
      if (settings && (settings.tg_notify_down || settings.tg_notify_up) && prev) {
        const wasOk = prev.ok !== false;
        const isOk = health.ok !== false;
        if (wasOk !== isOk) {
          const name = channels[idx].name || channelId;
          notifyText = isOk
            ? `✅ [One-API] 渠道「${name}」已恢复\n状态：正常 · 延迟 ${health.ms || 0}ms\n时间：${nowIso()}`
            : `🚨 [One-API] 渠道「${name}」巡检失败\n状态：异常 · ${String(health.message || '未知错误').slice(0, 180)}\n时间：${nowIso()}`;
        }
      }
    });
    if (notifyText) {
      const p = sendTelegram(settings, notifyText);
      if (ctx && ctx.waitUntil) ctx.waitUntil(p);
    }
  } catch {
    // 忽略
  }
}

/* ---------------- 账号相关接口（登录 / 注册 / 找回） ---------------- */

async function handleAuth(env, ctx, request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const settings = await loadSettings(env);
  const ip = clientIp(request);

  /* 公开状态：控制台据此决定显示「初始化管理员 / 登录 / 注册 / 找回」 */
  if (path === '/api/auth/state' && request.method === 'GET') {
    const accounts = await loadAccounts(env);
    return json({
      initialized: accounts.length > 0,
      allow_registration: settings.allow_registration === true,
      allow_password_recovery: settings.allow_password_recovery !== false,
      admin_key_configured: !!env.ADMIN_KEY,
      version: env.APP_VERSION || VERSION,
    });
  }

  /* 首次初始化管理员账号：只在 accounts 为空时可用 */
  if (path === '/api/auth/setup' && request.method === 'POST') {
    if (!throttleHit('setup', ip, 6, 3600000)) {
      return err('尝试过于频繁，请稍后再试', 429, 'too_many_attempts');
    }
    const body = await readJsonBody(request);
    if (!body || typeof body !== 'object') {
      return err('请求体应为 JSON 对象', 400, 'invalid_body');
    }
    const username = String(body.username || '').trim();
    const usernameIssue = usernameError(username);
    if (usernameIssue) return err(usernameIssue, 400, 'bad_username');
    if (!validPassword(body.password)) {
      return err('密码长度需为 8~128 位', 400, 'bad_password');
    }
    if (!validQuestion(body.question)) {
      return err('请填写安全问题（2~100 字）', 400, 'bad_question');
    }
    if (!validAnswer(body.answer)) {
      return err('请填写安全问题答案（1~100 字）', 400, 'bad_answer');
    }
    const account = await buildAccount({ ...body, username }, 'admin');
    let conflict = false;
    await withLock(ACCOUNTS_KEY, async () => {
      const list = await loadAccounts(env);
      if (list.length) {
        conflict = true;
        return;
      }
      list.push(account);
      await r2PutJson(env, ACCOUNTS_KEY, list);
    });
    if (conflict) {
      return err('管理员账号已初始化，请直接登录', 409, 'already_initialized');
    }
    invalidateCache(ACCOUNTS_KEY);
    const session = await createSession(env, account);
    return json({
      ok: true,
      token: session.token,
      expires_at: session.expires_at,
      user: publicAccount(account),
    });
  }

  /* 登录 */
  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const username = String((body && body.username) || '').trim();
    const lower = username.toLowerCase();
    if (!throttleHit('login', ip + '|' + lower, 10, 600000)) {
      return err('登录尝试过于频繁，请 10 分钟后再试', 429, 'too_many_attempts');
    }
    const accounts = await loadAccounts(env);
    const acc = accounts.find((a) => a.username_lower === lower);
    const passOk = await verifySecret(
      String((body && body.password) || ''),
      (acc && acc.password) || DUMMY_SECRET
    );
    if (!acc || !passOk) {
      return err('账号或密码错误，请检查用户名/邮箱与密码后重试', 401, 'bad_credentials');
    }
    if (acc.enabled === false) {
      return err('该账号已被禁用，请联系管理员', 403, 'account_disabled');
    }
    const at = nowIso();
    await withLock(ACCOUNTS_KEY, async () => {
      const list = await loadAccounts(env);
      const rec = list.find((a) => a.id === acc.id);
      if (rec) {
        rec.last_login_at = at;
        await r2PutJson(env, ACCOUNTS_KEY, list);
      }
    });
    const session = await createSession(env, acc);
    return json({
      ok: true,
      token: session.token,
      expires_at: session.expires_at,
      user: publicAccount(acc),
    });
  }

  /* 退出登录：无论 token 是否有效都返回成功 */
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = request.headers.get('X-Session-Token') || '';
    if (token) await revokeSessions(env, null, await sha256Hex(token));
    return json({ ok: true });
  }

  /* 当前登录身份 */
  if (path === '/api/auth/me' && request.method === 'GET') {
    const auth = await authenticate(env, request);
    if (!auth.ok) return auth.res;
    return json({ ok: true, user: auth.user, emergency: !!auth.emergency });
  }

  /* 自助注册（管理员在设置里开启后可用） */
  if (path === '/api/auth/register' && request.method === 'POST') {
    if (settings.allow_registration !== true) {
      return err('当前未开放注册，请联系管理员开通账号', 403, 'registration_disabled');
    }
    if (!throttleHit('register', ip, 5, 3600000)) {
      return err('注册过于频繁，请稍后再试', 429, 'too_many_attempts');
    }
    const body = await readJsonBody(request);
    if (!body || typeof body !== 'object') {
      return err('请求体应为 JSON 对象', 400, 'invalid_body');
    }
    const username = String(body.username || '').trim();
    const usernameIssue = usernameError(username);
    if (usernameIssue) return err(usernameIssue, 400, 'bad_username');
    if (!validPassword(body.password)) {
      return err('密码长度需为 8~128 位', 400, 'bad_password');
    }
    if (!validQuestion(body.question)) {
      return err('请填写安全问题（2~100 字）', 400, 'bad_question');
    }
    if (!validAnswer(body.answer)) {
      return err('请填写安全问题答案（1~100 字）', 400, 'bad_answer');
    }
    const account = await buildAccount(
      { ...body, username, quota_tokens: settings.default_user_quota_tokens },
      'user'
    );
    let taken = false;
    let full = false;
    await withLock(ACCOUNTS_KEY, async () => {
      const list = await loadAccounts(env);
      if (list.some((a) => a.username_lower === account.username_lower)) {
        taken = true;
        return;
      }
      if (list.length >= MAX_ACCOUNTS) {
        full = true;
        return;
      }
      list.push(account);
      await r2PutJson(env, ACCOUNTS_KEY, list);
    });
    if (taken) return err('该用户名已被占用', 409, 'username_taken');
    if (full) return err('账号数量已达上限', 403, 'too_many_accounts');
    invalidateCache(ACCOUNTS_KEY);
    const session = await createSession(env, account);
    return json({
      ok: true,
      token: session.token,
      expires_at: session.expires_at,
      user: publicAccount(account),
    });
  }

  /* 找回密码第一步：取安全问题 */
  if (path === '/api/auth/recovery' && request.method === 'GET') {
    if (settings.allow_password_recovery !== true) {
      return err('未开启问答找回密码，请联系管理员重置密码', 403, 'recovery_disabled');
    }
    if (!throttleHit('recovery', ip, 30, 3600000)) {
      return err('尝试过于频繁，请稍后再试', 429, 'too_many_attempts');
    }
    const username = String(url.searchParams.get('username') || '').trim();
    const accounts = await loadAccounts(env);
    const acc = accounts.find((a) => a.username_lower === username.toLowerCase());
    if (!acc || acc.enabled === false || !acc.security || !acc.security.hash) {
      return err('账号不存在或未设置安全问题', 404, 'no_recovery');
    }
    return json({ ok: true, username: acc.username, question: acc.security.question });
  }

  /* 找回密码第二步：校验答案并直接设置新密码 */
  if (path === '/api/auth/recover' && request.method === 'POST') {
    if (settings.allow_password_recovery !== true) {
      return err('未开启问答找回密码，请联系管理员重置密码', 403, 'recovery_disabled');
    }
    const body = await readJsonBody(request);
    const username = String((body && body.username) || '').trim();
    const lower = username.toLowerCase();
    if (!throttleHit('recover', ip + '|' + lower, 10, 600000)) {
      return err('尝试过于频繁，请 10 分钟后再试', 429, 'too_many_attempts');
    }
    if (!validPassword(body && body.new_password)) {
      return err('新密码长度需为 8~128 位', 400, 'bad_password');
    }
    const accounts = await loadAccounts(env);
    const acc = accounts.find((a) => a.username_lower === lower);
    if (!acc || acc.enabled === false || !acc.security || !acc.security.hash) {
      return err('账号不存在或未设置安全问题', 404, 'no_recovery');
    }
    const ok = await verifySecret(normalizeAnswer(body.answer), acc.security);
    if (!ok) return err('安全问题答案不正确', 401, 'bad_answer');
    const password = await makeSecret(body.new_password);
    await withLock(ACCOUNTS_KEY, async () => {
      const list = await loadAccounts(env);
      const rec = list.find((a) => a.id === acc.id);
      if (rec) {
        rec.password = password;
        rec.updated_at = nowIso();
        await r2PutJson(env, ACCOUNTS_KEY, list);
      }
    });
    // 密码已变更：该账号所有旧会话立即失效
    await revokeSessions(env, acc.id);
    return json({ ok: true });
  }

  /* 修改自己的密码（保留当前会话，其它设备登出） */
  if (path === '/api/auth/change-password' && request.method === 'POST') {
    const auth = await authenticate(env, request);
    if (!auth.ok) return auth.res;
    if (!auth.account) {
      return err('应急 ADMIN_KEY 没有账号密码，请使用账号登录后修改', 400, 'no_account');
    }
    const body = await readJsonBody(request);
    if (!validPassword(body && body.new_password)) {
      return err('新密码长度需为 8~128 位', 400, 'bad_password');
    }
    const ok = await verifySecret(
      String((body && body.old_password) || ''),
      auth.account.password
    );
    if (!ok) return err('当前密码不正确', 401, 'bad_password');
    const password = await makeSecret(body.new_password);
    await withLock(ACCOUNTS_KEY, async () => {
      const list = await loadAccounts(env);
      const rec = list.find((a) => a.id === auth.account.id);
      if (rec) {
        rec.password = password;
        rec.updated_at = nowIso();
        await r2PutJson(env, ACCOUNTS_KEY, list);
      }
    });
    await revokeSessions(env, auth.account.id, auth.tokenHash);
    return json({ ok: true });
  }

  /* 设置 / 更新自己的安全问题（需验证当前密码） */
  if (path === '/api/auth/security' && request.method === 'POST') {
    const auth = await authenticate(env, request);
    if (!auth.ok) return auth.res;
    if (!auth.account) {
      return err('应急 ADMIN_KEY 没有账号，无法设置安全问题', 400, 'no_account');
    }
    const body = await readJsonBody(request);
    if (!validQuestion(body && body.question)) {
      return err('安全问题需为 2~100 字', 400, 'bad_question');
    }
    if (!validAnswer(body && body.answer)) {
      return err('安全问题答案需为 1~100 字', 400, 'bad_answer');
    }
    const ok = await verifySecret(
      String((body && body.password) || ''),
      auth.account.password
    );
    if (!ok) return err('当前密码不正确', 401, 'bad_password');
    const security = {
      question: String(body.question).trim(),
      ...(await makeSecret(normalizeAnswer(body.answer))),
    };
    await withLock(ACCOUNTS_KEY, async () => {
      const list = await loadAccounts(env);
      const rec = list.find((a) => a.id === auth.account.id);
      if (rec) {
        rec.security = security;
        rec.updated_at = nowIso();
        await r2PutJson(env, ACCOUNTS_KEY, list);
      }
    });
    return json({ ok: true });
  }

  return err('未知账号接口', 404, 'not_found');
}

/* ---------------- 普通用户接口（只能操作自己名下的密钥） ---------------- */

async function handleUser(env, ctx, request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const auth = await authenticate(env, request);
  if (!auth.ok) return auth.res;
  if (!auth.account) {
    return err('应急 ADMIN_KEY 没有关联账号，请使用管理接口', 400, 'no_account');
  }
  const account = auth.account;

  if (path === '/api/user/keys' && request.method === 'GET') {
    const keys = (await r2GetJson(env, KEYS_KEY, [])) || [];
    const mine = keys.filter((k) => k.owner_id === account.id);
    const used = mine.reduce((sum, k) => sum + (Number(k.used_tokens) || 0), 0);
    const cost = mine.reduce((sum, k) => sum + (Number(k.used_cost) || 0), 0);
    return json({
      account: { ...publicAccount(account), used_tokens: used, used_cost: round8(cost) },
      keys: mine.map(publicKeyView),
    });
  }

  if (path === '/api/user/keys' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body || typeof body !== 'object') {
      return err('请求体应为 JSON 对象', 400, 'invalid_body');
    }
    const action = body.action || 'create';

    if (action === 'create') {
      const name = String(body.name || '').trim().slice(0, 60) || '我的密钥';
      let created = null;
      let limit = false;
      await withLock(KEYS_KEY, async () => {
        const keys = (await r2GetJson(env, KEYS_KEY, [])) || [];
        if (keys.filter((k) => k.owner_id === account.id).length >= MAX_KEYS_PER_USER) {
          limit = true;
          return;
        }
        const plain = 'sk-' + randomHex(24);
        const rec = {
          id: 'key_' + Date.now().toString(36) + rand(4),
          key_hash: await sha256Hex(plain),
          key_prefix: plain.slice(0, 12),
          name,
          owner_id: account.id,
          owner_username: account.username,
          enabled: true,
          quota_tokens: 0,
          rpm: null,
          allowed_models: [],
          note: '',
          expires_at: '',
          used_tokens: 0,
          requests: 0,
          used_cost: 0,
          created_at: nowIso(),
        };
        keys.push(rec);
        await r2PutJson(env, KEYS_KEY, keys);
        created = { key: plain, record: publicKeyView(rec) };
      });
      if (limit) {
        return err(`每个账号最多创建 ${MAX_KEYS_PER_USER} 个密钥`, 400, 'key_limit');
      }
      invalidateCache(KEYS_KEY);
      return json({ ok: true, key: created.key, record: created.record });
    }

    const id = String(body.id || '');
    let notFound = false;
    let badAction = false;
    await withLock(KEYS_KEY, async () => {
      const keys = (await r2GetJson(env, KEYS_KEY, [])) || [];
      const idx = keys.findIndex((k) => k.id === id && k.owner_id === account.id);
      if (idx < 0) {
        notFound = true;
        return;
      }
      if (action === 'rename') {
        keys[idx].name = String(body.name || '').trim().slice(0, 60) || keys[idx].name;
      } else if (action === 'toggle') {
        keys[idx].enabled = body.enabled !== false;
      } else if (action === 'delete') {
        keys.splice(idx, 1);
      } else {
        badAction = true;
        return;
      }
      await r2PutJson(env, KEYS_KEY, keys);
    });
    if (notFound) return err('密钥不存在', 404, 'not_found');
    if (badAction) return err('不支持的操作', 400, 'bad_action');
    invalidateCache(KEYS_KEY);
    return json({ ok: true });
  }

  /* ---- 套餐：查看与申请（管理员审核后生效） ---- */
  if (path === '/api/user/plans' && request.method === 'GET') {
    const [plans, requests, keys] = await Promise.all([
      r2GetJson(env, PLANS_KEY, []),
      r2GetJson(env, PLAN_REQUESTS_KEY, []),
      r2GetJson(env, KEYS_KEY, []),
    ]);
    const mine = (requests || [])
      .filter((r) => r && r.account_id === account.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const used = (keys || [])
      .filter((k) => k.owner_id === account.id)
      .reduce((sum, k) => sum + (Number(k.used_tokens) || 0), 0);
    const cost = (keys || [])
      .filter((k) => k.owner_id === account.id)
      .reduce((sum, k) => sum + (Number(k.used_cost) || 0), 0);
    return json({
      account: {
        ...publicAccount(account),
        used_tokens: used,
        used_cost: round8(cost),
      },
      plans: (plans || []).filter((p) => p && p.enabled !== false),
      pending: mine.find((r) => r.status === 'pending') || null,
      history: mine.filter((r) => r.status !== 'pending').slice(0, 10),
    });
  }

  if (path === '/api/user/plans' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body) return err('请求体应为 JSON 对象', 400, 'invalid_body');
    const action = String(body.action || '');

    if (action === 'request') {
      if (!throttleHit('plan_req', account.id, 20, 3600000)) {
        return err('申请过于频繁，请稍后再试', 429, 'too_many_attempts');
      }
      const planId = String(body.plan_id || '');
      const plans = await r2GetJson(env, PLANS_KEY, []);
      const plan = (plans || []).find((p) => p && p.id === planId && p.enabled !== false);
      if (!plan) return err('套餐不存在或已下架', 404, 'plan_not_found');
      let pendingExists = false;
      let created = null;
      await withLock(PLAN_REQUESTS_KEY, async () => {
        const list = (await r2GetJson(env, PLAN_REQUESTS_KEY, [])) || [];
        if (list.some((r) => r.account_id === account.id && r.status === 'pending')) {
          pendingExists = true;
          return;
        }
        created = {
          id: 'pr_' + Date.now().toString(36) + rand(4),
          account_id: account.id,
          username: account.username,
          plan_id: plan.id,
          plan_name: plan.name,
          price: plan.price,
          quota_tokens: plan.quota_tokens,
          duration_days: plan.duration_days,
          rpm: plan.rpm,
          allowed_models: normalizePlanModels(plan.allowed_models),
          note: String(body.note || '').trim().slice(0, 200),
          status: 'pending',
          created_at: nowIso(),
          reviewed_at: '',
          reviewed_by: '',
          reject_reason: '',
        };
        list.push(created);
        await r2PutJson(env, PLAN_REQUESTS_KEY, trimPlanRequests(list));
      });
      if (pendingExists) {
        return err('已有待审核的套餐申请，请等待管理员处理', 409, 'request_pending');
      }
      return json({ ok: true, request: created });
    }

    if (action === 'cancel') {
      const id = String(body.id || '');
      let notFound = false;
      let badState = false;
      await withLock(PLAN_REQUESTS_KEY, async () => {
        const list = (await r2GetJson(env, PLAN_REQUESTS_KEY, [])) || [];
        const rec = list.find((r) => r.id === id && r.account_id === account.id);
        if (!rec) {
          notFound = true;
          return;
        }
        if (rec.status !== 'pending') {
          badState = true;
          return;
        }
        rec.status = 'cancelled';
        rec.reviewed_at = nowIso();
        rec.reviewed_by = account.username;
        await r2PutJson(env, PLAN_REQUESTS_KEY, list);
      });
      if (notFound) return err('申请不存在', 404, 'not_found');
      if (badState) return err('该申请已被处理，无法取消', 409, 'request_not_pending');
      return json({ ok: true });
    }

    return err('不支持的操作', 400, 'bad_action');
  }

  return err('未知用户接口', 404, 'not_found');
}

/* ---------------- 管理 API ---------------- */

async function handleAdmin(env, ctx, request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const gate = await requireAdmin(env, request);
  if (!gate.ok) return gate.res;

  /* ---- 鉴权探针 ----
   * 不依赖业务数据，用于控制台单独判断「当前会话是否仍有效」。
   * 这样「数据接口临时故障」就不会被误判成「登录失效」。 */
  if (path === '/api/admin/ping') {
    return json({
      ok: true,
      time: nowIso(),
      version: env.APP_VERSION || VERSION,
      user: gate.user,
      emergency: !!gate.emergency,
      admin_key_configured: !!env.ADMIN_KEY,
    });
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
    const keys = await r2GetJson(env, KEYS_KEY, []);
    // 惰性迁移：老数据（明文 key）在打开控制台时转哈希并写回，之后响应里不再出现明文
    let mutated = false;
    for (const k of keys) {
      if (typeof k.key === 'string' && k.key) {
        k.key_hash = await sha256Hex(k.key);
        k.key_prefix = String(k.key).slice(0, 12);
        delete k.key;
        mutated = true;
      }
    }
    if (mutated) {
      ctx.waitUntil(
        withLock(KEYS_KEY, () => r2PutJson(env, KEYS_KEY, keys)).then(() => invalidateCache(KEYS_KEY))
      );
    }
    // 归属显示：普通用户自助创建的密钥带 owner_id，这里补上最新用户名
    const accounts = await loadAccounts(env);
    const nameById = new Map(accounts.map((a) => [a.id, a.username]));
    return json(
      keys.map((k) =>
        k && k.owner_id
          ? { ...k, owner_username: nameById.get(k.owner_id) || k.owner_username || '(已删除)' }
          : k
      )
    );
  }
  if (path === '/api/admin/keys' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.keys)) {
      return err('请求体应为 {keys: [...]}', 400, 'invalid_body');
    }
    // 归一化：前端提交的新密钥明文就地转 { key_hash, key_prefix }，R2 永不落明文
    await hashKeyRecords(body.keys);
    // 与用量累加共用一把锁，避免编辑被并发请求的用量写回覆盖
    await withLock(KEYS_KEY, () => r2PutJson(env, KEYS_KEY, body.keys));
    invalidateCache(KEYS_KEY); // 禁用 / 改配额后立即生效，不等待 TTL
    return json({ ok: true });
  }

  /* ---- 账号管理（仅管理员） ---- */
  if (path === '/api/admin/accounts' && request.method === 'GET') {
    const [accounts, keys] = await Promise.all([
      loadAccounts(env),
      r2GetJson(env, KEYS_KEY, []),
    ]);
    const list = accounts.map((a) => {
      const mine = (keys || []).filter((k) => k.owner_id === a.id);
      return {
        ...publicAccount(a),
        key_count: mine.length,
        used_tokens: mine.reduce((sum, k) => sum + (Number(k.used_tokens) || 0), 0),
        used_cost: round8(
          mine.reduce((sum, k) => sum + (Number(k.used_cost) || 0), 0)
        ),
        is_current: !!(gate.account && gate.account.id === a.id),
      };
    });
    return json({
      accounts: list,
      current_id: gate.account ? gate.account.id : null,
      emergency: !!gate.emergency,
    });
  }
  if (path === '/api/admin/accounts' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body || typeof body !== 'object') {
      return err('请求体应为 JSON 对象', 400, 'invalid_body');
    }
    const action = String(body.action || '');

    if (action === 'create') {
      const username = String(body.username || '').trim();
      const usernameIssue = usernameError(username);
      if (usernameIssue) return err(usernameIssue, 400, 'bad_username');
      if (!validPassword(body.password)) {
        return err('密码长度需为 8~128 位', 400, 'bad_password');
      }
      if (body.question || body.answer) {
        if (!validQuestion(body.question)) {
          return err('安全问题需为 2~100 字', 400, 'bad_question');
        }
        if (!validAnswer(body.answer)) {
          return err('安全问题答案需为 1~100 字', 400, 'bad_answer');
        }
      }
      let createPlan = null;
      if (body.plan_id) {
        const plans = (await r2GetJson(env, PLANS_KEY, [])) || [];
        createPlan = plans.find((p) => p.id === String(body.plan_id));
        if (!createPlan) return err('套餐不存在或已下架', 404, 'plan_not_found');
      }
      const account = await buildAccount(
        {
          username,
          password: body.password,
          question: body.question,
          answer: body.answer,
          quota_tokens:
            body.quota_tokens !== undefined
              ? body.quota_tokens
              : settings.default_user_quota_tokens,
        },
        body.role === 'admin' ? 'admin' : 'user'
      );
      if (createPlan) {
        applyPlanToAccount(account, createPlan);
        if (body.quota_tokens !== undefined) {
          account.quota_tokens = clampInt(body.quota_tokens, 0, 1e12, 0);
        }
      }
      let taken = false;
      let full = false;
      await withLock(ACCOUNTS_KEY, async () => {
        const list = await loadAccounts(env);
        if (list.some((a) => a.username_lower === account.username_lower)) {
          taken = true;
          return;
        }
        if (list.length >= MAX_ACCOUNTS) {
          full = true;
          return;
        }
        list.push(account);
        await r2PutJson(env, ACCOUNTS_KEY, list);
      });
      if (taken) return err('该用户名已被占用', 409, 'username_taken');
      if (full) return err('账号数量已达上限', 403, 'too_many_accounts');
      invalidateCache(ACCOUNTS_KEY);
      return json({ ok: true, account: publicAccount(account) });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) return err('缺少账号 id', 400, 'bad_id');
      let newSecurity;
      if (body.clear_security === true) {
        newSecurity = { clear: true };
      } else if (body.question || body.answer) {
        if (!validQuestion(body.question)) {
          return err('安全问题需为 2~100 字', 400, 'bad_question');
        }
        if (!validAnswer(body.answer)) {
          return err('安全问题答案需为 1~100 字', 400, 'bad_answer');
        }
        newSecurity = {
          value: {
            question: String(body.question).trim(),
            ...(await makeSecret(normalizeAnswer(body.answer))),
          },
        };
      }
      let notFound = false;
      let conflictMsg = '';
      let disabled = false;
      let updated = null;
      let resetUsage = false;
      // 套餐指派在锁外解析（只读套餐列表），锁内只做赋值
      let assignmentPlan;
      let assignRequested = body.plan_id !== undefined;
      if (assignRequested) {
        const raw = body.plan_id == null ? '' : String(body.plan_id);
        if (!raw) {
          assignmentPlan = null;
        } else {
          const plans = (await r2GetJson(env, PLANS_KEY, [])) || [];
          assignmentPlan = plans.find((p) => p.id === raw) || null;
          if (!assignmentPlan) return err('套餐不存在或已下架', 404, 'plan_not_found');
        }
      }
      await withLock(ACCOUNTS_KEY, async () => {
        const list = await loadAccounts(env);
        const idx = list.findIndex((a) => a.id === id);
        if (idx < 0) {
          notFound = true;
          return;
        }
        const a = list[idx];
        const nextRole =
          body.role === 'admin' || body.role === 'user'
            ? body.role
            : a.role === 'admin'
              ? 'admin'
              : 'user';
        const nextEnabled =
          body.enabled === undefined ? a.enabled !== false : body.enabled !== false;
        if (
          a.role === 'admin' &&
          a.enabled !== false &&
          (nextRole !== 'admin' || !nextEnabled) &&
          enabledAdminCount(list) <= 1
        ) {
          conflictMsg = '至少保留一个启用的管理员账号';
          return;
        }
        if (!nextEnabled && gate.account && gate.account.id === id) {
          conflictMsg = '不能禁用当前登录的账号';
          return;
        }
        a.role = nextRole;
        a.enabled = nextEnabled;
        if (assignRequested) {
          if (assignmentPlan === null) {
            if (a.plan_id) clearPlanFromAccount(a);
          } else if (a.plan_id !== assignmentPlan.id || body.renew_plan === true) {
            applyPlanToAccount(a, assignmentPlan);
            a.last_plan_request_id = '';
            resetUsage = true;
          }
        }
        if (body.quota_tokens !== undefined) {
          a.quota_tokens = clampInt(body.quota_tokens, 0, 1e12, 0);
        }
        if (newSecurity && newSecurity.clear) a.security = null;
        else if (newSecurity && newSecurity.value) a.security = newSecurity.value;
        a.updated_at = nowIso();
        await r2PutJson(env, ACCOUNTS_KEY, list);
        disabled = !nextEnabled;
        updated = publicAccount(a);
      });
      if (notFound) return err('账号不存在', 404, 'not_found');
      if (conflictMsg) return err(conflictMsg, 400, 'last_admin');
      if (resetUsage) await resetOwnedKeyUsage(env, id);
      invalidateCache(ACCOUNTS_KEY);
      if (disabled) await revokeSessions(env, id);
      return json({ ok: true, account: updated, usage_reset: resetUsage });
    }

    if (action === 'reset-password') {
      const id = String(body.id || '');
      if (!id) return err('缺少账号 id', 400, 'bad_id');
      if (!validPassword(body.new_password)) {
        return err('新密码长度需为 8~128 位', 400, 'bad_password');
      }
      const password = await makeSecret(body.new_password);
      let notFound = false;
      await withLock(ACCOUNTS_KEY, async () => {
        const list = await loadAccounts(env);
        const rec = list.find((a) => a.id === id);
        if (!rec) {
          notFound = true;
          return;
        }
        rec.password = password;
        rec.updated_at = nowIso();
        await r2PutJson(env, ACCOUNTS_KEY, list);
      });
      if (notFound) return err('账号不存在', 404, 'not_found');
      // 管理员重置自己的密码时保留当前会话，避免刚改完就被踢出
      await revokeSessions(
        env,
        id,
        gate.account && gate.account.id === id ? gate.tokenHash : undefined
      );
      return json({ ok: true });
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return err('缺少账号 id', 400, 'bad_id');
      if (gate.account && gate.account.id === id) {
        return err('不能删除当前登录的账号', 400, 'self_delete');
      }
      let notFound = false;
      let lastAdmin = false;
      await withLock(ACCOUNTS_KEY, async () => {
        const list = await loadAccounts(env);
        const idx = list.findIndex((a) => a.id === id);
        if (idx < 0) {
          notFound = true;
          return;
        }
        const a = list[idx];
        if (a.role === 'admin' && a.enabled !== false && enabledAdminCount(list) <= 1) {
          lastAdmin = true;
          return;
        }
        list.splice(idx, 1);
        await r2PutJson(env, ACCOUNTS_KEY, list);
      });
      if (notFound) return err('账号不存在', 404, 'not_found');
      if (lastAdmin) return err('至少保留一个启用的管理员账号', 400, 'last_admin');
      await revokeSessions(env, id);
      let removedKeys = 0;
      await withLock(KEYS_KEY, async () => {
        const keys = await r2GetJson(env, KEYS_KEY, []);
        const keep = keys.filter((k) => k.owner_id !== id);
        removedKeys = keys.length - keep.length;
        if (removedKeys) await r2PutJson(env, KEYS_KEY, keep);
      });
      let removedRequests = 0;
      await withLock(PLAN_REQUESTS_KEY, async () => {
        const list = (await r2GetJson(env, PLAN_REQUESTS_KEY, [])) || [];
        const keep = list.filter((r) => r.account_id !== id);
        removedRequests = list.length - keep.length;
        if (removedRequests) await r2PutJson(env, PLAN_REQUESTS_KEY, keep);
      });
      invalidateCache(ACCOUNTS_KEY, KEYS_KEY);
      return json({
        ok: true,
        removed_keys: removedKeys,
        removed_requests: removedRequests,
      });
    }

    return err('未知操作', 400, 'bad_action');
  }

  /* ---- 套餐管理（仅管理员） ---- */
  if (path === '/api/admin/plans' && request.method === 'GET') {
    const [plans, requests, accounts] = await Promise.all([
      r2GetJson(env, PLANS_KEY, []),
      r2GetJson(env, PLAN_REQUESTS_KEY, []),
      loadAccounts(env),
    ]);
    const nameById = new Map(accounts.map((a) => [a.id, a.username]));
    const list = (requests || [])
      .map((r) => ({
        ...r,
        username: nameById.get(r.account_id) || r.username || '(已删除)',
      }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return json({
      plans: plans || [],
      requests: list.slice(0, 200),
      pending_count: list.filter((r) => r.status === 'pending').length,
    });
  }

  if (path === '/api/admin/plans' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body) return err('请求体应为 JSON 对象', 400, 'invalid_body');
    const action = String(body.action || '');

    if (action === 'create') {
      if (!String(body.name || '').trim()) return err('请填写套餐名称', 400, 'bad_name');
      const plan = buildPlan(body);
      let full = false;
      await withLock(PLANS_KEY, async () => {
        const plans = (await r2GetJson(env, PLANS_KEY, [])) || [];
        if (plans.length >= MAX_PLANS) {
          full = true;
          return;
        }
        plans.push(plan);
        await r2PutJson(env, PLANS_KEY, plans);
      });
      if (full) return err(`套餐数量最多 ${MAX_PLANS} 个`, 400, 'plan_limit');
      return json({ ok: true, plan });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) return err('缺少套餐 id', 400, 'bad_id');
      if (body.name !== undefined && !String(body.name).trim()) {
        return err('套餐名称不能为空', 400, 'bad_name');
      }
      let notFound = false;
      let plan = null;
      await withLock(PLANS_KEY, async () => {
        const plans = (await r2GetJson(env, PLANS_KEY, [])) || [];
        const idx = plans.findIndex((p) => p.id === id);
        if (idx < 0) {
          notFound = true;
          return;
        }
        plan = buildPlan({ ...plans[idx], ...body, id }, plans[idx]);
        plans[idx] = plan;
        await r2PutJson(env, PLANS_KEY, plans);
      });
      if (notFound) return err('套餐不存在', 404, 'not_found');
      return json({ ok: true, plan });
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return err('缺少套餐 id', 400, 'bad_id');
      let notFound = false;
      await withLock(PLANS_KEY, async () => {
        const plans = (await r2GetJson(env, PLANS_KEY, [])) || [];
        const keep = plans.filter((p) => p.id !== id);
        if (keep.length === plans.length) {
          notFound = true;
          return;
        }
        await r2PutJson(env, PLANS_KEY, keep);
      });
      if (notFound) return err('套餐不存在', 404, 'not_found');
      // 已提交的待审核申请自动驳回；已生效的账号保留条款快照，到期后自然失效
      let rejected = 0;
      await withLock(PLAN_REQUESTS_KEY, async () => {
        const list = (await r2GetJson(env, PLAN_REQUESTS_KEY, [])) || [];
        for (const r of list) {
          if (r.plan_id === id && r.status === 'pending') {
            r.status = 'rejected';
            r.reject_reason = '套餐已下架';
            r.reviewed_at = nowIso();
            r.reviewed_by = gate.user.username;
            rejected++;
          }
        }
        if (rejected) await r2PutJson(env, PLAN_REQUESTS_KEY, list);
      });
      return json({ ok: true, rejected_requests: rejected });
    }

    if (action === 'approve-request') {
      const id = String(body.id || '');
      if (!id) return err('缺少申请 id', 400, 'bad_id');
      let notFound = false;
      let badState = false;
      let accountMissing = false;
      let request = null;
      await withLock(PLAN_REQUESTS_KEY, async () => {
        const list = (await r2GetJson(env, PLAN_REQUESTS_KEY, [])) || [];
        const rec = list.find((r) => r.id === id);
        if (!rec) {
          notFound = true;
          return;
        }
        if (rec.status !== 'pending') {
          badState = true;
          return;
        }
        let applied = false;
        await withLock(ACCOUNTS_KEY, async () => {
          const accounts = await loadAccounts(env);
          const a = accounts.find((x) => x.id === rec.account_id);
          if (!a) {
            accountMissing = true;
            return;
          }
          if (a.last_plan_request_id !== rec.id) {
            applyPlanToAccount(a, requestAsPlan(rec));
            a.last_plan_request_id = rec.id;
            await resetOwnedKeyUsage(env, a.id);
            await r2PutJson(env, ACCOUNTS_KEY, accounts);
          }
          applied = true;
        });
        if (!applied) return;
        rec.status = 'approved';
        rec.reviewed_at = nowIso();
        rec.reviewed_by = gate.user.username;
        rec.reject_reason = '';
        await r2PutJson(env, PLAN_REQUESTS_KEY, list);
        request = rec;
      });
      if (notFound) return err('申请不存在', 404, 'not_found');
      if (badState) return err('该申请已被处理', 409, 'request_not_pending');
      if (accountMissing) return err('申请对应的账号已不存在', 404, 'account_missing');
      invalidateCache(ACCOUNTS_KEY, KEYS_KEY);
      return json({ ok: true, request });
    }

    if (action === 'reject-request') {
      const id = String(body.id || '');
      if (!id) return err('缺少申请 id', 400, 'bad_id');
      let notFound = false;
      let badState = false;
      let request = null;
      await withLock(PLAN_REQUESTS_KEY, async () => {
        const list = (await r2GetJson(env, PLAN_REQUESTS_KEY, [])) || [];
        const rec = list.find((r) => r.id === id);
        if (!rec) {
          notFound = true;
          return;
        }
        if (rec.status !== 'pending') {
          badState = true;
          return;
        }
        rec.status = 'rejected';
        rec.reject_reason = String(body.reason || '').trim().slice(0, 200);
        rec.reviewed_at = nowIso();
        rec.reviewed_by = gate.user.username;
        await r2PutJson(env, PLAN_REQUESTS_KEY, list);
        request = rec;
      });
      if (notFound) return err('申请不存在', 404, 'not_found');
      if (badState) return err('该申请已被处理', 409, 'request_not_pending');
      return json({ ok: true, request });
    }

    return err('未知操作', 400, 'bad_action');
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
      limit: url.searchParams.get('limit') || 40,
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
    const r = await cleanupExpiredLogs(env, settings, body && body.days != null ? body.days : null);
    return json({ ok: true, ...r });
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
  /* ---- Telegram 通知测试 ---- */
  // 用当前（或表单里尚未保存的）配置发一条测试消息，立即验证连通性
  if (path === '/api/admin/test-notify' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const s = { ...settings };
    // 表单里刚填、还没点「保存设置」的配置优先 —— 填完即可测，不用先保存
    if (body && typeof body.tg_bot_token === 'string' && body.tg_bot_token.trim()) {
      s.tg_bot_token = body.tg_bot_token.trim();
    }
    if (body && typeof body.tg_chat_id === 'string' && body.tg_chat_id.trim()) {
      s.tg_chat_id = body.tg_chat_id.trim();
    }
    const r = await sendTelegram(
      s,
      `✅ [One-API] 测试通知\n配置连通成功 · ${nowIso()}`
    );
    // 无论成败都返回 200，由前端按 ok 分支展示诊断信息
    return json({ ok: r.ok, detail: r.detail || '' });
  }

  /* ---- 备份与恢复 ---- */
  // 当场生成完整快照下载（channels + keys + settings，含时间戳）
  if (path === '/api/admin/backup' && request.method === 'GET') {
    const [ch, ks, st, ac, pl, pr] = await Promise.all([
      r2GetJson(env, CHANNELS_KEY, []),
      r2GetJson(env, KEYS_KEY, []),
      r2GetJson(env, SETTINGS_KEY, {}),
      r2GetJson(env, ACCOUNTS_KEY, []),
      r2GetJson(env, PLANS_KEY, []),
      r2GetJson(env, PLAN_REQUESTS_KEY, []),
    ]);
    const snap = {
      type: 'oneapi-gateway-backup',
      version: 3,
      created_at: nowIso(),
      channels: ch,
      keys: ks,
      settings: st,
      accounts: ac,
      plans: pl,
      plan_requests: pr,
    };
    return new Response(JSON.stringify(snap, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="oneapi-backup-${dateStr(Date.now(), settings.timezone_offset_minutes)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  // 列出每日自动备份（backup/<日期>.json）；?date=YYYY-MM-DD 直接下载某份
  if (path === '/api/admin/backups' && request.method === 'GET') {
    const wantDate = url.searchParams.get('date');
    if (wantDate && /^\d{4}-\d{2}-\d{2}$/.test(wantDate)) {
      const snap = await r2GetJson(env, `backup/${wantDate}.json`, null);
      if (!snap) return err('该日期没有自动备份', 404, 'not_found');
      return new Response(JSON.stringify(snap, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="oneapi-backup-${wantDate}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const listed = await env.R2.list({ prefix: 'backup/', limit: 1000 });
    const backups = listed.objects
      .map((o) => ({ date: o.key.slice(7, 17), size: o.size, uploaded: o.uploaded }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return json({ backups, keep_days: settings.backup_keep_days });
  }
  // 恢复：整体覆盖 channels/keys/settings（危险操作，需 confirm: true）
  if (path === '/api/admin/restore' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (
      !body ||
      body.type !== 'oneapi-gateway-backup' ||
      !Array.isArray(body.channels) ||
      !Array.isArray(body.keys)
    ) {
      return err(
        '备份文件格式不正确（需要「立即导出」生成的 oneapi-gateway-backup 完整快照）',
        400,
        'invalid_backup'
      );
    }
    if (body.confirm !== true) {
      return err(
        '恢复会整体覆盖当前渠道/密钥/设置，请带上 confirm: true（控制台会先弹确认）',
        400,
        'confirm_required'
      );
    }
    // v2 备份带 accounts：恢复账号时必须保留至少一个可用管理员，
    // 否则恢复完成即锁死后台；同时清空全部会话（旧账号可能已不存在）。
    let restoreAccounts = false;
    if (body.accounts !== undefined) {
      if (!Array.isArray(body.accounts)) {
        return err('备份中的 accounts 应为数组', 400, 'invalid_backup');
      }
      const bad = body.accounts.find(
        (a) =>
          !a ||
          typeof a.username !== 'string' ||
          !a.password ||
          typeof a.password.hash !== 'string'
      );
      if (bad) return err('备份中的账号数据不完整，已拒绝恢复', 400, 'invalid_backup');
      if (!body.accounts.some((a) => a.role === 'admin' && a.enabled !== false)) {
        return err(
          '备份中的账号里没有可用的管理员，恢复后将无法登录后台，已拒绝',
          400,
          'no_admin'
        );
      }
      restoreAccounts = true;
    }
    // v3 备份带套餐与申请记录：可选恢复；只恢复账号而备份里没有申请记录时，
    // 清空当前申请，避免待审核记录指向已经不存在（或换了身份）的账号。
    let restorePlans = false;
    if (body.plans !== undefined) {
      if (!Array.isArray(body.plans)) {
        return err('备份中的 plans 应为数组', 400, 'invalid_backup');
      }
      const bad = body.plans.find((p) => !p || typeof p.id !== 'string' || typeof p.name !== 'string');
      if (bad) return err('备份中的套餐数据不完整，已拒绝恢复', 400, 'invalid_backup');
      restorePlans = true;
    }
    let restoreRequests = false;
    if (body.plan_requests !== undefined) {
      if (!Array.isArray(body.plan_requests)) {
        return err('备份中的 plan_requests 应为数组', 400, 'invalid_backup');
      }
      const bad = body.plan_requests.find(
        (r) =>
          !r ||
          typeof r.id !== 'string' ||
          typeof r.account_id !== 'string' ||
          typeof r.status !== 'string'
      );
      if (bad) return err('备份中的套餐申请数据不完整，已拒绝恢复', 400, 'invalid_backup');
      restoreRequests = true;
    }
    const nextSettings = normalizeSettings(body.settings || {});
    await Promise.all([
      withLock(CHANNELS_KEY, () => r2PutJson(env, CHANNELS_KEY, body.channels)),
      withLock(KEYS_KEY, () => r2PutJson(env, KEYS_KEY, body.keys)),
      (async () => {
        await r2PutJson(env, SETTINGS_KEY, nextSettings);
        invalidateSettingsCache();
      })(),
      restoreAccounts
        ? withLock(ACCOUNTS_KEY, () => r2PutJson(env, ACCOUNTS_KEY, body.accounts))
        : Promise.resolve(),
      restorePlans
        ? withLock(PLANS_KEY, () => r2PutJson(env, PLANS_KEY, body.plans))
        : Promise.resolve(),
      restoreRequests
        ? withLock(PLAN_REQUESTS_KEY, () =>
            r2PutJson(env, PLAN_REQUESTS_KEY, body.plan_requests)
          )
        : restoreAccounts
          ? withLock(PLAN_REQUESTS_KEY, () => r2PutJson(env, PLAN_REQUESTS_KEY, []))
          : Promise.resolve(),
    ]);
    if (restoreAccounts) {
      await withLock(SESSIONS_KEY, () => r2PutJson(env, SESSIONS_KEY, []));
    }
    invalidateCache(CHANNELS_KEY);
    invalidateCache(KEYS_KEY);
    invalidateCache(ACCOUNTS_KEY);
    return json({
      ok: true,
      channels: body.channels.length,
      keys: body.keys.length,
      accounts: restoreAccounts ? body.accounts.length : undefined,
      plans: restorePlans ? body.plans.length : undefined,
      plan_requests: restoreRequests ? body.plan_requests.length : undefined,
      restored_at: nowIso(),
    });
  }

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
        }, { settings, ctx })
      );
    }
    return json(r);
  }
  if (path === '/api/admin/test-all' && request.method === 'POST') {
    const results = await patrolAllChannels(env, ctx, settings);
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

/* ---------------- 定时任务（Cron Trigger） ---------------- */

const CRON_STATE_KEY = 'data/cron-state.json';
/** 流式异常率告警阈值（常量，不做成设置项：个人网关量级下够用，避免设置膨胀） */
const STREAM_ALERT_MIN_STREAMS = 20;
/** 当日流式异常结束占比达到此值才告警 */
const STREAM_ALERT_RATE = 0.3;
/** 两次异常率告警至少间隔 6 小时 */
const STREAM_ALERT_COOLDOWN_MS = 6 * 3600 * 1000;

/** 巡检全部渠道（与控制台「全部测试」同一逻辑，管理接口与定时任务共用） */
async function patrolAllChannels(env, ctx, settings) {
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
    await saveChannelHealth(env, ch.id, health, { settings, ctx });
  }
  return results;
}

/** 清理过期日志与对应统计（与控制台「清理过期日志」同一逻辑，两处共用） */
async function cleanupExpiredLogs(env, settings, daysOverride) {
  const keep = clampInt(
    daysOverride != null ? daysOverride : settings.log_retention_days,
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
  return { keep_days: keep, cutoff, removed_dates: victims.length, removed_logs: removed };
}

/**
 * 定时任务主流程：Cron 每 10 分钟唤起一次，各项工作按 data/cron-state.json
 * 里的状态各自节流，互不阻塞定性：
 *  1) 每日备份兜底——当天一个请求都没有时也不会漏（maybeAutoBackup 自带按日去重）；
 *  2) 过期日志清理——每天最多执行一次，让「日志保留天数」从手动按钮变成自动生效；
 *  3) 渠道巡检——按 patrol_interval_min 节流，状态翻转的 TG 通知在 saveChannelHealth 内；
 *  4) 流式异常率告警——看真实流量统计（不依赖巡检），超阈值且过了冷却期才发 TG。
 */
async function runScheduledTasks(env, ctx) {
  const settings = await loadSettings(env);
  const state = (await r2GetJson(env, CRON_STATE_KEY, {})) || {};
  const now = Date.now();
  const today = dateStr(now, settings.timezone_offset_minutes);
  let dirty = false;

  await maybeAutoBackup(env, ctx, settings);

  if (state.last_cleanup_date !== today) {
    await cleanupExpiredLogs(env, settings);
    state.last_cleanup_date = today;
    dirty = true;
  }

  const intervalMin = settings.patrol_interval_min | 0;
  if (intervalMin > 0 && now - (state.last_patrol_at || 0) >= intervalMin * 60000) {
    await patrolAllChannels(env, ctx, settings);
    state.last_patrol_at = now;
    dirty = true;
  }

  if (
    settings.tg_bot_token &&
    settings.tg_chat_id &&
    now - (state.last_stream_alert_at || 0) >= STREAM_ALERT_COOLDOWN_MS
  ) {
    const stats = await r2GetJson(env, STATS_PREFIX + today + '.json', null);
    const streams = (stats && stats.streams) || 0;
    const aborted = (stats && stats.streams_aborted) || 0;
    if (streams >= STREAM_ALERT_MIN_STREAMS && aborted / streams >= STREAM_ALERT_RATE) {
      const pct = Math.round((aborted / streams) * 100);
      await sendTelegram(
        settings,
        `🚨 [One-API] 今日流式异常率过高\n流式请求 ${streams} 次，异常结束 ${aborted} 次（${pct}%）\n多为上游断流 / 网关超时，请到控制台日志页按「仅异常结束」筛选查看。\n时间：${nowIso()}`
      );
      state.last_stream_alert_at = now;
      dirty = true;
    }
  }

  if (dirty) await r2PutJson(env, CRON_STATE_KEY, state).catch(() => {});
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
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      // 管理 / 账号接口不开放跨域：控制台与 /api/* 天然同源，跨域 preflight 一律拒绝
      if (path.startsWith('/api/')) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    // 懒初始化 R2 数据结构（幂等）
    await ensureSeed(env);

    // 版本号优先取 wrangler.toml [vars] 的 APP_VERSION（部署时与 package.json 同步维护），回退源码常量
    const version = env.APP_VERSION || VERSION;

    // 每日惰性备份：每天首个请求触发一次快照（异步，不阻塞请求；失败完全静默）
    if (path !== '/healthz' && path !== '/health') {
      const bootSettings = await loadSettings(env);
      ctx.waitUntil(maybeAutoBackup(env, ctx, bootSettings));
    }

    if (path === '/' && request.method === 'GET') {
      return json({
        name: 'oneapi-gateway',
        version,
        r2: 'bound',
        admin: '/admin',
        endpoints: ['/v1/models', '/v1/chat/completions', '/v1/completions', '/v1/embeddings'],
      });
    }

    if ((path === '/healthz' || path === '/health') && request.method === 'GET') {
      return json({ status: 'ok', version, time: nowIso() });
    }

    if (path === '/admin' && request.method === 'GET') {
      return new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
      });
    }

    // 管理 / 账号 / 用户接口统一收紧 CORS：控制台与 API 同源，
    // 跨域网页即使拿到凭据也不应能直接读取这些接口
    if (path.startsWith('/api/')) {
      const res = path.startsWith('/api/auth/')
        ? await handleAuth(env, ctx, request)
        : path.startsWith('/api/user/')
          ? await handleUser(env, ctx, request)
          : path.startsWith('/api/admin/')
            ? await handleAdmin(env, ctx, request)
            : err('接口不存在', 404, 'not_found');
      const h = new Headers(res.headers);
      h.delete('Access-Control-Allow-Origin');
      h.delete('Access-Control-Allow-Headers');
      h.delete('Access-Control-Allow-Methods');
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: h,
      });
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
      const allowed = authAllowedModels(auth);
      if (allowed) models = models.filter((m) => allowed.includes(m));
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

  /** Cron Trigger 入口（wrangler.toml [triggers]，每 10 分钟唤起，内部再节流） */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledTasks(env, ctx).catch(() => {}));
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
  markChannelFailure,
  markChannelSuccess,
  isChannelOpen,
  filterHealthyCandidates,
  partitionByLongTask,
  patrolAllChannels,
  cleanupExpiredLogs,
  runScheduledTasks,
};
