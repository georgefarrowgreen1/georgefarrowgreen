# Working on this repository

- Testing: for a small change, run only the checks that cover it (the unit tests, `node --test .tools/tests/unit/*.test.mjs`,
  and at most the one or two end-to-end tests for the part changed). Run the full suite only for large changes.
- Push live (to `main`) only when asked.
- Versions: with every change to Weather, Fitness, Markets or the account page that is pushed, raise its build number by 0.01
  (`BUILD` in `weather/app.js`, `fitness/app.js`, `markets/app.js` or `account/app.js`, shown in InFlite's menu as V1.01, V1.02, ...), in the same commit. Chat keeps its
  own release numbers (`APP_VERSION` in `pigeon/app.js`). Beside each, a line saying what's new (`NEWS`; Chat's `APP_NEWS`),
  shown once the update's in. Apps update themselves when the number changes (InFlite's menu: `IFL.updates`). InFlite's menu and header are shared: change
  `.tools/inflite/menu.js` / `menu.css`, then run `node .tools/iflmenu.mjs ../inflite/email/public` (and `node .tools/wxshell.mjs`).
- Minified copies: the apps' scripts and styles are sent minified from `min/` (functions/_min.js). After changing any of
  them, run `node .tools/minify.mjs` (before `node .tools/wxshell.mjs`), in the same commit. A copy that's out of date
  is never sent (the file goes unminified instead), and the unit test `min.test.mjs` names any that are.
