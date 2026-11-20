/**
 * 安全回归（2.6.0 P0）：私网拦截 / ADMIN_KEY 默认关闭 / 渠道密钥静态加密 /
 * Telegram token 加密掩码 / TOTP 两步验证 / R2 乐观并发 / PBKDF2 可配。
 * 运行：node test/security.mjs
 * 用带 etag 语义的 FakeR2 + 假上游驱动真实 fetch 入口，不连任何外部服务。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const mod = await import('../src/index.js');
const handler = mod.default;

/* ---------------- 带 etag 的 FakeR2 ---------------- */
function err412() {
  const e = new Error('412 Precondition Failed');
  e.status = 412;
  return e;
}
class FakeR2 {
  constructor() {
    this.map = new Map(); // key -> { value, etag }
    this.armed = new Map(); // key -> mutator(storedValueString) => newValueString
  }
  etagOf(value) {
    return createHash('sha256').update(String(value)).digest('hex');
  }
  async get(key) {
    const rec = this.map.get(key);
    if (!rec) return null;
    return {
      etag: rec.etag,
      json: async () => JSON.parse(rec.value),
      text: async () => rec.value,
    };
  }
  async put(key, value, options) {
    const v = String(value);
    const cur = this.map.get(key);
    const onlyIf = (options && options.onlyIf) || null;
    if (onlyIf && this.armed.has(key)) {
      // 模拟另一个 isolate 先写了一次：改掉存储并换 etag，再报 412
      const mutator = this.armed.get(key);
      this.armed.delete(key);
      if (cur) {
        const next = mutator(cur.value);
        this.map.set(key, { value: next, etag: this.etagOf(next) });
      }
      throw err412();
    }
    if (onlyIf) {
      if (onlyIf.etagMatches !== undefined && (!cur || cur.etag !== onlyIf.etagMatches)) {
        throw err412();
      }
      if (onlyIf.etagDoesNotMatch === '*' && cur) throw err412();
    }
    this.map.set(key, { value: v, etag: this.etagOf(v) });
  }
  armConflict(key, mutator) {
    this.armed.set(key, mutator);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const todayStr = () => new Date(Date.now() + 480 * 60000).toISOString().slice(0, 10);

/* ---------------- 假运行环境 ---------------- */
const r2 = new FakeR2();
// PBKDF2_ITERATIONS=20000：验证 env 可配且落盘记录用该值
const env = { R2: r2, ADMIN_KEY: 'adm-secret', PBKDF2_ITERATIONS: '20000' };
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

const fetchCalls = [];
let lastUpstreamAuth = '';
globalThis.fetch = async (url, options) => {
  const u = String(url);
  fetchCalls.push(u);
  if (options && options.headers && options.headers.Authorization) {
    lastUpstreamAuth = options.headers.Authorization;
  }
  if (u.startsWith('https://up.example')) {
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-sec',
        object: 'chat.completion',
        model: 'm1',
        choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error('unexpected fetch: ' + u);
};

async function call(path, { method = 'GET', token, adminKey, body, ip } = {}) {
  const headers = {};
  if (token) headers['X-Session-Token'] = token;
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  if (ip) headers['X-Forwarded-For'] = ip;
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
const GW_KEY = 'sk-gw-test-0001';
let adminToken = '';
let aliceToken = '';

async function login(username, password, totp) {
  const body = { username, password };
  if (totp) body.totp = totp;
  return call('/api/auth/login', { method: 'POST', body });
}
const stepNow = () => Math.floor(Date.now() / 1000 / 30);
const codeFor = async (secret, offset) => mod.totpCode(secret, stepNow() + offset);

/* ---------------- 1) validateChannelUrl 纯函数 ---------------- */
{
  const blocked = [
    'http://127.0.0.1/',
    'http://127.0.0.1:8080/v1',
    'http://2130706433/', // 十进制单整数 = 127.0.0.1
    'http://0x7f000001/', // 十六进制 = 127.0.0.1
    'http://0177.0.0.1/', // 八进制 = 127.0.0.1
    'http://127.1/',
    'http://127.0.1/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://192.0.2.1/',
    'http://198.51.100.1/',
    'http://203.0.113.1/',
    'http://224.0.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[::]/',
    'http://[fe80::1]/',
    'http://[fc00::1]/',
    'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[2001:db8::1]/',
    'http://localhost/',
    'http://foo.localhost/',
    'http://foo.local/',
    'http://foo.internal/',
    'http://foo.lan/',
    'http://metadata.google.internal/',
    'http://metadata/',
    'ftp://api.openai.com/',
    'http://user:pass@api.openai.com/',
    'not-a-url',
    '',
  ];
  for (const u of blocked) {
    const v = mod.validateChannelUrl(u);
    assert.equal(v.ok, false, u + ' 应被拦截');
    assert.ok(v.reason, u + ' 应给出原因');
  }
  const allowed = [
    'https://api.openai.com',
    'https://up.example:8443/',
    'http://example.com/v1',
    'https://api.deepseek.com',
  ];
  for (const u of allowed) {
    assert.equal(mod.validateChannelUrl(u).ok, true, u + ' 应放行');
  }
  assert.equal(mod.isPrivateIp('127.0.0.1'), true);
  assert.equal(mod.isPrivateIp('8.8.8.8'), false);
  assert.equal(mod.isPrivateIp('::1'), true);
  assert.equal(mod.isPrivateHostname('api.openai.com'), false);
  assert.equal(mod.isPrivateHostname('localhost'), true);
  console.log('ok 1) validateChannelUrl：私网/回环/十进制/十六进制/八进制/IPv6 映射/元数据主机均被拦截，公网放行');
}

/* ---------------- 2) /api/auth/state 去指纹 + PBKDF2 可配 ---------------- */
{
  let r = await call('/api/auth/state');
  assert.equal(r.status, 200);
  assert.equal(r.data.version, undefined, 'state 不应再返回 version');
  assert.equal(r.data.initialized, false);
  assert.equal(mod.pbkdf2Iterations({}), 10000);
  assert.equal(mod.pbkdf2Iterations({ PBKDF2_ITERATIONS: '5' }), 10000, '低于下限应夹到 10000');
  assert.equal(mod.pbkdf2Iterations({ PBKDF2_ITERATIONS: '999999' }), 600000, '高于上限应夹到 600000');
  assert.equal(mod.pbkdf2Iterations({ PBKDF2_ITERATIONS: '20000' }), 20000);

  r = await call('/api/auth/setup', {
    method: 'POST',
    body: { username: 'root', password: ADMIN_PW, question: '最喜欢的颜色？', answer: '蓝色' },
  });
  assert.equal(r.status, 200, r.text);
  adminToken = r.data.token;
  const accounts = JSON.parse(r2.map.get('data/accounts.json').value);
  assert.equal(accounts[0].password.iterations, 20000, 'env PBKDF2_ITERATIONS 应落盘到新账号');
  console.log('ok 2) state 不再返回 version；PBKDF2 迭代次数 env 可配（默认 10000，夹在 10000~600000）');
}

/* ---------------- 3) ADMIN_KEY 默认不可调 /v1/* ---------------- */
{
  // 网关密钥直接种进 R2（哈希存储）
  await r2.put(
    'data/keys.json',
    JSON.stringify([
      {
        id: 'gw1',
        key_hash: sha256(GW_KEY),
        key_prefix: GW_KEY.slice(0, 12),
        name: 'test',
        enabled: true,
        used_tokens: 0,
        requests: 0,
        used_cost: 0,
        rpm: null,
        allowed_models: [],
        expires_at: '',
        created_at: new Date().toISOString(),
      },
    ])
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
  await sleep(1100); // 直接写 R2 绕过缓存失效，等 1s 热缓存过期

  let c = await chat('adm-secret');
  assert.equal(c.status, 401, '默认关闭时 ADMIN_KEY 不应能调 /v1/*');
  assert.equal(c.data.error.code, 'admin_key_disabled');

  c = await chat(GW_KEY);
  assert.equal(c.status, 200, '网关密钥应正常调通：' + c.text);

  let r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { allow_admin_key_as_api_key: true },
  });
  assert.equal(r.status, 200, r.text);
  c = await chat('adm-secret');
  assert.equal(c.status, 200, '显式设 true 后 ADMIN_KEY 应可用（旧配置兼容）');

  r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { allow_admin_key_as_api_key: false },
  });
  assert.equal(r.status, 200);
  c = await chat('adm-secret');
  assert.equal(c.status, 401, '改回 false 后应再次拒绝');
  console.log('ok 3) ADMIN_KEY 默认 false：调 /v1/* 返回 admin_key_disabled，显式 true 后可用（旧配置兼容）');
}

/* ---------------- 4) 渠道 POST 校验私网 + 密钥加密/掩码/留空保留 ---------------- */
{
  const bad = [
    { id: 'bad1', name: '私网', base_url: 'http://127.0.0.1:8080', api_key: 'x', models: ['m1'], enabled: true },
    { id: 'bad2', name: '十进制', base_url: 'http://2130706433/', api_key: 'x', models: ['m1'], enabled: true },
    { id: 'bad3', name: '十六进制', base_url: 'http://0x7f000001/', api_key: 'x', models: ['m1'], enabled: true },
    { id: 'bad4', name: '元数据', base_url: 'http://169.254.169.254/', api_key: 'x', models: ['m1'], enabled: true },
  ];
  for (const ch of bad) {
    const r = await call('/api/admin/channels', {
      method: 'POST',
      token: adminToken,
      body: { channels: [ch] },
    });
    assert.equal(r.status, 400, ch.name + ' 应被拒绝');
    assert.equal(r.data.error.code, 'invalid_channel_url');
  }
  // 绕过 POST 校验直接种私网渠道：转发层也必须到不了
  const callsBefore = fetchCalls.length;
  await r2.put(
    'data/channels.json',
    JSON.stringify([
      {
        id: 'priv',
        name: '私网直种',
        enabled: true,
        type: 'openai',
        base_url: 'http://127.0.0.1:8080',
        api_key: 'sk-priv',
        models: ['m1'],
        priority: 1,
        weight: 1,
      },
    ])
  );
  await sleep(1100);
  let c = await chat(GW_KEY);
  assert.equal(c.status, 503, '私网渠道应被路由层过滤');
  assert.equal(c.data.error.code, 'no_channel');
  assert.ok(
    !fetchCalls.slice(callsBefore).some((u) => u.includes('127.0.0.1')),
    '不得向私网地址发起任何 fetch'
  );

  // 正常渠道：保存后 R2 里是密文，GET 不回显明文
  const pub = {
    id: 'c1',
    name: '主渠道',
    enabled: true,
    type: 'openai',
    base_url: 'https://up.example',
    api_key: 'sk-up-1,sk-up-2',
    models: ['m1'],
    priority: 1,
    weight: 1,
  };
  let r = await call('/api/admin/channels', { method: 'POST', token: adminToken, body: { channels: [pub] } });
  assert.equal(r.status, 200, r.text);
  const storedRaw = r2.map.get('data/channels.json').value;
  assert.ok(storedRaw.includes('enc:v1:'), '渠道密钥应以 enc:v1: 密文落盘');
  assert.ok(!storedRaw.includes('sk-up-1') && !storedRaw.includes('sk-up-2'), 'R2 里不得出现明文渠道密钥');
  const storedEnc = JSON.parse(storedRaw)[0].api_key;

  r = await call('/api/admin/channels', { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.data[0].api_key, '', 'GET 不应回显渠道密钥');
  assert.equal(r.data[0].api_key_count, 2);
  assert.equal(r.data[0].api_key_preview, 'up-2');

  lastUpstreamAuth = '';
  c = await chat(GW_KEY);
  assert.equal(c.status, 200, '密文渠道应能解密转发：' + c.text);
  assert.match(lastUpstreamAuth, /^Bearer sk-up-[12]$/, '上游应收到解密后的渠道密钥');

  // 留空保存 = 保留旧密钥
  r = await call('/api/admin/channels', { method: 'POST', token: adminToken, body: { channels: r.data } });
  assert.equal(r.status, 200, r.text);
  assert.equal(JSON.parse(r2.map.get('data/channels.json').value)[0].api_key, storedEnc, '留空保存不得改动已存密钥');
  c = await chat(GW_KEY);
  assert.equal(c.status, 200, '留空保存后转发仍应正常');

  // 旧明文渠道：转发兼容读，GET 掩码，下次保存自动迁移加密
  await r2.put(
    'data/channels.json',
    JSON.stringify([
      {
        id: 'c2',
        name: '旧明文',
        enabled: true,
        type: 'openai',
        base_url: 'https://up.example',
        api_key: 'sk-legacy-1',
        models: ['m1'],
        priority: 1,
        weight: 1,
      },
    ])
  );
  await sleep(1100);
  c = await chat(GW_KEY);
  assert.equal(c.status, 200, '旧明文渠道应兼容转发：' + c.text);
  r = await call('/api/admin/channels', { token: adminToken });
  assert.equal(r.data[0].api_key, '');
  assert.equal(r.data[0].api_key_count, 1);
  assert.equal(r.data[0].api_key_preview, 'cy-1');
  r = await call('/api/admin/channels', { method: 'POST', token: adminToken, body: { channels: r.data } });
  assert.equal(r.status, 200);
  const migrated = JSON.parse(r2.map.get('data/channels.json').value)[0].api_key;
  assert.ok(migrated.startsWith('enc:v1:'), '下次保存时旧明文应迁移加密');
  assert.ok(!r2.map.get('data/channels.json').value.includes('sk-legacy-1'));
  c = await chat(GW_KEY);
  assert.equal(c.status, 200, '迁移后转发仍应正常');
  console.log('ok 4) 渠道：私网/十进制/十六进制/元数据 POST 被拒且转发不到；密钥 enc:v1: 落盘、GET 掩码、留空保留、旧明文兼容并迁移');
}

/* ---------------- 5) Telegram token 加密 + 掩码 ---------------- */
{
  const TG = '123456:ABC-DEF-test-token';
  let r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { tg_bot_token: TG, tg_chat_id: '999' },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.settings.tg_bot_token, '••••••••', 'POST 返回的设置应掩码');
  const storedSettings = JSON.parse(r2.map.get('data/settings.json').value);
  assert.ok(storedSettings.tg_bot_token.startsWith('enc:v1:'), 'tg token 应加密落盘');
  assert.ok(!r2.map.get('data/settings.json').value.includes(TG));

  r = await call('/api/admin/settings', { token: adminToken });
  assert.equal(r.data.tg_bot_token, '••••••••', 'GET 设置应掩码');

  // 掩码原样回传 = 保持不变（AES-GCM 每次加密换随机 IV，密文会变，解密后应相同）
  r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { tg_bot_token: '••••••••' },
  });
  assert.equal(r.status, 200);
  const kept = JSON.parse(r2.map.get('data/settings.json').value).tg_bot_token;
  assert.ok(kept.startsWith('enc:v1:'), '掩码回传后仍应是密文');
  assert.equal(await mod.decryptSecret(env, kept), TG, '掩码回传后解密应得原 token');

  // 清空
  r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { tg_bot_token: '' },
  });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r2.map.get('data/settings.json').value).tg_bot_token, '');
  console.log('ok 5) Telegram token：加密落盘、GET/POST 掩码、掩码回传保持不变、空串清除');
}

