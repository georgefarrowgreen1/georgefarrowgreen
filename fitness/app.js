// Fitness: training for riding first, and running, swimming and strength alongside. Four screens on a tab bar:
//
// - Today: today's session (or rest), the best time for it from Weather, your fitness, fatigue and form, the week so
//   far, and how you feel (which can swap a hard day for an easy one).
// - Plan: the plan you're on, its phases and weeks, this week's days and next; another plan from the library.
// - Workouts: the library by sport and kind, your own (built here, or imported), each to read, ride and send.
// - Activities: every ride, run and swim, from the files your devices record, each with its route, figures, charts,
//   zones and best efforts, and out again as FIT, GPX or TCX.
//
// Files come in from anywhere on the page (Import, or dropped on it): FIT from a Garmin or a Wahoo, GPX, TCX, ZWO, ERG,
// MRC, or a zip of them. Workouts go out as each device and app takes them (formats.js). Files are read and made on this
// device.
//
// Signed in only: with your georgefarrowgreen.com account, the one every app on the site uses, signed in on the
// account's own page (account.js). Your rides (each file as you imported it, and its figures), your plan, your numbers
// and your workouts are kept with the account, so they're the same on every phone and computer you sign in on; a change
// here goes to it a moment later, put together with any another device made meanwhile (account.js merge).

import { h, svg as svgOf, icon, sportIcon, U, dur, hm, clock, stepLen, dist, distNum, height, speed, pace, paceOf, weight, dayLong, dayShort, dayName, dayLetter, dateShort, timeOf, plural, pct } from "./ui.js";
import { WORKOUTS, PLANS, SPORTS, ZONES, HR_ZONES, zoneOf, flatten, measure, layOut, workoutById, DAY, startOfDay, addDays, mondayOf } from "./workouts.js";
import { summarise, fitness, formSaid, perSecond, rescale, tssOf } from "./load.js";
import { demo, samples, PROFILE, rng } from "./sample.js";
import * as F from "./formats.js";
import * as C from "./charts.js";
import * as A from "./account.js";
import * as R from "./rhythm.js";
import * as G from "./progress.js";
import * as M from "./map.js";
import * as BT from "./besttime.js";
import * as E from "./efforts.js";
import { askToday, stepDay, todayView } from "./today.js";
import { dayStamp, download, planView, rhythmSetup } from "./plan.js";
import { progressView } from "./progressview.js";
import { activitiesView, figuresOf, openAct, routes, stepAct, uploadFilesView, withFigures } from "./activities.js";

