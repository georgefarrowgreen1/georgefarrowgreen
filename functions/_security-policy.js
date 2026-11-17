// Security Module: pure policy shared by every cookie and Chat session resolver.
// Captured account headers are preconditions, never authentication or app isolation.
export const CAPTURED_HEADERS = Object.freeze(['X-Inflite-Owner','X-Inflite-Files-Owner','X-Inflite-Workspace-Owner']);
export function capturedAccountMatches(request, user) {
  return !request || CAPTURED_HEADERS.every(name => {
    const value = request.headers.get(name);
    return value === null || /^[A-Za-z0-9_-]{1,128}$/.test(value) && value === user.id;
  });
}
export const SECURITY_POLICIES = Object.freeze({
  organise: Object.freeze({ origin: 'canonical', captured: 'X-Inflite-Owner', limit: 240 }),
  system: Object.freeze({ origin: 'canonical', captured: 'X-Inflite-Owner', limit: 240 }),
  files: Object.freeze({ origin: 'canonical', captured: 'X-Inflite-Files-Owner', limit: 320, nativeDownload: '/api/account/today/files/content' }),
  security: Object.freeze({ origin: 'canonical', captured: 'X-Inflite-Owner', limit: 120 }),
});
