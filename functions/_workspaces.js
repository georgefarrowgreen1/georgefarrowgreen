// Private workspace metadata. No document, file, message or browser history is
// accepted here. A conditional D1 write fences concurrent devices and deletion.
import { HttpError } from "./_pigeon.js";
import { tablesOnce } from "./_fitness.js";

const fail = (status, words) => { throw new HttpError(status, words); };
const object = v => v && typeof v === "object" && !Array.isArray(v);
const apps = { fitness: ["today", "activities", "routes", "progress"], weather: ["now", "days", "radar", "warnings"], markets: ["today", "holdings", "news"], chats: ["chats", "friends"], mail: ["people", "updates", "later", "done"] };
const homes = { fitness: "/fitness/#today", weather: "/weather/#now", markets: "/markets/#today", chats: "/chats/", mail: "/mail/" };
const id = v => typeof v === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(v);
const label = v => typeof v === "string" ? [...v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/\s+/g, " ")].slice(0, 60).join("") : "";
const number = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bounded = (v, a, b) => Math.round(Math.max(a, Math.min(b, v)) * 10000) / 10000;
const validOwner = owner => typeof owner === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(owner);
export const WORKSPACE_BYTES = 16384;
export function workspaceMetadata(value, owner) {
  if (!validOwner(owner) || !object(value) || value.version !== 2 || value.userId !== owner || !Array.isArray(value.workspaces) || !value.workspaces.length || value.workspaces.length > 8) return fail(400, "That workspace layout is invalid.");
  const seen = new Set();
  const workspaces = value.workspaces.map(w => {
    const name = label(w?.name);
    if (!object(w) || !id(w.id) || seen.has(w.id) || !name || !Array.isArray(w.panes) || !w.panes.length || w.panes.length > 5) return fail(400, "That workspace layout is invalid.");
    seen.add(w.id); const chosen = new Set();
    const panes = w.panes.map(p => {
      if (!object(p) || !Object.hasOwn(apps, p.app) || chosen.has(p.app)) return fail(400, "That workspace app is invalid.");
      chosen.add(p.app);
      // Only literal sections travel between devices. Conversation/object IDs,
      // search terms, share links and arbitrary routes remain local to the app.
      const routes = [homes[p.app], ...apps[p.app].map(section => `/${p.app}/#${section}`)];
      return { id: p.app, app: p.app, route: routes.includes(p.route) ? p.route : homes[p.app] };
    });
    const layout = object(w.layout) ? w.layout : {}, order = Array.isArray(layout.order) ? [...new Set(layout.order.filter(a => chosen.has(a)))] : [];
    for (const a of chosen) if (!order.includes(a)) order.push(a);
    const windows = Object.fromEntries(panes.map((p, index) => {
      const box = object(layout.windows?.[p.app]) ? layout.windows[p.app] : {}, width = bounded(number(box.w, .65), .16, 1), height = bounded(number(box.h, .8), .18, 1);
      return [p.app, { x: bounded(number(box.x, .025 + index * .065), 0, 1 - width), y: bounded(number(box.y, .025 + index * .04), 0, 1 - height), w: width, h: height, minimized: box.minimized === true }];
    }));
    return { id: w.id, name, panes, activePane: chosen.has(w.activePane) ? w.activePane : panes[0].app, layout: { mode: layout.mode === "float" ? "float" : "tile", windows, order }, updatedAt: 0 };
  });
  const state = { version: 2, userId: owner, activeId: seen.has(value.activeId) ? value.activeId : workspaces[0].id, workspaces };
  if (new TextEncoder().encode(JSON.stringify(state)).length > WORKSPACE_BYTES) return fail(413, "That workspace layout is too large.");
  return state;
}
async function make(D) {
  await D.prepare("CREATE TABLE IF NOT EXISTS ifl_workspaces (user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, state TEXT, operation_id TEXT, modified INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0)").run();
}
export async function workspacesdb(env) {
  if (!env.DB) return fail(503, "Workspace sync is unavailable. Try again later.");
  const D = await tablesOnce(env, "workspaces", make);
  return D.withSession ? D.withSession("first-primary") : D;
}
const live = "EXISTS (SELECT 1 FROM pg_users WHERE id = ?1 AND delete_at IS NULL)";
const rowAt = (D, owner) => D.prepare("SELECT * FROM ifl_workspaces WHERE user_id = ?").bind(owner).first();
const answer = (row, owner) => ({ revision: row?.revision || 0, state: row?.state ? workspaceMetadata(JSON.parse(row.state), owner) : null, updatedAt: row?.modified || 0 });
async function assertAccount(D, owner, row) {
  if (row?.closed || !await D.prepare("SELECT 1 FROM pg_users WHERE id = ? AND delete_at IS NULL").bind(owner).first()) return fail(401, "Your account is unavailable. Sign in again.");
}
export async function readWorkspaces(env, owner) {
  const D = await workspacesdb(env), row = await rowAt(D, owner); await assertAccount(D, owner, row);
  return answer(row, owner);
}
export async function writeWorkspaces(env, owner, input) {
  if (!object(input) || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.operationId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(input.operationId)) return fail(400, "Check the workspace version and try again.");
  const state = workspaceMetadata(input.state, owner), text = JSON.stringify(state), D = await workspacesdb(env), before = await rowAt(D, owner); await assertAccount(D, owner, before);
  if (before?.operation_id === input.operationId) {
    if (before.state !== text) return fail(409, "That workspace action was used for a different layout.");
    return answer(before, owner);
  }
  const now = Date.now();
  const result = input.revision === 0
    ? await D.prepare(`INSERT INTO ifl_workspaces (user_id,revision,state,operation_id,modified) SELECT ?1,1,?2,?3,?4 WHERE ${live} ON CONFLICT(user_id) DO UPDATE SET revision=1,state=excluded.state,operation_id=excluded.operation_id,modified=excluded.modified WHERE ifl_workspaces.revision=0 AND ifl_workspaces.closed=0 AND ${live}`).bind(owner, text, input.operationId, now).run()
    : await D.prepare(`UPDATE ifl_workspaces SET revision=revision+1,state=?3,operation_id=?4,modified=?5 WHERE user_id=?1 AND revision=?2 AND closed=0 AND ${live}`).bind(owner, input.revision, text, input.operationId, now).run();
  if (!result.meta?.changes) {
    const latest = await rowAt(D, owner); await assertAccount(D, owner, latest);
    // Lost successful acknowledgements can be checked safely with the same
    // operation ID. A concurrent write can never be silently overwritten.
    if (latest?.operation_id === input.operationId && latest.state === text) return answer(latest, owner);
    return fail(409, "Workspaces changed on another device. Choose which layout to keep.");
  }
  // Return the exact acknowledged write, not a racing device's later snapshot.
  return { revision: input.revision + 1, state, updatedAt: now };
}
export async function closeWorkspaces(env, owner) {
  const D = await workspacesdb(env);
  await D.prepare(`INSERT INTO ifl_workspaces (user_id,closed) SELECT ?1,1 WHERE EXISTS (SELECT 1 FROM pg_users WHERE id=?1) ON CONFLICT(user_id) DO UPDATE SET closed=1`).bind(owner).run();
}
export async function exportWorkspaces(env, owner) {
  return (await readWorkspaces(env, owner)).state;
}
