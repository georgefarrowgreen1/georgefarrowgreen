// One motion lifecycle guard in the existing early entry scripts: no new request.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const root = new URL("../", import.meta.url);
export const START = "// ==== InFlite motion: shared lifecycle ====", END = "// ==== End InFlite motion ====";
export const TARGETS = ["account/theme.js", "pigeon/theme.js", "weather/early.js", "fitness/theme.js", "markets/theme.js",
  "status/app.js", "pigeon/tracker.js", "fitness/routes-preview.js",
  "../inflite/today/public/theme.js", "../inflite/email/public/theme.js", "../inflite/email/public/body/body.js"];
export const block = () => `${START}\n${readFileSync(new URL(".tools/inflite/motion.js", root), "utf8").trim()}\n${END}\n`;
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const path of TARGETS) {
    const file = new URL(path, root);
    if (!existsSync(file)) throw new Error(`Missing motion entry: ${path}`);
    const source = readFileSync(file, "utf8"), first = source.indexOf(START), last = source.indexOf(END);
    const rest = first >= 0 && last > first ? source.slice(0, first) + source.slice(last + END.length).replace(/^\n/, "") : source;
    const output = path === "status/app.js" ? '"use strict";\n' + block() + rest.replace(/"use strict";\n/, "") : block() + rest;
    if (output !== source) writeFileSync(file, output);
  }
  console.log("Shared motion lifecycle updated in all early app entries");
}
