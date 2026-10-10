import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { DetectedPoint } from "../core/types";
const WASM = import.meta.env.VITE_MEDIAPIPE_WASM_URL ||
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL = import.meta.env.VITE_MEDIAPIPE_MODEL_URL ||
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
export interface PoseDetector {
  detect(video: HTMLVideoElement, milliseconds: number): DetectedPoint[] | null;
  close(): void;
}
export async function createPoseDetector(): Promise<PoseDetector> {
  const fileset=await FilesetResolver.forVisionTasks(WASM);
  let engine: PoseLandmarker;
  try {
    engine=await PoseLandmarker.createFromOptions(fileset,{
      baseOptions:{modelAssetPath:MODEL,delegate:"GPU"},
      runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:0.5,
      minPosePresenceConfidence:0.5,minTrackingConfidence:0.5
    });
  } catch (gpuError) {
    console.warn("MediaPipe GPU unavailable; retrying on CPU",gpuError);
    engine=await PoseLandmarker.createFromOptions(fileset,{
      baseOptions:{modelAssetPath:MODEL,delegate:"CPU"},
      runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:0.5,
      minPosePresenceConfidence:0.5,minTrackingConfidence:0.5
    });
  }
  let lastTimestamp=-1;
  return {
    detect(video, milliseconds) {
      // MediaPipe VIDEO timestamps must be strictly monotonic.
      const t=Math.max(lastTimestamp+1,Math.round(milliseconds));
      lastTimestamp=t;
      const pose=engine.detectForVideo(video,t).landmarks?.[0];
      if(!pose || pose.length<33)return null;
      return pose.map(p=>({x:p.x,y:p.y,z:p.z,visibility:p.visibility??1}));
    },
    close(){engine.close();}
  };
}
export const DRAW_EDGES: [number,number][] = [
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
  [23,25],[25,27],[27,29],[27,31],[24,26],[26,28],[28,30],[28,32],
  [7,11],[8,12]
];
export function drawSkeleton(canvas:HTMLCanvasElement,points:DetectedPoint[]|null,
  width:number,height:number,background?:CanvasImageSource) {
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");if(!ctx)return;
  ctx.clearRect(0,0,width,height);
  if(background)ctx.drawImage(background,0,0,width,height);
  if(!points)return;
  ctx.lineWidth=Math.max(2,width/320);ctx.lineCap="round";ctx.strokeStyle="#d4a150";
  for(const [a,b] of DRAW_EDGES){
    if((points[a].visibility??1)<0.25||(points[b].visibility??1)<0.25)continue;
    ctx.beginPath();ctx.moveTo(points[a].x*width,points[a].y*height);
    ctx.lineTo(points[b].x*width,points[b].y*height);ctx.stroke();
  }
  ctx.fillStyle="#a8c7a8";
  for(const i of [0,7,8,11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32]){
    const p=points[i];if(!p||p.visibility<0.25)continue;
    ctx.beginPath();ctx.arc(p.x*width,p.y*height,Math.max(2.5,width/210),0,Math.PI*2);ctx.fill();
  }
}
export function captureFrame(video:HTMLVideoElement,points:DetectedPoint[]|null) {
  const width=Math.min(video.videoWidth||640,720);
  const height=Math.round(width*(video.videoHeight||480)/(video.videoWidth||640));
  const canvas=document.createElement("canvas");
  drawSkeleton(canvas,points,width,height,video);
  return canvas.toDataURL("image/jpeg",0.72);
}
