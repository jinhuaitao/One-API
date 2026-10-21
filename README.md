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

### 流式（SSE）健壮性
- **收尾守卫**：上游中途断开时，网关不会让调用方看到「连接被重置」，
  而是补一个 error 事件 + `data: [DONE]` 后正常收尾，调用方能拿到明确的结束
- **静默超时**：流式响应单独有「读超时」（`stream_idle_timeout_ms`，默认 60s）。
  `request_timeout_ms` 只作用于首字节，管不了流中途卡死；超过静默超时网关会主动断开上游并收尾
- **下游保活**：网关超过 `stream_keepalive_ms`（默认 15s）没向调用方下发任何字节时，
  主动补一条 SSE 注释（`: ka`，标准客户端会忽略）。与静默超时互补：一个管「上游→网关」，
  一个管「网关→调用方」——模型长思考、上游排队期间的「零字节窗口」不再被中间的
  nginx / CDN / 客户端读超时掐断，OpenAI 兼容渠道同样生效
- **补发 `[DONE]`**：部分兼容上游不发送结束标记，由网关补上，避免调用方一直等不到流结束
- **ping 保活**：Anthropic 渠道的 `event: ping` 心跳会转发为 SSE 注释，
  避免模型长时间思考时链路零字节被中间的 nginx / CDN / 客户端读超时掐断
- **结束原因可观测**：日志记录 `finish` = `complete` / `client_abort` / `upstream_error` / `timeout`，
  日志页可按「仅异常结束」筛选，用来定位断流
- **CPU 友好**：SSE 逐块改写走字符串快路径，只对含 `model` / `usage` 的块做 JSON 解析，
  避免长回答累积 CPU 时间触发 Workers 的 CPU 时限（免费版 10ms）

### 密钥
- 多 Key 发放、启用/禁用、Token 配额限制、**有效期**、**允许调用的模型白名单**、备注
- 用量自动累加：Tokens、请求数、**预估费用**、最近使用时间
- 一键复制、清零用量、生成 cURL / fetch 调用示例

### 账号与权限
- **首次打开 `/admin` 初始化管理员**：设置用户名、密码和安全问题，之后用账号密码登录，
  不再需要每次输入 `ADMIN_KEY`
- 角色分离：`admin` 管理渠道 / 全部密钥 / 日志 / 设置 / 账号；普通用户登录后只能
  创建和管理**自己名下**的网关密钥，并查看自己的用量，最多 20 个
- **注册开关**：默认关闭，管理员可在「账号与安全」设置中开启，新用户注册后自动登录
- **问答找回密码**：注册与初始化时强制设置安全问题；开启找回后，用户在登录页输入用户名、
  回答安全问题即可直接设置新密码，旧会话立即失效。答案忽略大小写与空格
- 账号级配额：可给每个账号设置 Token 上限，按名下所有密钥的用量合计判断
- 管理员可创建 / 禁用 / 重置密码 / 删除账号；删除账号会级联删除其密钥并吊销会话，
  且始终保留至少一个启用的管理员，防止把自己锁在后台外
- 凭据只存哈希：密码与安全答案用 PBKDF2-SHA256 + 随机盐存储，
  会话只存 token 的 SHA-256；`ADMIN_KEY` 仅作为忘记密码时的应急凭据保留

### 控制台
- 中文管理后台 `/admin`：账号登录 + 侧边导航，按角色显示可用页面，明暗主题一键切换
- 概览：请求/成功率/Tokens/费用/延迟指标卡、用量趋势折线图（7/14/30 天可切换）、
  渠道状态、Top 模型 / Top 密钥
- 渠道、密钥、日志、账号均支持搜索、筛选；日志支持按天翻页、关键字搜索、导出 CSV
- 普通用户专属「我的密钥」：自助创建、改名、启停、删除、查看用量与调用示例
- 设置页：超时、重试、日志保留期、定价表、注册/找回开关、默认用户配额、日志清理
- 配置导入 / 导出（渠道 + 密钥 + 设置）；备份导出 / 恢复（含账号，恢复后清空会话）

