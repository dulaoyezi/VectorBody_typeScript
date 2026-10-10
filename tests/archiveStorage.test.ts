import "fake-indexeddb/auto";
import { describe,expect,it } from "vitest";
import { deleteReport, listReports, readReport, saveReport } from "../src/utils/reports";
import { VectorBodyEngine } from "../src/core/compensationRiskEngine";
import type { DetectedPoint, SavedReport } from "../src/core/types";

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
describe("auto archived report integrity",()=>{
  it("round trips student name, best pose score, original and skeleton evidence",async()=>{
    const result=new VectorBodyEngine("normal").analyze(pose(),"warrior2","front");
    expect(result).not.toBeNull();
    const id="storage-"+Date.now().toString(16);
    const report:SavedReport={
      id,createdAt:new Date().toISOString(),source:"video",studentName:"测试学生",
      pose:"warrior2",view:"front",level:"normal",
      result:result!,originalImage:"data:image/jpeg;base64,/9j/RAW",
      image:"data:image/jpeg;base64,/9j/SKELETON"
    };
    await saveReport(report);
    const stored=await readReport(id);
    expect(stored?.studentName).toBe("测试学生");
    expect(stored?.result.score).toBeCloseTo(result!.score);
    expect(stored?.originalImage).toContain("/9j/RAW");
    expect(stored?.image).toContain("/9j/SKELETON");
    expect((await listReports()).some(r=>r.id===id)).toBe(true);
    await deleteReport(id);
    expect(await readReport(id)).toBeUndefined();
  });
});
