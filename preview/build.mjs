#!/usr/bin/env node
/**
 * preview/build.mjs
 *
 * 生成「控制台静态预览」：把 src/admin-ui.js 导出的 ADMIN_HTML 套上一层
 * 模拟数据（拦截 /api/admin/* 的 fetch），产出一个可直接用浏览器打开的
 * 单文件页面 preview/admin-preview.html。
 *
 * 用途：不部署、不连真实网关，也能查看管理后台的完整界面与交互。
 * 运行：npm run preview
 *
 * 说明：预览页里的数据全部是本地模拟的，任何「保存 / 删除 / 测试」操作都只
 * 返回成功占位结果，不会写入任何地方。
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_HTML } from '../src/admin-ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const now = Date.now();
const day = (i) => new Date(now - i * 86400000).toISOString().slice(0, 10);

/* ---------------- 模拟数据 ---------------- */

const channels = [
  { id: 'c-openai', name: 'OpenAI 官方', type: 'openai', base_url: 'https://api.openai.com', api_key: 'sk-a1,sk-a2,sk-a3', models: ['gpt-4o', 'gpt-4o-mini', 'text-embedding-3-small'], model_map: { 'gpt-4o': 'gpt-4o-2024-11-20' }, headers: {}, priority: 100, weight: 3, enabled: true, health: { ok: true, ms: 412, checked_at: new Date(now - 120000).toISOString() } },
  { id: 'c-deepseek', name: 'DeepSeek', type: 'openai', base_url: 'https://api.deepseek.com', api_key: 'sk-ds-1', models: ['deepseek-chat', 'deepseek-reasoner'], model_map: {}, headers: {}, priority: 100, weight: 1, enabled: true, health: { ok: true, ms: 288, checked_at: new Date(now - 300000).toISOString() } },
  { id: 'c-claude', name: 'Anthropic 官方', type: 'anthropic', base_url: 'https://api.anthropic.com', api_key: 'sk-ant-1', models: ['claude-sonnet-4-5', 'claude-haiku-4-5'], model_map: {}, headers: {}, default_max_tokens: 4096, priority: 120, weight: 1, enabled: true, health: { ok: false, ms: 0, message: 'HTTP 401 invalid x-api-key', checked_at: new Date(now - 600000).toISOString() } },
  { id: 'c-moonshot', name: 'Moonshot（备用）', type: 'openai', base_url: 'https://api.moonshot.cn', api_key: '', models: ['moonshot-v1-8k'], model_map: {}, headers: {}, priority: 200, weight: 1, enabled: false },
];

const keys = [
  { key: 'sk-9f3c1a7b42d84e0f8a6c5b3d2e1f0a9c8b7d6e5f4a3b2c1d', name: '生产环境 · 后端', enabled: true, quota_tokens: 5000000, used_tokens: 1284300, requests: 8421, used_cost: 38.42, allowed_models: [], note: '主力密钥', created_at: new Date(now - 30 * 86400000).toISOString(), last_used_at: new Date(now - 45000).toISOString(), expires_at: '' },
  { key: 'sk-2b8e4d6a1c9f3e7b5d0a8c2f4e6b1d3a9c7f5e2b8d4a6c0f', name: '前端应用', enabled: true, quota_tokens: 1000000, used_tokens: 962400, requests: 3120, used_cost: 12.08, allowed_models: ['gpt-4o-mini', 'deepseek-chat'], note: '仅允许轻量模型', created_at: new Date(now - 12 * 86400000).toISOString(), last_used_at: new Date(now - 3600000).toISOString(), expires_at: new Date(now + 20 * 86400000).toISOString() },
  { key: 'sk-7a1d9c3f5b8e2d4a6c0f9b7e5d3a1c8f6b4e2d0a9c7f5b3e', name: '测试沙箱', enabled: true, quota_tokens: 200000, used_tokens: 200000, requests: 640, used_cost: 2.31, allowed_models: [], note: '配额已用尽', created_at: new Date(now - 60 * 86400000).toISOString(), last_used_at: new Date(now - 2 * 86400000).toISOString(), expires_at: '' },
  { key: 'sk-4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c', name: '已停用 · 旧客户端', enabled: false, quota_tokens: 0, used_tokens: 120450, requests: 980, used_cost: 4.55, allowed_models: [], created_at: new Date(now - 90 * 86400000).toISOString(), last_used_at: new Date(now - 15 * 86400000).toISOString(), expires_at: new Date(now - 3 * 86400000).toISOString() },
];

