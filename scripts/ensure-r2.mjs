#!/usr/bin/env node
/**
 * scripts/ensure-r2.mjs
 *
 * 在 Cloudflare 构建阶段自动创建 R2 bucket（幂等操作，可重复执行）。
 *
 * 工作原理：
 *  1. 解析仓库根目录的 wrangler.toml / wrangler.jsonc / wrangler.json，
 *     找出所有 [[r2_buckets]] 的 bucket_name（也支持用 R2_BUCKETS 环境变量
 *     以逗号分隔额外指定）。
 *  2. 对每个 bucket 先 GET 检查是否存在，不存在则调用
 *     POST /accounts/{account_id}/r2/buckets 创建。
 *
 * 在 Cloudflare 控制台「连接 GitHub 部署」时，把构建命令设为 `npm run build`
 * （本脚本），它会在 wrangler 部署校验绑定之前把 bucket 建好，
 * wrangler.toml 里的 [[r2_buckets]] 绑定随即自动生效，无需手动建桶、
 * 无需手动绑定。
 *
 * 需要的构建环境变量（Cloudflare 控制台 → 该 Worker → Settings → Build）：
 *   CLOUDFLARE_ACCOUNT_ID  - Cloudflare 账户 ID
 *   CLOUDFLARE_API_TOKEN   - API Token，权限至少包含「Account / R2 / Edit」
 *
 * 如果变量缺失，脚本只告警不报错（例如 bucket 已存在时的重复构建也能通过）。
 */

import { existsSync, readFileSync } from 'node:fs';

const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '';
const apiToken =
  process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const API = 'https://api.cloudflare.com/client/v4';

/** 从 wrangler 配置中提取所有 r2 bucket 名称 */
function bucketsFromWrangler() {
  const names = new Set();
  for (const f of ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    // TOML: bucket_name = "xxx"
    for (const m of text.matchAll(/bucket_name\s*=\s*"([^"]+)"/g)) names.add(m[1]);
    // JSON: "bucket_name": "xxx"
    for (const m of text.matchAll(/"bucket_name"\s*:\s*"([^"]+)"/g)) names.add(m[1]);
  }
  const extra = process.env.R2_BUCKETS || process.env.R2_BUCKET_NAMES || '';
  for (const n of extra.split(',')) {
    const t = n.trim();
    if (t) names.add(t);
  }
  return [...names];
}

async function cf(path, method, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** 确保单个 bucket 存在，返回是否成功 */
async function ensureBucket(name) {
  // 1) 先查是否已存在
  try {
    const check = await cf(
      `/accounts/${accountId}/r2/buckets/${encodeURIComponent(name)}`,
      'GET'
    );
    if (check.res.ok) {
      console.log(`[ensure-r2] "${name}" 已存在，跳过创建`);
      return true;
    }
  } catch (e) {
    console.warn(`[ensure-r2] 检查 "${name}" 时网络异常，将尝试创建: ${e.message}`);
  }

  // 2) 不存在则创建（POST /accounts/{id}/r2/buckets, body: {name}）
  try {
    const created = await cf(`/accounts/${accountId}/r2/buckets`, 'POST', {
      name,
    });
    if (created.res.ok && created.data.success !== false) {
      console.log(`[ensure-r2] "${name}" 创建成功`);
      return true;
    }
    const msg =
      (created.data.errors || [])
        .map((e) => `${e.code}:${e.message}`)
        .join('; ') || `HTTP ${created.res.status}`;
    // 并发/竞态下可能已被创建，视为成功
    if (/already exists|10069/i.test(msg) || created.res.status === 409) {
      console.log(`[ensure-r2] "${name}" 已存在，跳过创建`);
      return true;
    }
    console.error(`[ensure-r2] 创建 "${name}" 失败: ${msg}`);
    return false;
  } catch (e) {
    console.error(`[ensure-r2] 创建 "${name}" 时网络异常: ${e.message}`);
    return false;
  }
}

async function main() {
  const buckets = bucketsFromWrangler();
  if (buckets.length === 0) {
    console.log('[ensure-r2] 未在 wrangler 配置中找到 r2 bucket，跳过');
    return;
  }
  console.log(`[ensure-r2] 需要确保的 bucket: ${buckets.join(', ')}`);

  if (!accountId || !apiToken) {
    console.warn(
      '[ensure-r2] 缺少 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN，跳过自动创建。\n' +
        '[ensure-r2] 请在 Cloudflare 控制台该 Worker 的构建环境变量中配置这两项，\n' +
        '[ensure-r2] 否则首次部署会因 bucket 不存在而失败（之后可手动建桶）。'
    );
    return;
  }

  let failed = 0;
  for (const name of buckets) {
    if (!(await ensureBucket(name))) failed++;
  }
  if (failed > 0) {
    console.error(
      `[ensure-r2] 有 ${failed} 个 bucket 未能确保存在，部署可能因绑定缺失而失败`
    );
    process.exit(1);
  }
  console.log('[ensure-r2] 全部 bucket 就绪');
}

main();
