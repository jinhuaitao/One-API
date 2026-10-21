/**
 * 集成回归：套餐体系（管理员 CRUD / 用户申请 / 审核生效 / 配额·有效期·RPM·模型限制 / 备份恢复）。
 * 运行：node test/plans.mjs
 * 用内存版 FakeR2 + 假上游驱动真实 fetch 入口，不连任何外部服务。
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

let upstreamTokens = 10;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://up.example')) {
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-plan',
        object: 'chat.completion',
        model: 'm1',
        choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: Math.max(0, upstreamTokens - 1), total_tokens: upstreamTokens },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error('unexpected fetch: ' + u);
};

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

/* ---------------- 请求助手 ---------------- */
async function call(path, { method = 'GET', token, adminKey, body } = {}) {
  const headers = {};
  if (token) headers['X-Session-Token'] = token;
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await handler.fetch(
    new Request('https://gw.example' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    ctx
  );
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 非 JSON 响应保持 null
  }
  await drain();
  return { status: res.status, data, text, res };
}

async function chat(apiKey, model = 'm1') {
  const res = await handler.fetch(
    new Request('https://gw.example/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }),
    }),
    env,
    ctx
  );
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 忽略
  }
  await drain();
  return { status: res.status, data, text };
}

async function apiGet(path, apiKey) {
  const res = await handler.fetch(
    new Request('https://gw.example' + path, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + apiKey },
    }),
    env,
    ctx
  );
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 忽略
  }
  await drain();
  return { status: res.status, data, text };
}

const ADMIN_PW = 'admin-pass-123';
const ALICE_PW = 'alice-pass-1';
const BOB_PW = 'bob-pass-123';
const CHARLIE_PW = 'charlie-pass-1';

let adminToken = '';
let aliceToken = '';
let aliceId = '';
let aliceKey = '';
let aliceKeyId = '';
let bobToken = '';
let bobId = '';
let bobKey = '';
let planA = '';
let planB = '';
let planC = '';

const adminPlans = () => call('/api/admin/plans', { token: adminToken });
const adminAccounts = () => call('/api/admin/accounts', { token: adminToken });
const userPlans = () => call('/api/user/plans', { token: aliceToken });

/* ---------------- 1) 初始化管理员 + 套餐 CRUD ---------------- */
{
  let r = await call('/api/auth/state');
  assert.equal(r.data.initialized, false);

  r = await call('/api/auth/setup', {
    method: 'POST',
    body: { username: 'root', password: ADMIN_PW, question: '最喜欢的颜色？', answer: '蓝色' },
  });
  assert.equal(r.status, 200, r.text);
  adminToken = r.data.token;

  r = await adminPlans();
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.plans, []);
  assert.equal(r.data.pending_count, 0);

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'create', name: '   ', quota_tokens: 10 },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'bad_name');

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: {
      action: 'create',
      name: '入门包',
      description: '适合个人开发者',
      price: 9.9,
      quota_tokens: 50,
      duration_days: 30,
      rpm: 0,
      allowed_models: ['m1', 'm1', '  '],
    },
  });
  assert.equal(r.status, 200, r.text);
  planA = r.data.plan.id;
  assert.equal(r.data.plan.quota_tokens, 50);
  assert.equal(r.data.plan.price, 9.9);
  assert.equal(r.data.plan.duration_days, 30);
  assert.deepEqual(r.data.plan.allowed_models, ['m1'], '模型白名单应去重去空');
  assert.equal(r.data.plan.enabled, true);

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: {
      action: 'create',
      name: '体验包',
      price: 0,
      quota_tokens: 1000,
      duration_days: 0,
      allowed_models: [],
    },
  });
  assert.equal(r.status, 200, r.text);
  planB = r.data.plan.id;
  assert.equal(r.data.plan.duration_days, 0, '有效期 0 表示长期有效');

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'create', name: '周卡', price: 5, quota_tokens: 30, duration_days: 7 },
  });
  assert.equal(r.status, 200, r.text);
  planC = r.data.plan.id;

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: planA, name: '' },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'bad_name');

  r = await adminPlans();
  assert.equal(r.data.plans.length, 3);
  assert.equal(r.data.plans.filter((p) => p.enabled).length, 3);
  console.log('ok 1) 套餐 CRUD：名称校验、模型去重、有效期 0 长期有效');
}