const settings = {
  allow_admin_key_as_api_key: true,
  request_timeout_ms: 60000,
  retries: 1,
  log_retention_days: 30,
  timezone_offset_minutes: 480,
  custom_models: ['my-alias'],
  default_pricing: { in: 0.15, out: 0.6 },
  pricing: {
    'gpt-4o': { in: 2.5, out: 10 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'deepseek-chat': { in: 0.14, out: 0.28 },
    'claude-sonnet-4-5': { in: 3, out: 15 },
  },
};

function buildStats(days) {
  const out = { days: [], totals: { requests: 0, ok: 0, failed: 0, tokens: 0, cost: 0, streams: 0, latency_sum: 0, latency_n: 0 }, models: {}, channels: {}, keys: {} };
  for (let i = days - 1; i >= 0; i--) {
    const req = Math.max(60, 420 + Math.round(Math.sin(i * 1.3) * 160 + (days - i) * 22));
    const failed = Math.round(req * (i === 3 ? 0.11 : 0.012));
    const tokens = req * (820 + Math.round(Math.cos(i) * 180));
    const cost = (tokens / 1e6) * 1.35;
    const avg = 380 + Math.round(Math.sin(i * 0.9) * 90);
    out.days.push({ date: day(i), requests: req, ok: req - failed, failed, tokens, cost: Math.round(cost * 100) / 100, streams: Math.round(req * 0.62), avg_ms: avg, hours: {} });
    out.totals.requests += req;
    out.totals.ok += req - failed;
    out.totals.failed += failed;
    out.totals.tokens += tokens;
    out.totals.cost += cost;
    out.totals.streams += Math.round(req * 0.62);
    out.totals.latency_sum += avg * req;
    out.totals.latency_n += req;
  }
  out.totals.cost = Math.round(out.totals.cost * 100) / 100;
  out.totals.avg_ms = Math.round(out.totals.latency_sum / out.totals.latency_n);
  out.totals.success_rate = Math.round((out.totals.ok / out.totals.requests) * 1000) / 10;
  const mk = (name, share) => ({
    name,
    requests: Math.round(out.totals.requests * share),
    ok: Math.round(out.totals.requests * share * 0.99),
    failed: Math.round(out.totals.requests * share * 0.01),
    tokens: Math.round(out.totals.tokens * share),
    cost: Math.round(out.totals.cost * share * 100) / 100,
  });
  out.models = [mk('gpt-4o-mini', 0.34), mk('deepseek-chat', 0.27), mk('gpt-4o', 0.18), mk('claude-sonnet-4-5', 0.13), mk('deepseek-reasoner', 0.08)];
  out.channels = [mk('OpenAI 官方', 0.52), mk('DeepSeek', 0.35), mk('Anthropic 官方', 0.13)];
  out.keys = [mk('生产环境 · 后端', 0.58), mk('前端应用', 0.28), mk('测试沙箱', 0.09), mk('admin', 0.05)];
  return out;
}

const modelNames = ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'claude-sonnet-4-5', 'deepseek-reasoner'];
const channelNames = ['OpenAI 官方', 'DeepSeek', 'Anthropic 官方'];

const logs = [];
for (let i = 0; i < 14; i++) {
  const okFlag = i !== 4;
  logs.push({
    key: 'logs/' + day(0) + '/' + String(9999999999999 - (now - i * 47000)).padStart(13, '0') + '-ab12cd.json',
    ts: new Date(now - i * 47000).toISOString(),
    request_id: 'req_' + (i + 1).toString(36) + 'x9f2k1',
    key_name: i % 3 === 0 ? '生产环境 · 后端' : i % 3 === 1 ? '前端应用' : 'admin',
    is_admin: i % 3 === 2,
    model: modelNames[i % modelNames.length],
    channel: okFlag ? channelNames[i % channelNames.length] : 'Anthropic 官方',
    ok: okFlag,
    tokens: okFlag ? 640 + i * 37 : 0,
    cost: okFlag ? Math.round(((640 + i * 37) / 1e6) * 1.35 * 10000) / 10000 : 0,
    ms: okFlag ? 320 + i * 41 : 180,
    stream: i % 2 === 0,
    retries: okFlag && i === 6 ? 1 : 0,
    error: okFlag ? '' : 'HTTP 401 invalid x-api-key',
  });
}

const mock = { channels, keys, settings, stats: buildStats(14), logs, dates: [day(0), day(1), day(2)] };

/* ---------------- 注入预览脚本 ---------------- */

