/**
 * Robust offline-video frame eligibility and two-second hold assessment.
 *
 * Unlike the original frame-to-frame 0.012 body-center threshold, the hold
 * check uses a sliding 2-second temporal window and scale-normalized drift.
 * A failed hold check does not discard otherwise measurable pose frames.
 * Lower-confidence video outcomes are explicitly flagged in ScoreResult.
 */
import type { DetectedPoint } from "./types";
import { centered, inView } from "./compensationRiskEngine";

export type VideoFrameTier = "full" | "partial" | "none";
export interface VideoFrameInspection {
  tier: VideoFrameTier;
  reason: "full" | "partial_visibility" | "not_detected" | "invalid_points" | "out_of_frame";
  visibleMajor: number;
}

const MAJOR_JOINTS = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28];
const TRUNK_JOINTS = [11, 12, 23, 24];
const LEG_JOINTS = [25, 26, 27, 28];

function visible(point: DetectedPoint | undefined, threshold: number, margin: number): boolean {
  return point !== undefined
    && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
    && point.x >= -margin && point.x <= 1 + margin
    && point.y >= -margin && point.y <= 1 + margin
    && (point.visibility ?? 0) >= threshold;
}

/**
 * "full" matches the original Python Web strict framing criteria.
 * "partial" requires enough independent major landmarks for cautious reference
 * scoring but is never presented as a verified stable full-body assessment.
 */
export function inspectVideoFrame(points: DetectedPoint[] | null, width: number, height: number): VideoFrameInspection {
  if (!points || points.length < 33) return {tier:"none",reason:"not_detected",visibleMajor:0};
  if (points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z))) {
    return {tier:"none",reason:"invalid_points",visibleMajor:0};
  }
  const visibleMajor=MAJOR_JOINTS.filter(i=>visible(points[i],0.20,0.06)).length;
  if (inView(points) && centered(points,width,height))
    return {tier:"full",reason:"full",visibleMajor};
  const visibleCore=TRUNK_JOINTS.filter(i=>visible(points[i],0.22,0.06));
  const visibleLeg=LEG_JOINTS.filter(i=>visible(points[i],0.20,0.06));
  const shoulders=visibleCore.filter(i=>i===11||i===12);
  const hips=visibleCore.filter(i=>i===23||i===24);
  if (visibleMajor < 6 || visibleCore.length < 3 || !shoulders.length || !hips.length || visibleLeg.length < 2) {
    return {tier:"none",reason:"out_of_frame",visibleMajor};
  }
  const centroidX=visibleCore.reduce((s,i)=>s+points[i].x,0)/visibleCore.length;
  const centroidY=visibleCore.reduce((s,i)=>s+points[i].y,0)/visibleCore.length;
  const centeredEnough=Math.hypot((centroidX-0.5)*width,(centroidY-0.5)*height) <= 0.55*Math.min(width,height);
  return centeredEnough
    ? {tier:"partial",reason:"partial_visibility",visibleMajor}
    : {tier:"none",reason:"out_of_frame",visibleMajor};
}

type Sample = {t:number; cx:number; cy:number; height:number; joints: [number,number][]};
const HOLD_JOINTS=[11,12,23,24,25,26,27,28];

/**
 * Approximate steadiness rather than medical biomechanical motion detection.
 * For stability, at least 1.8s of continuously usable *full* frames must fit
 * within scale-relative limits (torso-center range and median joint drift).
 */
export class VideoHoldWindow {
  private samples: Sample[]=[];
  reset(){this.samples=[];}
  push(t:number,points:DetectedPoint[]):boolean{
    const cx=TRUNK_JOINTS.reduce((s,i)=>s+points[i].x,0)/TRUNK_JOINTS.length;
    const cy=TRUNK_JOINTS.reduce((s,i)=>s+points[i].y,0)/TRUNK_JOINTS.length;
    const usable=HOLD_JOINTS.filter(i=>visible(points[i],0.30,0.03));
    const yValues=usable.map(i=>points[i].y);
    const height=Math.max(...yValues)-Math.min(...yValues);
    const joints=HOLD_JOINTS.map(i=>[points[i].x,points[i].y] as [number,number]);
    this.samples.push({t,cx,cy,height:Math.max(0.25,height),joints});
    this.samples=this.samples.filter(p=>p.t>=t-2.15);
    const window=this.samples.filter(p=>p.t>=t-2.0);
    if(window.length<6||t-window[0].t<1.8)return false;
    const scale=Math.max(0.25,window.reduce((s,p)=>s+p.height,0)/window.length);
    const dx=Math.max(...window.map(p=>p.cx))-Math.min(...window.map(p=>p.cx));
    const dy=Math.max(...window.map(p=>p.cy))-Math.min(...window.map(p=>p.cy));
    if(Math.hypot(dx,dy)/scale>0.11)return false;
    const first=window[0];
    const jointDrift=HOLD_JOINTS.map((_,i)=>{
      const movements=window.map(p=>Math.hypot(p.joints[i][0]-first.joints[i][0],
        p.joints[i][1]-first.joints[i][1])/scale);
      return Math.max(...movements);
    });
    jointDrift.sort((a,b)=>a-b);
    const medianDrift=(jointDrift[3]+jointDrift[4])/2;
    return medianDrift<=0.18;
  }
}
