/**
 * 集成回归：账号体系（首次初始化 / 登录 / 注册开关 / 问答找回 / 角色与配额 / 备份恢复）。
 * 运行：node test/accounts.mjs
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

let upstreamTokens = 3;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://up.example')) {
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-acct',
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
    // 非 JSON 响应（如备份下载失败页）保持 null
  }
  await drain();
  return { status: res.status, data, text, res };
}

async function chat(apiKey) {
  const res = await handler.fetch(
    new Request('https://gw.example/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'm1', messages: [{ role: 'user', content: 'hi' }] }),
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
const ALICE_PW2 = 'alice-pass-2';
const ALICE_PW3 = 'alice-pass-3';
const BOB_PW = 'bob-pass-123';

let adminToken = '';
let adminId = '';
let aliceToken = '';
let aliceId = '';
let bobToken = '';
let bobId = '';
let bobKey = '';

async function updateSettings(patch) {
  return call('/api/admin/settings', { method: 'POST', token: adminToken, body: patch });
}
async function register(body) {
  return call('/api/auth/register', { method: 'POST', body });
}
async function adminAccounts() {
  return call('/api/admin/accounts', { token: adminToken });
}

/* ---------------- 1) 首次初始化管理员 ---------------- */
{
  let r = await call('/api/auth/state');
  assert.equal(r.status, 200);
  assert.equal(r.data.initialized, false, '全新部署应处于未初始化状态');
  assert.equal(r.data.allow_registration, false, '注册默认关闭');
  assert.equal(r.data.allow_password_recovery, true, '问答找回默认开启');
  assert.equal(r.data.admin_key_configured, true, '应急 ADMIN_KEY 应被识别');

  r = await call('/api/auth/setup', { method: 'POST', body: { username: 'root', password: ADMIN_PW } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'bad_question', '初始化必须设置安全问题');

  r = await call('/api/auth/setup', {
    method: 'POST',
    body: { username: 'root', password: ADMIN_PW, question: '最喜欢的颜色？', answer: '蓝色' },
  });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.data.token, '初始化后应直接登录');
  assert.equal(r.data.user.role, 'admin');
  adminToken = r.data.token;
  adminId = r.data.user.id;

  const accountDoc = r2.map.get('data/accounts.json');
  const accounts = JSON.parse(accountDoc);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].role, 'admin');
  assert.ok(accounts[0].password.hash, '密码应按哈希存储');
  assert.ok(accounts[0].security && accounts[0].security.hash, '安全答案应按哈希存储');
  assert.ok(!accountDoc.includes(ADMIN_PW), '明文密码不得落盘');
  assert.ok(!accountDoc.includes('蓝色'), '明文安全答案不得落盘');

  const sessions = JSON.parse(r2.map.get('data/sessions.json'));
  assert.equal(sessions.length, 1);
  assert.ok(sessions[0].token_hash && !sessions[0].token, '会话只存 token 哈希');

  r = await call('/api/auth/setup', {
    method: 'POST',
    body: { username: 'root2', password: ADMIN_PW, question: '问题？', answer: '答案' },
  });
  assert.equal(r.status, 409, '已初始化后不允许再次 setup');
  assert.equal(r.data.error.code, 'already_initialized');
  console.log('ok 1) 首次初始化：强制问答、哈希落盘、会话只存哈希、不可重复初始化');
}

