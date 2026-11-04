// The site as a Worker (wrangler.worker.jsonc): the functions/ folder compiled into one Worker the way Pages compiles it
// (its file routes, [[path]] and _middleware.js, ctx.params and ctx.next()), with what ctx.next() passes on served from
// the static assets (env.ASSETS), as on Pages. → .tools/workers/dist/index.js (not kept in the repository)
//   node .tools/workers/build.mjs
import { spawnSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const ROOT = new URL("../../", import.meta.url).pathname, OUT = `${ROOT}.tools/workers/dist`;
const local = `${ROOT}.tools/tests/node_modules/.bin/wrangler`;
const [cmd, pre] = existsSync(local) ? [local, []] : ["npx", ["--yes", "wrangler@4.149.0"]];
const date = /compatibility_date\s*=\s*"([^"]+)"/.exec(readFileSync(`${ROOT}wrangler.toml`, "utf8"))?.[1];
const r = spawnSync(cmd, [...pre, "pages", "functions", "build", "--outdir", OUT, "--compatibility-date", date], { cwd: ROOT, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);
const js = `${OUT}/index.js`, size = statSync(js).size, gz = gzipSync(readFileSync(js)).length;
console.log(`The site's Worker: ${js} (${(size / 1048576).toFixed(2)} MB, ${(gz / 1048576).toFixed(2)} MB gzipped; a Worker may be 10 MB gzipped)`);
