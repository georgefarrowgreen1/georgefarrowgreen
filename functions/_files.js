// InFlite Files: private account-owned metadata and immutable object bytes.
// Every mutation serializes through one account revision. Storage keys and
// ownership are server-owned; names never form an R2 path.
import { HttpError, randomToken, DAY, hex, sha256 } from "./_pigeon.js";
import { tablesOnce } from "./_fitness.js";

export const FILE_LIMITS = Object.freeze({ file: 25 * 1024 * 1024, storage: 1024 * 1024 * 1024, nodes: 5000, depth: 16, page: 100, uploadMs: 60 * 60e3 });
const ID = /^[A-Za-z0-9_-]{32}$/;
const OP = /^[A-Za-z0-9_-]{16,80}$/;
const ROOT = "";
const failure = (status, words) => { throw new HttpError(status, words); };
export const fileId = value => typeof value === "string" && ID.test(value) ? value : failure(400, "That file reference is invalid.");
const parentId = value => value == null || value === "" ? ROOT : fileId(value);
const operation = value => typeof value === "string" && OP.test(value) ? value : failure(400, "Try that action again.");
const version = value => Number.isSafeInteger(value) && value > 0 ? value : failure(400, "That file version is invalid.");
const bytesOf = value => Number.isSafeInteger(value) && value >= 0 && value <= FILE_LIMITS.file ? value : failure(413, "Choose a file no larger than 25 MB.");
export function fileName(value) {
  if (typeof value !== "string") return failure(400, "Give it a name.");
  if (typeof value.isWellFormed === "function" && !value.isWellFormed()) return failure(400, "That name contains an unsupported character.");
  const name = value.normalize("NFC").trim();
  if (!name || name === "." || name === ".." || /[\\/\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(name) || new TextEncoder().encode(name).length > 255) return failure(400, "Choose a shorter name without slashes or control characters.");
  return name;
}
const mimeOf = value => typeof value === "string" && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value) && value.length <= 100 ? value.toLowerCase() : "application/octet-stream";
const nameKey = name => name.toLocaleLowerCase("en-US");
const liveSQL = "EXISTS (SELECT 1 FROM pg_users WHERE id = ?1 AND delete_at IS NULL)";
const columns = "id, parent_id, kind, name, mime, size, state, created, modified, version";
const itemOf = row => row ? { id: row.id, parentId: row.parent_id || null, kind: row.kind, name: row.name, mime: row.kind === "folder" ? "inode/directory" : row.mime, size: row.kind === "folder" ? 0 : row.size, createdAt: row.created, modifiedAt: row.modified, version: row.version, status: row.state === "ready" ? "ready" : "pending" } : null;

