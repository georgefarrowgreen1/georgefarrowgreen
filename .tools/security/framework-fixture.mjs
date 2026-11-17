// Test the exact shell revision paired with this release. This also permits
// the backend to pass its complete gates before the shell goes to production.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export function frameworkRevision(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['commit','build'].includes(k))||typeof value.commit!=='string'||!/^[a-f0-9]{40}$/.test(value.commit)||typeof value.build!=='string'||!/^\d+\.\d{2}$/.test(value.build))throw Error('Invalid paired framework revision');
 return {commit:value.commit,build:value.build};
}
export function selectFramework(dir,metadata){
 const paired=frameworkRevision(metadata),git=(...args)=>execFileSync('git',['-C',resolve(dir),...args],{encoding:'utf8'}).trim();
 if(!/^https:\/\/github\.com\/georgefarrowgreen1\/inflite(?:\.git)?$/.test(git('remote','get-url','origin')))throw Error('Unexpected framework repository');
 if(git('status','--porcelain'))throw Error('Framework fixture must start with a clean checkout');
 git('fetch','--no-tags','--depth','1','origin',paired.commit);git('checkout','--detach',paired.commit);
 if(git('rev-parse','HEAD')!==paired.commit)throw Error('Framework checkout did not match the release');
 const source=readFileSync(resolve(dir,'today/public/app.js'),'utf8');if(/const BUILD = "([\d.]+)"/.exec(source)?.[1]!==paired.build)throw Error('Framework build did not match the release');
 return paired;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const meta=JSON.parse(readFileSync(new URL('./framework-ref.json',import.meta.url),'utf8'));
 const paired=selectFramework(process.argv[2]||'../inflite',meta);console.log('Framework release fixture: '+paired.build+' at '+paired.commit);
}