/* ---------------- 2) 登录 / 会话 / 注册开关 ---------------- */
{
  let r = await call('/api/auth/login', {
    method: 'POST',
    body: { username: 'root', password: 'wrong-pass-123' },
  });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'bad_credentials');

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'ROOT', password: ADMIN_PW } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.user.role, 'admin');
  adminToken = r.data.token;

  r = await call('/api/auth/me', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.username, 'root');
  assert.equal(r.data.emergency, false);

  r = await register({ username: 'alice', password: ALICE_PW, question: '母亲的名字？', answer: 'Zhang San' });
  assert.equal(r.status, 403, '注册关闭时不应允许注册');
  assert.equal(r.data.error.code, 'registration_disabled');

  r = await updateSettings({ allow_registration: true, allow_password_recovery: true, default_user_quota_tokens: 100 });
  assert.equal(r.status, 200);

  r = await call('/api/auth/state');
  assert.equal(r.data.allow_registration, true);

  r = await register({ username: 'alice', password: ALICE_PW, question: '母亲的名字？', answer: 'Zhang San' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.user.role, 'user');
  assert.equal(r.data.user.quota_tokens, 100, '注册账号应继承默认配额');
  aliceToken = r.data.token;
  aliceId = r.data.user.id;

  r = await register({ username: 'Alice', password: ALICE_PW, question: 'x？', answer: 'y' });
  assert.equal(r.status, 409, '用户名应大小写不敏感去重');
  assert.equal(r.data.error.code, 'username_taken');

  r = await call('/api/admin/ping', { token: aliceToken });
  assert.equal(r.status, 403, '普通用户不得访问管理接口');
  assert.equal(r.data.error.code, 'forbidden');

  r = await call('/api/user/keys', { method: 'POST', token: aliceToken, body: { action: 'create', name: 'Alice 的密钥' } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.data.key, /^sk-[0-9a-f]{48}$/);
  const keyDoc = r2.map.get('data/keys.json');
  assert.ok(!keyDoc.includes(r.data.key), '明文密钥不得落盘');
  assert.ok(JSON.parse(keyDoc)[0].key_hash, '密钥应按哈希存储');

  r = await call('/api/admin/keys', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].owner_username, 'alice', '管理员密钥列表应显示归属用户名');
  console.log('ok 2) 登录/会话/注册开关/用户名去重/用户越权拦截/密钥哈希存储');
}

/* ---------------- 3) 问答找回密码 ---------------- */
{
  let r = await call('/api/auth/recovery?username=nobody');
  assert.equal(r.status, 404);
  assert.equal(r.data.error.code, 'no_recovery');

  r = await call('/api/auth/recovery?username=ALICE');
  assert.equal(r.status, 200);
  assert.equal(r.data.question, '母亲的名字？');

  r = await call('/api/auth/recover', {
    method: 'POST',
    body: { username: 'alice', answer: '错误答案', new_password: ALICE_PW2 },
  });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'bad_answer');

  // 大小写 / 空格差异应被归一化后接受
  r = await call('/api/auth/recover', {
    method: 'POST',
    body: { username: 'alice', answer: '  ZHANG   san ', new_password: ALICE_PW2 },
  });
  assert.equal(r.status, 200, r.text);

  r = await call('/api/auth/me', { token: aliceToken });
  assert.equal(r.status, 401, '重置密码后旧会话应失效');
  assert.equal(r.data.error.code, 'session_invalid');

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'alice', password: ALICE_PW } });
  assert.equal(r.status, 401, '旧密码应失效');

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'alice', password: ALICE_PW2 } });
  assert.equal(r.status, 200, r.text);
  aliceToken = r.data.token;

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'alice', password: ALICE_PW2 } });
  const aliceToken2 = r.data.token;

  r = await call('/api/auth/change-password', {
    method: 'POST',
    token: aliceToken,
    body: { old_password: 'wrong-pass-1', new_password: ALICE_PW3 },
  });
  assert.equal(r.status, 401);

  r = await call('/api/auth/change-password', {
    method: 'POST',
    token: aliceToken,
    body: { old_password: ALICE_PW2, new_password: ALICE_PW3 },
  });
  assert.equal(r.status, 200, r.text);

  r = await call('/api/auth/me', { token: aliceToken });
  assert.equal(r.status, 200, '修改密码应保留当前会话');
  r = await call('/api/auth/me', { token: aliceToken2 });
  assert.equal(r.status, 401, '修改密码应踢掉其它会话');

  r = await call('/api/auth/security', {
    method: 'POST',
    token: aliceToken,
    body: { password: 'wrong-pass-1', question: '新问题？', answer: '新答案' },
  });
  assert.equal(r.status, 401);

  r = await call('/api/auth/security', {
    method: 'POST',
    token: aliceToken,
    body: { password: ALICE_PW3, question: '新问题？', answer: '新答案' },
  });
  assert.equal(r.status, 200, r.text);

  r = await call('/api/auth/recovery?username=alice');
  assert.equal(r.data.question, '新问题？');

  await updateSettings({ allow_password_recovery: false });
  r = await call('/api/auth/recovery?username=alice');
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'recovery_disabled');
  await updateSettings({ allow_password_recovery: true });
  console.log('ok 3) 问答找回：账号枚举防护、答案归一化、会话吊销、改密/改问题、找回开关');
}