async function make(D) {
  await D.batch([
    D.prepare(`CREATE TABLE IF NOT EXISTS ifl_files_accounts (user_id TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, nodes INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, closed INTEGER NOT NULL DEFAULT 0, CHECK(used >= 0 AND reserved >= 0 AND nodes >= 0))`),
    D.prepare(`CREATE TABLE IF NOT EXISTS ifl_files_nodes (user_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, created INTEGER NOT NULL, modified INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, operation_id TEXT NOT NULL, storage_key TEXT, upload_nonce TEXT, expires INTEGER, PRIMARY KEY(user_id,id), UNIQUE(user_id,parent_id,name_key), UNIQUE(user_id,operation_id), CHECK(kind IN ('file','folder')), CHECK(state IN ('pending','uploading','ready'))) `),
    D.prepare("CREATE INDEX IF NOT EXISTS ifl_files_parent ON ifl_files_nodes (user_id,parent_id,kind DESC,name_key,id)"),
    D.prepare("CREATE INDEX IF NOT EXISTS ifl_files_expiry ON ifl_files_nodes (state,expires)"),
    D.prepare("CREATE INDEX IF NOT EXISTS ifl_files_recent ON ifl_files_nodes (user_id,modified DESC,id)"),
    D.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ifl_files_object ON ifl_files_nodes (storage_key) WHERE storage_key IS NOT NULL"),
    D.prepare("CREATE TABLE IF NOT EXISTS ifl_files_operations (user_id TEXT NOT NULL, operation_id TEXT NOT NULL, node_id TEXT NOT NULL, signature TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id,operation_id))"),
    D.prepare("CREATE INDEX IF NOT EXISTS ifl_files_operations_age ON ifl_files_operations (created)"),
    D.prepare("CREATE INDEX IF NOT EXISTS ifl_files_operations_owner_age ON ifl_files_operations (user_id,created)"),
  ]);
}
export async function filesdb(env, { requireStorage = true } = {}) {
  if (!env.DB || requireStorage && !env.FILES_R2) return failure(503, "Files storage is unavailable. Try again later.");
  const D = await tablesOnce(env, "files", make);
  return D.withSession ? D.withSession("first-primary") : D;
}
const rowOf = (D, owner, id) => D.prepare("SELECT * FROM ifl_files_nodes WHERE user_id = ?1 AND id = ?2").bind(owner, id).first();
const accountOf = (D, owner) => D.prepare("SELECT * FROM ifl_files_accounts WHERE user_id = ?").bind(owner).first();
async function ensure(D, owner, allowClosed = false) {
  await D.prepare(`INSERT OR IGNORE INTO ifl_files_accounts (user_id) SELECT ?1 WHERE ${liveSQL}`).bind(owner).run();
  const account = await accountOf(D, owner);
  if (!account || account.closed && !allowClosed) return failure(401, "Your account is unavailable. Sign in again.");
}
const usageOf = account => ({ used: account?.used || 0, reserved: account?.reserved || 0, limit: FILE_LIMITS.storage, nodes: account?.nodes || 0, nodeLimit: FILE_LIMITS.nodes, fileLimit: FILE_LIMITS.file });
async function ancestors(D, owner, id) {
  const list = [], seen = new Set();
  while (id) {
    if (seen.has(id) || list.length >= FILE_LIMITS.depth) return failure(409, "This folder structure changed. Open My Drive again.");
    seen.add(id);
    const row = await rowOf(D, owner, id);
    if (!row || row.kind !== "folder" || row.state !== "ready") return failure(404, "That folder is no longer available.");
    list.unshift(row); id = row.parent_id;
  }
  return list;
}
async function parentAt(D, owner, id, extra = 1) {
  const chain = await ancestors(D, owner, id);
  if (chain.length + extra > FILE_LIMITS.depth) return failure(409, "This would make the folders too deeply nested.");
  return chain;
}
// A conditional account update and its dependent node statement run in one D1
// transaction. A concurrent tree/quota change retries all preconditions afresh.
async function mutate(env, owner, prepare, { deleting = false } = {}) {
  const D = await filesdb(env); await ensure(D, owner, deleting);
  for (let attempt = 0; attempt < 4; attempt++) {
    const account = await accountOf(D, owner);
    if (!account || account.closed && !deleting) return failure(401, "Your account is unavailable. Sign in again.");
    const plan = await prepare(D, account);
    if (plan.done) return plan.value;
    const used = plan.used || 0, reserved = plan.reserved || 0, nodes = plan.nodes || 0;
    if (account.used + used < 0 || account.reserved + reserved < 0 || account.nodes + nodes < 0) return failure(409, "Files changed elsewhere. Open it again.");
    if (account.used + account.reserved + used + reserved > FILE_LIMITS.storage) return failure(413, "My Drive is full. Delete a file before adding another.");
    if (account.nodes + nodes > FILE_LIMITS.nodes) return failure(413, "My Drive has reached its file and folder limit.");
    try {
      const result = await D.batch([
        D.prepare(`UPDATE ifl_files_accounts SET used = used + ?3, reserved = reserved + ?4, nodes = nodes + ?5, revision = revision + 1 WHERE user_id = ?1 AND revision = ?2${deleting ? "" : ` AND closed = 0 AND ${liveSQL}`}`).bind(owner, account.revision, used, reserved, nodes),
        plan.statement(D), ...(plan.after || []).map(statement => statement(D)),
      ]);
      if (result[0].meta?.changes) {
        if (result.slice(1).some(change => change.meta?.changes !== 1)) return failure(500, "Files couldn’t finish that action.");
        return plan.result ? await plan.result(D) : { ok: true };
      }
      if (!deleting && !await D.prepare("SELECT 1 FROM pg_users WHERE id = ? AND delete_at IS NULL").bind(owner).first()) return failure(401, "Your account is unavailable. Sign in again.");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (/UNIQUE constraint failed.*ifl_files_(?:nodes|operations)/.test(String(error?.message))) {
        if (plan.replay) { const value = await plan.replay(D); if (value) return value; }
        return failure(409, "A file or folder with that name already exists here.");
      }
      throw error;
    }
  }
  return failure(409, "Files changed on another device. Try again.");
}
async function create(env, owner, input, kind) {
  const spec = { kind, parent: parentId(input.parentId), name: fileName(input.name), size: kind === "file" ? bytesOf(input.size) : 0, mime: kind === "file" ? mimeOf(input.mime) : "inode/directory", operation: operation(input.operationId) };
  const id = randomToken(24), nonce = randomToken(24), now = Date.now();
  const signature = hex(await sha256(JSON.stringify([spec.kind, spec.parent, spec.name, spec.size, spec.mime])));
  const replay = async D => {
    const operation = await D.prepare("SELECT node_id,signature FROM ifl_files_operations WHERE user_id = ? AND operation_id = ?").bind(owner, spec.operation).first();
    if (!operation) return null;
    if (operation.signature !== signature) return failure(409, "That action was already used for a different file.");
    const prior = await rowOf(D, owner, operation.node_id);
    if (!prior) return failure(410, "That action already finished. Choose the file again to add it anew.");
    return { item: itemOf(prior), limits: FILE_LIMITS };
  };
  return mutate(env, owner, async D => {
    const value = await replay(D); if (value) return { done: true, value };
    const recent = await D.prepare("SELECT COUNT(*) AS n FROM ifl_files_operations WHERE user_id = ? AND created > ?").bind(owner, now - DAY).first();
    if (recent.n >= 10000) return failure(429, "Files has handled many changes today. Try again tomorrow.");
    await parentAt(D, owner, spec.parent);
    return { reserved: spec.size, nodes: 1, replay,
      statement: X => X.prepare(`INSERT INTO ifl_files_nodes (user_id,id,parent_id,kind,name,name_key,mime,size,state,created,modified,operation_id,storage_key,upload_nonce,expires) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11,?12,?13,?14 WHERE changes() > 0`).bind(owner, id, spec.parent, kind, spec.name, nameKey(spec.name), spec.mime, spec.size, kind === "folder" ? "ready" : "pending", now, spec.operation, kind === "file" ? `files/${owner}/${id}/${nonce}` : null, kind === "file" ? nonce : null, kind === "file" ? now + FILE_LIMITS.uploadMs : null),
      after: [X => X.prepare("INSERT INTO ifl_files_operations (user_id,operation_id,node_id,signature,created) SELECT ?1,?2,?3,?4,?5 WHERE changes() > 0").bind(owner, spec.operation, id, signature, now)],
      result: async X => ({ item: itemOf(await rowOf(X, owner, id)), limits: FILE_LIMITS }),
    };
  });
}
export const createFolder = (env, owner, input) => create(env, owner, input, "folder");
export const reserveUpload = (env, owner, input) => create(env, owner, input, "file");

