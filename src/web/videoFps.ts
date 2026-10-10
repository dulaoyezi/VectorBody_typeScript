/**
 * MP4 frame-rate metadata reader for browser video analysis.
 * Python Web uses CAP_PROP_FPS and processes every second decoded frame.
 * HTMLVideoElement does not expose container FPS, so retrieve avg FPS from
 * mp4 moov/trak(mdhd,hdlr,stts) when available; otherwise fallback to 30fps.
 * No video transcoding; only read small head/tail byte ranges.
 */
type Box={type:string;start:number;end:number;body:number};
function u32(bytes:Uint8Array,at:number):number{
  if(at<0||at+4>bytes.length)return 0;
  return (((bytes[at]*0x1000000)+(bytes[at+1]<<16)+(bytes[at+2]<<8)+bytes[at+3])>>>0);
}
function ascii(bytes:Uint8Array,at:number):string{
  if(at<0||at+4>bytes.length)return "";
  return String.fromCharCode(bytes[at],bytes[at+1],bytes[at+2],bytes[at+3]);
}
function boxes(bytes:Uint8Array,start:number,end:number):Box[]{
  const out:Box[]=[];
  let i=start;
  while(i+8<=end){
    const size=u32(bytes,i),type=ascii(bytes,i+4);
    const length=size||end-i;
    if(length<8||i+length>end)break;
    out.push({type,start:i,end:i+length,body:i+8});
    i+=length;
  }
  return out;
}
function child(bytes:Uint8Array,parent:Box,type:string):Box|undefined{
  return boxes(bytes,parent.body,parent.end).find(x=>x.type===type);
}
function videoFps(bytes:Uint8Array,moov:Box):number|null{
  for(const track of boxes(bytes,moov.body,moov.end).filter(b=>b.type==="trak")){
    const mdia=child(bytes,track,"mdia");
    if(!mdia)continue;
    const hdlr=child(bytes,mdia,"hdlr");
    const mdhd=child(bytes,mdia,"mdhd");
    if(!hdlr||!mdhd||ascii(bytes,hdlr.body+8)!=="vide")continue;
    const version=bytes[mdhd.body];
    const timescale=u32(bytes,mdhd.body+(version===1?20:12));
    if(timescale<=0)return null;
    const minf=child(bytes,mdia,"minf"),stbl=minf&&child(bytes,minf,"stbl");
    const stts=stbl&&child(bytes,stbl,"stts");
    if(!stts||stts.end<stts.body+8)return null;
    const count=Math.min(u32(bytes,stts.body+4),200_000);
    let samples=0,duration=0;
    for(let i=0;i<count;i++){
      const p=stts.body+8+i*8;
      if(p+8>stts.end)break;
      const n=u32(bytes,p),delta=u32(bytes,p+4);
      if(!n||!delta)continue;
      samples+=n;duration+=n*delta;
    }
    if(samples>0&&duration>0){
      const rate=samples*timescale/duration;
      return Number.isFinite(rate)&&rate>=1&&rate<=240?rate:null;
    }
  }
  return null;
}
export function fpsFromMp4(bytes:Uint8Array):number|null{
  // A complete 'moov' box must be present in this byte range.
  // Scan candidate positions, including moov placed after a large mdat.
  for(let i=0;i+8<=bytes.length;i++){
    if(ascii(bytes,i+4)!=="moov")continue;
    const size=u32(bytes,i);
    if(size<16||i+size>bytes.length)continue;
    const moov:Box={type:"moov",start:i,end:i+size,body:i+8};
    const fps=videoFps(bytes,moov);
    if(fps!==null)return fps;
  }
  return null;
}
export async function inferVideoFps(file:File):Promise<number>{
  if(!/\.(mp4|mov|m4v)$/i.test(file.name))return 30;
  const length=Math.min(file.size,8*1024*1024);
  const first=new Uint8Array(await file.slice(0,length).arrayBuffer());
  let fps=fpsFromMp4(first);
  if(fps===null && file.size>length){
    const last=new Uint8Array(await file.slice(file.size-length).arrayBuffer());
    fps=fpsFromMp4(last);
  }
  return fps??30;
}
