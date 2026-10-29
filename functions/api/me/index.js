// Who's looking at the site's home page, for its top bar and its apps: no one (signed out), or the account the browser's
// signed in to on the site (the cookie for the whole site: functions/_account.js) with its name and email (filled in for
// a message), whether it has a photo, the apps' addresses
// (functions/api/me/photo.js), what each app keeps of theirs in a line, and whether it's the site's owner (who can edit
// the page: functions/_auth.js). The account's own page is named too, for Sign in and the photo to go to.
import { visitor, failed, json, ownerFresh } from "../../_auth.js";
import { appFigures } from "../account/[[path]].js";
import { accountPage } from "../../_pigeon.js";
import { appOrigin } from "../../_sites.js";

export async function onRequestGet({ request, env }) {
  const headers = { "Cache-Control": "private, no-store" }, account = accountPage(request, env);
  // (and the apps' addresses, on their own site: inflite.ai, or the tests')
  const links = Object.fromEntries([["inflight", "chat"], ["weather", "weather"], ["fitness", "fitness"], ["markets", "markets"]].map(([k, a]) => [k, appOrigin(a, env, request) + "/"]));
  try {
    const { u, owner } = await visitor(request, env);
    if (!u) return json({ signedIn: false, account, links }, 200, headers);
    // (fresh: the owner has shown it's them lately, so can change the page now; if not, the page asks on the account's page)
    return json({ signedIn: true, account, links, name: u.name, email: u.email, photoAt: u.avatar_at || null, owner, ...(owner ? { fresh: ownerFresh(u) } : {}), apps: await appFigures(env, u.id) }, 200, headers);
  } catch (e) { return failed(e); }
}
