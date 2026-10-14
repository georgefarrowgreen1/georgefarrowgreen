// georgefarrowgreen.com/chat: another way in to InFlight, which lives at /pigeon.
// (A hop rather than a second copy: the app keeps one address, so your
// sign-in, keys, notifications and Home Screen icon all stay where they are.)
export function onRequest({ request, params }) {
  const url = new URL(request.url), rest = [].concat(params.path || []).join("/");
  return Response.redirect(`${url.origin}/pigeon/${rest}${url.search}`, 302);
}