### 数据（全部在 R2）
- `data/channels.json` 渠道 · `data/keys.json` 密钥 · `data/settings.json` 设置
- `data/accounts.json` 账号（密码/安全答案均为哈希） · `data/sessions.json` 会话（仅 token 哈希）
- `data/stats/<日期>.json` 按天聚合统计（请求 / Tokens / 费用 / 流式 / 流式异常结束 / 分模型分渠道分密钥）
- `logs/<日期>/<倒序时间戳>.json` 请求日志（key 倒序，列表天然按时间从新到旧）；
  流式请求额外记录 `finish`（`complete` / `client_abort` / `upstream_error` / `timeout`）
- `backup/<日期>.json` 每日自动备份（含渠道、密钥、设置、账号）

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

### 3.（可选）设置应急管理员密钥

账号体系启用后，日常登录使用用户名 + 密码，**不再需要 `ADMIN_KEY`**。
仍建议在 Worker 的 **Settings → Variables and Secrets** 添加 Secret：`ADMIN_KEY`
（一串足够长的随机字符串），用于忘记管理员密码 / 账号被锁时的应急自救：
请求管理接口时带 `X-Admin-Key` 即可绕过账号体系。没有这个 Secret 也不影响首次初始化。

### 4. 验证绑定

进入 **Settings → Bindings**，确认有一条 `R2` → `oneapi-gateway-data` 的绑定
（来自 `wrangler.toml`，自动添加）。

### 5. 打开管理后台并初始化管理员

访问 `https://<你的worker>.workers.dev/admin`。首次打开会显示「初始化管理员」：

1. 设置管理员用户名（2~24 位中英文、数字、下划线或短横线）、密码（至少 8 位）
   和安全问题 / 答案。**安全问题用于之后自助找回密码，请务必记住**；
2. 提交后自动登录进入控制台，之后即可用账号密码登录；
3. 如需开放注册，进入「设置 → 账号与安全」打开「允许自助注册」，并可设置默认用户配额；
4. 普通用户注册后登录，只能看到「我的密钥 / 我的账号」，自助创建网关密钥；
5. **渠道管理** → 添加上游渠道（建议先用每行的「测试」按钮验证连通性，成功后再启用）：
   - `OpenAI 兼容`：OpenAI / DeepSeek / Moonshot 等，填 `Base URL` + 渠道 `API Key`；
   - `Anthropic 原生`：填 `https://api.anthropic.com` + `sk-ant-...` Key，
     网关自动翻译格式，需填写「默认 max_tokens」（Anthropic 接口必填，未在请求中指定时使用）；
   - **多 Key**：渠道 API Key 一栏可填多个，用英文逗号 `,` 分隔（如 `sk-a,sk-b`），
     网关会随机轮询分摊请求，某个 Key 失效时自动切换到同渠道的下一个 Key；
     「测试」按钮会逐个 Key 发起探测并分别展示结果；
   - **注意**：Base URL 末尾不要加 `/v1`，网关会自动拼接路径；
6. **密钥管理** → 生成网关密钥（管理员可发给所有人；普通用户在自己的「我的密钥」里创建），
   可设置配额、有效期与允许调用的模型，分发给调用方；
7. 调用示例：

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
# .dev.vars 中可写入应急密钥 ADMIN_KEY=xxx（可选）
npx wrangler dev
```

打开 `http://localhost:8787/admin`，首次访问按提示初始化管理员账号即可。

手动部署（等价于控制台自动流程）：

```bash
npm run deploy   # 先 ensure-r2 再 wrangler deploy
```

### 测试与预览

```bash
npm test              # 全量回归：账号体系 + 流式 + 定时任务，内存版 R2 + 模拟上游，无需任何依赖
npm run test:accounts # 账号体系：初始化 / 登录 / 注册开关 / 问答找回 / 角色与配额 / 备份恢复
npm run test:stream   # 流式（SSE）回归测试：5 组场景 / 22 项断言，无需任何依赖
npm run preview       # 生成 preview/admin-preview.html（带模拟数据的控制台静态预览）
```

