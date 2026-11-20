// Exercise the exact site loop planner against an offline, resource-capped container.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {runProbes,runCorridorChecks,PROBES,LOOP_CHECK_GROUPS,loopCheckQuery} from '../src/probes.js';
import {handleCorridors,readCorridorIndex} from '../src/corridors.js';
const data = await readFile(new URL('../.build/corridors.bin', import.meta.url));
const index = readCorridorIndex(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
const fetcher=async request=>{
 if(new URL(request.url).pathname==='/corridors')return handleCorridors(request,index);
 const body=await request.text();
 const raw=await new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i','inflite-routing-check','java','-Xmx32m','-cp','/opt/router/classes','Probe','route'],{stdio:['pipe','pipe','pipe']});let out='',size=0;
  const timer=setTimeout(()=>{p.kill();reject(Error('Offline container probe timed out.'));},40000);
  p.stdout.on('data',b=>{size+=b.length;if(size>4*1024*1024){p.kill();reject(Error('Probe response too large.'));}else out+=b;});
  p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('exit',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error('Offline routing request failed.'));});p.stdin.end(body);
 });
 const end=raw.indexOf('\n'),status=Number(raw.slice(0,end));if(!Number.isInteger(status)||status<200||status>599)throw Error('Invalid probe response.');return new Response(raw.slice(end+1),{status});
};
const corridors = await runCorridorChecks(fetcher);
console.log(JSON.stringify({check:'corridors',...corridors}));
if(!corridors.ready)throw Error('The offline corridor index failed its checks.');
for(const modes of LOOP_CHECK_GROUPS){
 let ready=false;
 for(const check of modes){
  const query=loopCheckQuery(check);
  const result=await runProbes(fetcher,check==='loops'?PROBES:[],{query});
  console.log(JSON.stringify({check,seed:query.seed,...result}));
  if(result.ready){ready=true;break;}
 }
 if(!ready)throw Error('The offline container failed '+modes[0]+'.');
}
