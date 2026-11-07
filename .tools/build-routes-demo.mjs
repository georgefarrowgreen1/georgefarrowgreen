// Make a downloadable, standalone review build. The app sources keep strict CSP;
// this exported HTML bundles its scripts/styles and the MapLibre worker in one file.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const es=process.env.ROUTES_ESBUILD_PATH ? await import(pathToFileURL(process.env.ROUTES_ESBUILD_PATH)) : await import('esbuild').catch(()=>import('./tests/node_modules/esbuild/lib/main.js'));
const out=resolve(process.argv[2]||resolve(root,'artifacts/InFlite-Fitness-Routes-Demo.html'));
const worker=await es.build({entryPoints:[resolve(root,'weather/vendor/maplibre-gl-worker.mjs')],bundle:true,write:false,format:'esm',target:'es2022',minify:true,logLevel:'silent'});
const entry=`import * as ml from './weather/vendor/maplibre-gl.mjs';\nml.setWorkerUrl(URL.createObjectURL(new Blob([${JSON.stringify(worker.outputFiles[0].text)}],{type:'text/javascript'})));\nimport './fitness/routes-preview.js';`;
const main=await es.build({stdin:{contents:entry,resolveDir:root,sourcefile:'routes-review-entry.js'},bundle:true,write:false,format:'iife',target:'es2022',minify:true,legalComments:'inline',define:{'import.meta.url':'globalThis.location.href'},logLevel:'silent',plugins:[{name:'embedded-map-style',setup(build){build.onLoad({filter:/fitness\/map\.js$/},async args=>{let text=await readFile(args.path,'utf8');const start=text.indexOf('  const css = document.createElement');const end=text.indexOf('  ml = Promise.all',start);text=text.slice(0,start)+'  const styled = Promise.resolve();\n'+text.slice(end);return{contents:text,loader:'js'};});}}]});
const styles=(await Promise.all(['fitness/styles.css','fitness/routes.css','fitness/routes-preview.css','weather/vendor/maplibre-gl.css'].map(p=>readFile(resolve(root,p),'utf8')))).join('\n');
const icon='data:image/svg+xml;base64,'+Buffer.from(await readFile(resolve(root,'fitness/icon.svg'))).toString('base64');
let html=await readFile(resolve(root,'fitness/routes-demo.html'),'utf8');
html=html.replace(/  <link rel="stylesheet"[^>]+>\n/g,'').replace(/  <script type="module"[^>]+><\/script>\n/,'').replaceAll('href="icon.svg"',`href="${icon}"`).replaceAll('src="icon.svg"',`src="${icon}"`);
html=html.replace('</head>',()=>`<style>${styles.replace(/<\/style/gi,'<\\/style')}</style>\n</head>`).replace('</body>',()=>`<script>${main.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>\n</body>`);
await mkdir(dirname(out),{recursive:true});await writeFile(out,html);console.log(`${out} (${(Buffer.byteLength(html)/1048576).toFixed(2)} MB)`);