const injected = `<script>
/* ===== 预览模式：拦截 /api/admin/*，返回本地模拟数据；不连接真实网关 ===== */
(function () {
  var M = ${JSON.stringify(mock)};
  var realFetch = window.fetch.bind(window);
  function jsonResponse(body) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  window.fetch = function (url, opt) {
    var u = String(url);
    if (u.indexOf('/api/admin/') !== 0) return realFetch(url, opt);
    var body = null;
    if (u.indexOf('/api/admin/channels') === 0) body = M.channels;
    else if (u.indexOf('/api/admin/keys') === 0) body = M.keys;
    else if (u.indexOf('/api/admin/settings') === 0) body = M.settings;
    else if (u.indexOf('/api/admin/stats') === 0) {
      var m = u.match(/days=(\\d+)/);
      var d = m ? parseInt(m[1], 10) : 14;
      var cut = M.stats.days.slice(-d);
      var tot = { requests: 0, ok: 0, failed: 0, tokens: 0, cost: 0, streams: 0, avg_ms: 0, success_rate: 0 };
      var lsum = 0;
      cut.forEach(function (x) {
        tot.requests += x.requests; tot.ok += x.ok; tot.failed += x.failed;
        tot.tokens += x.tokens; tot.cost += x.cost; tot.streams += x.streams;
        lsum += x.avg_ms * x.requests;
      });
      tot.cost = Math.round(tot.cost * 100) / 100;
      tot.avg_ms = tot.requests ? Math.round(lsum / tot.requests) : 0;
      tot.success_rate = tot.requests ? Math.round((tot.ok / tot.requests) * 1000) / 10 : 0;
      body = { days: cut, totals: tot, models: M.stats.models, channels: M.stats.channels, keys: M.stats.keys };
    }
    else if (u.indexOf('/api/admin/logs/dates') === 0) body = { dates: M.dates, today: M.dates[0] };
    else if (u.indexOf('/api/admin/logs/clear') === 0) body = { ok: true, scope: 'day', date: M.dates[0], removed_logs: M.logs.length };
    else if (u.indexOf('/api/admin/logs/summary') === 0) body = { date: M.dates[0], logs: M.logs, cursor: null, scanned: M.logs.length };
    else if (u.indexOf('/api/admin/log') === 0) body = M.logs[0];
    else if (u.indexOf('/api/admin/test-channel') === 0) body = {
      ok: true,
      keys: [
        { index: 1, ok: true, ms: 361, http_status: 200, snippet: 'pong' },
        { index: 2, ok: true, ms: 402, http_status: 200, snippet: 'pong' },
        { index: 3, ok: false, ms: 288, http_status: 401, error: 'invalid api key' }
      ]
    };
    else if (u.indexOf('/api/admin/test-all') === 0) body = {
      ok: true,
      results: M.channels.map(function (c) {
        return { id: c.id, name: c.name, ok: !!(c.health && c.health.ok), keys: [{ index: 1, ok: !!(c.health && c.health.ok), ms: (c.health && c.health.ms) || 300 }] };
      })
    };
    else if (u.indexOf('/api/admin/test-route') === 0) body = {
      ok: true,
      model: 'gpt-4o-mini',
      candidates: M.channels.filter(function (c) { return c.enabled; }).map(function (c) { return { id: c.id, name: c.name, priority: c.priority, weight: c.weight }; }),
      attempts: [{ channel: 'OpenAI 官方', ok: true, http_status: 200 }],
      answer: 'pong',
      ms: 356
    };
    else body = { ok: true };
    return jsonResponse(body);
  };

  /* 预览页不需要入场动画（便于截图与静态查看） */
  var st = document.createElement('style');
  st.textContent = '.tab.on{animation:none!important}';
  document.head.appendChild(st);

  try { window.localStorage.setItem('og_admin_key', 'preview-mode'); } catch (e) {}

  document.addEventListener('DOMContentLoaded', function () {
    var h2 = document.querySelector('.topbar h2');
    if (h2) h2.insertAdjacentHTML('afterend', '<span class="badge warn" style="margin-left:8px">预览模式 · 模拟数据</span>');
  });

  /* 支持 #channels / #keys / #logs / #settings 直达对应页签 */
  setTimeout(function () {
    var h = (location.hash || '').replace('#', '');
    if (h && window.gotoTab) window.gotoTab(h);
  }, 700);
})();
</` + `script>`;

const marker = '<div id="toasts"></div>';
const html = ADMIN_HTML.replace(marker, marker + '\n' + injected);
const outPath = resolve(here, 'admin-preview.html');
writeFileSync(outPath, html, 'utf8');
console.log('[preview] 已生成 ' + outPath + '（' + html.length + ' 字节）');
