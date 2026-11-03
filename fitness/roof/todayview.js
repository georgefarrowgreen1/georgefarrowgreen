// STUB (One roof, stages 2–4, batch j0): the frozen surface of this file (s2/spec.md §4.2, §4.3, §4.7; roof/s24-contracts.md).
// Every export below is final in name and shape; each function throws until its owner ports it. The owner replaces the
// bodies, keeps every export and drops STUB (roofcontract.test skips this file's behaviour cases while STUB is here).
// Owner: FXA. Today section: port of fitness/today.js (todayView, dayStrip, weekGrid with day drag, agenda, dayCard, rhythmSays, sessionCard, Ride At, bestTime, effortsCard, weekCard, morningCard, reviewCard, nightsView, feelCard/openCheckIn); its openers become ctx.open.*.
// Signatures: view(el, ctx) → { draw(), hide(), destroy() }; openX(ctx, …) as the ctx.open table of §4.7.
import * as X from "./x.js";
import { offerCards } from "./offers.js";
import * as TC from "../todaycalc.js";
import * as BEST from "../besttime.js";
import * as EFF from "../efforts.js";
import * as CH from "../charts.js";
import { sessionSendCard, packCard } from "../send.js";
export const STUB = true;
export function view() { throw new Error("not yet: view"); }
