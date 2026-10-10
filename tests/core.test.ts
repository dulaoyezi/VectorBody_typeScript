import { describe,expect,it } from "vitest";
import { buildTopology, EDGES } from "../src/core/humanTopology";
import { OneEuroFilter } from "../src/core/oneEuroFilter";
import { TopologyIKStabilizer } from "../src/core/topologyIK";
import { PROFILES, VectorBodyEngine } from "../src/core/compensationRiskEngine";
import type { DetectedPoint, Point, PoseId } from "../src/core/types";
function fixture(): DetectedPoint[] {
  const p=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:1}));
  const entries:Record<number,[number,number]>={
    0:[0.5,0.14],7:[0.46,0.16],8:[0.54,0.16],
    11:[0.4,0.32],12:[0.6,0.32],13:[0.35,0.47],14:[0.65,0.47],
    15:[0.32,0.57],16:[0.68,0.57],
    23:[0.44,0.57],24:[0.56,0.57],25:[0.43,0.74],26:[0.58,0.75],
    27:[0.42,0.89],28:[0.58,0.89],29:[0.41,0.89],30:[0.59,0.89],
    31:[0.40,0.92],32:[0.60,0.92]
  };
  for(const [i,[x,y]] of Object.entries(entries))p[Number(i)]={x,y,z:0,visibility:1};
  return p;
}
describe("Python-to-TypeScript port invariants",()=>{
  it("keeps all eight poses, front/side profiles and their metrics",()=>{
    const names:PoseId[]=["warrior1","warrior2","tadasana","sukhasana","uttanasana","cobra","balance","downward"];
    for(const name of names) for(const view of ["front","side"]){
      const profile=PROFILES[name+"_"+view];
      expect(profile).toBeDefined();
      expect(profile.metrics.length).toBeGreaterThan(0);
      expect(profile.mobileWeight+profile.stiffWeight).toBeCloseTo(1,6);
    }
    expect(PROFILES.warrior2_front.metrics.find(m=>m.name==="knee_front_flex")?.a).toBe(85);
  });
  it("builds pelvis-root topology with 23 nodes and 21 edges",()=>{
    const points=fixture().map(p=>[p.x,p.y,p.z] as Point);
    const result=buildTopology(points);
    expect(Object.keys(result.nodes)).toHaveLength(23);
    expect(Object.keys(result.bones)).toHaveLength(21);
    expect(EDGES).toHaveLength(21);
    expect(result.nodes.pelvis_center[0]).toBeCloseTo(0.5);
  });
  it("smooths a static pose without changing it",()=>{
    const f=new OneEuroFilter();
    const input=fixture().map(p=>[p.x,p.y,p.z] as Point);
    expect(f.smooth(input)).toEqual(input);
    expect(f.smooth(input)).toEqual(input);
  });
  it("DLS returns finite corrected coordinates and residuals",()=>{
    const input=fixture().map(p=>[p.x,p.y,p.z] as Point);
    const r=new TopologyIKStabilizer().stabilize(input);
    expect(r.detail.iterations).toBeGreaterThan(0);
    expect(Number.isFinite(r.detail.finalResidual)).toBe(true);
    expect(r.landmarks).toHaveLength(33);
    expect(r.landmarks.every(p=>p.every(Number.isFinite))).toBe(true);
  });
  it("generates measured S1/S2/S3 outputs without random scoring",()=>{
    const engine=new VectorBodyEngine("normal");
    const frame=fixture();
    const first=engine.analyze(frame,"tadasana","front");
    expect(first).not.toBeNull();
    expect(first?.topologyIK.nodes).toBe(23);
    for(let i=0;i<12;i++)expect(Number.isFinite(engine.analyze(frame,"tadasana","front")!.score)).toBe(true);
    const r=engine.analyze(frame,"tadasana","front")!;
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.dimensions.s1).toBeGreaterThanOrEqual(0);
    expect(r.dimensions.s2).toBeLessThanOrEqual(100);
    expect(r.dimensions.s3).toBeLessThanOrEqual(100);
    expect(r.score).toBeCloseTo(.30*r.dimensions.s1+.35*r.dimensions.s2+.35*r.dimensions.s3,0);
  });
});
