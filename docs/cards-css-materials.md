# 全套 cards-css 收藏卡材质

用户截图准确来源为 kongyo2/cards-css，而非第一版使用的 simeydotme/pokemon-cards-css。
已固定安装 @kongyo2/cards-css 0.5.0，使用原版引擎及种子生成纹理，CSS 为适配篮球照片的派生版本。

14 种：holo、reverse、cosmos、glitter、aurora、rainbow、gold、prism、radiant、crystal、metal、oilslick、sunburst、mosaic。另有 none 光面对照。

正式 Studio 使用 MvpCardView：全材质选择和 50%–250% 强度控制，默认 160%。反光覆盖整个卡面，鼠标移出后仍可见。翻面、减少动态效果、传感器权限和 AURA/ANIMATION 原有动画保留。

2026-09-21 全卡柔光调整：原版 43 个跟随指针的圆形照明渐变改成横贯卡面的宽色带；保留原有纹理、配色和油膜固有同心纹。材质最终使用柔光合成，固定较低亮度与对比度，强度主要影响纹理透明度和色彩饱和度，不再放大白色高光。白色眩光独立使用 screen 合成的宽柔边渐变，峰值有效透明度约 25%，指针驱动横纵扫动。彩色纹理仍用柔光合成，避免白色高光被再次压没。

重新生成派生 CSS：node scripts/build-photo-foil.mjs。生成文件 src/styles/cards-css-photo.css；本地合成调整 src/styles/cards-css-adapter.css。

对比页：http://localhost:3000/debug/foil ，提供整页强度滑杆。

验证：npm run check（267 项测试）；node scripts/check-cards-css.mjs（15 个模式、14 种不同配方、每种指针响应、强度调节、翻面关闭材质、减少动态效果、无浏览器异常）。已检查截图中的人物亮部与全卡纹理，截图见 docs/screenshots/foil-*-strong.png 和 cards-css-all-14.png。

范围：网页动态材质已升级；PNG 和独立 HTML 导出仍是原有静态/动画材质链路，尚未统一。线上未发布。

调试面板：/debug/foil 左侧可分别调彩色材质的透明度、亮度、对比度、饱和度、混合方式，以及白色反光带的透明度、峰值、宽度、角度、移动幅度、混合方式。参数以 blueprint-foil-tune-v1 保存到当前浏览器 localStorage，可复制 JSON 或恢复默认。仅作用于调试页；正式卡面保持现有参数，待用户确认配置后再应用。

## 用户确认参数（2026-09-21）
已同步为正式网页卡面与调试面板重置默认值。此配置取代前述柔光混合设置：
```json
{"version":1,"colorOpacity":0.656,"brightness":0.96,"contrast":0.5,"saturation":2.25,"colorBlend":"color-dodge","glareOpacity":0.41,"glarePeak":0.56,"glareWidth":74,"glareAngle":119,"glareTravel":100,"glareBlend":"hard-light"}
```
默认强度 160% 时与调试参数完全一致；正式页强度滑杆仍允许继续调整。浏览器验证已对比去除调试覆盖前后的材质透明度、滤镜、混合方式、光带渐变及位置，计算样式一致。调试页保留本机保存值，点击“恢复默认”即可加载此确认配置。

2026-09-21 线上更新：正式制作抽取全部 14 种材质（等概率），结果不再允许自行切换材质。PNG 与分享图已改用相同 CSS 引擎的静态快照，旧五档网页评审入口统一跳转到新图鉴。特卡版型由服务端独立抽取，AURA 与 ANIMATION 各 1%。
