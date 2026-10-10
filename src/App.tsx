import { useEffect, useRef, useState } from "react";
import { centered, inView, VectorBodyEngine } from "./core/compensationRiskEngine";
import { GUIDANCE, POSES, type DetectedPoint, type Level, type PoseId, type SavedReport, type ScoreResult, type Source, type View } from "./core/types";
import { captureFrame, createPoseDetector, drawSkeleton, type PoseDetector } from "./vision/pose";
import { deleteReport, downloadJson, listReports, saveReport } from "./utils/reports";

type Tab = "home" | "live" | "video" | "reports";
type Status = "idle" | "loading" | "running" | "processing";
interface LiveSession {
  stream: MediaStream; detector: PoseDetector; engine: VectorBodyEngine;
  raf: number; lastTick: number; stableFrom: number | null;
  lastCenter: [number,number] | null; wasHolding: boolean;
  best: ScoreResult | null; bestPhoto: string | null; frames: number;
}
function getName(pose: PoseId): string {
  return POSES.find(p=>p.id===pose)?.name??pose;
}
function ScoreView({result}:{result:ScoreResult}) {
  const metrics=Object.values(result.metrics).sort((a,b)=>a.score-b.score);
  return <section className="score-report">
    <div className="score-heading">
      <div className="score-ring" style={{background:"conic-gradient(#738b73 "+result.score+"%, #e7e9df 0)"}}>
        <div><strong>{Math.round(result.score)}</strong><small>综合评分</small></div>
      </div>
      <div className="score-heading-copy"><div className="eyebrow">VECTORBODY ANALYSIS</div>
        <h3>{result.grade} 级 · {result.grade==="A"?"表现优秀":result.grade==="B"?"动作良好":result.grade==="C"?"建议调整":"请降低幅度"}</h3>
        <p>{result.advice}</p>
        <span className="subtle">视觉代偿风险指标 {result.riskPct.toFixed(1)}% · {result.hold.label}</span>
      </div>
    </div>
    <div className="dimension-grid">
      <div><span>S1 · 姿势符合性</span><strong>{result.dimensions.s1.toFixed(1)}</strong><div className="bar"><i style={{width:result.dimensions.s1+"%"}}/></div></div>
      <div><span>S2 · 拓扑稳定性</span><strong>{result.dimensions.s2.toFixed(1)}</strong><div className="bar"><i style={{width:result.dimensions.s2+"%"}}/></div></div>
      <div><span>S3 · 支撑/代偿代理</span><strong>{result.dimensions.s3.toFixed(1)}</strong><div className="bar"><i style={{width:result.dimensions.s3+"%"}}/></div></div>
    </div>
    <div className="metric-stats">
      <div><span>动态代偿风险</span><b>{result.compensation.mobileLockPct}%</b></div>
      <div><span>稳定代偿风险</span><b>{result.compensation.stiffCompPct}%</b></div>
      <div><span>人体拓扑节点 / 骨骼边</span><b>{result.topologyIK.nodes} / {result.topologyIK.edges}</b></div>
      <div><span>DLS迭代 / 残差</span><b>{result.topologyIK.iterations} / {result.topologyIK.finalResidual.toFixed(5)}</b></div>
    </div>
    <details className="details"><summary>查看完整关节指标及可信度</summary>
      <p className="subtle">骨长参考{result.confidence.ready?"已建立":"尚未建立"} · 骨长一致性 {result.confidence.qualityPct}% · 最大偏差 {result.confidence.maxDeviationPct}%</p>
      {metrics.map(item=><div className="metric-row" key={item.label+item.value}>
        <div><strong>{item.label}</strong><span>检测值 {item.value.toFixed(1)} · 权重 {item.weight}</span></div>
        <b>{item.score.toFixed(0)}</b>
      </div>)}
    </details>
    <p className="clinical-note">仅用于瑜伽教学动作反馈；S3 属于视觉代理指标，非真实肌肉力量或医学诊断。</p>
  </section>;
}
function IconFigure() {
  return <svg viewBox="0 0 360 360" className="hero-figure" aria-hidden="true">
    <circle cx="180" cy="180" r="154" fill="none" stroke="#c5d0b9" strokeWidth="1" strokeDasharray="4 7"/>
    <circle cx="180" cy="180" r="113" fill="none" stroke="#d9d5bd" strokeWidth="1"/>
    <circle cx="184" cy="74" r="22" fill="#c9d3bc"/>
    <path d="M178 98 L164 145 L175 210 L148 292" fill="none" stroke="#718975" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M182 103 L210 150 L221 201 L272 277" fill="none" stroke="#718975" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M172 117 L113 160 L62 176 M190 116 L240 151 L301 166" stroke="#a88f62" strokeWidth="14" fill="none" strokeLinecap="round"/>
    {[[184,74],[176,112],[164,145],[210,150],[175,210],[221,201],[148,292],[272,277],[113,160],[62,176],[240,151],[301,166]].map(([x,y],i)=>
      <circle key={i} cx={x} cy={y} r="5.5" fill="#f5edce" stroke="#668b74" strokeWidth="2"/>)}
    <text x="24" y="34" fill="#748475" fontSize="11" letterSpacing="2">33 LANDMARKS</text>
    <text x="250" y="338" fill="#9f9275" fontSize="11">DLS · TOPOLOGY</text>
  </svg>;
}
export default function App() {
  const [tab,setTab]=useState<Tab>("home");
  const [pose,setPose]=useState<PoseId>("warrior2");
  const [view,setView]=useState<View>("front");
  const [level,setLevel]=useState<Level>("normal");
  const [status,setStatus]=useState<Status>("idle");
  const [message,setMessage]=useState("选择体式，启动摄像头或上传练习视频。");
  const [result,setResult]=useState<ScoreResult|null>(null);
  const [bestImage,setBestImage]=useState<string|null>(null);
  const [videoFile,setVideoFile]=useState<File|null>(null);
  const [progress,setProgress]=useState(0);
  const [reports,setReports]=useState<SavedReport[]>([]);
  const [selectedReport,setSelectedReport]=useState<string|null>(null);
  const [includeImage,setIncludeImage]=useState(false);
  const [saved,setSaved]=useState(false);
  const [currentSource,setCurrentSource]=useState<Source>("live");
  const live=useRef<LiveSession|null>(null);
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const overlayRef=useRef<HTMLCanvasElement|null>(null);
  const cancelVideo=useRef(false);
  const optionRef=useRef({pose,view,level});
  optionRef.current={pose,view,level};
  const readReports=async()=>{try{setReports(await listReports());}catch(e){setMessage("读取浏览器报告失败："+String(e));}};
  useEffect(()=>{void readReports();return()=>{stopLiveInternal();cancelVideo.current=true;};},[]);

  function stopLiveInternal(){
    const session=live.current;if(!session)return;
    cancelAnimationFrame(session.raf);
    session.stream.getTracks().forEach(t=>t.stop());
    session.detector.close();
    if(videoRef.current){videoRef.current.srcObject=null;}
    live.current=null;
  }
  function navigate(next:Tab){
    if(status==="processing"){setMessage("请先完成或取消视频分析。");return;}
    stopLiveInternal();if(status==="running")setStatus("idle");
    setTab(next);if(next==="reports")void readReports();
  }
  function resetForNew(){
    setResult(null);setBestImage(null);setSaved(false);setProgress(0);
  }
  function speak(text:string){
    if(!("speechSynthesis" in window))return;
    speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang="zh-CN";utterance.rate=1.02;
    speechSynthesis.speak(utterance);
  }
  async function startCamera(){
    if(live.current)return;
    if(!navigator.mediaDevices?.getUserMedia){setMessage("请使用 HTTPS 或 localhost，并允许浏览器使用摄像头。");return;}
    resetForNew();setStatus("loading");setMessage("正在加载 MediaPipe 模型并请求摄像头权限…");
    let detector:PoseDetector|null=null,stream:MediaStream|null=null;
    try {
      detector=await createPoseDetector();
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:960},height:{ideal:720}},audio:false});
      const video=videoRef.current;
      if(!video)throw new Error("视频播放器尚未就绪");
      video.srcObject=stream;await video.play();
      const opts=optionRef.current;
      const session:LiveSession={stream,detector,engine:new VectorBodyEngine(opts.level),raf:0,lastTick:0,
        stableFrom:null,lastCenter:null,wasHolding:false,best:null,bestPhoto:null,frames:0};
      live.current=session;setStatus("running");
      setCurrentSource("live");
      setMessage("全身入镜并居中，保持约2秒后开始连续评分。");
      speak(GUIDANCE[opts.pose]);
      const tick=(now:number)=>{
        if(live.current!==session)return;
        session.raf=requestAnimationFrame(tick);
        if(now-session.lastTick<240||video.readyState<2)return;
        session.lastTick=now;session.frames++;
        try {
          const pts=session.detector.detect(video,now);
          const w=video.videoWidth,h=video.videoHeight;
          const canvas=overlayRef.current;
          if(canvas)drawSkeleton(canvas,pts,w,h);
          if(!pts||!inView(pts)||!centered(pts,w,h)) {
            const warning=!pts||!inView(pts)?"请确保全身入镜、脚踝和手腕无遮挡。":"请移动到检测区域中央。";
            setMessage(warning);
            if(session.wasHolding){session.engine.reset();session.wasHolding=false;}
            session.stableFrom=null;session.lastCenter=null;
            return;
          }
          const cx=(pts[11].x+pts[12].x+pts[23].x+pts[24].x)/4;
          const cy=(pts[11].y+pts[12].y+pts[23].y+pts[24].y)/4;
          if(!session.lastCenter||Math.hypot(cx-session.lastCenter[0],cy-session.lastCenter[1])>=0.012)
            session.stableFrom=now;
          session.lastCenter=[cx,cy];
          const elapsed=now-(session.stableFrom??now);
          if(elapsed<2000){setMessage("请保持动作稳定 "+(elapsed/1000).toFixed(1)+" / 2.0 秒");return;}
          session.wasHolding=true;
          const opts=optionRef.current;
          const scored=session.engine.analyze(pts,opts.pose,opts.view,Math.round(elapsed/100)/10,session.frames);
          if(!scored)return;
          setResult(scored);setMessage("正在检测 · 可随时调整动作重新评价");
          if(!session.best||scored.score>session.best.score){
            session.best=scored;session.bestPhoto=captureFrame(video,pts);
            setBestImage(session.bestPhoto);setSaved(false);
          }
        }catch(e){setMessage("摄像头推理失败："+String(e));stopLiveInternal();setStatus("idle");}
      };
      session.raf=requestAnimationFrame(tick);
    }catch(e){
      stream?.getTracks().forEach(t=>t.stop());detector?.close();
      setStatus("idle");setMessage("无法启动实时检测："+String(e));
    }
  }
  function stopCamera(){
    if(!live.current)return;
    const best=live.current.best;
    const photo=live.current.bestPhoto;
    stopLiveInternal();setStatus("idle");
    if(best){setResult(best);setBestImage(photo);setMessage("实时检测已停止。可选择保存最佳评估记录。");}
    else setMessage("实时检测已停止，尚未获取有效的稳定姿态。");
  }

  async function analyzeVideo(){
    if(!videoFile){setMessage("请先选择一个视频文件。");return;}
    resetForNew();cancelVideo.current=false;setStatus("processing");setCurrentSource("video");
    setMessage("正在加载视频与 MediaPipe 模型…");
    let detector:PoseDetector|null=null,element:HTMLVideoElement|null=null,url:string|null=null;
    try {
      detector=await createPoseDetector();
      element=document.createElement("video");
      element.muted=true;element.playsInline=true;element.preload="auto";
      element.style.display="none";document.body.appendChild(element);
      url=URL.createObjectURL(videoFile);element.src=url;
      const el=element;
      await new Promise<void>((resolve,reject)=>{
        el.addEventListener("loadeddata",()=>resolve(),{once:true});
        el.addEventListener("error",()=>reject(new Error("浏览器不能解码此视频，请使用 H.264 MP4 或 WebM。")),{once:true});
        el.load();
      });
      const duration=el.duration;
      if(!Number.isFinite(duration)||duration<=0)throw new Error("无法读取视频长度");
      const limit=Math.min(duration,120); // Demo safety cap; avoid locking client for huge uploads.
      const engine=new VectorBodyEngine(optionRef.current.level);
      let stableFrom:number|null=null,lastCenter:[number,number]|null=null;
      let best:ScoreResult|null=null,bestPhoto:string|null=null,good=0;
      let index=0;
      for(let t=0;t<limit;t+=0.20){
        if(cancelVideo.current)throw new Error("已取消视频分析");
        if(t>0)await new Promise<void>((resolve,reject)=>{
          const onSeek=()=>{el.removeEventListener("error",onError);resolve();};
          const onError=()=>{el.removeEventListener("seeked",onSeek);reject(new Error("视频跳帧失败"));};
          el.addEventListener("seeked",onSeek,{once:true});
          el.addEventListener("error",onError,{once:true});
          el.currentTime=Math.min(t,duration-0.025);
        });
        index++;
        const pts=detector.detect(el,Math.round(t*1000)+1);
        if(pts && inView(pts) && centered(pts,el.videoWidth,el.videoHeight)) {
          const cx=(pts[11].x+pts[12].x+pts[23].x+pts[24].x)/4;
          const cy=(pts[11].y+pts[12].y+pts[23].y+pts[24].y)/4;
          if(!lastCenter||Math.hypot(cx-lastCenter[0],cy-lastCenter[1])>=0.012)stableFrom=t;
          lastCenter=[cx,cy];
          if(stableFrom!==null&&t-stableFrom>=2){
            const scored=engine.analyze(pts,optionRef.current.pose,optionRef.current.view,t,index);
            if(scored){
              good++;
              if(!best||scored.score>best.score){
                best=scored;bestPhoto=captureFrame(el,pts);
              }
            }
          }
        }else{stableFrom=null;lastCenter=null;}
        if(index%4===0){
          setProgress(Math.round(100*Math.min(1,t/limit)));
          setMessage("正在逐帧分析 · "+Math.round(100*t/limit)+"% · 有效评分帧 "+good);
          await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
      }
      if(!best)throw new Error("未找到稳定2秒以上的有效姿态，请确认全身入镜、正侧位及视频画面清晰。");
      setResult(best);setBestImage(bestPhoto);setProgress(100);
      setMessage("分析完成：有效评分帧 "+good+"；最佳时刻 "+(best.timeSec??0).toFixed(1)+" 秒。可以保存报告。");
    }catch(e){setMessage(String(e));}
    finally{
      detector?.close();if(element){element.removeAttribute("src");element.load();element.remove();}
      if(url)URL.revokeObjectURL(url);
      setStatus("idle");
    }
  }
  async function archive(){
    if(!result){setMessage("请先完成一次有效评估。");return;}
    if(saved){setMessage("这次结果已经保存。");return;}
    try{
      const report:SavedReport={
        id:crypto.randomUUID(),createdAt:new Date().toISOString(),source:currentSource,
        pose,view,level,result,image:includeImage?(bestImage??undefined):undefined
      };
      await saveReport(report);setSaved(true);setMessage("评估记录已保存到当前浏览器的 IndexedDB。");
      await readReports();
    }catch(e){setMessage("保存失败："+String(e));}
  }
  async function remove(id:string){
    if(!window.confirm("确定删除这条浏览器本地评估记录吗？"))return;
    try{await deleteReport(id);if(selectedReport===id)setSelectedReport(null);await readReports();}
    catch(e){setMessage("删除失败："+String(e));}
  }
  const selected=reports.find(r=>r.id===selectedReport);
  return <div className="app">
    <header className="site-header">
      <div className="brand" onClick={()=>navigate("home")} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter")navigate("home");}}>
        <div className="brand-mark">V<span>·</span></div>
        <div><strong>智瑜镜</strong><small>VECTORBODY <b>2.0</b></small></div>
      </div>
      <nav aria-label="主导航">
        {([["home","产品首页"],["live","实时评估"],["video","视频评估"],["reports","学习档案"]] as [Tab,string][]).map(([key,name])=>
          <button type="button" className={tab===key?"active":""} onClick={()=>navigate(key)} key={key}>{name}</button>)}
      </nav>
      <div className="header-meta"><span className="online-dot"/> AI · ON DEVICE</div>
    </header>
    <main>
      {tab==="home"&&<div className="home">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="mini-dot"/> EXPLAINABLE MOTION INTELLIGENCE</div>
            <h1>让每一次练习<br/><em>都有迹可循。</em></h1>
            <p>可解释视觉 AI 驱动的大学瑜伽「教—学—练—评」一体化智能体。让姿态理解、代偿风险提示与个性化反馈，发生在你的浏览器里。</p>
            <div className="hero-actions">
              <button className="primary" onClick={()=>navigate("live")}>开启实时评估 <span>↗</span></button>
              <button className="secondary" onClick={()=>navigate("video")}>上传动作视频 <span>→</span></button>
            </div>
            <div className="hero-footnote"><span className="online-dot"/> 完全浏览器端推理 · 不上传视频至业务服务器</div>
          </div>
          <div className="hero-visual"><div className="art-disc"/><IconFigure/><div className="floating-label a">33 <small>KEYPOINTS</small></div><div className="floating-label b">S1 · S2 · S3 <small>INTERPRETABLE</small></div></div>
        </section>
        <section className="feature-grid">
          <div className="feature"><div className="feature-num">01 / PERCEPTION</div><div className="feature-icon">◎</div><h3>视觉姿态感知</h3><p>MediaPipe 提取人体 33 个关键点，实时可视化运动链与身体轴线。</p></div>
          <div className="feature"><div className="feature-num">02 / RECONSTRUCTION</div><div className="feature-icon">⌁</div><h3>拓扑与 DLS 优化</h3><p>骨盆根人体拓扑树、虚拟骨长约束与阻尼最小二乘姿态稳定。</p></div>
          <div className="feature"><div className="feature-num">03 / FEEDBACK</div><div className="feature-icon">↗</div><h3>多维可解释反馈</h3><p>S1 姿态符合性、S2 稳定性、S3 视觉支撑代理，定位偏差并给出建议。</p></div>
        </section>
        <section className="wide-note"><div><div className="eyebrow">DESIGNED FOR PRACTICE</div><h2>从一次动作，<br/>到持续进步的证据。</h2></div><p>支持八种体式、正面与侧面视角、两种难度模式。评估结果可手动保存于当前浏览器。评分仅供教学辅助，不替代教师判断或医学诊断。</p></section>
      </div>}
      {(tab==="live"||tab==="video")&&<div className="workspace">
        <div className="workspace-title"><div><div className="eyebrow">PRACTICE STUDIO / {tab==="live"?"LIVE":"VIDEO"}</div>
          <h1>{tab==="live"?"实时动作评估":"视频动作分析"}</h1><p>从动作捕捉到分项反馈，理解姿态背后的运动链。</p></div>
          <span className="mode-chip">{tab==="live"?"● LIVE SESSION":"◉ VIDEO ANALYSIS"}</span>
        </div>
        <div className="workspace-grid">
          <section className="studio card">
            <div className="card-top"><div><small>01 / EVALUATION SETUP</small><h3>选择动作与观察方式</h3></div><span className="small-badge">8 POSES</span></div>
            <div className="fields">
              <label>练习体式<select value={pose} disabled={status!=="idle"} onChange={e=>{setPose(e.target.value as PoseId);resetForNew();}}>
                {POSES.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
              <label>观察视角<select value={view} disabled={status!=="idle"} onChange={e=>{setView(e.target.value as View);resetForNew();}}>
                <option value="front">正面视角</option><option value="side">侧面视角</option></select></label>
              <label>难度等级<select value={level} disabled={status!=="idle"} onChange={e=>{setLevel(e.target.value as Level);resetForNew();}}>
                <option value="normal">普通标准</option><option value="beginner">初学者</option></select></label>
            </div>
            <div className="guidance"><span>动作提示</span><p>{GUIDANCE[pose]}</p></div>
            {tab==="live"?<>
              <div className="camera-stage">
                <video ref={videoRef} playsInline muted className="camera-video mirror"/>
                <canvas ref={overlayRef} className="camera-overlay mirror"/>
                {status!=="running"&&<div className="camera-placeholder">
                  <div className="camera-symbol">◎</div><strong>等待启动摄像头</strong><span>画面仅在当前设备中处理</span>
                </div>}
                {status==="running"&&<span className="record-dot">●  REAL-TIME</span>}
              </div>
              <div className="stage-actions">
                {status==="running"?<button className="secondary stretch" onClick={stopCamera}>停止检测</button>:
                  <button className="primary stretch" disabled={status==="loading"} onClick={()=>void startCamera()}>
                    {status==="loading"?"正在加载模型…":"启动实时评估 ↗"}</button>}
              </div>
            </>:<>
              <label className="upload-zone">
                <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/*"
                  disabled={status!=="idle"} onChange={e=>{setVideoFile(e.target.files?.[0]??null);resetForNew();}}/>
                <span className="upload-icon">↑</span>
                <strong>{videoFile?videoFile.name:"选择视频文件"}</strong>
                <small>{videoFile?(videoFile.size/1024/1024).toFixed(1)+" MB · 点击更换":"支持浏览器可解码的 MP4 / WebM · 单次最多分析前120秒"}</small>
              </label>
              {status==="processing"&&<div className="progress-wrap"><div className="bar"><i style={{width:progress+"%"}}/></div><span>{progress}%</span></div>}
              <div className="stage-actions">{status==="processing"?
                <button className="secondary stretch" onClick={()=>{cancelVideo.current=true;setMessage("正在停止分析…");}}>取消分析</button>:
                <button className="primary stretch" disabled={!videoFile} onClick={()=>void analyzeVideo()}>开始视频分析 ↗</button>}</div>
              {bestImage&&<img className="best-image" src={bestImage} alt="最佳帧骨骼叠加图"/>}
            </>}
            <div className="status-msg" role="status"><span className="online-dot"/>{message}</div>
          </section>
          <section className="results card">
            <div className="card-top"><div><small>02 / EXPLAINABLE FEEDBACK</small><h3>动作质量报告</h3></div><span className="small-badge">S1 · S2 · S3</span></div>
            {result?<><ScoreView result={result}/>
              <div className="archive-actions">
                <label className="checkline"><input type="checkbox" checked={includeImage} onChange={e=>setIncludeImage(e.target.checked)}/>在当前浏览器中一同保存动作截图</label>
                <button className="primary stretch" disabled={saved} onClick={()=>void archive()}>{saved?"本次已保存 ✓":"保存本次评估报告"}</button>
                <button className="secondary stretch" onClick={()=>speak(result.advice)}>朗读纠正建议</button>
              </div></>:<div className="empty-result"><div>↗</div><h3>等待分析结果</h3>
                <p>启用实时摄像头或上传视频后，这里会显示关节符合性、拓扑稳定性、视觉支撑代理及个性化反馈。</p>
                <div className="dimension-placeholder"><span>S1</span><span>S2</span><span>S3</span></div></div>}
          </section>
        </div>
      </div>}
      {tab==="reports"&&<div className="workspace reports-page">
        <div className="workspace-title"><div><div className="eyebrow">YOUR PRIVATE PRACTICE RECORDS</div><h1>学习档案</h1>
          <p>记录只存储于此浏览器的 IndexedDB，不会自动同步至其他设备。</p></div>
          <span className="mode-chip">{reports.length} RECORDS</span></div>
        {reports.length?<div className="archive-layout">
          <div className="card archive-list">{reports.map(r=><button key={r.id} className={"archive-item "+(selectedReport===r.id?"chosen":"")}
            onClick={()=>setSelectedReport(r.id)}>
            <div><strong>{getName(r.pose)} <span>· {r.view==="front"?"正位":"侧位"}</span></strong>
              <small>{new Date(r.createdAt).toLocaleString("zh-CN")} · {r.source==="live"?"实时":"视频"}</small></div>
            <b>{Math.round(r.result.score)}<small>分</small></b></button>)}</div>
          <div className="card archive-detail">{selected?<><div className="archive-detail-head">
            <div className="eyebrow">ARCHIVED ASSESSMENT</div><h3>{getName(selected.pose)}</h3>
            <span className="subtle">{selected.view==="front"?"正面":"侧面"} · {selected.level==="beginner"?"初学者":"普通"} · {new Date(selected.createdAt).toLocaleString("zh-CN")}</span></div>
            {selected.image&&<img className="saved-photo" src={selected.image} alt="已保存的姿态评分照片"/>}
            <ScoreView result={selected.result}/>
            <div className="archive-actions row-buttons"><button className="secondary" onClick={()=>downloadJson(selected)}>下载 JSON 数据</button>
              <button className="secondary danger" onClick={()=>void remove(selected.id)}>删除记录</button></div></>:
            <div className="empty-result"><div>▤</div><h3>选择一条评估记录</h3><p>查看完整分项报告、纠正建议，并下载数据。</p></div>}</div>
        </div>:<div className="card empty-archive"><div>▤</div><h2>这里尚无保存的评估</h2><p>完成一次实时检测或视频分析，然后选择“保存本次评估报告”。</p>
          <button className="primary" onClick={()=>navigate("live")}>去进行评估 ↗</button></div>}
        <p className="clinical-note">隐私提醒：换设备或清除浏览器网站数据可能导致记录丢失。请主动导出需要留存的结果。</p>
      </div>}
    </main>
    <footer className="footer"><div><strong>智瑜镜</strong><span>VECTORBODY 2.0</span></div><p>可解释视觉人工智能 · 教学辅助系统 · 非医疗诊断</p><span>© 2026 VectorBody Project</span></footer>
  </div>;
}
