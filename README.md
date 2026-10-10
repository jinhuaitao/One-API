# OneAPI Gateway（Cloudflare Workers + R2）

One-API 风格的 AI 网关：OpenAI 兼容接口、多渠道路由与故障转移、密钥与配额管理，
全部运行在 Cloudflare Workers 上，数据存放在 R2。

**核心特性：控制台连接 GitHub 部署时，R2 会被自动创建并自动绑定，无需手动操作。**

## 功能

- OpenAI 兼容接口：`GET /v1/models`、`POST /v1/chat/completions`（支持 `stream` 流式透传）、
  `POST /v1/completions`、`POST /v1/embeddings`
- 渠道类型：`OpenAI 兼容`直接透传；`Anthropic 原生`走 Anthropic `/v1/messages` 接口，
  网关自动完成 OpenAI ↔ Anthropic 格式互转（文本、图片、tools、流式 SSE 均支持），
  调用方始终使用 OpenAI 格式
- 多渠道：按模型匹配渠道，按优先级排序，失败自动切换下一个渠道
- 多 Key 负载均衡：单个渠道的 API Key 支持用英文逗号分隔填写多个（如 `sk-a,sk-b,sk-c`），
  请求时随机轮询起点分摊负载，单个 Key 失败（401/429/5xx 等）自动尝试该渠道的下一个 Key
- 模型映射：网关侧模型名 → 渠道侧真实模型名（`model_map`）
- 密钥管理：多 Key 发放、启用/禁用、Token 配额限制、用量自动累加
- 中文管理控制台：`/admin` 侧边导航 + 概览仪表盘，可视化管理渠道、密钥、查看请求日志；
  渠道支持一键连通性测试，密钥支持配额进度条与用量清零，配置支持导入/导出备份
- 数据全在 R2：`data/channels.json`（渠道）、`data/keys.json`（密钥）、`logs/<日期>/`（请求日志）

## 自动创建 R2 的原理

Cloudflare 控制台「连接 Git」部署 Worker 的流程是：拉取代码 → 安装依赖 →
执行**构建命令** → 用 `wrangler.toml` 部署（含绑定校验）。

本项目把构建命令设为 `npm run build`，即执行 `scripts/ensure-r2.mjs`：

1. 解析 `wrangler.toml` 中所有 `[[r2_buckets]]` 的 `bucket_name`
   （也支持用 `R2_BUCKETS` 环境变量以逗号分隔追加）；
2. 对每个 bucket 先 `GET` 检查，不存在则调用
   `POST /accounts/{account_id}/r2/buckets` 创建（幂等，可重复执行）；
3. 构建完成后 wrangler 部署，`[[r2_buckets]]` 绑定自动生效。

因此你**不需要**手动建桶，也**不需要**在控制台手动添加绑定。

## 一键部署（控制台连接 GitHub）

### 1. 推送代码到 GitHub

```bash
cd oneapi-gateway
git init && git add -A && git commit -m "init"
# 在 GitHub 建好空仓库后：
git remote add origin git@github.com:<你>/<仓库>.git
git push -u origin main
```

### 2. 在 Cloudflare 控制台连接仓库

1. 进入 **Workers & Pages** → **Create** → **Connect to Git**，选择刚才的仓库；
2. 构建配置：
   - **构建命令**：`npm run build`
   - 其余保持默认（本项目是纯 JS，无需构建输出目录）；
3. **构建环境变量**（Build environment variables，构建阶段给 `ensure-r2.mjs` 用）：
   - `CLOUDFLARE_ACCOUNT_ID`：你的 Cloudflare 账户 ID
   - `CLOUDFLARE_API_TOKEN`：API Token，权限至少包含 **Account / R2 / Edit**
     （建议用最小权限的自定义 Token，不要用 Global API Key）；
4. 点 **Save and Deploy**，等待首次部署完成。

> 构建日志里看到 `[ensure-r2] "oneapi-gateway-data" 创建成功`（或"已存在"）即表示成功。
> 如果没配上面两个变量，脚本会告警并跳过——首次部署会因 bucket 不存在而失败，
> 配好变量后点 **Retry deployment** 即可。

### 3. 设置管理员密钥

部署完成后，进入该 Worker 的 **Settings → Variables and Secrets**，
添加 Secret：`ADMIN_KEY`（自己生成一串足够长的随机字符串），点 **Deploy** 使其生效。