- `npm test` 会依次跑通账号体系、流式链路与定时任务。
- `npm run test:accounts` 覆盖：首次初始化强制问答、密码/安全答案/会话 token 只存哈希、
  注册开关与默认配额、用户名大小写去重、问答找回（答案归一化、旧会话失效）、
  修改密码 / 安全问题、普通用户只能操作自己名下的密钥、账号级配额与禁用、
  单账号密钥上限、末位管理员 / 自我删除守卫、删除账号级联清理，
  以及含账号的备份导出与恢复校验。
- `npm run test:stream` 直接导入真实的 `src/index.js`，用受控的网络分片与上游故障
  验证流式链路：分片切断、CRLF 跨分片、上游中途报错、客户端断开、静默超时、
  补发 `[DONE]`、Anthropic 翻译与 ping 保活等。改动流式相关代码后请务必跑一遍。
- `npm run preview` 生成的是**纯静态预览页**，数据全部本地模拟，
  不会连接真实网关，也不会写入任何地方；用浏览器直接打开即可查看完整界面。
  预览页支持 `?tab=channels|keys|logs|settings` 直接跳到指定页面、
  `?theme=dark|light` 指定主题，便于逐屏截图比对。

## 接口说明

| 接口 | 说明 |
|---|---|
| `GET /` | 网关状态 |
| `GET /healthz` | 健康检查 |
| `GET /admin` | 中文管理后台（页面本身公开，首次打开初始化管理员，之后账号登录） |
| `GET /v1/models` | 按已启用渠道聚合的模型列表（需网关密钥） |
| `POST /v1/chat/completions` | 聊天补全，支持 `stream: true`（需网关密钥） |
| `POST /v1/completions` | 补全（需网关密钥） |
| `POST /v1/embeddings` | 向量（需网关密钥） |
| `GET /api/auth/state` | 公开状态：是否已初始化 / 是否开放注册 / 是否开启问答找回 |
| `POST /api/auth/setup` | 首次初始化管理员（仅 accounts 为空时可用，必须设置安全问题） |
| `POST /api/auth/login` · `POST /api/auth/logout` | 账号登录 / 退出 |
| `POST /api/auth/register` | 自助注册（需管理员开启注册，必须设置安全问题） |
| `GET /api/auth/recovery?username=` · `POST /api/auth/recover` | 问答找回：取安全问题 / 校验答案并重置密码 |
| `GET /api/auth/me` · `POST /api/auth/change-password` · `POST /api/auth/security` | 当前身份 / 修改密码 / 修改安全问题 |
| `GET/POST /api/user/keys` | 普通用户查询 / 管理自己名下的密钥（`create` / `rename` / `toggle` / `delete`） |
| `GET/POST /api/admin/channels` | 渠道查询 / 覆盖保存 |
| `GET/POST /api/admin/keys` | 密钥查询 / 覆盖保存 |
| `GET /api/admin/ping` | 鉴权探针：校验当前会话或应急 `X-Admin-Key`，不读业务数据 |
| `GET/POST /api/admin/accounts` | 账号列表 / 管理（`create` / `update` / `reset-password` / `delete`） |
| `GET/POST /api/admin/settings` | 网关设置查询 / 保存 |
| `GET /api/admin/stats?days=N` | 近 N 天聚合统计（含分模型/渠道/密钥明细） |
| `GET /api/admin/logs/dates` | 有日志的日期列表 |
| `GET /api/admin/logs/summary?date=&limit=&cursor=&ok=&stream=&finish=&model=&q=` | 日志分页查询（支持筛选；`finish=abnormal` 只看流式异常结束） |
| `GET /api/admin/log?key=` | 单条日志完整内容 |
| `POST /api/admin/logs/cleanup` | 清理超过保留期的日志与统计 |
| `POST /api/admin/logs/clear` | 清空日志：`{scope:"day", date:"YYYY-MM-DD"}` 清空某天，`{scope:"all"}` 清空全部 |
| `POST /api/admin/test-channel` | 测试单个渠道（逐个 Key） |
| `POST /api/admin/test-all` | 批量测试所有已启用渠道 |
| `POST /api/admin/test-route` | 按模型查看路由候选顺序并实际调用一次 |
| `GET /api/admin/backup` · `GET /api/admin/backups` | 立即导出完整快照 / 列出并下载每日自动备份 |
| `POST /api/admin/restore` | 恢复备份（需 `confirm: true`；带 accounts 时会清空全部会话） |

