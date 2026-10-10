export type Point = [number, number, number];
export type Landmarks = Point[];
export type PoseId = "warrior1" | "warrior2" | "tadasana" | "sukhasana" | "uttanasana" | "cobra" | "balance" | "downward";
export type View = "front" | "side";
export type Level = "normal" | "beginner";
export type Source = "live" | "video";
export interface DetectedPoint { x: number; y: number; z: number; visibility: number }
export interface MetricRule {
  name: string; label: string; category: "mobile" | "stiff"; weight: number;
  mode: "range" | "upper" | "lower" | "target"; a: number; b: number;
  beginnerA: number; beginnerB: number; gain: number; stabilityWeight: number; note: string;
}
export interface PoseProfile { title: string; drive: string; metrics: MetricRule[]; mobileWeight: number; stiffWeight: number }
export interface MetricScore { value: number; score: number; stability: number; weight: number; risk: number; geomRisk: number; label: string; note: string }
export interface ScoreResult {
  score: number; grade: "A" | "B" | "C" | "D"; riskPct: number; advice: string;
  dimensions: { s1: number; s2: number; s3: number };
  compensation: { mobileLockPct: number; stiffCompPct: number };
  confidence: { ready: boolean; valid: boolean; qualityPct: number; maxDeviationPct: number; abnormalEdges: string[]; referenceSamples?:number; learnReference?:boolean };
  topologyIK: { nodes: number; edges: number; iterations: number; initialResidual: number; finalResidual: number; maxLengthErrorPct: number; meanBoneLength?:number };
  hold: { ready: boolean; phase: string; label: string; motionRatio: number; stability: number };
  metrics: Record<string, MetricScore>;
  landmarks: DetectedPoint[]; timeSec?: number; frameIndex?: number;
  videoQuality?: VideoAnalysisQuality;
}
/** Quality label for uploaded videos. Fallback frames are never described as stable. */
export interface VideoAnalysisQuality {
  mode:"stable"|"unstable"|"partial";label:string;warning:string;
  sampledFrames:number;detectedFrames:number;fullFrames:number;partialFrames:number;
  scoredFrames:number;stableFrames:number;
}
export interface SavedReport {
  id: string; createdAt: string; source: Source;
  studentName: string; pose: PoseId; view: View; level: Level; result: ScoreResult;
  image?: string; originalImage?: string;
}
export const POSES: { id: PoseId; name: string; description: string }[] = [
  { id: "warrior1", name: "战士一式", description: "前后步 · 稳定上举" },
  { id: "warrior2", name: "战士二式", description: "前膝控制 · 双臂延展" },
  { id: "tadasana", name: "山式", description: "轴线中立 · 身体对称" },
  { id: "sukhasana", name: "简易坐", description: "骨盆中立 · 脊柱延展" },
  { id: "uttanasana", name: "站立前屈式", description: "髋部折叠 · 背部延展" },
  { id: "cobra", name: "眼镜蛇式", description: "胸椎伸展 · 肩部稳定" },
  { id: "balance", name: "平衡式", description: "踝与核心稳定" },
  { id: "downward", name: "下犬式", description: "四点支撑 · 脊柱延展" },
];
export const GUIDANCE: Record<PoseId, string> = {
  warrior1: "请双脚前后分开，前膝对准脚尖，躯干直立，双臂上举。",
  warrior2: "请双脚打开，前膝朝脚尖方向，双臂向两侧水平延展。",
  tadasana: "请站立并自然延展脊柱，放松肩部，双脚均匀支撑。",
  sukhasana: "请舒适盘坐，骨盆中正，脊柱向上延展。",
  uttanasana: "请缓慢从髋部折叠向前屈，保持呼吸自然。",
  cobra: "请俯卧后缓慢抬起胸口，肩膀远离耳朵，不要强行后仰。",
  balance: "请站稳并缓慢进入平衡姿态，寻找稳定视点。",
  downward: "请双手双脚稳定支撑，缓慢抬高骨盆，延展背部。",
};
