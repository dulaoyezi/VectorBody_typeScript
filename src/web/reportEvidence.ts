/**
 * Port of report_evidence.py/build_findings:
 * deterministic risk-issue regions; NEVER injury/disease identification.
 */
import type { PoseId, View, MetricScore } from "../core/types";
import { PROFILES } from "../core/compensationRiskEngine";
const REGION_RULES=[
 ["knee","knees"],["ankle","ankles"],["heel","ankles"],["weight_center","pelvis"],
 ["shoulder","shoulders"],["thoracic","spine"],["spine","spine"],
 ["lumbar","spine"],["head","neck"],["cervical","neck"],["neck","neck"],
 ["pelvis","pelvis"],["hip","pelvis"],["core","spine"],["arm","shoulders"],["balance","pelvis"]
] as const;
const LABELS:Record<string,string>={
 knees:"膝关节",ankles:"踝足支撑",shoulders:"肩部",spine:"躯干与脊柱轴线",
 neck:"头颈部",pelvis:"骨盆与髋部"
};
export interface Finding {
 metric:string;label:string;region:string;region_label:string;
 severity:"high"|"medium"|"attention";
 score:number;value:number;weight:number;advice:string
}
export function findingRegion(metric:string):string {
 for(const [pattern,region] of REGION_RULES)if(metric.includes(pattern))return region;
 return "spine";
}
export function buildFindings(
 scores:Record<string,MetricScore>,pose:PoseId,view:View,limit=5
):Finding[] {
 const profile=PROFILES[pose+"_"+view];
 const rules=new Map(profile.metrics.map(r=>[r.name,r]));
 const findings:Finding[]=[];
 for(const [metric,item] of Object.entries(scores)){
   const score=Number(item.score);
   if(!Number.isFinite(score)||score>=85)continue;
   const rule=rules.get(metric);
   const region=findingRegion(metric);
   findings.push({
     metric,label:rule?.label??metric.replace(/_/g," "),region,region_label:LABELS[region],
     severity:score<55?"high":score<75?"medium":"attention",
     score:Number(score.toFixed(1)),value:Number(item.value.toFixed(2)),
     weight:Number(item.weight.toFixed(3)),
     advice:rule?.note??"建议核对拍摄视角及动作要领，并由教师复核。"
   });
 }
 findings.sort((a,b)=>a.score-b.score||b.weight-a.weight);
 return findings.slice(0,limit);
}