export async function listFiles(env, owner, { parentId: parent, q = "", view = "folder", sort, kind, cursor = null } = {}) {
  const D = await filesdb(env); await ensure(D, owner);
  parent = parentId(parent);
  if (!["folder", "recent", "search"].includes(view)) return failure(400, "That view is invalid.");
  sort ??= view === "recent" ? "modified" : "name";
  if (!["name", "modified", "size"].includes(sort)) return failure(400, "That sort order is invalid.");
  if (kind != null && kind !== "folder") return failure(400, "That file filter is invalid.");
  if (typeof q !== "string" || q.length > 160 || /[\u0000-\u001f\u007f]/.test(q)) return failure(400, "Use a shorter file search.");
  const account = await accountOf(D, owner), chain = view === "folder" ? await ancestors(D, owner, parent) : [];
  let offset = 0;
  if (cursor != null && cursor !== "") {
    const match = /^(\d{1,12}):(\d{1,4})$/.exec(cursor);
    if (!match || +match[2] > FILE_LIMITS.nodes) return failure(400, "That page is invalid.");
    if (+match[1] !== account.revision) return failure(409, "This folder changed. Refresh to see the latest files.");
    offset = +match[2];
  }
  const query = q.trim().toLocaleLowerCase("en-US"), scope = view === "folder" ? "parent_id = ?2" : view === "recent" ? "kind = 'file' AND state = 'ready'" : "state = 'ready'";
  const condition = scope + (kind === "folder" ? " AND kind = 'folder'" : "") + (query ? " AND instr(name_key, ?3) > 0" : ""), order = ({ name: "name_key ASC", modified: "modified DESC", size: "size DESC" })[sort];
  // Indexed folder pages and a deliberately bounded recent/search listing.
  const sql = `SELECT ${columns} FROM ifl_files_nodes WHERE user_id = ?1 AND ${condition} ORDER BY ${view === "recent" ? "" : "kind DESC, "}${order}, id ASC LIMIT ?4 OFFSET ?5`;
  const { results } = await D.prepare(sql).bind(owner, parent, query, FILE_LIMITS.page + 1, offset).all();
  const current = await accountOf(D, owner);
  if (!current || current.closed) return failure(401, "Your account is unavailable. Sign in again.");
  if (current.revision !== account.revision) return failure(409, "Files changed while opening this folder. Refresh to see the latest files.");
  const more = results.length > FILE_LIMITS.page;
  return { folder: itemOf(chain.at(-1)), ancestors: chain.map(itemOf), items: results.slice(0, FILE_LIMITS.page).map(itemOf), cursor: more ? `${account.revision}:${offset + FILE_LIMITS.page}` : null, revision: account.revision, usage: usageOf(account) };
}
export async function getFile(env, owner, id) {
  const D = await filesdb(env); await ensure(D, owner);
  const row = await rowOf(D, owner, fileId(id));
  if (!row) return failure(404, "That file is no longer available.");
  return { item: itemOf(row) };
}
export async function renameFile(env, owner, input) {
  const id = fileId(input.id), expected = version(input.version), name = fileName(input.name);
  return mutate(env, owner, async D => {
    const row = await rowOf(D, owner, id);
    if (!row) return failure(404, "That file is no longer available.");
    if (row.state !== "ready" || row.version !== expected) return failure(409, "That file changed. Open it again.");
    if (row.name === name) return { done: true, value: { item: itemOf(row) } };
    return { statement: X => X.prepare("UPDATE ifl_files_nodes SET name = ?3, name_key = ?4, modified = ?5, version = version + 1 WHERE user_id = ?1 AND id = ?2 AND changes() > 0").bind(owner, id, name, nameKey(name), Date.now()), result: async X => ({ item: itemOf(await rowOf(X, owner, id)) }) };
  });
}
export async function moveFile(env, owner, input) {
  const id = fileId(input.id), parent = parentId(input.parentId), expected = version(input.version);
  return mutate(env, owner, async D => {
    const row = await rowOf(D, owner, id);
    if (!row) return failure(404, "That file is no longer available.");
    if (row.state !== "ready" || row.version !== expected) return failure(409, "That file changed. Open it again.");
    if (row.parent_id === parent) return { done: true, value: { item: itemOf(row) } };
    const chain = await parentAt(D, owner, parent);
    if (id === parent || chain.some(x => x.id === id)) return failure(409, "A folder can’t be moved inside itself.");
    if (row.kind === "folder") {
      const descendants = await D.prepare(`WITH RECURSIVE tree(id,depth) AS (SELECT id,1 FROM ifl_files_nodes WHERE user_id = ?1 AND id = ?2 UNION ALL SELECT n.id,t.depth+1 FROM ifl_files_nodes n JOIN tree t ON n.parent_id = t.id WHERE n.user_id = ?1 AND t.depth <= ?3) SELECT MAX(depth) AS depth FROM tree`).bind(owner, id, FILE_LIMITS.depth).first();
      if (chain.length + (descendants?.depth || 1) > FILE_LIMITS.depth) return failure(409, "This would make the folders too deeply nested.");
    }
    return { statement: X => X.prepare("UPDATE ifl_files_nodes SET parent_id = ?3, modified = ?4, version = version + 1 WHERE user_id = ?1 AND id = ?2 AND changes() > 0").bind(owner, id, parent, Date.now()), result: async X => ({ item: itemOf(await rowOf(X, owner, id)) }) };
  });
}
async function removeNode(env, owner, id, expected, { stale = false } = {}) {
  const result = await mutate(env, owner, async D => {
    const row = await rowOf(D, owner, id);
    if (!row) return stale ? { done: true, value: { ok: true } } : failure(404, "That file is no longer available.");
    if (expected != null && row.version !== expected) return failure(409, "That file changed. Open it again.");
    if (stale && (row.state === "ready" || row.expires > Date.now())) return { done: true, value: { ok: false } };
    if (row.kind === "folder" && await D.prepare("SELECT 1 FROM ifl_files_nodes WHERE user_id = ? AND parent_id = ? LIMIT 1").bind(owner, id).first()) return failure(409, "This folder still contains files. Empty it before deleting it.");
    return { used: row.state === "ready" ? -row.size : 0, reserved: row.state === "ready" ? 0 : -row.size, nodes: -1,
      statement: X => X.prepare("DELETE FROM ifl_files_nodes WHERE user_id = ?1 AND id = ?2 AND changes() > 0").bind(owner, id), result: () => ({ ok: true, key: row.storage_key }) };
  }, { deleting: stale });
  if (result.key) await env.FILES_R2.delete(result.key).catch(error => console.error("Files object cleanup", error?.message));
  return { ok: result.ok };
}
export const deleteFile = (env, owner, input) => removeNode(env, owner, fileId(input.id), version(input.version));

