import { adminOf } from "./pigeon/[[path]].js";
const reply=(status,allowed=false)=>Response.json({allowed},{status,headers:{"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'"}});
export async function onRequest({request,env}){
 if(request.method!=="POST")return reply(405);
 if(new URL(request.url).hostname!=="account.inflite.ai")return reply(404);
 const key=env.ATLAS_VERIFY_KEY;
 if(typeof key!=="string"||key.length<32)return reply(503);
 const supplied=request.headers.get("Authorization")||"";
 const expected="Bearer "+key;
 if(supplied.length!==expected.length)return reply(403);
 let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=supplied.charCodeAt(i)^expected.charCodeAt(i);
 if(mismatch)return reply(403);
 try{
 const reader=request.body?.getReader();if(!reader)return reply(400);
 let bytes=0,raw="";const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();return reply(413);}raw+=decoder.decode(value,{stream:true});}
 raw+=decoder.decode();const {owner}=JSON.parse(raw);
 if(typeof owner!=="string"||!owner||owner.length>128)return reply(400);
 const admin=await adminOf(env);return reply(200,!!admin&&String(admin.id)===owner&&Number(admin.passkeys)>0);
 }catch{return reply(503);}
}
