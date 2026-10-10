/**
 * Browser implementation of VectorBody_v2/web_app.py's Web API contract.
 *
 * Direct port of the Python Web's session/hold/video/archiving business rules.
 * Inputs are MediaPipe Web Pose Landmarker results, which are not guaranteed to
 * be numerically identical to the Python Solutions model. This static/browser
 * version uses per-browser IndexedDB, not the Python server's shared SQLite.
 *
 * NOTE: no fallback scoring on an unsteady upload: Python's strict 2-second
 * steady-pose requirement is preserved.
 */
import { VectorBodyEngine, centered, inView } from "../core/compensationRiskEngine";
import { GUIDANCE, POSES, type DetectedPoint, type Level, type PoseId, type ScoreResult, type View, type SavedReport } from "../core/types";
import { createPoseDetector, type PoseDetector } from "../vision/pose";
import { listReports, saveReport, deleteReport, readReport } from "../utils/reports";
import { buildFindings, type Finding } from "./reportEvidence";
import { inferVideoFps } from "./videoFps";
import { BrowserVideoDecoder } from "./videoDecoder";
import { PythonVideoEvaluator, videoFailureReason, type VideoDiagnostics } from "./videoEvaluator";
import { PYTHON_STABLE_CENTER_MOVE, PYTHON_STABLE_SECONDS,
  PYTHON_VIDEO_FRAME_STRIDE, PYTHON_VIDEO_MAX_PROCESSED } from "./pythonParity";
import { rounded } from "../core/math";

interface Options { pose: PoseId; view: View; level: Level; studentName: string }
interface Live {
  opts: Options; detector: PoseDetector; engine: VectorBodyEngine;
  phase: "prepare" | "hold"; lastCenter: [number,number] | null;
  stableSince: number | null; readyAt: number | null;
  best: PythonResult|null; bestOriginal:string|null; bestSkeleton:string|null;
  frameIndex: number; lastSeen: number; archivedId: string|null;
}
export interface PythonResult {
  score:number; grade:string; risk_pct:number; advice:string;
  dimensions:{s1:number;s2:number;s3:number};
  compensation:{mobile_lock_pct:number;stiff_comp_pct:number};
  confidence:{ready:boolean;valid:boolean;quality_pct:number;max_deviation_pct:number};
  topology_ik:{nodes:number;edges:number;iterations:number;initial_residual:number;final_residual:number;max_length_error_pct:number};
  hold_phase:string;
  metrics:Record<string,{value:number;score:number;stability:number;weight:number}>;
  issue_regions:Finding[];
  landmarks:[number,number,number][];
  frame_index?:number|null; time_sec?:number|null;
  media?:{original?:string;skeleton?:string};
  student_name?:string;
}
const sessionMap=new Map<string,Live>();
interface VideoDraft {
  id:string; createdAt:string; opts:Options; result:PythonResult;
  original:string|null; skeleton:string|null; archivedId:string|null;
}
// Only the latest video assessment is retained in memory for retry/printing.
// No score is inferred from an unsuccessful or unstable clip.
let pendingVideo:VideoDraft|null=null;
const MAX_SESSION=4,SESSION_TTL_MS=20*60_000;
const allowedVideos=new Set(["mp4","mov","avi","mkv","m4v","webm"]);
const names:Record<string,string>=Object.fromEntries(POSES.map(p=>[p.id,p.name]));

