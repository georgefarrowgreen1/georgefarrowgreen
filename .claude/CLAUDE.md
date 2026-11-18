# Working on this repository

- Testing: for a small change, run only the checks that cover it (the unit tests, `node --test .tools/tests/unit/*.test.mjs`,
  and at most the one or two end-to-end tests for the part changed). Run the full suite only for large changes.
- Push live (to `main`) only when asked.
- All InFlite products use major.feature.minor builds. A fix increments minor, a feature increments feature and resets minor to 1, and a major release starts at major.0.1. Keep standalone and shell module versions and release notes aligned. Check both repositories together with `npm run release:apps -- --check` in the adjacent inflite repo. InFlite's menu and header are shared: change
  `.tools/inflite/menu.js` / `menu.css`, then run `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public` (Mail's and Today's copies,
  in the inflite repo; and `node .tools/wxshell.mjs`).
- Minified copies: the apps' scripts and styles are sent minified from `min/` (functions/_min.js). After changing any of
  them, run `node .tools/minify.mjs` (before `node .tools/wxshell.mjs`), in the same commit. A copy that's out of date
  is never sent (the file goes unminified instead), and the unit test `min.test.mjs` names any that are.
