// One roof's paths for the unit tests (frozen by B0): MAIN, this repository's root; IFL, the inflite repo beside it
// (../inflite), or null where it isn't there; roofSkip, false when that inflite has the framework (today/public/roof/
// router.js), else the reason a roof case skips (a string, for node:test's skip). ROOF_IFL=<path> points IFL somewhere
// else (a missing path shows every roof case skipping cleanly). Every MAIN unit case that needs the roof in the IFL beside
// skips with roofSkip and keeps its milestone-1 assertion for the other state (spec §9.3).
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MAIN = new URL('../../../../', import.meta.url);
const beside = process.env.ROOF_IFL ? pathToFileURL(process.env.ROOF_IFL.replace(/\/?$/, '/')) : new URL('../inflite/', MAIN);
export const IFL = existsSync(new URL('today/public/', beside)) ? beside : null;
export const ROOF = IFL && new URL('today/public/roof/', IFL);
export const roofSkip = !IFL ? 'the inflite repo isn’t beside this one'
  : !existsSync(new URL('router.js', ROOF)) ? 'the inflite repo beside has no roof yet (today/public/roof/router.js): its live branch, while this repo goes live first'
  : false;