// FixedLengthStream gives R2 a trustworthy length while rejecting both short
// and oversized/chunked bodies. Bytes never collect in a Worker-sized buffer.
async function putExact(env, key, request, size) {
  if (request.headers.has("Content-Length") && Number(request.headers.get("Content-Length")) !== size) return failure(400, "The file size changed. Choose it again.");
  if (request.signal.aborted) return failure(499, "Upload cancelled.");
  if (!size) { if (request.body) { const reader = request.body.getReader(); try { for (;;) { const part = await reader.read(); if (part.done) break; if (part.value.byteLength) return failure(400, "The file size changed. Choose it again."); } } finally { await reader.cancel().catch(() => {}); } } return env.FILES_R2.put(key, new Uint8Array(), { httpMetadata: { contentType: "application/octet-stream" } }); }
  if (!request.body) return failure(400, "The file is empty. Choose it again.");
  const fixed = new FixedLengthStream(size), reader = request.body.getReader(), writer = fixed.writable.getWriter();
  const abort = () => { reader.cancel().catch(() => {}); writer.abort(new Error("Upload cancelled")).catch(() => {}); };
  request.signal.addEventListener("abort", abort, { once: true });
  const pump = (async () => {
    let count = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; count += value.byteLength; if (count > size || count > FILE_LIMITS.file) return failure(413, "The file is larger than expected."); await writer.write(value); }
      if (count !== size) return failure(400, "The upload ended early. Choose the file again.");
      await writer.close();
    } catch (error) { await writer.abort(error).catch(() => {}); await reader.cancel().catch(() => {}); throw error; }
  })();
  try { const [object] = await Promise.all([env.FILES_R2.put(key, fixed.readable, { httpMetadata: { contentType: "application/octet-stream" } }), pump]); return object; }
  catch (error) { abort(); await pump.catch(() => {}); throw error; }
  finally { request.signal.removeEventListener("abort", abort); }
}
export async function uploadFile(env, owner, id, request) {
  id = fileId(id);
  const lease = randomToken(24);
  let taken;
  try { taken = await mutate(env, owner, async D => {
    const row = await rowOf(D, owner, id);
    if (!row || row.kind !== "file") return failure(404, "That upload is no longer available.");
    if (row.state === "ready") return { done: true, value: { item: itemOf(row), alreadyUploaded: true } };
    if (row.state !== "pending") return failure(409, "That file is already uploading. Refresh in a moment.");
    if (row.expires <= Date.now()) return failure(410, "That upload expired. Choose the file again.");
    return { statement: X => X.prepare("UPDATE ifl_files_nodes SET state = 'uploading', modified = ?3, upload_nonce = ?4 WHERE user_id = ?1 AND id = ?2 AND changes() > 0").bind(owner, id, Date.now(), lease), result: () => ({ claim: { ...row, upload_nonce: lease } }) };
  }); } catch (error) {
    if (error instanceof HttpError) throw error;
    // Recover an ambiguous claim acknowledgement only with this request's own
    // unpredictable lease. A retry can never take over another live writer.
    const D = await filesdb(env), row = await rowOf(D, owner, id);
    if (row?.state === "ready") { request.body?.cancel().catch(() => {}); return { item: itemOf(row), alreadyUploaded: true }; }
    if (row?.state !== "uploading" || row.upload_nonce !== lease) throw error;
    taken = { claim: row };
  }
  const claim = taken.claim;
  if (!claim) { request.body?.cancel().catch(() => {}); return taken; }
  try {
    await putExact(env, claim.storage_key, request, claim.size);
    return await mutate(env, owner, async D => {
      const row = await rowOf(D, owner, id);
      if (!row || row.state !== "uploading" || row.upload_nonce !== claim.upload_nonce || row.storage_key !== claim.storage_key || row.expires <= Date.now() || request.signal.aborted) return failure(409, "That upload is no longer current.");
      return { used: row.size, reserved: -row.size, statement: X => X.prepare("UPDATE ifl_files_nodes SET state = 'ready', expires = NULL, upload_nonce = NULL, modified = ?3, version = version + 1 WHERE user_id = ?1 AND id = ?2 AND changes() > 0").bind(owner, id, Date.now()), result: async X => ({ item: itemOf(await rowOf(X, owner, id)) }) };
    });
  } catch (error) {
    // A lost D1 acknowledgement or result read can happen after commit. Never
    // delete possibly committed bytes just because the caller saw an error.
    // With an unavailable database, leave the private object for bounded cleanup.
    try {
      const D = await filesdb(env), before = await rowOf(D, owner, id);
      if (before?.state === "ready" && before.storage_key === claim.storage_key) return { item: itemOf(before), alreadyUploaded: true };
      await mutate(env, owner, async X => {
        const row = await rowOf(X, owner, id);
        if (!row || row.state === "ready" || row.upload_nonce !== claim.upload_nonce || row.storage_key !== claim.storage_key) return { done: true, value: null };
        return { reserved: -row.size, nodes: -1, statement: Y => Y.prepare("DELETE FROM ifl_files_nodes WHERE user_id = ?1 AND id = ?2 AND changes() > 0").bind(owner, id) };
      }, { deleting: true }).catch(() => {});
      const after = await rowOf(D, owner, id);
      if (after?.state === "ready" && after.storage_key === claim.storage_key) return { item: itemOf(after), alreadyUploaded: true };
      if (!after || after.storage_key !== claim.storage_key) await env.FILES_R2.delete(claim.storage_key).catch(() => {});
    } catch (cleanupError) { console.error("Files upload cleanup deferred", cleanupError?.message); }
    throw error;
  }
}

