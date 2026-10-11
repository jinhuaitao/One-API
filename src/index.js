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
 *  - 可配置请求超时（默认 60s）与瞬时错误重试（429/5xx/网络异常）
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
const todayStr = () => new Date().toISOString().slice(0, 10);
const rand = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
const reqId = () => 'req_' + Date.now().toString(36) + rand(6);

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

/* ---------------- 设置 ---------------- */

function defaultSettings() {
  return {
    /** 是否允许用 ADMIN_KEY 直接作为网关密钥调用 /v1/*（便于自测） */
    allow_admin_key_as_api_key: true,
    /** 上游请求超时（毫秒，首字节） */
    request_timeout_ms: 60000,
    /** 瞬时错误（429/5xx/网络异常）在同一 Key 上的额外重试次数 */
    retries: 1,
    /** 请求日志保留天数（供「清理日志」使用） */
    log_retention_days: 30,
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
  s.log_retention_days = clampInt(s.log_retention_days, 1, 3650, d.log_retention_days);
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

/** 首次访问时初始化 R2 数据结构（幂等） */
async function ensureSeed(env) {
  if (!(await env.R2.get(CHANNELS_KEY))) {
    await r2PutJson(env, CHANNELS_KEY, defaultChannels());
  }
  if (!(await env.R2.get(KEYS_KEY))) {
    await r2PutJson(env, KEYS_KEY, []);
  }
  if (!(await env.R2.get(SETTINGS_KEY))) {
    await r2PutJson(env, SETTINGS_KEY, defaultSettings());
  }
}

async function loadSettings(env) {
  return normalizeSettings(await r2GetJson(env, SETTINGS_KEY, null));
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
  const keys = await r2GetJson(env, KEYS_KEY, []);
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
    // 超时只作用于「首字节」：响应头返回后即清除定时器，不打断后续流式传输
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
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
 *  onUsage 可选回调：流结束时返回 {prompt_tokens, completion_tokens, total_tokens}，
 *  从 message_start / message_delta 事件中提取；拿不到则为 null */
function anthropicStreamToOpenAI(upstreamBody, model, onUsage = () => {}) {
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

  const settleUsage = (u) => {
    if (usageSettled) return;
    usageSettled = true;
    try {
      onUsage(u);
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
    }
    // ping / content_block_stop 等事件无需转发
  };

  const transform = new TransformStream({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
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
          : null
      );
    },
  });

  upstreamBody.pipeTo(transform.writable).then(
    () => {},
    () => settleUsage(null)
  );
  return transform.readable;
}

/**
 * 监听 OpenAI SSE 流并提取最后的 usage 数据（需上游支持 stream_options.include_usage，
 * 上游会在 [DONE] 前发送一个只带 usage 的 chunk）。
 * 数据原样透传给客户端，不影响流式体验；流结束（或中断）时通过 onUsage 回调返回
 * {prompt_tokens, completion_tokens, total_tokens}，拿不到则为 null。
 */
function tapOpenAISSEUsage(upstreamBody, onUsage) {
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let settled = false;
  const done = (u) => {
    if (settled) return;
    settled = true;
    try {
      onUsage(u);
    } catch {
      // 忽略
    }
  };

  const transform = new TransformStream({
    transform(bytes, controller) {
      controller.enqueue(bytes);
      buffer += decoder.decode(bytes, { stream: true }).replace(/\r\n?/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let data = '';
        for (const line of raw.split('\n')) {
          const t = line.trim();
          if (t.startsWith('data:')) data += t.slice(5).trim();
        }
        if (!data || data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          if (obj && obj.usage && typeof obj.usage.total_tokens === 'number') {
            usage = obj.usage;
          }
        } catch {
          // 忽略无法解析的事件
        }
      }
    },
    flush() {
      done(usage);
    },
  });

  upstreamBody.pipeTo(transform.writable).then(
    () => {},
    () => done(usage)
  );
  return transform.readable;
}

/* ---------------- 上游转发 ---------------- */

function upstreamHeaders(channel, base) {
  const extra = channel.headers && typeof channel.headers === 'object' ? channel.headers : {};
  return { ...base, ...extra };
}

async function forwardOpenAI(channel, apiKey, path, payload, settings) {
  const url = channel.base_url.replace(/\/+$/, '') + path;
  const body = { ...payload };
  // model_map：网关模型名 -> 渠道侧真实模型名
  if (body.model && channel.model_map && channel.model_map[body.model]) {
    body.model = channel.model_map[body.model];
  }
  // 流式请求尝试索取 usage（用于精确统计 token）；上游不支持该参数时自动降级重试
  const wantUsage = body.stream && path === '/v1/chat/completions';
  if (wantUsage) {
    body.stream_options = { ...(body.stream_options || {}), include_usage: true };
  }
  const timeout =
    channel.timeout_ms || (settings && settings.request_timeout_ms) || 60000;
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
  if (wantUsage && res.status === 400) {
    const fallback = { ...body };
    delete fallback.stream_options;
    const retry = await doFetch(fallback);
    if (retry.ok) {
      res = retry;
    } else {
      try {
        await retry.body.cancel();
      } catch {
        // 忽略
      }
    }
  }
  return { res, translated: false };
}

async function forwardAnthropic(channel, apiKey, payload, settings) {
  const url = channel.base_url.replace(/\/+$/, '') + '/v1/messages';
  const timeout =
    channel.timeout_ms || (settings && settings.request_timeout_ms) || 60000;
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
async function logUsage(env, entry) {
  try {
    const day = todayStr();
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

/** 按天聚合统计（尽力而为：并发写可能轻微丢失计数，用于仪表盘展示足够） */
async function bumpStats(env, entry) {
  try {
    const date = todayStr();
    const key = STATS_PREFIX + date + '.json';
    const s = (await r2GetJson(env, key, null)) || emptyDaily(date);
    s.requests = (s.requests || 0) + 1;
    if (entry.ok) s.ok = (s.ok || 0) + 1;
    else s.failed = (s.failed || 0) + 1;
    s.tokens = (s.tokens || 0) + (entry.tokens || 0);
    s.cost = round8((s.cost || 0) + (entry.cost || 0));
    if (entry.stream) s.streams = (s.streams || 0) + 1;
    s.latency_sum = (s.latency_sum || 0) + (entry.ms || 0);
    s.latency_n = (s.latency_n || 0) + 1;
    s.models = s.models || {};
    s.channels = s.channels || {};
    s.keys = s.keys || {};
    s.hours = s.hours || {};
    bumpBucket(s.models, entry.model, entry);
    bumpBucket(s.channels, entry.channel, entry);
    bumpBucket(s.keys, entry.key_name, entry);
    const hour = String(new Date().getHours());
    s.hours[hour] = (s.hours[hour] || 0) + 1;
    await r2PutJson(env, key, s);
  } catch {
    // 统计失败不影响主流程
  }
}

/** 累加 Key 的用量与费用 */
async function bumpKeyUsage(env, auth, tokens, cost) {
  if (!auth || auth.admin || !auth.record) return;
  try {
    const keys = await r2GetJson(env, KEYS_KEY, []);
    const rec = keys.find((k) => k.key === auth.record.key);
    if (rec) {
      rec.used_tokens = (rec.used_tokens || 0) + (tokens || 0);
      rec.requests = (rec.requests || 0) + 1;
      rec.used_cost = round8((rec.used_cost || 0) + (cost || 0));
      rec.last_used_at = nowIso();
      await r2PutJson(env, KEYS_KEY, keys);
    }
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
        tokens,
        cost,
        ms: o.ms,
        retries: o.retries || 0,
        usage_missing: !!o.stream && !o.usage,
        error: o.error,
      });
      await bumpStats(env, {
        model: o.model,
        channel: o.channel,
        key_name: o.auth && o.auth.name,
        ok: o.ok,
        stream: !!o.stream,
        tokens,
        cost,
        ms: o.ms,
      });
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

  const channels = await r2GetJson(env, CHANNELS_KEY, []);
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
          const { res: upstream, translated } = await forwardOnce(
            ch,
            apiKey,
            path,
            body,
            settings
          );
          if (!upstream.ok) {
            const text = await upstream.text().catch(() => '');
            failures.push(
              `${ch.name}${tag}: HTTP ${upstream.status} ${text.slice(0, 200)}`
            );
            if (attempt < retries && isRetryableStatus(upstream.status)) {
              await sleep(200 * (attempt + 1));
              continue;
            }
            break; // 换下一个 Key
          }

          // 流式请求：OpenAI 渠道透传 SSE 并解析 usage，Anthropic 渠道翻译为 OpenAI 格式 SSE 并提取 usage
          if (body.stream) {
            let resolveUsage;
            const usagePromise = new Promise((r) => {
              resolveUsage = r;
            });
            const streamBody = translated
              ? anthropicStreamToOpenAI(upstream.body, body.model, (u) => resolveUsage(u))
              : tapOpenAISSEUsage(upstream.body, (u) => resolveUsage(u));
            ctx.waitUntil(
              usagePromise
                .then((usage) =>
                  recordRequest(env, ctx, {
                    auth,
                    settings,
                    request_id: requestId,
                    model: body.model,
                    channel: ch.name,
                    ok: true,
                    stream: true,
                    usage,
                    ms: Date.now() - started,
                    retries: attempt,
                  })
                )
                .catch(() => {})
            );
            return new Response(streamBody, {
              status: upstream.status,
              headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'X-Request-Id': requestId,
                ...CORS,
              },
            });
          }

          // 非流式：Anthropic 响应翻译为 OpenAI 格式（含 usage，可正常计费）
          const data = translated
            ? anthropicToOpenAI(await upstream.json(), body.model)
            : await upstream.json();
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
    retries: d.retries || 0,
    error: d.error ? String(d.error).slice(0, 300) : '',
  };
}

function matchLog(l, f) {
  if (f.ok === 'ok' && !l.ok) return false;
  if (f.ok === 'fail' && l.ok) return false;
  if (f.stream === '1' && !l.stream) return false;
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
async function loadStats(env, days) {
  const n = clampInt(days, 1, 90, 14);
  const dates = [];
  const base = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    dates.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
  }
  const totals = {
    requests: 0,
    ok: 0,
    failed: 0,
    tokens: 0,
    cost: 0,
    streams: 0,
    latency_sum: 0,
    latency_n: 0,
  };
  const models = {};
  const channels = {};
  const keys = {};
  const dayList = [];

  for (const date of dates) {
    const s = (await r2GetJson(env, STATS_PREFIX + date + '.json', null)) || emptyDaily(date);
    dayList.push({
      date,
      requests: s.requests || 0,
      ok: s.ok || 0,
      failed: s.failed || 0,
      tokens: s.tokens || 0,
      cost: s.cost || 0,
      streams: s.streams || 0,
      avg_ms: s.latency_n ? Math.round(s.latency_sum / s.latency_n) : 0,
      hours: s.hours || {},
    });
    totals.requests += s.requests || 0;
    totals.ok += s.ok || 0;
    totals.failed += s.failed || 0;
    totals.tokens += s.tokens || 0;
    totals.cost = round8(totals.cost + (s.cost || 0));
    totals.streams += s.streams || 0;
    totals.latency_sum += s.latency_sum || 0;
    totals.latency_n += s.latency_n || 0;
    mergeBuckets(models, s.models);
    mergeBuckets(channels, s.channels);
    mergeBuckets(keys, s.keys);
  }

  return {
    days: dayList,
    totals: {
      requests: totals.requests,
      ok: totals.ok,
      failed: totals.failed,
      tokens: totals.tokens,
      cost: totals.cost,
      streams: totals.streams,
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

/** 删除某个前缀下的全部对象（分页遍历） */
async function deletePrefix(env, prefix) {
  let deleted = 0;
  let cursor;
  do {
    const listed = await env.R2.list({ prefix, limit: 200, cursor });
    const keys = listed.objects.map((o) => o.key);
    for (const k of keys) {
      try {
        await env.R2.delete(k);
        deleted++;
      } catch {
        // 忽略单个删除失败
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
        const text = await upstream.text().catch(() => '');
        results.push({
          index: i + 1,
          ok: false,
          ms,
          http_status: upstream.status,
          error: text.slice(0, 300) || `HTTP ${upstream.status}`,
        });
        continue;
      }
      const data = await upstream.json().catch(() => null);
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

/** 记录渠道健康状态到渠道配置（best-effort） */
async function saveChannelHealth(env, channelId, health) {
  try {
    const channels = await r2GetJson(env, CHANNELS_KEY, []);
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx < 0) return;
    channels[idx].health = { ...health, checked_at: nowIso() };
    await r2PutJson(env, CHANNELS_KEY, channels);
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
    await r2PutJson(env, CHANNELS_KEY, body.channels);
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
    await r2PutJson(env, KEYS_KEY, body.keys);
    return json({ ok: true });
  }

  /* ---- 统计 ---- */
  if (path === '/api/admin/stats' && request.method === 'GET') {
    const days = url.searchParams.get('days') || 14;
    return json(await loadStats(env, days));
  }

  /* ---- 日志 ---- */
  if (path === '/api/admin/logs/dates' && request.method === 'GET') {
    return json({ dates: await listLogDates(env, 60), today: todayStr() });
  }
  if (path === '/api/admin/logs/summary' && request.method === 'GET') {
    const date = url.searchParams.get('date') || todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('日期格式应为 YYYY-MM-DD', 400, 'bad_date');
    const out = await listLogs(env, date, {
      limit: url.searchParams.get('limit') || 50,
      cursor: url.searchParams.get('cursor') || undefined,
      ok: url.searchParams.get('ok') || '',
      stream: url.searchParams.get('stream') || '',
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
    const cutoff = new Date(Date.now() - keep * 86400000).toISOString().slice(0, 10);
    const dates = await listLogDates(env, 0);
    const victims = dates.filter((d) => d < cutoff);
    let removed = 0;
    for (const d of victims) {
      removed += await deletePrefix(env, `${LOG_PREFIX}${d}/`);
      await env.R2.delete(STATS_PREFIX + d + '.json').catch(() => {});
    }
    return json({ ok: true, keep_days: keep, cutoff, removed_dates: victims.length, removed_logs: removed });
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
          const text = await res.text().catch(() => '');
          attempts.push({ channel: ch.name, ok: false, http_status: res.status, error: text.slice(0, 200) });
          continue;
        }
        const data = translated ? anthropicToOpenAI(await res.json(), model) : await res.json();
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
      const channels = await r2GetJson(env, CHANNELS_KEY, []);
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
  usageCost,
  normalizeSettings,
  pickChannels,
  channelKeys,
};
