/** Original Python Web homepage sections adapted from web/index.html. */
interface Props { onLive:()=>void; onVideo:()=>void }
export default function PythonHomeSections({onLive,onVideo}:Props){
  return <>
    <div className="python-section-heading">
      <div><span className="python-section-kicker">WHAT YOU CAN DO</span><h2>一套引擎，两种评估方式</h2></div>
      <p>从日常实时训练，到完整视频回看，<br/>依据同一套运动结构与风险评分体系。</p>
    </div>
    <div className="python-entry-grid">
      <button className="python-entry-card" onClick={onLive}>
        <span className="python-entry-icon">◎</span>
        <span><small>01 / LIVE ASSESSMENT</small><strong>实时摄像评估</strong><span>语音动作引导 · 稳定自动评分 · 即时纠正</span></span>
        <span className="python-entry-arrow">→</span>
      </button>
      <button className="python-entry-card" onClick={onVideo}>
        <span className="python-entry-icon gold">▣</span>
        <span><small>02 / VIDEO ANALYSIS</small><strong>视频动作分析</strong><span>逐帧检测 · 最佳表现帧 · 结构化报告</span></span>
        <span className="python-entry-arrow">→</span>
      </button>
    </div>
    <div className="python-credibility">
      <div><span className="python-eyebrow">THE SCIENCE INSIDE</span><strong>真正可解释的动作分析</strong>
        <p>MediaPipe Pose 33关键点 · OneEuroFilter · 骨盆根人体拓扑 · DLS稳定优化 · 虚拟骨长一致性 · S1/S2/S3</p></div>
      <div className="python-cred-badge"><span>◇</span><div>教学辅助工具<br/><small>非医疗诊断</small></div></div>
    </div>
  </>;
}
