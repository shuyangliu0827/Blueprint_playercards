# 蓝本 BLUEPRINT · 个人数字篮球卡 v0

v3 开发期预览与团队内部评审。第一、二、三批完整实现：照片在浏览器内处理，图像生成是明确标注的本地 Mock。

- Next.js App Router / React / TypeScript，Node.js 24。
- 五档 WebGL1 单四边形材质、CSS3D 翻面、静态反光降级。
- 卡图1500×2100、海报1080×1440、缩略图1000×800、主动对比图2400×1600，全部浏览器合成。
- 服务端 HMAC 确定性抽取；五档40/26/18/11/5，首抽非基础保底；概率与密钥不进客户端。
- 异步内存任务、3次成功发卡、单次重试、失败返还与原结果恢复。
- 无登录/支付/持久化卡册/外部存储/真实图像或语言模型 API。

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

入口 `/`，缩略图与五档材质评审 `/debug/thumbnails`。上传页底部“内部评审设置”可切换正常/0.5秒模拟和失败路径。页脚数据面板仅显示当前匿名身份事件。

## 目录与可替换边界

| 目录 | 职责 |
|---|---|
| `src/core` | 框架无关抽取、requestId解析、输入/姿势/文案/埋点、模拟延迟 |
| `src/server` | HMAC、固定配置、内存任务与签名ref/匿名cookie |
| `src/render` | JSON版式、WebGL1材质、纯输入响应、分享合成与PNG元数据 |
| `src/platform` | H5文件/触摸/陀螺仪/人脸检测/网络；小程序空接口 |
| `src/generator` | MockGenerator / RealGenerator空实现 / 人工质检钩子 |
| `config` | 全部规则、layout/effect与schema、generation_contract、事件字典 |
| `public` | 三张授权复用示例、本地WASM/人脸模型、纹理和预渲染反光 |

`requestId = uuid + ':' + firstFlag + ':' + configVersion`，抽取解析requestId中的首抽和版本。客户端可伪造首抽的v0让步保留；生产必须改服务端权威首抽和持久化去重。旧版本配置指纹不可修改，密钥轮换会改变结果。

## 验收与推荐决定

详细见 [交付与推荐记录](docs/delivery-notes.md)、[资产登记](docs/assets-register.md)、[后端决定](docs/backend-decisions.md)、[照片处理](docs/photo-decisions.md)、[事件口径](docs/events-decisions.md)。设计参数根级 `_placeholder: true` 是可替换的工程初版，不把推荐值冒充设计师定稿。

自动化完整流程：开发服务启动后运行 `node scripts/e2e.mjs`、`node scripts/render-regressions.mjs`、`node scripts/check-exports.mjs`。需要本机Chrome；测试仅使用仓库中的合成示例照片。`TEST_URL` 可切换到线上网址。截图/结果在 `docs` 下。

## 预览限制

照片和成品只在浏览器内存，刷新后需要重选。服务端全部状态在进程内存，Vercel重启/多实例会丢失或不一致；这是用户明确接受的内部预览限制。原requestId在同密钥/配置下的抽取仍不变。客户端可绕过免费次数和首抽，只适用于不收费的内部评审。

传播主指标是服务端签名ref去重回流；`share_asset_generated`仅是保存率上界。自动入册、打开面板、失败重试均不分别冒充主动保存、实际传播、再次创作。当前样本是自动化验证，不是第10节产品假设得到证明。

商业上线前仍需实际模型选型与质量评测、设计定稿、存储地域与隐私/合规检查；本次未实现或暗示完成这些内容。