登录后的接口使用 `X-Session-Token` 请求头（控制台自动携带，有效期 7 天）；
管理接口也接受应急 `X-Admin-Key`。`/api/*` 不返回 CORS 头并拒绝 OPTIONS 预检，
仅供控制台同源调用。

## 网关设置项

在「网关设置」页调整（保存在 `data/settings.json`）：

| 设置 | 默认 | 说明 |
|---|---|---|
| `allow_admin_key_as_api_key` | `true` | 是否允许用 `ADMIN_KEY` 直接调用 `/v1/*`（生产建议关闭） |
| `allow_registration` | `false` | 是否开放自助注册；关闭时普通用户由管理员在「账号管理」中创建 |
| `allow_password_recovery` | `true` | 是否开启问答找回密码；关闭后忘记密码需管理员重置 |
| `default_user_quota_tokens` | `0` | 新注册用户的默认 Token 配额，0 = 不限制 |
| `request_timeout_ms` | `60000` | 上游请求超时（首字节），1000 ~ 600000 |
| `stream_idle_timeout_ms` | `60000` | 流式响应的静默超时：上游超过该时长一个字节都没下发即判定断流，网关主动断开并收尾，5000 ~ 600000 |
| `stream_keepalive_ms` | `15000` | 下游保活间隔：网关超过该时长没向调用方下发任何字节时，主动补一条 SSE 注释（`: ka`）保住链路，防止零字节窗口被中间层 / 客户端读超时掐断。与静默超时互补（一个管上游→网关，一个管网关→调用方），0 = 关闭，0 ~ 600000 |
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
- **每次刷新都要重新登录**：正常情况不会。登录成功后会话 token 存在浏览器 `localStorage`
  （有效期 7 天），刷新时控制台先请求 `GET /api/admin/ping` 单独校验会话，
  **只有明确返回 401/403 才会要求重新登录**；某个数据接口（如统计、日志）临时报错只会提示
  「N 个接口暂时不可用」，不会把人踢出登录。若仍然每次刷新都要重输，通常是浏览器禁用了
  本地存储（无痕模式，或在第三方 iframe 内嵌打开），登录页会直接给出提示 ——
  请在新标签页直接打开控制台地址。
- **忘记管理员密码 / 被锁在后台外**：优先用登录页的「问答找回」。若安全问题也忘了，
  在 Worker 环境变量中配置 `ADMIN_KEY`，请求管理接口时带 `X-Admin-Key`，
  或直接在「账号管理」里重置密码（用应急 Key 登录控制台后选择「应急登录」）。
  备份恢复也会整体覆盖账号并清空会话，恢复前请确认备份里至少有一个可用的管理员账号。
- **能不能关闭注册 / 关闭问答找回**：可以。「设置 → 账号与安全」分别控制
  `allow_registration` 与 `allow_password_recovery`。关闭注册后只能由管理员在「账号管理」建号；
  关闭找回后，忘记密码只能由管理员重置。
- **构建日志提示缺少 `CLOUDFLARE_ACCOUNT_ID`**：按上文第 2 步第 3 点补上构建环境变量后重新部署。
- **想换 bucket 名字**：改 `wrangler.toml` 里的 `bucket_name` 即可，下次构建会自动创建新桶并绑定。
- **流式请求的 token 用量**：网关会在转发流式请求时带上 `stream_options: {include_usage: true}`，
  并解析上游在流末尾返回的 `usage`，因此流式请求也能精确统计（OpenAI 兼容渠道要求上游支持该参数，
  不支持时网关会自动降级为普通流式，此时该次用量记为 0；Anthropic 渠道直接从原生事件中提取用量）。
  日志中 `usage_missing: true` 表示该次流式请求未能拿到用量。