### 4. 验证绑定

进入 **Settings → Bindings**，确认有一条 `R2` → `oneapi-gateway-data` 的绑定
（来自 `wrangler.toml`，自动添加）。

### 5. 打开管理后台

访问 `https://<你的worker>.workers.dev/admin`，输入 `ADMIN_KEY`：

1. **渠道管理** → 添加上游渠道（建议先用每行的「测试」按钮验证连通性，成功后再启用）：
   - `OpenAI 兼容`：OpenAI / DeepSeek / Moonshot 等，填 `Base URL` + 渠道 `API Key`；
   - `Anthropic 原生`：填 `https://api.anthropic.com` + `sk-ant-...` Key，
     网关自动翻译格式，需填写「默认 max_tokens」（Anthropic 接口必填，未在请求中指定时使用）；
   - **多 Key**：渠道 API Key 一栏可填多个，用英文逗号 `,` 分隔（如 `sk-a,sk-b`），
     网关会随机轮询分摊请求，某个 Key 失效时自动切换到同渠道的下一个 Key；
     「测试」按钮会逐个 Key 发起探测并分别展示结果；
   - **注意**：Base URL 末尾不要加 `/v1`，网关会自动拼接路径；
2. **密钥管理** → 生成网关密钥，分发给调用方；
3. 调用示例：

```bash
curl https://<你的worker>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <网关密钥>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"你好"}]}'
```

## 本地开发

```bash
npm install
# 先手动建桶（本地没有构建脚本代劳）：
npx wrangler r2 bucket create oneapi-gateway-data
# .dev.vars 中写入 ADMIN_KEY=xxx
npx wrangler dev
```

手动部署（等价于控制台自动流程）：

```bash
npm run deploy   # 先 ensure-r2 再 wrangler deploy
```

## 接口说明

| 接口 | 说明 |
|---|---|
| `GET /` | 网关状态 |
| `GET /admin` | 中文管理后台（页面本身公开，数据接口需 `ADMIN_KEY`） |
| `GET /v1/models` | 按已启用渠道聚合的模型列表（需网关密钥） |
| `POST /v1/chat/completions` | 聊天补全，支持 `stream: true`（需网关密钥） |
| `POST /v1/completions` | 补全（需网关密钥） |
| `POST /v1/embeddings` | 向量（需网关密钥） |
| `GET/POST /api/admin/channels` | 渠道增删改查（需 `X-Admin-Key`） |
| `GET/POST /api/admin/keys` | 密钥增删改查（需 `X-Admin-Key`） |
| `GET /api/admin/logs?date=YYYY-MM-DD` | 按天列出请求日志（需 `X-Admin-Key`） |

## 常见问题

- **构建日志提示缺少 `CLOUDFLARE_ACCOUNT_ID`**：按上文第 2 步第 3 点补上构建环境变量后重新部署。
- **想换 bucket 名字**：改 `wrangler.toml` 里的 `bucket_name` 即可，下次构建会自动创建新桶并绑定。
- **流式请求的 token 用量**：网关会在转发流式请求时带上 `stream_options: {include_usage: true}`，
  并解析上游在流末尾返回的 `usage`，因此流式请求也能精确统计（OpenAI 兼容渠道要求上游支持该参数，
  不支持时网关会自动降级为普通流式，此时该次用量记为 0；Anthropic 渠道直接从原生事件中提取用量）。
  日志中 `usage_missing: true` 表示该次流式请求未能拿到用量。
- **Anthropic 渠道注意事项**：
  - 仅支持 `POST /v1/chat/completions`（`completions` / `embeddings` 不会路由到 Anthropic 渠道）；
  - `max_tokens` 必需：优先用请求中的 `max_tokens`，否则用渠道的「默认 max_tokens」（默认 4096）；
  - `temperature` 会被钳制到 0~1（Anthropic 上限）；
  - `system` / `developer` 消息会自动合并为 Anthropic 的 `system`；
  - 连续的同角色消息会自动合并（Anthropic 要求角色交替），多条 `tool` 结果消息会合并为一条。
- **`/v1/models` 返回 `*`**：渠道模型填 `*` 表示支持全部模型，此时模型列表不会展开它，请填写具体模型名以便列表展示。