// ==== InFlite's menu, shared: from .tools/inflite/menu.js by node .tools/iflmenu.mjs (change it there) ====
// InFlite's menu: one menu, the same in every app, opened from your photo. You (a tap to your account), the app's own
// few rows, and a foot with its version and Sign Out. With it: the same note in every app after it's updated itself.
// (Plain script, no imports: it's the same in a module and in Mail's script. Images only ever blob: or the app's own,
// as each app's rules allow; the apps' icons are drawn here, made blob: once each.)
const IFL = (() => {
  const APPS = [["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["mail", "Mail"], ["account", "Account"]];
  const NAME = Object.fromEntries(APPS);
  const ICONS = {"chat":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\".6\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4aa3ff\"/><stop offset=\"1\" stop-color=\"#0055d4\"/></linearGradient><radialGradient id=\"glow\" cx=\"220\" cy=\"120\" r=\"760\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"low\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\".6\" stop-color=\"#002a80\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#002a80\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"rim\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".7\"/><stop offset=\".4\" stop-color=\"#fff\" stop-opacity=\".1\"/><stop offset=\".8\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"face\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#e6efff\"/></linearGradient><linearGradient id=\"side\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b9d4fb\"/><stop offset=\"1\" stop-color=\"#7fa9ec\"/></linearGradient><filter id=\"cast\" x=\"-80%\" y=\"-80%\" width=\"260%\" height=\"260%\"><feGaussianBlur stdDeviation=\"22\"/></filter><filter id=\"bevel\" x=\"-5%\" y=\"-5%\" width=\"110%\" height=\"110%\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"5\"/><feOffset dy=\"-9\" result=\"up\"/><feComposite in=\"SourceAlpha\" in2=\"up\" operator=\"out\" result=\"lo\"/><feFlood flood-color=\"#9fbff0\" flood-opacity=\".75\"/><feComposite in2=\"lo\" operator=\"in\" result=\"loS\"/><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"3\"/><feOffset dy=\"6\" result=\"dn\"/><feComposite in=\"SourceAlpha\" in2=\"dn\" operator=\"out\" result=\"hi\"/><feFlood flood-color=\"#fff\"/><feComposite in2=\"hi\" operator=\"in\" result=\"hiL\"/><feMerge><feMergeNode in=\"SourceGraphic\"/><feMergeNode in=\"loS\"/><feMergeNode in=\"hiL\"/></feMerge></filter><clipPath id=\"sq\"><rect width=\"1024\" height=\"1024\" rx=\"224\"/></clipPath></defs><g clip-path=\"url(#sq)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#g)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#glow)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#low)\"/><g filter=\"url(#cast)\" opacity=\".58\"><path transform=\"translate(10 50) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"#001c5c\"/></g><g fill=\"url(#side)\"><path transform=\"translate(0 16) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 14) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 12) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 10) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 8) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 6) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 4) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 2) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/></g><g filter=\"url(#bevel)\"><path transform=\"translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"url(#face)\"/></g></g><rect x=\"4\" y=\"4\" width=\"1016\" height=\"1016\" rx=\"220\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"8\"/></svg>","weather":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4f97f8\"/><stop offset=\"1\" stop-color=\"#2b69de\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd44f\"/><stop offset=\"1\" stop-color=\"#f9b929\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f2f7ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"cloudClip\"><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"#0b3a9e\" fill-opacity=\"0.16\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#cloudClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"url(#glass)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","fitness":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8457\"/><stop offset=\"1\" stop-color=\"#ee4b2f\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#fff4f0\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"wheelClip\"><path clip-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"#8f1d0b\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#wheelClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","mail":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3fd0c6\"/><stop offset=\"1\" stop-color=\"#119a95\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#effffd\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"envClip\"><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"#05534f\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#envClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#05534f\" stroke-opacity=\"0.16\" stroke-width=\"22\" stroke-linecap=\"round\" stroke-linejoin=\"round\" filter=\"url(#frost)\" transform=\"translate(0 6)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.95\" stroke-width=\"14\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","account":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7186ff\"/><stop offset=\"1\" stop-color=\"#4a45dc\"/></linearGradient><linearGradient id=\"head\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc38f\"/><stop offset=\"1\" stop-color=\"#ff8d5c\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f3f4ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"bodyClip\"><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"#1c1a8f\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#bodyClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"url(#glass)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>"};
  const GLYPHS = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    haptics: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M3 9v6M21 9v6"/>',
    faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 16c1.7 1.3 4.3 1.3 6 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    rain: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9"/><path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2"/>',
    watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    signout: '<path d="M9.5 19.5h-3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3M15.5 16.5 20 12l-4.5-4.5M20 12H9.5"/>',
    install: '<path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    addp: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] || ""}</svg>`;
  const urls = {};
  const iconUrl = (a) => urls[a] || (urls[a] = URL.createObjectURL(new Blob([ICONS[a]], { type: "image/svg+xml" })));
  const el = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  };

  // the same short note in every app
  let noteEl = null, noteT = 0;
  function note(app, title, sub) {
    noteEl?.remove();
    clearTimeout(noteT);
    const img = el("img", "ifm-note-ic"); img.src = iconUrl(app); img.alt = "";
    noteEl = el("div", "ifm-note", img, el("span", "ifm-note-tx", el("b", "", title), sub ? el("small", "", sub) : null));
    noteEl.setAttribute("role", "status");
    document.body.append(noteEl);
    requestAnimationFrame(() => requestAnimationFrame(() => noteEl?.classList.add("on")));
    const n = noteEl;
    noteT = setTimeout(() => { n.classList.remove("on"); setTimeout(() => n.remove(), 400); }, 3600);
  }
  // this app's version, as it opens: said once if it's new since last time
  function built(app, build) {
    let was = null;
    try { was = localStorage.getItem(`ifl-build:${app}`); localStorage.setItem(`ifl-build:${app}`, build); } catch (_) {}
    if (was && was !== build) setTimeout(() => note(app, `${NAME[app]} updated`, `Now V${build}`), 600);
  }

  // the menu, from your photo: o = { app, build, me: { name, line, photo: an element }, rows: [{ icon, color, label,
  // on, toggle(next) → on, value, warn (the value in amber: it needs you), open }], account(), signOut(), update: a function when a newer version's ready }
  let open = null;
  function close(now) {
    const m = open;
    if (!m) return;
    open = null;
    m.anchor.classList.remove("ifm-lit");
    document.removeEventListener("keydown", m.key, true);
    // (focus back on your photo, if it was in the menu: else it's left on nothing, and a screen reader starts again at the top)
    if (m.layer.contains(document.activeElement) || document.activeElement === document.body) m.anchor.focus?.({ preventScroll: true });
    m.layer.classList.remove("open");
    m.pop.classList.remove("open");
    if (now) m.layer.remove();
    else { m.pop.classList.add("closing"); setTimeout(() => m.layer.remove(), 260); }
    m.onClose?.();
  }
  function menu(anchor, o) {
    if (open) { const same = open.anchor === anchor; close(); if (same) return; }
    const act = (fn) => () => { close(); fn?.(); };
    const photo = el("span", "ifm-photo", o.me.photo || null);
    const card = el("button", "ifm-card", photo, el("span", "ifm-who", el("b", "", o.me.name || "Your account"), o.me.line ? el("small", "", o.me.line) : null));
    card.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
    card.type = "button";
    card.setAttribute("aria-label", `${o.me.name || "You"}: your InFlite account`);
    card.onclick = act(o.account);
    // (the app's rows: "-" between two starts another group; each row's key, data-k, is its handle)
    const drawRows = (list) => {
      const groups = [el("div", "ifm-grp")];
      for (const r of (list || []).filter(Boolean)) {
        if (r === "-") { groups.push(el("div", "ifm-grp")); continue; }
        const rows = groups[groups.length - 1];
        const ic = el("span", `ifm-ic ${r.color || "grey"}`); ic.innerHTML = svg(r.icon);
        if (r.on !== undefined) {
          const sw = el("button", "ifm-switch"); sw.type = "button"; sw.setAttribute("role", "switch");
          sw.setAttribute("aria-checked", String(!!r.on)); sw.setAttribute("aria-label", r.label);
          if (r.key) sw.dataset.k = r.key;
          sw.disabled = !!r.disabled;
          sw.onclick = async () => { const next = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(next)); const v = await r.toggle?.(next); if (typeof v === "boolean") sw.setAttribute("aria-checked", String(v)); };
          rows.append(el("div", "ifm-row" + (r.disabled ? " off" : ""), ic, el("span", "ifm-l", r.label), sw));
        } else {
          // (a value or none, its chevron in the same column: lined up with every other row's)
          const b = el("button", "ifm-row go", ic, el("span", "ifm-l", r.label), el("span", "ifm-val" + (r.warn ? " warn" : ""), r.value || ""));
          b.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
          b.type = "button"; b.onclick = r.stay ? () => r.open?.(b) : act(r.open);
          if (r.key) b.dataset.k = r.key;
          rows.append(b);
        }
      }
      return groups.filter((g) => g.childNodes.length);
    };
    const rowsBox = el("div", "ifm-rows", ...drawRows(o.rows));
    const mark = el("img", "ifm-foot-ic"); mark.src = iconUrl(o.app); mark.alt = "";
    // (its foot: the app and its version, quietly, a green dot while it's up to date; a new version waiting, an Update
    // button in the dot's place; and Sign Out, the one round button at the end, named for screen readers)
    const said = (t) => el("span", "ifm-sr", t);
    let status;
    if (o.update) { status = el("button", "ifm-upd"); status.innerHTML = svg("install"); status.append("Update"); status.type = "button"; status.onclick = act(o.update); }
    else { status = el("span", "ifm-dot", said(" · Up to date")); }
    const out = el("button", "ifm-out", said("Sign Out")); out.insertAdjacentHTML("afterbegin", svg("signout")); out.type = "button"; out.onclick = act(o.signOut);
    const foot = el("div", "ifm-foot", el("span", "ifm-ver", mark, `${NAME[o.app]} ${o.build}`, o.update ? null : status), o.update ? status : null, o.signOut ? out : null);
    const pop = el("div", `ifm-pop ifm-in-${o.app}`, card, rowsBox, foot);
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "You and your apps");
    const layer = el("div", "ifm-layer", pop);
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) { e.preventDefault(); close(); } });
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus?.({ preventScroll: true }); }
      else if (e.key === "Tab") {
        const f = [...pop.querySelectorAll("button, a")];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    // (under your photo, from where it grows; over it, if your photo's low on the screen)
    const r = anchor.getBoundingClientRect(), H = window.innerHeight, W = window.innerWidth;
    const left = Math.max(12, Math.min(r.left - 2, W - pop.offsetWidth - 12));
    const below = r.bottom + 10 + pop.offsetHeight <= H - 12 || r.top < H / 2;
    const top = below ? r.bottom + 10 : Math.max(12, r.top - 10 - pop.offsetHeight);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${below ? "-10px" : "calc(100% + 10px)"}`;
    anchor.classList.add("ifm-lit");
    open = { anchor, layer, pop, key, onClose: o.onClose, redraw: (list) => {
      // (the focus kept on the row it was on, by its key)
      const k = document.activeElement?.dataset?.k;
      rowsBox.replaceChildren(...drawRows(list));
      if (k) rowsBox.querySelector(`[data-k="${k}"]`)?.focus({ preventScroll: true });
    } };
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add("open"); pop.classList.add("open"); }));
    card.focus({ preventScroll: true });
  }
  // InFlite's header, the same in every app: your photo (InFlite's menu; signed out, an outline that signs in) · the
  // screen's name, large, with its one line under it (a ▾ after the name when tapping it switches) · the app's actions in
  // one capsule. Scrolled, the same row, compact, on a soft glass band: --p, from 0 to 1 over the first 64px, set on each
  // .ifh in what's scrolled (watch), and again whenever the page is drawn anew (settle)
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // o: { me: your photo's html (none: signed out), meAttrs, title, pickAttrs (set: the name's a button, with ▾), line: html,
  //      acts: [{ icon: a glyph's name or svg html, label, attrs }] } (attrs: the app's own, as html: data-act="…", id="…")
  function headerHtml(o) {
    const me = `<button type="button" class="ifh-me${o.me ? "" : " out"}" aria-label="${o.me ? "You and your apps" : "Sign in"}" aria-haspopup="${o.me ? "dialog" : "false"}" ${o.meAttrs || ""}>${o.me || svg("person")}</button>`;
    const name = o.pickAttrs != null ? `<button type="button" class="ifh-pick" ${o.pickAttrs}><span>${esc(o.title)}</span>${svg("down", "ifh-down")}</button>` : esc(o.title);
    const acts = (o.acts || []).filter(Boolean).map((a) => `<button type="button" class="ifh-act" aria-label="${esc(a.label)}" title="${esc(a.label)}" ${a.attrs || ""}>${GLYPHS[a.icon] ? svg(a.icon) : a.icon}</button>`).join("");
    return `<header class="ifh${o.cls ? " " + o.cls : ""}">${me}<div class="ifh-t"><h1 class="ifh-name">${name}</h1><span class="ifh-line">${o.line || ""}</span></div><div class="ifh-acts">${acts}</div></header>`;
  }
  // as an element, with what's tapped wired: o.onMe(button), o.onPick(button), each act's onclick(button)
  function header(o) {
    const t = document.createElement("template");
    t.innerHTML = headerHtml({ ...o, pickAttrs: o.onPick ? o.pickAttrs || "" : o.pickAttrs });
    const hd = t.content.firstElementChild;
    if (o.me instanceof Node) { const b = hd.querySelector(".ifh-me"); b.replaceChildren(o.me); b.classList.remove("out"); b.setAttribute("aria-label", "You and your apps"); }
    if (o.onMe) hd.querySelector(".ifh-me").onclick = (e) => o.onMe(e.currentTarget);
    if (o.onPick) hd.querySelector(".ifh-pick").onclick = (e) => o.onPick(e.currentTarget);
    if (o.lineNode) hd.querySelector(".ifh-line").replaceChildren(o.lineNode);
    hd.querySelectorAll(".ifh-act").forEach((b, i) => { const a = (o.acts || []).filter(Boolean)[i]; if (a?.onclick) b.onclick = (e) => a.onclick(e.currentTarget); });
    return hd;
  }
  const watched = new Set();
  function settle(t = window) {
    const y = t === window ? scrollY : t.scrollTop, p = Math.max(0, Math.min(1, y / 64)).toFixed(3);
    for (const hd of (t === window ? document : t).querySelectorAll(".ifh")) { hd.style.setProperty("--p", p); hd.classList.toggle("ifh-up", p > 0); }
  }
  function watch(t = window) {
    if (!watched.has(t)) { watched.add(t); t.addEventListener("scroll", () => settle(t), { passive: true }); }
    settle(t);
  }
  const glyph = (name) => svg(name);

  // (the open menu's rows drawn again, as what they say changes: one that's come or gone)
  const redraw = (rows) => open?.redraw(rows);
  return { header, headerHtml, watch, settle, glyph, APPS, NAME, menu, close, redraw, isOpen: () => !!open, built, note, iconUrl };
})();
// ==== end of InFlite's menu ====

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), toastEl = $("#toast"), tabsEl = $("#tabs"), dropEl = $("#drop"), filesEl = $("#files");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// ---- kept in this browser ----
const store = {
  get(k, d) { try { const v = localStorage.getItem("fitness:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("fitness:" + k, JSON.stringify(v)); } catch (_) {} },
};
// each activity's file as this device last fetched it (IndexedDB), so a ride opened again doesn't come over the network
// again: by account and activity, and cleared on signing out
const idb = (() => {
  let p = null;
  const open = () => (p ||= new Promise((res, rej) => {
    const r = indexedDB.open("fitness", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction("files", mode), q = fn(t.objectStore("files")); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
  };
  return { get: (k) => run("readonly", (s) => s.get(k)), put: (k, v) => run("readwrite", (s) => s.put(v, k)), del: (k) => run("readwrite", (s) => s.delete(k)), clear: () => run("readwrite", (s) => s.clear()) };
})();

const TODAY = startOfDay(Date.now());
const D = demo(Date.now());
// Your record (kept with the account: adopt), your own activities (S.own, their rows from the account), and the example
// rides, shown only if you turn them on (You › Example rides). The plan's the one you chose (and when it starts), or with
// the examples on and none chosen, theirs.
// Your numbers before Fitness knows them: middling ones, each marked not set (so worked out from your rides as they
// come in, and asked in Rhythm's setup), never someone else's
const START = { ftp: 200, weight: 75, lthr: 160, maxHr: 182, restHr: 55, runPace: 330, css: 120 };
// What everything worked out from your rides is kept against: a count that moves whenever the rides, their figures or
// what's kept with the account change (so Rhythm's plan, your fitness, the days' rides and Progress's figures are worked
// out once a change, not each time a screen asks)
let dataV = 0;
const changed = () => { dataV++; };
class Watched extends Map { set(k, v) { dataV++; return super.set(k, v); } delete(k) { dataV++; return super.delete(k); } clear() { dataV++; return super.clear(); } }
// a value worked out once a change (and a day: a new day, worked out afresh)
// (a declaration, so the screens' modules can make theirs as they load, before this one has run)
function once(f) { let at = null, v; return () => { const k = `${dataV}@${TODAY}`; if (k !== at) { v = f(); at = k; } return v; }; }
const S = {
  tab: "today", me: null, ver: 0, dirty: new Set(), inStepWorkouts: [], pulledAt: 0,
  profile: { ...START, set: [] }, examples: false, chosen: null, rhythm: null, swaps: {}, feel: {}, mine: [],
  sport: "ride", actSport: "all", formDays: 42,
  own: [], acts: [], garmin: { on: false },
  sums: new Watched(), summed: false,
};
// Your record, as kept with the account, taken up here (null: none yet, so the app's own defaults)
function adopt(d) {
  changed();
  const ok = (o) => o && typeof o === "object" && !Array.isArray(o), was = numbers();
  // (a record from before numbers were marked set or worked out: all of them taken to be yours)
  const kept = ok(d?.profile) ? d.profile : null;
  S.profile = { ...START, ...(kept || {}), set: kept ? (Array.isArray(kept.set) ? kept.set : Object.keys(START).filter((k) => k in kept)) : [] };
  S.chosen = ok(d?.plan) && PLANS.some((p) => p.id === d.plan.id) && Number.isFinite(d.plan.start) ? d.plan : null;
  S.rhythm = ok(d?.rhythm) && Array.isArray(d.rhythm.days) ? d.rhythm : null;
  S.swaps = ok(d?.swaps) ? d.swaps : {}; S.feel = ok(d?.feel) ? d.feel : {};
  S.mine = Array.isArray(d?.workouts) ? d.workouts : [];
  // (units as you chose them; till then, your phone's region's: miles in the US, kilometres elsewhere)
  S.unitsSet = d?.prefs?.units === "metric" || d?.prefs?.units === "imperial";
  U.metric = S.unitsSet ? d.prefs.units !== "imperial" : !/-(US|LR|MM)\b/i.test(navigator.language || "");
  S.ask = d?.prefs?.ask !== false;
  S.nightsFrom = ["apple", "garmin"].includes(d?.prefs?.nights) ? d.prefs.nights : "auto";
  S.onboarded = d?.prefs?.onboarded === true;
  S.maps = d?.prefs?.maps === "always" ? "always" : "tap";
  S.examples = false;   // (the example rides are gone: your own alone)
  setActs();
  // (new numbers, from another device: every ride's stress worked out again for them)
  if (numbers() !== was) resum();
}
const numbers = () => [P().ftp, P().lthr, P().runPace, P().css].join("/");
// what's kept with the account, as this device has it now
const record = () => ({ profile: (({ name, ...p }) => p)(S.profile), plan: S.chosen, rhythm: S.rhythm, swaps: S.swaps, feel: S.feel, workouts: S.mine,
  prefs: { ...(S.unitsSet ? { units: U.metric ? "metric" : "imperial" } : {}), examples: S.examples, ...(S.ask === false ? { ask: false } : {}), ...(S.nightsFrom && S.nightsFrom !== "auto" ? { nights: S.nightsFrom } : {}), ...(S.maps === "always" ? { maps: "always" } : {}), ...(S.onboarded ? { onboarded: true } : {}) } });
// Your numbers from your rides, for those you haven't set: FTP from your best 20 minutes of the last 90 days (95% of
// it), max heart rate the highest in any of them (and threshold heart rate 90% of that, unless you've set it)
const isSet = (k) => (P().set || []).includes(k);
function estimates() {
  const since = addDays(TODAY, -90), rides = S.own.filter((a) => a.start >= since && a.sport === "ride");
  const b20 = Math.max(0, ...rides.map((a) => sumOf(a)?.curve?.[1200] || 0)), hr = Math.max(0, ...S.own.map((a) => sumOf(a)?.maxHr || 0));
  return { ftp: b20 >= 60 ? Math.round(b20 * 0.95) : null, maxHr: hr >= 120 && hr <= 230 ? Math.round(hr) : null, rides: rides.filter((a) => sumOf(a)?.curve?.[1200]).length };
}
function estimate() {
  const e = estimates(), ch = {};
  if (e.ftp && !isSet("ftp") && Math.abs(e.ftp - P().ftp) >= 3) ch.ftp = e.ftp;
  if (e.maxHr && !isSet("maxHr") && e.maxHr !== P().maxHr) { ch.maxHr = e.maxHr; if (!isSet("lthr")) ch.lthr = Math.round(e.maxHr * 0.9); }
  if (!Object.keys(ch).length) return;
  S.profile = { ...P(), ...ch, ...(ch.ftp ? { ftpLog: logFtp(ch.ftp, 0) } : {}) }; keep("profile"); resum(); redraw();
}
// FTP as it changes, a day at a time (a change the same day replaces that day's), for Progress
function logFtp(v, set) {
  const log = (P().ftpLog || []).filter((x) => x[0] !== TODAY);
  return [...log, [TODAY, Math.round(v), set ? 1 : 0]].slice(-120);
}
// one of your numbers set by you: kept as it is from now on
function setNumber(k, v) {
  S.profile = { ...P(), [k]: v, set: [...new Set([...(P().set || []), k])], ...(k === "ftp" ? { ftpLog: logFtp(v, 1) } : {}) };
  // (threshold heart rate follows your max, till you set it too)
  if (k === "maxHr" && !isSet("lthr")) S.profile.lthr = Math.round(v * 0.9);
  keep("profile");
}
// A change to your record: kept with your account a moment later (a few changes go as one), from the version this
// device had. Where another device has changed it meanwhile, the two are put together (each part this device changed
// its own, the days and workouts joined) and sent again.
let saveT = null;
function keep(...parts) { changed(); if (!S.me) return; for (const x of parts) S.dirty.add(x); clearTimeout(saveT); saveT = setTimeout(inStep, 700); morningRefresh(); }
async function inStep() {
  if (!S.me || !S.dirty.size || inStep.busy) return;
  // (nothing kept till the account's said who's signed in: the copy on the screen may be another's)
  if (!background.done) { clearTimeout(saveT); saveT = setTimeout(inStep, 700); return; }
  inStep.busy = true;
  const dirty = new Set(S.dirty); S.dirty.clear();
  let again = 700;
  try {
    let mine = record(), r = await A.save(S.ver, mine), merged = false;
    for (let i = 0; r.conflict && i < 3; i++) {
      mine = A.merge(r.data, mine, dirty, S.inStepWorkouts); S.inStepWorkouts = A.workoutIds(r.data);
      adopt(mine); merged = true; r = await A.save(r.ver, mine);
    }
    if (r.conflict) throw new Error("Your changes didn’t save. Try again.");
    S.ver = r.ver; S.inStepWorkouts = A.workoutIds(r.data || mine);
    if (merged) redraw();
  } catch (e) {
    for (const x of dirty) S.dirty.add(x);
    if (e.status === 401) { inStep.busy = false; return signedOutHere(true); }
    toast(e.offline ? "You’re offline: your changes will be saved when you’re back" : e.message, true);
    again = e.offline ? 15000 : 30000;
  } finally { inStep.busy = false; }
  // (changes made while that was on its way, or that didn't go: next)
  if (S.dirty.size) { clearTimeout(saveT); saveT = setTimeout(inStep, again); }
}
function setActs() {
  changed();
  S.acts = [...(S.examples ? D.history.map((x) => ({ ...x, sample: true })) : []), ...S.own].sort((a, b) => b.start - a.start);
}
const P = () => S.profile;
const signed = (v) => (Math.round(v) > 0 ? "+" : Math.round(v) < 0 ? "−" : "") + Math.abs(Math.round(v));
const runSpeed = () => 1000 / P().runPace, swimSpeed = () => 100 / P().css;
const paceFor = (sport) => (sport === "run" ? runSpeed() : sport === "swim" ? swimSpeed() : 4);
const allWorkouts = () => [...S.mine, ...WORKOUTS];
const wkById = (id) => S.mine.find((w) => w.id === id) || R.workoutOf(id, rh()?.targets);

// ---- Rhythm: the plan that never ends (rhythm.js), unless you've chosen an event's plan ----
const rhythmOn = () => !!S.rhythm && !S.chosen;
let rhCache = null;
function rh() {
  if (!rhythmOn()) return null;
  // (worked out again only when something it goes on has changed: the count covers the rides and their figures)
  // (and the wet days ahead, from the weather where you ride, and your nights, from Garmin)
  const wet = wetAhead(), well = wellByDay();
  const key = `${dataV}@${TODAY}|${P().ftp}|${P().runPace}|${P().css}|${JSON.stringify(S.rhythm)}|${JSON.stringify(S.feel)}|${JSON.stringify(S.swaps)}|${JSON.stringify(wet)}|${wellSource().length}:${JSON.stringify(wellSource().at(-1) || "")}`;
  if (rhCache?.key !== key) {
    const acts = S.own.map((a) => ({ start: a.start, sport: a.sport, indoor: !!a.indoor, sum: sumOf(a) }));
    rhCache = { key, v: R.plan({ prefs: S.rhythm, acts, feel: S.feel, swaps: S.swaps, today: TODAY, ftp: P().ftp, paces: { run: runSpeed(), swim: swimSpeed() }, wet, well }) };
  }
  return rhCache.v;
}
// the wet days ahead (fitness/besttime.js), as the days' starts here: { day: true }
function wetAhead() {
  const w = BT.wetDays(S.wx?.d), out = {};
  for (const k of Object.keys(w)) { const [y, m, d] = k.split("-").map(Number); out[startOfDay(new Date(y, m - 1, d, 12).getTime())] = true; }
  return out;
}
// your nights, by the day they ended: { day: { hrv, hrv_lo, hrv_hi, rhr, sleep, score } }, from Garmin (functions/_garmin.js)
// or Apple Health (functions/_health.js), whichever has more of this month's; never the two mixed, their HRVs being
// measured differently (Garmin's RMSSD, the Watch's SDNN), each read against its own usual range
// (or the one you chose: S.nightsFrom, "apple" or "garmin"; "auto" till you do)
function wellSource() { return nightsFrom() === "apple" ? S.health?.well || [] : S.garmin?.well || []; }
function nightsFrom() {
  const month = new Date(TODAY - 30 * DAY).toISOString().slice(0, 10), n = (xs) => (xs || []).filter((r) => r.day >= month).length;
  const a = n(S.health?.well), g = n(S.garmin?.well);
  if (S.nightsFrom === "apple" && S.health?.on) return "apple";
  if (S.nightsFrom === "garmin" && S.garmin?.on) return "garmin";
  return a > g ? "apple" : g ? "garmin" : a ? "apple" : null;
}
// your nights for the charts, the last `days`: [{ day, hrv, lo, hi, trend, rhr, sleep, score }], oldest first (a night
// with nothing, nulls), each with its usual range and its week's HRV as Rhythm reads them (rhythm.js nightOf)
function nightsSeries(days = 60) {
  const w = wellByDay(), out = [];
  for (let d = addDays(TODAY, -(days - 1)); d <= TODAY; d = addDays(d, 1)) { const n = R.nightOf(w, d); out.push({ day: d, hrv: n?.hrv ?? null, lo: n?.lo ?? null, hi: n?.hi ?? null, trend: n?.trend ?? null, rhr: n?.rhr ?? null, sleep: n?.sleep ?? null, score: n?.score ?? null }); }
  return out;
}
function wellByDay() {
  const out = {};
  for (const r of wellSource()) { const [y, m, d] = r.day.split("-").map(Number); out[startOfDay(new Date(y, m - 1, d, 12).getTime())] = r; }
  return out;
}
const rhDay = (d) => rh()?.days.find((x) => x.date === d) || null;

// ---- the plan, as days ----
const myPlan = () => S.chosen || (S.examples && !S.rhythm ? { id: "sportive", start: D.start } : null);
const plan = () => (myPlan() ? PLANS.find((p) => p.id === myPlan().id) : null);
const planStart = () => myPlan()?.start ?? Infinity;
let weeksCache = null;
function weeks() {
  const c = myPlan();
  if (!c) return [];
  const key = c.id + c.start;
  if (weeksCache?.key !== key) weeksCache = { key, v: layOut(plan(), c.start) };
  return weeksCache.v;
}
// (a plan's chosen on a day: the days before it, in a plan that starts partway, aren't missed, as you weren't on it)
function choosePlan(c) { S.chosen = { ...c, at: TODAY }; S.swaps = {}; keep("plan", "swaps"); }
const missed = (day, wk) => (rhythmOn() ? !!rhDay(day)?.missed : wk && day < TODAY && day >= (myPlan()?.at ?? -Infinity) && !actsOn(day).length);
// what's planned on a day (a swap you've made, or the plan's): a workout id, "event", or null for rest
function plannedOn(day) {
  if (S.swaps[day] !== undefined) return S.swaps[day];
  if (rhythmOn()) { const r = rhDay(day); return r ? r.id : undefined; }
  for (const w of weeks()) for (const d of w.days) if (d.date === day) return d.id;
  return undefined;
}
const weekIndex = (day) => (myPlan() ? Math.floor((mondayOf(day) - mondayOf(planStart())) / (7 * DAY) + 0.01) : -1);
// each day's activities, by day (made once a change)
const byDay = once(() => { const m = new Map(); for (const a of S.acts) { const d = startOfDay(a.start); if (!m.has(d)) m.set(d, []); m.get(d).push(a); } return m; });
const actsOn = (day) => byDay().get(day) || [];
const eventDay = () => weeks().at(-1)?.days.at(-1).date ?? null;

// ---- each ride's figures: worked out a few at a time once the page is up, newest first, and kept for next time ----
const sumKey = () => `${P().ftp}/${P().lthr}`;
const sumOf = (a) => S.sums.get(a.id);
// A ride's samples, the last few kept: a sample ride's made up afresh each time it's needed; one of yours read from its
// file (load), which comes from this device's copy of it, or the account's
const held = new Map();
const remember = (id, x) => { held.delete(id); held.set(id, x); if (held.size > 6) held.delete(held.keys().next().value); return x; };
function full(a) {
  if (held.has(a.id)) return held.get(a.id);
  return a.sample ? remember(a.id, samples(a, P())) : null;
}
const fileKey = (a) => `${S.me?.id}:${a.id}`;
// A file read off the page's thread (reader.js), each activity with its figures worked out there (as `pre`); where a
// worker can't be had, or fails, read here instead. → as formats.js readAny
let readerW = null, readerN = 0;
const readerWait = new Map();
function readOff(name, bytes) {
  if (!readerW && readerW !== false) {
    try {
      readerW = new Worker(new URL("./reader.js", import.meta.url), { type: "module" });
      readerW.onmessage = ({ data }) => { const w = readerWait.get(data.id); if (!w) return; readerWait.delete(data.id); data.error ? w.no(Object.assign(new Error(data.error), { read: true })) : w.ok(data.r); };
      readerW.onerror = () => { readerW = false; for (const [, w] of readerWait) w.no(Object.assign(new Error("worker"), { worker: true })); readerWait.clear(); };
    } catch (_) { readerW = false; }
  }
  if (!readerW) return F.readAny(name, bytes);
  const id = ++readerN, u8 = new Uint8Array(bytes).slice();
  return new Promise((ok, no) => { readerWait.set(id, { ok, no }); readerW.postMessage({ id, name, bytes: u8, profile: P() }, [u8.buffer]); })
    .catch((e) => (e.worker ? F.readAny(name, bytes) : Promise.reject(e)));
}
async function load(a) {
  if (full(a)) return full(a);
  let bytes = await idb.get(fileKey(a)).catch(() => null);
  if (!bytes) { bytes = await A.fileOf(a.id); idb.put(fileKey(a), bytes).catch(() => {}); }
  const r = await readOff(a.file || `activity.${a.type}`, bytes);
  // (a file of several parts, a triathlon's: the part that's this one, by when it started)
  const x = r.activities.find((y) => Math.abs(y.start - a.start) < 2000) || r.activities[0];
  if (!x) throw new Error("That file has no activity in it any more.");
  Object.assign(x, { id: a.id, name: a.name });
  return remember(a.id, x);
}
function sumUp() {
  const cached = store.get("sums", null);
  if (cached?.key === sumKey() + "@" + TODAY) for (const [id, s] of Object.entries(cached.v)) S.sums.set(id, s);
  const todo = S.acts.filter((a) => a.sample && !S.sums.has(a.id));
  S.summed = !todo.length;
  if (S.summed) return;
  let i = 0;
  const step = () => {
    const until = performance.now() + 40;
    while (i < todo.length && performance.now() < until) { const a = todo[i++]; S.sums.set(a.id, summarise(full(a), P())); }
    if (i < todo.length) return setTimeout(step, 0);
    S.summed = true;
    store.set("sums", { key: sumKey() + "@" + TODAY, v: Object.fromEntries([...S.sums].filter(([id]) => id.startsWith("x"))) });
    redraw();
  };
  setTimeout(step, 30);
}
// (your numbers changed: the example rides' figures worked out again, and yours from what they were worked out with)
function resum() {
  for (const id of [...S.sums.keys()]) if (id.startsWith("x")) S.sums.delete(id);
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  store.set("sums", null); sumUp();
}

// fitness, day by day, from every ride's stress
const fitnessSeries = once(() => fitnessSeriesNow());
function fitnessSeriesNow() {
  const daily = {};
  for (const a of S.acts) { const t = tssOf(sumOf(a), a.sport); if (t) daily[startOfDay(a.start)] = (daily[startOfDay(a.start)] || 0) + t; }
  const first = Math.min(...S.acts.map((a) => a.start), TODAY - 120 * DAY);
  return fitness(daily, first, TODAY);
}

// ---- the page ----
// (three: Today has the plan's days too, Plan having gone into it)
const TABS = [["today", "Today", "today"], ["activities", "Activities", "list"], ["progress", "Progress", "trend"]];
// On a computer the tab bar is a sidebar down the left (styles.css): the tabs, Upload, and you at its foot, which a phone
// keeps in the screens' own tops instead
function drawTabs() {
  tabsEl.replaceChildren(
    h("div.side-brand.side-only", {}, h("img", { src: "icon.svg", alt: "", width: 30, height: 30 }), h("span.tl", { text: "Fitness" })),
    ...TABS.map(([id, name, ic], i) => h("button.tab", { type: "button", title: name, "aria-keyshortcuts": String(i + 1), "aria-current": S.tab === id ? "page" : null, onclick: () => go(id) }, icon(ic, 24, 1.9), h("span.tl", { text: name }), h("kbd", { text: String(i + 1) }))),
    h("button.tab.side-only", { type: "button", title: "Upload files", "aria-keyshortcuts": "U", onclick: () => openSheet(uploadFilesView) }, icon("upload", 22, 1.9), h("span.tl", { text: "Upload files" }), h("kbd", { text: "U" })),
    h("button.side-me.side-only", { type: "button", title: "You and your apps", onclick: (e) => youMenu(e.currentTarget) }, h("span.round.me", {}, face()), h("span.tl", {}, h("b", { text: S.me?.name?.split(" ")[0] || "You" }), h("small", { text: "You and your apps" }))));
  tabsEl.style.setProperty("--tab", TABS.findIndex(([id]) => id === S.tab));
}
// ---- on a computer: wider than a phone, the sidebar; wider still (1100px), each screen laid out across it ----
const wideQ = matchMedia("(min-width: 1100px)"), sideQ = matchMedia("(min-width: 760px)");
const wide = () => wideQ.matches;
// (the page's width without its scroll bar, less the sidebar; the content as wide as that, up to 1560px, less its margins)
const sideW = () => (wideQ.matches ? 252 : sideQ.matches ? 100 : 0);
const mainW = () => Math.min(document.documentElement.clientWidth - sideW(), 1560) - 64;
// (a part of the content's width: two-thirds of it, half, a twelfth-column grid's span, less the gap)
const partW = (part) => Math.round((mainW() + 20) * part - 20);
for (const q of [wideQ, sideQ]) q.addEventListener("change", () => { if (S.me) { drawTabs(); redraw(true); } });
// (the charts drawn to the width they're shown at: drawn again once the window's done changing size)
let sizeT = null;
addEventListener("resize", () => { clearTimeout(sizeT); sizeT = setTimeout(() => { if (S.me && wide()) redraw(); }, 250); });
// Keys, as a computer's apps have them: 1, 2 and 3 for the tabs, U to upload, ← and → through the days on Today, ↑ and
// ↓ (or J and K) through the activities beside the one that's open, and ⌘K or / to find one
addEventListener("keydown", (e) => {
  if (e.defaultPrevented || sheetEl.open || !S.me || document.body.classList.contains("out")) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) { if (e.key === "Escape") e.target.blur(); return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if ((e.metaKey || e.ctrlKey) && k === "k") { e.preventDefault(); return findAct(); }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (k === "1" || k === "2" || k === "3") return go(TABS[Number(k) - 1][0]);
  if (k === "u") return openSheet(uploadFilesView);
  if (k === "/") { e.preventDefault(); return findAct(); }
  if (S.tab === "today" && (k === "ArrowLeft" || k === "ArrowRight")) { e.preventDefault(); return stepDay(k === "ArrowLeft" ? -1 : 1); }
  if (S.tab === "activities" && wide() && (k === "ArrowUp" || k === "ArrowDown" || k === "j" || k === "k")) { e.preventDefault(); return stepAct(k === "ArrowUp" || k === "k" ? -1 : 1); }
});
function findAct() {
  if (!wide()) return;
  if (S.tab !== "activities") go("activities");
  requestAnimationFrame(() => document.getElementById("act-find")?.focus());
}
// A change shown as iOS shows it: what moves glides to where it goes, the rest dissolving (View Transitions, where the
// browser has them, and not with Reduce Motion: else simply done)
const canMorph = () => !!document.startViewTransition && !still.matches;
function morph(kind, fn) {
  if (!canMorph()) return fn();
  document.documentElement.dataset.vt = kind;
  const t = document.startViewTransition(fn);
  t.finished.finally(() => { if (document.documentElement.dataset.vt === kind) delete document.documentElement.dataset.vt; });
}
function go(tab) {
  if (tab === S.tab) {
    // (Today, tapped again while looking at another day: back to today)
    if (tab === "today" && (S.dayAt != null || S.agenda)) { S.dayAt = null; S.agenda = false; render(true); }
    return scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" });
  }
  S.tab = tab; S.actShow = 0;
  tabsEl.classList.remove("moving"); void tabsEl.offsetWidth; tabsEl.classList.add("moving");
  drawTabs();
  render(true);
  scrollTo(0, 0);
  try { history.replaceState(null, "", "#" + tab); } catch (_) {}
}
function render(fresh = false) {
  const views = { today: todayView, plan: planView, activities: activitiesView, progress: progressView };
  const screen = h("div.screen.t-" + S.tab + (fresh ? ".in" : ""), {}, views[S.tab]());
  main.replaceChildren(screen);
  main.removeAttribute("aria-busy");
  requestAnimationFrame(() => IFL.settle(window));
  document.title = { today: "Fitness", plan: "Plan · Fitness", workouts: "Workouts · Fitness", activities: "Activities · Fitness" }[S.tab];
}
// drawn again in place (what changed behind the scenes), keeping where you'd scrolled to; a sheet that's up stays as it
// is unless it's asked for too (what's in it is drawn afresh, charts and all)
function redraw(sheetToo = false) {
  // (not while a session's being dragged to another day: the drag would end; drawn once it's dropped, today.js)
  if (document.body.classList.contains("day-drag")) { redraw.later = true; return; }
  const y = scrollY; render(false); scrollTo(0, y); if (sheetToo && sheetEl.open && Sheet.redraw) Sheet.redraw(); }
// (InFlite's header, the same in every app: your photo, the screen's name with its line under it, its buttons in one
// capsule; compact as it's scrolled)
function head(title, sub, ...right) {
  const hd = IFL.header({ title, me: meFace(), onMe: youMenu, cls: "fhead" });
  hd.querySelector(".ifh-line").textContent = sub || "";
  const acts = hd.querySelector(".ifh-acts");
  for (const b of right.filter(Boolean)) { b.classList.add("ifh-act"); acts.append(b); }
  return hd;
}
const meFace = () => { const f = face(); return typeof f === "string" ? document.createTextNode(f) : f; };
// ---- you, your apps and Fitness's own few: InFlite's menu, the same in every app, from your photo at the top left ----
// (Fitness's version: up by 0.01 with each change to it that goes out)
const BUILD = "1.09";
function youMenu(at) {
  IFL.menu(at, {
    app: "fitness", build: BUILD,
    me: { name: S.me?.name || "You", line: S.me?.handle ? `@${S.me.handle}` : "", photo: h("span.round.me", {}, face()) },
    rows: [
      rhythmOn() && { icon: "clock", color: "orange", label: "Morning Reminder", value: morningOf() ? clockOf(morningOf().at) : "Off", open: () => { morningView.at = null; openSheet(morningView); } },
      { icon: "ruler", color: "blue", label: "Distances", value: U.metric ? "km" : "miles", open: () => openAccount("fitness") },
      // (where your rides come from: the first that's on, and how many more; set up on the account's page)
      { icon: "watch", color: "teal", label: "Devices", value: devicesSaid(), open: () => openAccount("fitness") },
      { icon: "upload", color: "indigo", label: "Upload Files", open: () => openSheet(uploadFilesView) },
      "-",
      { icon: "sliders", color: "grey", label: "Settings", open: () => openSheet(settingsView) },
    ].filter(Boolean),
    account: openAccount, signOut: () => signOutHere(), update: newer ? afresh : null,
  });
}
const devicesSaid = () => { const on = [S.garmin?.on && "Garmin", S.strava?.on && "Strava", S.health?.on && "Apple Health"].filter(Boolean); return on.length ? on[0] + (on.length > 1 ? ` +${on.length - 1}` : "") : "None"; };
// you, as the account has you: your photo, or your initial
const face = () => (S.me?.photoAt ? h("img", { src: A.photoUrl(S.me.photoAt), alt: "", width: 44, height: 44 }) : (S.me?.name || "Y").trim().slice(0, 1).toUpperCase());
const section = (title, ...kids) => h("section.section", {}, title && h("h3", {}, title), ...kids);
const card = (cls, title, ...kids) => h("div.card.glass" + (cls ? "." + cls : ""), {}, title && h("h3", {}, ...[].concat(title)), ...kids);
function row({ icon: ic, tint, tile, title, sub, value, onclick, chev = true, cls = "", extra = null, href = null }) {
  const tag = href ? "a.row" : onclick ? "button.row" : "div.row";
  return h(tag + (cls ? "." + cls : ""), { type: onclick && !href ? "button" : null, onclick, href, target: href ? "_blank" : null, rel: href ? "noopener" : null },
    tile || (ic && h("span.ic." + (tint || "grey"), {}, icon(ic, 18, 2.1))),
    h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })),
    extra, value != null && h("span.val", {}, ...[].concat(value)), (onclick || href) && chev && h("span.chev", {}, icon(href ? "open" : "chev", 17, 2.4)));
}
const sportTile = (sport, small = false) => h("span.tile.s-" + sport + (small ? ".small" : ""), {}, sportIcon(sport, small ? 17 : 20));
const stat = (label, v, unit) => h("div.stat", {}, h("small", { text: label }), h("b", {}, v ?? "–", unit && v != null ? h("u", { text: unit }) : null));
const wait = (hgt) => h("div.wait", { vars: { "min-height": hgt + "px" } });
// how wide a chart is drawn, in a card on the page or in a sheet (so its labels come out at their own size); on a
// computer, in a card that's a part of the page's width (by default, Today's first column, beside its 360px one)
const cardW = (hero = false, part = null) => (wide() ? (part != null ? partW(part) : mainW() - 380) : innerWidth >= 1000 ? 500 : Math.min(innerWidth, 680) - 32) - (hero ? 40 : 36);
const sheetW = () => Math.round(Math.min(innerWidth - 16, 600) - 32 - 36);

// ---- the map under a route (map.js): the points along it (a few thousand at most), each its stretch's colour ----
const lightNow = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "light" : !matchMedia("(prefers-color-scheme: dark)").matches);
function routeOf(s, zoneAt) {
  const idx = []; for (let i = 0; i < s.t.length; i++) if (s.lat[i] != null && s.lon[i] != null) idx.push(i);
  const step = Math.max(1, Math.ceil(idx.length / 3000)), use = idx.filter((_, j) => j % step === 0 || j === idx.length - 1);
  const css = getComputedStyle(document.documentElement), col = {};
  const colourOf = (z) => (col[z] ??= css.getPropertyValue("--" + z).trim() || "#0a84ff");
  return { coords: use.map((i) => [s.lon[i], s.lat[i]]), colours: zoneAt ? use.map((i) => colourOf(zoneAt(i))) : null };
}
// the map's credits, as Weather has them: a © in the corner, that opens out into them when tapped (and folds again)
function mapCredit() {
  const b = h("button.map-credit.folded", { type: "button", "aria-label": "Map data © OpenStreetMap, OpenFreeMap", "aria-expanded": "false",
    onclick: (e) => { e.stopPropagation(); const open = b.classList.toggle("folded"); b.setAttribute("aria-expanded", String(!open)); } },
  h("span.mc-c", { "aria-hidden": "true", text: "©" }), h("span.mc-t", { "aria-hidden": "true", text: " OpenStreetMap, OpenFreeMap" }));
  b.addEventListener("keydown", (e) => e.stopPropagation());
  return b;
}
// Maps (OpenFreeMap's tiles, fetched by the phone: it sees where they're shown): by default only when you tap for one,
// each route otherwise Fitness's own drawing, which asks nothing of anyone; or always, chosen in You. (This phone's.)
const mapsAlways = () => S.maps === "always";
// the route's map, the whole sheet, to move and zoom
function bigMapView(name, route) {
  const holder = h("div.map-gl.big", {}, mapCredit());
  setTimeout(() => M.routeMap(holder, { ...route, light: lightNow(), explore: true }).catch(() => {}), 350);
  return { title: name, body: [holder] };
}

// ---- you, and settings ----
function settingsView() {
  const p = P(), wkg = (p.ftp / p.weight).toFixed(2);
  return {
    title: "Settings",
    body: [
      // (opening on the app, as every app's Settings does)
      h("div.ifs-hero", {}, h("img", { src: "icon.svg", alt: "", width: 64, height: 64 }), h("b", { text: "Fitness" }), h("span", { text: "Training, using AI" })),
      // (your account's card: its page, opened signed in as you, for your photo, name and the rest)
      h("button.card.glass.acct", { type: "button", onclick: openAccount, "aria-label": "Your account" },
        h("div.wx", {}, h("div.round.me", { "aria-hidden": "true" }, face()), h("div", {}, h("b", { text: S.me?.name || "You" }), h("span", { text: `@${S.me?.handle}` })),
          h("span.chev", {}, icon("chev", 17, 2.4)))),
      section("Your numbers", h("div.group", {},
        row({ icon: "bolt", tint: "coral", title: "FTP", value: [`${p.ftp} W`, h("small", { text: `${wkg} W/kg` })], onclick: () => pushSheet(numbersView) }),
        row({ icon: "scale", tint: "indigo", title: "Weight", value: weight(p.weight), onclick: () => pushSheet(numbersView) }),
        row({ icon: "heart", tint: "red", title: "Heart rate", value: [`${p.lthr} bpm`, h("small", { text: `${p.maxHr} max` })], onclick: () => pushSheet(numbersView) }),
        row({ icon: "run", tint: "green", title: "Threshold pace", value: pace(paceOf(p.runPace)), onclick: () => pushSheet(numbersView) }),
        row({ icon: "swim", tint: "teal", title: "Swim (CSS)", value: pace(p.css, "/100 m"), onclick: () => pushSheet(numbersView) })),
        h("p.foot", { text: "Every zone, target and training stress follows these." })),
      section("Power zones", h("div.group", {}, ZONES.map((z, i) => h("div.row.plain", {}, h("span.zone-chip.bg-" + z.c, { text: `Z${z.n}` }), h("span.tx", {}, h("b", { text: z.name })),
        h("span.val", { text: `${i ? Math.round(ZONES[i - 1].top * p.ftp) : 0}${z.top < 9 ? `–${Math.round(z.top * p.ftp) - 1}` : "+"} W` }))))),
      section("Preferences", h("div.group", {},
        rhythmOn() && row({ icon: "today", tint: "amber", title: "Morning reminder", value: morningOf() ? clockOf(morningOf().at) : "Off", onclick: () => { morningView.at = null; pushSheet(morningView); } }),
        // (where your rides come from, the devices, maps, units, the morning check-in and exporting everything: your
        // account's, on its page, for every device; Fitness looks as that page does)
        row({ icon: "sliders", tint: "indigo", title: "Fitness settings", sub: `${U.metric ? "Kilometres" : "Miles"} · Garmin, Strava, Apple Health, devices and maps`, onclick: () => openAccount("fitness") }))),
      section("Your data", h("div.group", {},
        row({ icon: "inbox", tint: "blue", title: "Upload files", sub: "FIT, GPX or TCX, or a zip of them", onclick: () => pushSheet(uploadFilesView) }))),
      section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: signOutHere }, "Sign Out"))),
    ],
  };
}
// Your account's page, opened signed in as you (a code good once, for a minute), with the way back here
async function openAccount(open) {
  const page = A.accountPage();
  if (!page) return toast("Your account is at account.inflite.ai");
  try { const { code } = await A.accountLink(); location.assign(`${page}#${new URLSearchParams({ handoff: code, from: "fitness", ...(typeof open === "string" ? { open } : {}) })}`); }
  catch (e) { if (e.status === 401) return signedOutHere(); toast(e.message, true); }
}
// (a number's note: worked out from your rides, or a starting guess, until you set it yourself)
function numberSaid(k) {
  if (isSet(k)) return null;
  const e = estimates();
  if (k === "ftp") return e.ftp ? `Estimated from ${plural(e.rides, "ride")}` : "A starting guess";
  if (k === "maxHr" || k === "lthr") return e.maxHr ? "From your rides" : "A starting guess";
  return "A starting guess";
}
// a number, a step at a time: set by you from then on
function stepper(label, key, show, by, lo, hi, after) {
  const change = (d) => { setNumber(key, Math.max(lo, Math.min(hi, Math.round((P()[key] + d) * 10) / 10))); Sheet.redraw(); clearTimeout(stepper.t); stepper.t = setTimeout(() => { resum(); redraw(); after?.(); }, 600); };
  const said = numberSaid(key);
  return h("div.row.plain", {}, h("span.tx", {}, h("b", { text: label }), said && h("small.est", { text: said })),
    h("span.stepper", { role: "group", "aria-label": label },
      h("button", { type: "button", "aria-label": `Less ${label}`, onclick: () => change(-by) }, icon("minus", 16, 2.4)),
      h("output", { text: show(P()[key]) }),
      h("button", { type: "button", "aria-label": `More ${label}`, onclick: () => change(by) }, icon("plus", 16, 2.4))));
}
function numbersView() {
  const p = P(), field = (label, key, show, by, lo, hi) => stepper(label, key, show, by, lo, hi);
  // (your best 20 minutes of the last six weeks, offered only as a rise on an FTP you set: easy weeks never talk it down)
  const since = addDays(TODAY, -42), best20 = Math.max(0, ...S.acts.filter((a) => a.start >= since).map((a) => sumOf(a)?.curve?.[1200] || 0)), est = Math.round(best20 * 0.95);
  return {
    title: "Your numbers",
    body: [
      h("div.group", {}, field("FTP", "ftp", (v) => `${v} W`, 5, 80, 500), field("Weight", "weight", (v) => weight(v), 0.5, 35, 150),
        field("Threshold heart rate", "lthr", (v) => `${v} bpm`, 1, 100, 210), field("Max heart rate", "maxHr", (v) => `${v} bpm`, 1, 120, 230),
        field("Threshold pace", "runPace", (v) => pace(paceOf(v)), 5, 150, 600), field("CSS", "css", (v) => pace(v, "/100 m"), 1, 50, 240)),
      isSet("ftp") && est >= p.ftp + 5 && card(null, "From your rides", h("p.line-said", { text: `Your best 20 minutes in the last six weeks: ${best20} W, an FTP of about ${est} W.` }),
        h("button.pill.small.primary", { type: "button", onclick: () => { setNumber("ftp", est); Sheet.redraw(); resum(); redraw(); toast(`FTP raised to ${est} W`); } }, `Raise FTP to ${est} W`)),
      h("p", { text: isSet("ftp") ? "FTP is the power you could hold for about an hour. Ride harder than it says for 20 minutes and Fitness will offer a rise; it never talks it down. Think it’s too high? A 20-minute test will tell you." : "FTP is the power you could hold for about an hour. Until you set it, Fitness works it out from your hardest rides, and it rises by itself when you ride harder." }),
    ],
  };
}
// The look, as the account has it (its page's Appearance, for every app on the site): Automatic, Light or Dark, kept on
// this phone too, so theme.js has it for the first frame next time
function lookOf(v) {
  v = v === "light" || v === "dark" ? v : "auto";
  if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  try { localStorage.setItem("fitness:appearance", v); } catch (_) {}
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", v === "dark" ? "#24224f" : v === "light" ? "#f8e2da" : m.media.includes("dark") ? "#24224f" : "#f8e2da");
}
function appearanceView() {
  const now = store.get("appearance", "auto"), set = (v) => {
    store.set("appearance", v);
    if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { localStorage.setItem("fitness:appearance", v); } catch (_) {}
    Sheet.redraw();
  };
  return { title: "Appearance", body: [h("div.group", {}, [["auto", "Automatic", "As your device is set"], ["light", "Light", "Dawn"], ["dark", "Dark", "Night"]].map(([v, l, sub]) =>
    row({ title: l, sub, chev: false, onclick: () => set(v), extra: now === v ? h("span.get", {}, icon("check", 18, 2.6)) : null })))] };
}

