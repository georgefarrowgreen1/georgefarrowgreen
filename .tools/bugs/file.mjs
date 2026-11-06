// The site's new bug reports (functions/_bugs.js), filed as GitHub issues: one issue for each code, a comment each time
// it's seen again, reopened if it was closed and comes back. Run every hour by .github/workflows/bug-reports.yml.
// This repository is public, so an issue has the technical side only: the code, the app and its version, what went
// wrong and where, the page's path, the kind of device, and how often. What a sender wrote stays in the database, for
// Admin (account/admin.js: Server, Bug reports); the issue says only that a note came with it.
//   SITE=… TICK_SECRET=… GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node .tools/bugs/file.mjs
const SITE = (process.env.SITE || "https://inflite-apps.georgefarrowgreen.workers.dev").replace(/\/+$/, "");
const SECRET = process.env.TICK_SECRET, GH = process.env.GITHUB_TOKEN, REPO = process.env.GITHUB_REPOSITORY;
if (!SECRET || !GH || !REPO) { console.log("No tick secret, GitHub token or repository: nothing filed."); process.exit(0); }
const APP = { chat: "Chat", chats: "Chats", weather: "Weather", fitness: "Fitness", markets: "Markets", finance: "Markets", account: "Account", auth: "Sign in", today: "Today", mail: "Mail", email: "Mail", home: "georgefarrowgreen.com", fitting: "Fit Studio", server: "Server" };
const site = (path, init = {}) => fetch(SITE + path, { ...init, headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const gh = async (path, init = {}) => {
  const r = await fetch(`${process.env.GITHUB_API || "https://api.github.com"}${path}`, { ...init, headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" } });
  if (!r.ok && r.status !== 422) throw new Error(`GitHub ${init.method || "GET"} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json();
};
// (what a report says is anyone's words: in the public issue they never make a link or a heading, mention anyone (@), point
// at another issue (#12, owner/repo#12, GH-12), or break out of the table, the code or the fence they're in)
const line = (s, n = 300) => String(s ?? "").replace(/\r?\n/g, " · ").slice(0, n);
const inert = (s) => s.replace(/[@#]/g, "$&\u200b").replace(/\bGH-/gi, "GH\u200b-");
const cell = (s, n) => inert(line(s, n)).replace(/[\\`*_{}[\]()<>!|~&:.+=#-]/g, "\\$&") || "–";
// (as it was, in code: inside more backticks than any run of them in it)
const tick = (s) => { const t = line(s) || "–", f = "`".repeat(Math.max(0, ...(t.match(/`+/g) || []).map((m) => m.length)) + 1); return `${f} ${t} ${f}`; };
const fence = (s) => { const t = String(s).slice(0, 1500), f = "`".repeat(Math.max(2, ...(t.match(/`+/g) || []).map((m) => m.length)) + 1); return `${f}\n${t}\n${f}`; };
const when = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC";

const r = await site("/api/bugs/pending");
if (!r.ok) { console.log(`The site said ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(r.status === 404 ? 0 : 1); }
const { bugs = [] } = await r.json();
if (!bugs.length) { console.log("No new bug reports."); process.exit(0); }
// (issues turned off for the repository: nothing can be filed, so the reports stay as they are, unfiled, for Admin to show,
// and the run says why without failing every hour; turned on (Settings, General, Features, Issues), the next run files them)
if ((await gh(`/repos/${REPO}`))?.has_issues === false) {
  console.log(`::warning::Issues are turned off for ${REPO}, so ${bugs.length} bug report(s) stay unfiled (in Admin, Server). Turn them on in the repository's Settings → General → Features → Issues.`);
  process.exit(0);
}
const byCode = new Map();
for (const b of bugs) (byCode.get(b.code) || byCode.set(b.code, []).get(b.code)).push(b);

// (the issues already filed under a code: their titles start [IF-…])
const filed = new Map();
for (let page = 1; page <= 10; page++) {
  const list = await gh(`/repos/${REPO}/issues?labels=bug-report&state=all&per_page=100&page=${page}`);
  for (const i of list || []) { const m = /^\[(IF-[A-Z]-[0-9A-Z]{4,6})\]/.exec(i.title); if (m && !filed.has(m[1])) filed.set(m[1], i); }
  if (!list || list.length < 100) break;
}
for (const name of ["bug-report"]) await gh(`/repos/${REPO}/labels`, { method: "POST", body: JSON.stringify({ name, color: "d73a4a", description: "Filed from InFlite's bug window or the site's own errors" }) }).catch(() => {});

for (const [code, list] of byCode) {
  const first = list[0], app = APP[first.app] || first.app, notes = list.filter((b) => b.note).length;
  const rows = list.map((b) => `| ${when(b.at)} | ${cell(APP[b.app] || b.app)} ${cell(b.version)} | ${cell(b.kind)} | ${cell(b.path)} | ${cell(b.device)} | ${b.note ? "yes" : ""} |`).join("\n");
  const stack = list.find((b) => b.stack)?.stack;
  const body = [
    `**${code}** · ${app} · seen ${list.length === 1 ? "once" : `${list.length} times`} in this batch${notes ? ` · ${notes} with a note (read it in Admin → Server → Bug reports)` : ""}`, "",
    first.kind === "manual" ? "Reported by hand from Report a Problem." : `**What:** ${tick(first.words)}`,
    first.at_where ? `**Where:** ${tick(first.at_where)}` : "", "",
    "| When | App | Kind | Page | Device | Note |", "|---|---|---|---|---|---|", rows,
    stack ? `\n<details><summary>Stack</summary>\n\n${fence(stack)}\n</details>` : "",
  ].filter((l) => l !== null).join("\n");
  let number;
  // (a problem reported by hand is its own: its code's the window's, so it never comments on, or reopens, one filed before;
  // every other code's worked out by the site, functions/_bugs.js codeFor)
  const had = first.kind === "manual" ? null : filed.get(code);
  if (had) {
    number = had.number;
    if (had.state === "closed") await gh(`/repos/${REPO}/issues/${number}`, { method: "PATCH", body: JSON.stringify({ state: "open" }) });
    await gh(`/repos/${REPO}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body: (had.state === "closed" ? "Seen again after it was closed, so reopened.\n\n" : "Seen again.\n\n") + body }) });
  } else {
    const title = `[${code}] ${app}: ${first.kind === "manual" ? "a problem reported by hand" : inert(line(first.words, 80))}`;
    const made = await gh(`/repos/${REPO}/issues`, { method: "POST", body: JSON.stringify({ title, body, labels: ["bug-report"] }) });
    number = made?.number;
  }
  const ok = await site("/api/bugs/filed", { method: "POST", body: JSON.stringify({ ids: list.map((b) => b.id), issue: number ?? null }) });
  console.log(`${code}: ${list.length} → #${number} (${ok.status})`);
}