/* ---------------- 4) 普通用户密钥归属与账号配额 ---------------- */
{
  let r = await register({ username: 'bob', password: BOB_PW, question: '宠物名？', answer: 'mimi' });
  assert.equal(r.status, 200, r.text);
  bobToken = r.data.token;
  bobId = r.data.user.id;

  await updateSettings({ allow_registration: false });
  r = await register({ username: 'charlie', password: 'charlie-123', question: 'q？', answer: 'a' });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'registration_disabled');
  await updateSettings({ allow_registration: true });

  r = await call('/api/user/keys', { method: 'POST', token: bobToken, body: { name: 'Bob 的密钥' } });
  assert.equal(r.status, 200, r.text);
  bobKey = r.data.key;
  const bobKeyId = r.data.record.id;

  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.data.keys.length, 1);
  assert.equal(r.data.account.username, 'bob');

  r = await call('/api/user/keys', { token: aliceToken });
  assert.equal(r.data.keys.length, 1, 'alice 不应看到 bob 的密钥');
  assert.equal(r.data.keys[0].name, 'Alice 的密钥');

  for (const action of ['rename', 'toggle', 'delete']) {
    r = await call('/api/user/keys', {
      method: 'POST',
      token: aliceToken,
      body: { action, id: bobKeyId, name: '越权改名', enabled: false },
    });
    assert.equal(r.status, 404, '不得操作他人密钥（' + action + '）');
    assert.equal(r.data.error.code, 'not_found');
  }

  r = await call('/api/user/keys', {
    method: 'POST',
    token: bobToken,
    body: { action: 'rename', id: bobKeyId, name: 'Bob 改名成功' },
  });
  assert.equal(r.status, 200);
  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.data.keys[0].name, 'Bob 改名成功');

  r = await chat(bobKey);
  assert.equal(r.status, 200, r.text);
  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.data.keys[0].used_tokens, 3, '网关调用应累计到所属密钥');
  assert.equal(r.data.account.used_tokens, 3, '账号用量应聚合名下密钥');

  r = await adminAccounts();
  assert.equal(r.status, 200);
  const bobRow = r.data.accounts.find((a) => a.id === bobId);
  assert.equal(bobRow.quota_tokens, 100);
  assert.equal(bobRow.used_tokens, 3);
  assert.equal(bobRow.key_count, 1);
  assert.equal(bobRow.is_current, false);

  await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: aliceId, quota_tokens: 500 },
  });
  r = await adminAccounts();
  assert.equal(r.data.accounts.find((a) => a.id === aliceId).quota_tokens, 500);

  upstreamTokens = 100;
  r = await chat(bobKey);
  assert.equal(r.status, 200, '配额未用尽时应放行');
  upstreamTokens = 3;
  r = await chat(bobKey);
  assert.equal(r.status, 429, '账号配额用尽后名下密钥应统一拒绝');
  assert.equal(r.data.error.code, 'account_quota_exceeded');

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, enabled: false },
  });
  assert.equal(r.status, 200);
  r = await chat(bobKey);
  assert.equal(r.status, 403, '账号被禁用后密钥应立即失效');
  assert.equal(r.data.error.code, 'owner_disabled');
  r = await call('/api/user/keys', { token: bobToken });
  assert.equal(r.status, 401, '禁用账号应吊销已有会话');
  assert.equal(r.data.error.code, 'session_invalid');
  r = await call('/api/auth/login', { method: 'POST', body: { username: 'bob', password: BOB_PW } });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'account_disabled');

  await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: bobId, enabled: true },
  });
  r = await call('/api/auth/login', { method: 'POST', body: { username: 'bob', password: BOB_PW } });
  assert.equal(r.status, 200, '重新启用后应可登录');
  bobToken = r.data.token;

  // 单账号密钥上限：直接预置到 20 个，再创建应被拒绝
  const keys = JSON.parse(r2.map.get('data/keys.json'));
  for (let i = 0; i < 19; i++) {
    keys.push({
      id: 'seed_' + i,
      key_hash: 'seedhash' + i,
      key_prefix: 'sk-seed',
      name: 'seed ' + i,
      owner_id: bobId,
      owner_username: 'bob',
      enabled: true,
      used_tokens: 0,
      requests: 0,
      used_cost: 0,
      created_at: new Date().toISOString(),
    });
  }
  await r2.put('data/keys.json', JSON.stringify(keys));
  r = await call('/api/user/keys', { method: 'POST', token: bobToken, body: { name: '第 21 个' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'key_limit');
  console.log('ok 4) 用户密钥归属隔离、改名、用量聚合、账号配额与禁用、单账号密钥上限');
}

/* ---------------- 5) 管理员账号守卫与删除级联 ---------------- */
{
  let r = await adminAccounts();
  assert.equal(r.data.current_id, adminId);
  assert.equal(r.data.emergency, false);
  assert.equal(r.data.accounts.find((a) => a.id === bobId).key_count, 20);

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'delete', id: adminId },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'self_delete');

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: adminId, role: 'user' },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'last_admin');

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'update', id: adminId, enabled: false },
  });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'last_admin');

  r = await call('/api/admin/accounts', {
    method: 'POST',
    token: adminToken,
    body: { action: 'delete', id: bobId },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.removed_keys, 20, '删除账号应级联删除名下密钥');
  assert.ok(
    !JSON.parse(r2.map.get('data/keys.json')).some((k) => k.owner_id === bobId),
    'R2 中不应残留该账号的密钥'
  );
  r = await call('/api/auth/me', { token: bobToken });
  assert.equal(r.status, 401, '删除账号应吊销会话');

  r = await call('/api/admin/ping', { adminKey: 'adm-secret' });
  assert.equal(r.status, 200);
  assert.equal(r.data.emergency, true, '应急 ADMIN_KEY 应仍可管理');
  r = await call('/api/auth/me', { adminKey: 'adm-secret' });
  assert.equal(r.status, 200);
  assert.match(r.data.user.username, /ADMIN_KEY/);
  console.log('ok 5) 自我删除/末位管理员守卫、删除级联密钥与会话、应急 ADMIN_KEY');
}

