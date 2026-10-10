import { describe,expect,it } from "vitest";
import { PythonVideoEvaluator, videoFailureReason } from "../src/web/videoEvaluator";
import { seekDecodedVideo, waitForVideoData } from "../src/web/videoDecoder";
import type { DetectedPoint } from "../src/core/types";

function pose():DetectedPoint[]{
  const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const coords:Record<number,[number,number]>={
    0:[.5,.14],7:[.46,.16],8:[.54,.16],11:[.4,.32],12:[.6,.32],
    13:[.35,.47],14:[.65,.47],15:[.32,.57],16:[.68,.57],
    23:[.44,.57],24:[.56,.57],25:[.43,.74],26:[.58,.75],
    27:[.42,.89],28:[.58,.89],29:[.41,.89],30:[.59,.89],
    31:[.40,.92],32:[.60,.92]
  };
  for(const [id,[x,y]] of Object.entries(coords))p[Number(id)]={x,y,z:0,visibility:1};
  return p;
}
describe("Python video analysis diagnostic gate",()=>{
  it("preserves exactly the 2 second hold instead of inventing fallback scores",()=>{
    const e=new PythonVideoEvaluator();
    let ready=0;
    for(let frame=2;frame<=120;frame+=2){
      const accepted=e.inspect(frame/30,pose(),960,720);
      if(accepted.stage==="ready"){ready++;e.evaluated(true);}
    }
    expect(e.stats.processed).toBe(60);
    expect(e.stats.detected).toBe(60);
    expect(e.stats.inView).toBe(60);
    expect(e.stats.centered).toBe(60);
    expect(ready).toBeGreaterThan(0);
    expect(e.stats.evaluated).toBe(ready);
  });
  it("resets stability on frames that are missing or lack visibility",()=>{
    const e=new PythonVideoEvaluator();
    for(let frame=2;frame<48;frame+=2)
      expect(e.inspect(frame/30,pose(),960,720).stage).toBe("stabilizing");
    expect(e.inspect(1.6,null,960,720).stage).toBe("no_person");
    const missing=pose();missing[15].visibility=.1;
    expect(e.inspect(1.65,missing,960,720).stage).toBe("out_of_frame");
    expect(e.inspect(1.75,pose(),960,720).stage).toBe("stabilizing");
    expect(e.inspect(2.5,pose(),960,720).stage).toBe("stabilizing");
    expect(e.stats.stable).toBe(0);
  });
  it("distinguishes framing, centering, and no-person errors",()=>{
    const all=new PythonVideoEvaluator();
    all.inspect(.1,null,960,720);
    expect(videoFailureReason(all.stats)).toContain("未检测到");
    const out=new PythonVideoEvaluator();
    const hidden=pose();hidden[27].visibility=.05;
    out.inspect(.1,hidden,960,720);
    expect(videoFailureReason(out.stats)).toContain("全身入镜");
    const center=new PythonVideoEvaluator(),shift=pose();
    for(const p of shift)p.x+=.33;
    expect(center.inspect(.1,shift,960,720).stage).toBe("off_center");
    expect(videoFailureReason(center.stats)).toContain("画面中心");
  });
  it("never grades an unsteady but detectable video",()=>{
    const e=new PythonVideoEvaluator();
    for(let frame=2;frame<=100;frame+=2){
      const p=pose();
      for(const point of p)point.x+=.012*(frame/2-1);
      e.inspect(frame/30,p,960,720);
    }
    expect(e.stats.evaluated).toBe(0);
    expect(e.stats.stable).toBe(0);
  });
});
class FakeVideo extends EventTarget {
  private current=0;
  readyState=2;
  videoWidth=640;
  videoHeight=480;
  error:null=null;
  get currentTime(){return this.current;}
  set currentTime(value:number){
    this.current=value;
    queueMicrotask(()=>this.dispatchEvent(new Event("seeked")));
  }
}
describe("decoded frame readiness",()=>{
  it("waits for seeking to complete before returning",async()=>{
    const fake=new FakeVideo();
    await seekDecodedVideo(fake as unknown as HTMLVideoElement,2.5);
    expect(fake.currentTime).toBe(2.5);
    await seekDecodedVideo(fake as unknown as HTMLVideoElement,2.5);
    await waitForVideoData(fake as unknown as HTMLVideoElement);
  });
});
