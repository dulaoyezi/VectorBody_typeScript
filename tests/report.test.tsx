import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportDocument, { reportRows } from "../src/components/ReportDocument";
import { buildFindings } from "../src/components/AnatomyView";
import { VectorBodyEngine } from "../src/core/compensationRiskEngine";
import type { DetectedPoint, SavedReport } from "../src/core/types";

const fixture = ():DetectedPoint[] => {
  const points=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:1}));
  const xy:Record<number,[number,number]> = {0:[.5,.14],7:[.46,.16],8:[.54,.16],
    11:[.4,.32],12:[.6,.32],13:[.35,.47],14:[.65,.47],15:[.32,.57],16:[.68,.57],
    23:[.44,.57],24:[.56,.57],25:[.43,.74],26:[.58,.75],
    27:[.42,.89],28:[.58,.89],29:[.41,.89],30:[.59,.89],31:[.40,.92],32:[.60,.92]};
  for(const [id,[x,y]] of Object.entries(xy))points[Number(id)]={x,y,z:0,visibility:1};
  return points;
};
function sampleReport():SavedReport {
  const result=new VectorBodyEngine("normal").analyze(fixture(),"tadasana","front");
  if(!result)throw Error("Missing evaluation");
  return { id:"pdf-smoke-001",studentName:"王同学",createdAt:"2026-10-10T09:00:00.000Z",
    source:"video",pose:"tadasana",view:"front",level:"normal",result };
}
describe("Python report structure",()=>{
  it("renders named PDF report with Python diagnostic sections",()=>{
    const html=renderToStaticMarkup(createElement(ReportDocument,{report:sampleReport()}));
    for(const term of ["王同学","山式动作评分报告","最佳评分帧","原始照片",
      "骨架标注","人体骨骼","S1","S2","S3","总体代偿风险",
      "结构优化与骨长依据","DLS","分项指标与评分依据","可解释纠正与语音反馈"])
      expect(html).toContain(term);
  });
  it("preserves original metric order and labels",()=>{
    const rows=reportRows(sampleReport());
    expect(rows.map(r=>r.key)).toEqual(["spine_vertical","shoulder_symmetry","pelvis_level","neck_axis"]);
    expect(rows[0].label).toBe("躯干垂直");
  });
  it("marks low-score regions and HTML-escapes the subject name",()=>{
    const r=sampleReport();
    r.result.metrics.shoulder_symmetry.score=35;
    expect(buildFindings(r.result).some(x=>x.region==="shoulders"&&x.severity==="high")).toBe(true);
    r.studentName="<script>bad</script>";
    const html=renderToStaticMarkup(createElement(ReportDocument,{report:r}));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
