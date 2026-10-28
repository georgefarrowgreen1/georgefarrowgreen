// Weather: the page. data.js fetches, insights.js thinks, this draws.
import { load, due, extrasDue, searchPlaces, nameOf, store, peek, cell, keptWx, hasKept, fetchSolar } from "./data.js";
import { makeFormat, nowWall, dayStart, keyOf, hourOf, compass, compassWord, beaufort, HOUR, DAY } from "./format.js";
import * as I from "./insights.js";
import { codeInfo, iconOf, label, heaviness, LIGHT_MMH, HEAVY_MMH } from "./codes.js";
import { weatherIcon, moonIcon, glyph } from "./icons.js";
import { timeChart, rangeChart, hush } from "./charts.js";
import { climateOn, rankIn, yearsAgo } from "./climate.js";
import { nextPhases } from "./sky.js";
import { applyTuning, steady, refine, daysSaid, saidBefore, MIN_DAYS, TUNE_DAYS } from "./skill.js";
import { radar, rainAt } from "./radar.js";
import { blend } from "./rainmap.js";
import { oneRain } from "./agree.js";
import { sunSpell, solarSay, FACES, PITCHES } from "./solar.js";
import { inForce, covered, colourOf, titleOf, badgeOf, spanOf, glyphOf } from "./official.js";
import * as A from "./account.js";

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
    down: '<path d="m6 9 6 6 6-6"/>',
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
  // on, toggle(next) → on, value, open }], account(), signOut(), update: a function when a newer version's ready }
  let open = null;
  function close(now) {
    const m = open;
    if (!m) return;
    open = null;
    m.anchor.classList.remove("ifm-lit");
    document.removeEventListener("keydown", m.key, true);
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
          const b = el("button", "ifm-row go", ic, el("span", "ifm-l", r.label), r.value ? el("span", "ifm-val", r.value) : null);
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
    let status;
    if (o.update) { status = el("button", "ifm-upd", "Update ready"); status.type = "button"; status.onclick = act(o.update); }
    else status = el("span", "", "Up to date");
    const out = el("button", "ifm-out", "Sign Out"); out.type = "button"; out.onclick = act(o.signOut);
    const foot = el("div", "ifm-foot", mark, el("span", "ifm-ver", `${NAME[o.app]} V${o.build}`, el("i", "", " · "), status), o.signOut ? out : null);
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

// (while a place's whole page is drawn for beside this one, in that: drawWhole)
let R = null;
const $ = (id) => (R ? R.querySelector(`#${CSS.escape(id)}`) : document.getElementById(id));
// (an icon's markup read once, and copied after that: the 48 hours' strip alone has a few icons forty-eight times over,
// and reading each afresh was most of the time it took to draw a place)
const icons = new Map();
const iconNode = (svg) => {
  let t = icons.get(svg);
  if (!t) { if (icons.size > 300) icons.clear(); t = document.createElement("template"); t.innerHTML = svg; icons.set(svg, t); }
  return t.content.cloneNode(true);
};
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "svg") n.append(iconNode(v));             // (only ever the app's own icons)
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  // (an icon in a span: just the icon, with no room for a line of text's descenders under it: styles.css .ic)
  if (attrs?.svg && tag === "span") n.classList.add("ic");
  return n;
}
const COLOR = { temp: "#D07A12", rain: "#3B8BE0", wind: "#14A08F" };     // (checked for contrast and colour-blind separation on the cards)
// the curves for what moves by the script, as styles.css has them (--ease-glide, --ease-out, --ease-in): the glide for
// what rises and slides, out for what settles or fades, in for what leaves
const GLIDE = "cubic-bezier(0.32, 0.72, 0, 1)", EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)", EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const T = () => (S.f.units.temp === "f" ? (c) => c * 9 / 5 + 32 : (c) => c);
const W = () => S.f.windNum;

/* ---------- state ---------- */
const S = { settings: null, f: null, places: [], cur: 0, base: null, wx: null, radar: null, mode: "temp", allInsights: false, allWins: false, loading: false, stale: false, error: null, openIns: new Set() };
// the units to start with, whatever the phone's language: °C, mph, mm, hPa and the 24-hour clock (Settings → Units)
const defaults = () => ({ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" });
// the page's cards, in their usual order (index.html), each with its element and its name in Settings (Arrange your
// page: settings.js); the warnings aren't one of them, always first, under the temperature
const CARDS = [["nowcast", "Next 4 hours"], ["solar", "Solar"], ["hourly", "Next 48 hours"], ["right-now", "Right now"], ["daily", "16-day forecast"], ["radar", "Rain radar"],
  ["insights-card", "Highlights"], ["windows", "Best times"], ["accuracy", "Forecast accuracy"], ["climate", "This time of year"]];
// as you've arranged them: { order (every card, any the app has gained since put where it usually goes), off }
function layoutOf(v) {
  const ids = CARDS.map((c) => c[0]), o = v && typeof v === "object" ? v : {};
  const order = [...new Set((Array.isArray(o.order) ? o.order : []).filter((k) => ids.includes(k)))];
  for (const [i, k] of ids.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  return { order, off: [...new Set((Array.isArray(o.off) ? o.off : []).filter((k) => ids.includes(k)))] };
}
// Settings › Solar: { on, faces, pitch, alert (a notification as the sun's coming out), and the place the panels are:
// lat, lon, name }
function solarOf(v) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {}, spot = Number.isFinite(o.lat) && Number.isFinite(o.lon);
  return { on: !!o.on && spot, alert: o.alert !== false, faces: FACES.some((x) => x[0] === o.faces) ? o.faces : "S", pitch: PITCHES.includes(o.pitch) ? o.pitch : 35,
    ...(spot ? { lat: o.lat, lon: o.lon, name: String(o.name || "").slice(0, 60) } : {}) };
}
function loadSettings() {
  const d = {
    ...defaults(), commute: { on: false, am: "08:00", pm: "17:30" }, tune: true, solar: { on: false, alert: true, faces: "S", pitch: 35 },
    activities: I.DEFAULT_ACTIVITIES.map((a) => ({ ...a })), extras: { laundry: true, stars: true, sunset: true },
  };
  // (only values the app knows: a damaged or out-of-date one falls back to the default)
  const k = store.get("wx:settings"), o = k && typeof k === "object" && !Array.isArray(k) ? k : {};
  const one = (v, ok, dv) => (ok.includes(v) ? v : dv), obj = (v, dv) => ({ ...dv, ...(v && typeof v === "object" && !Array.isArray(v) ? v : {}) });
  S.settings = { ...d, ...o,
    temp: one(o.temp, ["c", "f"], d.temp), wind: one(o.wind, ["mph", "kmh", "ms", "kn"], d.wind), precip: one(o.precip, ["mm", "in"], d.precip),
    pressure: one(o.pressure, ["hpa", "inhg", "mmhg"], d.pressure), clock: one(o.clock, ["12", "24"], d.clock), tune: o.tune !== false,
    glass: one(o.glass, ["clear", "standard", "tinted"], "standard"),
    commute: obj(o.commute, d.commute), extras: obj(o.extras, d.extras), solar: solarOf(o.solar), notify: notifyOf(o.notify), layout: layoutOf(o.layout),
    activities: Array.isArray(o.activities) ? o.activities.filter((a) => a && typeof a === "object" && typeof a.name === "string") : d.activities,
  };
  S.f = makeFormat(S.settings);
  document.body.dataset.glass = S.settings.glass;
}
// Which notifications for which places: { places: [{ lat, lon, name, gps?, rain, warn }], brief: { lat, lon, name, gps? }
// or null, briefAt, endpoint (this device's push address, while it has them), devId (the server's name for it), syncedAt }
// (kept from before as one place, for whichever were on: the same, for that place)
function notifyOf(n) {
  n = n && typeof n === "object" && !Array.isArray(n) ? n : {};
  const spot = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon, name: String(p.name || ""), ...(p.gps ? { gps: true } : {}) } : null);
  const at = /^\d\d:\d\d$/.test(n.briefAt || "") ? n.briefAt : "07:00", keep = { endpoint: n.endpoint || null, devId: n.devId || null, syncedAt: n.syncedAt || 0 };
  // (signed in: the warnings and the briefing by email too)
  const email = { warn: !!n.email?.warn, brief: !!n.email?.brief };
  if (!Array.isArray(n.places)) { const p = spot(n.place); return { places: p && (n.rain || n.warn) ? [{ ...p, rain: !!n.rain, warn: !!n.warn }] : [], brief: p && n.brief ? p : null, briefAt: at, email, ...keep }; }
  // (no more than the server takes: a device that has more already, or a merge with the account's, keeps the first)
  const places = n.places.map((x) => { const p = spot(x); return p && (x.rain || x.warn) ? { ...p, rain: !!x.rain, warn: !!x.warn } : null; }).filter(Boolean).slice(0, A.MAX_NOTIFY);
  return { places, brief: n.brief && typeof n.brief === "object" ? spot(n.brief) : null, briefAt: at, email, ...keep };
}
// (kept, and signed in, sent to the account soon after: inStepSoon)
const saveSettings = () => { store.set("wx:settings", S.settings); S.f = makeFormat(S.settings); document.body.dataset.glass = S.settings.glass; inStepSoon(); };
const place = () => S.places[S.cur] || null;
const savePlaces = () => { store.set("wx:places", S.places); store.set("wx:cur", S.cur); inStepSoon(); };

/* ---------- start ---------- */
async function start() {
  // back from signing in on the account's page, with the code it handed back (taken out of the address at once)
  const signedIn = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash)?.[1];
  if (signedIn) history.replaceState(null, "", location.pathname + location.search);
  // (and the picture the account's page ended on, there since the first frame, taken on: early.js, arriveFrom; with no
  // code that could be one, done with at once)
  if (signedIn) arrival = arriveFrom(); else $("back-in")?.remove();
  loadSettings();
  S.places = (store.get("wx:places") || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  // (My Location as kept by a version from before it was kept to three decimal places, its notifications' too: so from
  // the first, as locate has it, not once it's next found, which may not be till it's asked for)
  const fine = [...S.places, ...S.settings.notify.places, S.settings.notify.brief].filter((x) => x?.gps && (r3(x.lat) !== x.lat || r3(x.lon) !== x.lon));
  for (const x of fine) { x.lat = r3(x.lat); x.lon = r3(x.lon); }
  if (fine.length) { store.set("wx:places", S.places); store.set("wx:settings", S.settings); }
  const cur = store.get("wx:cur");
  S.cur = Math.min(Number.isInteger(cur) && cur > 0 ? cur : 0, Math.max(0, S.places.length - 1));
  // My Location first (lists kept from before it was), still showing the same place
  const g = S.places.findIndex((x) => x.gps);
  if (g > 0) { const was = place(); S.places.unshift(...S.places.splice(g, 1)); S.cur = S.places.indexOf(was); savePlaces(); }
  wire();
  // (the cards in your order from the first, not moved there once the forecast's in)
  balance("", true);
  // a shared link: ?lat=…&lon=…&name=…
  const q = new URLSearchParams(location.search), lat = parseFloat(q.get("lat")), lon = parseFloat(q.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const name = (q.get("name") || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 60);
    history.replaceState(null, "", location.pathname);
    const p = { name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, region: "", lat, lon }, n = S.settings.notify;
    const near = (x, d = 0.02) => Math.abs(x.lat - lat) < d && Math.abs(x.lon - lon) < d;
    let have = S.places.findIndex((x) => !x.gps && near(x));
    // (a notification for My Location, one of this device's own: My Location, if it's still roughly there; within 0.2°,
    // as its notifications' place can be a square of the forecast's behind it, moved only as the square or name changes)
    if (have < 0 && [...n.places, n.brief].some((e) => e?.gps && near(e))) have = S.places.findIndex((x) => x.gps && near(x, 0.2));
    // (a first visit takes it as its place; a list of your own is added to only if you say so, so a link can't slip a
    // place into it, and on to every device your account's on)
    if (have >= 0) { S.cur = have; savePlaces(); }
    else if (!S.places.length || confirm(`Add “${p.name}” to your places?`)) addPlace(p);
  }
  let located = false;
  if (!S.places.length) {
    // first time: your location if you've already allowed it, else roughly where you are (from your connection), else London
    let granted = false;
    try { granted = (await navigator.permissions?.query({ name: "geolocation" }))?.state === "granted"; } catch (_) {}
    located = granted && await locate(true);
    if (!located) try {
      const r = await fetch("/api/weather/where", { signal: AbortSignal.timeout(4000) });
      const j = r.ok ? await r.json() : null;
      if (j && Number.isFinite(j.lat)) addPlace({ name: j.name, region: j.region || "", lat: j.lat, lon: j.lon, approx: true });
    } catch (_) {}
    if (!S.places.length) addPlace({ name: "London", region: "England, United Kingdom", lat: 51.5072, lon: -0.1276 });
  }
  // (found, it's asked for already)
  if (!located) go();
  // keep "My Location" current, quietly, if you've allowed it (what was kept shows meanwhile)
  if (!located && place()?.gps) try { if ((await navigator.permissions?.query({ name: "geolocation" }))?.state === "granted") locate(true); } catch (_) {}
  // and if its name couldn't be found when it was saved, try again from where it is (no need to ask for the location)
  const unnamed = !located && S.places.find((x) => x.gps && x.name === "My Location");
  if (unnamed) nameOf(unnamed.lat, unnamed.lon, { live: false }).then((n) => { if (n && unnamed.name === "My Location") { Object.assign(unnamed, n); savePlaces(); showPlace(); } });
  if ("serviceWorker" in navigator) {
    // a new version: its worker arrives with every file fresh, so if the app has only just been opened (started, or
    // brought back: opened()), start again on it; if it comes later, the next time it's opened
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!had) return;
      if (Date.now() - openedAt < 20e3 && !document.querySelector("dialog[open]") && !$("radar").classList.contains("radar-big")) location.reload();
      else newApp = true;
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
    setTimeout(keepNotify, 4000);
  }
  // your account: signed in, as it was last time, till the server says (and whether you've signed in elsewhere on the site)
  const k = store.get("wx:acct");
  if (k?.handle) S.acct = { ...profileOf(k), devices: k.devices || [], state: "ok" };
  drawMe(); IFL.built("weather", BUILD);
  if (signedIn) signedBack(signedIn); else pull();
}
function addPlace(p, makeCurrent = true) {
  const near = (a) => Math.abs(a.lat - p.lat) < 0.02 && Math.abs(a.lon - p.lon) < 0.02;
  // (a place chosen, or found by the phone: the rough guess from the connection made on the first visit goes, as it was
  // only ever a stand-in, and is often a city or two out)
  if (!p.approx && S.places.some((x) => x.approx && !near(x))) {
    const was = S.places[S.cur];
    S.places = S.places.filter((x) => !x.approx || near(x));
    S.cur = Math.max(0, S.places.indexOf(was));
  }
  let i = p.gps ? S.places.findIndex((x) => x.gps) : S.places.findIndex((x) => !x.gps && near(x));
  if (i >= 0) { S.places[i] = { ...S.places[i], ...p }; if (!p.approx) delete S.places[i].approx; }
  else if (p.gps) { S.places.unshift(p); i = 0; if (!makeCurrent) S.cur++; }      // My Location first, as on iOS
  else { S.places.push(p); i = S.places.length - 1; }
  if (makeCurrent) S.cur = i;
  savePlaces();
  return i;
}

/* ---------- loading ---------- */
let seq = 0;
// (fresh: called once the forecast itself is in, or has failed: the rest comes in behind it)
async function go(force = false, fresh = null) {
  const p = place(); if (!p) return;
  const my = ++seq;
  S.loading = true; S.error = null; S.asked = force;
  // (busy only while there's nothing on the page yet: a refresh in the background leaves what's there to be read)
  if (!S.wx) $("main").setAttribute("aria-busy", "true");
  $("refresh-btn").disabled = true;
  showPlace();
  const moved = !S.wx || cell(S.wx.place.lat, S.wx.place.lon) !== cell(p.lat, p.lon);
  // (the radar's say on its next hours, if it's had it lately: so it's drawn as it was, and as its page beside this one was)
  if (moved) { S.wx = S.base = null; S.allInsights = S.allWins = S.allDays = false; S.rain = rainOf(cell(p.lat, p.lon)); S.openIns.clear(); }
  // (a place with nothing kept: its first picture waits, a second at most from the forecast's coming, for the warnings
  // and the radar's say, which would otherwise come in over the top of it and push it down as it's read: paint)
  clearTimeout(S.hold?.timer);
  // (a new place's first picture straight away, not held back by the last place's drawing: paint)
  if (moved) { clearTimeout(S.paintT); S.painted = 0; }
  S.hold = moved && !S.wx && !hasKept(p) ? { id: cell(p.lat, p.lon), until: 0, timer: 0 } : null;
  // (meanwhile, a sky for the time of day, by this phone's clock: not a day's sky that turns to night as the forecast
  // comes, nor the last place's)
  if (S.hold) { const hr = new Date().getHours(); document.body.dataset.sky = hr >= 7 && hr < 19 ? "cloudy-day" : "cloudy-night"; }
  // (the same place asked for again, refreshed by hand or by itself: drawn once, when all of it's in, or after a few
  // seconds whatever's come, rather than part by part as each comes, the page changing under the eye each time; and
  // what asked for it (a pull to refresh) told once it's drawn, not before: paint)
  const again = !moved && !!S.wx;
  if (again) S.hold = { again: true, until: Date.now() + 2500, timer: 0 };
  if (!S.radar) S.radar = radar($("radar"), { lat: p.lat, lon: p.lon, time: (t) => S.f.time(t + (S.wx?.place.offset ?? 0) * 1000), day: (t) => S.f.dayName(t + (S.wx?.place.offset ?? 0) * 1000), miles: () => S.f.units.wind === "mph", credits: () => openCredits("map"),
    temp: (c) => S.f.temp(c), tempUnit: () => (S.f.units.temp === "f" ? "°F" : "°C"), windNum: (k) => Math.round(S.f.windNum(k)), windUnit: () => S.f.windUnit,
    // (rain expected here in the next two hours: worth the models' grid, where the radar has no track to follow)
    rainSoon: () => { const w = S.wx; if (!w) return true; const now = nowWall(w.place.offset); return (w.minutely || []).some((x) => x.precip >= 0.05) || I.hoursFrom(w, now, 3).some((x) => (x.precip ?? 0) >= 0.1 || (x.pop ?? 0) >= 40); } });
  else S.radar.place(p.lat, p.lon);
  try {
    const loading = load(p, (wx, how) => {
      if (!how.partial && !again) fresh?.();
      if (my !== seq || !wx) return;
      if (how.error) S.error = how.error; else if (!how.partial) S.tries = 0;
      if (runOut(wx)) { render(); return; }
      S.base = wx; S.stale = !!how.stale;      // (shaped as it's drawn: render)
      if (!how.stale && !how.partial) snapshotNow(wx);
      paint();
    }, { force });
    // (a new place: what's kept of it is already showing, drawn once; with nothing kept, placeholders meanwhile)
    if (moved && !S.wx) render();
    radarRain(p, my);
    await loading;
  } catch (e) {
    if (my === seq) {
      S.error = e;
      // (the forecast service busy, or not answering: asked again by itself in a while, half a minute then a minute)
      clearTimeout(S.again);
      if ((e.status === 429 || e.status >= 500) && (S.tries = (S.tries || 0) + 1) <= 4) S.again = setTimeout(() => { const q = place(); if (q && cell(q.lat, q.lon) === cell(p.lat, p.lon) && !S.wx) go(); }, S.tries > 1 ? 60e3 : 30e3);
      render();
    }
  } finally {
    if (my === seq) {
      S.loading = false;
      if (S.hold?.again) { S.hold.done = true; paint(); }
      $("main").setAttribute("aria-busy", "false"); $("refresh-btn").disabled = false; status();
      // (and now the places beside it)
      nearbySoon();
    }
    fresh?.();
  }
}

/* ---------- fresh whenever it's opened ---------- */
// Each time the app's opened (started, brought back to the front, restored by the browser, its window focused, the
// phone back online), and every minute while it's on screen: whatever's due is asked for again (data.js due: the
// forecast after 10 minutes, warnings after 5, the models, ensembles, air and sea hourly), the radar's say on the next
// hours after 5, and the radar card's frames; and on opening, a new version of the app itself (its worker: start)
let openedAt = Date.now(), newApp = false, checkedAt = 0, appAt = 0;
function opened() {
  if (document.visibilityState !== "visible") return;
  // (a new version came while it was open: it starts on it now, as it's opened)
  if (newApp) { location.reload(); return; }
  openedAt = Date.now();
  if ("serviceWorker" in navigator && Date.now() - appAt > 60e3) { appAt = Date.now(); navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}); }
  if (S.pullNext || Date.now() - pulledAt > 60e3) { S.pullNext = false; pull(); }
  check(true);
  keepNotify();
}
function check(opening = false) {
  const p = place();
  if (!p || S.loading || document.visibilityState !== "visible" || (!opening && Date.now() - checkedAt < 50e3) || Date.now() - checkedAt < 5e3) return;
  checkedAt = Date.now();
  if (!S.wx || due(p)) { go(); return; }
  if (!S.rain || Date.now() - S.rain.asked > 5 * 60e3) radarRain(p, seq);
  // (the radar card's frames, if it's on screen: scrolled to, it sees to them itself)
  const r = $("radar").getBoundingClientRect();
  if (r.bottom > 0 && r.top < innerHeight) S.radar?.refresh();
  status();
}
document.addEventListener("visibilitychange", opened);
addEventListener("pageshow", (e) => { if (e.persisted) opened(); });
addEventListener("focus", opened);
addEventListener("online", () => { check(true); keepNotify(true); });

// the forecast with its highs and lows tuned to how each model has done here (weather/skill.js), unless that's turned off
// The forecast tuned for here as Settings has it (its highs and lows: applyTuning), steadied from three days on with
// what the page said of those days a day and two days ago (skill.js steady), and its hours from now on as the
// airport's reports have found the forecast here (refine)
const tunedOnly = (wx, today) => (S.settings.tune !== false && wx.skill?.skill ? applyTuning(wx, wx.skill.skill, today) : wx);
const tuned = (wx) => {
  if (!wx) return wx;
  const now = nowWall(wx.place.offset), today = keyOf(now);
  const s = steady(tunedOnly(wx, today), saidBefore(store.get(saidKey(wx)), Date.now()), today);
  return S.settings.tune !== false && s.skill?.local ? refine(s, s.skill.local, now) : s;
};
// what the page said of the days ahead (before steadying them), kept three days, one every three hours: the latest of
// each three hours (so one kept before the tuning came in is replaced by the tuned)
const saidKey = (wx) => `wx:said:${cell(wx.place.lat, wx.place.lon)}`;
function keepSaid(wx) {
  const at = Date.now(), k = saidKey(wx), list = (store.get(k) || []).filter((x) => at - x.at < 3 * DAY);
  const today = keyOf(nowWall(wx.place.offset)), days = daysSaid(tunedOnly(wx, today), today);
  if (list.length && at - list[list.length - 1].from < 3 * HOUR) list[list.length - 1] = { ...list[list.length - 1], at, days };
  else list.push({ at, from: at, days });
  store.set(k, list);
}
// and its next couple of hours' rain led by the radar, where it sees (rainmap.js blend), while its frame is recent; and
// its rain one story throughout (agree.js)
const shaped = (wx, r = S.rain) => {
  const t = tuned(wx);
  if (!t) return t;
  const led = r && r.id === cell(t.place.lat, t.place.lon) && Date.now() - r.at <= 40 * 60e3 ? { ...t, minutely: blend(t.minutely, r.steps, r.at, t.place.offset) } : t;
  return oneRain(led, nowWall(led.place.offset));
};
// The radar's say on the next couple of hours here (radar.js rainAt), asked for with each forecast, and the page drawn
// again with it (unless the place has changed, or the forecast been asked for again, meanwhile)
// (each place's, as last had: a place beside the one shown asked too, so it's drawn there as it will be: readyNearby)
const rains = new Map();
const rainOf = (id) => { const r = rains.get(id); return r && Date.now() - r.asked < 5 * 60e3 ? r : null; };
async function radarRain(p, my) {
  const r = await rainAt(p.lat, p.lon).catch(() => null);
  if (my !== seq) return;
  // (none counts as asked too, so it's not asked again every minute while the radar's away; and the page is drawn
  // again only if what the radar says has changed)
  const was = S.rain, id = cell(p.lat, p.lon), said = r ? JSON.stringify([r.at, r.steps]) : "";
  S.rain = { ...r, id, asked: Date.now(), said };
  rains.set(id, S.rain);
  if (S.base && !(was?.id === id && was.said === said)) paint();
}
// The page drawn, unless a new place's first picture is still waiting (go): for its warnings and the radar's say, or
// until a second after its forecast came, whichever's first
function paint() {
  const h = S.hold;
  if (h) {
    const ready = h.again ? h.done : S.base?.official != null && S.rain?.id === h.id;
    h.until ||= Date.now() + 1000;
    clearTimeout(h.timer);
    if (!ready && Date.now() < h.until) { h.timer = setTimeout(paint, h.until - Date.now()); return; }
    // (held: drawn now, not waiting its turn)
    S.hold = null; S.painted = 0;
  }
  // (not while the places are being swiped through, under the finger: once it's still; landed on one, at once)
  clearTimeout(S.paintT);
  if (!snapping && swiping()) { S.paintT = setTimeout(paint, 250); return; }
  // (parts coming in close together, as they do, drawn together: twice a second at most, rather than the whole page
  // over again for each, moving under the eye each time)
  const wait = (S.painted || 0) + 500 - Date.now();
  if (wait > 0) { S.paintT = setTimeout(paint, wait); return; }
  S.painted = Date.now();
  render();
}

// "since you last looked": a few snapshots of the days ahead as the page showed them, per place (snap2: since a day's
// rain chance has been of rain at some point in it)
function snapshotNow(wx) {
  keepSaid(wx);
  wx = shaped(wx);
  const k = `wx:snap2:${cell(wx.place.lat, wx.place.lon)}`, now = nowWall(wx.place.offset), list = store.get(k) || [];
  if (!list.length || now - list[list.length - 1].at >= HOUR) { list.push(I.snapshot(wx, now)); store.set(k, list.slice(-6)); }
}
function baseline(wx, now) {
  const list = store.get(`wx:snap2:${cell(wx.place.lat, wx.place.lon)}`) || [];
  return list.filter((s) => s.at <= now - 2 * HOUR && s.at >= now - 3 * DAY).pop() || null;
}

