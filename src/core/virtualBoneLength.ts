import { boneLength, EDGES, edgeKey, type TopologyFrame } from "./humanTopology";
import { clamp, median } from "./math";
export interface BoneStatus {
  frameCount: number; ready: boolean; valid: boolean; reliable: boolean; quality: number;
  maxDeviation: number; updatedReference: boolean; learnReference: boolean;
  learningState: string; referenceSamples: number; abnormalEdges: string[];
}
export const TRACKED_EDGES: [string, string][] = [
  ["pelvis_center","shoulder_center"],["left_shoulder","left_elbow"],["left_elbow","left_wrist"],
  ["right_shoulder","right_elbow"],["right_elbow","right_wrist"],
  ["left_hip","left_knee"],["left_knee","left_ankle"],["right_hip","right_knee"],["right_knee","right_ankle"]
];
export class VirtualBoneLengthTracker {
  private frames = 0; private learnedFrames = 0;
  private history: Record<string, number[]> = {};
  constructor(private readonly windowFrames = 30, private readonly updateInterval = 5,
              private readonly threshold = 0.30, private readonly minSamples = 3) { this.reset(); }
  reset() {
    this.frames = 0; this.learnedFrames = 0; this.history = {};
    for (const [a,b] of TRACKED_EDGES) this.history[edgeKey(a,b)] = [];
  }
  private isReady() { return TRACKED_EDGES.every(([a,b]) => this.history[edgeKey(a,b)].length >= this.minSamples); }
  private samples() { return Math.min(...Object.values(this.history).map(v=>v.length)); }
  update(frame: TopologyFrame, learnReference: boolean): BoneStatus {
    this.frames++;
    if (learnReference) this.learnedFrames++;
    const readyBefore = this.isReady();
    const devs: Record<string,number> = {};
    if (readyBefore) for (const [a,b] of TRACKED_EDGES) {
      const key = edgeKey(a,b), v=boneLength(frame,a,b);
      devs[key] = !Number.isFinite(v) || v <= 1e-6 ? 1 : Math.abs(v - median(this.history[key])) / (median(this.history[key]) + 1e-6);
    }
    const maxDeviation = Math.max(0,...Object.values(devs));
    const abnormalEdges = Object.entries(devs).filter(([, v]) => v > this.threshold).map(([k]) => k.replace("|","->"));
    const valid = abnormalEdges.length === 0;
    const updatedReference = learnReference && (this.learnedFrames === 1 || this.learnedFrames % this.updateInterval === 0) && (!readyBefore || valid);
    if (updatedReference) for (const [a,b] of TRACKED_EDGES) {
      const key=edgeKey(a,b),v=boneLength(frame,a,b),xs=this.history[key];
      if (Number.isFinite(v) && v > 1e-6) {
        xs.push(v);
        const maxSamples=Math.max(this.minSamples,Math.floor(this.windowFrames / this.updateInterval));
        if(xs.length>maxSamples)xs.shift();
      }
    }
    const ready=this.isReady();
    return { frameCount:this.frames, ready, valid, reliable:ready&&valid,
      quality:readyBefore?clamp(1-maxDeviation/this.threshold):0, maxDeviation, updatedReference,
      learnReference, learningState:learnReference?(ready?"ready":"building"):(ready?"frozen":"waiting_hold"),
      referenceSamples:this.samples(),abnormalEdges };
  }
}