// the example rides on or off (and with them, the example plan, where you haven't chosen one)
function setExamples(on) {
  S.examples = on; keep("prefs"); setActs(); if (on) sumUp();
  if (!on && S.tab === "today") scrollTo(0, 0);
  toast(on ? "Example rides on" : "Only your rides now");
  redraw();
}

// ---- files ----
// Inside claude.ai's viewer, a page can't start a download itself: it offers the file through the viewer's own save,
// which takes only some kinds of file, so a FIT (or any) file goes in a zip. Anywhere else, the browser's own download.
const inViewer = () => typeof window.claude?.use === "function";
// A picture to share (share.js): drawn, shown, then handed to the phone's share sheet (Messages, Instagram, Photos),
// or saved where there's none. Drawn first and shared on its own tap, as a phone shares only on a tap.
// → a sheet's view (pushSheet, openSheet)
function shareView(make, { name, title }) {
  const can = (() => { try { return !!navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] }); } catch (_) { return false; } })();
  let blob = null;
  const img = h("img.share-img", { alt: title }), said = h("p.foot.share-said", { text: "Drawing it…" });
  const go = h("button.btn", { type: "button", disabled: true, onclick: async () => {
    if (!blob) return;
    const file = new File([blob], name, { type: "image/png" });
    if (can) { try { await navigator.share({ files: [file], title }); } catch (e) { if (e?.name !== "AbortError") toast("That couldn’t be shared", true); } }
    else saveFile(name, new Uint8Array(await blob.arrayBuffer()));
  } }, icon("upload", 18, 2.2), can ? "Share" : "Save the picture");
  make().then((b) => { blob = b; img.src = URL.createObjectURL(b); img.classList.add("in"); go.disabled = false; said.textContent = can ? "To Messages, Instagram, Photos or anywhere else." : "Saved as a picture, to share from there."; })
    .catch((e) => { said.textContent = e.message || "The picture couldn’t be made."; });
  return () => ({ title: "Share", body: [h("div.share-frame", {}, img), go, said] });
}
async function saveFile(name, data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (inViewer()) {
    let dl = null;
    try { dl = await window.claude.use("downloads"); } catch (_) {}
    if (!dl) return toast("Saving files isn’t available in this preview", true);
    const zipped = name.endsWith(".zip") ? bytes : F.zip([{ name, data: bytes }]);
    try { await dl.save({ filename: name.endsWith(".zip") ? name : name.replace(/\.[^.]+$/, "") + ".zip", data: zipped }); toast(`Saved ${name}`); }
    catch (e) { if (e?.code !== "declined") toast("That file couldn’t be saved here", true); }
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`Saved ${name}`);
}
function weekZip(wk) {
  const files = [];
  for (const d of wk.days) {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id && id !== "event" ? wkById(id) : null;
    if (w && w.sport !== "strength") files.push({ name: F.fileName(`${new Date(d.date).toISOString().slice(0, 10)} ${w.name}`, "fit"), data: F.fitFromWorkout(w, { pace: paceFor(w.sport) }) });
  }
  saveFile(F.fileName(`Fitness week ${wk.week}`, "zip"), F.zip(files));
}
// a week or two as calendar events (iCalendar), each workout at 7:00 for its length, its steps in the notes
function calendar(wks) {
  const z = (n) => String(n).padStart(2, "0"), stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(d.getHours())}${z(d.getMinutes())}00`; };
  const fold = (s) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ev = [];
  for (const wk of wks) for (const d of wk.days) {
    const id = S.swaps[d.date] !== undefined ? S.swaps[d.date] : d.id, w = id && id !== "event" ? wkById(id) : null;
    if (!w) continue;
    const m = measure(w, paceFor(w.sport)), start = d.date + 7 * 3600e3;
    const notes = `${w.about}\n\n` + flatten(w, paceFor(w.sport)).map((s) => `${stepLen(s)} ${s.name || s.kind}${w.sport === "ride" && s.kind !== "free" ? ` at ${pct(s.from)}${s.to !== s.from ? `–${pct(s.to)}` : ""}` : ""}`).join("\n");
    ev.push(["BEGIN:VEVENT", `UID:${w.id}-${d.date}@fitness.inflite.ai`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + m.secs * 1000)}`,
      `SUMMARY:${fold(`${w.name} (${SPORTS[w.sport].name})`)}`, `DESCRIPTION:${fold(notes)}`, "END:VEVENT"].join("\r\n"));
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//inflite.ai//Fitness//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR", ""].join("\r\n");
  // (iCalendar files aren't among the kinds claude.ai's viewer hands over: there, it goes in a zip like the rest)
  saveFile(F.fileName(`Fitness week ${wks[0].week}`, "ics"), ics);
}
// Importing: chosen, or dropped anywhere on the page
function chooseFiles() { filesEl.value = ""; filesEl.click(); }
filesEl.addEventListener("change", () => { if (filesEl.files.length) importFiles([...filesEl.files]); });
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
addEventListener("dragenter", (e) => { if (!hasFiles(e) || !S.me) return; e.preventDefault(); dragDepth++; dropEl.classList.add("on"); });
addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropEl.classList.remove("on"); } });
addEventListener("drop", (e) => { if (!hasFiles(e) || !S.me) return; e.preventDefault(); dragDepth = 0; dropEl.classList.remove("on"); importFiles([...e.dataTransfer.files]); });
dropEl.append(h("div", {}, icon("inbox", 40, 1.8), h("b", { text: "Drop to import" }), h("span", { text: "Rides and runs as FIT, GPX or TCX (from a Garmin, a Wahoo, Strava…), workouts as FIT, ZWO, ERG or MRC" })));