/* ---------- drawing ---------- */
// (the line under a place's name in the bar)
const subOf = (p) => (p ? (p.gps && p.name !== "My Location" ? "My Location" : p.approx ? "Roughly where you are" : p.region || "") : "");
function showPlace() {
  const p = place(), btn = $("place-btn"), named = btn.classList.contains("named");
  // (its name faded in once it's known, as the app starts; found later (My Location's, say), the new one rising in)
  swap($("place-name"), p ? p.name : "Weather", named && !snapping);
  $("sr-place").textContent = p ? p.name : "your place";
  const sub = subOf(p);
  swap($("place-sub"), sub, named && !snapping && !document.querySelector(".top").classList.contains("collapsed"));
  btn.classList.toggle("no-sub", !sub);
  if (p) btn.classList.add("named");
  document.title = p ? `${p.name} · Weather` : "Weather";
  drawDots();
}
// the saved places as dots above the temperature, the one showing lit (an arrow for My Location): the same dots kept,
// the light moving along them (styles.css), unless the places themselves have changed
function drawDots() {
  const box = $("dots"), n = S.places.length, sig = S.places.map((p) => (p.gps ? "g" : ".")).join("");
  box.hidden = n < 2;
  if (n < 2) return;
  if (box._sig !== sig) {
    box._sig = sig;
    box.replaceChildren(...S.places.map((p) => h("i", { class: p.gps ? "gps" : null, svg: p.gps ? glyph("here", 9) : null })));
  }
  [...box.children].forEach((d, i) => d.classList.toggle("on", i === S.cur));
}
// Pull down past the top and let go, to refresh, as iOS's lists do. (On iPhone the page stretches past its top as
// it's pulled, its scroll going below zero. Elsewhere it doesn't, and Refresh at the foot of the page does the same.)
// iOS's spinner comes into the gap that opens above the bar, a tick at a time as the page is pulled, all of them once
// letting go would refresh. Let go then, and the page settles with the spinner held in a gap at its top, turning,
// until the forecast itself is in (the rest comes in behind it), and at least long enough to be seen; then the page
// glides back up as it goes. Scrolled on meanwhile, the gap closes and it goes; and it gives up after 15 seconds
// whatever happens. Let go of short of refreshing, it just goes.
function pullToRefresh() {
  const page = document.querySelector(".page");
  const ring = h("div", { class: "ptr", "aria-hidden": "true" });
  // (the ticks, from the top round; spinning, each a little fainter than the one ahead of it)
  ring.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28">${Array.from({ length: 8 }, (_, i) => `<line x1="14" y1="3.2" x2="14" y2="8.6" transform="rotate(${i * 45} 14 14)"/>`).join("")}</svg>`;
  ring.querySelectorAll("line").forEach((l, i) => { l.style.setProperty("--i", String(i)); l.style.setProperty("--o", (1 - ((8 - i) % 8) * 0.1).toFixed(1)); });
  document.body.append(ring);
  const FAR = 80, ROOM = 56, LEAST = 650;      // the pull that refreshes, the gap it's held open by, the least it spins
  let touching = false, armed = false, busy = false, held = false, ending = false, cap = 0, since = 0;
  // (in the middle of the gap above the bar, with the page pulled down y pixels: the gap is y and the bar's own 10)
  const at = (y, scale, opacity) => { ring.style.transform = `translateY(${(y / 2 - 9).toFixed(1)}px) scale(${scale})`; ring.style.opacity = String(opacity); };
  const follow = () => {
    const y = Math.max(0, -scrollY), k = Math.min(1, y / FAR);
    ring.style.setProperty("--pull", k.toFixed(3));
    at(y, 0.72 + k * 0.28, Math.min(1, Math.max(0, (y - 12) / 28)).toFixed(3));
    if (k >= 1 && !armed) { armed = true; ring.classList.add("armed"); }
    else if (k < 1 && armed) { armed = false; ring.classList.remove("armed"); }
  };
  const letGo = () => { held = false; page.classList.remove("held"); };
  const done = () => {
    if (!busy || ending) return;
    ending = true;
    setTimeout(() => {
      busy = ending = false; clearTimeout(cap);
      ring.classList.remove("busy");
      at(held ? ROOM : 0, 0.5, 0);
      letGo();
    }, Math.max(0, since + LEAST - performance.now()));
  };
  addEventListener("touchstart", (e) => {
    touching = !busy && e.touches.length === 1 && scrollY <= 4 && !document.querySelector("dialog[open]") && !$("radar").classList.contains("radar-big");
    if (touching) ring.classList.add("follow");
  }, { passive: true });
  addEventListener("scroll", () => {
    if (touching) follow();
    else if (held && scrollY > 2) { letGo(); at(0, 0.5, 0); }
  }, { passive: true });
  const end = () => {
    if (!touching) return;
    touching = false;
    ring.classList.remove("follow", "armed");
    if (!armed) { at(Math.max(0, -scrollY), 0.5, 0); return; }
    armed = false; busy = held = true; since = performance.now();
    ring.classList.add("busy"); page.classList.add("held");
    at(ROOM, 1, 1);
    cap = setTimeout(done, 15000);
    go(true, done).finally(done);
  };
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", end, { passive: true });
}
// Let go of a swipe, the rest of the way goes as a spring (critically damped: no bounce) that starts at the speed it was
// let go at, as iOS's paging does, so nothing jumps ahead or stalls as the finger lifts: v, pixels a millisecond towards
// where it's going (less than none: away from it, at first); dist, the pixels there; span, the furthest any of it moves
// (for when it's near enough there to stop). As an animation's duration and easing: a CSS linear() curve, sampled from
// the spring (where there isn't linear(), `ease` instead)
const curves = !!globalThis.CSS?.supports?.("animation-timing-function", "linear(0, 1)");
function glide(v, dist, ease, span = dist) {
  const u = dist > 1 ? Math.min(0.08, Math.max(-0.04, v / dist)) : 0, k = Math.max(0.022, u);
  const left = (t) => (1 + (k - u) * t) * Math.exp(-k * t);
  let end = 16;
  while (Math.abs(left(end)) * Math.max(span, dist) > 0.5 && end < 800) end += 4;
  if (!curves) return { duration: end, easing: ease };
  return { duration: end, easing: `linear(${Array.from({ length: 31 }, (_, i) => (i === 30 ? 1 : +(1 - left((end * i) / 30)).toFixed(4))).join(", ")})` };
}
// how fast a swipe was let go: pixels a millisecond over its last moment, up to the finger lifting (held still a moment
// before it lifted, it wasn't flicked, as on iOS). trail: [[ms, x], ...] as it moved
function flickSpeed(trail) {
  const now = performance.now(), last = trail.filter(([t]) => now - t <= 90);
  return last.length > 1 ? (last[last.length - 1][1] - last[0][1]) / (now - last[0][0]) : 0;
}
// Swipe across the weather now to the next or previous saved place, as iOS Weather pages through its cities (the
// places sheet is still the way to choose one; this is the shortcut). The places either side are drawn beside it in a
// scroller (index.html .pager), so the swipe is the browser's own scroll: it moves with the finger from the first
// touch, carries on at the speed it's let go and stops at the next place, giving at the first and last, however busy
// the page is meanwhile. What's drawn there is that place's weather now as it'll be drawn once it's turned to (its
// forecast as kept, shaped as the page shapes it: made ready when the page is idle, prepare; until then, its weather
// now at a glance). On a phone upright, as iOS does, the whole page goes: its cards along with it, the next place's
// whole page coming in beside it, cards and all (drawWhole), and a swipe across the cards turns it too (cardSwipe);
// wide, or on its side, the cards fade as it goes. The sky and the name in the bar turn to the next place's meanwhile
// (styles.css, --cur). Landed, that place is the one showing (commit), drawn in this one's place as the scroller's put
// back, in the one frame, so nothing moves. The places either side kept fresh meanwhile, in the background, so what's
// there to swipe to is up to date (readyNearby)
const nearby = () => [S.places[S.cur - 1] || null, S.places[S.cur + 1] || null];
// (where it can't be led by the scroller's own timeline, done here as it scrolls: follow)
const linked = !!globalThis.CSS?.supports?.("timeline-scope: --a") && CSS.supports("animation-range: cover 0% cover 100%");
let held = false, heldAt = 0, movedAt = 0, dirty = false, dragging = false, settleT = 0, heroLeft = 0, pageW = 0, snapping = false;
const swiping = () => held || performance.now() - movedAt < 160, pagerBusy = () => swiping() || turning;
// (one page at a time: a phone upright, where the page goes whole as it's swiped)
const onePage = () => !twoCols.matches && !onSide.matches;
// a place's weather now, the hero's own lines (as hero has them), and its sky
function heroView(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now);
  if (!c) return null;
  const said = I.headline(wx, now, f), [, lead, rest] = /^(.+?[.!?])\s+(?=[A-Z])(.*)$/s.exec(said) || [, said, ""];
  return { temp: f.temp(c.temp), icon: iconOf(c.code, c.isDay), cond: label(c.code, c.isDay), said, lead, rest, sky: skyFor(wx, now),
    hl: d ? `H ${f.temp(d.tmax)}  L ${f.temp(d.tmin)}  ·  Feels like ${f.temp(c.feels)}` : `Feels like ${f.temp(c.feels)}` };
}
// (what's made ready of each, kept while it's the same forecast in the same units: its forecast as kept read once)
const ready = new Map();
// (only: what's ready, as it is, if anything, for drawing at once; otherwise made again if what it's from has changed:
// its forecast, how the models have done there or its climate (stale), its radar say, the units, the minute)
function prepare(q, only = false) {
  const id = cell(q.lat, q.lon), k = peek(q), had = ready.get(id), min = Math.floor(Date.now() / 60e3), rain = rainOf(id);
  if (!k) return null;
  if (only) return had && had.f === S.f ? had.v : null;
  const kept = had && had.at === k.at && !had.stale;
  if (kept && had.f === S.f && had.rain === rain && had.min === min) return had.v;
  const base = kept ? had.base : keptWx(q);
  if (!base || runOut(base)) return null;
  const wx = shaped(base, rain), v = heroView(wx, nowWall(wx.place.offset));
  ready.set(id, { at: k.at, f: S.f, min, base, v, rain });
  return v;
}
// (something new for a place beside the one shown: what's ready of it, and its whole page, made again when it's idle)
const news = new Map();
const renewed = (id) => { news.set(id, Date.now()); const r = ready.get(id); if (r) r.stale = true; };
// (one with nothing kept: its weather now as the list of places has it)
function glanceView(q) {
  const k = glance(q), f = S.f;
  return k ? { temp: f.temp(k.temp), icon: iconOf(k.code, k.isDay), cond: label(k.code, k.isDay), lead: "", rest: "", sky: skyOf(k.code, k.isDay),
    hl: k.hi != null && k.lo != null ? `H ${f.temp(k.hi)}  L ${f.temp(k.lo)}` : "" } : null;
}
// a place's weather now as the hero draws it (v: its heroView, or at a glance), the place i of the saved ones
const heroBits = (v, i) => [
  h("div", { class: "dots" }, S.places.map((p, j) => h("i", { class: [p.gps ? "gps" : "", j === i ? "on" : ""].join(" ").trim() || null, svg: p.gps ? glyph("here", 9) : null }))),
  h("div", { class: "hero-row" }, h("div", { class: "hero-temp" }, v?.temp || "–"), h("div", { class: "pg-icon", svg: v ? weatherIcon(v.icon, 76) : null })),
  h("div", { class: "hero-cond" }, v?.cond || ""),
  h("div", { class: "hero-hl" }, v?.hl || ""),
  h("p", { class: "brief" }, v?.lead ? h("b", {}, v.lead) : null, v?.rest ? ` ${v.rest}` : null)];
const heroSig = (v, i) => JSON.stringify([i, S.places.map((p) => (p.gps ? "g" : ".")).join(""), v]);
// a place either side, drawn as the hero would draw it (only: from what's made ready already, not made now)
function drawPage(el, q, i, only) {
  const v = prepare(q, only) || glanceView(q), sig = heroSig(v, i);
  if (el._sig === sig) return v;
  el._sig = sig;
  el.replaceChildren(...heroBits(v, i));
  return v;
}
// A place's whole page as it'll be drawn once it's turned to, for beside this one (index.html .pv): a copy of the page's
// cards drawn by the page's own drawing, each part as it draws itself but aimed at the copy (R, which $ looks in), with
// the place's forecast as kept and as a place is first shown (go: nothing open or folded out, the view it calls for),
// nothing moving and no chart drawing in; its ids then put by (data-pid), so the page's own are still the page's. Kept
// for each place while it's the same forecast, the same minute, the same page (pages): drawn again each minute, as the
// page's own "in 20 minutes" and its charts' Now are (the minute's tick), so it says what it will when it's landed on
const pages = new Map();
const pageKey = (q) => { const k = peek(q), id = cell(q.lat, q.lon); return k && JSON.stringify([k.at, news.get(id) || 0, rainOf(id)?.said, Math.floor(Date.now() / 60e3), S.f.units, S.settings.layout, S.settings.tune, innerWidth, S.modeChosen && S.mode]); };
const putIds = (root) => { for (const x of root.querySelectorAll("[id]")) { x.dataset.pid = x.id; x.removeAttribute("id"); } };
// (the page's cards as they are, copied: without the placeholders, the map (there's one only: a picture of it as it was
// last shown for that place, id, if it's been), or anything about to move)
const stills = new Map();
function copyPage(blank = false, id = "") {
  const col = $("main").querySelector(":scope > .col-a").cloneNode(true), still = stills.get(id);
  for (const x of col.querySelectorAll(".skeleton")) x.remove();
  for (const x of col.querySelectorAll(".radar-map")) x.replaceChildren(...(still ? [h("img", { class: "radar-still", src: still, alt: "" })] : []));
  const note = col.querySelector(".radar-note > span"); if (note) note.textContent = "";
  // (and, to be drawn afresh, what's drawn into what's there: the warnings, kept one by one as they're drawn again)
  if (blank) for (const c of col.querySelectorAll("#alerts, #hourly-chart, #nowcast-chart, #climate-body > .range")) c.replaceChildren();
  return col;
}
const stillCopy = (col) => { putIds(col); for (const x of col.querySelectorAll(".rise")) x.classList.remove("rise"); for (const x of col.querySelectorAll(".card, .ins, .tile")) x.classList.add("settled"); return col; };
function drawWhole(pv, q) {
  const id = cell(q.lat, q.lon), key = pageKey(q), base = ready.get(id)?.base || keptWx(q);
  if (!key || !base || runOut(base)) return false;
  const rain = rainOf(id), keep = { wx: S.wx, base: S.base, radar: S.radar, say: S.say, more: S.more, mode: S.mode, rain: S.rain, allInsights: S.allInsights, allWins: S.allWins, allDays: S.allDays, openIns: S.openIns }, w0 = insWidth;
  Object.assign(S, { base, rain, radar: null, allInsights: false, allWins: false, allDays: false, openIns: new Set() });
  const wx = (S.wx = shaped(base)), now = nowWall(wx.place.offset), col = copyPage(true, id), said = h("p", { id: "brief", hidden: true });
  said.dataset.said = heroView(wx, now)?.said || "";
  // (beside its own weather now, kept: placePages)
  const top = pv.querySelector(":scope > .pv-hero");
  pv.replaceChildren(...(top ? [top] : []), col, said);
  R = pv; hush(true);
  try {
    showMode(S.modeChosen ? keep.mode : viewFor(wx, now));
    for (const part of [() => nowcast(wx, now, { fresh: true }), () => cards(wx, now, true), () => hourly(wx, now), () => daily(wx, now), () => windows(wx, now), () => accuracy(wx), () => climate(wx, now), () => tiles(wx, now), fits])
      try { part(); } catch (e) { console.error(e); }
  } finally { R = null; hush(false); Object.assign(S, keep); insWidth = w0; }
  said.remove();
  pages.set(id, { key, nodes: [stillCopy(col)] });
  return true;
}
// The places either side's whole pages put beside this one: each its own weather now, as the hero would draw it, over
// its cards, where they're drawn (placeholders till they are); so each card is where it'll be when that place is the one
// showing, under its own weather now (a longer briefing, say, a line further down), not under this one's
function placePages(a, b, va, vb) {
  for (const [pv, q, v, i] of [[document.querySelector(".pv-prev"), a, va, S.cur - 1], [document.querySelector(".pv-next"), b, vb, S.cur + 1]]) {
    const id = q && onePage() ? cell(q.lat, q.lon) : "", e = id ? pages.get(id) : null, want = e || id, top = id ? heroSig(v, i) : "";
    if (pv._for === want && pv._top === top) continue;
    pv._for = want; pv._id = id; pv._top = top; pv.dataset.whole = e ? "1" : "";
    // (with the hero's line under its briefing, as tall as it is, said or not; faded as far as the page is scrolled, as
    // the scroller is: wire's onScroll)
    const now = id ? h("div", { class: "pv-hero" }, ...heroBits(v, i), h("p", { class: "status" })) : null;
    now?.style.setProperty("--c", $("pager").style.getPropertyValue("--c") || "0");
    pv.replaceChildren(...(id ? [now, ...(e ? e.nodes : [h("div", { class: "col" }, $("main").querySelector(":scope > .col-a > .skeleton").cloneNode(true))])] : []));
  }
  keepNear(pages); keepNear(stills);
}
// (what's kept of each saved place, its whole page and its weather now made ready, kept for all of them, not just the
// two either side, so a place a swipe or two away has its page ready as it comes: a few at most, the nearest)
function keepNear(m) {
  const at = new Map(S.places.map((q, i) => [cell(q.lat, q.lon), Math.abs(i - S.cur)]));
  for (const id of m.keys()) if (!at.has(id)) m.delete(id);
  if (m.size > 6) for (const id of [...m.keys()].sort((x, y) => at.get(y) - at.get(x)).slice(0, m.size - 6)) m.delete(id);
}
// The places either side laid out beside the weather now (as the page is drawn: from what's ready; force, as a place
// is landed on); not while it's being swiped, when it's done once it's still
function layoutPager(force = false, only = true) {
  const el = $("pager");
  if (!force && pagerBusy()) { dirty = true; return; }
  dirty = false;
  const [a, b] = nearby(), pp = el.querySelector(".pg-prev"), pn = el.querySelector(".pg-next"), shape = `${!!a}${!!b}`;
  pp.hidden = !a; pn.hidden = !b;
  const va = a && drawPage(pp, a, S.cur - 1, only), vb = b && drawPage(pn, b, S.cur + 1, only);
  document.querySelector(".sky-prev").dataset.sky = va?.sky || "";
  document.querySelector(".sky-next").dataset.sky = vb?.sky || "";
  document.querySelector(".pg-name-prev").textContent = a ? a.name : "";
  document.querySelector(".pg-name-next").textContent = b ? b.name : "";
  document.querySelector(".pg-sub-prev").textContent = subOf(a);
  document.querySelector(".pg-sub-next").textContent = subOf(b);
  pillWidths(a, b, va, vb);
  placePages(a, b, va, vb);
  keepNear(ready);
  if (force || el._shape !== shape) { el._shape = shape; centre(); }
}
// How wide the pill in the bar is for each place, and its name in it (the arrow after it), so as the page's swiped they
// go from this place's to the next one's along with it, its name and the line under it crossfading in them (styles.css
// pill-w, name-w): this place's as it's laid out, the places either side's from their words, measured in its type, as
// it would lay them out (the line under the name its region, or what's said once the bar's taken up the temperature;
// the pill no wider than it can be)
let probe = null, pillSig = "", pillW = null;
function pillWidths(a, b, va, vb) {
  const pill = $("place-btn"), name = $("place-name"), top = document.querySelector(".top");
  const sig = JSON.stringify([a?.name, subOf(a), va?.temp, va?.cond, b?.name, subOf(b), vb?.temp, vb?.cond, name.textContent, $("place-sub").textContent, $("place-now").textContent, innerWidth]);
  if (sig === pillSig) return;
  pillSig = sig;
  // (words measured in the bar itself, unseen, in the type of the part they'd be in: a canvas can't be relied on to take
  // the system's font as the page names it; and a pixel over, so nothing's cut short by a fraction)
  if (!probe) { probe = h("span", { class: "pill-probe", "aria-hidden": "true" }); document.querySelector(".place-name").append(probe); }
  const w = (text, el) => {
    if (!text) return 0;
    const cs = getComputedStyle(el);
    Object.assign(probe.style, { fontStyle: cs.fontStyle, fontWeight: cs.fontWeight, fontSize: cs.fontSize, fontFamily: cs.fontFamily, letterSpacing: cs.letterSpacing });
    probe.textContent = text;
    return (parseFloat(getComputedStyle(probe).width) || 0) + 1;
  };
  const cs = getComputedStyle(top), room = top.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - document.querySelector(".top-actions").offsetWidth - (parseFloat(cs.columnGap) || 10);
  const most = Math.min(innerWidth * 0.72, room), edge = 36, arrow = 13;
  // (as laid out, not as anything has it moved or scaled meanwhile)
  const cur = { w: parseFloat(getComputedStyle(pill).width), n: parseFloat(getComputedStyle(name).width) };
  const of = (q, v) => {
    if (!q) return cur;
    // (the line under the name as it is till the bar takes up the temperature: only then what's said there takes room)
    const sub = subOf(q), n = Math.min(w(q.name, name), most - edge - arrow), line = sub ? w(sub, $("place-sub")) : 0;
    return { w: Math.min(most, Math.max(n + arrow, line) + edge), n };
  };
  const p = of(a, va), q = of(b, vb);
  pillW = { prev: p, cur, next: q };
  // (and, as this one's fading, as wide as the wider of it and the next: styles.css pill-w)
  const most2 = (x) => ({ w: Math.max(cur.w, x.w), n: Math.max(cur.n, x.n) });
  for (const [k, x] of [["prev", p], ["cur", cur], ["next", q], ["prev-max", most2(p)], ["next-max", most2(q)]]) { pill.style.setProperty(`--w-${k}`, `${x.w.toFixed(1)}px`); pill.style.setProperty(`--n-${k}`, `${x.n.toFixed(1)}px`); }
}
// the scroller put back to the weather now
function centre() {
  const el = $("pager");
  heroLeft = el.querySelector(".hero").offsetLeft; pageW = el.clientWidth;
  if (Math.abs(el.scrollLeft - heroLeft) > 1) el.scrollLeft = heroLeft;
}
function dragOn() {
  if (dragging || (!S.places[S.cur - 1] && !S.places[S.cur + 1])) return;
  dragging = true; document.querySelector(".top").classList.add("swiping"); document.querySelector(".sky").classList.add("swiping");
}
function dragOff() {
  if (!dragging) return;
  dragging = false; document.querySelector(".top").classList.remove("swiping"); document.querySelector(".sky").classList.remove("swiping");
  $("pager").classList.remove("pg-led");
  if (!linked) {
    for (const x of document.querySelectorAll("main > .col, .pv, .sky-alt, #place-name, .pg-name, #place-sub, .pg-sub")) { x.style.translate = ""; x.style.opacity = ""; }
    $("place-btn").style.width = $("place-name").style.width = ""; document.querySelector(".place-line").style.alignSelf = "";
  }
}
// (as styles.css has it: the cards along with it (and the next place's beside them; or, wide, fading), the next sky over
// this one, the next name over this one)
let followRaf = 0;
function follow() {
  followRaf ||= requestAnimationFrame(() => {
    followRaf = 0;
    if (!dragging) return;
    const x = Math.max(-1, Math.min(1, ($("pager").scrollLeft - heroLeft) / (pageW || 1))), ax = Math.abs(x), o = (n) => String(Math.max(0, Math.min(1, n)).toFixed(3));
    const whole = onePage() && !calm.matches, vw = (n) => `${n.toFixed(2)}vw 0`;
    for (const c of document.querySelectorAll("main > .col")) { c.style.translate = calm.matches ? "" : vw(-x * 100); c.style.opacity = whole ? "" : o(1 - 2 * ax); }
    if (whole) { document.querySelector(".pv-prev").style.translate = vw(-100 - x * 100); document.querySelector(".pv-next").style.translate = vw(100 - x * 100); }
    document.querySelector(".sky-prev").style.opacity = o(-x); document.querySelector(".sky-next").style.opacity = o(x);
    $("place-name").style.opacity = o(1 - 5 * ax);
    document.querySelector(".pg-name-prev").style.opacity = o(-2 * x - 1); document.querySelector(".pg-name-next").style.opacity = o(2 * x - 1);
    // (and the line under it, the same, and the pill and the name in it from this place's width to the next one's, unless
    // the bar's taken up the temperature in its place)
    if (!document.querySelector(".top").classList.contains("collapsed")) {
      $("place-sub").style.opacity = o(1 - 5 * ax);
      document.querySelector(".pg-sub-prev").style.opacity = o(-2 * x - 1); document.querySelector(".pg-sub-next").style.opacity = o(2 * x - 1);
      if (pillW) {
        // (as styles.css pill-w: towards the wider of the two as this one fades, then to the next one's before it comes in)
        const to = x > 0 ? pillW.next : pillW.prev, lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
        const at = (k) => { const m = Math.max(pillW.cur[k], to[k]); return `${(ax <= 0.2 ? lerp(pillW.cur[k], m, ax / 0.2) : lerp(m, to[k], (ax - 0.2) / 0.3)).toFixed(1)}px`; };
        $("place-btn").style.width = at("w"); $("place-name").style.width = at("n"); document.querySelector(".place-line").style.alignSelf = "stretch";
      }
    }
  });
}
const settleSoon = () => { clearTimeout(settleT); settleT = setTimeout(landed, 180); };
// stopped: on the weather now, it's left be; on a place either side, that's the one showing now
function landed() {
  clearTimeout(settleT);
  // (not with a finger still on it; unless it's been a good while, and its lifting was missed)
  if (held && performance.now() - Math.max(heldAt, movedAt) < 4000) { settleT = setTimeout(landed, 500); return; }
  held = false;
  // (where the weather now is in it, as laid out: x, in pages along, past it towards the next)
  const el = $("pager"), r = el.getBoundingClientRect(), hr = el.querySelector(".hero").getBoundingClientRect(), w = hr.width || 1;
  const x = (r.left - hr.left) / w, k = Math.max(-1, Math.min(1, Math.round(x))), off = Math.abs(x - k) * w;
  // (still on its way; or, still a while between two, the nearer)
  if (off > 2 && performance.now() - movedAt < 600) { settleSoon(); return; }
  if (!k || !S.places[S.cur + k]) { dragOff(); if (Math.abs(x) * w > 1) centre(); if (dirty) layoutPager(); return; }
  el.classList.remove("pg-led");
  commit(k);
}
// Landed on the next place: it's drawn in the weather now's place (as it was drawn beside it: no roll, no crossfade,
// its sky at once, its charts drawn, not drawing in), the scroller put back to it and the cards coming up under it
function commit(dir) {
  const i = S.cur + dir, root = document.documentElement;
  if (i < 0 || i >= S.places.length) return;
  root.classList.add("pg-snap"); hush(true);
  // (the place left, now beside it: its forecast as read already, made ready from that when it's idle)
  const was = place(), k = was && peek(was), whole = onePage() && document.querySelector(dir > 0 ? ".pv-next" : ".pv-prev").dataset.whole === "1";
  // (its weather now as the hero had it, for beside the one landed on)
  if (k && S.base?.fetchedAt === k.at) ready.set(cell(was.lat, was.lon), { at: k.at, f: S.f, min: Math.floor(Date.now() / 60e3), base: S.base, v: S.wx ? heroView(S.wx, nowWall(S.wx.place.offset)) : null, rain: rainOf(cell(was.lat, was.lon)) });
  // (and its page as it was, a copy, for beside the one landed on: unless something on it is open or folded out, which
  // it won't be when it's turned back to (go), when it's drawn again, when the page is idle)
  if (was && onePage() && S.wx && !S.allInsights && !S.allWins && !S.allDays && !S.openIns.size) pages.set(cell(was.lat, was.lon), { key: pageKey(was), nodes: [stillCopy(copyPage(false, cell(was.lat, was.lon)))] });
  else if (was) pages.delete(cell(was.lat, was.lon));
  snapping = true;
  S.cur = i; savePlaces();
  try { go(); } finally { snapping = false; }
  // (the swipe's own styles off first: what's now showing measured as it's laid out, pillWidths)
  dragOff();
  layoutPager(true);
  // (its page wasn't beside it yet: its cards come up under it)
  if (!whole) { for (const c of document.querySelectorAll("main > .col")) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: EASE_OUT }); arrive(true); }
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("pg-snap")));
  setTimeout(() => hush(false), 400);
  nearbySoon(true);
}
// the places either side made ready, and kept fresh (the forecast and the warnings, as the page asks for them: data.js
// due), when the page is idle a moment after it's drawn; then drawn beside it again, once it's still
let nearbyT = 0;
const fetchedAt = new Map(), asking = new Set();
let nearbyLoading = false;
// (soon: as a place is landed on, or the page first drawn: the places now beside it drawn straight after, both, not
// waiting till the page is idle, so there's no placeholder to swipe to; one a swipe away may be swiped to in a moment)
let nearbyFirst = true, nearbyNow = false;
function nearbySoon(soon = false) {
  if (nearbyFirst && S.wx) { nearbyFirst = false; soon = true; }
  // (not put off by the page drawn again meanwhile)
  if (nearbyNow && !soon) return;
  clearTimeout(nearbyT); nearbyNow = soon;
  nearbyT = soon ? setTimeout(() => readyNearby(true), 250) : setTimeout(() => (globalThis.requestIdleCallback || ((f) => setTimeout(f, 0)))(() => readyNearby(), { timeout: 2000 }), 600);
}
function readyNearby(soon = false) {
  nearbyNow = false;
  if (document.visibilityState !== "visible") return;
  // (not while the page's own forecast is coming in, or it's being swiped: the page's own first)
  if (pagerBusy() || S.loading) { nearbySoon(soon); return; }
  // (a picture of the map as it is, for this place's page as it's shown beside the next one's: not as it's landed on,
  // the map still on its way to it; and taken again only once the map's been drawn again since, mapgl.js still, so not
  // for each of the minute's passes, a page beside drawn in each, with nothing on it changed; a lone place's too, for
  // its page beside the next one added)
  const here = place();
  if (here && !soon && onePage() && S.wx && S.radar?.still) S.radar.still().then((u) => { if (u && place() === here) stills.set(cell(here.lat, here.lon), u); }, () => {});
  const list = nearby().filter(Boolean);
  for (const q of list) prepare(q);
  layoutPager(false, true);
  // (a whole page, one at a time, each when the page is idle; or straight after a place is landed on, both)
  if (onePage()) for (const pv of document.querySelectorAll(".pv")) {
    const q = list.find((x) => cell(x.lat, x.lon) === pv._id);
    if (!q || pages.get(pv._id)?.key === pageKey(q)) continue;
    if (drawWhole(pv, q)) { pv._for = pages.get(pv._id); pv.dataset.whole = "1"; if (!soon) { nearbySoon(); break; } }
  }
  for (const q of list) {
    const id = cell(q.lat, q.lon);
    // (the radar's say on its next hours, as the page asks for its own: radarRain; not with the phone saving data)
    if (!rainOf(id) && !navigator.connection?.saveData && !asking.has(id)) {
      asking.add(id);
      rainAt(q.lat, q.lon).catch(() => null).then((r) => { asking.delete(id); rains.set(id, { ...r, id, asked: Date.now(), said: r ? JSON.stringify([r.at, r.steps]) : "" }); renewed(id); nearbySoon(); });
    }
    // (its forecast and the rest, how the models have done there and its climate: data.js load's quiet)
    // (one place at a time)
    if (nearbyLoading || !(due(q) || extrasDue(q)) || Date.now() - (fetchedAt.get(id) || 0) < 2 * 60e3) continue;
    fetchedAt.set(id, Date.now()); nearbyLoading = true;
    load(q, () => {}, { quiet: true }).then(() => { glances.delete(id); renewed(id); }, () => {}).finally(() => { nearbyLoading = false; nearbySoon(); });
  }
}
function pager() {
  const el = $("pager");
  const up = () => { held = false; settleSoon(); };
  el.addEventListener("touchstart", (e) => {
    // (not swiping yet, though: a pull to refresh starts here too; only once it scrolls sideways: below)
    held = true; heldAt = performance.now();
    // (its lifting heard where it started, too: what was touched may be drawn again meanwhile, a forecast come in, and
    // gone from the page, from where it would never reach the scroller)
    for (const t of ["touchend", "touchcancel"]) e.target.addEventListener(t, up, { once: true, passive: true });
  }, { passive: true });
  el.addEventListener("touchend", up, { passive: true });
  el.addEventListener("touchcancel", up, { passive: true });
  el.addEventListener("scroll", () => {
    // (put back to the weather now: not a swipe)
    if (!held && Math.abs(el.scrollLeft - heroLeft) < 1) return;
    movedAt = performance.now(); dragOn();
    if (!linked) follow();
    settleSoon();
  }, { passive: true });
  el.addEventListener("scrollend", landed);
  addEventListener("resize", () => { if (!pagerBusy()) centre(); });
  centre();
}
// A swipe across the cards turns the page too, as on iOS (a phone upright): the scroller led by the finger, its stops off
// meanwhile (styles.css .pg-led), then on to the next place, or back, as it's let go (far enough, or flicked). Not on
// what's dragged sideways itself: the hours, the days, the map, a chart's reading, a choice of view
function cardSwipe() {
  const pg = $("pager"), main = $("main");
  const own = (t) => !t.closest?.("main > .col") || t.closest("#hourly-chart, #nowcast-chart, .range, .strip, .day-strip, .radar, .seg, input, select, textarea");
  let x0 = null, y0 = 0, s0 = 0, axis = null, trail = [], raf = 0, want = 0;
  const lift = () => {
    if (x0 == null) return;
    x0 = null;
    if (axis !== "x") return;
    cancelAnimationFrame(raf); raf = 0; pg.scrollLeft = want;
    // (how fast the scroller was going, towards the next, and how far it's gone)
    const v = -flickSpeed(trail), W = pg.clientWidth, d = want - s0;
    const on = Math.abs(d) > W * 0.28 || (Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(d) && Math.abs(d) > 16);
    held = false; movedAt = performance.now();
    pg.scrollTo({ left: Math.max(0, Math.min(pg.scrollWidth - W, on ? s0 + Math.sign(d) * W : s0)), behavior: calm.matches ? "instant" : "smooth" });
    settleSoon();
  };
  main.addEventListener("touchstart", (e) => {
    x0 = null;
    if (e.touches.length > 1 || !onePage() || turning || own(e.target) || (!S.places[S.cur - 1] && !S.places[S.cur + 1])) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; axis = null; trail = [];
    // (its lifting heard where it started, too: pager)
    for (const t of ["touchend", "touchcancel"]) e.target.addEventListener(t, lift, { once: true, passive: true });
  }, { passive: true });
  main.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    const x = e.touches[0].clientX, mx = x - x0, my = e.touches[0].clientY - y0;
    if (!axis && Math.hypot(mx, my) > 10) {
      axis = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
      // (from here: the page starts where the finger is, rather than jumping the 10 pixels it took to tell)
      if (axis === "x") { x0 = x; s0 = want = pg.scrollLeft; held = true; heldAt = performance.now(); pg.classList.add("pg-led"); dragOn(); }
    }
    if (axis !== "x") return;
    const t = performance.now();
    trail.push([t, x]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift();
    heldAt = t;
    want = Math.max(0, Math.min(pg.scrollWidth - pg.clientWidth, s0 - (x - x0)));
    raf ||= requestAnimationFrame(() => { raf = 0; pg.scrollLeft = want; });
  }, { passive: true });
  main.addEventListener("touchend", lift, { passive: true });
  main.addEventListener("touchcancel", lift, { passive: true });
}
// The page turning to another place, once S.cur is on it (update draws it): this page carried off the way it's going as
// the next one comes in beside it (a view transition, of just what's on screen; where there aren't any, one goes and
// then the other comes), the sky and the bar crossfading meanwhile, as long as the page takes (styles.css :root.turning).
// from: where a finger left the page (pixels along), v: how fast it was going (a swipe); reset: puts the
// page back where the finger had it, as it turns. With Reduce Motion, the one page dissolves into the next. Scrolled a
// long way down, too much of the page to carry: the next one's cards on screen come in where they are (arrive).
let turning = false;
const afterTurn = [];
function turnPage(dir, { from = 0, v = 0, update = () => go(), reset = () => {}, done = () => {} } = {}) {
  const main = $("main"), root = document.documentElement, w = root.clientWidth;
  const ease = "cubic-bezier(0.22, 0.8, 0.3, 1)", g = glide(Math.max(0, -dir * v), w - Math.abs(from), ease, w);
  const finish = () => { turning = false; hush(false); root.classList.remove("turning", "vt-fade"); for (const k of ["height", "overflow", "viewTransitionName"]) main.style[k] = ""; done(); for (const f of afterTurn.splice(0)) f(); };
  const top = main.getBoundingClientRect().top;
  if (top < -innerHeight || (calm.matches && !document.startViewTransition)) { reset(); update(); finish(); arrive(true); return; }
  turning = true; hush(true);
  if (document.startViewTransition) {
    // (just what's on screen is taken along: the rest of the page, out of sight, isn't drawn into the picture)
    main.style.height = `${Math.ceil(innerHeight - top)}px`;
    main.style.overflow = "clip";
    main.style.viewTransitionName = "page";
    root.classList.add(calm.matches ? "vt-fade" : "turning");
    const vt = document.startViewTransition(() => { reset(); update(); });
    if (!calm.matches) vt.ready.then(() => {
      const o = { ...g, fill: "both" };
      // (the page's picture has it where the finger left it: from there, on off the screen)
      root.animate({ transform: ["translateX(0)", `translateX(${-dir * w - from}px)`] }, { ...o, pseudoElement: "::view-transition-old(page)" });
      root.animate({ transform: [`translateX(${dir * w}px)`, "translateX(0)"] }, { ...o, pseudoElement: "::view-transition-new(page)" });
    }).catch(() => {});
    vt.finished.catch(() => {}).finally(finish);
    return;
  }
  // (no view transitions: this one goes, then the next comes)
  reset();
  const out = main.animate([{ translate: `${from}px 0` }, { translate: `${-dir * w}px 0` }], { duration: g.duration * 0.5, easing: "cubic-bezier(0.4, 0.2, 0.9, 0.6)", fill: "forwards" });
  out.finished.then(() => {
    update();
    const inn = main.animate([{ translate: `${dir * w}px 0` }, { translate: "0 0" }], { duration: g.duration, easing: ease });
    out.cancel();
    return inn.finished;
  }).catch(() => {}).finally(finish);
}
// Another of the saved places on show (i: chosen in Places, found by search or by the phone, tapped on the map), the
// page turning to it as a swipe would: the next one in from the right if it's after the one showing in the list, from
// the left if it's before; just shown with nothing on the page yet, or behind a sheet
function turnTo(i) {
  if (i < 0 || i >= S.places.length) return;
  const shown = S.wx ? cell(S.wx.place.lat, S.wx.place.lon) : null, at = shown ? S.places.findIndex((q) => cell(q.lat, q.lon) === shown) : -1;
  S.cur = i; savePlaces();
  const p = place(), dir = at < 0 ? 0 : Math.sign(i - at);
  if (!shown || !dir || shown === cell(p.lat, p.lon) || turning || document.querySelector("dialog[open]")) { go(); return; }
  turnPage(dir);
}
// (one kept so long that it's run out, or all but, has nothing to show: two weeks away, say)
const runOut = (wx) => I.hoursFrom(wx, nowWall(wx.place.offset), 6).length < 6;
let retried = false;     // (Try again pressed: wire)
function render() {
  showPlace();
  if (S.base && runOut(S.base)) S.base = S.wx = null;
  if (S.base) S.wx = shaped(S.base);
  const wx = S.wx, before = $("main").dataset.empty;
  // nothing to show yet: placeholders while it loads, or the hero's message and a way to try again
  if (wx) delete $("main").dataset.empty; else $("main").dataset.empty = S.error ? "error" : "loading";
  $("retry-btn").hidden = !!wx || !S.error;
  if (!wx) {
    $("now-temp").textContent = "–"; delete $("now-temp").dataset.shown; $("now-icon").replaceChildren(); $("place-now").textContent = $("place-temp").textContent = "";
    const busy = S.error && (S.error.status === 429 || S.error.status >= 500);
    // (from loading to its error and back, as it tries again: the words changing where they are, not snapping)
    swap($("now-cond"), S.error ? (busy ? "The forecast service is busy" : "Couldn’t get the forecast") : "Loading the forecast…", !!before);
    swap($("now-hl"), S.error ? (busy ? "Trying again in a moment…" : "You may be offline, or the forecast service didn’t answer.") : "", !!before);
    $("brief").textContent = ""; delete $("brief").dataset.said;
    for (const id of ["alerts", "insights", "hourly-strip", "hourly-chart", "days", "win-grid", "tiles"]) $(id).replaceChildren();
    $("hourly-strip")._sig = $("insights")._sig = null;
    $("nowcast").hidden = $("solar").hidden = true;
    status(); layoutPager();
    // (Try again pressed, and back with nothing: the focus back on it, rather than lost to the page as it was hidden
    // meanwhile)
    if (retried && !$("retry-btn").hidden) { retried = false; if (!document.activeElement || document.activeElement === document.body) $("retry-btn").focus(); }
    return;
  }
  retried = false;
  // (and arriving where there were placeholders, or a message: the cards on screen come up into place after the hero)
  if (before) arrive();
  const now = nowWall(wx.place.offset);
  if (!S.modeChosen) { const v = viewFor(wx, now); if (v !== S.mode) showMode(v); }
  // (each part drawn by itself: a fault in one, on some odd piece of the forecast, leaves the others as they should be)
  const part = (fn, ...a) => { try { fn(...a); } catch (e) { console.error(e); } };
  const my = ++drawing, key = cell(wx.place.lat, wx.place.lon);
  // (a place drawn for the first time (turned to, say), or its forecast just come over placeholders: drawn as it is, the
  // turn or the arrival its motion; drawn again, what's changed changes where it is)
  const fresh = !!before || drawnFor !== key;
  // (another place's: the last one's charts aren't faded away over this one's as they draw in, charts.js put)
  if (drawnFor !== key) for (const c of document.querySelectorAll("#hourly-chart, #nowcast-chart, #climate-body > .range")) c.replaceChildren();
  // (the place drawn again with something new near the top (a warning come in, say) while the page is at the top: what's
  // under it glides down to its new place rather than jumping there; from where each was as last shown (tops, kept
  // once it's been: not measured now, which would lay the page out before it's drawn)
  const was = drawnFor === key && scrollY < 40 && !calm.matches ? tops : null;
  part(sky, wx, now);
  part(hero, wx, now, fresh);
  part(pinOnMap, wx, now);
  part(nowcast, wx, now, { fresh });
  part(solar, wx, now, { fresh });
  part(cards, wx, now, fresh);
  part(nudge);
  part(hourly, wx, now);
  status();
  const rest = () => {
    part(daily, wx, now);
    part(windows, wx, now);
    part(accuracy, wx);
    part(climate, wx, now);
    part(tiles, wx, now);
    balance(`${key}|${!!wx.climate}|${!!wx.skill?.station}`);
  };
  // a place's first drawing, on a phone: what's on the screen first, and the rest (all below it) a moment after, once
  // that's shown, rather than all at once before anything is; unless it's been drawn again meanwhile (all of it then)
  layoutPager(); nearbySoon();
  // (and not while the page is turning to it: once it has)
  const after = () => { if (my !== drawing) return; if (turning) { afterTurn.push(after); return; } rest(); requestAnimationFrame(keepTops); };
  if (drawnFor !== key && !twoCols.matches && !snapping) { drawnFor = key; requestAnimationFrame(() => setTimeout(after, 0)); return; }
  drawnFor = key;
  rest();
  // (where each is now, read as the page is about to be shown, when it's laid out anyway)
  requestAnimationFrame(() => {
    if (my !== drawing) return;
    if (was) for (const [x, t] of was) {
      if (x.hidden || !x.isConnected) continue;
      const top = x.offsetTop, d = t - top;
      if (Math.abs(d) > 2 && top - scrollY < innerHeight) x.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 480, easing: GLIDE, composite: "add" });
    }
    keepTops();
  });
}
let drawing = 0, drawnFor = "", tops = null;
addEventListener("resize", () => { tops = null; });
// (where the page's parts are laid out, as shown: once it's been laid out and shown; not as any glide has them meanwhile)
const keepTops = () => setTimeout(() => { tops = new Map([...document.querySelectorAll("main > .col > *")].filter((x) => !x.hidden).map((x) => [x, x.offsetTop])); settleWatch(); }, 0);
// each card settles into place once, the first time it's scrolled up into view (styles.css settle), and is then left be:
// not played over each time it passes the foot of the screen, which cost every frame of every scroll (a card drawn
// afresh is watched afresh)
const settled = typeof IntersectionObserver === "function" && CSS.supports?.("animation-timeline: view()")
  ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("settled"); settled.unobserve(e.target); } }, { rootMargin: "0px 0px -160px 0px" }) : null;
