# 初版视觉资产登记
- `public/assets/examples/art-1/2/3.jpg`：来自用户此前生成的本地视觉模板，用户于本轮明确授权复用。路径源：球星卡本地演示/public/library/prepared 的 sea-lions-shooter、swifts-handler、mustangs-finisher。仅作为示例；不用于新用户个性化生成。
- 三张成品示例卡：上述画面 + 当前 layout.json 程序排版 + WebGL 材质导出。不复制旧业务参数、品牌商标、交易或限量逻辑。
- normal/noise/coverage/protect：确定性程序纹理与遮罩；static 文件由同一 WebGL shader 预渲染透明反光层，不含人物和文字。
- 字体：操作系统 Arial / PingFang SC / Microsoft YaHei，无字体文件分发。跨系统字形可能有差异。
- 本地人脸检测模型：MediaPipe BlazeFace short-range float16，下载自 Google 官方模型存储 https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite ，与 `@mediapipe/tasks-vision` 配套 WASM 全部随站点本地提供。检测在浏览器运行，没有照片外发和外部推理 API。
- 设计初版仍标 `_placeholder: true`，正式设计师数值可以整体替换。示例资产为内部评审授权来源，不表示已完成商业授权核验。