/* ---------------- 6) TOTP 两步验证 ---------------- */
{
  let r = await call('/api/admin/settings', {
    method: 'POST',
    token: adminToken,
    body: { allow_registration: true },
  });
  assert.equal(r.status, 200);
  r = await call('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: ALICE_PW, question: '母亲的名字？', answer: 'Zhang San' },
  });
  assert.equal(r.status, 200, r.text);
  aliceToken = r.data.token;
  assert.equal(r.data.user.totp_enabled, false);

  r = await call('/api/auth/totp/setup', { method: 'POST', token: aliceToken, body: {} });
  assert.equal(r.status, 200, r.text);
  const secret = r.data.secret;
  assert.match(secret, /^[A-Z2-7]{32}$/, 'secret 应为 32 位 base32');
  assert.ok(r.data.otpauth_url.startsWith('otpauth://totp/OneAPI:alice?secret=' + secret));

  const enableCode = await codeFor(secret, -1);
  r = await call('/api/auth/totp/enable', {
    method: 'POST',
    token: aliceToken,
    body: { password: ALICE_PW, totp: enableCode },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.backup_codes.length, 10);
  for (const b of r.data.backup_codes) assert.match(b, /^\d{8}$/);
  const backups = r.data.backup_codes;

  r = await call('/api/auth/me', { token: aliceToken });
  assert.equal(r.data.user.totp_enabled, true, 'publicAccount 应暴露 totp_enabled');

  r = await login('alice', ALICE_PW);
  assert.equal(r.status, 401, '启用后无码登录应被拒');
  assert.equal(r.data.error.code, 'totp_required');

  const wrong = '000000';
  const realCodes = new Set([
    await codeFor(secret, -1),
    await codeFor(secret, 0),
    await codeFor(secret, 1),
  ]);
  assert.ok(!realCodes.has(wrong), '测试用的错误码不得恰好是真码');
  r = await login('alice', ALICE_PW, wrong);
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'totp_required');

  const loginCode = await codeFor(secret, 0);
  r = await login('alice', ALICE_PW, loginCode);
  assert.equal(r.status, 200, '正确验证码应可登录：' + r.text);
  aliceToken = r.data.token;

  r = await login('alice', ALICE_PW, loginCode);
  assert.equal(r.status, 401, '同一验证码不得二次使用（防重放）');
  assert.equal(r.data.error.code, 'totp_required');

  r = await login('alice', ALICE_PW, backups[0]);
  assert.equal(r.status, 200, '备用码应可登录：' + r.text);
  aliceToken = r.data.token;
  r = await login('alice', ALICE_PW, backups[0]);
  assert.equal(r.status, 401, '备用码用过一次后应失效');

  // 改密：无码被拒，有码放行
  r = await call('/api/auth/change-password', {
    method: 'POST',
    token: aliceToken,
    body: { old_password: ALICE_PW, new_password: ALICE_PW2 },
  });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'totp_required');
  const cpCode = await codeFor(secret, 1);
  r = await call('/api/auth/change-password', {
    method: 'POST',
    token: aliceToken,
    body: { old_password: ALICE_PW, new_password: ALICE_PW2, totp: cpCode },
  });
  assert.equal(r.status, 200, '带验证码改密应放行：' + r.text);

  r = await login('alice', ALICE_PW2, backups[1]);
  assert.equal(r.status, 200, '改密后备用码登录应正常');
  aliceToken = r.data.token;

  // 找回密码：无码被拒，备用码放行
  r = await call('/api/auth/recover', {
    method: 'POST',
    body: { username: 'alice', answer: 'Zhang San', new_password: ALICE_PW3 },
  });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'totp_required');
  r = await call('/api/auth/recover', {
    method: 'POST',
    body: { username: 'alice', answer: 'Zhang San', new_password: ALICE_PW3, totp: backups[2] },
  });
  assert.equal(r.status, 200, '带备用码找回应放行：' + r.text);

  // 停用：备用码 + 密码
  r = await login('alice', ALICE_PW3, backups[3]);
  assert.equal(r.status, 200, r.text);
  aliceToken = r.data.token;
  r = await call('/api/auth/totp/disable', {
    method: 'POST',
    token: aliceToken,
    body: { password: ALICE_PW3, totp: backups[4] },
  });
  assert.equal(r.status, 200, '带备用码停用应放行：' + r.text);
  r = await call('/api/auth/me', { token: aliceToken });
  assert.equal(r.data.user.totp_enabled, false);
  r = await login('alice', ALICE_PW3);
  assert.equal(r.status, 200, '停用后无码登录应恢复');
  console.log('ok 6) TOTP：启用→无码/错码被拒→正确码登录→同一码重放被拒→备用码一次有效→改密/找回均需码→停用后恢复');
}

