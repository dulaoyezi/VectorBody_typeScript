/**
 * Original Python full-body, centering and strict 2-second hold logic.
 * Diagnostic counters explain missing reports, without fabricating any score.
 */
import { inView, centered } from "../core/compensationRiskEngine";
import type { DetectedPoint } from "../core/types";
import { PythonStableHold } from "./pythonParity";
export interface VideoDiagnostics {
  processed:number;detected:number;inView:number;centered:number;
  stable:number;evaluated:number;scoreRejected:number;
}
export type VideoStage="no_person"|"out_of_frame"|"off_center"|"stabilizing"|"ready";
export interface VideoAcceptance {stage:VideoStage;display:[number,number,number][]|null}
export class PythonVideoEvaluator {
  readonly stats:VideoDiagnostics={
    processed:0,detected:0,inView:0,centered:0,stable:0,evaluated:0,scoreRejected:0
  };
  private readonly hold=new PythonStableHold();
  inspect(time:number,points:DetectedPoint[]|null,width:number,height:number):VideoAcceptance {
    this.stats.processed++;
    if(!points||points.length<33){this.hold.reset();return {stage:"no_person",display:null};}
    this.stats.detected++;
    const display=points.map(p=>[Number(p.x.toFixed(5)),Number(p.y.toFixed(5)),Number(p.visibility.toFixed(3))] as [number,number,number]);
    if(!inView(points)){this.hold.reset();return {stage:"out_of_frame",display};}
    this.stats.inView++;
    if(!centered(points,width,height)){this.hold.reset();return {stage:"off_center",display};}
    this.stats.centered++;
    const ids=[11,12,23,24];
    const point:[number,number]=[
      ids.reduce((sum,i)=>sum+display[i][0],0)/4,
      ids.reduce((sum,i)=>sum+display[i][1],0)/4
    ];
    if(!this.hold.observe(time,point))return {stage:"stabilizing",display};
    this.stats.stable++;
    return {stage:"ready",display};
  }
  evaluated(valid:boolean){if(valid)this.stats.evaluated++;else this.stats.scoreRejected++;}
}
export function videoFailureReason(s:VideoDiagnostics):string {
  const suffix="（处理 "+s.processed+" 帧，检测人体 "+s.detected+" 帧，全身可见 "+
    s.inView+" 帧，居中 "+s.centered+" 帧，稳定 "+s.stable+" 帧，评分 "+s.evaluated+" 帧）";
  if(!s.processed)return "视频未能解码出画面。"+suffix;
  if(!s.detected)return "未检测到人体33关键点，请检查画面与编码。"+suffix;
  if(!s.inView)return "检测到人体，但未满足原版的全身入镜、关节可见度要求。"+suffix;
  if(!s.centered)return "全身可见，但未进入原版的画面中心检测区域。"+suffix;
  if(!s.stable)return "未找到连续稳定2秒以上的有效姿态；原版0.012稳定阈值未改变。"+suffix;
  if(!s.evaluated && s.scoreRejected>0)return "已通过连续稳定2秒判定，但评分未满足原版有效保持/姿态约束（例如骨盆越界、评分门槛或保持窗口不足）；请检查体式、拍摄视角与评分条件。"+suffix;
  return "已识别稳定姿态，但未生成有效评分。"+suffix;
}