function settleWatch() { if (settled) for (const x of document.querySelectorAll("main :is(.card, .ins, .tile):not(.settled)")) settled.observe(x); }
// A place's forecast come where there were placeholders, or a message (or a page turned to from a long way down: now),
// the hero easing up first (styles.css), then the cards on screen coming up into place one after another, rather than
// all there at once before it: each pane of glass rising, what's on it fading up (a pane that fades would show
// unfrosted in Safari). Not again if it's drawn again a moment later; not with Reduce Motion
let arrivedAt = 0;
function arrive(now = false) {
  if (calm.matches || Date.now() - arrivedAt < 600) return;
  arrivedAt = Date.now();
  requestAnimationFrame(() => {
    let k = 0;
    for (const el of document.querySelectorAll("main > .col > :not(.hero, .skeleton, [hidden])")) {
      const r = el.getBoundingClientRect();
      if (!r.height || r.top > innerHeight || r.bottom < 0) continue;
      const t = { duration: 460, delay: (now ? 0 : 80) + k++ * 45, easing: GLIDE, fill: "backwards" };
      // (a card, its own pane; a section of them (the warnings, the tiles), each of its panes, and its heading)
      const panes = el.matches(".card") ? [el] : [...el.querySelectorAll(":scope > .ins, .tile, .section-title")];
      for (const pane of panes) {
        pane.animate([{ translate: "0 14px" }, { translate: "0 0" }], t);
        for (const c of pane.matches(".section-title") ? [pane] : pane.children) c.animate([{ opacity: 0.35 }, { opacity: 1 }], t);
      }
    }
  });
}
// The page's cards laid out in your order (CARDS, as Settings has them: settings.js), any you've switched off left off,
// the word about the alerts (nudge) after the next 48 hours. In one column, one under another; in two (a wide screen),
// each in turn to whichever column is shorter so far, so they stay about level and read across and down in your order.
// Worked out once a place's forecast is in (and again as its climate and its accuracy come), as the window's resized
// and as you rearrange them: not as the page is used, so nothing moves under a finger (a list unfolded, say); not with
// the radar full screen
// (wide: two columns, as styles.css has them; not a phone on its side, its columns one list beside the weather now)
let levelled = "", keyed = "";
const twoCols = matchMedia("(min-width: 980px)"), onSide = matchMedia("(orientation: landscape) and (max-height: 500px) and (min-width: 600px)");
function balance(key = keyed, again = false) {
  const main = $("main"), b = main.querySelector(".col-b"), L = S.settings.layout;
  const wide = twoCols.matches && !onSide.matches, want = `${key}|${wide}|${L.order}|${L.off}`;
  if ((want === levelled && !again) || $("radar").classList.contains("radar-big")) return;
  const first = !levelled.startsWith(`${key.split("|")[0]}|`) || again;
  levelled = want; keyed = key;
  for (const [k] of CARDS) $(k).toggleAttribute("data-off", L.off.includes(k));
  const list = L.order.filter((k) => !L.off.includes(k)).map($);
  // (the word about the alerts after the next 48 hours; just the Home Screen step to say, after the 16 days: nudge)
  const at = list.indexOf($($("nudge")._below ? "daily" : "hourly"));
  list.splice(at < 0 ? Math.min(1, list.length) : at + 1, 0, $("nudge"));
  // (each moved only if it isn't where it goes already: the radar's map, say, isn't taken out and put back for nothing)
  const put = (after, xs) => { for (const x of xs) { if (after.nextElementSibling !== x) after.after(x); after = x; } };
  if (!wide) { put($("alerts"), list); return; }
  requestAnimationFrame(() => {
    // (what's shown, by its height as it is: one not shown, the accuracy before it's come say, takes no room)
    let ha = $("pager").offsetHeight + $("alerts").offsetHeight, hb = 0;
    const A = [], B = [];
    for (const x of list) { const h = x.offsetHeight ? x.offsetHeight + 22 : 0; if (ha <= hb) { A.push(x); ha += h; } else { B.push(x); hb += h; } }
    // (moved once the place has been shown, as its climate and its accuracy come: each card on screen glides from where
    // it was to where it goes, in either column, rather than jumping there; not as the window's resized)
    const parts = [...main.querySelectorAll(":scope > .col > *")].filter((x) => !x.hidden && x.offsetHeight);
    const was = first || !moving() ? null : new Map(parts.map((x) => [x, x.getBoundingClientRect()]));
    put($("alerts"), A); put(b.querySelector(".skeleton"), B);
    if (was) for (const [x, r] of was) {
      const n = x.getBoundingClientRect(), dx = r.left - n.left, dy = r.top - n.top;
      if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && ((r.bottom > 0 && r.top < innerHeight) || (n.bottom > 0 && n.top < innerHeight))) x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 450, easing: GLIDE, composite: "add" });
    }
  });
}
let resized = 0, wasWide = null;
addEventListener("resize", () => {
  clearTimeout(resized);
  resized = setTimeout(() => { const w = Math.round(innerWidth / 40); if (w !== wasWide && S.wx) { wasWide = w; balance(keyed, true); } }, 250);
});
function status() {
  const wx = S.wx, el = $("status");
  if (!wx) {
    el.classList.remove("warn");
    // (no forecast, and none coming: the hero's message said to a screen reader too, as it's on the screen, unseen here
    // so it isn't shown twice; said once it's done trying, not while it is)
    const said = S.error && !S.loading ? `${$("now-cond").textContent}. ${$("now-hl").textContent}` : "";
    if (el.textContent !== said) el.replaceChildren(...(said ? [h("span", { class: "sr-only" }, said)] : []));
    $("updated").textContent = ""; return;
  }
  const mins = Math.round((Date.now() - wx.fetchedAt) / 60e3);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 1440) === 1 ? "1 day" : `${Math.floor(mins / 1440)} days`} ago`;
  // (said once, not again every minute as the age goes up: that's in the line under the page; "Updating…" only when
  // it was asked for, not each time it refreshes by itself)
  const warn = (S.error || S.stale) && !S.loading && mins > 15, text = warn ? "Couldn't refresh: showing the last forecast." : S.loading && S.asked ? "Updating…" : "";
  el.classList.toggle("warn", warn);
  // (said, it rises in; done with, it fades where it was, rather than going in a blink: the line keeps its height)
  if (el.textContent !== text) { if (!text && moving() && !heroAway()) fadeOff(el); swap(el, text, !heroAway()); }
  swap($("updated"), `Updated ${ago}`);
}

// the top of each sky (styles.css), for the browser's bar to match
const SKY_TOP = { "clear-day": "#1f5fae", "partly-day": "#2c5f99", "cloudy-day": "#43566c", "rain-day": "#303f52", storm: "#1c2130", "snow-day": "#4f6580", fog: "#59626e",
  "clear-night": "#070d22", "partly-night": "#0c1428", "cloudy-night": "#151b27", "rain-night": "#10151f", "snow-night": "#1b2335", dusk: "#1f2b55", dawn: "#24376a" };
// (each sky's colour at its foot, styles.css --s4: the page's own colour on a phone or a tablet, where the sky ends above
// Safari's bar at the foot of the screen and the page shows under it)
const SKY_FOOT = { "clear-day": "#6aa7e2", "partly-day": "#7ea2c9", "cloudy-day": "#7a8a9c", "rain-day": "#5d6d80", storm: "#3f4559", "snow-day": "#92a3b8", fog: "#8d959f",
  "clear-night": "#1d2c57", "partly-night": "#263453", "cloudy-night": "#313a4c", "rain-night": "#2a3343", "snow-night": "#3e4a62", dusk: "#d98b62", dawn: "#e7ad7c" };
const footed = matchMedia("(hover: none)");
function skyFor(wx, now) {
  const c = wx.current || I.hourAt(wx, now) || {}, kind = codeInfo(c.code).kind, day = !!c.isDay, d = I.dayOf(wx, now);
  let s;
  if (kind === "storm") s = "storm";
  else if (["rain", "showers", "drizzle", "sleet"].includes(kind)) s = day ? "rain-day" : "rain-night";
  else if (kind === "snow") s = day ? "snow-day" : "snow-night";
  else if (kind === "fog") s = "fog";
  else if (d && kind !== "cloudy" && d.sunrise && Math.abs(now - d.sunrise) < 40 * 60e3) s = "dawn";
  else if (d && kind !== "cloudy" && d.sunset && Math.abs(now - d.sunset) < 40 * 60e3) s = "dusk";
  else if (kind === "clear") s = day ? "clear-day" : "clear-night";
  else if (kind === "partly") s = day ? "partly-day" : "partly-night";
  else s = day ? "cloudy-day" : "cloudy-night";
  return s;
}
let tintKept = null;
function sky(wx, now) {
  const s = skyFor(wx, now);
  // (a new sky eases in over the last: styles.css)
  document.body.dataset.sky = s;
  const top = SKY_TOP[s] || "#2b5d96";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", top);
  // (kept for the page to arrive with, next time, as its theme-color (sw.js tinted): an iPhone tints the strip behind its
  // status bar with that, as the page arrives, and takes no notice of it changed after)
  if (top !== tintKept && "caches" in window) { tintKept = top; caches.open("wx-tint").then((c) => c.put(new URL("./tint", location.href), new Response(top))).catch(() => {}); }
  // (what shows when the page is pulled past its ends; on a phone or a tablet, under Safari's bar at the foot too, so the
  // sky's colour at its foot there)
  document.documentElement.style.backgroundColor = footed.matches ? SKY_FOOT[s] || top : top;
  // (and kept, for the page to open on next time, before the app has started: early.js)
  const kept = store.get("wx:sky");
  if (kept?.sky !== s || Date.now() - kept.at > 10 * 60e3) store.set("wx:sky", { sky: s, at: Date.now() });
}

// (fresh: the forecast just come where there were placeholders, the hero rising in as a whole: nothing in it moves again)
function hero(wx, now, fresh = false) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now);
  // (no reading for now, a gap in the hours say: what's there stays)
  if (!c) return;
  // a new temperature rolls in, up if it's warmer, down if it's cooler (as iOS's numbers do), the old one rolling away;
  // the same reading in other units crossfades
  const tEl = $("now-temp"), t = f.temp(c.temp), shown = !fresh && !heroAway();
  if (tEl.textContent !== t) {
    // (by the numbers themselves: a minus, as it's written, isn't one to parseFloat)
    const was = tEl.textContent, v = Number(tEl.dataset.v), by = c.temp === v ? 0 : c.temp < v ? -1 : 1, rolls = tEl.dataset.shown && shown && moving();
    // (its width before, if another figure would change it: measured only then, as it lays the page out)
    const w0 = rolls && was.length !== t.length ? tEl.offsetWidth : null;
    tEl.textContent = t; tEl.dataset.v = String(c.temp);
    if (rolls) roll(tEl, was, by, w0);
    tEl.dataset.shown = "1";
  }
  // (only when it changes: it's moving, and drawn again it would start over; the new one coming in over the old)
  const icon = iconOf(c.code, c.isDay), iconEl = $("now-icon");
  if (iconEl.dataset.icon !== icon || !iconEl.firstElementChild) {
    const old = [...iconEl.children];
    iconEl.insertAdjacentHTML("beforeend", weatherIcon(icon, 76)); iconEl.dataset.icon = icon;
    if (old.length && shown && moving()) {
      for (const o of old) { o.classList.add("wi-was"); o.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.9)" }], { duration: 240, easing: EASE_IN, fill: "forwards" }).finished.then(() => o.remove(), () => o.remove()); }
      iconEl.lastElementChild.animate([{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: GLIDE });
    } else old.forEach((o) => o.remove());
  }
  const cond = label(c.code, c.isDay), top = document.querySelector(".top").classList.contains("collapsed");
  swap($("now-cond"), cond, shown);
  swap($("place-now"), `${f.temp(c.temp)} · ${cond}`, top);
  swap($("place-temp"), f.temp(c.temp), top && $("place-btn").classList.contains("no-sub"));
  swap($("now-hl"), d ? `H ${f.temp(d.tmax)}  L ${f.temp(d.tmin)}  ·  Feels like ${f.temp(c.feels)}` : `Feels like ${f.temp(c.feels)}`, shown);
  // (its first sentence, what's coming, in bold; the rest after it)
  // (and written, so read out, only when what it says has changed: not every minute, nor as each part comes in)
  const said = I.headline(wx, now, f), [, lead, rest] = /^(.+?[.!?])\s+(?=[A-Z])(.*)$/s.exec(said) || [, said, ""], brief = $("brief");
  if (brief.dataset.said !== said) { const had = !!brief.dataset.said; brief.replaceChildren(h("b", {}, lead), rest ? ` ${rest}` : ""); brief.dataset.said = said; if (had && shown) rise(brief); }
  keepHero(wx);
}

// what the top of the page shows, kept for boot.js to put up the moment the page is next opened (written when it
// changes, and every ten minutes or so meanwhile: how long ago it was shown is what boot.js goes by)
let heroKept = "", heroAt = 0;
function keepHero(wx) {
  const c = $("now-temp"), v = JSON.stringify({ lat: wx.place.lat, lon: wx.place.lon, sky: document.body.dataset.sky, top: SKY_TOP[document.body.dataset.sky] || "#2b5d96",
    temp: c.textContent, v: Number(c.dataset.v), cond: $("now-cond").textContent, hl: $("now-hl").textContent, brief: $("brief").dataset.said || "" });
  if (v === heroKept && Date.now() - heroAt < 10 * 60e3) return;
  heroKept = v; heroAt = Date.now();
  store.set("wx:hero", { ...JSON.parse(v), at: heroAt });
}
// The temperature as it was, rolling away (up for a warmer one, down for a cooler, fading for other units) as the new one
// rolls in from the other side: both moved and faded only, so it carries on smoothly however busy the page is with
// drawing the rest; and the icon beside it easing along, if the new one's wider or narrower (w0: its width before). A
// newer one coming meanwhile takes over from wherever this one had got to
function roll(tEl, was, by, w0) {
  const row = tEl.parentElement;
  for (const g of row.querySelectorAll(".hero-temp.was")) g.remove();
  tEl.getAnimations().forEach((a) => a.cancel());
  const old = h("div", { class: "hero-temp was", "aria-hidden": "true" }, was);
  row.append(old);
  old.animate(by ? [{ transform: "none", opacity: 1 }, { transform: `translateY(${-by * 0.28}em)`, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: by ? 280 : 200, easing: EASE_IN, fill: "forwards" })
    .finished.then(() => old.remove(), () => old.remove());
  tEl.animate(by ? [{ transform: `translateY(${by * 0.28}em)`, opacity: 0 }, { transform: "none", opacity: 1 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: by ? 450 : 280, easing: by ? GLIDE : EASE_OUT });
  const dx = w0 == null ? 0 : w0 - tEl.offsetWidth;
  if (Math.abs(dx) > 1) $("now-icon").animate([{ translate: `${dx}px 0` }, { translate: "0 0" }], { duration: 450, easing: GLIDE });
}

// the place on the radar's map as Apple's Weather map marks it: its temperature and sky in a bubble the colour of how
// warm it is, its name under it
const PIN_HUES = [[-10, [110, 90, 210]], [0, [60, 120, 220]], [10, [58, 112, 196]], [15, [40, 145, 160]], [20, [80, 160, 70]], [25, [222, 148, 40]], [30, [222, 88, 50]], [35, [196, 40, 50]]];
const pinHue = (temp) => {
  const at = PIN_HUES.findIndex(([t]) => t >= temp), k = Math.max(1, at < 0 ? PIN_HUES.length - 1 : at), [t0, a] = PIN_HUES[k - 1], [t1, b] = PIN_HUES[k];
  const f = t1 > t0 ? Math.min(1, Math.max(0, (temp - t0) / (t1 - t0))) : 0;
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`;
};
// a saved place at a glance (peek), kept a minute: its whole kept forecast is read to get it, not one to read every
// drawing; for one that's never been opened here, its weather now as asked for with the others' (glanceAll)
const glances = new Map();
const glance = (q) => {
  const id = cell(q.lat, q.lon), had = glances.get(id);
  if (had && Date.now() - had.at < 60e3) return had.k;
  const k = peek(q) || store.get("wx:glances")?.[id] || null;
  glances.set(id, { at: Date.now(), k });
  return k;
};
// The saved places with no forecast kept here (added on another visit, say): their weather now, all of them in one
// request, once a half hour at most, kept (wx:glances); then the map's bubbles and the list of places drawn again
let glancedAt = 0;
async function glanceAll() {
  const want = S.places.filter((q) => !peek(q));
  if (!want.length || Date.now() - glancedAt < 30 * 60e3) return;
  glancedAt = Date.now();
  try {
    const q = new URLSearchParams({ latitude: want.map((x) => x.lat).join(","), longitude: want.map((x) => x.lon).join(","), current: "temperature_2m,weather_code,is_day", timezone: "auto" });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    const j = await r.json(), list = Array.isArray(j) ? j : [j], kept = store.get("wx:glances") || {};
    want.forEach((x, i) => { const c = list[i]?.current; if (c && Number.isFinite(c.temperature_2m)) kept[cell(x.lat, x.lon)] = { temp: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, offset: list[i].utc_offset_seconds || 0, hi: null, lo: null, at: Date.now() }; });
    // (those no longer saved let go)
    const saved = new Set(S.places.map((x) => cell(x.lat, x.lon)));
    for (const id of Object.keys(kept)) if (!saved.has(id)) delete kept[id];
    store.set("wx:glances", kept); glances.clear();
    if (S.wx) pinOnMap(S.wx, nowWall(S.wx.place.offset));
    if ($("places").open) drawSaved();
  } catch (_) {}
}
function pinOnMap(wx, now) {
  const c = wx.current || I.hourAt(wx, now), p = place();
  if (!S.radar || !c) return;
  S.radar.mark({ temp: S.f.temp(c.temp), icon: weatherIcon(iconOf(c.code, c.isDay), 22), name: p?.gps ? "My Location" : p?.name || "", colour: pinHue(c.temp) });
  // the other saved places on the map too, their temperature now as the list of them has it, each a way to go to it;
  // and the official warnings' areas, where their services draw them
  const here = cell(wx.place.lat, wx.place.lon);
  glanceAll();
  // (each found in the list as it is when it's tapped, as takeUp finds a place: the map keeps a bubble while the same
  // places are on it, so where it was in the list then may not be where it is now, one before it taken away since, say)
  const at = (q) => S.places.findIndex((x) => (q.gps ? x.gps : !x.gps && A.keyOf(x) === A.keyOf(q)));
  S.radar.others(S.places.map((q, i) => ({ q, i })).filter(({ q, i }) => i !== S.cur && cell(q.lat, q.lon) !== here).map(({ q }) => {
    const k = glance(q);
    return { name: q.gps ? "My Location" : q.name, lat: q.lat, lon: q.lon, temp: k ? S.f.temp(k.temp) : "", colour: k ? pinHue(k.temp) : null, go: () => { const i = at(q); if (i < 0) return; S.cur = i; savePlaces(); go(); } };
  }));
  S.radar.warnings(inForce(wx.official).filter((w) => w.areas?.length).map((w) => ({ id: w.id, title: w.event || titleOf(w), colour: colourOf(w), onset: w.onset, expires: w.expires, open: !!w.open, rings: w.areas })));
}
// (fresh: as a place's forecast arrives, all of it at once; tick: the minute moving on, not a new forecast)
function nowcast(wx, now, { fresh = false, tick = false } = {}) {
  const f = S.f, nc = I.nowcast(wx, now, f), box = $("nowcast");
  // the radar says it in a line too
  const quarters = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now).length;
  S.radar?.note(nc ? nc.text : quarters >= 4 ? `No rain expected here for the next ${Math.round(quarters / 4) === 1 ? "hour" : `${Math.round(quarters / 4)} hours`}.` : "");
  // (the radar's line only where the card above isn't saying it already: when it's hidden, or the radar's full screen)
  const shown = !(!nc || (!nc.now && nc.startsAt - now > 2 * HOUR));
  $("radar").classList.toggle("said-above", shown);
  // (rain no longer on its way: the card folds away, what's under it moving up; on its way again, it opens back up)
  if (!shown) { if (fresh) box.hidden = true; else fold(box); return; }
  const was = !box.hidden && !box._fold;
  if (fresh) box.hidden = false; else unfold(box);
  swap($("nowcast-text"), nc.text, was);
  const m = wx.minutely.filter((x) => x.t + 15 * 60e3 > now), led = (x) => (x.radar ?? 0) >= 0.5;
  // (said where the radar's leading the timing for the first of it: rainmap.js blend)
  $("nowcast-src").hidden = !led(m[0] || {});
  // (each minute its chart's drawn again for the time; not while it's being read, though, a finger or the pointer on it,
  // or its keys: that would take the reading away)
  const host = $("nowcast-chart");
  if (tick && host.matches(":hover, :focus-within")) return;
  // on the scale it's felt: light, moderate, heavy (codes.js heaviness: the same as the weather now says), so it needs
  // no units (a square root within light, so drizzle still shows; the amounts are in the readout)
  const L = LIGHT_MMH, H = HEAVY_MMH;
  const band = (mmh) => (mmh <= 0 ? 0 : mmh < L ? Math.sqrt(mmh / L) : mmh < H ? 1 + Math.log(mmh / L) / Math.log(H / L) : Math.min(3, 2 + Math.log(mmh / H) / Math.log(4)));
  timeChart(host, {
    kind: "columns", height: 120, color: COLOR.rain, key: cell(wx.place.lat, wx.place.lon),
    points: m.map((x) => ({ t: x.t, v: band(x.precip * 4), mm: x.precip, radar: led(x) })),
    y: { min: 0, max: 3, ticks: [1, 2, 3], fmt: (v) => ["", "Light", "Moderate", "Heavy"][v], inside: true },
    x: { step: 15 * 60e3, hour: (t) => f.time(t) },
    now, summary: `Rain, every 15 minutes for the next 4 hours, on a scale of light, moderate and heavy. ${nc.text}`,
    tip: (p) => ({ title: p.radar ? `${f.time(p.t)} · radar` : f.time(p.t), rows: [[f.rate(p.mm * 4), p.mm >= 0.05 ? ["light", "moderate", "heavy"][heaviness(p.mm * 4) - 1] : "dry"]] }),
    table: { head: ["Time", "Rain"], rows: m.map((x) => [f.time(x.t), f.rate(x.precip * 4)]) },
  });
}

