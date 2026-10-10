import { describe,expect,it } from "vitest";
import { fpsFromMp4 } from "../src/web/videoFps";

const encoder=new TextEncoder();
function box(type:string,payload:Uint8Array):Uint8Array{
 const result=new Uint8Array(payload.length+8),v=new DataView(result.buffer);
 v.setUint32(0,result.length,false);
 result.set(encoder.encode(type),4);result.set(payload,8);
 return result;
}
function concat(...arrays:Uint8Array[]):Uint8Array{
 const length=arrays.reduce((s,b)=>s+b.length,0);
 const result=new Uint8Array(length);let k=0;
 for(const b of arrays){result.set(b,k);k+=b.length;}
 return result;
}
function example(fps:number):Uint8Array{
 const timescale=fps*1000;
 const hdlr=new Uint8Array(12);hdlr.set(encoder.encode("vide"),8);
 const mdhd=new Uint8Array(20);new DataView(mdhd.buffer).setUint32(12,timescale,false);
 const stts=new Uint8Array(16);
 const v=new DataView(stts.buffer);
 v.setUint32(4,1,false);v.setUint32(8,900,false);v.setUint32(12,1000,false);
 const stbl=box("stbl",box("stts",stts));
 const minf=box("minf",stbl);
 const mdia=box("mdia",concat(box("mdhd",mdhd),box("hdlr",hdlr),minf));
 const trak=box("trak",mdia),moov=box("moov",trak);
 return concat(box("ftyp",new Uint8Array(8)),box("mdat",new Uint8Array(50)),moov);
}
describe("OpenCV-like source video FPS metadata",()=>{
 it("reads 30fps MP4 stts from its video track",()=>expect(fpsFromMp4(example(30))).toBe(30));
 it("reads 24fps MP4 instead of always assuming 30fps",()=>expect(fpsFromMp4(example(24))).toBe(24));
 it("does not fabricate frame rate from invalid bytes",()=>expect(fpsFromMp4(new Uint8Array(256))).toBeNull());
});
