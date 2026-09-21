# 人物主体替代人脸门槛 — 2026-09-21

用户明确要求背身、侧身和运动照片可以制卡，能捕捉人物即可。此决定替代旧 input-decisions.md 中“检测不到人脸是硬错误”的规则。

- 页面使用本地 MediaPipe ObjectDetector + EfficientDet Lite0，只检测 person 类别。无需看见正脸。图片不发送到检测服务。
- 多个人物按检测框面积排序，由用户明确选择；单人自动选择。检测失败可以重试，零人物不会被伪装成检测成功。
- 新提交使用 subjectDetection（personCount、selectedPersonIndex）。旧 faceDetection 契约仅保留兼容；人物路径把其规范化为零人脸、未知角度，不编造脸部结果。
- 人物选择结果通过服务端严格字段校验。多人漏选、索引越界、无人物、无处理同意仍会阻止提交。
- 页面生成预览改用 composePhotoArtwork：对完整人物框加留白并等比排版原照片，不再裁脸贴到程序身体上，也不根据惯用手镜像真实照片。
- 本地原照片排版仍使用旧卡面布局，不等于精修 AI 自动生成。独立样卡在工作区 output/cards/airborne-09-v1.png，由本轮内置 image_gen 单独生成。
- 此次上传控件仍为单张；前一轮约定的可选第二、第三张照片保留为后续输入扩展要求。

## 检测模型

来源：Google MediaPipe 官方模型存储。

https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite

本地文件：public/models/person-detector.tflite

SHA-256：40338edf5ec70d43e318b0a716a84d4564cd1802759a7a07170c7e43796dbf58

## 验证

新增输入回归覆盖：零人脸有主体、多主体漏选、人物数量无效、索引越界；服务端回归覆盖背身人物提交。

scripts/check-person-photo.mjs 使用本机 Chrome 验证真实照片从上传、人物选择到可保存成卡的完整本地流程。测试用表单昵称与位置只作为流程测试数据，不作为样卡人物事实。

本轮结果：npm run check 通过（16 个测试文件，244 项测试）。使用用户提供的背身腾空原图进行浏览器验收，识别出 8 位人物，首个主体为腾空球员，选择后成功到达可保存成卡页面，无页面脚本错误。验收截图保存于 output/cards/person-detection-check.png 与 person-result-check.png（工作区根目录）。