/* ---------- solar ---------- */
// The Solar card (Settings › Solar), for the place your panels are: shown from two hours before the sun comes out on
// them until it goes in (solar.js), with when and how long; folded away otherwise. The sunlight on the roof asked for
// at most every half hour, kept for when the app's offline
const sunKept = new Map();
let sunAsking = null;
function sunHours(s) {
  const k = `solar:${cell(s.lat, s.lon)}|${s.faces}|${s.pitch}`;
  if (!sunKept.has(k)) { const v = store.get(k); if (v?.hours) sunKept.set(k, v); }
  const kept = sunKept.get(k);
  if ((!kept || Date.now() - kept.at > 30 * 60e3) && sunAsking !== k) {
    sunAsking = k;
    fetchSolar(s.lat, s.lon, s.faces, s.pitch).then((hours) => {
      const v = { at: Date.now(), hours }; sunKept.set(k, v); store.set(k, v);
      if (S.wx) solar(S.wx, nowWall(S.wx.place.offset));
    }, () => {}).finally(() => { if (sunAsking === k) sunAsking = null; });
  }
  return kept?.hours || null;
}
function solar(wx, now, { fresh = false } = {}) {
  const box = $("solar"), s = S.settings.solar, here = s?.on && s.lat != null && cell(s.lat, s.lon) === cell(wx.place.lat, wx.place.lon);
  const sp = here && !R ? (() => { const hs = sunHours(s); return hs && sunSpell(hs, now); })() : null;
  if (!sp) { if (fresh || R) box.hidden = true; else fold(box); return; }
  const was = !box.hidden && !box._fold;
  if (fresh) box.hidden = false; else unfold(box);
  const say = solarSay(sp, now, S.f);
  swap($("solar-say"), say.title, was); swap($("solar-text"), say.text, was);
  $("solar-chart").innerHTML = sunChart(sp, now);
}
// today's sun on the roof, each hour against the day's best, the spell in gold, and now
function sunChart(sp, now) {
  const hs = sp.hours, f = S.f;
  if (hs.length < 2) return "";
  const a = hs[0].t - HOUR, b = hs[hs.length - 1].t, W = 320, top = 4, base = 56, x = (t) => 6 + ((t - a) / (b - a)) * (W - 12), bw = Math.max(3, (W - 12) / hs.length - 4);
  let s = `<svg viewBox="0 0 ${W} 74" width="100%" role="img" aria-label="Sun on your panels today: strongest from ${f.time(sp.start)} to ${f.said(sp.end)}">`;
  s += `<rect x="${x(sp.start)}" y="${top}" width="${x(sp.end) - x(sp.start)}" height="${base - top}" rx="6" fill="rgba(255,196,61,.16)"/>`;
  for (const h of hs) { const bh = Math.max(1.5, h.v * (base - top - 4));
    s += `<rect x="${x(h.t - HOUR) + 2}" y="${base - bh}" width="${bw}" height="${bh}" rx="2.5" fill="${h.in ? "#ffc23d" : "currentColor"}"${h.in ? "" : ' opacity=".4"'}/>`; }
  if (now > a && now < b) s += `<line x1="${x(now)}" x2="${x(now)}" y1="${top}" y2="${base}" stroke="currentColor" stroke-width="1.5"/>`;
  s += `<line x1="6" x2="${W - 6}" y1="${base}" y2="${base}" stroke="currentColor" opacity=".35"/>`;
  for (let t = Math.ceil(a / (3 * HOUR)) * 3 * HOUR; t <= b; t += 3 * HOUR) s += `<text x="${Math.min(W - 18, Math.max(18, x(t)))}" y="${base + 14}" fill="currentColor" opacity=".8" font-size="10.5" text-anchor="middle">${f.time(t)}</text>`;
  return s + "</svg>";
}

function insightCard(c) {
  const tag = c.level === "alert" ? "Alert" : c.level === "warn" ? "Warning" : null, go = moreOf(c);
  return h("article", { class: "ins", "data-level": c.level },
    h("div", { class: "ins-icon", svg: glyph(c.icon, 18) }),
    h("h3", {}, tag ? [h("span", { class: "tag" }, tag), " "] : null, go ? h("button", { class: "ins-open", type: "button", "aria-haspopup": "dialog", onclick: go.open }, c.title) : c.title),
    h("p", {}, c.text));
}
// where an insight says more: its day's sheet, or the sheet of the tile it's about → { label, open } or null
function moreOf(c) {
  const wx = S.wx; if (!wx) return null;
  if (c.day) { const d = wx.daily.find((x) => x.key === c.day); return d ? { label: `${f0(d)} in full`, open: () => openDay(c.day) } : null; }
  const t = c.tile && TILES.find((x) => x[0] === c.tile);
  return t && S.say?.[c.tile] ? { label: c.tile === "sun" ? "Sunrise and sunset" : `${t[1]}, hour by hour`, open: () => openDetail(c.tile) } : null;
}
const f0 = (d) => S.f.day(d.date, nowWall(S.wx.place.offset));
// An official warning: its colour, what it is, who says so and when (all of it in a sheet, from its title)
function officialCard(w, wx, now) {
  const colour = colourOf(w), badge = badgeOf(w);
  return h("article", { class: "ins official", "data-level": colour === "red" ? "alert" : "warn", "data-colour": colour },
    h("div", { class: "ins-icon", svg: glyph(glyphOf(w), 18) }),
    h("h3", {}, badge ? [h("span", { class: "tag" }, badge), " "] : null,
      h("button", { class: "ins-open", type: "button", "aria-haspopup": "dialog", "aria-controls": "warning", onclick: () => openWarning(w) }, titleOf(w))),
    h("p", { class: "ins-from" }, `${w.issuer} · ${spanOf(w, now, S.f, wx.place.offset)}`),
    w.headline ? h("p", {}, w.headline) : null);
}
function openWarning(w) {
  const wx = S.wx, d = $("warning"), badge = badgeOf(w);
  if (!wx) return;
  // (blank lines part its paragraphs; single ones are only where its lines were wrapped; the US's "* WHAT..." as "What: ")
  const paras = (s) => String(s || "").split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim().replace(/^\*\s*([A-Z][A-Z /]*?)\.\.\.\s*/, (m, k) => `${k[0]}${k.slice(1).toLowerCase()}: `))
    .filter(Boolean).map((x) => h("p", {}, x));
  $("warning-title").textContent = titleOf(w);
  d.dataset.colour = colourOf(w);
  $("warning-body").replaceChildren(...[
    h("p", { class: "warn-from" }, badge ? [h("span", { class: "warn-badge" }, badge), " "] : null, w.issuer, w.area ? ` · ${w.area}` : ""),
    h("p", { class: "warn-when" }, spanOf(w, nowWall(wx.place.offset), S.f, wx.place.offset)),
    w.headline ? h("p", { class: "warn-headline" }, w.headline) : null,
    w.impacts?.length ? [h("h3", { class: "sheet-sub" }, "What to expect"), h("ul", { class: "warn-list" }, w.impacts.map((x) => h("li", {}, x)))] : null,
    w.text ? [h("h3", { class: "sheet-sub" }, "Details"), ...paras(w.text)] : null,
    w.instruction ? [h("h3", { class: "sheet-sub" }, "What to do"), ...paras(w.instruction)] : null,
    w.url ? h("p", { class: "warn-link" }, h("a", { href: w.url, target: "_blank", rel: "noopener" }, `${w.issuer} website`)) : null,
    h("p", { class: "credits-note" }, `Issued by ${/Office|Service|Center|Agency/.test(w.issuer) ? "the " : ""}${w.issuer}${w.via ? `, through ${w.via}` : ""}, and shown as issued.`)].flat().filter(Boolean));
  openSheet(d);
}
// (fresh: a place drawn for the first time, or its forecast just come where there were placeholders: as it is, at once)
function cards(wx, now, fresh = false) {
  const all = I.insights(wx, now, S.f, { prev: baseline(wx, now), commute: S.settings.commute });
  // official warnings first; the app's own after, less any an official one already says
  const official = inForce(wx.official), said = covered(official);
  const warn = all.filter((c) => (c.level === "alert" || c.level === "warn") && !said.has(c.icon));
  // Highlights: only what the rest of the page doesn't say already (the tiles: UV, air, pressure and wind; the briefing:
  // rain today; this time of year: today against what's normal)
  const brief = $("brief").dataset.said || "", today = keyOf(now);     // (the briefing as hero has just said it)
  const elsewhere = (c) => ["uv", "air", "pressure", "wind"].includes(c.id) || (c.id === "umbrella" && /\b(rain|showers?|drizzle|snow|sleet)\b/i.test(brief)) || (c.id === "normal" && c.day === today);
  const rest = all.filter((c) => c.level !== "alert" && c.level !== "warn" && !elsewhere(c));
  const n = official.length + warn.length;
  // straight under the temperature: one warning as its card; more, one banner saying what they are (the most severe
  // first), that opens to all of them, rather than a stack of them pushing the forecast down the page (each drawn again
  // only when what it says has changed: drawAlerts)
  const worst = [...official].sort((a, b) => (b.level || 0) - (a.level || 0)), mine = [...warn].sort((a, b) => (b.level === "alert") - (a.level === "alert"));
  const each = [...worst.map((w) => ({ key: `o:${w.id ?? titleOf(w)}`, sig: JSON.stringify([titleOf(w), badgeOf(w), colourOf(w), w.issuer, spanOf(w, now, S.f, wx.place.offset), w.headline]), make: () => officialCard(w, wx, now) })),
    ...mine.map((c) => ({ key: `i:${c.title}`, sig: JSON.stringify([c.level, c.icon, c.text, moreOf(c)?.label]), make: () => insightCard(c) }))];
  if (n < 2) drawAlerts(n ? [{ key: "h", sig: "1", make: () => h("h2", { class: "sr-only" }, "Warning") }, ...each] : [], fresh);
  else {
    const name = (w) => { const b = badgeOf(w), t = titleOf(w).replace(/\s+warning$/i, ""); return b ? `${b} ${t.toLowerCase()}` : t; };
    const top = worst[0], colour = top ? colourOf(top) : null, line = [...worst.map(name), ...mine.map((c) => c.title)].join(", ");
    drawAlerts([{ key: "h", sig: "n", make: () => h("h2", { class: "sr-only" }, "Warnings") },
      { key: "sum", sig: JSON.stringify([n, line, colour]), make: () => h("article", { class: `ins official warn-sum${S.warnOpen ? " open" : ""}`, "data-level": colour === "red" || (!top && mine[0].level === "alert") ? "alert" : "warn", "data-colour": colour },
        h("div", { class: "ins-icon", svg: glyph(top ? glyphOf(top) : mine[0].icon, 18) }),
        h("h3", {}, h("button", { class: "ins-open", type: "button", "aria-expanded": String(!!S.warnOpen), "aria-controls": "warn-all", onclick: openWarnings }, `${n} warnings`)),
        h("p", {}, line),
        h("span", { class: "ws-chev", svg: glyph("chevron", 16) })) },
      { key: "all", sig: JSON.stringify(each.map((x) => x.sig)), make: () => h("div", { class: "stack warn-all", id: "warn-all", hidden: !S.warnOpen }, ...each.map((x) => x.make())) }], fresh);
  }
  // the app's own, in one card: the first three, and the rest under "N more" (all of them shown, a way back to three)
  const shown = S.allInsights ? rest : rest.slice(0, FIRST_INSIGHTS), box = $("insights"), card = $("insights-card");
  // (drawn again only when what it says has changed, not for every other part of the forecast as it comes in: so a row
  // that's open stays open, and what has the focus keeps it)
  const sig = JSON.stringify([cell(wx.place.lat, wx.place.lon), shown.map((c) => [c.title, c.short, c.text, c.level, c.icon, moreOf(c)?.label]), rest.length, S.allInsights]);
  if (box._sig === sig) return;
  const first = fresh || box._sig == null, old = new Map([...box.children].map((r) => [r._title, r]));
  const focus = document.activeElement?.closest?.("#insights-card :is(.ins-row, .ins-more)");
  // (and the card as tall as it was, then easing to its new height, rather than jumping, everything under it with it;
  // closing up, its button going up with its foot)
  const btn0 = box.nextElementSibling, h0 = !first && moving() && !card.hidden ? card.offsetHeight : 0, b0 = h0 && btn0 ? btn0.offsetTop : 0;
  box._sig = sig;
  // (nothing to say: the card folds away, saying what it said till it's gone; something again, it opens back up)
  if (!rest.length) { if (first) card.hidden = true; else fold(card); return; }
  if (card.hidden || card._fold) { if (first) card.hidden = false; else unfold(card); }
  box.replaceChildren(...shown.map(insightRow));
  btn0?.remove();
  // (under the list, not in it: a list holds only its items)
  if (rest.length > FIRST_INSIGHTS) box.after(h("button", { class: `ins-more${S.allInsights ? " less" : ""}`, type: "button", onclick: () => more(!S.allInsights) },
    S.allInsights ? "Show less" : `${rest.length - shown.length} more`, h("span", { svg: glyph("chevron", 14) })));
  // (a row saying something new about the same thing: its words changing where they are; a new one rising in, if it's on
  // screen, one after another)
  let k = 0;
  if (!first) for (const row of box.children) {
    const o = old.get(row._title);
    if (o) rewords(o, row);
    else if (moving() && row.getBoundingClientRect().top < innerHeight) { row.classList.add("rise"); row.style.setProperty("--i", String(k++)); }
  }
  if (focus) (focus.classList.contains("ins-more") ? box.nextElementSibling : [...box.children].find((r) => r._title === focus._title)?.querySelector(".ins-head"))?.focus({ preventScroll: true });
  if (h0) {
    const h1 = card.offsetHeight, btn = box.nextElementSibling, t = { duration: 420, easing: GLIDE };
    if (Math.abs(h1 - h0) > 1) {
      card.style.overflow = "clip";
      card.animate([{ height: `${h0}px` }, { height: `${h1}px` }], t).finished.catch(() => {}).finally(() => { card.style.overflow = ""; });
      if (h1 < h0 && btn && b0) btn.animate([{ transform: `translateY(${b0 - btn.offsetTop}px)` }, { transform: "none" }], t);
    }
  }
  requestAnimationFrame(fits);
}
// "N more": the rest rise in under the first three as the card grows to take them, the first of them with the focus
// (where the button was); "Show less": back to three, the card closing up under them, the button with its foot
function more(on) {
  if (!S.wx) return;      // (a place's forecast still coming: there's nothing to show more or less of)
  S.allInsights = on;
  cards(S.wx, nowWall(S.wx.place.offset));
  const box = $("insights");
  (on ? box.children[FIRST_INSIGHTS]?.querySelector(".ins-head") : box.nextElementSibling)?.focus({ preventScroll: true });
}
// The warnings, worst first (official ones, then the app's own, under the one heading): each kept as it is while it says
// the same, its words changing where they are when it says something new; a new one rising in where it goes (not as a
// place is first drawn), and one that's over folding away, what's under it moving up
// The banner of several warnings opened, all of them unfolding under it one after another (or closed again, folding away)
function openWarnings() {
  const all = $("warn-all"), sum = $("alerts").querySelector(".warn-sum");
  if (!all || !sum) return;
  S.warnOpen = !S.warnOpen;
  sum.classList.toggle("open", S.warnOpen); sum.querySelector(".ins-open").setAttribute("aria-expanded", String(S.warnOpen));
  if (!S.warnOpen) { fold(all, 12); return; }
  unfold(all, 12);
  if (moving()) [...all.children].forEach((c, i) => riseIn(c, 50 * i));
}
function drawAlerts(items, fresh) {
  const box = $("alerts"), had = new Map([...box.children].filter((x) => x._key && !x._gone).map((x) => [x._key, x]));
  const els = items.map(({ key, sig, make }) => {
    const o = had.get(key);
    had.delete(key);
    if (o && o._sig === sig) return o;
    const n = Object.assign(make(), { _key: key, _sig: sig });
    if (o) { o.replaceWith(n); if (!fresh) rewords(o, n); } else n._new = !fresh;
    return n;
  });
  for (const o of had.values()) { o._gone = true; if (fresh) o.remove(); else fold(o, 12).then(() => o.remove()); }
  // (each in its place, in order: those folding away left where they are meanwhile)
  let at = box.firstChild, k = 0;
  for (const el of els) {
    while (at && at._gone) at = at.nextSibling;
    if (el === at) { at = at.nextSibling; continue; }
    box.insertBefore(el, at);
    if (el._new && moving() && el.matches(".ins") && el.getBoundingClientRect().top < innerHeight) riseIn(el, 60 * k++);
  }
}
// An insight in its card: its title and a line of what it says (its own short line, where it has one, rather than the
// start of the whole cut off), and where there's more, a tap for the rest (the row opening to it, and closing again;
// open, it stays open as the card's drawn again: S.openIns)
const FIRST_INSIGHTS = 3;
function insightRow(c) {
  const brief = c.short && c.short !== c.text, open = S.openIns.has(c.title);
  const row = h("div", { class: `ins-row${brief ? " has-short" : ""}${open ? " open" : ""}`, role: "listitem", "data-level": c.level },
    h("button", { class: "ins-head", type: "button", "aria-expanded": String(open), onclick: () => openRow(row) },
      h("span", { class: "ins-icon", svg: glyph(c.icon, 16) }),
      h("span", { class: "ins-words" }, h("span", { class: "ins-title" }, c.title), brief ? h("span", { class: "ins-short" }, c.short) : null, h("span", { class: "ins-line" }, c.text)),
      h("span", { class: "ins-chev", svg: glyph("chevron", 16) })));
  row._title = c.title;
  // (open, a way on to its day or its hours)
  const go = moreOf(c);
  if (go) { row.classList.add("goes"); row.append(h("button", { class: "ins-go", type: "button", "aria-haspopup": "dialog", onclick: go.open }, go.label, h("span", { svg: glyph("chevron", 12) }))); }
  return row;
}
function openRow(row) {
  if (row.classList.contains("whole")) return;
  const open = !row.classList.contains("open"), from = row.offsetHeight;
  row.getAnimations().forEach((a) => a.cancel());
  row.classList.toggle("open", open);
  row.querySelector(".ins-head").setAttribute("aria-expanded", String(open));
  S.openIns[open ? "add" : "delete"](row._title);
  if (calm.matches) return;
  // (closing, all of it stays in sight until the row has folded down to a line)
  const to = row.offsetHeight;
  if (!open) row.classList.add("fold");
  row.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 420, easing: GLIDE })
    .finished.then(() => row.classList.remove("fold"), () => row.classList.remove("fold"));
}
// which rows say all they have to in their line (nothing to open), measured again as the card's width changes
let insWidth = 0;
function fits() {
  const box = $("insights");
  insWidth = box.clientWidth;
  // (all measured, then all marked: measuring one after marking another would lay the page out again each time)
  const rows = [...box.querySelectorAll(".ins-row:not(.open)")].map((r) => {
    // (one with a short line always has more to say)
    const l = r.querySelector(".ins-line");
    return [r, !r.classList.contains("has-short") && !r.classList.contains("goes") && l.scrollHeight <= l.clientHeight + 1];
  });
  for (const [r, whole] of rows) {
    const head = r.querySelector(".ins-head");
    r.classList.toggle("whole", whole);
    whole ? head.removeAttribute("aria-expanded") : head.setAttribute("aria-expanded", "false");
  }
}
new ResizeObserver(() => { if ($("insights").clientWidth !== insWidth) fits(); }).observe($("insights"));

function hourly(wx, now) {
  const f = S.f, hrs = I.hoursFrom(wx, now, 48), strip = $("hourly-strip"), here = cell(wx.place.lat, wx.place.lon);
  // (the strip again only if what it shows has changed: not for every other part of the forecast arriving, but for
  // any that changes it, the ensembles' odds or the radar's say on the next hours, say)
  const sig = `${here}|${wx.current?.temp}|${wx.current?.code}|${JSON.stringify(f.units)}|${hrs.map((x) => `${x.t},${Math.round(x.temp * 10)},${x.code},${x.isDay ? 1 : 0},${Math.round(x.pop ?? 0)}`).join(";")}`;
  if (strip._sig === sig) { drawHourChart(wx, now, hrs, $("hourly-chart"), S.mode, true); return; }
  // (the same place drawn again, on screen: each hour that's still there moves to its new place (along by one as the
  // hour turns, rather than every hour shifting under the eye), the one gone fading where it was, and what's changed of
  // each rising in; another place: back to Now)
  const same = strip._sig?.startsWith(`${here}|`), r = same && moving() ? strip.getBoundingClientRect() : null;
  const seen = r && r.bottom > 0 && r.top < innerHeight, old = seen ? new Map([...strip.children].filter((c) => c._t != null).map((c) => [c._t, [c, c.getBoundingClientRect().left]])) : null;
  strip._sig = sig;
  const items = [];
  hrs.forEach((x, i) => {
    const isNow = i === 0, c = isNow && wx.current ? wx.current : x;
    items.push(Object.assign(h("div", { class: `hour${isNow ? " now" : ""}`, role: "listitem", "aria-label": `${isNow ? "Now" : f.time(x.t)}: ${f.temp(c.temp)}, ${label(c.code, c.isDay)}${(x.pop ?? 0) >= 20 ? `, ${Math.round(x.pop)}% chance of rain` : ""}` },
      h("span", { class: "h-time" }, isNow ? "Now" : f.hour(x.t)),
      h("span", { class: "h-icon", svg: weatherIcon(iconOf(c.code, c.isDay), 30) }),
      h("span", { class: "h-pop" }, (x.pop ?? 0) >= 20 ? `${Math.round(x.pop / 10) * 10}%` : ""),
      h("span", { class: "h-temp" }, f.temp(c.temp))), { _t: x.t }));
    // sunrise and sunset, in their place
    for (const d of wx.daily) for (const [what, t] of [["Sunrise", d.sunrise], ["Sunset", d.sunset]]) {
      if (t && t > Math.max(now, x.t) && t < x.t + HOUR && i < hrs.length - 1) {
        items.push(Object.assign(h("div", { class: "hour sunev", role: "listitem", "aria-label": `${what} at ${f.time(t)}` },
          h("span", { class: "h-time" }, f.time(t)), h("span", { class: "h-icon", svg: glyph(what === "Sunrise" ? "sunrise" : "sunset", 26) }), h("span", { class: "h-pop" }), h("span", { class: "h-temp" }, what)), { _t: `s${t}` }));
      }
    }
  });
  const gone = old ? [...old].filter(([t]) => !items.some((x) => x._t === t)).map(([, [c]]) => (c.getBoundingClientRect().right > r.left ? ghost(c, strip) : null)).filter(Boolean) : [];
  strip.setAttribute("role", "list");
  strip.replaceChildren(...items, ...gone);
  if (!same && strip.scrollLeft) strip.scrollTo({ left: 0, behavior: moving() ? "smooth" : "auto" });
  if (old) {
    for (const g of gone) g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: EASE_OUT, fill: "forwards" }).finished.then(() => g.remove(), () => g.remove());
    for (const c of items) {
      const o = old.get(c._t);
      if (!o) continue;
      const dx = o[1] - c.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) c.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 450, easing: GLIDE });
      rewords(o[0], c);
    }
  } else gone.forEach((g) => g.remove());
  drawHourChart(wx, now, hrs, $("hourly-chart"), S.mode, true);
}

// the chart for some hours (the next 48 on the page, or one day's in its sheet)
// the nights among some hours, as [from, to] (shaded softly on a chart)
function nightsOf(hrs) {
  const nights = [];
  let run = null;
  for (const x of hrs) { if (!x.isDay) { if (!run) run = [x.t, x.t + HOUR]; else run[1] = x.t + HOUR; } else if (run) { nights.push(run); run = null; } }
  if (run) nights.push(run);
  return nights;
}
function drawHourChart(wx, now, hrs, host, mode, showNow) {
  const f = S.f, t = T(), wn = W(), nights = nightsOf(hrs);
  const ens = new Map((wx.ensemble?.hourly || []).map((e) => [e.t, e]));
  const common = { x: { hour: (v) => f.hour(v), day: (v) => f.dayShort(v) }, nights, now: showNow ? now : null, height: 170, key: `${cell(wx.place.lat, wx.place.lon)}:${mode}` };
  const when = (v) => `${f.day(v, now)} ${f.time(v)}`;
  if (mode === "temp") {
    // the ensemble's spread, around the forecast shown (its own middle can sit a little apart, on its coarser grid)
    const pts = hrs.map((x) => { const e = ens.get(x.t); return { t: x.t, v: t(x.temp), lo: e ? t(x.temp + e.p10 - e.p50) : null, hi: e ? t(x.temp + e.p90 - e.p50) : null, x }; });
    const hi = pts.reduce((a, p) => (p.v > a.v ? p : a)), lo = pts.reduce((a, p) => (p.v < a.v ? p : a));
    timeChart(host, { ...common, kind: "line", color: COLOR.temp, points: pts,
      y: { fmt: (v) => f.deg(v) },
      marks: [{ t: hi.t, v: hi.v, text: f.temp(hi.x.temp) }, ...(hi.t !== lo.t ? [{ t: lo.t, v: lo.v, text: f.temp(lo.x.temp) }] : [])],
      summary: `Temperature, hour by hour: from ${f.temp(lo.x.temp)} to ${f.temp(hi.x.temp)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.temp(p.x.temp), label(p.x.code, p.x.isDay)], [f.temp(p.x.feels), "feels like"], ...(p.lo != null ? [[Math.round(p.lo) < 0 ? `${f.deg(p.lo)} to ${f.deg(p.hi)}` : `${Math.round(p.lo)}–${f.deg(p.hi)}`, "could be"]] : [])] }),
      table: { head: ["Time", "Temperature", "Feels like"], rows: pts.map((p) => [when(p.t), f.temp(p.x.temp), f.temp(p.x.feels)]) } });
  } else if (mode === "rain") {
    const pts = hrs.map((x) => ({ t: x.t, v: x.pop ?? (x.precip >= 0.1 ? 100 : 0), x }));
    // each spell's rain, over its wettest hour (the wettest spells first, where they're too close for all of them)
    const marks = I.spells(hrs).map((s) => {
      const mm = s.hours.reduce((a, b) => a + (b.precip || 0), 0), top = s.hours.reduce((a, b) => (b.precip > a.precip ? b : a));
      return mm >= 0.3 ? { t: top.t, v: Math.min(100, top.pop ?? 100), text: f.precip(mm), mm, from: s.start } : null;
    }).filter(Boolean).sort((a, b) => b.mm - a.mm);
    timeChart(host, { ...common, kind: "columns", color: COLOR.rain, points: pts, marks,
      y: { min: 0, max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%` },
      summary: `Chance of rain, hour by hour. ${marks.length ? `Rain from ${[...marks].sort((a, b) => a.from - b.from).map((m) => `${when(Math.max(m.from, now))} (${m.text})`).join(", ")}.` : "Little or no rain expected."}`,
      tip: (p) => ({ title: when(p.t), rows: [[`${Math.round(p.v)}%`, "chance of rain"], [f.precip(p.x.precip), (p.x.snow ?? 0) > 0 ? "expected (snow)" : "expected"]] }),
      table: { head: ["Time", "Chance", "Amount"], rows: pts.map((p) => [when(p.t), `${Math.round(p.v)}%`, f.precip(p.x.precip)]) } });
  } else {
    const pts = hrs.map((x) => ({ t: x.t, v: wn(x.wind), lo: wn(x.wind), hi: wn(Math.max(x.gust ?? x.wind, x.wind)), x }));
    const top = hrs.reduce((a, b) => ((b.gust ?? 0) > (a.gust ?? 0) ? b : a));
    timeChart(host, { ...common, kind: "line", color: COLOR.wind, points: pts,
      y: { min: 0, fmt: (v) => String(Math.round(v)) },
      marks: [{ t: top.t, v: wn(top.gust ?? top.wind), text: `gusts ${f.wind(top.gust)}` }],
      summary: `Wind in ${f.windUnit}, hour by hour, with gusts up to ${f.wind(top.gust)}.`,
      tip: (p) => ({ title: when(p.t), rows: [[f.wind(p.x.wind), `from the ${compassWord(p.x.dir ?? 0)}`], [f.wind(p.x.gust), "gusts"]] }),
      table: { head: ["Time", "Wind", "Gusts", "From"], rows: pts.map((p) => [when(p.t), f.wind(p.x.wind), f.wind(p.x.gust), compassWord(p.x.dir ?? 0)]) } });
  }
}

