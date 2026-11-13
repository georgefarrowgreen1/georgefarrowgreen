// The private cloud drive is a Today account capability. Root validates its own
// browser origin before forwarding here with Today's canonical identity.
import { HttpError, pace } from "./_pigeon.js";
import { signedIn, json, body } from "./_accountapi.js";
import { todayOrigin } from "./_sites.js";
import { FILE_LIMITS, listFiles, getFile, createFolder, reserveUpload, uploadFile, renameFile, moveFile, deleteFile, fileContent } from "./_files.js";

const SAFE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};
function fromToday(request, env, changing) {
  if (request.headers.get("Origin") !== todayOrigin(env, request)) throw new HttpError(403, "That request didn’t come from InFlite.");
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") throw new HttpError(403, "That request didn’t come from InFlite.");
  if (changing && request.method === "OPTIONS") throw new HttpError(405, "Files doesn’t do that here.");
}
const answer = (value, status = 200) => { const response = json(value, status); for (const [key, val] of Object.entries(SAFE)) response.headers.set(key, val); return response; };
const query = request => new URL(request.url).searchParams;
function route(changing, handler) {
  return async ({ request, env }) => {
    fromToday(request, env, changing);
    const user = await signedIn(request, env);
    // The cookie may change in another visible tab before this frame learns
    // about the new account. This header is a precondition, never an owner.
    const expected = request.headers.get("X-Inflite-Files-Owner");
    const nativeDownload = /^(GET|HEAD)$/.test(request.method) && new URL(request.url).pathname === "/api/account/today/files/content";
    if (!(nativeDownload && expected === null) && (!/^[A-Za-z0-9_-]{1,80}$/.test(expected || "") || expected !== user.id)) throw new HttpError(401, "Your account changed. Refresh InFlite before continuing.", "session");
    await pace(env, `files:${changing ? "write" : "read"}:${user.id}`, 320, 60e3);
    return handler(request, env, user.id);
  };
}
const listing = q => ({ parentId: q.get("parentId"), view: q.get("view") || "folder", sort: q.get("sort") || undefined, kind: q.get("kind") || undefined, cursor: q.get("cursor") });
export const FILES_ROUTES = {
  "GET today/files/list": route(false, async (request, env, owner) => answer(await listFiles(env, owner, listing(query(request))))),
  "POST today/files/search": route(true, async (request, env, owner) => { const input = await body(request, 4096); return answer(await listFiles(env, owner, input)); }),
  "GET today/files/item": route(false, async (request, env, owner) => answer(await getFile(env, owner, query(request).get("id")))),
  "POST today/files/folders": route(true, async (request, env, owner) => answer(await createFolder(env, owner, await body(request, 4096)), 201)),
  "POST today/files/uploads": route(true, async (request, env, owner) => answer(await reserveUpload(env, owner, await body(request, 4096)), 201)),
  "PUT today/files/content": route(true, async (request, env, owner) => answer(await uploadFile(env, owner, query(request).get("id"), request))),
  "PATCH today/files/item": route(true, async (request, env, owner) => answer(await renameFile(env, owner, await body(request, 4096)))),
  "POST today/files/move": route(true, async (request, env, owner) => answer(await moveFile(env, owner, await body(request, 4096)))),
  "DELETE today/files/item": route(true, async (request, env, owner) => { const q = query(request); return answer(await deleteFile(env, owner, { id: q.get("id"), version: Number(q.get("version")) })); }),
  "GET today/files/content": route(false, async (request, env, owner) => {
    const { row, object, range } = await fileContent(env, owner, query(request).get("id"), { range: request.headers.get("Range") });
    // Content never executes in the OS origin. The explorer previews a fetched
    // raster/audio Blob or text node; unsupported and active formats download.
    const ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
    const headers = new Headers({ ...SAFE, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name).replace(/[!'()*]/g, ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`, "Content-Length": String(range?.length ?? row.size), "Accept-Ranges": "bytes" });
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${row.size}`);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  }),
  "GET today/files/limits": route(false, async () => answer({ limits: FILE_LIMITS })),
};
