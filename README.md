# 智瑜镜 · VectorBody TypeScript

**Vite + React + TypeScript + MediaPipe Tasks Vision** 的浏览器端瑜伽教学评估应用。依据 [原 Python VectorBody_v2 项目](https://github.com/dulaoyezi/VectorBody_v2) 的评分规则、拓扑树和 DLS 算法移植。部署到静态网站托管平台后，网站可独立运行，不再依赖你的电脑保持开机、运行 Uvicorn 或 Cloudflare Tunnel。

> **科学使用边界**：这是瑜伽教学辅助软件。S3 为视觉支撑/代偿代理指标，不等同于真实肌肉发力、关节载荷或医学诊断。重写版还需要真实样本与 Python 版进行端到端定量对照，不能直接沿用原论文的精度结论。

## 功能

- 8种体式：战士一式、战士二式、山式、简易坐、站立前屈式、眼镜蛇式、平衡式、下犬式。
- 正面/侧面视角和普通/初学者两种难度；使用完整的 Python 原始 16组体式 × 视角指标参数及原始初学者阈值。
- MediaPipe Pose Landmarker 33个人体关键点检测，GPU 优先、CPU 备用。
- OneEuroFilter 平滑。
- 骨盆根人体拓扑树（23个节点、21条边）。
- DLS 阻尼最小二乘逆运动学稳定（拟合/骨长/时间残差、阻尼及纠正步长限制）。
- 虚拟骨长一致性参考学习。
- 可解释 S1 / S2 / S3 与代偿风险评分，综合权重分别为 30% / 35% / 35%。
- 实时摄像评估：全身入镜、画面居中、2秒稳定窗口及骨架叠加。
- 视频评估：浏览器逐帧解码；短视频（不超过30秒）按约0.1秒采样，较长视频约0.2秒采样，最多分析前120秒。**优先使用持续约2秒的稳定片段；如果没有稳定片段，但存在满足关键点质量门槛的可评估帧，则返回真实评分并醒目标注「稳定性不足」或「部分关键点 · 低置信度」；无法识别可靠关键点时才报错。**
- 学习报告：用户明确点击后保存至**当前浏览器 IndexedDB**，可选是否保存截图；支持浏览、删除及导出 JSON。

## 视频分析不再因轻微晃动直接失败

- 原 Python Web 版的视频处理对人体中心的**相邻帧位移**使用 `0.012` 阈值，不满足就重新累计约2秒稳定时间。旧 TypeScript 版每约0.2秒采样，导致连续稳定条件更难成立。
- 新 TypeScript 版对短视频提高到约10 FPS，使用约2秒**滑动稳定窗口**，根据相对体型尺寸衡量中心漂移与关键关节漂移；并保留完整人体与部分人体的可评分帧。
- **取最高优先级结果**：稳定窗口内最佳帧 > 全身可识别的非稳定最佳帧 > 部分关键点可识别的低置信度最佳帧。评分始终来自 MediaPipe 实际检测和 VectorBody TypeScript 算法，绝不使用虚构分数。
- 没有满足2秒稳定保持要求时，界面、档案及 PDF 明确显示「非稳定片段 · 参考评分」，**不能宣称这是标准持姿评分或拥有已验证的稳定性**；如果关键点部分缺失，显示更显著的低置信度提示。
- 完全无法提取足够人体关键点时仍会明确报错，并给出采样、识别和有效帧计数；不生成虚构评估。
- **本次变更只应用于视频上传分析**，实时摄像头仍保留进入稳定状态的要求。没有提供具体测试视频的原文件，因此还需对上传视频进行浏览器端实测，确认它的编码、采样和姿态表现。

## 本次升级：姓名、原版界面和 PDF 报告

1. **受评者姓名**：实时评估与视频评估各有独立姓名输入框；可填写姓名或经过授权的匿名代号。开始评估时记录该输入并在保存后写入当前浏览器的 `SavedReport.studentName`，列表和报告会展示。升级前的旧记录若没有姓名，显示“未填写姓名”。
2. **还原 Python Web 主页**：直接移植原 `web/index.html` 的瑜伽人物 **SVG 路径**、暖白/橄榄绿/金色视觉、两个评估入口和技术可信度区域；四张原版人体正面/背面骨骼与肌肉示意图保存在 `public/anatomy/`，供报告和页面的部位定位使用。
3. **PDF 报告**：在实时/视频评估出结果后，可点击“**打印 / 保存 PDF 报告**”；也可在学习档案选择一条历史记录，点击“**打印 / 保存 PDF**”。浏览器打开打印窗口，选择“**目标 / 打印机 → 另存为 PDF**”即可生成文件。网页会暂时仅打印完整报告，不带导航。
4. **内容对齐 Python Web 版**：报告包括受评者、来源、正/侧位、普通/初学者、总体分数/等级、最佳有效帧原图与骨架标注、人体骨骼/肌肉部位定位、S1/S2/S3、整体代偿及分组风险、DLS 迭代和残差、虚拟骨长可信度、全部分项指标（值/评分/稳定性/权重）、纠正建议与教学辅助声明。
5. **隐私说明**：当前评估的 PDF 可以包含本次临时采集的最佳帧；如需在历史档案再次生成带照片的报告，需要先取得受评者同意，并勾选“在当前浏览器中保存原图与骨架标注图”。不勾选仍能存储评分报告，但归档后的 PDF 将显示无照片提示。视频不上传业务后端。

浏览器生成 PDF 使用原 Python Web 版同类的 **浏览器原生打印/另存为 PDF** 机制，不涉及服务端 Python PDF 库。生成后的 PDF 中文文本可被搜索；版式已针对 A4 配置，但不同浏览器的打印效果仍需用实机验证。

## 本地启动

**要求 Node.js 20+。** Windows PowerShell 或 macOS/Linux 终端：

~~~bash
git clone https://github.com/dulaoyezi/VectorBody_typeScript.git
cd VectorBody_typeScript
npm install
npm run dev
~~~

开发地址一般为 http://localhost:5173。摄像头需要 HTTPS 或 localhost 的安全上下文。

~~~bash
npm test
npm run build
npm run preview
~~~

构建输出为 **dist/**。它是独立前端项目，不需要将原 Python 的 FastAPI、PySide6 或 Dockerfile 混合进去。

## 智雅 / 其他静态托管平台部署

| 配置项 | 填写内容 |
|---|---|
| 框架 | Vite / React / TypeScript |
| 依赖安装命令 | npm install |
| 构建命令 | npm run build |
| 输出目录 | dist |
| Node.js 版本 | 20以上，建议22 |
| 项目根目录 | ./ |
| Python或Docker服务 | 无需 |
| 后端 API | 无需 |

平台发布站点需使用 **HTTPS**。浏览器设备必须能访问模型和 WASM 下载地址，视频格式也必须由浏览器支持。

模型及WASM默认资源：

- WASM: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm
- 模型: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task

如需配置自有资源，使用构建期变量 **VITE_MEDIAPIPE_WASM_URL**（完整WASM目录）与 **VITE_MEDIAPIPE_MODEL_URL**（模型.task文件地址）。浏览器需能访问这些地址，并且允许相应跨域请求。

## Python 与 TypeScript 源文件对照

| TS 模块 | Python 来源 |
|---|---|
| src/core/humanTopology.ts | core/human_topology.py |
| src/core/oneEuroFilter.ts | core/vector_body_stabilizer.py |
| src/core/topologyIK.ts | core/topology_ik.py |
| src/core/virtualBoneLength.ts | core/virtual_bone_length.py |
| src/core/compensationRiskEngine.ts | core/compensation_risk_engine.py |
| src/core/profiles.json | 所有 PoseCompensationProfile 和 MetricRule |
| src/vision/pose.ts | 将 MediaPipe Python Solutions API 改为 Web Tasks Vision |
| src/utils/reports.ts | SQLite 服务端档案改为 IndexedDB 本地档案 |

## 与原版的差异 / 后续必须做的验证

1. **MediaPipe 版本和模型推理接口改变**：Python Solutions 与浏览器 Tasks Vision 的33个点可能不完全一样。
2. **视频采样节奏不同**：Web版按约5–10 FPS分析视频以控制浏览器端耗时，且视频分析提供低置信度的无稳定片段回退；Python版每隔一帧解码，可能得到不同的最高分帧。
3. **报告储存不同**：Web版保存在用户当前浏览器，本地删除网站数据可能导致报告丢失；不同评委之间不共享记录，也没有账户隔离功能。
4. **科研一致性不能仅靠公式推断**：应使用相同关键点数组和相同视频双轨测试，比较 S1/S2/S3、总分、风险提醒和 DLS 稳定性。
5. **浏览器可阅读算法**：前端交付会把算法编译成用户可下载的 JS 包。如需保护商业核心，请改为服务器端 API。
6. **依赖隐私**：模型在浏览器端推理，不把视频上传到本项目自有后端；MediaPipe自身有遥测和隐私条款，需要单独评估并获得必要同意。
7. **正式赛事验收**：除了自动构建与单元测试，还需在专家将使用的设备上验证 HTTPS、摄像权限、模型下载、长视频性能与 IndexedDB。

## 自动测试

GitHub Actions 自动运行构建及 Vitest；核心测试覆盖 8种体式 × 2视角规则、23节点/21边拓扑、平滑器、DLS 数值及 S1/S2/S3 范围。

## 法律和使用边界

本仓库没有复制原有的解剖学图片、真实学生视频、评估数据库或 PySide6 桌面程序。商业分发前请核对实际团队成果归属与各开源组件的许可证。姿态评分属于教学辅助，不能代替运动损伤诊断、真实地面反作用力测量或教师专业判断。
