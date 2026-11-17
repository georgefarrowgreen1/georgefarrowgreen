// Real monitoring credentials must never be typed into an arbitrary dispatch URL.
export function trustedSignInSite(input, local = false) {
  const url = new URL(input || 'https://inflite.ai');
  const allowed = ['https://inflite.ai', 'https://next.inflite.ai', 'https://os.inflite.ai'];
  if (local) allowed.push('http://ifl.test:8788');
  if (!allowed.includes(url.origin) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Sign-in checks require a trusted InFlite origin');
  return url.origin;
}
