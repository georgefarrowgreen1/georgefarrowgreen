// The account's page at georgefarrowgreen.com/account/: it lives at account.inflite.ai, its own address, so
// the site's own address sends you there. Preview and local addresses show its files here, without its API (that's
// only at its own address), so a branch can be looked at before it's live.
import { ACCOUNT_HOST, ACCT_SECURITY } from "../_acctapp.js";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (/^(www\.)?georgefarrowgreen\.com$/.test(url.hostname)) return Response.redirect(`https://${ACCOUNT_HOST}${url.pathname.slice(8) || "/"}${url.search}`, 302);
  if (url.pathname === "/account") return Response.redirect(`${url.origin}/account/${url.search}`, 301);
  const res = await ctx.next(), out = new Response(res.body, res);
  for (const [k, v] of Object.entries(ACCT_SECURITY)) out.headers.set(k, v);
  return out;
}
