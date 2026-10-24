// The account, asked for as the page is read, while app.js is still on its way and being made ready to run (it asked
// only once it had, a round trip after all that): load() takes the answer, once, and asks again itself if there's
// none (offline, or refused: said in its own words). Not for a link from the account's emails (#confirm=, #email=,
// #keep=), as what that does first changes what the account says. (A file of its own: the page's rules run no script
// written in it)
try {
  if (!/^#(confirm|email|keep)=[A-Za-z0-9_-]{40,50}$/.test(location.hash)) {
    // (as app.js call() asks: said to be on the Home Screen where it is, and given up after 30 seconds, by hand, as
    // iOS 15 has no AbortSignal.timeout)
    const home = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true, stop = new AbortController();
    setTimeout(() => stop.abort(), 30000);
    self.acctMe = fetch("/api/account/me", { credentials: "same-origin", cache: "no-store", headers: home ? { "X-Home-Screen": "1" } : {}, signal: stop.signal })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
} catch (_) {}
