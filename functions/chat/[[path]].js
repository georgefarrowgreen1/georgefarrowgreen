// georgefarrowgreen.com/chat: another way in to InFlight, which lives at
// chat.inflite.ai (a hop, so there's still one address with your
// sign-in, keys and notifications). Locally, the app under /pigeon.
import { APP } from "../_pigeon.js";
import { SITE } from "../_email.js";
export function onRequest({ request, params }) {
  const url = new URL(request.url), rest = [].concat(params.path || []).join("/");
  return Response.redirect(url.origin === SITE ? `${APP}/${rest}${url.search}` : `${url.origin}/pigeon/${rest}${url.search}`, 302);
}