/* ---------------- 7) R2 乐观并发 ---------------- */
{
  // 直接测条件写语义
  let ok = await mod.r2PutJsonConditional(env, 'data/occ-test.json', { n: 1 }, null);
  assert.equal(ok, true, '不存在时 etag=null 应可创建');
  let got = await mod.r2GetWithEtag(env, 'data/occ-test.json');
  assert.equal(got.value.n, 1);
  assert.ok(got.etag, '应返回 etag');
  ok = await mod.r2PutJsonConditional(env, 'data/occ-test.json', { n: 2 }, 'wrong-etag');
  assert.equal(ok, false, 'etag 不匹配应返回 false 而非抛错');
  got = await mod.r2GetWithEtag(env, 'data/occ-test.json');
  assert.equal(got.value.n, 1, '冲突写不应覆盖原值');
  ok = await mod.r2PutJsonConditional(env, 'data/occ-test.json', { n: 2 }, got.etag);
  assert.equal(ok, true, 'etag 匹配应写成功');

  // bumpStats：模拟一次条件写冲突，重试后计数不丢
  const statsKey = 'data/stats/' + todayStr() + '.json';
  const entry = { model: 'm1', channel: 'c1', key_name: 'gw1', ok: true, stream: false, tokens: 3, cost: 0, ms: 10 };
  await mod.bumpStats(env, entry, { timezone_offset_minutes: 480 });
  const before = JSON.parse(r2.map.get(statsKey).value);
  r2.armConflict(statsKey, (raw) => {
    const v = JSON.parse(raw);
    v.requests += 5;
    v.tokens += 7;
    return JSON.stringify(v);
  });
  await mod.bumpStats(env, entry, { timezone_offset_minutes: 480 });
  const after = JSON.parse(r2.map.get(statsKey).value);
  assert.equal(after.requests, before.requests + 6, '并发 +5 与本次 +1 都不应丢');
  assert.equal(after.tokens, before.tokens + 10, '并发 +7 与本次 +3 都不应丢');

  // bumpKeyUsage：同理
  await r2.put(
    'data/keys.json',
    JSON.stringify([
      {
        id: 'gw-occ',
        key_hash: sha256('sk-occ-1'),
        key_prefix: 'sk-occ-1',
        name: 'occ',
        enabled: true,
        used_tokens: 20,
        requests: 2,
        used_cost: 0,
      },
    ])
  );
  r2.armConflict('data/keys.json', (raw) => {
    const v = JSON.parse(raw);
    v[0].used_tokens += 5;
    return JSON.stringify(v);
  });
  await mod.bumpKeyUsage(env, { admin: false, record: { key_hash: sha256('sk-occ-1') } }, 3, 0);
  const keysAfter = JSON.parse(r2.map.get('data/keys.json').value);
  assert.equal(keysAfter[0].used_tokens, 28, '并发 +5 与本次 +3 都不应丢');
  assert.equal(keysAfter[0].requests, 3, '请求数应 +1');
  console.log('ok 7) OCC：条件写 412 返回 false；bumpStats/bumpKeyUsage 遇冲突重试后计数不丢');
}

console.log('security: all passed');
