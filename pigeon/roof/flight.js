// Chats' flight sheets: the Flight Log, passport, map, skies, Look Up, ways, the Moon, birds, the loft, Coots, friends' news (network-only).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-B's to write.
// Each opener opens its sheet (fw.sheet.open, data-sheet as roofhooks.mjs names it) and returns the handle;
// ctx = { fw, svc, store, open } (open.*: the bound openers). The stub opens a placeholder sheet only.
import * as moon from "../moon.js";
import * as space from "../space.js";
import * as land from "../land.js";
import * as placegrid from "../placegrid.js";
import * as places from "../places.js";
import * as countries from "../countries.js";
import * as shapes from "../shapes.js";
void moon; void space; void land; void placegrid; void places; void countries; void shapes;
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function openFlightLog(ctx) { return stub(ctx, "flightlog", "Flight Log"); }
export function openPassport(ctx) { return stub(ctx, "passport", "Passport"); }
export function openMap(ctx, msgId) { void msgId; return stub(ctx, "map", "Map"); }
export function openSkies(ctx) { return stub(ctx, "skies", "Skies"); }
export function openLookUp(ctx) { return stub(ctx, "lookup", "Look Up"); }
export function openWay(ctx, id) { void id; return stub(ctx, "way", "Way"); }
export function openMoonPick(ctx, which) { void which; return stub(ctx, "moonpick", "The Moon"); }
export function openBirds(ctx) { return stub(ctx, "birds", "Your Pigeons"); }
export function openBird(ctx, id) { void id; return stub(ctx, "bird", "Pigeon"); }
export function openBirdName(ctx, id) { void id; return stub(ctx, "birdname", "Name Your Pigeon"); }
export function openLoft(ctx, id = null) { void id; return stub(ctx, "loft", "Loft"); }
export function openFeathers(ctx) { return stub(ctx, "feathers", "Coots"); }
export function openNews(ctx) { return stub(ctx, "news", "Friends’ News"); }
