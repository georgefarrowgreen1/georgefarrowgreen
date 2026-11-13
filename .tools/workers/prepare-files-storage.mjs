// Provision only InFlite Files' dedicated bucket and prove it is private before
// any Worker deploy. Existing bucket access settings are never modified.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const FILES_BUCKET = "inflite-private-files";
const API = "https://api.cloudflare.com/client/v4";
const ACCOUNT = /^[a-f0-9]{32}$/i;
export async function prepareFilesStorage({ token, accountId, send = fetch } = {}) {
  if (!token || typeof token !== "string") throw new Error("CLOUDFLARE_API_TOKEN is required for private Files storage.");
  async function call(method, path, body, { missing = false, conflict = false } = {}) {
    let response;
    try { response = await send(API + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20e3), redirect: "error" }); }
    catch (_) { throw new Error("The private Files storage check could not reach Cloudflare. No bucket access settings were changed."); }
    let value;
    try { value = await response.json(); } catch (_) { throw new Error(`Cloudflare returned an unexpected private-storage answer (HTTP ${response.status}).`); }
    if (missing && response.status === 404) return null;
    if (conflict && response.status === 409) return null;
    if (!response.ok || value?.success !== true) {
      const codes = (Array.isArray(value?.errors) ? value.errors : []).map(error => String(error?.code || "").replace(/[^0-9]/g, "")).filter(Boolean).slice(0, 5).join(",");
      // Never log raw API messages, response bodies, request headers or token.
      throw new Error(`Cloudflare refused the private Files storage check (HTTP ${response.status}${codes ? `; codes ${codes}` : ""}). The CI token needs R2 Storage permissions for the account.`);
    }
    return value.result;
  }
  if (!accountId) {
    const accounts = await call("GET", "/accounts?per_page=50");
    if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error("Set CLOUDFLARE_ACCOUNT_ID to the Files storage account; the token does not identify exactly one account.");
    accountId = accounts[0]?.id;
  }
  if (typeof accountId !== "string" || !ACCOUNT.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID must name a valid Cloudflare account.");
  const buckets = `/accounts/${accountId}/r2/buckets`, path = `${buckets}/${FILES_BUCKET}`;
  let bucket = await call("GET", path, null, { missing: true }), created = false;
  if (!bucket) {
    // A single named, empty bucket. A concurrent creator may win; rereading is
    // safe, while repeating a mutation after an unknown network outcome is not.
    const made = await call("POST", buckets, { name: FILES_BUCKET }, { conflict: true });
    created = !!made;
    bucket = await call("GET", path);
  }
  if (bucket?.name !== FILES_BUCKET) throw new Error("Cloudflare did not confirm the dedicated Files bucket. Nothing was deployed.");
  const managed = await call("GET", `${path}/domains/managed`);
  if (managed?.enabled !== false) throw new Error("The dedicated Files bucket is not proven private: its managed public domain must be disabled. No access settings were changed.");
  const custom = await call("GET", `${path}/domains/custom`);
  const domains = Array.isArray(custom) ? custom : custom?.domains;
  if (!Array.isArray(domains) || domains.some(domain => domain?.enabled !== false)) throw new Error("The dedicated Files bucket is not proven private: an enabled or unknown custom domain was returned. No access settings were changed.");
  return { bucket: FILES_BUCKET, created, private: true, managedPublic: false, enabledCustomDomains: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const proof = await prepareFilesStorage({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID || undefined });
    console.log(`InFlite Files storage ${proof.created ? "created and " : ""}verified private; managed public access disabled, no enabled custom domains.`);
  } catch (error) { console.error(`::error::${error.message}`); process.exitCode = 1; }
}
