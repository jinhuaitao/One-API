/**
 * 回归：登录检查卡死（/admin 一直显示「正在检查登录状态…」）。
 *
 * 根因：fetchJson 没有超时，bootAuth 调 /api/auth/state 一旦没回音，
 * 登录遮罩就永远停在初始文案，既不报错也没有重试入口。
 * 修复：fetchJson 支持 AbortController 超时（默认 30s），bootAuth 用 8s、
 * connect 用 15s，init 再加 12s 看门狗兜底。
 *
 * 测法：把 ADMIN_HTML 里的 <script> 抽出来，在 vm 里用最小假 DOM 跑起来，
 * fetch 换成永不 resolve 的桩，断言 8s 超时后页面变成离线页（带重试按钮）；
 * 再测 fetch 正常返回时能正常进初始化表单。
 * 运行：node test/login-timeout.mjs
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';

const { ADMIN_HTML } = await import('../src/admin-ui.js');
const m = ADMIN_HTML.match(/<script>([\s\S]*)<\/script>/);
assert.ok(m, 'ADMIN_HTML 里应包含 <script>');
const scriptText = m[1];

// 0) 内联脚本必须能解析：2.6.0 的 TOTP 备用码文案里有个模板字面量转义错误
//（`\n` 写成了单个反斜杠，输出成真换行，单引号字符串被截断），
// 导致整个 <script> 解析失败、init()/bootAuth() 一次都没跑，
// /admin 永远停在初始文案「正在检查登录状态…」。这是本次卡死的直接根因。
assert.doesNotThrow(
  () => new Function(scriptText),
  'ADMIN_HTML 内联脚本应能解析（单引号字符串里不能有真换行）'
);
console.log('ok 0) 内联脚本可解析');

function makeEl(id) {
  const classes = new Set(id === 'login' ? ['on'] : []);
  return {
    id,
    style: {},
    dataset: {},
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    title: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {},
    remove() {},
    focus() {},
    click() {},
  };
}

/** 跑一次前端脚本，返回桩元素与 fetch 调用记录。 */
function runPage(fetchStub) {
  const els = new Map();
  const getEl = (id) => {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  };
  const storage = new Map();
  const storeStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const documentStub = {
    getElementById: getEl,
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(tag),
    documentElement: { setAttribute() {}, getAttribute: () => 'dark' },
    body: { appendChild() {} },
  };
  const windowStub = {
    localStorage: storeStub,
    sessionStorage: storeStub,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {},
  };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: fetchStub,
    AbortController,
    document: documentStub,
    window: windowStub,
    navigator: {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { filename: 'admin-ui-inline.js' });
  return { els, getEl };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) /api/auth/state 永不返回：8s 超时后应显示离线页（带重试按钮），而不是一直卡住
{
  const calls = [];
  // 永不返回正常响应，但 abort 时按真实 fetch 一样以 AbortError 拒绝，
  // 否则 fetchJson 的超时分支永远走不到（这是桩的责任，不是被测代码的）。
  const fetchStub = (url, opt) =>
    new Promise((resolve, reject) => {
      calls.push({ url, signal: opt && opt.signal });
      if (opt && opt.signal) {
        opt.signal.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      }
    });
  const { getEl } = runPage(fetchStub);
  assert.equal(calls.length, 1, '初始化应恰好请求一次 /api/auth/state');
  assert.equal(calls[0].url, '/api/auth/state');
  assert.ok(calls[0].signal, '请求应带 AbortSignal（可超时取消）');
  await sleep(9500);
  assert.equal(calls[0].signal.aborted, true, '8s 超时后请求应被 abort');
  assert.equal(
    getEl('authSub').textContent,
    '请检查网络或稍后重试',
    '超时后应显示离线页副标题，而不是一直停在「正在检查登录状态…」'
  );
  assert.ok(
    getEl('authBox').innerHTML.includes('auth-retry'),
    '超时后离线页应有重试按钮'
  );
  console.log('ok 1) /api/auth/state 无响应：8s 超时后显示离线页 + 重试按钮');
}

// 2) /api/auth/state 正常返回未初始化：应正常进入初始化表单
{
  const fetchStub = async () => ({
    ok: true,
    json: async () => ({
      initialized: false,
      allow_registration: false,
      allow_password_recovery: true,
      admin_key_configured: false,
    }),
  });
  const { getEl } = runPage(fetchStub);
  await sleep(300);
  assert.equal(getEl('authTitle').textContent, '初始化管理员账号');
  assert.ok(getEl('authBox').innerHTML.includes('auth-setup'), '应显示创建管理员账号表单');
  console.log('ok 2) /api/auth/state 正常返回：进入初始化表单');
}

console.log('login-timeout: all passed');
