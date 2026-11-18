// Private checkpoints live under the existing Files orphan-sweep prefix. The
// normal reservation owns quota and the existing commit path publishes the file.
import { HttpError } from './_pigeon.js';
import { filesdb, ensureFilesAccount, fileId, getFile, uploadFile } from './_files.js';
import { uploadReplacement } from './_fileversions.js';

const PART = 1024 * 1024;
const fail = (status, message) => { throw new HttpError(status, message); };
async function reservation(env, owner, request) {
  const q = new URL(request.url).searchParams;
  if (q.has('id') === q.has('uploadId')) fail(400, 'Choose one upload.');
  const replacement = q.has('uploadId');
  const id = q.get(replacement ? 'uploadId' : 'id');
  if (replacement && !/^[A-Za-z0-9_-]{16,80}$/.test(id)) fail(400, 'Invalid replacement.');
  if (!replacement) fileId(id);
  const db = await filesdb(env);
  await ensureFilesAccount(db, owner);
  const row = replacement
    ? await db.prepare('SELECT file_id, size, expires, state, parts_token FROM ifl_files_replacements WHERE user_id=? AND operation_id=?').bind(owner,id).first()
    : await db.prepare("SELECT id AS file_id, size, expires, state FROM ifl_files_nodes WHERE user_id=? AND id=? AND kind='file' AND COALESCE(trash_at,0)=0").bind(owner,id).first();
  if (!row) fail(404, 'This upload is no longer available.');
  const complete = row.state === 'ready' || row.state === 'committed';
  if (!complete && row.expires <= Date.now()) fail(410, 'This upload has expired.');
  const token = row.parts_token || id;
  const prefix = 'files/' + owner + '/parts/' + (replacement ? 'replacement/' : 'new/') + token + '/';
  return { id, replacement, row, complete, prefix, token, count: Math.ceil(row.size / PART) };
}
export async function uploadParts(env, owner, request) {
  const { id, row, replacement, complete, prefix, token, count } = await reservation(env, owner, request);
  if (complete) return getFile(env, owner, row.file_id);
  const bucket = env.FILES_R2;
  if (request.method === 'GET') {
    const page = await bucket.list({prefix, limit: 32, include: ['customMetadata']});
    return { partSize: PART, parts: Object.fromEntries(page.objects.map(o => [o.key.slice(prefix.length), o.customMetadata?.sha256])) };
  }
  if (request.method === 'PUT') {
    const index = new URL(request.url).searchParams.get('part');
    if (!/^(0|[1-9]\d?)$/.test(index || '') || Number(index) >= count) fail(400, 'Invalid upload part.');
    const size = Math.min(PART, row.size - Number(index) * PART);
    const reader = request.body?.getReader();
    if (!reader) fail(400, 'Missing file bytes.');
    const bytes = new Uint8Array(size);
    let offset = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        if (offset + part.value.length > size) fail(413, 'Upload part too large.');
        bytes.set(part.value, offset); offset += part.value.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (offset !== size) fail(400, 'Incomplete upload part.');
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
    const key = prefix + index;
    const written = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256 } });
    if (!written && (await bucket.head(key))?.customMetadata?.sha256 !== sha256) fail(409, 'This part belongs to different file contents.');
    try {
      const latest = await reservation(env, owner, request);
      if (latest.token !== token) fail(409, 'That upload was replaced.');
    } catch (error) {
      if ([401,404,409,410].includes(error.status)) await bucket.delete(key);
      throw error;
    }
    return { sha256 };
  }
  let index = 0;
  const stream = new ReadableStream({ async pull(controller) {
    if (index >= count) return controller.close();
    const part = await bucket.get(prefix + index++);
    if (!part) return controller.error(new HttpError(409, 'The upload has missing parts.'));
    controller.enqueue(new Uint8Array(await part.arrayBuffer()));
  } });
  const content = new Request(request.url, {method:'PUT', headers:{'Content-Length': String(row.size)}, body:stream, duplex:'half', signal:request.signal});
  const result = replacement ? await uploadReplacement(env, owner, id, content, token)
    : await uploadFile(env, owner, id, content, {resumable:true});
  if (count) await bucket.delete(Array.from({ length:count }, (_,i) => prefix+i)).catch(() => {});
  return result;
}