/* ---------------- 2) 用户申请 → 管理员审核 → 条款快照生效 ---------------- */
let aliceReqA = '';
{
  let r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { allow_registration: true, custom_models: ['m2'] },
  });
  assert.equal(r.status, 200, r.text);

  r = await call('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: ALICE_PW, question: '母亲的名字？', answer: 'Zhang San' },
  });
  assert.equal(r.status, 200, r.text);
  aliceToken = r.data.token;
  aliceId = r.data.user.id;
  assert.equal(r.data.user.plan_status, 'none');

  r = await call('/api/user/keys', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'create', name: 'alice-key' },
  });
  assert.equal(r.status, 200, r.text);
  aliceKey = r.data.key;
  aliceKeyId = r.data.record.id;

  upstreamTokens = 10;
  r = await chat(aliceKey);
  assert.equal(r.status, 200, r.text);
  r = await chat(aliceKey);
  assert.equal(r.status, 200, r.text);

  r = await call('/api/user/plans');
  assert.equal(r.status, 401, '未登录不能查看套餐');

  r = await userPlans();
  assert.equal(r.status, 200);
  assert.equal(r.data.plans.length, 3, '启用中的套餐对用户可见');
  assert.equal(r.data.account.plan_status, 'none');
  assert.equal(r.data.account.used_tokens, 20);
  assert.equal(r.data.pending, null);
  assert.deepEqual(r.data.history, []);

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: 'plan_missing' },
  });
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, 'plan_not_found');

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planA, note: '想先试用' },
  });
  assert.equal(r.status, 200, r.text);
  aliceReqA = r.data.request.id;
  assert.equal(r.data.request.status, 'pending');
  assert.equal(r.data.request.plan_name, '入门包');
  assert.equal(r.data.request.quota_tokens, 50);
  assert.equal(r.data.request.price, 9.9);
  assert.equal(r.data.request.note, '想先试用');

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planB },
  });
  assert.equal(r.status, 409, '同一时间只能有一个待审核申请');
  assert.equal(r.data.error.code, 'request_pending');

  r = await userPlans();
  assert.equal(r.data.pending.id, aliceReqA);

  r = await adminPlans();
  assert.equal(r.data.pending_count, 1);
  assert.equal(r.data.requests.find((x) => x.id === aliceReqA).username, 'alice');

  // 申请之后再改套餐：审核必须按申请时的条款快照生效
  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: planA, quota_tokens: 100, price: 12.5, description: '已调整' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.plan.quota_tokens, 100);

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'approve-request', id: aliceReqA },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.request.status, 'approved');

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'approve-request', id: aliceReqA },
  });
  assert.equal(r.status, 409, '重复审核应被拒绝');
  assert.equal(r.data.error.code, 'request_not_pending');

  r = await adminAccounts();
  assert.equal(r.status, 200);
  let row = r.data.accounts.find((a) => a.username === 'alice');
  assert.equal(row.quota_tokens, 50, '应按申请快照的配额生效');
  assert.equal(row.plan_id, planA);
  assert.equal(row.plan_name, '入门包');
  assert.equal(row.plan_price, 9.9);
  assert.equal(row.plan_allowed_models.join(','), 'm1');
  assert.ok(row.plan_expires_at, '有期限的套餐应写入到期时间');
  assert.equal(row.plan_status, 'active');

  r = await call('/api/user/keys', { token: aliceToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.keys[0].used_tokens, 0, '审核生效应开启新的计费周期并清零用量');
  assert.equal(r.data.account.plan_name, '入门包');
  assert.ok(r.data.account.plan_days_left >= 29 && r.data.account.plan_days_left <= 30);

  r = await userPlans();
  assert.equal(r.data.pending, null);
  assert.equal(r.data.history.find((x) => x.id === aliceReqA).status, 'approved');
  console.log('ok 2) 用户申请/待审互斥/审核生效、按申请快照生效、用量清零');
}

