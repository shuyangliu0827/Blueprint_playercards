# 蓝本 BLUEPRINT｜开发交接

更新日期：2026-09-21。面向接手开发者，涵盖产品约定、代码入口、启动、验证和下一步。

## 1. 先确认你拿到的是哪个版本

- 仓库：https://github.com/shuyangliu0827/blueprint-basketball-v0
- 当前默认开发分支：`codex/v3-prototype`。
- 交接核对时，远程代码基线：`20a88902d9b53e223a5a737dedb2d60e3214b350`，提交说明 `Record live acceptance results and delivery links`。
- **最新的人物检测、多图上传、OpenAI 生成和 MVP 模板代码在原开发机工作区，尚未提交或推送。本文描述其实际本地进度，不表示默认分支或线上站点已包含这些功能。**
- 本交接文档发布在独立文档分支 `codex/handoff-2026-09-21`，没有改动默认分支或部署线上应用。
- 本地目录为工作区下的 `v0-prototype/`；直接 clone 上述仓库后，仓库根目录就是 Next.js 项目根目录，不必再进入同名子目录。
- 仓库当前是公开仓库。最新工作区包含用户原照片和生成样卡，发布完整变更前需确认这些素材的公开范围；`.env.local` 等秘密配置不提交。

**接手第一件事：取得并核对最新未提交变更及素材，再执行下文新版流程。只 clone 远程基线会拿到旧版。**

## 2. 已明确的产品与审美要求

产品是根据用户照片制作个人篮球收藏卡。核心原则是：**固定卡片模板，不同输入生成不同卡面内容**。

- 保留已有昵称/姓名、号码、位置、惯用手信息项。
- 上传 1–3 张同一人的照片：1 张主照片决定主体与动作，最多 2 张参考照片补充个人特征。
- 背身、侧身、腾空照片均可；识别到人物即可，不能把正脸检测作为硬门槛。
- 多人照片要求明确选主体，不凭空换人；保留真实动作和身体比例，不再把脸贴到程序绘制的身体上。
- Blueprint 标志使用已经制作的叠排 Chrome 风格字标。
- 卡面底部必须是球员名字，不用“腾空时刻”等主题标题代替。设计样张未指定真实姓名时用“球员姓名”。
- Logo、卡框、标题、姓名及号码区由代码确定性绘制；图像模型负责人物和背景。
- 五种材质沿用 `base/silver/prism/gold/obsidian`。重点参考：银色方向反光、金色密集同心圆微纹、棱镜不规则切面。

| 系列 | 画面处理 | 固定模板 |
| --- | --- | --- |
| ORIGINAL (`classic`) | 运动摄影质感，保留主体动作与视角 | Chrome 金属框、红色细节、姓名铭牌 |
| AURA (`aura`) | 人物艺术化；整个背景变为符合主题的虚拟、柔化环境 | AURA 标题、纤细金属边框、居中姓名 |
| ANIMATION (`animation`) | Rick and Morty 方向的美漫风格；人物与背景统一渲染 | ANIMATION 标题、漫画科幻边框和姓名牌 |

参考卡的观察维度包括人物主体处理、文字层级、字体、构图、装饰与真实材质感。独立静态样卡和审美研究在原工作区上层 `output/cards/mvp-v2/` 与 `docs/aesthetic-study-2026-09-21/`，不属于当前远程代码基线。静态样卡不能被当作网页已真实生图的证据。

## 3. 最新本地代码已完成什么

- MediaPipe person 检测，支持无正脸；多人选择和同意撤回时的异步竞态防护。
- 保留原输入字段，新增最多 2 张参考照片及系列选择。
- 服务端接入 OpenAI Images Edit API；无密钥时明确提示，不回退成假生成成功。
- 固定三套模板；动态折射随指针或设备倾斜变化；减少动态效果设置提供静态模式。
- 1000×1400 卡片下载，包含静态材质；分享海报、缩略图、原图对比沿用浏览器导出。
- 同一请求及照片内容复用结果，不自动重开付费生成；本地排版失败返还预留次数并复用画面。
- 本地排版、图片读取和序列化成功后才确认发卡；完成接口响应中断时按服务器状态恢复。

**尚未完成：**真实密钥配置、真实 OpenAI 图像质量验收、最新代码同步与部署、生产级持久化和多实例状态管理。模型能否稳定保留人物身份、号码、动作和目标美术质量，需要接手后用真实输入实测。

## 4. 本地启动

要求 Node.js 24.x（`package.json` engines），npm，本机 Chrome 用于浏览器验收。

```sh
git clone https://github.com/shuyangliu0827/blueprint-basketball-v0.git
cd blueprint-basketball-v0
git switch codex/v3-prototype
npm ci
node scripts/start-local.mjs
npm run dev
```

上面的 clone 是远程基线；取得最新版变更后，再进行 OpenAI 流程验证。

