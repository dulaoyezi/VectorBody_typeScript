/**
 * Printable report follows Python VectorBody Web report structure:
 * evidence photographs, anatomical region findings, S1/S2/S3, risk,
 * DLS & bone quality, measured metric table, and correction advice.
 * Browser Print -> Save as PDF produces searchable Chinese text.
 */
import type { SavedReport } from "../core/types";
import { POSES } from "../core/types";
import { PROFILES } from "../core/compensationRiskEngine";
import AnatomyView from "./AnatomyView";
export interface Props { report:SavedReport }
const fmt=(n:number|undefined,digits=1)=>typeof n==="number"&&Number.isFinite(n)?n.toFixed(digits):"—";
export function reportRows(report:SavedReport) {
  const profile=PROFILES[report.pose+"_"+report.view];
  return profile.metrics.map(rule=>{
    const item=report.result.metrics[rule.name];
    return {key:rule.name,label:rule.label,value:item?.value,score:item?.score,stability:item?.stability,weight:rule.weight};
  });
}
export default function ReportDocument({report:r}:Props){
  const b=r.result,profile=PROFILES[r.pose+"_"+r.view];
  const drive=({hip:"髋关节",thoracic:"胸椎",shoulder:"肩关节"} as Record<string,string>)[profile.drive]??"关节";
  const name=POSES.find(p=>p.id===r.pose)?.name??r.pose;
  return <article className="pdf-report">
    <div className="pdf-brand"><span>智瑜镜 · VECTORBODY 2.0</span><span>EXPLAINABLE MOVEMENT EVIDENCE</span></div>
    <header className="pdf-cover">
      <div><div className="pdf-kicker">MOVEMENT EVIDENCE REPORT</div>
        <h1>{name}动作评分报告</h1>
        <p>可解释视觉 AI 瑜伽动作评估 · 教学辅助</p></div>
      <div className="pdf-grade"><strong>{Math.round(b.score)}</strong><small>/ 100 · {b.grade} 级</small></div>
    </header>
    <div className="pdf-meta">
      <div><span>受评者姓名</span><strong>{r.studentName?.trim()||"未填写"}</strong></div>
      <div><span>评估时间</span><strong>{new Date(r.createdAt).toLocaleString("zh-CN")}</strong></div>
      <div><span>评估来源</span><strong>{r.source==="live"?"实时摄像评估":"视频上传评估"}</strong></div>
      <div><span>观察视角</span><strong>{r.view==="front"?"正面":"侧面"} · {r.level==="beginner"?"初学者":"普通"}</strong></div>
      <div><span>动作驱动</span><strong>{drive}驱动类</strong></div>
      <div><span>报告编号</span><strong>{r.id}</strong></div>
    </div>
    <section className="pdf-section">
      <h2>01 · 最佳评分帧 · 档案照片</h2>
      <div className="pdf-evidence-images">
        {r.originalImage?<figure><img src={r.originalImage} alt="最佳评分帧原始照片"/><figcaption>原始照片</figcaption></figure>:<div className="pdf-no-photo">未保存原始照片</div>}
        {r.image?<figure><img src={r.image} alt="最佳评分帧骨架标注"/><figcaption>骨架标注</figcaption></figure>:<div className="pdf-no-photo">未保存骨架标注照片</div>}
      </div>
      <p className="pdf-caption">评分最高的有效帧{b.timeSec!==undefined?" · 最佳时刻 "+fmt(b.timeSec,2)+" s":""}{b.frameIndex!==undefined?" · 帧号 "+b.frameIndex:""}。不归档原始完整视频。</p>
    </section>
    <section className="pdf-section">
      <h2>02 · 论文三维评分与总体代偿风险</h2>
      <div className="pdf-dimensions">
        <div><span>S1 · 关节—姿态符合度</span><strong>{fmt(b.dimensions.s1)}</strong></div>
        <div><span>S2 · 拓扑稳定与代偿控制</span><strong>{fmt(b.dimensions.s2)}</strong></div>
        <div><span>S3 · 支撑—代偿视觉代理</span><strong>{fmt(b.dimensions.s3)}</strong></div>
      </div>
      <div className="pdf-stats">
        <div><span>总体代偿风险</span><strong>{fmt(b.riskPct)}%</strong></div>
        <div><span>灵活关节锁定风险</span><strong>{fmt(b.compensation.mobileLockPct)}%</strong></div>
        <div><span>非灵活关节代偿风险</span><strong>{fmt(b.compensation.stiffCompPct)}%</strong></div>
        <div><span>体态等级</span><strong>{b.grade}</strong></div>
      </div>
    </section>
    <section className="pdf-section">
      <h2>03 · 人体骨骼／肌肉 · 部位定位</h2>
      <AnatomyView result={b} printable/>
    </section>
    <section className="pdf-section">
      <h2>04 · 结构优化与骨长依据</h2>
      <div className="pdf-stats">
        <div><span>人体拓扑节点</span><strong>{b.topologyIK.nodes}</strong></div>
        <div><span>拓扑骨骼边</span><strong>{b.topologyIK.edges}</strong></div>
        <div><span>DLS 迭代次数</span><strong>{b.topologyIK.iterations}</strong></div>
        <div><span>DLS 初始残差</span><strong>{fmt(b.topologyIK.initialResidual,6)}</strong></div>
        <div><span>DLS 最终残差</span><strong>{fmt(b.topologyIK.finalResidual,6)}</strong></div>
        <div><span>平均向量长度</span><strong>{fmt(b.topologyIK.meanBoneLength,3)}</strong></div>
        <div><span>最大骨长误差</span><strong>{fmt(b.topologyIK.maxLengthErrorPct,2)}%</strong></div>
        <div><span>虚拟骨长状态</span><strong>{b.confidence.ready?(b.confidence.valid?"可信":"异常"):"窗口建立中"}</strong></div>
        <div><span>虚拟骨长质量</span><strong>{fmt(b.confidence.qualityPct)}%</strong></div>
        <div><span>虚拟骨长最大偏差</span><strong>{fmt(b.confidence.maxDeviationPct)}%</strong></div>
        <div><span>参考样本数量</span><strong>{b.confidence.referenceSamples??"—"}</strong></div>
        <div><span>保持阶段／采样</span><strong>{b.hold.label} · {b.confidence.learnReference?"采样中":"暂停采样"}</strong></div>
      </div>
    </section>
    <section className="pdf-section pdf-metric-section">
      <h2>05 · 分项指标与评分依据</h2>
      <table className="pdf-metric-table">
        <thead><tr><th>指标</th><th>观测值</th><th>评分</th><th>稳定性</th><th>权重</th></tr></thead>
        <tbody>{reportRows(r).map(x=><tr key={x.key}><td>{x.label}</td>
          <td>{fmt(x.value,2)}</td><td>{fmt(x.score,1)}</td>
          <td>{fmt(x.stability,3)}</td><td>{fmt(x.weight,2)}</td></tr>)}</tbody>
      </table>
    </section>
    <section className="pdf-section pdf-advice">
      <h2>06 · 可解释纠正与语音反馈</h2>
      <p>{b.advice||"暂无纠正建议。"}</p>
    </section>
    <footer className="pdf-disclaimer">
      <strong>教学辅助声明</strong>
      <p>本报告仅用于瑜伽动作学习与教学辅助，不用于医学诊断。S3 为单目视觉支撑／代偿代理指标，非实际力学负荷测量；解剖位置仅为近似提示。个人运动照片请在取得相应同意后保存与传播。</p>
      <span>VECTORBODY 2.0 · 报告生成于受评者当前浏览器</span>
    </footer>
  </article>;
}