async function importFiles(files) {
  if (!S.me) return;
  // read first, here: each activity in the files (a zip's, a triathlon's three), and any workouts
  const got = { acts: [], workouts: [], skipped: [], dupes: 0 };
  toast(`Reading ${plural(files.length, "file")}…`, false, 60000);
  for (const f of files) {
    try {
      const r = await readOff(f.name, await f.arrayBuffer());
      for (const a of r.activities) {
        a.parts = r.activities.filter((y) => y.raw?.bytes === a.raw?.bytes).length;
        if (S.own.some((x) => Math.abs(x.start - a.start) < 60e3) || got.acts.some((x) => x.start === a.start)) { got.dupes++; continue; }
        got.acts.push(a);
      }
      if (r.workouts.length) got.skipped.push(`${f.name}: a workout, not an activity. Fitness takes the rides, runs and swims your devices record.`);
      got.skipped.push(...(r.skipped || []));
    } catch (e) { got.skipped.push(`${f.name}: ${e.message}`); }
  }
  toastEl.classList.remove("on");
  got.acts.sort((a, b) => b.start - a.start);
  openSheet(() => uploadView(got), { tall: got.acts.length > 2 });
}
const SPORT_NAMES = [["ride", "Ride"], ["run", "Run"], ["swim", "Swim"], ["walk", "Walk"], ["row", "Row"], ["strength", "Strength"], ["other", "Other"]];
// What's in the files, before it's saved: each activity with what it was (as its file says, or worked out from how it
// went, and a tap to change), then Upload
function uploadView(got) {
  const n = got.acts.length, nw = got.workouts.length;
  if (!n && !nw) return { title: "Upload", body: [h("div.sheet-top", {}, h("h1", { text: "Nothing to upload" }), h("div.sub", { text: got.dupes ? `${plural(got.dupes, "activity is", "activities are")} here already` : "" })),
    got.skipped.length > 0 && section("Not read", h("div.group", {}, got.skipped.map((t) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: t })))))),
    h("button.btn.quiet", { type: "button", onclick: () => { closeSheet(); chooseFiles(); } }, "Choose other files")] };
  const rows = got.acts.map((a) => {
    const sum = a.pre || summarise(a, P()), tile = h("span.tile.s-" + a.sport, {}, sportIcon(a.sport, 20)), name = h("b", { text: a.name });
    // (said only where it matters: a sport worked out, to check; or one you chose)
    const said = h("small.said", { text: "Fitness worked this out: check it" }); said.hidden = !a.guessed;
    const pick = h("select.sport-pick", { "aria-label": `What ${a.name} was`, onchange: () => {
      const was = defaultFor(a), old = a.sport, now = pick.value; a.sport = now; a.guessed = false; delete a.pre;   // (its figures, worked out again for its sport)
      // (named for its sport and time of day, as Fitness names one: its sport's word changed, whatever clock named it)
      const word = (sp) => F.defaultName(sp, a.start, false).replace(/^\S+ /, ""), named = new RegExp(`^(Morning|Afternoon|Evening|Night) ${word(old)}$`).exec(a.name);
      if (a.name === was || named) { a.name = named ? `${named[1]} ${word(now)}` : defaultFor(a); name.textContent = a.name; }
      tile.className = "tile s-" + now; tile.replaceChildren(sportIcon(now, 20)); said.textContent = "Chosen by you"; said.hidden = false;
    } }, SPORT_NAMES.map(([v, l]) => h("option", { value: v, selected: a.sport === v, text: l })));
    return h("div.row.up" + (a.guessed ? ".guess" : ""), {}, tile,
      h("span.tx", {}, name, h("small", { text: [`${dayShort(a.start)}, ${timeOf(a.start)}`, sum.dist > 100 ? dist(sum.dist) : null, hm(sum.moving)].filter(Boolean).join(" · ") }), said),
      h("label.pick", {}, pick, icon("chev", 14, 2.6)));
  });
  const go = h("button.btn", { type: "button", onclick: () => upload(got, go) }, icon("upload", 19, 2.2), n ? `Upload ${plural(n, "activity", "activities")}` : `Save ${plural(nw, "workout")}`);
  return { title: "Upload", right: h("button.link.done.r", { type: "button", onclick: closeSheet }, "Cancel"), body: [
    h("div.sheet-top", {}, h("h1", { text: n ? (n === 1 ? "One activity" : `${n} activities`) : plural(nw, "workout") }),
      h("div.sub", { text: n ? "Check what each one was, then upload." : "To your workouts." })),
    n > 0 && h("div.group", {}, rows),
    nw > 0 && section("Workouts", h("div.group", {}, got.workouts.map((w) => h("div.row.plain", {}, h("span.mini", {}, C.profile(w, { mini: true, pace: paceFor(w.sport) })),
      h("span.tx", {}, h("b", { text: w.name }), h("small", { text: `${dur(measure(w, paceFor(w.sport)).secs)} · ${SPORTS[w.sport]?.name || w.sport}` })))))),
    (got.dupes || got.skipped.length) > 0 && section("Left out", h("div.group", {},
      got.dupes > 0 && h("div.row.plain", {}, h("span.tx", {}, h("small", { text: `${plural(got.dupes, "activity is", "activities are")} here already` }))),
      got.skipped.map((t) => h("div.row.plain", {}, h("span.tx", {}, h("small", { text: t })))))),
    go,
  ] };
}
const defaultFor = (a) => F.defaultName(a.sport, a.start, a.indoor);
// What's kept of an activity's file: a FIT file of one activity as it came; a GPX or TCX, or one part of a multisport
// file, written as FIT (every sample kept, in a fraction of the space, and each part on its own, not the whole file
// for each). Gzipped as it's sent (account.js).
function keptFile(a, sum, parts = 1) {
  if (a.raw.type === "fit" && parts <= 1) return { bytes: a.raw.bytes, name: a.raw.name, type: "fit" };
  const stem = String(a.raw.name || "activity").replace(/\.[A-Za-z0-9]{2,4}$/, "");
  return { bytes: F.fitFromActivity(a, sum), name: `${stem}${parts > 1 ? `-${Math.round(a.start / 1000)}` : ""}.fit`, type: "fit" };
}
// The ones kept before that, made smaller: a few at a time, as the app opens, each read from its file and sent again
// (written as FIT, gzipped); the figures stay as they are
async function squash() {
  if (squash.busy || !A.canGzip() || !S.me) return;
  squash.busy = true;
  try {
    const me = S.me.id, todo = S.own.filter((a) => !a.gz && !squash.tried.has(a.id)).slice(0, 25);
    for (const a of todo) {
      if (S.me?.id !== me || document.querySelector(".btn[disabled]")) break;
      squash.tried.add(a.id);
      try {
        let bytes = await idb.get(fileKey(a)).catch(() => null);
        if (!bytes) bytes = await A.fileOf(a.id);
        const r = await readOff(a.file || `activity.${a.type}`, bytes), parts = r.activities;
        const x = parts.find((y) => Math.abs(y.start - a.start) < 2000) || (parts.length === 1 ? parts[0] : null);
        if (!x) continue;
        // (only where it's smaller: the server takes nothing bigger than the file it replaces)
        const k = keptFile(x, a.sum, parts.length), gz = await A.gzip(k.bytes);
        if (a.size && gz.length >= a.size) continue;
        const got = await A.replaceFile(a.id, { type: k.type, file: k.name }, k.name, gz);
        Object.assign(a, { gz: true, type: k.type, file: k.name, size: got.size });
        idb.put(fileKey(a), k.bytes).catch(() => {});
      } catch (e) { if (e.status === 401 || e.offline) break; }
    }
  } finally { squash.busy = false; }
}
squash.tried = new Set();
// Each activity kept with your account (its file as it came, and its figures as worked out here), one at a time, the
// sheet saying how far it's got
async function upload(got, btn) {
  btn.disabled = true;
  const done = [], failed = [];
  for (const [i, a] of got.acts.entries()) {
    btn.lastChild.textContent = got.acts.length > 1 ? `Uploading ${i + 1} of ${got.acts.length}…` : "Uploading…";
    const sum = figuresOf(a), k = keptFile(a, sum, a.parts || 1), meta = { id: `i${a.start}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: k.name, type: k.type, sum };
    try {
      const r = await A.upload(meta, k.name, await A.gzip(k.bytes));
      if (r.already) continue;
    } catch (e) {
      if (e.status === 401) return signedOutHere();
      failed.push(`${a.name}: ${e.message}`); continue;
    }
    const entry = { ...meta, gz: A.canGzip(), sample: false };
    S.own.push(entry); S.sums.set(entry.id, sum); done.push(entry);
    remember(entry.id, Object.assign(a, { id: entry.id }));
    idb.put(fileKey(entry), k.bytes).catch(() => {});
  }
  if (got.workouts.length) { S.mine.unshift(...got.workouts); keep("workouts"); }
  setActs(); estimate();
  if (failed.length) { btn.disabled = false; btn.lastChild.textContent = "Try again"; got.acts = got.acts.filter((a) => failed.some((f) => f.startsWith(a.name + ":"))); toast(failed[0], true, 6000); redraw(); return; }
  await closeSheet();
  if (done.length) { S.tab !== "activities" && go("activities"); S.actSport = "all"; }
  redraw();
  toast([done.length && plural(done.length, "activity", "activities"), got.workouts.length && plural(got.workouts.length, "workout")].filter(Boolean).join(" and ") + " added");
  if (done.length === 1 && !got.workouts.length) openAct(done[0]);
}

// ---- Garmin Connect: your activities, in by themselves (functions/_garmin.js). The server asks Garmin what's new, as
// you open the app and every 15 minutes, and keeps each new one's file waiting; here each is read as an upload is, its
// figures worked out, and kept (a ride you've uploaded already isn't kept twice) ----
function garminNow(g) {
  if (!g?.on) { S.garmin = g || { on: false }; return; }
  S.garmin = g;
  // (all your history part way in: carried on, as you open the app)
  if (g.back && g.ok) { bringIn({ all: true }); return; }
  fromGarmin().then(() => (Date.now() - (S.garmin.last || 0) > 2 * 60e3 ? A.garminFetch().then((n) => { S.garmin = n; return fromGarmin(); }) : null)).catch(() => {});
}
// (where they come from: Garmin's files as Garmin keeps them, zips of FIT; Strava's written as TCX, gzipped, by the
// server, with its name, sport, whether it was indoors and the device, as Strava had them)
const SRC = {
  garmin: { label: "Garmin", prefix: "g", state: () => S.garmin, set: (g) => { S.garmin = g; }, file: (id) => A.garminFile(id), done: (id) => A.garminDone(id), fetch: (all) => A.garminFetch(true, all),
    read: async (w, bytes) => (await readOff(`garmin-${w.id}.zip`, bytes)).activities },
  strava: { label: "Strava", prefix: "s", state: () => S.strava, set: (g) => { S.strava = g; }, file: (id) => A.stravaFile(id), done: (id) => A.stravaDone(id), fetch: () => A.stravaFetch(true),
    read: async (w, bytes) => (await readOff(`strava-${w.id}.tcx`, await A.gunzip(bytes))).activities.map((a) => Object.assign(a, { ...(w.sport && w.sport !== "other" ? { sport: w.sport } : {}), indoor: !!w.indoor || a.indoor, device: w.device || "Strava" })) },
};
const fromGarmin = (o) => fromSource("garmin", o);
async function fromSource(src, { quiet = false } = {}) {
  const c = SRC[src], waiting = c.state()?.waiting || [];
  if (!waiting.length || fromSource[src]) return 0;
  fromSource[src] = true;
  const added = [];
  try {
    for (const w of waiting) {
      let acts;
      try { acts = await c.read(w, await c.file(w.id)); }
      catch (e) { if (e.status === 401) return signedOutHere(true); if (e.offline || e.status >= 500) break; acts = []; }
      let kept = 0;
      for (const [k, a] of acts.entries()) {
        // (one you have already: the same ride, uploaded, or from the other)
        if (S.own.some((x) => Math.abs(x.start - a.start) < 60e3)) continue;
        if (w.name && acts.length === 1) a.name = w.name;
        const sum = figuresOf(a), f = keptFile(a, sum, acts.length), meta = { id: k ? `${c.prefix}${w.id}-${k + 1}` : `${c.prefix}${w.id}`, start: a.start, sport: a.sport, indoor: a.indoor, name: a.name, device: a.device, file: f.name, type: f.type, sum };
        try { await A.upload(meta, f.name, await A.gzip(f.bytes)); } catch (e) { if (e.status === 401) return signedOutHere(true); kept = -1; break; }
        const entry = { ...meta, gz: A.canGzip(), sample: false };
        S.own.push(entry); S.sums.set(entry.id, sum); added.push(entry); kept++;
        remember(entry.id, Object.assign(a, { id: entry.id }));
        idb.put(fileKey(entry), f.bytes).catch(() => {});
      }
      if (kept < 0) break;
      // (nothing in it to keep: one you have already, or one with nothing Fitness can read)
      if (!kept) await c.done(w.id).catch(() => {});
      c.state().waiting = c.state().waiting.filter((x) => x.id !== w.id);
    }
  } finally { fromSource[src] = false; }
  if (added.length) { setActs(); estimate(); redraw(); if (!quiet) toast(added.length === 1 ? `${added[0].name}, from ${c.label}` : `${plural(added.length, "activity", "activities")} from ${c.label}`); }
  return added.length;
}
const R_ALL = Date.UTC(2000, 0, 2);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dayShort(t); };
function garminSaid() {
  const g = S.garmin;
  if (!g?.on) return "Bring your activities in by themselves";
  if (!g.ok) return "Your key has stopped working: add a new one";
  return g.last ? `Connected · checked ${ago(g.last)}` : "Connected";
}
// Garmin's six months, a batch at a time, each read and kept as it comes (Activities shows them coming in); then your
// numbers worked out from them
// (all: your whole history, a batch at a time while there's more, Activities saying how far back it's got)
// (src: Garmin's, or Strava's, as SRC has them)
async function bringIn({ all = false, src = "garmin" } = {}) {
  const c = SRC[src];
  if (bringIn.busy) return 0;
  bringIn.busy = true;
  S.bringing = { n: 0, all, src, at: c.state()?.backAt || null }; redraw();
  const more = async () => { const k = await fromSource(src, { quiet: true }); S.bringing.n += k; S.bringing.at = c.state()?.backAt || S.bringing.at; redraw(); return k; };
  let n = 0;
  try {
    // (Strava's asked first: nothing's fetched as it's connected, as Garmin's is)
    if (src === "strava" && !all) { try { c.set(await c.fetch(all)); } catch (_) {} }
    n = await more();
    for (let i = 0; i < (all ? 400 : 16) && (c.state().more || (all && c.state().back)); i++) { try { c.set(await c.fetch(all)); } catch (_) { break; } n += await more(); }
  } finally { bringIn.busy = false; }
  S.bringing = null; redraw(); estimate();
  toast(all ? (n ? `${plural(n, "activity", "activities")} from your ${c.label} history` : `Your ${c.label} history is all here`) : n ? `Connected: ${plural(n, "activity", "activities")} from the last six months` : `Connected to ${src === "garmin" ? "Garmin Connect" : "Strava"}`);
  return n;
}
// ---- the first use: a welcome, the whole screen, over the sky (once for an account, on whichever phone) ----
// welcome → your rides → your week (and how much you've been riding, where there's little to go by) → what you're
// riding for → your mornings → your first week, then Today. Every step but the week and the goal can be skipped; where
// it's got to's kept on this phone, so it opens there again (and back from Strava's page, on your week, the rides coming).
const ONB = "onb";
function onboarding(at = null) {
  const V = rhythmSetup({ onboard: { extras, done: finish, coming } });
  const mark = (k) => store.set(ONB, k);
  const first = (S.me?.name || "").trim().split(/\s+/)[0];
  function finish() {
    S.onboarded = true; keep("prefs"); store.set(ONB, null); store.set("welcomed", true);
    closeSheet(); if (S.tab !== "today") go("today"); else redraw();
    toast(S.own.length ? "Your plan’s ready" : "Your plan’s ready: it learns from every ride you add");
    if (onboarding.upload) { onboarding.upload = false; setTimeout(() => { go("activities"); chooseFiles(); }, 700); }
  }
  // (skipped from the welcome: Rhythm's own week, to change any time)
  const skip = () => { if (!S.rhythm) { S.rhythm = { ...R.DEFAULTS, days: [...R.DEFAULTS.days], start: mondayOf(TODAY), at: TODAY }; keep("rhythm"); } finish(); };
  const skipTo = (view, k) => h("button.link.r", { type: "button", onclick: () => { if (k) mark(k); pushSheet(view); } }, "Skip");
  const point = (ic, tint, title, sub) => h("li", {}, h("span.ic." + tint, {}, icon(ic, 16, 2.2)), h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })));
  const welcome = () => ({ title: "", right: h("button.link.r", { type: "button", onclick: skip }, "Skip"), body: [
    h("div.onb-hero", {}, h("span.onb-logo", { "aria-hidden": "true" }, icon("ride", 28, 2.2)), h("h1.onb-title", { text: first ? `Hi ${first}. Training that fits your week.` : "Training that fits your week." })),
    svgOf('<svg viewBox="0 0 300 110" preserveAspectRatio="none" class="onb-course" aria-hidden="true"><path class="road" d="M-10 92 C 40 92, 62 36, 112 46 S 176 104, 220 70 S 268 18, 310 26"/><path class="ridden" d="M-10 92 C 40 92, 62 36, 112 46 S 176 104, 220 70 S 268 18, 310 26"/></svg>'),
    h("ul.onb-points", {}, point("plan", "blue", "A plan around your days", "Your sessions set to the time you have."), point("wave", "indigo", "It adapts as you go", "To what you ride, how you slept and how you feel."),
      point("download", "coral", "Straight to your bike computer", "Every workout ready for Garmin, Wahoo or Zwift.")),
    h("button.btn.rh-next", { type: "button", onclick: () => { mark("rides"); pushSheet(rides); } }, "Get started")] });
  const choice = (cls, tile, title, sub, onclick, tag) => h("button.onb-choice" + cls, { type: "button", onclick }, tile,
    h("span.tx", {}, h("b", {}, title, tag && h("span.onb-tag", { text: tag })), h("small", { text: sub })), h("span.chev", {}, icon("chev", 16, 2.4)));
  const rides = () => ({ title: "", right: skipTo(V.days, "days"), body: [V.dots("rides"),
    h("div.sheet-top", {}, h("h1", { text: "Bring your rides in" }), h("div.sub", { text: "Six months of them tell Fitness how fit you are, so your plan starts in the right place." })),
    h("div.onb-choices", {},
      S.strava?.ready !== false && choice(".best", h("span.ic.brand.strava", {}, icon("wave", 16, 2.2)), "Strava", "Say yes on Strava’s page, and they come in", (e) => { mark("days"); stravaGo(e.currentTarget); }, "Quickest"),
      choice("", h("span.ic.brand.garmin", {}, icon("device", 16, 2)), "Garmin Connect", "Paste a key from Garmin, and your nights come too", () => pushSheet(garminStep)),
      choice("", h("span.ic.coral", {}, icon("upload", 16, 2.2)), "Upload files", "FIT, GPX or TCX, from Wahoo, Zwift or anything: right after this", () => { onboarding.upload = true; mark("days"); pushSheet(V.days); }),
      choice("", h("span.ic.grey", {}, icon("plus", 16, 2.4)), "I’m just starting out", "No rides yet: a question about your riding instead", () => { mark("days"); pushSheet(V.days); })),
    h("p.foot.onb-small", { text: "Fitness only reads. Nothing’s posted anywhere." })] });
  const garminStep = () => {
    const field = h("input.field", { type: "password", id: "garmin-key", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Personal API key", "aria-label": "Your Garmin Personal API key" });
    const btn = h("button.btn.rh-next", { type: "button", onclick: () => connect() }, "Connect");
    const connect = async () => {
      if (!field.value.trim()) return field.focus();
      btn.disabled = true; btn.textContent = "Connecting…";
      try { S.garmin = await A.garminConnect(field.value); field.value = ""; }
      catch (e) { btn.disabled = false; btn.textContent = "Connect"; if (e.status === 401) return signedOutHere(); return toast(e.message, true, 6000); }
      bringIn();   // (coming in meanwhile, as you set your week)
      mark("days"); pushSheet(V.days);
    };
    field.onkeydown = (e) => { if (e.key === "Enter") connect(); };
    return { title: "", body: [V.dots("rides"), h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: "Every ride comes in by itself after this, and your nights with them." })),
      h("div.card.first-garmin", {}, h("ol.first-steps", {}, h("li", { text: "In Garmin Connect: Settings › Personal API Key › Create" }), h("li", { text: "Copy it, and paste it here" })), field),
      btn] };
  };
  // (as you set your week: the rides coming in, counted)
  function coming() {
    if (!S.bringing && !S.garmin?.on && !S.strava?.on) return null;
    const t = h("span"), el = h("div.onb-coming", { role: "status" }, h("i"), t);
    const say = () => { if (el.dataset.drawn && !el.isConnected) return clearInterval(tick); el.dataset.drawn = "1";
      const n = S.bringing?.n || 0, src = S.bringing?.src === "strava" ? "Strava" : "Garmin";
      t.textContent = S.bringing ? (n ? `${plural(n, "activity", "activities")} in from ${src} so far` : `Bringing your rides in from ${src}…`) : `${plural(S.own.length, "activity", "activities")} in`; };
    const tick = setInterval(say, 800); say();
    return el;
  }
  // your mornings: your nights (Apple Watch's; Garmin's come with it), and the morning reminder, each a tap
  function extras() {
    const m = morningOf(), at = m?.at ?? 7 * 60;
    const time = h("input.field.onb-time", { type: "time", value: clockOf(at), "aria-label": "Its time", onchange: async () => { const [hh, mm] = time.value.split(":").map(Number); if (morningOf() && Number.isFinite(hh)) { try { await morningOn(hh * 60 + mm); } catch (e) { toast(e.message, true); } } } });
    const sw = h("button.onb-switch" + (m ? ".on" : ""), { type: "button", role: "switch", "aria-checked": String(!!m), "aria-label": "Morning reminder", onclick: async () => {
      sw.disabled = true;
      try { if (morningOf()) await morningOffHere(); else { const [hh, mm] = time.value.split(":").map(Number); await morningOn(hh * 60 + mm); } } catch (e) { toast(e.message, true); }
      Sheet.redraw(); } });
    return { title: "", right: skipTo(V.preview), body: [V.dots("extras"),
      h("div.sheet-top", {}, h("h1", { text: "Your mornings" }), h("div.sub", { text: "Two extras that make each day’s plan fit you better. Both optional, both easy to add later in You." })),
      S.garmin?.on ? h("div.card.onb-note", {}, h("b", { text: "Your nights: already on" }), h("small", { text: "Your Garmin’s HRV, resting heart rate and sleep come in with your rides, so a poor night eases your day." }))
        : h("div.group", {}, row({ tile: h("span.ic.brand.health", {}, icon("heart", 18, 2.2)), title: "Your nights", sub: S.health?.on ? "On, from your Apple Watch" : "HRV, resting heart rate and sleep from your Apple Watch, so a poor night eases your day", onclick: () => { healthView.key = null; pushSheet(healthView); } })),
      canPush() && h("div.group", {}, h("div.row.plain", {}, h("span.ic.blue", {}, icon("today", 16, 2.2)), h("span.tx", {}, h("b", { text: "Morning reminder" }), h("small", { text: "Today’s session, or a rest day, as a notification" })), sw),
        h("div.row.plain", {}, h("span.tx", {}, h("b", { text: "At" })), time)),
      h("button.btn.rh-next", { type: "button", onclick: () => pushSheet(V.preview) }, "Next")] };
  }
  const stack = at === "days" ? [welcome, rides, V.days] : at === "rides" ? [welcome, rides] : [welcome];
  openSheet(stack[0], { tall: true, full: true });
  if (stack.length > 1) { Sheet.stack.push(...stack.slice(1)); drawSheet(); }
}
function garminView() {
  const g = S.garmin, field = h("input.field", { type: "password", id: "garmin-key", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Personal API key", "aria-label": "Your Garmin Personal API key" });
  const add = async (btn) => {
    if (!field.value.trim()) return field.focus();
    btn.disabled = true; btn.textContent = "Connecting…";
    try { S.garmin = await A.garminConnect(field.value); field.value = ""; }
    catch (e) { btn.disabled = false; btn.textContent = g?.on ? "Add the new key" : "Connect"; if (e.status === 401) return signedOutHere(); return toast(e.message, true, 6000); }
    // (six months of them, coming in on Activities)
    await closeSheet(); go("activities");
    bringIn();
  };
  const keyForm = (label) => { const btn = h("button.btn", { type: "button", onclick: () => add(btn) }, label); field.addEventListener("keydown", (e) => { if (e.key === "Enter") add(btn); }); return [field, btn]; };
  if (!g?.on) return { title: "Garmin Connect", body: [
    h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: "Your rides, runs and swims, in Fitness by themselves." })),
    section("How", h("div.group", {},
      h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: "1" })), h("span.tx", {}, h("b", { text: "Make a key in Garmin Connect" }), h("small", { text: "Settings, then Personal API Key, then Create" }))),
      h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: "2" })), h("span.tx", {}, h("b", { text: "Copy it, and paste it here" }), h("small", { text: "Garmin shows it only once" }))))),
    h("div.garmin-key", {}, ...keyForm("Connect")),
    section(null, h("p.foot", { text: "The key is kept locked with your account and never shown again. Garmin’s personal keys only read: Fitness brings in your activities from the last six months, then each new one. Workouts still go to your device by Download." })),
    leaving("garmin", false),
  ] };

  const check = async (btn) => {
    btn.disabled = true; btn.textContent = "Checking…";
    try { S.garmin = await A.garminFetch(true); } catch (e) { btn.disabled = false; btn.textContent = "Check now"; return toast(e.message, true); }
    const n = await fromGarmin({ quiet: true });
    Sheet.redraw(); toast(n ? `${plural(n, "activity", "activities")} from Garmin` : S.garmin.ok ? "Nothing new" : garminSaid(), !S.garmin.ok);
  };
  const checkBtn = h("button.btn.quiet", { type: "button", onclick: () => check(checkBtn) }, "Check now");
  // (all your history: asked for, then brought in on Activities, a batch at a time)
  const all = async (btn) => {
    btn.disabled = true; btn.textContent = "Starting…";
    try { S.garmin = await A.garminAll(); } catch (e) { btn.disabled = false; btn.textContent = "Bring in all your rides"; if (e.status === 401) return signedOutHere(); return toast(e.message, true); }
    await closeSheet(); go("activities");
    bringIn({ all: true });
  };
  const allBtn = h("button.btn", { type: "button", onclick: () => all(allBtn) }, g.back ? "Carry on bringing them in" : "Bring in all your rides");
  const backTo = g.back && g.backAt > R_ALL ? new Date(g.backAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null;
  return { title: "Garmin Connect", body: [
    h("div.sheet-top", {}, h("h1", { text: "Garmin Connect" }), h("div.sub", { text: g.ok ? (g.said === "unreachable" ? "Connected, but Garmin didn’t answer last time" : g.said === "full" ? "Connected, but your activities have used all the space there is (2 GB)" : "Connected") : "Your key has expired, or was deleted" })),
    h("div.group", {},
      row({ icon: "today", tint: "blue", title: "Last checked", value: g.last ? ago(g.last) : "Not yet", chev: false }),
      row({ icon: "calendar", tint: "green", title: "Connected", value: dayShort(g.since), chev: false })),
    !g.ok && section("A new key", h("div.garmin-key", {}, ...keyForm("Add the new key"))),
    g.ok && checkBtn,
    section(null, h("p.foot", { text: "Fitness looks for new activities every 15 minutes, and as you open it: a ride shows up a minute or two after your watch syncs with Garmin Connect." })),
    g.ok && section("All your rides", bringIn.busy ? h("p.foot", { text: "Coming in now: Activities shows how far back it’s got." }) : allBtn,
      h("p.foot", { text: g.back ? `Part way${backTo ? `: up to ${backTo}` : ""}. It carries on by itself every 15 minutes; this brings the rest in now.` : "Everything on Garmin Connect, not just the last six months: oldest first, skipping what’s here already. Carries on by itself if you close Fitness." })),
    leaving("garmin", true),
  ] };
}

// ---- Apple Health, by a Shortcut (functions/_health.js): Health stays on the phone, so a personal automation in
// Shortcuts sends last night's HRV, resting heart rate and sleep here each morning, with a key of your own. Rhythm reads
// them as it reads Garmin's (rhythm.js nightOf). The key's in the address the Shortcut sends to, so that's all there is
// to copy; shown once, as it's made, with the five steps to make the Shortcut; made again, the old one stops working ----
const healthUrl = (key) => `${location.origin}/api/fitness/health/${key}`;
// Every device your files came from, most used first: a folder of them, a tap from You
function devicesView() {
  const n = new Map();
  for (const a of S.acts) if (a.device) n.set(a.device, (n.get(a.device) || 0) + 1);
  const list = [...n].sort((x, y) => y[1] - x[1]);
  return { title: "Devices", body: [
    h("div.sheet-top", {}, h("h1", { text: "Devices" }), h("div.sub", { text: "What your activities were recorded on, from their files" })),
    h("div.group", {}, list.map(([d, k]) => row({ icon: /KICKR/i.test(d) ? "trainer" : "device", tint: /Wahoo/i.test(d) ? "blue" : "grey", title: d, sub: `Seen in ${plural(k, "file")}`, chev: false }))),
  ] };
}
// ---- Strava (functions/_strava.js): connected on Strava's own page, then as Garmin's, each new activity coming in by
// itself (Strava says when there's one); its files written for Fitness from Strava's figures ----
// Disconnecting (connected), or clearing up after (not): a second tap to be sure; and the choice to remove what it
// brought in too (activities that aren't yours, say: another's Garmin or Strava, connected here by mistake)
function leaving(src, on) {
  const c = SRC[src], re = new RegExp(`^${c.prefix}\\d`), n = S.own.filter((a) => re.test(a.id)).length;
  if (!on && !n) return null;
  const sure = h("div.group", { hidden: true });
  const go = async (b, acts) => {
    b.disabled = true;
    let r;
    try { r = await (src === "garmin" ? A.garminDisconnect(acts) : A.stravaDisconnect(acts)); } catch (e) { b.disabled = false; return toast(e.message, true); }
    if (on) c.set({ ...r, gone: undefined });
    if (acts) { S.own = S.own.filter((a) => !re.test(a.id)); for (const k of [...S.sums.keys()]) if (re.test(k)) S.sums.delete(k); setActs(); estimate(); }
    sheetBack(); redraw();
    toast([on && `Disconnected from ${c.label}`, acts && `${plural(r.gone || 0, "activity", "activities")} removed`].filter(Boolean).join("; "));
  };
  const keep = on && h("button.row.action", { type: "button", onclick: (e) => go(e.currentTarget, false) }, n ? `Disconnect, and keep its ${plural(n, "activity", "activities")}` : "Disconnect");
  const drop = n && h("button.row.action.danger", { type: "button", onclick: (e) => go(e.currentTarget, true) }, `${on ? "Disconnect, and remove" : "Remove"} ${n === 1 ? "the activity" : `all ${n} activities`} from ${c.label}`);
  sure.append(...[keep, drop].filter(Boolean));
  const first = h("button.row.action.danger", { type: "button", onclick: (e) => { e.currentTarget.closest(".group").hidden = true; sure.hidden = false; } }, on ? "Disconnect" : `Remove what ${c.label} brought in`);
  return section(on ? null : `From ${c.label} before`, h("div.group", {}, first), sure,
    h("p.foot", { text: on ? "New activities stop coming in. You choose whether the ones it brought in stay." : `${plural(n, "activity", "activities")} here came from ${c.label}. If they’re not yours, remove them.` }));
}
function stravaNow(g) {
  S.strava = g || { on: false };
  if (!g?.on) return;
  if (g.back && g.ok) { if (!bringIn.busy) bringIn({ all: true, src: "strava" }); return; }
  fromSource("strava").then(() => (Date.now() - (S.strava.last || 0) > 15 * 60e3 ? A.stravaFetch().then((n) => { S.strava = n; return fromSource("strava"); }) : null)).catch(() => {});
}
function stravaSaid() {
  const g = S.strava;
  if (!g?.on) return "Bring in what you record on Strava";
  if (!g.ok) return "Strava’s stopped letting Fitness in: connect again";
  return `${g.name ? `${g.name} · ` : "Connected · "}${g.last ? `checked ${ago(g.last)}` : "connected"}`;
}
async function stravaGo(btn) {
  btn.disabled = true;
  try { const { url } = await A.stravaConnect(); location.href = url; }
  catch (e) { btn.disabled = false; if (e.status === 401) return signedOutHere(); toast(e.message, true); }
}
function stravaView() {
  const g = S.strava;
  const connectBtn = h("button.btn.strava", { type: "button", onclick: () => stravaGo(connectBtn) }, g?.on ? "Connect with Strava again" : "Connect with Strava");
  if (!g?.on) return { title: "Strava", body: [
    h("div.sheet-top", {}, h("h1", { text: "Strava" }), h("div.sub", { text: "Your rides, runs and swims from Strava, in Fitness by themselves." })),
    section("How", h("div.group", {},
      h("div.row.plain", {}, h("span.ic.strava", {}, h("b", { text: "1" })), h("span.tx", {}, h("b", { text: "Say yes on Strava’s page" }), h("small", { text: "Fitness asks to read your activities, the private ones too" }))),
      h("div.row.plain", {}, h("span.ic.strava", {}, h("b", { text: "2" })), h("span.tx", {}, h("b", { text: "Back here, they come in" }), h("small", { text: "The last six months, then each new one" }))))),
    connectBtn,
    section(null, h("p.foot", { text: "Fitness only reads: it never posts to Strava or changes anything there. Strava has no files to hand over, so each activity’s written for Fitness from its figures, second by second. Disconnect here or on Strava at any time; what’s already in Fitness stays." })),
    leaving("strava", false),
  ] };

  const check = async (btn) => {
    btn.disabled = true; btn.textContent = "Checking…";
    try { S.strava = await A.stravaFetch(true); } catch (e) { btn.disabled = false; btn.textContent = "Check now"; return toast(e.message, true); }
    const n = await fromSource("strava", { quiet: true });
    Sheet.redraw(); toast(n ? `${plural(n, "activity", "activities")} from Strava` : S.strava.ok && !S.strava.said ? "Nothing new" : stravaWhy(), !S.strava.ok);
  };
  const checkBtn = h("button.btn.quiet", { type: "button", onclick: () => check(checkBtn) }, "Check now");
  const all = async (btn) => {
    btn.disabled = true; btn.textContent = "Starting…";
    try { S.strava = await A.stravaAll(); } catch (e) { btn.disabled = false; btn.textContent = "Bring in all your rides"; if (e.status === 401) return signedOutHere(); return toast(e.message, true); }
    await closeSheet(); go("activities");
    bringIn({ all: true, src: "strava" });
  };
  const allBtn = h("button.btn", { type: "button", onclick: () => all(allBtn) }, g.back ? "Carry on bringing them in" : "Bring in all your rides");
  const backTo = g.back && g.backAt ? new Date(g.backAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null;
  return { title: "Strava", body: [
    h("div.sheet-top", {}, h("h1", { text: "Strava" }), h("div.sub", { text: g.ok ? (g.said ? stravaWhy() : g.name ? `Connected as ${g.name}` : "Connected") : "Strava’s stopped letting Fitness in" })),
    h("div.group", {},
      row({ icon: "today", tint: "blue", title: "Last checked", value: g.last ? ago(g.last) : "Not yet", chev: false }),
      row({ icon: "calendar", tint: "green", title: "Connected", value: dayShort(g.since), chev: false })),
    g.ok ? checkBtn : connectBtn,
    section(null, h("p.foot", { text: "Strava tells Fitness as each new activity’s saved, so it shows up a minute or two after it’s on Strava." })),
    g.ok && section("All your rides", bringIn.busy ? h("p.foot", { text: "Coming in now: Activities shows how far back it’s got." }) : allBtn,
      h("p.foot", { text: g.back ? `Part way${backTo ? `: back to ${backTo}` : ""}. It carries on by itself; this brings the rest in now.` : "Everything on Strava, not just the last six months, skipping what’s here already (from Garmin, or uploaded). Carries on by itself if you close Fitness." })),
    leaving("strava", true),
    h("p.foot.powered", { text: "Powered by Strava" }),
  ] };
}
const stravaWhy = () => ({ busy: "Strava’s busy: Fitness will ask again shortly", full: "Your activities have used all the space there is (2 GB)", unreachable: "Strava didn’t answer last time", revoked: "Strava’s stopped letting Fitness in: connect again" })[S.strava?.said] || "Connected";
function healthSaid() {
  const x = S.health;
  if (!x?.on) return "Your nights from your Apple Watch, by a Shortcut";
  if (!x.last) return "Waiting for the Shortcut’s first morning";
  return x.said?.none ? `Last sent ${ago(x.last)}, with nothing Fitness could read` : `Last sent ${ago(x.last)}`;
}
// (what the Shortcut sent, in words)
const nightSaid = (n) => [n.hrv != null && `HRV ${n.hrv} ms`, n.rhr != null && `resting heart rate ${n.rhr}`, n.sleep != null && `${Math.floor(n.sleep / 3600)} h ${Math.round((n.sleep % 3600) / 60)} min asleep`].filter(Boolean).join(", ");
function healthView() {
  const x = S.health, key = healthView.key;
  const copy = (text, what) => h("button.pill.small", { type: "button", onclick: () => navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast("Couldn’t copy: press and hold to select it", true)) }, "Copy");
  const make = async (btn) => {
    btn.disabled = true; btn.textContent = "Making your key…";
    try { const r = await A.healthKey(); healthView.key = r.key; S.health = { ...r, key: undefined }; }
    catch (e) { btn.disabled = false; btn.textContent = "Try again"; if (e.status === 401) return signedOutHere(); return toast(e.message, true); }
    Sheet.redraw();
  };
  const step = (n, title, sub) => h("div.row.plain", {}, h("span.ic.blue", {}, h("b", { text: String(n) })), h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })));
  const steps = () => [
    section("Your address", h("div.hk-box", {}, h("code.hk-key", { text: healthUrl(key) }), copy(healthUrl(key), "Address")),
      h("p.foot", { text: "Yours alone, and shown this once: copy it now. It can only send your nights to Fitness, nothing more. Lost it? Make a new one here." })),
    section("Make the Shortcut", h("div.group", {},
      step(1, "Shortcuts, then Automation, then New Automation", "Time of Day, 07:30, Daily, Run Immediately. Then New Blank Automation."),
      step(2, "Find Health Samples: Heart Rate Variability", "Start Date is in the last 12 hours."),
      step(3, "Find Health Samples: Resting Heart Rate", "Start Date is in the last 1 day. If Shortcuts makes it Filter Health Samples, tap the blue Health Samples after Filter and choose Clear: it’s Find again."),
      step(4, "Find Health Samples: Sleep, then Get Details: Duration", "Start Date is in the last 16 hours, Value is not In Bed, Value is not Awake (Clear it to Find, as in step 3). Then Get Details of Health Samples, Duration."),
      step(5, "Get Contents of URL", "Paste your address. Method POST. Request Body JSON."),
      step(6, "Add three fields to the body", "For each, type its name in Key, then tap the value and Select Variable: hrv, step 2’s Health Samples; rhr, step 3’s; sleep, step 4’s Duration. Each value shows as a blue chip, not typed text."))),
    section(null, h("p.foot", { text: "Then tap Run once: Fitness answers with what it got, and this page shows it." })),
  ];
  if (!x?.on && !key) return { title: "Apple Health", body: [
    h("div.sheet-top", {}, h("h1", { text: "Apple Health" }), h("div.sub", { text: "Your nights from your Apple Watch: HRV, resting heart rate and sleep, each morning." })),
    section(null, h("p.line-said", { text: "Apple keeps Health on your iPhone, with no way for a website to ask for it. So a Shortcut sends it: each morning, it finds last night in Health and sends it here, with a key of your own. Rhythm then eases the day when your night says you need it." })),
    (() => { const b = h("button.btn", { type: "button", onclick: () => make(b) }, "Make my key"); return b; })(),
    section(null, h("p.foot", { text: "Only those three numbers are sent, once a morning, and only from your phone. Turning it off forgets the key and every night it sent." })),
  ] };
  const sure = h("p.foot", { text: "The key stops working, and the nights it sent are forgotten." });
  sure.hidden = true;
  const off = async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Turn off Apple Health"; sure.hidden = false; return; }
    try { S.health = await A.healthOff(); healthView.key = null; } catch (e) { return toast(e.message, true); }
    sheetBack(); redraw(); toast("Apple Health off");
  };
  const check = async (btn) => {
    btn.disabled = true; btn.textContent = "Checking…";
    try { S.health = await A.health(); } catch (e) { return toast(e.message, true); } finally { btn.disabled = false; btn.textContent = "Check again"; }
    Sheet.redraw(); redraw();
  };
  const again = h("button.btn.quiet", { type: "button", onclick: () => check(again) }, "Check again");
  const last = x?.said && !x.said.none ? nightSaid(x.said) : null;
  return { title: "Apple Health", body: [
    h("div.sheet-top", {}, h("h1", { text: "Apple Health" }), h("div.sub", { text: x?.last ? (last ? `Last morning: ${last}` : "The Shortcut sent nothing Fitness could read: check step 6") : "Waiting for the Shortcut’s first morning" })),
    x?.on && h("div.group", {},
      row({ icon: "today", tint: "blue", title: "Last sent", value: x.last ? ago(x.last) : "Not yet", chev: false }),
      row({ icon: "calendar", tint: "green", title: "Nights", value: String(x.well?.length || 0), chev: false })),
    key ? steps() : null,
    !key && x?.on && again,
    !key && section(null, h("div.group", {}, h("button.row.action", { type: "button", onclick: (e) => make(e.currentTarget) }, "Make a new key, and see the steps again"))),
    section(null, h("p.foot", { text: "Your Apple Watch measures HRV its own way (SDNN, where Garmin’s is RMSSD), so Rhythm reads it against its own usual range, and never mixes it with Garmin’s. With both, it goes by whichever has more of this month’s nights." })),
    section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: off }, "Turn off")), sure),
  ] };
}

// ---- the morning notification (functions/_fitpush.js): today's session, or a rest day, at the time you chose, on this
// phone. Its words for the next week are written here, from Rhythm, and sent again as things change; the server only
// sends the day's when your time comes ----
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushWhy() {
  if (canPush()) return Notification.permission === "denied" ? "Notifications are blocked for Fitness in this browser’s settings." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone ? "Add Fitness to your Home Screen first (Share, then Add to Home Screen), and turn this on there." : "This browser can’t show notifications.";
}
const morningOf = () => store.get("morning", null);
const clockOf = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function morningDays() {
  const out = {};
  for (let i = 0; i < 8; i++) {
    const d = addDays(TODAY, i), r = rhDay(d);
    if (!r) continue;
    // (Rhythm's reason, where the day's its; one you changed says nothing more)
    const swapped = S.swaps[d] !== undefined, id = swapped ? S.swaps[d] : r.id, w = id ? wkById(id) : null, why = swapped ? "" : r.why || "";
    out[dayStamp(d)] = w ? { title: `Today: ${w.name}`, body: `${dur(measure(w, paceFor(w.sport)).secs)}, ${!swapped && r.hard ? "a hard day" : w.kind.toLowerCase()}. ${why}`.trim() }
      : { title: "Rest day", body: `Rest, and let it sink in. ${why}`.trim() };
  }
  return out;
}
const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function morningSub(make) {
  const reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && make) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes((await A.pushKey()).key) });
  return sub;
}
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
async function morningOn(at) {
  if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("Notifications weren’t allowed. Turn them on for Fitness in this browser’s settings.");
  const sub = await morningSub(true);
  await A.morning({ sub: sub.toJSON(), at, tz: tz(), days: morningDays() });
  store.set("morning", { at, endpoint: sub.endpoint });
}
async function morningOffHere() {
  const m = morningOf();
  store.set("morning", null);
  try { await A.morningOff(m?.endpoint); (await morningSub(false))?.unsubscribe(); } catch (_) {}
}
// (the week's words sent again, a moment after anything that changes them)
function morningRefresh() {
  if (!background.done) return;   // (as inStep: not for a copy that may be another's)
  const m = morningOf();
  if (!m || !S.me || !rhythmOn() || !canPush()) return;
  clearTimeout(morningRefresh.t);
  morningRefresh.t = setTimeout(async () => {
    try { const sub = await morningSub(false); if (!sub) return store.set("morning", null); await A.morning({ sub: sub.toJSON(), at: m.at, tz: tz(), days: morningDays() }); } catch (_) {}
  }, 3000);
}
function morningView() {
  const m = morningOf(), why = pushWhy(), at = morningView.at ?? m?.at ?? 7 * 60, t0 = morningDays()[dayStamp(addDays(TODAY, 1))];
  const pick = async (v) => {
    morningView.at = v;
    if (m) { try { await morningOn(v); toast(`At ${clockOf(v)} each morning`); } catch (e) { return toast(e.message, true, 6000); } }
    Sheet.redraw(); redraw();
  };
  const on = async (btn) => {
    btn.disabled = true; btn.textContent = "Turning on…";
    try { await morningOn(at); } catch (e) { btn.disabled = false; btn.textContent = "Turn on"; return toast(e.message, true, 6000); }
    toast(`On: at ${clockOf(at)} each morning`); Sheet.redraw();
  };
  const onBtn = h("button.btn", { type: "button", onclick: () => on(onBtn) }, "Turn on");
  return { title: "Morning reminder", body: [
    h("div.sheet-top", {}, h("h1", { text: "Morning reminder" }), h("div.sub", { text: "Today’s session, or a rest day, at the time you choose. On this phone." })),
    t0 && h("div.note-preview", {}, h("span.ic", {}, h("img", { src: "icon-192.png", alt: "", width: 20, height: 20 })), h("span.tx", {}, h("b", { text: t0.title }), h("small", { text: t0.body }))),
    section("At", h("div.times", { role: "radiogroup", "aria-label": "Time" }, [360, 390, 420, 450, 480, 510, 540].map((v) =>
      h("button.pill.small" + (v === at ? ".tinted" : ""), { type: "button", role: "radio", "aria-checked": String(v === at), onclick: () => pick(v) }, clockOf(v))))),
    why ? h("p.rh-note", { text: why }) : !m && onBtn,
    m && section(null, h("div.group", {}, h("button.row.action.danger", { type: "button", onclick: async () => { await morningOffHere(); morningView.at = null; Sheet.redraw(); redraw(); toast("Morning reminder off"); } }, "Turn off"))),
  ] };
}

// ---- sheets: up from below, the page stepping back; inside one, on and back slide like pages ----
const Sheet = { stack: [], tall: false, redraw: null };
// (full: the whole screen, over the sky, as the first-use welcome has it: no handle, no dragging it away)
function openSheet(view, { tall = false, full = false } = {}) {
  if (sheetEl.open) { Sheet.stack = []; }
  Sheet.stack.push(view); Sheet.tall = tall;
  sheetEl.classList.toggle("full", full);
  drawSheet();
  if (!sheetEl.open) {
    document.body.style.setProperty("--sy", `${scrollY + innerHeight / 2}px`);
    sheetEl.classList.remove("closing");
    // (fresh, for a moment: what's in it comes up in turn as it opens, and not again as it's redrawn)
    sheetEl.classList.add("fresh"); clearTimeout(openSheet.t); openSheet.t = setTimeout(() => sheetEl.classList.remove("fresh"), 1200);
    sheetEl.showModal();
    // (the sheet itself takes the focus, as the account page's does, not its first button: so Done isn't ringed as it opens)
    sheetEl.focus({ preventScroll: true });
    document.body.classList.add("sheet-up");
  }
}
function pushSheet(view) { Sheet.stack.push(view); drawSheet("on"); }
function sheetBack() { if (Sheet.stack.length > 1) { Sheet.stack.pop(); drawSheet("back"); } else closeSheet(); }
function drawSheet(dir = null) {
  const v = Sheet.stack.at(-1)();
  sheetEl.classList.toggle("tall", Sheet.tall);
  const bodyEl = h("div.sheet-body" + (dir ? ".swap" + (dir === "back" ? ".back" : "") : ""), {}, v.body);
  const headEl = h("div.sheet-head", {},
    // (InFlite's Settings sheet, the same in every app: a round ‹ back on a page inside, a round ✕ to close)
    Sheet.stack.length > 1 ? h("button.ifs-btn.back.l", { type: "button", onclick: sheetBack, "aria-label": "Back" }, icon("back", 18, 2.4)) : h("span.l"),
    h("h2", { id: "sheet-title", text: v.title || "" }),
    v.right || h("button.ifs-btn.done.r", { type: "button", onclick: closeSheet, "aria-label": "Close" }, icon("x", 18, 2.4)));
  sheetEl.replaceChildren(h("div.grab", { "aria-hidden": "true" }), headEl, bodyEl);
  drag(headEl);
  // (as iOS's large titles: where the sheet's own title says what its bar does, the bar's comes in only as that one
  // scrolls away; and once anything has gone under the bar, an edge, the content fading under it)
  const big = bodyEl.querySelector(".sheet-top h1"), lt = !!big && big.textContent.trim() === (v.title || "").trim();
  const edges = () => { sheetEl.classList.toggle("edge", bodyEl.scrollTop > 2); if (lt && big.offsetHeight) sheetEl.classList.toggle("past", big.getBoundingClientRect().bottom < bodyEl.getBoundingClientRect().top + 10); };
  // (measured once it's open: it's drawn just before)
  sheetEl.classList.toggle("lt", lt); sheetEl.classList.remove("past", "edge"); requestAnimationFrame(edges);
  bodyEl.addEventListener("scroll", edges, { passive: true });
  Sheet.redraw = () => { const top = bodyEl.scrollTop; drawSheet(); sheetEl.querySelector(".sheet-body").scrollTop = top; };
}
async function closeSheet() {
  if (!sheetEl.open || sheetEl.classList.contains("closing")) return;
  sheetEl.style.setProperty("--from-tf", getComputedStyle(sheetEl).transform === "none" ? "none" : getComputedStyle(sheetEl).transform);
  sheetEl.classList.add("closing");
  document.body.classList.remove("sheet-up");
  await new Promise((r) => setTimeout(r, still.matches ? 200 : 340));
  sheetEl.close(); sheetEl.classList.remove("closing", "full"); sheetEl.style.removeProperty("transform"); sheetEl.style.removeProperty("--from-tf");
  Sheet.stack = []; Sheet.redraw = null;
}
sheetEl.addEventListener("cancel", (e) => { e.preventDefault(); if (!sheetEl.classList.contains("full")) closeSheet(); });
sheetEl.addEventListener("click", (e) => { if (e.target === sheetEl) closeSheet(); });   // (a tap on the dim outside it)
// dragged down by its top, it follows the finger; let go far enough (or quickly), it goes
function drag(handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || sheetEl.classList.contains("full")) return;
    const y0 = e.clientY, t0 = performance.now();
    let dy = 0;
    sheetEl.classList.add("dragging");
    const move = (ev) => { dy = Math.max(0, ev.clientY - y0); sheetEl.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      sheetEl.classList.remove("dragging");
      if (dy > 120 || (dy > 30 && dy / (performance.now() - t0) > 0.6)) closeSheet();
      else { sheetEl.style.transition = "transform 0.4s var(--ease-spring)"; sheetEl.style.transform = ""; setTimeout(() => sheetEl.style.removeProperty("transition"), 400); }
    };
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  });
}

// ---- toasts ----
let toastT = null;
function toast(text, bad = false, ms = 2600) {
  toastEl.replaceChildren(icon(bad ? "info" : "check", 18, 2.4), h("span", { text }));
  toastEl.classList.toggle("bad", bad); toastEl.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), ms);
}

// ---- drawn again for a new width (the charts are drawn to it) ----
let lastW = innerWidth, resizeT = null;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; redraw(true); } }, 250); });

// ---- no zooming, on any screen: Safari pinches whatever the page's rules say, so it's told with the gestures themselves ----
for (const n of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(n, (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 || (e.scale ?? 1) !== 1) e.preventDefault(); }, { passive: false });

// ---- the status bar's glass, once the page is under it ----
addEventListener("scroll", () => document.documentElement.style.setProperty("--bar", scrollY > 8 ? 1 : 0), { passive: true });

// ---- signing in, and out ----
// Fitness is used signed in, and only signed in: signed out, this, and Sign in, which is on the account's own page
// (account.<site>, beside fitness.<site>), where every app on the site signs in: there with a word for the sign-in (kept
// on this device for half an hour, or until it's used), and back with a code for it (signedBack)
// Signed out: Fitness's own morning sky, and a course across the foot of it, hills behind hills, its route drawing
// itself along the ridge in the zones' colours and you, a dot of light, riding it; the mark coming up out of the haze,
// its name a letter at a time, and Sign in, warm, pulsing as a heart does. (Chat's welcome, in Fitness's world.)
// again: shown before in this visit (after signing out): no slow start, the rest as it was
function welcome(note = null, { again = !!welcome.shown } = {}) {
  welcome.shown = true;
  S.me = null;
  document.body.classList.add("out");
  const page = A.accountPage();
  main.replaceChildren(h("div.welcome.dawn.ifl-in" + (again ? ".again" : ""), {},
    courseScene(),
    // (where each part sits is InFlite's way in, shared by every app: .tools/inflite/signin.css)
    h("div.w-top.ifl-top", {}, h("div.wlogo.ifl-logo", {}, h("img.mark", { src: "icon.svg", alt: "", width: 96, height: 96 })),
      h("h1.wtitle.ifl-title", { "aria-label": "Fitness" }, [..."Fitness"].map((c) => h("span", { "aria-hidden": "true", text: c }))),
      h("p.tagline.ifl-tagline", { text: "Training that fits your week" })),
    // (Sign in at the foot of the page, as on the site's other apps)
    h("div.w-cta.ifl-cta", {}, note && h("p.small.said", { role: "status", text: note }),
      // (InFlite, whose one account signs you in to every app: its mark and name, over Sign in)
      page && h("p.wbrand.ifl-brand", {}, h("img", { src: "inflite.svg", alt: "", width: 22, height: 22 }), "Powered by InFlite"),
      h("button.btn.wbeat.ifl-go", { type: "button", id: "sign-in", disabled: !page, onclick: toAccountSignIn }, "Sign in"),
      !page && h("p.small", { text: "Signing in is at fitness.inflite.ai." }),
      page && h("p.new-here.ifl-new", {}, "New here? ", h("button.link", { type: "button", onclick: (e) => toAccountSignIn(e, "join") }, "Create your account")))));
  main.removeAttribute("aria-busy");
  document.title = "Fitness";
}
// The course: three ridges, far to near, each an elevation profile; the nearest with its route drawn in the zones'
// colours, and a rider (a dot and its glow) going along it, round and round (still, for anyone who asks for less motion)
function courseScene() {
  const W = 1200, H = 520, ridge = (base, amps, seed) => (x) => base - amps.reduce((y, a, i) => y + a * Math.sin(x / [180, 71, 33][i] + seed * (i + 1)), 0);
  const line = (f) => Array.from({ length: 61 }, (_, i) => { const x = (i / 60) * W; return `${i ? "L" : "M"}${x.toFixed(1)} ${f(x).toFixed(1)}`; }).join("");
  const hill = (f, cls) => `<path class="${cls}" d="${line(f)}L${W} ${H}L0 ${H}Z"/>`;
  const far = ridge(250, [46, 18, 8], 0.6), mid = ridge(318, [52, 22, 10], 2.1), near = ridge(392, [58, 26, 12], 4.2), route = line(near);
  const el = svgOf(`<svg class="course" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="c-route" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#4aa3ff"/><stop offset=".35" stop-color="#3fd08f"/><stop offset=".6" stop-color="#ffd23f"/><stop offset=".82" stop-color="#ff9440"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient>
    <radialGradient id="c-glow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="#ffb37a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a59" stop-opacity="0"/></radialGradient></defs>
    ${hill(far, "c-far")}${hill(mid, "c-mid")}${hill(near, "c-near")}
    <path class="c-route" pathLength="1" d="${route}"/>
    <g class="c-rider"><circle class="c-halo" r="26" fill="url(#c-glow)"/><circle class="c-dot" r="7"/></g></svg>`);
  // (the rider along the route, across as much of it as the screen shows (the course is wider than a phone), nine
  // seconds a crossing, then round again from the left: moved here, frame by frame, while the welcome's up; for
  // anyone who asks for less motion, at rest a third of the way along)
  const path = el.querySelector(".c-route"), rider = el.querySelector(".c-rider"), t0 = performance.now() + 2400;
  // (the length along the route at a point across it: the route only ever goes on across, so halving finds it)
  const lenAt = (x) => { let lo = 0, hi = path.getTotalLength(); for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (path.getPointAtLength(m).x < x) lo = m; else hi = m; } return lo; };
  let span = null;
  const shown = () => { const m = el.getScreenCTM(); if (!m || !m.a) return null; const x0 = (16 - m.e) / m.a, x1 = (innerWidth - 16 - m.e) / m.a; return [lenAt(Math.max(0, x0)), lenAt(Math.min(W, x1))]; };
  const at = (u) => { span = span || shown(); if (!span) return; const p = path.getPointAtLength(span[0] + (span[1] - span[0]) * (((u % 1) + 1) % 1)); rider.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`); };
  addEventListener("resize", () => { span = null; }, { passive: true });
  requestAnimationFrame(() => { try { at(0.33); } catch (_) {} });
  if (!STILL.matches) {
    const frame = (now) => { if (!el.isConnected && now > t0) return; try { at(Math.max(0, now - t0) / 9000); } catch (_) {} requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }
  return el;
}
async function toAccountSignIn(e, mode = "signin") {
  const page = A.accountPage(), b = mode === "signin" ? e?.currentTarget : null;
  if (!page) return;
  if (b) { b.disabled = true; b.textContent = "Signing in…"; }
  try {
    const { word, ask } = await A.signInWord();
    localStorage.setItem("fitness:signin", JSON.stringify({ word, at: Date.now() }));
    // (the account page's sky coming in over this one first, so going there is one sky, not a jump)
    await handOff();
    location.assign(`${page}#${new URLSearchParams({ [mode]: "fitness", ask, back: `${location.origin}/` })}`);
  } catch (_) { if (b) { b.disabled = false; b.textContent = "Sign in"; } toast("This browser can’t sign in here. Try Safari or Chrome.", true); }
}

// ---- signing in and out, in motion, as Chat does it: going, the account page's sky comes in over Fitness; coming
// back, that sky and you are there from the first frame (theme.js), then the sky clears, your picture flies up into
// your own button, and the page comes in a part at a time; signing out, the page goes, a part at a time, and the
// morning comes back in ----
const STILL = matchMedia("(prefers-reduced-motion: reduce)");
const play = (el, frames, o) => { try { return el?.animate(frames, o) || null; } catch (_) { return null; } };
const played = (a, ms) => new Promise((done) => { const t = setTimeout(done, ms); a?.finished.then(() => { clearTimeout(t); done(); }, () => { clearTimeout(t); done(); }); });
const SPRING = () => getComputedStyle(document.documentElement).getPropertyValue("--ease-spring").trim() || "cubic-bezier(.2,1.1,.4,1)";
const EASE_OUT = "cubic-bezier(.22,1,.36,1)", EASE_IN = "cubic-bezier(.5,0,.75,0)";
function handOff() {
  const still = STILL.matches, el = h("div.handoff", { "aria-hidden": "true" }, h("i.hsky"));
  document.body.append(el);
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", matchMedia("(prefers-color-scheme: dark)").matches ? "#0a0f26" : "#f3f0fb");
  setTimeout(() => el.remove(), 15000);   // (and if the page never goes, the sky doesn't stay)
  return played(play(el.firstChild, [{ opacity: 0 }, { opacity: 1 }], { duration: still ? 150 : 480, easing: "ease", fill: "forwards" }), 700);
}
// the parts of the page as they're drawn: its title, the strip, each card (in order, those on screen)
function partsOnScreen() {
  const vh = innerHeight;
  return [...main.querySelectorAll(".screen > :not(.cols), .screen > .cols > div > *")].filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < vh; });
}
// Back from the account's page: its sky and you over Fitness, till Fitness is in (in), or isn't after all (away)
function arriving() {
  const root = document.documentElement, still = STILL.matches, timers = [], box = h("div.arrival", { "aria-hidden": "true" }, h("div.arv-sky"));
  const f = (getComputedStyle(root).getPropertyValue("--arv-i") || "").trim().replace(/^"|"$/g, "");
  let face = null, over = false;
  if (root.classList.contains("arv-face")) { face = h("div.arv-me", {}, f); if (window.arvPhoto) face.append(h("img", { src: window.arvPhoto, alt: "" })); box.append(face); }
  document.body.append(box);
  root.classList.remove("arriving", "arv-face");
  const at = (ms, fn) => timers.push(setTimeout(() => { if (!over) try { fn(); } catch (_) {} }, ms));
  const end = () => { over = true; timers.forEach(clearTimeout); box.remove(); };
  const late = setTimeout(() => a.away(), 12000);
  const a = {
    in() {
      if (over) return;
      clearTimeout(late);
      // (the page under the sky, held back, then a part at a time, top first, as the sky clears)
      main.querySelector(".screen")?.classList.remove("in");
      const parts = partsOnScreen();
      for (const el of parts) el.style.opacity = "0";
      play(box.firstChild, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? 250 : 420, easing: "ease", fill: "forwards" });
      at(still ? 0 : 140, () => parts.forEach((el, i) => { el.style.opacity = ""; play(el, still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(14px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: still ? 250 : 480, delay: still ? 0 : Math.min(i, 8) * 55, easing: EASE_OUT, fill: "backwards" }); }));
      // your picture: up into your own button, top right, landing with a spring, which gives a little
      at(still ? 100 : 240, () => {
        const to = main.querySelector(".ifh .ifh-me");
        if (!face) return;
        if (!to || still) { play(face, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }); return; }
        flyTo(face, to, 720);
        at(460, () => { play(face, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }); play(to, [{ transform: "scale(1.25)" }, { transform: "none" }], { duration: 560, easing: SPRING() }); });
      });
      at(still ? 900 : 1500, end);
    },
    away() { if (over) return; clearTimeout(late); over = true; timers.forEach(clearTimeout); played(play(box, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? 150 : 300, fill: "forwards" }), 400).then(() => box.remove()); },
  };
  return a;
}
// A curve from where `el` is onto the middle of `to`, shrinking to its size, out past that side first, then onto it
function flyTo(el, to, ms) {
  const a = el.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  const cx = x1 + Math.sign(x1 - x0 || 1) * Math.max(36, Math.abs(x1 - x0) * 0.5), cy = y0 + (y1 - y0) * 0.2, s1 = Math.max(0.15, b.width / a.width), frames = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, m = 1 - u, x = m * m * x0 + 2 * m * u * cx + u * u * x1, y = m * m * y0 + 2 * m * u * cy + u * u * y1;
    frames.push({ transform: `translate(${(x - x0).toFixed(1)}px,${(y - y0).toFixed(1)}px) scale(${(1 + (s1 - 1) * u).toFixed(3)})` });
  }
  return play(el, frames, { duration: ms, easing: SPRING(), fill: "forwards" });
}
// Signing out: the page's parts go, the last first, and the morning comes in over it all; the welcome's drawn under it,
// and it clears to that. → { dark: a promise for when it's covered, done(): the welcome's there }
function dusk() {
  const still = STILL.matches, box = h("div.dusk", { "aria-hidden": "true" }, h("div.dusk-sky")), parts = [...partsOnScreen(), document.querySelector(".tabbar")].filter(Boolean).reverse();
  document.body.append(box);
  parts.forEach((el, i) => play(el, still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px) scale(.985)" }], { duration: still ? 200 : 280, delay: still ? 0 : Math.min(i, 10) * 35, easing: still ? "ease" : EASE_IN, fill: "forwards" }));
  const dark = played(play(box.firstChild, [{ opacity: 0 }, { opacity: 1 }], { duration: still ? 250 : 380, delay: still ? 100 : 260, easing: "ease", fill: "forwards" }), 1200);
  return { dark, done() { for (const el of parts) el.getAnimations?.().forEach((x) => x.cancel()); played(play(box, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? 250 : 520, easing: "ease", fill: "forwards" }), 900).then(() => box.remove()); } };
}
// Back from the account's page with a code for the sign-in made there: swapped, with the word kept for it, for the sign-in
// (the site's: Fitness keeps none of its own). A code from anywhere else, or one that's run out, is used up and goes no
// further. → the account, as me() has it, or null
async function signedBack(code) {
  let k = null;
  try { k = JSON.parse(localStorage.getItem("fitness:signin") || "null"); localStorage.removeItem("fitness:signin"); } catch (_) {}
  if (!k || Date.now() - k.at > 30 * 60e3) { A.handback(code, "").catch(() => {}); toast("That sign-in was started somewhere else. Sign in again here.", true); return null; }
  try { const m = await A.handback(code, k.word); toast(`Signed in as ${String(m.name).trim().split(/\s+/)[0]}`); return m; }
  catch (e) { toast(e.message, true); return null; }
}
// The older activities, where only the newest came (a phone new to the account: those are drawn at once), brought in a
// page at a time behind, then the screen drawn again with them all
async function older() {
  if (older.busy || !S.me?.more) return;
  older.busy = true;
  const me = S.me.id;
  try {
    for (;;) {
      const last = S.own.reduce((o, a) => (!o || a.start < o.start || (a.start === o.start && a.id < o.id) ? a : o), null);
      if (!last) break;
      const got = await A.older(last.start, last.id);
      if (S.me?.id !== me) return;
      const have = new Set(S.own.map((a) => a.id)), add = got.acts.filter((a) => !have.has(a.id));
      for (const a of add) { S.own.push({ ...a, sample: false }); S.sums.set(a.id, rescale(a.sum, P(), a.sport)); }
      if (meBase?.id === me) lastMe.put({ ...meBase, acts: [...(meBase.acts || []), ...add], more: got.more });
      if (!got.more || !add.length) break;
    }
    S.me.more = false;
    if (meBase?.id === me) lastMe.put({ ...meBase, more: false });
    S.own.sort((a, b) => b.start - a.start); setActs(); redraw();
  } catch (_) {} finally { older.busy = false; }
}
// Signed in: your record and your activities, from the account
// The account as last fetched, kept on this phone: the app's drawn from it at once as it opens, while what's changed
// since is fetched (and gone with the rest of this phone's copies on signing out: idb.clear)
let meBase = null;
// (kept as one string: read back as one, and parsed, it's far quicker than thousands of objects copied out one by one)
const lastMe = {
  get: async () => { try { const t = await idb.get("me:last"); return typeof t === "string" ? JSON.parse(t) : null; } catch (_) { return null; } },
  // (and its time, where theme.js can read it at once: what's changed since is asked for as the page is read)
  put: (m) => { meBase = m; idb.put("me:last", JSON.stringify(m)).then(() => store.set("meAt", { at: m.at }), () => {}); },
};
// the account now: what's changed since the copy here (its activities put together with those it has, and those gone
// left out), or all of it where there's no copy, or it's another account's
async function fetchMe(base = meBase) {
  let m = await A.me(base?.id && base.at ? base.at : null);
  if (m.signedIn && m.ids) {
    if (base?.id !== m.id) m = await A.me();
    else {
      const still = new Set(m.ids), byId = new Map((base.acts || []).filter((a) => still.has(a.id)).map((a) => [a.id, a]));
      for (const a of m.acts || []) byId.set(a.id, a);
      // (still bringing the older ones in, or some the account has that aren't here: more to come, behind)
      m = { ...m, acts: [...byId.values()].sort((a, b) => b.start - a.start), ids: undefined, more: !!base.more || m.ids.length > byId.size };
    }
  }
  if (m.signedIn) lastMe.put(m);
  return m;
}
// (kept: the copy kept on this phone, drawn at once; it may be another account's, the site having been signed into as
// someone else since, so nothing's done for it, nothing fetched or kept, till the account says it's the same one)
function arrive(m, kept = false) {
  if (!kept && m.appearance) lookOf(m.appearance);
  S.me = m; S.ver = m.ver || 0; S.pulledAt = Date.now(); S.inStepWorkouts = A.workoutIds(m.data);
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  S.sums.clear();
  adopt(m.data);
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  document.body.classList.remove("out");
  drawTabs();
  // (the figures first, so the screen's drawn once, not drawn and then drawn again)
  sumUp();
  render(true);
  if (kept) return;
  estimate();
  background(m);
}
function background(m) {
  background.done = true;
  // (someone new: Garmin, your numbers and your week, in one go; else the day's check-in)
  // (someone new to Fitness, on any phone: the welcome; part way through it, on this one: where it got to. Anyone with
  // a plan already, or rides of their own, is set up)
  const onb = !S.onboarded && !S.rhythm && (store.get(ONB, null) || (!S.own.length && !m.garmin?.on && !m.strava?.on && !store.get("welcomed", false)));
  if (onb) { garminNow(m.garmin); stravaNow(m.strava); S.health = m.health || { on: false }; setTimeout(() => onboarding(store.get(ONB, null)), 400); }
  else { askToday(); garminNow(m.garmin); stravaNow(m.strava); S.health = m.health || { on: false }; }
  older();
  setTimeout(squash, 4000);
  setTimeout(routes, 6000);
  morningRefresh();
}
// What another device changed meanwhile, taken up as you come back to the app (this device's changes not yet kept
// winning, as when they're sent)
// the account as fetched, taken up over what's on the screen (this device's changes not yet kept winning)
function takeUp(m) {
  document.body.dataset.fresh = "1";
  if (m.appearance) lookOf(m.appearance);
  S.me = { ...S.me, name: m.name, handle: m.handle, photoAt: m.photoAt, garmin: m.garmin }; S.ver = m.ver; S.pulledAt = Date.now();
  adopt(S.dirty.size ? A.merge(m.data, record(), S.dirty, S.inStepWorkouts) : m.data); S.inStepWorkouts = A.workoutIds(m.data);
  S.own = (m.acts || []).map((x) => ({ ...x, sample: false }));
  for (const a of S.own) S.sums.set(a.id, rescale(a.sum, P(), a.sport));
  S.health = m.health || { on: false };
  S.me.more = m.more;
  setActs(); redraw(); estimate();
  if (!background.done) background(m); else { garminNow(m.garmin); stravaNow(m.strava); older(); }
}
async function pull() {
  if (!S.me || pull.busy) return;
  pull.busy = true;
  try {
    const m = await fetchMe();
    if (!m.signedIn || m.id !== S.me.id) return signedOutHere(true);
    takeUp(m);
  } catch (_) {} finally { pull.busy = false; }
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me && Date.now() - S.pulledAt > 60e3) pull(); if (document.visibilityState === "visible" && S.me) askToday(); });
addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
// (nothing copied or dragged out of the app, but what you type: a field's own text; and Today's sessions, dragged from day to day)
const inField = (t) => t instanceof Element && !!t.closest("input, textarea, select");
for (const ev of ["copy", "cut", "dragstart"]) addEventListener(ev, (e) => { if (!inField(e.target) && !(ev === "dragstart" && e.target.closest?.(".gday[draggable]"))) e.preventDefault(); });
addEventListener("contextmenu", (e) => { if (!inField(e.target)) e.preventDefault(); });

