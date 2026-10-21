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
  /* ============================================================
     设计令牌（Design Tokens）
     所有间距 / 圆角 / 字号 / 阴影都从这里取值，保证全局协调一致。
     ============================================================ */
  :root{
    /* 圆角梯度 */
    --r-xs:6px; --r-sm:8px; --r-md:10px; --r-lg:14px; --r-xl:18px; --r-pill:999px;
    /* 间距梯度 */
    --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:26px;
    /* 布局 */
    --sidebar-w:242px;
    --headh:68px;      /* 侧栏品牌区 / 顶栏 统一高度，保证两条下边框对齐 */
    --gutter:28px;     /* 主区左右留白（顶栏与内容区共用，避免错位） */
    --maxw:1280px;
    /* 字体 */
    --font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
    /* 动效 */
    --ease:cubic-bezier(.4,0,.2,1);
    --ease-out:cubic-bezier(.16,1,.3,1);
    --t-fast:.14s; --t:.2s;
  }
  html[data-theme="dark"]{
    --bg:#080c16; --bg2:#0b1120; --panel:#0e1526; --panel2:#131c31; --elev:#172138;
    --border:#1c2740; --border2:#26334e; --border3:#33415f;
    --text:#e9eefb; --text2:#a7b4cd; --muted:#6b7995;
    --accent:#5b8cff; --accent2:#8b5cf6; --accent-soft:rgba(91,140,255,.14); --accent-line:rgba(91,140,255,.34);
    --ok:#34d399; --ok-soft:rgba(52,211,153,.13);
    --bad:#f87171; --bad-soft:rgba(248,113,113,.13);
    --warn:#fbbf24; --warn-soft:rgba(251,191,36,.13);
    --sh-1:0 1px 2px rgba(0,0,0,.3);
    --sh-2:0 8px 24px rgba(0,0,0,.34);
    --sh-3:0 20px 52px rgba(0,0,0,.52);
    --grid:#182238; --hover:#16203a; --input:#0a1120;
    --skeleton-a:#131c31; --skeleton-b:#1a2540;
  }
  html[data-theme="light"]{
    --bg:#f5f7fb; --bg2:#eef2f9; --panel:#ffffff; --panel2:#f8fafd; --elev:#ffffff;
    --border:#e7ebf3; --border2:#d8dee9; --border3:#c4cddd;
    --text:#0d1526; --text2:#414e66; --muted:#78849a;
    --accent:#2563eb; --accent2:#7c3aed; --accent-soft:rgba(37,99,235,.09); --accent-line:rgba(37,99,235,.3);
    --ok:#059669; --ok-soft:rgba(5,150,105,.10);
    --bad:#dc2626; --bad-soft:rgba(220,38,38,.10);
    --warn:#d97706; --warn-soft:rgba(217,119,6,.10);
    --sh-1:0 1px 2px rgba(15,23,42,.05);
    --sh-2:0 6px 22px rgba(15,23,42,.08);
    --sh-3:0 20px 52px rgba(15,23,42,.18);
    --grid:#e9edf5; --hover:#f4f7fd; --input:#f7f9fd;
    --skeleton-a:#eef1f8; --skeleton-b:#e2e7f2;
  }

  /* ============================================================
     基础
     ============================================================ */
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;font-family:var(--font);background:var(--bg);color:var(--text);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
  ::-webkit-scrollbar{width:10px;height:10px}
  ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:var(--r-pill);border:2px solid transparent;background-clip:content-box}
  ::-webkit-scrollbar-thumb:hover{background:var(--border3);background-clip:content-box}
  ::-webkit-scrollbar-track{background:transparent}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  svg{width:16px;height:16px;flex-shrink:0}
  .tnum{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
  .app{display:flex;min-height:100vh}

  /* ============================================================
     侧栏
     ============================================================ */
  .sidebar{width:var(--sidebar-w);flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
  .brand{height:var(--headh);flex-shrink:0;padding:0 20px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--border)}
  .logo{width:36px;height:36px;border-radius:11px;background:linear-gradient(140deg,var(--accent),var(--accent2));display:grid;place-items:center;flex-shrink:0;box-shadow:0 6px 16px var(--accent-soft)}
  .logo svg{width:20px;height:20px;color:#fff}
  .brand b{font-size:14px;display:block;letter-spacing:.2px;line-height:1.35;font-weight:650}
  .brand span{font-size:11px;color:var(--muted);line-height:1.35;display:block;margin-top:1px}
  .nav{padding:10px 10px 16px;display:flex;flex-direction:column;gap:2px;flex:1;overflow:auto}
  .navsec{font-size:10.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.09em;padding:14px 12px 6px}
  .navsec:first-child{padding-top:6px}
  .navbtn{position:relative;display:flex;align-items:center;justify-content:flex-start;gap:11px;width:100%;background:none;border:none;color:var(--text2);padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;font-size:13.5px;line-height:1.4;text-align:left;font-family:inherit;transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
  .navbtn:hover{background:var(--hover);color:var(--text)}
  .navbtn.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
  .navbtn.on::before{content:'';position:absolute;left:-10px;top:50%;transform:translateY(-50%);width:3px;height:18px;border-radius:0 3px 3px 0;background:var(--accent)}
  .navbtn .badge-n{margin-left:auto;font-size:11px;background:var(--panel2);border:1px solid var(--border);color:var(--muted);padding:1px 7px;border-radius:var(--r-pill);font-variant-numeric:tabular-nums}
  .navbtn.on .badge-n{background:var(--accent);border-color:transparent;color:#fff}
  .side-foot{padding:12px 10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
  .side-row{display:flex;gap:8px;align-items:center;padding:0 10px}
  .side-row .grow{flex:1;min-width:0;font-size:11.5px;color:var(--muted);line-height:1.5}
  .side-row .grow b{display:block;color:var(--text2);font-weight:600;font-size:12px}

  /* ============================================================
     主区 / 顶栏
     ============================================================ */
  main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{height:var(--headh);flex-shrink:0;border-bottom:1px solid var(--border);background:var(--panel);background:color-mix(in srgb,var(--panel) 86%,transparent);backdrop-filter:blur(12px) saturate(1.6);-webkit-backdrop-filter:blur(12px) saturate(1.6);position:sticky;top:0;z-index:20}
  .topbar-in{max-width:var(--maxw);margin:0 auto;height:100%;padding:0 var(--gutter);display:flex;justify-content:space-between;align-items:center;gap:16px}
  .topbar h2{margin:0;font-size:16px;font-weight:650;letter-spacing:.1px;line-height:1.3}
  .topbar p{margin:2px 0 0;font-size:12px;color:var(--muted);line-height:1.3}
  .topbar .right{display:flex;gap:9px;align-items:center;flex-shrink:0}
  .content{padding:22px var(--gutter) 64px;max-width:var(--maxw);width:100%;margin:0 auto}
  .tab{display:none}
  .tab.on{display:block;animation:fade .24s var(--ease-out)}
  @keyframes fade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}

  /* ============================================================
     胶囊 / 徽章 / 标签
     ============================================================ */
  .pill{font-size:11.5px;padding:5px 12px;border-radius:var(--r-pill);background:var(--panel2);color:var(--muted);border:1px solid var(--border);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
  .pill.ok{background:var(--ok-soft);color:var(--ok);border-color:transparent}
  .pill.bad{background:var(--bad-soft);color:var(--bad);border-color:transparent}
  .pill.wait{background:var(--warn-soft);color:var(--warn);border-color:transparent}
  .pill .dt{width:7px;height:7px;border-radius:50%;background:currentColor}
  .pill.wait .dt{animation:pulse 1.1s var(--ease) infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.28}}
  .badge{display:inline-block;padding:3px 9px;border-radius:var(--r-xs);font-size:11.5px;background:var(--panel2);color:var(--text2);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;line-height:1.5}
  .badge.ok{background:var(--ok-soft);color:var(--ok);border-color:transparent}
  .badge.bad{background:var(--bad-soft);color:var(--bad);border-color:transparent}
  .badge.info{background:var(--accent-soft);color:var(--accent);border-color:transparent}
  .badge.warn{background:var(--warn-soft);color:var(--warn);border-color:transparent}
  .chip{display:inline-block;padding:2px 8px;border-radius:var(--r-xs);background:var(--panel2);border:1px solid var(--border);font-size:11.5px;margin:1px 3px 1px 0;color:var(--text2);font-family:var(--mono);line-height:1.6}
  .chip .nm{white-space:nowrap}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;background:var(--border2)}
  .dot.ok{background:var(--ok);box-shadow:0 0 0 3px var(--ok-soft)}
  .dot.bad{background:var(--bad);box-shadow:0 0 0 3px var(--bad-soft)}

  /* ============================================================
     指标卡
     ============================================================ */
  .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-4)}
  .stat{position:relative;background:var(--panel);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;overflow:hidden;transition:border-color var(--t) var(--ease),box-shadow var(--t) var(--ease),transform var(--t) var(--ease)}
  .stat::after{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2));opacity:0;transition:opacity var(--t) var(--ease)}
  .stat:hover{border-color:var(--border2);box-shadow:var(--sh-2);transform:translateY(-1px)}
  .stat:hover::after{opacity:.9}
  .stat-h{display:flex;align-items:center;gap:10px}
  .stat .label{color:var(--text2);font-size:12.5px;font-weight:500}
  .stat .ic{width:30px;height:30px;border-radius:var(--r-md);background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;flex-shrink:0}
  .stat .ic.ok{background:var(--ok-soft);color:var(--ok)}
  .stat .ic.bad{background:var(--bad-soft);color:var(--bad)}
  .stat .ic.warn{background:var(--warn-soft);color:var(--warn)}
  .stat .num{font-size:25px;font-weight:700;margin-top:12px;letter-spacing:-.4px;line-height:1.15;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;flex-wrap:wrap;gap:0}
  .stat .sub{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.5}

  /* ============================================================
     卡片
     ============================================================ */
  .card{background:var(--panel);border:1px solid var(--border);border-radius:var(--r-lg);padding:18px 20px;margin-top:var(--sp-4)}
  .card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
  .card h3{margin:0;font-size:14.5px;font-weight:650;letter-spacing:.1px}
  .card .desc{color:var(--muted);font-size:12.5px;margin:4px 0 0;line-height:1.6}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)}
  .grid2 .card{margin-top:var(--sp-4)}

  /* ============================================================
     工具条 / 表单控件
     ============================================================ */
  .toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .toolbar .spacer{flex:1}
  .search{position:relative;display:flex;align-items:center}
  .search svg{position:absolute;left:10px;color:var(--muted);pointer-events:none;width:14px;height:14px}
  .search input{padding-left:32px;min-width:190px}
  input[type=text],input[type=password],input[type=date],input[type=number],input[type=datetime-local],textarea,select{
    background:var(--input);border:1px solid var(--border2);color:var(--text);padding:8px 11px;border-radius:var(--r-sm);font-size:13px;width:100%;font-family:inherit;line-height:1.5;transition:border-color var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease),background var(--t-fast) var(--ease)}
  input:hover:not(:focus),textarea:hover:not(:focus),select:hover:not(:focus){border-color:var(--border3)}
  input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  input::placeholder,textarea::placeholder{color:var(--muted);opacity:.85}
  select.sel{width:auto;min-width:112px;cursor:pointer}
  textarea{resize:vertical;font-family:var(--mono);font-size:12.5px;line-height:1.65}
  input[type=checkbox]{accent-color:var(--accent);width:15px;height:15px;cursor:pointer}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .grid label,.fld{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text2)}
  .fld{margin-top:14px}
  .check{display:flex;flex-direction:row !important;align-items:center;gap:8px !important;cursor:pointer}
  .check input{width:auto}
  .row{display:flex;gap:9px;margin-top:16px;align-items:center;flex-wrap:wrap}
  .row.end{justify-content:flex-end}
  .hint{font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:2px}

  /* ============================================================
     按钮
     ============================================================ */
  button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;color:#fff;padding:8px 15px;border-radius:var(--r-sm);cursor:pointer;font-size:13px;font-family:inherit;font-weight:500;line-height:1.4;transition:filter var(--t-fast) var(--ease),transform .1s var(--ease),box-shadow var(--t-fast) var(--ease),background var(--t-fast) var(--ease),color var(--t-fast) var(--ease);display:inline-flex;align-items:center;gap:6px;justify-content:center;white-space:nowrap}
  button:hover{filter:brightness(1.09);box-shadow:0 4px 14px var(--accent-soft)}
  button:active{transform:translateY(1px)}
  button:disabled{opacity:.5;cursor:default;transform:none;box-shadow:none;filter:none}
  button.ghost{background:var(--panel2);color:var(--text2);border:1px solid var(--border);box-shadow:none}
  button.ghost:hover{background:var(--hover);color:var(--text);filter:none;border-color:var(--border2);box-shadow:var(--sh-1)}
  button.danger{background:var(--bad);box-shadow:none}
  button.danger:hover{box-shadow:0 4px 14px var(--bad-soft)}
  button.soft{background:var(--bad-soft);color:var(--bad);box-shadow:none}
  button.soft:hover{filter:none;background:var(--bad-soft);color:var(--bad);box-shadow:0 0 0 1px var(--bad-soft)}
  button.sm{padding:6px 11px;font-size:12.5px;border-radius:var(--r-xs)}
  button.sm svg{width:14px;height:14px}
  .icon-btn{background:var(--panel2);border:1px solid var(--border);color:var(--text2);padding:7px;border-radius:var(--r-sm);width:auto;box-shadow:none}
  .icon-btn:hover{background:var(--hover);color:var(--text);filter:none;border-color:var(--border2);box-shadow:var(--sh-1)}
  .seg{display:inline-flex;background:var(--panel2);border:1px solid var(--border);border-radius:var(--r-md);padding:3px;gap:2px}
  .segbtn{background:none;border:none;color:var(--muted);padding:6px 13px;border-radius:var(--r-xs);font-size:12.5px;font-weight:500;box-shadow:none}
  .segbtn:hover{color:var(--text);filter:none;background:none;box-shadow:none}
  .segbtn.on{background:var(--panel);color:var(--accent);box-shadow:var(--sh-1)}
  html[data-theme="dark"] .segbtn.on{background:var(--elev)}

  /* ============================================================
     表格
     ============================================================ */
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--border);vertical-align:middle}
  th{color:var(--muted);font-weight:600;font-size:11.5px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;background:var(--panel)}
  tbody tr{transition:background var(--t-fast) var(--ease)}
  tbody tr:hover{background:var(--hover)}
  tbody tr:last-child td{border-bottom:none}
  td.mono{font-family:var(--mono);font-size:12px;word-break:break-all;color:var(--text2)}
  .ops{white-space:nowrap;display:flex;gap:5px;align-items:center}
  .ops.r{justify-content:flex-end}
  th.ar,td.ar{text-align:right;font-variant-numeric:tabular-nums}
  .empty{padding:46px 10px;text-align:center;color:var(--muted);font-size:13px;line-height:1.7}
  .empty svg{width:30px;height:30px;margin-bottom:10px;opacity:.45}
  .tname{display:flex;align-items:center;gap:9px;min-width:0}
  .tname>div{min-width:0}
  .tname b{font-weight:600;white-space:nowrap}
  .tname .sub{font-size:11.5px;color:var(--muted);display:block;font-weight:400;margin-top:2px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .quota{display:flex;align-items:center;gap:8px;min-width:130px}
  .progress{flex:1;height:6px;background:var(--input);border-radius:var(--r-pill);overflow:hidden;border:1px solid var(--border)}
  .progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:var(--r-pill);transition:width .3s var(--ease)}
  .progress i.bad{background:var(--bad)}
  .progress i.warn{background:var(--warn)}
  .pager{display:flex;justify-content:center;padding:14px 0 0}
  .mono-s{font-family:var(--mono);font-size:12px}
  #chTable,#keyTable,#logTable{overflow-x:auto}
  .nowrap{white-space:nowrap}
  .sub{font-size:11.5px;color:var(--muted);display:block;margin-top:2px;font-weight:400}
  .url{font-family:var(--mono);font-size:12px;color:var(--text2);display:block;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .phead{display:flex;gap:8px;font-size:11.5px;color:var(--muted);padding:0 0 7px;text-transform:uppercase;letter-spacing:.05em}
  .phead span{flex:1}
  .phead span:last-child{flex:0 0 34px;width:34px}
  .bhead,.brow{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px}
  .bhead{border-bottom:1px solid var(--border);color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;padding-top:0}
  .bhead span:first-child,.brow span:first-child{flex:0 0 110px;font-family:var(--mono)}
  .bhead span:nth-child(2),.brow span:nth-child(2){flex:1}
  .mini-link{color:var(--accent);cursor:pointer;text-decoration:none}
  .mini-link:hover{text-decoration:underline}

  /* ============================================================
     开关
     ============================================================ */
  .switch{position:relative;display:inline-block;width:36px;height:21px;flex-shrink:0}
  .switch input{display:none}
  .switch span{position:absolute;inset:0;background:var(--border2);border-radius:var(--r-pill);transition:.2s var(--ease);cursor:pointer}
  .switch span:before{content:'';position:absolute;width:15px;height:15px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s var(--ease);box-shadow:0 1px 3px rgba(0,0,0,.3)}
  .switch input:checked+span{background:var(--accent)}
  .switch input:checked+span:before{left:18px}
  .switch:hover span{filter:brightness(1.08)}

  /* ============================================================
     键值 / 详情 / 代码
     ============================================================ */
  .kv{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13.5px}
  .kv:last-child{border-bottom:none}
  .kv span{color:var(--muted)}
  .good{color:var(--ok)} .bad{color:var(--bad)} .muted{color:var(--muted)} .warnc{color:var(--warn)}
  pre.detail{background:var(--input);border:1px solid var(--border2);padding:14px;border-radius:var(--r-sm);overflow:auto;max-height:440px;font-size:12px;line-height:1.7;font-family:var(--mono);margin:0;white-space:pre-wrap;word-break:break-all}
  code{background:var(--panel2);border:1px solid var(--border);padding:1px 6px;border-radius:var(--r-xs);font-size:12px;font-family:var(--mono);color:var(--accent)}

  /* ============================================================
     图表
     ============================================================ */
  .chart-wrap{width:100%;overflow:hidden;position:relative}
  .chart{width:100%;height:auto;display:block;overflow:visible}
  .chart .gl{stroke:var(--grid);stroke-width:1;stroke-dasharray:4 4}
  .chart .axis{fill:var(--muted);font-size:10.5px;font-family:var(--font)}
  .chart .ln{fill:none;stroke:var(--accent);stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
  .chart .ar{pointer-events:none}
  .chart .dot{fill:var(--panel);stroke:var(--accent);stroke-width:2;transition:r var(--t-fast) var(--ease)}
  .chart .hot{fill:transparent;cursor:crosshair}
  .chart .xhair{stroke:var(--accent);stroke-width:1;stroke-dasharray:3 3;opacity:0;transition:opacity var(--t-fast) var(--ease)}
  .chart .fdot{fill:var(--accent);stroke:var(--panel);stroke-width:2.5;opacity:0;pointer-events:none}
  .chart .gs1{stop-color:var(--accent);stop-opacity:.30}
  .chart .gs2{stop-color:var(--accent);stop-opacity:0}
  .ctip{position:absolute;pointer-events:none;background:var(--elev);border:1px solid var(--border2);border-radius:var(--r-sm);padding:7px 11px;font-size:12px;box-shadow:var(--sh-2);white-space:nowrap;display:none;z-index:5;line-height:1.55}
  .ctip b{font-family:var(--mono);font-variant-numeric:tabular-nums}

  /* ============================================================
     渠道健康列表
     ============================================================ */
  .hrow{display:flex;align-items:center;gap:11px;padding:11px 2px;border-bottom:1px solid var(--border)}
  .hrow:last-child{border-bottom:none}
  .hmain{flex:1;min-width:0}
  .hmain b{display:block;font-size:13.5px;font-weight:600}
  .hmain span{font-size:11.5px;color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}

  /* ============================================================
     弹窗 / Toast / 登录
     ============================================================ */
  .modal-overlay{position:fixed;inset:0;background:rgba(3,7,16,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:60;padding:5vh 16px;overflow:auto}
  .modal-overlay.on{display:flex}
  .modal{background:var(--panel);border:1px solid var(--border);border-radius:var(--r-xl);padding:22px;width:min(620px,94vw);box-shadow:var(--sh-3);animation:pop .22s var(--ease-out)}
  .modal.sm{width:min(420px,94vw)}
  .modal.lg{width:min(880px,95vw)}
  @keyframes pop{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
  .modal h3{margin:0 0 4px;font-size:16px;font-weight:650}
  .modal .msub{color:var(--muted);font-size:12.5px;margin:0 0 14px;line-height:1.6}
  .maprow,.hdrrow,.prow{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .maprow input,.hdrrow input,.prow input{flex:1;font-family:var(--mono);font-size:12px}
  #toasts{position:fixed;right:20px;bottom:20px;z-index:99;display:flex;flex-direction:column;gap:9px;max-width:min(370px,90vw)}
  .toast{background:var(--elev);border:1px solid var(--border);border-left:3px solid var(--accent);padding:12px 15px;border-radius:var(--r-md);font-size:13px;box-shadow:var(--sh-2);transition:opacity .3s,transform .3s;animation:slide .26s var(--ease-out);display:flex;align-items:flex-start;gap:9px;line-height:1.55}
  .toast .ticon{flex-shrink:0;font-weight:700;line-height:1.5}
  @keyframes slide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
  .toast.ok{border-left-color:var(--ok)} .toast.ok .ticon{color:var(--ok)}
  .toast.bad{border-left-color:var(--bad)} .toast.bad .ticon{color:var(--bad)}
  .toast.out{opacity:0;transform:translateX(24px)}
  .login-overlay{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;background:radial-gradient(1100px 620px at 50% 10%,var(--accent-soft) 0%,var(--bg) 62%);padding:20px}
  .login-overlay.on{display:flex}
  .login-overlay::before{content:'';position:absolute;inset:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(620px 460px at 50% 34%,#000 0%,transparent 78%);-webkit-mask-image:radial-gradient(620px 460px at 50% 34%,#000 0%,transparent 78%);opacity:.6;pointer-events:none}
  .login-card{position:relative;background:var(--panel);border:1px solid var(--border);border-radius:var(--r-xl);padding:36px 34px;width:min(410px,92vw);text-align:center;box-shadow:var(--sh-3);animation:pop .3s var(--ease-out)}
  .login-card .logo{margin:0 auto 16px;width:52px;height:52px;border-radius:15px}
  .login-card .logo svg{width:27px;height:27px}
  .login-card h2{margin:0 0 6px;font-size:18px;font-weight:650;letter-spacing:.1px}
  .login-card p{color:var(--muted);font-size:12.5px;margin:0 0 20px;line-height:1.6}
  .login-card input{margin-bottom:11px;text-align:center}
  .login-card button{width:100%}
  .login-tip{margin-top:14px;font-size:11.5px;color:var(--muted);line-height:1.65}
  .login-warn{margin-top:12px;color:var(--warn);background:var(--warn-soft);border:1px solid transparent;border-radius:var(--r-sm);padding:9px 11px;text-align:left;font-size:12px;line-height:1.6}
  .login-card .auth-form{text-align:left;margin-top:4px}
  .login-card .auth-form label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text2);margin-bottom:11px}
  .login-card .auth-form input{margin-bottom:0;text-align:left}
  .login-card .auth-form .hint{font-size:11.5px;color:var(--muted);line-height:1.6}
  .login-card .auth-links{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:14px;font-size:12px}
  .login-card a.link{color:var(--accent);cursor:pointer;text-decoration:none}
  .login-card a.link:hover{text-decoration:underline}
  .login-card .auth-q{background:var(--panel2);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font-size:13px;color:var(--text);margin-bottom:11px;line-height:1.6;text-align:left}
  .login-card .auth-q span{display:block;font-size:11.5px;color:var(--muted);margin-bottom:3px}

  /* ============================================================
     使用说明
     ============================================================ */
  .help h4{margin:20px 0 8px;font-size:14px;font-weight:650}
  .help h4:first-of-type{margin-top:6px}
  .help p,.help li{font-size:13px;line-height:1.9;color:var(--text2)}
  .help ol,.help ul{padding-left:20px;margin:6px 0}
  .help li{margin:3px 0}
  .skeleton{height:14px;border-radius:var(--r-xs);background:linear-gradient(90deg,var(--skeleton-a),var(--skeleton-b),var(--skeleton-a));background-size:200% 100%;animation:sk 1.2s infinite}
  @keyframes sk{0%{background-position:200% 0}100%{background-position:-200% 0}}

  /* ============================================================
     专业细节：焦点环 / 环比徽章 / 动效偏好
     ============================================================ */
  :where(button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--r-xs)}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important}
  }
  .delta{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:var(--r-pill);margin-left:8px;vertical-align:2px;font-family:var(--mono);flex-shrink:0}
  .delta.up{color:var(--ok);background:var(--ok-soft)}
  .delta.down{color:var(--bad);background:var(--bad-soft)}
  .delta.flat{color:var(--muted);background:var(--panel2);border:1px solid var(--border)}

  /* ============================================================
     响应式
     ============================================================ */
  @media (max-width:1180px){
    .stats{grid-template-columns:1fr 1fr}
  }
  @media (max-width:1024px){
    .grid2{grid-template-columns:1fr}
  }
  @media (max-width:860px){
    :root{--headh:62px;--gutter:16px}
    .app{flex-direction:column}
    .sidebar{width:100%;height:auto;position:static}
    .brand{padding:0 16px}
    .nav{flex-direction:row;overflow-x:auto;padding:10px;gap:4px}
    .navsec{display:none}
    .navbtn{white-space:nowrap;width:auto}
    .navbtn.on::before{display:none}
    .side-foot{flex-direction:row;align-items:center}
    .side-row{padding:0}
    .side-row .grow{display:none}
    .stats{grid-template-columns:1fr}
    .grid{grid-template-columns:1fr}
    .content{padding:16px var(--gutter) 44px}
    .topbar-in{padding:0 var(--gutter)}
    .topbar p{display:none}
    .plans{grid-template-columns:1fr}
  }
  .plans{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:var(--sp-4);margin-top:12px}
  .plan{display:flex;flex-direction:column;gap:10px;padding:16px 18px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--panel2)}
  .plan.on{border-color:var(--accent-line);background:var(--accent-soft)}
  .plan-h{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
  .plan-h b{font-size:15px;letter-spacing:.1px}
  .plan-price{font-size:23px;font-weight:700;letter-spacing:-.4px;line-height:1.1;font-variant-numeric:tabular-nums}
  .plan-price small{font-size:12px;color:var(--muted);font-weight:400;letter-spacing:0}
  .plan-desc{color:var(--text2);font-size:12.5px;line-height:1.6;min-height:20px}
  .plan-meta{display:flex;flex-wrap:wrap;gap:6px}
  .plan-foot{margin-top:auto;display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
</style>
</head>
<body>

<div class="login-overlay on" id="login">
  <div class="login-card">
    <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg></div>
    <h2 id="authTitle">OneAPI Gateway</h2>
    <p id="authSub">正在检查登录状态…</p>
    <div id="authBox"></div>
    <div class="login-tip login-warn" id="storeWarn" style="display:none"></div>
  </div>
</div>

<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg></div>
      <div><b>OneAPI Gateway</b><span>管理控制台</span></div>
    </div>
    <nav class="nav">
      <div class="navsec" data-admin>监控</div>
      <button class="navbtn on" data-tab="overview" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>概览</button>
      <button class="navbtn" data-tab="logs" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>请求日志</button>
      <div class="navsec" data-admin>资源</div>
      <button class="navbtn" data-tab="channels" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>渠道管理<span class="badge-n" id="navCh">0</span></button>
      <button class="navbtn" data-tab="keys" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="3.6"/><path d="M10.1 12.9 20.5 2.5"/><path d="M17 6l2 2M19.5 3.5l2 2"/></svg>密钥管理<span class="badge-n" id="navKey">0</span></button>
      <div class="navsec" data-user>我的</div>
      <button class="navbtn" data-tab="mykeys" data-user><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="3.6"/><path d="M10.1 12.9 20.5 2.5"/><path d="M17 6l2 2M19.5 3.5l2 2"/></svg>我的密钥<span class="badge-n" id="navMyKey">0</span></button>
      <button class="navbtn" data-tab="plans" data-user><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5z"/><path d="m3 8.5 9 5.5 9-5.5M12 14v7"/></svg>套餐</button>
      <button class="navbtn" data-tab="account" data-user><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>我的账号</button>
      <div class="navsec" data-admin>系统</div>
      <button class="navbtn" data-tab="plans" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5z"/><path d="m3 8.5 9 5.5 9-5.5M12 14v7"/></svg>套餐管理<span class="badge-n" id="navPlan">0</span></button>
      <button class="navbtn" data-tab="accounts" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.6a6.5 6.5 0 0 1 3.5 6.4"/></svg>账号管理<span class="badge-n" id="navAcct">0</span></button>
      <button class="navbtn" data-tab="settings" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.1"/><circle cx="15" cy="12" r="2.1"/><circle cx="8" cy="17" r="2.1"/></svg>网关设置</button>
      <button class="navbtn" data-tab="help" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>使用说明</button>
      <button class="navbtn" data-tab="account" data-admin><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>我的账号</button>
    </nav>
    <div class="side-foot">
      <div class="side-row">
        <div class="grow"><b id="meName">—</b><span id="meRole">未登录</span> · <span id="appVer">v2.3.0</span><span class="hint" id="appVerNote" style="display:none">（UI 与后端版本不一致，刷新后自动同步）</span></div>
        <button class="icon-btn" id="btnTheme" title="切换主题" aria-label="切换主题"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        <button class="icon-btn" data-act="logout" title="退出登录" aria-label="退出登录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/></svg></button>
      </div>
    </div>
  </aside>
  <main>
    <div class="topbar">
      <div class="topbar-in">
        <div><h2 id="pageTitle">概览</h2><p id="pageDesc">网关运行状态与用量趋势</p></div>
        <div class="right">
          <span class="pill" id="connPill"><span class="dt"></span>未连接</span>
          <button class="icon-btn" id="btnRefresh" title="刷新数据" aria-label="刷新数据"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>
        </div>
      </div>
    </div>
    <div class="content">

      <section id="t-overview" class="tab on">
        <div class="toolbar">
          <div class="seg" id="rangeSeg">
            <button class="segbtn" data-range="7">7 天</button>
            <button class="segbtn on" data-range="14">14 天</button>
            <button class="segbtn" data-range="21">21 天</button>
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

      <section id="t-mykeys" class="tab">
        <div class="card">
          <div class="card-head">
            <div><h3>我的用量</h3><p class="desc">账号配额按名下所有密钥合计计算，由管理员设置</p></div>
            <button class="sm" data-act="my-add-key"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>生成密钥</button>
          </div>
          <div class="stats" id="myStats"></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>我的密钥</h3><p class="desc">密钥仅在创建时完整显示一次；遗失请重新生成</p></div></div>
          <div id="myKeyTable"></div>
        </div>
      </section>

      <section id="t-plans" class="tab">
        <div class="card" data-user>
          <div class="card-head">
            <div><h3>我的套餐</h3><p class="desc">套餐需管理员审核后生效；到期后名下密钥将无法调用，续费或更换套餐后恢复</p></div>
            <span id="planStatusChip"></span>
          </div>
          <div id="userPlanBox"><div class="empty">加载中…</div></div>
          <div class="login-warn" id="planPendingBanner" style="display:none"></div>
        </div>
        <div class="card" data-user>
          <div class="card-head"><div><h3>可选套餐</h3><p class="desc">提交申请后请联系管理员确认付款，审核通过即生效</p></div></div>
          <div id="planCards" class="plans"></div>
        </div>
        <div class="card" data-user>
          <div class="card-head"><div><h3>申请记录</h3><p class="desc">最近 10 条</p></div></div>
          <div id="planHistory"></div>
        </div>

        <div class="card" data-admin>
          <div class="card-head">
            <div><h3>套餐管理</h3><p class="desc">定义 Token 配额、有效期、RPM 与可用模型；用户申请经审核后生效</p></div>
            <button class="sm" data-act="add-plan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>新建套餐</button>
          </div>
          <div id="planTable"></div>
        </div>
        <div class="card" data-admin>
          <div class="card-head">
            <div><h3>待审核申请</h3><p class="desc">确认收款后点「通过」：套餐立即生效，并以套餐配额重新计算周期（名下密钥用量清零）</p></div>
            <span class="badge warn" id="planPendingBadge">0 待审核</span>
          </div>
          <div id="planReqTable"></div>
        </div>
        <div class="card" data-admin>
          <div class="card-head"><div><h3>全部申请记录</h3><p class="desc">最近 200 条</p></div></div>
          <div id="planReqHistory"></div>
        </div>
      </section>

      <section id="t-accounts" class="tab">
        <div class="card">
          <div class="toolbar">
            <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="acctQ" type="text" placeholder="搜索用户名"></div>
            <div class="spacer"></div>
            <button class="sm" data-act="add-account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>新建账号</button>
          </div>
          <p class="desc">管理员可管理全部渠道、密钥与设置；普通用户登录后只能管理自己名下的密钥与用量。</p>
          <div id="acctTable"></div>
        </div>
      </section>

      <section id="t-account" class="tab">
        <div class="card">
          <div class="card-head"><div><h3>账号信息</h3><p class="desc">当前登录身份、角色与配额</p></div></div>
          <div id="acctInfo"></div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-head"><div><h3>修改密码</h3><p class="desc">修改后其他设备上的登录会失效</p></div></div>
            <div class="grid" style="grid-template-columns:1fr">
              <label>当前密码<input id="ac_old" type="password" autocomplete="current-password"></label>
              <label>新密码（8~128 位）<input id="ac_new" type="password" autocomplete="new-password"></label>
              <label>确认新密码<input id="ac_new2" type="password" autocomplete="new-password"></label>
            </div>
            <div class="row end"><button data-act="change-password">保存新密码</button></div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>安全问题</h3><p class="desc">忘记密码时用于自助找回（需管理员开启）</p></div></div>
            <div class="grid" style="grid-template-columns:1fr">
              <label>安全问题<input id="ac_q" type="text" maxlength="100" placeholder="如：我的第一只宠物叫什么"></label>
              <label>答案<input id="ac_a" type="password" autocomplete="off" placeholder="答案不区分大小写与空格"></label>
              <label>当前密码（验证身份）<input id="ac_pw" type="password" autocomplete="current-password"></label>
            </div>
            <p class="hint" id="acSecHint"></p>
            <div class="row end"><button data-act="save-security">保存安全问题</button></div>
          </div>
        </div>
      </section>

      <section id="t-logs" class="tab">
        <div class="card">
          <div class="toolbar">
            <button class="icon-btn" data-act="log-prev" title="前一天" aria-label="前一天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
            <input type="date" id="logDate" style="width:auto">
            <button class="icon-btn" data-act="log-next" title="后一天" aria-label="后一天"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
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
          <p class="hint" style="margin-top:8px">ADMIN_KEY 同时保留为控制台的应急登录凭据（登录页「应急 ADMIN_KEY」）；日常请使用账号密码登录。</p>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>账号与安全</h3><p class="desc">注册开关、问答找回密码与新用户默认配额</p></div></div>
          <div class="grid">
            <label class="check" style="justify-content:flex-start"><input type="checkbox" id="s_allow_reg"> 开放自助注册</label>
            <label class="check" style="justify-content:flex-start"><input type="checkbox" id="s_allow_recovery"> 允许问答找回密码</label>
            <label>新用户默认 Token 配额（0 = 不限）<input type="number" id="s_default_user_quota" min="0" step="1000"><span class="hint">注册与管理员新建普通账号时的初始配额；按账号名下所有密钥合计计算。</span></label>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>性能与容错</h3><p class="desc">作用于所有渠道的默认值，单个渠道可单独覆盖超时</p></div></div>
          <div class="grid">
            <label>请求超时（毫秒，作用于首字节）<input type="number" id="s_timeout" min="1000" max="600000" step="1000"></label>
            <label>流式静默超时（毫秒）<input type="number" id="s_stream_idle" min="5000" max="600000" step="1000"><span class="hint">流式响应专用的「读超时」：收到上游第一个字节之后，超过该时长一个字节都没下发即判定断流，网关主动断开并给客户端一个明确收尾。上面的请求超时只覆盖到首字节，管不了流中途卡死。</span></label>
            <label>流式首字节超时（毫秒）<input type="number" id="s_firstbyte" min="0" max="600000" step="1000"><span class="hint">收到上游第一个字节之前的专用等待：长 prompt（几十 KB 上下文）在慢渠道 / 大模型上，出首 token 前的排队 + 推理远比流中途的停顿更久，统一用「流式静默超时」会把「上游正在算」误判成断流（客户端看到「上游超过静默超时未返回数据」）。0 = 与「流式静默超时」相同，默认 300000。</span></label>
            <label>渠道熔断阈值（连续失败次数）<input type="number" id="s_breaker_n" min="0" max="20" step="1"><span class="hint">同一渠道连续出现渠道侧失败（5xx / 408 / 429 / 网络异常 / 流中断 / 网关流超时）达到该次数后临时熔断：选渠道时自动跳过它，流量让给健康渠道；冷却期结束自动放行试探（半开），再失败重新熔断，成功一次即清零。4xx 与客户端取消不计。0 = 关闭熔断，默认 3。</span></label>
            <label>熔断冷却时长（毫秒）<input type="number" id="s_breaker_cd" min="10000" max="1800000" step="10000"><span class="hint">渠道熔断后经过该时长自动放行试探。太短起不到让流量改道的作用，太长会让刚恢复的渠道闲置过久，默认 300000（5 分钟）。</span></label>
            <label>长任务分流阈值（max_tokens）<input type="number" id="s_longtask" min="0" max="200000" step="500"><span class="hint">请求的 max_tokens ≥ 该值时视为长输出任务，挑渠道时把渠道编辑里未勾选「长输出稳定」的渠道排到候选队尾（仍可用，只是靠后）。适合「某渠道长流经常在尾部被上游切断」的场景。0 = 关闭分流。</span></label>
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
            <div><h3>限流 · 通知 · 备份</h3><p class="desc">密钥 RPM 软限流、Telegram 渠道告警、每日自动备份</p></div>
          </div>
          <div class="grid">
            <label>默认 RPM（每密钥每分钟请求数，0 = 不限）<input type="number" id="s_rpm_default" min="0" max="100000" step="1"><span class="hint">未单独设置 RPM 的密钥沿用此值。Workers 多实例下为软限制（实际上限 ≈ 配置 × 实例数），用于防单 Key 打爆上游；计费级强配额请用密钥的 Token 配额。</span></label>
            <label>每日自动备份保留份数<input type="number" id="s_backup_keep" min="0" max="365" step="1"><span class="hint">每天首个请求把渠道 / 密钥 / 设置 / 账号 / 套餐与申请记录快照到 backup/<日期>.json，超期自动清理。0 = 关闭自动备份。</span></label>
            <label>定时巡检间隔（分钟）<input type="number" id="s_patrol_min" min="0" max="1440" step="5"><span class="hint">Cron 每 10 分钟唤起，巡检按此间隔执行：对每个启用渠道的每个 Key 发一次真实小请求（耗少量上游额度），状态翻转时发 Telegram 通知；过期日志清理（每天一次）与备份兜底不受此项影响。0 = 关闭定时巡检，默认 30。</span></label>
          </div>
          <div class="grid" style="margin-top:12px">
            <label>Telegram Bot Token<input type="password" id="s_tg_token" placeholder="123456:ABC-DEF..." autocomplete="off"><span class="hint">找 @BotFather 创建 Bot 获取；留空则不通知。</span></label>
            <label>Telegram Chat ID<input type="text" id="s_tg_chat" placeholder="接收通知的 chat_id（可向 @userinfobot 发消息查询）"></label>
          </div>
          <div class="grid" style="margin-top:10px">
            <label class="check" style="justify-content:flex-start"><input type="checkbox" id="s_tg_down"> 渠道由正常转异常时告警（推荐）</label>
            <label class="check" style="justify-content:flex-start"><input type="checkbox" id="s_tg_up"> 渠道恢复时通知（默认关，避免吵）</label>
          </div>
          <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="soft sm" data-act="test-notify"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>发送测试消息</button>
            <span class="muted" style="font-size:12px">填完 Token 与 Chat ID 即可测试（无需先保存）；渠道告警只在巡检发现状态翻转时发送</span>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div><h3>备份与恢复</h3><p class="desc">渠道 / 密钥 / 设置 / 账号 / 套餐与申请记录的完整快照；恢复会整体覆盖当前配置、账号与套餐</p></div>
            <div style="display:flex;gap:8px">
              <button class="soft sm" data-act="backup-export"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>立即导出</button>
              <button class="ghost sm" data-act="backup-restore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>从文件恢复</button>
            </div>
          </div>
          <div id="backupList" class="muted" style="font-size:12.5px">加载中…</div>
          <input type="file" id="restoreFile" accept="application/json,.json" style="display:none">
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
            <li>首次打开控制台会要求创建管理员账号；之后可在「账号管理」创建成员账号，或在「网关设置 → 账号与安全」开放自助注册。</li>
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
          <h4>账号与权限</h4>
          <ul>
            <li><b>管理员</b>：管理渠道、全部密钥、账号、设置与日志；<b>普通用户</b>：登录后只能创建/管理自己名下的密钥并查看自己的用量。</li>
            <li>账号配额按用户名下所有密钥的已用 Tokens 合计，达到配额后该账号的所有密钥都会被拒绝；单个用户最多 20 个密钥。</li>
            <li>「问答找回密码」需用户在「我的账号」中设置安全问题；管理员可在设置中关闭该功能，改用「账号管理 → 重置密码」。</li>
            <li>部署时配置的 <code>ADMIN_KEY</code> 保留为应急凭据：可在登录页以「应急 ADMIN_KEY」进入，不影响日常账号登录。</li>
          </ul>
          <h4>套餐与计费</h4>
          <ul>
            <li><b>套餐内容</b>：名称、价格、Token 配额、有效期（天，0 = 长期有效）、账号级 RPM、可用模型白名单。管理员在「套餐管理」创建与上下架。</li>
            <li><b>申请与审核</b>：普通用户在「套餐」页提交申请，管理员确认收款后点「通过」即生效，并开启新的计费周期（名下密钥用量清零）；同一账号同时只能有一条待审核申请。</li>
            <li><b>条款快照</b>：申请提交与审核生效时都按当时的套餐条款执行，之后修改套餐不影响已提交的申请和已生效周期；同套餐续费的有效期从原到期时间顺延，换套餐则从审核通过时重新起算。</li>
            <li><b>生效限制</b>：套餐配额按账号名下所有密钥合计；到期后该账号名下密钥立即停止调用（403 <code>plan_expired</code>）；套餐模型白名单与密钥白名单取交集；账号级 RPM 与密钥 RPM 各自独立计数，任意一层超限即拒绝。</li>
            <li><b>下架</b>：删除套餐会自动驳回其待审核申请；已生效账号保留当前条款直至到期，不再续期。</li>
          </ul>
          <h4>数据存储</h4>
          <p>全部数据存放于 Cloudflare R2：<code>data/channels.json</code>（渠道）、<code>data/keys.json</code>（密钥）、<code>data/settings.json</code>（设置）、<code>data/accounts.json</code>（账号，密码与密保答案仅存 PBKDF2 哈希）、<code>data/sessions.json</code>（登录会话，仅存 token 哈希）、<code>data/plans.json</code>（套餐）、<code>data/plan-requests.json</code>（套餐申请与审核记录）、<code>data/stats/&lt;日期&gt;.json</code>（按天统计）、<code>logs/&lt;日期&gt;/</code>（请求日志）。可在「备份与恢复」导出完整快照。</p>
          <h4>接口一览</h4>
          <ul>
            <li><code>GET /v1/models</code>、<code>POST /v1/chat/completions</code>、<code>POST /v1/completions</code>、<code>POST /v1/embeddings</code></li>
            <li><code>GET /healthz</code> 健康检查；<code>GET /</code> 网关状态</li>
            <li>管理接口均在 <code>/api/admin/*</code>，需登录会话 <code>X-Session-Token</code>，或应急 <code>X-Admin-Key</code></li>
            <li>账号接口 <code>/api/auth/*</code>（初始化、登录、注册、找回密码），用户密钥接口 <code>/api/user/keys</code></li>
            <li>套餐接口：<code>GET /api/user/plans</code> 查看可选套餐与申请记录，<code>POST /api/user/plans</code> 申请 / 取消；<code>GET /api/admin/plans</code> 查看套餐与待审申请，<code>POST /api/admin/plans</code> 完成套餐 CRUD 与审核</li>
          </ul>
        </div>
      </section>

    </div>
  </main>
</div>

<div class="modal-overlay" id="modal"><div class="modal" id="modalBox"></div></div>
<div id="toasts"></div>

<script>
var TOKEN = '';
var AK = ''; // 应急 ADMIN_KEY：只存 sessionStorage，不长期落盘
var ME = null;
var AUTH = { initialized: true, allow_registration: false, allow_password_recovery: true, admin_key_configured: false };
var authMode = 'login';
var RECOVERY = { username: '', question: '' };
var S = { channels: [], keys: [], settings: {}, stats: null, logs: [], logCursor: null, logDate: '', serverToday: '', logDates: [], accounts: [], my: null, mykeys: [], plans: [], planRequests: [], planPending: 0, userPlans: null };
var editingCh = -1, editingKey = -1, editingAccount = -1, editingPlan = '';
var RANGE = 14, METRIC = 'requests';
var autoTimer = null;
var ADMIN_TABS = ['overview','logs','channels','keys','plans','accounts','settings','help'];
var USER_TABS = ['mykeys','plans','account'];
var TITLES = { overview:['概览','网关运行状态与用量趋势'], channels:['渠道管理','上游渠道配置与连通性'], keys:['密钥管理','网关密钥发放与用量'], mykeys:['我的密钥','管理自己的网关密钥与用量'], plans:['套餐','套餐选择、申请与审核'], accounts:['账号管理','管理员与普通用户账号'], account:['我的账号','密码与安全问题'], logs:['请求日志','按天查看转发明细'], settings:['网关设置','超时、重试、定价与日志策略'], help:['使用说明','接入方式与功能说明'] };

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
TOKEN = store.get('og_session') || '';
try { AK = window.sessionStorage.getItem('og_admin_key') || ''; } catch(e){ AK = ''; }

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

function apiHeaders(){
  var h = {};
  if(TOKEN) h['X-Session-Token'] = TOKEN;
  else if(AK) h['X-Admin-Key'] = AK;
  return h;
}
/** 不带登录态的请求：登录 / 注册 / 找回等公开接口用，避免错误地触发「被踢出登录」 */
function fetchJson(path, method, body, headers){
  var opt = { method: method || 'GET', headers: headers || {} };
  if(body !== undefined){ opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(path, opt).then(function(r){
    return r.json().catch(function(){ return { error: { message: '响应解析失败' } }; }).then(function(d){
      if(!r.ok){
        var e = new Error((d.error && d.error.message) || ('HTTP ' + r.status));
        e.status = r.status;
        e.code = (d.error && d.error.code) || '';
        throw e;
      }
      return d;
    });
  });
}
function api(path, method, body){
  return fetchJson(path, method, body, apiHeaders()).catch(function(e){
    if(isSessionErr(e)) markLoggedOut(e.message);
    throw e;
  });
}
function isSessionErr(e){
  return !!e && (e.status === 401 || (e.status === 403 && e.code === 'account_disabled'));
}
function clearEmergency(){
  AK = '';
  try{ window.sessionStorage.removeItem('og_admin_key'); }catch(e){}
}
function saveEmergency(key){
  AK = key;
  try{ window.sessionStorage.setItem('og_admin_key', key); }catch(e){}
}
/** 会话失效：回到登录页（幂等，避免多个并发请求重复弹窗） */
var authLost = false;
function markLoggedOut(msg){
  if(authLost) return;
  authLost = true;
  store.del('og_session');
  clearEmergency();
  TOKEN = ''; ME = null;
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  setConn('fail');
  bootAuth(msg || '登录状态已失效，请重新登录');
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
    el.textContent = '当前浏览器禁用了本地存储（隐私模式或第三方 iframe 内嵌），因此刷新页面后需要重新登录。请在新标签页直接打开本控制台。';
    el.style.display = 'block';
  }
  toast('当前浏览器禁用了本地存储，刷新后需要重新登录', 'bad');
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
function applyTheme(t, persist){
  document.documentElement.setAttribute('data-theme', t);
  // persist=false：系统偏好联动时只切换不落盘 —— 用户手动选择才成为「固定偏好」
  if(persist !== false) store.set('og_theme', t);
  var b = $('btnTheme');
  if(b) b.title = t === 'dark' ? '切换到浅色' : '切换到深色';
}
function initTheme(){
  var t = store.get('og_theme');
  if(!t) t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  applyTheme(t, false);
  // 跟随系统深浅色实时切换：仅在用户未手动选过主题时生效（选过就以用户为准）
  try {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onSys = function(e){
      if(!store.get('og_theme')) applyTheme(e.matches ? 'light' : 'dark', false);
    };
    if(mq.addEventListener) mq.addEventListener('change', onSys);
    else if(mq.addListener) mq.addListener(onSys);
  } catch(e){}
}

/* ---------- 登录 ---------- */
function setConn(state){
  var pill = $('connPill');
  if(state === 'ok'){ pill.className = 'pill ok'; pill.innerHTML = '<span class="dt"></span>已连接'; }
  else if(state === 'fail'){ pill.className = 'pill bad'; pill.innerHTML = '<span class="dt"></span>连接失败'; }
  else if(state === 'wait'){ pill.className = 'pill wait'; pill.innerHTML = '<span class="dt"></span>连接中…'; }
  else { pill.className = 'pill'; pill.innerHTML = '<span class="dt"></span>未连接'; }
}
function updateVersion(v){
  if(!v) return;
  try{
    var el = $('appVer');
    if(el && el.textContent !== 'v' + v){
      el.textContent = 'v' + v;
      var note = $('appVerNote');
      if(note) note.style.display = '';
    }
  }catch(e){}
}

/* 登录 / 注册 / 找回 / 初始化：同一个卡片按状态切换内容 */
function showAuth(mode, msg){
  if(mode === 'register' && !AUTH.allow_registration) mode = 'login';
  if(mode === 'recover' && !AUTH.allow_password_recovery) mode = 'login';
  if(mode === 'setup' && AUTH.initialized) mode = 'login';
  authMode = mode;
  var box = $('authBox');
  if(!box) return;
  $('login').classList.add('on');
  var title = 'OneAPI Gateway', sub = '', h = '';
  if(mode === 'setup'){
    title = '初始化管理员账号';
    sub = '首次使用：创建管理员账号后即可进入控制台，无需再配置 ADMIN_KEY。';
    h = '<div class="auth-form">' +
      '<label>管理员用户名<input id="a_user" type="text" maxlength="24" placeholder="2~24 位中英文、数字、下划线或短横线" autocomplete="username"></label>' +
      '<label>密码<input id="a_pass" type="password" maxlength="128" placeholder="至少 8 位" autocomplete="new-password"></label>' +
      '<label>确认密码<input id="a_pass2" type="password" maxlength="128" autocomplete="new-password"></label>' +
      '<label>安全问题<input id="a_q" type="text" maxlength="100" placeholder="如：我的第一只宠物叫什么"></label>' +
      '<label>安全问题答案<input id="a_a" type="password" maxlength="100" autocomplete="off"><span class="hint">用于忘记密码时自助找回；答案不区分大小写与空格。</span></label>' +
      '<button data-act="auth-setup">创建管理员账号</button></div>';
  } else if(mode === 'login'){
    title = '登录控制台';
    sub = '使用账号密码登录';
    var links = [];
    if(AUTH.allow_registration) links.push('<a class="link" data-act="auth-mode" data-mode="register">注册账号</a>');
    if(AUTH.allow_password_recovery) links.push('<a class="link" data-act="auth-mode" data-mode="recover">忘记密码</a>');
    if(AUTH.admin_key_configured) links.push('<a class="link" data-act="auth-mode" data-mode="emergency">应急 ADMIN_KEY</a>');
    h = '<div class="auth-form">' +
      '<label>用户名<input id="a_user" type="text" maxlength="24" autocomplete="username"></label>' +
      '<label>密码<input id="a_pass" type="password" maxlength="128" autocomplete="current-password"></label>' +
      '<button data-act="auth-login">登录</button></div>' +
      (links.length ? '<div class="auth-links">' + links.join('') + '</div>' : '');
  } else if(mode === 'register'){
    title = '注册账号';
    sub = '注册后可以创建自己的网关密钥并查看用量';
    h = '<div class="auth-form">' +
      '<label>用户名<input id="a_user" type="text" maxlength="24" placeholder="2~24 位中英文、数字、下划线或短横线" autocomplete="username"></label>' +
      '<label>密码<input id="a_pass" type="password" maxlength="128" placeholder="至少 8 位" autocomplete="new-password"></label>' +
      '<label>确认密码<input id="a_pass2" type="password" maxlength="128" autocomplete="new-password"></label>' +
      '<label>安全问题<input id="a_q" type="text" maxlength="100" placeholder="如：我的第一只宠物叫什么"></label>' +
      '<label>安全问题答案<input id="a_a" type="password" maxlength="100" autocomplete="off"><span class="hint">用于忘记密码时自助找回。</span></label>' +
      '<button data-act="auth-register">注册并登录</button></div>' +
      '<div class="auth-links"><a class="link" data-act="auth-mode" data-mode="login">返回登录</a></div>';
  } else if(mode === 'recover'){
    title = '找回密码';
    sub = '输入用户名，通过安全问题重置密码';
    h = '<div class="auth-form">' +
      '<label>用户名<input id="r_user" type="text" maxlength="24" autocomplete="username"></label>' +
      '<button data-act="auth-lookup">下一步</button></div>' +
      '<div class="auth-links"><a class="link" data-act="auth-mode" data-mode="login">返回登录</a></div>';
  } else if(mode === 'recover2'){
    title = '找回密码';
    sub = '回答安全问题并设置新密码';
    h = '<div class="auth-form">' +
      '<div class="auth-q"><span>安全问题</span>' + esc(RECOVERY.question) + '</div>' +
      '<label>答案<input id="r_a" type="password" maxlength="100" autocomplete="off"></label>' +
      '<label>新密码<input id="r_new" type="password" maxlength="128" placeholder="至少 8 位" autocomplete="new-password"></label>' +
      '<label>确认新密码<input id="r_new2" type="password" maxlength="128" autocomplete="new-password"></label>' +
      '<button data-act="auth-recover">重置密码</button></div>' +
      '<div class="auth-links"><a class="link" data-act="auth-mode" data-mode="login">返回登录</a></div>';
  } else if(mode === 'emergency'){
    title = '应急登录';
    sub = '使用部署时配置的 ADMIN_KEY 临时进入控制台';
    h = '<div class="auth-form">' +
      '<label>ADMIN_KEY<input id="e_key" type="password" autocomplete="off"></label>' +
      '<button data-act="auth-emergency">进入控制台</button></div>' +
      '<div class="auth-links"><a class="link" data-act="auth-mode" data-mode="login">返回账号登录</a></div>' +
      '<div class="login-tip">应急登录只保存在当前标签页，关闭标签页即失效。</div>';
  } else {
    title = '无法连接服务端';
    sub = '请检查网络或稍后重试';
    h = '<div class="auth-form"><button data-act="auth-retry">重试</button></div>';
  }
  $('authTitle').textContent = title;
  $('authSub').textContent = sub;
  box.innerHTML = h + (msg ? '<div class="login-warn">' + esc(msg) + '</div>' : '');
  var first = box.querySelector('input');
  if(first){ try{ first.focus(); }catch(e){} }
}

function busyBtn(btn, on, txt){
  if(!btn) return;
  if(on){
    btn.dataset.old = btn.textContent;
    btn.disabled = true;
    btn.textContent = txt || '处理中…';
  } else {
    btn.disabled = false;
    if(btn.dataset.old) btn.textContent = btn.dataset.old;
  }
}
function finishLogin(r){
  TOKEN = r.token || '';
  ME = r.user || null;
  authLost = false;
  if(TOKEN && !store.set('og_session', TOKEN)) warnNoStorage();
  $('login').classList.remove('on');
  setConn('ok');
  applyRole();
  return loadAll().then(function(failed){
    if(failed && failed.length) toast(failed.length + ' 个接口暂时不可用，其余数据已正常显示', 'bad');
  }).catch(function(e){
    if(!isSessionErr(e)) toast(e.message, 'bad');
  });
}
function setupAdmin(){
  var btn = document.querySelector('[data-act="auth-setup"]');
  var u = $('a_user').value.trim(), p = $('a_pass').value, p2 = $('a_pass2').value;
  var q = $('a_q').value.trim(), a = $('a_a').value;
  if(!u) return toast('请填写用户名', 'bad');
  if(p.length < 8) return toast('密码至少 8 位', 'bad');
  if(p !== p2) return toast('两次输入的密码不一致', 'bad');
  if(!q) return toast('请填写安全问题', 'bad');
  if(!a) return toast('请填写安全问题答案', 'bad');
  busyBtn(btn, true, '创建中…');
  fetchJson('/api/auth/setup', 'POST', { username: u, password: p, question: q, answer: a }).then(function(r){
    toast('管理员账号已创建', 'ok');
    return finishLogin(r);
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
    if(e.code === 'already_initialized') bootAuth();
  });
}
function loginSubmit(){
  var btn = document.querySelector('[data-act="auth-login"]');
  var u = $('a_user').value.trim(), p = $('a_pass').value;
  if(!u || !p) return toast('请输入用户名与密码', 'bad');
  busyBtn(btn, true, '登录中…');
  fetchJson('/api/auth/login', 'POST', { username: u, password: p }).then(function(r){
    return finishLogin(r);
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
  });
}
function registerSubmit(){
  var btn = document.querySelector('[data-act="auth-register"]');
  var u = $('a_user').value.trim(), p = $('a_pass').value, p2 = $('a_pass2').value;
  var q = $('a_q').value.trim(), a = $('a_a').value;
  if(!u) return toast('请填写用户名', 'bad');
  if(p.length < 8) return toast('密码至少 8 位', 'bad');
  if(p !== p2) return toast('两次输入的密码不一致', 'bad');
  if(!q) return toast('请填写安全问题', 'bad');
  if(!a) return toast('请填写安全问题答案', 'bad');
  busyBtn(btn, true, '注册中…');
  fetchJson('/api/auth/register', 'POST', { username: u, password: p, question: q, answer: a }).then(function(r){
    toast('注册成功，已自动登录', 'ok');
    return finishLogin(r);
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
  });
}
function recoveryLookup(){
  var btn = document.querySelector('[data-act="auth-lookup"]');
  var u = $('r_user').value.trim();
  if(!u) return toast('请输入用户名', 'bad');
  busyBtn(btn, true, '查询中…');
  fetchJson('/api/auth/recovery?username=' + encodeURIComponent(u)).then(function(r){
    RECOVERY = { username: r.username, question: r.question };
    showAuth('recover2');
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
  });
}
function recoveryReset(){
  var btn = document.querySelector('[data-act="auth-recover"]');
  var a = $('r_a').value, p = $('r_new').value, p2 = $('r_new2').value;
  if(!a) return toast('请填写安全问题答案', 'bad');
  if(p.length < 8) return toast('新密码至少 8 位', 'bad');
  if(p !== p2) return toast('两次输入的新密码不一致', 'bad');
  busyBtn(btn, true, '重置中…');
  fetchJson('/api/auth/recover', 'POST', { username: RECOVERY.username, answer: a, new_password: p }).then(function(){
    toast('密码已重置，请使用新密码登录', 'ok');
    showAuth('login');
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
  });
}
function emergencyLogin(){
  var key = $('e_key').value.trim();
  if(!key) return toast('请输入 ADMIN_KEY', 'bad');
  saveEmergency(key);
  connect(false);
}

/** 拉取公开状态，决定显示初始化 / 登录 / 离线 */
function bootAuth(msg){
  return fetchJson('/api/auth/state').then(function(st){
    AUTH = st || AUTH;
    updateVersion(st && st.version);
    authLost = false;
    if(!AUTH.initialized){ showAuth('setup', msg); setConn('off'); return; }
    if(TOKEN || AK){ connect(true, msg); return; }
    showAuth('login', msg);
    setConn('off');
  }).catch(function(e){
    showAuth('offline', e.message || '网络异常');
  });
}

function resetState(){
  S = { channels: [], keys: [], settings: {}, stats: null, logs: [], logCursor: null, logDate: '', serverToday: '', logDates: [], accounts: [], my: null, mykeys: [], plans: [], planRequests: [], planPending: 0, userPlans: null };
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
}
function doLogout(){
  var token = TOKEN;
  var done = function(){
    store.del('og_session');
    clearEmergency();
    TOKEN = ''; ME = null; authLost = false;
    resetState();
    var di = $('logDate'); if(di) di.value = '';
    var la = $('logAuto'); if(la) la.checked = false;
    setConn('off');
    renderAll();
    toast('已退出登录');
    bootAuth();
  };
  if(token) fetchJson('/api/auth/logout', 'POST', {}, { 'X-Session-Token': token }).then(done, done);
  else done();
}

/** 逐个接口独立请求：某个接口挂了不影响其它数据，也不会把用户踢出登录。
 *  返回「失败的接口清单」；只有会话失效（401）才 reject。 */
function loadAll(){
  if(!ME) return Promise.resolve([]);
  if(ME.role !== 'admin'){
    var failed = [];
    return Promise.all([
      api('/api/user/keys').then(function(r){
        S.my = r.account || null;
        S.mykeys = r.keys || [];
      }).catch(function(e){ failed.push(e); }),
      api('/api/user/plans').then(function(r){
        S.userPlans = r || null;
        if(r && r.account) S.my = r.account;
      }).catch(function(e){ failed.push(e); })
    ]).then(function(){
      var authFail = failed.filter(isSessionErr)[0];
      if(authFail) throw authFail;
      try { renderAll(); } catch(re){ if(window.console) console.error('[render]', re); }
      return failed;
    });
  }
  var jobs = [
    api('/api/auth/me').then(function(v){ if(v && v.user) ME = v.user; }),
    api('/api/admin/channels').then(function(v){ S.channels = v || []; }),
    api('/api/admin/keys').then(function(v){ S.keys = v || []; }),
    api('/api/admin/settings').then(function(v){ S.settings = v || {}; }),
    api('/api/admin/stats?days=' + RANGE).then(function(v){ S.stats = v || null; }),
    api('/api/admin/accounts').then(function(v){ S.accounts = (v && v.accounts) || []; }),
    api('/api/admin/plans').then(function(v){
      S.plans = (v && v.plans) || [];
      S.planRequests = (v && v.requests) || [];
      S.planPending = (v && v.pending_count) || 0;
    }),
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
    var authFail = failed.filter(isSessionErr)[0];
    if(authFail) throw authFail;
    applyRole();
    var di = $('logDate');
    if(di && !di.value) di.value = S.serverToday || todayLocal();
    S.logDate = di ? di.value : S.serverToday;
    // 渲染异常不应被当成「登录失败」，单独兜住
    try { renderAll(); } catch(re){ if(window.console) console.error('[render]', re); }
    return failed;
  });
}

function currentTab(){
  var on = document.querySelector('.tab.on');
  return on ? on.id.slice(2) : 'overview';
}
function applyRole(){
  var admin = !!(ME && ME.role === 'admin');
  document.querySelectorAll('[data-admin]').forEach(function(el){ el.style.display = admin ? '' : 'none'; });
  document.querySelectorAll('[data-user]').forEach(function(el){ el.style.display = admin ? 'none' : ''; });
  if($('meName')) $('meName').textContent = ME ? ME.username : '—';
  if($('meRole')) $('meRole').textContent = ME ? ((admin ? '管理员' : '普通用户') + (ME.emergency ? ' · 应急' : '')) : '未登录';
  var tab = currentTab();
  var allowed = admin ? ADMIN_TABS.concat(['account']) : USER_TABS;
  if(allowed.indexOf(tab) < 0) gotoTab(admin ? 'overview' : 'mykeys');
}

function connect(silent, pendingMsg){
  if(!TOKEN && !AK){
    showAuth('login', pendingMsg);
    setConn('off');
    return;
  }
  var emergency = !TOKEN && !!AK;
  authLost = false;
  setConn('wait');
  fetchJson('/api/auth/me', 'GET', undefined, apiHeaders()).then(function(r){
    ME = r.user || null;
    if(r.emergency) saveEmergency(AK);
    else if(TOKEN && !store.set('og_session', TOKEN)) warnNoStorage();
    $('login').classList.remove('on');
    setConn('ok');
    applyRole();
    return loadAll().then(function(failed){
      if(failed && failed.length) toast(failed.length + ' 个接口暂时不可用，其余数据已正常显示', 'bad');
    }).catch(function(e){
      if(!isSessionErr(e)) toast(e.message, 'bad');
    });
  }).catch(function(e){
    if(isSessionErr(e)){
      clearEmergency();
      store.del('og_session');
      TOKEN = ''; ME = null;
      setConn('fail');
      var msg = e.message || '登录已失效，请重新登录';
      if(emergency && (e.code === 'login_required' || e.code === 'session_invalid')) msg = 'ADMIN_KEY 不正确或未配置';
      showAuth(emergency && e.code !== 'account_disabled' ? 'emergency' : 'login', msg);
      return;
    }
    setConn('fail');
    showAuth('offline', '暂时无法连接服务端：' + (e.message || '网络异常'));
  });
}

function refresh(){
  if(!ME) return;
  loadAll().then(function(failed){
    if(failed && failed.length) toast(failed.length + ' 个接口暂时不可用，已显示其余数据', 'bad');
    else toast('已刷新', 'ok');
  }).catch(function(e){
    // 会话失效会由 markLoggedOut 弹回登录页，无需重复提示
    if(!isSessionErr(e)) toast(e.message, 'bad');
  });
}

/* ---------- 导航 ---------- */
function gotoTab(t){
  if(!ME) return;
  var admin = ME.role === 'admin';
  if(!admin && USER_TABS.indexOf(t) < 0) t = 'mykeys';
  if(admin && t === 'mykeys') t = 'overview';
  document.querySelectorAll('.navbtn').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-tab') === t); });
  document.querySelectorAll('.tab').forEach(function(s){ s.classList.remove('on'); });
  var el = $('t-' + t); if(el) el.classList.add('on');
  var meta = TITLES[t] || ['', ''];
  $('pageTitle').textContent = meta[0];
  $('pageDesc').textContent = meta[1];
  document.title = meta[0] ? meta[0] + ' · OneAPI Gateway' : 'OneAPI Gateway · 控制台';
  if(t === 'logs'){ if(!$('logDate').value) $('logDate').value = S.serverToday || todayLocal(); loadLogs(true); }
  if(t === 'settings') renderSettings();
  if(t === 'mykeys') renderMyKeys();
  if(t === 'plans') renderPlans();
  if(t === 'accounts') renderAccounts();
  if(t === 'account') renderAccount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.navbtn').forEach(function(b){
  b.addEventListener('click', function(){ gotoTab(b.getAttribute('data-tab')); });
});

/* ---------- 图表 ---------- */
/**
 * 单调三次样条（Fritsch–Carlson）路径。
 * 直接把折线连成直线会有明显折角，观感廉价；普通 Catmull-Rom 又会在尖峰处过冲，
 * 把「0 请求」的那天画到负值。这里用单调样条：曲线平滑，且不会越过数据点的上下界。
 */
function smoothPath(pts){
  var n = pts.length;
  if(n === 0) return '';
  if(n === 1) return 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
  if(n === 2) return 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1) + ' L' + pts[1].x.toFixed(1) + ',' + pts[1].y.toFixed(1);
  var dx = [], dy = [], slope = [], m = [], i;
  for(i = 0; i < n - 1; i++){ dx[i] = pts[i+1].x - pts[i].x; dy[i] = pts[i+1].y - pts[i].y; }
  for(i = 0; i < n - 1; i++) slope[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
  m[0] = slope[0]; m[n-1] = slope[n-2];
  for(i = 1; i < n - 1; i++){
    m[i] = (slope[i-1] * slope[i] <= 0) ? 0 : (slope[i-1] + slope[i]) / 2;
  }
  // 限制切线幅值，保证单调性（不过冲）
  for(i = 0; i < n - 1; i++){
    if(slope[i] === 0){ m[i] = 0; m[i+1] = 0; continue; }
    var a = m[i] / slope[i], b = m[i+1] / slope[i];
    var s = a * a + b * b;
    if(s > 9){ var t = 3 / Math.sqrt(s); m[i] = t * a * slope[i]; m[i+1] = t * b * slope[i]; }
  }
  var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
  for(i = 0; i < n - 1; i++){
    var x1 = pts[i].x + dx[i] / 3, y1 = pts[i].y + m[i] * dx[i] / 3;
    var x2 = pts[i+1].x - dx[i] / 3, y2 = pts[i+1].y - m[i+1] * dx[i] / 3;
    d += ' C' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
      ' ' + pts[i+1].x.toFixed(1) + ',' + pts[i+1].y.toFixed(1);
  }
  return d;
}
function chartSvg(series, opts){
  opts = opts || {};
  var w = 820, h = 220, padL = 54, padR = 18, padT = 18, padB = 30;
  var iw = w - padL - padR, ih = h - padT - padB;
  var max = 0;
  series.forEach(function(p){ if(p.value > max) max = p.value; });
  max = max > 0 ? max * 1.15 : 1;
  var n = series.length;
  var fmt = opts.fmt || fmtShort;
  function X(i){ return n > 1 ? padL + i * (iw / (n - 1)) : padL + iw / 2; }
  function Y(v){ return padT + ih - (v / max) * ih; }
  var grid = '';
  for(var k = 0; k <= 4; k++){
    var gy = padT + ih - (k / 4) * ih;
    grid += '<line class="gl" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '"/>';
    grid += '<text class="axis" x="' + (padL - 12) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt(max * k / 4)) + '</text>';
  }
  var line = '', area = '', xlabels = '', dots = '';
  if(n > 0){
    var pts = series.map(function(p, i){ return { x: X(i), y: Y(p.value) }; });
    line = smoothPath(pts);
    area = line + ' L' + pts[n-1].x.toFixed(1) + ',' + (padT + ih) + ' L' + pts[0].x.toFixed(1) + ',' + (padT + ih) + ' Z';
    var step = Math.max(1, Math.ceil(n / 8));
    series.forEach(function(p, i){
      if(i % step === 0 || i === n - 1)
        xlabels += '<text class="axis" x="' + X(i).toFixed(1) + '" y="' + (h - 9) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    if(n <= 60){
      dots = series.map(function(p, i){
        return '<circle class="dot" cx="' + pts[i].x.toFixed(1) + '" cy="' + pts[i].y.toFixed(1) + '" r="3"><title>' + esc(p.label + ' · ' + fmt(p.value)) + '</title></circle>' +
          '<circle class="hot" data-i="' + i + '" cx="' + pts[i].x.toFixed(1) + '" cy="' + pts[i].y.toFixed(1) + '" r="12"/>';
      }).join('');
    }
  }
  var gid = 'agrad';
  return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="用量趋势图">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop class="gs1" offset="0"/><stop class="gs2" offset="1"/></linearGradient></defs>' +
    grid +
    '<path class="ar" fill="url(#' + gid + ')" d="' + area + '"/>' +
    '<path class="ln" d="' + line + '"/>' +
    '<line class="xhair" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + ih) + '" style="opacity:0"/>' +
    '<circle class="fdot" cx="0" cy="0" r="4.5" style="opacity:0"/>' +
    dots + xlabels + '</svg>';
}

/* ---------- 概览 ---------- */
function statCard(o){
  return '<div class="stat">' +
    '<div class="stat-h"><span class="ic ' + (o.tone || '') + '">' + (o.icon || '') + '</span>' +
    '<span class="label">' + esc(o.label) + '</span></div>' +
    '<div class="num">' + o.value + (o.delta || '') + '</div>' +
    '<div class="sub">' + o.sub + '</div></div>';
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
/* 趋势图悬浮：十字准星 + 焦点圆点 + 浮层。鼠标离开时统一收起，避免残影 */
function bindChartTip(){
  var wrap = $('trendChart');
  var svg = wrap ? wrap.querySelector('svg.chart') : null;
  if(!svg) return;
  var old = wrap.querySelector('.ctip'); if(old) old.remove();
  var tip = document.createElement('div');
  tip.className = 'ctip';
  wrap.appendChild(tip);
  var xhair = svg.querySelector('.xhair');
  var fdot = svg.querySelector('.fdot');
  function hide(){
    tip.style.display = 'none';
    if(xhair) xhair.style.opacity = 0;
    if(fdot) fdot.style.opacity = 0;
  }
  svg.addEventListener('mousemove', function(e){
    var hot = e.target && e.target.classList && e.target.classList.contains('hot') ? e.target : null;
    if(!hot){ hide(); return; }
    var i = parseInt(hot.getAttribute('data-i'), 10);
    var days = (S.stats && S.stats.days) || [];
    var p = days[i] || null;
    if(!p){ hide(); return; }
    var cx = parseFloat(hot.getAttribute('cx'));
    var cy = parseFloat(hot.getAttribute('cy'));
    if(xhair){ xhair.setAttribute('x1', cx); xhair.setAttribute('x2', cx); xhair.style.opacity = .8; }
    if(fdot){ fdot.setAttribute('cx', cx); fdot.setAttribute('cy', cy); fdot.style.opacity = 1; }
    var v = Number(p[METRIC] || 0);
    var txt = METRIC === 'cost' ? '$' + fmtCost(v) : (METRIC === 'tokens' ? fmtNum(v) + ' Tokens' : fmtNum(v) + ' 次请求');
    tip.innerHTML = esc(p.date) + '<br><b>' + txt + '</b>';
    var wr = wrap.getBoundingClientRect();
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if(!vb){ hide(); return; }
    var x = (cx / vb.width) * wr.width;
    var y = (cy / vb.height) * wr.height;
    tip.style.display = 'block';
    tip.style.left = Math.min(Math.max(0, wr.width - 140), Math.max(0, x + 12)) + 'px';
    tip.style.top = Math.max(0, y - 52) + 'px';
  });
  svg.addEventListener('mouseleave', hide);
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
    '<label>超时毫秒（留空用全局默认）<input id="m_timeout" type="number" min="1000" value="' + esc(c.timeout_ms || '') + '" placeholder="180000"></label>' +
    '<label>默认 max_tokens（Anthropic 必需）<input id="m_maxt" type="number" value="' + esc(c.default_max_tokens || 4096) + '"></label>' +
    '<label class="check" style="justify-content:flex-start;margin-top:22px"><input id="m_enabled" type="checkbox"' + (c.enabled !== false ? ' checked' : '') + '> 启用该渠道</label>' +
    '<label class="check" style="justify-content:flex-start"><input id="m_longout" type="checkbox"' + (c.long_output_ok !== false ? ' checked' : '') + '> 长输出稳定（大 max_tokens 的长任务优先走这里）</label>' +
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
  // 长输出稳定：取消勾选时写入 false（分流时该渠道的长任务排到队尾）
  c.long_output_ok = $('m_longout').checked;
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
      var hay = [k.name, k.key, k.key_prefix].join(' ').toLowerCase();
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
    if(k.owner_username) subs.push('用户 ' + esc(k.owner_username));
    if(k.note) subs.push(esc(k.note));
    if(k.allowed_models && k.allowed_models.length && k.allowed_models.indexOf('*') < 0) subs.push('限 ' + esc(k.allowed_models.join('/')));
    if(k.rpm != null) subs.push(k.rpm > 0 ? 'RPM ' + k.rpm : 'RPM 不限');
    if(k.last_used_at) subs.push('最近 ' + esc(fmtTime(k.last_used_at)));
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="toggle-key" data-i="' + i + '"' + (k.enabled !== false ? ' checked' : '') + '><span></span></label></td>' +
      '<td><div class="tname"><div><b>' + esc(k.name) + '</b>' + (subs.length ? '<span class="sub" title="' + esc(subs.join(' · ')) + '">' + subs.join(' · ') + '</span>' : '') + '</div></div></td>' +
      '<td class="mono nowrap">' + esc(maskKey(k.key || k.key_prefix)) + ' <button class="ghost sm" data-act="copy-key" data-i="' + i + '" title="复制密钥（仅创建当次可用；遗失请重新生成）"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></td>' +
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
  var k = i >= 0 ? S.keys[i] : { name:'', quota_tokens:0, rpm:null, allowed_models:[], enabled:true, note:'' };
  var expVal = k.expires_at ? String(k.expires_at).slice(0, 10) : '';
  var rpmVal = (k.rpm == null) ? '' : String(k.rpm);
  openModal('<h3>' + (i >= 0 ? '编辑密钥' : '生成密钥') + '</h3><p class="msub">' + (i >= 0 ? esc(k.name) : '将生成一串随机密钥，仅显示一次') + '</p>' +
    '<div class="grid">' +
    '<label>名称<input id="k_name" type="text" value="' + esc(k.name || '') + '" placeholder="如：前端应用"></label>' +
    '<label>Token 配额（0 表示不限）<input id="k_quota" type="number" min="0" value="' + esc(k.quota_tokens || 0) + '"></label>' +
    '<label>RPM 限流（每分钟请求数，留空跟随全局默认，0 = 不限）<input id="k_rpm" type="number" min="0" value="' + esc(rpmVal) + '" placeholder="跟随全局默认"><span class="hint">软限流：防单 Key 瞬时打爆上游。Workers 多实例下实际上限 ≈ 配置 × 实例数；计费级强配额请用上面的 Token 配额。</span></label>' +
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
    rpm: ($('k_rpm').value === '' ? null : (parseInt($('k_rpm').value, 10) || 0)),
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
        '<pre class="detail">' + esc(k.key || (k.key_prefix + '……（完整密钥仅创建当次展示；遗失请重新生成）')) + '</pre>' +
        '<div class="row end"><button data-act="copy-text" data-t="' + esc(k.key) + '">复制密钥</button><button class="ghost" data-act="close-modal">关闭</button></div>', 'sm');
    } else {
      toast('密钥已保存', 'ok');
    }
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function showCurl(i){ showCurlForKey(S.keys[i]); }
function showCurlForKey(k){
  if(!k) return;
  var origin = window.location.origin;
  var kk = k.key || ((k.key_prefix || '<密钥>') + '<完整密钥>');
  var cmd = 'curl ' + origin + '/v1/chat/completions \\n' +
    '  -H "Authorization: Bearer ' + kk + '" \\n' +
    '  -H "Content-Type: application/json" \\n' +
    '  -d \\'{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "你好"}], "stream": true}\\'';
  var js = 'const res = await fetch("' + origin + '/v1/chat/completions", {\\n' +
    '  method: "POST",\\n' +
    '  headers: {\\n' +
    '    "Authorization": "Bearer ' + kk + '",\\n' +
    '    "Content-Type": "application/json"\\n' +
    '  },\\n' +
    '  body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "你好" }] })\\n' +
    '});';
  openModal('<h3>调用示例 · ' + esc(k.name) + '</h3><p class="msub">将示例中的模型名替换为网关支持的模型即可；' + (k.key ? '' : '完整密钥仅创建当次展示，示例中的前缀需替换为你的完整密钥。') + '</p>' +
    '<div class="fld" style="margin-top:0"><span style="font-size:12.5px;color:var(--text2)">cURL</span><pre class="detail" style="margin-top:6px">' + esc(cmd) + '</pre>' +
    '<div class="row end" style="margin-top:8px"><button class="ghost sm" data-act="copy-text" data-t="' + esc(cmd) + '">复制</button></div></div>' +
    '<div class="fld"><span style="font-size:12.5px;color:var(--text2)">JavaScript (fetch)</span><pre class="detail" style="margin-top:6px">' + esc(js) + '</pre>' +
    '<div class="row end" style="margin-top:8px"><button class="ghost sm" data-act="copy-text" data-t="' + esc(js) + '">复制</button></div></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">关闭</button></div>', 'lg');
}

/* ---------- 普通用户：我的密钥 ---------- */
function renderMyKeys(){
  var box = $('myKeyTable');
  if(!box) return;
  var a = S.my || {};
  var quota = Number(a.quota_tokens) || 0;
  var used = Number(a.used_tokens) || 0;
  var cost = Number(a.used_cost) || 0;
  var requests = (S.mykeys || []).reduce(function(sum, k){ return sum + (Number(k.requests) || 0); }, 0);
  var pct = quota > 0 ? Math.min(100, Math.round(used / quota * 100)) : 0;
  if($('myStats')){
    $('myStats').innerHTML =
      statCard({ icon:I.coin, label:'账号配额', value:quota > 0 ? fmtShort(quota) : '不限', sub:(a.plan_id ? esc(a.plan_name) + ' · ' : '') + (quota > 0 ? '已用 ' + pct + '%' : '未设置账号配额') }) +
      statCard({ icon:I.bolt, label:'已用 Tokens', value:fmtShort(used), sub:'预估费用 $' + fmtCost(cost) }) +
      statCard({ icon:I.server, label:'我的密钥', value:String((S.mykeys || []).length), sub:'累计 ' + fmtNum(requests) + ' 次请求 · 上限 20 个' });
  }
  $('navMyKey').textContent = (S.mykeys || []).length;
  var warn = a.plan_status === 'expired'
    ? '<div class="login-warn" style="margin-bottom:12px">套餐已到期，名下密钥的调用会被拒绝。 <a class="link" data-goto="plans">去续费</a></div>'
    : '';
  var h = '<table><thead><tr><th style="width:56px">状态</th><th style="min-width:160px">名称</th><th style="min-width:150px">密钥前缀</th><th class="ar" style="width:150px">已用 Tokens</th><th style="width:108px">创建时间</th><th class="ar" style="width:186px">操作</th></tr></thead><tbody>';
  if(!(S.mykeys || []).length){
    h += '<tr><td colspan="6"><div class="empty">' + I.inbox + '<div>还没有密钥，点击右上角「生成密钥」创建</div></div></td></tr>';
  }
  (S.mykeys || []).forEach(function(k, i){
    var subs = [];
    if(k.expires_at) subs.push('有效期至 ' + esc(String(k.expires_at).slice(0, 10)));
    if(k.last_used_at) subs.push('最近 ' + esc(fmtTime(k.last_used_at)));
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="my-toggle-key" data-i="' + i + '"' + (k.enabled !== false ? ' checked' : '') + '><span></span></label></td>' +
      '<td><div class="tname"><div><b>' + esc(k.name) + '</b>' + (subs.length ? '<span class="sub">' + subs.join(' · ') + '</span>' : '') + '</div></div></td>' +
      '<td class="mono nowrap">' + esc((k.key_prefix || '') + '…') + '</td>' +
      '<td class="ar nowrap">' + fmtNum(k.used_tokens) + '<span class="sub muted">' + fmtNum(k.requests) + ' 次请求 · $' + fmtCost(k.used_cost) + '</span></td>' +
      '<td class="nowrap">' + (k.created_at ? esc(String(k.created_at).slice(0, 10)) : '-') + '</td>' +
      '<td><div class="ops r"><button class="ghost sm" data-act="curl-my" data-i="' + i + '">示例</button>' +
      '<button class="ghost sm" data-act="rename-my" data-i="' + i + '">重命名</button>' +
      '<button class="soft sm" data-act="del-my-key" data-i="' + i + '">删除</button></div></td></tr>';
  });
  box.innerHTML = warn + h + '</tbody></table>';
}
function openMyKeyModal(){
  openModal('<h3>生成密钥</h3><p class="msub">密钥仅在创建当次完整显示，请立即复制保存</p>' +
    '<div class="grid"><label>名称<input id="mk_name" type="text" maxlength="60" placeholder="如：我的应用"></label></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-my-key">生成</button></div>');
}
function saveMyKey(){
  var name = ($('mk_name').value || '').trim();
  api('/api/user/keys', 'POST', { action: 'create', name: name }).then(function(r){
    openModal('<h3>密钥已生成</h3><p class="msub">请立即复制保存，关闭后将无法再次查看完整密钥</p>' +
      '<pre class="detail">' + esc(r.key) + '</pre>' +
      '<div class="row end"><button data-act="copy-text" data-t="' + esc(r.key) + '">复制密钥</button><button class="ghost" data-act="close-modal">关闭</button></div>', 'sm');
    loadAll().catch(function(e){ toast(e.message, 'bad'); });
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function openRenameMyKey(i){
  var k = S.mykeys[i];
  if(!k) return;
  openModal('<h3>重命名密钥</h3><p class="msub">' + esc(k.key_prefix || '') + '…</p>' +
    '<div class="grid"><label>名称<input id="mk_rename" type="text" maxlength="60" value="' + esc(k.name) + '"></label></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="rename-my-key" data-i="' + i + '">保存</button></div>');
}
function renameMyKey(i){
  var k = S.mykeys[i];
  if(!k) return;
  var name = ($('mk_rename').value || '').trim();
  if(!name) return toast('请填写名称', 'bad');
  api('/api/user/keys', 'POST', { action: 'rename', id: k.id, name: name }).then(function(){
    closeModal();
    toast('已重命名', 'ok');
    return loadAll();
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function delMyKey(i){
  var k = S.mykeys[i];
  if(!k) return;
  confirmDlg('删除密钥', '确定删除密钥「' + k.name + '」？调用方将立即失效。').then(function(ok){
    if(!ok) return;
    api('/api/user/keys', 'POST', { action: 'delete', id: k.id }).then(function(){
      toast('已删除', 'ok');
      return loadAll();
    }).catch(function(e){ toast(e.message, 'bad'); });
  });
}

/* ---------- 套餐 ---------- */
function fmtPrice(v){ v = Number(v) || 0; return v > 0 ? '¥' + v.toFixed(2) : '免费'; }
function fmtPlanQuota(q){ return Number(q) > 0 ? fmtShort(q) + ' Tokens' : '不限 Tokens'; }
function fmtPlanDays(d){ d = Number(d) || 0; return d > 0 ? d + ' 天' : '长期有效'; }
function fmtPlanRpm(r){ r = Number(r) || 0; return r > 0 ? fmtNum(r) + ' 次/分钟' : '不限 RPM'; }
function planModelsText(models){ return (models && models.length) ? models.join('、') : '全部模型'; }
function planById(id){
  var lists = [S.plans || []];
  if(S.userPlans && Array.isArray(S.userPlans.plans)) lists.push(S.userPlans.plans);
  for(var i = 0; i < lists.length; i++){
    var hit = lists[i].filter(function(p){ return p.id === id; })[0];
    if(hit) return hit;
  }
  return null;
}
function planReqStatus(s){
  if(s === 'approved') return '<span class="badge ok">已通过</span>';
  if(s === 'rejected') return '<span class="badge bad">已驳回</span>';
  if(s === 'cancelled') return '<span class="badge">已取消</span>';
  return '<span class="badge warn">待审核</span>';
}
function planAccountChip(a){
  if(!a || !a.plan_id) return '<span class="badge">未开通</span>';
  if(a.plan_status === 'expired') return '<span class="badge bad">已到期</span>';
  return '<span class="badge ok">生效中</span>';
}
function renderPlans(){
  if(!ME) return;
  if(ME.role === 'admin') renderAdminPlans();
  else renderUserPlans();
}

function renderUserPlans(){
  var d = S.userPlans || {};
  var a = d.account || S.my || ME || {};
  var plans = d.plans || [];
  var pending = d.pending || null;
  var chip = $('planStatusChip');
  if(chip) chip.innerHTML = planAccountChip(a);

  var box = $('userPlanBox');
  if(box){
    var used = Number(a.used_tokens) || 0;
    var quota = Number(a.quota_tokens) || 0;
    var rows = [
      ['套餐', a.plan_name ? esc(a.plan_name) : '<span class="muted">尚未开通</span>'],
      ['状态', planAccountChip(a)],
      ['到期时间', a.plan_expires_at ? esc(String(a.plan_expires_at).slice(0,10)) + (a.plan_days_left > 0 ? '（剩余 ' + a.plan_days_left + ' 天）' : '') : (a.plan_id ? '长期有效' : '-')],
      ['Token 配额', fmtPlanQuota(quota) + (quota > 0 ? '<span class="sub muted">已用 ' + fmtNum(used) + ' · ' + Math.min(100, Math.round(used / quota * 100)) + '%</span>' : '')],
      ['RPM', a.plan_id ? fmtPlanRpm(a.plan_rpm) : '<span class="muted">按密钥 / 全局设置</span>'],
      ['可用模型', a.plan_id ? esc(planModelsText(a.plan_allowed_models)) : '<span class="muted">不限</span>']
    ];
    box.innerHTML = rows.map(function(r){ return '<div class="kv"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
    if(a.plan_status === 'expired'){
      box.innerHTML += '<div class="login-warn">套餐已于 ' + esc(String(a.plan_expires_at).slice(0,10)) + ' 到期，名下密钥的调用会被拒绝。请选择套餐申请续费，审核通过后自动恢复。</div>';
    }
  }

  var banner = $('planPendingBanner');
  if(banner){
    if(pending){
      banner.style.display = '';
      banner.innerHTML = '套餐「' + esc(pending.plan_name) + '」的申请正在等待管理员审核（提交于 ' + esc(fmtTime(pending.created_at)) + '）' +
        ' <button class="ghost sm" data-act="cancel-plan-req" data-id="' + esc(pending.id) + '">取消申请</button>';
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
  }

  var cards = $('planCards');
  if(cards){
    if(!plans.length){
      cards.innerHTML = '<div class="empty">' + I.inbox + '<div>管理员还没有配置可申请的套餐</div></div>';
    } else {
      cards.innerHTML = plans.map(function(p){
        var isCurrent = a.plan_id === p.id && a.plan_status !== 'expired';
        var btn = pending
          ? '<button class="ghost" disabled>审核中</button>'
          : '<button class="' + (isCurrent ? 'ghost' : '') + '" data-act="request-plan" data-id="' + esc(p.id) + '">' + (isCurrent ? '续费' : '申请开通') + '</button>';
        return '<div class="plan' + (isCurrent ? ' on' : '') + '">' +
          '<div class="plan-h"><b>' + esc(p.name) + '</b>' + (isCurrent ? '<span class="badge ok">当前套餐</span>' : '') + '</div>' +
          '<div class="plan-price">' + fmtPrice(p.price) + ' <small>' + fmtPlanDays(p.duration_days) + '</small></div>' +
          '<div class="plan-desc">' + (p.description ? esc(p.description) : '&nbsp;') + '</div>' +
          '<div class="plan-meta"><span class="chip">' + fmtPlanQuota(p.quota_tokens) + '</span><span class="chip">' + fmtPlanDays(p.duration_days) + '</span><span class="chip">' + fmtPlanRpm(p.rpm) + '</span></div>' +
          '<div class="hint" style="font-size:12px">可用模型：' + esc(planModelsText(p.allowed_models)) + '</div>' +
          '<div class="plan-foot">' + btn + '</div>' +
          '</div>';
      }).join('');
    }
  }

  var hist = $('planHistory');
  if(hist){
    var list = d.history || [];
    var h = '<table><thead><tr><th style="width:132px">提交时间</th><th>套餐</th><th style="width:90px">金额</th><th style="width:96px">状态</th><th>审核信息</th></tr></thead><tbody>';
    if(!list.length){
      h += '<tr><td colspan="5"><div class="empty">' + I.inbox + '<div>还没有已处理的申请记录</div></div></td></tr>';
    }
    list.forEach(function(r){
      var info = '-';
      if(r.status === 'rejected') info = esc(r.reject_reason || '未通过审核');
      else if(r.status === 'approved') info = '审核人 ' + esc(r.reviewed_by || '管理员') + ' · ' + esc(fmtTime(r.reviewed_at));
      else if(r.reviewed_at) info = esc(fmtTime(r.reviewed_at));
      h += '<tr><td class="nowrap">' + esc(fmtTime(r.created_at)) + '</td><td><b>' + esc(r.plan_name) + '</b>' + (r.note ? '<span class="sub muted">备注：' + esc(r.note) + '</span>' : '') + '</td><td class="nowrap">' + fmtPrice(r.price) + '</td><td>' + planReqStatus(r.status) + '</td><td class="muted">' + info + '</td></tr>';
    });
    hist.innerHTML = h + '</tbody></table>';
  }
}

function renderAdminPlans(){
  var nav = $('navPlan');
  if(nav) nav.textContent = S.planPending || 0;
  var badge = $('planPendingBadge');
  if(badge) badge.textContent = (S.planPending || 0) + ' 待审核';

  var box = $('planTable');
  if(box){
    var h = '<table><thead><tr><th style="min-width:150px">套餐</th><th class="ar" style="width:92px">价格</th><th class="ar" style="width:118px">Token 配额</th><th style="width:96px">有效期</th><th style="width:112px">RPM</th><th style="min-width:150px">可用模型</th><th style="width:82px">状态</th><th class="ar" style="width:148px">操作</th></tr></thead><tbody>';
    if(!(S.plans || []).length){
      h += '<tr><td colspan="8"><div class="empty">' + I.inbox + '<div>还没有套餐，点击右上角「新建套餐」创建</div></div></td></tr>';
    }
    (S.plans || []).forEach(function(p, i){
      h += '<tr><td><div class="tname"><div><b>' + esc(p.name) + '</b>' + (p.description ? '<span class="sub">' + esc(p.description) + '</span>' : '') + '</div></div></td>' +
        '<td class="ar nowrap">' + fmtPrice(p.price) + '</td>' +
        '<td class="ar nowrap">' + fmtPlanQuota(p.quota_tokens) + '</td>' +
        '<td class="nowrap">' + fmtPlanDays(p.duration_days) + '</td>' +
        '<td class="nowrap">' + fmtPlanRpm(p.rpm) + '</td>' +
        '<td class="muted">' + esc(planModelsText(p.allowed_models)) + '</td>' +
        '<td>' + (p.enabled === false ? '<span class="badge">已下架</span>' : '<span class="badge ok">可申请</span>') + '</td>' +
        '<td><div class="ops r"><button class="ghost sm" data-act="edit-plan" data-i="' + i + '">编辑</button><button class="soft sm" data-act="del-plan" data-i="' + i + '">删除</button></div></td></tr>';
    });
    box.innerHTML = h + '</tbody></table>';
  }

  var pending = (S.planRequests || []).filter(function(r){ return r.status === 'pending'; });
  var reqBox = $('planReqTable');
  if(reqBox){
    var h2 = '<table><thead><tr><th style="width:130px">申请时间</th><th style="width:138px">用户</th><th style="min-width:130px">套餐</th><th class="ar" style="width:86px">金额</th><th style="min-width:140px">备注</th><th class="ar" style="width:146px">操作</th></tr></thead><tbody>';
    if(!pending.length){
      h2 += '<tr><td colspan="6"><div class="empty">' + I.inbox + '<div>没有待审核的套餐申请</div></div></td></tr>';
    }
    pending.forEach(function(r){
      h2 += '<tr><td class="nowrap">' + esc(fmtTime(r.created_at)) + '</td><td><b>' + esc(r.username || r.account_id) + '</b></td>' +
        '<td><b>' + esc(r.plan_name) + '</b><span class="sub muted">' + fmtPlanQuota(r.quota_tokens) + ' · ' + fmtPlanDays(r.duration_days) + '</span></td>' +
        '<td class="ar nowrap">' + fmtPrice(r.price) + '</td>' +
        '<td class="muted">' + (r.note ? esc(r.note) : '-') + '</td>' +
        '<td><div class="ops r"><button class="sm" data-act="approve-plan-req" data-id="' + esc(r.id) + '">通过</button><button class="soft sm" data-act="reject-plan-req" data-id="' + esc(r.id) + '">驳回</button></div></td></tr>';
    });
    reqBox.innerHTML = h2 + '</tbody></table>';
  }

  var histBox = $('planReqHistory');
  if(histBox){
    var list = (S.planRequests || []).slice(0, 200);
    var h3 = '<table><thead><tr><th style="width:130px">申请时间</th><th style="width:130px">用户</th><th style="min-width:130px">套餐</th><th class="ar" style="width:86px">金额</th><th style="width:96px">状态</th><th>审核</th></tr></thead><tbody>';
    if(!list.length){
      h3 += '<tr><td colspan="6"><div class="empty">' + I.inbox + '<div>暂无申请记录</div></div></td></tr>';
    }
    list.forEach(function(r){
      var info = '等待处理';
      if(r.status === 'rejected') info = esc(r.reject_reason || '已驳回');
      else if(r.status === 'approved') info = esc(r.reviewed_by || '管理员') + (r.reviewed_at ? ' · ' + esc(fmtTime(r.reviewed_at)) : '');
      else if(r.status === 'cancelled') info = '用户取消';
      h3 += '<tr><td class="nowrap">' + esc(fmtTime(r.created_at)) + '</td><td>' + esc(r.username || r.account_id) + '</td><td><b>' + esc(r.plan_name) + '</b>' + (r.note ? '<span class="sub muted">' + esc(r.note) + '</span>' : '') + '</td><td class="ar nowrap">' + fmtPrice(r.price) + '</td><td>' + planReqStatus(r.status) + '</td><td class="muted">' + info + '</td></tr>';
    });
    histBox.innerHTML = h3 + '</tbody></table>';
  }
}

function openPlanModal(i){
  var isNew = i < 0;
  var p = isNew
    ? { name:'', description:'', price:0, quota_tokens:1000000, duration_days:30, rpm:0, allowed_models:[], enabled:true }
    : S.plans[i];
  if(!p) return;
  editingPlan = isNew ? '' : p.id;
  var h = '<h3>' + (isNew ? '新建套餐' : '编辑套餐') + '</h3><p class="msub">' +
    (isNew ? '创建后用户即可申请，审核通过后生效' : '修改只影响之后的申请与指派；已生效的账号按申请时的条款快照执行') + '</p><div class="grid">' +
    '<label>套餐名称<input id="pl_name" type="text" maxlength="40" value="' + esc(p.name) + '" placeholder="如：基础版"></label>' +
    '<label>价格（元，仅展示，线下收款）<input id="pl_price" type="number" min="0" step="0.01" value="' + esc(p.price || 0) + '"></label>' +
    '<label>Token 配额（0 = 不限）<input id="pl_quota" type="number" min="0" step="1000" value="' + esc(p.quota_tokens || 0) + '"><span class="hint">按账号名下所有密钥合计；审核通过后重新计数。</span></label>' +
    '<label>有效期（天，0 = 长期有效）<input id="pl_days" type="number" min="0" max="3650" step="1" value="' + esc(p.duration_days || 0) + '"></label>' +
    '<label>RPM（每分钟请求数，0 = 不限）<input id="pl_rpm" type="number" min="0" max="100000" step="1" value="' + esc(p.rpm || 0) + '"><span class="hint">账号级上限，名下所有密钥合计；与密钥自身 RPM 同时生效。</span></label>' +
    '<label>可用模型（逗号分隔，留空 = 全部）<input id="pl_models" type="text" value="' + esc((p.allowed_models || []).join(', ')) + '" placeholder="gpt-4o-mini, deepseek-chat"></label>' +
    '<label>套餐描述（可选）<input id="pl_desc" type="text" maxlength="300" value="' + esc(p.description || '') + '"></label>' +
    '<label class="check" style="justify-content:flex-start;margin-top:22px"><input id="pl_enabled" type="checkbox"' + (p.enabled !== false ? ' checked' : '') + '> 上架（用户可见并可申请）</label>' +
    '</div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-plan">' + (isNew ? '创建' : '保存') + '</button></div>';
  openModal(h, 'lg');
}
function savePlan(){
  var name = ($('pl_name').value || '').trim();
  if(!name) return toast('请填写套餐名称', 'bad');
  var models = ($('pl_models').value || '').split(/[,，\\s]+/).map(function(m){ return m.trim(); }).filter(Boolean);
  var payload = {
    name: name,
    description: ($('pl_desc').value || '').trim(),
    price: Number($('pl_price').value) || 0,
    quota_tokens: Math.max(0, parseInt($('pl_quota').value, 10) || 0),
    duration_days: Math.max(0, parseInt($('pl_days').value, 10) || 0),
    rpm: Math.max(0, parseInt($('pl_rpm').value, 10) || 0),
    allowed_models: models,
    enabled: $('pl_enabled').checked
  };
  var btn = $('modalBox').querySelector('[data-act="save-plan"]');
  busyBtn(btn, true, '保存中…');
  payload.action = editingPlan ? 'update' : 'create';
  if(editingPlan) payload.id = editingPlan;
  api('/api/admin/plans', 'POST', payload).then(function(){
    closeModal();
    toast(editingPlan ? '套餐已更新' : '套餐已创建', 'ok');
    return loadAll();
  }).catch(function(e){ busyBtn(btn, false); toast(e.message, 'bad'); });
}
function delPlan(i){
  var p = S.plans[i];
  if(!p) return;
  confirmDlg('删除套餐', '确定删除套餐「' + p.name + '」？待审核的申请会自动驳回；已生效账号保留当前周期条款，到期后不再续期。').then(function(ok){
    if(!ok) return;
    api('/api/admin/plans', 'POST', { action:'delete', id:p.id }).then(function(r){
      toast('套餐已删除' + (r.rejected_requests ? '，已驳回 ' + r.rejected_requests + ' 条待审核申请' : ''), 'ok');
      return loadAll();
    }).catch(function(e){ toast(e.message, 'bad'); });
  });
}
function openPlanRequest(id){
  var p = planById(id);
  if(!p) return;
  openModal('<h3>申请套餐：' + esc(p.name) + '</h3>' +
    '<p class="msub">提交后由管理员确认付款并审核，通过后套餐立即生效（配额重新计数）</p>' +
    '<div class="plan-meta"><span class="chip">' + fmtPlanQuota(p.quota_tokens) + '</span><span class="chip">' + fmtPlanDays(p.duration_days) + '</span><span class="chip">' + fmtPlanRpm(p.rpm) + '</span><span class="chip">' + esc(planModelsText(p.allowed_models)) + '</span></div>' +
    '<div class="grid" style="margin-top:12px"><label>备注（可选）<input id="pr_note" type="text" maxlength="200" placeholder="付款凭证 / 联系方式"></label></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="submit-plan-req" data-id="' + esc(p.id) + '">提交申请</button></div>', 'sm');
}
function submitPlanRequest(id){
  var note = ($('pr_note') && $('pr_note').value || '').trim();
  var btn = $('modalBox').querySelector('[data-act="submit-plan-req"]');
  busyBtn(btn, true, '提交中…');
  api('/api/user/plans', 'POST', { action:'request', plan_id:id, note:note }).then(function(){
    closeModal();
    toast('申请已提交，等待管理员审核', 'ok');
    return loadAll();
  }).catch(function(e){ busyBtn(btn, false); toast(e.message, 'bad'); });
}
function cancelPlanRequest(id){
  confirmDlg('取消申请', '确定取消这条套餐申请？').then(function(ok){
    if(!ok) return;
    api('/api/user/plans', 'POST', { action:'cancel', id:id }).then(function(){
      toast('申请已取消', 'ok');
      return loadAll();
    }).catch(function(e){ toast(e.message, 'bad'); });
  });
}
function findPlanRequest(id){ return (S.planRequests || []).filter(function(r){ return r.id === id; })[0] || null; }
function approvePlanRequest(id){
  var r = findPlanRequest(id);
  if(!r) return;
  confirmDlg('通过申请', '确认「' + r.username + '」的「' + r.plan_name + '」申请已收款并通过？通过后立即生效，该账号名下密钥用量将清零。').then(function(ok){
    if(!ok) return;
    api('/api/admin/plans', 'POST', { action:'approve-request', id:id }).then(function(){
      toast('已通过，套餐已生效', 'ok');
      return loadAll();
    }).catch(function(e){ toast(e.message, 'bad'); });
  });
}
function openRejectPlanRequest(id){
  var r = findPlanRequest(id);
  if(!r) return;
  openModal('<h3>驳回申请</h3><p class="msub">' + esc(r.username) + ' · ' + esc(r.plan_name) + ' · ' + fmtPrice(r.price) + '</p>' +
    '<div class="grid"><label>驳回原因（用户可见）<input id="pr_reason" type="text" maxlength="200" placeholder="如：未收到付款"></label></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button class="danger" data-act="submit-reject-plan" data-id="' + esc(r.id) + '">确认驳回</button></div>', 'sm');
}
function rejectPlanRequest(id){
  var reason = ($('pr_reason') && $('pr_reason').value || '').trim();
  var btn = $('modalBox').querySelector('[data-act="submit-reject-plan"]');
  busyBtn(btn, true, '处理中…');
  api('/api/admin/plans', 'POST', { action:'reject-request', id:id, reason:reason }).then(function(){
    closeModal();
    toast('已驳回该申请', 'ok');
    return loadAll();
  }).catch(function(e){ busyBtn(btn, false); toast(e.message, 'bad'); });
}

/* ---------- 管理员：账号管理 ---------- */
function filteredAccounts(){
  var el = $('acctQ');
  var q = (el && el.value || '').trim().toLowerCase();
  return (S.accounts || []).filter(function(a){
    return !q || String(a.username || '').toLowerCase().indexOf(q) >= 0;
  });
}
function renderAccounts(){
  var box = $('acctTable');
  if(!box) return;
  $('navAcct').textContent = (S.accounts || []).length;
  var list = filteredAccounts();
  var h = '<table><thead><tr><th style="width:56px">状态</th><th style="min-width:170px">用户名</th><th style="width:88px">角色</th><th style="width:132px">套餐</th><th style="width:120px">配额</th><th class="ar" style="width:140px">已用 Tokens</th><th style="width:76px">密钥</th><th style="width:96px">安全问答</th><th class="ar" style="width:212px">操作</th></tr></thead><tbody>';
  if(!list.length){
    h += '<tr><td colspan="9"><div class="empty">' + I.inbox + '<div>' + (S.accounts.length ? '没有符合搜索条件的账号' : '暂无账号') + '</div></div></td></tr>';
  }
  list.forEach(function(a){
    var idx = S.accounts.indexOf(a);
    var subs = [];
    if(a.is_current) subs.push('当前登录');
    if(a.last_login_at) subs.push('最近 ' + esc(fmtTime(a.last_login_at)));
    h += '<tr>' +
      '<td><label class="switch"><input type="checkbox" data-act="toggle-account" data-id="' + esc(a.id) + '"' + (a.enabled !== false ? ' checked' : '') + (a.is_current ? ' disabled' : '') + '><span></span></label></td>' +
      '<td><div class="tname"><div><b>' + esc(a.username) + '</b>' + (subs.length ? '<span class="sub">' + subs.join(' · ') + '</span>' : '') + '</div></div></td>' +
      '<td>' + (a.role === 'admin' ? '<span class="badge info">管理员</span>' : '<span class="badge">普通用户</span>') + '</td>' +
      '<td>' + (a.plan_id ? '<span class="badge ' + (a.plan_status === 'expired' ? 'bad' : 'ok') + '">' + esc(a.plan_name) + '</span>' + (a.plan_expires_at ? '<span class="sub muted">至 ' + esc(String(a.plan_expires_at).slice(0,10)) + '</span>' : '') : '<span class="muted">—</span>') + '</td>' +
      '<td class="nowrap">' + (a.quota_tokens > 0 ? fmtNum(a.quota_tokens) : '<span class="muted">不限</span>') + '</td>' +
      '<td class="ar nowrap">' + fmtNum(a.used_tokens) + '<span class="sub muted">$' + fmtCost(a.used_cost) + '</span></td>' +
      '<td class="nowrap">' + fmtNum(a.key_count) + '</td>' +
      '<td>' + (a.has_recovery ? '<span class="badge ok">已设置</span>' : '<span class="muted">未设置</span>') + '</td>' +
      '<td><div class="ops r"><button class="ghost sm" data-act="edit-account" data-i="' + idx + '">编辑</button>' +
      '<button class="ghost sm" data-act="reset-account-pw" data-i="' + idx + '">重置密码</button>' +
      '<button class="soft sm" data-act="del-account" data-i="' + idx + '">删除</button></div></td></tr>';
  });
  box.innerHTML = h + '</tbody></table>';
}
function openAccountModal(i){
  editingAccount = i;
  var isNew = i < 0;
  var a = isNew
    ? { role: 'user', enabled: true, quota_tokens: Number(S.settings.default_user_quota_tokens) || 0, has_recovery: false }
    : S.accounts[i];
  if(!a) return;
  var h = '<h3>' + (isNew ? '新建账号' : '编辑账号') + '</h3><p class="msub">' +
    (isNew ? '创建后把用户名与初始密码交给成员即可使用' : '账号：' + esc(a.username)) + '</p><div class="grid">';
  if(isNew){
    h += '<label>用户名<input id="aa_user" type="text" maxlength="24" placeholder="2~24 位中英文、数字、下划线或短横线"></label>' +
      '<label>初始密码<input id="aa_pass" type="password" maxlength="128" placeholder="至少 8 位" autocomplete="new-password"></label>';
  }
  var planOpts = '<option value="">不指定（手动配额）</option>';
  (S.plans || []).forEach(function(p){
    planOpts += '<option value="' + esc(p.id) + '"' + (a.plan_id === p.id ? ' selected' : '') + '>' + esc(p.name) + '（' + fmtPlanQuota(p.quota_tokens) + ' · ' + fmtPlanDays(p.duration_days) + '）</option>';
  });
  h += '<label>角色<select id="aa_role"><option value="user"' + (a.role !== 'admin' ? ' selected' : '') + '>普通用户</option><option value="admin"' + (a.role === 'admin' ? ' selected' : '') + '>管理员</option></select></label>' +
    '<label>套餐<select id="aa_plan">' + planOpts + '</select><span class="hint" id="aa_plan_hint"></span></label>' +
    '<label>Token 配额（0 = 不限）<input id="aa_quota" type="number" min="0" step="1000" value="' + esc(a.quota_tokens || 0) + '"><span class="hint">选择套餐时会自动填入套餐配额，也可在此覆盖。</span></label>' +
    (isNew ? '' : '<label class="check" style="justify-content:flex-start;margin-top:22px"><input id="aa_enabled" type="checkbox"' + (a.enabled !== false ? ' checked' : '') + (a.is_current ? ' disabled' : '') + '> 启用该账号</label>') +
    (!isNew && a.plan_id ? '<label class="check" style="justify-content:flex-start;margin-top:22px"><input id="aa_renew" type="checkbox"> 续期并清零用量</label>' : '') +
    '<label>安全问题（可选）<input id="aa_q" type="text" maxlength="100" placeholder="留空表示不修改"></label>' +
    '<label>安全问题答案<input id="aa_a" type="password" maxlength="100" autocomplete="off" placeholder="设置新问题时填写"></label>' +
    '</div>';
  if(!isNew && a.has_recovery){
    h += '<label class="check" style="margin-top:10px"><input id="aa_clear_sec" type="checkbox"> 清除已设置的安全问题</label>';
  }
  h += '<p class="hint">普通用户登录后只能管理自己名下的密钥与用量；管理员可管理全部渠道、密钥与设置。套餐到期后该账号名下密钥会被拒绝调用。</p>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="save-account">' + (isNew ? '创建' : '保存') + '</button></div>';
  openModal(h);
  var sel = $('aa_plan');
  if(sel){
    var syncPlan = function(){
      var hint = $('aa_plan_hint');
      if(!hint) return;
      if(!sel.value){
        hint.textContent = a.plan_id ? '保存后解除套餐与到期限制（配额保留当前值）。' : '不指定套餐时按上面的配额手动控制。';
      } else if(a.plan_id === sel.value){
        hint.textContent = '当前套餐。套餐不变时如需续期并清零用量，请勾选下方「续期并清零用量」。';
      } else {
        hint.textContent = '保存后立即生效：到期时间从现在起算，名下密钥用量清零。';
      }
    };
    sel.addEventListener('change', function(){
      var p = planById(sel.value);
      if(p) $('aa_quota').value = p.quota_tokens;
      syncPlan();
    });
    syncPlan();
  }
}
function saveAccount(){
  var isNew = editingAccount < 0;
  var role = $('aa_role').value === 'admin' ? 'admin' : 'user';
  var quota = Math.max(0, parseInt($('aa_quota').value, 10) || 0);
  var q = ($('aa_q').value || '').trim();
  var ans = $('aa_a').value || '';
  var planId = $('aa_plan') ? $('aa_plan').value : '';
  var payload;
  if(isNew){
    var u = ($('aa_user').value || '').trim();
    var p = $('aa_pass').value;
    if(!u) return toast('请填写用户名', 'bad');
    if(p.length < 8) return toast('初始密码至少 8 位', 'bad');
    payload = { action: 'create', username: u, password: p, role: role, quota_tokens: quota };
    if(planId) payload.plan_id = planId;
    if(q || ans){ payload.question = q; payload.answer = ans; }
  } else {
    var a = S.accounts[editingAccount];
    payload = { action: 'update', id: a.id, role: role, quota_tokens: quota, plan_id: planId, enabled: $('aa_enabled').checked };
    if($('aa_renew') && $('aa_renew').checked) payload.renew_plan = true;
    if($('aa_clear_sec') && $('aa_clear_sec').checked) payload.clear_security = true;
    else if(q || ans){ payload.question = q; payload.answer = ans; }
  }
  var btn = $('modalBox').querySelector('[data-act="save-account"]');
  busyBtn(btn, true, '保存中…');
  api('/api/admin/accounts', 'POST', payload).then(function(){
    closeModal();
    toast(isNew ? '账号已创建' : '账号已更新', 'ok');
    return loadAll();
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
  });
}
function openResetAccountPw(i){
  var a = S.accounts[i];
  if(!a) return;
  openModal('<h3>重置密码</h3><p class="msub">为「' + esc(a.username) + '」设置新密码，该账号在其他设备上的登录会失效</p>' +
    '<div class="grid"><label>新密码<input id="rp_new" type="password" maxlength="128" placeholder="至少 8 位" autocomplete="new-password"></label>' +
    '<label>确认新密码<input id="rp_new2" type="password" maxlength="128" autocomplete="new-password"></label></div>' +
    '<div class="row end"><button class="ghost" data-act="close-modal">取消</button><button data-act="reset-account-pw-save" data-i="' + i + '">重置</button></div>');
}
function resetAccountPw(i){
  var a = S.accounts[i];
  if(!a) return;
  var p = $('rp_new').value, p2 = $('rp_new2').value;
  if(p.length < 8) return toast('新密码至少 8 位', 'bad');
  if(p !== p2) return toast('两次输入的密码不一致', 'bad');
  var btn = $('modalBox').querySelector('[data-act="reset-account-pw-save"]');
  busyBtn(btn, true, '重置中…');
  api('/api/admin/accounts', 'POST', { action: 'reset-password', id: a.id, new_password: p }).then(function(){
    closeModal();
    toast('密码已重置', 'ok');
  }).catch(function(e){
    busyBtn(btn, false);
    toast(e.message, 'bad');
  });
}
function delAccount(i){
  var a = S.accounts[i];
  if(!a) return;
  confirmDlg('删除账号', '确定删除账号「' + a.username + '」？其名下 ' + a.key_count + ' 个密钥会一并删除，此操作不可恢复。').then(function(ok){
    if(!ok) return;
    api('/api/admin/accounts', 'POST', { action: 'delete', id: a.id }).then(function(r){
      toast('账号已删除' + (r.removed_keys ? '，同时删除 ' + r.removed_keys + ' 个密钥' : ''), 'ok');
      return loadAll();
    }).catch(function(e){ toast(e.message, 'bad'); });
  });
}

/* ---------- 我的账号 ---------- */
function renderAccount(){
  var box = $('acctInfo');
  if(!box) return;
  if(!ME){ box.innerHTML = ''; return; }
  var me = (ME.role !== 'admin' && S.my) ? Object.assign({}, ME, S.my) : ME;
  var cur = (S.accounts || []).filter(function(a){ return a.is_current; })[0] || null;
  var used = S.my ? (S.my.used_tokens || 0) : (cur ? (cur.used_tokens || 0) : 0);
  var rows = [
    ['用户名', esc(me.username)],
    ['角色', me.role === 'admin' ? '管理员' : '普通用户'],
    ['套餐', me.plan_id ? esc(me.plan_name) + ' ' + planAccountChip(me) : '<span class="muted">未开通</span>'],
    ['套餐到期', me.plan_id ? (me.plan_expires_at ? esc(String(me.plan_expires_at).slice(0,10)) + (me.plan_days_left > 0 ? '（剩余 ' + me.plan_days_left + ' 天）' : '') : '长期有效') : '-'],
    ['账号配额', me.quota_tokens > 0 ? fmtNum(me.quota_tokens) + ' Tokens' : '不限'],
    ['已用 Tokens', fmtNum(used)],
    ['最近登录', fmtTime(me.last_login_at)],
    ['创建时间', fmtTime(me.created_at)],
    ['安全问题', me.has_recovery ? '已设置' : '未设置']
  ];
  var h = rows.map(function(r){ return '<div class="kv"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
  if(ME.emergency) h += '<div class="login-warn">当前为 ADMIN_KEY 应急登录：没有关联账号，无法修改密码或安全问题。日常请使用账号登录。</div>';
  box.innerHTML = h;
  var disabled = !!ME.emergency;
  ['ac_old','ac_new','ac_new2','ac_q','ac_a','ac_pw'].forEach(function(id){
    var el = $(id); if(el) el.disabled = disabled;
  });
  document.querySelectorAll('#t-account button[data-act]').forEach(function(el){ el.disabled = disabled; });
  var hint = $('acSecHint');
  if(hint){
    hint.textContent = disabled
      ? '应急登录无法设置安全问题。'
      : (ME.has_recovery ? '已设置安全问题；重新填写可覆盖旧问题与答案。' : '尚未设置安全问题，忘记密码时无法自助找回。');
  }
}
function changePassword(){
  var oldP = $('ac_old').value, p = $('ac_new').value, p2 = $('ac_new2').value;
  if(!oldP) return toast('请填写当前密码', 'bad');
  if(p.length < 8) return toast('新密码至少 8 位', 'bad');
  if(p !== p2) return toast('两次输入的新密码不一致', 'bad');
  api('/api/auth/change-password', 'POST', { old_password: oldP, new_password: p }).then(function(){
    $('ac_old').value = ''; $('ac_new').value = ''; $('ac_new2').value = '';
    toast('密码已修改，其他设备已登出', 'ok');
  }).catch(function(e){ toast(e.message, 'bad'); });
}
function saveSecurity(){
  var q = ($('ac_q').value || '').trim();
  var a = $('ac_a').value || '';
  var p = $('ac_pw').value || '';
  if(!q) return toast('请填写安全问题', 'bad');
  if(!a) return toast('请填写安全问题答案', 'bad');
  if(!p) return toast('请输入当前密码以验证身份', 'bad');
  api('/api/auth/security', 'POST', { question: q, answer: a, password: p }).then(function(){
    ME.has_recovery = true;
    $('ac_q').value = ''; $('ac_a').value = ''; $('ac_pw').value = '';
    renderAccount();
    toast('安全问题已保存', 'ok');
  }).catch(function(e){ toast(e.message, 'bad'); });
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
  $('s_allow_reg').checked = s.allow_registration === true;
  $('s_allow_recovery').checked = s.allow_password_recovery !== false;
  $('s_default_user_quota').value = s.default_user_quota_tokens == null ? 0 : s.default_user_quota_tokens;
  $('s_timeout').value = s.request_timeout_ms || 180000;
  $('s_stream_idle').value = s.stream_idle_timeout_ms || 180000;
  $('s_firstbyte').value = s.stream_first_byte_ms === 0 ? 0 : s.stream_first_byte_ms || 300000;
  $('s_breaker_n').value = s.breaker_error_threshold === 0 ? 0 : s.breaker_error_threshold || 3;
  $('s_breaker_cd').value = s.breaker_cooldown_ms || 300000;
  $('s_longtask').value = s.long_task_min_tokens || 0;
  $('s_stream_ka').value =
    s.stream_keepalive_ms === 0 ? 0 : s.stream_keepalive_ms || 15000;
  $('s_retries').value = s.retries == null ? 1 : s.retries;
  $('s_retention').value = s.log_retention_days || 30;
  $('s_tz').value = s.timezone_offset_minutes == null ? 480 : s.timezone_offset_minutes;
  $('s_models').value = (s.custom_models || []).join(',');
  $('s_rpm_default').value = s.rpm_default == null ? 0 : s.rpm_default;
  $('s_backup_keep').value = s.backup_keep_days == null ? 7 : s.backup_keep_days;
  $('s_patrol_min').value = s.patrol_interval_min == null ? 30 : s.patrol_interval_min;
  $('s_tg_token').value = s.tg_bot_token || '';
  $('s_tg_chat').value = s.tg_chat_id || '';
  $('s_tg_down').checked = s.tg_notify_down !== false;
  $('s_tg_up').checked = s.tg_notify_up === true;
  var dp = s.default_pricing || { in:0, out:0 };
  $('s_pin').value = dp.in || 0;
  $('s_pout').value = dp.out || 0;
  renderPriceRows(s.pricing || {});
  renderBackups();
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
    allow_registration: $('s_allow_reg').checked,
    allow_password_recovery: $('s_allow_recovery').checked,
    default_user_quota_tokens: Math.max(0, parseInt($('s_default_user_quota').value, 10) || 0),
    request_timeout_ms: parseInt($('s_timeout').value, 10) || 180000,
    stream_idle_timeout_ms: parseInt($('s_stream_idle').value, 10) || 180000,
    stream_first_byte_ms: (() => {
      const v = parseInt($('s_firstbyte').value, 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    })(),
    breaker_error_threshold: (() => {
      const v = parseInt($('s_breaker_n').value, 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    })(),
    breaker_cooldown_ms: (() => {
      const v = parseInt($('s_breaker_cd').value, 10);
      return Number.isFinite(v) ? Math.max(10000, v) : 300000;
    })(),
    long_task_min_tokens: (() => {
      const v = parseInt($('s_longtask').value, 10);
      return Number.isFinite(v) ? Math.max(0, v) : 0;
    })(),
    stream_keepalive_ms: (() => {
      const v = parseInt($('s_stream_ka').value, 10);
      return Number.isFinite(v) ? Math.max(0, v) : 15000;
    })(),
    retries: parseInt($('s_retries').value, 10) || 0,
    log_retention_days: parseInt($('s_retention').value, 10) || 30,
    timezone_offset_minutes: tz,
    custom_models: $('s_models').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
    default_pricing: { in: Number($('s_pin').value) || 0, out: Number($('s_pout').value) || 0 },
    pricing: pricing,
    rpm_default: Math.max(0, parseInt($('s_rpm_default').value, 10) || 0),
    backup_keep_days: Math.max(0, parseInt($('s_backup_keep').value, 10) || 0),
    patrol_interval_min: Math.min(1440, Math.max(0, parseInt($('s_patrol_min').value, 10) || 0)),
    tg_bot_token: $('s_tg_token').value.trim(),
    tg_chat_id: $('s_tg_chat').value.trim(),
    tg_notify_down: $('s_tg_down').checked,
    tg_notify_up: $('s_tg_up').checked
  };
}
function saveSettings(btn){
  btn.disabled = true; var old = btn.textContent; btn.textContent = '保存中…';
  api('/api/admin/settings', 'POST', collectSettings()).then(function(r){
    S.settings = r.settings || S.settings;
    AUTH.allow_registration = S.settings.allow_registration === true;
    AUTH.allow_password_recovery = S.settings.allow_password_recovery !== false;
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

/* ---------- 备份与恢复 ---------- */
function fmtBytes(n){
  if(n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if(n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n || 0) + ' B';
}
function renderBackups(){
  var el = $('backupList');
  if(!el) return;
  api('/api/admin/backups', 'GET').then(function(r){
    var list = r.backups || [];
    if(!list.length){
      el.innerHTML = '暂无自动备份 —— 每天首个请求触发一次快照，保留最近 ' + (r.keep_days || 7) + ' 份。';
      return;
    }
    var h = '<div class="bhead"><span>日期</span><span>大小</span><span></span></div>';
    list.forEach(function(b){
      h += '<div class="brow"><span>' + esc(b.date) + '</span><span class="muted">' + fmtBytes(b.size) + '</span>' +
        '<span><button class="ghost sm" data-act="backup-download" data-d="' + esc(b.date) + '">下载</button></span></div>';
    });
    el.innerHTML = h + '<div class="hint" style="margin-top:8px">自动备份每天首个请求触发一次，当前保留 ' + (r.keep_days || 7) + ' 份；「立即导出」生成的是当前时刻的完整快照。</div>';
  }).catch(function(e){
    el.textContent = '备份列表加载失败：' + e.message;
  });
}
function downloadWithAuth(url, filename){
  return fetch(url, { headers: apiHeaders() }).then(function(r){
    if(!r.ok){
      return r.json().catch(function(){ return {}; }).then(function(d){
        throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
      });
    }
    return r.blob();
  }).then(function(blob){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || '';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800);
  });
}
function exportBackup(btn){
  if(btn) btn.disabled = true;
  downloadWithAuth('/api/admin/backup', 'oneapi-backup-' + (S.serverToday || todayLocal()) + '.json')
    .then(function(){ toast('备份快照已下载', 'ok'); })
    .catch(function(e){ toast('导出失败：' + e.message, 'bad'); })
    .then(function(){ if(btn) btn.disabled = false; });
}
function downloadBackupDate(date, btn){
  if(btn) btn.disabled = true;
  downloadWithAuth('/api/admin/backups?date=' + encodeURIComponent(date), 'oneapi-backup-' + date + '.json')
    .then(function(){ toast('备份已下载', 'ok'); })
    .catch(function(e){ toast('下载失败：' + e.message, 'bad'); })
    .then(function(){ if(btn) btn.disabled = false; });
}
function testNotify(btn){
  var payload = {
    tg_bot_token: $('s_tg_token').value.trim(),
    tg_chat_id: $('s_tg_chat').value.trim()
  };
  if(!payload.tg_bot_token || !payload.tg_chat_id){
    toast('请先填写 Telegram Bot Token 与 Chat ID', 'bad');
    return;
  }
  btn.disabled = true; var old = btn.textContent; btn.textContent = '发送中…';
  api('/api/admin/test-notify', 'POST', payload).then(function(r){
    if(r.ok) toast('测试消息已发送，请在 Telegram 查收', 'ok');
    else toast('发送失败：' + (r.detail || '未知原因'), 'bad');
  }).catch(function(e){ toast('发送失败：' + e.message, 'bad'); })
    .then(function(){ btn.disabled = false; btn.textContent = old; });
}
function bindRestoreFile(){
  var f = $('restoreFile');
  if(!f || f.dataset.bound) return;
  f.dataset.bound = '1';
  f.addEventListener('change', function(){
    var file = this.files && this.files[0];
    this.value = '';
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      var snap;
      try { snap = JSON.parse(reader.result); }
      catch(e){ toast('文件不是合法 JSON', 'bad'); return; }
      if(!snap || snap.type !== 'oneapi-gateway-backup' || !Array.isArray(snap.channels) || !Array.isArray(snap.keys)){
        toast('不是有效的网关备份文件（需要「立即导出」生成的完整快照）', 'bad'); return;
      }
      var when = snap.created_at ? String(snap.created_at).replace('T',' ').slice(0,19) + ' UTC' : '未知时间';
      var acctTxt = Array.isArray(snap.accounts) ? '、账号（' + snap.accounts.length + ' 个，所有登录会话会失效）' : '';
      var planTxt = Array.isArray(snap.plans) ? '、套餐（' + snap.plans.length + ' 个）' : '';
      confirmDlg('确认恢复备份',
        '将用 ' + esc(when) + ' 的备份整体覆盖当前的渠道（' + snap.channels.length + ' 个）、密钥（' + snap.keys.length + ' 个）' + acctTxt + planTxt + '与设置，且不可撤销。确定继续？'
      ).then(function(ok){
        if(!ok) return;
        snap.confirm = true;
        api('/api/admin/restore', 'POST', snap).then(function(r){
          toast('已恢复 ' + r.channels + ' 个渠道 / ' + r.keys + ' 个密钥' + (r.accounts != null ? ' / ' + r.accounts + ' 个账号' : '') + (r.plans != null ? ' / ' + r.plans + ' 个套餐' : '') + '，页面即将刷新', 'ok');
          setTimeout(function(){ location.reload(); }, 1200);
        }).catch(function(e){ toast(e.message, 'bad'); });
      });
    };
    reader.readAsText(file);
  });
}

/* ---------- 渲染总入口 ---------- */
function renderAll(){
  if(!ME) return;
  if(ME.role !== 'admin'){
    renderMyKeys();
    renderPlans();
    renderAccount();
    return;
  }
  renderStats();
  renderTrend();
  renderOverview();
  renderChannels();
  renderKeys();
  renderPlans();
  renderAccounts();
  renderAccount();
  if($('t-settings') && $('t-settings').classList.contains('on')) renderSettings();
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

  if(act === 'auth-mode') showAuth(el.getAttribute('data-mode'));
  else if(act === 'auth-setup') setupAdmin();
  else if(act === 'auth-login') loginSubmit();
  else if(act === 'auth-register') registerSubmit();
  else if(act === 'auth-lookup') recoveryLookup();
  else if(act === 'auth-recover') recoveryReset();
  else if(act === 'auth-emergency') emergencyLogin();
  else if(act === 'auth-retry') bootAuth();
  else if(act === 'close-modal') closeModal();
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
    var ck = S.keys[i];
    if(ck && ck.key){ copyText(ck.key); }
    else { toast('密钥已加密存储，完整密钥仅创建当次展示；遗失请重新生成', 'bad'); }
  }
  else if(act === 'copy-text'){
    copyText(el.getAttribute('data-t'));
  }
  else if(act === 'curl-key') showCurl(i);
  else if(act === 'my-add-key') openMyKeyModal();
  else if(act === 'save-my-key') saveMyKey();
  else if(act === 'curl-my') showCurlForKey(S.mykeys[i]);
  else if(act === 'rename-my') openRenameMyKey(i);
  else if(act === 'rename-my-key') renameMyKey(i);
  else if(act === 'del-my-key') delMyKey(i);
  else if(act === 'add-account') openAccountModal(-1);
  else if(act === 'edit-account') openAccountModal(i);
  else if(act === 'save-account') saveAccount();
  else if(act === 'reset-account-pw') openResetAccountPw(i);
  else if(act === 'reset-account-pw-save') resetAccountPw(i);
  else if(act === 'del-account') delAccount(i);
  else if(act === 'add-plan') openPlanModal(-1);
  else if(act === 'edit-plan') openPlanModal(i);
  else if(act === 'save-plan') savePlan();
  else if(act === 'del-plan') delPlan(i);
  else if(act === 'request-plan') openPlanRequest(el.getAttribute('data-id'));
  else if(act === 'submit-plan-req') submitPlanRequest(el.getAttribute('data-id'));
  else if(act === 'cancel-plan-req') cancelPlanRequest(el.getAttribute('data-id'));
  else if(act === 'approve-plan-req') approvePlanRequest(el.getAttribute('data-id'));
  else if(act === 'reject-plan-req') openRejectPlanRequest(el.getAttribute('data-id'));
  else if(act === 'submit-reject-plan') rejectPlanRequest(el.getAttribute('data-id'));
  else if(act === 'change-password') changePassword();
  else if(act === 'save-security') saveSecurity();
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
  else if(act === 'backup-export') exportBackup(el);
  else if(act === 'backup-download') downloadBackupDate(el.getAttribute('data-d'), el);
  else if(act === 'test-notify') testNotify(el);
  else if(act === 'backup-restore'){ bindRestoreFile(); var rf = $('restoreFile'); if(rf) rf.click(); }
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
  } else if(act === 'my-toggle-key'){
    var jk = parseInt(el.getAttribute('data-i'), 10);
    var mk = S.mykeys[jk];
    if(!mk) return;
    api('/api/user/keys', 'POST', { action: 'toggle', id: mk.id, enabled: el.checked }).then(function(){
      mk.enabled = el.checked;
      toast(el.checked ? '密钥已启用' : '密钥已禁用', 'ok');
    }).catch(function(er){ toast(er.message, 'bad'); el.checked = !el.checked; });
  } else if(act === 'toggle-account'){
    api('/api/admin/accounts', 'POST', { action: 'update', id: el.getAttribute('data-id'), enabled: el.checked }).then(function(){
      toast(el.checked ? '账号已启用' : '账号已禁用', 'ok');
      return loadAll();
    }).catch(function(er){ toast(er.message, 'bad'); el.checked = !el.checked; });
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
if($('acctQ')) $('acctQ').addEventListener('input', renderAccounts);
['logModel','logQ'].forEach(function(id){
  $(id).addEventListener('keydown', function(e){ if(e.key === 'Enter') loadLogs(); });
});

/* ---------- 初始化 ---------- */
(function init(){
  initTheme();
  // 日志日期不在这里写死：连接成功后由 loadAll() 用服务端（按设置的时区偏移）
  // 算出的「今天」填充，避免浏览器时区与 Worker 的 UTC 时区不一致
  $('logDate').value = '';
  // 本地存储不可用就立刻说明白，别让用户以为「登录成功但一刷新就掉」
  if(!storageOk()) warnNoStorage();
  $('btnTheme').addEventListener('click', function(){
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    if(S.stats) renderTrend();
  });
  $('authBox').addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var map = { setup:'auth-setup', login:'auth-login', register:'auth-register', recover:'auth-lookup', recover2:'auth-recover', emergency:'auth-emergency' };
    var act = map[authMode];
    if(!act) return;
    var btn = $('authBox').querySelector('[data-act="' + act + '"]');
    if(btn){ e.preventDefault(); btn.click(); }
  });
  $('btnRefresh').addEventListener('click', refresh);
  bootAuth();
})();
</script>
</body>
</html>`;