const textVal=(v:FormDataEntryValue|null)=>typeof v==="string"?v:"";
const nameValue=(v:unknown):string=>String(v??"").trim().slice(0,32);
const floatRound=(v:number,n=2)=>rounded(v,n);
function optsCheck(pose:string,view:string,level:string):asserts pose is PoseId{
  if(!names[pose]||!["front","side"].includes(view)||!["normal","beginner"].includes(level))
    throw new Error("不支持的体式、视角或难度。");
}
function displayPoints(points:DetectedPoint[]|null):[number,number,number][]|null {
  if(!points||points.length<33)return null;
  return points.map(p=>[rounded(p.x,5),rounded(p.y,5),rounded(p.visibility,3)]);
}
function centerPoint(display:[number,number,number][]):[number,number]{
  const joints=[11,12,23,24];
  return [joints.reduce((s,i)=>s+display[i][0],0)/4,joints.reduce((s,i)=>s+display[i][1],0)/4];
}
function pointsFromDisplay(display:[number,number,number][],actual:DetectedPoint[]):DetectedPoint[]{
  // The Python pipeline uses original full-precision pose landmarks for
  // scoring and rounded x/y/visibility only for display and archiving.
  return actual.map(p=>({...p}));
}
function realScore(score:ScoreResult,display:[number,number,number][],frameIndex:number|null,
  timeSec:number|null,opts:Options):PythonResult{
  const metrics:PythonResult["metrics"]={};
  for(const [key,v] of Object.entries(score.metrics))
    metrics[key]={value:floatRound(v.value,3),score:floatRound(v.score,3),
      stability:floatRound(v.stability,3),weight:floatRound(v.weight,3)};
  const regions=buildFindings(score.metrics,opts.pose,opts.view);
  return {
    score:floatRound(score.score),grade:score.grade,risk_pct:floatRound(score.riskPct),
    advice:score.advice,
    dimensions:{s1:floatRound(score.dimensions.s1),s2:floatRound(score.dimensions.s2),s3:floatRound(score.dimensions.s3)},
    compensation:{mobile_lock_pct:floatRound(score.compensation.mobileLockPct),
      stiff_comp_pct:floatRound(score.compensation.stiffCompPct)},
    confidence:{ready:score.confidence.ready,valid:score.confidence.valid,
      quality_pct:floatRound(score.confidence.qualityPct),max_deviation_pct:floatRound(score.confidence.maxDeviationPct)},
    topology_ik:{nodes:score.topologyIK.nodes,edges:score.topologyIK.edges,
      iterations:score.topologyIK.iterations,
      initial_residual:floatRound(score.topologyIK.initialResidual,6),
      final_residual:floatRound(score.topologyIK.finalResidual,6),
      max_length_error_pct:floatRound(score.topologyIK.maxLengthErrorPct,3)},
    hold_phase:score.hold.label,metrics,issue_regions:regions,landmarks:display,
    frame_index:frameIndex,time_sec:timeSec,
    student_name:opts.studentName
  };
}
function snapshot(src:CanvasImageSource,width:number,height:number,
  display:[number,number,number][]|null,withSkeleton:boolean,findings:Finding[]=[]):string{
  const scale=Math.min(1,1280/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("无法截取评估画面");
  ctx.drawImage(src,0,0,w,h);
  if(withSkeleton && display){
    // Matches report_evidence.py edge set, visibility threshold & evidence rings.
    const edges:[number,number][]=[[11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],
      [27,29],[28,30],[29,31],[30,32]];
    ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=3;ctx.strokeStyle="rgb(166,207,150)";
    for(const [a,b] of edges) {
      if(display[a][2]<0.30||display[b][2]<0.30)continue;
      ctx.beginPath();ctx.moveTo(display[a][0]*w,display[a][1]*h);ctx.lineTo(display[b][0]*w,display[b][1]*h);ctx.stroke();
    }
    for(const id of [...new Set(edges.flat())]) {
      if(display[id][2]<0.30)continue;
      const x=display[id][0]*w,y=display[id][1]*h;
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle="rgb(232,182,75)";ctx.fill();
      ctx.strokeStyle="rgb(45,75,40)";ctx.lineWidth=1;ctx.stroke();
    }
    const parts:Record<string,number[]>={knees:[25,26],ankles:[27,28],
      shoulders:[11,12],spine:[11,12,23,24],neck:[0,11,12],pelvis:[23,24]};
    for(const f of findings.slice(0,3)){
      const ids=(parts[String(f.region)]??[]).filter(i=>display[i][2]>=0.30);
      if(!ids.length)continue;
      const x=ids.reduce((s,i)=>s+display[i][0],0)/ids.length*w;
      const y=ids.reduce((s,i)=>s+display[i][1],0)/ids.length*h;
      ctx.beginPath();ctx.arc(x,y,Math.max(19,Math.floor(Math.min(w,h)/30)),0,Math.PI*2);
      ctx.strokeStyle=f.severity==="high"?"rgb(217,95,46)":"rgb(223,165,62)";
      ctx.lineWidth=3;ctx.stroke();
    }
  }
  return canvas.toDataURL("image/jpeg",0.86);
}
function generateId():string{
  return crypto.randomUUID().replace(/-/g,"");
}
async function archive(opts:Options,source:"live"|"video",result:PythonResult,
  original:string|null,skeleton:string|null,existingId:string|null=null):Promise<string>{
  const id=existingId??generateId().slice(0,12);
  const when=new Date().toISOString();
  // Retain original TS datatypes and Python-compatible report format in "body".
  const r:SavedReport={
    id,createdAt:when,source,studentName:opts.studentName,
    pose:opts.pose,view:opts.view,level:opts.level,
    result:result as unknown as ScoreResult,
    originalImage:original??undefined,image:skeleton??undefined
  };
  try{
    await saveReport(r);
    const checked=await readReport(id);
    if(!checked||checked.studentName!==opts.studentName||checked.result.score!==result.score||
      (!!original&&!checked.originalImage)||(!!skeleton&&!checked.image))
      throw new Error("档案写入后校验失败，未能确认原图、骨架图与评分已保存。");
  }catch(e){
    const cause=e instanceof Error?e.message:String(e);
    const guidance=/QuotaExceededError|quota|空间|storage/i.test(cause)
      ?"可能是浏览器本地存储空间不足；请清理不需要的旧评估报告。":
      /SecurityError|InvalidStateError|denied|不可用/i.test(cause)
      ?"可能是无痕模式或浏览器禁止本地存储；请允许此网站使用本地存储。":"请检查浏览器本地存储权限。";
    throw new Error("评分已完成，但自动归档失败："+cause+" "+guidance);
  }
  return id;
}
function reportBody(record:SavedReport):PythonResult{
  const b=record.result as unknown as PythonResult;
  const media:{original?:string;skeleton?:string}={};
  if(record.originalImage)media.original=record.originalImage;
  if(record.image)media.skeleton=record.image;
  return {...b,student_name:record.studentName??"",media};
}
function idParam(url:string):string{
  const part=url.split("/").filter(Boolean)[2];
  return decodeURIComponent(part??"");
}
export interface VideoProgress extends VideoDiagnostics {
  total:number;timeSec:number;phase:"decoding"|"analyzing"|"archiving";
}
export interface BrowserRequest extends RequestInit {
  onProgress?:(progress:VideoProgress)=>void;
}
function emitProgress(options:BrowserRequest,phase:VideoProgress["phase"],
  stats:VideoDiagnostics,total:number,timeSec:number):void {
  try{ options.onProgress?.({...stats,total,timeSec,phase}); }
  catch(error){console.warn("Unable to display video progress",error);}
}

/** Python Web API equivalent, without a remote Python server. */
export async function browserApi(path:string,options:BrowserRequest={}):Promise<any>{
  const method=(options.method??"GET").toUpperCase();
  if(path==="/api/health")return {ok:true,engine:"VectorBody_v2",version:"1.0.0"};
  if(path==="/api/poses")return {poses:POSES.map(({id,name})=>({id,name})),views:["front","side"],levels:["normal","beginner"]};
  if(path==="/api/live/start"&&method==="POST"){
    const raw=JSON.parse(String(options.body??"{}"));
    const pose=String(raw.pose??"warrior2"),view=String(raw.view??"front"),level=String(raw.level??"normal");
    optsCheck(pose,view,level);
    for(const [id,s] of sessionMap)if(performance.now()-s.lastSeen>SESSION_TTL_MS){s.detector.close();sessionMap.delete(id)}
    if(sessionMap.size>=MAX_SESSION)throw new Error("当前实时评估会话较多，请稍后重试。");
    let detector:PoseDetector;
    try{detector=await createPoseDetector()}catch(e){throw new Error("姿态引擎初始化失败："+String(e))}
    const id=generateId(),opts:Options={pose,view:view as View,level:level as Level,studentName:nameValue(raw.student_name)};
    sessionMap.set(id,{opts,detector,engine:new VectorBodyEngine(opts.level),phase:"prepare",
      stableSince:null,lastCenter:null,readyAt:null,best:null,bestOriginal:null,bestSkeleton:null,
      frameIndex:0,lastSeen:performance.now(),archivedId:null});
    return {session_id:id,phase:"prepare",voice:GUIDANCE[opts.pose],message:"请按语音引导进入动作，确保全身入镜。"};
  }
  if(path==="/api/live/frame"&&method==="POST"){
    const fd=options.body;
    if(!(fd instanceof FormData))throw new Error("实时评估参数无效。");
    const id=textVal(fd.get("session_id")),session=sessionMap.get(id);
    if(!session)throw new Error("会话失效，请重新开启实时评估。");
    const blob=fd.get("frame");
    if(!(blob instanceof Blob))throw new Error("未提供实时画面。");
    if(blob.size>5*1024*1024)throw new Error("实时画面过大。");
    session.lastSeen=performance.now();
    const image=await createImageBitmap(blob);
    try{
      const width=image.width,height=image.height;
      session.frameIndex++;
      const p=session.detector.detect(image,performance.now());
      const display=displayPoints(p);
      const result:Record<string,unknown>={phase:session.phase,message:"正在识别动作",
        voice:null,landmarks:display,result:null,best:session.best};
      if(!p||!inView(p)){
        if(session.phase==="hold"){session.phase="prepare";session.engine.reset()}
        session.stableSince=null;session.lastCenter=null;
        return {...result,phase:"framing",message:"请确保全身入镜，关节不要被遮挡。"};
      }
      if(!centered(p,width,height)){
        if(session.phase==="hold"){session.phase="prepare";session.engine.reset()}
        session.stableSince=null;session.lastCenter=null;
        return {...result,phase:"centering",message:"请移动到检测区域中央。"};
      }
      const now=performance.now(),cp=centerPoint(display!);
      if(session.phase==="prepare"){
        if(!session.lastCenter||Math.hypot(cp[0]-session.lastCenter[0],cp[1]-session.lastCenter[1])>=PYTHON_STABLE_CENTER_MOVE)
          session.stableSince=now;
        session.lastCenter=cp;
        const elapsed=(now-(session.stableSince??now))/1000;
        if(elapsed<PYTHON_STABLE_SECONDS)return {...result,phase:"stabilizing",message:"请保持动作稳定 "+Math.min(2,elapsed).toFixed(1)+"/2.0 秒"};
        session.phase="hold";session.readyAt=now;result.voice="动作稳定，开始评估。";
      }
      session.lastCenter=cp;
      const analyzed=session.engine.analyze(pointsFromDisplay(display!,p),session.opts.pose,session.opts.view);
      if(analyzed){
        const scored=realScore(analyzed,display!,session.frameIndex,
          rounded((now-(session.readyAt??now))/1000,2),session.opts);
        result.result=scored;
        if(!session.best||scored.score>session.best.score){
          session.best=scored;
          session.bestOriginal=snapshot(image,width,height,display,false);
          session.bestSkeleton=snapshot(image,width,height,display,true,scored.issue_regions);
        }
      }
      return {...result,phase:"hold",message:"正在检测 · 调整后继续保持即可重新评价",best:session.best};
    }finally{image.close()}
  }
  if((path==="/api/live/save"||path==="/api/live/preview")&&method==="POST"){
    const fd=options.body;
    if(!(fd instanceof FormData))throw new Error("报告参数无效。");
    const session=sessionMap.get(textVal(fd.get("session_id")));
    if(!session)throw new Error("实时评估会话已结束，请在结束前保存。");
    if(!session.best)throw new Error("尚未获得符合原版稳定保持规则的有效评分，不能保存报告。");
    if(path==="/api/live/preview"){
      return {id:session.archivedId??"temp-live",source:"live",created_at:new Date().toISOString(),
        pose:session.opts.pose,view:session.opts.view,level:session.opts.level,
        student_name:session.opts.studentName,score:session.best.score,grade:session.best.grade,
        body:{...session.best,media:{original:session.bestOriginal??undefined,
          skeleton:session.bestSkeleton??undefined}}};
    }
    const reportId=await archive(session.opts,"live",session.best,
      session.bestOriginal,session.bestSkeleton,session.archivedId);
    session.archivedId=reportId;
    return {ok:true,archived:true,report_id:reportId};
  }
  if(path==="/api/live/stop"&&method==="POST"){
    const fd=options.body;
    if(!(fd instanceof FormData))throw new Error("停止评估参数无效。");
    const id=textVal(fd.get("session_id")),s=sessionMap.get(id);
    if(!s)return {ok:true,archived:false};
    sessionMap.delete(id);s.detector.close();
    const wantsArchive=textVal(fd.get("archive"))!=="false";
    const reportId=wantsArchive&&s.best
      ?await archive(s.opts,"live",s.best,s.bestOriginal,s.bestSkeleton,s.archivedId)
      :s.archivedId;
    return {ok:true,archived:!!reportId,report_id:reportId,best:s.best};
  }
  if(path==="/api/video/save"&&method==="POST"){
    const fd=options.body;
    if(!(fd instanceof FormData))throw new Error("视频归档参数无效。");
    const draft=pendingVideo;
    if(!draft||draft.id!==textVal(fd.get("draft_id")))
      throw new Error("临时评分已过期，请重新分析该视频。");
    const reportId=await archive(draft.opts,"video",draft.result,
      draft.original,draft.skeleton,draft.archivedId);
    draft.archivedId=reportId;
    return {ok:true,report_id:reportId};
  }
  if(/^\/api\/video\/draft\/[^/]+$/.test(path)&&method==="GET"){
    const draft=pendingVideo;
    if(!draft||path.split("/").pop()!==draft.id)
      throw new Error("临时评估已过期，请重新分析该视频。");
    return {id:draft.archivedId??draft.id,source:"video",created_at:draft.createdAt,
      pose:draft.opts.pose,view:draft.opts.view,level:draft.opts.level,
      student_name:draft.opts.studentName,score:draft.result.score,grade:draft.result.grade,
      body:{...draft.result,media:{original:draft.original??undefined,
        skeleton:draft.skeleton??undefined}}};
  }
  if(path==="/api/analyze-video"&&method==="POST"){
    const fd=options.body;
    if(!(fd instanceof FormData))throw new Error("视频参数无效。");
    const pose=textVal(fd.get("pose"))||"warrior2";
    const view=textVal(fd.get("view"))||"front";
    const level=textVal(fd.get("level"))||"normal";
    optsCheck(pose,view,level);
    const file=fd.get("file");
    if(!(file instanceof File))throw new Error("视频文件不能为空。");
    const suffix=file.name.split(".").pop()?.toLowerCase()??"";
    if(!allowedVideos.has(suffix))throw new Error("视频格式不支持，请选择MP4、MOV、AVI、MKV或WebM。");
    if(file.size>120*1024*1024)throw new Error("文件不能超过120MB。");
    const opts:Options={pose,view:view as View,level:level as Level,studentName:nameValue(fd.get("student_name"))};
    pendingVideo=null;
    emitProgress(options,"decoding",new PythonVideoEvaluator().stats,0,0);
    const decoder=await BrowserVideoDecoder.open(file);
    let model:PoseDetector|null=null;
    try{
      model=await createPoseDetector();
      const engine=new VectorBodyEngine(opts.level);
      // Preserve Python OpenCV stride=2 and maximum=1800 processed frames.
      // Source FPS is read from MP4 metadata where possible.
      const fps=await inferVideoFps(file),stride=PYTHON_VIDEO_FRAME_STRIDE;
      const totalFrames=Math.min(PYTHON_VIDEO_MAX_PROCESSED,Math.floor(decoder.duration*fps/stride));
      const evaluation=new PythonVideoEvaluator();
      let best:PythonResult|null=null,original:string|null=null,skeleton:string|null=null;
      for(let frame=2;frame<=totalFrames*stride;frame+=stride){
        const t=frame/fps;
        if(t>=decoder.duration)break;
        const canvas=await decoder.frame(Math.max(0,Math.min(t,decoder.duration-0.025)));
        // Canvas freezes precisely the decoded frame for both pose estimation
        // and the best-frame photographic evidence.
        const landmarks=model.detect(canvas,t*1000);
        const inspected=evaluation.inspect(t,landmarks,decoder.width,decoder.height);
        if(inspected.stage==="ready" && landmarks && inspected.display){
          const score=engine.analyze(landmarks,opts.pose,opts.view);
          evaluation.evaluated(!!score);
          if(score){
            const result=realScore(score,inspected.display,frame,rounded(t,2),opts);
            if(!best||result.score>best.score){
              best=result;
              original=snapshot(canvas,decoder.width,decoder.height,inspected.display,false);
              skeleton=snapshot(canvas,decoder.width,decoder.height,inspected.display,true,result.issue_regions);
            }
          }
        }
        // Python threshold and scoring criteria are unchanged.
        // Progress information is diagnostic only, never a fallback score.
        if(evaluation.stats.processed%6===0){
          emitProgress(options,"analyzing",evaluation.stats,totalFrames,t);
          await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
      }
      emitProgress(options,"analyzing",evaluation.stats,totalFrames,decoder.duration);
      if(!best)throw new Error(videoFailureReason(evaluation.stats));
      emitProgress(options,"archiving",evaluation.stats,totalFrames,best.time_sec??decoder.duration);
      // Persistence failures must not erase a genuinely computed score.
      // Keep its actual evidence in memory so the user can retry or print.
      const draft:VideoDraft={id:generateId().slice(0,12),createdAt:new Date().toISOString(),
        opts,result:best,original,skeleton,archivedId:null};
      pendingVideo=draft;
      let reportId:string|null=null,archiveError:string|null=null;
      try{
        reportId=await archive(opts,"video",best,original,skeleton);
        draft.archivedId=reportId;
      }catch(e){archiveError=e instanceof Error?e.message:String(e);}
      return {ok:true,report_id:reportId,draft_id:draft.id,archive_error:archiveError,
        pose:{id:opts.pose,name:names[opts.pose],view:opts.view,level:opts.level},
        result:best,video:{
          processed_frames:evaluation.stats.processed,
          evaluated_frames:evaluation.stats.evaluated,
          best_frame:best.frame_index,best_time_sec:best.time_sec
        },notice:"仅用于教学辅助，不替代教师判断或医疗诊断。"};
    }finally{
      model?.close();
      decoder.close();
    }
  }
  if(path==="/api/reports"&&method==="GET"){
    const reports=(await listReports()).slice(0,100).map(r=>({
      id:r.id,created_at:r.createdAt,source:r.source,pose:r.pose,view:r.view,level:r.level,
      score:r.result.score,grade:r.result.grade,student_name:r.studentName,
      has_photo:!!r.originalImage,preview:r.originalImage??null
    }));
    return {reports};
  }
  if(/^\/api\/reports\/[^/]+$/.test(path)){
    const id=idParam(path);
    const r=await readReport(id);
    if(method==="DELETE"){if(r)await deleteReport(id);return {ok:!!r}}
    if(!r)throw new Error("记录不存在");
    return {id:r.id,created_at:r.createdAt,source:r.source,pose:r.pose,view:r.view,
      level:r.level,score:r.result.score,grade:r.result.grade,student_name:r.studentName??"",
      body:reportBody(r)};
  }
  throw new Error("未知接口："+path);
}