- **流式响应中途断了怎么办**：网关有三层保护，先按下面的顺序定位——
  1. **调用方看到「连接被重置」**：这是修复前的行为。现在上游中途断开时，网关会补一个
     error 事件 + `data: [DONE]` 后正常收尾，调用方拿到的是明确的错误而不是 TCP 断开。
  2. **日志里 `finish` 字段**是判断依据：`upstream_error` 表示上游主动断开（常见于
     nginx `proxy_read_timeout`、中转站限流、上游套上游）；`timeout` 表示触发了静默超时；
     `client_abort` 表示调用方自己取消了。日志页可直接按「仅异常结束」筛选。
  3. **长回答必断、短问答正常**：多半是 Workers 的 CPU 时限。检查 Worker 日志里有没有
     `exceeded CPU time limit`（错误码 `1102`）。免费版只有 10ms CPU，
     流式长回答容易越线；升级到付费版，或调大 `stream_idle_timeout_ms` 无关，
     需要减少每块的处理开销（本项目已做字符串快路径优化）。
  4. **长时间零字节然后被掐断**：v2.0.1 起网关自带「下游保活」（`stream_keepalive_ms`，默认 15s）：
     网关超过该时长没向调用方下发任何字节时，会主动补一条 SSE 注释（`: ka`），
     OpenAI 兼容渠道与 Anthropic 渠道均生效，nginx / CDN / 客户端读超时不再遇到零字节窗口。
     若上游真断了，静默超时（`stream_idle_timeout_ms`）会让网关更早介入收尾；
     Anthropic 渠道的 ping 心跳也已转发为 SSE 注释。
  5. **日志里看 `stream_meta` 字段**辅助定位：`bytes` 是本次流已向调用方转发的字节数，
     `first_byte` 表示是否收到过上游首块——`first_byte: false` 说明上游从没吐过字
     （多为上游排队 / 超长 prompt 预处理），`bytes` 很小说明吐了没多久就停了。
- **为什么 `request_timeout_ms` 调大了流还是会卡死**：这个超时只作用于「首字节」
  （响应头到达即失效），流中途卡死由独立的 `stream_idle_timeout_ms` 负责。
  两者都需要配置。
- **费用为什么是估算值**：费用 = 输入 Tokens ÷ 100 万 × 输入价 + 输出 Tokens ÷ 100 万 × 输出价，
  价格来自「网关设置 → 模型定价」，仅用于展示与预算参考，不参与计费。
- **统计数字偶尔偏小**：按天统计采用「读-改-写」累加，R2 没有 CAS。网关已用
  per-key 串行队列把同一 isolate 内的并发写排成队，丢计数已大幅减少；
  但跨 isolate 的竞态仍可能存在，精确对账请以请求日志为准。
  密钥用量（`used_tokens`）与后台编辑共用同一把锁，编辑不会被并发请求覆盖。
- **日志列表为什么天然按时间倒序**：日志对象名使用「倒序时间戳」，R2 按 key 升序返回即最新在前，
  因此翻页游标天然指向更早的一页。
- **改了渠道/密钥后，为什么说「立即生效」**：网关对 `channels.json` / `keys.json` 做了
  热路径短 TTL 缓存（渠道 3 秒、密钥 1 秒），用来省掉每次 `/v1/*` 请求的 R2 往返；
  **控制台保存时会主动失效缓存**，所以在后台改完立刻生效。
  只有绕过控制台直接改 R2 的场景，才会有一个窗口（最多 3 秒）的延迟。
  密钥用量是「读-改-写」，因此不受缓存影响，每次成功请求都会读到最新值。
- **Anthropic 渠道注意事项**：
  - 仅支持 `POST /v1/chat/completions`（`completions` / `embeddings` 不会路由到 Anthropic 渠道）；
  - `max_tokens` 必需：优先用请求中的 `max_tokens`，否则用渠道的「默认 max_tokens」（默认 4096）；
  - `temperature` 会被钳制到 0~1（Anthropic 上限）；
  - `system` / `developer` 消息会自动合并为 Anthropic 的 `system`；
  - 连续的同角色消息会自动合并（Anthropic 要求角色交替），多条 `tool` 结果消息会合并为一条。
- **`/v1/models` 返回 `*`**：渠道模型填 `*` 表示支持全部模型，此时模型列表不会展开它，
  请填写具体模型名以便列表展示。
