import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const root = fileURLToPath(new URL("../../../", import.meta.url));

test("Atlas Fitness context uses the real account and card code in workerd with D1", { timeout: 30000 }, async t => {
  const key = "atlas-runtime-fixture-" + "x".repeat(40);
  const source = `
    import { onRequest } from ${JSON.stringify(root + "functions/api/atlas-context.js")};
    import { accountHost } from ${JSON.stringify(root + "functions/_acctapp.js")};
    import { db } from ${JSON.stringify(root + "functions/_pigeon.js")};
    import { fitdb } from ${JSON.stringify(root + "functions/_fitness.js")};
    import { tddb } from ${JSON.stringify(root + "functions/_today.js")};
    import { setSnapshot } from ${JSON.stringify(root + "functions/_fittoday.js")};
    import { localDay } from ${JSON.stringify(root + "functions/_todaycards.js")};
    export default { async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === "/_fixture") {
        await db(env); await fitdb(env); await tddb(env);
        for (const owner of ["owner", "other"]) {
          await env.DB.prepare("INSERT INTO pg_users(id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at,notify_prefs) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(owner,owner,owner,owner+"@example.test","{}","fixture","fixture","fixture",1,0,0,JSON.stringify({tz:"Pacific/Auckland"})).run();
          await env.DB.prepare("INSERT INTO pg_passkeys(id,user_id,public_key,alg,created_at) VALUES(?,?,?,?,?)").bind("pk-"+owner,owner,"{}",-7,0).run();
          const day = localDay("Pacific/Auckland",Date.now()).day;
          await setSnapshot(env,owner,{tz:"Pacific/Auckland",units:"metric",days:{[day]:{state:"rest",why:owner+" runtime summary"}}});
        }
        await env.DB.prepare("INSERT INTO pg_meta(k,v) VALUES('admin_user','owner')").run();
        return Response.json({ready:true});
      }
      return accountHost({ request, env, next: () => onRequest({request,env,waitUntil:p=>ctx.waitUntil(p)}) }, url);
    } };
  `;
  const bundled = await build({ stdin: { contents: source, resolveDir: root }, bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false, logLevel: "silent" });
  let outbound = 0;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: "2026-06-17", cf: false,
    d1Databases: ["DB"], bindings: { ATLAS_VERIFY_KEY: key, PIGEON_ADMIN_EMAIL: "absent@example.test" },
    outboundService: async () => { outbound++; return new Response("Unexpected fixture network request", { status: 500 }); },
  }));
  t.after(() => mf.dispose());
  assert.equal((await mf.dispatchFetch("https://account.inflite.ai/_fixture")).status, 200);
  const database = await mf.getD1Database("DB");
  const request = (body, extra = {}) => mf.dispatchFetch("https://account.inflite.ai/api/atlas-context", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, ...extra }, body: JSON.stringify(body),
  });
  const response = await request({ owner: "owner", scope: "fitness" });
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.fitness.why, "owner runtime summary"); assert.equal(value.fitness.tz, "Pacific/Auckland");
  assert.equal(response.headers.get("Set-Cookie"), null); assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.ok(!JSON.stringify(value).includes(key));
  assert.equal((await request({ owner: "other", scope: "fitness" })).status, 403);
  assert.equal((await request({ owner: "owner", scope: "fitness" }, { Authorization: "Bearer wrong", Cookie: "account=fixture-cookie" })).status, 403);
  assert.equal((await request({ owner: "owner", scope: "mail" })).status, 400);
  await database.prepare("DELETE FROM pg_passkeys WHERE user_id='owner'").run();
  assert.equal((await request({ owner: "owner", scope: "fitness" })).status, 403, "revocation is rechecked on the next run");
  assert.equal(outbound, 0);
});
