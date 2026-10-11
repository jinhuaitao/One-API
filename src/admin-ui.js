/**
 * 管理后台（专业控制台风格，无构建步骤，直接由 Worker 返回）
 *
 * ⚠️ 本文件是一个 JS 模板字符串，内嵌 <script> 中请遵守以下转义规则：
 *   - 不要出现反引号（如需输出反引号请写 \`）
 *   - 不要出现 ${（如需输出请写 \${
 *   - 正则里的反斜杠写双份（如 /\\/+$/）
 *   - 需要在浏览器端字符串里输出换行，请写 \\n
 */
export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#070b14" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f4f6fb" media="(prefers-color-scheme: light)">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234d7cff'/%3E%3Cstop offset='1' stop-color='%238b5cf6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='36' height='36' rx='9' fill='url(%23g)'/%3E%3Cpath d='M11 21.5l4.6-5.4 3.4 3 5.9-7.1' stroke='%23fff' stroke-width='2.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='25.5' cy='11' r='1.9' fill='%23fff'/%3E%3C/svg%3E">
<title>OneAPI Gateway · 控制台</title>
<style>
  :root{
    --radius:12px; --radius-sm:8px;
    --headh:70px;      /* 侧栏品牌区 / 顶栏 统一高度，保证两条下边框对齐 */
    --gutter:26px;     /* 主区左右留白（顶栏与内容区共用，避免错位） */
    --font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
    --ease:cubic-bezier(.4,0,.2,1);
  }
  html[data-theme="dark"]{
    --bg:#070b14; --bg2:#0a1020; --panel:#0f1729; --panel2:#131d33; --elev:#16203a;
    --border:#1d2942; --border2:#27354f;
    --text:#e8eefb; --text2:#a9b6d0; --muted:#6d7b96;
    --accent:#4d7cff; --accent2:#8b5cf6; --accent-soft:rgba(77,124,255,.15);
    --ok:#34d399; --ok-soft:rgba(52,211,153,.13);
    --bad:#f87171; --bad-soft:rgba(248,113,113,.13);
    --warn:#fbbf24; --warn-soft:rgba(251,191,36,.13);
    --shadow:0 12px 34px rgba(0,0,0,.42);
    --grid:#182238; --hover:#16203a; --input:#0a1120;
  }
  html[data-theme="light"]{
    --bg:#f4f6fb; --bg2:#eef1f8; --panel:#ffffff; --panel2:#f8fafd; --elev:#ffffff;
    --border:#e5e9f2; --border2:#d6dded;
    --text:#0f172a; --text2:#3d4a63; --muted:#7b8798;
    --accent:#2563eb; --accent2:#7c3aed; --accent-soft:rgba(37,99,235,.10);
    --ok:#059669; --ok-soft:rgba(5,150,105,.10);
    --bad:#dc2626; --bad-soft:rgba(220,38,38,.10);
    --warn:#d97706; --warn-soft:rgba(217,119,6,.10);
    --shadow:0 8px 26px rgba(15,23,42,.09);
    --grid:#e9edf5; --hover:#f4f7fd; --input:#f7f9fd;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;font-family:var(--font);background:var(--bg);color:var(--text);font-size:14px;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar{width:10px;height:10px}
  ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:6px;border:2px solid transparent;background-clip:content-box}
  ::-webkit-scrollbar-track{background:transparent}
  a{color:var(--accent)}
  svg{width:16px;height:16px;flex-shrink:0}
  .app{display:flex;min-height:100vh}

  /* ---------- sidebar ---------- */
  .sidebar{width:238px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
  .brand{height:var(--headh);flex-shrink:0;padding:0 22px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--border)}
  .logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:14px;flex-shrink:0;letter-spacing:.5px;box-shadow:0 6px 16px var(--accent-soft)}
  .brand b{font-size:14.5px;display:block;letter-spacing:.2px;line-height:1.35}
  .brand span{font-size:11px;color:var(--muted);line-height:1.35}
  .nav{padding:10px 10px 16px;display:flex;flex-direction:column;gap:2px;flex:1;overflow:auto}
  .navsec{font-size:10.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.08em;padding:14px 14px 6px}
  .navsec:first-child{padding-top:6px}
  .navbtn{display:flex;align-items:center;justify-content:flex-start;gap:11px;width:100%;background:none;border:none;color:var(--text2);padding:10px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:13.5px;line-height:1.4;text-align:left;font-family:inherit;transition:background .15s var(--ease),color .15s var(--ease)}
  .navbtn:hover{background:var(--hover);color:var(--text)}
  .navbtn.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
  .navbtn .badge-n{margin-left:auto;font-size:11px;background:var(--panel2);border:1px solid var(--border);color:var(--muted);padding:1px 7px;border-radius:20px}
  .navbtn.on .badge-n{background:var(--accent);border-color:transparent;color:#fff}
  .side-foot{padding:12px 10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
  .side-row{display:flex;gap:8px;align-items:center;padding:0 12px}
  .side-row .grow{flex:1;min-width:0;font-size:11.5px;color:var(--muted);line-height:1.5}
  .side-row .grow b{display:block;color:var(--text2);font-weight:600;font-size:12px}

  /* ---------- main / topbar ---------- */
  main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{height:var(--headh);flex-shrink:0;border-bottom:1px solid var(--border);background:var(--panel);position:sticky;top:0;z-index:20}
  .topbar-in{max-width:1240px;margin:0 auto;height:100%;padding:0 var(--gutter);display:flex;justify-content:space-between;align-items:center;gap:16px}
  .topbar h2{margin:0;font-size:16.5px;letter-spacing:.2px;line-height:1.3}
  .topbar p{margin:2px 0 0;font-size:12px;color:var(--muted);line-height:1.3}
  .topbar .right{display:flex;gap:9px;align-items:center;flex-shrink:0}
  .content{padding:22px var(--gutter) 60px;max-width:1240px;width:100%;margin:0 auto}
  .tab{display:none}.tab.on{display:block;animation:fade .22s var(--ease)}
  @keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

  /* ---------- pills / badges ---------- */
  .pill{font-size:11.5px;padding:5px 12px;border-radius:20px;background:var(--panel2);color:var(--muted);border:1px solid var(--border);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
  .pill.ok{background:var(--ok-soft);color:var(--ok);border-color:transparent}
  .pill.bad{background:var(--bad-soft);color:var(--bad);border-color:transparent}
  .pill.wait{background:var(--warn-soft);color:var(--warn);border-color:transparent}
  .pill .dt{width:7px;height:7px;border-radius:50%;background:currentColor}
  .badge{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11.5px;background:var(--panel2);color:var(--text2);white-space:nowrap;border:1px solid var(--border);flex-shrink:0}
  .badge.ok{background:var(--ok-soft);color:var(--ok);border-color:transparent}
  .badge.bad{background:var(--bad-soft);color:var(--bad);border-color:transparent}
  .badge.info{background:var(--accent-soft);color:var(--accent);border-color:transparent}
  .badge.warn{background:var(--warn-soft);color:var(--warn);border-color:transparent}
  .chip{display:inline-block;padding:2px 8px;border-radius:6px;background:var(--panel2);border:1px solid var(--border);font-size:11.5px;margin:1px 3px 1px 0;color:var(--text2);font-family:var(--mono)}
  .chip .nm{white-space:nowrap}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;background:var(--border2)}
  .dot.ok{background:var(--ok);box-shadow:0 0 0 3px var(--ok-soft)}
  .dot.bad{background:var(--bad);box-shadow:0 0 0 3px var(--bad-soft)}

  /* ---------- stats ---------- */
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .stat{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;position:relative;overflow:hidden}
  .stat .top{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .stat .label{color:var(--muted);font-size:12.5px}
  .stat .ic{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center}
  .stat .ic.ok{background:var(--ok-soft);color:var(--ok)}
  .stat .ic.bad{background:var(--bad-soft);color:var(--bad)}
  .stat .ic.warn{background:var(--warn-soft);color:var(--warn)}
  .stat .num{font-size:25px;font-weight:700;margin-top:10px;letter-spacing:-.4px}
  .stat .sub{font-size:11.5px;color:var(--muted);margin-top:5px}

  /* ---------- cards ---------- */
  .card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-top:16px}
  .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
  .card h3{margin:0;font-size:14.5px}
  .card .desc{color:var(--muted);font-size:12.5px;margin:4px 0 0;line-height:1.6}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid2 .card{margin-top:16px}

  /* ---------- toolbar / inputs ---------- */
  .toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .toolbar .spacer{flex:1}
  .search{position:relative;display:flex;align-items:center}
  .search svg{position:absolute;left:10px;color:var(--muted);pointer-events:none;width:14px;height:14px}
  .search input{padding-left:32px;min-width:190px}
  input[type=text],input[type=password],input[type=date],input[type=number],input[type=datetime-local],textarea,select{
    background:var(--input);border:1px solid var(--border2);color:var(--text);padding:8px 11px;border-radius:var(--radius-sm);font-size:13px;width:100%;font-family:inherit;transition:border-color .15s var(--ease),box-shadow .15s var(--ease)}
  input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  select.sel{width:auto;min-width:112px;cursor:pointer}
  textarea{resize:vertical;font-family:var(--mono);font-size:12.5px;line-height:1.6}
  input[type=checkbox]{accent-color:var(--accent);width:15px;height:15px;cursor:pointer}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .grid label,.fld{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text2)}
  .fld{margin-top:14px}
  .check{display:flex;flex-direction:row !important;align-items:center;gap:8px !important;cursor:pointer}
  .check input{width:auto}
  .row{display:flex;gap:9px;margin-top:16px;align-items:center;flex-wrap:wrap}
  .row.end{justify-content:flex-end}
  .hint{font-size:11.5px;color:var(--muted);line-height:1.55;margin-top:2px}

  /* ---------- buttons ---------- */
  button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;color:#fff;padding:8px 15px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;font-family:inherit;font-weight:500;transition:filter .15s var(--ease),transform .1s var(--ease);display:inline-flex;align-items:center;gap:6px;justify-content:center}
  button:hover{filter:brightness(1.08)}
  button:active{transform:translateY(1px)}
  button:disabled{opacity:.5;cursor:default;transform:none}
  button.ghost{background:var(--panel2);color:var(--text2);border:1px solid var(--border)}
  button.ghost:hover{background:var(--hover);color:var(--text);filter:none}
  button.danger{background:var(--bad)}
  button.soft{background:var(--bad-soft);color:var(--bad)}
  button.sm{padding:6px 11px;font-size:12.5px;border-radius:7px}
  button.sm svg{width:14px;height:14px}
  .icon-btn{background:var(--panel2);border:1px solid var(--border);color:var(--text2);padding:7px;border-radius:8px;width:auto}
  .icon-btn:hover{background:var(--hover);color:var(--text);filter:none}
  .seg{display:inline-flex;background:var(--panel2);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px}
  .segbtn{background:none;border:none;color:var(--muted);padding:6px 13px;border-radius:7px;font-size:12.5px;font-weight:500}
  .segbtn:hover{color:var(--text);filter:none;background:none}
  .segbtn.on{background:var(--panel);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.14)}
  html[data-theme="dark"] .segbtn.on{background:var(--elev)}

  /* ---------- tables ---------- */
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--border);vertical-align:middle}
  th{color:var(--muted);font-weight:600;font-size:11.5px;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
  tbody tr{transition:background .12s var(--ease)}
  tbody tr:hover{background:var(--hover)}
  tbody tr:last-child td{border-bottom:none}
  td.mono{font-family:var(--mono);font-size:12px;word-break:break-all;color:var(--text2)}
  .ops{white-space:nowrap;display:flex;gap:5px;align-items:center}
  .ops.r{justify-content:flex-end}
  th.ar,td.ar{text-align:right}
  .empty{padding:44px 10px;text-align:center;color:var(--muted);font-size:13px}
  .empty svg{width:30px;height:30px;margin-bottom:10px;opacity:.5}
  .tname{display:flex;align-items:center;gap:9px;min-width:0}
  .tname>div{min-width:0}
  .tname b{font-weight:600;white-space:nowrap}
  .tname .sub{font-size:11.5px;color:var(--muted);display:block;font-weight:400;margin-top:2px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .quota{display:flex;align-items:center;gap:8px;min-width:130px}
  .progress{flex:1;height:6px;background:var(--input);border-radius:4px;overflow:hidden;border:1px solid var(--border)}
  .progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:4px;transition:width .3s var(--ease)}
  .progress i.bad{background:var(--bad)}
  .progress i.warn{background:var(--warn)}
  .pager{display:flex;justify-content:center;padding:14px 0 0}
  .mono-s{font-family:var(--mono);font-size:12px}
  #chTable,#keyTable,#logTable{overflow-x:auto}
  .nowrap{white-space:nowrap}
  .sub{font-size:11.5px;color:var(--muted);display:block;margin-top:2px;font-weight:400}
  .url{font-family:var(--mono);font-size:12px;color:var(--text2);display:block;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .phead{display:flex;gap:8px;font-size:11.5px;color:var(--muted);padding:0 0 7px;text-transform:uppercase;letter-spacing:.04em}
  .phead span{flex:1}
  .phead span:last-child{flex:0 0 34px;width:34px}

  /* ---------- switch ---------- */
  .switch{position:relative;display:inline-block;width:36px;height:21px;flex-shrink:0}
  .switch input{display:none}
  .switch span{position:absolute;inset:0;background:var(--border2);border-radius:11px;transition:.2s var(--ease);cursor:pointer}
  .switch span:before{content:'';position:absolute;width:15px;height:15px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s var(--ease);box-shadow:0 1px 3px rgba(0,0,0,.3)}
  .switch input:checked+span{background:var(--accent)}
  .switch input:checked+span:before{left:18px}

  /* ---------- kv / detail ---------- */
  .kv{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13.5px}
  .kv:last-child{border-bottom:none}
  .kv span{color:var(--muted)}
  .good{color:var(--ok)} .bad{color:var(--bad)} .muted{color:var(--muted)} .warnc{color:var(--warn)}
  pre.detail{background:var(--input);border:1px solid var(--border2);padding:14px;border-radius:var(--radius-sm);overflow:auto;max-height:440px;font-size:12px;line-height:1.65;font-family:var(--mono);margin:0;white-space:pre-wrap;word-break:break-all}
  code{background:var(--panel2);border:1px solid var(--border);padding:1px 6px;border-radius:5px;font-size:12px;font-family:var(--mono);color:var(--accent)}

  /* ---------- chart ---------- */
  .chart-wrap{width:100%;overflow:hidden}
  .chart{width:100%;height:auto;display:block;overflow:visible}
  .chart .gl{stroke:var(--grid);stroke-width:1}
  .chart .axis{fill:var(--muted);font-size:10.5px;font-family:var(--font)}
  .chart .ln{fill:none;stroke:var(--accent);stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
  .chart .dot{fill:var(--panel);stroke:var(--accent);stroke-width:2}
  .chart .gs1{stop-color:var(--accent);stop-opacity:.32}
  .chart .gs2{stop-color:var(--accent);stop-opacity:0}

  /* ---------- health list ---------- */
  .hrow{display:flex;align-items:center;gap:11px;padding:11px 2px;border-bottom:1px solid var(--border)}
  .hrow:last-child{border-bottom:none}
  .hmain{flex:1;min-width:0}
  .hmain b{display:block;font-size:13.5px}
  .hmain span{font-size:11.5px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}

  /* ---------- modal / toast / login ---------- */
  .modal-overlay{position:fixed;inset:0;background:rgba(3,7,16,.62);backdrop-filter:blur(3px);display:none;align-items:flex-start;justify-content:center;z-index:60;padding:5vh 16px;overflow:auto}
  .modal-overlay.on{display:flex}
  .modal{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:22px;width:min(620px,94vw);box-shadow:var(--shadow);animation:pop .2s var(--ease)}
  .modal.sm{width:min(420px,94vw)}
  .modal.lg{width:min(880px,95vw)}
  @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
  .modal h3{margin:0 0 4px;font-size:16px}
  .modal .msub{color:var(--muted);font-size:12.5px;margin:0 0 14px}
  .maprow,.hdrrow,.prow{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .maprow input,.hdrrow input,.prow input{flex:1;font-family:var(--mono);font-size:12px}
  #toasts{position:fixed;right:20px;bottom:20px;z-index:99;display:flex;flex-direction:column;gap:9px;max-width:min(370px,90vw)}
  .toast{background:var(--elev);border:1px solid var(--border);border-left:3px solid var(--accent);padding:12px 15px;border-radius:9px;font-size:13px;box-shadow:var(--shadow);transition:opacity .3s,transform .3s;animation:slide .25s var(--ease)}
  @keyframes slide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
  .toast.ok{border-left-color:var(--ok)} .toast.bad{border-left-color:var(--bad)}
  .toast.out{opacity:0;transform:translateX(24px)}
  .login-overlay{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;background:radial-gradient(1100px 620px at 50% 12%,var(--accent-soft) 0%,var(--bg) 62%)}
  .login-overlay.on{display:flex}
  .login-card{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:36px 34px;width:min(410px,92vw);text-align:center;box-shadow:var(--shadow)}
  .login-card .logo{margin:0 auto 16px;width:50px;height:50px;font-size:18px;border-radius:14px}
  .login-card h2{margin:0 0 6px;font-size:18px}
  .login-card p{color:var(--muted);font-size:12.5px;margin:0 0 20px;line-height:1.6}
  .login-card input{margin-bottom:11px;text-align:center}
  .login-card button{width:100%}
  .login-tip{margin-top:14px;font-size:11.5px;color:var(--muted);line-height:1.6}
  .login-warn{margin-top:12px;color:var(--warn);background:var(--warn-soft);border:1px solid transparent;border-radius:8px;padding:9px 11px;text-align:left}

  /* ---------- help ---------- */
  .help h4{margin:20px 0 8px;font-size:14px}
  .help h4:first-of-type{margin-top:6px}
  .help p,.help li{font-size:13px;line-height:1.9;color:var(--text2)}
  .help ol,.help ul{padding-left:20px;margin:6px 0}
  .help li{margin:3px 0}
  .skeleton{height:14px;border-radius:6px;background:linear-gradient(90deg,var(--panel2),var(--hover),var(--panel2));background-size:200% 100%;animation:sk 1.2s infinite}

  /* ---------- 专业细节：焦点环 / 环比徽章 / 动效偏好 ---------- */
  :where(button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}
  }
  .delta{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;margin-left:8px;vertical-align:2px;font-family:var(--mono)}
  .delta.up{color:var(--ok);background:var(--ok-soft)}
  .delta.down{color:var(--bad);background:var(--bad-soft)}
  .delta.flat{color:var(--muted);background:var(--panel2);border:1px solid var(--border)}
  .chart-wrap{position:relative}
  .ctip{position:absolute;pointer-events:none;background:var(--elev);border:1px solid var(--border2);border-radius:8px;padding:6px 10px;font-size:12px;box-shadow:var(--shadow);white-space:nowrap;display:none;z-index:5}
  .ctip b{font-family:var(--mono)}
  @keyframes sk{0%{background-position:200% 0}100%{background-position:-200% 0}}

  @media (max-width:1024px){
    .stats{grid-template-columns:1fr 1fr}
    .grid2{grid-template-columns:1fr}
  }
  @media (max-width:860px){
    :root{--headh:62px;--gutter:16px}
    .app{flex-direction:column}
    .sidebar{width:100%;height:auto;position:static}
    .brand{padding:0 16px}
    .nav{flex-direction:row;overflow-x:auto;padding:10px}
    .navsec{display:none}
    .navbtn{white-space:nowrap;width:auto}
    .side-foot{flex-direction:row;align-items:center}
    .side-row{padding:0}
    .side-row .grow{display:none}
    .stats{grid-template-columns:1fr}
    .grid{grid-template-columns:1fr}
    .content{padding:16px var(--gutter) 40px}
    .topbar-in{padding:0 var(--gutter)}
    .topbar p{display:none}
  }
</style>
</head>
<body>

<div class="login-overlay on" id="login">
  <div class="login-card">
    <div class="logo">OG</div>
    <h2>OneAPI Gateway</h2>
    <p>请输入 Admin Key 以进入管理控制台</p>
    <input id="ak" type="password" placeholder="Admin Key" autocomplete="off">
    <button id="btnLogin">进入控制台</button>
    <div class="login-tip">Admin Key 即部署时设置的 <code>ADMIN_KEY</code> Secret，仅保存在浏览器本地。登录后刷新页面无需重复输入（浏览器禁用本地存储时除外）。</div>
    <div class="login-tip login-warn" id="storeWarn" style="display:none"></div>
  </div>
</div>

<div class="app">
  <aside class="sidebar">
    <div class="brand"><div class="logo">OG</div><div><b>OneAPI Gateway</b><span>管理控制台</span></div></div>
    <nav class="nav">
      <div class="navsec">监控</div>
      <button class="navbtn on" data-tab="overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>概览</button>
      <button class="navbtn" data-tab="logs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>请求日志</button>
      <div class="navsec">资源</div>
      <button class="navbtn" data-tab="channels"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>渠道管理<span class="badge-n" id="navCh">0</span></button>
      <button class="navbtn" data-tab="keys"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="3.6"/><path d="M10.1 12.9 20.5 2.5"/><path d="M17 6l2 2M19.5 3.5l2 2"/></svg>密钥管理<span class="badge-n" id="navKey">0</span></button>
      <div class="navsec">系统</div>
      <button class="navbtn" data-tab="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.1"/><circle cx="15" cy="12" r="2.1"/><circle cx="8" cy="17" r="2.1"/></svg>网关设置</button>
      <button class="navbtn" data-tab="help"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>使用说明</button>
    </nav>
    <div class="side-foot">
      <div class="side-row">
        <div class="grow"><b>v2.0.0</b>数据存储于 Cloudflare R2</div>
        <button class="icon-btn" id="btnTheme" title="切换主题"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        <button class="icon-btn" data-act="logout" title="退出登录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/></svg></button>
      </div>
    </div>
  </aside>
  <main>
    <div class="topbar">
      <div class="topbar-in">
        <div><h2 id="pageTitle">概览</h2><p id="pageDesc">网关运行状态与用量趋势</p></div>
        <div class="right">
          <span class="pill" id="connPill"><span class="dt"></span>未连接</span>
          <button class="icon-btn" id="btnRefresh" title="刷新数据"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>
        </div>
      </div>
    </div>
    <div class="content">

      <section id="t-overview" class="tab on">
        <div class="toolbar">
          <div class="seg" id="rangeSeg">
            <button class="segbtn" data-range="7">7 天</button>
            <button class="segbtn on" data-range="14">14 天</button>
            <button class="segbtn" data-range="30">30 天</button>
          </div>
          <div class="spacer"></div>
          <button class="ghost sm" data-act="refresh-stats"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>刷新</button>
        </div>
        <div class="stats" id="statCards"></div>
        <div class="card">
          <div class="card-head">
            <div><h3>用量趋势</h3><p class="desc" id="trendDesc">近 14 天</p></div>
            <div class="seg" id="metricSeg">
              <button class="segbtn on" data-metric="requests">请求</button>
              <button class="segbtn" data-metric="tokens">Tokens</button>
              <button class="segbtn" data-metric="cost">费用</button>
            </div>
          </div>
          <div id="trendChart" class="chart-wrap"><div class="empty">加载中…</div></div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-head"><div><h3>渠道状态</h3><p class="desc">点击「测试」可验证上游连通性</p></div></div>
            <div id="ovChannels"></div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>Top 模型</h3><p class="desc" id="ovModelsDesc">按请求数排序</p></div></div>
            <div id="ovModels"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Top 密钥</h3><p class="desc">按请求数排序（含管理员直连）</p></div></div>
          <div id="ovKeys"></div>
        </div>
      </section>

      <section id="t-channels" class="tab">
        <div class="card">
          <div class="toolbar">
            <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="chQ" type="text" placeholder="搜索名称 / 地址 / 模型"></div>
            <select id="chType" class="sel"><option value="">全部类型</option><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 原生</option></select>
            <select id="chStatus" class="sel"><option value="">全部状态</option><option value="on">已启用</option><option value="off">已禁用</option></select>
            <div class="spacer"></div>
            <button class="ghost sm" data-act="test-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>全部测试</button>
            <button class="ghost sm" data-act="route-test">路由测试</button>
            <button class="ghost sm" data-act="export"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>导出</button>
            <button class="ghost sm" data-act="import"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>导入</button>
            <button class="sm" data-act="add-ch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>添加渠道</button>
            <input type="file" id="fileImport" accept=".json,application/json" style="display:none">
          </div>
          <p class="desc">按请求 <code>model</code> 匹配渠道；同优先级按权重加权随机，失败自动按优先级故障转移。Anthropic 原生渠道自动完成 OpenAI 格式互转。</p>
          <div id="chTable"></div>
        </div>
      </section>

      <section id="t-keys" class="tab">
        <div class="card">
          <div class="toolbar">
            <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="keyQ" type="text" placeholder="搜索名称 / 密钥"></div>
            <select id="keyStatus" class="sel"><option value="">全部状态</option><option value="on">已启用</option><option value="off">已禁用</option><option value="expired">已过期</option><option value="exhausted">配额用尽</option></select>
            <div class="spacer"></div>
            <button class="sm" data-act="add-key"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>生成密钥</button>
          </div>
          <p class="desc">将密钥分发给调用方，请求头携带 <span class="chip">Authorization: Bearer &lt;key&gt;</span> 即可调用网关。</p>
          <div id="keyTable"></div>
        </div>
      </section>

      <section id="t-logs" class="tab">
        <div class="card">
          <div class="toolbar">
            <button class="icon-btn" data-act="log-prev" title="前一天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
            <input type="date" id="logDate" style="width:auto">
            <button class="icon-btn" data-act="log-next" title="后一天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
            <button class="ghost sm" data-act="log-today">今天</button>
            <select id="logOk" class="sel"><option value="">全部结果</option><option value="ok">仅成功</option><option value="fail">仅失败</option></select>
            <select id="logStream" class="sel"><option value="">全部类型</option><option value="1">流式</option><option value="0">非流式</option></select>
            <select id="logFinish" class="sel" title="流式结束原因"><option value="">全部结束原因</option><option value="abnormal">仅异常结束（断流）</option></select>
            <input id="logModel" type="text" placeholder="模型筛选" style="width:130px">
            <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="logQ" type="text" placeholder="搜索密钥 / 渠道 / 错误"></div>
            <div class="spacer"></div>
            <label class="check" style="font-size:12.5px"><input type="checkbox" id="logAuto"> 自动刷新</label>
            <button class="ghost sm" data-act="export-logs">导出 CSV</button>
            <button class="soft sm" data-act="clear-day-logs">清空当日</button>
            <button class="sm" data-act="load-logs">查询</button>
          </div>
          <div id="logTable"></div>
          <div class="pager" id="logPager"></div>
        </div>
      </section>

      <section id="t-settings" class="tab">
        <div class="card">
          <div class="card-head"><div><h3>安全</h3><p class="desc">控制管理密钥是否可直接用于业务调用</p></div></div>
          <label class="check"><input type="checkbox" id="s_allow_admin"> 允许用 ADMIN_KEY 直接调用 /v1/*（便于自测，生产建议关闭）</label>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>性能与容错</h3><p class="desc">作用于所有渠道的默认值，单个渠道可单独覆盖超时</p></div></div>
          <div class="grid">
            <label>请求超时（毫秒，作用于首字节）<input type="number" id="s_timeout" min="1000" max="600000" step="1000"></label>
            <label>流式静默超时（毫秒）<input type="number" id="s_stream_idle" min="5000" max="600000" step="1000"><span class="hint">流式响应专用的「读超时」：上游超过该时长一个字节都没下发即判定断流，网关主动断开并给客户端一个明确收尾。上面的请求超时只覆盖到首字节，管不了流中途卡死。</span></label>
            <label>下游保活间隔（毫秒）<input type="number" id="s_stream_ka" min="0" max="600000" step="1000"><span class="hint">网关超过该时长没向调用方下发任何字节时，主动补一条 SSE 注释（": ka"，客户端会忽略），防止模型长思考 / 上游排队期间的「零字节窗口」被中间的 nginx / CDN / 客户端读超时掐断。与「流式静默超时」互补：一个管上游→网关，一个管网关→调用方。0 = 关闭，默认 15000。</span></label>
            <label>瞬时错误重试次数（429 / 5xx / 网络异常）<input type="number" id="s_retries" min="0" max="5" step="1"></label>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div><h3>日志与统计</h3><p class="desc">统计与日志按「当地日期」归档；超过保留期的日志可一键清理</p></div>
            <div style="display:flex;gap:8px">
              <button class="ghost sm" data-act="cleanup-logs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>清理过期日志</button>
              <button class="soft sm" data-act="clear-all-logs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11l4 4M14 11l-4 4"/></svg>清空全部日志</button>
            </div>
          </div>
          <div class="grid">
            <label>日志保留天数<input type="number" id="s_retention" min="1" max="3650" step="1"></label>
            <label>时区偏移（分钟，480 = UTC+8）<input type="number" id="s_tz" min="-720" max="840" step="30"><span class="hint">决定日志与统计按哪个「当地日期」归档；若控制台查不到刚产生的日志，多半是这里与本地时区不一致。</span></label>
            <label>额外对外暴露的模型（逗号分隔，仅用于 /v1/models 展示）<input type="text" id="s_models" placeholder="my-alias,gpt-4o"></label>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div><h3>模型定价</h3><p class="desc">单位：美元 / 每 100 万 Tokens，用于估算费用（不影响转发）</p></div>
            <button class="ghost sm" data-act="price-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>添加模型</button>
          </div>
          <div class="grid" style="margin-bottom:12px">
            <label>默认输入价<input type="number" id="s_pin" min="0" step="0.001"></label>
            <label>默认输出价<input type="number" id="s_pout" min="0" step="0.001"></label>
          </div>
          <div id="priceRows"></div>
        </div>
        <div class="row end" style="margin-top:18px">
          <button class="ghost" data-act="reset-settings">重新载入</button>
          <button data-act="save-settings">保存设置</button>
        </div>
      </section>

      <section id="t-help" class="tab">
        <div class="card help">
          <h3>快速上手</h3>
          <ol>
            <li>在「渠道管理」添加上游渠道：<code>OpenAI 兼容</code>（OpenAI / DeepSeek / Moonshot 等）或 <code>Anthropic 原生</code>（Base URL 填 <code>https://api.anthropic.com</code>）。<b>Base URL 末尾不要带 <code>/v1</code></b>，网关会自动拼接路径。</li>
            <li>点击渠道行的「测试」验证连通性，确认返回成功后再启用；也可用「全部测试」批量巡检。</li>
            <li>在「密钥管理」生成网关密钥并分发给调用方（可设置配额、有效期、允许调用的模型）。</li>
            <li>调用方按 OpenAI 兼容方式调用即可，Anthropic 渠道也无需改代码，网关自动翻译格式。</li>
          </ol>
          <h4>调用示例</h4>
          <p><code>POST /v1/chat/completions</code>，请求头携带 <code>Authorization: Bearer &lt;网关密钥&gt;</code>，请求体与 OpenAI 完全一致，支持 <code>stream: true</code> 流式输出。密钥列表中的「调用示例」可一键生成 curl 命令。</p>
          <h4>路由与容错</h4>
          <ul>
            <li><b>模型匹配</b>：按请求的 <code>model</code> 匹配渠道的模型列表，<code>*</code> 表示匹配全部。</li>
            <li><b>优先级 + 权重</b>：先按 <code>priority</code>（越小越优先）分组，组内按 <code>weight</code> 加权随机，实现灰度与负载分摊。</li>
            <li><b>多 Key</b>：单个渠道的 API Key 支持英文逗号分隔多个，随机起点轮询，单个 Key 失败自动换下一个。</li>
            <li><b>重试</b>：429 / 5xx / 网络异常会在同一 Key 上重试（次数可在「网关设置」调整）。</li>
            <li><b>模型映射</b>：网关模型名 → 渠道真实模型名，例如对外叫 <code>gpt-4o-mini</code>，实际走 <code>gpt-4o-mini-2024</code>。映射左侧的名称必须同时出现在渠道的「对外暴露的模型名」中，否则匹配不到该渠道。</li>
            <li><b>模型回显</b>：响应体与流式 SSE 中的 <code>model</code> 会统一改写为调用方请求的网关模型名，调用方不会看到渠道内部的真实模型名。</li>
            <li><b>流式收尾</b>：上游中途断开时，网关不会让客户端看到「连接被重置」，而是补一个 error 事件 + <code>data: [DONE]</code> 后正常收尾；上游未发送 <code>[DONE]</code> 时由网关补发。</li>
            <li><b>流式静默超时</b>：流式响应单独有读超时（「网关设置」里的流式静默超时）。上面的请求超时只覆盖到首字节，管不了流中途卡死。超时后网关主动断开并收尾。</li>
            <li><b>异常结束可观测</b>：日志新增「结束原因」字段（complete / client_abort / upstream_error / timeout），日志页可按「仅异常结束」筛选，用来排查断流。</li>
          </ul>
          <h4>Anthropic 渠道注意事项</h4>
          <ul>
            <li>仅支持 <code>/v1/chat/completions</code>；<code>max_tokens</code> 必需（取请求值，否则用渠道「默认 max_tokens」）。</li>
            <li><code>temperature</code> 会自动钳制到 0~1；<code>system</code> / <code>developer</code> 消息合并为 Anthropic 的 <code>system</code>。</li>
            <li>连续同角色消息会自动合并（Anthropic 要求角色交替），多条 <code>tool</code> 结果会合并为一条。</li>
          </ul>
          <h4>数据存储</h4>
          <p>全部数据存放于 Cloudflare R2：<code>data/channels.json</code>（渠道）、<code>data/keys.json</code>（密钥）、<code>data/settings.json</code>（设置）、<code>data/stats/&lt;日期&gt;.json</code>（按天统计）、<code>logs/&lt;日期&gt;/</code>（请求日志）。可在渠道页「导出」备份配置。</p>
          <h4>接口一览</h4>
          <ul>
            <li><code>GET /v1/models</code>、<code>POST /v1/chat/completions</code>、<code>POST /v1/completions</code>、<code>POST /v1/embeddings</code></li>
            <li><code>GET /healthz</code> 健康检查；<code>GET /</code> 网关状态</li>
            <li>管理接口均在 <code>/api/admin/*</code>，需请求头 <code>X-Admin-Key</code></li>
          </ul>
        </div>
      </section>

    </div>
  </main>
</div>

<div class="modal-overlay" id="modal"><div class="modal" id="modalBox"></div></div>
<div id="toasts"></div>

<script>
var AK = '';
var S = { channels: [], keys: [], settings: {}, stats: null, logs: [], logCursor: null, logDate: '', serverToday: '', logDates: [] };
var editingCh = -1, editingKey = -1;
var RANGE = 14, METRIC = 'requests';
var autoTimer = null;
var TITLES = { overview:['概览','网关运行状态与用量趋势'], channels:['渠道管理','上游渠道配置与连通性'], keys:['密钥管理','网关密钥发放与用量'], logs:['请求日志','按天查看转发明细'], settings:['网关设置','超时、重试、定价与日志策略'], help:['使用说明','接入方式与功能说明'] };

var I = {
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  coin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.6 9.4A2.5 2.5 0 0 0 12.2 8c-1.4 0-2.4.7-2.4 1.8 0 2.4 5 1.2 5 3.6 0 1.1-1 1.9-2.4 1.9a2.5 2.5 0 0 1-2.4-1.4"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  server:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
  inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5h13l3.5 6.5v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z"/></svg>'
};

/* ---------- 工具函数 ---------- */
var store = {
  get: function(k){ try{ return window.localStorage.getItem(k); }catch(e){ return null; } },
  /* 返回是否「确实写进去了」：隐私模式 / 第三方 iframe 下 localStorage 会静默失败，
     此时刷新必然要求重新登录，需要明确告知用户，而不是让人反复试。 */
  set: function(k,v){
    try{
      window.localStorage.setItem(k, v);
      return window.localStorage.getItem(k) === v;
    }catch(e){ return false; }
  },
  del: function(k){ try{ window.localStorage.removeItem(k); }catch(e){} }
};
AK = store.get('og_admin_key') || '';

function $(id){ return document.getElementById(id); }
function p2(n){ return (n < 10 ? '0' : '') + n; }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function fmtNum(n){ return Number(n || 0).toLocaleString('en-US'); }
function fmtCost(n){ n = Number(n || 0); if(!n) return '0.00'; if(n < 0.01) return n.toFixed(4); return n.toFixed(2); }
function fmtShort(n){
  n = Number(n || 0);
  if(n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if(n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if(n >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}
function fmtTime(iso){
  if(!iso) return '-';
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '-';
  return p2(d.getMonth()+1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}
function fmtMs(ms){ ms = Number(ms || 0); return ms >= 1000 ? (ms/1000).toFixed(2) + 's' : Math.round(ms) + 'ms'; }
function maskKey(k){ k = String(k || ''); return k.length > 14 ? k.slice(0,8) + '...' + k.slice(-4) : k; }
function todayLocal(){ var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()); }
function shiftDate(s, delta){
  var d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate());
}
function genKey(){
  var a = new Uint8Array(24); crypto.getRandomValues(a);
  return 'sk-' + Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
}
function isExpired(k){ return !!(k.expires_at && Date.now() > Date.parse(k.expires_at)); }
function isExhausted(k){ return !!(k.quota_tokens > 0 && (k.used_tokens || 0) >= k.quota_tokens); }

function toast(msg, type){
  var icons = { ok: '✓', bad: '✕', info: 'ℹ' };
  var el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.innerHTML = '<span class="ticon">' + (icons[type] || icons.info) + '</span>' + esc(msg);
  $('toasts').appendChild(el);
  setTimeout(function(){ el.classList.add('out'); setTimeout(function(){ el.remove(); }, 320); }, 3600);
}
window.addEventListener('error', function(e){
  try{ toast('页面错误：' + (e.message || '未知错误'), 'bad'); }catch(_){}
});

function api(path, method, body){
  var opt = { method: method || 'GET', headers: { 'X-Admin-Key': AK } };
  if(body !== undefined){ opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(path, opt).then(function(r){
    return r.json().catch(function(){ return { error: { message: '响应解析失败' } }; }).then(function(d){
      if(!r.ok){
        var e = new Error((d.error && d.error.message) || ('HTTP ' + r.status));
        e.status = r.status;
        e.code = (d.error && d.error.code) || '';
        // 只有 401/403 才说明 Key 失效；其余错误（5xx / 网络抖动）不应把用户踢出登录
        if(r.status === 401 || r.status === 403) markLoggedOut(e.message);
        throw e;
      }
      return d;
    });
  });
}
function isAuthErr(e){ return !!e && (e.status === 401 || e.status === 403); }
function isKeyMissing(e){ return !!e && e.code === 'admin_key_missing'; }

/** Key 已失效：回到登录页（幂等，避免多个并发请求重复弹窗） */
var authLost = false;
function markLoggedOut(msg){
  if(authLost) return;
  authLost = true;
  store.del('og_admin_key');
  AK = '';
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  setConn('fail');
  $('login').classList.add('on');
  toast(msg || 'Admin Key 已失效，请重新输入', 'bad');
}
/** localStorage 是否真的可用（隐私模式 / 第三方 iframe 下会抛异常） */
function storageOk(){
  try{
    window.localStorage.setItem('og_probe', '1');
    window.localStorage.removeItem('og_probe');
    return true;
  }catch(e){ return false; }
}
/** localStorage 不可用时给出常驻提示：否则用户会以为「登录了但刷新就掉」，反复重试 */
var storageWarned = false;
function warnNoStorage(){
  if(storageWarned) return;
  storageWarned = true;
  var el = $('storeWarn');
  if(el){
    el.textContent = '当前浏览器禁用了本地存储（隐私模式或第三方 iframe 内嵌），因此刷新页面后需要重新输入 Admin Key。请在新标签页直接打开本控制台。';
    el.style.display = 'block';
  }
  toast('当前浏览器禁用了本地存储，刷新后需要重新输入 Admin Key', 'bad');
}

function openModal(html, size){
  var box = $('modalBox');
  box.className = 'modal' + (size ? ' ' + size : '');
  box.innerHTML = html;
  $('modal').classList.add('on');
}
function closeModal(){ $('modal').classList.remove('on'); $('modalBox').innerHTML = ''; }
window.closeModal = closeModal;
$('modal').addEventListener('click', function(e){ if(e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && $('modal').classList.contains('on')) closeModal(); });

function confirmDlg(title, text){
  return new Promise(function(resolve){
    openModal('<h3>' + esc(title) + '</h3><p class="msub">' + esc(text) + '</p>' +
      '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button class="danger" data-act="cf-yes">确定</button></div>', 'sm');
    $('modalBox').querySelector('[data-act="cf-yes"]').onclick = function(){ closeModal(); resolve(true); };
    var no = $('modalBox').querySelector('[data-act="close-modal"]');
    no.onclick = function(){ closeModal(); resolve(false); };
  });
}

/* ---------- 主题 ---------- */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  store.set('og_theme', t);
  var b = $('btnTheme');
  if(b) b.title = t === 'dark' ? '切换到浅色' : '切换到深色';
}
function initTheme(){
  var t = store.get('og_theme');
  if(!t) t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  applyTheme(t);
}

/* ---------- 登录 ---------- */
function setConn(state){
  var pill = $('connPill');
  if(state === 'ok'){ pill.className = 'pill ok'; pill.innerHTML = '<span class="dt"></span>已连接'; }
  else if(state === 'fail'){ pill.className = 'pill bad'; pill.innerHTML = '<span class="dt"></span>连接失败'; }
  else if(state === 'wait'){ pill.className = 'pill wait'; pill.innerHTML = '<span class="dt"></span>连接中…'; }
  else { pill.className = 'pill'; pill.innerHTML = '<span class="dt"></span>未连接'; }
}
function doLogout(){
  store.del('og_admin_key');
  AK = '';   authLost = false;
  S = { channels: [], keys: [], settings: {}, stats: null, logs: [], logCursor: null, logDate: '', serverToday: '', logDates: [] };
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  var akInput = $('ak'); if(akInput) akInput.value = '';
  var di = $('logDate'); if(di) di.value = '';
  setConn('off');
  $('login').classList.add('on');
  renderAll();
  if(akInput){ try{ akInput.focus(); }catch(e){} }
  toast('已退出登录');
}

/** 逐个接口独立请求：某个接口挂了不影响其它数据，也不会把用户踢出登录。
 *  返回「失败的接口清单」；只有在明确 401/403 时才 reject。 */
function loadAll(){
  var jobs = [
    api('/api/admin/channels').then(function(v){ S.channels = v || []; }),
    api('/api/admin/keys').then(function(v){ S.keys = v || []; }),
    api('/api/admin/settings').then(function(v){ S.settings = v || {}; }),
    api('/api/admin/stats?days=' + RANGE).then(function(v){ S.stats = v || null; }),
    api('/api/admin/logs/dates').then(function(v){
      // 用服务端（按设置里的时区偏移）算出的「今天」作为默认查询日期，
      // 避免浏览器时区与 Worker 的 UTC 时区不一致导致查不到刚产生的日志
      S.serverToday = (v && v.today) || todayLocal();
      S.logDates = (v && v.dates) || [];
    })
  ];
  var failed = [];
  return Promise.all(jobs.map(function(p){
    return p.catch(function(e){ failed.push(e); });
  })).then(function(){
    var authFail = failed.filter(isAuthErr)[0];
    if(authFail) throw authFail;
    var di = $('logDate');
    if(di && !di.value) di.value = S.serverToday || todayLocal();
    S.logDate = di ? di.value : S.serverToday;
    // 渲染异常不应被当成「登录失败」，单独兜住
    try { renderAll(); } catch(re){ if(window.console) console.error('[render]', re); }
    return failed;
  });
}

/** 鉴权探针：'ok' 有效 / 'bad' 明确无效 / 'unknown' 无法判定（网络故障等） */
function probeAuth(){
  return api('/api/admin/ping').then(function(){
    return 'ok';
  }).catch(function(e){
    if(isAuthErr(e) || isKeyMissing(e)) return 'bad';
    if(e.status === 404){
      // 兼容尚未部署 ping 接口的旧版 Worker：退回用 settings 判断
      return api('/api/admin/settings').then(function(){ return 'ok'; }).catch(function(e2){
        if(isAuthErr(e2) || isKeyMissing(e2)) return 'bad';
        return 'unknown';
      });
    }
    return 'unknown';
  });
}

function connect(silent){
  if(!AK){
    if(!silent) toast('请先输入 Admin Key', 'bad');
    $('login').classList.add('on');
    return;
  }
  authLost = false;   // 本轮尝试重新计，用于判断是否已由 markLoggedOut 提示过
  setConn('wait');
  probeAuth().then(function(auth){
    if(auth === 'bad'){
      // Key 确实无效（或服务端没配 ADMIN_KEY）才回登录页。
      // 401 时 markLoggedOut 已经清过缓存并提示过，这里不重复弹 toast。
      var alreadyTold = authLost;
      authLost = true;
      setConn('fail');
      $('login').classList.add('on');
      if(!alreadyTold) toast(silent ? '登录已失效，请重新输入 Admin Key' : 'Admin Key 不正确，请检查后重试', 'bad');
      return;
    }
    // 'ok'：正常登录；'unknown'：服务端暂时连不上，但 Key 未必有问题 —— 保留登录态
    authLost = false;
    var remembered = store.set('og_admin_key', AK);
    $('login').classList.remove('on');
    setConn(auth === 'ok' ? 'ok' : 'fail');
    if(!remembered) warnNoStorage();
    if(auth === 'unknown') toast('暂时无法连接服务端，已保留登录状态', 'bad');
    return loadAll().then(function(failed){
      if(failed && failed.length) toast(failed.length + ' 个接口暂时不可用，其余数据已正常显示', 'bad');
    }).catch(function(e){
      if(!isAuthErr(e)) toast(e.message, 'bad');
    });
  });
}

function refresh(){
  if(!AK) return;
  loadAll().then(function(failed){
    if(failed && failed.length) toast(failed.length + ' 个接口暂时不可用，已显示其余数据', 'bad');
    else toast('已刷新', 'ok');
  }).catch(function(e){
    // 只有 401/403 走到这里（markLoggedOut 已弹登录页），无需重复提示
    if(!isAuthErr(e)) toast(e.message, 'bad');
  });
}

/* ---------- 导航 ---------- */
function gotoTab(t){
  document.querySelectorAll('.navbtn').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-tab') === t); });
  document.querySelectorAll('.tab').forEach(function(s){ s.classList.remove('on'); });
  var el = $('t-' + t); if(el) el.classList.add('on');
  var meta = TITLES[t] || ['', ''];
  $('pageTitle').textContent = meta[0];
  $('pageDesc').textContent = meta[1];
  document.title = meta[0] ? meta[0] + ' · OneAPI Gateway' : 'OneAPI Gateway · 控制台';
  if(t === 'logs'){ if(!$('logDate').value) $('logDate').value = S.serverToday || todayLocal(); loadLogs(true); }
  if(t === 'settings') renderSettings();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.navbtn').forEach(function(b){
  b.addEventListener('click', function(){ gotoTab(b.getAttribute('data-tab')); });
});

/* ---------- 图表 ---------- */
function chartSvg(series, opts){
  opts = opts || {};
  var w = 780, h = 210, padL = 50, padR = 16, padT = 16, padB = 30;
  var iw = w - padL - padR, ih = h - padT - padB;
  var max = 0;
  series.forEach(function(p){ if(p.value > max) max = p.value; });
  max = max > 0 ? max * 1.18 : 1;
  var n = series.length;
  var fmt = opts.fmt || fmtShort;
  function X(i){ return n > 1 ? padL + i * (iw / (n - 1)) : padL + iw / 2; }
  function Y(v){ return padT + ih - (v / max) * ih; }
  var grid = '';
  for(var k = 0; k <= 4; k++){
    var gy = padT + ih - (k / 4) * ih;
    grid += '<line class="gl" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '"/>';
    grid += '<text class="axis" x="' + (padL - 10) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt(max * k / 4)) + '</text>';
  }
  var line = '', area = '', xlabels = '', dots = '';
  if(n > 0){
    var pts = series.map(function(p, i){ return X(i).toFixed(1) + ',' + Y(p.value).toFixed(1); });
    line = 'M' + pts.join(' L');
    area = line + ' L' + X(n - 1).toFixed(1) + ',' + (padT + ih) + ' L' + X(0).toFixed(1) + ',' + (padT + ih) + ' Z';
    var step = Math.max(1, Math.ceil(n / 8));
    series.forEach(function(p, i){
      if(i % step === 0 || i === n - 1)
        xlabels += '<text class="axis" x="' + X(i).toFixed(1) + '" y="' + (h - 9) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    if(n <= 40){
      dots = series.map(function(p, i){
        return '<circle class="dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.value).toFixed(1) + '" r="3"><title>' + esc(p.label + ' · ' + fmt(p.value)) + '</title></circle>' +
          '<circle class="hot" data-i="' + i + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.value).toFixed(1) + '" r="11" fill="transparent" style="cursor:crosshair"/>';
      }).join('');
    }
  }
  var gid = 'agrad';
  return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop class="gs1" offset="0"/><stop class="gs2" offset="1"/></linearGradient></defs>' +
    grid +
    '<path class="ar" fill="url(#' + gid + ')" d="' + area + '"/>' +
    '<line class="ln" x1="0" y1="0" x2="0" y2="0" stroke="none"/>' +
    '<path class="ln" d="' + line + '"/>' + dots + xlabels + '</svg>';
}

/* ---------- 概览 ---------- */
function statCard(o){
  return '<div class="stat"><div class="top"><span class="label">' + esc(o.label) + '</span>' +
    '<span class="ic ' + (o.tone || '') + '">' + (o.icon || '') + '</span></div>' +
    '<div class="num">' + o.value + (o.delta || '') + '</div><div class="sub">' + o.sub + '</div></div>';
}
/* 环比徽章：当前周期 vs 上一周期同长度窗口，↑绿 ↓红 →灰；上一周期无数据则不显示 */
function deltaBadge(curr, prev){
  curr = Number(curr || 0); prev = Number(prev || 0);
  if(!prev && !curr) return '';
  var cls, arrow, txt;
  if(!prev){ cls = 'up'; arrow = '↑'; txt = '新增'; }
  else {
    var pct = Math.round(((curr - prev) / prev) * 1000) / 10;
    if(pct > 0){ cls = 'up'; arrow = '↑'; }
    else if(pct < 0){ cls = 'down'; arrow = '↓'; }
    else { cls = 'flat'; arrow = '→'; }
    txt = Math.abs(pct) + '%';
  }
  return '<span class="delta ' + cls + '" title="较上一周期（往前同样天数）">' + arrow + txt + '</span>';
}
function renderStats(){
  var t = (S.stats && S.stats.totals) || { requests:0, ok:0, failed:0, tokens:0, cost:0, avg_ms:0, success_rate:0 };
  var pv = (S.stats && S.stats.prev_totals) || null;
  var enCh = S.channels.filter(function(c){ return c.enabled; }).length;
  var enKey = S.keys.filter(function(k){ return k.enabled !== false && !isExpired(k); }).length;
  var rate = t.success_rate || 0;
  var tone = rate >= 99 ? 'ok' : (rate >= 90 ? 'warn' : 'bad');
  var html = '';
  var aborted = t.streams_aborted || 0;
  html += statCard({ label:'请求总数', value: fmtNum(t.requests), delta: deltaBadge(t.requests, pv && pv.requests), sub:'近 ' + RANGE + ' 天 · 流式 ' + fmtNum(t.streams) + (aborted ? ' · 异常结束 ' + fmtNum(aborted) : ''), icon: I.list });
  html += statCard({ label:'成功率', value: rate + '%', sub:'成功 ' + fmtNum(t.ok) + ' · 失败 ' + fmtNum(t.failed), icon: I.check, tone: t.requests ? tone : '' });
  html += statCard({ label:'Tokens', value: fmtNum(t.tokens), delta: deltaBadge(t.tokens, pv && pv.tokens), sub:'输入 + 输出合计', icon: I.bolt });
  html += statCard({ label:'预估费用', value: '$' + fmtCost(t.cost), delta: deltaBadge(t.cost, pv && pv.cost), sub:'按定价表估算（USD）', icon: I.coin });
  html += statCard({ label:'平均延迟', value: fmtMs(t.avg_ms), sub:'含上游排队与生成', icon: I.clock });
  html += statCard({ label:'启用资源', value: enCh + ' / ' + enKey, sub:'渠道 / 有效密钥', icon: I.server });
  $('statCards').innerHTML = html;
}
function renderTrend(){
  var days = (S.stats && S.stats.days) || [];
  var pts = days.map(function(d){ return { label: d.date.slice(5), value: Number(d[METRIC] || 0) }; });
  var fmt = METRIC === 'cost' ? function(v){ return '$' + fmtCost(v); } : fmtShort;
  var total = pts.reduce(function(a, p){ return a + p.value; }, 0);
  var unit = METRIC === 'requests' ? '次请求' : (METRIC === 'tokens' ? 'Tokens' : '美元');
  var totalTxt = METRIC === 'cost' ? '$' + fmtCost(total) : fmtNum(total) + ' ' + unit;
  $('trendDesc').textContent = '近 ' + RANGE + ' 天 · 合计 ' + totalTxt;
  $('trendChart').innerHTML = pts.length
    ? chartSvg(pts, { fmt: fmt })
    : '<div class="empty">' + I.inbox + '<div>暂无统计数据，发起一次请求后即可看到趋势</div></div>';
  bindChartTip();
}
/* 趋势图悬浮提示：鼠标悬停数据点热区时，浮层显示完整日期与该日数值 */
function bindChartTip(){
  var wrap = $('trendChart');
  var svg = wrap ? wrap.querySelector('svg.chart') : null;
  if(!svg) return;
  var old = wrap.querySelector('.ctip'); if(old) old.remove();
  var tip = document.createElement('div');
  tip.className = 'ctip';
  wrap.appendChild(tip);
  svg.addEventListener('mousemove', function(e){
    var hot = e.target && e.target.classList && e.target.classList.contains('hot') ? e.target : null;
    if(!hot){ tip.style.display = 'none'; return; }
    var i = parseInt(hot.getAttribute('data-i'), 10);
    var days = (S.stats && S.stats.days) || [];
    var p = days[i] || null;
    if(!p){ tip.style.display = 'none'; return; }
    var v = Number(p[METRIC] || 0);
    var txt = METRIC === 'cost' ? '$' + fmtCost(v) : (METRIC === 'tokens' ? fmtNum(v) + ' Tokens' : fmtNum(v) + ' 次请求');
    tip.innerHTML = esc(p.date) + '<br><b>' + txt + '</b>';
    var wr = wrap.getBoundingClientRect();
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if(!vb){ tip.style.display = 'none'; return; }
    var x = (parseFloat(hot.getAttribute('cx')) / vb.width) * wr.width;
    var y = (parseFloat(hot.getAttribute('cy')) / vb.height) * wr.height;
    tip.style.display = 'block';
    tip.style.left = Math.min(Math.max(0, wr.width - 140), Math.max(0, x + 12)) + 'px';
    tip.style.top = Math.max(0, y - 48) + 'px';
  });
  svg.addEventListener('mouseleave', function(){ tip.style.display = 'none'; });
}
function renderOverview(){
  var html = '';
  if(!S.channels.length){
    html = '<div class="empty">' + I.inbox + '<div>暂无渠道，去「渠道管理」添加第一个吧</div></div>';
  } else {
    S.channels.forEach(function(c, i){
      var h = c.health || null;
      var hb = h ? (h.ok ? '<span class="badge ok">正常 ' + fmtMs(h.ms) + '</span>' : '<span class="badge bad" title="' + esc(h.message || '') + '">异常</span>') : '<span class="badge">未测试</span>';
      html += '<div class="hrow"><span class="dot ' + (c.enabled ? 'ok' : '') + '"></span>' +
        '<div class="hmain"><b>' + esc(c.name) + '</b><span>' + esc(c.base_url) + '</span></div>' +
        '<span class="badge ' + (c.type === 'anthropic' ? 'info' : '') + '">' + (c.type === 'anthropic' ? 'Anthropic' : 'OpenAI') + '</span>' +
        hb + '<button class="ghost sm" data-act="test-ch" data-i="' + i + '">测试</button></div>';
    });
  }
  $('ovChannels').innerHTML = html;

  var models = (S.stats && S.stats.models) || [];
  $('ovModels').innerHTML = models.length ? miniTable(models, ['模型', '请求', 'Tokens', '费用']) : '<div class="empty">' + I.inbox + '<div>暂无数据</div></div>';
  var keys = (S.stats && S.stats.keys) || [];
  $('ovKeys').innerHTML = keys.length ? miniTable(keys, ['密钥', '请求', 'Tokens', '费用']) : '<div class="empty">' + I.inbox + '<div>暂无数据</div></div>';
}
function miniTable(rows, cols){
  var h = '<table><thead><tr><th style="min-width:150px">' + cols[0] + '</th><th class="ar">' + cols[1] + '</th><th class="ar">' + cols[2] + '</th><th class="ar">' + cols[3] + '</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h += '<tr><td class="mono">' + esc(r.name) + '</td><td class="ar">' + fmtNum(r.requests) + '</td><td class="ar">' + fmtNum(r.tokens) + '</td><td class="ar">$' + fmtCost(r.cost) + '</td></tr>';
  });
  return h + '</tbody></table>';
}

/* ---------- 渠道 ---------- */
function typeBadge(c){
  return c.type === 'anthropic' ? '<span class="badge info">Anthropic 原生</span>' : '<span class="badge">OpenAI 兼容</span>';
}
function modelChips(c){
  var models = (c && c.models) || [];
  if(!models.length) return '<span class="muted">-</span>';
  var map = (c && c.model_map) || {};
  var out = models.slice(0, 3).map(function(m){
    var t = map[m];
    var renamed = t && t !== m;
    return '<span class="chip" title="' + esc(renamed ? '对外名称 ' + m + ' → 上游真实模型 ' + t : m) + '">' +
      '<span class="nm">' + esc(m) + '</span>' +
      (renamed ? ' <span class="nm muted">→ ' + esc(t) + '</span>' : '') + '</span>';
  }).join('');
  if(models.length > 3) out += '<span class="chip">+' + (models.length - 3) + '</span>';
  return out;
}
function filteredChannels(){
  var q = ($('chQ').value || '').trim().toLowerCase();
  var ty = $('chType').value, st = $('chStatus').value;
  return S.channels.map(function(c, i){ return { c: c, i: i }; }).filter(function(o){
    var c = o.c;
    if(ty && (c.type || 'openai') !== ty) return false;
    if(st === 'on' && !c.enabled) return false;
    if(st === 'off' && c.enabled) return false;
    if(q){
      var hay = [c.name, c.base_url, (c.models || []).join(',')].join(' ').toLowerCase();
      if(hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}
function renderChannels(){
  var list = filteredChannels();
  var h = '<table><thead><tr><th style="width:56px">状态</th><th style="min-width:170px">名称</th><th style="width:112px">类型</th><th style="min-width:140px">Base URL</th><th style="width:220px">模型</th><th class="ar" style="width:76px">优先级</th><th style="width:72px">健康</th><th class="ar" style="width:172px">操作</th></tr></thead><tbody>';
  if(!list.length){
    h += '<tr><td colspan="8"><div class="empty">' + I.inbox + '<div>' + (S.channels.length ? '没有符合筛选条件的渠道' : '暂无渠道，点击右上角「添加渠道」创建') + '</div></div></td></tr>';
  }
  list.forEach(function(o){
    var c = o.c, i = o.i;
    var hh = c.health;
    var hb = hh ? (hh.ok ? '<span class="badge ok">正常</span>' : '<span class="badge bad" title="' + esc(hh.message || '') + '">异常</span>') : '<span class="badge">-</span>';
    var subTxt = 'API Key × ' + String(c.api_key || '').split(',').filter(function(s){ return s.trim(); }).length + (hh && hh.checked_at ? ' · 测试于 ' + fmtTime(hh.checked_at) : '');
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="toggle-ch" data-i="' + i + '"' + (c.enabled ? ' checked' : '') + '><span></span></label></td>' +
      '<td><div class="tname"><div><b>' + esc(c.name) + '</b><span class="sub" title="' + esc(subTxt) + '">' + esc(subTxt) + '</span></div></div></td>' +
      '<td>' + typeBadge(c) + '</td>' +
      '<td><span class="url" title="' + esc(c.base_url) + '">' + esc(c.base_url) + '</span></td>' +
      '<td>' + modelChips(c) + '</td>' +
      '<td class="ar nowrap">' + esc(c.priority == null ? 100 : c.priority) + ' <span class="muted">/ w' + esc(c.weight || 1) + '</span></td>' +
      '<td>' + hb + '</td>' +
      '<td><div class="ops r"><button class="ghost sm" data-act="test-ch" data-i="' + i + '">测试</button>' +
      '<button class="ghost sm" data-act="edit-ch" data-i="' + i + '">编辑</button>' +
      '<button class="soft sm" data-act="del-ch" data-i="' + i + '">删除</button></div></td></tr>';
  });
  $('chTable').innerHTML = h + '</tbody></table>';
  $('navCh').textContent = S.channels.length;
}
function mapRowsHtml(map){
  var rows = '';
  Object.keys(map || {}).forEach(function(k){ rows += mapRowHtml(k, map[k]); });
  return rows || '';
}
function mapRowHtml(k, v){
  return '<div class="maprow"><input class="m_k" list="m_modelList" type="text" placeholder="对外名称（网关模型名）" value="' + esc(k || '') + '">' +
    '<span class="muted">→</span><input class="m_v" type="text" placeholder="渠道真实模型名" value="' + esc(v || '') + '">' +
    '<button class="icon-btn" data-act="map-del" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
}
/** 把「对外暴露的模型名」灌进 datalist，供映射左侧直接选择 */
function syncModelList(){
  var dl = $('m_modelList'); if(!dl) return;
  var models = ($('m_models').value || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  dl.innerHTML = models.map(function(m){ return '<option value="' + esc(m) + '"></option>'; }).join('');
}
/** 提示映射左侧名称是否已包含在「对外暴露的模型名」中，并提供一键补全 */
function refreshMapHint(){
  var box = $('mapHint'); if(!box) return;
  var models = ($('m_models').value || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var missing = [];
  document.querySelectorAll('#mapRows .m_k').forEach(function(inp){
    var v = inp.value.trim();
    if(v && models.indexOf(v) < 0 && models.indexOf('*') < 0 && missing.indexOf(v) < 0) missing.push(v);
  });
  if(!missing.length){
    box.innerHTML = '左侧填「对外暴露的模型名」，右侧填渠道真实模型名；两者相同时可省略该行。';
    return;
  }
  box.innerHTML = '<span class="warnc">以下映射的左侧名称不在「对外暴露的模型名」中，调用方用这些名字会匹配不到本渠道：' + esc(missing.join('、')) + '</span> ' +
    '<button class="ghost sm" data-act="map-sync">补全到模型列表</button>';
}
function mapSync(){
  var models = ($('m_models').value || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  document.querySelectorAll('#mapRows .m_k').forEach(function(inp){
    var v = inp.value.trim();
    if(v && models.indexOf(v) < 0) models.push(v);
  });
  $('m_models').value = models.join(',');
  syncModelList();
  refreshMapHint();
}
function hdrRowHtml(k, v){
  return '<div class="hdrrow"><input class="h_k" type="text" placeholder="Header 名称" value="' + esc(k || '') + '">' +
    '<input class="h_v" type="text" placeholder="Header 值" value="' + esc(v || '') + '">' +
    '<button class="icon-btn" data-act="hdr-del" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
}
function openChannelModal(i){
  editingCh = i;
  var c = i >= 0 ? S.channels[i] : { name:'', type:'openai', base_url:'https://api.openai.com', api_key:'', models:[], model_map:{}, headers:{}, priority:100, weight:1, default_max_tokens:4096, enabled:true };
  var isAnthropic = (c.type || 'openai') === 'anthropic';
  openModal('<h3>' + (i >= 0 ? '编辑渠道' : '添加渠道') + '</h3><p class="msub">' + (i >= 0 ? esc(c.name || '') : '配置一个上游模型服务') + '</p>' +
    '<div class="grid">' +
    '<label>名称<input id="m_name" type="text" value="' + esc(c.name || '') + '" placeholder="如：OpenAI 官方"></label>' +
    '<label>渠道类型<select id="m_type"><option value="openai"' + (!isAnthropic ? ' selected' : '') + '>OpenAI 兼容</option><option value="anthropic"' + (isAnthropic ? ' selected' : '') + '>Anthropic 原生</option></select></label>' +
    '<label>Base URL（末尾不要加 /v1）<input id="m_base" type="text" value="' + esc(c.base_url || '') + '" placeholder="https://api.openai.com"></label>' +
    '<label>优先级（越小越优先）<input id="m_prio" type="number" value="' + esc(c.priority == null ? 100 : c.priority) + '"></label>' +
    '<label>权重（同优先级内加权随机）<input id="m_weight" type="number" min="1" value="' + esc(c.weight || 1) + '"></label>' +
    '<label>超时毫秒（留空用全局默认）<input id="m_timeout" type="number" min="1000" value="' + esc(c.timeout_ms || '') + '" placeholder="60000"></label>' +
    '<label>默认 max_tokens（Anthropic 必需）<input id="m_maxt" type="number" value="' + esc(c.default_max_tokens || 4096) + '"></label>' +
    '<label class="check" style="justify-content:flex-start;margin-top:22px"><input id="m_enabled" type="checkbox"' + (c.enabled !== false ? ' checked' : '') + '> 启用该渠道</label>' +
    '</div>' +
    '<label class="fld">渠道 API Key（多个 Key 用英文逗号 , 分隔）<textarea id="m_key" rows="2" placeholder="sk-aaa,sk-bbb">' + esc(c.api_key || '') + '</textarea></label>' +
    '<label class="fld">对外暴露的模型名（网关模型名，逗号分隔，* 表示全部）<input id="m_models" type="text" value="' + esc((c.models || []).join(',')) + '" placeholder="DeepSeek-V4-Flash,Agents-A1"><span class="hint">调用方用这里的名字请求网关，它同时决定该渠道能被哪些模型名匹配到。</span></label>' +
    '<div class="fld"><div class="toolbar" style="margin-bottom:6px"><span style="font-size:12.5px;color:var(--text2)">模型映射（对外名称 → 渠道真实模型名）</span><div class="spacer"></div><button class="ghost sm" data-act="map-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>添加映射</button></div><div id="mapRows">' + mapRowsHtml(c.model_map) + '</div><div class="hint" id="mapHint"></div></div>' +
    '<datalist id="m_modelList"></datalist>' +
    '<div class="fld"><div class="toolbar" style="margin-bottom:6px"><span style="font-size:12.5px;color:var(--text2)">附加请求头（可选，随请求发送给上游）</span><div class="spacer"></div><button class="ghost sm" data-act="hdr-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>添加请求头</button></div><div id="hdrRows">' + Object.keys(c.headers || {}).map(function(k){ return hdrRowHtml(k, c.headers[k]); }).join('') + '</div></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-ch">保存渠道</button></div>', 'lg');
  syncModelList();
  refreshMapHint();
}
function readPairs(containerId, kClass, vClass){
  var out = {};
  document.querySelectorAll('#' + containerId + ' .' + kClass).forEach(function(inp){
    var row = inp.parentNode;
    var k = inp.value.trim();
    var v = row.querySelector('.' + vClass).value.trim();
    if(k) out[k] = v;
  });
  return out;
}
function saveChannel(){
  var name = $('m_name').value.trim() || '未命名渠道';
  var models = $('m_models').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if(!models.length){ toast('请至少填写一个模型（或 *）', 'bad'); return; }
  var keyStr = $('m_key').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean).join(',');
  var c = {
    id: editingCh >= 0 ? S.channels[editingCh].id : 'ch_' + Date.now().toString(36),
    name: name,
    type: $('m_type').value || 'openai',
    base_url: $('m_base').value.trim().replace(/\\/+$/, ''),
    api_key: keyStr,
    models: models,
    model_map: readPairs('mapRows', 'm_k', 'm_v'),
    headers: readPairs('hdrRows', 'h_k', 'h_v'),
    default_max_tokens: parseInt($('m_maxt').value, 10) || 4096,
    priority: parseInt($('m_prio').value, 10) || 100,
    weight: Math.max(1, parseInt($('m_weight').value, 10) || 1),
    enabled: $('m_enabled').checked
  };
  var t = parseInt($('m_timeout').value, 10);
  if(t > 0) c.timeout_ms = t;
  if(editingCh >= 0 && S.channels[editingCh].health) c.health = S.channels[editingCh].health;
  if(editingCh >= 0) S.channels[editingCh] = c; else S.channels.push(c);
  saveChannels().then(function(){ closeModal(); toast('渠道已保存', 'ok'); renderChannels(); renderOverview(); })
    .catch(function(e){ toast(e.message, 'bad'); });
}
function saveChannels(){ return api('/api/admin/channels', 'POST', { channels: S.channels }); }
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
  var old = btn.innerHTML;
  btn.disabled = true; btn.textContent = '测试中…';
  api('/api/admin/test-channel', 'POST', { id: c.id }).then(function(r){
    if(r.error){ toast(r.error, 'bad'); return; }
    var rows = (r.keys || []).map(function(k){
      return '<tr><td>Key ' + k.index + '</td>' +
        '<td>' + (k.ok ? '<span class="badge ok">成功</span>' : '<span class="badge bad">失败</span>') + '</td>' +
        '<td>' + esc(fmtMs(k.ms)) + '</td>' +
        '<td class="mono">' + esc(k.http_status || '-') + '</td>' +
        '<td class="mono">' + esc(k.ok ? (k.snippet || '(空响应)') : (k.error || '未知错误')) + '</td></tr>';
    }).join('');
    openModal('<h3>渠道测试 · ' + esc(c.name) + '</h3>' +
      '<div class="kv"><span>总体结果</span>' + (r.ok ? '<b class="good">至少一个 Key 可用</b>' : '<b class="bad">全部 Key 失败</b>') + '</div>' +
      '<table style="margin-top:8px"><thead><tr><th>Key</th><th>结果</th><th>延迟</th><th>状态码</th><th>详情</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>');
    return loadAll().catch(function(){});
  }).catch(function(e){ toast(e.message, 'bad'); })
    .then(function(){ btn.disabled = false; btn.innerHTML = old; });
}
function testAll(btn){
  var old = btn.innerHTML;
  btn.disabled = true; btn.textContent = '测试中…';
  api('/api/admin/test-all', 'POST', {}).then(function(r){
    var rows = (r.results || []).map(function(x){
      if(x.skipped) return '<tr><td>' + esc(x.name) + '</td><td colspan="2"><span class="badge">已禁用，跳过</span></td></tr>';
      var okN = (x.keys || []).filter(function(k){ return k.ok; }).length;
      return '<tr><td>' + esc(x.name) + '</td><td>' + (x.ok ? '<span class="badge ok">可用</span>' : '<span class="badge bad">不可用</span>') + '</td><td>' + okN + ' / ' + ((x.keys || []).length || 0) + ' 个 Key 正常</td></tr>';
    }).join('');
    openModal('<h3>批量连通性测试</h3><p class="msub">已启用的渠道会逐个探测，结果同时写入渠道健康状态</p>' +
      '<table><thead><tr><th>渠道</th><th>结果</th><th>详情</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>');
    return loadAll().catch(function(){});
  }).catch(function(e){ toast(e.message, 'bad'); })
    .then(function(){ btn.disabled = false; btn.innerHTML = old; });
}
function routeTest(){
  openModal('<h3>路由测试</h3><p class="msub">输入模型名，查看网关的渠道候选顺序并实际发起一次调用</p>' +
    '<div class="grid"><label>模型<input id="rt_model" type="text" placeholder="gpt-4o-mini"></label>' +
    '<label>提示词<input id="rt_prompt" type="text" value="ping"></label></div>' +
    '<div id="rt_result" style="margin-top:14px"></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button><button data-act="run-route-test">开始测试</button></div>');
}
function runRouteTest(btn){
  var model = ($('rt_model').value || '').trim();
  if(!model){ toast('请输入模型名', 'bad'); return; }
  btn.disabled = true; var old = btn.innerHTML; btn.textContent = '测试中…';
  $('rt_result').innerHTML = '<div class="empty">正在按路由顺序尝试…</div>';
  api('/api/admin/test-route', 'POST', { model: model, prompt: $('rt_prompt').value || 'ping' }).then(function(r){
    var cand = (r.candidates || []).map(function(c, i){ return '<span class="chip">' + (i + 1) + '. ' + esc(c.name) + ' · p' + c.priority + ' w' + c.weight + '</span>'; }).join('');
    var att = (r.attempts || []).map(function(a){
      return '<div class="kv"><span>' + esc(a.channel) + '</span>' + (a.ok ? '<b class="good">成功</b>' : '<b class="bad">失败 · ' + esc(a.error || a.http_status || '') + '</b>') + '</div>';
    }).join('');
    $('rt_result').innerHTML =
      '<div class="kv"><span>候选顺序</span><div style="text-align:right">' + (cand || '<span class="muted">无可用渠道</span>') + '</div></div>' +
      att +
      (r.answer ? '<div class="fld"><span style="font-size:12.5px;color:var(--text2)">模型回复</span><pre class="detail" style="max-height:160px;margin-top:6px">' + esc(r.answer) + '</pre></div>' : '') +
      '<div class="kv"><span>耗时</span><b>' + esc(fmtMs(r.ms)) + '</b></div>';
  }).catch(function(e){ toast(e.message, 'bad'); $('rt_result').innerHTML = ''; })
    .then(function(){ btn.disabled = false; btn.innerHTML = old; });
}

/* ---------- 密钥 ---------- */
function quotaCell(k){
  if(!(k.quota_tokens > 0)) return '<span class="muted">不限</span>';
  var pct = Math.min(100, Math.round(((k.used_tokens || 0) / k.quota_tokens) * 100));
  var cls = pct >= 100 ? 'bad' : (pct >= 80 ? 'warn' : '');
  return '<div class="quota"><div class="progress"><i class="' + cls + '" style="width:' + pct + '%"></i></div><span class="mono-s">' + pct + '%</span></div>';
}
function filteredKeys(){
  var q = ($('keyQ').value || '').trim().toLowerCase();
  var st = $('keyStatus').value;
  return S.keys.map(function(k, i){ return { k: k, i: i }; }).filter(function(o){
    var k = o.k;
    if(st === 'on' && (k.enabled === false || isExpired(k))) return false;
    if(st === 'off' && k.enabled !== false) return false;
    if(st === 'expired' && !isExpired(k)) return false;
    if(st === 'exhausted' && !isExhausted(k)) return false;
    if(q){
      var hay = [k.name, k.key].join(' ').toLowerCase();
      if(hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}
function renderKeys(){
  var list = filteredKeys();
  var h = '<table><thead><tr><th style="width:56px">状态</th><th style="min-width:150px">名称</th><th style="min-width:150px">密钥</th><th style="width:132px">配额</th><th class="ar" style="width:152px">已用 Tokens</th><th style="width:108px">有效期</th><th class="ar" style="width:212px">操作</th></tr></thead><tbody>';
  if(!list.length){
    h += '<tr><td colspan="7"><div class="empty">' + I.inbox + '<div>' + (S.keys.length ? '没有符合筛选条件的密钥' : '暂无密钥，点击右上角「生成密钥」创建') + '</div></div></td></tr>';
  }
  list.forEach(function(o){
    var k = o.k, i = o.i;
    var exp = isExpired(k);
    var expTxt = k.expires_at ? esc(String(k.expires_at).slice(0, 10)) : '<span class="muted">长期</span>';
    if(exp) expTxt = '<span class="bad">' + esc(String(k.expires_at).slice(0, 10)) + '</span>';
    var subs = [];
    if(k.note) subs.push(esc(k.note));
    if(k.allowed_models && k.allowed_models.length && k.allowed_models.indexOf('*') < 0) subs.push('限 ' + esc(k.allowed_models.join('/')));
    if(k.last_used_at) subs.push('最近 ' + esc(fmtTime(k.last_used_at)));
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="toggle-key" data-i="' + i + '"' + (k.enabled !== false ? ' checked' : '') + '><span></span></label></td>' +
      '<td><div class="tname"><div><b>' + esc(k.name) + '</b>' + (subs.length ? '<span class="sub" title="' + esc(subs.join(' · ')) + '">' + subs.join(' · ') + '</span>' : '') + '</div></div></td>' +
      '<td class="mono nowrap">' + esc(maskKey(k.key)) + ' <button class="ghost sm" data-act="copy-key" data-i="' + i + '" title="复制完整密钥"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></td>' +
      '<td>' + quotaCell(k) + '</td>' +
      '<td class="nowrap ar">' + fmtNum(k.used_tokens) + (k.quota_tokens > 0 ? ' <span class="muted">/ ' + fmtNum(k.quota_tokens) + '</span>' : '') + '<span class="sub muted">' + fmtNum(k.requests) + ' 次请求 · $' + fmtCost(k.used_cost) + '</span></td>' +
      '<td class="nowrap">' + expTxt + '</td>' +
      '<td><div class="ops r"><button class="ghost sm" data-act="edit-key" data-i="' + i + '">编辑</button>' +
      '<button class="ghost sm" data-act="curl-key" data-i="' + i + '">示例</button>' +
      '<button class="ghost sm" data-act="reset-key" data-i="' + i + '">清零</button>' +
      '<button class="soft sm" data-act="del-key" data-i="' + i + '">删除</button></div></td></tr>';
  });
  $('keyTable').innerHTML = h + '</tbody></table>';
  $('navKey').textContent = S.keys.length;
}
function openKeyModal(i){
  editingKey = i;
  var k = i >= 0 ? S.keys[i] : { name:'', quota_tokens:0, allowed_models:[], enabled:true, note:'' };
  var expVal = k.expires_at ? String(k.expires_at).slice(0, 10) : '';
  openModal('<h3>' + (i >= 0 ? '编辑密钥' : '生成密钥') + '</h3><p class="msub">' + (i >= 0 ? esc(k.name) : '将生成一串随机密钥，仅显示一次') + '</p>' +
    '<div class="grid">' +
    '<label>名称<input id="k_name" type="text" value="' + esc(k.name || '') + '" placeholder="如：前端应用"></label>' +
    '<label>Token 配额（0 表示不限）<input id="k_quota" type="number" min="0" value="' + esc(k.quota_tokens || 0) + '"></label>' +
    '<label>允许调用的模型（逗号分隔，留空=全部）<input id="k_models" type="text" value="' + esc((k.allowed_models || []).join(',')) + '" placeholder="gpt-4o-mini,claude-sonnet-4-5"></label>' +
    '<label>有效期（留空=长期有效）<input id="k_exp" type="date" value="' + esc(expVal) + '"></label>' +
    '<label>备注<input id="k_note" type="text" value="' + esc(k.note || '') + '" placeholder="可选"></label>' +
    '<label class="check" style="justify-content:flex-start;margin-top:22px"><input id="k_enabled" type="checkbox"' + (k.enabled !== false ? ' checked' : '') + '> 启用该密钥</label>' +
    '</div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-key">' + (i >= 0 ? '保存' : '生成') + '</button></div>');
}
function saveKeys(){ return api('/api/admin/keys', 'POST', { keys: S.keys }); }
function saveKey(){
  var exp = $('k_exp').value;
  var base = {
    name: $('k_name').value.trim() || '未命名',
    enabled: $('k_enabled').checked,
    quota_tokens: parseInt($('k_quota').value, 10) || 0,
    allowed_models: $('k_models').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
    note: $('k_note').value.trim(),
    expires_at: exp ? exp + 'T23:59:59.000Z' : ''
  };
  var isNew = editingKey < 0;
  var k;
  if(isNew){
    k = { key: genKey(), used_tokens: 0, requests: 0, used_cost: 0, created_at: new Date().toISOString() };
    Object.keys(base).forEach(function(x){ k[x] = base[x]; });
    S.keys.push(k);
  } else {
    k = S.keys[editingKey];
    Object.keys(base).forEach(function(x){ k[x] = base[x]; });
  }
  saveKeys().then(function(){
    closeModal(); renderKeys(); renderOverview();
    if(isNew){
      openModal('<h3>密钥已生成</h3><p class="msub">请立即复制保存，关闭后将无法再次查看完整密钥</p>' +
        '<pre class="detail">' + esc(k.key) + '</pre>' +
        '<div class="row end"><button data-act="copy-text" data-t="' + esc(k.key) + '">复制密钥</button><button class="ghost" data-act="close-modal">关闭</button></div>', 'sm');
    } else {
      toast('密钥已保存', 'ok');
    }
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function showCurl(i){
  var k = S.keys[i];
  var origin = window.location.origin;
  var cmd = 'curl ' + origin + '/v1/chat/completions \\n' +
    '  -H "Authorization: Bearer ' + k.key + '" \\n' +
    '  -H "Content-Type: application/json" \\n' +
    '  -d \\'{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "你好"}], "stream": true}\\'';
  var js = 'const res = await fetch("' + origin + '/v1/chat/completions", {\\n' +
    '  method: "POST",\\n' +
    '  headers: {\\n' +
    '    "Authorization": "Bearer ' + k.key + '",\\n' +
    '    "Content-Type": "application/json"\\n' +
    '  },\\n' +
    '  body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "你好" }] })\\n' +
    '});';
  openModal('<h3>调用示例 · ' + esc(k.name) + '</h3><p class="msub">将示例中的模型名替换为网关支持的模型即可</p>' +
    '<div class="fld" style="margin-top:0"><span style="font-size:12.5px;color:var(--text2)">cURL</span><pre class="detail" style="margin-top:6px">' + esc(cmd) + '</pre>' +
    '<div class="row end" style="margin-top:8px"><button class="ghost sm" data-act="copy-text" data-t="' + esc(cmd) + '">复制</button></div></div>' +
    '<div class="fld"><span style="font-size:12.5px;color:var(--text2)">JavaScript (fetch)</span><pre class="detail" style="margin-top:6px">' + esc(js) + '</pre>' +
    '<div class="row end" style="margin-top:8px"><button class="ghost sm" data-act="copy-text" data-t="' + esc(js) + '">复制</button></div></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>', 'lg');
}
function exportConfig(){
  var blob = new Blob([JSON.stringify({ channels: S.channels, keys: S.keys, settings: S.settings }, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneapi-gateway-config.json';
  document.body.appendChild(a); a.click();
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
      if(d.settings) S.settings = d.settings;
      var tasks = [saveChannels(), saveKeys()];
      if(d.settings) tasks.push(api('/api/admin/settings', 'POST', d.settings));
      Promise.all(tasks).then(function(){ toast('导入成功', 'ok'); loadAll(); })
        .catch(function(e){ toast(e.message, 'bad'); });
    });
  };
  rd.readAsText(file);
}

/* ---------- 日志 ---------- */
function loadLogs(silent){
  var d = $('logDate').value || S.serverToday || todayLocal();
  S.logDate = d;
  LOGF = {
    ok: $('logOk').value,
    stream: $('logStream').value,
    finish: $('logFinish').value,
    model: ($('logModel').value || '').trim(),
    q: ($('logQ').value || '').trim()
  };
  if(!silent) $('logTable').innerHTML = '<div class="empty">加载中…</div>';
  var qs = 'date=' + encodeURIComponent(d) + '&limit=50';
  ['ok', 'stream', 'finish', 'model', 'q'].forEach(function(k){ if(LOGF[k]) qs += '&' + k + '=' + encodeURIComponent(LOGF[k]); });
  api('/api/admin/logs/summary?' + qs).then(function(r){
    S.logs = r.logs || [];
    S.logCursor = r.cursor || null;
    renderLogs();
  }).catch(function(e){ toast(e.message, 'bad'); $('logTable').innerHTML = '<div class="empty">加载失败</div>'; });
}
var LOGF = { ok:'', stream:'', finish:'', model:'', q:'' };
/** 流式结束原因的中文标签（complete 不展示） */
var FINISH_LABEL = { client_abort: '客户端取消', upstream_error: '上游中断', timeout: '静默超时' };
function finishChip(l){
  if(!l.stream || !l.finish || l.finish === 'complete') return '';
  return ' <span class="chip" title="finish=' + esc(l.finish) + '">' + esc(FINISH_LABEL[l.finish] || l.finish) + '</span>';
}
function renderLogs(){
  var h = '<table><thead><tr><th style="width:150px">时间</th><th style="min-width:150px">调用方</th><th style="min-width:150px">模型</th><th style="width:206px">渠道</th><th style="width:172px">结果</th><th class="ar" style="width:96px">Tokens</th><th class="ar" style="width:84px">耗时</th><th class="ar" style="width:76px">操作</th></tr></thead><tbody>';
  if(!S.logs.length){
    h += '<tr><td colspan="8"><div class="empty">' + I.inbox + '<div>' + esc(S.logDate || '') + ' 暂无符合条件的请求日志</div><div id="logEmptyHint" style="margin-top:12px"></div></div></td></tr>';
  }
  S.logs.forEach(function(l, i){
    h += '<tr><td class="mono">' + esc(fmtTime(l.ts)) + '</td>' +
      '<td>' + esc(l.key_name || '-') + (l.is_admin ? ' <span class="chip">admin</span>' : '') + '</td>' +
      '<td class="mono">' + esc(l.model || '-') + '</td>' +
      '<td>' + esc(l.channel || '-') + (l.stream ? ' <span class="chip">流式</span>' : '') + (l.retries ? ' <span class="chip">重试' + l.retries + '</span>' : '') + '</td>' +
      '<td>' + (l.ok ? '<span class="badge ok">成功</span>' : '<span class="badge bad" title="' + esc(l.error) + '">失败</span>') + finishChip(l) + '</td>' +
      '<td class="ar">' + fmtNum(l.tokens) + '</td>' +
      '<td class="ar nowrap">' + esc(fmtMs(l.ms)) + '</td>' +
      '<td class="ar"><button class="ghost sm" data-act="view-log" data-i="' + i + '">详情</button></td></tr>';
  });
  $('logTable').innerHTML = h + '</tbody></table>';
  $('logPager').innerHTML = S.logCursor ? '<button class="ghost sm" data-act="log-more">加载更早的日志</button>' : (S.logs.length ? '<span class="muted" style="font-size:12px">已到当日日志末尾</span>' : '');
  if(!S.logs.length) fillLogDatesHint();
}
/** 查不到日志时，列出实际有日志的日期，便于快速定位（例如时区/日期选错） */
function fillLogDatesHint(){
  var box = $('logEmptyHint'); if(!box) return;
  box.innerHTML = '<span class="muted">正在检查其他日期…</span>';
  api('/api/admin/logs/dates').then(function(r){
    S.logDates = r.dates || [];
    S.serverToday = r.today || S.serverToday;
    var others = S.logDates.filter(function(d){ return d !== S.logDate; });
    if(!others.length){
      box.innerHTML = '<span class="muted">所有日期都没有日志记录。若刚发起过请求，请确认调用的是 /v1/* 接口且鉴权通过。</span>';
      return;
    }
    box.innerHTML = '<span class="muted">以下日期有日志，点击切换：</span><div style="margin-top:8px">' +
      others.slice(0, 10).map(function(d){
        return '<button class="ghost sm" data-act="log-goto" data-d="' + esc(d) + '">' + esc(d) + (d === S.serverToday ? '（今天）' : '') + '</button>';
      }).join(' ') + '</div>';
  }).catch(function(){ box.innerHTML = ''; });
}
function loadMoreLogs(btn){
  if(!S.logCursor) return;
  btn.disabled = true; btn.textContent = '加载中…';
  var qs = 'date=' + encodeURIComponent(S.logDate) + '&limit=50&cursor=' + encodeURIComponent(S.logCursor);
  ['ok', 'stream', 'finish', 'model', 'q'].forEach(function(k){ if(LOGF[k]) qs += '&' + k + '=' + encodeURIComponent(LOGF[k]); });
  api('/api/admin/logs/summary?' + qs).then(function(r){
    S.logs = S.logs.concat(r.logs || []);
    S.logCursor = r.cursor || null;
    renderLogs();
  }).catch(function(e){ toast(e.message, 'bad'); btn.disabled = false; });
}
function viewLog(i){
  var l = S.logs[i];
  api('/api/admin/log?key=' + encodeURIComponent(l.key)).then(function(d){
    openModal('<h3>日志详情</h3><p class="msub">' + esc(fmtTime(d.ts)) + ' · ' + esc(d.request_id || '') + '</p>' +
      '<pre class="detail">' + esc(JSON.stringify(d, null, 2)) + '</pre>' +
      '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>');
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function exportLogs(){
  if(!S.logs.length){ toast('当前没有可导出的日志', 'bad'); return; }
  var head = ['time', 'request_id', 'key_name', 'model', 'channel', 'ok', 'stream', 'finish', 'tokens', 'cost', 'ms', 'error'];
  var lines = [head.join(',')];
  S.logs.forEach(function(l){
    var row = [l.ts, l.request_id, l.key_name, l.model, l.channel, l.ok ? 'ok' : 'fail', l.stream ? '1' : '0', l.finish || '', l.tokens, l.cost, l.ms, (l.error || '').replace(/[",\\n]/g, ' ')];
    lines.push(row.map(function(v){ return '"' + String(v == null ? '' : v) + '"'; }).join(','));
  });
  var blob = new Blob(['\\ufeff' + lines.join('\\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gateway-logs-' + S.logDate + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800);
  toast('已导出 ' + S.logs.length + ' 条日志', 'ok');
}

/* ---------- 设置 ---------- */
function renderSettings(){
  var s = S.settings || {};
  $('s_allow_admin').checked = s.allow_admin_key_as_api_key !== false;
  $('s_timeout').value = s.request_timeout_ms || 60000;
  $('s_stream_idle').value = s.stream_idle_timeout_ms || 60000;
  $('s_stream_ka').value =
    s.stream_keepalive_ms === 0 ? 0 : s.stream_keepalive_ms || 15000;
  $('s_retries').value = s.retries == null ? 1 : s.retries;
  $('s_retention').value = s.log_retention_days || 30;
  $('s_tz').value = s.timezone_offset_minutes == null ? 480 : s.timezone_offset_minutes;
  $('s_models').value = (s.custom_models || []).join(',');
  var dp = s.default_pricing || { in:0, out:0 };
  $('s_pin').value = dp.in || 0;
  $('s_pout').value = dp.out || 0;
  renderPriceRows(s.pricing || {});
}
function priceRowHtml(model, p){
  return '<div class="prow"><input class="p_model" type="text" placeholder="模型名" value="' + esc(model || '') + '">' +
    '<input class="p_in" type="number" min="0" step="0.001" placeholder="输入价" value="' + esc((p && p.in) || 0) + '">' +
    '<input class="p_out" type="number" min="0" step="0.001" placeholder="输出价" value="' + esc((p && p.out) || 0) + '">' +
    '<button class="icon-btn" data-act="price-del" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
}
function renderPriceRows(pricing){
  var keys = Object.keys(pricing || {});
  var h = '<div class="phead"><span>模型名</span><span>输入 / 1M（USD）</span><span>输出 / 1M（USD）</span><span></span></div>';
  if(!keys.length) h += '<div class="muted" style="font-size:12.5px;padding:6px 0">暂无按模型定价，未列出的模型将使用上方默认价。</div>';
  keys.forEach(function(m){ h += priceRowHtml(m, pricing[m]); });
  $('priceRows').innerHTML = h;
}
function collectSettings(){
  var pricing = {};
  document.querySelectorAll('#priceRows .prow').forEach(function(row){
    var m = row.querySelector('.p_model');
    if(!m) return;
    var name = m.value.trim();
    if(!name) return;
    pricing[name] = { in: Number(row.querySelector('.p_in').value) || 0, out: Number(row.querySelector('.p_out').value) || 0 };
  });
  var tz = parseInt($('s_tz').value, 10);
  if(!Number.isFinite(tz)) tz = 480;
  return {
    allow_admin_key_as_api_key: $('s_allow_admin').checked,
    request_timeout_ms: parseInt($('s_timeout').value, 10) || 60000,
    stream_idle_timeout_ms: parseInt($('s_stream_idle').value, 10) || 60000,
    stream_keepalive_ms: (() => {
      const v = parseInt($('s_stream_ka').value, 10);
      return Number.isFinite(v) ? Math.max(0, v) : 15000;
    })(),
    retries: parseInt($('s_retries').value, 10) || 0,
    log_retention_days: parseInt($('s_retention').value, 10) || 30,
    timezone_offset_minutes: tz,
    custom_models: $('s_models').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
    default_pricing: { in: Number($('s_pin').value) || 0, out: Number($('s_pout').value) || 0 },
    pricing: pricing
  };
}
function saveSettings(btn){
  btn.disabled = true; var old = btn.textContent; btn.textContent = '保存中…';
  api('/api/admin/settings', 'POST', collectSettings()).then(function(r){
    S.settings = r.settings || S.settings;
    renderSettings();
    toast('设置已保存', 'ok');
  }).catch(function(e){ toast(e.message, 'bad'); })
    .then(function(){ btn.disabled = false; btn.textContent = old; });
}
function cleanupLogs(btn){
  var keep = parseInt($('s_retention').value, 10) || 30;
  confirmDlg('清理过期日志', '将删除 ' + keep + ' 天前的请求日志及其统计文件，确定继续？').then(function(ok){
    if(!ok) return;
    btn.disabled = true;
    api('/api/admin/logs/cleanup', 'POST', { days: keep }).then(function(r){
      toast('已清理 ' + r.removed_dates + ' 天 / ' + r.removed_logs + ' 条日志', 'ok');
    }).catch(function(e){ toast(e.message, 'bad'); })
      .then(function(){ btn.disabled = false; });
  });
}

/* ---------- 渲染总入口 ---------- */
function renderAll(){
  renderStats();
  renderTrend();
  renderOverview();
  renderChannels();
  renderKeys();
  if($('t-settings').classList.contains('on')) renderSettings();
}

/* ---------- 全局事件 ---------- */
document.addEventListener('click', function(e){
  var g = e.target.closest('[data-goto]');
  if(g){ gotoTab(g.getAttribute('data-goto')); return; }
  var segR = e.target.closest('.segbtn[data-range]');
  if(segR){
    RANGE = parseInt(segR.getAttribute('data-range'), 10) || 14;
    document.querySelectorAll('#rangeSeg .segbtn').forEach(function(b){ b.classList.toggle('on', b === segR); });
    api('/api/admin/stats?days=' + RANGE).then(function(r){ S.stats = r; renderStats(); renderTrend(); renderOverview(); }).catch(function(er){ toast(er.message, 'bad'); });
    return;
  }
  var segM = e.target.closest('.segbtn[data-metric]');
  if(segM){
    METRIC = segM.getAttribute('data-metric');
    document.querySelectorAll('#metricSeg .segbtn').forEach(function(b){ b.classList.toggle('on', b === segM); });
    renderTrend();
    return;
  }
  var el = e.target.closest('[data-act]');
  if(!el) return;
  var act = el.getAttribute('data-act');
  var i = parseInt(el.getAttribute('data-i'), 10);

  if(act === 'close-modal') closeModal();
  else if(act === 'cf-yes'){ /* 由 confirmDlg 绑定 */ }
  else if(act === 'logout') doLogout();
  else if(act === 'refresh-stats'){
    api('/api/admin/stats?days=' + RANGE).then(function(r){ S.stats = r; renderStats(); renderTrend(); renderOverview(); toast('统计已刷新', 'ok'); }).catch(function(er){ toast(er.message, 'bad'); });
  }
  else if(act === 'add-ch') openChannelModal(-1);
  else if(act === 'edit-ch') openChannelModal(i);
  else if(act === 'del-ch') delChannel(i);
  else if(act === 'test-ch') testChannel(i, el);
  else if(act === 'test-all') testAll(el);
  else if(act === 'route-test') routeTest();
  else if(act === 'run-route-test') runRouteTest(el);
  else if(act === 'save-ch') saveChannel();
  else if(act === 'map-add'){ $('mapRows').insertAdjacentHTML('beforeend', mapRowHtml('', '')); refreshMapHint(); }
  else if(act === 'map-del'){ el.closest('.maprow').remove(); refreshMapHint(); }
  else if(act === 'map-sync') mapSync();
  else if(act === 'hdr-add') $('hdrRows').insertAdjacentHTML('beforeend', hdrRowHtml('', ''));
  else if(act === 'hdr-del') el.closest('.hdrrow').remove();
  else if(act === 'export') exportConfig();
  else if(act === 'import') $('fileImport').click();
  else if(act === 'add-key') openKeyModal(-1);
  else if(act === 'edit-key') openKeyModal(i);
  else if(act === 'save-key') saveKey();
  else if(act === 'del-key'){
    confirmDlg('删除密钥', '确定删除密钥「' + S.keys[i].name + '」？调用方将立即失效。').then(function(ok){
      if(!ok) return;
      S.keys.splice(i, 1);
      saveKeys().then(function(){ toast('已删除', 'ok'); renderKeys(); renderOverview(); }).catch(function(er){ toast(er.message, 'bad'); });
    });
  }
  else if(act === 'reset-key'){
    confirmDlg('清零用量', '将「' + S.keys[i].name + '」的已用 Tokens、请求数与费用清零？').then(function(ok){
      if(!ok) return;
      S.keys[i].used_tokens = 0; S.keys[i].requests = 0; S.keys[i].used_cost = 0;
      saveKeys().then(function(){ toast('已清零', 'ok'); renderKeys(); renderOverview(); }).catch(function(er){ toast(er.message, 'bad'); });
    });
  }
  else if(act === 'copy-key'){
    copyText(S.keys[i].key);
  }
  else if(act === 'copy-text'){
    copyText(el.getAttribute('data-t'));
  }
  else if(act === 'curl-key') showCurl(i);
  else if(act === 'log-prev'){ $('logDate').value = shiftDate($('logDate').value || S.serverToday || todayLocal(), -1); loadLogs(); }
  else if(act === 'log-next'){ $('logDate').value = shiftDate($('logDate').value || S.serverToday || todayLocal(), 1); loadLogs(); }
  else if(act === 'log-today'){ $('logDate').value = S.serverToday || todayLocal(); loadLogs(); }
  else if(act === 'log-goto'){ $('logDate').value = el.getAttribute('data-d'); loadLogs(); }
  else if(act === 'load-logs') loadLogs();
  else if(act === 'log-more') loadMoreLogs(el);
  else if(act === 'clear-day-logs'){
    var day = $('logDate').value || S.serverToday || todayLocal();
    confirmDlg('清空当日日志', '将删除 ' + day + ' 的全部请求日志与当日统计，此操作不可恢复，确定继续？').then(function(ok){
      if(!ok) return;
      el.disabled = true;
      api('/api/admin/logs/clear', 'POST', { scope: 'day', date: day }).then(function(r){
        toast('已清空 ' + r.date + ' 的 ' + r.removed_logs + ' 条日志', 'ok');
        return Promise.all([loadAll(), api('/api/admin/logs/dates').then(function(x){ S.logDates = x.dates || []; })]);
      }).then(function(){ loadLogs(true); })
        .catch(function(er){ toast(er.message, 'bad'); })
        .then(function(){ el.disabled = false; });
    });
  }
  else if(act === 'clear-all-logs'){
    confirmDlg('清空全部日志', '将删除所有日期的请求日志与统计文件，此操作不可恢复，确定继续？').then(function(ok){
      if(!ok) return;
      el.disabled = true;
      api('/api/admin/logs/clear', 'POST', { scope: 'all' }).then(function(r){
        toast('已清空 ' + r.removed_logs + ' 条日志', 'ok');
        S.logs = []; S.logCursor = null;
        return Promise.all([loadAll(), api('/api/admin/logs/dates').then(function(x){ S.logDates = x.dates || []; })]);
      }).then(function(){ loadLogs(true); })
        .catch(function(er){ toast(er.message, 'bad'); })
        .then(function(){ el.disabled = false; });
    });
  }
  else if(act === 'view-log') viewLog(i);
  else if(act === 'export-logs') exportLogs();
  else if(act === 'save-settings') saveSettings(el);
  else if(act === 'reset-settings'){ renderSettings(); toast('已重新载入'); }
  else if(act === 'price-add') $('priceRows').insertAdjacentHTML('beforeend', priceRowHtml('', { in:0, out:0 }));
  else if(act === 'price-del') el.closest('.prow').remove();
  else if(act === 'cleanup-logs') cleanupLogs(el);
});

function copyText(t){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){ toast('已复制到剪贴板', 'ok'); }, function(){ toast('复制失败，请手动选择', 'bad'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('已复制到剪贴板', 'ok'); }catch(e){ toast('复制失败', 'bad'); }
    ta.remove();
  }
}

/* 开关：change 事件 */
document.addEventListener('change', function(e){
  var el = e.target;
  var act = el.getAttribute && el.getAttribute('data-act');
  if(act === 'toggle-ch'){
    var i = parseInt(el.getAttribute('data-i'), 10);
    S.channels[i].enabled = el.checked;
    saveChannels().then(function(){ renderOverview(); }).catch(function(er){ toast(er.message, 'bad'); el.checked = !el.checked; });
  } else if(act === 'toggle-key'){
    var j = parseInt(el.getAttribute('data-i'), 10);
    S.keys[j].enabled = el.checked;
    saveKeys().then(function(){ renderOverview(); }).catch(function(er){ toast(er.message, 'bad'); el.checked = !el.checked; });
  } else if(el.id === 'fileImport' && el.files && el.files[0]){
    importConfig(el.files[0]); el.value = '';
  } else if(el.id === 'logAuto'){
    if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
    if(el.checked){ autoTimer = setInterval(function(){ if($('t-logs').classList.contains('on')) loadLogs(true); }, 10000); toast('已开启自动刷新（10 秒）'); }
  }
});

/* 渠道弹窗内联动：改「对外暴露的模型名」→ 刷新 datalist 与映射提示 */
document.addEventListener('input', function(e){
  var el = e.target;
  if(!el || !$('modal').classList.contains('on')) return;
  if(el.id === 'm_models'){ syncModelList(); refreshMapHint(); }
  else if(el.classList && el.classList.contains('m_k')){ refreshMapHint(); }
});

/* 筛选即时生效 */
['chQ','chType','chStatus'].forEach(function(id){
  var el = $(id);
  el.addEventListener(id === 'chQ' ? 'input' : 'change', function(){ renderChannels(); });
});
['keyQ','keyStatus'].forEach(function(id){
  var el = $(id);
  el.addEventListener(id === 'keyQ' ? 'input' : 'change', function(){ renderKeys(); });
});
['logModel','logQ'].forEach(function(id){
  $(id).addEventListener('keydown', function(e){ if(e.key === 'Enter') loadLogs(); });
});

/* ---------- 初始化 ---------- */
(function init(){
  initTheme();
  $('ak').value = AK;
  // 日志日期不在这里写死：连接成功后由 loadAll() 用服务端（按设置的时区偏移）
  // 算出的「今天」填充，避免浏览器时区与 Worker 的 UTC 时区不一致
  $('logDate').value = '';
  // 本地存储不可用就立刻说明白，别让用户以为「登录成功但一刷新就掉」
  if(!storageOk()) warnNoStorage();
  $('btnTheme').addEventListener('click', function(){
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    if(S.stats) renderTrend();
  });
  $('btnLogin').addEventListener('click', function(){ AK = $('ak').value.trim(); connect(false); });
  $('ak').addEventListener('keydown', function(e){ if(e.key === 'Enter') $('btnLogin').click(); });
  $('btnRefresh').addEventListener('click', refresh);
  if(AK) connect(true);
  else { setConn('off'); $('login').classList.add('on'); }
})();
</script>
</body>
</html>`;
