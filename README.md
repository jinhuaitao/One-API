# OneAPI Gateway（Cloudflare Workers + R2）

One-API 风格的 AI 网关：OpenAI 兼容接口、多渠道路由与故障转移、密钥与配额管理，
全部运行在 Cloudflare Workers 上，数据存放在 R2。

**核心特性：控制台连接 GitHub 部署时，R2 会被自动创建并自动绑定，无需手动操作。**

## 功能

### 对外接口（OpenAI 兼容）
- `GET /v1/models`：按已启用渠道聚合模型列表，并受密钥「允许模型」限制
- `POST /v1/chat/completions`：聊天补全，支持 `stream` 流式透传
- `POST /v1/completions`、`POST /v1/embeddings`
- `GET /healthz`：健康检查；`GET /`：网关状态

### 渠道
- 类型：`OpenAI 兼容`直接透传；`Anthropic 原生`走 Anthropic `/v1/messages`，
  网关自动完成 OpenAI ↔ Anthropic 格式互转（文本、图片、tools、流式 SSE 均支持），
  调用方始终使用 OpenAI 格式
- **优先级 + 权重**：先按 `priority`（越小越优先）分组，同组内按 `weight` 加权随机，
  便于灰度发布与按比例分摊流量
- **多 Key 负载均衡**：单个渠道的 API Key 支持英文逗号分隔填写多个（如 `sk-a,sk-b,sk-c`），
  请求时随机轮询起点分摊负载，单个 Key 失败（401/429/5xx 等）自动尝试下一个 Key
- **超时与重试**：可配置请求超时（默认 60s，作用于首字节）与瞬时错误重试
  （429 / 5xx / 网络异常，默认重试 1 次），单渠道可单独覆盖超时
- **模型映射**：网关侧模型名 → 渠道侧真实模型名（`model_map`）。
  渠道的「对外暴露的模型名」是**调用方请求时使用的名字**，也决定该渠道能被哪些模型名匹配到；
  `model_map` 只负责把这些名字翻译成上游真实模型名，两者相同时无需配置
- **模型回显**：响应体（含流式 SSE 的每个 chunk）中的 `model` 会被统一改写为调用方请求的网关模型名，
  调用方不会看到渠道内部的真实模型名
- **附加请求头**：可为渠道配置额外 Header 一并发送给上游
- **连通性巡检**：单渠道测试（逐个 Key 展示结果）、全部渠道批量测试，结果写入渠道健康状态

### 密钥
- 多 Key 发放、启用/禁用、Token 配额限制、**有效期**、**允许调用的模型白名单**、备注
- 用量自动累加：Tokens、请求数、**预估费用**、最近使用时间
- 一键复制、清零用量、生成 cURL / fetch 调用示例

### 控制台
- 中文管理后台 `/admin`：侧边导航 + 概览仪表盘，明暗主题一键切换
- 概览：请求/成功率/Tokens/费用/延迟指标卡、用量趋势折线图（7/14/30 天可切换）、
  渠道状态、Top 模型 / Top 密钥
- 渠道、密钥、日志均支持搜索、筛选；日志支持按天翻页、关键字搜索、导出 CSV
- 设置页：超时、重试、日志保留期、定价表（按模型/默认）、自定义模型、日志清理
- 配置导入 / 导出（渠道 + 密钥 + 设置）

### 数据（全部在 R2）
- `data/channels.json` 渠道 · `data/keys.json` 密钥 · `data/settings.json` 设置
- `data/stats/<日期>.json` 按天聚合统计（请求 / Tokens / 费用 / 分模型分渠道分密钥）
- `logs/<日期>/<倒序时间戳>.json` 请求日志（key 倒序，列表天然按时间从新到旧）

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
2. **密钥管理** → 生成网关密钥，可设置配额、有效期与允许调用的模型，分发给调用方；
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

### 测试与预览

```bash
npm test         # 冒烟测试：内存版 R2 + 模拟上游，覆盖 53 项断言，无需任何依赖
npm run preview  # 生成 preview/admin-preview.html（带模拟数据的控制台静态预览）
```

- `npm test` 会端到端跑通鉴权、模型路由、OpenAI/Anthropic 转发、流式 SSE、
  故障转移与重试、密钥限制（配额/过期/停用/模型白名单）、统计与日志、
  渠道测试、设置校验、日志清理等链路。
- `npm run preview` 生成的是**纯静态预览页**，数据全部本地模拟，
  不会连接真实网关，也不会写入任何地方；用浏览器直接打开即可查看完整界面。

## 接口说明

