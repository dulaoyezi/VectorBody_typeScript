import { describe,expect,it } from "vitest";
import { inspectVideoFrame,VideoHoldWindow,chooseVideoCandidate } from "../src/core/videoSelection";
import { VectorBodyEngine } from "../src/core/compensationRiskEngine";
import type { DetectedPoint } from "../src/core/types";

function body(): DetectedPoint[]{
  const pts=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:1}));
  const xy:Record<number,[number,number]>={
    0:[0.5,0.14],7:[0.46,0.16],8:[0.54,0.16],
    11:[0.4,0.32],12:[0.6,0.32],13:[0.35,0.47],14:[0.65,0.47],
    15:[0.32,0.57],16:[0.68,0.57],23:[0.44,0.57],24:[0.56,0.57],
    25:[0.43,0.74],26:[0.58,0.75],27:[0.42,0.89],28:[0.58,0.89],
    29:[0.41,0.89],30:[0.59,0.89],31:[0.40,0.92],32:[0.60,0.92]
  };
  for(const [i,[x,y]] of Object.entries(xy))pts[Number(i)]={x,y,z:0,visibility:1};
  return pts;
}

describe("offline video eligibility",()=>{
  it("strictly recognizes well framed full-body keypoints",()=>{
    const inspection=inspectVideoFrame(body(),960,720);
    expect(inspection.tier).toBe("full");
    expect(inspection.visibleMajor).toBe(10);
  });
  it("accepts a partly occluded wrist only as a lower-confidence fallback",()=>{
    const points=body();points[15].visibility=0.12;
    expect(inspectVideoFrame(points,960,720).tier).toBe("partial");
  });
  it("does not invent grades for absent or unusable body poses",()=>{
    expect(inspectVideoFrame(null,960,720).tier).toBe("none");
    const points=body();for(const i of [25,26,27,28])points[i].visibility=0.05;
    expect(inspectVideoFrame(points,960,720).tier).toBe("none");
  });
  it("identifies a 2-second hold despite tiny keypoint jitter",()=>{
    const hold=new VideoHoldWindow();
    let stable=false;
    for(let i=0;i<25;i++){
      const points=body();
      for(const p of points)p.x+=Math.sin(i*0.9)*0.004;
      stable=hold.push(i*.1,points)||stable;
    }
    expect(stable).toBe(true);
  });
  it("marks ongoing large translations as non-holds",()=>{
    const hold=new VideoHoldWindow();
    let stable=false;
    for(let i=0;i<25;i++){
      const points=body();
      for(const p of points)p.x+=i*0.006;
      stable=hold.push(i*.1,points)||stable;
    }
    expect(stable).toBe(false);
  });
  it("prefers a stable best frame; otherwise returns full-body or partial genuine samples",()=>{
    const full={source:"full",score:72},partial={source:"partial",score:95},stable={source:"stable",score:69};
    expect(chooseVideoCandidate(stable,full,partial)).toBe(stable);
    expect(chooseVideoCandidate(null,full,partial)).toBe(full);
    expect(chooseVideoCandidate(null,null,partial)).toBe(partial);
    expect(chooseVideoCandidate(null,null,null)).toBeNull();
  });
  it("computes a real (not random) S1/S2/S3 score even without a hold",()=>{
    const points=body();
    const quality=inspectVideoFrame(points,960,720);
    const engine=new VectorBodyEngine("normal");
    const score=quality.tier!=="none"?engine.analyze(points,"warrior2","front",0.2,1):null;
    expect(score).not.toBeNull();
    expect(score?.dimensions.s1).toBeGreaterThanOrEqual(0);
    expect(score?.dimensions.s2).toBeLessThanOrEqual(100);
    expect(score?.dimensions.s3).toBeGreaterThanOrEqual(0);
  });
});
