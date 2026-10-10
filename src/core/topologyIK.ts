/**
 * Direct TypeScript port of core/topology_ik.py (Python VectorBody_v2).
 * Damped least-squares normal equations assembled sparsely, solved by Cholesky.
 * The model is an image-space consistency regularizer, not clinical 3D IK.
 */
import type { Landmarks, Point } from "./types";
import { boneLength, buildTopology, CHAINS, EDGES, edgeKey, RAW_LANDMARKS, type TopologyFrame } from "./humanTopology";
import { mean, median, norm } from "./math";
export interface IKDetail {
  nodes: number; edges: number; iterations: number; referenceReady: boolean;
  initialResidual: number; finalResidual: number; maxLengthError: number;
  meanBoneLength: number; maxBoneLength: number; trunkLength: number; leftLegLength: number; rightLegLength: number;
}
export interface IKResult { landmarks: Landmarks; topology: TopologyFrame; detail: IKDetail }
function choleskySolve(matrix: Float64Array, g: Float64Array, size: number): Float64Array {
  // (J^T J + damping² I) delta = -J^T r. Positive-definite for damping > 0.
  const l = new Float64Array(size * size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i * size + j];
      for (let k = 0; k < j; k++) sum -= l[i * size + k] * l[j * size + k];
      if (i === j) l[i * size + j] = Math.sqrt(Math.max(sum, 1e-12));
      else l[i * size + j] = sum / l[j * size + j];
    }
  }
  const y = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    let value = -g[i];
    for (let k = 0; k < i; k++) value -= l[i * size + k] * y[k];
    y[i] = value / l[i * size + i];
  }
  const delta = new Float64Array(size);
  for (let i = size - 1; i >= 0; i--) {
    let value = y[i];
    for (let k = i + 1; k < size; k++) value -= l[k * size + i] * delta[k];
    delta[i] = value / l[i * size + i];
  }
  return delta;
}
export class TopologyIKStabilizer {
  private lengthHistory: Record<string, number[]> = {};
  private previousNodes: Record<string, Point> = {};
  constructor(
    private readonly historyLen = 18, private readonly minSamples = 4,
    private readonly damping = 0.08, private readonly maxIters = 3,
    private readonly fitWeight = 1.0, private readonly boneWeight = 0.35,
    private readonly temporalWeight = 0.18, private readonly correctionClip = 0.035
  ) { this.reset(); }
  reset() {
    this.previousNodes = {}; this.lengthHistory = {};
    for (const [a,b] of EDGES) this.lengthHistory[edgeKey(a,b)] = [];
  }
  private referenceLengths(frame: TopologyFrame): Record<string,number> {
    const refs: Record<string,number> = {};
    for (const [a,b] of EDGES) {
      const key=edgeKey(a,b),history=this.lengthHistory[key];
      refs[key] = history.length >= this.minSamples ? median(history) : boneLength(frame,a,b);
    }
    return refs;
  }
  private assemble(x: Float64Array, observation: Float64Array, names: string[],
    refs: Record<string,number>, makeMatrix: boolean) {
    const dims=3, count=names.length * dims;
    const h = makeMatrix ? new Float64Array(count*count) : null;
    const g = makeMatrix ? new Float64Array(count) : null;
    let residualSum = 0, residualCount = 0;
    const index = new Map(names.map((name,i)=>[name,i*dims]));
    // Pose-fitting residuals
    for (let i=0;i<count;i++) {
      const r=x[i]-observation[i];
      residualSum += this.fitWeight*r*r; residualCount++;
      if (h && g) { h[i*count+i] += this.fitWeight;g[i] += this.fitWeight*r; }
    }
    // Previous-frame residuals
    for (const name of names) {
      const previous=this.previousNodes[name];
      if (!previous) continue;
      const base=index.get(name)!;
      for (let d=0;d<dims;d++) {
        const i=base+d,r=x[i]-previous[d];
        residualSum += this.temporalWeight*r*r;residualCount++;
        if(h&&g){h[i*count+i] += this.temporalWeight;g[i] += this.temporalWeight*r;}
      }
    }
    // Length-consistency residuals (each Jacobian row has at most six non-zero entries).
    for (const [a,b] of EDGES) {
      const ai=index.get(a)!,bi=index.get(b)!;
      const vector=[x[bi]-x[ai],x[bi+1]-x[ai+1],x[bi+2]-x[ai+2]];
      const length=Math.hypot(...vector)+1e-6;
      const unit=vector.map(v=>v/length),r=length-refs[edgeKey(a,b)];
      residualSum+=this.boneWeight*r*r; residualCount++;
      if(h&&g) {
        for(let d=0;d<dims;d++){
          const ia=ai+d,ib=bi+d,u=unit[d],w=this.boneWeight;
          g[ia]-=w*u*r; g[ib]+=w*u*r;
          for(let e=0;e<dims;e++){
            const ja=ai+e,jb=bi+e, v=unit[e],increment=w*u*v;
            h[ia*count+ja]+=increment;h[ib*count+jb]+=increment;
            h[ia*count+jb]-=increment;h[ib*count+ja]-=increment;
          }
        }
      }
    }
    if(h) for(let i=0;i<count;i++)h[i*count+i]+=this.damping*this.damping;
    return { h, g, rms: Math.sqrt(residualSum/Math.max(1,residualCount)) };
  }
  private chainLength(topology: TopologyFrame, name: string) {
    const chain=CHAINS[name];
    let total=0;
    for(let i=1;i<chain.length;i++)total+=boneLength(topology,chain[i-1],chain[i]);
    return total;
  }
  stabilize(points: Landmarks, topology=buildTopology(points)): IKResult {
    const names=Object.keys(topology.nodes), obs=new Float64Array(names.flatMap(n=>topology.nodes[n]));
    const x=Float64Array.from(obs);
    const refs=this.referenceLengths(topology);
    const initialResidual=this.assemble(x,obs,names,refs,false).rms;
    let iterations=0;
    for(let attempt=1;attempt<=this.maxIters;attempt++){
      iterations=attempt;
      const {h,g}=this.assemble(x,obs,names,refs,true);
      const step=choleskySolve(h!,g!,x.length);
      const magnitude=Math.hypot(...step);
      const scale=magnitude>this.correctionClip?this.correctionClip/(magnitude+1e-6):1;
      for(let j=0;j<x.length;j++)x[j]+=step[j]*scale;
      if(magnitude<1e-5)break;
    }
    const corrected=points.map(p=>[...p] as Point);
    const indices=new Map(names.map((name,i)=>[name,i*3]));
    for(const [name,i] of Object.entries(RAW_LANDMARKS)){
      const j=indices.get(name)!;
      corrected[i]=[x[j],x[j+1],x[j+2]];
    }
    const correctedTopology=buildTopology(corrected);
    for(const [a,b] of EDGES){
      const key=edgeKey(a,b),v=boneLength(correctedTopology,a,b);
      if(Number.isFinite(v)&&v>1e-6){
        this.lengthHistory[key].push(v);
        if(this.lengthHistory[key].length>this.historyLen)this.lengthHistory[key].shift();
      }
    }
    this.previousNodes=Object.fromEntries(names.map(n=>[n,[...correctedTopology.nodes[n]] as Point]));
    const finalResidual=this.assemble(x,obs,names,refs,false).rms;
    const lengths=EDGES.map(([a,b])=>boneLength(correctedTopology,a,b));
    const maxLengthError=Math.max(0,...EDGES.map(([a,b])=>{
      const key=edgeKey(a,b),ref=median(this.lengthHistory[key]);
      return Math.abs(boneLength(correctedTopology,a,b)-ref)/(ref+1e-6);
    }));
    return {landmarks:corrected,topology:correctedTopology,detail:{
      nodes:names.length,edges:EDGES.length,iterations,
      referenceReady:EDGES.every(([a,b])=>this.lengthHistory[edgeKey(a,b)].length>=this.minSamples),
      initialResidual,finalResidual,maxLengthError,
      meanBoneLength:mean(lengths),maxBoneLength:Math.max(...lengths),
      trunkLength:this.chainLength(correctedTopology,"trunk"),
      leftLegLength:this.chainLength(correctedTopology,"left_leg"),
      rightLegLength:this.chainLength(correctedTopology,"right_leg")
    }};
  }
}