`start-local.mjs` 在 `.env.local` 不存在时生成本地随机秘密；如果文件已存在，它不会补齐缺失字段。不要先复制一个全空的 `.env.example` 再指望脚本补全。

在本地 `.env.local` 或部署环境设置：

| 变量 | 作用 |
| --- | --- |
| `DRAW_HMAC_SECRET` | 稳定的服务端抽取/签名秘密，至少 32 字节 |
| `IP_HASH_SALT` | 服务端 IP 聚合散列盐，至少 32 字节 |
| `OPENAI_API_KEY` | 服务端 OpenAI 密钥，最新版生成流程必需 |

不使用 `NEXT_PUBLIC_` 前缀，不在聊天、日志或 Git 中分享秘密。更改环境配置后重启服务。

入口：

- `http://localhost:3000/`：用户流程。
- `/debug/mvp-material`：最新版模板与动态材质对比，明确使用同一张测试原图，不代表 AURA/ANIMATION 已执行生图。
- `/debug/thumbnails`：旧版缩略图/材质评审。
- `http://127.0.0.1:4179/`：原开发机临时静态样卡展示，不是自动生成应用，也不由上述启动命令开启。
- 既有线上地址 `https://blueprint-card-v3-preview.vercel.app` 对应旧版，不能用于确认这次更新。

## 5. 代码入口与职责

下表中新增文件需取得最新版工作区后才有。

| 路径 | 职责 |
| --- | --- |
| `src/components/Studio.tsx` | 页面状态、照片/主体选择、信息录入、生成、恢复、导出 |
| `src/platform/photo.ts` | 解码 JPEG/PNG/HEIC、人物检测、对象 URL 生命周期 |
| `src/platform/generation.ts` | JPEG 转换、多图 multipart、生成状态与请求 |
| `src/core/input.ts` | 表单与人物选择校验；保留旧 faceDetection 契约兼容 |
| `src/app/api/generate/route.ts` | 实际生成 GET/POST 路由、请求大小和来源检查 |
| `src/server/image-generation.ts` | 图像校验、生成提示词、OpenAI HTTP、请求去重及缓存 |
| `src/server/preview-runtime.ts` | 共享预览服务与签名 session |
| `src/server/preview-service.ts` | 抽取、任务归属、预留、成功次数、失败与恢复 |
| `src/app/api/preview/route.ts` | session、poll、complete、restore、render-failed、事件 |
| `src/render/mvp-card.ts` | 三套固定卡框、Logo、标题、姓名与号码排版 |
| `src/render/mvp-material.ts` | 程序化材质、保护遮罩、静态导出共用绘制器 |
| `src/components/MvpCardView.tsx` | 指针/倾斜实时反光、翻面、静态模式 |
| `src/render/sharing.ts` | 卡图、海报、缩略图、原图对比 |
| `src/render/layout.ts` | 旧 JSON 排版；当前卡背仍复用此路径 |
| `config/` | 输入/布局/材质/概率/文案/事件配置及 schema |
| `public/assets/brand/blueprint-logo.png` | 透明 Blueprint 字标 |
| `public/assets/mvp/` | 新系列样卡和本地测试照片，发布前核对素材范围 |
| `public/models/person-detector.tflite` | EfficientDet Lite0 person 检测模型 |

`src/generator` 中旧 MockGenerator/RealGenerator 占位代码不是新版实际生成入口；不要在接入真实模型时接回旧模拟流程。

## 6. 实际生成链路

1. 用户上传主照片，勾选已有声明；本地 person 检测，单人自动选择，多人手动选择。
2. 浏览器把所选 1–3 张照片转换成 JPEG，最长边不超过 2048；上传元数据对应实际编码字节和尺寸。
3. `POST /api/preview` 的 session 创建签名 `bp_anon` cookie。
4. `POST /api/generate` 使用 multipart：`requestId`、`input` JSON、`series`、`subject` JSON、重复的 `photos` 文件字段。
5. 服务端检查会话、输入、人物框、JPEG 内容和尺寸；将请求 ID 与输入、系列、主体和图片字节绑定，预留额度。
6. 服务端调用 `https://api.openai.com/v1/images/edits`：当前实现 `gpt-image-2`、high、1024×1536、PNG、n=1；主图排第一，参考图只辅助身份。
7. 返回 `{ artwork: dataURL, job }`；浏览器把画面装入固定模板，绘制卡背及带静态材质的导出图。
8. 本地绘制和序列化均成功后调用 `complete`，只确认一次成功。
9. 排版失败调用 `render-failed`，保留已生成画面。重试先 poll 权威状态，需要时 restore，再排版，不再调用模型。完成响应丢失也使用同一任务核对。

`GET /api/generate` 返回 `{configured, model}`；configured 仅表示配置了密钥，不代表已验证权限、余额或模型可用性。

### 请求限制及状态边界

