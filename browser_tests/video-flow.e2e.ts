import { test, expect } from "@playwright/test";
import path from "node:path";
const asset=path.resolve("public/__smoke_video.mp4");

test("Chrome decodes actual MP4 frames at different timestamps", async({page})=>{
  await page.goto("/");
  const decoded=await page.evaluate(async()=>{
    const {BrowserVideoDecoder}=await import("/src/web/videoDecoder.ts");
    const response=await fetch("/__smoke_video.mp4");
    if(!response.ok)throw new Error("Fixture video missing");
    const array=await response.arrayBuffer();
    const file=new File([array],"__smoke_video.mp4",{type:"video/mp4"});
    const decoder=await BrowserVideoDecoder.open(file);
    try{
      const signatures:number[]=[];
      for(const time of [0.25,1.4,2.8]){
        const canvas=await decoder.frame(time);
        const ctx=canvas.getContext("2d");
        if(!ctx)throw new Error("Missing canvas context");
        const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
        let hash=0;
        for(let i=0;i<data.length;i+=67)hash=(Math.imul(hash,31)+data[i])|0;
        signatures.push(hash);
      }
      return {width:decoder.width,height:decoder.height,duration:decoder.duration,signatures};
    }finally{decoder.close();}
  });
  expect(decoded.width).toBe(320);
  expect(decoded.height).toBe(240);
  expect(decoded.duration).toBeGreaterThan(3.5);
  expect(new Set(decoded.signatures).size).toBe(3);
});

test("Original video flow: upload, stable gate, real math, IndexedDB archive, report",async({page})=>{
  const mockPoints=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const coords:Record<number,[number,number]>={
    0:[.5,.14],7:[.46,.16],8:[.54,.16],
    11:[.4,.32],12:[.6,.32],13:[.35,.47],14:[.65,.47],
    15:[.32,.57],16:[.68,.57],23:[.44,.57],24:[.56,.57],
    25:[.43,.74],26:[.58,.75],27:[.42,.89],28:[.58,.89],
    29:[.41,.89],30:[.59,.89],31:[.40,.92],32:[.60,.92]
  };
  for(const [id,[x,y]] of Object.entries(coords))
    mockPoints[Number(id)]={x,y,z:0,visibility:1};
  await page.route(/\/src\/vision\/pose\.ts(?:\?.*)?$/,async route=>{
    await route.fulfill({status:200,contentType:"text/javascript",body:
      "export async function createPoseDetector(){return {detect(){return "+JSON.stringify(mockPoints)+";},close(){}};}"});
  });
  await page.goto("/");
  await page.locator('[data-go="video"]').first().click();
  await page.locator("#video-student-name").fill("视频端到端测试");
  await page.locator("#video-file").setInputFiles(asset);
  await page.locator("#analyze-video").click();
  await expect(page.locator("#upload-badge")).toHaveText("已保存报告",{timeout:110_000});
  await expect(page.locator("#save-video-report")).toBeEnabled();
  await expect(page.locator("#print-video-report")).toBeEnabled();
  await page.locator("#save-video-report").click();
  await expect(page.locator("#upload-badge")).toHaveText("已保存报告");
  await expect(page.locator("#show-video-report")).toBeEnabled();
  await page.locator("#show-video-report").click();
  await expect(page.locator("#report-detail")).toBeVisible();
  await expect(page.locator("#report-content")).toContainText("视频端到端测试");
  await expect(page.locator("#report-content")).toContainText("S1");
  await expect(page.locator("#report-content")).toContainText("S2");
  await expect(page.locator("#report-content")).toContainText("S3");
  const photos=await page.locator("#archive-photo").evaluate((img:HTMLImageElement)=>({
    src:img.src,visible:!img.hidden
  }));
  expect(photos.visible).toBe(true);
  expect(photos.src).toMatch(/^data:image\/jpeg;base64,/);
  // The write is committed before the report is opened.
  const archived=await page.evaluate(async()=>{
    const {listReports}=await import("/src/utils/reports.ts");
    const list=await listReports();
    return list.map((record:any)=>({
      studentName:record.studentName,
      hasRaw:!!record.originalImage,
      hasSkeleton:!!record.image,
      score:record.result.score
    }));
  });
  expect(archived.some(x=>x.studentName==="视频端到端测试"&&
    x.hasRaw&&x.hasSkeleton&&x.score>=0&&x.score<=100)).toBe(true);
  expect(archived).toHaveLength(1); // Manual save updates, rather than duplicating, automatic archive.
  await page.evaluate(()=>{
    (window as any).__printCalls=0;
    window.print=()=>{(window as any).__printCalls++;};
  });
  await page.locator("#print-report").click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__printCalls)).toBe(1);
  await page.reload();
  await page.locator('[data-go="reports"]').first().click();
  await expect(page.locator("#reports-list")).toContainText("视频端到端测试");
  await page.locator("#reports-list [data-report]").first().click();
  await expect(page.locator("#report-content")).toContainText("视频端到端测试");
});

test("A real score remains viewable and printable when IndexedDB is blocked",async({page})=>{
  const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  const coords:Record<number,[number,number]>={
    0:[.5,.14],7:[.46,.16],8:[.54,.16],11:[.4,.32],12:[.6,.32],
    15:[.32,.57],16:[.68,.57],23:[.44,.57],24:[.56,.57],
    25:[.43,.74],26:[.58,.75],27:[.42,.89],28:[.58,.89],
    29:[.41,.89],30:[.59,.89],31:[.40,.92],32:[.60,.92]
  };
  for(const [id,[x,y]] of Object.entries(coords))points[Number(id)]={x,y,z:0,visibility:1};
  await page.route(/\/src\/vision\/pose\.ts(?:\?.*)?$/,async route=>{
    await route.fulfill({status:200,contentType:"text/javascript",body:
      "export async function createPoseDetector(){return {detect(){return "+
      JSON.stringify(points)+";},close(){}};}"});
  });
  await page.addInitScript(()=>{
    Object.defineProperty(window.indexedDB,"open",{configurable:true,value:()=>{
      throw new Error("blocked IndexedDB");
    }});
    (window as any).__printCalls=0;
    window.print=()=>{(window as any).__printCalls++;};
  });
  await page.goto("/");
  await page.locator('[data-go="video"]').first().click();
  await page.locator("#video-student-name").fill("离线打印测试");
  await page.locator("#video-file").setInputFiles(asset);
  await page.locator("#analyze-video").click();
  await expect(page.locator("#upload-badge")).toHaveText("评分完成 · 待保存",{timeout:110_000});
  await expect(page.locator("#video-score")).not.toHaveText("—");
  await expect(page.locator("#show-video-report")).toBeEnabled();
  await expect(page.locator("#save-video-report")).toBeEnabled();
  await page.locator("#show-video-report").click();
  await expect(page.locator("#report-content")).toContainText("离线打印测试");
  await expect(page.locator("#archive-photo")).toBeVisible();
  await page.locator("#print-report").click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__printCalls)).toBe(1);
});
