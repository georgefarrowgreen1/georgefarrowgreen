// One zoom guard, copied into existing early scripts so no extra request is needed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const root = new URL("../", import.meta.url);
const start = "// ==== InFlite page zoom: shared guard ====", end = "// ==== End InFlite page zoom ====";
const block = `${start}\n${readFileSync(new URL(".tools/inflite/zoom.js", root), "utf8").trim()}\n${end}\n`;
const targets = ["account/theme.js", "pigeon/theme.js", "weather/early.js", "fitness/theme.js", "markets/theme.js",
  "status/app.js", "pigeon/tracker.js", "fitness/routes-preview.js",
  "../inflite/today/public/theme.js", "../inflite/email/public/theme.js", "../inflite/email/public/body/body.js"];
for (const path of targets) {
  const file = new URL(path, root);
  if (!existsSync(file)) throw new Error(`Missing zoom target: ${path}`);
  const source = readFileSync(file, "utf8"), first = source.indexOf(start), last = source.indexOf(end);
  const rest = first >= 0 && last > first ? source.slice(0, first) + source.slice(last + end.length).replace(/^\n/, "") : source;
  // Preserve Status's script directive when prepending the shared guard.
  const output = path === "status/app.js"
    ? '"use strict";\n' + block + rest.replace(/"use strict";\n/, "")
    : block + rest;
  if (output !== source) writeFileSync(file, output);
}
console.log("Shared page zoom guard updated in all app entry scripts");
