// Continue the bio's icon transition over this app's own, already-selected appearance.
// A pseudo-element cover is bounded by CSS as well as script: it can never hold an app behind a failed request.
(() => {
  const root = document.documentElement;
  let source;
  try { source = new URL(document.referrer); } catch (_) { return; }
  if (!/^(www\.)?georgefarrowgreen\.com$/.test(source.hostname) || window.top !== window ||
      performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const icon = document.querySelector('link[rel="apple-touch-icon"]');
  if (icon) root.style.setProperty('--bio-entry-icon', `url(${JSON.stringify(icon.href)})`);
  root.classList.add('bio-arrival');
  let end, safety;
  function clean() {
    clearTimeout(end); clearTimeout(safety);
    root.classList.remove('bio-arrival', 'bio-arrived'); root.style.removeProperty('--bio-entry-icon');
    removeEventListener('pagehide', clean); removeEventListener('pageshow', restored);
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', clean);
    document.removeEventListener('pointerdown', clean);
  }
  function ready() { if (!root.classList.contains('bio-arrival')) return; root.classList.add('bio-arrived'); end = setTimeout(clean, 360); }
  function restored(e) { if (e.persisted) clean(); }
  function visibility() { if (document.hidden) clean(); }
  addEventListener('pagehide', clean); addEventListener('pageshow', restored);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', clean);
  document.addEventListener('pointerdown', clean, { passive: true });
  safety = setTimeout(clean, 1400);
  const paint = () => requestAnimationFrame(() => requestAnimationFrame(ready));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
})();
