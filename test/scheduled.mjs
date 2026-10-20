/**
 * 集成回归（第三批）：定时任务闭环 + 下游错误脱敏。
 * 运行：node test/scheduled.mjs
 * 用内存版 FakeR2 + 假 fetch（上游 / Telegram）驱动真实的 fetch / scheduled 入口，
 * 不连任何外部服务。
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

let upstreamMode = 'fail';
const calls = { upstream: 0, telegram: [] };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('api.telegram.org')) {
    calls.telegram.push(u);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (u.startsWith('https://up.example')) {
    calls.upstream++;
    if (upstreamMode === 'fail') {
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
      api_key: 'sk-up-1',
      models: ['m1'],
      priority: 1,
      weight: 1,
    },
  ])
);
await r2.put('data/keys.json', '[]');

/* ---------------- 1) 下游脱敏：502 只给笼统文案 + request_id，详情只进日志 ---------------- */
{
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
  const logKey = [...r2.map.keys()].find((k) => k.startsWith('logs/'));
  assert.ok(logKey, '应产生请求日志');
  const entry = JSON.parse(r2.map.get(logKey));
  assert.ok(
    String(entry.error || '').includes('internal-upstream-detail-xyz'),
    '管理日志里应保留完整上游错误详情'
  );
  console.log('ok 1) 下游已脱敏（无渠道名/无上游原文），详情保留在管理日志');
}

/* ---------------- 2) 定时任务首跑：巡检 + 每日清理 + 异常率告警 + 状态落盘 ---------------- */
{
  await r2.put(`logs/${oldDate}/111-a.json`, '{}');
  await r2.put(`data/stats/${oldDate}.json`, '{}');
  await r2.put(`logs/${today}/111-b.json`, '{}');
  await r2.put(
    `data/stats/${today}.json`,
    JSON.stringify({ date: today, streams: 30, streams_aborted: 15 })
  );
  upstreamMode = 'ok';
  calls.upstream = 0;
  calls.telegram = [];
  await handler.scheduled({}, env, ctx);
  await drain();

  assert.ok(calls.upstream >= 1, '巡检应真实调用上游');
  assert.equal(calls.telegram.length, 1, '异常率告警应发一条 Telegram');
  const state = JSON.parse(r2.map.get('data/cron-state.json'));
  assert.ok(state.last_patrol_at > 0, '巡检时间应落盘');
  assert.equal(state.last_cleanup_date, today, '清理日期应落盘');
  assert.ok(state.last_stream_alert_at > 0, '告警时间应落盘');
  assert.ok(!r2.map.has(`logs/${oldDate}/111-a.json`), '过期日志应被清理');
  assert.ok(!r2.map.has(`data/stats/${oldDate}.json`), '过期统计应被清理');
  assert.ok(r2.map.has(`logs/${today}/111-b.json`), '当天日志不应被清');
  assert.ok(r2.map.has(`backup/${today}.json`), '当天备份应存在');
  const channels = JSON.parse(r2.map.get('data/channels.json'));
  assert.equal(channels[0].health && channels[0].health.ok, true, '巡检健康结果应写回渠道');
  console.log('ok 2) 定时首跑：巡检/清理/异常率告警/状态落盘 全部完成');
}

/* ---------------- 3) 紧接着再跑一次：巡检与告警都应被节流跳过 ---------------- */
{
  calls.upstream = 0;
  calls.telegram = [];
  const stateBefore = JSON.parse(r2.map.get('data/cron-state.json'));
  await handler.scheduled({}, env, ctx);
  await drain();
  assert.equal(calls.upstream, 0, '间隔未到不应重复巡检');
  assert.equal(calls.telegram.length, 0, '冷却期内不应重复告警');
  const stateAfter = JSON.parse(r2.map.get('data/cron-state.json'));
  assert.equal(stateAfter.last_patrol_at, stateBefore.last_patrol_at, '巡检时间不应变化');
  console.log('ok 3) 节流生效：巡检间隔与告警冷却都在起作用');
}

console.log('scheduled: all passed');