// the view (temperature, rain or wind) on both switches
function showMode(mode) {
  S.mode = mode;
  for (const seg of [$("hourly-seg"), $("days-seg")]) {
    const tabs = [...seg.children], i = tabs.findIndex((x) => x.dataset.mode === mode);
    tabs.forEach((x, k) => x.setAttribute("aria-selected", String(k === i)));
    seg.style.setProperty("--seg-i", String(i));
  }
}
// until one's chosen, the view the weather calls for (as iOS's Weather picks): rain if it's raining or due within the
// hour, wind if it's blowing a gale, else temperature
function viewFor(wx, now) {
  const nc = I.nowcast(wx, now, S.f), c = wx.current || {};
  return nc && (nc.now || nc.startsAt - now <= HOUR) ? "rain" : (c.gust ?? 0) >= 62 ? "wind" : "temp";
}

function daily(wx, now) {
  const f = S.f, days = wx.daily.filter((d) => d.date >= dayStart(now)).slice(0, 16);
  if (!days.length) return;
  $("daily-n").textContent = `${days.length}-day`;
  const conf = I.confidence(wx);
  const lo = Math.min(...days.map((d) => d.tmin)), hi = Math.max(...days.map((d) => d.tmax)), span = Math.max(1, hi - lo);
  const curT = wx.current?.temp;
  // (in the rain and wind views, each day's hours drawn small: the wind on one scale for all the days)
  const mode = S.mode, hoursOf = (d) => I.hoursBetween(wx, d.date + HOUR, d.date + DAY + HOUR), gTop = Math.max(50, ...days.map((d) => d.gustMax ?? 0));
  $("days").className = `days v-${mode}`;
  // (the first ten; the rest, less certain, under "Show 6 more days")
  const rows = days.slice(0, S.allDays ? days.length : FIRST_DAYS).map((d, i) => {
    const left = (d.tmin - lo) / span, width = Math.max(0.03, (d.tmax - d.tmin) / span);
    const fill = h("i", { class: "d-fill" });
    fill.style.left = `${left * 100}%`; fill.style.width = `${width * 100}%`;
    fill.style.backgroundSize = `${(1 / width) * 100}% 100%`;
    fill.style.backgroundPosition = `${width >= 0.999 ? 0 : (left / (1 - width)) * 100}% 0`;
    const bar = h("span", { class: "d-bar" }, fill);
    if (i === 0 && curT != null) { const dot = h("i", { class: "d-now" }); dot.style.left = `${Math.min(1, Math.max(0, (curT - lo) / span)) * 100}%`; bar.append(dot); }
    const c = conf[d.key], unsure = c?.level === "low" && i > 0 && i < 7;
    const pop = (d.popMax ?? 0) >= 20 ? `${Math.round(d.popMax / 10) * 10}%` : "";
    const name = i === 0 ? "Today" : f.dayShort(d.date);
    // (a chance of rain with next to none expected: a trace, not "dry" under its chance)
    const amount = (d.precip ?? 0) >= 0.1 ? f.precip(d.precip) : (d.popMax ?? 0) >= 20 ? "a trace" : "dry";
    const says = mode === "rain" ? `${Math.round(d.popMax ?? 0)}% chance of rain, ${amount}` : mode === "wind" ? `wind up to ${f.wind(d.windMax)}, gusts ${f.wind(d.gustMax)}`
      : `high ${f.temp(d.tmax)}, low ${f.temp(d.tmin)}${pop ? `, ${pop} chance of rain` : ""}`;
    // the temperatures and their range; or when the rain falls, its chance and how much; or the wind and its gusts
    const tail = mode === "rain" ? [h("span", { class: "d-chart", svg: dayRain(hoursOf(d), now) }), h("span", { class: "d-val" }, h("b", { class: "rain" }, `${Math.round((d.popMax ?? 0) / 10) * 10}%`), h("small", {}, amount))]
      : mode === "wind" ? [h("span", { class: "d-chart", svg: dayWind(hoursOf(d), gTop, now) }), h("span", { class: "d-val" }, h("b", {}, String(f.windNum(d.windMax)), h("small", { class: "u" }, ` ${f.windUnit}`)), h("small", {}, `gusts ${f.windNum(d.gustMax)}`))]
      : [h("span", { class: "d-lo" }, f.temp(d.tmin)), bar, h("span", { class: "d-hi" }, f.temp(d.tmax))];
    return Object.assign(h("li", { class: i === 7 ? "far" : null }, i === 7 ? h("span", { class: "far-note" }, "Less certain") : null, h("button", { class: "day-row", type: "button", onclick: () => openDay(d.key), "aria-label": `${f.day(d.date, now)}: ${label(d.code)}, ${says}${unsure ? ", uncertain" : ""}` },
      h("span", { class: "d-name" }, name, h("small", { class: unsure ? "unsure" : "" }, unsure ? "Uncertain" : f.date(d.date))),
      h("span", { class: "d-icon" }, h("span", { svg: weatherIcon(iconOf(d.code, true), 30) }), mode === "temp" ? h("span", { class: "d-pop" }, pop) : null),
      ...tail)), { _key: d.key });
  });
  // (drawn again for the same place, on screen: in another view, each row's figures and little chart come in from the
  // side, one row after another, and back to the temperatures the bars sweep out again; in the same view, each bar
  // moves from where it was to where it is, and only the figures that have changed rise in)
  const list = $("days"), here = cell(wx.place.lat, wx.place.lon), same = list._at === here, was = list._mode;
  const r = same && moving() ? list.getBoundingClientRect() : null, old = r && r.bottom > 0 && r.top < innerHeight ? new Map([...list.children].map((li) => [li._key, li])) : null;
  list._at = here; list._mode = mode;
  list.replaceChildren(...rows);
  if (same && was && was !== mode) {
    if (mode === "temp") drawn.delete(`${here}:days`);
    if (old) rows.forEach((li, i) => {
      if (li.getBoundingClientRect().top > innerHeight) return;
      for (const x of li.querySelectorAll(".d-icon, .d-lo, .d-bar, .d-hi, .d-chart, .d-val")) x.animate([{ opacity: 0, transform: "translateX(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: i * 18, easing: GLIDE, fill: "backwards" });
    });
  } else if (old) for (const li of rows) {
    const o = old.get(li._key);
    if (!o) continue;
    rewords(o, li);
    const a = o.querySelector(".d-fill"), b = li.querySelector(".d-fill"), p = o.querySelector(".d-now"), q = li.querySelector(".d-now"), t = { duration: 450, easing: GLIDE };
    if (a && b && (a.style.left !== b.style.left || a.style.width !== b.style.width)) b.animate([{ left: a.style.left, width: a.style.width, backgroundSize: a.style.backgroundSize, backgroundPosition: a.style.backgroundPosition }, { left: b.style.left, width: b.style.width, backgroundSize: b.style.backgroundSize, backgroundPosition: b.style.backgroundPosition }], t);
    if (p && q && p.style.left !== q.style.left) q.animate([{ left: p.style.left }, { left: q.style.left }], t);
  }
  list.nextElementSibling?.remove();
  // (under the list, not in it, as the insights' "N more" is)
  if (days.length > rows.length) list.after(h("button", { class: "ins-more days-more", type: "button", onclick: () => {
    S.allDays = true; daily(S.wx, nowWall(S.wx.place.offset));
    // the rest rise in where the button was, the first of them with focus
    const more = [...list.children].slice(FIRST_DAYS);
    more.forEach((r, i) => { if (r.getBoundingClientRect().top < innerHeight) { r.classList.add("rise"); r.style.setProperty("--i", String(i)); } });
    more[0]?.querySelector(".day-row").focus({ preventScroll: true });
  } }, `Show ${days.length - rows.length} more days`, h("span", { svg: glyph("chevron", 14) })));
  motion("days", ...rows);
}
const FIRST_DAYS = 10;
// a day's rain, an hour a bar (by when it falls: the hour up to each hour's time), drizzle still showing; the hours gone
// fainter
function dayRain(hs, now) {
  const bars = hs.map((x) => {
    const mm = x.precip || 0, k = (new Date(x.t).getUTCHours() + 23) % 24, ht = mm >= 0.05 ? Math.max(2.5, Math.min(1, Math.sqrt(mm / 4)) * 22) : 1;
    return `<rect x="${k * 4 + 0.5}" y="${(24 - ht).toFixed(1)}" width="3" height="${ht.toFixed(1)}" rx="1"${mm >= 0.05 ? "" : ' class="dry"'}${x.t <= now ? ' opacity="0.45"' : ""}/>`;
  }).join("");
  return `<svg class="dr" viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}
// a day's wind, hour by hour: its speed a line, its gusts a band above it, on one scale for all the days (top, km/h)
function dayWind(hs, top, now) {
  if (hs.length < 2) return "";
  const X = (x) => (((new Date(x.t).getUTCHours() + 23) % 24) * 4 + 2).toFixed(1), Y = (v) => (23 - Math.min(1, (v || 0) / top) * 21).toFixed(1);
  const line = hs.map((x, i) => `${i ? "L" : "M"}${X(x)} ${Y(x.wind)}`).join(""), band = `${line}${[...hs].reverse().map((x) => `L${X(x)} ${Y(Math.max(x.gust ?? x.wind, x.wind))}`).join("")}z`;
  // (the hours gone, fainter: drawn twice, the second time only from now on)
  const past = hs.filter((x) => x.t <= now), id = `dw${++dwN}`, from = past.length ? X(past[past.length - 1]) : 0;
  const draw = (attrs = "") => `<g${attrs}><path class="band" d="${band}"/><path class="line" d="${line}" vector-effect="non-scaling-stroke"/></g>`;
  return `<svg class="dw" viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">${past.length ? `<clipPath id="${id}"><rect x="${from}" y="-4" width="${96 - from}" height="32"/></clipPath>${draw(' opacity="0.4"')}${draw(` clip-path="url(#${id})"`)}` : draw()}</svg>`;
}
let dwN = 0;

// The best times: those worth it today or tomorrow, each a tile; those that aren't, named in a line under them (a
// tap shows them too, faded)
function windows(wx, now) {
  const f = S.f, list = I.windows(wx, now, f, { activities: S.settings.activities, extras: S.settings.extras });
  const tile = (w) => h("div", { class: `win${w.rating === "Poor" ? " poor" : ""}` },
    h("div", { class: "win-name" }, h("span", { svg: glyph(w.icon, 16) }), w.name),
    h("div", { class: "win-day" }, h("span", {}, w.start == null ? "Not today or tomorrow" : f.day(w.start, now)), h("span", { class: "win-rate", "data-r": w.rating }, w.rating)),
    // (one that's begun already: from now)
    w.start == null ? null : h("div", { class: "win-time" }, `${w.end && w.start <= now && w.end > now ? "Now" : f.time(w.start)}${w.end ? `–${f.time(w.end)}` : ""}`),
    h("div", { class: "win-text" }, w.text));
  // (none chosen in Settings: no card at all)
  $("windows").hidden = !list.length;
  const good = list.filter((w) => w.rating !== "Poor"), poor = list.filter((w) => w.rating === "Poor");
  const grid = $("win-grid");
  grid.replaceChildren(...good.map(tile), ...(S.allWins ? poor.map(tile) : []));
  $("win-poor")?.remove();
  if (poor.length && !S.allWins) grid.after(h("button", { class: "win-poor", id: "win-poor", type: "button", "aria-label": `Not looking good today or tomorrow: ${poor.map((w) => w.name).join(", ")}. Show them`,
    // (they come in where the line was; the first of them has its focus)
    onclick: () => { S.allWins = true; windows(S.wx, nowWall(S.wx.place.offset)); const w = grid.children[good.length]; if (w) { w.tabIndex = -1; w.focus({ preventScroll: true }); } } },
    h("span", {}, h("b", {}, good.length ? "Not looking good: " : "Nothing looking good today or tomorrow: "), poor.map((w) => w.name).join(", ")), h("span", { svg: glyph("chevron", 14) })));
}

function climate(wx, now) {
  const f = S.f, t = T(), box = $("climate-body");
  if (!wx.climate) {
    const failed = store.get(`clim2:${cell(wx.place.lat, wx.place.lon)}`)?.failedAt;
    box.replaceChildren(h("p", { class: "muted small" }, failed ? "The climate archive is busy; this will fill in later." : "Gathering 30 years of weather…"));
    return;
  }
  const d = I.dayOf(wx, now), c = d && climateOn(wx.climate, d.date);
  if (!c?.tmax) { box.replaceChildren(h("p", { class: "muted small" }, "No climate record for this spot.")); return; }
  const p = rankIn(c.tmax.sorted, d.tmax);
  const lede = h("p", { class: "small" }, `Warmer than ${Math.round(p)}% of days here since ${wx.climate.years[0]}.`);
  // (the range kept from one drawing to the next, so it draws in once for a place and then changes where it is)
  const chart = box.querySelector(":scope > .range") || h("div", { class: "range" });
  const ago = yearsAgo(wx.climate, d.date);
  const facts = h("ul", { class: "facts" },
    h("li", {}, h("b", {}, f.temp(c.tmax.mean)), "Normal high"),
    h("li", {}, h("b", {}, f.temp(c.tmin.mean)), "Normal low"),
    c.recordHigh ? h("li", {}, h("b", {}, `${f.temp(c.recordHigh.v)} (${c.recordHigh.year})`), `Warmest ${f.dateLong(d.date)}`) : null,
    c.recordLow ? h("li", {}, h("b", {}, `${f.temp(c.recordLow.v)} (${c.recordLow.year})`), `Coldest ${f.dateLong(d.date)} night`) : null,
    c.wet != null ? h("li", {}, h("b", {}, `${Math.round(c.wet * 100)}%`), "Days with rain") : null,
    ago ? h("li", {}, h("b", {}, `${f.temp(ago.tmax)}, ${ago.rain >= 0.5 ? f.precip(ago.rain) : "dry"}`), "This day last year") : null);
  if (chart.isConnected) { chart.previousElementSibling.replaceWith(lede); chart.nextElementSibling.replaceWith(facts); } else box.replaceChildren(lede, chart, facts);
  rangeChart(chart, { key: cell(wx.place.lat, wx.place.lon), p10: t(c.tmax.p10), p25: t(c.tmax.p25), p75: t(c.tmax.p75), p90: t(c.tmax.p90), mean: t(c.tmax.mean), value: t(d.tmax), valueLabel: `Today ${f.temp(d.tmax)}`, record: c.recordHigh ? { v: t(c.recordHigh.v), year: c.recordHigh.year } : null,
    fmt: (v) => f.deg(v), summary: `Today's high ${f.temp(d.tmax)} against the normal range for the date: ${f.temp(c.tmax.p10)} to ${f.temp(c.tmax.p90)}, normal ${f.temp(c.tmax.mean)}.` });
}

// the tiles that open, in their order: kind, title, icon
const TILES = [["feels", "Feels like", "heat"], ["wind", "Wind", "wind"], ["humidity", "Humidity", "drop"], ["rain", "Rain", "rain"],
  ["pressure", "Pressure", "gauge"], ["visibility", "Visibility", "eye"], ["uv", "UV index", "uv"], ["air", "Air quality", "air"], ["sea", "Sea", "waves", "wide"],
  ["sun", "Sun", "sunrise"], ["moon", "Moon", "moon"]];
const uvName = (u) => (u < 3 ? "Low" : u < 6 ? "Moderate" : u < 8 ? "High" : u < 11 ? "Very high" : "Extreme");
const airName = (q) => (q <= 20 ? "Good" : q <= 40 ? "Fair" : q <= 60 ? "Moderate" : q <= 80 ? "Poor" : q <= 100 ? "Very poor" : "Extremely poor");
const seaName = (c) => (c == null ? "" : c < 11 ? "Very cold" : c < 15 ? "Cold" : c < 18 ? "Cool" : c < 22 ? "Pleasant" : "Warm");
// a tile of what it's like right now, that opens to its own sheet (openDetail): its title a button that covers the whole tile
function tileFor([kind, title, icon, wide], ...kids) {
  return h("section", { class: `tile opens${wide ? " wide" : ""}`, "data-kind": kind }, h("h3", {}, h("span", { svg: glyph(icon, 14) }),
    h("button", { class: "tile-open", type: "button", "aria-haspopup": "dialog", "aria-controls": "detail", onclick: () => openDetail(kind) }, title),
    h("span", { class: "tile-chev", svg: glyph("chevron", 12) })), ...kids);
}
// a temperature's colour, cold blue to hot red (the 16 days' bars' colours: styles.css .d-fill)
const WARMTH = [[-5, [124, 196, 255]], [7, [142, 230, 168]], [17, [255, 209, 102]], [25, [255, 154, 77]], [32, [255, 93, 93]]];
function warmth(c) {
  const k = WARMTH.findIndex(([t]) => c < t);
  if (k === 0) return `rgb(${WARMTH[0][1]})`;
  if (k < 0) return `rgb(${WARMTH[WARMTH.length - 1][1]})`;
  const [t0, a] = WARMTH[k - 1], [t1, b] = WARMTH[k], q = (c - t0) / (t1 - t0);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * q)).join(",")})`;
}
// a thermometer filled to how warm it feels (in its colour), marked where the actual temperature is: −15° at the
// bulb, 40° at the top
function thermometer(feels, actual) {
  const y = (c) => +(58 - Math.min(1, Math.max(0, (c + 15) / 55)) * 50).toFixed(1), yf = y(feels), ya = y(actual), col = warmth(feels);
  return `<svg class="thermo" viewBox="0 0 44 80" aria-hidden="true"><path class="th-glass" d="M14 10a6 6 0 0 1 12 0v48a10 10 0 1 1 -12 0z"/>`
    + `<rect class="th-fill" x="17" y="${yf}" width="6" height="${(68 - yf).toFixed(1)}" rx="3" fill="${col}"/><circle cx="20" cy="66" r="7" fill="${col}"/>`
    + `<path class="th-mark" d="M29 ${ya}l6 -4v8z"/></svg>`;
}
// a pressure dial, 960 to 1050 hPa round three quarters of a circle, the reading marked, and which way it's going
// in the middle (rising, falling, steady)
function pressureDial(hpa, dp) {
  const q = Math.min(1, Math.max(0, (hpa - 960) / 90)), at = (k, r) => { const a = ((135 + k * 270) * Math.PI) / 180; return [40 + r * Math.cos(a), 40 + r * Math.sin(a)]; };
  let ticks = "";
  for (let i = 0; i <= 36; i++) { const [x1, y1] = at(i / 36, 30), [x2, y2] = at(i / 36, i % 9 ? 34 : 36); ticks += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
  const [a1, b1] = at(q, 24), [a2, b2] = at(q, 37);
  const way = dp == null || Math.abs(dp) < 1 ? "M32 37h16M32 43h16" : dp > 0 ? "M40 50V30M33 37l7-7 7 7" : "M40 30v20M33 43l7 7 7-7";
  const box = h("div", { svg: `<svg class="dial" viewBox="0 0 80 80" aria-hidden="true"><path class="dl-ticks" d="${ticks}"/>`
    + `<g class="dl-needle-g"><path class="dl-needle" d="M${a1.toFixed(1)} ${b1.toFixed(1)}L${a2.toFixed(1)} ${b2.toFixed(1)}"/></g><path class="dl-way" d="${way}"/></svg>` });
  // (where the needle swings round from, the dial's low end: set here, as the page's CSP allows no style attributes)
  box.firstElementChild.style.setProperty("--sw", `${(-q * 270).toFixed(0)}deg`);
  return box;
}
// the next hours' rain as little bars, one an hour, scaled to the wettest (or to 1 mm, so drizzle stays small)
function rainBars(hrs) {
  const top = Math.max(1, ...hrs.map((x) => x.precip || 0)), w = 240 / Math.max(1, hrs.length);
  const bars = hrs.map((x, i) => { const v = Math.max((x.precip || 0) > 0.05 ? 2.5 : 0.8, ((x.precip || 0) / top) * 26); return `<rect x="${(i * w + 1).toFixed(1)}" y="${(28 - v).toFixed(1)}" width="${(w - 2.5).toFixed(1)}" height="${v.toFixed(1)}" rx="1.5"${(x.precip || 0) > 0.05 ? "" : ' class="dry"'}/>`; }).join("");
  return h("div", { svg: `<svg class="rbars" viewBox="0 0 240 28" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>` });
}
// a bar filled part of the way (0 to 1), and a scale with a knob on it and its ends named
const fillBar = (k, cls) => { const b = h("div", { class: `fbar ${cls}` }), i = h("i"); i.style.width = `${Math.min(100, Math.max(0, k * 100))}%`; b.append(i); return b; };
// the tide over the next day, as a little curve: the water under it, now marked, its highs and lows dotted
function tideCurve(m, now) {
  const pts = m.hourly.filter((x) => x.tide != null && x.t >= now - 2 * HOUR && x.t <= now + 22 * HOUR);
  if (pts.length < 8) return null;
  const t0 = now - 2 * HOUR, lo = Math.min(...pts.map((p) => p.tide)), r = Math.max(0.3, Math.max(...pts.map((p) => p.tide)) - lo);
  const X = (t) => ((t - t0) / (24 * HOUR)) * 160, Y = (v) => 52 - ((v - lo) / r) * 40, n = (v) => v.toFixed(1);
  const P = pts.map((p) => [X(p.t), Y(p.tide)]);
  // (a smooth line through the hours)
  const line = P.map((c, i) => { if (!i) return `M${n(c[0])} ${n(c[1])}`; const a = P[i - 2] || P[i - 1], b = P[i - 1], d = P[i + 1] || c;
    return `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (d[0] - b[0]) / 6)} ${n(c[1] - (d[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`; }).join("");
  const k = pts.findIndex((p) => p.t > now), a = pts[k - 1], b = pts[k], here = a && b ? a.tide + ((b.tide - a.tide) * (now - a.t)) / (b.t - a.t) : null;
  const dots = m.tides.filter((x) => x.t > pts[0].t && x.t < pts[pts.length - 1].t).map((x) => `<circle class="tc-mark" cx="${n(X(x.t))}" cy="${n(Y(x.h))}" r="2.2"/>`).join("");
  return h("div", { svg: `<svg class="tidec" viewBox="0 0 160 60" aria-hidden="true"><path class="tc-water" d="${line}L${n(P[P.length - 1][0])} 60L${n(P[0][0])} 60z"/><path class="tc-line" pathLength="1" d="${line}"/>${dots}`
    + `${here != null ? `<line class="tc-now" x1="${n(X(now))}" x2="${n(X(now))}" y1="4" y2="60"/><circle class="tc-here" cx="${n(X(now))}" cy="${n(Y(here))}" r="3.6"/>` : ""}</svg>` });
}
// (a knob along a meter: at, how far along, for it to slide in from the start: styles.css knob)
const knob = (pct) => { const i = h("i"); i.style.left = `${pct}%`; i.style.setProperty("--at", String(pct)); return i; };
const scaleBar = (k, cls, ends) => { const m = h("div", { class: `meter ${cls}` }); m.append(knob(Math.min(100, Math.max(0, k * 100)))); return [m, h("div", { class: "ends" }, h("span", {}, ends[0]), h("span", {}, ends[1]))]; };

function tiles(wx, now) {
  const f = S.f, c = wx.current || I.hourAt(wx, now), out = [], d = I.dayOf(wx, now);
  if (!c) return;
  // what each tile says, made afresh wherever it's shown (the tile, and its sheet: openDetail)
  const say = {};
  // feels like: a thermometer filled to it, with the actual temperature marked
  const diff = (c.feels ?? c.temp) - c.temp;
  const why = diff <= -2 ? ((c.wind ?? 0) >= 12 ? `wind makes it feel ${f.delta(diff)} colder` : `it feels ${f.delta(diff)} colder`) : diff >= 2 ? `humidity makes it feel ${f.delta(diff)} warmer` : "close to it";
  say.feels = () => [h("div", { class: "wind-row" }, h("div", { class: "big" }, f.temp(c.feels)), h("div", { svg: thermometer(c.feels ?? c.temp, c.temp) })),
    h("p", { class: "sub" }, `Actual ${f.temp(c.temp)}: ${why}.`)];
  // wind
  const bf = beaufort(c.wind ?? 0), dir = c.dir ?? 0;
  const comp = `<svg class="compass" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring" cx="40" cy="40" r="33"/>${[0, 90, 180, 270].map((a) => `<line class="tick" x1="40" y1="6" x2="40" y2="11" transform="rotate(${a} 40 40)"/>`).join("")}<text x="40" y="20" text-anchor="middle">N</text><text x="62" y="43" text-anchor="middle">E</text><text x="40" y="66" text-anchor="middle">S</text><text x="18" y="43" text-anchor="middle">W</text><g class="needle-g"><path class="needle" transform="rotate(${(dir + 180) % 360} 40 40)" d="M40 14l6 30h-12z"/></g><circle cx="40" cy="40" r="3" fill="#fff"/></svg>`;
  say.wind = () => [h("div", { class: "wind-row" }, h("div", {}, h("div", { class: "big" }, String(f.windNum(c.wind)), h("small", {}, f.windUnit)), h("p", {}, `Gusts ${f.windNum(c.gust)}`)), h("div", { svg: comp })),
    h("p", { class: "sub" }, `${bf.name}, from the ${compassWord(dir)}.`)];
  // humidity: a bar filled to it
  const dew = c.dew, dr = dew == null ? null : Math.round(dew);     // (worded by the dew point as shown: 9.6° shows as 10°, so it's "comfortable")
  // (the air's feel, by its dew point: not "dry", which would sit oddly by a high humidity on a cool day)
  const comfort = dr == null ? "" : dr < 10 ? "Fresh" : dr < 15 ? "Comfortable" : dr < 18 ? "A little humid" : dr < 21 ? "Humid" : "Very humid and oppressive";
  say.humidity = () => [h("div", { class: "big" }, `${Math.round(c.rh ?? 0)}%`), fillBar((c.rh ?? 0) / 100, "wet"), h("p", { class: "sub" }, `Dew point ${f.temp(dew)}. ${comfort}.`)];
  // rain: the last day and the next
  const past = I.hoursBetween(wx, now - DAY, now).reduce((a, x) => a + (x.precip || 0), 0), next = I.hoursBetween(wx, now, now + DAY).reduce((a, x) => a + (x.precip || 0), 0);
  say.rain = () => [h("div", { class: "big" }, f.precip(next)), h("p", {}, "in the next 24 hours"), rainBars(I.hoursBetween(wx, now, now + DAY)), h("p", { class: "sub" }, `${f.precip(past)} in the last 24.`)];
  // pressure: a dial, and which way it's going
  const p3 = I.hourAt(wx, now - 3 * HOUR)?.pressure, dp = c.pressure != null && p3 != null ? c.pressure - p3 : null;
  // (its unit under it: four figures and a dial side by side fill a tile)
  say.pressure = () => [h("div", { class: "wind-row" }, h("div", {}, h("div", { class: "big" }, f.pressure(c.pressure).replace(/ (\S+)$/, "")), h("p", {}, f.pressure(c.pressure).split(" ").pop())), c.pressure != null ? pressureDial(c.pressure, dp) : null),
    h("p", { class: "sub" }, dp == null ? "" : Math.abs(dp) < 1 ? "Steady." : `${dp < 0 ? "Falling" : "Rising"} ${f.pressureDelta(dp)} in 3 hours${dp <= -3 ? ": unsettled" : dp >= 3 ? ": settling" : ""}.`)];
  // visibility: on a scale from fog to clear (by how far, on a log scale: 100 m to 30 km)
  const vis = c.vis;
  say.visibility = () => [h("div", { class: "big" }, f.dist(vis)), ...(vis != null ? scaleBar(Math.log10(Math.max(100, vis) / 100) / Math.log10(300), "clear", ["Fog", "Clear"]) : []),
    h("p", { class: "sub" }, vis == null ? "" : vis >= 20000 ? "Excellent." : vis >= 10000 ? "Good." : vis >= 4000 ? "A little haze." : vis >= 1000 ? "Mist or haze." : "Fog.")];
  // UV
  const todayH = I.hoursBetween(wx, dayStart(now), dayStart(now) + DAY), uvPeak = todayH.reduce((a, x) => ((x.uv ?? 0) > (a?.uv ?? -1) ? x : a), null);
  const uv = c.uv ?? 0, meter = (v, max) => { const m = h("div", { class: "meter" }); m.append(knob(Math.min(100, (v / max) * 100))); return m; };
  say.uv = () => [h("div", { class: "big" }, String(Math.round(uv)), h("small", {}, uvName(uv))), meter(uv, 11),
    h("p", { class: "sub" }, uvPeak && uvPeak.uv >= 1 ? `Peaks at ${Math.round(uvPeak.uv)} (${uvName(uvPeak.uv).toLowerCase()}) around ${f.time(uvPeak.t)}.` : "Low all day.")];
  // air quality and pollen
  if (wx.air?.current?.eaqi != null) {
    const a = wx.air.current, q = a.eaqi;
    const pol = (wx.air.hourly || []).filter((x) => x.t >= now - HOUR && x.t < now + 12 * HOUR);
    const top = ["grass", "birch", "alder", "olive", "ragweed", "mugwort"].map((k) => [k, Math.max(0, ...pol.map((x) => x[k] ?? 0))]).sort((x, y) => y[1] - x[1])[0];
    say.air = () => [h("div", { class: "big" }, String(Math.round(q)), h("small", {}, airName(q))), meter(q, 100),
      h("p", { class: "sub" }, `Fine particles ${a.pm25 != null ? Math.round(a.pm25) : "–"} µg/m³.${top && top[1] >= 10 ? ` ${top[0][0].toUpperCase() + top[0].slice(1)} pollen ${top[1] >= 80 ? "high" : top[1] >= 30 ? "moderate" : "low"}.` : pol.some((x) => x.grass != null) ? " Pollen low." : ""}`)];
  }
  // the sea, by it (data.js shapeMarine): how warm, the waves, and the tide
  if (wx.marine) {
    const m = wx.marine, near = (k) => m.hourly.filter((x) => x[k] != null).reduce((a, x) => (!a || Math.abs(x.t - now) < Math.abs(a.t - now) ? x : a), null);
    const s = near("sst"), w = near("wave"), soon = m.tides.filter((x) => x.t > now).slice(0, 2);
    const at = (t) => (f.day(t, now) === "Today" ? f.time(t) : `${f.day(t, now).toLowerCase()} ${f.time(t)}`);
    const tide = soon.length ? `${soon[0].high ? "Rising" : "Falling"}: ${soon.map((x, i) => `${x.high ? (i ? "high" : "High") : i ? "low" : "Low"} ${at(x.t)}`).join(", ")}.` : "";
    say.sea = () => [h("div", { class: "sea-row" },
      h("div", {}, s ? h("div", { class: "big" }, f.temp(s.sst), h("small", {}, seaName(s.sst))) : h("div", { class: "big" }, f.height(w?.wave)),
        w ? h("p", {}, `Waves ${f.height(w.wave)}${w.waveDir != null ? `, from the ${compassWord(w.waveDir)}` : ""}`) : null),
      tideCurve(m, now)),
      h("p", { class: "sub" }, tide)];
  }
  // the sun: when it next sets or rises, its path across the sky (and under it, at night); in its sheet, today's
  // times and the week's
  const more = {};
  if (d) {
    const sk = I.skyFor(wx, d.key), y = wx.daily[wx.daily.indexOf(d) - 1];
    const rise = d.sunrise, set = d.sunset, frac = rise && set ? Math.min(1, Math.max(0, (now - rise) / (set - rise))) : 0;
    const arc = (k) => { const a = Math.PI * (1 - k); return [100 + 80 * Math.cos(a), 70 - 56 * Math.sin(a)]; };
    const [sx, sy] = arc(frac), up = now > rise && now < set;
    let done = ""; for (let k = 0; k <= frac + 1e-9; k += 0.02) { const [x, yy] = arc(Math.min(k, frac)); done += `${done ? "L" : "M"}${x.toFixed(1)} ${yy.toFixed(1)}`; }
    // at night, the sun goes on under the horizon, from where it set to where it'll rise
    const next = wx.daily[wx.daily.indexOf(d) + 1], setBefore = y?.sunset ?? (rise ? rise - 12 * HOUR : null);
    const [n0, n1] = now >= set ? [set, next?.sunrise] : [setBefore, rise];
    const night = !up && n0 && n1 ? Math.min(1, Math.max(0, (now - n0) / (n1 - n0))) : null;
    const below = night != null ? [100 + 80 * Math.cos(Math.PI * night), 70 + 11 * Math.sin(Math.PI * night)] : null;
    const svg = `<svg class="sunarc" viewBox="0 0 200 84" aria-hidden="true"><line class="hz" x1="6" y1="70" x2="194" y2="70"/><path class="arc" d="M20 70A80 56 0 0 1 180 70"/>${
      up ? `<path class="done" pathLength="1" d="${done}"/><circle class="sun" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6"/>`
        : below ? `<path class="under" d="M180 70A80 11 0 0 1 20 70"/><circle class="sun down" cx="${below[0].toFixed(1)}" cy="${below[1].toFixed(1)}" r="5"/>` : ""}</svg>`;
    // (to five minutes an hour or more ahead; to the minute under that, "In 1 min" at the last)
    const until = (t) => { const m = Math.max(1, Math.round((t - now) / 60e3)); return f.dur((m >= 60 ? Math.round(m / 5) * 5 : m) * 60); };
    const nextAt = up ? set : night != null ? n1 : null;
    const change = (a, b) => (a?.daylight && b?.daylight ? ` (${b.daylight < a.daylight ? "−" : "+"}${Math.abs(Math.round((b.daylight - a.daylight) / 60))} min)` : "");
    // (and the sunset, against yesterday's: "17:48 (2 min earlier)")
    const moved = (a, b) => { const m = a?.sunset && b?.sunset ? Math.round(((b.sunset - b.date) - (a.sunset - a.date)) / 60e3) : 0; return m ? ` (${Math.abs(m)} min ${m < 0 ? "earlier" : "later"})` : ""; };
    say.sun = () => [h("div", { class: "big" }, nextAt ? f.time(nextAt) : f.dur(d.daylight), h("small", {}, nextAt ? (up ? "Sunset" : "Sunrise") : "daylight")), h("div", { class: "sun-arc", svg }),
      h("p", { class: "sub" }, nextAt ? `In ${until(nextAt)}. ${up ? `Sunrise ${f.time(rise)}` : `Sunset ${f.time(now >= set ? set : setBefore)}`}.` : "")];
    more.sun = () => {
      const kv = (rows) => h("dl", { class: "kv" }, ...rows.filter((r) => r[1]).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
      const week = wx.daily.slice(wx.daily.indexOf(d) + 1, wx.daily.indexOf(d) + 8).filter((x) => x.sunrise && x.sunset);
      return [h("h3", { class: "day-section" }, "Today"), kv([
        ["First light", sk?.dawn && f.time(sk.dawn)], ["Sunrise", rise && f.time(rise)],
        ["Morning golden hour", rise && sk?.goldenAm?.[1] && `${f.time(rise)}–${f.time(sk.goldenAm[1])}`], ["Evening golden hour", sk?.goldenPm?.[0] && set && `${f.time(sk.goldenPm[0])}–${f.time(set)}`],
        ["Sunset", set && `${f.time(set)}${moved(y, d)}`], ["Dark by", sk?.dusk && f.time(sk.dusk)], ["Daylight", d.daylight && `${f.dur(d.daylight)}${change(y, d)}`]]),
        week.length ? [h("h3", { class: "day-section" }, "The week ahead"), kv(week.map((x) => [f.day(x.date, now), `${f.time(x.sunrise)}–${f.time(x.sunset)} (${f.dur(x.daylight)})`]))] : null].flat().filter(Boolean);
    };
    // the moon: how much of it's lit, when it next rises or sets, and the next full or new moon; in its sheet, all of
    // that and the week's
    if (sk) {
      const ph = sk.phase, nx = nextPhases(now - (sk.offset || 0) * 1000), toWall = (x) => x + (sk.offset || 0) * 1000;
      // (a day the Moon doesn't rise or set: when it next does, tomorrow's)
      const after = next && I.skyFor(wx, next.key);
      const moonAt = (t, k) => (t ? f.time(t) : after?.[k] ? `${f.day(after[k], now)} ${f.time(after[k])}` : "Not today");
      const rel = (t) => { const w = f.day(t, now); return w === "Today" ? f.time(t) : `${/^(Tomorrow|Yesterday)$/.test(w) ? w.toLowerCase() : w} ${f.time(t)}`; };
      const ev = [[sk.moonrise, "Rises"], [sk.moonset, "Sets"], [after?.moonrise, "Rises"], [after?.moonset, "Sets"]].filter(([t]) => t && t > now).sort((a, b) => a[0] - b[0])[0];
      const phase = [[nx.full, "Full Moon"], [nx.new, "New Moon"]].filter(([t]) => t).sort((a, b) => a[0] - b[0])[0];
      const lit = (p) => `${Math.round(p.lit * 100)}%`;
      say.moon = () => [h("div", { class: "moon-row" }, h("span", { svg: moonIcon(ph.lit, ph.waxing, 44, wx.place.lat < 0) }), h("div", {}, h("div", { class: "big" }, lit(ph)), h("p", {}, ph.name))),
        h("p", { class: "sub" }, [ev && `${ev[1]} ${rel(ev[0])}.`, phase && `${phase[1]} ${mid(f.day(toWall(phase[0]), now))}.`].filter(Boolean).join(" "))];
      more.moon = () => {
        const days = wx.daily.slice(wx.daily.indexOf(d) + 1, wx.daily.indexOf(d) + 8).map((x) => [x, I.skyFor(wx, x.key)]).filter(([, k]) => k);
        return [h("h3", { class: "day-section" }, "Tonight"), h("dl", { class: "kv" },
          h("dt", {}, "Moonrise"), h("dd", {}, moonAt(sk.moonrise, "moonrise")), h("dt", {}, "Moonset"), h("dd", {}, moonAt(sk.moonset, "moonset")),
          h("dt", {}, "Lit"), h("dd", {}, `${lit(ph)}, ${ph.name.toLowerCase()}`),
          nx.full ? [h("dt", {}, "Full Moon"), h("dd", {}, `${f.day(toWall(nx.full), now)}${toWall(nx.full) - now > 6 * DAY ? "" : ` ${f.time(toWall(nx.full))}`}`)] : null,
          nx.new ? [h("dt", {}, "New Moon"), h("dd", {}, f.day(toWall(nx.new), now))] : null),
          days.length ? [h("h3", { class: "day-section" }, "The week ahead"), h("dl", { class: "kv moons" }, ...days.flatMap(([x, k]) => [h("dt", {}, f.day(x.date, now)),
            h("dd", {}, h("span", { svg: moonIcon(k.phase.lit, k.phase.waxing, 16, wx.place.lat < 0) }), `${lit(k.phase)}${k.moonrise ? `, rises ${f.time(k.moonrise)}` : ""}`)]))] : null].flat().filter(Boolean);
      };
    }
  }
  for (const t of TILES) if (say[t[0]]) out.push(tileFor(t, ...say[t[0]]()));
  S.say = say; S.more = more;
  // (drawn again for the same place, on screen: each figure or word that's changed rises in where it is)
  const box = $("tiles"), here = cell(wx.place.lat, wx.place.lon), r = box._at === here && moving() ? box.getBoundingClientRect() : null;
  const old = r && r.bottom > 0 && r.top < innerHeight ? new Map([...box.children].map((x) => [x.dataset.kind, x])) : null;
  box._at = here;
  box.replaceChildren(...out);
  if (old) for (const x of out) rewords(old.get(x.dataset.kind), x);
  motion("tiles", ...out);
}


/* ---------- one day, in full ---------- */
// how close each model has been here (weather/skill.js, from the nearest airport's reports)
function accuracy(wx) {
  const f = S.f, box = $("accuracy-body"), k = wx.skill, note = (t) => h("p", { class: "small muted" }, t);
  // (only where there's a station to check against: nothing to say otherwise)
  $("accuracy").hidden = !k?.station;
  if (!k?.station) { box.replaceChildren(); return; }
  const st = k.station;
  if (!k.skill) { box.replaceChildren(note(k.obsDays >= MIN_DAYS ? `Not enough past forecasts to compare with ${st.name}'s reports yet.` : `Recording ${st.name}'s reports: ${k.obsDays} of ${MIN_DAYS} days.`)); return; }
  const s = k.skill;
  box.replaceChildren(...[
    h("p", { class: "small muted" }, `${st.name} (${f.dist(st.km * 1000)}) · last ${s.days} days`),
    h("table", { class: "models acc" }, h("caption", { class: "sr-only" }, "Each model's average error and lean, next-day forecasts"),
      h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "Highs"), h("th", { scope: "col" }, "Lows"), h("th", { scope: "col" }, "Leans")),
      ...s.models.map((m, i) => h("tr", {}, h("td", {}, m.name, i === 0 ? h("span", { class: "best" }, "Best") : null), h("td", {}, `±${f.deltaFine(m.hiMae)}`),
        h("td", {}, m.loMae != null ? `±${f.deltaFine(m.loMae)}` : "–"), h("td", {}, Math.abs(m.hiBias) >= 0.5 ? `${f.deltaFine(m.hiBias)} ${m.hiBias > 0 ? "warm" : "cold"}` : "–")))),
    s.days < TUNE_DAYS ? h("p", { class: "chart-note" }, `Tuning starts at ${TUNE_DAYS} days.`) : null,
    tunedToo(k.local) ? h("p", { class: "chart-note" }, `Also tuned here: ${tunedToo(k.local)}.`) : null].filter(Boolean));
}

// what else the airport's reports have the hours tuned for (skill.js localSkill), in words: "nights 1.2° cooler, wind
// 15% stronger" (only what makes a difference worth saying)
function tunedToo(l) {
  if (!l || S.settings.tune === false) return "";
  const f = S.f, out = [], avg = (ks) => ks.reduce((a, k) => a + l.temp[k], 0) / ks.length;
  for (const [name, ks] of [["nights", [7, 0, 1]], ["mornings", [2, 3]], ["afternoons", [4, 5]], ["evenings", [6]]]) {
    const e = avg(ks);
    if (Math.abs(e) >= 0.5) out.push(`${name} ${f.deltaFine(e)} ${e > 0 ? "cooler" : "warmer"}`);
  }
  if (Math.abs(l.dew) >= 0.5) out.push(`dew point ${f.deltaFine(l.dew)} ${l.dew > 0 ? "lower" : "higher"}`);
  for (const [name, r] of [["wind", l.wind], ["gusts", l.gust]]) if (Math.abs(r - 1) >= 0.08) out.push(`${name} ${Math.round(Math.abs(r - 1) * 100)}% ${r > 1 ? "stronger" : "lighter"}`);
  return out.join(", ");
}
// Today, Tomorrow and Yesterday mid-sentence: "Full Moon tomorrow."
const mid = (s) => s.replace(/^(Today|Tomorrow|Yesterday)\b/, (m) => m.toLowerCase());

/* ---------- places ---------- */
// (My Location's position, to three decimal places: locate, and start for one kept from before)
const r3 = (v) => Math.round(v * 1e3) / 1e3;
// (after: a sheet going, that the page waits for before it turns to where you are)
async function locate(quiet = false, after = null) {
  if (!navigator.geolocation) { if (!quiet) toast("Location isn't available in this browser."); return false; }
  const btn = $("locate-btn"); btn.classList.add("busy");
  try {
    const pos = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60e3 }));
    // (to three decimal places, about 100 m, from here on: all a forecast needs, the hills and valleys in it included,
    // and nothing nearer than that sent anywhere, or kept)
    const lat = r3(pos.coords.latitude), lon = r3(pos.coords.longitude), before = S.places.find((x) => x.gps);
    // (hardly moved since last time, under a kilometre: the name it had, rather than asking again)
    const was = S.places.find((x) => x.gps && x.name !== "My Location" && Math.abs(x.lat - lat) < 0.009 && Math.abs(x.lon - lon) < 0.009 / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    // (found quietly, as it's opened: the place being looked at stays the one looked at; and still in the same square
    // of the forecast's, what's being asked for already is what's wanted)
    const mine = !quiet || !S.places.length || !!place()?.gps, same = quiet && before && cell(before.lat, before.lon) === cell(lat, lon);
    // (My Location's notifications, if it has any, follow it)
    const named = (name) => {
      const n = S.settings.notify, moved = (q) => q?.gps && (cell(q.lat, q.lon) !== cell(lat, lon) || q.name !== name);
      const all = [...n.places, n.brief].filter(moved);
      if (!all.length) return;
      for (const q of all) Object.assign(q, { lat, lon, name });
      saveSettings(); notifySaved().catch(() => {});
    };
    // (named as it was, until the new name's found, if it's not gone far; "My Location" if it has)
    const as = was || (same ? before : null);
    // (and on show, the page turning to it, if it wasn't: it's the first of the places)
    const i = addPlace({ name: as?.name || "My Location", region: as?.region || "", lat, lon, gps: true }, false), here = S.places[i];
    if (mine && !same) (after || Promise.resolve()).then(() => turnTo(S.places.indexOf(here)));
    else { if (mine) { S.cur = i; savePlaces(); } showPlace(); }
    // (its name looked up meanwhile, the forecast not kept waiting for it)
    if (was) named(was.name);
    else nameOf(lat, lon).then((nm) => {
      const p = S.places.find((x) => x.gps);
      if (!p || p.lat !== lat || p.lon !== lon) return;
      if (nm) { Object.assign(p, nm); savePlaces(); showPlace(); }
      named(p.name);
    });
    return true;
  } catch (e) {
    // (said under the bar, by the button it was asked from, for a few seconds: not in the forecast's own lines)
    if (!quiet) toast(e?.code === 1 ? "Location is turned off for this site. You can search for a place instead." : "Couldn't find your location just now.");
    return false;
  } finally { stopSpin(btn); }
}
// (the button's spin let finish its turn, rather than snapping back upright)
function stopSpin(btn) {
  const g = btn.querySelector(".g"), a = g?.getAnimations().find((x) => x.animationName === "spin"), at = a ? (Number(a.currentTime) % 1000) / 1000 : 0;
  btn.classList.remove("busy");
  if (a && !calm.matches && at > 0.02) g.animate([{ transform: `rotate(${at * 360}deg)` }, { transform: "rotate(360deg)" }], { duration: Math.max(240, (1 - at) * 1400), easing: EASE_OUT });
}
// A word under the bar, about something just asked for that couldn't be done (styles.css .toast): in, four seconds, out;
// read out as it comes. Over an open sheet too, where the browser has a top layer (wire: shown again each time, to be
// over whatever was shown since)
let toastT = 0;
function toast(text) {
  const el = $("toast"), still = calm.matches;
  clearTimeout(toastT);
  el.getAnimations().forEach((a) => a.cancel());
  el.textContent = text;
  if (el.popover) { if (el.matches(":popover-open")) el.hidePopover(); el.showPopover(); }
  el.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(-8px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: still ? 150 : 350, easing: GLIDE });
  toastT = setTimeout(() => el.animate([{ opacity: 1 }, { opacity: 0, transform: still ? "none" : "translateY(-6px)" }], { duration: 250, easing: EASE_IN, fill: "forwards" })
    .finished.then(() => { el.textContent = ""; el.getAnimations().forEach((a) => a.cancel()); if (el.popover && el.matches(":popover-open")) el.hidePopover(); }, () => {}), 4000);
}
// the saved places as cards, as iOS's Weather lists them: each in its own sky, its name, its clock and its weather, the
// temperature and the day's high and low; swiped left, a Delete behind it (or, with a mouse, a bin on it)
// what the page says of a place now, in peek()'s (data.js) form
const onPage = (wx) => { const now = nowWall(wx.place.offset), c = wx.current || I.hourAt(wx, now), d = I.dayOf(wx, now); return c && { temp: c.temp, code: c.code, isDay: c.isDay, offset: wx.place.offset, hi: d?.tmax ?? null, lo: d?.tmin ?? null }; };
// (a saved place at a glance as Places has it: the place on show as the page has it, its sky and its high and low the
// same as there; the rest as last kept)
const glanceOn = (p, i = S.places.indexOf(p)) => (i === S.cur && S.wx && cell(S.wx.place.lat, S.wx.place.lon) === cell(p.lat, p.lon) ? onPage(S.wx) : glance(p));
// My Location on its own at the top (it's this device's, not one kept), then the places saved, under their header only
// when there are some
function drawSaved() {
  drawInStep();
  const f = S.f, all = () => [...$("here").children, ...$("saved").children];
  const had = document.activeElement?.closest?.("#places .pc-li"), at = had ? all().indexOf(had) : -1;
  const items = S.places.map((p, i) => {
    const k = glanceOn(p, i), sky = k ? skyOf(k.code, k.isDay) : "cloudy-day";
    const card = h("button", { class: "place-card", type: "button", "data-sky": sky, "aria-current": i === S.cur ? "true" : "false",
      "aria-label": `${p.name}${k ? `: ${f.temp(k.temp)}, ${label(k.code, k.isDay)}${k.hi != null ? `, high ${f.temp(k.hi)}, low ${f.temp(k.lo)}` : ""}` : ""}${i === S.cur ? ", showing" : ""}`,
      // (chosen: the sheet goes, then the page turns to it)
      onclick: () => { if (li.classList.contains("swiped")) { li.classList.remove("swiped"); return; } closeSheet($("places")).then(() => turnTo(S.places.indexOf(p))); } },
      h("span", { class: "pc-l" }, h("span", { class: "pc-name" }, p.gps ? [h("span", { class: "pc-here", svg: glyph("arrow", 12) }), " "] : null, p.name),
        h("span", { class: "pc-sub" }, [p.gps && p.name !== "My Location" ? "My Location" : p.region?.split(",")[0], k ? f.time(Date.now() + k.offset * 1000) : null].filter(Boolean).join(" · ")),
        k ? h("span", { class: "pc-cond" }, label(k.code, k.isDay)) : null),
      h("span", { class: "pc-r" }, k ? h("span", { class: "pc-temp" }, f.temp(k.temp)) : null, k && k.hi != null ? h("span", { class: "pc-hl" }, `H ${f.temp(k.hi)}  L ${f.temp(k.lo)}`) : null));
    // (it folds away first, the cards under it closing up, and then it's gone from the list)
    const remove = () => {
      if (li._going) return;
      li._going = true;
      leave(li).then(() => {
        const at = S.places.indexOf(p); if (at < 0) return;
        const was = place(), n = S.settings.notify, k = nkey(p);
        // (the place on show still on show: what goes by the list, its dots, the map's bubbles and the places beside,
        // drawn again, as takeUp has them)
        S.places.splice(at, 1); S.cur = Math.max(0, S.places.indexOf(was)); savePlaces(); drawSaved(); if (was !== place()) go(); else if (S.wx) render(); else showPlace();
        // (its notifications go with it)
        if (n.places.some((e) => nkey(e) === k) || (n.brief && nkey(n.brief) === k)) { n.places = n.places.filter((e) => nkey(e) !== k); if (n.brief && nkey(n.brief) === k) n.brief = null; saveSettings(); notifySaved().catch(() => {}); }
      });
    };
    const li = h("li", { class: "pc-li" }, card, S.places.length > 1 ? [h("button", { class: "pc-del", type: "button", "aria-label": `Remove ${p.name}`, onclick: remove }, h("span", { svg: glyph("trash", 20) }), "Delete"),
      h("button", { class: "pc-bin", type: "button", "aria-label": `Remove ${p.name}`, svg: glyph("trash", 16), onclick: remove })] : null);
    if (S.places.length > 1) swipeOpen(li, card);
    return li;
  });
  $("here").replaceChildren(...items.filter((_, i) => S.places[i].gps));
  $("saved").replaceChildren(...items.filter((_, i) => !S.places[i].gps));
  $("saved-head").hidden = !S.places.some((p) => !p.gps);
  // (what had the focus keeps it, drawn anew: the same place, or the next along if it's the one that's gone)
  if (at >= 0) { const left = all(); left[Math.min(at, left.length - 1)]?.querySelector(".place-card")?.focus(); }
}
// A saved place leaving the list: folding away where it is (the gap beside it closing with it) as it fades and shrinks
// back a little, the cards under it closing up; with Reduce Motion, a quick dissolve
function leave(li) {
  const side = li.previousElementSibling ? "marginTop" : li.nextElementSibling ? "marginBottom" : null, t = { duration: calm.matches ? 150 : 320, easing: GLIDE, fill: "forwards" };
  li.style.pointerEvents = "none"; li.style.overflow = "clip";
  return li.animate(calm.matches ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, height: `${li.offsetHeight}px`, transform: "none" }, { opacity: 0, height: "0px", transform: "scale(0.96)", ...(side ? { [side]: "-10px" } : {}) }], t).finished.catch(() => {});
}
// a card swiped left narrows, following the finger, for the Delete beside it (let go past half way, it stays open);
// back, or a tap, closes it again
function swipeOpen(li, card) {
  const ROOM = 100;
  let x0 = null, y0 = 0, dx = 0, lock = null;
  card.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; for (const o of document.querySelectorAll(".pc-li.swiped")) if (o !== li) o.classList.remove("swiped"); }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    lock ??= Math.abs(mx) > 8 ? "x" : Math.abs(my) > 8 ? "y" : null;
    if (lock !== "x") return;
    dx = Math.min(0, mx + (li.classList.contains("swiped") ? -ROOM : 0));
    // (past the room it needs, it gives less and less)
    const give = -dx <= ROOM ? -dx : ROOM + (-dx - ROOM) * 0.3;
    card.style.transition = "none"; card.style.width = `calc(100% - ${give.toFixed(1)}px)`;
  }, { passive: true });
  card.addEventListener("touchend", () => { if (lock === "x") { card.style.transition = card.style.width = ""; li.classList.toggle("swiped", dx < -ROOM / 2); } x0 = null; });
}
// a sky for some weather, as the page's (styles.css body[data-sky])
const skyOf = (code, day) => { const kind = codeInfo(code).kind; return kind === "storm" ? "storm" : ["rain", "showers", "drizzle", "sleet"].includes(kind) ? (day ? "rain-day" : "rain-night") : kind === "snow" ? (day ? "snow-day" : "snow-night") : kind === "fog" ? "fog" : kind === "clear" ? (day ? "clear-day" : "clear-night") : kind === "partly" ? (day ? "partly-day" : "partly-night") : day ? "cloudy-day" : "cloudy-night"; };
let searchTimer = null, searchSeq = 0, searchingT = 0;
function onSearch(now = false) {
  clearTimeout(searchTimer); clearTimeout(searchingT);
  const q = $("search").value.trim(), out = $("results");
  // (searching, the results take the list's place, the list fading out of their way (styles.css); cleared, it's back)
  $("places").classList.toggle("searching", q.length >= 2);
  if (q.length < 2) { searchSeq++; results([]); $("results-said").textContent = ""; S.pick = S.searching = false; return; }
  if (now !== true) S.pick = false;
  S.searching = true;
  // ("Searching…", if they're a moment coming, where there's nothing found yet to show meanwhile)
  searchingT = setTimeout(() => { if (S.searching && !out.querySelector(".row-btn")) results([h("li", { class: "muted small searching" }, "Searching…")]); }, 300);
  searchTimer = setTimeout(async () => {
    const my = ++searchSeq;
    try {
      const list = await searchPlaces(q);
      if (my !== searchSeq) return;
      S.searching = false; clearTimeout(searchingT);
      // (chosen: the sheet goes, then the page turns to it, it now one of the places)
      results(list.length ? list.map((p) => h("li", {}, h("button", { class: "row-btn", type: "button", onclick: () => {
        const added = S.places[addPlace(p, false)];
        closeSheet($("places")).then(() => { $("search").value = ""; onSearch(); turnTo(S.places.indexOf(added)); });
      } }, h("span", { class: "rb-main" }, h("span", { class: "rb-name" }, p.name), h("span", { class: "rb-sub" }, p.region))))) : [h("li", { class: "muted small" }, "No places found.")]);
      $("results-said").textContent = list.length ? `${list.length} ${list.length === 1 ? "place" : "places"} found` : "No places found";
      // (Enter pressed before the places came back: take the first now)
      if (S.pick && list.length) { S.pick = false; out.querySelector(".row-btn")?.click(); }
    } catch (_) { if (my === searchSeq) { S.searching = false; clearTimeout(searchingT); results([h("li", { class: "muted small" }, "Search isn't available right now.")]); $("results-said").textContent = "Search isn't available right now"; } }
  }, now === true ? 0 : 280);
}
// the results as they come: the first lot rising in, each after crossfading into the one before
function results(items) {
  const out = $("results"), had = out.children.length;
  out.replaceChildren(...items);
  if (items.length) out.animate(calm.matches || had ? [{ opacity: had ? 0.4 : 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE_OUT });
}


// The page behind redrawn once the next frame is out, so a choice's lens has begun to glide (started, it runs by
// itself; redrawn first, the lens would wait for it, then jump). A sheet closing does any that's waiting at once.
const waiting = new Set();
function afterFrame(fn) {
  if (waiting.has(fn)) return;
  waiting.add(fn);
  requestAnimationFrame(() => setTimeout(() => { if (waiting.delete(fn)) fn(); }, 0));
}
const flushWaiting = () => { for (const fn of [...waiting]) { waiting.delete(fn); fn(); } };
const redraw = () => { render(); SE()?.drawActs(); };

/* ---------- notifications ---------- */
const b64u = (s) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
// A word about the alerts, until they're on or it's put away (for good: then a row at the top of Settings): what they
// are, and a way to them (or, on an iPhone not yet running Weather from its Home Screen, how to get there first)
function nudge() {
  // (put away, it's a row at the top of Settings instead, till they're on: settings.js drawSettings)
  const box = $("nudge"), n = S.settings.notify, away = store.get("wx:nudge");
  if (notifying(n) || away) { if (!box._fold) box.hidden = true; return; }
  if (!box.hidden && box.childElementCount) return;
  // (put away, it folds away where it is, what's under it moving up rather than jumping)
  const why = notifyWhy(), done = () => { store.set("wx:nudge", Date.now()); fold(box); };
  // (nothing to be done about it from here, blocked or a browser without them: not said above the forecast, only in
  // Settings; the Home Screen step, which can be done, is said below the ten days, not in front of them)
  if (why && !/Home Screen/.test(why)) { box.hidden = true; return; }
  box._below = !!why;
  if (why) $("daily")?.after(box);
  box.replaceChildren(h("span", { class: "ins-icon", svg: glyph("bell", 18) }), h("h2", { id: "nudge-title" }, "Get rain alerts"),
    h("p", {}, why || "A heads-up here before rain starts, official warnings as they're issued, and a morning briefing if you'd like one."),
    h("div", { class: "nudge-btns" }, why ? null : h("button", { class: "pill-btn", type: "button", onclick: () => { done(); openSettings("notify"); } }, "Turn on"),
      h("button", { class: "link", type: "button", onclick: done }, why ? "OK" : "Not now")));
  box.hidden = false;
}
// why this phone can't have them, if it can't
function notifyWhy() {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return Notification.permission === "denied" ? "Notifications are blocked for this site (browser settings)." : null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone ? "Add Weather to your Home Screen first (Share, Add to Home Screen), then turn these on there." : "This browser can't show notifications.";
}
async function pushSub(make) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && make) {
    const r = await fetch("/api/weather/key");
    if (!r.ok) throw new Error("no key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u((await r.json()).key) });
  }
  return sub;
}
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
// tell the server what this device wants (or that it wants nothing); signed in, it's the account's choices this device
// gets (functions/_wxacct.js), and it's one of the account's devices
// (one at a time, each with the settings as they are when its turn comes: two quick changes can't race each other)
let syncs = Promise.resolve();
function syncNotify() {
  const run = syncs.then(syncNow);
  syncs = run.catch(() => {});
  return run;
}
const canShow = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Notification.permission === "granted";
async function syncNow() {
  const n = S.settings.notify;
  if (!S.acct && !notifying(n)) {
    const sub = "serviceWorker" in navigator ? await pushSub(false).catch(() => null) : null;
    if (sub) { await post("/api/weather/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    n.endpoint = n.devId = null; saveSettings();
    return;
  }
  // (signed in, nothing on yet and nothing here before: nothing to tell)
  if (!canShow() || (S.acct && !notifying(n) && !n.endpoint)) return;
  const sub = await pushSub(true), j = sub.toJSON();
  let r;
  try {
    r = await post("/api/weather/subscribe", { sub: { endpoint: j.endpoint, keys: j.keys }, places: n.places, brief: n.brief, briefAt: n.briefAt, was: n.endpoint || undefined,
      // (signed out here, though the browser may have the site's sign-in: this device's own choices, not the account's;
      // signed in, which account, so if the browser's signed in to another since, not yet heard of here, it's the same)
      account: S.acct ? S.acct.id || true : false, solar: S.settings.solar?.on ? S.settings.solar : null, units: { temp: S.settings.temp, wind: S.settings.wind, precip: S.settings.precip, clock: S.settings.clock } });
  } catch (e) {
    // (not told, offline, say, or the server busy: out of step, so it's told again the next time the app's opened or
    // back online, keepNotify, not a week on)
    if (n.syncedAt) { n.syncedAt = 0; saveSettings(); }
    throw e;
  }
  n.endpoint = j.endpoint; n.devId = r.id || null; n.syncedAt = Date.now(); saveSettings();
}
// with notifications on, now and then (and whenever the browser's changed this device's subscription, or a change
// couldn't be sent), the server's told again, so they keep coming (it forgets devices it hasn't heard from in months)
// (one at a time: opening it is heard more than once at once; and after a try that failed, not again for ten minutes
// however often it's opened meanwhile, as each counts against what this network may send the server, the other phones
// on it included; now: back online, at once)
let keeping = false, failedAt = 0;
async function keepNotify(now = false) {
  const n = S.settings.notify;
  if (keeping || (!now && Date.now() - failedAt < 10 * 60e3) || (!notifying(n) && !n.endpoint) || !canShow()) return;
  keeping = true;
  try {
    const sub = await pushSub(false);
    if (sub && sub.endpoint === n.endpoint && Date.now() - (n.syncedAt || 0) < 7 * 864e5) return;
    await syncNotify();
  } catch (_) { failedAt = Date.now(); } finally { keeping = false; }
}
// (any of them on: rain alerts or official warnings for a place, the briefing)
// (any notification on here: for a place, the briefing, or the sun coming out on your panels)
const notifying = (n) => !!(n.places.length || n.brief || (S.settings?.solar?.on && S.settings.solar.alert));
// a place, as notifications know it (My Location: wherever it is now)
const nkey = (p) => A.nkeyOf(p);
// a choice made: kept, and (signed in) the account's first, then this device told
async function notifySaved() {
  if (!S.acct) return syncNotify();
  await keepInStep();
  if (!hereToo() && canShow()) { await syncNotify(); refreshDevices(); }
}

/* ---------- your account ---------- */
// Signed in to your georgefarrowgreen.com account (weather/account.js), your saved places, settings and notifications are
// kept with it, in step on every device you're signed in on. S.acct: { name, handle, devices, state } while signed in;
// kept (wx:acct) with the version last in step and what was kept then (snap), so a change made meanwhile, here or on
// another device, is put together with the other's rather than either being lost.
const SYNCED = ["temp", "wind", "precip", "pressure", "clock", "glass", "tune", "commute", "extras", "activities", "layout", "solar"];
const PERSON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 19.6c1.3-3.4 4-5.1 7.2-5.1s5.9 1.7 7.2 5.1"/></svg>';
// (an object's keys in order, so the same settings always read the same)
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
// what's here, as it's kept with the account (My Location is each device's own)
const mine = () => ({
  places: S.places.filter((p) => !p.gps).map((p) => ({ name: p.name, region: p.region || "", lat: p.lat, lon: p.lon })),
  settings: Object.fromEntries(SYNCED.map((k) => [k, S.settings[k]])),
  notify: { places: S.settings.notify.places, brief: S.settings.notify.brief, briefAt: S.settings.notify.briefAt, email: S.settings.notify.email },
});
const snapOf = (d) => ({ places: (d.places || []).map(A.keyOf), settings: canon(d.settings || null), notify: d.notify || null });
const sameAs = (now, snap) => canon(now.places.map(A.keyOf)) === canon(snap.places) && canon(now.settings) === snap.settings && !A.notifyChanges(now.notify, snap.notify).length;
// the account's and this device's put together (first: just signed in, so all of this device's is new to the account;
// the account's settings, if it has any)
function combine(theirs, now, snap, first = false) {
  const tn = theirs.notify || { places: [], brief: null }, theirSettings = theirs.settings && Object.keys(theirs.settings).length ? theirs.settings : null;
  return {
    places: A.mergePlaces(theirs.places || [], now.places, first ? [] : snap.places),
    settings: first ? theirSettings || now.settings : A.mergeSettings(theirSettings, now.settings, JSON.parse(snap.settings || "null"), SYNCED, canon),
    notify: A.mergeNotify(tn, now.notify, first ? A.notifyChanges(now.notify, tn).filter((k) => k === "brief" ? !tn.brief : !tn.places.some((q) => nkey(q) === k)) : A.notifyChanges(now.notify, snap.notify)),
  };
}
// taken up here: the places (My Location first, as ever, and the one on show still on show), settings and notifications
function takeUp(d) {
  const here = place(), gps = S.places.find((p) => p.gps), units = canon([S.settings.temp, S.settings.wind, S.settings.precip, S.settings.clock]);
  const list = d.places.map((p) => ({ ...(S.places.find((x) => !x.gps && A.keyOf(x) === A.keyOf(p)) || {}), ...p }));
  if (gps || list.length) S.places = gps ? [gps, ...list] : list;
  const at = S.places.findIndex((p) => here && (p.gps ? here.gps : !here.gps && A.keyOf(p) === A.keyOf(here)));
  S.cur = Math.max(0, at);
  store.set("wx:places", S.places); store.set("wx:cur", S.cur);
  const n = S.settings.notify;
  const theirs = Object.fromEntries(SYNCED.filter((k) => d.settings && k in d.settings).map((k) => [k, d.settings[k]]));
  store.set("wx:settings", { ...S.settings, ...theirs, notify: { ...d.notify, endpoint: n.endpoint, devId: n.devId, syncedAt: n.syncedAt } });
  loadSettings();
  if (here && at < 0) go(); else if (S.wx) render();
  if (units !== canon([S.settings.temp, S.settings.wind, S.settings.precip, S.settings.clock]) && notifying(S.settings.notify)) syncNotify().catch(() => {});
  drawSaved(); if ($("settings").open) SE()?.drawSettings();
}
// Sending what's changed here (one at a time; a change while one's going goes after it), and if the account's moved on
// meanwhile, putting the two together and sending that
let stepping = null, stepAgain = false, stepTimer = 0;
function inStepSoon() { if (!S.acct) return; clearTimeout(stepTimer); stepTimer = setTimeout(() => keepInStep().catch(() => {}), 1200); }
function keepInStep() {
  if (stepping) { stepAgain = true; return stepping; }
  stepping = (async () => { try { do { stepAgain = false; await stepOnce(); } while (stepAgain); } finally { stepping = null; } })();
  return stepping;
}
async function stepOnce() {
  for (let tries = 0; tries < 3; tries++) {
    const k = store.get("wx:acct");
    if (!k || !S.acct) return;
    const now = mine();
    if (sameAs(now, k.snap)) { inStep("ok"); return; }
    inStep("saving");
    let r;
    try { r = await A.save(k.ver, now); }
    catch (e) { if (e.status === 401) signedOutElsewhere(); else inStep(e.offline ? "waiting" : "error"); throw e; }
    if (!r.conflict) { store.set("wx:acct", { ...k, ver: r.ver, snap: snapOf(r.data) }); inStep("ok"); return; }
    takeUp(combine(r.data, now, k.snap));
    store.set("wx:acct", { ...k, ver: r.ver, snap: snapOf(r.data) });
  }
}
// (in step again, or not: said at once; "Syncing…", though, only once it's taken over half a second, not a word there and
// gone again in a blink each time something's kept: meanwhile, what was said before stays: shown)
let slowT = 0;
function inStep(state) {
  if (!S.acct || S.acct.state === state) return;
  S.acct.state = state; clearTimeout(slowT);
  if (state === "saving") { slowT = setTimeout(() => { if (S.acct?.state === "saving") { S.acct.shown = "saving"; drawInStep(); SE()?.drawAccount(); } }, 500); return; }
  S.acct.shown = state; drawInStep(); SE()?.drawAccount();
}
// The account as the server has it (on opening, and again on coming back after a minute): signed out elsewhere, signed
// in elsewhere on the site, or changed on another device
let pulledAt = 0;
async function pull() {
  pulledAt = Date.now();
  let r;
  try { r = await A.me(); }
  catch (e) {
    // (no account here at all: a preview of the site, say)
    if (e.status === 404) { S.noAcct = true; signedOut(); return; }
    if (S.acct && S.acct.state === "ok") inStep("waiting"); return;
  }
  if (!r.signedIn) { S.ask = null; if (S.acct || store.get("wx:acct")) signedOutElsewhere(); return; }
  await adopt(r);
}
// here: signed in on this page just now (so this device's places are meant for the account)
async function adopt(r, here = false) {
  // (kept from before the account's id was: by its handle, unless that's been changed since and this device is still
  // among the account's)
  const k = store.get("wx:acct"), fresh = !k || (k.id ? k.id !== r.id : k.handle !== r.handle && !(r.devices || []).some((d) => d.id === S.settings.notify.devId));
  if (fresh && !here && mine().places.length) {
    // (asked first; and the account this device was in step with till now, signed out of in this browser since, let go
    // of before it's asked, so nothing here goes to the one signed in now, nor its notifications come here, till it's
    // answered, and Settings no longer says it's signed in)
    if (S.acct || k) signedOutElsewhere();
    S.ask = r; SE()?.drawAccount();
    return;
  }
  S.ask = null;
  S.acct = { ...profileOf(r), devices: r.devices || [], state: S.acct?.state || "ok" };
  if (fresh) takeUp(combine(r.data, mine(), snapOf({}), true));
  else if (r.ver !== k.ver) takeUp(combine(r.data, mine(), k.snap));
  store.set("wx:acct", { ...profileOf(r), devices: S.acct.devices, ver: r.ver, snap: snapOf(r.data) });
  SE()?.drawAccount(); drawInStep(); SE()?.drawMail(); drawMe();
  try { await keepInStep(); } catch (_) {}
  // (this device, if it shows notifications, one of the account's)
  if (fresh && canShow() && (notifying(S.settings.notify) || S.settings.notify.endpoint)) { await syncNotify().catch(() => {}); refreshDevices(); }
}
async function refreshDevices() {
  try { const r = await A.me(); if (r.signedIn && S.acct) { S.acct.devices = r.devices || []; const k = store.get("wx:acct"); if (k) store.set("wx:acct", { ...k, devices: S.acct.devices }); SE()?.drawAccount(); } } catch (_) {}
}
// who, as the account has them: name, handle, email, the photo's time (and the account's own id, to know it again)
const profileOf = (r) => ({ id: r.id || null, name: r.name, handle: r.handle, email: r.email || "", emailOk: !!r.emailOk, photoAt: r.photoAt || null });
// this device among the account's that get its notifications
const hereToo = () => !!(S.acct && S.settings.notify.devId && S.acct.devices.some((d) => d.id === S.settings.notify.devId));
function signedOut() { store.del("wx:acct"); S.acct = null; SE()?.drawAccount(); drawInStep(); drawMe(); if ($("settings").open) SE()?.drawNotify(); }
// ---- you, your apps and Weather's own few: InFlite's menu, the same in every app, from your photo at the top left
// (signed in; signed out, Settings' gear, where you sign in) ----
// (Weather's version: up by 0.01 with each change to it that goes out)
const BUILD = "1.05";
const photoOf = (a) => a.photoAt ? h("img", { src: A.photoUrl(a.photoAt), alt: "", width: "44", height: "44", decoding: "async" }) : (String(a.name || "").trim()[0] || "?").toUpperCase();
// (signed out: an outline in its place, that signs in; Settings' gear beside the location, in the same capsule)
function drawMe() {
  const b = $("me-btn"), a = S.acct;
  $("settings-btn").hidden = !!a;
  b.hidden = false; b.classList.toggle("out", !a);
  b.setAttribute("aria-label", a ? "You and your apps" : "Sign in");
  if (!a) return b.innerHTML = IFL.glyph("person");
  b.replaceChildren(photoOf(a));
  settingsJs().catch(() => {});
}
function youMenu(e) {
  const a = S.acct;
  if (!a) return accountPage() ? toAccountSignIn(e) : openSettings();
  IFL.menu($("me-btn"), {
    app: "weather", build: BUILD,
    me: { name: a.name, line: a.handle ? `@${a.handle}` : "", photo: h("span", { class: "acct-av" }, photoOf(a)) },
    rows: [
      { icon: "bell", color: "red", label: "Notifications", value: notifying(S.settings.notify) ? "On" : "Off", open: () => openSettings("notify") },
      { icon: "sun", color: "indigo", label: "Appearance", open: () => openSettings("look") },
      { icon: "sliders", color: "grey", label: "Settings", open: () => openSettings() },
    ],
    account: () => (SE() ? SE().openAccount() : openSettings()),
    signOut: signOutHere,
    update: newApp ? () => location.reload() : null,
  });
}
// Signing out here (the foot of Settings): of the site's account in this browser; this device keeps its places and
// settings, and its notifications go on as its own
async function signOutHere() {
  const b = $("sign-out"); b.disabled = true;
  try { await A.signOut(S.settings.notify.endpoint || undefined); } catch (_) {}
  finally { b.disabled = false; }
  signedOut();
}
// Signed out somewhere else (the account's page, or another app on the site): this device's notifications stay, as its
// own, as when it's signed out here
function signedOutElsewhere() {
  const n = S.settings.notify;
  if (n.endpoint && n.devId) A.leave(n.endpoint).catch(() => {});
  signedOut();
}
// Signing in is on the account's own page (account.<site>, beside weather.<site>), where every app on the site signs
// in: there with a word for the sign-in (kept on this device for half an hour, or until it's used), and back with a code
// for it (signedBack). That page's sky comes in as the word's made (handOff), and it's off there once that's done
async function toAccountSignIn(e) {
  const page = accountPage(); if (!page || leaving) return;
  const away = handOff();
  try {
    const { word, ask } = await A.signInWord();
    localStorage.setItem("wx:signin", JSON.stringify({ word, at: Date.now() }));
    await away.done;
    const q = new URLSearchParams({ signin: "weather", ask, back: `${location.origin}/` });
    location.assign(`${page}#${q}`);
    // (still here a good while later, and in sight: the page as it was, should the account's page never come)
    setTimeout(() => { if (document.visibilityState === "visible") away.undo(); }, 10e3);
  } catch (_) { away.undo(); toast("This browser can’t sign in here. Try Safari or Chrome."); }
}
// Back from the account's page with a code for the sign-in made there: swapped, with the word kept for it, for the
// sign-in (the site's: Weather keeps none of its own), and this device's places meant for the account, as signing in
// was asked for here (and meanwhile, the picture that page ended on: welcome). A code from anywhere else, or one that's
// run out, is used up and goes no further.
async function signedBack(code) {
  let k = null;
  try { k = JSON.parse(localStorage.getItem("wx:signin") || "null"); localStorage.removeItem("wx:signin"); } catch (_) {}
  if (!k || Date.now() - k.at > 30 * 60e3) {
    arriveEnd(arrival, true);
    A.handback(code, "").catch(() => {}); pull();
    return toast("That sign-in was started somewhere else. Sign in again here.");
  }
  pulledAt = Date.now();
  try {
    const r = await A.handback(code, k.word);
    // (who's known as soon as it's adopted, so Settings comes up with the account's card; said once the photo's landed in it)
    const adopted = adopt(r, true), landed = arrival ? welcome(arrival, r) : null;
    await Promise.all([adopted, landed]);
    toast(`Signed in as ${String(r.name).trim().split(/\s+/)[0]}.`);
  } catch (e) { arriveEnd(arrival, true); toast(e.message); pull(); }
}

/* ---------- signing in on the account's page: the way there, and back ---------- */
// The account's page is a sky of its own (styles.css --acct-sky) with your photo a third of the way down. Going there,
// that sky comes in over everything, so that page opens on what was already in sight (handOff); back
// from it (#signin=…), the page opens on the picture it ended on (early.js), and your photo goes from there into the
// account's card in Settings, where you signed in from (arriveFrom, welcome). With Reduce Motion, dissolves. Neither is
// ever in the way of a tap, and the picture's gone within a few seconds, whatever happens.
// (the account page's own curve, for one screen growing into another; and its sky)
const ACCT_EASE = "cubic-bezier(0.55, 0, 0.1, 1)";
const acctSky = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "#0a0f26" : "#f3f0fb");
// (the top layer: over an open sheet, in the order things are shown there)
const topLayer = "showPopover" in HTMLElement.prototype;
const springEase = () => getComputedStyle(document.documentElement).getPropertyValue("--ease-spring").trim() || "cubic-bezier(0.2, 1.1, 0.4, 1)";
let leaving = null;
// The account page's sky, coming in over everything (Settings too). Opacity only. → { done: kept once the sky's in, or
// after 700 ms whatever happens; undo: put back as it was }. With no top layer, straight on
function handOff() {
  const none = { done: Promise.resolve(), undo() {} };
  if (!topLayer) return none;
  const g = h("div", { class: "handoff", "aria-hidden": "true", popover: "manual" }, h("i", { class: "handoff-sky" }));
  const out = { done: null, undo: () => { g.remove(); if (leaving === out) leaving = null; } };
  let sky;
  try {
    document.body.append(g); g.showPopover();
    sky = g.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: calm.matches ? 150 : 480, easing: EASE_OUT, fill: "forwards" }).finished;
  } catch (_) { out.undo(); return none; }
  leaving = out;
  out.done = Promise.race([sky.catch(() => {}), new Promise((ok) => setTimeout(ok, 700))]);
  return out;
}
// (back from the account's page by the browser's Back, the page as it was kept: as it was before it went)
addEventListener("pageshow", (e) => { if (e.persisted) leaving?.undo(); });

