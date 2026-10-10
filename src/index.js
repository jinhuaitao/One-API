/**
 * oneapi-gateway — One-API 风格的 AI 网关 (Cloudflare Workers + R2)
 *
 * 功能：
 *  - OpenAI 兼容接口：GET /v1/models
 *                     POST /v1/chat/completions（支持 stream 流式透传）
 *                     POST /v1/completions
 *                     POST /v1/embeddings
 *  - 渠道类型：openai（OpenAI 兼容接口）与 anthropic（Anthropic 原生 /v1/messages，
 *    网关自动做 OpenAI↔Anthropic 格式互转，调用方始终用 OpenAI 格式）
 *  - 多渠道 + 按模型路由 + 按优先级故障转移
 *  - 渠道配置 / API Key / 请求日志全部存放在 R2 中（data/*.json、logs/）
 *  - 自带中文管理后台：GET /admin（需 ADMIN_KEY）
 *
 * 环境变量 / 绑定：
 *  - R2        : r2_buckets 绑定（wrangler.toml），bucket 由构建脚本自动创建
 *  - ADMIN_KEY : 管理员密钥，请设为 Secret（管理后台 + 管理 API 鉴权）
 */

import { ADMIN_HTML } from './admin-ui.js';

const VERSION = '1.0.0';
const CHANNELS_KEY = 'data/channels.json';
const KEYS_KEY = 'data/keys.json';
const LOG_PREFIX = 'logs/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS,
      ...extra,
    },
  });

const err = (message, status = 400, code = 'error') =>
  json({ error: { message, code } }, status);

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
      enabled: false,
      priority: 100,
    },
    {
      id: 'demo-anthropic',
      name: '示例渠道-Anthropic（未启用）',
      type: 'anthropic',
      base_url: 'https://api.anthropic.com',
      api_key: '',
      models: ['claude-sonnet-4-5'],
      model_map: {},
      default_max_tokens: 4096,
      enabled: false,
      priority: 100,
    },
  ];
}

/** 首次访问时初始化 R2 数据结构 */
async function ensureSeed(env) {
  if (!(await env.R2.get(CHANNELS_KEY))) {
    await r2PutJson(env, CHANNELS_KEY, defaultChannels());
  }
  if (!(await env.R2.get(KEYS_KEY))) {
    await r2PutJson(env, KEYS_KEY, []);
  }
}

/* ---------------- 鉴权 ---------------- */

function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** 网关 API Key 鉴权（/v1/*） */
async function authApiKey(env, request) {
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
    return { ok: true, admin: true, name: 'admin', record: null };
  }
  const keys = await r2GetJson(env, KEYS_KEY, []);
  const rec = keys.find((k) => k.key === token && k.enabled !== false);
  if (!rec) {
    return { ok: false, res: err('无效的 API Key', 401, 'invalid_key') };
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

/* ---------------- 渠道路由与转发 ---------------- */

/** 按模型挑选可用渠道（优先级数字越小越优先）
 *  Anthropic 原生渠道仅支持 /v1/chat/completions（OpenAI 侧接口名） */
function pickChannels(channels, model, path) {
  return (channels || [])
    .filter((c) => {
      if (!c.enabled || !c.api_key || !c.base_url) return false;
      const models = c.models || [];
      if (!models.includes('*') && !models.includes(model)) return false;
      if ((c.type || 'openai') === 'anthropic' && path !== '/v1/chat/completions')
        return false;
      return true;
    })
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
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

/** Anthropic SSE → OpenAI SSE（流式翻译） */
function anthropicStreamToOpenAI(upstreamBody, model) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const created = Math.floor(Date.now() / 1000);
  let msgId = 'chatcmpl-' + Math.random().toString(36).slice(2);
  let buffer = '';
  let stopReason = null;
  const toolIndexByBlock = {};
  let toolCounter = 0;

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
    },
  });

  upstreamBody.pipeTo(transform.writable).catch(() => {});
  return transform.readable;
}

