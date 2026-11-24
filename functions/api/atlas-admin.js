import { atlasServiceStatus, atlasOwner } from "../_atlas-service.js";
const reply=(status,allowed=false)=>Response.json({allowed},{status,headers:{"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'"}});
export async function onRequest({request,env}){
 const status=atlasServiceStatus(request,env);if(status)return reply(status);
 try{
 const reader=request.body?.getReader();if(!reader)return reply(400);
 let bytes=0,raw="";const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();return reply(413);}raw+=decoder.decode(value,{stream:true});}
 raw+=decoder.decode();const {owner}=JSON.parse(raw);
 if(typeof owner!=="string"||!owner||owner.length>128)return reply(400);
 return reply(200,!!(await atlasOwner(env,owner)));
 }catch{return reply(503);}
}