// Back from the account's page: its picture (early.js) taken on, with what's to happen to it, or null where the page
// wasn't opened from there. Gone within a few seconds whatever happens: sooner if the sign-in's slow to be swapped (the
// page as ever meanwhile, signedBack carrying on behind it), and at once if Settings is closed as it plays (closeSheet)
let arrival = null;
function arriveFrom() {
  const el = $("back-in"); if (!el) return null;
  settingsJs().catch(() => {});            // (Settings, where the photo lands, fetched now, so it's there when it's wanted)
  el.classList.add("held");
  const a = { el, av: null, card: null, timers: new Set(), gone: false, land: null };
  a.slow = arriveLater(a, () => arriveEnd(a, true), 3000);
  arriveLater(a, () => arriveEnd(a, true), 6000);
  return a;
}
// (something to happen in a while, unless the picture's done with by then)
function arriveLater(a, fn, ms) { const t = setTimeout(() => { a.timers.delete(t); if (!a.gone) fn(); }, ms); a.timers.add(t); return t; }
// The picture done with, at once or fading: what's still to come stopped, and the card's own photo shown if it was
// waiting for the one flying to it
function arriveEnd(a, fade = false) {
  if (!a || a.gone) return;
  a.gone = true;
  for (const t of a.timers) clearTimeout(t);
  if (arrival === a) arrival = null;
  if (a.card) a.card.style.visibility = "";
  a.land?.();
  for (const x of [a.el, a.av]) {
    if (!x?.isConnected) continue;
    if (!fade) { x.remove(); continue; }
    x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: 250, easing: EASE_OUT, fill: "forwards" }).finished.then(() => x.remove(), () => x.remove());
    setTimeout(() => x.remove(), 400);     // (should that not end: in a tab put away)
  }
}
// The sign-in swapped (r: who): your photo (or your initial) comes into the picture, then Settings comes up as the picture
// fades, and the photo flies down into the account's card there. → a promise, kept once it's landed (or once there's
// nothing for it to land on)
function welcome(a, r) {
  clearTimeout(a.slow); a.timers.delete(a.slow);
  const still = calm.matches, landed = new Promise((ok) => { a.land = ok; });
  // (there since the first frame, as the account's page left you: early.js. Taken into the top layer, over Settings, and on)
  const pre = $("back-in-av");
  if (pre) {
    a.av = pre; pre.removeAttribute("id");
    if (!pre.querySelector("img") && r.photoAt) { const img = h("img", { src: A.photoUrl(r.photoAt), alt: "", decoding: "async" }); img.addEventListener("load", () => img.classList.add("loaded"), { once: true }); pre.append(img); }
    if (topLayer) { pre.popover = "manual"; document.body.append(pre); pre.showPopover(); }
    arriveLater(a, () => toSettings(a), still ? 120 : 160);
    return landed;
  }
  const av = a.av = h("span", { class: "back-in-av", "aria-hidden": "true", popover: topLayer ? "manual" : null }, h("span", { class: "back-in-card" }), (String(r.name || "").trim()[0] || "?").toUpperCase());
  const img = r.photoAt ? h("img", { src: A.photoUrl(r.photoAt), alt: "", decoding: "async" }) : null;
  if (img) av.append(img);
  // (the photo in before it's shown, if it's there in a moment; if not, the initial, the photo fading in over it as it comes)
  const ready = img ? Promise.race([img.decode().catch(() => {}), new Promise((ok) => setTimeout(ok, 500))]) : Promise.resolve();
  ready.then(() => {
    if (a.gone) return;
    if (img) { const on = () => img.classList.add("loaded"); if (img.complete && img.naturalWidth) on(); else img.addEventListener("load", on, { once: true }); }
    (topLayer ? document.body : a.el).append(av);
    if (topLayer) av.showPopover();
    av.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 }], { duration: still ? 150 : 450, easing: still ? EASE_OUT : springEase() });
    arriveLater(a, () => toSettings(a), still ? 250 : 420);
  });
  return landed;
}
// Settings, where you signed in from, comes up on its list (unless it's been opened meanwhile) as the picture fades;
// the photo kept over it all
async function toSettings(a) {
  const d = $("settings"), still = calm.matches, el = a.el;
  if (!d.open) await openSettings();
  if (a.gone) return;
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 200 : 400, easing: EASE_OUT, fill: "forwards" }).finished.then(() => el.remove(), () => el.remove());
  if (topLayer && a.av?.isConnected) { a.av.hidePopover(); a.av.showPopover(); }
  arriveLater(a, () => fly(a), still ? 200 : 180);
}
// Where something in a sheet will be once the sheet's done coming up: where it is now, less the sheet's slide (and its
// scale, about its middle) so far
function settledIn(d, el) {
  const r = el.getBoundingClientRect(), tf = getComputedStyle(d).transform;
  if (!tf || tf === "none") return r;
  const m = new DOMMatrixReadOnly(tf), s = m.a || 1, dr = d.getBoundingClientRect(), mx = dr.left + dr.width / 2, my = dr.top + dr.height / 2;
  return { left: mx - m.e + (r.left - mx) / s, top: my - m.f + (r.top - my) / s, width: r.width / s, height: r.height / s };
}
// The photo, down into the account's card on a gentle curve (bowed up a little, as if tossed into it rather than slid
// across), becoming the card's own as it goes and landing with a little spring; then your places, going with it
// (moved). With Reduce Motion, or with the card out of sight, it fades where it is as the card's comes
function fly(a) {
  const d = $("settings"), av = a.av, card = $("acct")?.querySelector(".acct-av"), still = calm.matches;
  const shows = !!card && d.open && !d.classList.contains("closing") && !card.closest(".set-page")?.hidden;
  if (!topLayer || still || !shows || !av?.isConnected) {
    if (av?.isConnected) av.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: "forwards" });
    if (shows && still) card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
    arriveLater(a, () => { arriveEnd(a); if (shows) moved(); }, 220);
    return;
  }
  const to = settledIn(d, card), from = av.getBoundingClientRect(), s1 = (to.width / from.width) * 0.94;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const len = Math.hypot(dx, dy) || 1, bow = Math.min(80, len * 0.25);
  let nx = -dy / len, ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const cx = dx / 2 + nx * bow, cy = dy / 2 + ny * bow, N = 12;
  const path = Array.from({ length: N + 1 }, (_, i) => {
    const u = i / N, v = 1 - u;
    return { offset: u, transform: `translate(${(2 * v * u * cx + u * u * dx).toFixed(2)}px, ${(2 * v * u * cy + u * u * dy).toFixed(2)}px) scale(${(1 + (s1 - 1) * u).toFixed(4)})` };
  });
  a.card = card; card.style.visibility = "hidden";
  const t = { duration: 620, easing: ACCT_EASE, fill: "forwards" };
  const flight = av.animate(path, t);
  av.querySelector(".back-in-card")?.animate([{ opacity: 0 }, { opacity: 1 }], t);
  av.animate([{ boxShadow: getComputedStyle(av).boxShadow }, { boxShadow: getComputedStyle(card).boxShadow }], t);
  flight.finished.then(() => {
    if (a.gone) return;
    // landed: the card's own photo, giving a little as it takes the weight
    card.style.visibility = ""; a.card = null;
    card.animate([{ scale: 0.94 }, { scale: 1.06, offset: 0.4 }, { scale: 1 }], { duration: 450, easing: EASE_OUT });
    arriveEnd(a);
    moved();
  }, () => {});
}
// Your places, the account's now too: said under its card as the photo lands, each in its own sky (as in Places),
// ticked off one after another; there till Settings closes. With Reduce Motion, faded in together
function moved() {
  const d = $("settings"), box = $("acct"), card = box?.querySelector(".acct-card");
  if (!S.acct || !card || !d.open || d.classList.contains("closing") || box.querySelector(".acct-moved")) return;
  const list = S.places.filter((p) => !p.gps), few = list.slice(0, 4);
  const tick = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9" pathLength="1"/></svg>';
  const chips = few.map((p) => { const k = glanceOn(p); return h("span", { class: "acct-chip", "data-sky": k ? skyOf(k.code, k.isDay) : "cloudy-day" }, h("span", { class: "acct-tick", svg: tick }), h("span", {}, p.name)); });
  if (list.length > few.length) chips.push(h("span", { class: "acct-chip more" }, `+${list.length - few.length} more`));
  const row = h("div", { class: "acct-moved" },
    h("p", {}, list.length > 1 ? "Your places go with your account now." : list.length ? "Your place goes with your account now." : "Your settings go with your account now."),
    chips.length ? h("div", { class: "acct-chips" }, chips) : null);
  card.after(row);
  d.addEventListener("close", () => row.remove(), { once: true });
  if (calm.matches) { row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT }); return; }
  // (opening up under the card, what's under it moving down with it, then each place in turn, and its tick)
  const ht = row.offsetHeight, spring = springEase();
  row.style.overflow = "clip";
  row.animate([{ height: "0px", marginTop: "-10px", opacity: 0 }, { height: `${ht}px`, marginTop: "0px", opacity: 1 }], { duration: 420, easing: GLIDE }).finished.catch(() => {}).finally(() => { row.style.overflow = ""; });
  chips.forEach((c, i) => {
    const at = 160 + i * 90;
    c.animate([{ opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 }], { duration: 450, delay: at, easing: spring, fill: "backwards" });
    c.querySelector(".acct-tick")?.animate([{ scale: 0.4 }, { scale: 1 }], { duration: 450, delay: at + 120, easing: spring, fill: "backwards" });
    c.querySelector("path")?.animate([{ strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0 }], { duration: 260, delay: at + 180, easing: EASE_OUT, fill: "backwards" });
  });
}
// (said only when there's something to say: in step, nothing; as a note under the saved places, and short on the account's card)
const STATES = { saving: ["Syncing…", "Syncing…"], waiting: ["Offline. Your places will sync when you’re back online.", "Offline, will sync later"],
  error: ["Couldn’t sync just now. It’ll try again.", "Couldn’t sync"] };
