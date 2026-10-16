// georgefarrowgreen.com/chat: another way in to InFlight, which lives at
// chat.georgefarrowgreen.com (a hop, so there's still one address with your
// sign-in, keys and notifications). Locally, the app under /pigeon.
import { SITE, APP } from "../_pigeon.js";
export function onRequest({ request, params }) {
  const url = new URL(request.url), rest = [].concat(params.path || []).join("/");
  return Response.redirect(url.origin === SITE ? `${APP}/${rest}${url.search}` : `${url.origin}/pigeon/${rest}${url.search}`, 302);
}
