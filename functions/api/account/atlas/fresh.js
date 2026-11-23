import {cookieUser} from "../../../_account.js";
import {adminOf} from "../../pigeon/[[path]].js";
const reply=(status,data)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'"}});
export async function onRequest({request,env}){
 if(request.method!=="GET"||new URL(request.url).hostname!=="account.inflite.ai")return reply(404,{fresh:false});
 if(request.headers.get("Origin")!=="https://inflite.ai")return reply(403,{fresh:false});
 try{const [u,a]=await Promise.all([cookieUser(request,env),adminOf(env)]);const age=Date.now()-Number(u?.authAt);if(!u||u.handed||!a||u.id!==a.id||!(Number(a.passkeys)>0)||!Number.isFinite(age)||age<0||age>=600000)return reply(403,{fresh:false});return reply(200,{fresh:true,owner:String(u.id)});}catch{return reply(503,{fresh:false});}
}
