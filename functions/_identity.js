// Only the authenticated InFlite Worker may present a native identity service
// under the public /auth or /account prefix. This never rewrites clientDataJSON.
export function identityPrefix(request) {
  if (request.headers.get('X-Hub-Ok') !== '1') return '';
  const role = request.headers.get('X-Inflite-Identity');
  return ['auth', 'account'].includes(role) && new URL(request.url).origin === `https://${role}.inflite.ai` ? '/' + role : '';
}
export function identityOrigin(request) {
  return !!identityPrefix(request) && new URL(request.url).pathname.startsWith('/api/account/') && request.headers.get('Origin') === 'https://inflite.ai';
}
