# 交付入口

- 使用链接：https://blueprint-card-v3-preview.vercel.app
- 缩略图与五档材质评审：https://blueprint-card-v3-preview.vercel.app/debug/thumbnails
- 私有代码仓库：https://github.com/shuyangliu0827/blueprint-basketball-v0
- 默认分支：codex/v3-prototype
- 本轮最终功能部署：dpl_5enzqn6Zw8dP9fUxGX4fEbJQTDYV，功能提交 a0aa9ff。
- 环境：Vercel / Next.js App Router / Node24；环境变量 DRAW_HMAC_SECRET、IP_HASH_SALT 均作为 Secret 配置，未进入仓库。

## 验收

2026-09-20：237项单元测试通过，类型检查、配置启动检查、生产构建通过。线上首页与WASM资源返回200且无需登录；独立浏览器完成本地识脸、单次失败重试、揭晓正反面、四种图片下载、终态失败返还、原结果恢复、ref访客去重回流。线上无WebGL降级、五档静态切换与恢复动态通过。

四种图片尺寸和PNG300DPI/合成来源字段检查通过；二维码真实解码到当前部署域名及签名ref。微信UA分支验证长按提示事件且不触发下载事件；这不代替微信真机测试。

## 内存状态的实测限制

Vercel多实例可能让同一访客的事件分散在不同进程；线上验收观察到末次统计未包含较早的保存/再次生成事件。这符合预览不使用外部存储、状态丢失可接受的约束，但意味着本次统计面板不是完整漏斗，也不能用于真实内测的假设判定。签名cookie可恢复匿名身份；同requestId仍确定性得到同一抽取。原始照片和成品始终留在创作者浏览器。

完整自动化记录见 e2e-results.json；图示在 screenshots/。设计推荐、占位参数和判断记录见 delivery-notes.md。
