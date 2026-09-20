# v3 第一批独立业务模块实施计划

**Goal:** 完成本次用户授权的抽取、HMAC、非视觉配置、输入校验和单元测试。

**Architecture:** 纯函数业务层只接收显式配置与数据，不读取环境、时间、随机源或平台 API。Node 服务端适配层负责密钥、HMAC、文件和启动校验；后续 Next API 只调用适配层。输入与事件模块独立，不依赖 layout/effect。

**Tech Stack:** TypeScript、Vitest、AJV；依赖版本来自本机已有运行环境，不沿用旧项目代码。

**Spec:** 用户提供的 `/Users/marcus/Downloads/个人数字篮球卡产品与实现方案_v3.docx`、v3 逻辑图和本会话请求及修正。不得查看早期实现补充需求。

## Global Constraints

- 五档 40 / 26 / 18 / 11 / 5；首抽权重 26:18:11:5；不修改第 10 节门槛。
- requestId = UUID + ':' + 首抽标记 + ':' + configVersion；HMAC-SHA256 对完整请求号计算。
- 照片不上传、无外部存储、不读取已有环境变量文件；布局草案保持原样。
- v0 接受客户端伪造首抽；保留用户要求的生产环境警示注释。
- 保存为 `share_asset_generated` 的人数上界；回流为服务端按 anonId 去重的 `shared_link_opened`；重试/修复不算再生成。
- 首批不实现 UI、真实模型、任务调度、部署或检测模型。

## Task 1 抽取与启动配置

文件：`src/core/draw.ts`、`src/core/request-id.ts`、`src/config/validate.ts`、`src/server/draw-service.ts`、`src/server/config-loader.ts`、`config/rarity_v0.json`、`config/rarity_registry.json`、`scripts/check-config.ts`、`tests/draw.test.ts`、`tests/startup.test.ts`。

接口：`draw(config, seed, isFirstDraw) -> {tier, cardId, configVersion}`；`parseRequestId(requestId)`；服务端 `seedForRequest(secret, requestId)`、`drawForRequest(requestId, secret, registry)`。冻结配置副本；未知版本报错；启动校验不能吞错。

- [x] 先写边界、非法配置、重放、HMAC 向量、10 万次常规及首抽分布测试，确认未实现时失败。
- [x] 完成五档配置和版本注册表；启动时校验文件指纹、版本对应、档位唯一、权重总和、首抽池与已确认参数。
- [x] 实现纯函数抽取及服务端 HMAC；使用确定性种子，不调用当前时间或 Math.random。
- [x] 用临时目录损坏配置运行真实启动检查，确认退出码非零。

## Task 2 输入、姿势与故事

文件：`config/input_schema.json`、`config/player_names.json`、`config/pose_rules.json`、`config/story_templates.json`、`src/core/input.ts`、`src/core/pose.ts`、`src/core/story.ts` 及对应测试。

接口由该模块定义并导出类型；配置通过参数传入；配置自身提供公开校验函数供启动检查调用。脸检测/角度检测只消费客户端提供的结构化结果，本批不加载检测库或模型。

- [x] 写失败测试：五项必填、尺寸边界、软清晰度提示、多脸选择、号码 00、惯用手、同意、姓名过滤、9 格路由、80 字故事。
- [x] 实现配置、纯函数与静态词库；说明匹配策略、非穷尽性和工程判断。
- [x] 运行该模块测试与类型检查，交给总体验证。

## Task 3 事件口径

文件：`config/events_dictionary.csv`、`config/metrics_v0.json`、`src/core/events.ts` 及对应测试。

接口由模块定义并导出类型；事件不得包含原图、完整个人信息或原始 IP；可验证事件并从事件集合计算辅助保存上界、服务端回流、再次生成等指标，次数按人去重。

- [x] 写失败测试：自动入册/打开分享面板不算保存；失败重试与修复不算再次生成；访客重复和污染事件不改变指标；客户端不能伪造可信服务端回流事件。
- [x] 写字典及口径配置，保留旧门槛但明确旧分享指标已被用户替换，不擅自为新指标设值。
- [x] 实现纯函数并运行针对性测试。

## Task 4 集成与交付

- [x] 配置检查统一调用全部配置校验器；后续服务端工厂必须先通过检查才可发卡。
- [x] 校验配置失败的真实启动退出码；验证环境变量缺失及客户端导入服务端模块被拒绝。
- [x] 运行 `npm run check`，记录抽样分布和全部测试结果。
- [x] 独立代码评审、修复发现、再验证；README 写清实现内容、工程判断及本批边界。

## 工作区记录

最初系统 Git 因本机未接受 Xcode 许可而不可用；后找到应用附带的 Git，已在全新 `v0-prototype` 子目录初始化独立仓库和 `codex/v3-batch-one` 分支。不覆盖外层已有文件，不代用户接受许可，不复用外层远程地址、密钥或部署信息。最终验证后只做本地版本提交，远程仓库与部署按后续批次处理。

## 审阅记录

- 抽取、首抽归一、HMAC、请求号解析、版本指纹、启动检查、跨平台隔离测试经独立审阅，无未解决阻塞项。
- 输入审阅修复：角度必须是真实字符串；即使单脸也检查已指定主体索引；卡背每个模板条目必须为一句，位置标签不得夹带额外句号；模板不推断性别。
- 事件审阅修复：保留污染用户的正常行为；逐事件字段白名单；已确认门槛严格校验；按绝对时间统计再次创作；回流归因安全处理特殊匿名 ID。
- 实现过程先写针对性测试并观察失败，再填入实现；最终检查覆盖全部非视觉配置，不依赖未定稿的 layout/effect。
