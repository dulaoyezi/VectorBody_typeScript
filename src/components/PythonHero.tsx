/**
 * Preserves the original Python FastAPI Web homepage yoga SVG.
 * Source: VectorBody_v2/web/index.html and web/styles.css.
 */
interface Props { onLive: () => void; onVideo: () => void }
export default function PythonHero({onLive,onVideo}: Props) {
  return <section className="python-hero">
    <div className="python-hero-copy">
      <span className="python-eyebrow"><i/> VECTORBODY 2.0 · HUMAN MOTION INTELLIGENCE</span>
      <h1>让每一次练习，<br/><em>都有迹可循。</em></h1>
      <p>从单目视觉到结构化人体理解，以可解释的姿态评估和及时反馈，让科学练习回归每一个动作。</p>
      <div className="python-hero-buttons">
        <button className="primary" onClick={onLive}>◎ 开启实时评估 <span>↗</span></button>
        <button className="secondary" onClick={onVideo}>▣ 上传视频评估</button>
      </div>
      <div className="python-hero-foot"><span>无需穿戴设备</span><span>支持8类体式</span><span>专业结构化评分</span></div>
    </div>
    <div className="python-hero-visual" aria-hidden="true">
      <div className="python-sun"/><div className="python-ground"/>
      <svg className="python-yoga-figure" viewBox="0 0 500 440">
        <g stroke="none" fill="#54654b">
          <circle cx="256" cy="92" r="26"/>
          <path d="M236 117 Q257 112 272 124 L282 202 Q277 225 258 229 L232 202Z"/>
          <path d="M239 138 Q200 135 179 158 L117 187 109 179 166 145 Q198 121 240 127Z"/>
          <path d="M271 139 Q300 119 346 140 L416 170 410 182 345 156 Q308 144 280 157Z"/>
          <path d="M235 207 Q220 235 197 255 L124 307 138 322 218 278 267 240Z"/>
          <path d="M266 210 Q292 235 325 247 L387 239 391 260 321 274 Q265 261 247 235Z"/>
          <path d="M112 305 Q98 321 68 329 L67 341 134 335 141 315Z"/>
          <path d="M384 241 Q411 241 440 225 L449 239 400 267 381 258Z"/>
        </g>
        <g fill="none" stroke="#f5f2e8" strokeWidth="3" opacity=".55">
          <path d="M256 125 252 205 244 232M249 139 178 151 118 183M273 144 346 145 415 177M244 228 199 264 132 314M254 228 320 260 390 252"/>
        </g>
        <g fill="#d5ae60" stroke="#fefdf9" strokeWidth="3">
          <circle cx="256" cy="125" r="5"/><circle cx="249" cy="139" r="5"/>
          <circle cx="178" cy="151" r="5"/><circle cx="118" cy="183" r="5"/>
          <circle cx="273" cy="144" r="5"/><circle cx="346" cy="145" r="5"/>
          <circle cx="415" cy="177" r="5"/><circle cx="244" cy="228" r="5"/>
          <circle cx="199" cy="264" r="5"/><circle cx="132" cy="314" r="5"/>
          <circle cx="320" cy="260" r="5"/><circle cx="390" cy="252" r="5"/>
        </g>
      </svg>
      <div className="python-float-note">
        <span className="python-note-icon">⌁</span><span><strong>身体结构可视化</strong><small>Pose · Topology · DLS</small></span>
      </div>
      <span className="python-vertical-type">MOVE WITH CLARITY</span>
    </div>
  </section>;
}
