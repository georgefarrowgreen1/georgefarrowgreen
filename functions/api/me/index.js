// Who's looking at the site's home page, for its top bar and its apps: no one (signed out), or the account the browser's
// signed in to on the site (the cookie for the whole site: functions/_account.js) with its name and email (filled in for
// a message), whether it has a photo
// (functions/api/me/photo.js), what each app keeps of theirs in a line, and whether it's the site's owner (who can edit
// the page: functions/_auth.js). The account's own page is named too, for Sign in and the photo to go to.
import { visitor, failed, json } from "../../_auth.js";
import { appFigures } from "../account/[[path]].js";
import { accountPage } from "../../_pigeon.js";

export async function onRequestGet({ request, env }) {
  const headers = { "Cache-Control": "private, no-store" }, account = accountPage(request, env);
  try {
    const { u, owner } = await visitor(request, env);
    if (!u) return json({ signedIn: false, account }, 200, headers);
    return json({ signedIn: true, account, name: u.name, email: u.email, photoAt: u.avatar_at || null, owner, apps: await appFigures(env, u.id) }, 200, headers);
  } catch (e) { return failed(e); }
}
