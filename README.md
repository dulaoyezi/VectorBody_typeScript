# VectorBody 2.0 · TypeScript（忠实迁移 Python Web 版本）

本仓库以 [VectorBody_v2](https://github.com/dulaoyezi/VectorBody_v2) 的 **Web 版代码** 为功能与界面基准，移植到 TypeScript + MediaPipe Tasks Vision。**仅新增“受评者姓名”输入并写入自动归档记录**，不再使用之前独立设计的 React UI，也不再使用非稳定帧回退评分。

## 严格保持的 Python Web 业务规则

| 功能 | 与原 Python Web 对应 |
|---|---|
| 首页 | 原 `web/index.html` 的瑜伽人物 SVG、菜单、模块结构、配色与布局；原 `web/styles.css` |
| 两种输入 | 摄像头实时评估、视频上传分析 |
| 体式 | 8种（战士一／二式、山式、简易坐、站立前屈、眼镜蛇式、平衡式、下犬式） |
| 阈值模式 | 正面／侧面、普通／初学者；直接使用原 Python 的 `MetricRule` 配置及阈值 |
| 姿态链 | MediaPipe 33点 → OneEuroFilter → 骨盆根人体拓扑（23节点／21边）→ DLS稳定／骨长一致性 → S1/S2/S3 |
| 分数 | 原风险规则，权重 S1 30%、S2 35%、S3 35%；不会使用随机或固定演示分数 |
| 实时稳定 | 要求全身入镜、居中、中心位移阈值0.012、连续稳定约2秒后正式评分；失去入镜时重置 |
| 视频稳定 | 按原版“每隔2帧采样、最多1800个处理帧、0.012中心移动阈值、稳定2秒后评分”的业务逻辑；**找不到稳定帧就明确返回原版错误** |
| 存档 | 停止实时检测或完成视频分析时**自动存档**，保留最高评分有效帧及原图／骨架叠加图，不存完整视频 |
| 报告 | 原 `web/app.js` 显示顺序和字段：综合分、S1/S2/S3、风险、拓扑DLS与骨长、分项指标、纠错文本、人体骨骼／肌肉参考图及定位、打印／另存为PDF |
| 语音反馈 | 保留浏览器语音提示、稳定阶段引导、动作评分与纠错播报 |

**唯一新增的业务输入**：`实时评估` 与 `视频评估` 各有 `姓名或匿名代号` 字段，传入会话／报告，评估后姓名随记录自动保存，报告列表、详情及打印中显示姓名。老报告没有姓名时显示“未填写姓名”。

## TypeScript 与 Python 的不可消除差异

需明确：**跨编程语言、跨 MediaPipe 运行环境，不可能在未经实测前保证两个版本逐帧像素和评分完全相同。**

- 原 Python Web 使用 `mediapipe.solutions.pose.Pose` + OpenCV；本项目使用浏览器 `@mediapipe/tasks-vision`。两者虽然都输出33点，但模型与解码误差可能造成评分差异。需要在**同一段视频**上比较 S1/S2/S3、最佳帧、MAE和风险提示。
- 原 Python 使用 OpenCV 获取真实视频帧率并按帧号取样；HTMLVideoElement **不直接暴露源帧率**，当前默认按30fps估算帧索引（相当于15次采样/秒）。非30fps视频不保证取到同一帧。部分AVI／MKV视频浏览器本身不支持解码。
- 原 Python Web 的报告保存在服务器 SQLite，所有获准访问服务器的用户共享存档；为了在不运行 Python 服务器的静态托管平台上使用，本项目当前保存到**当前浏览器的 IndexedDB**，不同设备**不共享**。因此不能声称数据存储行为已经一比一复刻；需要独立的 TypeScript Node 服务与服务端 SQLite 才能完全恢复这点。
- 原仓库还包含 **PySide6 Windows 桌面应用**及额外工具脚本；本项目的迁移范围是 Python Web 版，并未把 Qt 桌面系统伪称为浏览器产品。
- S3只是视觉支撑／代偿代理，不是肌肉力或诊断结论。

## 运行

要求 Node.js 22（或20+），打开终端：

```bash
git clone https://github.com/dulaoyezi/VectorBody_typeScript.git
cd VectorBody_typeScript
npm install
npm run dev
```

本地访问 Vite 输出的地址（一般为 http://localhost:5173）。首次使用需要浏览器下载 MediaPipe 模型及 WASM 文件。摄像头需要 HTTPS 或 localhost。

```bash
npm test
npm run build
npm run preview
```

## 智雅 / GitHub Pages / 静态托管

- 框架：**Vite + TypeScript（无 React、无 Python、无 Node 后端）**
- 安装：`npm install`
- 构建：`npm run build`
- 目录：`dist`
- 需要 HTTPS 以使用摄像头。

MediaPipe 模型仍采用浏览器外部资源：

- WASM `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`
- 模型 `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`

若服务器屏蔽了这些源，可设置 `VITE_MEDIAPIPE_WASM_URL` 与 `VITE_MEDIAPIPE_MODEL_URL` 为可访问的镜像地址。

## 关键源码对照

| TypeScript 文件 | 原 Python 文件 |
|---|---|
| `index.html`, `src/web/styles.css`, `src/web/main.ts` | `web/index.html`, `web/styles.css`, `web/app.js` |
| `src/web/browserApi.ts` | `web_app.py` 的会话、评分、录像、报告业务流程 |
| `src/web/reportEvidence.ts` | `report_evidence.py` 的分项风险及位置映射 |
| `src/web/pythonParity.ts` | `web_app.py` 的帧率步长、稳定判定等常量 |
| `src/core/compensationRiskEngine.ts`, `profiles.json` | `core/compensation_risk_engine.py` |
| `src/core/humanTopology.ts` | `core/human_topology.py` |
| `src/core/topologyIK.ts` | `core/topology_ik.py` |
| `src/core/virtualBoneLength.ts` | `core/virtual_bone_length.py` |
| `src/core/oneEuroFilter.ts` | `core/vector_body_stabilizer.py` |
| `src/utils/reports.ts` | `web_app.py` 报告存储层（浏览器 IndexedDB 替代） |

## 检查

GitHub Actions 构建与单元测试可检验关键技术常量、各体式阈值、拓扑、IK和原版 UI 结构。**自动化类型检查／单元测试不能替代真实手机摄像与视频端到端测试**。用真实视频和 Python 原版对照前，不沿用原论文的性能数据。

**隐私与授权**：录入真实姓名及存储人体照片时取得适当同意。浏览器档案不具备云端同步／账号隔离，可主动清除浏览器数据。该系统仅作教学辅助，不用于医学诊断。 