// ---- always the latest version: the app's files as they were when it opened, and as they are now, compared as you
// come back to it (a phone keeps a page open for days); a new one, and it's opened afresh, unless you're mid-upload ----
const FILES = ["app.js", "styles.css", "ui.js", "charts.js", "workouts.js", "load.js", "sample.js", "formats.js", "fit.js", "account.js", "rhythm.js", "progress.js", "map.js", "mapstyle.js", "besttime.js", "efforts.js", "today.js", "plan.js", "progressview.js", "activities.js", "todaycalc.js", "reader.js", "share.js"];
const versionNow = async () => (await Promise.all(FILES.map((f) => fetch(f, { method: "HEAD", cache: "no-store" }).then((r) => r.headers.get("etag") || "", () => null)))).join();
let version = null, versionAt = Date.now();
// The service worker, kept on: it holds the app's files, so it opens at once, and with no network (sw.js). Where it finds
// a new version, it says so: the app opens afresh, at once if it's only just opened and nothing's been touched, else
// as you come back to it (as below), never mid-upload.
const opened = Date.now();
let touched = false, newer = false;
addEventListener("pointerdown", () => { touched = true; }, { once: true, capture: true });
const afresh = () => { if (!document.querySelector(".btn[disabled]")) location.reload(); };
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type !== "fitness:new") return;
    newer = true;
    if (!touched && Date.now() - opened < 6000 && !sheetEl.open) afresh();
  });
  const keep = () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  if (document.readyState === "complete") keep(); else addEventListener("load", keep);
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && newer) afresh(); });
// (as it opened, but asked a few seconds on: not in the way of its opening)
setTimeout(() => versionNow().then((v) => { version = v; }), 4000);
// (and its version, kept for your account's page, and said once if it's new since last time)
IFL.built("fitness", BUILD);
IFL.watch(window);
addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !version || Date.now() - versionAt < 30e3) return;
  versionAt = Date.now();
  const v = await versionNow();
  if (v && !v.split(",").includes("") && v !== version && !document.querySelector(".btn[disabled]")) location.reload();
});
// Signing out, here (everywhere on the site, in this browser), or found to be signed out (elsewhere): this device's
// copies of your files go too
async function signOutHere(already = false) {
  // (this phone's morning reminder goes with the sign-in)
  if (already !== true && morningOf()) await morningOffHere();
  if (already !== true) { try { await A.signOut(); } catch (e) { if (e.status !== 401) return toast(e.message, true); } }
  if (sheetEl.open) await closeSheet();
  // (signing out yourself: the page goes and the morning comes back; found out, it's just the welcome)
  const d = already !== true && S.me ? dusk() : null;
  if (d) await d.dark;
  held.clear(); S.own = []; S.sums.clear(); S.dirty.clear(); setActs();
  store.set("meAt", null); idb.clear().catch(() => {});
  welcome(already === true ? "You’re signed out. Sign in again to carry on." : "Signed out.", { again: true });
  d?.done();
}

