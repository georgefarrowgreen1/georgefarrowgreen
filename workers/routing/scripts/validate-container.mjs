// Exercise the exact site loop planner against an offline, resource-capped container.
import {spawn} from 'node:child_process';
import {runProbes} from '../src/probes.js';
const fetcher=async request=>{
 const body=await request.text();
 const raw=await new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i','inflite-routing-check','java','-Xmx32m','-cp','/opt/router/classes','Probe','route'],{stdio:['pipe','pipe','pipe']});let out='',size=0;
  const timer=setTimeout(()=>{p.kill();reject(Error('Offline container probe timed out.'));},40000);
  p.stdout.on('data',b=>{size+=b.length;if(size>4*1024*1024){p.kill();reject(Error('Probe response too large.'));}else out+=b;});
  p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('exit',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error('Offline routing request failed.'));});p.stdin.end(body);
 });
 const end=raw.indexOf('\n'),status=Number(raw.slice(0,end));if(!Number.isInteger(status)||status<200||status>599)throw Error('Invalid probe response.');return new Response(raw.slice(end+1),{status});
};
const result=await runProbes(fetcher);console.log(JSON.stringify(result));
if(!result.ready)throw Error('The offline container failed UK coverage or the Fitness loop planner.');