// The account's own page (account.<site>, beside weather.<site>), opened signed in as you: a code good once, for a
// minute, handed over in the address's # (the page swaps it for a sign-in of its own, in whichever browser it opens in,
// a Home Screen app's included, and takes it out of the address). The window's opened at once, from the tap (a phone
// won't open one later), and sent on when the code's back.
const accountPage = () => (location.hostname.startsWith("weather.") ? `${location.origin.replace("//weather.", "//account.")}/` : null);
// beside "Saved" in Places: that they're in step with the account
function drawInStep() {
  const note = $("sync-note"), said = S.acct && STATES[S.acct.shown ?? S.acct.state]?.[0];
  if (!note) return;
  note.hidden = !said; note.textContent = said || "";
}


const sheetDays = (wx, now) => wx.daily.filter((x) => x.date >= dayStart(now)).slice(0, 16);

// A swipe across a sheet to the next of what it shows or the one before (a day, a tile), as across the page between
// places: what's shown follows the finger (giving at the first and last), and let go far enough, or flicked, it
// carries on out as the next comes in from the other side; not far enough, it springs back (a chart's own sideways is
// its readout). atEnd(dx): nothing more that way; step(n, quiet): show the one n along (quiet: no slide of its own)
function sideSwipe(dlg, page, atEnd, step) {
  const body = dlg.querySelector(".sheet-body");
  let x0 = null, y0 = 0, dx = 0, axis = null, trail = [], raf = 0, going = false;
  const W = () => body.clientWidth;
  const give = (d) => Math.sign(d) * (1 - 1 / ((Math.abs(d) * 0.55) / W() + 1)) * W();
  const band = (d) => 0.55 / ((Math.abs(d) * 0.55) / W() + 1) ** 2;
  const offset = () => (atEnd(dx) ? give(dx) : dx);
  const fade = (o) => String(1 - Math.min(0.45, (Math.abs(o) / W()) * 0.6));
  const show = () => { raf = 0; const o = offset(); page.style.translate = `${o.toFixed(1)}px 0`; page.style.opacity = fade(o); };
  const clear = () => { page.style.translate = page.style.opacity = ""; };
  body.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || going || !S.wx || e.target.closest(".chart")) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; axis = null;
  }, { passive: true });
  body.addEventListener("touchmove", (e) => {
    if (x0 == null) return;
    const x = e.touches[0].clientX, mx = x - x0, my = e.touches[0].clientY - y0;
    if (!axis && Math.hypot(mx, my) > 10) { axis = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y"; if (axis === "x") { x0 = x; trail = []; } }
    if (axis !== "x") return;
    e.preventDefault(); dx = x - x0;
    const t = performance.now(); trail.push([t, x]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift();
    raf ||= requestAnimationFrame(show);
  }, { passive: false });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    if (axis !== "x") return;
    cancelAnimationFrame(raf); raf = 0;
    const v = flickSpeed(trail), dir = dx < 0 ? 1 : -1, from = offset(), o = fade(from), w = W(), edge = atEnd(dx);
    const far = Math.abs(dx) > w * 0.28, flung = Math.abs(v) > 0.3 && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 16;
    clear();
    if (edge || !(far || flung)) {
      // (back into place from where it was let go; with Reduce Motion, quickly)
      if (from) page.animate([{ translate: `${from}px 0`, opacity: o }, { translate: "0 0", opacity: 1 }], calm.matches ? { duration: 150, easing: EASE_OUT } : glide(-Math.sign(from) * (edge ? v * band(dx) : v), Math.abs(from), "cubic-bezier(0.25, 1, 0.4, 1)"));
      return;
    }
    // (with Reduce Motion, the next one dissolves in: openDay, openDetail)
    if (calm.matches) { step(dir); return; }
    // (out the way it was going, at about the speed it was let go at; then the next in from the other side)
    going = true;
    const ms = Math.round(Math.min(200, Math.max(110, (w * 0.45 - Math.abs(from)) / Math.max(Math.abs(v), 1.2) + 60)));
    const out = page.animate([{ translate: `${from}px 0`, opacity: o }, { translate: `${-dir * Math.max(w * 0.5, Math.abs(from) + 48)}px 0`, opacity: 0 }], { duration: ms, easing: "cubic-bezier(0.3, 0.3, 0.8, 0.6)", fill: "forwards" });
    out.finished.then(() => {
      step(dir, true);
      const inn = page.animate([{ translate: `${dir * w * 0.32}px 0`, opacity: 0 }, { translate: "0 0", opacity: 1 }], { duration: 400, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" });
      out.cancel();
      return inn.finished;
    }).catch(() => {}).finally(() => { going = false; });
  };
  body.addEventListener("touchend", end); body.addEventListener("touchcancel", end);
  dlg.addEventListener("keydown", (e) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.target.closest(".chart, input, select")) return;
    e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1);
  });
}

