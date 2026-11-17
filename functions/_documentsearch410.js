// Explicit, paginated content search. No persistent plaintext index or OCR.
import {HttpError,pace} from './_pigeon.js';
import {filesdb,ensureFilesAccount,fileContent,getFile} from './_files.js';
export async function searchDocuments(env,owner,input){
 const q=input?.q;if(typeof q!=='string'||q.trim().length<2||q.length>160||/[\u0000-\u001f\u007f]/.test(q))throw new HttpError(400,'Search for at least two characters.');
 await pace(env,'document-search:'+owner,40,60000);const D=await filesdb(env);await ensureFilesAccount(D,owner);const args=[owner],where=["user_id=?1","state='ready'","kind='file'","trash_at=0","size<=262144","mime IN('text/plain','text/csv','text/markdown','application/json')"];
 if(input.cursor){const m=/^(\d{1,16}):([\w-]{32})$/.exec(input.cursor);if(!m)throw new HttpError(400,'Start a new document search.');args.push(Number(m[1]),m[2]);where.push('(modified<?2 OR modified=?2 AND id>?3)')}
 const rows=(await D.prepare(`SELECT id,name,size,version,modified FROM ifl_files_nodes WHERE ${where.join(' AND ')} ORDER BY modified DESC,id ASC LIMIT 13`).bind(...args).all()).results,items=rows.slice(0,12),query=q.trim().toLocaleLowerCase();
 const hits=await Promise.all(items.map(async item=>{try{const {object}=await fileContent(env,owner,item.id),contents=await object.text();if(new TextEncoder().encode(contents).length>262144)return null;const at=contents.toLocaleLowerCase().indexOf(query);if(at<0)return null;const current=(await getFile(env,owner,item.id)).item;if(current.version!==item.version||current.trashedAt)return null;return{id:item.id,name:item.name,version:item.version,snippet:(at>70?'…':'')+contents.slice(Math.max(0,at-70),at+q.length+100).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ')+(at+q.length+100<contents.length?'…':'')}}catch(e){if([404,409,410].includes(e.status))return null;throw e}}));
 await ensureFilesAccount(D,owner);return{hits:hits.filter(Boolean),scanned:items.length,cursor:rows.length>12?items.at(-1).modified+':'+items.at(-1).id:null};
}
