// Fitness's views import from here what they imported from ../app.js (s2/spec.md §4.1, §4.3): the engine, the adapter
// and the first-paint helpers, so a ported view's `from "./app.js"` becomes `from "./x.js"` and little else changes.
// Complete (B0, j0); owner FXA. No name is in two of these files (an ambiguous star export would be a SyntaxError where
// it's imported).
export * from "./core.js";
export * from "./fxui.js";
export * from "./fxcalc.js";