// (the sign-in gone, found out mid-way: signed out here too, and said so)
const signedOutHere = () => signOutHere(true);

// ---- starting ----
(async () => {
  // back from signing in on the account's page, with the code it handed back (taken out of the address at once)
  const code = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash)?.[1];
  if (code) history.replaceState(null, "", location.pathname + location.search);
  // (its sky and you, over Fitness till you're in: theme.js put them up for the first frame, this carries them on)
  const arv = code || document.documentElement.classList.contains("arriving") ? arriving() : null;
  // (back from Strava's page: how it went, taken out of the address at once)
  const fromStrava = /^#strava=(on|no|error|taken)$/.exec(location.hash)?.[1];
  if (fromStrava) history.replaceState(null, "", location.pathname + location.search);
  // (back from it part way through the welcome, not connected: back to choosing how your rides come in)
  if (fromStrava && fromStrava !== "on" && store.get(ONB, null) === "days") store.set(ONB, "rides");
  const want = location.hash.slice(1);
  if (TABS.some(([id]) => id === want)) S.tab = want;
  else if (want === "plan") S.tab = "today";
  let m = null, early = null;
  try {
    if (code) { m = await signedBack(code); if (m) lastMe.put(m); }
    if (!m) {
      // (the copy kept here, drawn at once; then what's changed since, taken up)
      const kept = await lastMe.get();
      // (what's changed asked for at once, while the copy's drawn, not after)
      const now = fetchMe(kept);
      if (kept?.signedIn && Array.isArray(kept.acts)) { early = kept; meBase = kept; arrive(kept, true); }
      m = await now;
    }
  } catch (e) {
    arv?.away();
    if (early) return;   // (offline: what was here last stays)
    return welcome(e.offline ? "You’re offline. Fitness will be here when you’re back online." : e.message);
  }
  if (!m.signedIn) { arv?.away(); return early ? signOutHere(true) : welcome(); }
  if (early && m.id !== early.id) return location.reload();
  if (early) takeUp(m); else { arrive(m); document.body.dataset.fresh = "1"; }
  arv?.in();
  if (fromStrava === "on") { if (!store.get(ONB, null)) go("activities"); bringIn({ src: "strava" }); }
  else if (fromStrava === "taken") toast("That Strava account is connected to another Fitness account. On Strava’s page, sign in as yourself, or disconnect it from the other account first.", true, 9000);
  else if (fromStrava) toast(fromStrava === "no" ? "Strava wasn’t connected: Fitness needs to see your activities. Try again, and leave the activities box ticked on Strava’s page." : "Strava didn’t connect. Try again in a moment.", true, 7000);
})();

