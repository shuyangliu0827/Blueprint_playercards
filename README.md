# 蓝本 BLUEPRINT · 个人数字篮球卡 v0

**[已部署的旧版原型](https://blueprint-card-v3-preview.vercel.app)** · **[缩略图评审](https://blueprint-card-v3-preview.vercel.app/debug/thumbnails)**

MVP 开发期预览与团队内部评审。照片经浏览器转换后，在用户同意的前提下发送到 OpenAI 生成画面；固定卡框和材质由浏览器渲染。需要服务端配置 `OPENAI_API_KEY`，未配置时明确报错。详见 [OpenAI 生成配置与接口](docs/openai-generation.md)。

- Next.js App Router / React / TypeScript，Node.js 24。
- MVP 使用 Canvas 动态银折、金色同心圆、棱镜切面等五档材质，支持指针、设备倾斜与减少动态效果设置。旧 WebGL 渲染器保留用于历史评审。
- 新模板卡图1000×1400、海报1080×1440、缩略图1000×800、主动对比图2400×1600，全部浏览器合成。
- 服务端 HMAC 确定性抽取；五档40/26/18/11/5，首抽非基础保底；概率与密钥不进客户端。
- 内存任务、3次成功发卡、失败返还与原结果恢复；不自动重复付费生图。
- OpenAI 图像 API 已接入；无登录、支付、持久化卡册或外部存储。

## 本地运行

```sh
npm ci
node scripts/start-local.mjs
npm run dev
```

`start-local.mjs` 仅在缺失时生成 `.env.local` 两个随机服务端秘密，已被Git忽略。生产配置 `DRAW_HMAC_SECRET`、`IP_HASH_SALT` 至少32字节，通过部署环境设置；禁止 `NEXT_PUBLIC_` 前缀。

```sh
npm run check
npm run build
npm start
```

入口 `/`；新模板与动态材质评审 `/debug/mvp-material`，历史缩略图评审 `/debug/thumbnails`。用户流程已移除模拟速度和失败选项。页脚数据面板仅显示当前匿名身份事件。最新功能已纳入 codex/v3-prototype 分支；本次未验证上方网址的远程部署状态。

## 目录与可替换边界

| 目录 | 职责 |
|---|---|
| `src/core` | 框架无关抽取、requestId解析、输入/姿势/文案/埋点、模拟延迟 |
| `src/server` | HMAC、固定配置、内存任务与签名ref/匿名cookie |
| `src/render` | JSON版式、WebGL1材质、纯输入响应、分享合成与PNG元数据 |
| `src/platform` | H5文件/触摸/陀螺仪/人物检测/上传及网络；小程序空接口 |
| `src/generator` | 历史模拟生成器与照片排版辅助；实际生图在 src/server/image-generation.ts |
| `config` | 全部规则、layout/effect与schema、generation_contract、事件字典 |
| `public` | 系列设计样张、本地WASM/人物模型、品牌Logo与旧版纹理 |

`requestId = uuid + ':' + firstFlag + ':' + configVersion`，抽取解析requestId中的首抽和版本。客户端可伪造首抽的v0让步保留；生产必须改服务端权威首抽和持久化去重。旧版本配置指纹不可修改，密钥轮换会改变结果。

## 验收与推荐决定

详细见 [交付与推荐记录](docs/delivery-notes.md)、[资产登记](docs/assets-register.md)、[后端决定](docs/backend-decisions.md)、[照片处理](docs/photo-decisions.md)、[事件口径](docs/events-decisions.md)。设计参数根级 `_placeholder: true` 是可替换的工程初版，不把推荐值冒充设计师定稿。

当前流程：先运行 `npm run check`，开发服务启动后运行 `node scripts/check-mvp-flow.mjs`。该浏览器测试覆盖缺少密钥、真实本机人物检测、三图上传、两种系列、排版失败恢复、动态折射和导出，图像接口使用测试响应，不产生付费调用。旧 `e2e.mjs` 等脚本对应历史模拟流程。

## 预览限制

照片发送到服务端并转交 OpenAI 处理；服务端不落盘，画面短暂缓存在进程内存。浏览器刷新后需要重选照片。服务端全部状态在进程内存，Vercel重启/多实例会丢失或不一致；这是用户明确接受的内部预览限制。原requestId在同密钥/配置下的抽取仍不变。客户端可绕过免费次数和首抽，只适用于不收费的内部评审。

传播主指标是服务端签名ref去重回流；`share_asset_generated`仅是保存率上界。自动入册、打开面板、失败重试均不分别冒充主动保存、实际传播、再次创作。当前样本是自动化验证，不是第10节产品假设得到证明。

商业上线前仍需实际模型选型与质量评测、设计定稿、存储地域与隐私/合规检查；本次未实现或暗示完成这些内容。
