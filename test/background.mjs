/**
 * 集成回归（第三批）：内置保活（请求触发，无 Cron）+ 下游错误脱敏。
 * 运行：node test/background.mjs
 * 用内存版 FakeR2 + 假 fetch（上游 / Telegram）驱动真实的 fetch 入口，
 * 不连任何外部服务，也不依赖 scheduled 定时入口。
 */
import assert from 'node:assert/strict';

const mod = await import('../src/index.js');
const handler = mod.default;

/* ---------------- FakeR2（实现被测代码用到的 get/put/delete/list 子集） ---------------- */
class FakeR2 {
  constructor() {
    this.map = new Map();
  }
  async get(key) {
    const v = this.map.get(key);
    if (v === undefined) return null;
    return { json: async () => JSON.parse(v), text: async () => v };
  }
  async put(key, value) {
    this.map.set(key, String(value));
  }
  async delete(key) {
    for (const k of Array.isArray(key) ? key : [key]) this.map.delete(k);
  }
  async list({ prefix = '', delimiter, limit = 1000 } = {}) {
    const keys = [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
    if (delimiter) {
      const prefs = new Set();
      const objects = [];
      for (const k of keys) {
        const rest = k.slice(prefix.length);
        const idx = rest.indexOf(delimiter);
        if (idx >= 0) prefs.add(prefix + rest.slice(0, idx + 1));
        else objects.push({ key: k });
      }
      return { objects, delimitedPrefixes: [...prefs].sort(), truncated: false };
    }
    return { objects: keys.slice(0, limit).map((key) => ({ key })), truncated: false };
  }
}

/* ---------------- 假运行环境 ---------------- */
const r2 = new FakeR2();
const env = { R2: r2, ADMIN_KEY: 'adm-secret' };
const ctx = {
  promises: [],
  waitUntil(p) {
    this.promises.push(Promise.resolve(p).catch(() => {}));
  },
};
async function drain() {
  while (ctx.promises.length) {
    const ps = ctx.promises.splice(0);
    await Promise.all(ps);
  }
}

let upstreamMode = 'ok';
const calls = { upstream: 0, telegram: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('api.telegram.org')) {
    calls.telegram.push(u);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (u.startsWith('https://up.example')) {
    calls.upstream++;
    const body = String((init && init.body) || '');
    // 保活/巡检发的是真实小请求（content: ping），与普通调用区分开
    if (!body.includes('"content":"ping"') && upstreamMode === 'fail') {
      return new Response('internal-upstream-detail-xyz', { status: 500 });
    }
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-x',
        model: 'm1',
        choices: [{ message: { role: 'assistant', content: 'pong' } }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error('unexpected fetch: ' + u);
};

const dayStr = (ts) => new Date(ts + 480 * 60000).toISOString().slice(0, 10);
const today = dayStr(Date.now());
const oldDate = dayStr(Date.now() - 40 * 86400000);

await r2.put(
  'data/settings.json',
  JSON.stringify({
    tg_bot_token: 'tok123',
    tg_chat_id: '999',
    tg_notify_down: true,
    tg_notify_up: false,
    patrol_interval_min: 30,
    log_retention_days: 30,
    backup_keep_days: 7,
    timezone_offset_minutes: 480,
    allow_admin_key_as_api_key: true,
  })
);
await r2.put(
  'data/channels.json',
  JSON.stringify([
    {
      id: 'c1',
      name: '主渠道',
      enabled: true,
      type: 'openai',
      base_url: 'https://up.example',
      api_key: 'sk-up-1,sk-up-2',
      models: ['m1'],
      priority: 1,
      weight: 1,
    },
  ])
);
await r2.put('data/keys.json', '[]');
await r2.put(`logs/${oldDate}/111-a.json`, '{}');
await r2.put(`data/stats/${oldDate}.json`, '{}');
await r2.put(`logs/${today}/111-b.json`, '{}');
await r2.put(
  `data/stats/${today}.json`,
  JSON.stringify({ date: today, streams: 30, streams_aborted: 15 })
);

/* ---------------- 1) 普通 /healthz 请求触发内置保活（无 scheduled 入口） ---------------- */
{
  mod.resetBackgroundThrottle();
  calls.upstream = 0;
  calls.telegram = [];
  const res = await handler.fetch(new Request('https://gw.example/healthz'), env, ctx);
  assert.equal(res.status, 200, '/healthz 应正常返回');
  await drain();

  assert.equal(typeof handler.scheduled, 'undefined', '不应再依赖 scheduled 定时入口');
  assert.equal(calls.upstream, 2, '请求应触发渠道保活，两个 Key 各调用一次上游');
  assert.equal(calls.telegram.length, 1, '异常率告警应发一条 Telegram');
  const state = JSON.parse(r2.map.get('data/cron-state.json'));
  assert.ok(state.last_patrol_at > 0, '保活时间应落盘');
  assert.equal(state.last_cleanup_date, today, '清理日期应落盘');
  assert.ok(state.last_stream_check_at > 0, '异常率检查时间应落盘');
  assert.ok(state.last_stream_alert_at > 0, '告警时间应落盘');
  assert.ok(!r2.map.has(`logs/${oldDate}/111-a.json`), '过期日志应被清理');
  assert.ok(!r2.map.has(`data/stats/${oldDate}.json`), '过期统计应被清理');
  assert.ok(r2.map.has(`logs/${today}/111-b.json`), '当天日志不应被清');
  assert.ok(r2.map.has(`backup/${today}.json`), '当天备份应存在');
  const channels = JSON.parse(r2.map.get('data/channels.json'));
  assert.equal(channels[0].health && channels[0].health.ok, true, '保活健康结果应写回渠道');
  console.log('ok 1) /healthz 触发内置保活：渠道保活/清理/告警/备份完成，且无 scheduled');
}

/* ---------------- 2) 紧接请求：实例节流；清掉节流后仍受状态间隔节流 ---------------- */
{
  calls.upstream = 0;
  calls.telegram = [];
  const stateBefore = JSON.parse(r2.map.get('data/cron-state.json'));
  await handler.fetch(new Request('https://gw.example/healthz'), env, ctx);
  await drain();
  assert.equal(calls.upstream, 0, '30 秒内不应重复做后台检查');
  assert.equal(calls.telegram.length, 0, '冷却期内不应重复告警');

  // 模拟另一个 isolate：清掉实例内存节流，后台会再跑，但 R2 里的状态间隔仍生效
  mod.resetBackgroundThrottle();
  await handler.fetch(new Request('https://gw.example/healthz'), env, ctx);
  await drain();
  assert.equal(calls.upstream, 0, '保活间隔未到不应重复调用上游');
  assert.equal(calls.telegram.length, 0, '异常率检查间隔未到不应重复读统计/告警');
  const stateAfter = JSON.parse(r2.map.get('data/cron-state.json'));
  assert.equal(stateAfter.last_patrol_at, stateBefore.last_patrol_at, '保活时间不应变化');
  console.log('ok 2) 双层节流生效：实例节流 + R2 状态间隔');
}

/* ---------------- 3) 下游脱敏：502 只给笼统文案 + request_id，详情只进日志 ---------------- */
{
  upstreamMode = 'fail';
  const res = await handler.fetch(
    new Request('https://gw.example/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer adm-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'm1', messages: [{ role: 'user', content: 'hi' }] }),
    }),
    env,
    ctx
  );
  await drain();
  const body = await res.text();
  assert.equal(res.status, 502);
  assert.ok(!body.includes('internal-upstream-detail-xyz'), '下游不应看到上游错误原文');
  assert.ok(!body.includes('主渠道'), '下游不应看到渠道名');
  assert.ok(body.includes('request_id'), '下游应拿到 request_id 以便对账');
  const entry = [...r2.map.entries()]
    .filter(([k]) => k.startsWith('logs/'))
    .map(([, v]) => JSON.parse(v))
    .find((e) => String(e.error || '').includes('internal-upstream-detail-xyz'));
  assert.ok(entry, '管理日志里应保留完整上游错误详情');
  console.log('ok 3) 下游已脱敏（无渠道名/无上游原文），详情保留在管理日志');
}

console.log('background: all passed');