/* ---------------- 3) 套餐模型白名单（密钥 ∩ 套餐）与配额 ---------------- */
{
  let r = await apiGet('/v1/models', aliceKey);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(
    r.data.data.map((m) => m.id),
    ['m1'],
    '用户模型列表应被套餐白名单裁剪（渠道 m1 + 自定义 m2 → 仅 m1）'
  );

  r = await chat(aliceKey, 'm2');
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'model_forbidden');

  // 管理员给密钥再加一层限制：与套餐取交集后为空
  r = await call('/api/admin/keys', { token: adminToken });
  assert.equal(r.status, 200);
  const keyRecords = r.data;
  const aliceRec = keyRecords.find((k) => k.id === aliceKeyId);
  assert.ok(aliceRec, '应能取到 alice 的密钥记录');
  aliceRec.allowed_models = ['m2'];
  r = await call('/api/admin/keys', {
    method: 'POST',
    token: adminToken,
    body: { keys: keyRecords },
  });
  assert.equal(r.status, 200, r.text);

  r = await apiGet('/v1/models', aliceKey);
  assert.deepEqual(r.data.data, [], '密钥与套餐白名单交集为空时模型列表为空');
  r = await chat(aliceKey, 'm1');
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'model_forbidden');

  aliceRec.allowed_models = ['m1'];
  r = await call('/api/admin/keys', {
    method: 'POST',
    token: adminToken,
    body: { keys: keyRecords },
  });
  assert.equal(r.status, 200);

  upstreamTokens = 10;
  r = await chat(aliceKey);
  assert.equal(r.status, 200, r.text);
  upstreamTokens = 50;
  r = await chat(aliceKey);
  assert.equal(r.status, 200, '配额未用尽前应放行（累计会对齐到 60 > 50）');

  r = await chat(aliceKey);
  assert.equal(r.status, 429, '套餐配额用尽后名下密钥应被拒绝');
  assert.equal(r.data.error.code, 'account_quota_exceeded');
  upstreamTokens = 10;

  r = await call('/api/user/keys', { token: aliceToken });
  assert.equal(r.data.keys[0].used_tokens, 60);
  console.log('ok 3) 套餐模型白名单与密钥白名单取交集、套餐配额用尽拒绝');
}

/* ---------------- 4) RPM / 到期停用 / 续费 / 换套餐 / 清除套餐 ---------------- */
{
  let r = await call('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob', password: BOB_PW, question: '出生城市？', answer: 'Hangzhou' },
  });
  assert.equal(r.status, 200, r.text);
  bobToken = r.data.token;
  bobId = r.data.user.id;

  // 条款是快照：先改 C 的 RPM，再把它指派给 bob
  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: planC, rpm: 2 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.plan.rpm, 2);

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, plan_id: planC },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.usage_reset, true, '指派套餐应开启新的计费周期');
  assert.equal(r.data.account.plan_id, planC);
  assert.equal(r.data.account.plan_rpm, 2);
  assert.equal(r.data.account.quota_tokens, 30);
  assert.equal(r.data.account.plan_status, 'active');
  assert.ok(r.data.account.plan_expires_at);

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, plan_id: 'plan_missing' },
  });
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, 'plan_not_found');

  // 管理员建号即可带套餐；显式配额可覆盖套餐配额
  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: {
      action: 'create',
      username: 'charlie',
      password: CHARLIE_PW,
      plan_id: planC,
      quota_tokens: 777,
    },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.account.plan_id, planC);
  assert.equal(r.data.account.plan_name, '周卡');
  assert.equal(r.data.account.quota_tokens, 777);
  assert.ok(r.data.account.plan_expires_at);
  assert.equal(r.data.account.plan_status, 'active');

  r = await call('/api/user/keys', {
    method: 'POST',
    token: bobToken,
    body: { action: 'create', name: 'bob-key' },
  });
  assert.equal(r.status, 200, r.text);
  bobKey = r.data.key;

  upstreamTokens = 1;
  r = await chat(bobKey);
  assert.equal(r.status, 200, r.text);
  r = await chat(bobKey);
  assert.equal(r.status, 200, r.text);
  r = await chat(bobKey);
  assert.equal(r.status, 429, '套餐 RPM 用尽后应拒绝');
  assert.equal(r.data.error.code, 'rate_limited');

  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.data.keys[0].used_tokens, 2);
  assert.equal(r.data.account.plan_rpm, 2);

  // 直接改 R2 把套餐改成已过期，再用管理接口失效账号缓存
  const accDoc = JSON.parse(r2.map.get('data/accounts.json'));
  const bobRec = accDoc.find((a) => a.id === bobId);
  bobRec.plan_expires_at = new Date(Date.now() - 60000).toISOString();
  await r2.put('data/accounts.json', JSON.stringify(accDoc));

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, enabled: true },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.account.plan_status, 'expired');
  assert.equal(r.data.account.plan_days_left, 0);

  r = await chat(bobKey);
  assert.equal(r.status, 403, '套餐到期后应停止调用');
  assert.equal(r.data.error.code, 'plan_expired');

  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.data.account.plan_status, 'expired', '用户侧应看到已过期状态');

  // 续费：降低 RPM 后按同套餐续期，用量重新开始
  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: planC, rpm: 0 },
  });
  assert.equal(r.status, 200);
  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, plan_id: planC, renew_plan: true },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.usage_reset, true);
  assert.equal(r.data.account.plan_status, 'active');
  assert.equal(r.data.account.plan_rpm, 0);
  assert.ok(Date.parse(r.data.account.plan_expires_at) > Date.now());

  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.data.keys[0].used_tokens, 0, '续费应清零名下密钥用量');
  r = await chat(bobKey);
  assert.equal(r.status, 200, '续费后应恢复调用');

  // 换套餐：从此刻重新起算；体验包无限期
  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, plan_id: planB },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.usage_reset, true);
  assert.equal(r.data.account.plan_id, planB);
  assert.equal(r.data.account.plan_expires_at, '');
  assert.equal(r.data.account.quota_tokens, 1000);
  assert.equal(r.data.account.plan_status, 'active');
  r = await chat(bobKey);
  assert.equal(r.status, 200, '无到期时间的套餐不应拦截调用');

  // 清除套餐：解除限制但保留当前配额
  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, plan_id: '' },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.account.plan_id, '');
  assert.equal(r.data.account.plan_name, '');
  assert.equal(r.data.account.plan_status, 'none');
  assert.equal(r.data.account.quota_tokens, 1000, '清除套餐应保留当前配额');
  r = await chat(bobKey);
  assert.equal(r.status, 200);
  console.log('ok 4) 套餐 RPM、到期停用、续费清零、换套餐重算、建号带套餐、清除保留配额');
}