// (what the screens, each its own module, take from here)
export { wellByDay, setNumber, resum, nightsFrom, nightsSeries, shareView };
export { mapsAlways, wide, mainW, partW };
// (the sheets your connections are set up on, as the welcome uses them; and for the tests, to open them by themselves)
export { stravaView, healthView };
export { A, BT, C, DAY, E, F, G, HR_ZONES, M, P, PLANS, R, S, SPORTS, Sheet, TODAY, U, WORKOUTS, ZONES, actsOn, addDays, bigMapView, calendar, canMorph, card, cardW, chooseFiles, choosePlan, clock, closeSheet, dateShort, dayLetter, dayLong, dayName, dayShort, dist, distNum, drawSheet, dur, eventDay, face, fileKey, fitness, fitnessSeries, flatten, formSaid, full, garminView, go, h, head, height, held, hm, icon, idb, isSet, keep, layOut, lightNow, load, mapCredit, measure, missed, mondayOf, morph, myPlan, numbers, once, openSheet, pace, paceFor, pct, perSecond, plan, planStart, plannedOn, plural, pushSheet, record, redraw, rh, rhDay, rhythmOn, rng, routeOf, row, runSpeed, saveFile, section, setActs, setExamples, settingsView, sheetBack, sheetEl, sheetW, signed, signedOutHere, speed, sportIcon, sportTile, startOfDay, stat, stepLen, stepper, store, sumOf, summarise, svgOf, swimSpeed, timeOf, toast, upload, wait, weekIndex, weekZip, weeks, weight, wkById, workoutById, zoneOf };