| 接口 | 说明 |
|---|---|
| `GET /` | 网关状态 |
| `GET /healthz` | 健康检查 |
| `GET /admin` | 中文管理后台（页面本身公开，数据接口需 `ADMIN_KEY`） |
| `GET /v1/models` | 按已启用渠道聚合的模型列表（需网关密钥） |
| `POST /v1/chat/completions` | 聊天补全，支持 `stream: true`（需网关密钥） |
| `POST /v1/completions` | 补全（需网关密钥） |
| `POST /v1/embeddings` | 向量（需网关密钥） |
| `GET/POST /api/admin/channels` | 渠道查询 / 覆盖保存 |
| `GET/POST /api/admin/keys` | 密钥查询 / 覆盖保存 |
| `GET/POST /api/admin/settings` | 网关设置查询 / 保存 |
| `GET /api/admin/stats?days=N` | 近 N 天聚合统计（含分模型/渠道/密钥明细） |
| `GET /api/admin/logs/dates` | 有日志的日期列表 |
| `GET /api/admin/logs/summary?date=&limit=&cursor=&ok=&stream=&model=&q=` | 日志分页查询（支持筛选） |
| `GET /api/admin/log?key=` | 单条日志完整内容 |
| `POST /api/admin/logs/cleanup` | 清理超过保留期的日志与统计 |
| `POST /api/admin/logs/clear` | 清空日志：`{scope:"day", date:"YYYY-MM-DD"}` 清空某天，`{scope:"all"}` 清空全部 |
| `POST /api/admin/test-channel` | 测试单个渠道（逐个 Key） |
| `POST /api/admin/test-all` | 批量测试所有已启用渠道 |
| `POST /api/admin/test-route` | 按模型查看路由候选顺序并实际调用一次 |

所有管理接口需请求头 `X-Admin-Key`。

## 网关设置项

在「网关设置」页调整（保存在 `data/settings.json`）：

| 设置 | 默认 | 说明 |
|---|---|---|
| `allow_admin_key_as_api_key` | `true` | 是否允许用 `ADMIN_KEY` 直接调用 `/v1/*`（生产建议关闭） |
| `request_timeout_ms` | `60000` | 上游请求超时（首字节），1000 ~ 600000 |
| `retries` | `1` | 瞬时错误（429/5xx/网络异常）在同一 Key 上的额外重试次数，0 ~ 5 |
| `log_retention_days` | `30` | 日志保留天数，供「清理过期日志」使用 |
| `timezone_offset_minutes` | `480` | 统计与日志按哪个「当地日期」归档。480 = UTC+8。**若控制台查不到刚产生的日志，多半是这里与本地时区不一致** |
| `custom_models` | `[]` | 额外对外暴露的模型名（仅影响 `/v1/models` 展示，不参与路由） |
| `default_pricing` | `{in:0,out:0}` | 默认定价（美元 / 每 100 万 Tokens） |
| `pricing` | `{}` | 按模型定价，用于估算费用，不影响转发 |

## 常见问题

- **响应里的 `model` 是什么**：网关会把响应体与流式 SSE 中每个 chunk 的 `model` 统一改写为
  **调用方请求的网关模型名**。例如渠道配置了 `DeepSeek-V4-Flash → deepseek-v4-flash-0731`，
  你用 `model: "DeepSeek-V4-Flash"` 调用，响应里看到的仍是 `DeepSeek-V4-Flash`，
  只有真正发给上游的请求才会被翻译成 `deepseek-v4-flash-0731`。
- **为什么我填了映射，调用却提示 `no_channel`**：映射左侧的名称必须同时出现在该渠道的
  「对外暴露的模型名」中，否则网关匹配不到渠道。渠道编辑弹窗会在映射名称缺失时给出提示，
  可点「补全到模型列表」一键补齐。
- **构建日志提示缺少 `CLOUDFLARE_ACCOUNT_ID`**：按上文第 2 步第 3 点补上构建环境变量后重新部署。
- **想换 bucket 名字**：改 `wrangler.toml` 里的 `bucket_name` 即可，下次构建会自动创建新桶并绑定。
- **流式请求的 token 用量**：网关会在转发流式请求时带上 `stream_options: {include_usage: true}`，
  并解析上游在流末尾返回的 `usage`，因此流式请求也能精确统计（OpenAI 兼容渠道要求上游支持该参数，
  不支持时网关会自动降级为普通流式，此时该次用量记为 0；Anthropic 渠道直接从原生事件中提取用量）。
  日志中 `usage_missing: true` 表示该次流式请求未能拿到用量。
- **费用为什么是估算值**：费用 = 输入 Tokens ÷ 100 万 × 输入价 + 输出 Tokens ÷ 100 万 × 输出价，
  价格来自「网关设置 → 模型定价」，仅用于展示与预算参考，不参与计费。
- **统计数字偶尔偏小**：按天统计采用「读-改-写」累加，高并发下可能丢失少量计数，
  用于仪表盘展示足够；精确对账请以请求日志为准。
- **日志列表为什么天然按时间倒序**：日志对象名使用「倒序时间戳」，R2 按 key 升序返回即最新在前，
  因此翻页游标天然指向更早的一页。
- **Anthropic 渠道注意事项**：
  - 仅支持 `POST /v1/chat/completions`（`completions` / `embeddings` 不会路由到 Anthropic 渠道）；
  - `max_tokens` 必需：优先用请求中的 `max_tokens`，否则用渠道的「默认 max_tokens」（默认 4096）；
  - `temperature` 会被钳制到 0~1（Anthropic 上限）；
  - `system` / `developer` 消息会自动合并为 Anthropic 的 `system`；
  - 连续的同角色消息会自动合并（Anthropic 要求角色交替），多条 `tool` 结果消息会合并为一条。
- **`/v1/models` 返回 `*`**：渠道模型填 `*` 表示支持全部模型，此时模型列表不会展开它，
  请填写具体模型名以便列表展示。
