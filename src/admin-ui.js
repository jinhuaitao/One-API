/**
 * 管理后台（专业控制台风格，无构建步骤，直接由 Worker 返回）
 * 注意：本文件是 JS 模板字符串，内嵌 <script> 中请勿使用反引号、${}，
 * 正则中的反斜杠需写成双反斜杠（如 /\\/+$/）。
 */
export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OneAPI Gateway · 控制台</title>
<style>
  :root{
    --bg:#0c1120; --panel:#141b2f; --panel2:#0f1526; --border:#243052;
    --text:#e9edf6; --muted:#8b94ad; --accent:#5b8cff; --accent2:#7c6bff;
    --ok:#34d399; --bad:#f87171; --warn:#fbbf24;
  }
  *{box-sizing:border-box}
  body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;margin:0;background:var(--bg);color:var(--text);font-size:14px}
  .app{display:flex;min-height:100vh}
  /* ---- sidebar ---- */
  .sidebar{width:232px;flex-shrink:0;background:linear-gradient(180deg,#111a35,#0b1024);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
  .brand{padding:22px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
  .logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:15px;flex-shrink:0}
  .brand b{font-size:15px;display:block}
  .brand span{font-size:11px;color:var(--muted)}
  .nav{padding:14px 12px;display:flex;flex-direction:column;gap:4px;flex:1}
  .navbtn{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;color:var(--muted);padding:11px 12px;border-radius:8px;cursor:pointer;font-size:14px;text-align:left}
  .navbtn:hover{background:#1a2340;color:var(--text)}
  .navbtn.on{background:linear-gradient(90deg,rgba(91,140,255,.22),rgba(124,107,255,.12));color:#fff}
  .navbtn .nd{width:8px;height:8px;border-radius:50%;background:#3a4568;flex-shrink:0}
  .navbtn.on .nd{background:var(--accent)}
  .side-foot{padding:16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
  .side-foot button{width:100%;margin-top:8px}
  /* ---- main ---- */
  main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{padding:16px 28px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:rgba(15,21,38,.7);position:sticky;top:0;z-index:10}
  .topbar h2{margin:0;font-size:17px}
  .topbar .right{display:flex;gap:10px;align-items:center}
  .pill{font-size:12px;padding:5px 12px;border-radius:20px;background:#232c45;color:var(--muted)}
  .pill.ok{background:rgba(52,211,153,.14);color:var(--ok)}
  .pill.bad{background:rgba(248,113,113,.14);color:var(--bad)}
  .content{padding:24px 28px;max-width:1180px;width:100%;margin:0 auto}
  .tab{display:none}.tab.on{display:block}
  /* ---- stats ---- */
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px}
  .stat .num{font-size:26px;font-weight:700;margin-top:6px}
  .stat .label{color:var(--muted);font-size:13px}
  .stat .sub{font-size:12px;color:var(--muted);margin-top:4px}
  /* ---- cards & tables ---- */
  .card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:18px}
  .card h3{margin:0 0 4px;font-size:15px}
  .card .desc{color:var(--muted);font-size:13px;margin:0 0 8px}
  .toolbar{display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap;align-items:center}
  .toolbar .spacer{flex:1}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #1d2742;vertical-align:middle}
  th{color:var(--muted);font-weight:500;font-size:12px;white-space:nowrap}
  tbody tr:hover{background:#16203a}
  td.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;color:#c3cadb}
  .ops{white-space:nowrap}
  .ops button{margin-right:6px}
  .empty{padding:36px 10px;text-align:center;color:var(--muted)}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;background:#232c45;color:#aab3c7;white-space:nowrap}
  .badge.ok{background:rgba(52,211,153,.14);color:var(--ok)}
  .badge.bad{background:rgba(248,113,113,.14);color:var(--bad)}
  .badge.info{background:rgba(91,140,255,.14);color:#7aa5ff}
  .chip{display:inline-block;padding:2px 8px;border-radius:6px;background:#1c2540;font-size:12px;margin:1px 3px 1px 0;color:#c3cadb;font-family:ui-monospace,monospace}
  .dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0}
  .dot.ok{background:var(--ok);box-shadow:0 0 8px rgba(52,211,153,.7)}
  .dot.off{background:#3a4568}
  .chrow{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #1d2742}
  .chrow:last-child{border-bottom:none}
  .chmain{flex:1;min-width:0}.chmain b{display:block}.chmain span{font-size:12px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* ---- buttons / inputs ---- */
  button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;color:#fff;padding:9px 16px;border-radius:8px;cursor:pointer;font-size:13px}
  button:hover{filter:brightness(1.08)}
  button:disabled{opacity:.55;cursor:default}
  button.ghost{background:#202a48}
  button.danger{background:#a33244}
  button.sm{padding:6px 11px;font-size:12px;border-radius:6px}
  input[type=text],input[type=password],input[type=date],input[type=number],textarea,select{background:#0b101c;border:1px solid #2c3654;color:var(--text);padding:9px 11px;border-radius:8px;font-size:13px;width:100%}
  input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}
  .grid label,.fld{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#aab3c7}
  .fld{margin-top:14px}
  .check{flex-direction:row !important;align-items:center;gap:8px !important}
  .check input{width:auto}
  .row{display:flex;gap:10px;margin-top:16px;align-items:center;flex-wrap:wrap}
  .row.end{justify-content:flex-end}
  .switch{position:relative;display:inline-block;width:38px;height:22px;flex-shrink:0}
  .switch input{display:none}
  .switch span{position:absolute;inset:0;background:#2a3350;border-radius:11px;transition:.2s;cursor:pointer}
  .switch span:before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;background:#8b94ad;border-radius:50%;transition:.2s}
  .switch input:checked+span{background:var(--accent)}
  .switch input:checked+span:before{left:19px;background:#fff}
  .quota{display:flex;align-items:center;gap:8px;min-width:120px}
  .progress{flex:1;height:6px;background:#0b101c;border-radius:3px;overflow:hidden}
  .progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px}
  .kv{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #1d2742;font-size:14px}
  .kv span{color:var(--muted)}
  .good{color:var(--ok)} .bad{color:var(--bad)} .muted{color:var(--muted)}
  pre.detail{background:#0b101c;border:1px solid #2c3654;padding:14px;border-radius:8px;overflow:auto;max-height:420px;font-size:12px;line-height:1.6}
  /* ---- modal / toast / login ---- */
  .modal-overlay{position:fixed;inset:0;background:rgba(4,8,18,.72);display:none;align-items:center;justify-content:center;z-index:60;padding:16px}
  .modal{background:#141b2f;border:1px solid var(--border);border-radius:14px;padding:24px;width:min(600px,94vw);max-height:88vh;overflow:auto}
  .modal h3{margin:0 0 10px;font-size:16px}
  #toasts{position:fixed;right:20px;bottom:20px;z-index:99;display:flex;flex-direction:column;gap:10px;max-width:min(360px,90vw)}
  .toast{background:#1a2342;border:1px solid var(--border);border-left:3px solid var(--accent);padding:12px 16px;border-radius:8px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .3s,transform .3s}
  .toast.ok{border-left-color:var(--ok)} .toast.bad{border-left-color:var(--bad)}
  .toast.out{opacity:0;transform:translateX(20px)}
  .login-overlay{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;background:radial-gradient(1000px 600px at 50% 20%,#16224a 0%,#0b1024 60%)}
  .login-card{background:#141b2f;border:1px solid var(--border);border-radius:16px;padding:36px;width:min(400px,92vw);text-align:center}
  .login-card .logo{margin:0 auto 16px;width:46px;height:46px;font-size:19px}
  .login-card h2{margin:0 0 6px;font-size:18px}
  .login-card p{color:var(--muted);font-size:13px;margin:0 0 18px}
  .login-card input{margin-bottom:12px;text-align:center}
  .login-card button{width:100%}
  .help h4{margin:18px 0 8px;font-size:14px}
  .help p,.help li{font-size:13.5px;line-height:1.85;color:#c3cadb}
  .help code{background:#0b101c;padding:2px 7px;border-radius:5px;font-size:12px;color:#9db8ff}
  .help ol,.help ul{padding-left:20px;margin:6px 0}
  @media (max-width:900px){
    .app{flex-direction:column}
    .sidebar{width:100%;height:auto;position:static}
    .nav{flex-direction:row;overflow-x:auto;padding:10px}
    .navbtn{white-space:nowrap;width:auto}
    .side-foot{display:none}
    .stats{grid-template-columns:1fr 1fr}
    .grid{grid-template-columns:1fr}
    .content{padding:16px}
  }
</style>
</head>
<body>

<div class="login-overlay" id="login">
  <div class="login-card">
    <div class="logo">OG</div>
    <h2>OneAPI Gateway</h2>
    <p>请输入 Admin Key 以进入管理控制台</p>
    <input id="ak" type="password" placeholder="Admin Key" autocomplete="off">
    <button id="btnLogin">进入控制台</button>
  </div>
</div>

<div class="app">
  <aside class="sidebar">
    <div class="brand"><div class="logo">OG</div><div><b>OneAPI Gateway</b><span>管理控制台</span></div></div>
    <nav class="nav">
      <button class="navbtn on" data-tab="overview"><span class="nd"></span>概览</button>
      <button class="navbtn" data-tab="channels"><span class="nd"></span>渠道管理</button>
      <button class="navbtn" data-tab="keys"><span class="nd"></span>密钥管理</button>
      <button class="navbtn" data-tab="logs"><span class="nd"></span>请求日志</button>
      <button class="navbtn" data-tab="help"><span class="nd"></span>使用说明</button>
    </nav>
    <div class="side-foot">v1.1.0 · 数据存储于 R2<button class="ghost sm" id="btnLogout">退出登录</button></div>
  </aside>
  <main>
    <div class="topbar">
      <h2 id="pageTitle">概览</h2>
      <div class="right"><span class="pill" id="connPill">未连接</span></div>
    </div>
    <div class="content">

      <section id="t-overview" class="tab on">
        <div class="stats">
          <div class="stat"><div class="label">渠道总数</div><div class="num" id="stChannels">-</div><div class="sub" id="stEnabledSub"></div></div>
          <div class="stat"><div class="label">网关密钥</div><div class="num" id="stKeys">-</div><div class="sub">累计发放</div></div>
          <div class="stat"><div class="label">累计请求</div><div class="num" id="stReqs">-</div><div class="sub">所有密钥</div></div>
          <div class="stat"><div class="label">累计 Tokens</div><div class="num" id="stTokens">-</div><div class="sub">非流式统计</div></div>
        </div>
        <div class="card">
          <h3>渠道状态</h3>
          <p class="desc">所有上游渠道的一览，点击「管理」跳转到渠道管理进行测试与编辑</p>
          <div id="ovChannels"></div>
        </div>
      </section>

      <section id="t-channels" class="tab">
        <div class="card">
          <div class="toolbar">
            <h3 style="margin:0">渠道列表</h3>
            <div class="spacer"></div>
            <button class="ghost sm" id="btnExport">导出配置</button>
            <button class="ghost sm" id="btnImport">导入配置</button>
            <input type="file" id="fileImport" accept=".json,application/json" style="display:none">
            <button class="sm" id="btnAddCh">＋ 添加渠道</button>
          </div>
          <p class="desc">按模型匹配渠道，失败时按优先级自动故障转移。Anthropic 原生渠道会自动完成 OpenAI 格式互转。</p>
          <div id="chTable"></div>
        </div>
      </section>

      <section id="t-keys" class="tab">
        <div class="card">
          <div class="toolbar">
            <h3 style="margin:0">密钥列表</h3>
            <div class="spacer"></div>
            <button class="sm" id="btnNewKey">＋ 生成密钥</button>
          </div>
          <p class="desc">将密钥分发给调用方，在请求头中携带 <span class="chip">Authorization: Bearer &lt;key&gt;</span> 即可调用网关。</p>
          <div id="keyTable"></div>
        </div>
      </section>

      <section id="t-logs" class="tab">
        <div class="card">
          <div class="toolbar">
            <h3 style="margin:0">请求日志</h3>
            <div class="spacer"></div>
            <input type="date" id="logDate" style="width:auto">
            <button class="ghost sm" id="btnLoadLogs">查询</button>
          </div>
          <p class="desc">按天查看经网关转发的请求记录（最近 100 条），点击「详情」查看完整日志。</p>
          <div id="logTable"></div>
        </div>
      </section>

      <section id="t-help" class="tab">
        <div class="card help">
          <h3>快速上手</h3>
          <ol>
            <li>在「渠道管理」添加上游渠道：<code>OpenAI 兼容</code>（OpenAI / DeepSeek / Moonshot 等）或 <code>Anthropic 原生</code>（Base URL 填 <code>https://api.anthropic.com</code>）。<b>注意：Base URL 不要带末尾的 <code>/v1</code></b>，网关会自动拼接路径。</li>
            <li>点击渠道行的「测试」验证连通性，确认返回成功后再启用。</li>
            <li>在「密钥管理」生成网关密钥，分发给调用方。</li>
            <li>调用方使用 OpenAI 兼容方式调用（Anthropic 渠道也一样，网关自动翻译格式）。</li>
          </ol>
          <h4>调用示例</h4>
          <p><code>POST https://你的域名/v1/chat/completions</code>，请求头携带 <code>Authorization: Bearer &lt;网关密钥&gt;</code>，请求体与 OpenAI 完全一致，支持 <code>stream: true</code> 流式输出。</p>
          <h4>渠道说明</h4>
          <ul>
            <li><b>模型匹配</b>：按请求的 <code>model</code> 匹配渠道的模型列表，<code>*</code> 表示匹配全部。</li>
            <li><b>模型映射</b>：网关模型名 → 渠道真实模型名，例如对外叫 <code>gpt-4o-mini</code>，实际走渠道的 <code>gpt-4o-mini-2024</code>。</li>
            <li><b>故障转移</b>：按优先级（数字越小越优先）依次尝试，全部失败才返回错误。</li>
            <li><b>Anthropic 渠道</b>：仅支持 <code>/v1/chat/completions</code>；<code>max_tokens</code> 必需（取请求值，否则用渠道默认值）；<code>temperature</code> 自动钳制到 0~1。</li>
          </ul>
          <h4>数据存储</h4>
          <p>R2 存储结构：<code>data/channels.json</code>（渠道）、<code>data/keys.json</code>（密钥）、<code>logs/&lt;日期&gt;/</code>（请求日志）。可在渠道页「导出配置」备份。</p>
        </div>
      </section>

    </div>
  </main>
</div>

<div class="modal-overlay" id="modal"><div class="modal" id="modalBox"></div></div>
<div id="toasts"></div>

<script>
var AK = localStorage.getItem('og_admin_key') || '';
var S = { channels: [], keys: [], logs: [] };
var editingCh = -1;
var TITLES = { overview:'概览', channels:'渠道管理', keys:'密钥管理', logs:'请求日志', help:'使用说明' };

function $(id){ return document.getElementById(id); }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function fmtNum(n){ return Number(n || 0).toLocaleString('en-US'); }
function fmtTime(iso){
  if(!iso) return '-';
  var d = new Date(iso);
  function p(x){ return (x < 10 ? '0' : '') + x; }
  return (d.getMonth()+1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function fmtMs(ms){ ms = Number(ms || 0); return ms >= 1000 ? (ms/1000).toFixed(1) + 's' : ms + 'ms'; }
function maskKey(k){ k = String(k || ''); return k.length > 12 ? k.slice(0,7) + '...' + k.slice(-4) : k; }
function genKey(){
  var a = new Uint8Array(24); crypto.getRandomValues(a);
  return 'sk-' + Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
}

function toast(msg, type){
  var el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(function(){ el.classList.add('out'); setTimeout(function(){ el.remove(); }, 350); }, 3600);
}
function api(path, method, body){
  var opt = { method: method || 'GET', headers: { 'X-Admin-Key': AK } };
  if(body !== undefined){ opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(path, opt).then(function(r){
    return r.json().catch(function(){ return { error: { message: '响应解析失败' } }; }).then(function(d){
      if(!r.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
      return d;
    });
  });
}
function saveChannels(){ return api('/api/admin/channels', 'POST', { channels: S.channels }); }
function saveKeys(){ return api('/api/admin/keys', 'POST', { keys: S.keys }); }

function openModal(html){ $('modalBox').innerHTML = html; $('modal').style.display = 'flex'; }
function closeModal(){ $('modal').style.display = 'none'; $('modalBox').innerHTML = ''; }
window.closeModal = closeModal;
$('modal').addEventListener('click', function(e){ if(e.target === $('modal')) closeModal(); });
function confirmDlg(title, text){
  return new Promise(function(resolve){
    openModal('<h3>' + esc(title) + '</h3><p class="muted">' + esc(text) + '</p>' +
      '<div class="row end"><button class="ghost" id="cfNo">取消</button><button class="danger" id="cfYes">确定</button></div>');
    $('cfNo').onclick = function(){ closeModal(); resolve(false); };
    $('cfYes').onclick = function(){ closeModal(); resolve(true); };
  });
}

/* ---------- 登录 ---------- */
function setConn(ok, msg){
  var pill = $('connPill');
  pill.className = 'pill ' + (ok ? 'ok' : 'bad');
  pill.textContent = msg;
}
function connect(silent){
  if(!AK){
    if(!silent) toast('请先输入 Admin Key', 'bad');
    $('login').style.display = 'flex';
    return;
  }
  setConn(true, '连接中…');
  Promise.all([api('/api/admin/channels'), api('/api/admin/keys')]).then(function(res){
    S.channels = res[0]; S.keys = res[1];
    localStorage.setItem('og_admin_key', AK);
    $('login').style.display = 'none';
    setConn(true, '已连接');
    renderAll();
  }).catch(function(e){
    setConn(false, '连接失败');
    if(!silent) toast('连接失败：' + e.message, 'bad');
    $('login').style.display = 'flex';
  });
}

/* ---------- 导航 ---------- */
function gotoTab(t){
  document.querySelectorAll('.navbtn').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-tab') === t); });
  document.querySelectorAll('.tab').forEach(function(s){ s.classList.remove('on'); });
  $('t-' + t).classList.add('on');
  $('pageTitle').textContent = TITLES[t];
  if(t === 'logs') loadLogs();
  if(t === 'overview') renderOverview();
}
document.querySelectorAll('.navbtn').forEach(function(b){
  b.addEventListener('click', function(){ gotoTab(b.getAttribute('data-tab')); });
});

/* ---------- 概览 ---------- */
function renderOverview(){
  var ch = S.channels, keys = S.keys;
  var en = ch.filter(function(c){ return c.enabled; }).length;
  var tokens = keys.reduce(function(a,k){ return a + (k.used_tokens || 0); }, 0);
  var reqs = keys.reduce(function(a,k){ return a + (k.requests || 0); }, 0);
  $('stChannels').textContent = ch.length;
  $('stEnabledSub').textContent = en + ' 个已启用';
  $('stKeys').textContent = keys.length;
  $('stReqs').textContent = fmtNum(reqs);
  $('stTokens').textContent = fmtNum(tokens);
  var h = '';
  if(!ch.length) h = '<div class="empty">暂无渠道，去「渠道管理」添加第一个吧</div>';
  ch.forEach(function(c){
    h += '<div class="chrow"><span class="dot ' + (c.enabled ? 'ok' : 'off') + '"></span>' +
      '<div class="chmain"><b>' + esc(c.name) + '</b><span>' + esc(c.base_url) + '</span></div>' +
      '<span class="badge ' + (c.type === 'anthropic' ? 'info' : '') + '">' + (c.type === 'anthropic' ? 'Anthropic 原生' : 'OpenAI 兼容') + '</span>' +
      '<button class="ghost sm" data-goto="channels">管理</button></div>';
  });
  $('ovChannels').innerHTML = h;
}

/* ---------- 渠道 ---------- */
function typeBadge(c){
  return c.type === 'anthropic' ? '<span class="badge info">Anthropic 原生</span>' : '<span class="badge">OpenAI 兼容</span>';
}
function renderChannels(){
  var h = '<table><thead><tr><th style="width:64px">状态</th><th>名称</th><th>类型</th><th>Base URL</th><th>模型</th><th style="width:64px">优先级</th><th style="width:196px">操作</th></tr></thead><tbody>';
  if(!S.channels.length) h += '<tr><td colspan="7"><div class="empty">暂无渠道，点击右上角「添加渠道」创建</div></td></tr>';
  S.channels.forEach(function(c, i){
    var models = (c.models || []).map(function(m){ return '<span class="chip">' + esc(m) + '</span>'; }).join('');
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="toggle-ch" data-i="' + i + '"' + (c.enabled ? ' checked' : '') + '><span></span></label></td>' +
      '<td><b>' + esc(c.name) + '</b></td>' +
      '<td>' + typeBadge(c) + '</td>' +
      '<td class="mono">' + esc(c.base_url) + '</td>' +
      '<td>' + models + '</td>' +
      '<td>' + esc(c.priority) + '</td>' +
      '<td class="ops"><button class="ghost sm" data-act="test-ch" data-i="' + i + '">测试</button>' +
      '<button class="ghost sm" data-act="edit-ch" data-i="' + i + '">编辑</button>' +
      '<button class="danger sm" data-act="del-ch" data-i="' + i + '">删除</button></td></tr>';
  });
  $('chTable').innerHTML = h + '</tbody></table>';
}
function openChannelModal(i){
  editingCh = i;
  var c = i >= 0 ? S.channels[i] : { name:'', type:'openai', base_url:'https://api.openai.com', api_key:'', models:[], model_map:{}, default_max_tokens:4096, priority:100, enabled:true };
  openModal('<h3>' + (i >= 0 ? '编辑渠道' : '添加渠道') + '</h3>' +
    '<div class="grid">' +
    '<label>名称<input id="m_name" type="text" value="' + esc(c.name || '') + '" placeholder="如：OpenAI 官方"></label>' +
    '<label>渠道类型<select id="m_type"><option value="openai"' + ((c.type || 'openai') === 'openai' ? ' selected' : '') + '>OpenAI 兼容</option><option value="anthropic"' + (c.type === 'anthropic' ? ' selected' : '') + '>Anthropic 原生</option></select></label>' +
    '<label>Base URL（末尾不要加 /v1）<input id="m_base" type="text" value="' + esc(c.base_url || '') + '" placeholder="https://api.openai.com"></label>' +
    '<label>渠道 API Key<input id="m_key" type="password" value="' + esc(c.api_key || '') + '" placeholder="sk-..."></label>' +
    '<label>支持的模型（逗号分隔，* 表全部）<input id="m_models" type="text" value="' + esc((c.models || []).join(',')) + '"></label>' +
    '<label>默认 max_tokens（Anthropic 必需）<input id="m_maxt" type="number" value="' + esc(c.default_max_tokens || 4096) + '"></label>' +
    '<label>优先级（越小越优先）<input id="m_prio" type="number" value="' + esc(c.priority == null ? 100 : c.priority) + '"></label>' +
    '<label class="check"><input id="m_enabled" type="checkbox"' + (c.enabled !== false ? ' checked' : '') + '> 启用该渠道</label>' +
    '</div>' +
    '<label class="fld">模型映射（可选 JSON：网关模型名 → 渠道真实模型名）<textarea id="m_map" rows="2" placeholder=\'{"gpt-4o-mini": "gpt-4o-mini"}\'>' + esc(c.model_map && Object.keys(c.model_map).length ? JSON.stringify(c.model_map) : '') + '</textarea></label>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-ch">保存</button></div>');
}
function saveChannel(){
  var map = {};
  var raw = $('m_map').value.trim();
  if(raw){ try{ map = JSON.parse(raw); }catch(e){ toast('模型映射不是合法 JSON', 'bad'); return; } }
  var c = {
    id: editingCh >= 0 ? S.channels[editingCh].id : 'ch_' + Date.now().toString(36),
    name: $('m_name').value.trim() || '未命名渠道',
    type: $('m_type').value || 'openai',
    base_url: $('m_base').value.trim().replace(/\\/+$/, ''),
    api_key: $('m_key').value.trim(),
    models: $('m_models').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
    model_map: map,
    default_max_tokens: parseInt($('m_maxt').value, 10) || 4096,
    priority: parseInt($('m_prio').value, 10) || 100,
    enabled: $('m_enabled').checked
  };
  if(!c.models.length){ toast('请至少填写一个模型（或 *）', 'bad'); return; }
  if(editingCh >= 0) S.channels[editingCh] = c; else S.channels.push(c);
  saveChannels().then(function(){ closeModal(); toast('渠道已保存', 'ok'); renderChannels(); renderOverview(); })
    .catch(function(e){ toast(e.message, 'bad'); });
}
function delChannel(i){
  confirmDlg('删除渠道', '确定删除渠道「' + S.channels[i].name + '」？该操作不可恢复。').then(function(ok){
    if(!ok) return;
    S.channels.splice(i, 1);
    saveChannels().then(function(){ toast('已删除', 'ok'); renderChannels(); renderOverview(); })
      .catch(function(e){ toast(e.message, 'bad'); });
  });
}
function testChannel(i, btn){
  var c = S.channels[i];
  btn.disabled = true;
  var old = btn.textContent;
  btn.textContent = '测试中…';
  api('/api/admin/test-channel', 'POST', { id: c.id }).then(function(r){
    if(r.ok){
      openModal('<h3>渠道测试 · ' + esc(c.name) + '</h3>' +
        '<div class="kv"><span>结果</span><b class="good">成功</b></div>' +
        '<div class="kv"><span>延迟</span><b>' + esc(fmtMs(r.ms)) + '</b></div>' +
        '<div class="kv"><span>状态码</span><b>' + esc(r.http_status) + '</b></div>' +
        (r.snippet ? '<p class="muted">返回片段</p><pre class="detail">' + esc(r.snippet) + '</pre>' : '') +
        '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>');
    }else{
      openModal('<h3>渠道测试 · ' + esc(c.name) + '</h3>' +
        '<div class="kv"><span>结果</span><b class="bad">失败</b></div>' +
        '<div class="kv"><span>延迟</span><b>' + esc(fmtMs(r.ms)) + '</b></div>' +
        (r.http_status ? '<div class="kv"><span>状态码</span><b>' + esc(r.http_status) + '</b></div>' : '') +
        '<p class="muted">错误信息</p><pre class="detail">' + esc(r.error || '未知错误') + '</pre>' +
        '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>');
    }
  }).catch(function(e){ toast(e.message, 'bad'); })
    .then(function(){ btn.disabled = false; btn.textContent = old; });
}
function exportConfig(){
  var blob = new Blob([JSON.stringify({ channels: S.channels, keys: S.keys }, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneapi-gateway-config.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800);
  toast('配置已导出', 'ok');
}
function importConfig(file){
  var rd = new FileReader();
  rd.onload = function(){
    var d;
    try{ d = JSON.parse(rd.result); }catch(e){ toast('导入失败：不是合法 JSON', 'bad'); return; }
    if(!d || !Array.isArray(d.channels) || !Array.isArray(d.keys)){ toast('导入失败：缺少 channels / keys 数组', 'bad'); return; }
    confirmDlg('导入配置', '将用文件内容覆盖当前渠道与密钥，确定继续？').then(function(ok){
      if(!ok) return;
      S.channels = d.channels; S.keys = d.keys;
      Promise.all([saveChannels(), saveKeys()]).then(function(){ toast('导入成功', 'ok'); renderAll(); })
        .catch(function(e){ toast(e.message, 'bad'); });
    });
  };
  rd.readAsText(file);
}

/* ---------- 密钥 ---------- */
function quotaCell(k){
  if(!(k.quota_tokens > 0)) return '<span class="muted">不限</span>';
  var pct = Math.min(100, Math.round(((k.used_tokens || 0) / k.quota_tokens) * 100));
  return '<div class="quota"><div class="progress"><i style="width:' + pct + '%"></i></div><span>' + pct + '%</span></div>';
}
function renderKeys(){
  var h = '<table><thead><tr><th style="width:64px">状态</th><th>名称</th><th>密钥</th><th style="width:150px">配额使用</th><th>已用 Tokens</th><th>请求数</th><th style="width:220px">操作</th></tr></thead><tbody>';
  if(!S.keys.length) h += '<tr><td colspan="7"><div class="empty">暂无密钥，点击右上角「生成密钥」创建</div></td></tr>';
  S.keys.forEach(function(k, i){
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="toggle-key" data-i="' + i + '"' + (k.enabled !== false ? ' checked' : '') + '><span></span></label></td>' +
      '<td><b>' + esc(k.name) + '</b></td>' +
      '<td class="mono">' + esc(maskKey(k.key)) + ' <button class="ghost sm" data-act="copy-key" data-i="' + i + '">复制</button></td>' +
      '<td>' + quotaCell(k) + '</td>' +
      '<td>' + fmtNum(k.used_tokens) + (k.quota_tokens > 0 ? ' / ' + fmtNum(k.quota_tokens) : '') + '</td>' +
      '<td>' + fmtNum(k.requests) + '</td>' +
      '<td class="ops"><button class="ghost sm" data-act="curl-key" data-i="' + i + '">调用示例</button>' +
      '<button class="ghost sm" data-act="reset-key" data-i="' + i + '">清零</button>' +
      '<button class="danger sm" data-act="del-key" data-i="' + i + '">删除</button></td></tr>';
  });
  $('keyTable').innerHTML = h + '</tbody></table>';
}
function openKeyModal(){
  openModal('<h3>生成密钥</h3>' +
    '<div class="grid">' +
    '<label>名称<input id="k_name" type="text" placeholder="如：前端应用" value="默认密钥"></label>' +
    '<label>Token 配额（0 表示不限）<input id="k_quota" type="number" value="0"></label>' +
    '</div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-key">生成</button></div>');
}
function saveKey(){
  var k = {
    key: genKey(),
    name: $('k_name').value.trim() || '未命名',
    enabled: true,
    quota_tokens: parseInt($('k_quota').value, 10) || 0,
    used_tokens: 0, requests: 0,
    created_at: new Date().toISOString()
  };
  S.keys.push(k);
  saveKeys().then(function(){
    closeModal(); renderKeys(); renderOverview();
    openModal('<h3>密钥已生成</h3><p class="muted">请立即复制保存，关闭后将无法再次查看完整密钥</p>' +
      '<pre class="detail">' + esc(k.key) + '</pre>' +
      '<div class="row end"><button data-act="copy-text" data-t="' + esc(k.key) + '">复制</button><button class="ghost" data-act="close-modal">关闭</button></div>');
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function showCurl(i){
  var k = S.keys[i];
  var host = window.location.host;
  var cmd = 'curl https://' + host + '/v1/chat/completions \\\n' +
    '  -H "Authorization: Bearer ' + k.key + '" \\\n' +
    '  -H "Content-Type: application/json" \\\n' +
    '  -d \'{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "你好"}]}\'';
  openModal('<h3>调用示例 · ' + esc(k.name) + '</h3><pre class="detail">' + esc(cmd) + '</pre>' +
    '<div class="row end"><button data-act="copy-text" data-t="' + esc(cmd) + '">复制</button><button class="ghost" data-act="close-modal">关闭</button></div>');
}

/* ---------- 日志 ---------- */
function loadLogs(){
  var d = $('logDate').value;
  if(!d){ toast('请选择日期', 'bad'); return; }
  $('logTable').innerHTML = '<div class="empty">加载中…</div>';
  api('/api/admin/logs/summary?date=' + encodeURIComponent(d)).then(function(r){
    S.logs = r.logs;
    renderLogs(r);
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function renderLogs(r){
  var h = '<table><thead><tr><th>时间</th><th>调用方</th><th>模型</th><th>渠道</th><th>结果</th><th>Tokens</th><th>耗时</th><th style="width:80px">操作</th></tr></thead><tbody>';
  if(!r.logs.length) h += '<tr><td colspan="8"><div class="empty">' + esc(r.date) + ' 暂无请求日志</div></td></tr>';
  r.logs.forEach(function(l, i){
    h += '<tr><td class="mono">' + esc(fmtTime(l.ts)) + '</td>' +
      '<td>' + esc(l.key_name || '-') + '</td>' +
      '<td class="mono">' + esc(l.model || '-') + '</td>' +
      '<td>' + esc(l.channel || '-') + (l.stream ? ' <span class="chip">流式</span>' : '') + '</td>' +
      '<td>' + (l.ok ? '<span class="badge ok">成功</span>' : '<span class="badge bad" title="' + esc(l.error) + '">失败</span>') + '</td>' +
      '<td>' + fmtNum(l.tokens) + '</td>' +
      '<td>' + esc(fmtMs(l.ms)) + '</td>' +
      '<td><button class="ghost sm" data-act="view-log" data-i="' + i + '">详情</button></td></tr>';
  });
  $('logTable').innerHTML = h + '</tbody></table>' + (r.truncated ? '<p class="muted">仅显示最近 100 条</p>' : '');
}
function viewLog(i){
  var l = S.logs[i];
  api('/api/admin/log?key=' + encodeURIComponent(l.key)).then(function(d){
    openModal('<h3>日志详情</h3><pre class="detail">' + esc(JSON.stringify(d, null, 2)) + '</pre>' +
      '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>');
  }).catch(function(e){ toast(e.message, 'bad'); });
}

/* ---------- 渲染总入口 ---------- */
function renderAll(){
  renderOverview();
  renderChannels();
  renderKeys();
}

/* ---------- 全局事件委托 ---------- */
document.addEventListener('click', function(e){
  var g = e.target.closest('[data-goto]');
  if(g){ gotoTab(g.getAttribute('data-goto')); return; }
  var el = e.target.closest('[data-act]');
  if(!el) return;
  var act = el.getAttribute('data-act');
  var i = parseInt(el.getAttribute('data-i'), 10);
  if(act === 'close-modal') closeModal();
  else if(act === 'toggle-ch' && !isNaN(i)){
    S.channels[i].enabled = el.checked;
    saveChannels().then(function(){ renderOverview(); }).catch(function(err){ toast(err.message, 'bad'); el.checked = !el.checked; });
  }
  else if(act === 'edit-ch') openChannelModal(i);
  else if(act === 'del-ch') delChannel(i);
  else if(act === 'test-ch') testChannel(i, el);
  else if(act === 'save-ch') saveChannel();
  else if(act === 'toggle-key' && !isNaN(i)){
    S.keys[i].enabled = el.checked;
    saveKeys().catch(function(err){ toast(err.message, 'bad'); el.checked = !el.checked; });
  }
  else if(act === 'copy-key'){
    var k = S.keys[i].key;
    if(navigator.clipboard) navigator.clipboard.writeText(k).then(function(){ toast('已复制', 'ok'); });
    else toast('复制失败，请手动复制', 'bad');
  }
  else if(act === 'copy-text'){
    var t = el.getAttribute('data-t');
    if(navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ toast('已复制', 'ok'); });
    else toast('复制失败', 'bad');
  }
  else if(act === 'curl-key') showCurl(i);
  else if(act === 'reset-key'){
    confirmDlg('清零用量', '将「' + S.keys[i].name + '」的已用 Tokens 与请求数清零？').then(function(ok){
      if(!ok) return;
      S.keys[i].used_tokens = 0; S.keys[i].requests = 0;
      saveKeys().then(function(){ toast('已清零', 'ok'); renderKeys(); renderOverview(); }).catch(function(err){ toast(err.message, 'bad'); });
    });
  }
  else if(act === 'del-key'){
    confirmDlg('删除密钥', '确定删除密钥「' + S.keys[i].name + '」？调用方将立即失效。').then(function(ok){
      if(!ok) return;
      S.keys.splice(i, 1);
      saveKeys().then(function(){ toast('已删除', 'ok'); renderKeys(); renderOverview(); }).catch(function(err){ toast(err.message, 'bad'); });
    });
  }
  else if(act === 'save-key') saveKey();
  else if(act === 'view-log') viewLog(i);
});

/* ---------- 初始化 ---------- */
(function init(){
  $('ak').value = AK;
  $('logDate').value = new Date().toISOString().slice(0, 10);
  $('btnLogin').addEventListener('click', function(){ AK = $('ak').value.trim(); connect(false); });
  $('ak').addEventListener('keydown', function(e){ if(e.key === 'Enter') $('btnLogin').click(); });
  $('btnLogout').addEventListener('click', function(){
    localStorage.removeItem('og_admin_key');
    AK = ''; S = { channels: [], keys: [], logs: [] };
    setConn(false, '未连接');
    $('login').style.display = 'flex';
  });
  $('btnAddCh').addEventListener('click', function(){ openChannelModal(-1); });
  $('btnExport').addEventListener('click', exportConfig);
  $('btnImport').addEventListener('click', function(){ $('fileImport').click(); });
  $('fileImport').addEventListener('change', function(){ if(this.files[0]) importConfig(this.files[0]); this.value = ''; });
  $('btnNewKey').addEventListener('click', openKeyModal);
  $('btnLoadLogs').addEventListener('click', loadLogs);
  if(AK) connect(true);
  else { setConn(false, '未连接'); $('login').style.display = 'flex'; }
})();
</script>
</body>
</html>`;