/* ---------------- 5) 取消 / 驳回 / 下架自动驳回 ---------------- */
{
  let r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planB },
  });
  assert.equal(r.status, 200, r.text);
  const reqB = r.data.request.id;

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'cancel', id: 'pr_missing' },
  });
  assert.equal(r.status, 404);

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'cancel', id: reqB },
  });
  assert.equal(r.status, 200, r.text);
  r = await userPlans();
  assert.equal(r.data.pending, null);
  assert.equal(r.data.history.find((x) => x.id === reqB).status, 'cancelled');

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planC },
  });
  assert.equal(r.status, 200, r.text);
  const reqC1 = r.data.request.id;

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'reject-request', id: reqC1, reason: '请先联系客服' },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.request.status, 'rejected');
  assert.equal(r.data.request.reject_reason, '请先联系客服');
  r = await userPlans();
  assert.equal(r.data.pending, null);
  const rejected1 = r.data.history.find((x) => x.id === reqC1);
  assert.equal(rejected1.status, 'rejected');
  assert.equal(rejected1.reject_reason, '请先联系客服');

  // 待审核期间套餐被删除 → 申请自动驳回，已生效账号保留条款快照
  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planC },
  });
  assert.equal(r.status, 200, r.text);
  const reqC2 = r.data.request.id;

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'delete', id: planC },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.rejected_requests, 1);

  r = await adminPlans();
  assert.equal(r.data.plans.length, 2, '套餐已下架');
  assert.equal(r.data.pending_count, 0);
  const autoRejected = r.data.requests.find((x) => x.id === reqC2);
  assert.equal(autoRejected.status, 'rejected');
  assert.equal(autoRejected.reject_reason, '套餐已下架');

  r = await userPlans();
  assert.equal(r.data.pending, null);
  assert.equal(r.data.history.find((x) => x.id === reqC2).reject_reason, '套餐已下架');

  r = await adminAccounts();
  const charlie = r.data.accounts.find((a) => a.username === 'charlie');
  assert.equal(charlie.plan_id, planC, '账号保留已下架套餐的条款快照');
  assert.equal(charlie.plan_name, '周卡');
  assert.equal(charlie.plan_status, 'active');

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planC },
  });
  assert.equal(r.status, 404, '下架套餐不能再申请');

  // 清理 alice 的待审记录，并下架体验包验证用户侧不可见
  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planA },
  });
  assert.equal(r.status, 200, r.text);
  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'cancel', id: r.data.request.id },
  });
  assert.equal(r.status, 200);

  r = await call('/api/admin/plans', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: planB, enabled: false },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.plan.enabled, false);

  r = await call('/api/user/plans', {
    method: 'POST',
    token: aliceToken,
    body: { action: 'request', plan_id: planB },
  });
  assert.equal(r.status, 404);
  r = await userPlans();
  assert.equal(r.data.plans.length, 1, '下架套餐不应出现在用户套餐列表');
  assert.equal(r.data.history.length, 5, '历史记录保留 5 条');
  console.log('ok 5) 取消/驳回/下架自动驳回、账号保留条款快照、下架套餐不可申请');
}

