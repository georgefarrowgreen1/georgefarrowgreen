// A fitter for Precision Fit Studio's sign-in (functions/_fitstudio.js): prints the line to put in FITTING_USERS, the
// password kept as a PBKDF2 hash (never as it is). Several fitters: a comma between their lines.
//   node .tools/fitting-user.mjs Kate              (asks for the password, not shown)
//   node .tools/fitting-user.mjs Kate 'password'
// Then Cloudflare: Workers & Pages → georgefarrowgreen → Settings → Variables and Secrets → FITTING_USERS (a secret),
// e.g. Kate:pbkdf2$…,Matt:pbkdf2$…  Changing it signs everyone out.
import { webcrypto } from "node:crypto";
import { createInterface } from "node:readline";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { hashPassword } = await import("../functions/_fitstudio.js");

const name = (process.argv[2] || "").trim();
if (!name || name.includes(":") || name.includes(",")) { console.error("Give the fitter's name (no colon or comma): node .tools/fitting-user.mjs Kate"); process.exit(1); }
let password = process.argv[3];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (/Password/.test(s)) rl.output.write(s); };
  password = await new Promise((res) => rl.question(`Password for ${name}: `, (a) => { rl.close(); process.stdout.write("\n"); res(a); }));
}
if (!password || password.length < 8) { console.error("Use a password of 8 characters or more."); process.exit(1); }
const salt = crypto.getRandomValues(new Uint8Array(16)), b64 = (u) => Buffer.from(u).toString("base64");
console.log(`${name}:pbkdf2$100000$${b64(salt)}$${b64(await hashPassword(password, salt))}`);