/* ---------------- 6) 备份包含账号 + 恢复校验 ---------------- */
{
  let r = await call('/api/admin/backup', { token: adminToken });
  assert.equal(r.status, 200);
  const snapshot = JSON.parse(r.text);
  assert.equal(snapshot.version, 3);
  assert.equal(snapshot.type, 'oneapi-gateway-backup');
  assert.ok(Array.isArray(snapshot.accounts) && snapshot.accounts.length === 2);
  assert.ok(snapshot.accounts.find((a) => a.username === 'root').password.hash);
  assert.ok(!r.text.includes(ADMIN_PW), '备份不应包含明文管理员密码');
  assert.ok(!r.text.includes(ALICE_PW3), '备份不应包含明文用户密码');
  assert.ok(snapshot.keys.some((k) => k.owner_id === aliceId), '备份应包含用户密钥归属');

  r = await call('/api/admin/restore', { method: 'POST', token: adminToken, body: snapshot });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'confirm_required');

  const noAdmin = structuredClone(snapshot);
  noAdmin.confirm = true;
  noAdmin.accounts = noAdmin.accounts.map((a) => ({ ...a, role: 'user' }));
  r = await call('/api/admin/restore', { method: 'POST', token: adminToken, body: noAdmin });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'no_admin', '没有可用管理员的备份应被拒绝');

  const broken = structuredClone(snapshot);
  broken.confirm = true;
  broken.accounts[0].password = null;
  r = await call('/api/admin/restore', { method: 'POST', token: adminToken, body: broken });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'invalid_backup');

  const promoteAlice = structuredClone(snapshot);
  promoteAlice.confirm = true;
  promoteAlice.accounts = promoteAlice.accounts
    .filter((a) => a.username === 'alice')
    .map((a) => ({ ...a, role: 'admin' }));
  r = await call('/api/admin/restore', { method: 'POST', token: adminToken, body: promoteAlice });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.accounts, 1);

  r = await call('/api/auth/me', { token: adminToken });
  assert.equal(r.status, 401, '恢复账号后应清空全部旧会话');

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'alice', password: ALICE_PW3 } });
  assert.equal(r.status, 200, '恢复后的账号应能用备份时的密码登录');
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.has_recovery, true, '安全问题应随账号一并恢复');

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'root', password: ADMIN_PW } });
  assert.equal(r.status, 401, '被备份覆盖掉的账号不应还能登录');
  console.log('ok 6) 备份含账号（仅哈希）、恢复需确认且校验管理员/完整性、恢复后清会话');
}

console.log('accounts: all passed');
