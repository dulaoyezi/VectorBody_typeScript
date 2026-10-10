/**
 * Port of VectorBody_v2 core/compensation_risk_engine.py.
 * Pose rules/thresholds originate from profiles.json, extracted from the Python source.
 * S3 is a visual force/compensation proxy; NO physical force or injury diagnosis is inferred.
 */
import sourceProfiles from "./profiles.json";
import type { DetectedPoint, Landmarks, Level, MetricRule, MetricScore, Point, PoseId, PoseProfile, ScoreResult, View } from "./types";
import { angle3pt, clamp, horizontalTilt, mean, midpoint, norm, rounded, standardDeviation } from "./math";
import { buildTopology } from "./humanTopology";
import { OneEuroFilter } from "./oneEuroFilter";
import { TopologyIKStabilizer } from "./topologyIK";
import { VirtualBoneLengthTracker } from "./virtualBoneLength";

export const PROFILES = sourceProfiles as unknown as Record<string,PoseProfile>;
type MetricValues = Record<string, number>;
const KEY_INDICES = [11,12,13,14,15,16,23,24,25,26,27,28];
const REQUIRED_VISIBLE = [11,12,15,16,23,24,25,26,27,28];
export function inView(points: DetectedPoint[]): boolean {
  return points.length>=33 && REQUIRED_VISIBLE.every(i=>{
    const p=points[i];
    return p.x>=-0.03&&p.x<=1.03&&p.y>=-0.03&&p.y<=1.03&&p.visibility>=0.30;
  });
}
export function centered(points: DetectedPoint[], width: number, height: number): boolean {
  const indices=[11,12,23,24];
  const x=mean(indices.map(i=>points[i].x)),y=mean(indices.map(i=>points[i].y));
  return Math.hypot((x-0.5)*width,(y-0.5)*height)<0.43*Math.min(width,height);
}
function computeMetrics(p: Landmarks): MetricValues {
  const n=buildTopology(p).nodes;
  const kneeAngle = {
    left:angle3pt(n.left_hip,n.left_knee,n.left_ankle),
    right:angle3pt(n.right_hip,n.right_knee,n.right_ankle),
  };
  const front: "left"|"right" = Math.abs(kneeAngle.left-kneeAngle.right)>=8
    ? (kneeAngle.left<kneeAngle.right?"left":"right")
    : (p[27][0]>p[28][0]?"right":"left");
  const back=front==="left"?"right":"left";
  const sh=n.shoulder_center,hp=n.pelvis_center;
  const elevate=(shoulder:Point,wrist:Point)=>{
    const dx=wrist[0]-shoulder[0],dy=wrist[1]-shoulder[1];
    return Math.acos(clamp(dy/(Math.hypot(dx,dy)+1e-6),-1,1))*180/Math.PI;
  };
  const shoulderElevation=(elevate(n.right_shoulder,n.right_wrist)+elevate(n.left_shoulder,n.left_wrist))/2;
  const thoracicTilt=horizontalTilt(n.left_shoulder,n.right_shoulder);
  const pelvisTilt=horizontalTilt(n.left_hip,n.right_hip);
  const cervical=Math.abs(n.nose[0]-(sh[0]+hp[0])/2)*100;
  const lumbar=Math.atan2(sh[0]-hp[0],Math.abs(sh[1]-hp[1])+1e-6)*180/Math.PI;
  const shoulderHorizontal=(Math.abs(n.left_wrist[1]-n.left_shoulder[1])+Math.abs(n.right_wrist[1]-n.right_shoulder[1]))*50;
  const hipOpening=angle3pt(n[front+"_knee"],n[front+"_hip"],hp);
  const midAnkle=midpoint(n.left_ankle,n.right_ankle);
  const spineLine=Math.abs(180-angle3pt(hp,sh,n.head_center));
  const hipFold=angle3pt(sh,hp,midAnkle);
  const kneeControl=Math.min(kneeAngle.left,kneeAngle.right);
  const weightCenter=Math.abs(hp[0]-midAnkle[0])*100;
  const kneeSymmetry=Math.abs(n.left_knee[1]-n.right_knee[1])*100;
  const kneeStack=Math.abs(n.left_knee[0]-n.right_knee[0])*100;
  const pelvisFB=Math.abs(hp[0]-sh[0])*100;
  const armAsym=Math.abs(
    norm([n.left_wrist[0]-n.left_shoulder[0],n.left_wrist[1]-n.left_shoulder[1]])
    -norm([n.right_wrist[0]-n.right_shoulder[0],n.right_wrist[1]-n.right_shoulder[1]])
  )*100;
  const shoulderWrist=(Math.abs(n.left_wrist[0]-n.left_shoulder[0])+Math.abs(n.right_wrist[0]-n.right_shoulder[0]))*50;
  const shoulderLoad=Math.max(thoracicTilt,armAsym,shoulderWrist);
  const heelLift=(Math.max(0,n.left_foot_index[1]-n.left_heel[1])+Math.max(0,n.right_foot_index[1]-n.right_heel[1]))*50;
  const spineVertical=Math.abs(lumbar);
  return {
    shoulder_elevation:shoulderElevation,thoracic_lateral_proxy:Math.abs(thoracicTilt),
    pelvis_tilt_proxy:Math.abs(pelvisTilt),cervical_lateral_proxy:cervical,
    lumbar_lateral_proxy:Math.abs(lumbar),shoulder_horizontal_proxy:shoulderHorizontal,
    front_hip_opening_proxy:hipOpening,knee_front_flex:kneeAngle[front],knee_back_ext:kneeAngle[back],
    spine_vertical:spineVertical,shoulder_symmetry:Math.abs(thoracicTilt),pelvis_level:Math.abs(pelvisTilt),
    neck_axis:cervical,spine_line:spineLine,pelvis_tilt:Math.abs(pelvisTilt),knee_lock:kneeControl,
    weight_center:weightCenter,pelvis_balance:Math.abs(pelvisTilt),knee_symmetry:kneeSymmetry,
    spine_upright:spineVertical,shoulder_relax:Math.abs(thoracicTilt),spine_curve:spineLine,
    pelvis_forward_back:pelvisFB,head_forward:cervical,knee_stack:kneeStack,
    hip_hinge:hipFold,knee_control:kneeControl,balance:weightCenter,hip_depth:hipFold,
    spine_round:spineLine,weight_shift:weightCenter,spine_extension:spineLine,
    shoulder_level:Math.abs(thoracicTilt),pelvis_contact:Math.abs(pelvisTilt),neck_extend:cervical,
    spine_arc:spineLine,hip_stability:Math.abs(pelvisTilt),shoulder_load:shoulderLoad,neck_comp:cervical,
    vertical_axis:spineVertical,ankle_control:weightCenter,core_balance:(spineVertical+Math.abs(pelvisTilt))/2,
    tilt_forward_back:spineVertical,hip_stack:pelvisFB,hip_angle:hipFold,heel_contact:-heelLift,
    hip_height:hipFold,shoulder_support:shoulderLoad,heel_extend:-heelLift
  };
}
function geometricRisk(rule: MetricRule,v: number,level: Level): number {
  const a=level==="beginner"?rule.beginnerA:rule.a;
  const b=level==="beginner"?rule.beginnerB:rule.b;
  let diff=0;
  if(rule.mode==="range")diff=v<a?a-v:(v>b?v-b:0);
  else if(rule.mode==="upper")diff=v-a;
  else if(rule.mode==="lower")diff=a-v;
  else if(rule.mode==="target")diff=Math.abs(v-a)-b;
  return clamp(diff/rule.gain);
}
interface HoldDetail {
  ready:boolean; phase:string; label:string; motionRatio:number; motionThreshold:number;
  stability:number; minStability:number; scoreOk:boolean; historyReady:boolean; motionReady:boolean;
}
export class VectorBodyEngine {
  private filter=new OneEuroFilter();
  private ik=new TopologyIKStabilizer();
  private bones=new VirtualBoneLengthTracker();
  private metricHistory: Record<string,number[]> = {};
  private motionPoints: number[][] = []; private motionHistory:number[]=[];
  constructor(readonly level:Level="normal",readonly historyLen=12) {}
  reset(){
    this.filter.reset();this.ik.reset();this.bones.reset();
    this.metricHistory={};this.motionPoints=[];this.motionHistory=[];
  }
  private stability(name:string):number {
    const xs=this.metricHistory[name]??[];
    if(xs.length<3)return 1;
    return clamp(1-standardDeviation(xs)/(this.level==="beginner"?8:6));
  }
  private updateMotion(p:Landmarks):number {
    const xy=KEY_INDICES.flatMap(i=>[p[i][0],p[i][1]]);
    const ys=p.map(v=>v[1]),bodyHeight=Math.max(...ys)-Math.min(...ys)+1e-6;
    let motion=1;
    if(this.motionPoints.length){
      const prev=this.motionPoints[this.motionPoints.length-1];
      const changes=KEY_INDICES.map((_,i)=>Math.hypot(xy[2*i]-prev[2*i],xy[2*i+1]-prev[2*i+1]));
      motion=mean(changes)/bodyHeight;
    }
    this.motionPoints.push(xy);
    if(this.motionPoints.length>Math.max(8,this.historyLen))this.motionPoints.shift();
    this.motionHistory.push(motion);
    if(this.motionHistory.length>8)this.motionHistory.shift();
    return motion;
  }
  private holdState(profile:PoseProfile,p:Landmarks,provisional:number,scores:Record<string,MetricScore>):HoldDetail {
    this.updateMotion(p);
    const motionRatio=mean(this.motionHistory);
    const motionThreshold=this.level==="beginner"?0.035:0.025;
    const scoreOk=provisional>=(this.level==="beginner"?65:70);
    const values=profile.metrics.map(rule=>scores[rule.name]?.stability??0);
    const stable=mean(values),minimum=Math.min(...values);
    const historyReady=profile.metrics.every(rule=>(this.metricHistory[rule.name]?.length??0)>=Math.min(8,this.historyLen));
    const motionReady=this.motionHistory.length>=5;
    const stabilityOk=historyReady&&stable>=0.65&&minimum>=0.45;
    const motionOk=motionReady&&motionRatio<=motionThreshold;
    const ready=scoreOk&&stabilityOk&&motionOk;
    let phase="preparing",label="准备中";
    if(ready){phase="holding";label="保持中";}
    else if(!scoreOk){phase="preparing";label="准备中";}
    else if(!historyReady||!motionReady){phase="building_window";label="建立保持窗口";}
    else{phase="adjusting";label="调整中";}
    return {ready,phase,label,motionRatio,motionThreshold,stability:stable,minStability:minimum,scoreOk,historyReady,motionReady};
  }
  analyze(points:DetectedPoint[],pose:PoseId,view:View,timeSec?:number,frameIndex?:number):ScoreResult|null {
    if(points.length<33||points[23].y>0.9||points[24].y>0.9)return null;
    const profile=PROFILES[pose+"_"+view];
    if(!profile)throw new Error("不支持的体式与视角");
    const raw=points.map(p=>[p.x,p.y,p.z] as Point);
    if(raw.some(p=>p.some(v=>!Number.isFinite(v))))return null;
    const smoothed=this.filter.smooth(raw);
    const ik=this.ik.stabilize(smoothed);
    const metrics=computeMetrics(ik.landmarks);
    const scores:Record<string,MetricScore>={},notes:string[]=[];
    let mobileSum=0,stiffSum=0,mobileWeight=0,stiffWeight=0;
    let weightedGeom=0,weightedStability=0,totalWeight=0;
    for(const rule of profile.metrics) {
      const value=metrics[rule.name];
      const hist=this.metricHistory[rule.name]??[];
      hist.push(value);
      if(hist.length>this.historyLen)hist.shift();
      this.metricHistory[rule.name]=hist;
      const geomRisk=geometricRisk(rule,value,this.level);
      const stability=this.stability(rule.name);
      const risk=clamp((1-rule.stabilityWeight)*geomRisk+rule.stabilityWeight*(1-stability));
      scores[rule.name]={value:rounded(value,3),geomRisk,risk,stability:rounded(stability,4),
        score:rounded(100*(1-risk),2),weight:rule.weight,label:rule.label,note:rule.note};
      if(geomRisk>0.15||1-stability>0.35)notes.push(rule.note);
      if(rule.category==="mobile"){mobileSum+=risk*rule.weight;mobileWeight+=rule.weight;}
      else{stiffSum+=risk*rule.weight;stiffWeight+=rule.weight;}
      weightedGeom+=(1-geomRisk)*rule.weight;
      weightedStability+=stability*rule.weight;
      totalWeight+=rule.weight;
    }
    const mobileRisk=mobileWeight?mobileSum/mobileWeight:0;
    const stiffRisk=stiffWeight?stiffSum/stiffWeight:0;
    const combined=(mobileRisk*profile.mobileWeight+stiffRisk*profile.stiffWeight)/(profile.mobileWeight+profile.stiffWeight);
    const hold=this.holdState(profile,ik.landmarks,100*(1-combined),scores);
    const bone=this.bones.update(ik.topology,hold.ready);
    const joint=totalWeight?clamp(weightedGeom/totalWeight)*100:0;
    const metricStability=totalWeight?clamp(weightedStability/totalWeight):0;
    const boneQuality=bone.ready?bone.quality:metricStability;
    const motionScore=clamp(1-hold.motionRatio/Math.max(2*(hold.motionThreshold+1e-6),1e-6));
    const topology=(0.55*metricStability+0.25*clamp(boneQuality)+0.20*motionScore)*100;
    const proxy=clamp(1-combined)*100;
    const score=clamp(0.30*joint+0.35*topology+0.35*proxy,0,100);
    const grade:ScoreResult["grade"]=score>=85?"A":score>=70?"B":score>=55?"C":"D";
    const drive=({hip:"髋关节",thoracic:"胸椎",shoulder:"肩关节"} as Record<string,string>)[profile.drive]||"关节";
    const advice=grade==="A"?(profile.title+"当前以"+drive+"驱动为主，动作质量很好，继续保持呼吸和延展。")
      :grade==="B"?"轻度代偿风险："+(notes[0]||"微调骨盆和肋骨对位。")
      :grade==="C"?"中度代偿风险："+(notes.slice(0,2).join("；")||"缩小幅度，优先找稳定。")
      :"高风险预警：先退回到安全幅度。"+(notes[0]?" "+notes[0]:"");
    return {
      score:rounded(score),grade,riskPct:rounded((1-score/100)*100),advice,
      dimensions:{s1:rounded(joint),s2:rounded(topology),s3:rounded(proxy)},
      compensation:{mobileLockPct:rounded(mobileRisk*100),stiffCompPct:rounded(stiffRisk*100)},
      confidence:{ready:bone.ready,valid:bone.valid,qualityPct:rounded(bone.quality*100),
        maxDeviationPct:rounded(bone.maxDeviation*100),abnormalEdges:bone.abnormalEdges,
        referenceSamples:bone.referenceSamples,learnReference:bone.learnReference},
      topologyIK:{nodes:ik.detail.nodes,edges:ik.detail.edges,iterations:ik.detail.iterations,
        initialResidual:rounded(ik.detail.initialResidual,6),finalResidual:rounded(ik.detail.finalResidual,6),
        maxLengthErrorPct:rounded(ik.detail.maxLengthError*100,3),
        meanBoneLength:rounded(ik.detail.meanBoneLength,6)},
      hold:{ready:hold.ready,phase:hold.phase,label:hold.label,motionRatio:rounded(hold.motionRatio,4),stability:rounded(hold.stability,3)},
      metrics:scores,landmarks:points.map(p=>({...p})),timeSec,frameIndex
    };
  }
}