export async function fileContent(env, owner, id, { range } = {}) {
  const D = await filesdb(env); await ensure(D, owner);
  const row = await rowOf(D, owner, fileId(id));
  if (!row || row.kind !== "file" || row.state !== "ready") return failure(404, "That file is no longer available.");
  let part = null;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return failure(416, "That file range is unavailable.");
    let start = match[1] ? Number(match[1]) : Math.max(0, row.size - Number(match[2])), end = match[2] && match[1] ? Number(match[2]) : row.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= row.size || end < start) return failure(416, "That file range is unavailable.");
    end = Math.min(end, row.size - 1); part = { offset: start, length: end - start + 1 };
  }
  const object = await env.FILES_R2.get(row.storage_key, part ? { range: part } : undefined);
  if (!object) return failure(404, "That file is no longer available.");
  if (object.size !== row.size) { object.body?.cancel().catch(() => {}); return failure(503, "That file couldn’t be read. Try again later."); }
  return { row, object, range: part };
}
export async function dropFiles(env, owner) {
  const D = await filesdb(env, { requireStorage: false });
  // Keep this fence until pg_users is removed by the caller's final account
  // transaction. It prevents recreating a drive between object cleanup and the
  // account's deletion, including an administrator's immediate deletion.
  await D.prepare("INSERT OR IGNORE INTO ifl_files_accounts (user_id,closed) VALUES (?,1)").bind(owner).run();
  await D.prepare("UPDATE ifl_files_accounts SET closed = 1, revision = revision + 1 WHERE user_id = ?").bind(owner).run();
  const { results } = await D.prepare("SELECT storage_key FROM ifl_files_nodes WHERE user_id = ? AND storage_key IS NOT NULL").bind(owner).all();
  const keys = results.map(row => row.storage_key);
  if (keys.length && !env.FILES_R2) return failure(503, "Files storage is unavailable. Account deletion will be retried.");
  for (let at = 0; at < keys.length; at += 500) await env.FILES_R2.delete(keys.slice(at, at + 500));
  await D.batch([D.prepare("DELETE FROM ifl_files_nodes WHERE user_id = ?").bind(owner), D.prepare("DELETE FROM ifl_files_operations WHERE user_id = ?").bind(owner), D.prepare("UPDATE ifl_files_accounts SET used = 0, reserved = 0, nodes = 0, revision = revision + 1 WHERE user_id = ?").bind(owner)]);
}
export async function exportFiles(env, owner) {
  const D = await filesdb(env, { requireStorage: false });
  const { results } = await D.prepare(`SELECT ${columns} FROM ifl_files_nodes WHERE user_id = ? AND state = 'ready' ORDER BY created,id LIMIT ?`).bind(owner, FILE_LIMITS.nodes).all();
  return results.map(itemOf);
}
export async function sweepFileUploads(env, now = Date.now(), limit = 50) {
  if (!env.FILES_R2) return 0;
  const D = await filesdb(env);
  const { results } = await D.prepare("SELECT user_id,id FROM ifl_files_nodes WHERE state != 'ready' AND expires < ? ORDER BY expires LIMIT ?").bind(now, Math.max(1, Math.min(100, limit))).all();
  let removed = 0;
  for (const row of results) { const result = await removeNode(env, row.user_id, row.id, null, { stale: true }); if (result?.ok) removed++; }
  // A failed R2 delete after a committed metadata deletion is harmless to users,
  // but still needs physical cleanup. Scan only our prefix, with a day of grace.
  const marker = await D.prepare("SELECT v FROM fx_meta WHERE k = 'files_sweep'").first();
  const page = await env.FILES_R2.list({ prefix: "files/", limit: 100, ...(marker?.v ? { cursor: marker.v } : {}) });
  const old = page.objects.filter(object => now - new Date(object.uploaded).getTime() > DAY);
  for (const object of old) if (!await D.prepare("SELECT 1 FROM ifl_files_nodes WHERE storage_key = ? LIMIT 1").bind(object.key).first()) await env.FILES_R2.delete(object.key);
  await D.prepare("INSERT OR REPLACE INTO fx_meta (k,v) VALUES ('files_sweep',?)").bind(page.truncated ? page.cursor : null).run();
  await D.prepare("DELETE FROM ifl_files_operations WHERE rowid IN (SELECT rowid FROM ifl_files_operations WHERE created < ? AND NOT EXISTS (SELECT 1 FROM ifl_files_nodes n WHERE n.user_id = ifl_files_operations.user_id AND n.id = ifl_files_operations.node_id) ORDER BY created LIMIT 500)").bind(now - DAY).run();
  return removed;
}
