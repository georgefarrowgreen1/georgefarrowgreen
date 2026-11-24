import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const CF = "https://api.cloudflare.com/client/v4";
const VERIFIER = "https://account.inflite.ai/api/atlas-admin";
const RELEASE = "https://inflite.ai/atlas/version?check=runs";
const WORKERS = ["inflite", "inflite-apps"];
const KEY_NAME = "ATLAS_VERIFY_KEY";

export async function prepareAtlasVerifier({ token, accountId, release, send = fetch, wait = delay } = {}) {
  if (!token) throw new Error("The production Cloudflare deployment credential is missing.");
  if (!/^\d+\.\d+\.\d+$/.test(release || "")) throw new Error("Supply the expected deployed Atlas release.");

  async function request(url, method, credential, body) {
    let response;
    try {
      response = await send(url, {
        method, redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { ...(credential ? { Authorization: "Bearer " + credential } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error("The production Atlas setup could not reach its deployment service."); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error("The production Atlas setup received an unreadable response (HTTP " + response.status + ")."); }
    return { response, data };
  }
  async function cloudflare(path, method = "GET", body) {
    const { response, data } = await request(CF + path, method, token, body);
    if (!response.ok || data?.success !== true) {
      const codes = (Array.isArray(data?.errors) ? data.errors : []).flatMap(error => Number.isInteger(error?.code) ? [error.code] : []).slice(0, 4);
      throw new Error("Cloudflare refused the Atlas setup (HTTP " + response.status + (codes.length ? ", codes " + codes.join(", ") : "") + ").");
    }
    return data.result;
  }
  const releaseReady = await request(RELEASE, "GET");
  if (!releaseReady.response.ok || releaseReady.data?.build !== release || releaseReady.data.runsReady !== true) {
    throw new Error("The expected Atlas release and its run database are not ready on inflite.ai.");
  }
  if (!accountId) {
    const accounts = await cloudflare("/accounts?per_page=50");
    if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error("The deployment credential must identify one Cloudflare account.");
    accountId = accounts[0]?.id;
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId || "")) throw new Error("The deployment account ID is invalid.");

  const paths = WORKERS.map(worker => "/accounts/" + accountId + "/workers/scripts/" + worker + "/secrets");
  const readBindings = async () => {
    const lists = await Promise.all(paths.map(path => cloudflare(path)));
    if (lists.some(list => !Array.isArray(list))) throw new Error("Cloudflare could not verify both production Worker bindings.");
    return lists.map(list => list.some(binding => binding.name === KEY_NAME && binding.type === "secret_text"));
  };
  const bindings = await readBindings();
  const unverified = await request(VERIFIER, "POST", null, {});
  if (unverified.response.status === 403 && unverified.data?.allowed === false && bindings.every(Boolean)) {
    return { created: false };
  }
  // Repair only an unconfigured verifier. A working account verifier is never
  // rotated, and an unrelated response or service outage does not permit a write.
  if (unverified.response.status !== 503 || unverified.data?.allowed !== false) {
    throw new Error("The production account verifier is responding in an unexpected state. Atlas credentials were preserved.");
  }

  const key = randomBytes(32).toString("base64url");
  for (const path of paths) {
    await cloudflare(path, "PUT", { name: KEY_NAME, type: "secret_text", text: key });
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    // The synthetic owner exercises the bearer boundary without signing in,
    // looking up a user's data or starting paid work.
    const proof = await request(VERIFIER, "POST", key, { owner: "atlas-production-release-probe" });
    if (proof.response.ok && proof.data?.allowed === false && (await readBindings()).every(Boolean)) return { created: true };
    await wait(5000);
  }
  throw new Error("The verifier credentials were written, but the live service did not confirm the new pair.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const proof = await prepareAtlasVerifier({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, release: process.env.ATLAS_RELEASE });
    console.log(proof.created ? "Production Atlas verifier configured and checked with a non-administrator identity." : "Both production Atlas verifier bindings are present. Existing credentials were preserved.");
  } catch (error) {
    console.error("::error::" + error.message);
    process.exitCode = 1;
  }
}
