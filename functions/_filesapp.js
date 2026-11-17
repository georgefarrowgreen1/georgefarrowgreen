import {securityOrigin,securityOwner,PRIVATE_HEADERS} from './_security-core.js';
// The private cloud drive is a Today account capability. Root validates its own
// browser origin before forwarding here with Today's canonical identity.
import { HttpError, pace } from "./_pigeon.js";
import { signedIn, json, body } from "./_accountapi.js";
import { todayOrigin } from "./_sites.js";
import { FILE_LIMITS, listFiles, getFile, createFolder, reserveUpload, uploadFile, renameFile, moveFile, deleteFile, fileContent, trashFile, restoreFile, favouriteFile, copyFile } from "./_files.js";

import {cancelReplacement,fileHistory,reserveReplacement,uploadReplacement,historicalContent,restoreVersion} from './_fileversions.js';
import {todayPrefs,savePrefs} from './_today.js';
import {readContinuity,writeContinuity,listOpenTabs,updateOpenTab} from './_continuity.js';
const SAFE=PRIVATE_HEADERS;
const answer = (value, status = 200) => { const response = json(value, status); for (const [key, val] of Object.entries(SAFE)) response.headers.set(key, val); return response; };
const query = request => new URL(request.url).searchParams;
function route(changing, handler) {
  return async ({ request, env }) => {
    securityOrigin(request,env);
    const user = await signedIn(request, env);
    securityOwner(request,user,'files');
    await pace(env, `files:${changing ? "write" : "read"}:${user.id}`, 320, 60e3);
    return handler(request, env, user.id);
  };
}
const listing = q => ({ parentId: q.get("parentId"), view: q.get("view") || "folder", sort: q.get("sort") || undefined, kind: q.get("kind") || undefined, cursor: q.get("cursor") });
export const FILES_ROUTES = {
  "GET today/files/preferences":route(false,async(r,e,o)=>answer({prefs:(await todayPrefs(e,o)).cards})),
  "PUT today/files/preferences":route(true,async(r,e,o)=>{const b=await body(r,4096);if(!b.expected||typeof b.expected!=='object')throw new HttpError(400,'Check the saved layout first.');return answer({prefs:(await savePrefs(e,o,b)).cards})}),
  "GET today/files/open-tabs":route(false,async(r,e,o)=>answer(await listOpenTabs(e,o,query(r).get('id')))),
  "PUT today/files/open-tabs":route(true,async(r,e,o)=>answer(await updateOpenTab(e,o,await body(r,4096)))),
  "GET today/files/continuity":route(false,async(r,e,o)=>answer(await readContinuity(e,o))),
  "PUT today/files/continuity":route(true,async(r,e,o)=>answer(await writeContinuity(e,o,await body(r,4096)))),
  "GET today/files/history":route(false,async(r,e,o)=>answer(await fileHistory(e,o,query(r).get('id')))),
  "DELETE today/files/replacements":route(true,async(r,e,o)=>answer(await cancelReplacement(e,o,query(r).get("uploadId")))),
  "POST today/files/replacements":route(true,async(r,e,o)=>answer(await reserveReplacement(e,o,await body(r,4096)))),
  "PUT today/files/replacement-content":route(true,async(r,e,o)=>answer(await uploadReplacement(e,o,query(r).get('uploadId'),r))),
  "POST today/files/restore-version":route(true,async(r,e,o)=>answer(await restoreVersion(e,o,await body(r,4096),r))),
  "GET today/files/list": route(false, async (request, env, owner) => answer(await listFiles(env, owner, listing(query(request))))),
  "POST today/files/search": route(true, async (request, env, owner) => { const input = await body(request, 4096); return answer(await listFiles(env, owner, input)); }),
  "GET today/files/item": route(false, async (request, env, owner) => answer(await getFile(env, owner, query(request).get("id")))),
  "POST today/files/folders": route(true, async (request, env, owner) => answer(await createFolder(env, owner, await body(request, 4096)), 201)),
  "POST today/files/uploads": route(true, async (request, env, owner) => answer(await reserveUpload(env, owner, await body(request, 4096)), 201)),
  "PUT today/files/content": route(true, async (request, env, owner) => answer(await uploadFile(env, owner, query(request).get("id"), request))),
  "PATCH today/files/item": route(true, async (request, env, owner) => answer(await renameFile(env, owner, await body(request, 4096)))),
  "POST today/files/trash": route(true, async(request,env,owner)=>answer(await trashFile(env,owner,await body(request,4096)))),
  "POST today/files/restore": route(true, async(request,env,owner)=>answer(await restoreFile(env,owner,await body(request,4096)))),
  "POST today/files/favourite": route(true, async(request,env,owner)=>answer(await favouriteFile(env,owner,await body(request,4096)))),
  "POST today/files/copy": route(true, async(request,env,owner)=>answer(await copyFile(env,owner,await body(request,4096),request))),
  "POST today/files/move": route(true, async (request, env, owner) => answer(await moveFile(env, owner, await body(request, 4096)))),
  "DELETE today/files/item": route(true, async (request, env, owner) => { const q = query(request); return answer(await deleteFile(env, owner, { id: q.get("id"), version: Number(q.get("version")) })); }),
  "GET today/files/content": route(false, async (request, env, owner) => {
    const q=query(request);
    const { row, object, range } = q.has('versionId') ? await historicalContent(env,owner,q.get('id'),q.get('versionId')) : await fileContent(env, owner, q.get("id"), { range: request.headers.get("Range") });
    // Content never executes in the OS origin. The explorer previews a fetched
    // raster/audio Blob or text node; unsupported and active formats download.
    const ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
    const headers = new Headers({ ...SAFE, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name).replace(/[!'()*]/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`, "Content-Length": String(range?.length ?? row.size), "Accept-Ranges": "bytes" });
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${row.size}`);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  }),
  "GET today/files/limits": route(false, async () => answer({ limits: FILE_LIMITS })),
};
