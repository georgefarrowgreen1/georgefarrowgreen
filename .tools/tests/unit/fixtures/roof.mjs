// One roof's paths for the unit tests (frozen by B0). MAIN, IFL and ROOF are file: URL objects ending in "/", not
// strings: use new URL('x', IFL) or readFileSync(new URL(…)), never path.join(IFL, …); MAIN_DIR, IFL_DIR and ROOF_DIR
// are the same as plain directory strings ending in "/" (null where the URL is null), for path.join and friends.
//   MAIN: this repository's root. IFL: the inflite repo beside it (../inflite), or null where it isn't there.
//   ROOF: IFL's today/public/roof/. roofSkip: false when that inflite has the framework (today/public/roof/router.js),
//   else the reason a roof case skips (a string, for node:test's skip).
// ROOF_IFL=<path> points IFL somewhere else (a missing path shows every roof case skipping cleanly). Every MAIN unit case
// that needs the roof in the IFL beside skips with roofSkip and keeps its milestone-1 assertion for the other state
// (spec §9.3).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MAIN = new URL('../../../../', import.meta.url);
const beside = process.env.ROOF_IFL ? pathToFileURL(process.env.ROOF_IFL.replace(/\/?$/, '/')) : new URL('../inflite/', MAIN);
export const IFL = existsSync(new URL('today/public/', beside)) ? beside : null;
export const ROOF = IFL && new URL('today/public/roof/', IFL);
export const roofSkip = !IFL ? 'the inflite repo isn’t beside this one'
  : !existsSync(new URL('router.js', ROOF)) ? 'the inflite repo beside has no roof yet (today/public/roof/router.js): its live branch, while this repo goes live first'
  : false;
const dir = (u) => u && fileURLToPath(u);
export const MAIN_DIR = dir(MAIN), IFL_DIR = dir(IFL), ROOF_DIR = dir(ROOF);

// Stages 2–4 (roof/s24-contracts.md §13). MAIL_ROOF: IFL's email/public/roof/ (Mail's module files, served at
// /mail/roof/ by the root Worker), or null. mailSkip: false when that inflite has Mail's module (email/public/roof/mail.js),
// else the reason a Mail module case skips. appsSkip: false when IFL's router.js has stages 2–4's REGISTRY (the per-app
// switch, j0), else the reason a case of the per-app switch skips (the IFL beside predates j0).
export const MAIL_ROOF = IFL && new URL('email/public/roof/', IFL);
export const mailSkip = roofSkip || (!existsSync(new URL('mail.js', MAIL_ROOF)) && 'the inflite repo beside has no Mail module yet (email/public/roof/mail.js): stage 4’s B0-b');
export const appsSkip = roofSkip || (!/\bmarkets: fz\(\{|\bmarkets: Object\.freeze\(\{/.test(readFileSync(new URL('router.js', ROOF), 'utf8')) && 'the inflite repo beside has no per-app REGISTRY yet (router.js before stages 2–4’s j0)');
// (where a REGISTRY app's module files are: MAIN's <app>/roof/ for Weather, Markets and Fitness; IFL's email/public/roof/
// for Mail. A published path /<app>/x → the file it is on disk, or null for an app with no files here)
export const MODULE_HOME = Object.freeze({ weather: new URL('weather/', MAIN), markets: new URL('markets/', MAIN), fitness: new URL('fitness/', MAIN), ...(IFL ? { mail: new URL('email/public/', IFL) } : {}) });
export const fileOf = (path) => { const m = /^\/(\w+)\/(.+)$/.exec(path || ''); return m && MODULE_HOME[m[1]] ? new URL(m[2], MODULE_HOME[m[1]]) : null; };
