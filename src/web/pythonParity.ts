/**
 * Behavioral constants and hold gate translated from VectorBody_v2/web_app.py.
 * No relaxed hold/fallback scoring: this follows the Python Web implementation.
 */
export const PYTHON_VIDEO_FRAME_STRIDE=2;
export const PYTHON_VIDEO_MAX_PROCESSED=1800;
export const PYTHON_VIDEO_DEFAULT_FPS=30;
export const PYTHON_STABLE_CENTER_MOVE=0.012;
export const PYTHON_STABLE_SECONDS=2.0;
export const PYTHON_FRAME_VISIBILITY=0.30;
export const PYTHON_HIP_CLIP_Y=0.9;
export const PYTHON_SCORE_WEIGHTS={s1:0.30,s2:0.35,s3:0.35} as const;
export class PythonStableHold {
  lastCenter: [number,number]|null=null;
  stableFrom:number|null=null;
  reset(){this.lastCenter=null;this.stableFrom=null;}
  observe(t:number,current:[number,number]):boolean {
    if(!this.lastCenter||Math.hypot(current[0]-this.lastCenter[0],current[1]-this.lastCenter[1])>=PYTHON_STABLE_CENTER_MOVE)
      this.stableFrom=t;
    this.lastCenter=current;
    return this.stableFrom!==null&&t-this.stableFrom>=PYTHON_STABLE_SECONDS;
  }
}