/* ---------- what changes, changing smoothly ---------- */
// motion on the page worth making: not with Reduce Motion, nor behind a sheet, where the page holds still (styles.css)
const moving = () => !R && !calm.matches && !document.body.classList.contains("sheet-up");
const heroAway = () => document.querySelector(".hero").classList.contains("away");
// Words changed where they are, as iOS changes its figures: the new ones rising into place from a little below, quickly,
// from faint; not the first time they're written, nor where they can't be seen (shown), and with Reduce Motion, a quick
// dissolve. → whether they changed
function swap(el, text, shown = true) {
  if (!el || el.textContent === text) return false;
  const was = el.textContent;
  el.textContent = text;
  if (was && text && shown) rise(el);
  return true;
}
// (the same for what's already been changed: its new words rising in; not on the page behind a sheet)
function rise(el, delay = 0) {
  if (document.body.classList.contains("sheet-up") && !el.closest("dialog")) return;
  el.animate(calm.matches ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ opacity: 0.2, translate: "0 3px" }, { opacity: 1, translate: "0 0" }], { duration: calm.matches ? 150 : 260, delay, easing: calm.matches ? EASE_OUT : GLIDE, fill: "backwards" });
}
// A copy of something as it was, laid over where it was (box: a part it's in that things can be laid over, positioned),
// to fade away while what's taken its place comes in: never in the way, never read out, its ids its own's alone
function ghost(el, box = el.parentElement) {
  // (where each is laid out on the page, as offsets: untouched by any scale the page has at the moment, as the copy is)
  const at = (n) => { let x = n.offsetLeft, y = n.offsetTop; for (let p = n.offsetParent; p; p = p.offsetParent) { x += p.offsetLeft + p.clientLeft; y += p.offsetTop + p.clientTop; } return [x, y]; };
  const [ex, ey] = at(el), [bx, by] = at(box), g = el.cloneNode(true);
  g.removeAttribute("id"); for (const x of g.querySelectorAll("[id]")) x.removeAttribute("id");
  g.classList.add("ghost"); g.setAttribute("aria-hidden", "true"); g.inert = true;
  Object.assign(g.style, { left: `${ex - bx - box.clientLeft}px`, top: `${ey - by - box.clientTop}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` });
  box.append(g);
  return g;
}
// (something's words fading where they were, as they're taken away)
function fadeOff(el, box) {
  const g = ghost(el, box);
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: "forwards" }).finished.then(() => g.remove(), () => g.remove());
}
// What's changed between a part as it was and as it's drawn again, the same in shape (an hour, a day, a tile, a row of
// the highlights): each word or figure that's changed rising in where it is, and each icon that's changed with it (the
// rest as it was, still)
function rewords(was, now) {
  if (!was || !moving()) return;
  const parts = (r) => [...r.querySelectorAll("*")].filter((x) => !x.closest("svg")), a = parts(was), b = parts(now);
  if (a.length !== b.length) return;
  const own = (x) => [...x.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join(""), icon = (x) => x.querySelector(":scope > svg")?.outerHTML ?? "";
  for (let i = 0; i < b.length; i++) {
    if (a[i].tagName !== b[i].tagName) return;
    if ((own(a[i]) !== own(b[i]) && own(b[i]).trim()) || icon(a[i]) !== icon(b[i])) rise(b[i]);
  }
}
// A card folding away where it is: its pane closing up, and the gap after it with it, as what's on it fades (a pane of
// glass that faded would show unfrosted, in Safari), so what's under it moves up rather than jumping; then hidden.
// Shown again meanwhile (unfold), it opens back up from where it had got to. → a promise, kept once it's folded
function fold(el, gap = 16) {
  if (el.hidden) return Promise.resolve();
  if (el._fold) return el._fold.done;
  if (!moving() || !el.offsetHeight) { el.hidden = true; return Promise.resolve(); }
  const cs = getComputedStyle(el), t = { duration: 360, easing: GLIDE, fill: "forwards" };
  el.style.overflow = "clip";
  const anims = [el.animate([{ height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginBottom: cs.marginBottom }, { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginBottom: `${-gap}px` }], t),
    ...[...el.children].map((c) => c.animate([{ opacity: 1 }, { opacity: 0 }], { ...t, duration: 220, easing: EASE_OUT }))];
  const f = (el._fold = { anims, done: anims[0].finished.then(() => { if (el._fold === f) { settle(el); el.hidden = true; } }, () => {}) });
  return f.done;
}
// (its folding stopped, wherever it was, the card as it's laid out)
function settle(el) { el._fold?.anims.forEach((a) => a.cancel()); el._fold = null; el.style.overflow = ""; }
// A card coming back: opening up from nothing, what's on it fading in after; or, caught folding, opening back up from
// wherever it had got to
function unfold(el, gap = 16) {
  const box = (cs) => ({ height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginBottom: cs.marginBottom });
  const was = el._fold ? box(getComputedStyle(el)) : el.hidden ? { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginBottom: `${-gap}px` } : null;
  const faint = el._fold ? [...el.children].map((c) => getComputedStyle(c).opacity) : [];
  settle(el); el.hidden = false;
  if (!was || !moving()) return;
  const now = box(getComputedStyle(el)), t = { duration: 360, easing: GLIDE };
  if (Math.abs(parseFloat(now.height) - parseFloat(was.height)) < 2) return;
  el.style.overflow = "clip";
  el.animate([was, now], t).finished.catch(() => {}).finally(() => { if (!el._fold) el.style.overflow = ""; });
  [...el.children].forEach((c, i) => c.animate([{ opacity: faint[i] ?? 0 }, { opacity: 1 }], { ...t, delay: faint.length ? 0 : 80, fill: "backwards" }));
}
// A pane of glass coming up into place: the pane rising, what's on it fading up (from: how faint it starts)
function riseIn(pane, delay = 0, from = 0) {
  const t = { duration: 460, delay, easing: GLIDE, fill: "backwards" };
  pane.animate([{ translate: "0 14px" }, { translate: "0 0" }], t);
  for (const c of pane.children) c.animate([{ opacity: from }, { opacity: 1 }], t);
}
// A sheet's title as what it shows moves on (another day, another tile: dir, the way it went): the old words fading out
// where they were as the new come in from that side; with Reduce Motion, a crossfade
function retitle(el, set, dir = 0) {
  if (!dir) { set(); return; }
  const g = ghost(el), d = calm.matches ? 0 : 14 * Math.sign(dir);
  set();
  g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-d}px)` }], { duration: 200, easing: EASE_IN, fill: "forwards" }).finished.then(() => g.remove(), () => g.remove());
  el.animate([{ opacity: 0, transform: `translateX(${d}px)` }, { opacity: 1, transform: "none" }], { duration: calm.matches ? 180 : 300, easing: GLIDE });
}
// what a sheet shows, sliding in from the side it was moved to (styles.css .from-right, .from-left; with Reduce Motion,
// a quick dissolve)
function slideIn(body, dir) { body.classList.remove("from-left", "from-right"); void body.offsetWidth; body.classList.add(dir > 0 ? "from-right" : "from-left"); }
// A sheet whose contents change (another day, another tile) keeps the height it had for a moment and eases to its new
// one, rather than jumping (on a phone its top moving, as it's held at the foot of the screen)
function easeHeight(dlg, change) {
  if (!dlg.open || calm.matches) { change(); return; }
  const h0 = dlg.getBoundingClientRect().height;
  dlg._eh?.cancel();
  change();
  const h1 = dlg.getBoundingClientRect().height;
  if (Math.abs(h1 - h0) > 1) dlg._eh = dlg.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 380, easing: GLIDE });
}

/* ---------- motion ---------- */
// Small things that move once, as they first come into view for a place: the 16 days' bars sweep out from
// each low to its high, the compass needle swings round to the wind, the sun's path is traced, the UV and air
// knobs slide to their reading (styles.css, .pre and .play). Not again on the 10-minute refresh, and not at
// all with Reduce Motion. (The cards settling in as they're scrolled to are all styles.css.)
// (The page is drawn again as each part of the forecast arrives: each new row or tile takes over from the
// one it replaces: still waiting to be seen, it waits; moving, it carries on from where that one had got to.)
const drawn = new Map();                                 // place:what → the rows or tiles last drawn
const seen = typeof IntersectionObserver === "function" && new IntersectionObserver((es) => {
  let n = 0;
  for (const e of es) {
    if (!e.isIntersecting) continue;
    seen.unobserve(e.target);
    e.target.style.setProperty("--i", String(n++));      // (those seen together, one after another)
    e.target.classList.replace("pre", "play");
    e.target._t0 = performance.now();
  }
}, { threshold: 0.6 });
function motion(key, ...els) {
  if (!seen || calm.matches || !S.wx) return;
  const here = cell(S.wx.place.lat, S.wx.place.lon), k = `${here}:${key}`, old = drawn.get(k);
  // (what was drawn before, here or at another place, no longer watched for: it's off the page)
  old?.forEach((o) => seen.unobserve(o));
  for (const [x, list] of drawn) if (!x.startsWith(`${here}:`)) list.forEach((o) => seen.unobserve(o));
  drawn.set(k, els);
  els.forEach((e, i) => {
    const o = old?.[i];
    if (!old || !o || o.classList.contains("pre")) { e.classList.add("pre"); seen.observe(e); return; }
    const gone = performance.now() - (o._t0 ?? -1e9);
    if (gone < 1800) { e.classList.add("play"); e._t0 = o._t0; e.style.setProperty("--i", o.style.getPropertyValue("--i") || "0"); e.style.setProperty("--t0", `${-Math.round(gone)}ms`); }
  });
}

/* ---------- what's seldom wanted ---------- */
// fetched the first time it is (and kept by the service worker with the rest, so offline too): a tile or a day in full
// (detail.js), and Settings (settings.js). DE() and SE(): the one that's come, if it has (what would only be drawn in
// it, not yet open, needn't be)
const later = (get) => { let p = null, m = null; return [() => (p ||= get().then((x) => (m = x), (e) => { p = null; throw e; })), () => m]; };
const [detailJs, DE] = later(() => import("./detail.js")), [settingsJs, SE] = later(() => import("./settings.js"));
const openDetail = (kind) => detailJs().then((m) => m.openDetail(kind)).catch(() => {});
const openDay = (key) => detailJs().then((m) => m.openDay(key)).catch(() => {});
// Settings, at its list (or at one of its folders)
function openSettings(page) {
  return settingsJs().then((m) => { if (page) m.openAt(page); else { m.drawSettings(); m.setHome(); openSheet($("settings")); } }).catch(() => {});
}

/* ---------- sheets ---------- */
// They rise over the page, which steps back; they slide away when closed (×, a tap outside, Escape),
// or when swiped down. With Reduce Motion, they simply come and go.
const calm = matchMedia("(prefers-reduced-motion: reduce)");
function openSheet(d) {
  // the page behind first (stepping back about the top of what's on screen, not the middle of the whole long page;
  // and still: styles.css), so it's restyled once, with the sheet (how far back, --recede, on the page alone and not
  // passed down to all that's on it: so a finger dragging the sheet down restyles just the page, not every card)
  const page = document.querySelector(".page");
  page.style.transformOrigin = `50% ${scrollY}px`;
  page.style.setProperty("--recede", "1");
  document.body.classList.add("sheet-up"); document.querySelector(".hero").classList.add("still");
  // (opened again as it was going: it comes back up from wherever it had got to, its dim with it, not from the foot of
  // the screen; and it's not closed after all)
  if (d.open && d.classList.contains("closing")) {
    const cs = getComputedStyle(d);
    d._closing?.();
    d.style.setProperty("--in-t", cs.transform); d.style.setProperty("--in-o", cs.opacity); d.style.setProperty("--dim-o", getComputedStyle(d, "::backdrop").opacity);
  } else for (const k of ["--in-t", "--in-o", "--dim-o"]) d.style.removeProperty(k);
  d.classList.remove("closing"); d.style.transform = "";
  if (!d.open) d.showModal();
  // (the title has focus first, so it's what a screen reader says, and no ring lands on the close button)
  d.querySelector(".sheet-head h2")?.focus({ preventScroll: true });
}
// Closing: it slides away (styles.css) from wherever it is, still rising or where a finger's left it, and it's closed
// once its own slide is over (not the end of anything moving inside it: a day's parts still rising, a chart drawing in).
// → a promise, kept once it's gone (never, if it's opened again meanwhile)
function closeSheet(d) {
  if (!d.open) return Promise.resolve();
  if (d.classList.contains("closing")) return d._gone;
  // (Settings closed as you're coming back signed in: the picture, and the photo on its way, done with: arriveEnd)
  if (d.id === "settings") arriveEnd(arrival, true);
  flushWaiting();
  const cs = getComputedStyle(d);
  d.style.setProperty("--from-t", cs.transform); d.style.setProperty("--from-o", cs.opacity); d.style.setProperty("--dim-o", getComputedStyle(d, "::backdrop").opacity);
  d.style.transform = "";
  d.classList.add("closing");
  document.querySelector(".page").style.setProperty("--recede", "0");
  let gone = false, kept;
  const end = (e) => { if (e.target === d && !e.pseudoElement && /^sheet-(out|fade-out)$/.test(e.animationName)) done(); };
  const stop = () => { gone = true; clearTimeout(timer); d.removeEventListener("animationend", end); d._closing = null; };
  const done = () => { if (gone) return; stop(); d.classList.remove("closing"); d.close(); kept(); };
  d.addEventListener("animationend", end);
  // (and in any case once it should have: a slide's end can go unsaid, in a tab put away)
  const timer = setTimeout(done, calm.matches ? 300 : 450);
  d._closing = stop;
  return (d._gone = new Promise((ok) => { kept = ok; }));
}
function sheetGestures(d) {
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) { document.body.classList.remove("sheet-up", "sheet-drag"); document.querySelector(".hero").classList.remove("still"); } });
  d.addEventListener("click", (e) => { if (e.target === d) closeSheet(d); });
  // swipe down: from the grabber, or from the content once it's scrolled to the top (and down, not sideways: a day's
  // sheet goes sideways to another day)
  let y0 = null, x0 = 0, dy = 0, t0 = 0, head = false, told = false;
  const body = d.querySelector(".sheet-body");
  d.addEventListener("touchstart", (e) => {
    head = !!e.target.closest(".sheet-head");
    if (e.touches.length > 1 || e.target.closest("input, select, textarea, .leaflet-container, .arr-grip") || (!head && body.scrollTop > 0)) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; t0 = performance.now(); told = false;
  }, { passive: true });
  d.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (!told) {
      const dx = e.touches[0].clientX - x0;
      if (Math.hypot(dx, dy) < 8) return;
      told = true;
      if (Math.abs(dx) > Math.abs(dy)) { y0 = null; return; }
    }
    if (dy <= 0 || (!head && body.scrollTop > 0)) { if (!d.classList.contains("dragging")) y0 = null; else d.style.transform = ""; return; }
    e.preventDefault();
    d.classList.add("dragging"); document.body.classList.add("sheet-drag");
    const pull = dy < 40 ? dy : 40 + (dy - 40) * 0.9;
    d.style.transform = `translateY(${pull}px)`;
    document.querySelector(".page").style.setProperty("--recede", String(Math.max(0, 1 - pull / 420)));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0), dragged = d.classList.contains("dragging");
    y0 = null; d.classList.remove("dragging"); document.body.classList.remove("sheet-drag");
    if (!dragged) return;
    if (dy > 120 || (dy > 30 && v > 0.55)) closeSheet(d);
    else { d.style.transform = ""; document.querySelector(".page").style.setProperty("--recede", "1"); }
  };
  d.addEventListener("touchend", end); d.addEventListener("touchcancel", end);
  // and the page behind holds still: a finger (or a wheel) on the dim, or on what in the sheet doesn't scroll, moves
  // nothing (done here, not by stopping the page scrolling, which has iOS Safari put a sheet in the wrong place)
  let free = false;
  d.addEventListener("touchstart", (e) => { free = e.touches.length > 1 || scrollsIn(e.target, d); }, { passive: true });
  d.addEventListener("touchmove", (e) => { if (!free && e.cancelable) e.preventDefault(); }, { passive: false });
  d.addEventListener("wheel", (e) => { if (!scrollsIn(e.target, d) && e.cancelable) e.preventDefault(); }, { passive: false });
}
// (whether what's under a finger, inside a sheet, would scroll: a list longer than it is, a strip wider; or a field or a
// map, which have their own)
function scrollsIn(el, top) {
  if (el.closest?.("input, select, textarea, [contenteditable], .leaflet-container, .maplibregl-map")) return true;
  for (; el && el !== top; el = el.parentElement) {
    const y = el.scrollHeight > el.clientHeight + 1, x = el.scrollWidth > el.clientWidth + 1;
    if (!y && !x) continue;
    const s = getComputedStyle(el);
    if ((y && /auto|scroll/.test(s.overflowY)) || (x && /auto|scroll/.test(s.overflowX))) return true;
  }
  return false;
}

// every source in one place (from the footer, or the map's ©), open at the part that was asked about
function openCredits(at) {
  const d = $("credits"), body = d.querySelector(".sheet-body");
  // (Copernicus asks for the year its information is used in)
  for (const y of d.querySelectorAll(".this-year")) y.textContent = String(new Date().getFullYear());
  openSheet(d);
  // (from the layout, not the screen: the sheet's still rising and scaling as this runs)
  body.scrollTop = at === "map" ? $("cr-map").offsetTop - body.offsetTop - 12 : 0;
}

/* ---------- wiring ---------- */
function wire() {
  // (the bar's own two icons are in the page already, drawn with it: index.html)
  for (const b of document.querySelectorAll("[data-close]")) { b.innerHTML = glyph("close", 18); b.addEventListener("click", () => closeSheet(b.closest("dialog"))); }
  for (const s of document.querySelectorAll(".ct-icon[data-g]")) s.innerHTML = glyph(s.dataset.g, 15);
  for (const s of document.querySelectorAll(".f-ic[data-g]")) s.innerHTML = glyph(s.dataset.g, 18);
  $("set-back").innerHTML = glyph("chevron", 18);
  // each sheet: closing by Escape or a tap outside, and swiping down
  for (const d of document.querySelectorAll("dialog.sheet")) sheetGestures(d);
  // (a word under the bar, over an open sheet too: toast)
  if (topLayer) $("toast").popover = "manual";
  // a swipe across a day to the next or the one before, and across a tile's sheet to the next tile or the one before
  // (either sheet open, detail.js has come)
  sideSwipe($("day"), $("day-body"), (d) => { const days = sheetDays(S.wx, nowWall(S.wx.place.offset)), i = days.findIndex((x) => x.key === S.dayKey); return (d > 0 && i <= 0) || (d < 0 && i >= days.length - 1); }, (n, quiet) => DE()?.stepDay(n, quiet));
  sideSwipe($("detail"), $("detail-body"), (d) => { const kinds = DE()?.detailKinds() || [], i = kinds.indexOf(S.detailKind); return (d > 0 && i <= 0) || (d < 0 && i >= kinds.length - 1); }, (n, quiet) => DE()?.stepDetail(n, quiet));
  pager();
  cardSwipe();
  pullToRefresh();
  $("place-btn").addEventListener("click", () => { drawSaved(); $("use-location").replaceChildren(h("span", { svg: glyph("locate", 18) }), " Use my location"); openSheet($("places")); });
  $("use-location").addEventListener("click", () => locate(false, closeSheet($("places"))));
  $("search").addEventListener("input", onSearch);
  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const first = $("results").querySelector(".row-btn");
    if (first && !S.searching) first.click(); else { S.pick = true; onSearch(true); }
  });
  $("places").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = [$("search"), ...$("results").querySelectorAll(".row-btn")], i = list.indexOf(document.activeElement);
    if (i < 0 || list.length < 2) return;
    e.preventDefault();
    list[Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  });
  $("locate-btn").addEventListener("click", () => locate());
  // (what's in Settings answers once settings.js has come: settings.js)
  $("settings-btn").addEventListener("click", () => openSettings());
  $("me-btn").addEventListener("click", youMenu);
  for (const b of document.querySelectorAll(".radar-play")) b.innerHTML = `<span class="ic g-off">${glyph("play", 16)}</span><span class="ic g-on">${glyph("pause", 16)}</span>`;
  // (full screen, it closes with an ×, as Apple's Weather map does)
  for (const b of document.querySelectorAll(".radar-full")) b.innerHTML = `<span class="ic g-off">${glyph("expand", 16)}</span><span class="ic g-on">${glyph("close", 18)}</span>`;
  $("refresh-btn").addEventListener("click", () => go(true));
  for (const b of document.querySelectorAll("[data-credits]")) b.addEventListener("click", () => openCredits(b.dataset.credits));
  for (const a of document.querySelectorAll(".credits a")) a.insertAdjacentHTML("beforeend", glyph("out", 16, "cr-out"));
  $("retry-btn").addEventListener("click", () => { retried = true; go(true); });
  // temperature, rain or wind: the 48 hours' chart and the days alike, from either switch (and once chosen, kept:
  // otherwise as the weather has it, viewFor)
  const drawMode = () => { if (S.wx) { const now = nowWall(S.wx.place.offset); drawHourChart(S.wx, now, I.hoursFrom(S.wx, now, 48), $("hourly-chart"), S.mode, true); daily(S.wx, now); } };
  for (const g of document.querySelectorAll("#days-seg button")) g.innerHTML = glyph({ temp: "heat", rain: "drop", wind: "wind" }[g.dataset.mode], 16);
  for (const seg of [$("hourly-seg"), $("days-seg")]) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]"); if (!b) return;
      S.modeChosen = true; showMode(b.dataset.mode);
      // (the chart and the days once the lens is on its way)
      afterFrame(drawMode);
    });
    seg.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tabs = [...seg.children], i = tabs.findIndex((x) => x.getAttribute("aria-selected") === "true");
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); n.click();
    });
  }
  // as the page scrolls past the big temperature, it fades and the bar takes up the temperature (iOS's collapsing title)
  const top = document.querySelector(".top"), heroEl = document.querySelector(".hero"), pagerEl = $("pager"), sideways = matchMedia("(orientation: landscape) and (max-height: 500px) and (min-width: 600px)");
  let ticking = 0, lastC = "";
  const onScroll = () => {
    ticking = 0;
    // (on its side, the weather now stays in sight on the left: the bar needn't take it up)
    // (the bar's taken up once the big one's mostly gone: a crossfade of its own, not one restyled with every frame of the scroll)
    const c = sideways.matches ? 0 : Math.min(1, Math.max(0, scrollY / Math.max(80, heroEl.offsetHeight - 40))), cs = c.toFixed(3);
    // (on just what fades with it, the scroller and the weather now of the pages beside, and only as it changes: on the
    // page, it restyled every part of it, the pages beside and all, at every frame of the scroll)
    if (cs !== lastC) { lastC = cs; for (const el of [pagerEl, ...document.querySelectorAll(".pv-hero")]) el.style.setProperty("--c", cs); }
    // (the bar taking up the temperature, or giving it back: the pill easing from the one's width to the other's, rather
    // than jumping, as only what's showing in it takes room)
    if ((c >= 0.72) !== top.classList.contains("collapsed")) {
      const pill = $("place-btn"), w0 = pill.offsetWidth;
      top.classList.toggle("collapsed", c >= 0.72);
      const w1 = pill.offsetWidth;
      if (Math.abs(w1 - w0) > 1 && moving()) pill.animate([{ width: `${w0}px` }, { width: `${w1}px` }], { duration: 320, easing: GLIDE });
    }
    heroEl.classList.toggle("away", c >= 0.99);          // (scrolled out of sight: its icon stops moving)
    document.body.classList.toggle("deep", c >= 0.99);   // (and the sky behind the cards: styles.css)
    top.classList.toggle("scrolled", scrollY > 8);
    top.style.setProperty("--p", Math.min(1, Math.max(0, scrollY / 64)).toFixed(3));   // (InFlite's header, compact as it's scrolled)
  };
  addEventListener("scroll", () => { ticking ||= requestAnimationFrame(onScroll); }, { passive: true });
  onScroll();
  // the glass: Safari only shows a press (:active) once the page listens for touches, and with a mouse
  // a soft light follows the pointer across the panels
  addEventListener("touchstart", () => {}, { passive: true });
  // (and no copying its words, by keys or a menu, nor dragging them off: styles.css; but what's typed into, as ever)
  const typing = (e) => e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
  for (const t of ["copy", "cut", "contextmenu", "selectstart", "dragstart"]) document.addEventListener(t, (e) => { if (!typing(e)) e.preventDefault(); });
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // (on the pane it's over: styles.css .lit; the one it's left, dimming a moment as it goes: .unlit)
    let raf = 0, x = 0, y = 0, over = null, lit = null;
    const unlight = (el) => { el.classList.replace("lit", "unlit"); clearTimeout(el._unlit); el._unlit = setTimeout(() => el.classList.remove("unlit"), 320); };
    addEventListener("pointermove", (e) => {
      x = e.clientX; y = e.clientY; over = e.target instanceof Element ? e.target.closest(".card, .ins, .tile, .section-title, dialog.sheet, .c-tip") : null;
      raf ||= requestAnimationFrame(() => {
        raf = 0;
        if (over !== lit) { if (lit) unlight(lit); lit = over; if (lit) { clearTimeout(lit._unlit); lit.classList.remove("unlit"); lit.classList.add("lit"); } }
        if (lit) { lit.style.setProperty("--lx", `${x}px`); lit.style.setProperty("--ly", `${y}px`); }
      });
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (lit) unlight(lit); lit = over = null; });
  }
  // the minute changes things like "in 20 minutes": redraw just what says so (the rest waits for the next forecast)
  // (a new hour: all of it again, the strip's Now and the days' Today moving on with it; else what tells the time, and
  // in the hour before a sunrise or sunset, the tiles, for the Sun's "In 25 min" (not while one of them's in hand))
  let tickHour = null;
  setInterval(() => {
    if (!S.wx || document.visibilityState !== "visible") return;
    const now = nowWall(S.wx.place.offset), hr = Math.floor(now / HOUR), d = I.dayOf(S.wx, now);
    if (tickHour != null && hr !== tickHour) render();
    else {
      sky(S.wx, now); hero(S.wx, now); nowcast(S.wx, now, { tick: true }); solar(S.wx, now); status();
      if ([d?.sunrise, d?.sunset].some((t) => t && t > now && t - now <= HOUR) && !$("tiles").contains(document.activeElement)) tiles(S.wx, now);
    }
    tickHour = hr;
    check();
    // (and the places beside it, their weather now and their whole pages, drawn again for the minute when it's idle)
    nearbySoon();
  }, 60e3);
}

start();

// (for what's fetched when it's wanted: detail.js, settings.js)
export { $, accountPage, adopt, afterFrame, airName, balance, calm, canShow, CARDS, COLOR, drawHourChart, EASE_IN,
  EASE_OUT, easeHeight, ghost, GLIDE, go, h, hereToo, mine, nightsOf, nkey, notifying, notifySaved, notifyWhy,
  openSheet, PERSON, place, redraw, refreshDevices, retitle, S, saveSettings, sheetDays, signedOut, signOutHere,
  slideIn, STATES, swap, syncNotify, T, TILES, toAccountSignIn, uvName, windows };