async function forwardOpenAI(channel, path, payload) {
  const url = channel.base_url.replace(/\/+$/, '') + path;
  const body = { ...payload };
  // model_map：网关模型名 -> 渠道侧真实模型名
  if (body.model && channel.model_map && channel.model_map[body.model]) {
    body.model = channel.model_map[body.model];
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channel.api_key}`,
    },
    body: JSON.stringify(body),
  });
  return { res, translated: false };
}

async function forwardAnthropic(channel, payload) {
  const url = channel.base_url.replace(/\/+$/, '') + '/v1/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': channel.api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(openaiToAnthropic(payload, channel)),
  });
  return { res, translated: true };
}

/** 按渠道类型分发：openai 走 OpenAI 兼容接口，anthropic 走原生 /v1/messages 并翻译格式 */
async function forwardOnce(channel, path, payload) {
  if ((channel.type || 'openai') === 'anthropic') {
    return forwardAnthropic(channel, payload);
  }
  return forwardOpenAI(channel, path, payload);
}

/** 记录请求日志到 R2（异步，不阻塞响应） */
async function logUsage(env, entry) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `${LOG_PREFIX}${day}/${Date.now()}-${rand}.json`;
    const { auth, ...rest } = entry;
    await env.R2.put(
      key,
      JSON.stringify({
        ts: new Date().toISOString(),
        key_name: auth?.name,
        is_admin: !!auth?.admin,
        ...rest,
      })
    );
  } catch {
    // 日志失败不影响主流程
  }
}

/** 累加 Key 的用量（非流式请求可拿到 usage） */
async function bumpKeyUsage(env, auth, tokens) {
  if (!auth || auth.admin || !auth.record) return;
  try {
    const keys = await r2GetJson(env, KEYS_KEY, []);
    const rec = keys.find((k) => k.key === auth.record.key);
    if (rec) {
      rec.used_tokens = (rec.used_tokens || 0) + (tokens || 0);
      rec.requests = (rec.requests || 0) + 1;
      await r2PutJson(env, KEYS_KEY, keys);
    }
  } catch {
    // 用量统计失败不影响主流程
  }
}

async function handleProxy(env, ctx, request, path, auth) {
  let body;
  try {
    body = await request.json();
  } catch {
    return err('请求体必须是合法 JSON', 400, 'invalid_json');
  }
  if (!body.model) return err('缺少 model 参数', 400, 'missing_model');

  const channels = await r2GetJson(env, CHANNELS_KEY, []);
  const candidates = pickChannels(channels, body.model, path);
  if (candidates.length === 0) {
    return err(`没有可用渠道支持模型 ${body.model}`, 503, 'no_channel');
  }

  const started = Date.now();
  const failures = [];

  for (const ch of candidates) {
    try {
      const { res: upstream, translated } = await forwardOnce(ch, path, body);
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        failures.push(`${ch.name}: HTTP ${upstream.status} ${text.slice(0, 200)}`);
        continue;
      }
      // 流式请求：OpenAI 渠道直接透传 SSE，Anthropic 渠道翻译为 OpenAI 格式 SSE
      if (body.stream) {
        ctx.waitUntil(
          logUsage(env, {
            auth,
            model: body.model,
            channel: ch.name,
            ok: true,
            stream: true,
            ms: Date.now() - started,
          })
        );
        const streamBody = translated
          ? anthropicStreamToOpenAI(upstream.body, body.model)
          : upstream.body;
        return new Response(streamBody, {
          status: upstream.status,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...CORS,
          },
        });
      }
      // 非流式：Anthropic 响应翻译为 OpenAI 格式（含 usage，可正常计费）
      const data = translated
        ? anthropicToOpenAI(await upstream.json(), body.model)
        : await upstream.json();
      const tokens = data?.usage?.total_tokens || 0;
      ctx.waitUntil(
        Promise.all([
          logUsage(env, {
            auth,
            model: body.model,
            channel: ch.name,
            ok: true,
            tokens,
            ms: Date.now() - started,
          }),
          bumpKeyUsage(env, auth, tokens),
        ])
      );
      return json(data);
    } catch (e) {
      failures.push(`${ch.name}: ${e.message || e}`);
    }
  }

  ctx.waitUntil(
    logUsage(env, {
      auth,
      model: body.model,
      channel: null,
      ok: false,
      ms: Date.now() - started,
      error: failures.join(' | ').slice(0, 500),
    })
  );
  return err(
    `所有渠道均失败: ${failures.join(' | ').slice(0, 500)}`,
    502,
    'upstream_failed'
  );
}

/* ---------------- 管理 API ---------------- */

async function handleAdmin(env, request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const gate = requireAdmin(env, request);
  if (!gate.ok) return gate.res;

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
  if (path === '/api/admin/logs' && request.method === 'GET') {
    const date =
      url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const listed = await env.R2.list({
      prefix: `${LOG_PREFIX}${date}/`,
      limit: 100,
    });
    return json({
      date,
      truncated: listed.truncated,
      keys: listed.objects.map((o) => o.key).reverse(),
    });
  }
  if (path === '/api/admin/log' && request.method === 'GET') {
    const key = url.searchParams.get('key') || '';
    if (!key.startsWith(LOG_PREFIX)) return err('非法 key', 400, 'bad_key');
    const obj = await env.R2.get(key);
    if (!obj) return err('日志不存在', 404, 'not_found');
    return json(await obj.json());
  }
  // 按天聚合日志摘要（后台「请求日志」页用，避免前端逐条拉取）
  if (path === '/api/admin/logs/summary' && request.method === 'GET') {
    const date =
      url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const listed = await env.R2.list({
      prefix: `${LOG_PREFIX}${date}/`,
      limit: 100,
    });
    const keys = listed.objects.map((o) => o.key).reverse();
    const logs = [];
    for (let i = 0; i < keys.length; i += 20) {
      const results = await Promise.all(
        keys.slice(i, i + 20).map(async (k) => {
          try {
            const o = await env.R2.get(k);
            if (!o) return null;
            const d = await o.json();
            return {
              key: k,
              ts: d.ts,
              key_name: d.key_name,
              model: d.model,
              channel: d.channel,
              ok: d.ok,
              tokens: d.tokens || 0,
              ms: d.ms || 0,
              stream: !!d.stream,
              error: d.error ? String(d.error).slice(0, 120) : '',
            };
          } catch {
            return null;
          }
        })
      );
      for (const r of results) if (r) logs.push(r);
    }
    return json({ date, truncated: listed.truncated, logs });
  }
  // 测试单个渠道：发一条最小请求，返回延迟与结果摘要
  if (path === '/api/admin/test-channel' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const channels = await r2GetJson(env, CHANNELS_KEY, []);
    const ch = channels.find((c) => c.id === (body && body.id));
    if (!ch) return err('渠道不存在', 404, 'not_found');
    const model = (ch.models || []).find((m) => m !== '*') || 'test';
    const started = Date.now();
    try {
      const { res: upstream, translated } = await forwardOnce(
        ch,
        '/v1/chat/completions',
        {
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 16,
        }
      );
      const ms = Date.now() - started;
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        return json({
          ok: false,
          ms,
          http_status: upstream.status,
          error: text.slice(0, 300) || `HTTP ${upstream.status}`,
        });
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
      return json({ ok: true, ms, http_status: upstream.status, snippet });
    } catch (e) {
      return json({
        ok: false,
        ms: Date.now() - started,
        error: String(e.message || e).slice(0, 300),
      });
    }
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
      });
    }

    if (path === '/admin' && request.method === 'GET') {
      return new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS },
      });
    }

    if (path.startsWith('/api/admin/')) {
      return handleAdmin(env, request);
    }

    if (path === '/v1/models' && request.method === 'GET') {
      const auth = await authApiKey(env, request);
      if (!auth.ok) return auth.res;
      const channels = await r2GetJson(env, CHANNELS_KEY, []);
      const models = [
        ...new Set(
          channels
            .filter((c) => c.enabled)
            .flatMap((c) => c.models || [])
            .filter((m) => m !== '*')
        ),
      ];
      return json({
        object: 'list',
        data: models.map((id) => ({
          id,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'gateway',
        })),
      });
    }

    if (
      request.method === 'POST' &&
      ['/v1/chat/completions', '/v1/completions', '/v1/embeddings'].includes(
        path
      )
    ) {
      const auth = await authApiKey(env, request);
      if (!auth.ok) return auth.res;
      return handleProxy(env, ctx, request, path, auth);
    }

    return err('Not Found', 404, 'not_found');
  },
};

// 导出纯翻译函数，便于单测（wrangler 只使用 default 导出）
export { openaiToAnthropic, anthropicToOpenAI, anthropicStreamToOpenAI };
