# 卡片专属动画与网页移植

2026-09-21 本地新增。与固定模板、真实生图分开：动画不调用模型，也不改变人物动作。

## 查看

```sh
npm run motion:preview
```

打开 http://127.0.0.1:4179/ 。页面先展示两张特卡，再展示银折、金折和棱镜。可暂停、重播、调节光效强度。需要关闭时终止预览进程。

已有 Next 开发服务也能打开 `/motion/index.html`。`/debug/mvp-material` 及正式生成结果中的 `MvpCardView` 已接入同一个动画模块。

## 三种节奏

| 系列 | 专属动作 | 周期 |
| --- | --- | --- |
| classic | 自动缓移的金属光带/切面高光，指针改变受光方向 | 连续光线变化 |
| AURA | 暖红光雾呼吸、天体光环、星尘轨迹 | 12 秒 |
| ANIMATION | 不规则漫画传送门、12fps 风格轮廓节奏、星芒与宽缓能量脉冲 | 6 秒 |

没有高频闪烁。光效绘制至透明 Canvas，原卡图是静态底层。人物中心、标题和姓名通过保守区域遮罩保护，**不是**精确人物分割；新卡图构图偏离中心时仍应检查光效遮挡。

## 可移植实现

- `src/render/series-motion.ts`：按绝对时间绘制特卡光效，无 React 依赖；周期由 `motionFrame` 定义。
- `src/platform/card-motion.ts`：`mountCardMotion(host, canvas, options)`，管理 30fps 绘制、指针、可见性和系统减少动态设置。
- `src/render/mvp-material.ts`：已有银折/金折/棱镜绘制器，直接复用。
- `src/components/MvpCardView.tsx`：React 集成。特卡动画使用独立透明层，不重复叠加已有动态材质。
- `public/motion/card-motion.js`：由 esbuild 打包的独立 ESM；`public/motion/index.html` 为无 React 的展示页。

修改源文件后执行 `npm run motion:build` 更新独立模块；生产 `npm run build` 也会自动打包它。没有引入额外运行依赖。

```js
import { mountCardMotion } from '/motion/card-motion.js';

const motion = mountCardMotion(cardElement, overlayCanvas, {
  series: 'aura',        // classic | aura | animation
  tier: 'silver',       // base | silver | gold | prism | obsidian
  material: true,      // 页面已存在折射层时设 false，避免叠加两次
  tilt: true,          // 已由宿主负责倾斜时设 false
  playing: true,
  intensity: 1,       // 0–1.5
});
motion.setPlaying(false); // 冻结在当前时刻
motion.setPlaying(true);  // 从暂停处继续
motion.seek(0);           // 回到开头，或指定秒数
motion.setIntensity(0.8);
// 页面/组件卸载时：
motion.destroy();
```

宿主容器使用 `position:relative; overflow:hidden`；卡图占满容器，Canvas 使用绝对定位 `inset:0; width:100%; height:100%; pointer-events:none`。展示页画布内部为600×840，轻量普通卡为480×672；图像保持自身比例。

浏览器减少动态效果设置优先于 playing。窗口隐藏或卡片滚出视区（80px预加载边缘外）时不持续绘制，返回后继续。React 组件卸载时取消帧、监听器和 observer。

## 导出与素材

当前 PNG 下载保存静态原图或已有静态材质快照，不包含循环动画。没有生成视频或 GIF。展示页使用 `public/assets/mvp/` 样卡；真实结果只需替换底图并传相应 series，动画代码不用改。

## 验证

```sh
npx vitest run tests/card-motion.test.ts
node scripts/check-card-motion.mjs  # 先保持4179预览运行，需要本机Chrome
npm run check
npm run build
```

浏览器检查覆盖：两张特卡像素随时间变化、暂停后稳定、重播恢复、离屏暂停、减少动态设置与390px手机宽度。另对 React 中的 AURA 图层执行播放/暂停/继续检查。当前动画只在本地工作区更新，尚未推送远程。
