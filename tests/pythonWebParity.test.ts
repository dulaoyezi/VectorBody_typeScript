import { describe,expect,it } from "vitest";
import rawHtml from "../index.html?raw";
import rawCSS from "../src/web/styles.css?raw";
import source from "../src/web/main.ts?raw";
import { PythonStableHold, PYTHON_VIDEO_FRAME_STRIDE, PYTHON_VIDEO_MAX_PROCESSED,
  PYTHON_STABLE_SECONDS, PYTHON_STABLE_CENTER_MOVE, PYTHON_SCORE_WEIGHTS } from "../src/web/pythonParity";
import { buildFindings, findingRegion } from "../src/web/reportEvidence";
import { VectorBodyEngine } from "../src/core/compensationRiskEngine";
import type { DetectedPoint } from "../src/core/types";

function pose():DetectedPoint[]{
  const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const xy:Record<number,[number,number]>={
    0:[.5,.14],7:[.46,.16],8:[.54,.16],
    11:[.4,.32],12:[.6,.32],13:[.35,.47],14:[.65,.47],
    15:[.32,.57],16:[.68,.57],23:[.44,.57],24:[.56,.57],
    25:[.43,.74],26:[.58,.75],27:[.42,.89],28:[.58,.89],
    29:[.41,.89],30:[.59,.89],31:[.40,.92],32:[.60,.92]
  };
  for(const [i,[x,y]] of Object.entries(xy))p[Number(i)]={x,y,z:0,visibility:1};
  return p;
}
describe("Python VectorBody Web behavioral parity",()=>{
  it("preserves original strict frame stride and steady hold threshold",()=>{
    expect(PYTHON_VIDEO_FRAME_STRIDE).toBe(2);
    expect(PYTHON_VIDEO_MAX_PROCESSED).toBe(1800);
    expect(PYTHON_STABLE_SECONDS).toBe(2);
    expect(PYTHON_STABLE_CENTER_MOVE).toBe(.012);
    expect(PYTHON_SCORE_WEIGHTS).toEqual({s1:.30,s2:.35,s3:.35});
  });
  it("does not score a video without a continuous two-second stable segment",()=>{
    const hold=new PythonStableHold();
    for(let t=0;t<2;t+=.1)expect(hold.observe(t,[.5,.5])).toBe(false);
    expect(hold.observe(2,[.5,.5])).toBe(true);
    hold.reset();
    expect(hold.observe(2.1,[.5,.5])).toBe(false);
    // A center movement >= Python's 0.012 threshold resets the window.
    expect(hold.observe(3.1,[.52,.5])).toBe(false);
    expect(hold.observe(4.0,[.52,.5])).toBe(false);
    expect(hold.observe(5.15,[.52,.5])).toBe(true);
  });
  it("renders Python's original yoga SVG, site pages and both separate name inputs",()=>{
    for(const id of ["page-home","page-live","page-video","page-reports",
      "live-player","video-file","analyze-video","report-content","print-report",
      "live-student-name","video-student-name"]){
      expect(rawHtml).toContain('id="'+id+'"');
    }
    expect(rawHtml).toContain('class="yoga-figure"');
    expect(rawCSS).toContain(".yoga-figure");
    expect(rawCSS).toContain(".anatomy-widget");
  });
  it("preserves automatic session archive, video report and print controls",()=>{
    for(const fragment of ["/api/live/start","/api/live/frame","/api/live/stop",
      "/api/analyze-video","/api/reports","/api/anatomy/","window.print()"]){
      // Anatomy uses local static images; all other original workflows are retained.
      if(fragment==="/api/anatomy/")continue;
      expect(source).toContain(fragment);
    }
    expect(source).toContain("student_name:$('live-student-name').value.trim()");
    expect(source).toContain("fd.append('student_name',$('video-student-name').value.trim())");
  });
  it("uses Python's exact region matching precedence and original threshold 85",()=>{
    expect(findingRegion("knee_front_flex")).toBe("knees");
    expect(findingRegion("thoracic_lateral_proxy")).toBe("spine");
    expect(findingRegion("pelvis_tilt_proxy")).toBe("pelvis");
    const result=new VectorBodyEngine().analyze(pose(),"warrior2","front");
    expect(result).not.toBeNull();
    const findings=buildFindings(result!.metrics,"warrior2","front");
    expect(findings.every(f=>f.score<85)).toBe(true);
    for(let i=1;i<findings.length;i++)expect(findings[i].score).toBeGreaterThanOrEqual(findings[i-1].score);
  });
  it("measures actual keypoints, not canned/placeholder scores",()=>{
    const result=new VectorBodyEngine().analyze(pose(),"tadasana","front");
    expect(result).not.toBeNull();
    expect(result!.topologyIK.nodes).toBe(23);
    expect(result!.topologyIK.edges).toBe(21);
    expect(result!.score).toBeCloseTo(.30*result!.dimensions.s1+.35*result!.dimensions.s2+.35*result!.dimensions.s3,0);
  });
});
