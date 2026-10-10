/**
 * Browser counterpart to OpenCV VideoCapture: seek, wait for decoded frame,
 * copy its pixels to a canvas before giving the frame to MediaPipe.
 * Python hold / scoring rules are untouched.
 */
const LOAD_TIMEOUT_MS=20000;
const SEEK_TIMEOUT_MS=12000;
const HAVE_FRAME=2; // HTMLMediaElement.HAVE_CURRENT_DATA

export function explainDecodeError(error:unknown):string {
  const message=error instanceof Error?error.message:String(error);
  if(/MEDIA_ERR_DECODE|MEDIA_ERR_SRC_NOT_SUPPORTED|codec|not supported|无法解码|不能解码/i.test(message))
    return "浏览器无法解码此视频。Python/OpenCV能够解码的某些MOV、AVI、MKV或HEVC文件，浏览器不一定支持；请转换成H.264编码的MP4再试。";
  return message;
}
export async function waitForVideoData(video:HTMLVideoElement, timeout=LOAD_TIMEOUT_MS):Promise<void> {
  if(video.error)throw new Error("浏览器无法解码该视频。");
  if(video.readyState>=HAVE_FRAME && video.videoWidth>0 && video.videoHeight>0)return;
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>done(new Error("视频解码超时，请确认文件格式和完整性。")),timeout);
    const onReady=()=>{if(video.readyState>=HAVE_FRAME && video.videoWidth>0 && video.videoHeight>0)done();};
    const onError=()=>done(new Error("浏览器无法解码该视频，建议转换为H.264 MP4。"));
    const done=(e?:Error)=>{
      clearTimeout(timer);
      video.removeEventListener("loadeddata",onReady);
      video.removeEventListener("canplay",onReady);
      video.removeEventListener("error",onError);
      e?reject(e):resolve();
    };
    video.addEventListener("loadeddata",onReady);
    video.addEventListener("canplay",onReady);
    video.addEventListener("error",onError);
    onReady();
  });
}
export async function seekDecodedVideo(video:HTMLVideoElement,time:number, timeout=SEEK_TIMEOUT_MS):Promise<void> {
  if(!Number.isFinite(time)||time<0)throw new Error("视频帧时间戳不正确。");
  if(video.error)throw new Error("浏览器视频解码失败。");
  if(Math.abs(video.currentTime-time)>0.0008 || video.readyState<HAVE_FRAME){
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>done(new Error("视频逐帧定位超时。")),timeout);
      const onSeeked=()=>done();
      const onError=()=>done(new Error("视频帧解码失败。"));
      const done=(e?:Error)=>{
        clearTimeout(timer);
        video.removeEventListener("seeked",onSeeked);
        video.removeEventListener("error",onError);
        e?reject(e):resolve();
      };
      video.addEventListener("seeked",onSeeked);
      video.addEventListener("error",onError);
      try{video.currentTime=time;}
      catch(e){done(new Error("无法定位视频帧："+String(e)));}
    });
  }
  await waitForVideoData(video,timeout);
}
export class BrowserVideoDecoder {
  readonly video:HTMLVideoElement;
  readonly canvas:HTMLCanvasElement;
  private readonly context:CanvasRenderingContext2D;
  private readonly url:string;
  private closed=false;
  private constructor(file:File){
    this.url=URL.createObjectURL(file);
    this.video=document.createElement("video");
    this.video.preload="auto";
    this.video.muted=true;
    this.video.playsInline=true;
    // display:none may suspend media decoding on certain browsers.
    this.video.style.cssText="position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    this.canvas=document.createElement("canvas");
    const ctx=this.canvas.getContext("2d");
    if(!ctx)throw new Error("浏览器无法建立视频画布。");
    this.context=ctx;
  }
  static async open(file:File):Promise<BrowserVideoDecoder>{
    const decoder=new BrowserVideoDecoder(file);
    document.body.appendChild(decoder.video);
    try {
      decoder.video.src=decoder.url;
      decoder.video.load();
      await waitForVideoData(decoder.video);
      if(!Number.isFinite(decoder.video.duration)||decoder.video.duration<=0)
        throw new Error("无法读取视频时长，建议转换为H.264 MP4。");
      decoder.canvas.width=decoder.video.videoWidth;
      decoder.canvas.height=decoder.video.videoHeight;
      return decoder;
    } catch(e) { decoder.close();throw new Error(explainDecodeError(e)); }
  }
  get duration(){return this.video.duration;}
  get width(){return this.canvas.width;}
  get height(){return this.canvas.height;}
  async frame(time:number):Promise<HTMLCanvasElement>{
    if(this.closed)throw new Error("视频已经关闭。");
    try{
      await seekDecodedVideo(this.video,time);
      this.context.drawImage(this.video,0,0,this.canvas.width,this.canvas.height);
      return this.canvas;
    }catch(e){throw new Error("读取视频 "+time.toFixed(2)+" 秒的画面失败："+explainDecodeError(e));}
  }
  close(){
    if(this.closed)return;
    this.closed=true;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    URL.revokeObjectURL(this.url);
  }
}
