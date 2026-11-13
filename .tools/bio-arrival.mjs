// Bundle the small bio-to-app handoff into existing first-paint files; no extra runtime script or stylesheet request.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
for (const [ext, files] of [
  ['js', ['pigeon/theme.js', 'weather/early.js', 'fitness/theme.js', 'markets/theme.js']],
  ['css', ['pigeon/styles.css', 'weather/styles.css', 'fitness/styles.css', 'markets/styles.css']]
]) {
  const begin = ext === 'js' ? '// ==== Bio arrival ====' : '/* ==== Bio arrival ==== */';
  const end = ext === 'js' ? '// ==== End Bio arrival ====' : '/* ==== End Bio arrival ==== */';
  const shared = readFileSync(new URL(`.tools/inflite/bio-arrival.${ext}`, root), 'utf8').trim();
  for (const file of files) {
    const path = new URL(file, root), original = readFileSync(path, 'utf8');
    const start = original.indexOf(begin), finish = original.indexOf(end);
    const old = start < 0 ? original.trimEnd() : (original.slice(0, start) + original.slice(finish + end.length)).trimEnd();
    writeFileSync(path, `${old}\n\n${begin}\n${shared}\n${end}\n`);
  }
}