- 服务端最多 3 张 JPEG，每张 10 MB，总 multipart 30.1 MB；主图元数据必须匹配。
- 图片边长 64–8192，最多 32 MP；图像响应 JSON 最多 24 MB。
- 上游超时 240 秒，路由时长预算 300 秒；不自动重复付费请求。
- 每进程最多 4 个上游调用、8 个缓存项，已结束缓存最长保留约 30 分钟，容量压力会提前淘汰。
- 同请求 ID 不得更换图片/输入；旧画面已失效时提示重新明确发起请求，而不静默重生成。
- 次数、任务、缓存和去重均为进程内存。重启会丢失，多实例不共享；现在只适用于内部单进程预览。
- 图像上传经服务器转交 OpenAI；本机检测不上传。服务端不落盘照片，画面短暂缓存在内存；提供商处理遵循账号对应的数据保留设置。

## 7. 材质与模板注意事项

- `renderMvpCard({artwork, data, series, tier, includeMaterial})`：网页动态展示使用 `includeMaterial=false`，下载使用 `true`，防止材质叠加两次。
- 特卡的艺术化发生在模型画面中；模板标题和边框本身不能把普通照片变成 AURA 或 ANIMATION。
- 画面接近满版，完整主体等比保留；提示词预留上方约 15% 和下方约 13% 的背景供标题/姓名叠加。
- 材质保护是中央人物区域及文字/Logo 的保守遮罩，不是逐像素人物分割；偏离中央的手臂仍可能进入反光区域，需要真实样本评审。
- PNG 保存静态反光截面，不是动画；网页才能随指针或倾斜变化。

## 8. 已有验证及复验命令

2026-09-21 最新本地版本已验证：配置检查、类型检查、19 个测试文件共 261 项测试、生产构建通过。以下是此前执行记录，不表示真实 OpenAI 调用已经验收。

```sh
npm run check
npm run build
# 保持本地开发服务运行；以下需要本机 Chrome
node scripts/check-mvp-flow.mjs
node scripts/check-person-photo.mjs public/assets/mvp/demo-photo.jpg
```

- MVP 浏览器测试：缺少密钥会阻止生成；真实本机 person 检测；三张图上传；两种系列/不同输入；动态反光像素变化；1000×1400 导出。
- 故意制造本地序列化失败，以及服务器处理后丢失 `render-failed` 响应，验证次数返还和缓存恢复。
- 图像服务传输在此测试中被 mock：没有调用真实模型，也没有产生真实付费生图。
- 背身扣篮测试照片检测出 8 位人物；在解码期间撤回同意，不继续人物检测。
- 390px 手机输入页无横向溢出；五张材质检查卡无页面脚本错误。
- 实际本地 HTTP 检查：无签名请求 401；有 session 但未配置 key 返回 503。
- 历史 `scripts/e2e.mjs` 等针对旧模拟流程，不能直接当新版主验收。

## 9. 建议接手顺序

1. **同步工作区**：获取本地未提交源码、模型及必要素材，核对变更；不要将秘密或未经确认公开的用户照片推入公开仓库。
2. **配置真实 OpenAI key**：确认账号具备模型权限及可用额度，手动生成一张，验证接口和真实耗时。
3. **真实美术验收**：同一输入分别生成三系列；不同输入保持版式一致。检查主体身份、动作、肢体、球衣号码、中文姓名、AURA 背景虚化与美漫画风一致性。
4. **边界验收**：背身、侧身、多人、1/2/3 图、低清图、上游失败、断网及排版失败；特别留意同一请求不重复付费。
5. **持久化再部署**：共享数据库/存储保存任务、成功次数、去重和画面，加入分布式锁；明确访问、清理期限及成本限制。
6. **部署约束**：核对实际平台上传大小、执行时长和内存限制。必要时改对象存储上传+异步队列，避免把本地可用误判为无服务器平台可用。
7. **统一卡背和历史页面**：卡背及旧 debug 页面仍沿用旧布局，可在确认正面审美后再同步。

## 10. 进一步阅读

取得最新版源码后，按下列顺序阅读：

1. `docs/openai-generation.md`：接口、环境配置、状态和完整验证记录。
2. `docs/superpowers/specs/2026-09-21-mvp-generation.md`：新版范围。
3. `docs/superpowers/plans/2026-09-21-mvp-generation.md`：实现分工。
4. `docs/person-subject-update.md`：人物检测由来。该文件是前一阶段记录，其中“单图/本地排版”的状态已被新版多图和 OpenAI 流程替代。
5. `docs/input-decisions.md`、`docs/photo-decisions.md` 等历史记录：若与本文或新版实现冲突，核对最新代码及明确的用户要求，勿恢复旧人脸门槛。

文档不包含 API 密钥、cookie、访问 token 或用户邮箱。协作账号与邀请状态通过 GitHub 仓库设置管理。
