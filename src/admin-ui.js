/**
 * 管理后台页面（纯 HTML，无构建步骤，直接由 Worker 返回）
 * 注意：本文件是 JS 模板字符串，内嵌 <script> 中请勿使用反引号与 ${}。
 */
export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OneAPI Gateway · 管理后台</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #0f1420; color: #e6eaf2; }
  header { padding: 18px 24px; background: #161d2e; border-bottom: 1px solid #263049; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 18px; margin: 0; }
  header span { color: #8b94a7; font-size: 13px; }
  .bar { padding: 14px 24px; display: flex; gap: 10px; align-items: center; background: #131a2b; border-bottom: 1px solid #263049; flex-wrap: wrap; }
  .bar input[type=password], .bar input[type=text], .bar input[type=date], .bar input[type=number] { background: #0b101c; border: 1px solid #2c3654; color: #e6eaf2; padding: 8px 10px; border-radius: 6px; }
  button { background: #2f6bff; border: none; color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
  button.ghost { background: #232c45; }
  button.danger { background: #c0364b; }
  button:disabled { opacity: .5; cursor: default; }
  nav { padding: 12px 24px 0; display: flex; gap: 8px; }
  nav button.on { background: #2f6bff; }
  main { padding: 18px 24px 60px; max-width: 1100px; }
  .tab { display: none; }
  .tab.on { display: block; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid #232c45; vertical-align: top; }
  th { color: #8b94a7; font-weight: 500; }
  td.mono { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
  .card { background: #161d2e; border: 1px solid #263049; border-radius: 10px; padding: 18px; margin-top: 16px; }
  .card h3 { margin: 0 0 12px; font-size: 15px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #aab3c7; }
  .grid input, .grid textarea, .grid select { background: #0b101c; border: 1px solid #2c3654; color: #e6eaf2; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
  .row { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
  .check { flex-direction: row !important; align-items: center; }
  #status { font-size: 13px; }
  #status.ok { color: #4ade80; }
  #status.bad { color: #f87171; }
  pre.detail { background: #0b101c; border: 1px solid #2c3654; padding: 12px; border-radius: 8px; overflow: auto; max-height: 420px; font-size: 12px; }
  .help p, .help li { font-size: 14px; line-height: 1.8; color: #c3cadb; }
  .help code { background: #0b101c; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header><h1>OneAPI Gateway</h1><span>管理后台 · 渠道 / 密钥 / 日志</span></header>
<div class="bar">
  <label>Admin Key <input id="ak" type="password" placeholder="输入 ADMIN_KEY" style="width:260px"></label>
  <button id="btnConnect">连接</button>
  <span id="status"></span>
</div>
<nav>
  <button data-tab="channels" class="on">渠道管理</button>
  <button data-tab="keys">密钥管理</button>
  <button data-tab="logs">请求日志</button>
  <button data-tab="help">使用说明</button>
</nav>
<main>
  <section id="t-channels" class="tab on">
    <div class="row"><button id="btnNewCh" class="ghost">＋ 添加渠道</button></div>
    <div id="chList"></div>
    <div class="card" id="chForm" style="display:none">
      <h3 id="chFormTitle">添加渠道</h3>
      <div class="grid">
        <label>名称<input id="f_name" placeholder="如：OpenAI 官方"></label>
        <label>渠道类型<select id="f_type"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 原生</option></select></label>
        <label>Base URL<input id="f_base" placeholder="https://api.openai.com"></label>
        <label>渠道 API Key<input id="f_key" type="password" placeholder="sk-... / sk-ant-..."></label>
        <label>支持的模型（逗号分隔，* 表示全部）<input id="f_models" placeholder="gpt-4o-mini,gpt-4o 或 *"></label>
        <label>默认 max_tokens（Anthropic 渠道必需）<input id="f_maxt" type="number" value="4096"></label>
        <label>优先级（数字越小越优先）<input id="f_prio" type="number" value="100"></label>
        <label class="check"><input id="f_enabled" type="checkbox" checked> 启用</label>
      </div>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:#aab3c7;margin-top:12px">模型映射（可选 JSON：网关模型名 → 渠道真实模型名）<textarea id="f_map" rows="2" placeholder='{"gpt-4o-mini": "gpt-4o-mini"}'></textarea></label>
      <div class="row">
        <button id="btnSaveCh">保存</button>
        <button id="btnCancelCh" class="ghost">取消</button>
      </div>
    </div>
  </section>
  <section id="t-keys" class="tab">
    <div class="row"><button id="btnNewKey">＋ 生成新密钥</button></div>
    <div id="keyList"></div>
  </section>
  <section id="t-logs" class="tab">
    <div class="row">
      <input type="date" id="logDate">
      <button id="btnLogs" class="ghost">查询</button>
    </div>
    <div id="logList"></div>
    <pre class="detail" id="logDetail" style="display:none"></pre>
  </section>
  <section id="t-help" class="tab help">
    <div class="card">
      <h3>快速开始</h3>
      <p>1. 在「渠道管理」添加上游渠道（OpenAI / DeepSeek / Moonshot 等 OpenAI 兼容接口均可，只需填写对应的 <code>Base URL</code> 与 <code>API Key</code>）。</p>
      <p>2. 在「密钥管理」生成网关密钥，分发给调用方。</p>
      <p>3. 调用方使用 OpenAI 兼容方式调用：<code>POST https://你的域名/v1/chat/completions</code>，Header 携带 <code>Authorization: Bearer &lt;网关密钥&gt;</code>。</p>
      <p>网关会按模型匹配可用渠道，失败时按优先级自动切换到下一个渠道；非流式请求的 token 用量会自动累加到密钥上，可在密钥管理中设置配额。</p>
      <p>渠道类型说明：<code>OpenAI 兼容</code>直接透传；<code>Anthropic 原生</code>走 Anthropic 的 <code>/v1/messages</code> 接口，网关自动完成 OpenAI ↔ Anthropic 格式互转（文本、图片、tools、流式 SSE 均支持），调用方始终使用 OpenAI 格式。Anthropic 渠道需要填写「默认 max_tokens」（Anthropic 接口必填），且仅支持 <code>/v1/chat/completions</code>。</p>
      <p>R2 存储结构：<code>data/channels.json</code>（渠道）、<code>data/keys.json</code>（密钥）、<code>logs/&lt;日期&gt;/</code>（请求日志）。</p>
    </div>
  </section>
</main>
<script>
var AK = localStorage.getItem('og_admin_key') || '';
var channels = [], keys = [], editingCh = -1;

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function setStatus(t, ok) {
  var el = $('status'); el.textContent = t;
  el.className = ok === true ? 'ok' : (ok === false ? 'bad' : '');
}
function api(path, method, body) {
  var opt = { method: method || 'GET', headers: { 'X-Admin-Key': AK } };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(path, opt).then(function (r) {
    return r.json().catch(function () { return { error: { message: '响应解析失败' } }; }).then(function (d) {
      if (!r.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
      return d;
    });
  });
}
function saveChannels() { return api('/api/admin/channels', 'POST', { channels: channels }); }
function saveKeys() { return api('/api/admin/keys', 'POST', { keys: keys }); }

/* ---- tabs ---- */
document.querySelectorAll('nav button').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('nav button').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    document.querySelectorAll('.tab').forEach(function (s) { s.classList.remove('on'); });
    $('t-' + b.getAttribute('data-tab')).classList.add('on');
  });
});

/* ---- channels ---- */
function renderChannels() {
  var h = '<table><tr><th>名称</th><th>类型</th><th>Base URL</th><th>模型</th><th>优先级</th><th>状态</th><th>操作</th></tr>';
  channels.forEach(function (c, i) {
    h += '<tr><td>' + esc(c.name) + '</td><td>' + (c.type === 'anthropic' ? 'Anthropic原生' : 'OpenAI兼容') +
      '</td><td class="mono">' + esc(c.base_url) + '</td><td class="mono">' +
      esc((c.models || []).join(', ')) + '</td><td>' + esc(c.priority) + '</td><td>' +
      (c.enabled ? '✅' : '❌') + '</td><td><button class="ghost" onclick="editChannel(' + i + ')">编辑</button> ' +
      '<button class="danger" onclick="delChannel(' + i + ')">删除</button></td></tr>';
  });
  $('chList').innerHTML = h + '</table>';
}
function openChForm(i) {
  editingCh = i;
  $('chFormTitle').textContent = i >= 0 ? '编辑渠道' : '添加渠道';
  var c = i >= 0 ? channels[i] : { name: '', type: 'openai', base_url: 'https://api.openai.com', api_key: '', models: [], model_map: {}, default_max_tokens: 4096, priority: 100, enabled: true };
  $('f_name').value = c.name || ''; $('f_type').value = c.type || 'openai';
  $('f_base').value = c.base_url || '';
  $('f_key').value = c.api_key || ''; $('f_models').value = (c.models || []).join(',');
  $('f_maxt').value = c.default_max_tokens || 4096;
  $('f_prio').value = c.priority == null ? 100 : c.priority;
  $('f_enabled').checked = c.enabled !== false;
  $('f_map').value = c.model_map && Object.keys(c.model_map).length ? JSON.stringify(c.model_map) : '';
  $('chForm').style.display = 'block';
  window.scrollTo(0, document.body.scrollHeight);
}
window.editChannel = function (i) { openChForm(i); };
window.delChannel = function (i) {
  if (!confirm('确定删除渠道「' + channels[i].name + '」？')) return;
  channels.splice(i, 1);
  saveChannels().then(loadChannels).catch(function (e) { alert(e.message); });
};
$('btnNewCh').addEventListener('click', function () { openChForm(-1); });
$('btnCancelCh').addEventListener('click', function () { $('chForm').style.display = 'none'; });
$('btnSaveCh').addEventListener('click', function () {
  var map = {};
  var raw = $('f_map').value.trim();
  if (raw) { try { map = JSON.parse(raw); } catch (e) { alert('模型映射不是合法 JSON'); return; } }
  var c = {
    id: editingCh >= 0 ? channels[editingCh].id : 'ch_' + Date.now().toString(36),
    name: $('f_name').value.trim() || '未命名渠道',
    type: $('f_type').value || 'openai',
    base_url: $('f_base').value.trim().replace(/\\/+$/, ''),
    api_key: $('f_key').value.trim(),
    models: $('f_models').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    model_map: map,
    default_max_tokens: parseInt($('f_maxt').value, 10) || 4096,
    priority: parseInt($('f_prio').value, 10) || 100,
    enabled: $('f_enabled').checked
  };
  if (editingCh >= 0) channels[editingCh] = c; else channels.push(c);
  saveChannels().then(function () { $('chForm').style.display = 'none'; loadChannels(); })
    .catch(function (e) { alert(e.message); });
});
function loadChannels() { return api('/api/admin/channels').then(function (d) { channels = d; renderChannels(); }); }

/* ---- keys ---- */
function mask(k) { return k.length > 10 ? k.slice(0, 7) + '...' + k.slice(-4) : k; }
function renderKeys() {
  var h = '<table><tr><th>名称</th><th>Key</th><th>配额(tokens)</th><th>已用(tokens)</th><th>请求数</th><th>状态</th><th>操作</th></tr>';
  keys.forEach(function (k, i) {
    h += '<tr><td>' + esc(k.name) + '</td><td class="mono">' + esc(mask(k.key)) +
      ' <button class="ghost" onclick="copyKey(' + i + ')">复制</button></td><td>' +
      (k.quota_tokens > 0 ? esc(k.quota_tokens) : '不限') + '</td><td>' + esc(k.used_tokens || 0) +
      '</td><td>' + esc(k.requests || 0) + '</td><td>' + (k.enabled !== false ? '✅' : '❌') + '</td><td>' +
      '<button class="ghost" onclick="toggleKey(' + i + ')">' + (k.enabled !== false ? '禁用' : '启用') + '</button> ' +
      '<button class="danger" onclick="delKey(' + i + ')">删除</button></td></tr>';
  });
  $('keyList').innerHTML = h + '</table>';
}
function genKey() {
  var a = new Uint8Array(24); crypto.getRandomValues(a);
  return 'sk-' + Array.from(a).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}
window.copyKey = function (i) {
  navigator.clipboard.writeText(keys[i].key).then(function () { setStatus('已复制到剪贴板', true); });
};
window.toggleKey = function (i) {
  keys[i].enabled = keys[i].enabled === false ? true : false;
  saveKeys().then(loadKeys).catch(function (e) { alert(e.message); });
};
window.delKey = function (i) {
  if (!confirm('确定删除该密钥？')) return;
  keys.splice(i, 1);
  saveKeys().then(loadKeys).catch(function (e) { alert(e.message); });
};
$('btnNewKey').addEventListener('click', function () {
  var name = prompt('给这个密钥起个名字：', '默认密钥');
  if (name === null) return;
  var q = prompt('Token 配额（0 表示不限）：', '0');
  keys.push({ key: genKey(), name: name || '未命名', enabled: true,
    quota_tokens: parseInt(q, 10) || 0, used_tokens: 0, requests: 0,
    created_at: new Date().toISOString() });
  saveKeys().then(function () { loadKeys(); setStatus('新密钥已生成，请及时复制保存', true); })
    .catch(function (e) { alert(e.message); });
});
function loadKeys() { return api('/api/admin/keys').then(function (d) { keys = d; renderKeys(); }); }

/* ---- logs ---- */
function loadLogs() {
  var date = $('logDate').value;
  $('logDetail').style.display = 'none';
  api('/api/admin/logs?date=' + encodeURIComponent(date)).then(function (d) {
    var h = '<table><tr><th>时间</th><th>Key</th><th>模型</th><th>渠道</th><th>结果</th><th>操作</th></tr>';
    if (!d.keys.length) h += '<tr><td colspan="6" style="color:#8b94a7">当天暂无日志</td></tr>';
    d.keys.forEach(function (k) {
      var parts = k.split('/'); var fname = parts[parts.length - 1];
      h += '<tr><td class="mono">' + esc(fname) + '</td><td colspan="4" class="mono">' + esc(k) +
        '</td><td><button class="ghost" onclick="viewLog(\\'' + k.replace(/'/g, "\\\\'") + '\\')">查看</button></td></tr>';
    });
    $('logList').innerHTML = h + '</table>' + (d.truncated ? '<p style="color:#8b94a7">仅显示最近 100 条</p>' : '');
  }).catch(function (e) { alert(e.message); });
}
window.viewLog = function (k) {
  api('/api/admin/log?key=' + encodeURIComponent(k)).then(function (d) {
    var el = $('logDetail'); el.style.display = 'block';
    el.textContent = JSON.stringify(d, null, 2);
  }).catch(function (e) { alert(e.message); });
};
$('btnLogs').addEventListener('click', loadLogs);

/* ---- connect ---- */
function connect() {
  AK = $('ak').value.trim();
  if (!AK) { setStatus('请先输入 Admin Key', false); return; }
  localStorage.setItem('og_admin_key', AK);
  setStatus('连接中…');
  Promise.all([loadChannels(), loadKeys()]).then(function () {
    setStatus('连接成功', true);
    var d = new Date(); $('logDate').value = d.toISOString().slice(0, 10);
    loadLogs();
  }).catch(function (e) { setStatus('连接失败：' + e.message, false); });
}
$('btnConnect').addEventListener('click', connect);
$('ak').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
(function init() {
  $('ak').value = AK;
  var d = new Date(); $('logDate').value = d.toISOString().slice(0, 10);
  if (AK) connect();
})();
</script>
</body>
</html>`;
