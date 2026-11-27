import { existsSync, readFileSync } from 'node:fs';
import { IFL } from './roof.mjs';

export const MAIL = IFL && new URL('email/', IFL);
export const mailWorkerSkip = (!MAIL || !existsSync(new URL('src/index.js', MAIL))) && 'the selected framework has no Mail Worker';
// The pinned 4.52.21 release still uses positional draft files and legacy push payloads.
const entry = IFL && new URL('today/public/app.js', IFL);
export const legacyMailContract = !!entry && existsSync(entry) && /^const BUILD = "4\.52\.21";/m.test(readFileSync(entry, 'utf8'));