/* ---------------- 6) 备份 v3 包含套餐与申请，恢复与 v2 兼容 ---------------- */
{
  let r = await call('/api/admin/backup', { token: adminToken });
  assert.equal(r.status, 200, r.text);
  const snapshot = JSON.parse(r.text);
  assert.equal(snapshot.version, 3);
  assert.equal(snapshot.type, 'oneapi-gateway-backup');
  assert.equal(snapshot.plans.length, 2);
  assert.equal(snapshot.plans.find((p) => p.id === planA).quota_tokens, 100);
  assert.equal(snapshot.plan_requests.length, 5);
  assert.ok(
    snapshot.plan_requests.some((x) => x.status === 'rejected' && x.reject_reason === '套餐已下架'),
    '备份应包含申请审核结果'
  );
  const aliceSnap = snapshot.accounts.find((a) => a.id === aliceId);
  assert.equal(aliceSnap.plan_id, planA);
  assert.equal(aliceSnap.quota_tokens, 50, '备份应保留快照生效的套餐配额');
  assert.ok(snapshot.keys.some((k) => k.owner_id === aliceId));
  assert.ok(!r.text.includes(ADMIN_PW), '备份不应包含明文管理员密码');
  assert.ok(!r.text.includes(ALICE_PW), '备份不应包含明文用户密码');
  assert.ok(!r.text.includes(BOB_PW), '备份不应包含明文用户密码');

  r = await call('/api/admin/restore', {
    method: 'POST',
    token: adminToken,
    body: { ...snapshot, confirm: true, plans: {} },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'invalid_backup');

  r = await call('/api/admin/restore', {
    method: 'POST',
    token: adminToken,
    body: { ...snapshot, confirm: true, plan_requests: [{ id: 'pr_bad' }] },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'invalid_backup');

  r = await call('/api/admin/restore', { method: 'POST', token: adminToken, body: snapshot });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'confirm_required');

  // 恢复会清空会话，改用应急 ADMIN_KEY 执行
  r = await call('/api/admin/restore', {
    method: 'POST',
    adminKey: 'adm-secret',
    body: { ...snapshot, confirm: true },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.accounts, snapshot.accounts.length);
  assert.equal(r.data.plans, 2);
  assert.equal(r.data.plan_requests, 5);

  r = await call('/api/auth/me', { token: adminToken });
  assert.equal(r.status, 401, '恢复账号会清空全部会话');

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'root', password: ADMIN_PW } });
  assert.equal(r.status, 200, r.text);
  adminToken = r.data.token;

  r = await adminAccounts();
  const aliceRow = r.data.accounts.find((a) => a.id === aliceId);
  assert.equal(aliceRow.plan_id, planA);
  assert.equal(aliceRow.plan_name, '入门包');
  assert.equal(aliceRow.quota_tokens, 50);
  assert.equal(aliceRow.plan_status, 'active');
  const bobRow = r.data.accounts.find((a) => a.id === bobId);
  assert.equal(bobRow.plan_status, 'none');
  const charlieRow = r.data.accounts.find((a) => a.username === 'charlie');
  assert.equal(charlieRow.plan_id, planC);

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'alice', password: ALICE_PW } });
  assert.equal(r.status, 200, r.text);
  aliceToken = r.data.token;
  r = await userPlans();
  assert.equal(r.data.plans.length, 1);
  assert.equal(r.data.history.length, 5);
  assert.equal(r.data.account.used_tokens, 60, '恢复应还原密钥用量');

  // v2 备份（不含 plans / plan_requests）恢复：套餐保留，申请清空
  const v2 = { ...snapshot, confirm: true };
  delete v2.plans;
  delete v2.plan_requests;
  r = await call('/api/admin/restore', { method: 'POST', adminKey: 'adm-secret', body: v2 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.plans, undefined);
  assert.equal(r.data.plan_requests, undefined);

  r = await call('/api/admin/plans', { adminKey: 'adm-secret' });
  assert.equal(r.status, 200);
  assert.equal(r.data.plans.length, 2, 'v2 恢复不应删除现有套餐');
  assert.equal(r.data.requests.length, 0, '恢复账号但无申请记录时应清空申请');
  assert.equal(r.data.pending_count, 0);
  console.log('ok 6) 备份 v3 含套餐/申请、恢复校验、会话清空、v2 兼容');
}

console.log('\n套餐集成回归全部通过');
