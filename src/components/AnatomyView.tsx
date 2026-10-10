import { useState } from "react";
import type { MetricScore, ScoreResult } from "../core/types";
export type Region = "knees" | "ankles" | "shoulders" | "spine" | "neck" | "pelvis";
export type Severity = "high" | "medium" | "attention";
export interface Finding {
  metric:string; label:string; region:Region; regionLabel:string; severity:Severity;
  score:number; value:number; weight:number; advice:string;
}
const REGION_RULES: [string,Region][] = [
  ["knee","knees"],["ankle","ankles"],["heel","ankles"],["weight_center","pelvis"],
  ["shoulder","shoulders"],["thoracic","spine"],["spine","spine"],
  ["lumbar","spine"],["head","neck"],["cervical","neck"],["neck","neck"],
  ["pelvis","pelvis"],["hip","pelvis"],["core","spine"],
  ["arm","shoulders"],["balance","pelvis"],
];
const REGION_LABELS: Record<Region,string> = {
  knees:"膝关节",ankles:"踝足支撑",shoulders:"肩部",spine:"躯干与脊柱轴线",neck:"头颈部",pelvis:"骨盆与髋部"
};
const POSITIONS: Record<"front"|"back",Record<Region,[number,number][]>> = {
  front:{
    neck:[[50,18]],shoulders:[[36,25],[64,25]],spine:[[50,45]],
    pelvis:[[50,64]],knees:[[41,78],[59,78]],ankles:[[41,93],[59,93]]
  },
  back:{
    neck:[[50,18]],shoulders:[[35,25],[65,25]],spine:[[50,45]],
    pelvis:[[50,64]],knees:[[40,80],[60,80]],ankles:[[40,93],[60,93]]
  }
};
export function buildFindings(result:Pick<ScoreResult,"metrics">,limit=5):Finding[]{
  const findings:Finding[]=[];
  for(const [metric,item] of Object.entries(result.metrics)){
    const score=Number(item.score);
    if(!Number.isFinite(score)||score>=85)continue;
    const region=(REGION_RULES.find(([key])=>metric.includes(key))?.[1]??"spine") as Region;
    findings.push({
      metric,label:item.label||metric,region,regionLabel:REGION_LABELS[region],
      severity:score<55?"high":score<75?"medium":"attention",
      score,value:Number(item.value),weight:Number(item.weight),
      advice:item.note||"建议核对拍摄视角及动作要领，并由教师复核。"
    });
  }
  return findings.sort((a,b)=>a.score-b.score||b.weight-a.weight).slice(0,limit);
}
export interface AnatomyProps { result:Pick<ScoreResult,"metrics">; printable?:boolean }
export default function AnatomyView({result,printable=false}:AnatomyProps){
  const [orientation,setOrientation]=useState<"front"|"back">("front");
  const [layer,setLayer]=useState<"skeleton"|"muscle">("skeleton");
  const findings=buildFindings(result);
  const unique=[...new Map(findings.map(x=>[x.region,x])).values()].slice(0,4);
  const ext=layer==="skeleton"?"jpg":"png";
  const source=import.meta.env.BASE_URL+"anatomy/"+orientation+"_"+layer+"."+ext;
  return <div className={"anatomy-view"+(printable?" anatomy-printable":"")}>
    {!printable&&<div className="anatomy-switches">
      <div role="group" aria-label="人体观察方向">
        <button type="button" className={orientation==="front"?"selected":""} onClick={()=>setOrientation("front")}>正面</button>
        <button type="button" className={orientation==="back"?"selected":""} onClick={()=>setOrientation("back")}>背面</button>
      </div>
      <div role="group" aria-label="人体组织示意">
        <button type="button" className={layer==="skeleton"?"selected":""} onClick={()=>setLayer("skeleton")}>骨骼</button>
        <button type="button" className={layer==="muscle"?"selected":""} onClick={()=>setLayer("muscle")}>肌肉</button>
      </div>
    </div>}
    <div className="anatomy-columns">
      <figure className="anatomy-figure"><div className="anatomy-image-shell">
        <img src={source} alt={(orientation==="front"?"正面":"背面")+(layer==="skeleton"?"骨骼":"肌肉")+"示意图"}/>
        <div className="anatomy-pins" aria-hidden="true">
          {unique.flatMap(x=>POSITIONS[orientation][x.region].map(([left,top],i)=>
            <span key={x.metric+"-"+i} className={"anatomy-pin "+x.severity}
              style={{left:left+"%",top:top+"%"}} title={x.regionLabel+"："+x.label}/>))}
        </div>
      </div><figcaption>{orientation==="front"?"正面":"背面"}{layer==="skeleton"?"骨骼":"肌肉"}参考图 · 近似部位定位</figcaption></figure>
      <section className="anatomy-findings"><h4>重点关注部位</h4>
        {findings.length?findings.map((x,i)=><article className="finding-card" key={x.metric}>
          <span className={"finding-rank "+x.severity}>{String(i+1).padStart(2,"0")}</span>
          <div><strong>{x.regionLabel} · {x.label}</strong><p>{x.advice}</p>
            <small>分项评分 {x.score.toFixed(1)}/100 · 视觉辅助提示</small></div>
        </article>):<p className="no-findings">当前没有低于85分的分项指标；不代表没有身体问题，仍需教师复核。</p>}
      </section>
    </div>
    <p className="anatomy-note">红色或金色圆环仅根据低分关节指标作近似标注，不代表医学损伤诊断；切换解剖视图不代表额外拍摄了该视角。</p>
  </div>;
}
