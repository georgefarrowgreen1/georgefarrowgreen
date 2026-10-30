// Chat — the phone app. Everything readable is encrypted and decrypted
// here; the server (functions/api/pigeon) only ever sees ciphertext.
import { E2E, te, rand, b64, b64url, fromB64url, uuid } from "./crypto.js";
import { LAND } from "./land.js";
import { PLACES, nearestPlace, snapToMile, snapTo } from "./places.js";
import { COUNTRIES, RANGES } from "./countries.js";
import { placeAt } from "./placegrid.js";
import { qrSvg } from "./qr.js";
import { ABOUT, BODIES, EARTH_R, MOON_R, lunarKm, surfaceKm, moonKm, marsKm, lightMs, moonPhase, earthPhase, nearFar, spaceKinds, spaceFlight, spaceMoments, spaceNow, legOf, drawPick, sideLon, pickAt, drawTrip, farSide, siteName, lunarDay, marsClock, bodyOf, lookTo, moonLook, marsLook, sunLook, orbitWhere, ORBIT, distAt } from "./moon.js";

// ==== InFlite's menu, shared: from .tools/inflite/menu.js by node .tools/iflmenu.mjs (change it there) ====
// InFlite's menu: one menu, the same in every app, opened from your photo. You (a tap to your account), the app's own
// few rows, and a foot with its version and Sign Out. With it: the same note in every app after it's updated itself.
// (Plain script, no imports: it's the same in a module and in Mail's script. Images only ever blob: or the app's own,
// as each app's rules allow; the apps' icons are drawn here, made blob: once each.)
const IFL = (() => {
  const APPS = [["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"], ["account", "Account"]];
  const NAME = Object.fromEntries(APPS);
  const ICONS = {"chat":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\".6\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4aa3ff\"/><stop offset=\"1\" stop-color=\"#0055d4\"/></linearGradient><radialGradient id=\"glow\" cx=\"220\" cy=\"120\" r=\"760\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"low\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\".6\" stop-color=\"#002a80\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#002a80\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"rim\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".7\"/><stop offset=\".4\" stop-color=\"#fff\" stop-opacity=\".1\"/><stop offset=\".8\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".25\"/></linearGradient><linearGradient id=\"face\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#e6efff\"/></linearGradient><linearGradient id=\"side\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b9d4fb\"/><stop offset=\"1\" stop-color=\"#7fa9ec\"/></linearGradient><filter id=\"cast\" x=\"-80%\" y=\"-80%\" width=\"260%\" height=\"260%\"><feGaussianBlur stdDeviation=\"22\"/></filter><filter id=\"bevel\" x=\"-5%\" y=\"-5%\" width=\"110%\" height=\"110%\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"5\"/><feOffset dy=\"-9\" result=\"up\"/><feComposite in=\"SourceAlpha\" in2=\"up\" operator=\"out\" result=\"lo\"/><feFlood flood-color=\"#9fbff0\" flood-opacity=\".75\"/><feComposite in2=\"lo\" operator=\"in\" result=\"loS\"/><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"3\"/><feOffset dy=\"6\" result=\"dn\"/><feComposite in=\"SourceAlpha\" in2=\"dn\" operator=\"out\" result=\"hi\"/><feFlood flood-color=\"#fff\"/><feComposite in2=\"hi\" operator=\"in\" result=\"hiL\"/><feMerge><feMergeNode in=\"SourceGraphic\"/><feMergeNode in=\"loS\"/><feMergeNode in=\"hiL\"/></feMerge></filter><clipPath id=\"sq\"><rect width=\"1024\" height=\"1024\" rx=\"224\"/></clipPath></defs><g clip-path=\"url(#sq)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#g)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#glow)\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#low)\"/><g filter=\"url(#cast)\" opacity=\".58\"><path transform=\"translate(10 50) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"#001c5c\"/></g><g fill=\"url(#side)\"><path transform=\"translate(0 16) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 14) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 12) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 10) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 8) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 6) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 4) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/><path transform=\"translate(0 2) translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\"/></g><g filter=\"url(#bevel)\"><path transform=\"translate(128 140) scale(32)\" d=\"M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z\" fill=\"url(#face)\"/></g></g><rect x=\"4\" y=\"4\" width=\"1016\" height=\"1016\" rx=\"220\" fill=\"none\" stroke=\"url(#rim)\" stroke-width=\"8\"/></svg>","weather":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4f97f8\"/><stop offset=\"1\" stop-color=\"#2b69de\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd44f\"/><stop offset=\"1\" stop-color=\"#f9b929\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f2f7ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"cloudClip\"><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"#0b3a9e\" fill-opacity=\"0.16\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#cloudClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"320\" cy=\"392\" r=\"192\" fill=\"url(#sun)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"url(#glass)\"/></g><path d=\"M 747.0 782 H 376.0 A 150 150 0 0 1 343.4 485.6 A 46 46 0 0 0 376.8 455.8 A 196 196 0 0 1 752.5 473.7 A 46 46 0 0 0 784.8 507.2 A 140 140 0 0 1 747.0 782 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","fitness":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8457\"/><stop offset=\"1\" stop-color=\"#ee4b2f\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#fff4f0\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"wheelClip\"><path clip-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"#8f1d0b\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#wheelClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"700\" cy=\"330\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path fill-rule=\"evenodd\" d=\"M 512 270 A 290 290 0 1 1 511.9 270 Z M 512 380 A 180 180 0 1 0 512.1 380 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","markets":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#4fd98d\"/><stop offset=\"1\" stop-color=\"#169a5b\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.86\"/><stop offset=\"1\" stop-color=\"#effff5\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"barsClip\"><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"720\" cy=\"300\" r=\"150\" fill=\"url(#sun)\"/><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\" fill=\"#05502b\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#barsClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"720\" cy=\"300\" r=\"150\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/></g><path d=\"M 294 560 H 346 A 44 44 0 0 1 390 604 V 748 A 44 44 0 0 1 346 792 H 294 A 44 44 0 0 1 250 748 V 604 A 44 44 0 0 1 294 560 Z M 486 442 H 538 A 44 44 0 0 1 582 486 V 748 A 44 44 0 0 1 538 792 H 486 A 44 44 0 0 1 442 748 V 486 A 44 44 0 0 1 486 442 Z M 678 318 H 730 A 44 44 0 0 1 774 362 V 748 A 44 44 0 0 1 730 792 H 678 A 44 44 0 0 1 634 748 V 362 A 44 44 0 0 1 678 318 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","mail":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3fd0c6\"/><stop offset=\"1\" stop-color=\"#119a95\"/></linearGradient><linearGradient id=\"sun\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd85a\"/><stop offset=\"1\" stop-color=\"#ffb52e\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#effffd\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"envClip\"><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"#05534f\" fill-opacity=\"0.2\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#envClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"712\" cy=\"330\" r=\"168\" fill=\"url(#sun)\"/></g><rect width=\"1024\" height=\"1024\" fill=\"url(#glass)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#05534f\" stroke-opacity=\"0.16\" stroke-width=\"22\" stroke-linecap=\"round\" stroke-linejoin=\"round\" filter=\"url(#frost)\" transform=\"translate(0 6)\"/><path d=\"M 240 404 L 512 610 L 784 404\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.95\" stroke-width=\"14\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><path d=\"M 286 372 H 738 A 78 78 0 0 1 816 450 V 728 A 78 78 0 0 1 738 806 H 286 A 78 78 0 0 1 208 728 V 450 A 78 78 0 0 1 286 372 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>","account":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7186ff\"/><stop offset=\"1\" stop-color=\"#4a45dc\"/></linearGradient><linearGradient id=\"head\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc38f\"/><stop offset=\"1\" stop-color=\"#ff8d5c\"/></linearGradient><linearGradient id=\"glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\" stop-opacity=\"0.84\"/><stop offset=\"1\" stop-color=\"#f3f4ff\" stop-opacity=\"0.72\"/></linearGradient><linearGradient id=\"rimFade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"0.7\" stop-color=\"#fff\" stop-opacity=\"0.3\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0.15\"/></linearGradient><mask id=\"rimMask\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rimFade)\"/></mask><clipPath id=\"bodyClip\"><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\"/></clipPath><filter id=\"frost\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feGaussianBlur stdDeviation=\"9\"/></filter><filter id=\"shade\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"18\"/></filter></defs><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"#1c1a8f\" fill-opacity=\"0.18\" filter=\"url(#shade)\" transform=\"translate(0 16)\"/><g clip-path=\"url(#bodyClip)\"><g filter=\"url(#frost)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#sky)\"/><circle cx=\"512\" cy=\"367\" r=\"170\" fill=\"url(#head)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"url(#glass)\"/></g><path d=\"M 328 827 A 104 104 0 0 1 224 723 V 703 C 224 627 342 507 512 507 C 682 507 800 627 800 703 V 723 A 104 104 0 0 1 696 827 Z\" fill=\"none\" stroke=\"#ffffff\" stroke-opacity=\"0.85\" stroke-width=\"5\" mask=\"url(#rimMask)\"/></svg>"};
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
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
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
  // Notifications on this device, asked for in one tap (a phone asks each app for itself, and only from a tap): when
  // the app's opened from the account's Notifications page to turn them on (#notify), or from the menu's row where
  // they're off. What they tell you is the account's. turnOn(): asks the browser first thing, → true once they're on
  let allowEl = null;
  function allow(app, line, turnOn) {
    allowEl?.remove();
    const img = el("img", "ifa-ic"); img.src = iconUrl(app); img.alt = "";
    const go = el("button", "ifa-go", "Allow Notifications"), later = el("button", "ifa-later", "Not Now");
    go.type = later.type = "button";
    const sheet = el("div", "ifa-sheet", img, el("h2", "ifa-t", "Notifications on this device"), el("p", "ifa-p", line), go, later);
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Notifications on this device");
    const layer = allowEl = el("div", "ifa-layer", sheet), was = document.activeElement;
    const key = (e) => {
      if (e.key === "Escape") shut();
      else if (e.key === "Tab") { e.preventDefault(); (document.activeElement === go ? later : go).focus(); }
    };
    const shut = () => { document.removeEventListener("keydown", key, true); layer.classList.remove("on"); setTimeout(() => layer.remove(), 320); if (allowEl === layer) allowEl = null; was?.focus?.({ preventScroll: true }); };
    later.onclick = shut;
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) shut(); });
    go.onclick = async () => {
      go.disabled = true; go.textContent = "Turning On…";
      const on = await Promise.resolve().then(turnOn).catch(() => false);
      if (on) { shut(); note(app, "Notifications on", "On this device"); } else { go.disabled = false; go.textContent = "Allow Notifications"; }
    };
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("on")));
    go.focus({ preventScroll: true });
  }
  // (opened to turn them on: #notify, taken out of the address, and whether it was there)
  function wantsAllow() {
    if (!/(^#|&)notify(&|$)/.test(location.hash)) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
    return true;
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
    m.behind?.forEach((c) => { c.inert = false; });
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
          sw.onclick = async () => { const next = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(next)); let v; try { v = await r.toggle?.(next); } catch (_) { v = !next; } if (typeof v === "boolean") sw.setAttribute("aria-checked", String(v)); };
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
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-label", "You and your apps");
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
    // (the page behind out of reach while it's open: a screen reader stays in the menu)
    const behind = [...document.body.children].filter((c) => !c.inert && c.tagName !== "SCRIPT");
    behind.forEach((c) => { c.inert = true; });
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
    open = { anchor, layer, pop, key, behind, onClose: o.onClose, redraw: (list) => {
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
  return { header, headerHtml, watch, settle, glyph, APPS, NAME, menu, close, redraw, isOpen: () => !!open, built, note, iconUrl, allow, wantsAllow };
})();
// ==== end of InFlite's menu ====
// (opened from the account's Notifications page to turn them on here: #notify, asked as soon as Chat's ready)
const ASK_NOTIFY = IFL.wantsAllow();

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SPEED_KMH = 80, SWIFT_MAX = 9, TURBO_MAX = 3, ROCKET_MAX = 1;
// Pigeon kinds: [id, name, speed, loft size]. Standard is free on your turn;
// swift, turbo and rocket fly any time and come from lofts that refill through the day.
const APP_VERSION = "1.55";            // shown in InFlite's menu
const KINDS = [["standard", "Standard", 1, 0], ["swift", "Swift", 2, SWIFT_MAX], ["turbo", "Turbo", 3, TURBO_MAX], ["rocket", "Rocket", 9, ROCKET_MAX]];
const KIND = Object.fromEntries(KINDS.map(([id, name, speed, max]) => [id, { name, speed, max }]));
// Rare pigeons: a look for your pigeons, unlocked by an achievement (the colour still says the kind)
const SKINS = {
  golden: { name: "Golden", badge: "Fleet", ring: "#f5c542" },
  midnight: { name: "Midnight", badge: "Long Haul", ring: "#8fa2ff" },
  storm: { name: "Storm", badge: "Tailwind Rider", ring: "#8ea3b8" },
  ember: { name: "Ember", badge: "Daredevil", ring: "#ff8a00" },
  comet: { name: "Comet", badge: "Rocket Mail", ring: "#7ad7ff" },
  rainbow: { name: "Rainbow", badge: "Around the World", ring: "#c86bff" },
  // seasonal: anyone's while the season lasts; ten pigeons in it and it's yours to keep
  spring: { name: "Blossom", badge: "Spring Migration", ring: "#ff8fb4", season: true },
  summer: { name: "Sunny", badge: "Summer Flyer", ring: "#ffc233", season: true },
  autumn: { name: "Russet", badge: "Autumn Leaves", ring: "#c8622a", season: true },
  winter: { name: "Frosty", badge: "Winter Wings", ring: "#9fd8ff", season: true },
};
// the seasons, as the server has them: [id, look, emoji, words, from [m, d], to [m, d]] (UTC days)
const SEASONS = [["spring", "Blossom", "🌸", "Spring migration", [3, 20], [4, 30]], ["summer", "Sunny", "☀️", "Summer", [6, 21], [8, 31]],
  ["autumn", "Russet", "🍂", "Autumn", [10, 1], [11, 15]], ["winter", "Frosty", "❄️", "Winter", [12, 1], [1, 6]]];
function seasonNow(t = now()) {
  const y = new Date(t).getUTCFullYear();
  for (const s of SEASONS) for (const sy of [y - 1, y]) {
    const from = Date.UTC(sy, s[4][0] - 1, s[4][1]), to = Date.UTC(s[5][0] < s[4][0] ? sy + 1 : sy, s[5][0] - 1, s[5][1]) + DAY;
    if (t >= from && t < to) return { id: s[0], look: s[1], emoji: s[2], words: s[3], from, to, key: `${s[0]}-${sy}` };
  }
  return null;
}
KIND.dumb = { name: "Dumb", speed: 1 / 3, max: 0 };
// a mystery pigeon: one a day, from no loft and on no one's turn; its kind is drawn as it takes off
KIND.mystery = { name: "Mystery", speed: 1, max: 1 };        // a secret: start a message with /dumb
// lunar pigeons (pigeon/moon.js): the only ones to, from or across the Moon, from lofts of their own
KIND.lunar = { name: "Lunar", speed: 1, max: 3 }; KIND.lunarx = { name: "Lunar Express", speed: 1, max: 1 };
// and the rest of the space pigeons (pigeon/space.js): laser to or from Mars, orbital round the Earth
KIND.laser = { name: "Laser", speed: 1, max: 5 }; KIND.orbital = { name: "Orbital", speed: 1, max: 2 };
const SPACE_KINDS = ["lunar", "lunarx", "laser", "orbital"];
// someone off the Earth (the Moon, or Mars): where (their end of a flight), and whether a chat with them is a space one
const endFor = (p) => (p?.moon ? { b: p.moon.b === "mars" ? "mars" : "moon", lat: p.moon.lat, lon: p.moon.lon, place: p.place } : p?.lat != null ? { b: "earth", lat: p.lat, lon: p.lon, place: p.place } : null);
const moonChat = (f) => !!f && !!(S.me?.moon || f.moon);
const kindsFor = (f) => spaceKinds(endFor(S.me), endFor(f)) || [];
const worldOf = (p) => (p?.moon ? (p.moon.b === "mars" ? "mars" : "moon") : p?.offEarth || "earth");
// how long a space pigeon takes now (Pigeon Death only hurries a lunar one: light and orbits don't)
// (an Earth end to the half degree, as the server keeps it: an orbit's pass can turn on a few miles)
const asSent = (e) => (e?.b === "earth" ? { ...e, lat: Math.round(e.lat * 2) / 2, lon: Math.round(e.lon * 2) / 2 } : e);
const spaceMs = (k, a, b) => spaceFlight(k, asSent(a), asSent(b), now(), S.me?.risky && k.startsWith("lunar") ? RISKY_SPEED : 1).ms;
// a name for a spot on Earth, for an orbit's path ("the North Atlantic", "France")
const whereOnEarth = (la, lo) => { const p = placeAt(la, lo); return p && p !== "land" ? p : null; };
const DUMB = /^\/dumb(?:\s+|$)/i;
// Pigeon Death (Account → Pigeons): 1.25× faster, but 1 in 100 is lost on the way
const RISKY_SPEED = 1.25;
const LIVE_LEFT = HOUR;                // pigeons with longer than this to go have the sky ahead looked at again (functions/_live.js)
const mySpeed = (kind) => KIND[kind].speed * (S.me?.risky ? RISKY_SPEED : 1);
const dumbText = () => DUMB.test($ta.value) ? $ta.value.replace(DUMB, "") : null;
const kindOf = (m) => (m && Object.hasOwn(KIND, m.pigeon) ? m.pigeon : m?.swift ? "swift" : "standard");
const POLL_MS = 15000;
const AUTH_VIEWS = new Set(["welcome", "locpick", "pkoffer"]);
// before you're in: all under the welcome's night sky, which carries on from one to the next
const NIGHT_VIEWS = new Set(["welcome"]);

/* ---------------- state ---------------- */
const S = {
  token: null, me: null, priv: null, secretJwk: null, fp: "",
  friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [], skew: 0,
  view: "loading", chat: null, sheet: null, flash: "", err: "",
  msgs: new Map(), turns: new Map(), plain: new Map(), notes: new Map(), photos: new Map(), photoGone: new Set(),
  pairs: new Map(), pins: {}, attach: null, busy: false, stick: true,
  chatRaw: new Map(), outbox: [], viewedOnce: new Set(), pctx: new Map(), pendingAdd: null, offline: false, seenLanded: new Set(), fresh: new Map(), nav: null,
  avatars: new Map(), q: "", fq: "", addMsg: null,
  reacts: new Map(), fly: new Map(), wxPlan: new Map(), gevents: new Map(), drafts: new Map(), replyTo: null,
  birds: [], hall: [], birdPick: null,       // your named pigeons, your Hall of Fame, and the one picked to carry the next message ("none": unnamed)
};
const now = () => Date.now() + S.skew;
const $ = (sel, root = document) => root.querySelector(sel);
// passkeys belong to georgefarrowgreen.com, which lets Chat's address on inflite.ai use them (as the server has it: rpIdFor)
const RP_ID = /(^|\.)(georgefarrowgreen\.com|inflite\.ai)$/.test(location.hostname) ? "georgefarrowgreen.com" : location.hostname;
// where Chat is, as you'd type it: "georgefarrowgreen.com/pigeon" or "chat.inflite.ai"
// Chat lives at chat.inflite.ai now. At its old address (georgefarrowgreen.com/pigeon)
// this is where it went; null at the new address. (Locally, tests turn the old address on.)
const NEW_HOME = (() => {
  if (/^chat\./.test(location.host)) return null;
  let test = false; try { test = location.hostname === "localhost" && !!localStorage.getItem("inflight-test-moved"); } catch (_) {}
  return location.hostname === "georgefarrowgreen.com" || test ? `${location.protocol}//chat.${location.host}` : null;
})();
const HERE = () => `${location.host}${location.pathname.replace(/\/(index\.html)?$/, "").replace(/\/+$/, "")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- this phone's storage (IndexedDB) ----------------
   Holds the session token and the private key as a non-extractable CryptoKey:
   usable by this app, but not readable even by its own code. */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      // (iOS can leave an open hanging after a resume: give up after a few seconds rather than never start)
      const late = setTimeout(() => rej(new Error("This phone’s storage didn’t answer.")), 6000);
      const r = indexedDB.open("inflight", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => {
        clearTimeout(late); const db = r.result;
        db.onclose = () => { if (this.db === db) this.db = null; };   // dropped in the background: open it again next time
        // (and let go when another page needs it gone: the old address's copy, cleared from the new one)
        db.onversionchange = () => { try { db.close(); } catch (_) {} if (this.db === db) this.db = null; };
        res((this.db = db));
      };
      r.onerror = () => { clearTimeout(late); rej(r.error); };
    });
  },
  async run(mode, fn, again = true) {
    const db = await this.open();
    try {
      return await new Promise((res, rej) => {
        const tx = db.transaction("kv", mode), req = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error("Storage write was cancelled."));       // a full phone aborts, it doesn't error
      });
    } catch (e) {
      if (again && e?.name === "InvalidStateError") { this.db = null; return this.run(mode, fn, false); }   // the connection was lost: once more, fresh
      throw e;
    }
  },
  get(k) { return this.run("readonly", (s) => s.get(k)).catch(() => null); },
  set(k, v) { return this.run("readwrite", (s) => s.put(v, k)).catch(() => null); },
  del(k) { return this.run("readwrite", (s) => s.delete(k)).catch(() => null); },
};

/* ---------------- server ---------------- */
// fetch can't report upload progress; XMLHttpRequest can, so photo uploads use it
function xhrFetch(url, { method, headers, body, size, onProgress }) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => resolve(new Response(x.responseText, { status: x.status, headers: { "Content-Type": x.getResponseHeader("Content-Type") || "application/json" } }));
    x.onerror = x.onabort = x.ontimeout = () => reject(new TypeError("Network error"));
    x.timeout = 120000 + (size ?? body?.size ?? 0) / 20;          // a stalled upload gives up (a big one gets longer: ~20 KB/s at worst)
    x.send(body);
  });
}
async function api(path, { method = "GET", body, form, raw, blob, size, onProgress } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (blob) { headers["Content-Type"] = blob.type; payload = blob; }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  // nothing waits forever on a weak signal: a reply that hasn't come in 25 s (a minute for anything carrying a file) is treated as no signal
  const quit = !onProgress && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(payload instanceof Blob || payload instanceof FormData ? 90000 : 25000) : undefined;
  try { r = onProgress ? await xhrFetch("/api/pigeon/" + path, { method, headers, body: payload, size, onProgress }) : await fetch("/api/pigeon/" + path, { method, headers, body: payload, signal: quit }); }
  catch (_) { S.offline = true; renderOffline(); throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); }
  if (S.offline) { S.offline = false; renderOffline(); }
  if (raw && r.ok) return r;
  // a page that isn't ours (a café's sign-in screen, a proxy) answering in our place isn't success
  if (r.ok && !/json/.test(r.headers.get("Content-Type") || "")) { S.offline = true; renderOffline(); throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); }
  let data = {};
  try { data = await r.json(); } catch (_) {}
  // only a sign-in that has ended signs you out (not a wrong password on a "confirm it's you")
  if (r.status === 401 && S.token && data.field === "session") { await forget(); go("welcome"); }
  // a reply with no message of ours came from somewhere in between: say which, so it can be traced
  if (!r.ok) throw Object.assign(new Error(data.error || `Something went wrong (error ${r.status}). Try again.`), { status: r.status, field: data.field });
  return data;
}

/* ---------------- formatting ---------------- */
const pad2 = (n) => String(n).padStart(2, "0");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDur(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return "under a minute";
}
function fmtAgo(ts) {
  const ms = now() - ts;
  if (ms < MIN) return "now";
  if (ms < HOUR) return Math.floor(ms / MIN) + "m";
  if (ms < DAY) return Math.floor(ms / HOUR) + "h";
  return Math.floor(ms / DAY) + "d";
}
const fmtTime = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
function dayLabel(ts) {
  if (sameDay(ts, now())) return "Today";
  if (sameDay(ts, now() - DAY)) return "Yesterday";
  const d = new Date(ts); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
const fmtShort = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : `${DOW[new Date(ts).getDay()]} ${fmtTime(ts)}`);
// When a scheduled pigeon lands: "today at 18:00", "tomorrow at 08:00", "Sat 18 Oct at 09:30"
const fmtLand = (ts) => { const d = new Date(ts); return sameDay(ts, now()) ? `today at ${fmtTime(ts)}` : sameDay(ts, now() + DAY) ? `tomorrow at ${fmtTime(ts)}` : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} at ${fmtTime(ts)}`; };
const fmtDate = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtMiles = (km) => Math.round(km * 0.621371).toLocaleString("en-GB") + " mi";
const fmtMph = (kmh) => Math.round(kmh * 0.621371).toLocaleString("en-GB") + " mph";
// The wind a pigeon had at take-off: what blew its way (km/h; negative is a headwind).
const windWord = (w) => (w == null ? "" : Math.abs(w) < 3 ? "calm" : w > 0 ? "tailwind" : "headwind");
const fmtWind = (w) => (w == null ? "" : Math.abs(w) < 3 ? "Calm skies" : `${w > 0 ? "Tailwind" : "Headwind"} ${Math.round(Math.abs(w) * 0.621371)} mph`);
const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
const initials = (n) => String(n).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const first = (n) => String(n).trim().split(/\s+/)[0];
const hue = (s) => ([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) % 5 + 1;
// A picture (a photo, a face) fades in as it arrives, and only then: when each blob was made, by its address
const bornAt = new Map();
const born = (url) => { const t = url && bornAt.get(url); return t && Date.now() - t < 600 ? t : 0; };
// A person's picture if they have one (fetched with this phone's sign-in, then kept as a blob URL), else their initials.
// dot: show a green dot when they're online now
function avatar(person, size = "", dot = false, one = false) {
  const name = person?.name || person?.handle || "?";
  const url = person?.avatarAt ? avatarUrl(person) : "";
  return `<span class="av ${size}" data-c="${hue(name)}" aria-hidden="true">${url ? `<img src="${url}" alt=""${born(url) ? ` class="arrive" data-born="${born(url)}"` : ""}>` : esc(one ? initials(name).slice(0, 1) : initials(name))}${dot ? onlineDot(person) : ""}</span>`;
}
// The dot pops in when someone comes online while you watch, not every time
// the list redraws (nor at all while the app is still opening).
const onlineSince = new Map();
function onlineDot(person) {
  const id = person?.id;
  if (!isOnline(person)) { onlineSince.delete(id); return ""; }
  let at = onlineSince.get(id); if (at == null) onlineSince.set(id, (at = S.synced ? Date.now() : 0));
  return `<i class="online${Date.now() - at < 150 ? " new" : ""}"></i>`;
}
// A group's picture: two of its other members, overlapping.
function gavatar(g, size = "") {
  const two = others(g).slice(0, 2);
  if (two.length < 2) return avatar(two[0] || { name: g.name }, size);
  // one initial each, so neither is cut off; colours as everywhere else
  return `<span class="gav ${size}" aria-hidden="true">${avatar(two[0], "", false, true)}${avatar(two[1], "", false, true)}</span>`;
}
// An open app checks in every 15 s and the server notes it once a minute, so
// anyone seen in the last 2½ minutes has Chat open now.
const ONLINE_MS = 150e3;
const isOnline = (p) => !!p?.seenAt && now() - p.seenAt < ONLINE_MS;
// 5m ago, then Today 21:38, Yesterday 21:38, Mon 21:38, 3 Oct 2026
function fmtSeen(at) {
  if (now() - at < HOUR) return `${Math.max(1, Math.floor((now() - at) / MIN))}m ago`;
  if (sameDay(at, now()) || sameDay(at, now() - DAY)) return `${dayLabel(at)} ${fmtTime(at)}`;
  return now() - at < 6 * DAY ? fmtShort(at) : fmtDate(at);
}
let avatarRender = 0;
function avatarUrl(p) {
  const key = `${p.id}:${p.avatarAt}`;
  if (S.avatars.has(key)) return S.avatars.get(key);
  S.avatars.set(key, "");
  api(`avatar/${encodeURIComponent(p.id)}?v=${p.avatarAt}`, { raw: true })
    .then((r) => r.blob())
    .then((b) => {
      S.avatars.set(key, URL.createObjectURL(b)); bornAt.set(S.avatars.get(key), Date.now());
      clearTimeout(avatarRender); avatarRender = setTimeout(() => { render(); if (S.sheet && S.sheet.type !== "map") renderSheet(true); }, 60);
    })
    .catch(() => { setTimeout(() => S.avatars.delete(key), 30e3); });    // (tried again in a while: it may have been the signal)
  return "";
}
function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, s = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}
const flightMs = (km, speed = 1) => Math.min(3 * DAY, Math.max(5 * MIN, (km / SPEED_KMH) * HOUR)) / speed;

/* ---------------- icons ---------------- */
const BIRD = document.getElementById("bird-path").getAttribute("d");
const ico = (d) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${d}</svg>`;
const I = {
  once: `<svg viewBox="0 0 24 24" class="ico oico" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 1 1-6.6 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="7.6" cy="4.6" r="1.2" fill="currentColor"/><circle cx="4.4" cy="8.2" r="1.2" fill="currentColor"/><path d="M9.6 8.2v7.6l6.2-3.8z" fill="currentColor"/></svg>`,
  leaf: ico(`<path d="M5 19c0-8 5-14 15-14 0 9-5 14-13 14"/><path d="M5 19 13 11"/>`),
  snowflake: ico(`<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/>`),
  blossom: ico(`<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C10 6 13.5 3.5 14.6 6.3c1 2.6-1.2 3.6-2.6 3.5ZM14.1 11.3c3.7-1.8 6 1.8 3.2 2.8-2.6.9-3.5-1.3-3.2-2.8ZM13.3 14c1.6 3.8-2.2 5.8-3 2.9-.7-2.7 1.6-3.4 3-2.9ZM10.6 13.9c-3.9 1.4-5.6-2.5-2.7-3.1 2.8-.6 3.4 1.7 2.7 3.1Z"/>`),
  coin: ico(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.6" stroke-width="1" stroke-dasharray="1.2 1.6"/><path transform="translate(5.8 6.3) scale(.52)" fill="currentColor" stroke="none" d="${BIRD}"/>`),     // a Coots Coin: a bird on its face
  feather: ico(`<path d="M20.2 3.8C14 3.6 8.4 7.4 6.6 13.6L5 19"/><path d="M20.2 3.8c.6 6-2.6 11.3-8.4 13.2L6.6 13.6"/><path d="M11 9.6l3.3 1.2M9.4 12.4l3.3 1.3"/><path d="M5 19l-1.4 1.4"/>`),
  flame: ico(`<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-2.6 1.4-4.6 3-6.3.3 1.7 1.2 2.9 2.4 3.4-.4-3.3 1-6.1 3.4-8.4.2 2.8 1.6 4.4 2.9 6 1 1.3 1.8 2.9 1.8 4.9 0 4-2.6 6.6-6.5 6.6Z"/><path d="M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.6 1.2-2.6 2.2-3.8.2 1 .8 1.6 1.5 1.8.1-.9.6-1.6 1.1-2.2.7 1 1 2.1 1 3.2 0 2.2-1.3 3.8-3 3.8Z"/>`),
  bird: `<svg viewBox="0 0 24 24" class="bird" aria-hidden="true"><path d="${BIRD}"/></svg>`,
  bubble: ico(`<path d="M12 4C7 4 3 7.2 3 11.2c0 2.2 1.2 4.1 3.1 5.4L5.5 20l3.9-2c.8.2 1.7.3 2.6.3 5 0 9-3.2 9-7.1S17 4 12 4Z"/>`),
  people: ico(`<circle cx="9" cy="8.5" r="3.3"/><path d="M3.2 19c.6-3.3 3-5.2 5.8-5.2s5.2 1.9 5.8 5.2"/><circle cx="16.8" cy="9.5" r="2.6"/><path d="M15.6 13.9c2.6-.4 4.7 1.2 5.2 4.2"/>`),
  person: ico(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.3c1.2-2.3 3.3-3.4 5.7-3.4s4.5 1.1 5.7 3.4"/>`),
  compose: ico(`<path d="M11 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.8 3.8a1.8 1.8 0 0 1 2.5 2.5L12.5 14 9.5 15l1-3Z"/>`),
  plus: ico(`<path d="M12 5v14M5 12h14"/>`),
  minus: ico(`<path d="M5 12h14"/>`),
  contrast: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>`),
  moon: ico(`<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>`),
  sun: ico(`<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`),
  bell: ico(`<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>`),
  sliders: ico(`<path d="M4 7.5h9M18.5 7.5H20M4 16.5h1.5M11 16.5h9"/><circle cx="15.8" cy="7.5" r="2.4"/><circle cx="8.2" cy="16.5" r="2.4"/>`),
  away: ico(`<path d="M8 16 16 8M9.5 8H16v6.5"/>`),
  back: ico(`<path d="M15 4.5 7.5 12l7.5 7.5"/>`),
  wind: ico(`<path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h7"/>`),
  mic: ico(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>`),
  play: `<svg viewBox="0 0 24 24" class="ico fillico" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" class="ico fillico" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>`,
  ship: ico(`<path d="M3.5 14.5h17l-2 5h-13z"/><path d="M6.5 14.5V10h11v4.5"/><path d="M10 10V6.5h4V10"/>`),
  volcano: ico(`<path d="M3 20.5h18l-5.5-9h-7z"/><path d="M8.5 11.5 10 9h4l1.5 2.5"/><path d="M12 6.5V3.5M9.2 6 8 3.8M14.8 6 16 3.8"/>`),
  fire: ico(`<path d="M12 21.5c-3.6 0-6.2-2.5-6.2-5.8 0-3.3 2.7-5.2 3.7-8.6.5 2 1.5 3.1 2.5 3.7.3-2.8 1.7-5 3.7-6.8-.2 3.5 2.5 5.8 2.5 9.7 0 3.3-2.6 5.8-6.2 5.8z"/>`),
  compass: ico(`<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.3 4.9-4.9 2.3 2.3-4.9z"/>`),
  storm: ico(`<path d="M7 15.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 15.5"/><path d="m13 12-2.5 4h3L11 20.5"/>`),
  rain: ico(`<path d="M7 14.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 14.5H7z"/><path d="m9 17.5-1 2.5M13 17.5l-1 2.5M17 17.5l-1 2.5"/>`),
  snow: ico(`<path d="M7 14.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 14.5H7z"/><path d="M9 18h.01M13 19.5h.01M17 18h.01M11 21h.01M15 21h.01"/>`),
  fog: ico(`<path d="M7 12.5a4.5 4.5 0 1 1 1.2-8.8 5.5 5.5 0 0 1 10.3 2.8A3 3 0 0 1 18 12.5"/><path d="M4 16h16M6 19.5h12"/>`),
  pass: ico(`<path d="M3.5 8.5h13l-3.5-3.5"/><path d="M20.5 15.5h-13l3.5 3.5"/>`),
  wave: ico(`<path d="M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5.5"/><path d="M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14.5 11V5.8a1.5 1.5 0 0 1 3 0V12"/><path d="M17.5 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.8a6.5 6.5 0 0 1-5.3-2.7l-3.1-4.4a1.5 1.5 0 0 1 2.4-1.8l1.8 2.2"/>`),
  heart: ico(`<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>`),
  reply: ico(`<path d="M10 8 5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5v1"/>`),
  copy: ico(`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>`),
  homing: ico(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
  chev: ico(`<path d="m9 5 7 7-7 7"/>`),
  more: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="7.9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.1" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  search: ico(`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>`),
  loc: ico(`<path d="M20 4 4 10.8l6.9 2.3L13.2 20Z"/>`),
  waves: ico(`<path d="M3 9.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 14.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/>`),
  globe: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.5 3.6 5.3 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.3-3.6-8.5s1.2-6 3.6-8.5Z"/>`),
  map: ico(`<path d="M3 6.5 8.5 4l7 3L21 4.5v13L15.5 20l-7-3L3 19.5Z"/><path d="M8.5 4v13M15.5 7v13"/>`),
  addp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3 1.4 0 2.6.3 3.7 1"/><path d="M18 14v6M15 17h6"/>`),
  minusp: ico(`<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3s5.7 1.9 6.5 5.3"/><path d="M16 12h6"/>`),
  share: ico(`<path d="M12 3.5v11M8 7l4-4 4 4"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 19 11h-1"/>`),
  photo: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/>`),
  qr: ico(`<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>`),
  camera: ico(`<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.5"/>`),
  trash: ico(`<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>`),
  up: ico(`<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>`),
  check: ico(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  ticks: ico(`<path d="m2.5 12.5 4 4 8-9"/><path d="m11 15.5 1 1 8-9"/>`),
  x: ico(`<path d="M6 6l12 12M18 6 6 18"/>`),
  pin: ico(`<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>`),
  gone: ico(`<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 4l16 16"/>`),
  key: ico(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2"/>`),
  face: ico(`<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/>`),
  eye: ico(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`),
  lock: ico(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  shield: ico(`<path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>`),
  info: ico(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>`),
  layers: ico(`<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>`),
  clock: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`),
  skull: ico(`<path d="M12 3.5c-4.3 0-7.5 3-7.5 7 0 2.3 1 4 2.6 5.1v2.7c0 .7.5 1.2 1.2 1.2h7.4c.7 0 1.2-.5 1.2-1.2v-2.7c1.6-1.1 2.6-2.8 2.6-5.1 0-4-3.2-7-7.5-7Z"/><circle cx="9.2" cy="11" r="1.7" fill="currentColor"/><circle cx="14.8" cy="11" r="1.7" fill="currentColor"/><path d="M10.6 20v-2.2M13.4 20v-2.2"/>`),
  dist: ico(`<circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M7.8 15.6c2.5-1 3.2-3.4 5-5s3-2 3.6-2.2" stroke-dasharray="2 2.6"/>`),
  hourglass: ico(`<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5-8 8.5s8 4 8 8.5"/>`),
  ok: ico(`<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.7L16 9.5"/>`),
  dot: ico(`<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>`),
  warn: ico(`<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.3"/>`),
  mail: ico(`<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>`),
  block: ico(`<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>`),
  phone: ico(`<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>`),
  laptop: ico(`<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 18.5h19"/>`),
};

/* ---------------- photos ---------------- */
async function loadBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch (_) {
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  }
}
// Downscale to 1600px and re-encode as JPEG. This also strips the photo's location metadata.
async function prepImage(blob) {
  const bmp = await loadBitmap(blob);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!out) throw new Error("That photo couldn’t be prepared.");
  return { bytes: new Uint8Array(await out.arrayBuffer()), w: c.width, h: c.height, preview: URL.createObjectURL(out) };
}

/* ---------------- map ---------------- */
// Web Mercator, in degree-sized units so 1 unit of x is 1° of longitude.
const R2D = 180 / Math.PI, MERC_MAX = 85;
const mercY = (lat) => R2D * Math.log(Math.tan(Math.PI / 4 + Math.max(-MERC_MAX, Math.min(MERC_MAX, lat)) / (2 * R2D)));
// Each ring or line: Float32Array of lon,mercY pairs, plus its bounding box.
// Longitudes are unwrapped so shapes that cross the date line stay in one
// piece; a ring that circles the globe (Antarctica) is closed via the pole.
function shapes(list, closed) {
  return list.map((src) => {
    const a = src.slice();
    for (let i = 2; i < a.length; i += 2) { while (a[i] - a[i - 2] > 180) a[i] -= 360; while (a[i] - a[i - 2] < -180) a[i] += 360; }
    if (closed && a.length > 4 && Math.abs(a[a.length - 2] - a[0]) > 180) a.push(a[a.length - 2], a[1] < 0 ? -90 : 90, a[0], a[1] < 0 ? -90 : 90);
    // unwrapping from a start past the date line can leave a whole continent a
    // turn west (Eurasia from Chukotka puts Europe near -360°): bring it back
    let west = Infinity; for (let i = 0; i < a.length; i += 2) if (a[i] < west) west = a[i];
    if (west < -180) { const turn = Math.ceil((-180 - west) / 360) * 360; for (let i = 0; i < a.length; i += 2) a[i] += turn; }
    const f = new Float32Array(a.length); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < a.length; i += 2) { const x = a[i], y = mercY(a[i + 1]); f[i] = x; f[i + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { f, box: [x0, y0, x1, y1] };
  });
}
// Natural Earth data (public domain), self-hosted so no map company learns
// where anyone's pigeons fly. 110m is built in; 50m and 10m load when needed.
const WORLD = {};
function world(res) {
  if (res === "110m") {
    if (!WORLD[res]) WORLD[res] = { land: shapes(LAND.split(";").map((r) => r.split(",").map((n) => n / 2)), true), borders: [] };
    return WORLD[res];
  }
  if (!WORLD[res]) {
    WORLD[res] = "loading";
    fetch(`/pigeon/map/world-${res}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => {
      const dec = (str) => !str ? [] : str.split(";").map((r) => { const a = r.split(",").map(Number); for (let i = 2; i < a.length; i++) a[i] += a[i - 2]; return a.map((n) => n / d.q); });
      WORLD[res] = { land: shapes(dec(d.land), true), borders: shapes(dec(d.borders)) };
      redrawMap();
    }).catch(() => { WORLD[res] = "failed"; });
  }
  return typeof WORLD[res] === "object" ? WORLD[res] : null;
}
function gcPoint(a, b, f) {
  const r = Math.PI / 180;
  const v = (p) => [Math.cos(p.lat * r) * Math.cos(p.lon * r), Math.cos(p.lat * r) * Math.sin(p.lon * r), Math.sin(p.lat * r)];
  const A = v(a), B = v(b);
  const w = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (w < 1e-9) return { lat: a.lat, lon: a.lon };
  const s1 = Math.sin((1 - f) * w) / Math.sin(w), s2 = Math.sin(f * w) / Math.sin(w);
  const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
  return { lat: Math.atan2(z, Math.hypot(x, y)) / r, lon: Math.atan2(y, x) / r };
}
const cssVar = (el, n) => getComputedStyle(el).getPropertyValue(n).trim();
let mapInk = null;                          // a share card's map: its own light or dark, whatever the app's theme
const MAP_KMAX = 400;                       // pixels per degree at full zoom
// The route, as points along the great circle (longitudes unwrapped so it never jumps the date line).
// The route as points along great circles, each with the time the pigeon is
// there. A pigeon that changed course (its friend moved) flies several legs.
// What its planned way is doing about now: going around storms, riding the wind,
// resting on an island, through a pass, past a landmark (see functions/_route.js)
// resting on an island ("i"), or sheltering from storms ("h"), right now: [where, until when, which], or null
// (and waiting for a ship, "b"; or at sea on it, "sail": [the sea, when it's ashore, "sail", the port])
function restingOn(m, t = now()) {
  const legs = (m.legs || []).filter((l) => l[3] && l[3] !== "c" && l[3] !== "f");
  if (m.lost || t >= m.deliverAt) return null;
  const i = legs.findIndex((l, k) => (l[3] === "i" || l[3] === "h" || l[3] === "t" || l[3] === "b") && legs[k + 1]?.[3] === l[3] && legs[k + 1][0] === l[0] && legs[k + 1][1] === l[1] && t >= l[2] && t < legs[k + 1][2]);
  if (i >= 0) return [legs[i][4] || (legs[i][3] === "h" ? "" : legs[i][3] === "b" ? "the port" : "an island"), legs[i + 1][2], legs[i][3], SEVERE_WORD[legs[i][5]?.k] || "storms"];
  const sh = shipOf(legs);
  if (sh && t >= sh.off && t < sh.ashore) return [sh.sea, sh.ashore, "sail", sh.to];
  // (resting with a friend on the way: a stopover)
  return m.via && m.viaAt <= t && t < m.viaOff ? [m.viaPlace || "", m.viaOff, "v"] : null;
}
// How the map draws it: flying ("up", "cruise", "down"), at sea on a ship, resting (wings folded: an island, a
// shelter, a breather, the port, a stopover), landed or lost
function birdPhase(r) {
  if (r.lost) return "lost";
  const rest = restingOn(r)?.[2];
  return rest === "sail" ? "sail" : rest ? "rest" : flightAt(r).phase;
}
// When a pigeon isn't flying (resting on an island, sheltering, a breather, waiting for and sailing on a ship, a
// stopover with a friend): [from, to] spans. Its speed, and how far along it is, count only the flying.
function stillSpans(m) {
  const legs = m.legs || [], out = [];
  for (let k = 0; k + 1 < legs.length; k++) {
    const a = legs[k], b = legs[k + 1];
    if (a[0] === b[0] && a[1] === b[1] && b[2] > a[2] && a[3] === b[3] && ("ihtb".includes(a[3] || "-") || (!a[3] && m.via))) out.push([a[2], b[2]]);
  }
  const sh = shipOf(legs); if (sh) out.push([sh.off, sh.ashore]);
  return out.sort((x, y) => x[0] - y[0]).reduce((acc, x) => { const l = acc.at(-1); if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else acc.push([...x]); return acc; }, []);
}
// how long it has been still, up to t (all of it, without t)
const stillMs = (m, t = Infinity) => stillSpans(m).reduce((a, [x, y]) => a + Math.max(0, Math.min(y, t) - Math.max(x, m.sentAt)), 0);
// how far along it is by its flying (it doesn't creep on while it sits out a storm), 0 to 1
const flownFrac = (m, t = now()) => Math.min(1, Math.max(0, (t - m.sentAt - stillMs(m, t)) / Math.max(1, m.deliverAt - m.sentAt - stillMs(m))));
// its average speed in the air, km/h (a crossing by ship, or a night sheltering, isn't flying slowly)
const avgKmh = (m) => m.km / (Math.max(1, m.deliverAt - m.sentAt - stillMs(m)) / HOUR);
// How far a flight goes, flown and by ship: "8 mi · 3,560 mi by ship"
function milesOf(km, legs) {
  const sea = shipKm(legs);
  return sea > 50 ? `${fmtMiles(km)} · ${fmtMiles(sea)} by ship` : fmtMiles(km);
}
// how far it goes by ship (km), 0 if it doesn't
function shipKm(legs) {
  const b = (legs || []).filter((l) => l[3] === "b");
  let sea = 0; for (let i = 1; i < b.length - 1; i++) sea += haversineKm(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]);
  return sea;
}
// A voyage by ship (a standard pigeon across an ocean): where it boards, when the ship
// sails, the sea it crosses, where and when it comes ashore; null if it doesn't
function shipOf(legs) {
  const b = (legs || []).filter((l) => l[3] === "b"); if (b.length < 3) return null;
  // (the sea it crosses: the middle of its longest leg, not the strait it sails out by)
  let mid = [b[1][0], b[1][1]], far = -1, last = b.at(-1);
  for (let i = 1; i < b.length - 1; i++) { const d = haversineKm(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1]); if (d > far) { far = d; const w = b[i + 1][1] - b[i][1] > 180 ? -360 : b[i + 1][1] - b[i][1] < -180 ? 360 : 0, lo = (b[i][1] + b[i + 1][1] + w) / 2; mid = [(b[i][0] + b[i + 1][0]) / 2, lo > 180 ? lo - 360 : lo < -180 ? lo + 360 : lo]; } }
  return { from: b[0][4] || "port", board: b[0][2], off: b[1][2], to: last[4] || "port", ashore: last[2], sea: overWhere(mid[1], mid[0]) };
}
// When a ship gets in, as you'd say it: "at 14:00", "tomorrow", "on Thursday", "on 23 Oct"
function onDay(ts) {
  if (sameDay(ts, now())) return `at ${fmtTime(ts)}`;
  if (sameDay(ts, now() + DAY)) return "tomorrow";
  const d = new Date(ts); return ts - now() < 6 * DAY ? `on ${DOW_LONG[d.getDay()]}` : `on ${d.getDate()} ${MON[d.getMonth()]}`;
}
// A voyage on the map: the lane it sails (teal, solid where it has sailed, dotted ahead) and
// its two ports. `stroke(P, i0, i1, up)` draws points i0 to i1 of a track (the globe hides the back).
function drawVoyages(g, tracks, col, lw, stroke) {
  const ports = [];
  for (const { r, rp, P, up } of tracks) {
    const sh = !r.here && !r.lost && shipOf(r.legs); if (!sh) continue;
    const a = rp.findIndex((p) => p.t >= sh.off - 1), b = rp.findIndex((p) => p.t >= sh.ashore - 1); if (a < 0 || b <= a) continue;
    const ft = flightAt(r).t, i = rp.findIndex((p) => p.t >= ft), cut = i < 0 ? b : Math.min(b, Math.max(a, i));
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    g.globalAlpha = 0.9; g.strokeStyle = col("--cell"); g.lineWidth = lw + 3; stroke(P, a, b, up);
    g.globalAlpha = 1; g.strokeStyle = col("--teal");
    if (cut > a) { g.lineWidth = lw; stroke(P, a, cut, up); }
    if (cut < b) { g.lineWidth = lw - 0.5; g.setLineDash([0.5, 7]); stroke(P, cut, b, up); g.setLineDash([]); }
    g.restore();
    // (a port where it takes off or lands already has that end's dot and name)
    const end = (i) => [P[0], P.at(-1)].some((q) => Math.hypot(q[0] - P[i][0], q[1] - P[i][1]) < 12);
    ports.push({ at: P[a], vis: (!up || up[a]) && !end(a), name: sh.from }, { at: P[b], vis: (!up || up[b]) && !end(b), name: sh.to });
  }
  for (const p of ports) {
    if (!p.vis) continue;
    const [x, y] = p.at;
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.strokeStyle = col("--teal"); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.stroke();
  }
  return ports;
}
// its ports' names, where there's room (after the ends have theirs)
function portLabels(g, ports, free, taken, text, col) {
  g.save(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
  for (const p of ports) {
    if (!p.vis || !p.name) continue;
    const [x, y] = p.at, s = `${p.name}`, w = g.measureText(s).width;
    taken.push([x - 8, y - 8, x + 8, y + 8]);
    for (const [lx, ly] of [[x + 11, y], [x - 11 - w, y], [x - w / 2, y - 20], [x - w / 2, y + 20]]) {
      const box = [lx - 3, ly - 9, lx + w + 3, ly + 9]; if (!free(box)) continue;
      taken.push(box); text(s, lx, ly, col("--teal-t")); break;
    }
  }
  g.restore();
}
// The way a pigeon would go if it left now (How It Flies), from the server's
// planner: { key, at, data } for one friend (every kind of pigeon, each way), kept 10 minutes.
// Asked for one kind, it answers with that kind's ways as data.plans.
const PLAN_KEEP = 10 * MIN;
// In a hurry (How It Flies → By Sea): a standard pigeon flies an ocean itself rather than take a ship, for this chat
const noShipOn = () => !!S.chat && S.noShip === S.chat;
// a kind's plans, each way: by ship where it would take one, unless it's flying it all
const kindPlans = (d, k) => (noShipOn() && d?.noShip?.[k]) || d?.kinds?.[k];
function routePlanFor(chat, kind) {
  const bd = birdFor(), key = chat + ":" + (bd?.id || ""), p = S.routePlan;     // (who'd carry it: a named pigeon stops for breathers)
  const view = (d) => (d ? { ...d, pigeon: d.kinds?.[kind] ? kind : d.pigeon, plans: kindPlans(d, kind) || d.plans } : null);
  if (p?.key === key && (p.loading || now() - p.at < PLAN_KEEP)) return view(p.data);
  S.routePlan = { key, at: now(), loading: true, data: p?.key === key ? p.data : null };
  api(`route-plan?with=${encodeURIComponent(chat)}&pigeon=${encodeURIComponent(KIND[kind] ? kind : "standard")}${bd ? `&bird=${encodeURIComponent(bd.id)}` : ""}`).then((d) => {
    if (S.routePlan?.key !== key) return;
    S.routePlan = { key, at: now(), data: d.plans ? d : null };
    if (S.sheet?.type === "flysheet") renderSheet();
    if (S.chat === chat) renderCompose();
  }).catch(() => { if (S.routePlan?.key === key) S.routePlan = { key, at: now() - PLAN_KEEP + MIN, data: null }; });
  return view(S.routePlan.data);
}
// How long a pigeon of this kind would take, the way it would really go (the
// planner's, with its rests and the weather, once it has answered), else at its calm pace
function plannedMs(c, k) {
  const d = !c.g && !c.via && !c.sched && S.routePlan?.key === c.f?.id + ":" + (birdFor()?.id || "") ? S.routePlan.data : null, p = kindPlans(d, k)?.[routeStyle()];
  return p ? Math.max(0, p.deliverAt - d.at) : etaMs(c, k);
}
// The way in a few words: "through the Simplon Pass · around storms over France"
// What a way went around, or sheltered from: storms, or hail, or icy weather (the
// planner and the live turns note it on the leg when it wasn't thunderstorms)
const SEVERE_WORD = { storms: "storms", hail: "hail", icing: "icy weather", ash: "volcanic ash", smoke: "wildfire smoke" };
// its icon: a volcano for ash, a fire for smoke, else a storm cloud
const severeIcon = (k) => (k === "ash" ? I.volcano : k === "smoke" ? I.fire : I.storm);
const severeKOf = (legs, tag = "s") => (legs || []).find((l) => l[3] === tag && l[5]?.k)?.[5]?.k || null;
const severeOf = (legs, tag = "s") => SEVERE_WORD[(legs || []).find((l) => l[3] === tag && l[5]?.k)?.[5]?.k] || "storms";
function wayWords(legs) {
  const said = [], sw = severeOf(legs);
  for (const l of legs || []) {
    const n = l[4], say = { s: `around ${sw}${n ? ` over ${n}` : ""}`, w: "riding the wind", i: `resting on ${n || "an island"}`, v: `past ${n || "a landmark"}`,
      o: `along the coast${n ? ` of ${n}` : ""}`, m: `over ${n || "the mountains"}`, b: n ? `by ship from ${n}` : "",
      p: `through ${!n ? "a pass" : /^a |^[A-Z][\w’']*['’]s /.test(n) ? n : `the ${n}`}` }[l[3]];
    if (say && !said.includes(say)) said.push(say);
  }
  return said.length ? said.slice(0, 3).join(" · ") : "the straight way";
}
function routeNote(m) {
  const legs = (m.legs || []).filter((l) => l[3] && l[3] !== "c" && l[3] !== "f"); if (!legs.length || m.lost) return null;
  const t = m.lost ? m.lostAt : now(), landed = t >= m.deliverAt;
  const rest = restingOn(m, t);
  if (rest) return rest[2] === "h" ? { icon: I.storm, text: `Sheltering${rest[0] ? ` ${rest[0]}` : ` from ${rest[3]}`} until about ${fmtTime(rest[1])}` }
    : rest[2] === "b" ? { icon: I.ship, text: `Waiting for a ship at ${rest[0]}: it sails ${sameDay(rest[1], now()) ? `at ${fmtTime(rest[1])}` : fmtShort(rest[1])}${shipOf(legs) ? `, in ${shipOf(legs).to} ${onDay(shipOf(legs).ashore)}` : ""}` }
    : rest[2] === "sail" ? { icon: I.ship, text: `At sea across ${rest[0]}: the ship gets in to ${rest[3]} ${onDay(rest[1])}` }
    : rest[2] === "t" ? { icon: I.bird, text: `Catching its breath ${rest[0] || "on the way"} until ${fmtTime(rest[1])}` }
    : { icon: I.bird, text: `Resting on ${rest[0]} until ${fmtTime(rest[1])}` };
  const next = legs.find((l) => l[2] > t), last = [...legs].reverse().find((l) => l[2] <= t), l = landed ? legs.at(-1) : next || last;
  const ahead = !landed && l === next, name = l[4], over = name ? ` over ${name}` : "";
  const turned = ahead && last?.[3] === "r";                     // it changed course for the weather on the way (live)
  const sw = turned ? SEVERE_WORD[last[5]?.k] || "storms" : severeOf(legs), hw = SEVERE_WORD[l[5]?.k] || "storms";
  const say = {
    s: [I.storm, turned ? `Rerouted around ${sw}${over}` : ahead ? `Going around ${sw}${over}` : `Went around ${sw}${over}`],
    w: [I.wind, turned ? "Rerouted to ride the wind" : ahead ? "Riding the wind: a longer way, but quicker" : "Rode the wind: a longer way, but quicker"],
    h: [I.storm, ahead ? `Sheltering from ${hw}${name ? ` ${name}` : ""} on the way` : `Sheltered from ${hw}${name ? ` ${name}` : ""}`],
    r: [name === "s" ? I.storm : I.wind, name === "s" ? `Rerouted to keep clear of ${hw}` : "Rerouted to ride the wind"],
    i: [I.bird, ahead ? `Resting on ${name || "an island"} on the way` : `Rested on ${name || "an island"}`],
    t: [I.bird, ahead ? `A breather ${name || "on the way"} coming up` : `Caught its breath ${name || "on the way"}`],
    p: [I.map, `${ahead ? "Through" : "Came through"} ${!name ? "the pass" : /^a |^[A-Z][\w’']*['’]s /.test(name) ? name : `the ${name}`}`],
    v: [I.loc, ahead ? `The scenic way, past ${name || "a landmark"}` : `Came the scenic way, past ${name || "a landmark"}`],
    o: [I.waves, ahead ? `Following the coast${name ? ` of ${name}` : ""}` : `Followed the coast${name ? ` of ${name}` : ""}`],
    m: [I.map, ahead ? `Flying over ${name || "the mountains"}` : `Flew over ${name || "the mountains"}`],
    b: [I.ship, (() => { const sh = shipOf(legs); return !sh ? (ahead ? "A voyage by ship ahead" : "Came by ship") : ahead ? `By ship from ${sh.from}: in ${sh.to} ${onDay(sh.ashore)}` : `Came by ship from ${sh.from} to ${sh.to}`; })()],
  }[l[3]];
  return say ? { icon: say[0], text: say[1] } : null;
}
function routePts(m) {
  const stops = [[m.route[0], m.route[1], m.sentAt], ...(m.legs || []), [m.route[2], m.route[3], m.deliverAt]];
  const pts = []; let prev = null;
  for (let i = 0; i < stops.length - 1; i++) {
    const [aLat, aLon, aT] = stops[i], [bLat, bLon, bT] = stops[i + 1], n = stops.length === 2 ? 96 : 48;
    for (let j = i ? 1 : 0; j <= n; j++) {
      const p = gcPoint({ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon }, j / n);
      if (prev != null) { while (p.lon - prev > 180) p.lon -= 360; while (p.lon - prev < -180) p.lon += 360; }   // never jump the date line
      prev = p.lon; pts.push({ x: p.lon, y: mercY(p.lat), t: aT + (bT - aT) * j / n });
    }
    if (i < stops.length - 2) pts[pts.length - 1].turn = !stops[i + 1][3];     // (only where it turned for someone moving: planned bends, rests and cheers aren't turns)
  }
  return pts;
}
// Pigeons ease in and out: they launch hard and settle into their cruise, then
// glide down to land. Each ramp lasts up to a minute (15% of a very short
// flight); the pigeon cruises a touch faster in between, so it still lands
// exactly on time. Returns how far along it is (0-1), its speed now, the phase,
// and the "flight clock" time for that distance (route points are timed at an
// even pace).
const RAMP_MS = MIN;
function flightAt(m, t = now()) {
  const dur = Math.max(1, m.deliverAt - m.sentAt), u = Math.min(1, Math.max(0, (t - m.sentAt) / dur));
  const r = Math.min(0.15, RAMP_MS / dur), top = 1 / (1 - 2 * r * (1 - 2 / Math.PI));
  const q = Math.PI / (2 * r);                                   // pace in a ramp: sin(q·x), 0 → 1
  const ramp = (x) => (top / q) * (1 - Math.cos(q * x));         // distance covered x into a ramp
  const frac = u < r ? ramp(u) : u > 1 - r ? 1 - ramp(1 - u) : ramp(r) + top * (u - r);
  const pace = u <= 0 || u >= 1 ? 0 : u < r ? Math.sin(q * u) : u > 1 - r ? Math.sin(q * (1 - u)) : 1;
  return { frac, kmh: (m.km / (Math.max(1, dur - stillMs(m)) / HOUR)) * top * pace, phase: u >= 1 ? "landed" : u < r ? "up" : u > 1 - r ? "down" : "cruise", t: m.sentAt + frac * dur };
}
// Where the pigeon is (at flight-clock time t) along those points, and which way it's heading.
function pigeonOn(P, pts, t = now()) {
  const i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) { const a = P[Math.max(0, P.length - 2)], b = P[P.length - 1]; return { at: P[i < 0 ? P.length - 1 : 0], dx: P[P.length - 1][0] - P[0][0], dy: i < 0 ? 0 : b[1] - a[1] }; }
  const f = (t - pts[i - 1].t) / Math.max(1, pts[i].t - pts[i - 1].t);
  return { at: [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f], dx: P[i][0] - P[i - 1][0], dy: P[i][1] - P[i - 1][1] };
}
// The routes a map shows: one, or for your message to a group, one per member
// whose location you can see (friends; others' routes stay off the map).
const routesOf = (m) => m.skies ? m.skies : m.flock ? m.flock.filter((r) => r.route).map((r) => ({ ...r, sentAt: m.sentAt, pigeon: m.pigeon, risky: m.risky, fromPlace: m.fromPlace })) : [m];
// Where the map sits: every route in view, unless the person has moved it.
function mapFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30), sy0 = 20 + usableH / 2;
  const pts = [...routesOf(m), ...(m.alts || [])].flatMap(routePts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const fit = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    k: Math.min(W / Math.max(8, (Math.max(...xs) - Math.min(...xs)) * 1.5), usableH / Math.max(6, (Math.max(...ys) - Math.min(...ys)) * 1.6 + 8)),
  };
  return { W, H, sy0, pts, fit, view: S.sheet?.view || fit, kMin: Math.max(W / 360, H / (2 * mercY(MERC_MAX))) };
}
// The Way: the other ways it could go (m.alts), faint and dotted, each named
// where it's furthest from the chosen way ("Scenic · 10:45"); tap a name for that
// way. Returns where the names are, for the taps. xy: a route point → [x, y, seen]
function drawAlts(g, m, xy, W, H) {
  if (!m.alts?.length) return [];                                     // (only The Way has them; a group's map has no one route)
  const hits = [], main = routePts(m).map(xy), apart = (P, Q) => Math.max(...P.map(([x, y]) => Math.min(...Q.map(([u, v]) => Math.hypot(u - x, v - y)))));
  g.save(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.lineCap = "round"; g.lineJoin = "round";
  // (two ways that go the same way are one line, named for both: "Fastest & Safe")
  const ways = [];
  for (const a of m.alts || []) {
    const P = routePts(a).map(xy), same = ways.find((w) => apart(w.P, P) < 6);
    if (same) same.a = { ...same.a, name: `${same.a.name} & ${a.name}` }; else ways.push({ a, P });
  }
  for (const { a, P } of ways) {
    // (the same way as the chosen one, near enough: nothing to show)
    const off = P.map(([x, y]) => Math.min(...main.map(([u, v]) => Math.hypot(u - x, v - y))));
    if (Math.max(...off) < 6) continue;
    g.globalAlpha = 0.5; g.strokeStyle = cssVar(g.canvas, "--label-2"); g.lineWidth = 2.5; g.setLineDash([2, 7]);
    g.beginPath(); let on = false; for (const [x, y, seen] of P) { if (seen === false) { on = false; continue; } on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; } g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    const i = off.indexOf(Math.max(...off)), [x, y, seen] = P[i]; if (seen === false || x < 0 || x > W || y < 0 || y > H) continue;
    const label = `${a.name} · ${atShort(a.deliverAt)}`, w = g.measureText(label).width + 16, h = 22, bx = Math.max(4, Math.min(W - w - 4, x - w / 2)), by = Math.max(4, Math.min(H - h - 4, y - h / 2));
    g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 6; g.shadowOffsetY = 1;
    g.fillStyle = cssVar(g.canvas, "--cell"); g.beginPath(); g.roundRect(bx, by, w, h, 11); g.fill();
    g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = cssVar(g.canvas, "--sep"); g.lineWidth = 1; g.stroke();
    g.fillStyle = cssVar(g.canvas, "--label-2"); g.textBaseline = "middle"; g.fillText(label, bx + 8, by + h / 2 + 0.5);
    hits.push({ style: a.style, x0: bx - 8, y0: by - 8, x1: bx + w + 8, y1: by + h + 8 });
  }
  g.restore();
  return hits;
}
function drawMap(cv, m, cardH) {
  cv._m = m; cv._cardH = cardH;
  // a map just opened: its first picture (a long moment's drawing on a phone) waits until the sheet has started up,
  // then fades in (over the sea's colour meanwhile: styles.css), so the sheet never stands still at the bottom
  if (!cv._shown && cv.classList.contains("map")) {
    cv._shown = 1;
    requestAnimationFrame(() => setTimeout(() => {
      if (!cv.isConnected || S.sheet?.type !== "map") return;
      drawMap(cv, cv._m, cv._cardH);
      if (!STILL.matches) cv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });
    }, 0));
    return;
  }
  if (mapMoving() && cv._base) return fastFrame(cv);        // fingers on it: the quick version; the full one follows
  $(".mapctl [data-act=mapglobe]", $layer)?.setAttribute("aria-pressed", String(globeOn(m)));
  if (globeOn(m)) return drawGlobe(cv, m, cardH);
  if (cv._wasFast) { cv._wasFast = false; mapFadeFrom(cv); }   // (after the quick pictures as it moved: the sharp one, names and all, fades in)
  const { W, H, sy0, pts, view } = mapFrame(cv, m, cardH); if (!W || !H) return;
  const { cx, cy, k } = view;
  const dpr = cv._dprFix || window.devicePixelRatio || 1; cv._dpr = dpr;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n);
  const ox = W / 2 - cx * k, oy = sy0 + cy * k;
  const X = (x) => ox + x * k, Y = (y) => oy - y * k;
  const vx0 = cx - W / 2 / k, vx1 = cx + W / 2 / k, vy0 = cy - (H - sy0) / k, vy1 = cy + sy0 / k;
  g.fillStyle = col("--sea"); g.fillRect(0, 0, W, H);
  // graticule, spaced so lines stay roughly 60px or more apart
  const step = [1, 2, 5, 10, 15, 30].find((s) => s * k >= 60) || 30;
  g.strokeStyle = col("--grid"); g.lineWidth = 1; g.beginPath();
  for (let lon = Math.ceil(vx0 / step) * step; lon <= vx1; lon += step) { const x = Math.round(X(lon)) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
  for (let lat = -80; lat <= 80; lat += step) { const y = Y(mercY(lat)); if (y >= 0 && y <= H) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); } }
  g.stroke();
  // coastlines: the finest data that's loaded and worth drawing at this zoom
  const want = k < 5 ? "110m" : k < 40 ? "50m" : "10m";
  let data = world(want);
  if (!data && want === "10m") data = world("50m");
  if (!data) data = world("110m");
  // trace shapes in view; points are clamped to a box just off screen and
  // ones under a pixel apart skipped, so even the 10m coast draws fast
  const M = 40, offs = [];
  for (let o = Math.floor((vx0 + 180) / 360) * 360; o <= vx1 + 180; o += 360) offs.push(o);
  const trace = (list, close) => {
    for (const o of offs) for (const { f, box } of list) {
      if (box[2] + o < vx0 || box[0] + o > vx1 || box[3] < vy0 || box[1] > vy1) continue;
      let lx = 1e9, ly = 1e9;
      for (let i = 0, n = f.length; i < n; i += 2) {
        const sx = Math.max(-M, Math.min(W + M, ox + (f[i] + o) * k)), sy = Math.max(-M, Math.min(H + M, oy - f[i + 1] * k));
        if (i === 0) g.moveTo(sx, sy);
        else if (Math.abs(sx - lx) + Math.abs(sy - ly) >= 0.75 || i === n - 2) g.lineTo(sx, sy); else continue;
        lx = sx; ly = sy;
      }
      if (close) g.closePath();
    }
  };
  g.beginPath(); trace(data.land, true);
  // shallow water along every coast, then the land, then the mountains on it (lit from the north-west)
  g.save(); g.lineJoin = "round"; g.strokeStyle = col("--shelf");
  for (const [w, a] of [[Math.min(16, 3 + k * 0.9), 0.5], [Math.min(8, 2 + k * 0.45), 1]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); }
  g.restore();
  g.fillStyle = col("--land"); g.fill("evenodd");
  g.save(); g.clip("evenodd"); drawRelief(g, offs.map((o) => (lon, lat) => [X(lon + o), Y(mercY(lat))]), k, col("--relief-hi"), col("--relief-lo")); g.restore();
  g.strokeStyle = col("--land-edge"); g.lineWidth = k > 40 ? 1.1 : 0.8; g.stroke();
  if (data.borders.length && k >= 2.5) {
    g.beginPath(); trace(data.borders, false);
    g.strokeStyle = col("--border"); g.lineWidth = k > 40 ? 1.2 : 0.8; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
  }
  const suns = drawNight(g, W, H, ox, oy, k);
  // the other ways it could go (on The Way), faint, each with its name; then the routes
  // (a message to a group has one per member), their ends, and each pigeon
  cv._altHits = drawAlts(g, m, (p) => [X(p.x), Y(p.y), true], W, H);
  const tracks = routesOf(m).map((r) => { const rp = routePts(r); return { r, rp, P: rp.map((p) => [X(p.x), Y(p.y)]) }; });
  // the trail: solid where it has flown, dashed (and fainter) where it has still to go
  const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const lw = tracks.length > 1 ? 3 : 3.5, tint = col("--tint");
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = tint;
  for (const { r, rp, P } of tracks) {
    if (r.here) continue;
    const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft);
    const at = pigeonOn(P, rp, ft).at, flown = i < 0 ? P : i === 0 ? [P[0]] : [...P.slice(0, i), at], ahead = i < 0 ? [] : [at, ...P.slice(i)];
    if (ahead.length > 1) { g.globalAlpha = r.lost ? 0.3 : 0.6; g.lineWidth = lw - 0.5; g.setLineDash([9, 8]); line(ahead); }
    g.globalAlpha = 1; g.setLineDash([]);
    if (flown.length > 1) { g.lineWidth = lw + 1.5; g.strokeStyle = col("--cell"); line(flown); g.lineWidth = lw; g.strokeStyle = tint; line(flown); }   // a light edge so it reads on land and sea
  }
  g.globalAlpha = 1; g.setLineDash([]);
  const ports = drawVoyages(g, tracks, col, lw, (P, a, b) => line(P.slice(a, b + 1)));
  // the weather on the way: the way it was going before it turned for the weather, faint;
  // and where it sheltered from storms
  const nearT = (rp, t) => rp.reduce((a, p, i) => (Math.abs(p.t - t) < Math.abs(rp[a].t - t) ? i : a), 0);
  for (const { r, rp, P } of tracks) for (const [k, l] of (r.legs || []).entries()) {
    if (l[3] === "r" && l[5]?.was?.length) {
      const i = nearT(rp, l[2]), pts = [P[i]]; let prev = rp[i].x, a = { lat: l[0], lon: l[1] };
      for (const [lat, lon] of l[5].was) {
        for (let j = 1; j <= 16; j++) { const q = gcPoint(a, { lat, lon }, j / 16); while (q.lon - prev > 180) q.lon -= 360; while (q.lon - prev < -180) q.lon += 360; prev = q.lon; pts.push([X(q.lon), Y(mercY(q.lat))]); }
        a = { lat, lon };
      }
      g.save(); g.globalAlpha = 0.55; g.strokeStyle = col("--label-3"); g.lineWidth = 2; g.setLineDash([3, 6]); line(pts); g.restore();
    }
    if (l[3] === "h" && r.legs[k + 1]?.[3] === "h" && (k === 0 || r.legs[k - 1][3] !== "h" || r.legs[k - 1][0] !== l[0])) {
      const [x, y] = P[nearT(rp, l[2])];
      g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
      g.strokeStyle = col("--orange"); g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke();
    }
  }
  g.strokeStyle = tint;
  for (const { rp, P } of tracks) rp.forEach((p, i) => { if (p.turn) { g.fillStyle = col("--cell"); g.beginPath(); g.arc(P[i][0], P[i][1], 5, 0, 7); g.fill(); g.fillStyle = col("--tint"); g.beginPath(); g.arc(P[i][0], P[i][1], 2.5, 0, 7); g.fill(); } });   // where it turned
  for (const { r, rp } of tracks) for (const n of r.near || []) {        // where it passed another pigeon
    const near = rp.reduce((a, p) => (Math.abs(p.t - n.at) < Math.abs(a.t - n.at) ? p : a), rp[0]);
    let lon = n.lon; while (lon - near.x > 180) lon -= 360; while (lon - near.x < -180) lon += 360;
    sparkAt(g, X(lon), Y(mercY(n.lat)), col("--cell"), col("--orange"));
  }
  const birds = tracks.filter(({ r }) => !r.here).map(({ r, rp, P }) => ({ r, rp, P, ...pigeonOn(P, rp, flightAt(r, r.lost ? r.lostAt : now()).t) }));
  // labels claim space in priority order; anything that would overlap is left out
  const taken = [...birds.map(({ at: [px, py] }) => [px - 24, py - 20, px + 24, py + 20]), [0, H - cardH, W, H], ...suns];
  const ctlEl = $(".mapctl", $layer);
  if (ctlEl) { const r = ctlEl.getBoundingClientRect(), c = cv.getBoundingClientRect(); taken.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]); }
  const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= H - 2 && !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round";
  const text = (s, x, y, color) => { g.lineWidth = 4; g.strokeStyle = col("--land"); g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y); };
  // each end's label sits above or below its dot, away from the route, far enough out that the pigeon never covers it
  g.font = "600 13px -apple-system, system-ui, sans-serif";
  const end = ([x, y], toward, name) => {
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = col("--tint"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    taken.push([x - 9, y - 9, x + 9, y + 9]);
    if (!name || x < -10 || x > W + 10 || y < -10 || y > H + 10) return;
    const w = g.measureText(name).width, ly = y + (toward[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2));
    taken.push([lx - 3, ly - 10, lx + w + 3, ly + 10]);
    text(name, lx, ly, col("--label"));
  };
  if (m.skies) {
    // every pigeon in the air: each place once, wherever several routes share it
    const done = new Set();
    for (const { r, P } of tracks) for (const [p, toward, name] of [[P[0], P[4], r.fromPlace], [P[P.length - 1], P[P.length - 5], r.toPlace]]) {
      const key = `${Math.round(p[0])},${Math.round(p[1])}`; if (done.has(key)) continue;
      done.add(key); end(p, toward, name);
    }
  } else {
    end(tracks[0].P[0], tracks[0].P[4], m.fromPlace);
    for (const { r, P } of tracks) end(P[P.length - 1], P[P.length - 5], r.toPlace);
  }
  g.font = "600 13px -apple-system, system-ui, sans-serif";
  portLabels(g, ports, free, taken, text, col); cv._ports = ports.filter((p) => p.vis).map((p) => p.name);
  // country names: the biggest first, smaller ones as you zoom in (only where there's room)
  if (k >= 2.2 && k < 60) {
    g.save(); g.font = "600 10px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = col("--label-3");
    const tier = k >= 9 ? 3 : k >= 4.5 ? 2 : 1;
    for (const [name, lat, lon, t] of COUNTRIES) {
      if (t > tier) continue;
      const label = name.toUpperCase().split("").join("\u200a");
      for (const o of offs) {
        const x = X(lon + o), y = Y(mercY(lat)); if (x < -60 || x > W + 60 || y < -20 || y > H + 20) continue;
        const w = g.measureText(label).width, box = [x - w / 2 - 3, y - 7, x + w / 2 + 3, y + 7];
        if (!free(box)) continue;
        taken.push(box); g.fillText(label, x, y);
      }
    }
    g.restore();
  }
  // other cities once there's room to read them
  if (k >= 4) {
    g.font = "500 11px -apple-system, system-ui, sans-serif";
    const c2 = col("--label-2"), skip = new Set([m.fromPlace, ...tracks.flatMap(({ r }) => [r.fromPlace, r.toPlace])]);
    for (const [name, lat, lon] of PLACES) {
      if (skip.has(name)) continue;
      for (const o of offs) {
        const x = X(lon + o), y = Y(mercY(lat)); if (x < -50 || x > W + 50 || y < -20 || y > H + 20) continue;
        const w = g.measureText(name).width, box = [x - 4, y - 8, x + 8 + w, y + 8];
        if (!free(box)) continue;
        taken.push(box);
        g.fillStyle = c2; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill();
        text(name, x + 6, y, c2);
      }
    }
  }
  // keep the map without its pigeons: between full redraws only the pigeons are drawn again (wings flapping)
  const base = cv._base || (cv._base = document.createElement("canvas"));
  if (base.width !== cv.width || base.height !== cv.height) { base.width = cv.width; base.height = cv.height; }
  base.getContext("2d").drawImage(cv, 0, 0);
  cv._birds = birds.map((b) => ({ ...b, phase: birdPhase(b.r), color: b.r.lost ? col("--label-3") : col("--p-" + kindOf(b.r)) }));
  // the wind it met, for the streaks: each route still being flown, measured along its length
  cv._snap = { ox, oy, k, globe: false }; cv._seaCol = col("--sea");
  cv._fwd = (lon, lat) => { const L = lon + 360 * Math.round((cx - lon) / 360); return [X(L), Y(mercY(lat))]; };
  cv._inv = (x, y) => [(x - ox) / k, latOf((oy - y) / k)];
  cv._kArc = (lat) => k / Math.max(0.05, Math.cos(lat * Math.PI / 180));        // pixels per degree of arc here
  cv._viewKey = `f${ox.toFixed(1)},${oy.toFixed(1)},${k.toFixed(5)},${W},${H}`;
  cv._area = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;
  windEnsure(cv);
  cv._winds = windOn() ? [] : tracks.filter(({ r }) => !r.here && !r.lost && r.wind != null && Math.abs(r.wind) >= 3 && now() < r.deliverAt).map(({ r, P }) => {
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, L: cum[cum.length - 1], wind: r.wind, seed: r.deliverAt % 1000 };
  });
  cv._windCol = [col("--green") || "#34c759", col("--orange") || "#ff9500"];
  cv._wx = wxCells(tracks.map(({ r }) => r)); cv._wxText = col("--label-2"); cv._wxHalo = col("--land");
  cv._fullAt = performance.now(); cv._sig = routesSig(m); cv._sigM = m; cv._stale = cv._dirty = false;
  drawBirds(cv, performance.now());
  if (ctlEl) ctlEl.classList.toggle("moved", !!S.sheet?.view && !cv._fitting);
}
// Mountains: each range a soft ridge, a light side to the north-west and a
// shadow to the south-east, built from a few wide translucent strokes.
function drawRelief(g, pts1, k, hi, lo) {
  if (k > 120) return;
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [wd, pts] of RANGES) for (const pt of pts1) {
    const P = pts.map(([lon, lat]) => pt(lon, lat)); if (P.some((p) => !p)) continue;
    const w = wd * k, sh = Math.max(1, w * 0.18);
    const path = (dx, dy) => { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); };
    for (const [c, dx, dy] of [[lo, sh, sh], [hi, -sh, -sh]]) {
      g.strokeStyle = c;
      for (const [f, a] of [[1.5, 0.035], [1, 0.045], [0.6, 0.05]]) { g.globalAlpha = a; g.lineWidth = w * f; path(dx, dy); g.stroke(); }
    }
  }
  g.globalAlpha = 1;
}
// Where the sun is overhead right now (degrees): the usual low-precision
// solar formulas, good to a fraction of a degree.
function sunAt(t = now()) {
  const d = t / DAY - 10957.5, rad = Math.PI / 180;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const eot = ((((q - ra) % 360) + 540) % 360 - 180) * 4 / 60;          // equation of time, hours
  const utc = (t % DAY) / HOUR;
  return { lat: dec / rad, lon: ((((12 - utc - eot) * 15) % 360) + 540) % 360 - 180 };
}
// Night: shade where the sun is down, deepening through twilight (to 12° below
// the horizon). Worked out on a coarse grid and smoothed, so it's cheap.
const NIGHT_STEP = 6;
function drawNight(g, W, H, ox, oy, k) {
  const sun = sunAt(), rad = Math.PI / 180, sd = Math.sin(sun.lat * rad), cd = Math.cos(sun.lat * rad);
  const cw = Math.ceil(W / NIGHT_STEP) + 1, ch = Math.ceil(H / NIGHT_STEP) + 1;
  const off = drawNight.c || (drawNight.c = document.createElement("canvas"));
  if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
  const oc = off.getContext("2d"), img = oc.createImageData(cw, ch), px = img.data;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const [r, gg, b, top] = dark ? [0, 0, 0, 0.42] : [12, 26, 64, 0.26];
  const lats = Array.from({ length: ch }, (_, j) => { const y = (oy - j * NIGHT_STEP) / k; return (2 * Math.atan(Math.exp(y / R2D)) * R2D - 90) * rad; });
  for (let i = 0; i < cw; i++) {
    const cosH = Math.cos(((i * NIGHT_STEP - ox) / k - sun.lon) * rad);
    for (let j = 0; j < ch; j++) {
      const alt = Math.asin(Math.sin(lats[j]) * sd + Math.cos(lats[j]) * cd * cosH) / rad;
      const n = alt >= 0 ? 0 : alt <= -12 ? 1 : (x => x * x * (3 - 2 * x))(-alt / 12);
      const o = (j * cw + i) * 4; px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = Math.round(255 * top * n);
    }
  }
  oc.putImageData(img, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(off, 0, 0, cw * NIGHT_STEP, ch * NIGHT_STEP); g.restore();
  // the sun, where it's overhead (once on each copy of the world in view); its spots, for labels to keep clear of
  const spots = [];
  for (let o = -360; o <= 360; o += 360) {
    const sx = ox + (sun.lon + o) * k, sy = oy - mercY(sun.lat) * k;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    spots.push([sx - 15, sy - 15, sx + 15, sy + 15]);
    g.save(); g.translate(sx, sy);
    const glow = g.createRadialGradient(0, 0, 2, 0, 0, 22); glow.addColorStop(0, "rgba(255,204,0,.55)"); glow.addColorStop(1, "rgba(255,204,0,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
    g.fillStyle = "#ffcc00"; g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#ffb800"; g.lineWidth = 1.6; g.lineCap = "round";
    for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s2 = Math.sin(a * Math.PI / 4); g.beginPath(); g.moveTo(c * 9, s2 * 9); g.lineTo(c * 12.5, s2 * 12.5); g.stroke(); }
    g.restore();
  }
  return spots;
}
/* ---------- when it lands, in your time and your friend's ---------- */
// Date formatters, made once per zone and style (making one is slow: a sheet full of times made hundreds)
const DTF = new Map();
const dtf = (o) => { const k = JSON.stringify(o); let f = DTF.get(k); if (!f) { f = new Intl.DateTimeFormat("en-GB", o); DTF.set(k, f); } return f; };
const MY_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } })();
// "08:12", or "Sat 08:12" when that's not today there
function clockIn(ts, tz) {
  try {
    const f = (t, o) => dtf({ timeZone: tz || undefined, ...o }).format(t), ymd = { year: "numeric", month: "numeric", day: "numeric" };
    const time = f(ts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return f(ts, ymd) === f(now(), ymd) ? time : `${f(ts, { weekday: "short" })} ${time}`;
  } catch (_) { return fmtShort(ts); }
}
// How sure a landing time is: a range around it, wider the further off it is
// and the more the weather has to do with the flight (its wind, the time the
// weather has cost or saved, the storms and wind it's going around), narrowing
// as it gets closer. [earliest, latest] (to 5 minutes), or null once it's within ~10.
// With `sure` (how much the ensemble forecast's members disagree about the
// flight's length, as a share of it), the range is the middle 80% of theirs.
function landRange(at, from, { wind = null, delay = 0, legs = [], sure = null } = {}) {
  const R = Math.max(0, at - now()), H = R / HOUR;
  const wx = Math.min(0.4, Math.abs(Math.log(Math.max(0.4, (80 + (wind || 0)) / 80))) + (delay ? Math.abs(delay) / Math.max(HOUR, at - from) : 0)
    + 0.04 * (legs || []).filter((l) => /^[srhw]$/.test(l[3] || "")).length);
  const spread = Math.min(3 * HOUR, sure != null ? R * 2.56 * sure : R * (0.01 + 0.15 * wx * Math.min(1, H / 48)));
  if (spread < 10 * MIN) return null;
  const five = (x) => Math.round(x / (5 * MIN)) * 5 * MIN;
  return [five(at - spread / 2), five(at + spread / 2)];
}
// "21:10–21:40", "Fri 23:40–Sat 00:30"
const rangeText = ([lo, hi], tz = MY_TZ) => `${clockIn(lo, tz)}–${new Date(lo).toDateString() === new Date(hi).toDateString() ? fmtTime(hi) : clockIn(hi, tz)}`;
// Lands 08:12 Mira's time · 16:12 yours (when your clocks differ)
function landsLine(m) {
  const mine = m.from === S.me.id, other = friend(mine ? m.to : m.from), at = m.deliverAt, you = clockIn(at, MY_TZ);
  const them = other?.tz && other.tz !== MY_TZ ? clockIn(at, other.tz) : null;
  // (in the air, a range when it's not yet sure: "Lands 21:10–21:40")
  const range = m.flying && !m.lost ? landRange(at, m.sentAt, { wind: m.wind, delay: m.delay, legs: m.legs, sure: m.spread }) : null;
  if (range) return `Lands ${rangeText(range)}${them && them !== you ? ` · about ${them} ${esc(first(other.name))}’s time` : ""}`;
  if (!them || them === you) return `Lands ${you}`;
  return mine ? `Lands ${them} ${esc(first(other.name))}’s time · ${you} yours` : `Lands ${you} · ${them} for ${esc(first(other.name))}`;
}

/* ---------- what the weather did to a flight ---------- */
// "Delayed 40m · storms over the Alps", "25m early · tailwind over France"
const WX = { storms: ["storms", "storm"], hail: ["hail", "storm"], icing: ["icy weather", "fog"], heat: ["fierce heat", "sun"], cold: ["bitter cold", "snow"], rain: ["heavy rain", "rain"], snow: ["snow", "snow"], fog: ["fog", "fog"], gales: ["gales", "wind"],
  headwind: ["headwinds", "wind"], tailwind: ["a tailwind", "wind"], ash: ["volcanic ash", "volcano"], smoke: ["wildfire smoke", "fire"], magnetic: ["a magnetic storm", "compass"] };
// a mountain range when it's right over one, else the country or sea
function wxWhere(lon, lat) {
  for (const [wd, pts, name] of RANGES) {
    if (!name) continue;
    for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k <= 4; k++) {
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / 4, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / 4;
      if (haversineKm(lat, lon, y, x) < Math.max(120, wd * 70)) return name;
    }
  }
  return overWhere(lon, lat);
}
// What the weather named should fit what it did: a tailwind only for early, anything else only for late.
// (One that doesn't: a delay from sheltering or going round storms earlier on, then a tailwind ahead.
// The storm it stopped for, or went round, is the reason then.)
function wxCause(m, late) {
  if (m.wx && WX[m.wx.k] && (m.wx.k === "tailwind") === !late) return m.wx;
  if (!late) return null;
  for (const l of [...(m.legs || [])].reverse()) {
    if (l[3] === "h") return { k: (l.find((x) => x && typeof x === "object")?.k) || "storms", lat: l[0], lon: l[1] };
    if (l[3] === "r" && l[4] === "s" && l[5]?.storm) return { k: l[5].k || "storms", lat: l[5].storm[0], lon: l[5].storm[1] };
  }
  return null;
}
function wxSay(m, short) {
  if (!m.delay || m.lost) return null;
  const late = m.delay > 0, cause = wxCause(m, late);
  m = { ...m, wx: cause };
  const w = cause && WX[cause.k], landed = !m.flying || m.deliverAt <= now();
  const when = late ? (landed ? `Landed ${fmtDur(m.delay)} late` : `Delayed ${fmtDur(m.delay)}`) : `${fmtDur(-m.delay)} early`;
  if (short) return late ? `${landed ? `${fmtDur(m.delay)} late` : `delayed ${fmtDur(m.delay)}`}${w ? ` by ${w[0]}` : ""}` : `${fmtDur(-m.delay)} early${w ? ` on ${w[0]}` : ""}`;
  // (a wind met higher or lower than usual: it climbed for a tailwind, or kept low out of a headwind;
  // a rocket climbed all the way to the jet stream)
  const alt = m.wx?.alt, where = w ? wxWhere(m.wx.lon, m.wx.lat) : "";
  const why = !w ? (late ? "bad weather" : "a tailwind")
    : alt >= 5000 && m.wx.k === "tailwind" ? `rode the jet stream over ${where}`
    : alt >= 5000 ? `climbed to the jet stream, above the worst of the ${w[0]} over ${where}`
    : alt && m.wx.k === "tailwind" ? `${alt > 120 ? "climbed" : "flew low"} to catch a tailwind over ${where}`
    : alt && m.wx.k === "headwind" ? `${alt > 120 ? "climbed above" : "kept low under"} the worst of the headwinds over ${where}`
    : `${w[0]} over ${where}`;
  return { text: `${when} · ${why}`, icon: I[w ? w[1] : "wind"], cls: late ? "late" : "early" };
}

/* ---------- where a pigeon is: over which country or sea ---------- */
// on land? (the coarse coastline, even-odd over every ring)
function onLand(lon, lat) {
  const y = mercY(lat), land = world("110m").land;
  let inside = false;
  for (const { f, box } of land) for (const o of [0, 360, -360]) {
    const x = lon + o; if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const xi = f[i], yi = f[i + 1], xj = f[j], yj = f[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
// "France", "the North Atlantic": the nearest country's middle (bigger countries reach further), or the sea it's in
// The country or sea at a point, by the borders: the same grid the server names
// places from (pigeon/placegrid.js), so the card and a push about it agree
function overWhere(lon, lat) {
  return placeAt(lat, ((lon + 540) % 360) - 180);
}
// where the pigeon is now, as [lon, lat]
function pigeonLL(r) {
  const pts = routePts(r), t = flightAt(r, r.lost ? r.lostAt : now()).t, i = pts.findIndex((p) => p.t >= t);
  if (i <= 0) { const p = pts[i < 0 ? pts.length - 1 : 0]; return [p.x, latOf(p.y)]; }
  const a = pts[i - 1], b = pts[i], f = (t - a.t) / Math.max(1, b.t - a.t);
  return [a.x + (b.x - a.x) * f, latOf(a.y + (b.y - a.y) * f)];
}
// Tap the pigeon: what it's doing right now
function birdTip(cv, bird) {
  const tip = $(".birdtip", $layer); if (!tip) return;
  const r = bird.r, f = flightAt(r, r.lost ? r.lostAt : now()), [lon, lat] = pigeonLL(r), left = r.deliverAt - now();
  const who = r.from && r.from !== S.me.id ? `${esc(first(friend(r.from)?.name || member(group(r.gid || S.chat), r.from)?.name || "A friend"))}’s pigeon` : `${KIND[kindOf(r)]?.name || "Your"} pigeon`;
  const rest = !r.lost && restingOn(r), REST = { h: "Sheltering", i: "Resting", t: "Taking a breather", b: "Waiting for a ship", sail: "At sea", v: "On a stopover" };
  const state = r.recalled ? "Called back" : r.lost ? "Lost on the way" : f.phase === "landed" ? `Landed ${fmtShort(r.deliverAt)}` : rest ? REST[rest[2]] || "Resting"
    : `${f.phase === "up" ? "Taking off · " : f.phase === "down" ? "Landing · " : ""}${fmtMph(f.kmh)}`;
  tip.innerHTML = `<b>${pgm(r)}<span>${who}</span></b><span>${state}</span><span>${r.recalled ? "Turned back over" : r.lost ? "Lost" : f.phase === "landed" ? "At" : rest?.[2] === "sail" ? "Crossing" : "Over"} ${esc(overWhere(lon, lat))}</span>${!r.lost && left > 0 ? `<span class="eta"><span data-eta="${esc(r.deliverAt)}">${fmtDur(left)}</span> to go</span>` : ""}`;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight, [x, y] = bird.at;
  tip.style.left = `${Math.max(8, Math.min(cv.clientWidth - w - 8, x - w / 2))}px`; tip.style.top = `${y - h - 26 < 8 ? y + 26 : y - h - 26}px`;
  tip.classList.remove("pop", "out"); void tip.offsetWidth; tip.classList.add("pop");
  clearTimeout(birdTip.t); birdTip.t = setTimeout(() => tipAway(tip), 6000);
}
// a tip on the map goes as a quick fade (styles.css .out), not in one frame
function tipAway(tip) {
  if (!tip || tip.hidden || tip.classList.contains("out")) return;
  if (STILL.matches) { tip.hidden = true; return; }
  tip.classList.remove("pop"); tip.classList.add("out");
  setTimeout(() => { if (tip.classList.contains("out")) { tip.hidden = true; tip.classList.remove("out"); } }, 200);
}

/* ---------- the wind map: the wind everywhere, as drifting trails ---------- */
const windOn = () => { try { return localStorage.getItem("inflight-windmap") !== "0"; } catch (_) { return true; } };
// the wind (km/h east, north) anywhere in the grid, blended from the four points around it
function windAt(gr, lon, lat) {
  const span = (gr.cols - 1) * gr.step;
  let x = (lon - gr.w) / gr.step;
  if (span >= 359.9) x = ((x % (gr.cols - 1)) + (gr.cols - 1)) % (gr.cols - 1);
  else { let l = lon; while (l < gr.w) l += 360; while (l > gr.w + span) l -= 360; x = (l - gr.w) / gr.step; if (x < 0 || x > gr.cols - 1) return null; }
  const y = (lat - gr.s) / gr.step; if (y < 0 || y > gr.rows - 1) return null;
  const i = Math.min(gr.cols - 2, Math.floor(x)), j = Math.min(gr.rows - 2, Math.floor(y)), fx = x - i, fy = y - j, at = (a, jj, ii) => a[jj * gr.cols + ii];
  const mix = (a) => (at(a, j, i) * (1 - fx) + at(a, j, i + 1) * fx) * (1 - fy) + (at(a, j + 1, i) * (1 - fx) + at(a, j + 1, i + 1) * fx) * fy;
  return [mix(gr.u), mix(gr.v)];
}
// What part of the world is showing (sampled across the screen), so the right grid is asked for.
function viewBox(cv) {
  const W = cv.clientWidth, H = cv.clientHeight; let s = 90, n = -90, w = 1e9, e = -1e9, any = false;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 10; j++) {
    const ll = cv._inv((W * i) / 8, (H * j) / 10); if (!ll) continue; any = true;
    s = Math.min(s, ll[1]); n = Math.max(n, ll[1]); w = Math.min(w, ll[0]); e = Math.max(e, ll[0]);
  }
  if (!any) return null;
  // a pole in sight (on the globe), or most of the way round: the whole width of the world
  const pole = (lat) => { const p = cv._fwd(0, lat); return !!p && cv._area(p[0], p[1]); };
  if (pole(89.9) || pole(-89.9) || e - w > 300) { w = Math.min(w, (w + e) / 2 - 180); e = w + 360; if (pole(89.9)) n = 84; if (pole(-89.9)) s = -84; }
  return { s: Math.max(-84, s), n: Math.min(84, n), w, e };
}
let windTimer = 0;
function windEnsure(cv) {
  if (!windOn()) return;                          // (a pigeon's own storm is drawn without it)
  const b = viewBox(cv); if (!b) return;
  const g = S.windGrid, ideal = Math.max(b.n - b.s, b.e - b.w) / 15;
  if (g) {
    const gn = g.s + (g.rows - 1) * g.step, ge = g.w + (g.cols - 1) * g.step, full = ge - g.w >= 359.9;
    const shift = full ? 0 : 360 * Math.round((g.w + ge - b.w - b.e) / 720);
    if (b.s >= g.s && b.n <= gn && (full || (b.w + shift >= g.w && b.e + shift <= ge)) && g.step <= Math.max(0.25, ideal) * 2.6 && (g.step >= ideal / 2.6 || g.step <= 0.25)) return;
  }
  // (a map redrawn every frame, as while a pigeon takes off, mustn't keep putting the ask off)
  const q = `s=${b.s.toFixed(2)}&n=${b.n.toFixed(2)}&w=${b.w.toFixed(2)}&e=${b.e.toFixed(2)}`;
  if (windTimer && S.windWant === q) return;
  S.windWant = q;
  clearTimeout(windTimer);
  windTimer = setTimeout(async () => {
    windTimer = 0;
    if (S.windAsk === q) return;
    S.windAsk = q;
    try { S.windGrid = await api("wind-grid?" + q); const c = $(".map", $layer); if (c) { c._parts = null; smoothMap({ lost: true }); } } catch (_) { /* no wind map this time */ }
    S.windAsk = null;
  }, 300);
}
// Move each speck along the wind and draw its step on the trail layer (which fades a little every frame).
function stepWind(cv, ts) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, gr = S.windGrid;
  const tc = cv._trail || (cv._trail = document.createElement("canvas"));
  if (tc.width !== cv.width || tc.height !== cv.height) { tc.width = cv.width; tc.height = cv.height; cv._trailKey = null; }
  const t = tc.getContext("2d");
  if (cv._trailKey !== cv._viewKey || cv._trailGrid !== gr) { t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, tc.width, tc.height); cv._trailKey = cv._viewKey; cv._trailGrid = gr; cv._parts = null; cv._wts = 0; }
  const still = STILL.matches, dt = still ? 16 : Math.min(50, ts - (cv._wts || ts - 16)); cv._wts = ts;
  if (still && cv._parts) return true;                       // reduced motion: one still frame of short strokes
  const spawn = (p) => {
    for (let tries = 0; tries < 8; tries++) {
      const x = Math.random() * W, y = Math.random() * H; if (!cv._area(x, y)) continue;
      const ll = cv._inv(x, y); if (!ll) continue;
      p.lon = ll[0]; p.lat = ll[1]; p.age = 0; p.max = 110 + Math.random() * 170; return p;
    }
    p.age = 1e9; return p;
  };
  if (!cv._parts) { const n = Math.round(Math.max(500, Math.min(1700, (W * H) / 120))); cv._parts = Array.from({ length: n }, () => { const p = spawn({}); p.age = Math.random() * p.max; return p; }); }
  t.setTransform(1, 0, 0, 1, 0, 0);
  if (!still) { t.globalCompositeOperation = "destination-out"; t.fillStyle = `rgba(0,0,0,${Math.min(0.25, 0.045 * dt / 16)})`; t.fillRect(0, 0, tc.width, tc.height); t.globalCompositeOperation = "source-over"; }
  t.setTransform(dpr, 0, 0, dpr, 0, 0); t.lineCap = "round"; t.lineWidth = 1.1;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const rgb = dark ? "235,244,255" : "24,64,140", buckets = [[], [], [], []];
  for (const p of cv._parts) {
    if (p.age++ > p.max) spawn(p);
    const w = p.age < 1e8 && windAt(gr, p.lon, p.lat); if (!w) { spawn(p); continue; }
    const sp = Math.hypot(w[0], w[1]); if (sp < 0.5) { p.age += 4; continue; }
    const len = (still ? 9 : (0.12 + sp * 0.013) * dt / 16) / cv._kArc(p.lat), cl = Math.max(0.05, Math.cos(p.lat * Math.PI / 180));
    const nlat = p.lat + (w[1] / sp) * len, nlon = p.lon + ((w[0] / sp) * len) / cl;
    const a = cv._fwd(p.lon, p.lat), b = cv._fwd(nlon, nlat);
    if (!a || !b || !cv._area(b[0], b[1]) || Math.abs(b[0] - a[0]) > 40) { spawn(p); continue; }
    buckets[Math.min(3, Math.floor(sp / 15))].push(a[0], a[1], b[0], b[1]);
    p.lon = nlon; p.lat = nlat;
  }
  buckets.forEach((seg, i) => {
    if (!seg.length) return;
    t.strokeStyle = `rgba(${rgb},${[0.22, 0.34, 0.48, 0.62][i]})`; t.beginPath();
    for (let k = 0; k < seg.length; k += 4) { t.moveTo(seg[k], seg[k + 1]); t.lineTo(seg[k + 2], seg[k + 3]); }
    t.stroke();
  });
  return true;
}
// Tap the map: the wind there, which way it blows from and how hard
function windTip(cv, x, y) {
  const tip = $(".windtip", $layer), gr = S.windGrid; if (!tip || !windOn() || !gr) return;
  const ll = cv._inv(x, y), w = ll && windAt(gr, ll[0], ll[1]); if (!w) return;
  const sp = Math.hypot(w[0], w[1]), from = (Math.atan2(w[0], w[1]) * R2D + 540) % 360;
  tip.innerHTML = `<small>${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(from / 45) % 8]}</small><b>${Math.round(sp * 0.621371)}</b><small>mph</small>`;
  tip.style.left = `${x - 34}px`; tip.style.top = `${y - 34}px`; tip.hidden = false; tip.classList.remove("pop", "out"); void tip.offsetWidth; tip.classList.add("pop");
  clearTimeout(windTip.t); windTip.t = setTimeout(() => tipAway(tip), 4000);
}
// Wind: short streaks drifting beside the route, with the pigeon for a
// tailwind (green), against it for a headwind (orange); faster the stronger it blew.
/* ---------- the rain radar ----------
   How hard it's raining, coloured like a weather radar: light blue drizzle,
   blue and purple rain, orange and yellow cloudbursts. The real rain (a coarse
   grid from Open-Meteo, with the wind map) is given a radar's grain by a
   streaky noise that drifts slowly; the storm that held a pigeon up always
   shows, as an intense cell. Worked out at a third of the screen's resolution
   and smoothed up, a few times a second. */
const RAIN_K = { storms: 16, rain: 8, snow: 4 };      // how hard (mm an hour) at the heart of a pigeon's weather
const RAMP = [[0.15, 80, 170, 255, 0], [0.4, 70, 150, 255, 0.42], [1.2, 60, 105, 245, 0.55], [2.6, 112, 78, 232, 0.62], [5, 170, 62, 205, 0.68],
  [8.5, 226, 82, 150, 0.74], [13, 255, 132, 62, 0.8], [20, 255, 206, 58, 0.86], [30, 255, 246, 140, 0.9]];
const RAMP_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const mm = 0.1 * Math.pow(400, i / 255);                // 0.1 to 40 mm an hour, on a log scale
    let j = 0; while (j < RAMP.length - 2 && mm > RAMP[j + 1][0]) j++;
    const [a, b] = [RAMP[j], RAMP[j + 1]], f = Math.max(0, Math.min(1, (Math.log(mm) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0]))));
    for (let c = 0; c < 4; c++) lut[i * 4 + c] = (c < 3 ? a[c + 1] + (b[c + 1] - a[c + 1]) * f : 255 * (a[4] + (b[4] - a[4]) * f));
  }
  return lut;
})();
// value noise: smooth, repeatable, cheap
const nHash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = nHash(xi, yi), b = nHash(xi + 1, yi), c = nHash(xi, yi + 1), d = nHash(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
// streaky radar grain: bands running south-west to north-east, warped so they wander
function rainGrain(lon, lat, t) {
  const u = lon * 0.82 + lat * 0.57, v = -lon * 0.57 + lat * 0.82;          // turned 35°
  let x = u * 1.1 + t * 0.03, y = v * 3.2 - t * 0.012;                        // stretched along the bands
  const wx = vnoise(x * 0.5 + 7.1, y * 0.5) - 0.5, wy = vnoise(x * 0.5, y * 0.5 + 3.3) - 0.5;
  x += wx * 2.2; y += wy * 2.2;
  const fine = vnoise(x, y) * 0.55 + vnoise(x * 2.3 + 1.7, y * 2.3) * 0.3 + vnoise(x * 5.1, y * 5.1 + 9.2) * 0.15;
  // and big bands and gaps, a few hundred kilometres across, so it isn't even all over
  const big = vnoise(u * 0.32 + 5.3 + t * 0.008, v * 0.75 + 1.1);
  return fine * 0.62 + big * 0.58;
}
function gridAt(gr, a, lon, lat) {
  const span = (gr.cols - 1) * gr.step;
  let x = (lon - gr.w) / gr.step;
  if (span >= 359.9) x = ((x % (gr.cols - 1)) + (gr.cols - 1)) % (gr.cols - 1);
  else { let l = lon; while (l < gr.w) l += 360; while (l > gr.w + span) l -= 360; x = (l - gr.w) / gr.step; if (x < 0 || x > gr.cols - 1) return 0; }
  const y = (lat - gr.s) / gr.step; if (y < 0 || y > gr.rows - 1) return 0;
  const i = Math.min(gr.cols - 2, Math.floor(x)), j = Math.min(gr.rows - 2, Math.floor(y)), fx = x - i, fy = y - j, at = (jj, ii) => a[jj * gr.cols + ii];
  return (at(j, i) * (1 - fx) + at(j, i + 1) * fx) * (1 - fy) + (at(j + 1, i) * (1 - fx) + at(j + 1, i + 1) * fx) * fy;
}
const radarCells = (cv) => (cv._wx || []).filter((w) => RAIN_K[w.k]);
function radarWanted(cv) { return radarCells(cv).length > 0 || (windOn() && S.windGrid?.p?.some((v) => v >= 0.2)); }
function drawRadar(g, cv, ts, xf) {
  const want = !!cv._inv && radarWanted(cv);
  if (!want) return;
  const W = cv.clientWidth, H = cv.clientHeight, ST = 3, cw = Math.ceil(W / ST), ch = Math.ceil(H / ST);
  const off = cv._radar || (cv._radar = document.createElement("canvas"));
  const t = STILL.matches ? 0 : ts / 1000;
  // drawn afresh when the view, the rain or (four times a second) the drift changes; while the map moves, the last one moves with it
  const key = `${cv._viewKey}|${S.windGrid?.hour ?? ""}|${(cv._wx || []).length}`;
  if (!xf && (key !== cv._radarKey || (!STILL.matches && ts - (cv._radarAt || 0) > 250))) {
    cv._radarKey = key; cv._radarAt = ts;
    if (off.width !== cw || off.height !== ch) { off.width = cw; off.height = ch; }
    const oc = off.getContext("2d"), img = oc.createImageData(cw, ch), px = img.data, gr = windOn() ? S.windGrid : null, gp = gr?.p;
    const cells = radarCells(cv).map((w) => ({ lat: w.lat, lon: w.lon, peak: RAIN_K[w.k], cl: Math.cos(w.lat * Math.PI / 180) }));
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = i * ST + ST / 2, y = j * ST + ST / 2; if (!cv._area(x, y)) continue;
      const ll = cv._inv(x, y); if (!ll) continue;
      const [lon, lat] = ll;
      let mm = gp ? gridAt(gr, gp, lon, lat) : 0;
      for (const c of cells) {
        // a long cell along the bands, ~300 km by ~120 km
        const dx = (lon - c.lon) * c.cl * 111, dy = (lat - c.lat) * 111, a = dx * 0.82 + dy * 0.57, b = -dx * 0.57 + dy * 0.82;
        mm = Math.max(mm, c.peak * Math.exp(-((a / 150) ** 2 + (b / 60) ** 2)));
      }
      if (mm < 0.12) continue;
      const n = rainGrain(lon, lat, t), v = mm * Math.max(0, n - 0.5) ** 1.25 * 4.2;
      if (v < 0.15) continue;
      const li = Math.max(0, Math.min(255, Math.round(255 * Math.log(v / 0.1) / Math.log(400)))) * 4, o = (j * cw + i) * 4;
      px[o] = RAMP_LUT[li]; px[o + 1] = RAMP_LUT[li + 1]; px[o + 2] = RAMP_LUT[li + 2]; px[o + 3] = RAMP_LUT[li + 3];
    }
    oc.putImageData(img, 0, 0);
  }
  if (!off.width) return;
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  if (xf) g.setTransform(xf.a * (cv._dpr || 1), 0, 0, xf.a * (cv._dpr || 1), xf.bx * (cv._dpr || 1), xf.by * (cv._dpr || 1));
  g.drawImage(off, 0, 0, cw * ST, ch * ST);
  g.restore();
}

// The weather that's holding a pigeon up, drawn where it is: a cloud with rain
// falling, a storm cloud that flashes, drifting snow, banks of fog, or gusts.
const WX_SKY = { storms: ["#596072", 0.7, "Storms"], hail: ["#4f5668", 0.75, "Hail"], icing: ["#d6e2ee", 0.82, "Ice"], rain: ["#8a95a8", 0.6, "Heavy rain"], snow: ["#dfe5ee", 0.85, "Snow"], fog: ["#e4e7ec", 0.78, "Fog"], gales: ["#a9b1bf", 0.5, "Gales"], ash: ["#6e6660", 0.8, "Ash"], smoke: ["#a8978a", 0.62, "Smoke"] };
function wxCells(routes) {
  const held = routes.filter((r) => !r.here && !r.lost && r.wx && WX_SKY[r.wx.k] && r.delay > 0 && now() < r.deliverAt).map((r) => ({ k: r.wx.k, lat: r.wx.lat, lon: r.wx.lon }));
  // and the storms it went around (planned, or turning for them on the way), while it's flying
  const dodged = routes.filter((r) => !r.here && !r.lost && now() < r.deliverAt).flatMap((r) => (r.legs || []).filter((l) => l[5]?.storm).map((l) => ({ k: l[5].k || "storms", lat: l[5].storm[0], lon: l[5].storm[1] })));
  // (one cloud for the same weather: what held it up and what it went around are often the same storms, a little apart)
  return [...held, ...dodged].filter((c, i, a) => a.findIndex((x) => Math.abs(x.lat - c.lat) < 1 && Math.abs(x.lon - c.lon) < 1.4 / Math.max(0.3, Math.cos(c.lat * Math.PI / 180))) === i)
    .map((c) => ({ ...c, seed: (Math.abs(c.lat * 7 + c.lon * 13) % 10) }));
}
function drawWx(g, cv, ts, xf) {
  const t = STILL.matches ? 0 : ts / 1000;
  for (const w of cv._wx || []) {
    let p = cv._fwd?.(w.lon, w.lat); if (!p) continue;
    let R = Math.max(34, Math.min(100, cv._kArc(w.lat) * 1.6));
    if (xf) { p = [xf.a * p[0] + xf.bx, xf.a * p[1] + xf.by]; R *= xf.a; }
    const [x, y] = p, [c, a, label] = WX_SKY[w.k];
    if (x < -2 * R || y < -2 * R || x > cv.clientWidth + 2 * R || y > cv.clientHeight + 2 * R) continue;
    g.save();
    const radar = !!RAIN_K[w.k];                           // (rain, storms and snow are on the radar)
    // what falls from it
    if (radar) { /* the radar draws it */ } else if (w.k === "rain" || w.k === "storms" || w.k === "hail") {
      g.strokeStyle = w.k === "rain" ? "#5b8fd6" : "#4f7fc4"; g.lineWidth = Math.max(1, R / 40); g.lineCap = "round";
      for (let i = 0; i < 16; i++) {
        const ph = ((t * 1.5 + i * 0.381 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.8 + (i / 15) * 1.6 + Math.sin(i * 7.3) * 0.06;
        const xx = x + dx * R * 0.75, yy = y + R * 0.38 + ph * R * 0.8, len = R * 0.15;
        g.globalAlpha = 0.75 * Math.sin(Math.PI * ph);
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx - len * 0.3, yy + len); g.stroke();
      }
    } else if (w.k === "ash" || w.k === "smoke") {
      // ash: grey grit drifting down; smoke: embers rising from the fire beneath it
      const up = w.k === "smoke";
      g.fillStyle = up ? "#ff8a3d" : "#4a4440";
      for (let i = 0; i < 14; i++) {
        const ph = ((t * (up ? 0.45 : 0.25) + i * 0.31 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.8 + (i / 13) * 1.6;
        const xx = x + dx * R * 0.7 + Math.sin(t * 1.1 + i) * R * 0.05, yy = up ? y + R * 1.05 - ph * R * 0.75 : y + R * 0.38 + ph * R * 0.8;
        g.globalAlpha = 0.85 * Math.sin(Math.PI * ph);
        g.beginPath(); g.arc(xx, yy, Math.max(1.2, R / (up ? 30 : 36)), 0, 7); g.fill();
      }
    } else if (w.k === "snow") {
      g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 0.8;
      for (let i = 0; i < 18; i++) {
        const ph = ((t * 0.32 + i * 0.29 + w.seed * 0.1) % 1 + 1) % 1, dx = -0.85 + (i / 17) * 1.7;
        const xx = x + dx * R * 0.75 + Math.sin(t * 1.3 + i) * R * 0.06, yy = y + R * 0.38 + ph * R * 0.8;
        g.globalAlpha = Math.sin(Math.PI * ph);
        g.beginPath(); g.arc(xx, yy, Math.max(1.4, R / 34), 0, 7); g.fill(); g.stroke();
      }
    }
    // the cloud: soft puffs that drift a little
    if (radar) { /* none */ } else if (w.k !== "fog") {
      const flash = (w.k === "storms" || w.k === "hail") && (STILL.matches || ((t + w.seed) % 3.4) < 0.16);
      // one shape (puffs on a flat base), so it reads as a cloud, not a bunch of balls
      const puffs = [[-0.5, 0.02, 0.36], [-0.16, -0.2, 0.48], [0.24, -0.12, 0.42], [0.56, 0.06, 0.3]], shape = new Path2D();
      for (const [i, [px, py, pr]] of puffs.entries()) {
        const cx = x + px * R + Math.sin(t * 0.35 + i * 1.7) * R * 0.03, cy = y + py * R, rr = pr * R;
        shape.moveTo(cx + rr, cy); shape.arc(cx, cy, rr, 0, Math.PI * 2);
      }
      shape.moveTo(x - 0.78 * R, y + 0.05 * R); shape.roundRect ? shape.roundRect(x - 0.84 * R, y - 0.06 * R, 1.68 * R, 0.4 * R, 0.2 * R) : shape.rect(x - 0.84 * R, y - 0.06 * R, 1.68 * R, 0.4 * R);
      const grd = g.createLinearGradient(0, y - 0.7 * R, 0, y + 0.34 * R);
      grd.addColorStop(0, flash ? "#f4f5ff" : "#ffffff"); grd.addColorStop(0.45, flash ? "#d6d9ee" : c); grd.addColorStop(1, flash ? "#b9bdd6" : c);
      g.globalAlpha = a; g.shadowColor = "rgba(0,0,0,.22)"; g.shadowBlur = R * 0.18; g.shadowOffsetY = R * 0.06;
      g.fillStyle = grd; g.fill(shape, "nonzero");
      g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
      if (flash) {                                           // lightning
        g.globalAlpha = 1; g.strokeStyle = "#ffd60a"; g.lineWidth = Math.max(2, R / 22); g.lineJoin = "round"; g.shadowColor = "#ffe680"; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(x + 0.08 * R, y + 0.3 * R); g.lineTo(x - 0.1 * R, y + 0.65 * R); g.lineTo(x + 0.08 * R, y + 0.65 * R); g.lineTo(x - 0.06 * R, y + 1.05 * R); g.stroke();
        g.shadowBlur = 0;
      }
      if (w.k === "gales") {                                // gusts curling past
        g.strokeStyle = "#7d8799"; g.lineWidth = Math.max(1.2, R / 32); g.lineCap = "round";
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 0.5 + i / 3) % 1 + 1) % 1, gx = x - R + ph * 2 * R, gy = y + (i - 1) * R * 0.32 + R * 0.35;
          g.globalAlpha = 0.8 * Math.sin(Math.PI * ph);
          g.beginPath(); g.moveTo(gx - R * 0.35, gy); g.lineTo(gx, gy); g.arc(gx, gy - R * 0.1, R * 0.1, Math.PI / 2, -Math.PI, true); g.stroke();
        }
      }
    } else {                                               // fog: low banks sliding past
      g.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        const bw = R * (1.9 - i * 0.2), bx = x - bw / 2 + Math.sin(t * 0.4 + i * 1.9) * R * 0.25, by = y - R * 0.5 + i * R * 0.3;
        g.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 0.6 + i));
        g.shadowColor = "rgba(0,0,0,.12)"; g.shadowBlur = R * 0.1;
        g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, R * 0.22, R * 0.11) : g.rect(bx, by, bw, R * 0.22); g.fill();
        g.shadowColor = "transparent"; g.shadowBlur = 0;
      }
    }
    // what it is
    if (R >= 30) {
      g.globalAlpha = 1; g.font = "600 11px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      const ly = radar ? y + R * 1.1 : y + R * (w.k === "fog" ? 0.8 : 1.3);
      g.lineWidth = 4; g.strokeStyle = cv._wxHalo || "#fff"; g.strokeText(label, x, ly); g.fillStyle = cv._wxText || "#555"; g.fillText(label, x, ly);
    }
    g.restore();
  }
}
function drawWind(g, cv, ts) {
  for (const { P, cum, L, wind, seed } of cv._winds || []) {
    if (L < 40) continue;
    const v = (18 + Math.min(80, Math.abs(wind)) * 0.9) * Math.sign(wind), gap = 46, n = Math.ceil(L / gap);
    g.save(); g.strokeStyle = cv._windCol[wind > 0 ? 0 : 1]; g.lineCap = "round"; g.lineWidth = 1.6;
    for (const lane of [-11, 11]) for (let k = 0; k < n; k++) {
      const d = ((k * gap + (lane > 0 ? gap / 2 : 0) + seed + (ts / 1000) * v) % L + L) % L;
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), ax = P[i][0] - P[i - 1][0], ay = P[i][1] - P[i - 1][1], len = Math.hypot(ax, ay) || 1;
      const ux = ax / len, uy = ay / len, x = P[i - 1][0] + ax * f - uy * lane, y = P[i - 1][1] + ay * f + ux * lane;
      g.globalAlpha = 0.5 * Math.sin(Math.PI * (d / L)) ** 0.5;        // fading in and out at the ends
      g.beginPath(); g.moveTo(x - ux * 7, y - uy * 7); g.lineTo(x + ux * 7, y + uy * 7); g.stroke();
    }
    g.restore();
  }
}
// The pigeon, with its wing at w (1 up, 0 folded down to its back): the wing's
// points are drawn toward the body line, so it flaps.
const WING = [[12.6, 3.6], [14.4, 3], [15.6, 4], [15.4, 5.8]];
const birdAt = (w) => {
  const y = (v) => (10.4 - (10.4 - v) * w).toFixed(2), [a, b, c, d] = WING;
  return new Path2D(`M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L${a[0]} ${y(a[1])}C${b[0]} ${y(b[1])} ${c[0]} ${y(c[1])} ${d[0]} ${y(d[1])}L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z`);
};
const STILL = matchMedia("(prefers-reduced-motion: reduce)");
let cheerFx = null;                          // { id, at }: a pigeon just cheered on, for its gust on the map
// Draw the pigeons over the saved map: flapping in cruise, faster taking off
// and landing, folded once landed; tilted the way they're heading.
function drawBirds(cv, ts, xf) {
  const g = cv.getContext("2d"), dpr = cv._dpr || window.devicePixelRatio || 1;
  if (!cv._base || !cv._birds) return;
  if (xf) {
    // the last full picture, moved and scaled to where the map is now
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = cv._seaCol || "#000"; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.setTransform(xf.a, 0, 0, xf.a, xf.bx * dpr, xf.by * dpr); g.drawImage(cv._base, 0, 0);
  } else {
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv._base, 0, 0);
    if (windOn() && S.windGrid && !mapMoving() && stepWind(cv, ts)) g.drawImage(cv._trail, 0, 0);     // (the wind waits while the map moves)
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRadar(g, cv, ts, xf);
  drawWx(g, cv, ts, xf);
  if (!xf) drawWind(g, cv, STILL.matches ? 0 : ts);
  const tilts = cv._tilt || (cv._tilt = new Map()), still = STILL.matches;
  for (const { r, at: [px0, py0], dx, dy, phase, color } of cv._birds) {
    const px = xf ? xf.a * px0 + xf.bx : px0, py = xf ? xf.a * py0 + xf.by : py0;
    const flying = phase === "up" || phase === "cruise" || phase === "down", hz = phase === "cruise" ? 2.2 : 5;
    // landing: its wings come up as it touches down, then fold over a third of a second (none of it snaps)
    const since = r.lost ? Infinity : now() - r.deliverAt, flap = 0.62 + 0.38 * Math.sin((ts / 1000) * hz * 2 * Math.PI + (r.deliverAt % 997)), near = Math.min(1, Math.max(0, 1 + since / 350));
    const w = still ? (flying ? 1 : 0.45) : flying ? flap + (1 - flap) * near : phase === "landed" && since < 350 ? 0.45 + 0.55 * (1 - Math.max(0, since) / 350) ** 2 : 0.45;
    const bob = flying && !still ? Math.sin((ts / 1000) * hz * 2 * Math.PI + (r.deliverAt % 997) - 1.2) * 1.2 * (1 - near) : 0;
    // the icon faces left: it turns to the way it's flying, and noses up or down with its course, easing into each
    // (rather than snapping at every point of its route)
    const flip0 = dx > 0 ? -1 : 1, tilt0 = flying ? Math.max(-0.35, Math.min(0.35, Math.atan2(dy, Math.abs(dx) || 1))) * -flip0 : 0;
    const key = `${r.id}|${r.to || ""}`, was = tilts.get(key), k = was && !still ? 1 - Math.exp(-Math.max(0, ts - was.t) / 90) : 1;
    const tilt = was ? was.v + (tilt0 - was.v) * k : tilt0, flip = was ? was.f + (flip0 - was.f) * k : flip0;
    tilts.set(key, { v: tilt, f: flip, t: ts });
    // just landed: a ring spreads from where it came down
    if (phase === "landed" && since >= 0 && since < 900 && !still) {
      const e = 1 - (1 - since / 900) ** 3;
      g.save(); g.globalAlpha = 0.5 * (1 - e); g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 8 + 28 * e, 0, 7); g.stroke(); g.restore();
    }
    // at sea on a ship: the ship under it, rocking a little
    if (phase === "sail") {
      const rock = STILL.matches ? 0 : Math.sin(ts / 700 + (r.deliverAt % 97)) * 0.06;
      g.save(); g.translate(px, py + 13); g.rotate(rock); g.fillStyle = "#3a3f4a"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-17, -4); g.lineTo(17, -4); g.lineTo(12, 5); g.lineTo(-12, 5); g.closePath(); g.stroke(); g.fill();
      g.fillStyle = "#e14b3b"; g.fillRect(-9, -9, 6, 5); g.fillStyle = "#3d9bff"; g.fillRect(-2, -9, 6, 5); g.fillStyle = "#f2b33d"; g.fillRect(5, -9, 6, 5);   // (its containers)
      g.restore();
    }
    g.save(); g.translate(px, py + bob - (phase === "sail" ? 10 : 0)); g.rotate(-tilt); g.scale(1.6 * flip, 1.6); g.translate(-12, -11);
    const bird = birdAt(w);
    g.lineWidth = r.skin && SKINS[r.skin] ? 4 : 3; g.strokeStyle = SKINS[r.skin]?.ring || "#fff"; g.stroke(bird); g.fillStyle = color; g.fill(bird);   // the pigeon in its colour (grey where it was lost)
    g.restore();
    // just cheered on: a gust of tailwind streams past it
    const fx = cheerFx && cheerFx.id === S.sheet?.id ? (ts - cheerFx.at) / 1600 : 1;
    if (flying && fx >= 0 && fx < 1 && !STILL.matches) {
      const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
      g.save(); g.lineCap = "round"; g.lineWidth = 2.5;
      for (let k = -1; k <= 1; k++) {
        const o = ((fx * 3 + (k + 1) * 0.33) % 1), back = 16 + o * 34, side = k * 9;
        g.strokeStyle = `rgba(255,159,10,${(0.85 * (1 - fx) * (1 - o)).toFixed(3)})`;
        g.beginPath(); g.moveTo(px - ux * back - uy * side, py - uy * back + ux * side); g.lineTo(px - ux * (back + 16) - uy * side, py - uy * (back + 16) + ux * side); g.stroke();
      }
      g.restore();
    }
  }
}
// A near miss on the map: a little four-pointed spark
function sparkAt(g, x, y, edge, fill) {
  g.save(); g.translate(x, y);
  const star = (r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
  g.lineJoin = "round"; g.lineWidth = 4; g.strokeStyle = edge; star(9); g.stroke(); g.fillStyle = fill; star(9); g.fill();
  g.restore();
}
/* ---------- the globe: long flights curve round the Earth ---------- */
const GLOBE_KM = 3000;
const globeOn = (m) => S.sheet?.globe ?? Math.max(0, ...routesOf(m).filter((r) => !r.here).map((r) => r.km || 0)) >= GLOBE_KM;
const latOf = (my) => 2 * Math.atan(Math.exp(my / R2D)) * R2D - 90;
// the middle of everything on the map, as a direction from the centre of the Earth
function globeFit(m) {
  let x = 0, y = 0, z = 0;
  for (const r of routesOf(m)) for (const p of routePts(r)) { const a = latOf(p.y) * Math.PI / 180, b = p.x * Math.PI / 180; x += Math.cos(a) * Math.cos(b); y += Math.cos(a) * Math.sin(b); z += Math.sin(a); }
  // looked at from a little below (towards the equator), so a long route arcs over the curve of the Earth
  const lat = Math.atan2(z, Math.hypot(x, y)) * R2D;
  return { lat: lat - Math.sign(lat || 1) * Math.min(24, Math.abs(lat) + 8), lon: Math.atan2(y, x) * R2D, s: 1, mid: lat };
}
function globeFrame(cv, m, cardH) {
  const W = cv.clientWidth, H = cv.clientHeight, usableH = Math.max(80, H - cardH - 30);
  const fit = globeFit(m), v = S.sheet?.gview || fit;
  return { W, H, cx: W / 2, cy: 20 + usableH / 2, R: Math.min(W * 0.48, usableH * 0.47) * v.s, v, fit };
}
function moveGlobe(cv, z, dx, dy) {
  const { R, v, fit } = globeFrame(cv, cv._m, cv._cardH);
  const s2 = Math.max(1, Math.min(10, v.s * z));
  // zooming in leans towards the route itself (the fit looks at it from a little below)
  const lean = z > 1 && s2 > v.s ? 0.6 * (1 - v.s / s2) : 0, dLon = ((fit.lon - v.lon + 540) % 360) - 180;
  S.sheet.gview = { lon: v.lon - (dx / R) * R2D + dLon * lean, lat: Math.max(-80, Math.min(80, v.lat + (dy / R) * R2D + (fit.mid - v.lat) * lean)), s: s2 };
  nudgeMap(cv);
}
function drawGlobe(cv, m, cardH, fast) {
  const { W, H, cx, cy, R, v } = globeFrame(cv, m, cardH); if (!W || !H) return;
  // a little spin as it opens: drawn the quick way while it turns (as it is while dragged), sharp once it stops
  if (cv._spin == null || cv._spin === 0) cv._spin = STILL.matches || S.sheet?.gview ? -1 : performance.now();
  const spun = cv._spin > 0 ? Math.min(1, (performance.now() - cv._spin) / 1100) : 1;
  if (spun < 1 && !cv._dprFix) fast = true;
  // (and the sharp picture after the quick ones, with its night, mountains and names, fades in over them)
  if (fast) cv._wasFast = true; else if (cv._wasFast) { cv._wasFast = false; mapFadeFrom(cv); }
  const dpr = cv._dprFix || (fast ? Math.min(1, window.devicePixelRatio || 1) : window.devicePixelRatio || 1);     // fewer pixels while it turns
  cv._dpr = dpr;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = (n) => cssVar(cv, n), rad = Math.PI / 180;
  let lon0 = v.lon; const lat0 = v.lat;
  if (cv._spin > 0) { lon0 -= 40 * (1 - spun) ** 3; if (spun < 1) requestAnimationFrame(redrawMap); else cv._spin = -1; }
  const s0 = Math.sin(lat0 * rad), c0 = Math.cos(lat0 * rad);
  // orthographic: [x, y, in sight]; out of sight points go to the rim
  const proj = (lon, lat) => {
    const f = lat * rad, d = (lon - lon0) * rad, cf = Math.cos(f), cd = Math.cos(d);
    let x = cf * Math.sin(d), y = c0 * Math.sin(f) - s0 * cf * cd; const up = s0 * Math.sin(f) + c0 * cf * cd >= 0;
    if (!up) { const n = Math.hypot(x, y) || 1; x /= n; y /= n; }
    return [cx + R * x, cy - R * y, up];
  };
  const pt = (lon, lat) => { const p = proj(lon, lat); return p[2] ? p : null; };
  const k = R * rad;                                                   // pixels per degree at the middle
  g.fillStyle = col("--bg") || col("--sea"); g.fillRect(0, 0, W, H);
  // the air around it
  const halo = g.createRadialGradient(cx, cy, R * 0.98, cx, cy, R + 18); halo.addColorStop(0, "rgba(90,160,255,.35)"); halo.addColorStop(1, "rgba(90,160,255,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R + 18, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  g.fillStyle = col("--sea"); g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // graticule
  g.strokeStyle = col("--grid"); g.lineWidth = 1;
  const curve = (pts) => { g.beginPath(); let on = false; for (const [lo, la] of pts) { const p = proj(lo, la); if (!p[2]) { on = false; continue; } on ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); on = true; } g.stroke(); };
  for (let lo = -180; lo < 180; lo += 30) curve(Array.from({ length: 61 }, (_, i) => [lo, -90 + i * 3]));
  for (let la = -60; la <= 60; la += 30) curve(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, la]));
  // land (finer once it's big), with the coast's shallow water, and the mountains
  const want = R > 700 && !fast ? "50m" : "110m", data = world(want) || world("110m");
  g.beginPath();
  for (const sh of data.land) {
    const f = sh.f, lat = sh.lat || (sh.lat = Float32Array.from({ length: f.length / 2 }, (_, i) => latOf(f[i * 2 + 1])));
    let any = false; const P = [];
    for (let i = 0; i < f.length; i += 2) { const p = proj(f[i], lat[i / 2]); if (p[2]) any = true; P.push(p); }
    if (!any) continue;
    let lx = 1e9, ly = 1e9;
    P.forEach(([x, y], i) => { if (i && Math.abs(x - lx) + Math.abs(y - ly) < 0.7 && i < P.length - 1) return; i ? g.lineTo(x, y) : g.moveTo(x, y); lx = x; ly = y; });
    g.closePath();
  }
  if (!fast) {
    g.save(); g.lineJoin = "round"; g.strokeStyle = col("--shelf");
    for (const [w, a] of [[Math.min(16, 3 + k * 0.9), 0.5], [Math.min(8, 2 + k * 0.45), 1]]) { g.globalAlpha = a; g.lineWidth = w; g.stroke(); }
    g.restore();
  }
  g.fillStyle = col("--land"); g.fill("evenodd");
  if (!fast) { g.save(); g.clip("evenodd"); drawRelief(g, [pt], k, col("--relief-hi"), col("--relief-lo")); g.restore(); }
  g.strokeStyle = col("--land-edge"); g.lineWidth = 0.8; g.stroke();
  // night, on the sphere (left out while it's turning)
  const sun = sunAt(), sd = Math.sin(sun.lat * rad), sdc = Math.cos(sun.lat * rad);
  if (!fast) {
  const x0 = Math.floor(cx - R), y0 = Math.floor(cy - R), cw = Math.ceil((2 * R) / NIGHT_STEP) + 1;
  const off = drawGlobe.c || (drawGlobe.c = document.createElement("canvas"));
  if (off.width !== cw || off.height !== cw) { off.width = cw; off.height = cw; }
  const oc = off.getContext("2d"), img = oc.createImageData(cw, cw), px = img.data;
  const dark = mapInk ? mapInk === "dark" : document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const [nr, ng, nb, top] = dark ? [0, 0, 0, 0.42] : [12, 26, 64, 0.26];
  for (let j = 0; j < cw; j++) for (let i = 0; i < cw; i++) {
    const x = (x0 + i * NIGHT_STEP - cx) / R, y = -(y0 + j * NIGHT_STEP - cy) / R, r2 = x * x + y * y; if (r2 > 1.02) continue;
    const z = Math.sqrt(Math.max(0, 1 - r2)), lat = Math.asin(z * s0 + y * c0), lon = lon0 * rad + Math.atan2(x, z * c0 - y * s0);
    const alt = Math.asin(Math.sin(lat) * sd + Math.cos(lat) * sdc * Math.cos(lon - sun.lon * rad)) / rad;
    const n = alt >= 0 ? 0 : alt <= -12 ? 1 : ((q) => q * q * (3 - 2 * q))(-alt / 12), o = (j * cw + i) * 4;
    px[o] = nr; px[o + 1] = ng; px[o + 2] = nb; px[o + 3] = Math.round(255 * top * n);
  }
  oc.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, x0, y0, cw * NIGHT_STEP, cw * NIGHT_STEP);
  }
  // light from the top left, shadow at the rim: it reads as a ball
  const shade = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  shade.addColorStop(0, "rgba(255,255,255,.10)"); shade.addColorStop(0.7, "rgba(255,255,255,0)"); shade.addColorStop(1, "rgba(0,0,0,.18)");
  g.fillStyle = shade; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // the sun where it's overhead
  const sp = pt(sun.lon, sun.lat), suns = [];
  if (sp) {
    suns.push([sp[0] - 15, sp[1] - 15, sp[0] + 15, sp[1] + 15]);
    g.save(); g.translate(sp[0], sp[1]); const gl = g.createRadialGradient(0, 0, 2, 0, 0, 22); gl.addColorStop(0, "rgba(255,204,0,.55)"); gl.addColorStop(1, "rgba(255,204,0,0)");
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.fillStyle = "#ffcc00"; g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = "#ffb800"; g.lineWidth = 1.6; g.lineCap = "round";
    for (let a = 0; a < 8; a++) { const c = Math.cos(a * Math.PI / 4), s2 = Math.sin(a * Math.PI / 4); g.beginPath(); g.moveTo(c * 9, s2 * 9); g.lineTo(c * 12.5, s2 * 12.5); g.stroke(); }
    g.restore();
  }
  // the other ways (on The Way), faint; then the routes: solid where flown, dashed ahead; hidden round the back
  cv._altHits = drawAlts(g, m, (p) => proj(p.x, latOf(p.y)), W, H);
  const tracks = routesOf(m).map((r) => { const rp = routePts(r); const PP = rp.map((p) => proj(p.x, latOf(p.y))); return { r, rp, P: PP.map(([x, y]) => [x, y]), up: PP.map((p) => p[2]) }; });
  const seg = (P, up, a, b) => { g.beginPath(); let on = false; for (let i = a; i <= b; i++) { if (!up[i]) { on = false; continue; } on ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1]); on = true; } g.stroke(); };
  const lw = tracks.length > 1 ? 3 : 3.5, tint = col("--tint");
  g.lineCap = "round"; g.lineJoin = "round";
  for (const { r, rp, P, up } of tracks) {
    if (r.here) continue;
    const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft), cut = i < 0 ? P.length - 1 : Math.max(0, i - 1);
    if (i >= 0) { g.globalAlpha = r.lost ? 0.3 : 0.6; g.strokeStyle = tint; g.lineWidth = lw - 0.5; g.setLineDash([9, 8]); seg(P, up, cut, P.length - 1); }
    g.globalAlpha = 1; g.setLineDash([]);
    if (cut > 0) { g.lineWidth = lw + 1.5; g.strokeStyle = col("--cell"); seg(P, up, 0, cut); g.lineWidth = lw; g.strokeStyle = tint; seg(P, up, 0, cut); }
  }
  g.globalAlpha = 1;
  const ports = drawVoyages(g, tracks, col, lw, (P, a, b, up) => seg(P, up, a, b));
  for (const { r } of tracks) for (const n of r.near || []) { const p = proj(n.lon, n.lat); if (p[2]) sparkAt(g, p[0], p[1], col("--cell"), col("--orange")); }
  g.restore();                                                         // (out of the globe's clip)
  // ends and labels
  const birds = tracks.filter(({ r }) => !r.here).map(({ r, rp, P, up }) => { const ft = flightAt(r, r.lost ? r.lostAt : now()).t, i = rp.findIndex((p) => p.t >= ft); return { r, rp, P, up, vis: up[i < 0 ? up.length - 1 : i], ...pigeonOn(P, rp, ft) }; }).filter((b) => b.vis);
  const taken = [...birds.map(({ at: [px, py] }) => [px - 24, py - 20, px + 24, py + 20]), [0, H - cardH, W, H], ...suns];
  const ctl = $(".mapctl", $layer);
  if (ctl) { const r = ctl.getBoundingClientRect(), c = cv.getBoundingClientRect(); taken.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]); }
  const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= H - 2 && !taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  const text = (str, x, y, color) => { g.lineWidth = 4; g.strokeStyle = col("--land"); g.strokeText(str, x, y); g.fillStyle = color; g.fillText(str, x, y); };
  g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round"; g.font = "600 13px -apple-system, system-ui, sans-serif";
  const done = new Set();
  for (const { r, P, up } of tracks) for (const [i, j, name] of [[0, 4, r.fromPlace ?? m.fromPlace], [P.length - 1, P.length - 5, r.toPlace]]) {
    if (!up[i]) continue;
    const [x, y] = P[i], key = `${Math.round(x)},${Math.round(y)}`; if (done.has(key)) continue; done.add(key);
    g.fillStyle = col("--cell"); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = col("--tint"); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    taken.push([x - 9, y - 9, x + 9, y + 9]);
    if (!name) continue;
    const w = g.measureText(name).width, ly = y + ((P[Math.max(0, j)] || P[i])[1] <= y ? 28 : -28), lx = Math.min(W - 8 - w, Math.max(8, x - w / 2)), box = [lx - 3, ly - 10, lx + w + 3, ly + 10];
    if (!free(box)) continue; taken.push(box); text(name, lx, ly, col("--label"));
  }
  if (!fast) portLabels(g, ports, free, taken, text, col);
  cv._ports = ports.filter((p) => p.vis).map((p) => p.name);
  if (k >= 2.2 && !fast) {
    g.save(); g.font = "600 10px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = col("--label-3");
    const tier = k >= 9 ? 3 : k >= 4.5 ? 2 : 1;
    for (const [name, lat, lon, t] of COUNTRIES) {
      if (t > tier) continue; const p = pt(lon, lat); if (!p) continue;
      const label = name.toUpperCase().split("").join("\u200a"), w = g.measureText(label).width, box = [p[0] - w / 2 - 3, p[1] - 7, p[0] + w / 2 + 3, p[1] + 7];
      if (Math.hypot(p[0] - cx, p[1] - cy) > R * 0.92 || !free(box)) continue; taken.push(box); g.fillText(label, p[0], p[1]);
    }
    g.restore();
  }
  if (k >= 4 && !fast) {
    g.font = "500 11px -apple-system, system-ui, sans-serif"; const c2 = col("--label-2");
    for (const [name, lat, lon] of PLACES) {
      if (done.has(name)) continue; const p = pt(lon, lat); if (!p || Math.hypot(p[0] - cx, p[1] - cy) > R * 0.95) continue;
      const w = g.measureText(name).width, box = [p[0] - 4, p[1] - 8, p[0] + 8 + w, p[1] + 8]; if (!free(box)) continue;
      taken.push(box); g.fillStyle = c2; g.beginPath(); g.arc(p[0], p[1], 2.5, 0, 7); g.fill(); text(name, p[0] + 6, p[1], c2);
    }
  }
  // as the flat map: keep it without its pigeons, then draw them (and the wind) on top
  const base = cv._base || (cv._base = document.createElement("canvas"));
  if (base.width !== cv.width || base.height !== cv.height) { base.width = cv.width; base.height = cv.height; }
  base.getContext("2d").drawImage(cv, 0, 0);
  cv._birds = birds.map((b) => ({ ...b, phase: birdPhase(b.r), color: b.r.lost ? col("--label-3") : col("--p-" + kindOf(b.r)) }));
  cv._snap = { globe: true, lon: lon0, lat: lat0, R }; cv._seaCol = col("--bg") || col("--sea");
  cv._fwd = (lon, lat) => { const p = proj(lon, lat); return p[2] ? [p[0], p[1]] : null; };
  cv._inv = (x, y) => {
    const a = (x - cx) / R, b = -(y - cy) / R, r2 = a * a + b * b; if (r2 > 1) return null;
    const z = Math.sqrt(1 - r2); return [lon0 + Math.atan2(a, z * c0 - b * s0) / rad, Math.asin(z * s0 + b * c0) / rad];
  };
  cv._kArc = () => R * rad;
  cv._viewKey = `g${lon0.toFixed(3)},${lat0.toFixed(3)},${R.toFixed(2)},${W},${H}`;
  cv._area = (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R * 0.995 && x >= 0 && x <= W && y >= 0 && y <= H;
  if (!fast) windEnsure(cv);
  cv._winds = windOn() ? [] : tracks.filter(({ r, up }) => !r.here && !r.lost && r.wind != null && Math.abs(r.wind) >= 3 && now() < r.deliverAt && up.every(Boolean)).map(({ r, P }) => {
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, L: cum[cum.length - 1], wind: r.wind, seed: r.deliverAt % 1000 };
  });
  cv._windCol = [col("--green") || "#34c759", col("--orange") || "#ff9500"];
  cv._wx = wxCells(tracks.map(({ r }) => r)); cv._wxText = col("--label-2"); cv._wxHalo = col("--land");
  if (!fast) { cv._fullAt = performance.now(); cv._sig = routesSig(m); cv._sigM = m; cv._stale = cv._dirty = false; }
  drawBirds(cv, performance.now());
  $(".mapctl", $layer)?.classList.toggle("moved", !!S.sheet?.gview && !cv._fitting);
}
/* ---------- moving the map smoothly ---------- */
let mapMotionUntil = 0, mapSettle = 0, mapFastReq = 0, mapGlide = 0;
const mapMoving = () => performance.now() < mapMotionUntil;
// Something moved it: quick frames now, the full map once it's been still a moment.
function nudgeMap(cv) {
  mapMotionUntil = performance.now() + 140; cv._dirty = true;      // (the picture kept is for where the map was: until it's drawn again, only moved and scaled)
  if (!mapFastReq) mapFastReq = requestAnimationFrame((ts) => { mapFastReq = 0; cv._ffTs = ts; if (S.sheet?.type === "map") fastFrame(cv); });
  clearTimeout(mapSettle);
  mapSettle = setTimeout(function settle() { if (mapMoving()) { mapSettle = setTimeout(settle, 60); return; } redrawMap(); }, 150);
}
function fastFrame(cv) {
  if (!cv._base || !cv._m) return;
  if (globeOn(cv._m)) return drawGlobe(cv, cv._m, cv._cardH, true);
  if (cv._snap?.globe) return redrawMapNow(cv);
  const { W, sy0, view } = mapFrame(cv, cv._m, cv._cardH), ox = W / 2 - view.cx * view.k, oy = sy0 + view.cy * view.k, s0 = cv._snap;
  const a = view.k / s0.k;
  if (a > 3 || a < 0.33) return redrawMapNow(cv);           // too far from the last full picture: draw it again
  cv._wasFast = true; placeBirds(cv, cv._m);
  drawBirds(cv, performance.now(), { a, bx: ox - s0.ox * a, by: oy - s0.oy * a });
}
function redrawMapNow(cv) { const until = mapMotionUntil; mapMotionUntil = 0; cv._wasFast = false; drawMap(cv, cv._m, cv._cardH); mapMotionUntil = until; }
// what the routes on a map are (where, and when along them, from when each set off), to tell whether only its pigeons
// have moved since it was drawn
const routesSig = (m) => routesOf(m).map((r) => `${r.id}|${r.to || ""}|${r.deliverAt - r.sentAt}|${r.lost ? r.lostAt - r.sentAt : ""}|${r.recalled ? 1 : 0}|${r.route}|${(r.legs || []).map((l) => `${l[0]},${l[1]},${l[2] - r.sentAt},${l[3] || ""}`).join(" ")}`).join(";");
// Between full drawings of the map, the pigeons alone move on: each is put where it is now along its route as it was
// drawn (its points kept with it), with no coast, night or names drawn again. false: more than that has changed (a
// route, a take-off, a rest or a landing, one gone round the back of the globe), so the whole map is wanted
// (the pigeons are moved on all the same, for a quick picture meanwhile)
function placeBirds(cv, m) {
  const bs = cv._birds; if (!cv._base || !bs || !m) return false;
  if (m !== cv._sigM) { if (routesSig(m) !== cv._sig) cv._stale = true; else cv._sigM = m; }
  const t = now();
  for (const b of bs) {
    const r = b.r, ft = flightAt(r, r.lost ? r.lostAt : t).t, ph = birdPhase(r);
    if (ph !== b.phase) { b.phase = ph; cv._stale = true; }
    if (b.up) { const i = b.rp.findIndex((p) => p.t >= ft); if (!b.up[i < 0 ? b.up.length - 1 : i]) cv._stale = true; }
    Object.assign(b, pigeonOn(b.P, b.rp, ft));
  }
  return !cv._stale;                                                // (until the whole map's been drawn again)
}
// A map's regular redraw (each second, or each frame while a pigeon visibly moves): just its pigeons while nothing
// else has changed, and the whole map at most every `every` ms (so the line flown keeps up with them)
function mapTick(cv, m, H, every = 5000) {
  if (cv._cardH === H && !cv._dirty && !mapMoving() && performance.now() - (cv._fullAt || 0) < every && placeBirds(cv, m)) { cv._m = m; return drawBirds(cv, performance.now()); }
  drawMap(cv, m, H);
}
// A picture of a canvas as it is now, laid over it (in a closed shadow root, so it's never taken for the canvas itself)
function canvasCopy(cv, cls) {
  const c = Object.assign(document.createElement("canvas"), { width: cv.width, height: cv.height });
  c.getContext("2d").drawImage(cv, 0, 0); Object.assign(c.style, { display: "block", width: "100%", height: "100%" });
  const host = document.createElement("div"); host.className = cls; host.inert = true; host.setAttribute("aria-hidden", "true");
  host.attachShadow({ mode: "closed" }).append(c); cv.after(host);
  return host;
}
// The map as it was, laid over it as a picture that fades away: the globe turning into the flat map (shrinking or
// growing as it goes), or the quick picture drawn while it moved, with the sharp one coming through it
function mapFadeFrom(cv, to) {
  if (STILL.matches || !cv.width || !cv.isConnected || !cv.classList.contains("map")) return;
  for (const x of $layer.querySelectorAll(".mapghost")) x.remove();
  const g = canvasCopy(cv, "mapghost");
  const a = g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: to || "none" }], { duration: to ? 380 : 240, easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" });
  a.onfinish = a.oncancel = () => g.remove();
}
// Glide: run step(e, prev) with e easing 0 → 1 over ms (zoom buttons, double tap, fit, flicks)
function glideMap(step, ms = 300) {
  cancelAnimationFrame(mapGlide);
  if (STILL.matches) { step(1, 0); return; }
  const t0 = performance.now(); let prev = 0;
  const run = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - (1 - p) ** 3; step(e, prev); prev = e; if (p < 1) mapGlide = requestAnimationFrame(run); };
  mapGlide = requestAnimationFrame(run);
}
function zoomMapBy(cv, factor, sx, sy) { const L = Math.log(factor); glideMap((e, prev) => moveMap(cv, Math.exp(L * (e - prev)), sx, sy), 280); }
// Back to the whole route, gliding there. Its button goes as it's tapped (cv._fitting: not back with the drawings on
// the way; a finger or a zoom on the way brings it back), and the glide ends with the sheet it was for.
function fitMap(cv) {
  const sh = S.sheet, go = (set) => { cv._fitting = true; $(".mapctl", $layer)?.classList.remove("moved");
    glideMap((e) => { if (S.sheet !== sh) return; if (e >= 1) cv._fitting = false; set(e); e >= 1 ? redrawMap() : nudgeMap(cv); }, 420); };
  if (globeOn(cv._m)) {
    const { v, fit } = globeFrame(cv, cv._m, cv._cardH); if (!sh.gview) return;
    const dLon = ((fit.lon - v.lon + 540) % 360) - 180;
    return go((e) => { sh.gview = e >= 1 ? null : { lon: v.lon + dLon * e, lat: v.lat + (fit.lat - v.lat) * e, s: Math.exp(Math.log(v.s) + (Math.log(fit.s) - Math.log(v.s)) * e) }; });
  }
  const { view, fit } = mapFrame(cv, cv._m, cv._cardH); if (!sh.view) return;
  go((e) => { sh.view = e >= 1 ? null : { cx: view.cx + (fit.cx - view.cx) * e, cy: view.cy + (fit.cy - view.cy) * e, k: Math.exp(Math.log(view.k) + (Math.log(fit.k) - Math.log(view.k)) * e) }; });
}
let mapFrameReq = 0;
function redrawMap() {
  if (mapFrameReq) return;
  mapFrameReq = requestAnimationFrame(() => { mapFrameReq = 0; const cv = $(".map", $layer); if (cv && cv._m && S.sheet?.type === "map") drawMap(cv, cv._m, cv._cardH); });
}
// Move the map: zoom by `z` about screen point (sx, sy), then pan by (dx, dy) pixels.
function moveMap(cv, z, sx, sy, dx = 0, dy = 0) {
  if (!cv._m || S.sheet?.type !== "map") return;
  cv._fitting = false;
  if (globeOn(cv._m)) return moveGlobe(cv, z, dx, dy);
  const { W, sy0, fit, view, kMin, pts } = mapFrame(cv, cv._m, cv._cardH);
  const k = Math.max(kMin, Math.min(MAP_KMAX, view.k * z));
  const wx = view.cx + (sx - W / 2) / view.k, wy = view.cy - (sy - sy0) / view.k;
  let cx = wx - (sx - W / 2) / k - dx / k, cy = wy + (sy - sy0) / k + dy / k;
  const mid = (pts[0].x + pts[pts.length - 1].x) / 2, ymax = mercY(MERC_MAX) - (sy0 / k) * 0.5;
  cx = Math.max(mid - 300, Math.min(mid + 300, cx));
  cy = Math.max(-ymax, Math.min(ymax, cy));
  S.sheet.view = { cx, cy, k };
  if (Math.abs(k - fit.k) < 1e-6 && Math.abs(cx - fit.cx) < 1e-6 && Math.abs(cy - fit.cy) < 1e-6) S.sheet.view = null;
  nudgeMap(cv);
}
// Drag to pan, pinch or scroll to zoom, double-tap to zoom in.
function mapGestures(cv) {
  const pts = new Map(); let last = null, lastTap = 0, trail = [];
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const state = () => { const a = [...pts.values()]; if (a.length === 1) return { x: a[0][0], y: a[0][1], d: 0 };
    return { x: (a[0][0] + a[1][0]) / 2, y: (a[0][1] + a[1][1]) / 2, d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) }; };
  let down = null;
  // the map moves itself (pointer events): a finger on it never scrolls or zooms the page
  // (iPhone ignores touch-action: none, so say it with the touches themselves)
  cv.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  cv.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(mapGlide); cv._fitting = false;           // a finger stops a glide or a flick
    for (const el of $layer.querySelectorAll(".windtip, .birdtip")) tipAway(el);
    cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, local(e)); last = state(); trail = [];
    down = pts.size === 1 ? { at: performance.now(), p: local(e), moved: 0 } : null;
    if (pts.size === 1) { const t = performance.now(); if (t - lastTap < 280) { const [x, y] = local(e); zoomMapBy(cv, 2, x, y); lastTap = 0; } else lastTap = t; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    // every point the finger passed through since the last frame (smoother on fast drags)
    const evs = e.getCoalescedEvents?.(), r = cv.getBoundingClientRect(), p = evs?.length ? evs[evs.length - 1] : e;
    pts.set(e.pointerId, [p.clientX - r.left, p.clientY - r.top]); const s = state();
    if (last && pts.size <= 2) {
      const z = pts.size === 2 && last.d && s.d ? s.d / last.d : 1;
      moveMap(cv, z, last.x, last.y, s.x - last.x, s.y - last.y);
      if (Math.abs(s.x - last.x) + Math.abs(s.y - last.y) > 6) lastTap = 0;
      if (down) down.moved += Math.abs(s.x - last.x) + Math.abs(s.y - last.y);
      if (pts.size === 1) { const t = e.timeStamp; trail.push([t, s.x, s.y]); while (trail.length > 2 && t - trail[0][0] > 90) trail.shift(); } else trail = [];
    }
    last = s;
  });
  const up = (e) => {
    pts.delete(e.pointerId); last = pts.size ? state() : null;
    if (pts.size) { trail = []; return; }
    // a flick: it carries on, slowing down
    const t = e.timeStamp, [t0, x0, y0] = trail[0] || [], [t1, x1, y1] = trail[trail.length - 1] || [];
    if (trail.length > 1 && t - t1 < 100 && t1 > t0) {
      let vx = (x1 - x0) / (t1 - t0), vy = (y1 - y0) / (t1 - t0);
      if (Math.hypot(vx, vy) > 0.25 && !STILL.matches) {
        let prevT = 0; cancelAnimationFrame(mapGlide);
        const run = (now2) => {
          const dt = prevT ? Math.min(40, Math.max(0, now2 - prevT)) : 16; prevT = now2;
          const f = Math.exp(-dt / 280); vx *= f; vy *= f;
          moveMap(cv, 1, 0, 0, vx * dt, vy * dt);
          if (Math.hypot(vx, vy) > 0.02) mapGlide = requestAnimationFrame(run);
        };
        mapGlide = requestAnimationFrame(run);
      }
    }
    trail = [];
    // a quick tap that didn't move (and isn't the first half of a double tap): the pigeon, or the wind there
    if (down && down.moved < 8 && performance.now() - down.at < 300) {
      const d = down, tap = lastTap;
      // one of the other ways' names (The Way): that way instead
      const alt = (cv._altHits || []).find((h) => d.p[0] >= h.x0 && d.p[0] <= h.x1 && d.p[1] >= h.y0 && d.p[1] <= h.y1);
      if (alt) { $(`.mapcard [data-act=routeset][data-id="${alt.style}"]`, $layer)?.click(); down = null; return; }
      const bird = (cv._birds || []).find((b) => Math.hypot(b.at[0] - d.p[0], b.at[1] - d.p[1]) < 30);
      setTimeout(() => { if (lastTap !== tap || !tap) return; bird ? birdTip(cv, bird) : windTip(cv, d.p[0], d.p[1]); }, 260);
    }
    down = null;
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  // trackpads and mice: pinch (ctrl + wheel) or scroll to zoom, smoothly
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cancelAnimationFrame(mapGlide); const [x, y] = local(e); moveMap(cv, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), x, y); }, { passive: false });
}

/* ============================================================
   Keys and accounts
   ============================================================ */
// This phone's own public key comes from its private key, never from the
// server: safety numbers and "Your Encryption Key" are built from it, so a
// server that showed friends a different key for you couldn't hide it.
async function useKeys(token, me, privJwk) {
  S.token = token; S.me = me;
  S.secretJwk = privJwk;                          // memory only: lets a new passkey lock its own copy
  S.priv = await E2E.importPriv(privJwk);
  S.myPub = { kty: "EC", crv: "P-256", x: privJwk.x, y: privJwk.y };
  S.fp = await E2E.fingerprint(S.myPub);
  S.pairs = new Map(); S.plain = new Map(); S.msgs = new Map();
  S.pins = (await idb.get("pins:" + me.id)) || {};
  await restorePins();
  checkMyKey(me);
  const saved = await idb.set("session", { token, me, priv: S.priv, pub: S.myPub });
  if (saved === null) console.warn("Chat: couldn’t save the session on this phone; you’ll sign in again next time.");
}
async function forget() {
  S.photos.forEach((u) => URL.revokeObjectURL(u));
  S.avatars?.forEach((u) => { if (u) URL.revokeObjectURL(u); });
  clearTimeout(cacheTimer);
  // nothing of this account carries on into the next one: sound, the mic, location, drafts, searches, news
  try { S.player?.pause(); } catch (_) {}
  if (rec) recStop(false);
  stopLocWatch(); airEl = null;
  try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem("inflight-badges"); localStorage.removeItem("inflight-pushsub"); localStorage.removeItem(OPENED_KEY); } catch (_) {}
  openedFor = null;
  if (S.me?.id) { await idb.del("cache:" + S.me.id).catch(() => {}); await idb.del("outbox:" + S.me.id).catch(() => {});
    if (await idb.get("pinsup:" + S.me.id).catch(() => null)) { await idb.del("pins:" + S.me.id).catch(() => {}); await idb.del("pinsup:" + S.me.id).catch(() => {}); } }
  S.outbox = [];
  S.raw = null; S.chatRaw = new Map(); S.skies = null; S.skiesAt = 0; S.fromCache = false; S.started = false; S.synced = false; S.locked = false;
  Object.assign(S, { token: null, me: null, priv: null, secretJwk: null, myPub: null, keyWarned: false, fp: "", sessN: null, friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [],
    msgs: new Map(), plain: new Map(), notes: new Map(), photos: new Map(), photoGone: new Set(), pairs: new Map(), chat: null, sheet: null, drafts: new Map(), gevents: new Map(),
    avatars: new Map(), viewedOnce: new Set(), q: "", fq: "", news: null, newsAt: 0, replyTo: null, sched: null, via: null, pick: null, birdPick: null, player: null,
    syncSig: "", chatSigs: new Map(), syncFails: 0, birds: [], hall: [], feathers: 0, resumable: null });
  clearAttach();
  await idb.del("session");
}
/* ---------- the way in: signing in to the georgefarrowgreen.com account ----------
   Accounts are made, and forgotten passwords reset, on the account's own page (account.inflite.ai), not
   here: an invite or a reset link that comes here is passed on to it. */
// a friend's link (#add=handle): kept for a day, so it's still there after the account is made on its own page
function keepAdd(h) {
  S.pendingAdd = h;
  try { if (h) localStorage.setItem("inflight-add", JSON.stringify({ h, at: Date.now() })); else localStorage.removeItem("inflight-add"); } catch (_) {}
}
function keptAdd() {
  try { const k = JSON.parse(localStorage.getItem("inflight-add") || "null"); if (k && /^[a-z0-9_]{3,20}$/.test(k.h) && Date.now() - k.at < DAY) return k.h; localStorage.removeItem("inflight-add"); } catch (_) {}
  return null;
}
const toAccount = (hash = "") => (accountPage() || "https://account.inflite.ai/") + hash;
// (signing in, making an account and signing out: on the sign-in page beside it, auth.<site>; locally, the account's)
const toAuth = (hash = "") => { const p = accountPage() || "https://account.inflite.ai/"; return (/\.localhost[:/]/.test(p) ? p : p.replace("//account.", "//auth.")) + hash; };
// (InFlite, whose one account signs you in to every app: its mark and name, over Sign in)
const brandLine = `<p class="wbrand ifl-brand"><img src="inflite.svg" alt="" width="22" height="22">Powered by InFlite</p>`;
const newHere = () => `<p class="wnew ifl-new">New here? <a href="${esc(toAuth("#join"))}" data-act="acctjoin">Create your account</a></p>`;
// the sky: one canvas behind the screen, under every screen before you're in
const skyCanvas = () => $(".nightsky", root()) || (root().prepend(Object.assign(document.createElement("canvas"), { className: "nightsky", ariaHidden: "true" })), $(".nightsky", root()));
// Signed in to the account elsewhere on the site, in this browser (functions/_account.js): who, to carry on as (on the
// account's page, showing it's you, as that's what unlocks the key here)
async function resumeCheck() {
  try { const r = await api("resume", { method: "POST", body: {} }); if (r.signedIn && !S.me) { S.resumable = r; if (S.view === "welcome") render(); } } catch (_) {}
}
// (signed in to the account elsewhere on the site, in this browser: carrying on as them; back from signing in, a moment
// while it's taken up)
function welcomeCta() {
  const r = S.resumable;
  if (S.signingIn) return `<div class="wcta ifl-cta">${brandLine}<button class="btn wide wglow ifl-go" disabled>Signing in…</button></div>`;
  if (r) return `<div class="wcta ifl-cta">${brandLine}<button class="btn wide wglow ifl-go" data-act="acctsignin">Continue as ${esc(first(r.name))}</button></div>`;
  return `<div class="wcta ifl-cta">${brandLine}<button class="btn wide wglow ifl-go" data-act="acctsignin">Sign in</button>${newHere()}</div>`;
}
// Signing in is on the account's own page (account.<site>), where every app on the site signs in: there with a word for
// the sign-in, and a key pair for what unlocks the key here (pigeon/crypto.js handbackPair: kept on this phone, with the
// link you came in on, for half an hour or until it's used; on the phone, not just the tab, as a Home Screen app can
// open the account's page in a view of its own), and back with a code for it (signInBack).
const SIGNIN_KEY = "inflight-signin";
// (one started and never finished, its word and key not kept past a couple of hours)
try { const k = JSON.parse(localStorage.getItem(SIGNIN_KEY) || "null"); if (k && !(Math.abs(Date.now() - k.at) < 2 * 3600e3)) localStorage.removeItem(SIGNIN_KEY); } catch (_) {}
async function toAccountSignIn(e, mode) {
  e?.preventDefault?.();
  const covered = handOff();      // (the page's sky comes in while the trip's got ready)
  try {
    const t = await E2E.handbackPair();
    localStorage.setItem(SIGNIN_KEY, JSON.stringify({ word: t.word, pub: t.pub, priv: t.priv, at: now(), link: S.pendingLink || null }));
    const back = location.origin + (location.pathname.startsWith("/pigeon/") ? "/pigeon/" : "/");
    await covered;
    const q = new URLSearchParams({ [mode]: "inflight", ask: t.ask, seal: t.pub, back });
    location.assign(toAuth(`#${q}`));
  } catch (_) { handBack(); toast("This browser can’t sign in to Chat. Try Safari or Chrome."); }
}
// Back from the account's page with a code for the sign-in made there: swapped, with the word kept for it, for
// Chat's own sign-in, and the key unlocked with what the page sealed to this phone (the password's first half, or the
// PRF secret of a passkey with its own copy of the key). A code from anywhere else, or one that's run out, is used up
// and goes no further.
async function signInBack(code) {
  let k = null;
  try { k = JSON.parse(localStorage.getItem(SIGNIN_KEY) || "null"); localStorage.removeItem(SIGNIN_KEY); } catch (_) {}
  if (!k || now() - k.at > 30 * MIN) {
    api("handback", { method: "POST", body: { code, verifier: "" } }).catch(() => {});
    resumeCheck();
    arrival?.away();                       // (the account's page's sky clears to the welcome, which says why)
    return toast("That sign-in was started somewhere else. Sign in again here.");
  }
  S.signingIn = true; render();
  try {
    // (the code swapped already, if theme.js could start it on the first frame: its answer taken up here)
    const early = window.arvSwap?.code === code ? window.arvSwap.answer : null;
    window.arvSwap = null;
    const r = early ? await early.then((x) => {
      if (x.ok && x.json) return x.d;
      throw Object.assign(new Error(x.d?.error || `Something went wrong (error ${x.status}). Try again.`), { status: x.status, field: x.d?.field });
    }, () => { throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); })
      : await api("handback", { method: "POST", body: { code, verifier: k.word } });
    arrival?.me(r.me);                     // (who it is: their picture comes in)
    let ecdh;
    try {
      const got = await E2E.unseal(k.priv, k.pub, r.box);
      ({ ecdh } = got.lock ? await E2E.unlock(await E2E.lockKeyOf(got.lock), r.vault) : await E2E.unlock(await E2E.fromSecret(fromB64url(got.prf)), r.pkVault));
    } catch (_) { throw new Error("Signed in, but your key couldn’t be unlocked here. Sign in again."); }
    await useKeys(r.token, r.me, ecdh);
    if (k.link && !S.pendingLink) S.pendingLink = k.link;
    S.signingIn = false;
    await afterSignIn();
    arrival?.in();                         // (in: the sky clears to Chat, signed in)
  } catch (err) {
    S.signingIn = false; render(); resumeCheck();
    arrival?.away();
    toast(esc(err.message));
  }
}

/* ---------- signing in and out, in motion ----------
   Signing in is on the account's page, so going there and coming back are one movement. Going, what you tapped grows
   into that page's sky (handOff). Coming back, Chat starts from the page's last picture: its sky and a dawn along
   the bottom, waiting while the sign-in is taken up (arriving). Your picture comes into it, where the page had it; the
   sky clears to Chat with a padlock opening in the middle; your picture flies down into Account; and
   your chats come in, a row at a time. Signing out goes the other way (dusk). With Reduce Motion each part fades where
   it is instead, and none of it ever catches a tap or stays over the screen. */
const acctSky = () => cssVar(document.documentElement, "--acct-sky") || (matchMedia("(prefers-color-scheme: dark)").matches ? "#0a0f26" : "#f3f0fb");
// (an animation that can't go wrong: none at all where this browser won't play it)
const play = (el, frames, o) => { try { return el?.animate(frames, o) || null; } catch (_) { return null; } };
// (once it has played, or ms have gone by, whichever is first)
const played = (a, ms) => new Promise((done) => { const t = setTimeout(done, ms); a?.finished.then(() => { clearTimeout(t); done(); }, () => { clearTimeout(t); done(); }); });
// The account page's sky, coming in over everything, so the page opens on what was last in sight. Opacity only, so a
// busy phone doesn't stutter it.
// → a promise for when the sky is all there is (at most ~700 ms, whatever becomes of the animation)
let handing = null;
function handOff() {
  handBack();
  const still = STILL.matches, el = document.createElement("div"), anims = [];
  el.className = "handoff"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<i class="hsky"></i>`;
  handing = { el, anims };
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", acctSky());     // (the browser's bar too)
  // (and if the page never goes, as a page sometimes doesn't, the sky doesn't stay)
  setTimeout(() => { if (handing?.el === el && document.visibilityState === "visible") handBack(); }, 15000);
  try {
    document.body.append(el);
    const sky = play($(".hsky", el), [{ opacity: 0 }, { opacity: 1 }], { duration: still ? 150 : 480, easing: "ease", fill: "forwards" });
    anims.push(sky);
    return played(sky, 700);
  } catch (_) { return Promise.resolve(); }
}
// The sky taken away again: the trip didn't start, or Chat came back from the browser's back-forward cache as it was
// when you left it
function handBack() {
  const h = handing; handing = null; if (!h) return;
  h.el.remove(); for (const a of h.anims) a?.cancel();
  applyTheme();
}
addEventListener("pageshow", (e) => { if (e.persisted) handBack(); });

// A padlock on a disc in the middle of the screen (in `into`), shut or open, with a line under it if there's one to say.
// Open, its shackle is up and swung out on its right leg, which stays in the lock.
const LOCK_OPEN = "translateY(-2.6px) rotate(24deg)";
function padlock(into, open, words) {
  const el = document.createElement("div");
  el.className = "padlock";
  el.innerHTML = `<span class="plring" aria-hidden="true"></span><span class="pldisc" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="plshackle" d="M8.2 11V7.8a3.8 3.8 0 0 1 7.6 0v5.7"/>`
    + `<rect class="plbody" x="5.2" y="10.4" width="13.6" height="10.2" rx="2.8"/><circle class="plhole" cx="12" cy="15.4" r="1.4"/></svg></span>${words ? `<p class="plcap" role="status">${esc(words)}</p>` : ""}`;
  if (open) $(".plshackle", el).style.transform = LOCK_OPEN;
  into.append(el);
  return el;
}
// The shackle opening (or shutting): lifting, then swinging out on the spring (or back, and down with a click). Reduce
// Motion: it fades from one to the other where it is. → a promise for when it's done
function shackle(el, open) {
  const sh = $(".plshackle", el), E = kEases(), to = open ? LOCK_OPEN : "";
  if (STILL.matches) {
    const out = play(sh, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" });
    return played(out, 160).then(() => { sh.style.transform = to; out?.cancel(); return played(play(sh, KF.fade, { duration: 160, easing: "ease" }), 260); });
  }
  sh.style.transform = to;
  return played(play(sh, open ? [{ transform: "none", easing: "cubic-bezier(.3,0,.2,1)" }, { transform: "translateY(-2.6px)", offset: 0.32, easing: E.spring }, { transform: LOCK_OPEN }]
    : [{ transform: LOCK_OPEN, easing: "cubic-bezier(.4,0,.2,1)" }, { transform: "translateY(-2.6px)", offset: 0.6, easing: E.easeIn }, { transform: "none" }], { duration: open ? 560 : 420 }), 700);
}
// A gentle curve from where `el` is onto the middle of `to`, shrinking to its size as it goes: out past that side
// first, then down onto it, on the spring (--ease-spring), so it lands with a little give. → the animation
function flyTo(el, to, ms) {
  const a = el.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  const cx = x1 + Math.sign(x1 - x0 || 1) * Math.max(36, Math.abs(x1 - x0) * 0.5), cy = y0 + (y1 - y0) * 0.2, s1 = Math.max(0.15, b.width / a.width);
  const frames = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, m = 1 - u, x = m * m * x0 + 2 * m * u * cx + u * u * x1, y = m * m * y0 + 2 * m * u * cy + u * u * y1;
    frames.push({ transform: `translate(${(x - x0).toFixed(1)}px,${(y - y0).toFixed(1)}px) scale(${(1 + (s1 - 1) * u).toFixed(3)})` });
  }
  return play(el, frames, { duration: ms, easing: kEases().spring, fill: "forwards" });
}
// Messages' rows under its title, those on screen, in order (its list a row at a time)
function rowsOnScreen() {
  const vr = $view.getBoundingClientRect();
  return [...$view.querySelectorAll(":scope > .brandh ~ *")].flatMap((el) => (el.matches(".mlist") ? [...el.children] : [el]))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > vr.top && r.top < vr.bottom; });
}

/* coming back from the account's page, signed in there: its last picture over Chat until Chat is in. (A
   sign-in that goes wrong, or is slow, clears it to the welcome; it never stays.) */
let arrival = null;
// (you: the initial the account's page sent; with it, you're there from the first frame, as the page left you, your
// photo too if it sent one: theme.js arvPhoto)
function arriving(you) {
  const still = STILL.matches, E = kEases(), box = document.createElement("div"), timers = [];
  // (not "arrive": that's a photo just come, fading in)
  box.className = "arrival"; box.setAttribute("aria-hidden", "true"); box.inert = true;
  box.innerHTML = `<div class="arv-sky"></div>`;
  let over = false, face = null, faceAt = 0, lock = null, held = false;
  if (you && [...you].length === 1) {
    face = document.createElement("div"); face.className = "arv-me"; face.textContent = you; held = true;
    if (window.arvPhoto) { const img = new Image(); img.alt = ""; img.src = window.arvPhoto; face.append(img); }
    box.append(face);
  }
  root().append(box);
  document.documentElement.classList.remove("arriving", "arv-face");
  const at = (ms, fn) => timers.push(setTimeout(() => { if (!over) try { fn(); } catch (_) {} }, ms));
  const end = () => {
    over = true; timers.forEach(clearTimeout); clearTimeout(late);
    root().classList.remove("unlocking"); box.remove(); lock?.remove();
    if (arrival === a) arrival = null;
  };
  // (a sign-in that's slow to come back: the welcome, which says it's signing in, rather than the sky for ever)
  const late = setTimeout(() => a.away(), 12000);
  const gone = (el, ms, to = "none") => play(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: still ? "none" : to }], { duration: still ? 200 : ms, easing: E.out, fill: "forwards" });
  const a = {
    // who it is, once the account's page's sign-in is Chat's: their picture comes into the sky (their initial,
    // and their photo once Chat, signed in, has fetched it)
    me(p) {
      try {
        if (over || !p || (face && (!held || face.querySelector("img")))) return;
        if (!face) {
          face = document.createElement("div"); face.className = "arv-me"; faceAt = performance.now();
          face.textContent = initials(p.name || p.handle || "?").slice(0, 1);
          box.append(face);
          play(face, still ? KF.fade : [{ opacity: 0, transform: "scale(.82)" }, { opacity: 1, transform: "none" }], { duration: still ? 200 : 460, easing: still ? "ease" : E.spring, fill: "backwards" });
        }
        const t0 = performance.now(), look = () => {
          if (over || performance.now() - t0 > 5000) return;
          const u = S.token && S.me?.id === p.id ? avatarUrl(S.me) : "";
          if (!u) { setTimeout(look, 90); return; }
          const img = new Image(); img.alt = "";
          img.onload = () => { if (!over && face?.isConnected) { face.append(img); play(img, KF.fade, { duration: 240, easing: "ease" }); } };
          img.src = u;
        };
        if (p.avatarAt) look();
      } catch (_) {}
    },
    // in: the sky clears to Chat (drawn under it already, the chats held back), a padlock opens in the middle, your
    // picture flies down into Account (which says welcome back), and your chats come in a row at a time. A new account
    // goes on to choose where it is: the sky just clears to that, your picture rising away with it.
    in() {
      try {
        if (over) return;
        clearTimeout(late);
        // (signed in at once: your picture, if it's only just come, still has a moment there first)
        const dwell = face && !held ? faceAt + (still ? 250 : 380) - performance.now() : 0;
        if (dwell > 20) { timers.push(setTimeout(() => a.in(), dwell)); return; }
        const list = S.view === "messages", onboarding = AUTH_VIEWS.has(S.view);
        // (the screen it came in on was drawn under the sky: no copy of the welcome left fading under it, and no slide)
        root().querySelectorAll(".nav-ghost").forEach((g) => g.remove());
        for (const el of [$view, $compose]) el.classList.remove("nav-push", "nav-pop", "nav-fade", "nav-tab-r", "nav-tab-l");
        if (list) root().classList.add("unlocking");
        applyTheme();
        for (const el of box.querySelectorAll(".arv-sky")) play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? 250 : 420, easing: "ease", fill: "forwards" });
        setTimeout(end, 4000);                                       // (whatever happens below, it's all gone by then)
        if (onboarding) {
          at(still ? 100 : 260, () => face && gone(face, 420, "translateY(-10px) scale(.92)"));
          at(still ? 450 : 800, end);
          return;
        }
        if (list) {
          lock = padlock(root(), false, "Unlocking your messages");
          play(lock, still ? KF.fade : [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: still ? 200 : 300, delay: still ? 0 : 60, easing: E.out, fill: "backwards" });
          at(still ? 350 : 300, () => {
            shackle(lock, true); haptic("tick");
            play($(".plring", lock), still ? [{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0 }] : [{ opacity: 0.85, transform: "scale(1)" }, { opacity: 0, transform: "scale(2.2)" }], { duration: still ? 600 : 760, easing: E.out });
          });
          at(still ? 450 : 420, () => {
            const cap = $(".plcap", lock); cap.textContent = "Messages unlocked";
            play(cap, still ? KF.fade : [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: E.out });
          });
          at(still ? 950 : 860, () => gone(lock, 240, "scale(.96)"));
          // the chats, a row at a time, top first (or all at once if you've already gone elsewhere), as the padlock goes
          at(still ? 1000 : 900, () => {
            const rows = S.view === "messages" ? rowsOnScreen() : [];
            root().classList.remove("unlocking");
            rows.forEach((el, i) => kPlay(el, still ? KF.fade : [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: Math.min(i, 10) * 45, easing: E.out, fill: "backwards" }));
          });
        }
        // your picture: down into Account, where Chat shows you, landing with a spring (or, where Account isn't in
        // sight, or with Reduce Motion, it fades where it is, and Account answers)
        at(still ? 600 : 240, () => {
          if (!face) return;
          const tab = !$tabbar.hidden && !S.sheet && !$pop.firstElementChild && $('.tab[data-id="account"] svg', $tabbar);
          if (!tab || still) { gone(face, 300, "scale(.9)"); if (tab) play(tab, KF.chg, { duration: 400, delay: 150, easing: E.out }); return; }
          if (!flyTo(face, tab, 720)) { gone(face, 300, "scale(.9)"); return; }
          // (as it lands, before the spring has quite settled: into Account, which springs too)
          at(440, () => {
            play(face, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease", fill: "forwards" });
            play(tab, [{ transform: "scale(1.3)" }, { transform: "none" }], { duration: 520, easing: E.bounce });
          });
        });
        at(still ? 1500 : list ? 1500 : 1250, end);
      } catch (_) { end(); }
    },
    // not in after all (a sign-in from elsewhere, or one that's run out, or went wrong): it clears to what's under it
    away() {
      try {
        if (over) return;
        over = true; timers.forEach(clearTimeout); clearTimeout(late);
        root().classList.remove("unlocking");
        for (const el of [box, lock]) if (el) play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? 150 : 300, easing: "ease", fill: "forwards" });
        applyTheme();
        setTimeout(end, still ? 170 : 320);
      } catch (_) { end(); }
    },
  };
  return a;
}

/* going: signing out, the other way. The screen's rows fall away (the last first), a padlock shuts in the middle, and
   night comes in over it all; under the night the welcome is drawn, and the night clears to it. → { dark: a promise
   for when it's dark (what's under it can change then), done(): the welcome is there, so the night can go } */
function dusk() {
  const still = STILL.matches, E = kEases(), box = document.createElement("div"), timers = [];
  box.className = "dusk"; box.setAttribute("aria-hidden", "true"); box.inert = true;
  const at = (ms, fn) => timers.push(setTimeout(() => { try { fn(); } catch (_) {} }, ms));
  let rows = [], lock = null;
  try {
    root().append(box);
    if (!S.locked) {
      // (a lifeless copy of the screen as it is, as under a swipe back: its rows can go without the app redrawing them)
      const c = document.createElement("div"), v = $view.cloneNode(true), top = $view.scrollTop;
      c.className = `dusk-copy${root().classList.contains("plain") ? " plain" : ""}`; c.style.top = `${$view.offsetTop}px`;
      v.classList.remove("nav-push", "nav-pop", "nav-fade", "nav-tab-r", "nav-tab-l"); c.append(v);
      const tb = !$tabbar.hidden && $tabbar.cloneNode(true);
      if (tb) { tb.classList.remove("rise", "back"); c.append(tb); }
      c.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
      box.append(c); v.scrollTop = top;
      const vr = v.getBoundingClientRect();
      rows = [...v.children].filter((el) => !el.matches(".navbar, .gap")).flatMap((el) => (el.matches(".mlist") ? [...el.children] : [el]))
        .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > vr.top && r.top < vr.bottom; }).reverse();
      if (tb) rows.unshift($(".tabs", tb));
      lock = padlock(box, true);
    }
  } catch (_) {}
  const night = document.createElement("div"); night.className = "dusk-night"; box.append(night);
  rows.forEach((el, i) => el && kPlay(el, still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(12px)" }],
    { duration: still ? 200 : 260, delay: still ? 0 : Math.min(i, 10) * 35, easing: still ? "ease" : E.easeIn, fill: "forwards" }));
  if (lock) {
    play(lock, still ? KF.fade : [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: still ? 200 : 300, delay: still ? 0 : 120, easing: E.out, fill: "backwards" });
    at(still ? 300 : 400, () => shackle(lock, false).then(() => {
      if (still) return;
      haptic("tick");
      play($(".pldisc", lock), [{ transform: "scale(.93)" }, { transform: "none" }], { duration: 420, easing: E.bounce });
    }));
  }
  const dark = new Promise((res) => {
    at(still ? (lock ? 450 : 150) : lock ? 720 : 300, () => played(play(night, [{ opacity: 0 }, { opacity: 1 }], { duration: still ? 250 : 380, easing: "ease", fill: "forwards" }), 700).then(res));
    setTimeout(res, 2500);
  });
  return {
    dark,
    done() {
      try {
        timers.forEach(clearTimeout);
        drawLock();                                                   // (a lock screen signed out from goes with the rest)
        box.querySelectorAll(".dusk-copy, .padlock").forEach((e) => e.remove());
        played(play(box, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? 250 : 480, easing: "ease", fill: "forwards" }), 800).then(() => box.remove());
      } catch (_) { box.remove(); }
    },
  };
}

/* ---------- the welcome sky ----------
   Night: a quiet field of stars, breathing slowly. (Still, for anyone who asks for less motion.) */
let skyLoop = 0, skyOn = null;
function nightSky(cv) {
  if (!cv || skyOn === cv) return;            // already shining: it carries on
  cancelAnimationFrame(skyLoop); skyOn = cv;
  const g = cv.getContext("2d"), still = STILL.matches, t0 = performance.now();
  let W = 0, H = 0, dpr = 1, stars = [], last = 0;
  const seed = (n) => { let x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const size = () => {
    const w = cv.clientWidth, h = cv.clientHeight; if (w === W && h === H) return;
    W = w; H = h; dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr;
    stars = Array.from({ length: Math.round((W * H) / 3400) }, (_, i) => ({ x: seed(i) * W, y: seed(i + 500) * H, r: 0.35 + seed(i + 900) ** 3 * 1.3,
      p: seed(i + 1300) * 6.28, s: 0.3 + seed(i + 1700) * 0.9, b: 0.3 + seed(i + 2100) * 0.6 }));
  };
  const frame = (now) => {
    if (!cv.isConnected || !document.documentElement.classList.contains("night")) { skyOn = null; return; }
    // 20 frames a second is plenty for stars breathing; while you type (the keyboard up), fewer still
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
    if (!still && now - last < (typing ? 120 : 48)) { skyLoop = requestAnimationFrame(frame); return; }
    last = now;
    size();
    const t = now - t0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // drawn in a dozen or so batches, by brightness, not one by one
    const lit = new Map();
    for (const s of stars) {
      const tw = still ? s.b : s.b * (0.6 + 0.4 * Math.sin(s.p + (t / 1000) * s.s)), a = Math.round(tw * 20) / 20;
      let path = lit.get(a); if (!path) lit.set(a, (path = new Path2D()));
      path.moveTo(s.x + s.r, s.y); path.arc(s.x, s.y, s.r, 0, 6.29);
    }
    g.fillStyle = "#dfe8ff";
    for (const [a, path] of lit) { g.globalAlpha = a; g.fill(path); }
    g.globalAlpha = 1;
    if (!still) skyLoop = requestAnimationFrame(frame);
  };
  skyLoop = requestAnimationFrame(frame);
}
// The password-locked key, fetched with the password itself (its proof is the check)
async function vaultWith(password) {
  const { salt } = await api("salt", { method: "POST", body: { email: S.me.email } });
  const { lockKey, proof } = await E2E.fromPassword(password || "", salt);
  const { vault } = await api("vault", { method: "POST", body: { proof } });
  return { vault, salt, lockKey, proof };
}
// "Confirm it's you": the few things a stolen sign-in mustn't be enough for ask
// for your password (or a passkey) if you haven't shown it in 10 minutes.
// (answered once: if something else takes its place first, it answers "no" so nothing waits for ever)
const asking = (sheet, resolve) => { sheet.resolve = (v) => { if (sheet.done) return; sheet.done = true; resolve(v); }; return sheet; };
function confirmIt() {
  return new Promise((resolve) => { S.sheet = asking({ type: "reauth", back: S.sheet }, resolve); renderSheet(); });
}
async function withFresh(fn) {
  try { return await fn(); }
  catch (e) {
    if (e.field !== "reauth") throw e;
    if (!(await confirmIt())) throw Object.assign(new Error("Cancelled."), { cancelled: true });
    return fn();
  }
}
async function reauthPasskey() {
  const o = await api("passkey-options", { method: "POST", body: { mode: "login" } });
  const a = await navigator.credentials.get({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
    allowCredentials: (S.passkeys || []).map((p) => ({ type: "public-key", id: fromB64url(p.id) })) } });
  await api("reauth", { method: "POST", body: { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) } });
}
const passkeysSupported = () => !!(window.PublicKeyCredential && navigator.credentials?.create);
function deviceLabel() {
  const ua = navigator.userAgent;
  const d = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android phone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "Device";
  return d;
}
const prfResult = (cred) => { const r = cred.getClientExtensionResults?.().prf; return r?.results?.first ? new Uint8Array(r.results.first) : null; };
// Save a passkey; if the phone supports PRF, give it its own locked copy of the key.
async function addPasskey() {
  const o = await api("passkey-options", { method: "POST", body: { mode: "register" } });
  const prfSalt = await E2E.prfSalt();
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: fromB64url(o.challenge), rp: { id: o.rpId, name: "Chat" },
    user: { id: fromB64url(o.user.id), name: o.user.name, displayName: o.user.displayName },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
    excludeCredentials: o.exclude.map((id) => ({ type: "public-key", id: fromB64url(id) })),
    attestation: "none", timeout: 120000, extensions: { prf: { eval: { first: prfSalt } } } } });
  const resp = cred.response;
  const spki = resp.getPublicKey?.(), alg = resp.getPublicKeyAlgorithm?.();
  if (!spki) throw new Error("This browser can’t save passkeys for Chat yet.");
  await api("passkey-register", { method: "POST", body: {
    challenge: o.challenge, id: cred.id, publicKey: b64url(spki), alg, clientDataJSON: b64url(resp.clientDataJSON), label: deviceLabel(),
    authenticatorData: resp.getAuthenticatorData ? b64url(resp.getAuthenticatorData()) : undefined } });
  let secret = prfResult(cred);
  const ext = cred.getClientExtensionResults?.().prf;
  if (!secret && ext?.enabled) {
    // Some phones only hand over the PRF secret when the passkey is used, so use it once now.
    try {
      const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: o.rpId, userVerification: "required",
        allowCredentials: [{ type: "public-key", id: cred.rawId }], extensions: { prf: { eval: { first: prfSalt } } } } });
      secret = a && prfResult(a);
    } catch (_) { /* the passkey still signs in; it just won't unlock messages by itself */ }
  }
  if (!secret) return false;
  const jwk = S.secretJwk || (await askPasswordForKey());
  if (!jwk) return false;
  await api("passkey-vault", { method: "POST", body: { id: cred.id, vault: await E2E.lock(await E2E.fromSecret(secret), { ecdh: jwk }) } });
  return true;
}
// After a reload the key is on the phone but not exportable, so linking a new
// passkey needs the password once to open the stored copy.
function askPasswordForKey() {
  return new Promise((resolve) => { S.sheet = asking({ type: "askpw" }, resolve); renderSheet(); });
}

/* ============================================================
   Sync with the server
   ============================================================ */
let syncing = null;
// What the server says (fresh, or the copy kept on this phone): friends,
// groups and each chat's last message, opened with the key on this phone.
async function applySync(d) {
  S.me = d.me; S.friends = d.friends; S.groups = d.groups || []; S.incoming = d.incoming; S.outgoing = d.outgoing; S.blocked = d.blocked || []; S.passkeys = d.passkeys; S.emailOn = !!d.emailOn; S.gifsOn = !!d.gifsOn; S.birds = d.birds?.birds || []; S.hall = d.birds?.hall || []; S.feathers = d.feathers ?? S.feathers ?? 0;
  syncTheme();
  for (const f of S.friends) {
    checkPin(f);
    if (f.last) await decrypt(f.id, f.last);
    // a notice for pigeons that land while the app is open (not for ones already waiting at launch)
    if (f.last && !f.last.flying && !f.last.lost && !S.seenLanded.has(f.last.id)) {
      S.seenLanded.add(f.last.id);                 // (one landing in front of you comes down on screen: playKeyed)
      if (S.started && f.last.from === f.id && !f.last.readAt && !(S.view === "chat" && S.chat === f.id))
        toast(`<b>${esc(first(f.name))}</b><br>A pigeon just landed.`, "Read", () => go("chat", f.id));
    }
  }
  for (const g of S.groups) {
    for (const p of g.members) if (p.id !== S.me.id) checkPin(p);
    const known = S.pins["g:" + g.id], ids = g.members.map((p) => p.id);
    if (!known) { S.pins["g:" + g.id] = ids; savePins(); }
    g.unseen = known ? ids.filter((id) => !known.includes(id)) : [];
    if (g.last) await decryptGroup(g, g.last);
    const l = g.last;
    if (l && l.from !== S.me.id && !l.flying && !l.lost && !S.seenLanded.has(l.id)) {
      S.seenLanded.add(l.id);
      if (S.started && !l.readAt && !(S.view === "chat" && S.chat === g.id))
        toast(`<b>${esc(g.name)}</b><br>A pigeon from ${esc(first(member(g, l.from)?.name || "someone"))} just landed.`, "Read", () => go("chat", g.id));
    }
  }
}
// something set off, landed or was called back: the In the air strip catches up now, not 20 s later
function skiesFollow() {
  const sig = [...S.friends, ...S.groups].map((x) => (x.last ? `${x.last.id}:${x.last.flying ? 1 : 0}${x.last.lost ? "l" : ""}` : "")).join(",");
  if (sig === S.skySig) return;
  const first = S.skySig == null; S.skySig = sig;
  if (!first) loadSkies();
}
async function sync() {
  if (!S.token || !S.priv) return;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const tok = S.token, d = await api("sync");
      if (S.token !== tok) return;                // signed out (or in as someone else) meanwhile: not theirs to show
      if (!Number.isFinite(d.now) || !d.me || !Array.isArray(d.friends)) throw new Error("A sync came back incomplete.");
      S.skew = d.now - Date.now();
      checkMyKey(d.me);
      const caught = S.pinsUnread && await pinsCatchUp();      // (trusted keys it couldn't fetch at the start: now, before it trusts any shown here)
      if (S.token !== tok) return;                // (signed out while it asked: as above)
      // nothing new since last time: no redraw, no re-saving (an open app asks every 15 s)
      // (a friend's last-seen time moves once a minute while they're about: that alone is taken in quietly, and only
      // a change of who's online now redraws)
      const sig = JSON.stringify({ ...d, now: 0 }, (k, v) => (k === "seenAt" ? undefined : v)), same = sig === S.syncSig && S.synced && !caught;
      const onSig = d.friends.map((f) => (isOnline(f) ? f.id : "")).join(), seen = JSON.stringify(d.friends.map((f) => f.seenAt));
      const onlineMoved = onSig !== S.onSig, seenMoved = seen !== S.seenSig;
      S.syncSig = sig; S.onSig = onSig; S.seenSig = seen; S.syncFails = 0; S.lastSync = Date.now();
      if (!same) { S.raw = d; await applySync(d); skiesFollow(); }
      else if (seenMoved) { S.raw = d; for (const f of d.friends) { const o = S.friends.find((x) => x.id === f.id); if (o) o.seenAt = f.seenAt; } }
      S.started = true;
      if (S.view === "chat" && S.chat && !S.locked) await loadChat(S.chat).catch((e) => console.warn("chat", e.message));     // (locked: nothing is opened, or marked read; a slow chat doesn't hold up the rest)
      if (S.token !== tok) return;
      // (the open Skies map keeps up every time; on Messages the strip does whenever the sync changed, a new landing
      // time say, and past that every couple of minutes, for what no sync shows)
      if ((S.sheet?.type === "map" && S.sheet.id === "skies") || (S.view === "messages" && (!same || Date.now() - (S.skiesAt || 0) > 120e3))) loadSkies();
      const wasCache = S.fromCache; S.fromCache = false;
      if (!AUTH_VIEWS.has(S.view) && (!same || wasCache || S.chatChanged || onlineMoved)) calmRender();
      S.chatChanged = false;
      S.synced = true;                            // from here on, what changes is news
      if (!same || seenMoved) cacheSave();
      if (S.outbox.length) outboxFlush();
    } catch (e) { if (e.status !== 401) { console.warn("sync", e.message); S.syncFails = (S.syncFails || 0) + 1; if (!S.started && S.syncFails === 1 && S.view === "messages") render(); } }
    finally { syncing = null; }
  })();
  return syncing;
}
function friend(id) { return S.friends.find((f) => f.id === id); }
// The server should show everyone the key this phone holds. If it ever says otherwise, say so.
function checkMyKey(me) {
  if (!S.myPub || !me?.pub || keyId(me.pub) === keyId(S.myPub)) return;
  if (S.keyWarned) return;
  S.keyWarned = true;
  toast("<b>Your security key doesn’t match</b><br>The server is showing a different key for you than the one on this phone. Don’t send anything private, and sign out and back in.");
}
// First key seen for a friend is remembered on this phone; a later change is flagged.
// Keys this phone trusted before are kept too, so scrolls sealed with them stay readable
// after a friend resets. Only keys this phone has seen are ever tried: a key named by the
// server alone could have been made by the server.
const keyId = (pub) => `${pub.x}.${pub.y}`;
const pubFromId = (k) => { const [x, y] = k.split("."); return { kty: "EC", crv: "P-256", x, y }; };
// The keys you've trusted also go to the server, sealed so only your own key can
// open them: on a new phone (or after this one forgets), they come back, and a
// key the server swapped in while you weren't looking is still caught, as long as
// the server hands the copy back (it can always say there's none). Each save adds
// to the copy there rather than replacing it, so one phone's Verified marks and old
// keys aren't lost to another's; and a phone that couldn't fetch it saves nothing
// over it until it has.
const pinsMeta = () => ({ type: "pins", id: "pins", from: S.me.id, to: S.me.id });
// Two sets of trusted keys as one: `mine` wins wherever both have something (a Verified
// mark turned off is kept as "", so it stays off); keys trusted before and a group's
// members seen are kept from both; a Verified mark only `theirs` has, only for the key
// trusted now.
function mergePins(mine, theirs) {
  const out = { ...theirs, ...mine };
  for (const [k, v] of Object.entries(theirs)) {
    if (/^(old|g):/.test(k) && Array.isArray(v) && Array.isArray(mine[k])) out[k] = [...new Set([...mine[k], ...v])];
    else if (k.startsWith("v:") && !(k in mine) && v && v !== out[k.slice(2)]) delete out[k];
  }
  return out;
}
// the copy on the server, opened (null: there's none, or it won't open, which asking again won't change; no answer throws)
async function serverPins() {
  const r = await api("pins");
  const p = r.pins ? await E2E.open(await pairFor(S.myPub), pinsMeta(), r.pins).catch(() => null) : null;
  return p?.pins && typeof p.pins === "object" ? p.pins : null;
}
let pinsTimer = 0;
function savePins() {
  if (!S.me) return;
  idb.set("pins:" + S.me.id, S.pins);
  clearTimeout(pinsTimer);
  pinsTimer = setTimeout(async () => {
    if (S.pinsUnread) return;                    // (kept on the phone till then: pinsCatchUp saves it)
    try {
      const had = await serverPins();            // (what another of your phones saved since stays)
      if (had) { S.pins = mergePins(S.pins, had); await idb.set("pins:" + S.me.id, S.pins); }
      const ct = await E2E.seal(await pairFor(S.myPub), pinsMeta(), { pins: S.pins, at: Date.now() });
      await api("pins", { method: "POST", body: { pins: ct } }); await idb.set("pinsup:" + S.me.id, Date.now());
    } catch (_) {}
  }, 1500);
}
// Nothing trusted on this phone yet (a new phone, a reinstall): bring back what was saved
// (no answer: the next sync asks again, before it trusts anything it shows; noted on the
// phone, so a restart before then still does)
async function restorePins() {
  const tok = S.token, id = S.me.id;
  S.pinsUnread = !!(await idb.get("pinsunread:" + id).catch(() => null));
  if (Object.keys(S.pins).length) return;
  let p;
  // (a sign-in that had ended signs out as it's asked: that's not "no answer", and start carries on to the welcome)
  try { p = await serverPins(); } catch (_) { if (S.token === tok) { S.pinsUnread = true; await idb.set("pinsunread:" + id, 1); } return; }
  if (p && S.token === tok) { S.pins = p; await idb.set("pins:" + id, S.pins); await idb.set("pinsup:" + id, Date.now()); }
}
// ...and once it answers, the server's copy wins for each friend's key, so one that changed meanwhile is
// flagged, with what this phone trusted meanwhile added. True once done.
async function pinsCatchUp() {
  const tok = S.token; let p;
  try { p = await serverPins(); } catch (_) { return false; }
  if (S.token !== tok) return false;
  S.pinsUnread = false; await idb.del("pinsunread:" + S.me.id);
  if (p) S.pins = mergePins(p, S.pins);
  savePins();
  return true;
}
// Verify in person: your safety number with a friend, as a QR code. Scanning theirs (or
// comparing the digits and saying they match) marks them Verified, kept with the trusted
// keys ("v:" + id: the key that was verified), until their key changes.
const safetyCode = (digits) => `inflight-safety:1:${(digits || []).join("")}`;
const isVerified = (p) => !!p?.pub && !p.keyChanged && S.pins["v:" + p.id] === keyId(p.pub);
const wasVerified = (p) => !!p?.keyChanged && !!S.pins["v:" + p.id];         // verified, and their key has changed since
function setVerified(p, on) { S.pins["v:" + p.id] = on ? keyId(p.pub) : ""; savePins(); }     // (off is kept, as "": mergePins)
const safeState = (p) => p?.keyChanged ? "warn" : isVerified(p) ? "ok" : "none";
// A key you can know at a glance: its fingerprint drawn as a 5×5 pattern, mirrored like a face, in two colours
// of its own. A different key looks different, without reading 32 characters.
function keyArt(fp, cls = "") {
  const b = (fp || "").replace(/\s/g, "").match(/../g)?.map((h) => parseInt(h, 16)) || [];
  if (b.length < 16) return "";
  const hue = Math.round(((b[0] << 8 | b[1]) / 65536) * 360), hue2 = (hue + 40 + (b[2] % 80)) % 360;
  let cells = "";
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    const v = b[3 + r * 3 + c];
    if (v < 100) continue;                                            // about three in five are filled
    const fill = v & 1 ? `hsl(${hue2} 70% 55%)` : `hsl(${hue} 72% 48%)`;
    for (const x of c === 2 ? [2] : [c, 4 - c]) cells += `<rect x="${x * 10 + 1}" y="${r * 10 + 1}" width="8" height="8" rx="2.4" fill="${fill}"/>`;
  }
  return `<svg class="keyart ${cls}" viewBox="0 0 50 50" role="img" aria-label="Your key, as a pattern">${cells}</svg>`;
}
function stopScan() { if (!S.scan) return; S.scan.on = false; S.scan.stream?.getTracks().forEach((t) => t.stop()); S.scan = null; }
async function startScan(p, want) {
  stopScan();
  const v = $(".scanbox video", $layer), say = (t) => { const m = $(".scanmsg", $layer); if (m) m.textContent = t; };
  if (!v) return;
  const scan = S.scan = { on: true, stream: null, sheet: S.sheet };
  try { scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
  catch (_) { S.scan = null; return say("Chat can’t use the camera here. Compare the 60 digits instead."); }
  if (!scan.on || S.scan !== scan) { scan.stream.getTracks().forEach((t) => t.stop()); return; }     // (closed, or another scan began, while asking)
  v.addEventListener("playing", () => v.classList.add("on"), { once: true });          // (it fades in once there's a picture: styles.css)
  v.srcObject = scan.stream; await v.play().catch(() => {});
  // the browser's own reader where there is one (Android), else jsQR (loaded only now)
  let det = null;
  try { if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) det = new BarcodeDetector({ formats: ["qr_code"] }); } catch (_) {}
  const jsQR = det ? null : (await import("./jsqr.js")).default;
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
  const look = async () => {
    if (!scan.on || S.scan !== scan) return;
    let text = null;
    if (v.readyState >= 2 && v.videoWidth) {
      if (det) text = (await det.detect(v).catch(() => []))[0]?.rawValue || null;
      else { const w = c.width = Math.min(640, v.videoWidth), h = c.height = Math.round((w * v.videoHeight) / v.videoWidth); g.drawImage(v, 0, 0, w, h); text = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" })?.data || null; }
    }
    if (text?.startsWith("inflight-safety:")) {
      stopScan();
      // (Verify a Friend: whichever friend's safety number it is, opened at theirs; a changed key is only trusted there)
      if (want instanceof Map) {
        const hit = want.get(text);
        if (!hit) { haptic("heavy"); S.sheet = { ...S.sheet, bad: true }; return renderSheet(); }
        const at = { type: "safety", id: hit.f.id, digits: hit.digits, from: "encryptionsheet" };
        if (hit.f.keyChanged) { S.sheet = at; return renderSheet(); }
        setVerified(hit.f, true); haptic("success"); toast(`Verified. Your safety numbers match, so only you and ${esc(first(hit.f.name))} can read your messages.`);
        S.sheet = { ...at, won: performance.now() }; return renderSheet();
      }
      if (text === want) { setVerified(p, true); haptic("success"); toast(`Verified. Your safety numbers match, so only you and ${esc(first(p.name))} can read your messages.`); S.sheet = { ...S.sheet.back, won: performance.now() }; return renderSheet(); }
      haptic("heavy"); S.sheet = { ...S.sheet, bad: true }; return renderSheet();
    }
    setTimeout(look, 150);
  };
  look();
}
function checkPin(f) {
  const k = keyId(f.pub);
  if (!S.pins[f.id]) { S.pins[f.id] = k; savePins(); }
  f.keyChanged = S.pins[f.id] !== k;
}
// a friend, or someone in one of your groups
const personById = (id) => friend(id) || S.groups.map((g) => member(g, id)).find((p) => p && p.id !== S.me.id) || null;
async function trustNewKey(fid) {
  const f = friend(fid) || S.groups.map((g) => member(g, fid)).find(Boolean); if (!f) return;
  const old = S.pins[fid], hist = S.pins["old:" + fid] || [];
  if (old && old !== keyId(f.pub) && !hist.includes(old)) S.pins["old:" + fid] = [...hist, old];
  S.pins[fid] = keyId(f.pub); savePins();
  f.keyChanged = false;
  for (const x of [friend(fid), ...S.groups.map((g) => member(g, fid))]) if (x) x.keyChanged = false;   // the same person, wherever they appear
  for (const [id, p] of S.plain) if (p.unchecked) S.plain.delete(id);     // now they can be opened
  if (friend(fid)?.last) await decrypt(fid, friend(fid).last);
  for (const g of S.groups) if (g.last) await decryptGroup(g, g.last);
  if (S.view === "chat" && (S.chat === fid || group(S.chat))) await loadChat(S.chat).catch(() => {});
  render();
}
function pairFor(pub) {
  const k = keyId(pub);
  if (!S.pairs.has(k)) S.pairs.set(k, E2E.pair(S.priv, pub));
  return S.pairs.get(k);
}
// Sealing to someone uses their key only if it hasn't changed since you last
// checked: everything that's sealed (messages, reactions, stopover copies and
// notes, group keys) goes through here, so nothing slips out to a new key.
function trustedPub(p) {
  if (!p?.pub) throw new Error("They’re not in your friends any more.");
  if (p.keyChanged) throw new Error(`${first(p.name || "Their")}’s security key changed. Check their safety number first.`);
  return p.pub;
}
const base = (fid) => pairFor(trustedPub(friend(fid)));
// Keys to try for someone's messages: theirs now (once checked), then ones this phone pinned before.
// A key the server says changed isn't used until you've checked it.
const keysOf = (p) => [p.keyChanged ? null : keyId(p.pub), S.pins[p.id], ...(S.pins["old:" + p.id] || [])].filter((k, i, a) => k && a.indexOf(k) === i);
// What a decrypted thing must look like, by what it is: a reaction is one of
// the reactions (and the id of the message it's on: reactOf) and nothing else;
// a message (or a stopover's copy) has words.
// Anything else is treated as unreadable, whatever the server sent.
const shapeOK = (kind, o) => !!o && typeof o === "object" && !Array.isArray(o) && (kind === "react"
  ? REACTIONS.includes(o.r) && (Object.keys(o).length === 1 || (Object.keys(o).length === 2 && typeof o.m === "string"))
  : typeof o.t === "string" && !("r" in o) && !("k" in o));
// Each id belongs to one conversation (and one kind of thing): if the same id
// turns up somewhere else, neither is shown as the other.
const ctxOf = (kind, m, scope) => `${kind}|${scope}|${m.from}|${m.to || ""}`;
function keepPlain(id, ctx, o) {
  const had = S.pctx.get(id);
  if (had && had !== ctx) { S.plain.set(id, { t: "", bad: true }); return; }
  S.pctx.set(id, ctx); S.plain.set(id, o);
}
const seenPlain = (id, ctx) => S.plain.has(id) && (!S.pctx.has(id) || S.pctx.get(id) === ctx);
async function decrypt(fid, m, kind = m.stopover ? "via" : "msg") {
  const ctx = ctxOf(kind, m, fid);
  if (!m.ct || seenPlain(m.id, ctx)) return;
  const f = friend(fid);
  const tries = keysOf(f);
  for (const k of tries) {
    try {
      const o = await E2E.open(await pairFor(pubFromId(k)), { id: m.id, from: m.from, to: m.to, type: kind }, m.ct);
      return keepPlain(m.id, ctx, shapeOK(kind, o) ? o : { t: "", bad: true });
    } catch (_) {}
  }
  keepPlain(m.id, ctx, { t: "", bad: true, unchecked: !!f.keyChanged });
}
/* ---------- groups ----------
   Everyone in a group gets their own pigeon, flying their own distance, so a
   message lands for each person at a different time. */
function group(id) { return S.groups.find((g) => g.id === id); }
const GROUP_MAX = 12;
const memberKm = (p) => p.lat != null && S.me.lat != null ? haversineKm(S.me.lat, S.me.lon, p.lat, p.lon) : p.km ?? 500;
// how long a group's pigeon takes to one of them (to or from the Moon: a lunar pigeon, whatever the kind)
const memberMs = (p, k) => {
  if (!S.me.moon && !p.onMoon && !p.moon) return flightMs(memberKm(p), mySpeed(k));
  const a = endFor(S.me), b = endFor(p) || { b: worldOf(p), lat: 0, lon: 0 }, sk = spaceKinds(a, b);
  return sk ? spaceMs(sk[0], a, b) : flightMs(memberKm(p), mySpeed(k));
};
const member = (g, id) => g?.members.find((p) => p.id === id);
const others = (g) => g.members.filter((p) => p.id !== S.me.id);
async function decryptGroup(g, m, kind = "msg") {
  const ctx = ctxOf(kind, m, g.id);
  if (!m.body || !m.key || seenPlain(m.id, ctx)) return;
  const from = m.from === S.me.id ? { id: S.me.id, pub: S.myPub || S.me.pub } : member(g, m.from);
  const tries = !from ? [] : from.id === S.me.id ? [keyId(from.pub)] : keysOf(from);
  for (const k of tries) {
    try {
      const w = await E2E.open(await pairFor(pubFromId(k)), { id: m.id, from: m.from, to: S.me.id, type: "wrap" }, m.key);
      // the sender's sealed key vouches for the body (v2); an older body has no hash to check
      if (w.h ? (await E2E.hash(m.body)) !== w.h : JSON.parse(m.body).v !== 1) throw new Error("not the sender’s body");
      const o = await E2E.openGroup({ id: m.id, from: m.from, group: g.id, type: kind }, w.k, m.body);
      return keepPlain(m.id, ctx, shapeOK(kind, o) ? o : { t: "", bad: true });
    } catch (_) {}
  }
  keepPlain(m.id, ctx, { t: "", bad: true, unchecked: !!from?.keyChanged });
}
async function loadGroup(gid) { return loadChat(gid); }
async function loadChat(fid) {
  const g = group(fid), tok = S.token, tags = (S.chatTags ||= new Map());
  // (a chat that's here already says which copy it has: unchanged, the server just says so, rather than send it all again)
  const tag = S.msgs.has(fid) && tags.get(fid);
  const d = await api((g ? "group-messages?id=" : "messages?with=") + encodeURIComponent(fid) + (tag ? "&tag=" + encodeURIComponent(tag) : ""));
  if (S.token !== tok) return;                     // signed out meanwhile
  S.skew = d.now - Date.now();
  if (d.same) { if (S.msgs.has(fid) && tags.get(fid) === d.tag) return; tags.delete(fid); return loadChat(fid); }
  if (d.tag) tags.set(fid, d.tag); else tags.delete(fid);
  // the same as last time: nothing to open, draw or save again
  const sig = JSON.stringify({ ...d, now: 0 }), sigs = (S.chatSigs ||= new Map());
  if (sigs.get(fid) === sig && S.msgs.has(fid)) return;
  sigs.set(fid, sig); S.chatChanged = true;
  S.chatRaw.delete(fid); S.chatRaw.set(fid, d); cacheSave();
  await applyChat(fid, d, true);
}
// One chat's messages, opened. A copy from this phone (live = false) only
// fills in until the fresh one arrives, and never tells the server anything.
// Disappearing messages (functions/_vanish.js): one whose time is up, after it was read
// (in a group, by everyone it flew to). The server wipes it within a minute; this hides
// it at once, even from a copy saved on the phone: one to one, and your own in a group
// (someone else's in a group goes when the server wipes it: only it knows when everyone has read it).
const vanishSay = (ms) => (ms ? `${ms / DAY} day${ms === DAY ? "" : "s"}` : "off");
// Messages are kept for 30 days after they land (or are lost), then go for everyone (functions/_retention.js)
const KEEP_MS = 30 * DAY, KEEP_SAY = "Messages are kept for 30 days after they land, then deleted for everyone. Your Flight Log, passport and badges keep every flight.";
const kept = (m, t = now()) => { const end = m.lost ? m.lostAt || m.deliverAt : m.deliverAt; return !!end && end + KEEP_MS < t && !(m.flock || []).some((x) => !x.lost && x.deliverAt + KEEP_MS >= t); };
function vanished(m, t = now()) {
  if (!m?.vanish) return false;
  if (m.vanishAt) return m.vanishAt <= t;          // (read receipts off: the server says when, read or not)
  if (m.flock) { const fl = m.flock.filter((x) => !x.lost); return fl.length > 0 && fl.every((x) => x.readAt) && Math.max(...fl.map((x) => x.readAt)) + m.vanish <= t; }
  if (m.gid) return false;                         // (someone else's in a group: your own read isn't the rule)
  return !!m.readAt && m.readAt + m.vanish <= t;
}
async function applyChat(fid, d, live) {
  // (a copy kept on this phone may have messages the server has since let go, after a month; a fresh one is as the server keeps it)
  if (!live && d.messages?.some((m) => kept(m))) d = { ...d, messages: d.messages.filter((m) => !kept(m)) };
  if (d.messages?.some((m) => vanished(m))) {
    for (const m of d.messages) if (vanished(m)) { S.plain.delete(m.id); S.pctx.delete(m.id); }
    d = { ...d, messages: d.messages.filter((m) => !vanished(m)) };
  }
  const g = group(fid), open = (m, kind) => (g ? decryptGroup(g, m, kind) : decrypt(fid, m, kind));
  if (!g && !friend(fid)) return;
  for (const r of d.reacts || []) await open(r, "react");
  for (const m of d.messages) {
    await open(m);
    if (!g && m.note && m.via) await openNote(m.id, m.via, S.me.id, m.note);
    if (!g && m.stopover && m.mine) await openNote(m.id, S.me.id, m.finalTo, m.mine);
  }
  if (!live && S.msgs.has(fid)) return;            // the fresh copy got here first
  if (!live) S.chatTags?.delete(fid);              // (what's shown now isn't the copy the server last named: loadChat)
  S.msgs.set(fid, d.messages); S.turns.set(fid, d.turn && { ...d.turn, at: d.now || 0 }); S.reacts.set(fid, d.reacts || []); if (!g) S.fly.set(fid, d.fly || []);
  if (g) { S.gevents.set(fid, d.events || []); if (live) (S.geventsLive ||= new Set()).add(fid); }
  for (const m of d.messages) {
    const p = S.plain.get(m.id), theirs = g ? m.from !== S.me.id : m.to === S.me.id;
    if (m.photo === 2 && S.photos.has(m.id)) { URL.revokeObjectURL(S.photos.get(m.id)); S.photos.delete(m.id); }
    if (live && m.photo === 1 && (p?.p || p?.v) && !onceP(p) && !S.photos.has(m.id) && !S.photoGone.has(m.id) && !(theirs && (m.flying || m.lost))) loadPhoto(fid, m, p);
  }
  if (!live) return;
  const unread = (m) => (g ? m.from !== S.me.id : m.from === fid && !m.stopover) && !m.flying && !m.lost && !m.readAt;
  if (!S.locked && S.view === "chat" && S.chat === fid && document.visibilityState === "visible" && d.messages.some(unread)) {     // (only a chat you're looking at is read)
    api(g ? "group-read" : "read", { method: "POST", body: g ? { id: fid } : { with: fid } }).catch(() => {});
    for (const m of d.messages) if ((g ? m.from !== S.me.id : m.from === fid) && !m.flying && !m.lost) m.readAt = m.readAt || now();
    const x = g || friend(fid); if (x) x.unread = 0;
  }
}

/* ---------- the last-known state, kept on this phone so Chat opens at once ----------
   What the server last sent (message contents still sealed; they open with the
   key that's already on this phone) and the last few chats you opened. Shown
   straight away at launch while the fresh copy loads; deleted on sign out. */
const CACHE_V = 1, CACHE_CHATS = 12;
let cacheTimer = 0;
function cacheSave() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    if (!S.me || !S.raw) return;
    idb.set("cache:" + S.me.id, { v: CACHE_V, at: Date.now(), sync: S.raw, skies: S.skies || null, chats: [...S.chatRaw].slice(-CACHE_CHATS) }).catch(() => {});
  }, 600);
}
async function cacheLoad() {
  let c = null; const me = S.me;                   // (who's signed in, from the session: a bad copy mustn't change it)
  try { c = await idb.get("cache:" + S.me.id); } catch (_) {}
  if (!c || c.v !== CACHE_V || !c.sync) return false;
  try {
    S.chatRaw = new Map(Array.isArray(c.chats) ? c.chats : []);
    if (c.skies) S.skies = c.skies;
    S.raw = c.sync;
    await applySync(c.sync);
  }
  catch (e) {
    // a saved copy this version can't read: start from the server instead of not at all
    console.warn("cache", e?.message); S.me = me; idb.del("cache:" + me.id);
    Object.assign(S, { raw: null, friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [], birds: [], hall: [], chatRaw: new Map(), msgs: new Map() });
    return false;
  }
  S.fromCache = true;
  return true;
}
// A stopover's line is sealed between the friend it stopped with and the recipient.
async function openNote(id, from, to, ct) {
  if (S.notes.has(id)) return;
  const other = friend(from === S.me.id ? to : from); if (!other) return;
  // with keys you've trusted (as for messages), never a changed one unchecked
  for (const k of keysOf(other)) {
    try { const o = await E2E.open(await pairFor(pubFromId(k)), { id: id + ":via", from, to, type: "note" }, ct); if (typeof o?.t === "string") S.notes.set(id, o.t); return; } catch (_) {}
  }
}
/* ---------- view-once photos ----------
   Downloaded only when tapped, and only once (the server hands it over a
   single time, then deletes it). Shown full screen for at most 15 seconds,
   drawn on a canvas (nothing to save or share), and wiped the moment it
   closes, or the moment you leave the app. */
const ONCE_MS = 15000;
let onceOpen = null;
// The ones you've opened are kept on this phone too (just their ids), so the
// button never comes back: not on a fresh start from the cache, not before the
// server's word arrives.
const OPENED_KEY = "inflight-opened";
let openedFor = null;
function opened() {
  if (S.me && openedFor !== S.me.id) {
    openedFor = S.me.id;
    try { const v = JSON.parse(localStorage.getItem(OPENED_KEY) || "null"); if (v?.uid === S.me.id) for (const id of v.ids || []) S.viewedOnce.add(id); } catch (_) {}
  }
  return S.viewedOnce;
}
const openedOnce = (id) => opened().has(id);
function saveOpened() { try { localStorage.setItem(OPENED_KEY, JSON.stringify({ uid: S.me.id, ids: [...S.viewedOnce].slice(-500) })); } catch (_) {} }
// past its time it's gone, even before the server has tidied it away
const picGone = (m) => m.photo === 2 || S.photoGone.has(m.id) || (m.expiresAt != null && now() >= m.expiresAt);
async function viewOnce(id) {
  const fid = S.chat, g = group(fid), m = (S.msgs.get(fid) || []).find((x) => x.id === id), p = S.plain.get(id);
  if (!m || !onceP(p) || onceOpen || m.viewedAt || opened().has(id) || picGone(m)) return;
  haptic("tick");
  const el = document.createElement("div");
  el.className = "oview"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Photo, view once");
  el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="obar"><span class="oring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/></svg></span><span class="otext">Opening…</span><button type="button" class="oclose" aria-label="Close">${I.x}</button></div>`;
  root().append(el);
  const state = onceOpen = { el, timer: 0, bmp: null };
  // closed, it fades away (the photo with it) and is wiped as it goes; leaving the app wipes it there and then
  const close = (atOnce) => {
    if (onceOpen !== state) return; onceOpen = null;
    clearTimeout(state.timer); document.removeEventListener("visibilitychange", hide);
    const wipe = () => { const cv = $("canvas", el); if (cv) { cv.width = cv.height = 0; } state.bmp?.close?.(); state.bmp = null; };
    if (atOnce === true) wipe();
    el.classList.add("out"); setTimeout(() => { wipe(); el.remove(); }, 210);
  };
  const hide = () => { if (document.visibilityState !== "visible") close(true); };
  document.addEventListener("visibilitychange", hide);
  el.addEventListener("click", () => close());
  // counted as opened now (no second go), unless it never arrives
  m.viewedAtServer = !!m.viewedAt; m.viewedAt = m.viewedAt || now(); opened().add(id); saveOpened(); render();
  let plain, got = false;
  try {
    const r = await api((g ? "group-photo/" : "photo/") + id, { raw: true }), bytes = await r.arrayBuffer();
    got = true;                                  // handed over: from here it's spent, whatever happens
    plain = await E2E.openPhoto(id, p.p, bytes);
  } catch (e) {
    close();
    // no signal, or the server never answered: it wasn't handed over, so it can still be opened later
    if (!got && (e.offline || !e.status || e.status >= 500)) { opened().delete(id); saveOpened(); if (m.viewedAt && !m.viewedAtServer) delete m.viewedAt; render(); return toast(esc(e.offline ? "You’re offline. The photo is still there to open once you’re back." : "Couldn’t open the photo just now. Try again in a moment.")); }
    if (e.status === 410) toast(esc(e.message || "This photo has already been opened."));
    else toast(esc(e.message || "Couldn’t open this photo."));
    return;
  }
  if (onceOpen !== state) { new Uint8Array(plain.buffer || plain).fill(0); return; }           // closed while it was coming
  try { state.bmp = await createImageBitmap(new Blob([plain], { type: "image/jpeg" })); } catch (_) {}
  new Uint8Array(plain.buffer || plain).fill(0);                                // the decrypted bytes go straight away
  if (!state.bmp || onceOpen !== state) return close();
  const cv = $("canvas", el), dpr = Math.min(3, devicePixelRatio || 1), W = el.clientWidth, H = el.clientHeight;
  const k = Math.min(W / state.bmp.width, H / state.bmp.height), w = Math.round(state.bmp.width * k), h = Math.round(state.bmp.height * k);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  cv.getContext("2d").drawImage(state.bmp, 0, 0, cv.width, cv.height);
  state.bmp.close?.(); state.bmp = null;
  el.classList.add("on"); $(".otext", el).textContent = "View once";
  $(".oring circle", el).style.setProperty("animation-duration", `${ONCE_MS}ms`, "important");     // (Reduce Motion too: it says how long is left)
  state.timer = setTimeout(close, ONCE_MS);
}
async function loadPhoto(fid, m, p) {
  S.photos.set(m.id, "");                         // loading
  try {
    const r = await api((group(fid) ? "group-photo/" : "photo/") + m.id, { raw: true });
    const plain = p.v ? await E2E.openPhoto(m.id, p.v, await r.arrayBuffer(), "voice") : await E2E.openPhoto(m.id, p.p, await r.arrayBuffer());
    S.photos.set(m.id, URL.createObjectURL(new Blob([plain], { type: p.v ? voiceMime(p.v.m) : p.p.m === "image/gif" ? "image/gif" : "image/jpeg" }))); bornAt.set(S.photos.get(m.id), Date.now());
    trimPhotos(fid);
  } catch (e) {
    S.photos.delete(m.id);
    // gone, or it can't be opened on this phone: don't fetch it again every time (no signal: it will be)
    if (e.status === 410 || (!e.offline && !(e.status >= 500))) S.photoGone.add(m.id);
  }
  if (S.view === "chat" && S.chat === fid) render();
}
// opened photos and voice notes are kept for the chats you've been in, up to a point: the oldest from other chats go first
function trimPhotos(fid) {
  const MAX = 80; if (S.photos.size <= MAX) return;
  const here = new Set((S.msgs.get(fid) || []).map((m) => m.id));
  for (const [id, url] of S.photos) {
    if (S.photos.size <= MAX) break;
    if (here.has(id) || !url || S.player?.id === id) continue;
    URL.revokeObjectURL(url); S.photos.delete(id);
  }
}

/* ============================================================
   Rendering
   ============================================================ */
const root = () => $("#screen");
let $view, $compose, $tabbar, $layer, $pop, $toast, $ta;
// No copying (outside the fields), and no double-tap zoom; a pinch zooms the page,
// except on the map, which handles its own pinches.
const inField = (t) => !!t?.closest?.("input, textarea, [contenteditable]");
/* ---------- swiping between the tabs ----------
   Drag Messages, Friends or Account sideways and the next tab comes in beside
   it under your finger, the tab bar's highlight sliding along, from anywhere
   on the screen. Anything that scrolls sideways (the In the air strip, once
   it has more cards than fit) scrolls instead. */
// A swipe between tabs that never finished (the touch was taken away mid-way: a
// screenshot, the app going to the background, a second finger) mustn't leave
// the next tab's preview, or the screen part-way across, behind.
let swipeLive = false;
function clearSwipes() {
  const left = document.querySelectorAll("main.tabpeek");
  if (swipeLive || !left.length) return;                 // (only ever a tab swipe's leftovers: a back swipe in a chat is left alone)
  left.forEach((p) => p.remove());
  root()?.classList.remove("swiping"); $(".tabs", $tabbar)?.classList.remove("paging");
  if ($view?.style.transform && !$view.classList.contains("nav-push") && !$view.classList.contains("nav-pop")) { $view.style.transition = "none"; $view.style.transform = ""; void $view.offsetWidth; $view.style.transition = ""; }
}
let swipeReset = () => {};
const swipeGone = () => { if (!swipeLive) return; swipeLive = false; swipeReset(); clearSwipes(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") swipeGone(); });
// a new touch anywhere while one is still "swiping" means that one was taken away
document.addEventListener("touchstart", (e) => { if (swipeLive && e.touches.length === 1) swipeGone(); }, { capture: true, passive: true });
function tabSwipe() {
  const r = root(), v = $view; let st = null;
  swipeReset = () => { st = null; };
  const tabs = () => $(".tabs", $tabbar);
  const sideways = (el) => { for (let n = el; n && n !== v; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true; return false; };
  const place = (s) => {
    const side = s.dx < 0 ? 1 : s.dx > 0 ? -1 : 0, j = s.i + side, has = !!side && j >= 0 && j < s.ids.length;
    if (side !== s.side) { s.peek?.remove(); s.peek = has ? tabPeek(s.ids[j], side) : null; s.side = side; }
    const x = s.peek ? s.dx : s.dx * 0.25;                       // no tab that way: just a little give
    v.style.transform = `translateX(${x}px)`;
    if (s.peek) s.peek.style.transform = `translateX(${side * s.w + x}px)`;
    tabs()?.style.setProperty("--tab", String(Math.max(0, Math.min(s.ids.length - 1, s.i - x / s.w))));
  };
  v.addEventListener("touchstart", (e) => {
    st = null;
    const ids = TABS.map(([id]) => id), i = ids.indexOf(S.view), t = e.target;
    if (i < 0 || e.touches.length !== 1 || S.sheet || S.locked || $pop.firstElementChild || v.style.transform || zoomed()) return;
    if (t.closest?.("input:focus, textarea, select, .rail") || sideways(t)) return;   // (a search box you aren't typing in swipes too; the cards in the air never do, even when they all fit)
    const p = e.touches[0];
    st = { ids, i, x: p.clientX, y: p.clientY, lx: p.clientX, ly: p.clientY, lt: performance.now(), vx: 0, vy: 0, dx: 0, w: r.clientWidth, dir: null, side: 0, peek: null };
  }, { passive: true });
  v.addEventListener("touchmove", (e) => {
    if (!st) return;
    if (holding() && !st.dir) { st = null; return; }               // a hold opened a menu: this touch is spent
    const p = e.touches[0], dx = p.clientX - st.x, dy = p.clientY - st.y;
    if (!st.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy)) { st = null; return; }    // up and down: it scrolls
      st.dir = "x"; swipeLive = true; r.classList.add("swiping"); v.style.transition = "none"; tabs()?.classList.add("paging");
    }
    e.preventDefault(); speed(st, p.clientX, p.clientY);
    st.dx = dx; place(st);
  }, { passive: false });
  const end = (cancel) => {
    if (!st) return; const s = st; st = null;
    if (!s.dir) return;
    const side = s.side, j = s.i + side;
    const commit = !cancel && !!s.peek && (Math.abs(s.dx) > s.w * 0.35 || (Math.abs(s.vx) > 0.35 && Math.sign(s.vx) === Math.sign(s.dx) && Math.abs(s.dx) > 20));
    const t = tabs();
    if (t) {                                                       // the highlight glides the rest of the way, its tab lighting up now
      t.classList.remove("paging"); t.style.setProperty("--tab", String(commit ? j : s.i));
      if (commit) { t.dataset.tab = String(j); t.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === s.ids[j]))); }
    }
    settle([[v, commit ? `translateX(${-side * 100}%)` : "translateX(0)"], [s.peek, commit ? "translateX(0)" : `translateX(${side * 100}%)`]], null, commit ? 280 : 220, () => {
      if (commit) { S.navQuiet = true; go(s.ids[j]); }           // the tab drawn for real, just where its preview was
      v.style.transition = "none"; v.style.transform = "";
      s.peek?.remove(); r.classList.remove("swiping"); swipeLive = false;     // (still "live" while it glides home, so nothing tidies it early)
      void v.offsetWidth; v.style.transition = "";
    });
  };
  v.addEventListener("touchend", () => end(false)); v.addEventListener("touchcancel", () => end(true));
}
/* ---------- hold a chat (or a message) for its menu ----------
   Hold a chat in Messages (or right-click it): the row sinks a little, then
   lifts above the blurred screen with a menu of what you'd do to it without
   opening it. Hold a message in a chat: its menu, as a tap gives (as on
   iPhone). The touch that opened the menu isn't also a tap, swipe or pull. */
let heldAt = 0;
const holding = () => Date.now() - heldAt < 30e3 && heldAt > 0;
function holdRows() {
  const v = $view; let sink = 0, timer = 0, row = null, x = 0, y = 0;
  const cancel = () => { clearTimeout(sink); clearTimeout(timer); row?.classList.remove("pressing"); row = null; };
  v.addEventListener("touchstart", (e) => {
    cancel(); heldAt = 0;
    const r = e.target.closest?.(".mlist .mrow, .msgs .b[data-act]"), msg = !!r?.classList.contains("b");
    if (!r || e.touches.length !== 1 || S.view !== (msg ? "chat" : "messages") || S.sheet || $pop.firstElementChild) return;
    if (msg && e.target.closest("button, a, audio, input") !== null && e.target.closest("button") !== r) return;    // a play button or link in it has its own
    row = r; x = e.touches[0].clientX; y = e.touches[0].clientY;
    sink = setTimeout(() => row?.classList.add("pressing"), 140);
    timer = setTimeout(() => { const r2 = row; cancel(); heldAt = Date.now(); if (msg) { haptic("tick"); r2.click(); } else rowMenu(r2); }, msg ? 420 : 480);
  }, { passive: true });
  v.addEventListener("touchmove", (e) => {
    if (holding()) { if (e.cancelable) e.preventDefault(); return; }   // the list stays put under the menu
    if (row && Math.hypot(e.touches[0].clientX - x, e.touches[0].clientY - y) > 8) cancel();
  }, { passive: false });
  v.addEventListener("touchend", (e) => { if (holding() && e.cancelable) e.preventDefault(); cancel(); }, { passive: false });   // (no tap after a hold)
  v.addEventListener("touchcancel", cancel);
  // a right-click, or the menu key on a chat that has focus
  v.addEventListener("contextmenu", (e) => {
    const r = e.target.closest?.(".mlist .mrow, .msgs .b[data-act]"); if (!r) return;
    e.preventDefault();
    if (!$(".menu-pop:not(.closing)", $pop)) { if (r.classList.contains("b")) r.click(); else rowMenu(r); }
  });
}
function rowMenu(r) {
  const id = r.dataset.id, g = group(id), f = g ? null : friend(id);
  if (!g && !f) return;
  haptic("tick");
  openMenu(r, [
    (g || f).unread ? { label: "Mark as Read", icon: I.check, act: "rowread", id } : null,
    g ? { label: g.muted ? "Unmute" : "Mute", icon: I.bell, act: "rowmute", id } : null,
    g ? { label: "Group Info", icon: I.info, act: "groupinfo", id } : { label: "Info", icon: I.info, act: "friendinfo", id },
    g ? { label: "Leave Group", icon: I.minusp, act: "groupleaveask", id, destructive: true } : { label: "Remove Friend", icon: I.minusp, act: "unfriendask", id, destructive: true },
  ].filter(Boolean));
  // the chat itself, lifted clear of the blur (tap it to open the chat)
  const box = root().getBoundingClientRect(), a = r.getBoundingClientRect(), c = r.cloneNode(true);
  c.classList.remove("pressing"); c.classList.add("lifted");
  c.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  c.style.top = `${a.top - box.top}px`; c.style.left = `${a.left - box.left}px`; c.style.width = `${a.width}px`; c.style.height = `${a.height}px`;
  $(".menu-scrim", $pop)?.classList.add("blur");
  $pop.insertBefore(c, $(".menu-pop", $pop));
}
// The tab beside this one, drawn as it will be (a lifeless copy) to slide in with the swipe.
function tabPeek(id, side) {
  const p = document.createElement("main");
  p.className = `view tabs-pad tabpeek${id === "messages" ? " plain" : ""}`; p.setAttribute("aria-hidden", "true"); p.inert = true;
  p.innerHTML = id === "friends" ? vFriends() : id === "account" ? vAccount() : vMessages();
  const slot = $(".airslot", p);
  if (slot) {
    if (airEl?.classList.contains("has")) { const a = airEl.cloneNode(true); a.querySelectorAll(".enter").forEach((c) => c.classList.remove("enter")); slot.replaceWith(a); }
    else slot.remove();
  }
  p.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  p.querySelectorAll("[data-eta]").forEach((e) => { e.textContent = fmtDur(+e.dataset.eta - now()); });
  for (const [list, q] of [["m", S.q], ["f", S.fq]]) {
    const term = q.trim().toLowerCase();
    if (term) p.querySelectorAll(`[data-list="${list}"] [data-find]`).forEach((row) => { row.hidden = !row.dataset.find.includes(term); });
  }
  p.style.top = `${$view.offsetTop}px`; p.style.height = `${$view.offsetHeight}px`; p.style.transform = `translateX(${side * 100}%)`;
  $view.after(p);
  setProgress(p);
  return p;
}
/* ---------- pull to refresh (Messages and Friends) ----------
   Pull down from the top: a pigeon drops in, its wings opening as you pull.
   Let go past the line and it flaps while everything syncs. */
const PTR_AT = 70;
// Haptics: a tap of feedback. iPhone's Safari has no vibration API, but
// flipping a switch control gives the system's own tick (iOS 18 and later),
// so a hidden one is flipped; elsewhere, navigator.vibrate. Off in Appearance.
let hapticEl = null;
// The way a pigeon goes (How It Flies → Route), kept on this phone for the next one
const ROUTES = [["fastest", "Fastest", "The quickest way: around storms, riding the wind", I.wind, "blue"],
  ["scenic", "Scenic", "Past up to two landmarks for their postmarks, a little further", I.loc, "green"],
  ["safe", "Safe", "Rests on islands rather than cross long seas, and halves Pigeon Death’s risk", I.shield, "teal"]];
const routeStyle = () => { try { const v = localStorage.getItem("inflight-route"); return ROUTES.some((r) => r[0] === v) ? v : "fastest"; } catch (_) { return "fastest"; } };
const hapticsOn = () => { try { return localStorage.getItem("inflight-haptics") !== "0"; } catch (_) { return true; } };
function haptic(kind = "tick") {
  if (!hapticsOn()) return;
  try {
    if (navigator.vibrate && !/iPhone|iPad/.test(navigator.userAgent)) { navigator.vibrate(kind === "success" ? [10, 70, 16] : kind === "heavy" ? [22, 40, 22] : 8); return; }
    if (!hapticEl) { hapticEl = document.createElement("label"); hapticEl.className = "hapt"; hapticEl.setAttribute("aria-hidden", "true"); hapticEl.innerHTML = '<input type="checkbox" switch tabindex="-1">'; document.body.appendChild(hapticEl); }
    // (flipping it would take the focus: it goes straight back to wherever it was, for a keyboard or VoiceOver)
    const tap = () => { const a = document.activeElement; hapticEl.click(); if (a && a !== document.body && a !== document.activeElement && a.isConnected) a.focus({ preventScroll: true }); };
    tap();
    if (kind === "success" || kind === "heavy") setTimeout(tap, kind === "heavy" ? 60 : 110);
  } catch (_) { /* no haptics here */ }
}
function pullToRefresh() {
  const v = $view, ind = $(".ptr", root()), bird = $(".ptrb", ind);
  let y0 = null, x0 = 0, down = false, pull = 0, ready = false, busy = false;
  const can = () => (S.view === "messages" || S.view === "friends") && !S.sheet && !busy && !zoomed();
  const show = (px, anim) => {
    for (const el of [v, ind]) { el.classList.toggle("ptr-anim", !!anim); el.style.transition = anim ? "" : "none"; }
    v.style.transform = px ? `translateY(${px}px)` : "";
    ind.style.transform = `translateY(${px / 2 - 19}px)`;                 // in the middle of the gap that opens
    ind.style.opacity = String(Math.min(1, px / 40));
    bird.style.setProperty("--w", String(0.35 + 0.65 * Math.min(1, px / PTR_AT)));
    bird.style.setProperty("--r", `${Math.min(1, px / PTR_AT) * -14}deg`);
  };
  v.addEventListener("touchstart", (e) => { y0 = e.touches.length === 1 && v.scrollTop <= 0 && can() ? e.touches[0].clientY : null; x0 = e.touches[0]?.clientX || 0; down = false; pull = 0; ready = false; }, { passive: true });
  v.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    if (holding() && !pull) { y0 = null; return; }
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!down) {                                          // sideways is a swipe to the next tab, not a pull
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) >= Math.abs(dy)) { y0 = null; return; }
      down = true;
    }
    if (dy <= 0 || v.scrollTop > 0) { if (pull) { pull = 0; show(0); } return; }
    e.preventDefault();                                   // ours, not the page's own bounce
    pull = Math.min(130, dy * 0.5);
    if (!ready && pull >= PTR_AT) { ready = true; ind.classList.add("ready"); haptic("tick"); }
    else if (ready && pull < PTR_AT) { ready = false; ind.classList.remove("ready"); }
    show(pull);
  }, { passive: false });
  const end = async () => {
    if (y0 == null) return; y0 = null;
    ind.classList.remove("ready");
    if (pull < PTR_AT) { show(0, true); return; }
    busy = true; ind.classList.add("busy"); show(PTR_AT - 6, true);
    try { await Promise.all([sync(), new Promise((r) => setTimeout(r, 700))]); } catch (_) {}
    ind.classList.remove("busy"); busy = false; show(0, true);
  };
  v.addEventListener("touchend", end); v.addEventListener("touchcancel", end);
}
/* ---------- getting around by touch ----------
   As on iPhone: swipe in from the left edge to go back (the screen you came
   from shows underneath as you go), swipe a sheet down to close it, swipe a
   photo away, flick a banner up, and tap any empty space to put the keyboard
   away. Escape closes whatever is on top, for a keyboard. */
const EDGE = 28;                                                   // how near the left edge a back swipe starts
const speed = (st, x, y) => { const t = performance.now(), dt = Math.max(1, t - st.lt); st.vx = (x - st.lx) / dt; st.vy = (y - st.ly) / dt; st.lx = x; st.ly = y; st.lt = t; };
// A finger lets go of what it was moving: it carries on where it was going on the sheets' curve (--nav), as long as it
// takes to start at about the finger's own speed: a flick quickly, a slow push gently (within lo to hi ms), the
// curve's first handle tilted to match (--nav is .32,.72,0,1: it starts at 2.25 times its average pace), so nothing
// lurches as it's let go. left: px still to go; v: px/ms towards there.
const flick = (left, v, lo = 180, hi = 380) => {
  const d = Math.abs(left), u = Math.max(0, v), ms = Math.round(Math.min(hi, Math.max(lo, d > 1 ? (2.25 * d) / Math.max(0.05, u) : lo)));
  return { ms, ease: `cubic-bezier(.32,${(d > 1 ? Math.min(1, Math.max(0.12, (0.32 * u * ms) / d)) : 0.72).toFixed(3)},0,1)` };
};
// (the finger held still a moment before it let go: no speed left in it)
const leftSpeed = (st, v) => (performance.now() - st.lt > 80 ? 0 : v);
// ease: the curve (--nav if none). Reduce Motion: a short settle into place, not a jump (marked important: past the
// rule that stops every transition)
const settle = (els, ease, ms, then) => {
  const quick = STILL.matches, t = quick ? "transform 150ms ease-out, opacity 150ms ease" : `transform ${ms}ms ${ease || cssVar(document.documentElement, "--nav") || "ease-out"}, opacity ${ms}ms ease`;
  for (const [el, tf, op] of els) { if (!el) continue; el.style.setProperty("transition", t, quick ? "important" : ""); el.style.transform = tf; if (op != null) el.style.opacity = op; }
  setTimeout(then, (quick ? 150 : ms) + 30);                       // (a beat over, so the last frame has landed)
};
const unstyle = (...els) => { for (const el of els) if (el) { el.style.transition = el.style.transform = el.style.opacity = el.style.animation = ""; } };
// what you'd see behind the screen you're on: the one you came from, as you left it
function underlay() {
  const u = S.under, box = document.createElement("div"), inner = document.createElement("div");
  box.className = `under${u?.plain ? " plain" : ""}`; box.setAttribute("aria-hidden", "true"); box.inert = true;
  // (the screen in a box of its own inside: the outer one is cut off at the edge of the screen you're swiping, styles.css)
  inner.className = "ghost-in"; box.append(inner);
  if (u) {
    // copies (not re-parsed HTML), so the page's own styling comes along
    const v = u.node.cloneNode(true); v.classList.remove("nav-push", "nav-pop", "nav-fade", "swiped"); v.style.transform = "";
    v.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id")); inner.append(v);
    if (u.tabs) { const t = u.tabs.cloneNode(true); t.hidden = false; inner.append(t); }
    requestAnimationFrame(() => { v.scrollTop = u.top; });
  }
  const dim = document.createElement("div"); dim.className = "under-dim"; box.append(dim);
  root().prepend(box);
  return box;
}
function edgeBack() {
  const r = root(); let st = null;
  const backBtn = () => (S.sheet || $pop.firstElementChild || S.locked || onceOpen ? null : $(".nb-left .nbtn.back", $view));
  const moving = () => [$view, $compose.hidden ? null : $compose];
  const place = (s2, dx) => {
    const p = Math.min(1, dx / s2.w);
    for (const el of moving()) if (el) el.style.transform = `translateX(${dx}px)`;
    // (the screen behind 28% aside and coming back, its box's edge at your finger)
    s2.box.style.transform = `translateX(${dx - s2.w}px)`; s2.box.firstChild.style.transform = `translateX(${0.72 * (s2.w - dx)}px)`;
    s2.box.lastChild.style.opacity = String(0.14 * (1 - p));
    const past = dx > s2.w * 0.35; if (past !== s2.past) { s2.past = past; if (past) haptic("tick"); }
  };
  r.addEventListener("touchstart", (e) => {
    st = null;
    const t = e.touches[0]; if (e.touches.length !== 1 || t.clientX - r.getBoundingClientRect().left > EDGE || zoomed()) return;
    const b = backBtn(); if (b) st = { b, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, lt: performance.now(), vx: 0, dx: 0, w: r.clientWidth, dir: null };
  }, { passive: true });
  r.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (dx <= 0 || Math.abs(dy) > dx) { st = null; return; }
      st.dir = "x"; st.box = underlay(); r.classList.add("swiping");
      for (const el of moving()) if (el) { el.style.transition = "none"; el.classList.add("swiped"); }
    }
    e.preventDefault(); speed(st, t.clientX, t.clientY);
    st.dx = Math.max(0, dx); place(st, st.dx);
  }, { passive: false });
  const end = (cancel) => {
    if (!st) return; const s2 = st; st = null;
    if (!s2.dir) return;
    const vx = leftSpeed(s2, s2.vx), go = !cancel && (s2.dx > s2.w * 0.35 || (vx > 0.45 && s2.dx > 24));
    const els = moving(), f = go ? flick(s2.w - s2.dx, vx, 180, 360) : flick(s2.dx, -vx, 160, 300);
    const done = () => {
      if (go) { S.navQuiet = true; s2.b.click(); }
      // back in place in one step: the screen's own transition mustn't replay the slide
      for (const el of els) if (el) { el.style.transition = "none"; el.style.transform = el.style.opacity = ""; el.classList.remove("swiped"); }
      s2.box.remove(); r.classList.remove("swiping");
      void $view.offsetWidth;
      for (const el of els) if (el) el.style.transition = "";
    };
    settle([...els.map((el) => [el, go ? "translateX(100%)" : "translateX(0)"]), [s2.box, go ? "translateX(0)" : "translateX(-100%)"],
      [s2.box.firstChild, go ? "translateX(0)" : "translateX(72%)"], [s2.box.lastChild, null, go ? "0" : "0.14"]], f.ease, f.ms, done);
  };
  r.addEventListener("touchend", () => end(false)); r.addEventListener("touchcancel", () => end(true));
}
function sheetDrag() {
  let st = null;
  $layer.addEventListener("touchstart", (e) => {
    st = null;
    const sh = e.target.closest?.(".sheet"), t = e.touches[0];
    if (!sh || sh.classList.contains("closing") || e.touches.length !== 1 || zoomed()) return;
    const body = $(".body", sh), head = !!e.target.closest(".grab, .sheet > header");
    // from its top, or anywhere once it's scrolled to the top (not on the map, a field or a list that slides sideways)
    if (!head && (!body || body.classList.contains("flush") || body.scrollTop > 0 || e.target.closest("input, textarea, select, canvas, .gifgrid"))) return;
    st = { sh, body, head, scrim: $(".scrim", $layer), y: t.clientY, x: t.clientX, lx: t.clientX, ly: t.clientY, lt: performance.now(), vy: 0, dy: 0, h: sh.offsetHeight, dir: null };
  }, { passive: true });
  $layer.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (dy <= 0 || Math.abs(dx) > dy || (!st.head && st.body.scrollTop > 0)) { st = null; return; }
      st.dir = "y"; st.sh.style.transition = "none"; if (st.scrim) st.scrim.style.transition = "none";
      document.activeElement?.blur?.();
    }
    e.preventDefault(); speed(st, t.clientX, t.clientY);
    st.dy = Math.max(0, dy);
    st.sh.style.transform = `translateY(${st.dy}px)`;
    if (st.scrim) st.scrim.style.opacity = String(Math.max(0, 1 - st.dy / st.h));
  }, { passive: false });
  const end = (cancel) => {
    if (!st) return; const s2 = st; st = null;
    if (!s2.dir) return;
    const vy = leftSpeed(s2, s2.vy), go = !cancel && (s2.dy > s2.h * 0.25 || (vy > 0.6 && s2.dy > 40));
    // (Reduce Motion: it fades from where it's been dragged to, as the ✕ does: styles.css)
    if (go && STILL.matches) return closeTop();
    const f = go ? flick(s2.h - s2.dy, vy) : flick(s2.dy, -vy, 160, 320);
    settle([[s2.sh, go ? "translateY(100%)" : "translateY(0)"], [s2.scrim, "", go ? "0" : "1"]], f.ease, f.ms, () => {
      if (!go) { unstyle(s2.sh, s2.scrim); return; }
      // already out of sight: closing shouldn't play its own slide again
      s2.sh.style.animation = "none"; if (s2.scrim) s2.scrim.style.animation = "none";
      closeTop();
    });
  };
  $layer.addEventListener("touchend", () => end(false)); $layer.addEventListener("touchcancel", () => end(true));
}
// the photo: swipe it away, up or down
function viewerDrag() {
  let st = null;
  $layer.addEventListener("touchstart", (e) => {
    const v = e.target.closest?.(".viewer"); st = null;
    if (v && e.touches.length === 1 && !zoomed()) st = { v, img: $("img", v), y: e.touches[0].clientY, x: e.touches[0].clientX, ly: e.touches[0].clientY, lx: e.touches[0].clientX, lt: performance.now(), vy: 0, dy: 0, dir: null };
  }, { passive: true });
  $layer.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.dir) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; if (Math.abs(dx) > Math.abs(dy)) { st = null; return; } st.dir = "y"; st.img.style.transition = st.v.style.transition = "none"; }
    e.preventDefault(); speed(st, t.clientX, t.clientY); st.dy = dy;
    st.img.style.transform = `translateY(${dy}px) scale(${1 - Math.min(0.2, Math.abs(dy) / 1500)})`;
    st.v.style.backgroundColor = `rgba(0,0,0,${Math.max(0.35, 1 - Math.abs(dy) / 500)})`;
  }, { passive: false });
  $layer.addEventListener("touchend", () => {
    if (!st) return; const s2 = st; st = null;
    if (!s2.dir) return;
    const vy = leftSpeed(s2, s2.vy), down = s2.dy > 0;
    if (Math.abs(s2.dy) > 90 || Math.abs(vy) > 0.7) {
      // away the way it was flicked, the black fading with it (Reduce Motion: it all fades where it is)
      if (STILL.matches) { S.sheet = null; return renderSheet(); }
      const f = flick(s2.v.clientHeight * 1.1 - Math.abs(s2.dy), down ? vy : -vy, 160, 320);
      settle([[s2.img, `translateY(${down ? "" : "-"}110vh)`], [s2.v, "", "0"]], f.ease, f.ms, () => { s2.v.style.animation = "none"; s2.v.style.opacity = "0"; S.sheet = null; renderSheet(); });
    } else {
      const f = flick(Math.abs(s2.dy), down ? -vy : vy, 160, 300);
      s2.v.style.setProperty("transition", `background-color ${STILL.matches ? 150 : f.ms}ms ease`, STILL.matches ? "important" : ""); s2.v.style.backgroundColor = "";
      settle([[s2.img, "translateY(0)"]], f.ease, f.ms, () => { unstyle(s2.img, s2.v); });
    }
  });
}
// a banner: flick it up and it goes
function toastSwipe() {
  let st = null;
  $toast.addEventListener("touchstart", (e) => {
    const t = e.target.closest?.(".toast"); st = t && e.touches.length === 1 && !zoomed() ? { t, y: e.touches[0].clientY, ly: e.touches[0].clientY, lx: 0, lt: performance.now(), vy: 0, dy: 0 } : null;
    if (st) clearTimeout(toastTimer);
  }, { passive: true });
  $toast.addEventListener("touchmove", (e) => {
    if (!st) return;
    const y = e.touches[0].clientY; speed(st, 0, y); st.dy = y - st.y;
    if (Math.abs(st.dy) < 4) return;
    e.preventDefault(); st.t.style.animation = "none"; st.t.style.transition = "none";
    st.t.style.transform = `translateY(${st.dy < 0 ? st.dy : st.dy * 0.2}px)`;
  }, { passive: false });
  $toast.addEventListener("touchend", () => {
    if (!st) return; const s2 = st; st = null;
    if (s2.dy < -24 || s2.vy < -0.4) settle([[s2.t, "translateY(-160%)", "0"]], null, 200, () => s2.t.remove());
    // (back where it was: its drop-in mustn't play again, so only the drag's own styles come off)
    else { settle([[s2.t, "translateY(0)"]], null, 200, () => { s2.t.style.transition = s2.t.style.transform = ""; }); toastTimer = setTimeout(hideToast, 3000); }
  });
}
// close the sheet on top the way its ✕ would (so drafts, questions and Back all behave)
function closeTop() {
  const sc = $(".sheet ~ .scrim, .scrim", $layer);
  if (sc) return sc.click();
  const b = document.createElement("button"); b.hidden = true; b.dataset.act = "close"; root().append(b); b.click(); b.remove();
}
function navGestures() {
  edgeBack(); sheetDrag(); viewerDrag(); toastSwipe();
  // tapping somewhere empty puts the keyboard away
  document.addEventListener("click", (e) => {
    const a = document.activeElement;
    if (a === $ta && performance.now() - focusedAt < 700) return;          // a stray tap as the keyboard arrives isn't "put it away"
    if (!inField(a) || e.target === a || e.target.closest?.("input, textarea, select, button, a, label, [data-act], [contenteditable], .field-wrap, .compose, .fcell, .search")) return;
    a.blur();
  });
  // Escape: the menu or question first, then the sheet, then back
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (onceOpen) { onceOpen.el.click(); return; }   // a view-once photo closes first
    if ($pop.firstElementChild) { closePop(); return; }
    if (S.sheet) { closeTop(); return; }
    if (inField(document.activeElement)) { document.activeElement.blur(); return; }
    $(".nb-left .nbtn.back", $view)?.click();
  });
}
function lockPage() {
  document.addEventListener("touchstart", () => {}, { passive: true });    // lets :active press states show on iPhone
  // two fingers zoom the page, for reading small words: not on the map, which pinches itself (mapGestures; and iPhone's
  // own gesture events, stopped there too)
  ["gesturestart", "gesturechange", "gestureend"].forEach((n) => document.addEventListener(n, (e) => { if (e.target?.closest?.(".map")) e.preventDefault(); }, { passive: false }));
  // a quick second tap in the same spot zooms on older iOS: stop that, and only that.
  // (Not after a scroll or a tap somewhere else, and never on anything you can
  // tap: those taps are meant, and touch-action already keeps them from zooming.)
  let last = null, start = null;
  document.addEventListener("touchstart", (e) => { const t = e.touches[0]; start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true, capture: true });
  document.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0], now = Date.now(), tap = !!start && !!t && Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10;
    if (tap && last && now - last.at < 300 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 30
      && !e.target.closest?.(".map, input, textarea, select, button, label, a, [data-act], [role=button]")) e.preventDefault();
    last = tap && t ? { at: now, x: t.clientX, y: t.clientY } : null;
  }, { passive: false });
  for (const n of ["copy", "cut", "contextmenu", "selectstart", "dragstart"]) document.addEventListener(n, (e) => { if (!inField(e.target)) e.preventDefault(); });
}
// pinched in: a finger moves you round the bigger page, so the app's own swipes and pulls wait till it's back to size
const zoomed = () => (window.visualViewport?.scale || 1) > 1.01;
// What you press shows it at once (a little smaller and a shade deeper, .down),
// and long enough to see on a quick tap: the phone's own pressed look comes late,
// or not at all, for a tap that's over in a moment.
function pressFeedback(el) {
  let held = null, at = 0;
  const release = () => { const b = held; if (!b) return; held = null; setTimeout(() => b.classList.remove("down"), Math.max(0, 120 - (performance.now() - at))); };
  el.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled || !el.contains(b)) return;
    release(); held = b; at = performance.now(); b.classList.add("down");
  }, { passive: true });
  for (const n of ["pointerup", "pointercancel"]) el.addEventListener(n, release, { passive: true });
  window.addEventListener("blur", release);
}
// The message box, to the touch: a tap anywhere on it (or just above it) puts
// you in it, even if the finger drifts a little, and a finger that drifts on
// it never drags the screen along. Only a long message scrolls, inside its box.
let focusedAt = 0;
function composeTouch() {
  const TAP = 30;
  let t0 = null;
  $compose.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    t0 = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, at: performance.now(), scrolls: e.target === $ta && $ta.scrollHeight > $ta.clientHeight + 1, far: false, moved: false, select: false } : null;
  }, { passive: true });
  $compose.addEventListener("touchmove", (e) => {
    if (!t0) return;
    const p = e.touches[0], d = Math.hypot(p.clientX - t0.x, p.clientY - t0.y);
    // held still first, then moved in the words: that's choosing text or the caret, leave it be
    if (!t0.moved && d > 8) { t0.moved = true; t0.select = e.target === $ta && document.activeElement === $ta && performance.now() - t0.at > 350; }
    if (d > TAP) t0.far = true;
    if (!t0.scrolls && !t0.select && e.cancelable && !zoomed()) e.preventDefault();      // the screen stays where it is (pinched in, it moves: lockPage)
  }, { passive: false });
  $compose.addEventListener("touchend", (e) => {
    const s = t0; t0 = null;
    if (!s || s.far || $ta.disabled || $compose.hidden || !$(".crow", $compose)?.offsetParent) return;
    if (e.target.closest("button, a, input, select, label, .recbar")) return;
    if (e.target === $ta && document.activeElement === $ta) return;        // already typing: the caret goes where you tapped
    // Not yet typing: focus it here, inside the touch (iOS only shows the keyboard for that), and cancel the
    // phone's own tap that would follow. That late tap is hit-tested after the screen has shifted for the
    // keyboard, so it can land on the messages above and put the keyboard straight away again.
    e.preventDefault();
    focusedAt = performance.now();
    $ta.focus(); const n = $ta.value.length; $ta.setSelectionRange(n, n);
  }, { passive: false });
  $compose.addEventListener("touchcancel", () => { t0 = null; }, { passive: true });
  // the press that follows a tap (or a click) around the words never takes the focus out of them
  $compose.addEventListener("mousedown", (e) => {
    if (e.target === $ta || e.target.closest("button, a, input, select, label, .recbar")) return;
    e.preventDefault();
    if (document.activeElement !== $ta && !$ta.disabled && $(".crow", $compose)?.offsetParent) { $ta.focus(); const n = $ta.value.length; $ta.setSelectionRange(n, n); }
  });
  // iOS can leave the page nudged up once the keyboard has gone: put it back
  $ta.addEventListener("blur", () => setTimeout(() => { if (window.scrollY && document.activeElement !== $ta && !zoomed()) window.scrollTo(0, 0); }, 80));
}
function mount() {
  lockPage();
  setTimeout(() => { pullToRefresh(); tabSwipe(); holdRows(); navGestures(); });
  root().innerHTML = `
    <div class="offline" role="status" aria-hidden="true">You’re offline. Pigeons will wait.</div>
    <div class="ptr" aria-hidden="true"><span class="ptrb">${I.bird}</span></div>
    <main class="view"></main>
    <form class="compose" hidden data-form="compose">
      <div class="note" hidden></div>
      <div class="wxplan" hidden></div>
      <div class="attach" hidden></div>
      <div class="replybar" hidden></div>
      <div class="crow">
        <button type="button" class="plus" data-act="attachmenu" aria-label="Add a photo">${I.plus}</button>
        <div class="field-wrap">
          <button type="button" class="kind" data-act="flysheet" aria-haspopup="dialog" hidden></button>
          <textarea rows="1" placeholder="Message" aria-label="Message" id="msg" maxlength="2000" enterkeyhint="enter"></textarea>
          <button type="submit" class="send" aria-label="Release the pigeon">${I.up}</button>
          <button type="button" class="mic" data-act="recstart" aria-label="Record a voice pigeon" hidden>${I.mic}</button>
        </div>
      </div>
      <div class="recbar" hidden role="group" aria-label="Recording a voice pigeon">
        <button type="button" class="reccancel" data-act="reccancel" aria-label="Cancel recording">${I.trash}</button>
        <span class="recdot" aria-hidden="true"></span><span class="rectime" aria-live="off">0:00</span>
        <span class="recwave" aria-hidden="true"></span>
        <button type="button" class="send recsend" data-act="recsend" aria-label="Send voice pigeon">${I.up}</button>
      </div>
    </form>
    <nav class="tabbar" aria-label="Sections"></nav>
    <input type="file" accept="image/*" id="file-lib" hidden>

    <div class="layer"></div>
    <div class="poplayer"></div>
    <div class="toasts" role="status" aria-live="polite"></div>`;
  $view = $(".view"); $compose = $(".compose"); $tabbar = $(".tabbar"); $layer = $(".layer"); $pop = $(".poplayer"); $toast = $(".toasts"); $ta = $("#msg");
  pressFeedback($compose); composeTouch();
  // (once played, a badge's bounce and the highlight's squish are done: the bar coming back doesn't replay them)
  $tabbar.addEventListener("animationend", (e) => { if (e.target.classList.contains("badge")) e.target.classList.remove("new"); if (e.animationName === "squish") e.target.classList.remove("moving"); });
  $view.addEventListener("scroll", () => {
    const y = $view.scrollTop;
    const root = !!$view.querySelector(".navbar.root");      // its title shares the bar's row
    $view.classList.toggle("scrolled", y > (root ? 20 : 4));
    $view.classList.toggle("titled", y > (root ? 34 : 38));
    S.stick = $view.scrollHeight - y - $view.clientHeight < 40;
    if (S.stick) newPill(false);
  }, { passive: true });
  root().addEventListener("click", onClick);
  root().addEventListener("change", onChange);
  root().addEventListener("submit", onSubmit);
  root().addEventListener("input", onInput);
  $ta.addEventListener("input", () => { fitTa(); renderCompose(); });
  // With the keyboard up the home bar is hidden, so drop its spacing and sit the
  // message box right on the keyboard. Touch screens only: there's no keyboard to clear otherwise.
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  const typing = (on) => { if (touch) root().classList.toggle("typing", on); };
  $ta.addEventListener("focus", () => { focusedAt = performance.now(); typing(true); });
  $ta.addEventListener("blur", () => typing(false));
  window.visualViewport?.addEventListener?.("resize", () => {          // keyboard closed without leaving the box
    if (window.innerHeight - window.visualViewport.height < 80 && document.activeElement !== $ta) typing(false);
  });
  fitKeyboard();
  fitScreen();
}
// On the Home Screen, running up behind the status bar, iOS can lay the page out shorter than the screen (by the
// status bar's height, or a Safari toolbar's), and change its mind on its own (after a while away, or the keyboard),
// so the list stops short with a band under it: there (an iPhone or iPad, filling the screen), Chat is sized to the
// screen itself, as Mail is (styles.css html.fullscreen-fix; the keyboard's own height still wins while it's up)
let screenFitted = false;
function fitScreen() {
  if (screenFitted || navigator.standalone !== true || !screen.width || !screen.height) return;
  screenFitted = true;
  const doc = document.documentElement;
  const fit = () => {
    const portrait = matchMedia("(orientation: portrait)").matches;
    const w = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const h = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    // (only when the window is the whole screen, not an iPad window beside another app)
    const whole = Math.abs(window.innerWidth - w) < 2;
    doc.classList.toggle("fullscreen-fix", whole);
    if (whole) doc.style.setProperty("--screen-h", `${h}px`);
    if (window.scrollY) window.scrollTo(0, 0);
  };
  fit();
  for (const ev of ["resize", "pageshow", "focus"]) window.addEventListener(ev, fit);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && fit());
  window.addEventListener("orientationchange", () => setTimeout(fit, 300));
}
// iOS doesn't shrink the page for the keyboard: it slides the whole page up
// under it, taking the chat's header and Back off the top of the screen. So
// while the keyboard is up, the app is made exactly as tall as the space above
// it, and the page is put back at the top whenever iOS nudges it; the message
// box then sits right on the keyboard and everything above stays in view.
function fitKeyboard() {
  const vv = window.visualViewport; if (!vv || !matchMedia("(pointer: coarse)").matches) return;
  const doc = document.documentElement;
  let raf = 0, was = false;
  const fit = () => {
    raf = 0;
    // (pinched in, the page is where you've moved it: fitted again once it's back to size; and a finger on the message
    // box moves it too, styles.css html.zoomed)
    if (doc.classList.toggle("zoomed", zoomed())) return;
    const kb = window.innerHeight - vv.height > 80 && inField(document.activeElement);
    if (kb) doc.style.setProperty("--app-h", `${Math.round(vv.height)}px`); else doc.style.removeProperty("--app-h");
    doc.classList.toggle("kbup", kb);
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    // the newest message stays in sight as the keyboard comes up (if that's where you were)
    if (kb && !was && S.view === "chat" && S.stick && $view) $view.scrollTop = $view.scrollHeight;
    was = kb;
  };
  const soon = () => { if (!raf) raf = requestAnimationFrame(fit); };
  vv.addEventListener("resize", soon); vv.addEventListener("scroll", soon);
  window.addEventListener("scroll", soon, { passive: true });
  document.addEventListener("focusin", () => { soon(); setTimeout(fit, 350); });     // (and once the keyboard has finished arriving)
  document.addEventListener("focusout", () => setTimeout(fit, 60));
}
function fitTa() {
  if (!$ta.offsetParent) { $ta.style.height = ""; return; }       // hidden (not in a chat): nothing to measure yet
  // empty: one line, however long the hint ("Lands tomorrow 01:15" mustn't make the box two lines tall)
  $ta.style.height = "auto"; $ta.style.height = $ta.value ? Math.min(120, $ta.scrollHeight) + "px" : "";
  composeGlide();
}
// The composer grows or shrinks (a new line, a reply bar, a photo's card, the recording bar): it, and the chat above it
// when you're at the newest message, slide to their new places instead of jumping (and from where they are, if they
// were sliding already). In a redraw the chat's own glide covers its part (playKeyed), so only the composer moves then.
let composeH = 0, inRender = false;
function composeGlide() {
  if (!$compose) return;
  const h = $compose.hidden ? 0 : $compose.offsetHeight, was = composeH; composeH = h;
  if (!h || !was || h === was || Math.abs(h - was) > 240 || STILL.matches || $compose.classList.contains("nav-push")) return;
  const f = [{ transform: `translateY(${h - was}px)` }, { transform: "none" }], o = { duration: 280, easing: kEases().move };
  kPlay($compose, f, o);
  const m = !inRender && S.view === "chat" && S.stick && $(".msgs", $view); if (m) kPlay(m, f, o);
}
function renderOffline() { const o = $(".offline"); if (o) { o.classList.toggle("on", !!S.offline); o.setAttribute("aria-hidden", String(!S.offline)); } }

function go(view, chat) {
  const same = view === S.view && chat === S.chat, kind = !same && $view ? navKind(S.view, view) : null;
  if (!same && $view) S.nav = S.navQuiet ? null : kind;
  S.noRise = S.navQuiet; S.navQuiet = false;
  if (!S.locked) ghostView();   // copy the old screen now, before anything about it changes
  // going in: keep a still of this screen, to show under a swipe back, and remember where back goes
  if (kind === "push" && S.view !== "chat") {
    S.under = { from: S.view, node: $view.cloneNode(true), top: $view.scrollTop, plain: root().classList.contains("plain"), tabs: $tabbar.hidden ? null : $tabbar.cloneNode(true) };
    if (view === "chat") S.backTo = ["messages", "friends", "account"].includes(S.view) ? S.view : "messages";
  }
  const backTop = !same && S.under && view === S.under.from && S.view !== view ? S.under.top : null;
  // what you'd typed stays with its chat, for when you come back (not words going up with a photo or a voice pigeon)
  if (!same && $ta && S.view === "chat" && S.chat && !(S.busy && S.sending && S.sendingTo === S.chat)) { const v = $ta.value; if (v.trim()) S.drafts.set(S.chat, v); else S.drafts.delete(S.chat); }
  if (!same && rec) recStop(false);                // a recording never carries on (or sends) after you leave its chat
  if (!same) newPill(false);
  S.chatWas = S.chat;
  S.view = view; S.chat = chat ?? null; S.sheet = null; S.err = ""; S.stick = true;
  if (!same && TABS.some(([id]) => id === view) && S.token && Date.now() - (S.lastSync || 0) > 2000) setTimeout(sync, 0);   // a tab you switch to is up to date
  if (view !== "chat" || chat !== S.chatWas) clearAttach();      // (a photo you'd picked stays with its chat; one being sent goes on)
  if (!same && $ta) $ta.value = (view === "chat" && chat && S.drafts.get(chat)) || "";
  // (something another app sent here to be shared, as Markets's Send in Chat does: into the first chat you open)
  if (!same && $ta && view === "chat" && chat && S.share) { $ta.value = ($ta.value.trim() ? `${$ta.value.trimEnd()}\n` : "") + S.share; S.share = null; }
  closePop();
  if (!same && $view) { $view.scrollTop = 0; $view.classList.remove("scrolled", "titled"); }
  render();
  if (!same && $ta) fitTa();                                      // (after render: the composer is showing now)
  if (!same && !S.sheet && !AUTH_VIEWS.has(view)) focusTitle();
  if (backTop != null) { $view.scrollTop = backTop; S.under = null; }   // back where you were
  if (view === "chat" && chat && !S.msgs.has(chat) && S.chatRaw.has(chat)) applyChat(chat, S.chatRaw.get(chat), false).then(() => { if (S.view === "chat" && S.chat === chat) render(); });
  const shown = view === "chat" && chat && (S.msgs.get(chat) || []).length > 0;
  if (view === "chat" && chat) loadChat(chat).then(() => {
    // from the In the air strip: straight on to the map
    const id = S.mapNext; S.mapNext = null;
    if (id && S.chat === chat && (S.msgs.get(chat) || []).some((x) => x.id === id)) S.sheet = { type: "map", id };
    // (a chat already on screen gets its fresh copy once it has slid in: redrawing it mid-slide made it stutter)
    const wait = shown && !S.sheet ? NAV_MS + 20 - (performance.now() - navAt) : 0;
    if (wait > 0) setTimeout(() => { if (S.view === "chat" && S.chat === chat) render(); }, wait); else render();
  }).catch((e) => { if (!e.offline) toast(esc(e.message)); });    // (offline: the banner says so)
}

// How the screen changes, as on iPhone: a chat pushes in from the side and pops
// back; auth steps push forward (back to the start pops); tabs slide a touch
// toward the one you picked as they cross-fade.
function navKind(from, to) {
  if (!from || from === "loading") return null;
  if (to === "chat") return "push";
  if (from === "chat") return "pop";
  if (AUTH_VIEWS.has(to) && AUTH_VIEWS.has(from)) return to === "welcome" ? "pop" : "push";
  const a = TABS.findIndex(([id]) => id === from), b = TABS.findIndex(([id]) => id === to);
  if (a >= 0 && b >= 0) return b > a ? "tab-r" : "tab-l";
  return "fade";
}
let navAt = -1e9;                                  // when the last push or pop began (styles.css: .5s)
const NAV_MS = 500;
// For a push or pop, the old screen stays for a moment as a lifeless copy: it
// slides aside under a new chat, or slides away to reveal the screen behind.
function ghostView() {
  const tab = S.nav === "tab-r" || S.nav === "tab-l", fade = S.nav === "fade";
  if (S.nav !== "push" && S.nav !== "pop" && !tab && !fade) return;
  if (STILL.matches) return;                       // less motion: no copy left sliding (it would only sit there, frozen)
  $(".nav-ghost", root())?.remove();
  // the whole old screen: its list or chat, and the tab bar or composer that belongs to it (a tab: just its list,
  // under the new one as it fades in, the tab bar staying where it is)
  const g = document.createElement("div"), inner = document.createElement("div"), v = $view.cloneNode(true), top = $view.scrollTop;
  g.className = `nav-ghost nav-ghost-${tab || fade ? "tab" : S.nav}${root().classList.contains("plain") ? " plain" : ""}`; g.setAttribute("aria-hidden", "true"); g.inert = true;
  inner.className = "ghost-in"; g.append(inner);          // (going under a new chat, cut off at its edge: styles.css)
  v.classList.remove("nav-push", "nav-pop", "nav-fade", "nav-tab-r", "nav-tab-l"); inner.append(v);
  if (!tab && !$compose.hidden) { const c = $compose.cloneNode(true), t = $("textarea", c); if (t && $ta) t.value = $ta.value; inner.append(c); }
  if (!tab && !$tabbar.hidden) { const t = $tabbar.cloneNode(true); t.classList.remove("rise", "back"); inner.append(t); }
  g.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
  g.style.top = `${$view.offsetTop}px`;
  $view.before(g); v.scrollTop = top;
  g.addEventListener("animationend", (e) => { if (e.target === g) g.remove(); });
  setTimeout(() => g.remove(), 900);
}
function animateNav() {
  const kind = S.nav; S.nav = null;
  if (!kind) return;
  const els = kind === "push" && S.view === "chat" ? [$view, $compose] : [$view];
  navAt = performance.now();                       // (news waits for any change of screen to finish: calmRender)
  for (const el of els) {
    el.classList.remove("nav-push", "nav-pop", "nav-fade", "nav-tab-r", "nav-tab-l"); void el.offsetWidth;
    el.classList.add("nav-" + kind);
    if (STILL.matches) continue;                                     // (no animation runs, so nothing would ever end it)
    el.addEventListener("animationend", function done(e) { if (e.target === el) { el.classList.remove("nav-" + kind); el.removeEventListener("animationend", done); } });
  }
}
// A message picked out (a search result, a quote's original) flashes; a redraw mid-flash carries it on (playFresh)
function flashMsg(el, id) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); S.flashMid = { id, at: Date.now() }; }
// New bubbles pop in once; if the list redraws mid-animation, carry on from where it was.
function playFresh() {
  const t = Date.now();
  for (const [id, at] of S.fresh) if (t - at > 700) S.fresh.delete(id);
  $view.querySelectorAll("[data-fresh]").forEach((el) => { const at = S.fresh.get(el.dataset.fresh); if (at) el.style.animationDelay = `${at - t}ms`; else el.classList.remove("fresh"); });
  $view.querySelectorAll("img.arrive[data-born]").forEach((el) => { el.style.animationDelay = `${+el.dataset.born - t}ms`; });
  const f = S.flashMid, el = f && t - f.at < 1100 && S.view === "chat" && $(`[data-mid="${CSS.escape(f.id)}"]`, $view);
  if (el) { el.classList.add("flash"); el.style.animationDelay = `${f.at - t}ms`; }
}
/* ---------- a redraw that moves ----------
   render() draws the screen anew, so on its own a row that moved up, a pigeon that landed or a count that went up
   would just be there. What matters carries a key (data-key), what it says (data-sig) and how it arrives (data-in): just
   before a redraw where each is on screen is noted, and after it what moved glides from where it was (from where it is
   now, if it was still gliding), what's new fades in (dots and pills pop), what changed dissolves into its new self, a
   pigeon that's landed comes down, and what went fades out where it was. A list that moved as one glides as one. */
// (the key on a piece of markup's first element)
const kTag = (html, k, sig) => html.replace(/^(\s*<[a-z]+)/, `$1 data-key="${k}"${sig != null ? ` data-sig="${sig}"` : ""}`);
const kSig = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i); return (h >>> 0).toString(36); };
let kEase = null;
const kEases = () => kEase ||= { move: cssVar(document.documentElement, "--nav") || "cubic-bezier(.32,.72,0,1)", bounce: cssVar(document.documentElement, "--bouncy") || "cubic-bezier(.3,1.35,.45,1)", out: cssVar(document.documentElement, "--ease-out") || "ease-out",
  // (and by the names the site's other pages use: signing in and out, which goes between them)
  glide: cssVar(document.documentElement, "--ease-glide") || "cubic-bezier(.32,.72,0,1)", spring: cssVar(document.documentElement, "--ease-spring") || "cubic-bezier(.2,1.1,.4,1)", easeIn: cssVar(document.documentElement, "--ease-in") || "ease-in" };
const kView = () => `${S.view}|${S.chat || ""}`;
const kOn = (r, vr) => (r.width || r.height) && r.bottom > vr.top && r.top < vr.bottom;
function snapKeyed() {
  if (!$view || S.nav || S.locked) return null;
  const vr = $view.getBoundingClientRect(), h = vr.height, m = new Map();
  for (const el of $view.querySelectorAll("[data-key]")) {
    const r = el.getBoundingClientRect();
    if (!(r.width || r.height) || r.bottom < vr.top - h || r.top > vr.bottom + h) continue;
    const p = el.parentElement.closest("[data-key]"), box = el.parentElement.getBoundingClientRect();
    m.set(el.dataset.key, { el, top: r.top, h: r.height, sig: el.dataset.sig || "", pk: p && $view.contains(p) ? p.dataset.key : null, box: [box.left, box.width], cls: el.parentElement === $view ? "" : el.parentElement.className });
  }
  return { at: kView(), m, n: $view.querySelectorAll("[data-key]").length };
}
// one animation for the look (opacity, which only replaces) and one for the movement (added to any already running)
function kPlay(el, frames, o) {
  try {
    const op = frames.map((f) => ("opacity" in f ? { opacity: f.opacity } : null)), tf = frames.map((f) => ("transform" in f ? { transform: f.transform } : null));
    if (op.every(Boolean)) el.animate(op, o);
    if (tf.every(Boolean)) el.animate(tf, { ...o, composite: "add" });
  } catch (_) {}
}
const KF = {
  in: [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }],
  pop: [{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "none" }],
  land: [{ opacity: 0.55, transform: "translateY(-12px) scale(.96)" }, { opacity: 1, transform: "none" }],
  landme: [{ opacity: 0.6, transform: "scale(.95)" }, { opacity: 1, transform: "none" }],
  chg: [{ opacity: 0.35 }, { opacity: 1 }],
  fade: [{ opacity: 0 }, { opacity: 1 }],
};
function playKeyed(was) {
  if (!was || was.at !== kView() || S.nav || !$view) return;
  const still = STILL.matches, E = kEases(), vr = $view.getBoundingClientRect(), all = [...$view.querySelectorAll("[data-key]")];
  // the first of this screen's content (after "Opening…", or the placeholder rows): it fades in, a row at a time
  if (!was.n) {
    let i = 0;
    for (const el of all) if (!el.parentElement.closest("[data-key]") && kOn(el.getBoundingClientRect(), vr) && !el.closest(".fresh"))
      kPlay(el, still ? KF.fade : [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: Math.min(i++, 8) * 28, easing: E.out, fill: "backwards" });
    return;
  }
  const now = new Set(), boxes = new Map();
  let landed = false;
  for (const el of all) {
    const k = el.dataset.key, r = el.getBoundingClientRect();
    now.add(k);
    if (!kOn(r, vr) || el.closest(".fresh")) continue;          // (off screen; or popping in by itself)
    const o = was.m.get(k), p = el.parentElement.closest("[data-key]"), pk = p && $view.contains(p) ? p.dataset.key : null, how = el.dataset.in || "in";
    if (!o) {
      if (pk && !was.m.has(pk)) continue;                     // (it came with what it's in, which arrives as a whole)
      kPlay(el, still ? KF.fade : how === "pop" ? KF.pop : KF.in, { duration: how === "pop" ? 420 : 320, delay: still ? 0 : 60, easing: how === "pop" && !still ? E.bounce : E.out, fill: "backwards" });
      continue;
    }
    // moved: by itself, or (inside something that moved too) only by its own share of it
    let dy = o.top - r.top;
    const inner = !!pk && o.pk === pk;
    if (inner) { const po = was.m.get(pk); if (po) dy -= po.top - p.getBoundingClientRect().top; }
    const b = boxes.get(el.parentElement) || boxes.set(el.parentElement, { moved: [], stayed: 0, inner }).get(el.parentElement);
    if (still || Math.abs(dy) < 1) b.stayed++; else b.moved.push([el, dy]);
    const sig = el.dataset.sig || "";
    if (o.sig !== sig) {
      // a pigeon that was in the air and is here now comes down to land (on its sender's side); else it dissolves in
      const land = !still && how === "land" && o.sig === "fly" && /^in/.test(sig), mine = el.classList.contains("me");
      if (land) { el.style.transformOrigin = mine ? "100% 100%" : "0 100%"; if (!mine) landed = true; }
      kPlay(el, still ? KF.chg : land ? (mine ? KF.landme : KF.land) : how === "pop" ? KF.pop : KF.chg,
        { duration: land ? 560 : how === "pop" && !still ? 420 : 280, easing: land || (how === "pop" && !still) ? E.bounce : E.out });
    }
  }
  // what moved: a list whose every item on screen moved the same way glides as one (with what's between them); else
  // each from where it was
  const dur = (d) => Math.min(560, 360 + Math.abs(d) * 0.2);
  for (const [box, { moved, stayed, inner }] of boxes) {
    if (!moved.length) continue;
    const dy = moved[0][1];
    if (box !== $view && !inner && !stayed && moved.length > 1 && moved.every(([, d]) => Math.abs(d - dy) < 1)) kPlay(box, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: dur(dy), easing: E.move });
    else for (const [el, d] of moved) kPlay(el, [{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: dur(d), easing: E.move });
  }
  // what went: a lifeless copy of it fades out where it was, as the list closes up (whole items only, not their parts)
  const rr = root().getBoundingClientRect();
  for (const [k, o] of was.m) {
    if (now.has(k) || o.pk || o.top + o.h < vr.top || o.top > vr.bottom) continue;
    const g = document.createElement("div"), el = o.el;
    for (const x of [el, ...el.querySelectorAll("[id],[data-act],[data-key]")]) { x.removeAttribute("id"); x.removeAttribute("data-act"); x.removeAttribute("data-key"); }
    el.style.margin = "0"; el.style.animation = "none";
    g.className = `kgone ${o.cls}`; g.setAttribute("aria-hidden", "true"); g.inert = true;
    g.style.cssText = `top:${o.top - rr.top}px;left:${o.box[0] - rr.left}px;width:${o.box[1]}px`;
    g.append(el); $view.after(g);
    const end = () => g.remove();
    try { g.animate([{ opacity: 1 }, { opacity: 0, transform: still ? "none" : "scale(.97)" }], { duration: 200, easing: "ease-in", fill: "forwards" }).finished.then(end, end); } catch (_) { end(); }
    setTimeout(end, 500);
  }
  if (landed) haptic("tick");
}
// A redraw that news brings (not one you asked for): held while a finger's down or the list is still gliding, so a
// scroll isn't stopped dead and a button isn't swapped out from under a tap; it follows as soon as that's over.
let touching = 0, glidedAt = 0, calmWait = null;
addEventListener("touchstart", () => { touching++; }, { passive: true, capture: true });
addEventListener("touchend", (e) => { touching = e.touches.length; }, { passive: true, capture: true });
addEventListener("touchcancel", (e) => { touching = e.touches.length; }, { passive: true, capture: true });
addEventListener("scroll", () => { glidedAt = performance.now(); }, { passive: true, capture: true });
function calmRender() {
  if (calmWait) return;
  const busy = () => touching > 0 || performance.now() - glidedAt < 180 || performance.now() - navAt < NAV_MS + 40;
  if (!busy()) return render();
  const later = () => { if (busy()) { calmWait = setTimeout(later, 120); return; } calmWait = null; render(); };
  calmWait = setTimeout(later, 120);
}
let drawnView = null;            // (the screen render() last drew: a redraw of that one keeps its focus)
function render() {
  if (!$view) return;
  if (calmWait) { clearTimeout(calmWait); calmWait = null; }
  clearSwipes();
  const auth = AUTH_VIEWS.has(S.view) || !S.me;
  const chat = !auth && S.view === "chat";
  root().classList.toggle("plain", chat || (!auth && S.view === "messages"));
  $view.classList.toggle("tabs-pad", !auth && !chat);
  if (auth) {
    const night = NIGHT_VIEWS.has(S.view);
    if (document.documentElement.classList.contains("night") !== night) { document.documentElement.classList.toggle("night", night); applyTheme(); }
    if (night) nightSky(skyCanvas());
    const box = S.view === "welcome" && !S.nav && $(".welcome .wcta", $view);
    if (box) {                                           // already up: just the words change
      // (showing already: the new ones fade in where they are; still to come: they keep the welcome's own timing)
      const a = box.getAnimations()[0], shown = +getComputedStyle(box).opacity > 0.05, left = a && !shown ? Math.max(0, (a.effect.getTiming().delay || 0) - (a.currentTime || 0)) : 0;
      box.outerHTML = welcomeCta();
      const nb = $(".welcome .wcta", $view);
      if (nb && shown) nb.classList.add("swap"); else if (nb && a) nb.style.animationDelay = `${left}ms`;
      return;
    }
    $view.innerHTML = vAuth(); drawnView = null; $compose.hidden = true; $tabbar.hidden = true; renderSheet(); animateNav();
    if (S.view === "welcome") S.welcomed = true;
    return;
  }
  if (document.documentElement.classList.contains("night")) { document.documentElement.classList.remove("night"); applyTheme(); }
  if (S.locked) { $view.innerHTML = ""; drawnView = null; $compose.hidden = true; $tabbar.hidden = true; $layer.innerHTML = ""; syncInert(); drawLock(); return; }
  drawLock();
  const tabsBack = $tabbar.hidden && !chat;
  $tabbar.hidden = chat;
  // the tab bar rises back in, unless a swipe has already shown it there (a class left
  // on from last time would replay the rise as the bar unhides, so it always comes off)
  if (tabsBack) { $tabbar.classList.remove("rise", "back"); if (!S.noRise) { void $tabbar.offsetWidth; $tabbar.classList.add(S.nav === "pop" ? "back" : "rise"); } }
  S.noRise = false;
  // the same screen drawn again: what you'd reached by keyboard or VoiceOver (a switch you've just flipped, the search
  // box) keeps its focus, and a field its caret, as in a sheet (renderSheet)
  const fa = $view.contains(document.activeElement) ? document.activeElement : null, fAt = drawnView;
  const fid = fa?.id || "", fk = !fid && fa?.dataset?.act ? switchKey(fa) : null;
  const caret = fid && typeof fa.selectionStart === "number" ? [fa.selectionStart, fa.selectionEnd] : null;
  const keepTop = $view.scrollTop, switches = S.nav ? null : switchStates($view), was = snapKeyed();
  $view.innerHTML = chat ? vChat() : S.view === "friends" ? vFriends() : S.view === "account" ? vAccount() : vMessages();
  drawnView = kView();
  if (chat) $view.querySelectorAll("[data-ar]").forEach((el) => { el.style.aspectRatio = el.dataset.ar; });
  if (chat) $view.querySelectorAll("[data-h]").forEach((el) => { el.style.setProperty("--h", el.dataset.h); });
  if (chat && S.player) voiceShow();
  if (chat && S.stick) {
    // down to the newest: gliding there when you've just sent from not far up, else straight there
    const gap = $view.scrollHeight - $view.clientHeight - keepTop;
    if (S.glideDown && gap > 2 && gap < 2 * $view.clientHeight && !STILL.matches) { $view.scrollTop = keepTop; $view.scrollTo({ top: $view.scrollHeight, behavior: "smooth" }); }
    else $view.scrollTop = $view.scrollHeight;
  } else if (Math.abs($view.scrollTop - keepTop) > 1) $view.scrollTop = keepTop;     // (left be when it's there already: setting it stops a glide)
  S.glideDown = false;
  if (chat) newPigeons();
  if (chat) pinChat();
  if (switches?.size) keepGlides($view, switches);
  if (!chat && S.view === "messages") { airMount(); if (!S.listAt && $(".mlist:not(.skel)", $view)) S.listAt = performance.now(); }
  inRender = true; renderCompose(); inRender = false;
  renderTabs(); renderSheet(); live(); filterLists(); animateNav(); playFresh(); playKeyed(was);
  IFL.watch($view);                                              // (InFlite's header, compact as far as it's scrolled)
  // (only if nothing else has taken the focus since: the message box, a sheet's title. A card in the air is the same
  // one put back, airMount, so it has its focus back as it is)
  if (fa && fAt === drawnView && (!document.activeElement || document.activeElement === document.body)) {
    const back = fa.isConnected ? fa : fid ? document.getElementById(fid) : fk ? [...$view.querySelectorAll(`[data-act="${CSS.escape(fa.dataset.act)}"]`)].find((x) => switchKey(x) === fk) : null;
    if (back && $view.contains(back)) { try { back.focus({ preventScroll: true }); if (caret) back.setSelectionRange(...caret); } catch (_) {} }
  }
}

// Scrolled up to read, and a pigeon arrives below: a pill over the composer says so, and takes you down to it (it goes
// once you're down there, or leave)
function newPigeons() {
  const list = S.msgs.get(S.chat) || [], last = list.at(-1), was = S.lastSeen;
  S.lastSeen = { chat: S.chat, id: last?.id || "" };
  if (was?.chat === S.chat && last && was.id !== last.id && !S.stick && last.from !== S.me.id) newPill(true);
}
function newPill(on) {
  let p = $compose && $(".newpill", $compose);
  if (!on) { if (p && !p.classList.contains("out")) { p.classList.add("out"); setTimeout(() => p.remove(), 220); } return; }
  if (p && !p.classList.contains("out")) return;
  p?.remove();
  p = document.createElement("button"); p.type = "button"; p.className = "newpill"; p.dataset.act = "tonew"; p.textContent = "New pigeon ↓";
  $compose.append(p);
}
// In a chat, stay at the newest message while anything below grows (a photo
// loading, a reply bar opening), unless you've scrolled up to read.
let pinObs = null;
function pinChat() {
  if (!window.ResizeObserver) return;
  if (!pinObs) pinObs = new ResizeObserver(() => { if (S.view === "chat" && S.stick) $view.scrollTop = $view.scrollHeight; });
  pinObs.disconnect();
  const m = $(".msgs", $view); if (m) pinObs.observe(m);
  pinObs.observe($view);
}

/* ---------- shared bits ---------- */
// root: a tab's top screen, whose large title shares the row with the buttons
// (and your photo at its left, signed in: InFlite's menu, the same in every app: youMenu)
// A tab's top screen, signed in: InFlite's header, the same in every app (your photo, the screen's name large with its
// line under it, its buttons in one capsule; compact as it's scrolled: IFL.watch($view))
const navbar = (title, { left = "", right = "", solid = false, root = false, titleHtml = null } = {}) => {
  if (root && S.me && !left) return IFL.headerHtml({ title, meAttrs: 'data-act="youmenu"', me: avatar(S.me, "s"), line: rootLine(title), cls: "chead" })
    .replace('<div class="ifh-acts"></div>', `<div class="ifh-acts">${right.replaceAll('class="nbtn"', 'class="ifh-act"')}</div>`);
  const me = root && S.me && !left;
  return `<div class="navbar${solid ? " solid" : ""}${root ? ` root b${(right.match(/class="nbtn/g) || []).length}` : ""}${me ? " me" : ""}"><div class="nb-left">${me ? meBtn() : left}</div><div class="nb-title one">${titleHtml ?? esc(title)}</div><div class="nb-right">${right}</div></div>`;
};
// (each tab's one line, under its name: what's true now)
function rootLine(title) {
  if (title === "Messages") {
    const unread = [...S.friends, ...S.groups].reduce((n, f) => n + (f.unread || 0), 0), going = S.outbox.length;
    return unread ? `<i>${unread} unread</i>` : going ? `<i>${going} on the way</i>` : "All read";
  }
  if (title === "Friends") return `${S.friends.length} ${S.friends.length === 1 ? "friend" : "friends"}${S.incoming.length ? ` · <i>${S.incoming.length} asking</i>` : ""}`;
  return `@${esc(S.me.handle)}`;
}
const meBtn = () => `<button type="button" class="nbtn mebtn" data-act="youmenu" aria-label="You and your apps" aria-haspopup="dialog">${avatar(S.me, "s")}</button>`;
// You and Chat's own few, from your photo: InFlite's menu. What's this phone's own (notifications, the lock, haptics,
// and encryption) is here, not in Account; its rows drawn again as one that turns on brings another (when it locks,
// a test notification). What opens over the page (a sheet, a choice, a word) closes the menu first
function youMenu(at) {
  const t = document.createElement("template"); t.innerHTML = avatar(S.me, "l").trim();
  const page = accountPage();
  IFL.menu(at, {
    app: "chat", build: APP_VERSION,
    me: { name: S.me.name, line: `@${S.me.handle}`, photo: t.content.firstElementChild },
    rows: phoneRows(),
    account: () => (page ? openAccount(null) : go("account")),
    signOut: () => doAct("signout"),
    update: updateReady ? reloadHere : null,
  });
}
// (an act of the app's, as a tap on a row with it would be)
const doAct = (name, id) => onClick1({ preventDefault() {} }, { dataset: { act: name, ...(id != null ? { id: String(id) } : {}) }, closest: () => null, getAttribute: () => null });
function phoneRows() {
  const ps = pushState(), lock = lockPrefs(), again = () => IFL.redraw(phoneRows());
  const pushFoot = { homescreen: "On iPhone, notifications need Chat on your Home Screen: tap Share, then Add to Home Screen.", denied: "Notifications are blocked for Chat. Turn them on in your phone’s Settings.",
    unsupported: "This browser can’t show notifications." }[ps];
  const changed = S.friends.filter((f) => f.keyChanged).length, ver = S.friends.filter(isVerified).length;
  return [
    // (what Chat tells you is set in your account, its Notifications page, every app's: here, only whether this phone's on;
    // where Chat has no account page, its own Notifications, as before)
    accountPage() ? { key: "notify", icon: "bell", color: "red", label: "Notifications", value: ps === "on" ? "On" : "Off here", warn: ps !== "on", open: () => openAccount("notify-inflight") }
      : pushFoot ? { key: "pushtoggle", icon: "bell", color: "red", label: "Push Notifications", value: "Off", open: () => toast(esc(pushFoot)) }
      : { key: "pushtoggle", icon: "bell", color: "red", label: "Push Notifications", on: ps === "on", disabled: S.pushBusy, toggle: async (next) => { await (next ? pushEnable() : pushDisable()); render(); again(); return !!S.pushOn; } },
    !accountPage() && ps === "on" && { key: "pushtest", icon: "send", color: "red", label: "Send a Test Notification", open: () => doAct("pushtest") },
    passkeysSupported() && { key: "applock", icon: "faceid", color: "green", label: "Lock Chat", on: !!lock, toggle: async () => {
      // (no passkey yet: Passkeys opens, to add one, so the menu goes first)
      if (!lock && !S.passkeys?.length) { IFL.close(); doAct("applock"); return false; }
      await doAct("applock"); again(); return !!lockPrefs();
    } },
    lock && { key: "lockafter", icon: "clock", color: "green", label: "Lock", value: LOCK_AFTER.find(([ms]) => ms === (lock.after || 0))?.[1] || "Immediately",
      open: () => openActions({ title: "When to lock", actions: LOCK_AFTER.map(([ms, l]) => ({ label: l, act: "lockpick", id: String(ms) })) }) },
    { key: "haptics", icon: "haptics", color: "indigo", label: "Haptics", on: hapticsOn(), toggle: (on) => { try { localStorage.setItem("inflight-haptics", on ? "1" : "0"); } catch (_) {} if (on) haptic("success"); return on; } },
    { key: "encryptionsheet", icon: "lock", color: "green", label: "Safety Numbers", value: changed ? `${changed} changed` : S.friends.length ? `${ver} of ${S.friends.length} verified` : "", warn: !!changed, open: () => doAct("encryptionsheet") },
    "-",
    // (the way friends find you, a tap from anywhere: your link, to share)
    { key: "share", icon: "link", color: "blue", label: "Share My Link", open: () => doAct("share") },
    "-",
    // (Chat's settings: the account's, on its page, opened signed in; where Chat has no account page, the Account tab)
    { key: "settings", icon: "sliders", color: "grey", label: "Settings", open: () => (accountPage() ? doAct("ifsettings") : go("account")) },
  ];
}
// The app's own name where Messages' title would be: its icon and Chat
const brandMark = () => `<span class="brand"><span class="bicon" aria-hidden="true">${I.bird}</span><span class="bword">Chat</span></span>`;
const nbtn = (act, icon, label, extra = "") => `<button class="nbtn" data-act="${act}" aria-label="${esc(label)}" ${extra}>${icon}</button>`;
const backBtn = (act, id, label = "") => `<button class="nbtn back" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""} aria-label="Back">${I.back}${label ? `<span>${esc(label)}</span>` : ""}</button>`;
const cell = ({ act, id, icon, tile, label, sub, val, chev, cls = "", tag }) => {
  const t = tag || (act ? "button" : "div");
  return `<${t} class="cell${icon ? " has-icon" : ""} ${cls}"${act ? ` data-act="${act}"` : ""}${id ? ` data-id="${esc(id)}"` : ""}${t === "button" ? ' type="button"' : ""}>
    ${icon ? `<span class="tile ${tile || "blue"}">${icon}</span>` : ""}
    <span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span>
    ${val != null ? `<span class="val">${val}</span>` : ""}${chev ? I.chev.replace('class="ico"', 'class="ico chev"') : ""}</${t}>`;
};
const chevSm = I.chev.replace('class="ico"', 'class="ico chev"');
// The account's own page (account.<site>, beside chat.<site>), where your password, passkeys and devices are for every
// app on the site; none where Chat's served at an address of another kind
const accountPage = () => location.hostname.startsWith("chat.") ? `${location.origin.replace("//chat.", "//account.")}/`
  : location.hostname === "georgefarrowgreen.com" ? "https://account.inflite.ai/"
  : /(^|\.)localhost$/.test(location.hostname) ? `${location.protocol}//account.localhost${location.port ? ":" + location.port : ""}/` : null;
const pg = (kind, skin) => kind === "mystery" ? `<span class="pg mystery" aria-hidden="true">?</span>` : `<span class="pg ${kind}${skin && SKINS[skin] ? " sk-" + skin : ""}" aria-hidden="true">${I.bird}</span>`;     // a pigeon in its colour (and its look, if rare)
const pgm = (m) => pg(kindOf(m), m?.skin);

const onceP = (p) => !!p?.p && p.p.m !== "image/gif";
const picWord = (p) => (p.v ? "Voice pigeon" : p.p?.m === "image/gif" ? "GIF" : "Photo");
// A pigeon in the air, in a list: yours with its pigeon and when it lands, theirs sealed
const riderIcon = (m) => `<span class="rider k-${kindOf(m)}">${I.bird}</span>`;
const sealedIcon = (m) => `<span class="sealedi k-${kindOf(m)}">${I.lock}</span>`;
function preview(f) {
  const out = S.outbox.filter((o) => o.to === f.id).at(-1);
  if (out) return { html: `<span class="${out.err ? "lostp" : "fl"}">${out.err ? I.warn : I.clock} ${out.err ? "Not sent" : "Waiting for signal"}</span>`, at: out.at };
  const l = f.last;
  if (!l) return { html: "No messages yet", at: 0 };
  if (l.recalled) return { html: `<span class="homing">${I.homing} ${l.from === S.me.id ? "You called your pigeon back" : `${esc(first(f.name))} called their pigeon back`}</span>`, at: l.lostAt };
  if (l.lost) return { html: `<span class="lostp">${I.skull} ${l.from === S.me.id ? "Your pigeon was lost on the way" : "A pigeon was lost on its way"}</span>`, at: l.lostAt };
  if (l.from === S.me.id && l.flying) return { html: `<span class="upp">${riderIcon(l)}In the air · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  if (l.from !== S.me.id && l.flying) return { html: `<span class="upp">${sealedIcon(l)}Sealed · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? (p.unchecked ? "Check their new safety number to read this" : "Couldn’t open this message") : p.v ? `Voice pigeon (${fmtClip(p.v.d)})${l.photo === 2 ? " · expired" : ""}` : p.p ? (l.photo === 2 ? `${picWord(p)} (expired)` : picWord(p)) + (p.t ? ": " + p.t : "") : p.t;
  return { html: (l.from === S.me.id ? "You: " : "") + esc(body), at: l.deliverAt };
}
// how far a flock has got: landed for how many of how many, and how many lost
function flockCount(m) {
  const fl = m.flock || [], landed = fl.filter((x) => !x.flying && !x.lost).length, lost = fl.filter((x) => x.lost && !x.recalled).length, recalled = fl.filter((x) => x.recalled).length;
  const next = fl.filter((x) => x.flying).reduce((a, x) => Math.min(a, x.deliverAt), Infinity);
  return { n: fl.length, landed, lost, recalled, next: next === Infinity ? null : next };
}
function gpreview(g) {
  const out = S.outbox.filter((o) => o.to === g.id).at(-1);
  if (out) return { html: `<span class="${out.err ? "lostp" : "fl"}">${out.err ? I.warn : I.clock} ${out.err ? "Not sent" : "Waiting for signal"}</span>`, at: out.at };
  const l = g.last;
  if (!l) return { html: `${others(g).map((p) => esc(first(p.name))).join(", ")}`, at: g.createdAt };
  const who = l.from === S.me.id ? "You" : esc(first(member(g, l.from)?.name || "Someone"));
  if (l.from === S.me.id && l.recalled && !flockCount(l).landed) return { html: `<span class="homing">${I.homing} You called your pigeons back</span>`, at: l.sentAt };
  if (l.from !== S.me.id && l.recalled) return { html: `<span class="homing">${I.homing} ${who} called their pigeon back</span>`, at: l.lostAt };
  if (l.from === S.me.id && l.lost) return { html: `<span class="lostp">${I.skull} Your pigeons were lost on the way</span>`, at: l.sentAt };
  if (l.from === S.me.id && l.flying) { const c = flockCount(l); return { html: `<span class="upp">${riderIcon(l)}In the air · ${c.landed} of ${c.n} landed</span>`, at: l.sentAt }; }
  if (l.from !== S.me.id && l.lost) return { html: `<span class="lostp">${I.skull} ${who}’s pigeon was lost on its way</span>`, at: l.lostAt };
  if (l.from !== S.me.id && l.flying) return { html: `<span class="upp">${sealedIcon(l)}${who}: sealed · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? "Couldn’t open this message" : p.v ? `Voice pigeon (${fmtClip(p.v.d)})` : p.p ? picWord(p) + (p.t ? ": " + p.t : "") : p.t;
  return { html: `${who}: ${esc(body)}`, at: l.from === S.me.id ? l.sentAt : l.deliverAt };
}
const fmtListTime = (ts) => { if (!ts) return ""; if (sameDay(ts, now())) return fmtTime(ts); if (sameDay(ts, now() - DAY)) return "Yesterday"; const d = new Date(ts); return now() - ts < 6 * DAY ? DOW[d.getDay()] : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };

/* ---------- flight streaks: days in a row with a pigeon between you ---------- */
const STREAK_MIN = 3;
const streakOf = (f) => (f?.streak && f.streak.n >= STREAK_MIN ? f.streak : null);
// alive but nothing sent today, and under six hours to go
const streakRisk = (s) => s && !s.today && s.endsAt - now() < 6 * HOUR;
const streakLeft = (s) => fmtDur(Math.max(MIN, s.endsAt - now()));
const streakBadge = (f) => { const s = streakOf(f); return s ? `<span class="streak${streakRisk(s) ? " risk" : ""}" aria-label="${s.n}-day flight streak${streakRisk(s) ? `, ends in ${esc(streakLeft(s))}` : ""}">${I.flame}${s.n}</span>` : ""; };

// A new season: its look, for anyone, until it ends
function seasonCard() {
  const s = seasonNow(); if (!s || !S.me) return "";
  try { if (localStorage.getItem("inflight-season") === s.key) return ""; } catch (_) { return ""; }
  // one slim row: what it is, until when, Try It (the looks, with how to keep it), and an × to put it away
  return `<div class="seasoncard" data-key="season" role="note"><span class="semoji" aria-hidden="true">${s.emoji}</span><span class="stext"><b>${esc(s.words)} pigeons are here</b>
    <span>The ${esc(s.look)} look, until ${esc(fmtDate(s.to - 1).replace(/ \d{4}$/, ""))}</span></span>
    <button type="button" class="btn small" data-act="seasontry">Try It</button><button type="button" class="sx" data-act="seasonhide" aria-label="Not now">${I.x}</button></div>`;
}

/* ---------- Messages ---------- */
function vMessages() {
  const fr = [
    ...S.friends.map((f) => ({ f, ...preview(f) })).filter((x) => x.f.last || S.outbox.some((o) => o.to === x.f.id)),
    ...S.groups.map((g) => ({ f: g, g, ...gpreview(g) })),
  ].sort((a, b) => b.at - a.at);
  const rows = fr.map(({ f, g, html, at }) => `<button class="mrow${g ? " grow" : ""}" data-key="r:${esc(f.id)}" data-act="open" data-id="${esc(f.id)}" data-find="${esc((g ? g.name + " " + g.members.map((p) => p.name).join(" ") : f.name + " " + f.handle).toLowerCase())}">
      ${f.unread ? `<span class="dot" data-key="d:${esc(f.id)}" data-in="pop" aria-hidden="true"></span><span class="sr">Unread</span>` : ""}
      ${g ? gavatar(g, "m") : avatar(f, "m", true)}
      <span class="mtext" data-key="t:${esc(f.id)}" data-sig="${kSig(`${at}|${html}|${S.drafts.get(f.id) || ""}`)}">
        <span class="mtop"><span class="mname one">${esc(g ? g.name : first(f.name))}</span>${g ? "" : streakBadge(f)}<time>${fmtListTime(at)}</time>${chevSm}</span>
        <span class="mprev">${S.drafts.get(f.id)?.trim() ? `<span class="draft">Draft:</span> ${esc(S.drafts.get(f.id).trim().replace(/\s+/g, " "))}` : html}</span>
      </span>
    </button>`).join("");
  // nothing on this phone yet and the first sync couldn't come (the server, not the network: that's the offline pill):
  // said, with Try Again, not placeholder rows for ever
  if (!rows && !S.started && !S.fromCache && S.syncFails) return `${navbar("Messages", { root: true, titleHtml: brandMark() })}
    <p class="empty"><b>Couldn’t open your messages</b>Chat’s server didn’t answer just now. <br><button class="btn small" data-act="retrysync">Try Again</button></p>`;
  // nothing on this phone yet and the first sync still on its way: placeholder rows, not "No messages"
  if (!rows && !S.started && !S.fromCache) return `${navbar("Messages", { root: true, titleHtml: brandMark(), right: nbtn("skies", I.globe, "The Skies: every pigeon in the air") + nbtn("newmsg", I.compose, "New message") })}
    <div class="search skp" aria-hidden="true"></div><div class="mlist skel" aria-busy="true" aria-label="Loading your messages">${'<div class="mrow"><span class="sk av"></span><span class="mtext"><span class="sk l1"></span><span class="sk l2"></span></span></div>'.repeat(4)}</div>`;
  const empty = S.friends.length
    ? `<p class="empty"><b>No messages yet</b>Tap the pencil to send your first pigeon.</p>`
    : S.outgoing.length || S.incoming.length
    ? `<p class="empty"><b>No messages yet</b>Once a friend says yes, send them your first pigeon.<br><button class="btn" data-act="tab" data-id="friends">Friends</button></p>`
    // brand new: the two ways to get a friend, right here
    : `<div class="firstrun"><div class="appicon">${I.bird}</div><h2>Your loft is ready</h2>
        <p>Pigeons fly between friends. Send your link to someone, or add them by their handle.</p>
        <div class="stack"><button class="btn wide" data-act="share">${I.up}Share My Link</button><button class="btn wide plain" data-act="addfriend">Add a Friend by Handle</button></div>
        <p class="me">You’re <b>@${esc(S.me.handle)}</b></p></div>`;
  return `${navbar("Messages", { root: true, titleHtml: brandMark(), right: nbtn("skies", I.globe, "The Skies: every pigeon in the air") + nbtn("newmsg", I.compose, "New message") })}
    ${rows ? `<label class="search" data-key="search">${I.search}<input type="search" id="msearch" placeholder="Search" value="${esc(S.q)}" autocomplete="off" aria-label="Search messages"></label>` : ""}
    ${seasonCard()}<div class="airslot"></div>
    <div class="sres" aria-live="polite"></div>
    <div class="mlist" data-list="m">${rows}</div>${rows ? "" : kTag(empty, "empty")}`;
}

/* ---------- friends' news: what their pigeons have been up to ---------- */
let newsLoading = null;
function loadNews(force) {
  if (newsLoading || (!force && S.newsAt && now() - S.newsAt < 60e3)) return newsLoading;
  newsLoading = api("news").then((r) => { S.news = r.news || []; S.newsAt = now(); if (S.view === "friends" || S.sheet?.type === "news") { render(); if (S.sheet?.type === "news") renderSheet(); } })
    .catch(() => {}).finally(() => { newsLoading = null; });
  return newsLoading;
}
const NEWS_ICON = { country: () => I.globe, postmark: (x) => `<svg viewBox="0 0 24 24" class="ico">${x.mark ? pmIco(x.mark) : PM_ICON.monument}</svg>`, rank: () => I.bird, named: () => I.bird, streak: () => I.flame,
  item: (x) => `<span class="nemo">${x.emoji || ""}</span>`, season: (x) => `<span class="nemo">${SEASONS.find((s) => s[0] === x.skin)?.[2] || ""}</span>` };
const NEWS_TINT = { country: "blue", postmark: "red", rank: "orange", named: "orange", streak: "orange", item: "yellow", season: "pink" };
// news comes to the day (its noon, so it's the right day wherever you are)
const newsDay = (at) => { const d = at + DAY / 2; return sameDay(d, now()) ? "Today" : sameDay(d, now() - DAY) ? "Yesterday" : now() - d < 6 * DAY ? DOW_LONG[new Date(d).getDay()] : fmtDate(d); };
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function newsRow(x) {
  const f = friend(x.who.id) || x.who;
  return `<button type="button" class="cell nrow" data-act="open" data-id="${esc(x.who.id)}">${avatar(f, "s")}
    <span class="ctext"><span class="ntext">${esc(x.text)}</span><span class="csub">${esc(newsDay(x.at))}</span></span>
    <span class="nkind ${NEWS_TINT[x.kind] || "gray"}" aria-hidden="true">${(NEWS_ICON[x.kind] || (() => I.bird))(x)}</span></button>`;
}
function newsHtml() {
  if (S.me?.shareNews === false || !S.news?.length) return "";
  const shown = S.news.slice(0, 3);
  return `<div class="ghead" data-key="h:news">News${S.news.length > 3 ? ` <button type="button" class="link gmore" data-act="newsall">See All</button>` : ""}</div>
    <div class="group news" data-key="g:news" data-sig="${kSig(shown.map((x) => `${x.kind}${x.at}${x.who.id}`).join())}">${shown.map(newsRow).join("")}</div>`;
}

/* ---------- Friends ---------- */
// Under a friend's name: "06:20 in Tokyo · 5,842 mi" (the time only where it isn't yours; it keeps time)
function friendWhere(f) {
  const place = esc((f.place || "").replace(/, (the Moon|Mars)$/, "")), far = milesAway(f);
  let at = "";
  if (!f.moon && f.tz && f.tz !== MY_TZ) try { at = `<span data-clock="${esc(f.tz)}">${esc(clockIn(now(), f.tz))}</span>${place ? " in " : " there"}`; } catch (_) {}
  return [at + place, far].filter(Boolean).join(" · ") || `@${esc(f.handle)}`;
}
function vFriends() {
  if (S.me) loadNews();
  const fr = [...S.friends].sort((a, b) => a.name.localeCompare(b.name));
  const inc = S.incoming.length, out = S.outgoing.length;
  const rows = fr.map((f) => `<button class="cell" data-key="f:${esc(f.id)}" data-act="open" data-id="${esc(f.id)}" data-find="${esc((f.name + " " + f.handle).toLowerCase())}">${avatar(f, "s", true)}
      <span class="ctext"><span class="one">${esc(first(f.name))}</span><span class="csub one">${friendWhere(f)}</span></span>${chevSm}</button>`).join("");
  return `${navbar("Friends", { root: true, right: nbtn("share", I.share, "Share your handle") + nbtn("addfriend", I.addp, "Add a friend") })}
    ${fr.length ? `<label class="search" data-key="search">${I.search}<input type="search" id="fsearch" placeholder="Search" value="${esc(S.fq)}" autocomplete="off" aria-label="Search friends"></label>` : ""}
    ${inc || out ? `<div class="group" data-key="g:req" data-sig="${inc}|${out}|${esc(S.incoming[0]?.id || "")}">${cell({ act: "requests", icon: I.addp, tile: "red", label: "Friend Requests", sub: inc ? esc(S.incoming[0].name) + (inc === 2 ? ` and ${esc(S.incoming[1].name)}` : inc > 2 ? ` and ${inc - 1} others` : " wants to be friends") : `${out} sent, waiting for a reply`, val: inc ? `<span class="badge-n">${inc}</span>` : "", chev: true })}</div>` : ""}
    ${newsHtml()}
    ${fr.length ? `<div class="ghead" data-key="h:fr" data-sig="${fr.length}">${fr.length} friend${fr.length === 1 ? "" : "s"}</div><div class="group" data-key="g:fr" data-list="f">${rows}</div>
      <div class="gfoot" data-key="ft:fr">Your handle is <b>@${esc(S.me.handle)}</b>. Share it so friends can add you.</div>`
      : `<p class="empty" data-key="empty"><b>No friends yet</b>Add someone by their handle, or share yours: @${esc(S.me.handle)}.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`}
    <div class="gap"></div>`;
}

/* ---------- Account ---------- */
function vAccount() {
  const u = S.me;
  // today's pigeons, one column each: how many are in your loft, and when the next hatches
  const col = (kind, name, short, x = "") => {
    const n = u[kind] || 0, full = n >= KIND[kind].max, at = u[kind + "NextAt"];
    return `<div class="lcol${n ? "" : " none"}" role="group" aria-label="${name}${x ? `, ${x} faster` : ""}: ${n} in your loft, ${full ? (kind === "mystery" ? "ready" : "full") : "next hatches soon"}">${pg(kind, kind === "mystery" || SPACE_KINDS.includes(kind) ? null : u.skin)}<b>${n}</b>
      <span class="lname">${short}${x ? ` <i>${x}</i>` : ""}</span><small class="lnext${full ? " full" : ""}">${full ? (kind === "mystery" ? "Ready" : "Full") : `<span data-eta="${at}"></span>`}</small></div>`;
  };
  // (the Moon's and Mars's pigeons, once you or a friend are there)
  const on = (b) => worldOf(u) === b || S.friends.some((f) => worldOf(f) === b) || S.groups.some((g) => g.members.some((p) => worldOf(p) === b));
  const earth = col("rocket", "Rocket", "Rocket", "9×") + col("turbo", "Turbo", "Turbo", "3×") + col("swift", "Swift", "Swift", "2×") + col("mystery", "Mystery", "Mystery");
  return `${navbar("Account", { root: true })}
    ${NEW_HOME ? `<div class="group">${cell({ act: "moved", icon: I.globe, tile: "blue", label: "Chat Has Moved", sub: esc(NEW_HOME.replace(/^https?:\/\//, "")), chev: true })}</div>` : ""}
    <div class="ghead">Today’s Pigeons</div>
    ${((space) => `<div class="group loft">${space.length > 1 ? `<div class="lrow">${earth}</div><div class="lrow space"><span class="lcap">Space</span>${space.join("")}</div>` : `<div class="lrow five">${earth}${space[0]}</div>`}</div>`)(
      [col("orbital", "Orbital", "Orbital"), ...(on("moon") ? [col("lunar", "Lunar", "Lunar"), col("lunarx", "Lunar Express", "Express")] : []), ...(on("mars") ? [col("laser", "Laser", "Laser")] : [])])}
    <div class="gfoot">New ones hatch through the day: 1 rocket, 3 turbo, 9 swift, a mystery and 2 orbital, which go round the Earth.${on("moon") ? " Only lunar pigeons reach the Moon." : ""}${on("mars") ? " Only laser pigeons reach Mars." : ""} Standard pigeons are free and fly on your turn.</div>
    <div class="ghead">Your Loft</div>
    <div class="group">${cell({ act: "birds", icon: I.bird, tile: "orange", label: "Your Pigeons", sub: S.birds.length ? esc(S.birds.map((b) => b.name).join(", ")) : "Name them, and they build careers", chev: true })}
      ${cell({ act: "flightlog", icon: I.dist, tile: "teal", label: "Flight Log", sub: "Miles, passport, badges and looks", chev: true })}
      ${cell({ act: "feathers", icon: I.coin, tile: "yellow", label: "Coots", sub: "Your Coots Coins, for the shop", val: `<span class="fbal">${(S.feathers || 0).toLocaleString("en-GB")}</span>`, chev: true })}</div>
    <div class="ghead">Flying</div>
    <div class="group">${toggleCell({ act: "risky", icon: I.skull, tile: "red", label: "Pigeon Death", on: u.risky })}</div>
    <div class="gfoot">Every pigeon you send flies 1.25× faster, but 1 in 100 never arrives. You won’t know until it happens, and then it’s your turn again.</div>
    ${accountPage() ? `<div class="group mt">` : `<div class="ghead">Settings</div>
    <div class="group">${notifyCell(u)}${cell({ act: "securitysheet", icon: I.shield, tile: "green", label: "Privacy &amp; Security", chev: true })}`}
      ${cell({ act: "profile", icon: u.moon ? (worldOf(u) === "mars" ? I.up : I.moon) : I.pin, tile: u.moon ? (worldOf(u) === "mars" ? "red" : "indigo") : "teal", label: "Location", val: esc((u.place || "Not set").replace(/, (the Moon|Mars)$/, "")), chev: true })}
    </div>
    <div class="group mt">${cell({ act: "signout", label: "Sign Out", cls: "center destructive" })}</div>
    <p class="aver"><button type="button" class="alink" data-act="creditsheet">Map &amp; Weather Data</button></p>
    <div class="gap"></div>`;
}
// Encryption & Safety Numbers, as a row (Privacy & Security, where that's in the app): a friend's key
// that's changed first, else how many are verified and who's next (with its bar, in the sheet: its width set as it's drawn)
function encCell(bar) {
  const ver = S.friends.filter(isVerified).length, changed = S.friends.filter((f) => f.keyChanged).length;
  const nextUp = S.friends.filter((f) => !f.keyChanged && !isVerified(f)).sort((a, b) => (b.last?.sentAt || 0) - (a.last?.sentAt || 0))[0];     // (the friend you wrote to most lately)
  return `<button type="button" class="cell has-icon" data-act="encryptionsheet"><span class="tile green">${I.lock}</span><span class="ctext"><span>Encryption &amp; Safety Numbers</span><span class="csub${changed ? " warnc" : ""}">${changed ? `${changed} key${changed > 1 ? "s" : ""} changed: check ${changed > 1 ? "them" : "it"}` : S.friends.length ? `${ver} of ${S.friends.length} friend${S.friends.length > 1 ? "s" : ""} verified${nextUp ? ` · ${esc(first(nextUp.name))} next` : ""}` : "On for every message"}</span>
            ${bar && S.friends.length && !changed ? `<i class="vbar" aria-hidden="true"><b data-w="${((ver / S.friends.length) * 100).toFixed(1)}"></b></i>` : ""}</span>${chevSm}</button>`;
}
const toggleCell = ({ act, id, icon, tile, label, sub, on, disabled }) => `<button type="button" class="cell has-icon" role="switch" aria-checked="${!!on}" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""}${disabled ? " disabled" : ""}>
    <span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span><span class="switch${on ? " on" : ""}" aria-hidden="true"></span></button>`;
// Account shows one row; the settings live in their own sheet, like iOS Settings.
function notifyCell(u) {
  const ps = pushState();
  const on = [ps === "on" && "Push", u.notifyEmail && "Email"].filter(Boolean);
  const val = on.length ? on.join(", ") : ps === "homescreen" ? "Set Up" : "Off";
  return cell({ act: "notifysheet", icon: I.bell, tile: "red", label: "Notifications", val: esc(val), chev: true });
}
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
function vNotifySheet() {
  const u = S.me, n = u.notify || {}, ps = pushState();
  const pushFoot = {
    homescreen: "On iPhone, notifications need Chat on your Home Screen: tap Share, then Add to Home Screen, and open it from there.",
    denied: "Notifications are blocked for Chat. Turn them on in your phone’s Settings, then come back here.",
    unsupported: "This browser can’t show notifications. Email still works.",
  }[ps] || "Push notifications are set for each phone. The settings below apply to all of them.";
  const t = (key, icon, tile, label, sub) => toggleCell({ act: "npref", id: key, icon, tile, label, sub, on: !!n[key] });
  const hours = (key) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${n[key] === h ? " selected" : ""}>${hourLabel(h)}</option>`).join("");
  const anyOn = ps === "on" || u.notifyEmail;
  return `
    <div class="ghead">This Phone</div>
    <div class="group">
      ${toggleCell({ act: "pushtoggle", icon: I.bell, tile: "red", label: "Push Notifications", on: ps === "on", disabled: !["on", "off"].includes(ps) || S.pushBusy })}
      ${ps === "on" ? cell({ act: "pushtest", label: "Send a Test Notification", cls: "action" }) : ""}
    </div>
    <div class="gfoot">${pushFoot}</div>
    ${S.emailOn ? `<div class="ghead">Email</div>
    <div class="group">${toggleCell({ act: "emailtoggle", icon: I.mail, tile: "blue", label: "Email Me", sub: esc(u.email), on: u.notifyEmail })}</div>
    <div class="gfoot">${u.emailOk === false ? `Emails start once you confirm your address: tap the link we sent to ${esc(u.email)}. <button type="button" class="link inl" data-act="confirmsend">Send it again</button>`
      : "Only when a pigeon has waited 10 minutes unread, and at most every half hour. Every email has a link to turn them off."}</div>` : ""}
    <div class="nwrap${anyOn ? "" : " dim"}">
    <div class="ghead">Notify Me When</div>
    <div class="group">
      ${t("landed", I.bird, "orange", "A Pigeon Lands")}
      ${t("takeoff", I.up, "teal", "A Pigeon Takes Off", "When a friend sends you one")}
      ${t("rerouted", I.loc, "blue", "A Pigeon Changes Course", "When a friend moves while yours is flying")}
      ${t("lost", I.skull, "red", "A Pigeon Is Lost", "When Pigeon Death takes one of yours")}
      ${t("delays", I.storm, "indigo", "Weather Delays", "When one flies into weather that makes it late")}
      ${t("requests", I.addp, "green", "Friend Requests")}
      ${t("accepted", I.people, "indigo", "Request Accepted")}
      ${t("reactions", I.heart, "pink", "Reactions", "When someone reacts to your message")}
      ${t("moments", I.pass, "teal", "Mid-air Moments", "Near misses, cheers, ships, and friends’ pigeons flying over you")}
      ${t("streaks", I.flame, "orange", "Flight Streaks", "A few hours before a streak with a friend runs out")}
      ${t("weekly", I.globe, "blue", "Your Week in Flight", "Sunday evening: miles flown and badges earned")}
    </div>
    <div class="ghead">Lock Screen</div>
    <div class="group">${t("names", I.eye, "gray", "Show Names")}</div>
    <div class="gfoot">${n.names ? "Notifications say who sent a pigeon." : "Notifications just say “A pigeon has landed”, without who sent it."} They never include what a message says: only your phone can read that.</div>
    <div class="ghead">Quiet Hours</div>
    <div class="group">
      ${t("quiet", I.moon, "indigo", "Quiet Hours")}
      ${n.quiet ? `<label class="cell"><span class="ctext"><span>From</span></span><span class="val">${hourLabel(n.quietFrom)}</span>${chevSm}
        <select class="overlay" data-act="quiethour" data-id="quietFrom" aria-label="Quiet from">${hours("quietFrom")}</select></label>
      <label class="cell"><span class="ctext"><span>To</span></span><span class="val">${hourLabel(n.quietTo)}</span>${chevSm}
        <select class="overlay" data-act="quiethour" data-id="quietTo" aria-label="Quiet until">${hours("quietTo")}</select></label>` : ""}
    </div>
    <div class="gfoot">${n.quiet ? `Nothing arrives between ${hourLabel(n.quietFrom)} and ${hourLabel(n.quietTo)} (${esc(n.tz)} time). Pigeons that land meanwhile are announced when quiet hours end.` : "Hold notifications overnight, and hear about anything that landed when quiet hours end."}</div>
    </div>`;
}
async function setNotify(patch) {
  const before = S.me.notify;
  S.me.notify = { ...before, ...patch }; render(); renderSheet();            // feel instant
  try {
    const r = await api("me", { method: "PATCH", body: { notify: patch } });
    const same = JSON.stringify(r.me.notify) === JSON.stringify(S.me.notify);
    S.me = r.me;
    if (same) return;                 // already showing; redrawing would cut a switch off mid-glide
  } catch (err) { S.me.notify = before; toast(esc(err.message)); }
  render(); renderSheet();
}
function cityOptions() {
  const cur = S.me?.place;
  return `<option value="">Choose a city</option>` +
    [...PLACES].sort((a, b) => a[0].localeCompare(b[0])).map(([n]) => `<option value="${esc(n)}"${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
}

/* ---------- Chat ---------- */
// How far away a friend is, once it's a mile or more ("" when you don't know, or they're near)
const milesAway = (f) => {
  if (moonChat(f)) {
    const a = endFor(S.me), b = endFor(f); if (!a || !b) return "";
    return fmtMiles(a.b === b.b ? surfaceKm(a.b, a, b) : a.b === "mars" || b.b === "mars" ? marsKm(now()) : moonKm(now()));
  }
  const km = S.me?.lat != null && f?.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : 0; return km >= 1.61 ? fmtMiles(km) : "";
};
// Under a friend's name: the time where they are (when it isn't yours), where, and how far
function chatSub(f) {
  const bits = [];
  let icon = "";
  // off the Earth: day or night where they are (a lunar day lasts a month; a Martian sol 24h 39m)
  if (f.moon) {
    const site = esc((f.place || "").replace(/, (the Moon|Mars)$/, ""));
    if (f.moon.b === "mars") { const c = marsClock(f.moon.lon, now()); icon = c.day ? I.sun : I.moon; bits.push(`${c.hm} at ${site} · ${c.day ? "sunset" : "sunrise"} in ${fmtDur(c.next - now())}`); }
    else { const d = lunarDay(f.moon.lat, f.moon.lon, now()); icon = d.day ? I.sun : I.moon; bits.push(`${d.day ? "Day" : "Night"} at ${site} · ${d.day ? "sunset" : "sunrise"} in ${fmtDur(d.next - now())}`); }
  } else if (f.tz && f.tz !== MY_TZ) {
    try {
      const h = +dtf({ timeZone: f.tz, hour: "2-digit", hourCycle: "h23" }).format(now());
      icon = h >= 19 || h < 6 ? I.moon : I.sun;
      bits.push(`<span data-clock="${esc(f.tz)}">${esc(clockIn(now(), f.tz))}</span>${f.place ? ` in ${esc(f.place)}` : " there"}`);
    } catch (_) {}
  }
  if (!bits.length && f.place) bits.push(esc(f.place));
  if (milesAway(f)) bits.push(milesAway(f));
  const s = streakOf(f), st = s ? `<span class="streak${streakRisk(s) ? " risk" : ""}">${I.flame}${s.n}${streakRisk(s) ? ` · ends in ${esc(streakLeft(s))}` : ""}</span>` : "";
  return bits.length || st ? `<small class="sub">${st}${bits.length ? `${icon}<span class="one">${bits.join(" · ")}</span>` : ""}</small>` : "";
}
const gchatSub = (g) => { const n = others(g).map((p) => esc(first(p.name))); return n.length ? `<small class="sub"><span class="one">${n.join(", ")}</span></small>` : ""; };
/* ---------- pigeons on their way to you, kept small ---------- */
const flyTrack = (m) => `<span class="ctrack" aria-hidden="true" data-from="${esc(m.sentAt)}" data-to="${esc(m.deliverAt)}"><i></i><b class="cb"><svg viewBox="0 0 24 24" class="cbird"><path d="${BIRD}" transform="matrix(-1 0 0 1 24 0)"/></svg></b></span>`;
const inbound = (m) => m.from !== S.me.id && m.flying && !m.lost && !m.stopover;
// Several on their way at once (a group, or swifts one after another): one card, a row each (the card's key is its
// place among the chat's cards, so it stays the same card as its pigeons land one by one)
let runN = 0;
function flyRun(run, g) {
  const next = Math.min(...run.map((m) => m.deliverAt)), kinds = [...new Set(run.map((m) => kindOf(m)))];
  const rows = run.map((m) => {
    const who = g ? member(g, m.from) || { id: m.from, name: "Former member" } : null;
    const name = g ? esc(first(who.name)) : kindOf(m) === "standard" ? "Standard" : KIND[kindOf(m)].name;
    return `<button type="button" class="frr" data-key="m:${esc(m.id)}" data-sig="fly" data-in="land" data-act="map" data-id="${esc(m.id)}" aria-label="${name}${g ? "’s pigeon" : " pigeon"}, lands in ${esc(fmtDur(m.deliverAt - now()))}. Watch it on the map.">
      ${g ? avatar(who, "xs") : ""}${pgm(m)}<span class="n one">${name}</span>${flyTrack(m)}<b><span data-eta="${esc(m.deliverAt)}"></span></b></button>`;
  }).join("");
  return `<div class="flyrun" data-key="run:${runN++}" data-sig="${run.length}" role="group" aria-label="${run.length} pigeons on their way">
    <div class="frh"><span class="stack">${kinds.slice(0, 3).map((k) => pg(k)).join("")}</span><b>${run.length} on their way</b><small><span class="w">next in </span><span data-eta="${esc(next)}"></span></small></div>${rows}</div>`;
}

/* ---------- who has it: your message to a group, member by member ---------- */
const whoState = (x) => (x.recalled ? "back" : x.lost ? "lost" : x.flying ? "fly" : x.readAt ? "read" : "landed");
const whoCls = (x) => "w-" + whoState(x);              // (prefixed: .fly is the incoming pigeon's card)
const whoOrder = (m) => [...(m.flock || [])].sort((a, b) => a.deliverAt - b.deliverAt);
function whoDots(m) {
  const fl = whoOrder(m), more = fl.length > 12 ? fl.length - 11 : 0;
  return `<span class="whodots" aria-hidden="true">${(more ? fl.slice(0, 11) : fl).map((x) => `<i class="${whoCls(x)}" data-key="wd:${esc(m.id)}:${esc(x.to)}" data-sig="${whoState(x)}" data-in="pop"></i>`).join("")}${more ? `<b>+${more}</b>` : ""}</span>`;
}
function whoHasLabel(m) {
  const fl = m.flock || [], n = (s) => fl.filter((x) => whoState(x) === s).length;
  return `Who has it: ${n("read")} read, ${n("landed")} landed, ${n("fly")} still flying${n("lost") ? `, ${n("lost")} lost` : ""}${n("back") ? `, ${n("back")} called back` : ""}. Show who.`;
}

/* ---------- a message ----------
   Its time sits inside it, with two ticks once they've read yours. Yours in
   the air is an outline with its pigeon on a hairline of the way; theirs is
   sealed until it lands. Tap yours in the air for the flight; anything that
   has landed to react, reply or see the flight. */
// (six days or more ahead, a pigeon booked for then, with its date: "Thu 5 Nov 18:00", as a weekday alone reads as this week's)
const atTime = (ts) => { const d = new Date(ts); return sameDay(ts, now()) ? fmtTime(ts) : sameDay(ts, now() + DAY) ? `tomorrow ${fmtTime(ts)}` : ts - now() < 6 * DAY ? `${DOW[d.getDay()]} ${fmtTime(ts)}` : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${fmtTime(ts)}`; };
// the same, where room is short (the message box, a card): "18:40", "Thu 02:20"
const atShort = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : ts - now() < 6 * DAY ? `${DOW[new Date(ts).getDay()]} ${fmtTime(ts)}` : `${new Date(ts).getDate()} ${MON[new Date(ts).getMonth()]} ${fmtTime(ts)}`);
// a duration, roughly: "45m", "2h", "1d 10h"
const durShort = (ms) => (ms < HOUR ? fmtDur(ms) : ms < DAY ? `${Math.round(ms / HOUR)}h` : fmtDur(ms));
const airTrack = (m) => `<span class="trk" aria-hidden="true" data-from="${esc(m.sentAt)}" data-to="${esc(m.deliverAt)}"><i></i><b class="cb">${I.bird}</b></span>`;
function footHtml(m, mine, g) {
  if (mine && m.lost && !g) return `<span class="ft lostft">${I.skull}${m.bird ? `${esc(m.bird.name)} was lost` : "Lost on the way"} · Pigeon Death</span>`;
  if (mine && m.flying && !g) return `<span class="ft">${m.waiting ? I.clock : ""}lands ${atTime(m.deliverAt)}</span>`;
  // landed: no time on the bubble, as in Messages (the time sits in the header above it, and in its menu)
  return "";
}
// in a group, "Landed for all · read by" sits under your latest landed message only (the older ones keep it if something's still to say)
let quietMeta = null;
// one to three emoji on their own: big, with no bubble
const JUMBO_RE = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*){1,3}$/u;
// a header over each stretch of the chat, as in Messages: "Today 17:24", "Yesterday 10:19", "Mon 13 Oct 09:02"
const TIME_GAP = HOUR;
// (keyed by its place in the chat: a stretch whose first pigeon lands keeps its header, which changes its time)
let tsN = 0;
const stampHtml = (at) => `<div class="stamp" data-key="ts:${tsN++}" data-sig="${at}"><b>${dayLabel(at)}</b> ${fmtTime(at)}</div>`;
// under your latest landed message (one to one): landed, or read, and when
function statusLine(m) {
  return `<div class="meta me rstat" data-key="st" data-sig="${m.readAt ? "read" : "landed"}">${m.readAt ? `Read ${fmtShort(m.readAt)}` : `Landed ${fmtShort(m.deliverAt)}`}</div>`;
}
function bubble(f, m, gapTop, g) {
  if (m.stopover) return stopCard(f, m);
  const mine = m.from === S.me.id, k = kindOf(m);
  const fresh = S.fresh.has(m.id) ? ` fresh" data-fresh="${esc(m.id)}` : "";
  // (its key, for a redraw: what it is now, and that it comes down to land)
  const st = m.recalled ? "back" : m.lost ? "lost" : m.flying ? "fly" : "in", kk = (sig = st, c = "") => ` data-key="m:${esc(m.id)}${c}" data-sig="${sig}" data-in="land"`;
  if (m.recalled && (!mine || !g || !flockCount(m).landed)) return `<div class="lostnote homing${fresh}"${kk("back")}>${I.homing}<span>${mine ? `You called ${g ? "these pigeons" : "this pigeon"} back.` : `${esc(first(f.name))} called their pigeon back.`}</span></div>`;
  if (!mine && m.lost) return `<div class="lostnote${fresh}"${kk("lost")}>${I.skull}<span>${esc(first(f.name))}’s pigeon was lost on the way.</span></div>`;
  if (!mine && m.flying) {
    // sealed until it lands: when, and its pigeon on the way
    const via = m.via ? ` via ${esc(first(friend(m.via)?.name || "a friend"))}` : "";
    return `<button type="button" class="b up sealed fly k-${k}${gapTop ? " gap-top" : ""}${fresh}"${kk("fly")} data-act="map" data-id="${esc(m.id)}" aria-label="${k === "standard" ? "A pigeon" : `A ${KIND[k].name.toLowerCase()} pigeon`} from ${esc(first(f.name))}${via}, sealed until it lands ${esc(atTime(m.deliverAt))}. Watch it on the map.">
      <span class="sl">${I.lock}<span>Sealed${via} · lands ${atTime(m.deliverAt)}</span></span>${airTrack(m)}</button>`;
  }
  const p = S.plain.get(m.id) || { t: "" };
  const quote = p.q ? quoteHtml(p.q, g) : "";
  const jumbo = !p.p && !p.v && !p.q && !p.bad && !m.flying && !m.lost && JUMBO_RE.test(p.t || "");
  const text = p.bad ? `<span class="bad-scroll">${p.unchecked ? "Check the new safety number to open this message." : "This message couldn’t be opened on this phone."}</span>` : esc(p.t).replace(/\n/g, "<br>");
  // tap: your pigeon in the air → its flight; anything that's arrived → react, reply or its flight
  const tapAct = mine && m.flying ? ` data-act="flymenu" data-id="${esc(m.id)}" role="button" tabindex="0" aria-haspopup="menu"` : !m.flying && !m.lost && !p.bad ? ` data-act="msgmenu" data-id="${esc(m.id)}" role="button" tabindex="0" aria-haspopup="menu"` : "";
  const up = mine && m.flying, foot = footHtml(m, mine, g);
  // in the air (one to one): the way so far, then when it lands
  const tail = up && !g ? `<span class="frow">${m.waiting ? "" : airTrack(m)}${foot}</span>` : foot;
  const cls = `${mine ? " me" : ""}${up ? ` up k-${k}` : ""}${m.waiting ? " waiting" : ""}${m.lost ? " lost" : ""}${gapTop ? " gap-top" : ""}${fresh}`;
  let html;
  if (p.v) {
    const gone = m.photo === 2 || S.photoGone.has(m.id);
    html = `<div class="b voicem${cls}" data-mid="${esc(m.id)}"${kk(gone ? st + ":gone" : st)}${tapAct}>${quote}${gone ? `<span class="vgone">${I.gone}Voice pigeon expired</span>` : voiceHtml(m.id, p.v, mine)}${tail}</div>`;
  } else if (onceP(p)) {
    // view once: a pill to tap (theirs), what became of it (yours), the words below
    const gone = picGone(m), seen = (m.flock || []).filter((x) => x.viewedAt).length;
    const opened = mine ? (g ? seen > 0 : !!m.viewedAt) : !!(m.viewedAt || openedOnce(m.id));
    const label = mine ? (g && seen ? `Opened by ${seen}` : opened ? "Opened" : gone ? "Photo expired" : "Photo") : opened ? "Opened" : gone ? "Photo expired" : "View photo";
    const can = !mine && !opened && !gone && !m.flying && !m.lost;
    const words = p.t || quote;
    html = can ? `<button type="button" class="b once live${cls}" data-mid="${esc(m.id)}"${kk(`${st}:${label}`)} data-act="viewonce" data-id="${esc(m.id)}" aria-label="View photo, once">${I.once}<b>${label}</b></button>`
      : `<div class="b once${opened || gone ? " done gone" : ""}${cls}" data-mid="${esc(m.id)}"${kk(`${st}:${label}`)}${tapAct}>${I.once}<b>${label}</b>${words ? "" : tail}</div>`;
    if (words) html += `<div class="b ocap${cls}" data-mid="${esc(m.id)}"${kk(st, ":c")}${tapAct}>${quote}${text}${tail}</div>`;
  } else if (p.p && picGone(m)) {
    // gone: a quiet outline of where it was, the time beside it; its words (if any) in their own bubble below
    const words = p.t || quote;
    html = `<div class="b gone${cls}" data-mid="${esc(m.id)}"${kk(st + ":gone")}${tapAct}><span class="gonel">${I.gone}${picWord(p)} expired</span>${words ? "" : tail}</div>`;
    if (words) html += `<div class="b ocap${cls}" data-mid="${esc(m.id)}"${kk(st, ":c")}${tapAct}>${quote}${text}${tail}</div>`;
  } else if (p.p) {
    let photo;
    // its real shape, known before it loads, so the chat doesn't jump as photos and GIFs appear
    const ar = p.p.w > 0 && p.p.h > 0 ? ` data-ar="${Math.max(0.4, Math.min(2.5, p.p.w / p.p.h)).toFixed(4)}"` : "";
    if (m.photo === 2 || S.photoGone.has(m.id)) photo = `<div class="ph">${I.gone}<span>${picWord(p)} expired</span></div>`;
    else if (S.photos.get(m.id)) { const b = born(S.photos.get(m.id)), c = [p.p.m === "image/gif" ? "gif" : "", b ? "arrive" : ""].filter(Boolean).join(" ");
      photo = `<img${c ? ` class="${c}"` : ""}${b ? ` data-born="${b}"` : ""}${ar} src="${S.photos.get(m.id)}" alt="${picWord(p)} from ${esc(first(mine ? S.me.name : f.name))}" data-act="view" data-id="${esc(m.id)}" role="button" tabindex="0">`; }
    else photo = `<div class="ph wait"${ar}>Opening photo…</div>`;
    // the time goes under its words, or over the picture when there are none
    html = `<div class="b pic${cls}" data-mid="${esc(m.id)}"${kk(st + (p.bad ? ":bad" : ""))}${tapAct}>${photo}${p.t || quote || up ? `<span class="ptxt">${quote}${text}${tail}</span>` : foot.replace('class="ft', 'class="ft over')}</div>`;
  } else html = `<div class="b${jumbo ? " jumbo" : ""}${cls}" data-mid="${esc(m.id)}"${kk(st + (p.bad ? ":bad" : ""))}${tapAct}>${quote}${text}${tail}</div>`;
  // a line added by the friend it stopped with on the way
  if (m.via && !mine && S.notes.get(m.id)) html += `<div class="vianote" data-key="vn:${esc(m.id)}"><b>${esc(first(friend(m.via)?.name || "A friend"))} added</b><span>${esc(S.notes.get(m.id))}</span></div>`;
  html += reactsHtml(m, mine);
  html += postmarkHtml(m, mine);
  const meta = [];
  if (g && mine) {
    // a dot for each of them, filling in as their pigeons land (and turning blue once they've read it); tap for who
    const c = flockCount(m), tap = (inner, cls = "") => `<button class="fl flock ${cls}" data-act="whohas" data-id="${esc(m.id)}" aria-label="${esc(whoHasLabel(m))}">${whoDots(m)}${inner}</button>`;
    if (m.flying) meta.push(tap(`${c.landed} of ${c.n} landed${c.lost ? ` · ${c.lost} lost` : ""} · next in <span data-eta="${esc(c.next)}"></span>`, k));
    else if (c.recalled) meta.push(tap(`Landed for ${c.landed} of ${c.n} · <span class="homing">${I.homing} ${c.recalled} called back</span>${c.lost ? ` · ${I.skull} ${c.lost} lost` : ""}`, "done"));
    else if (c.lost === c.n) meta.push(`<button class="fl lostm" data-act="whohas" data-id="${esc(m.id)}">${I.skull} Lost on the way · Pigeon Death</button>`);
    else if (c.lost) meta.push(tap(`Landed for ${c.landed} of ${c.n} · ${I.skull} ${c.lost} lost`, "done"));
    else if (!quietMeta?.has(m.id)) { const r = (m.flock || []).filter((x) => x.readAt).length; meta.push(tap(`${r === c.n ? `Read by all ${c.n}` : r ? `Landed for all ${c.n} · read by ${r}` : `Landed for all ${c.n}`}`, "done")); }
  }
  const onceDone = onceP(p) && (m.viewedAt || openedOnce(m.id) || (m.flock || []).some((x) => x.viewedAt));
  // once everyone who could open it has, there's nothing left to disappear
  const allSeen = onceP(p) && (g ? (m.flock || []).length > 0 && m.flock.every((x) => x.viewedAt) : !!m.viewedAt);
  if (p.p && m.photo === 1 && !m.flying && !picGone(m) && !(onceDone && !mine) && !(mine && allSeen)) meta.push(`<span class="fl exp">${onceP(p) ? (mine ? "View once · " : "Opens once · ") : ""}${picWord(p)} disappears in <span data-eta="${esc(m.expiresAt)}"></span></span>`);
  return html + (meta.length ? `<div class="meta${mine ? " me" : ""}" data-key="mt:${esc(m.id)}" data-sig="${kSig(meta.join(""))}">${meta.join("")}</div>` : "");
}
// A friend's pigeon to someone else, stopping with you on the way: read it, and add a line.
function stopCard(f, m) {
  const to = friend(m.finalTo), toName = esc(first(to?.name || "a friend")), p = S.plain.get(m.id), fresh = S.fresh.has(m.id) ? " fresh" : "";
  const kk = (sig) => ` data-key="m:${esc(m.id)}" data-sig="${sig}"`;
  if (m.recalled) return `<div class="lostnote homing${fresh}"${kk("back")}>${I.homing}<span>${esc(first(f.name))} called back their pigeon to ${toName}.</span></div>`;
  if (m.lost) return `<div class="lostnote${fresh}"${kk("lost")}>${I.skull}<span>${esc(first(f.name))}’s pigeon to ${toName} was lost on the way.</span></div>`;
  const t = now(), state = t < m.viaAt ? `Stopping with you on its way to ${toName} · here in <span data-eta="${esc(m.viaAt)}"></span>`
    : t < m.viaOff ? `Resting with you on its way to ${toName} · flies on in <span data-eta="${esc(m.viaOff)}"></span>` : `Stopped with you, then flew on to ${toName}`;
  const text = p && !p.bad ? `<p class="stext">${esc(p.t).replace(/\n/g, "<br>")}${p.ph ? `<span class="hid">${I.photo} A photo only ${toName} can see</span>` : ""}</p>` : p?.bad ? `<p class="stext bad-scroll">This message couldn’t be opened on this phone.</p>` : "";
  const line = S.notes.get(m.id);
  const add = line != null ? `<p class="smine"><b>You added</b>${esc(line)}</p>` : m.resting && to ? `<button type="button" class="btn small" data-act="vianote" data-id="${esc(m.id)}">${I.compose}Add a Line for ${toName}</button>` : "";
  return `<div class="stopcard${fresh}" data-mid="${esc(m.id)}"${kk(`${t < m.viaAt ? "a" : t < m.viaOff ? "r" : "d"}${line != null ? "+" : ""}`)}><span class="st1">${pgm(m)}<span>${state}</span></span>${text}${add}</div>`;
}
/* ---------- share a flight ----------
   A landed pigeon as a picture to post: an airmail postcard (4:5) or a dark
   story (9:16), drawn here on the phone with the app's own map. Only the two
   places, the day and the flight go on it: never the message, and never your
   friend's name (yours only if you leave it on). */
const CARD_FONT = '-apple-system, "SF Pro Display", system-ui, Inter, "Helvetica Neue", Arial, sans-serif';
const STAMP_INK = { rocket: ["#fbe38a", "#d9a21b", "#a87808"], swift: ["#ff8a80", "#ff3b30", "#b8241b"], turbo: ["#5a5a60", "#1c1c1e", "#000000"],
  standard: ["#8ee39f", "#34c759", "#1d7f37"], dumb: ["#d8bf9a", "#a2845e", "#6f5636"],
  lunar: ["#e3e8f3", "#8190b3", "#56607a"], lunarx: ["#b9b8ff", "#5e5ce6", "#3532a8"], laser: ["#ffb3a8", "#e5484d", "#8f1d22"], orbital: ["#9fd0ff", "#0a84ff", "#0b3d91"] };
const STORY_INK = { rocket: "#f0c04a", swift: "#ff6961", turbo: "#f5f5f7", standard: "#30d158", dumb: "#c4a57e", lunar: "#c9d2e6", lunarx: "#8e8cff", laser: "#ff6961", orbital: "#64b5ff" };
const shareable = (m) => !!((m?.route || m?.moon) && !m.flock && !m.lost && !m.recalled && m.km != null && m.deliverAt <= now());
// a space flight's picture, for the cards (the trip as it ended, in its night sky)
function spaceCard(m, cssW, cssH, dpr = 3) {
  const cv = document.createElement("canvas");
  drawTrip(cv, m.moon, m.moon.k === "laser" ? 1 : 0.985, m.deliverAt, { size: { w: cssW, h: cssH, dpr } });
  return cv;
}
// what goes on the card, in the time where it landed
function flightFacts(m, withName) {
  const mine = m.from === S.me.id, other = friend(mine ? m.to : m.from), flew = Math.max(1, m.deliverAt - m.sentAt), k = kindOf(m), w = m.wind;
  const tz = mine ? other?.tz : MY_TZ;
  const at = (o) => { try { return dtf({ timeZone: tz || undefined, ...o }).format(m.deliverAt); } catch (_) { return dtf(o).format(m.deliverAt); } };
  let zone = "";
  try { zone = dtf({ timeZone: tz || undefined, timeZoneName: "short" }).formatToParts(m.deliverAt).find((x) => x.type === "timeZoneName")?.value || ""; } catch (_) {}
  const mph = (kmh) => Math.round(Math.abs(kmh) * 0.621371);
  return {
    k, from: m.fromPlace || "Somewhere", to: m.toPlace || "Somewhere", miles: fmtMiles(m.km + shipKm(m.legs)), longMiles: ((mi) => `${mi.toLocaleString("en-GB")} mile${mi === 1 ? "" : "s"}`)(Math.round((m.km + shipKm(m.legs)) * 0.621371)),
    dur: fmtDur(flew), mph: fmtMph(avgKmh(m)),
    sky: w == null ? [KIND[k].name, "Pigeon"] : Math.abs(w) < 3 ? ["Calm", "Skies"] : [`${mph(w)} mph`, w > 0 ? "Tailwind" : "Headwind"],
    skyLine: w == null ? "" : Math.abs(w) < 3 ? "calm skies" : `${w > 0 ? "tailwind" : "headwind"} ${mph(w)} mph`,
    time: at({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), zone,
    day: at({ day: "numeric", month: "long", year: "numeric" }), dayShort: at({ day: "numeric", month: "short", year: "numeric" }),
    stampDay: at({ day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
    name: withName ? first(S.me.name) : "", by: withName ? `${mine ? "Sent" : "Received"} by ${first(S.me.name)}` : "",
    site: `${location.host}${location.pathname.replace(/\/+$/, "")}`,
  };
}
// The flight on the app's own map, drawn off screen in fixed colours (the
// globe, or flat), cssW × cssH at dpr pixels to each.
async function cardMap(m, ink, globe, cssW, cssH, dpr = 3) {
  const want = globe ? ["50m"] : m.km < 900 ? ["50m", "10m"] : ["50m"];
  for (const res of want) await new Promise((ok) => {               // the coast in the detail the map will want
    const t0 = Date.now();
    (function wait() { world(res); if (typeof WORLD[res] === "object" || WORLD[res] === "failed" || Date.now() - t0 > 5000) ok(); else setTimeout(wait, 60); })();
  });
  const cv = document.createElement("canvas");
  cv.className = `cardmap ink-${ink}`; cv.style.width = `${cssW}px`; cv.style.height = `${cssH}px`; cv._dprFix = dpr; cv._spin = -1;
  document.body.append(cv);
  const keep = S.sheet;
  S.sheet = { type: "cardmap", globe, view: null, gview: null }; mapInk = ink;
  try { drawMap(cv, m, 0); return { cv, frame: globe ? globeFrame(cv, m, 0) : null }; }
  finally { S.sheet = keep; mapInk = null; cv.remove(); }
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// one line as big as it can be (up to size) in maxW
function fitFont(g, s, weight, size, maxW, min = 22) {
  let z = size;
  for (; z > min; z -= 2) { g.font = `${weight} ${z}px ${CARD_FONT}`; if (g.measureText(s).width <= maxW) break; }
  g.font = `${weight} ${z}px ${CARD_FONT}`; return z;
}
// letter-spaced capitals
function spaced(g, s, x, y, gap, align = "left") {
  const ch = [...s], w = ch.reduce((a, c) => a + g.measureText(c).width, 0) + gap * (ch.length - 1);
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const keep = g.textAlign; g.textAlign = "left";
  for (const c of ch) { g.fillText(c, cx, y); cx += g.measureText(c).width + gap; }
  g.textAlign = keep; return w;
}
function appIcon(g, x, y, sz) {
  const gr = g.createLinearGradient(x, y, x + sz * 0.6, y + sz); gr.addColorStop(0, "#4aa3ff"); gr.addColorStop(1, "#0055d4");
  g.fillStyle = gr; rrect(g, x, y, sz, sz, sz * 0.22); g.fill();
  g.save(); g.translate(x + sz * 0.125, y + sz * 0.137); g.scale(sz / 32, sz / 32); g.fillStyle = "#fff"; g.fill(new Path2D(BIRD)); g.restore();
}
// the airmail stamp, perforated, in the pigeon's colour (as on every pigeon that lands)
function cardStamp(g, x, y, F) {
  const s = document.createElement("canvas"); s.width = 198; s.height = 242; const o = s.getContext("2d");
  o.fillStyle = "#fffdf7"; o.fillRect(0, 0, 198, 242);
  o.globalCompositeOperation = "destination-out";
  const hole = (px, py) => { o.beginPath(); o.arc(px, py, 7, 0, 7); o.fill(); };
  for (let i = 0; i <= 9; i++) { hole(i * 22, 0); hole(i * 22, 242); }
  for (let j = 0; j <= 11; j++) { hole(0, j * 22); hole(198, j * 22); }
  o.globalCompositeOperation = "source-over";
  const [c1, c2, c3] = STAMP_INK[F.k] || STAMP_INK.standard, gr = o.createLinearGradient(60, 20, 140, 222);
  gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
  o.fillStyle = gr; rrect(o, 20, 20, 158, 202, 5); o.fill();
  o.strokeStyle = "rgba(255,255,255,.35)"; o.lineWidth = 2; rrect(o, 21, 21, 156, 200, 5); o.stroke();
  o.save(); o.translate(57, 44); o.scale(3.5, 3.5); o.shadowColor = "rgba(0,0,0,.28)"; o.shadowBlur = 3; o.shadowOffsetY = 1; o.fillStyle = "#fff"; o.fill(new Path2D(BIRD)); o.restore();
  o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic";
  o.shadowColor = "rgba(0,0,0,.25)"; o.shadowBlur = 3; o.shadowOffsetY = 1;
  fitFont(o, F.miles, 800, 30, 140, 18); o.fillText(F.miles, 99, 170);
  o.shadowColor = "transparent"; o.font = `700 13px ${CARD_FONT}`; spaced(o, KIND[F.k].name.toUpperCase(), 99, 196, 3, "center");
  g.save(); g.translate(x + 99, y + 121); g.rotate(4 * Math.PI / 180);
  g.shadowColor = "rgba(60,40,0,.24)"; g.shadowBlur = 16; g.shadowOffsetY = 8; g.drawImage(s, -99, -121); g.restore();
}
// struck across the stamp: where and when it landed
function cardPostmark(g, x, y, F) {
  g.save(); g.translate(x, y); g.rotate(-8 * Math.PI / 180); g.globalAlpha = 0.72; g.globalCompositeOperation = "multiply";
  g.strokeStyle = g.fillStyle = "#2b2f45"; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.arc(0, 0, 100, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 64, 0, 7); g.stroke();
  for (let i = 0; i < 4; i++) {
    const yy = -46 + i * 30, x0 = i === 0 || i === 3 ? 104 : 108;
    g.beginPath(); for (let t = 0; t <= 200; t += 4) { const px = x0 + t, py = yy - 7 * Math.sin((t / 50) * Math.PI); t ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  }
  // round the ring, centred at the top
  const ring = `${F.to.toUpperCase()} • ${F.stampDay} • LANDED • `, R = 82;
  let z = 22; g.font = `800 ${z}px ${CARD_FONT}`;
  const len = () => [...ring].reduce((a, c) => a + g.measureText(c).width + 4, 0);
  while (len() > 2 * Math.PI * R * 0.97 && z > 12) { z -= 1; g.font = `800 ${z}px ${CARD_FONT}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  let a = -Math.PI / 2 - len() / R / 2;
  for (const c of ring) {
    const w = g.measureText(c).width + 4; a += w / 2 / R;
    g.save(); g.rotate(a); g.translate(0, -R); g.fillText(c, 0, 0); g.restore();
    a += w / 2 / R;
  }
  g.textBaseline = "alphabetic"; g.font = `800 36px ${CARD_FONT}`; g.fillText(F.time, 0, 12);
  g.font = `700 16px ${CARD_FONT}`; spaced(g, F.zone.toUpperCase(), 0, 40, 3, "center");
  g.restore();
}
async function postcardCard(m, withName) {
  const F = flightFacts(m, withName), W = 1080, H = 1350, PAPER = "#fbf7ee", INK = "#1c1c1e", INK2 = "#6e6a62";
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // the airmail edge
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(20, 20, W - 40, H - 40); g.clip("evenodd");
  g.translate(W / 2, H / 2); g.rotate(Math.PI / 4);
  for (let x = -1500; x < 1500; x += 104) { g.fillStyle = "#d8443a"; g.fillRect(x, -1500, 38, 3000); g.fillStyle = "#1f63c9"; g.fillRect(x + 52, -1500, 38, 3000); }
  g.restore();
  g.save(); g.beginPath(); g.rect(20, 20, W - 40, H - 40); g.clip();
  g.textBaseline = "alphabetic";
  // the flight: round the globe if it was a long one (drawn on the paper's own
  // colour, so its labels and air run out onto it), else a flat map like a photo
  const round = !m.moon && m.km >= GLOBE_KM;
  if (m.moon) {
    const cv = spaceCard(m, 474, 158, 2), x = 66, y = 452, w = 948, h = 316;
    g.save(); g.shadowColor = "rgba(60,50,30,.18)"; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = "#fff"; rrect(g, x - 14, y - 14, w + 28, h + 28, 28); g.fill(); g.restore();
    g.save(); rrect(g, x, y, w, h, 16); g.clip(); g.drawImage(cv, x, y, w, h); g.restore();
  } else if (round) {
    const { cv, frame } = await cardMap(m, "light", true, 420, 420), sc = 300 / (frame.R * 3);
    g.drawImage(cv, 404 - frame.cx * 3 * sc, 470 - frame.cy * 3 * sc, cv.width * sc, cv.height * sc);
  } else {
    const { cv } = await cardMap(m, "light", false, 474, 158, 2);
    const x = 66, y = 452, w = 948, h = 316;
    g.save(); g.shadowColor = "rgba(60,50,30,.18)"; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = "#fff"; rrect(g, x - 14, y - 14, w + 28, h + 28, 28); g.fill(); g.restore();
    g.save(); rrect(g, x, y, w, h, 16); g.clip(); g.drawImage(cv, x, y, w, h); g.restore();
  }
  g.font = `800 26px ${CARD_FONT}`; g.fillStyle = "#1f63c9"; spaced(g, "PAR PIGEON", 84, 104, 8);
  g.font = `600 22px ${CARD_FONT}`; g.fillStyle = "#d8443a"; spaced(g, "AIRMAIL", 84, 140, 4.5);
  cardStamp(g, 786, 84, F);
  cardPostmark(g, 772, round ? 362 : 340, F);
  // where from and to
  const arrow = F.k === "turbo" ? "#1f63c9" : (STAMP_INK[F.k] || STAMP_INK.standard)[1], left = 84, maxW = 912;
  let z = fitFont(g, `${F.from} → ${F.to}`, 800, 76, maxW, 56), lines = [[F.from, " → ", F.to]];
  if (g.measureText(`${F.from} → ${F.to}`).width > maxW) { lines = [[F.from, " →", ""], ["", "", F.to]]; z = Math.min(fitFont(g, `${F.from} →`, 800, 64, maxW, 30), fitFont(g, F.to, 800, 64, maxW, 30)); g.font = `800 ${z}px ${CARD_FONT}`; }
  let by = lines.length > 1 ? 856 : 878;
  for (const [a, mid, b] of lines) {
    let x = left;
    for (const [t, col] of [[a, INK], [mid, arrow], [b, INK]]) { if (!t) continue; g.fillStyle = col; g.fillText(t, x, by); x += g.measureText(t).width; }
    by += Math.round(z * 1.06);
  }
  g.fillStyle = INK2; fitFont(g, F.by ? `${F.by} · landed ${F.day}` : `Landed ${F.day}`, 500, 29, maxW);
  g.fillText(F.by ? `${F.by} · landed ${F.day}` : `Landed ${F.day}`, left, by - Math.round(z * 1.06) + 52);
  // the flight in four numbers
  g.strokeStyle = "rgba(110,106,98,.35)"; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(left, 1021); g.lineTo(W - left, 1021); g.stroke(); g.setLineDash([]);
  [[F.miles, "Distance"], [F.dur, "In the air"], [F.mph, "Average"], F.sky].forEach(([v, l], i) => {
    const x = left + i * 228;
    g.fillStyle = INK; fitFont(g, v, 800, 42, 214, 26); g.fillText(v, x, 1088);
    g.fillStyle = INK2; g.font = `600 20px ${CARD_FONT}`; spaced(g, l.toUpperCase(), x, 1122, 2.6);
  });
  // whose it is
  appIcon(g, left, 1214, 64);
  g.fillStyle = INK; g.font = `800 30px ${CARD_FONT}`; g.fillText("Chat", left + 84, 1243);
  g.fillStyle = INK2; g.font = `500 22px ${CARD_FONT}`; g.fillText("Messages that fly the real distance", left + 84, 1273);
  g.textAlign = "right"; g.font = `600 22px ${CARD_FONT}`; g.fillText(F.site, W - left, 1256); g.textAlign = "left";
  g.restore();
  return c;
}
async function storyCard(m, withName) {
  const F = flightFacts(m, withName), W = 1080, H = 1920, BG = "#111113", ink = STORY_INK[F.k] || STORY_INK.standard;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  const { cv } = m.moon ? { cv: spaceCard(m, 360, 427) } : await cardMap(m, "dark", false, 360, 427);
  g.drawImage(cv, 0, 0, 1080, 1281);
  let gr = g.createLinearGradient(0, 0, 0, 300); gr.addColorStop(0, "rgba(17,17,19,.92)"); gr.addColorStop(1, "rgba(17,17,19,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, 300);
  gr = g.createLinearGradient(0, 900, 0, 1290); gr.addColorStop(0, "rgba(17,17,19,0)"); gr.addColorStop(0.5, "rgba(17,17,19,.86)"); gr.addColorStop(1, BG); g.fillStyle = gr; g.fillRect(0, 900, W, 391);
  g.textBaseline = "alphabetic";
  appIcon(g, 64, 84, 76);
  g.fillStyle = "#fff"; g.font = `800 44px ${CARD_FONT}`; g.fillText("Chat", 162, 138);
  g.fillStyle = ink; g.font = `800 24px ${CARD_FONT}`; spaced(g, F.name ? `FROM ${F.name.toUpperCase()}` : "AIRMAIL", W - 64, 131, 7, "right");
  g.fillStyle = "#fff"; fitFont(g, F.longMiles, 900, 156, W - 128, 60); g.fillText(F.longMiles, 64, 1275);
  g.fillStyle = ink; fitFont(g, `by ${KIND[F.k].name.toLowerCase()} pigeon`, 700, 52, W - 128); g.fillText(`by ${KIND[F.k].name.toLowerCase()} pigeon`, 64, 1360);
  // the landed card, as in the app
  g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 60; g.shadowOffsetY = 24; g.fillStyle = "#2a2a2e"; rrect(g, 56, 1470, 968, 312, 60); g.fill(); g.restore();
  g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1.5; rrect(g, 56.75, 1470.75, 966.5, 310.5, 60); g.stroke();
  const [c1, c2, c3] = STAMP_INK[F.k] || STAMP_INK.standard; gr = g.createLinearGradient(104, 1514, 150, 1590);
  gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
  g.fillStyle = gr; g.beginPath(); g.arc(142, 1552, 38, 0, 7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.3)"; g.lineWidth = 2; g.stroke();
  g.save(); g.translate(119, 1528); g.scale(1.95, 1.95); g.fillStyle = "#fff"; g.fill(new Path2D(BIRD)); g.restore();
  g.fillStyle = "#fff"; fitFont(g, `Landed in ${F.to}`, 800, 56, 776, 30); g.fillText(`Landed in ${F.to}`, 200, 1572);
  const line = `Flew ${F.dur} · averaged ${F.mph}${F.skyLine ? ` · ${F.skyLine}` : ""}`;
  g.fillStyle = "#a5a5ad"; fitFont(g, line, 500, 32, 872); g.fillText(line, 104, 1636);
  gr = g.createLinearGradient(104, 0, 976, 0); gr.addColorStop(0, "#ff9f0a"); gr.addColorStop(1, "#f0c04a"); g.fillStyle = gr; rrect(g, 104, 1668, 872, 10, 5); g.fill();
  g.fillStyle = "#a5a5ad"; g.font = `500 30px ${CARD_FONT}`; g.textAlign = "right"; g.fillText(F.dayShort, 976, 1736);
  const dw = g.measureText(F.dayShort).width; g.textAlign = "left"; fitFont(g, `${F.from} → ${F.to}`, 500, 30, 872 - dw - 30, 18); g.fillText(`${F.from} → ${F.to}`, 104, 1736);
  g.font = `700 27px ${CARD_FONT}`; const a = F.site, b = " · Messages that fly the real distance", aw = g.measureText(a).width;
  g.font = `600 27px ${CARD_FONT}`; const bw = g.measureText(b).width;
  let x = (W - aw - bw) / 2; g.fillStyle = "#d1d1d6"; g.font = `700 27px ${CARD_FONT}`; g.fillText(a, x, 1866); g.fillStyle = "#8e8e93"; g.font = `600 27px ${CARD_FONT}`; g.fillText(b, x + aw, 1866);
  return c;
}
const cardBlob = (c) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn’t make the picture."))), "image/jpeg", 0.93));
const SHARE_FMTS = [["postcard", "Postcard", "For posts and messages"], ["story", "Story", "For stories"]];
const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([""], "flight.jpg", { type: "image/jpeg" })] }); } catch (_) { return false; } };
const shareNamePref = () => { try { return localStorage.getItem("inflight-share-name") !== "0"; } catch (_) { return true; } };
let shareUrls = [];
function openShare(id) {
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
  if (!shareable(m)) return;
  shareUrls.forEach((u) => URL.revokeObjectURL(u)); shareUrls = [];
  S.sheet = { type: "shareflight", id, chat: S.chat, fmt: "postcard", name: shareNamePref(), urls: {}, blobs: {} };
  renderSheet(); shareRender(S.sheet);
}
// both pictures, drawn one after the other, each shown as soon as it's ready
async function shareRender(s) {
  const gen = (s.gen = (s.gen || 0) + 1), m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) return;
  $layer.querySelectorAll(".shimg").forEach((e) => e.classList.add("stale"));
  for (const [fmt, make] of [["postcard", postcardCard], ["story", storyCard]]) {
    let blob;
    try { blob = await cardBlob(await make(m, s.name)); }
    catch (err) { if (S.sheet === s) toast(esc(err.message || "Couldn’t make the picture.")); return; }
    if (S.sheet !== s || s.gen !== gen) return;
    const url = URL.createObjectURL(blob); shareUrls.push(url);
    s.blobs[fmt] = blob; s.urls[fmt] = url;
    // (the new picture fades in over the waiting bird, or over the one it replaces, which then goes)
    const slot = $(`.shopt.${fmt} .shimg`, $layer);
    if (slot) {
      slot.classList.remove("stale"); slot.insertAdjacentHTML("beforeend", `<img src="${url}" alt="">`);
      const img = slot.lastElementChild; setTimeout(() => { for (const x of [...slot.children]) if (x !== img && slot.contains(img)) x.remove(); }, STILL.matches ? 0 : 320);
    }
    const go = $("[data-act=shareimg]", $layer); if (go) go.disabled = !s.urls[s.fmt];
  }
}
async function shareImage() {
  const s = S.sheet, blob = s?.blobs?.[s.fmt], m = (S.msgs.get(s?.chat) || []).find((x) => x.id === s?.id);
  if (!blob || !m) return;
  const name = `Chat ${m.fromPlace || ""} to ${m.toPlace || ""}`.replace(/[^\w .-]+/g, "").replace(/\s+/g, " ").trim() + ".jpg";
  const file = new File([blob], name, { type: blob.type });
  if (canShareFiles()) {
    try { await navigator.share({ files: [file] }); }
    catch (err) { if (err?.name === "NotAllowedError") toast("Tap Share again to send it."); else if (err?.name !== "AbortError") toast("Couldn’t share the picture."); }
    return;
  }
  // no share sheet here (a computer): saved instead
  const a = document.createElement("a"); a.href = s.urls[s.fmt]; a.download = name; document.body.append(a); a.click(); a.remove();
  toast("Picture saved.");
}

/* ---------- achievements (in the Flight Log) ---------- */
const BADGE_LOOK = { moonshot: ["moon", "indigo"], supermoon: ["moon", "orange"], eclipse: ["moon", "red"], redplanet: ["up", "red"], orbiter: ["globe", "blue"], first: ["bird", "green"], frequent: ["up", "blue"], penpal: ["mail", "indigo"], longhaul: ["dist", "teal"], atlantic: ["map", "blue"],
  world: ["loc", "teal"], rocket: ["bird", "rocket"], tailwind: ["wind", "green"], daredevil: ["skull", "red"], homing: ["homing", "indigo"], flock: ["people", "orange"], fleet: ["bird", "turbo"] , globetrotter: ["globe", "teal"] , stormdodger: ["storm", "indigo"], weathered: ["shield", "gray"], jetstream: ["wind", "teal"], migration: ["blossom", "pink"], summer: ["sun", "yellow"], autumn: ["leaf", "orange"], winter: ["snowflake", "blue"]};
/* ---------- the passport ----------
   Every country and sea your pigeons have flown over (functions/_passport.js),
   newest first: a stamp each, in postal ink, with the day it was first
   stamped. Tap one for how often since. */
const PASSPORT_INK = ["#c8322b", "#2457b8", "#1f7a46", "#a8740f", "#6b3fa0", "#b04a7a", "#127a86"];
const inkOf = (name, sea) => (sea ? "#1d63b0" : PASSPORT_INK[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PASSPORT_INK.length]);
const tiltOf = (name) => (([...name].reduce((h, c) => (h * 17 + c.charCodeAt(0)) >>> 0, 3) % 7) - 3) * 0.8;
/* ---------- landmark postmarks: somewhere famous a pigeon flew past ---------- */
const PM_ICON = {
  tower: `<path d="M6.5 21c2.2-3 3.6-8.5 4.4-14h2.2c.8 5.5 2.2 11 4.4 14M8.6 16h6.8M10.2 11.5h3.6M10.4 21a1.6 1.6 0 0 1 3.2 0M12 7V3"/>`,
  bridge: `<path d="M2 16h20M5 16V7M19 16V7M5 7c3 5 11 5 14 0M2 20h20"/>`,
  monument: `<path d="M6 21V9l6-5 6 5v12M10 21v-6h4v6M4 21h16"/>`,
  castle: `<path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12ZM10 21v-4a2 2 0 0 1 4 0v4"/>`,
  cliff: `<path d="M3 20c2-1 3-6 5-8s4-1 5-4 3-4 5-4v16ZM2 20h20"/>`,
  mountain: `<path d="m2 20 7-13 4 6 2-3 7 10ZM7.5 10.5l1.5 1 1.5-1"/>`,
  dome: `<path d="M5 21v-8a7 7 0 0 1 14 0v8M3 21h18M12 3v3M9 21v-4h6v4"/>`,
  pyramid: `<path d="M2 20 12 4l10 16ZM12 4l-3 16"/>`,
  falls: `<path d="M4 4h16M7 4v7c0 3 2 5 2 9M12 4v16M17 4v7c0 3-2 5-2 9M3 20h18"/>`,
  canyon: `<path d="M2 9h5l2 4h6l2-4h5M2 9v11h20V9M9 13l1 7M15 13l-1 7"/>`,
  wall: `<path d="m2 15 4-2 4 1 4-3 4 1 4-2v5l-4 2-4-1-4 3-4-1-4 2ZM6 13v-2M14 11V9"/>`,
  dunes: `<path d="M2 18c3-4 6-4 9 0s6 4 11-1M2 13c3-3 5-3 7-1M14 12c2-2 5-2 8 0"/>`,
  // off the Earth (pigeon/space.js): a crater, a flag on the Moon, a rover, a lander, a volcano
  crater: `<circle cx="12" cy="13" r="7.5"/><path d="M5.5 10.5c2.5 2 10.5 2 13 0M8 18.5c1.5-1.2 6.5-1.2 8 0"/><circle cx="12" cy="4" r="1"/>`,
  flag: `<path d="M8 21V4M8 4h9l-2 3 2 3H8M3 21h18M15 21c0-2 2-3 3-3"/>`,
  rover: `<path d="M4 15h16v-4H4ZM7 11V8h6v3M15 8h3M16.5 8V5.5"/><circle cx="7" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>`,
  lander: `<path d="M8 13h8l2-4H6ZM12 9V5M10 5h4M8 13l-3 6M16 13l3 6M3 19h4M17 19h4"/>`,
  volcano: `<path d="m2 20 6-11h8l6 11ZM8 9l2 1.5 2-1 2 1.5 2-2M12 6V3"/>`,
};
// and each landmark its own drawing (by its id), so Big Ben isn't the Eiffel Tower; the kind's is the fallback
const pmC = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const WATER = "M2 20.5c2 1 4 1 6 0s4-1 6 0 4 1 6 0";
const VOLCANO = `<path d="M2 20 8 10h8l6 10ZM8 10l2 1.5 2-1 2 1.5 2-2M11 7c-.6-1 .6-2 0-3.2M13.6 7.4c.6-1-.4-2 .4-3.2"/>`;
const PM_MARK = {
  // towers and buildings
  bigben: `<path d="M9 21V9h6v12M8 9h8M9.5 9 12 3.5 14.5 9M12 3.5V2M7 21h10M12 13.6v1.2l.9.6"/>${pmC(12, 14.4, 2)}`,
  eiffel: PM_ICON.tower,
  pisa: `<path d="M8.4 21 10.8 4h4L13.6 21ZM9.2 16.5h4.9M9.8 12h4.6M10.4 7.6h4.4M6 21h10"/>`,
  burjkhalifa: `<path d="M12 2v3M10.9 5h2.2l.7 6h-3.6ZM10.2 11h3.6l.9 10H9.3ZM6.5 21h11M10 16h4"/>`,
  empirestate: `<path d="M12 2v3M11 5h2v3h-2ZM10 8h4v4h-4ZM9 12h6v9H9ZM7 21h10M12 12v9"/>`,
  cntower: `<path d="M12 2v6M11 8h2l.6 13h-3.2ZM8.5 10.5h7l-1.2 2.2H9.7ZM7 21h10"/>`,
  spaceneedle: `<path d="M12 2v3M6 7h12l-2.4 2.2H8.4ZM10.2 9.2 8.2 21M13.8 9.2l2 11.8M9.2 15.5h5.6M6 21h12"/>`,
  petronas: `<path d="M7 21V8l1.5-4L10 8v13M14 21V8l1.5-4L17 8v13M10 12.5h4M5 21h14M8.5 4V2.5M15.5 4V2.5"/>`,
  marinabay: `<path d="M2.5 6.2c3-1.6 16-1.6 19 0l-1 1.4h-17ZM6 7.6V21M12 7.6V21M18 7.6V21M3 21h18"/>`,
  norwichcath: `<path d="M12 2.5 13.8 9h-3.6ZM10.2 9h3.6v12h-3.6ZM4 21v-6.5L10.2 12M20 21v-6.5L13.8 12M3 21h18"/>`,
  yorkminster: `<path d="M5 21V7h4v14M15 21V7h4v14M9 21v-8.5l3-2 3 2V21M5 7l.6-2.5h2.8L9 7M15 7l.6-2.5h2.8L19 7M3 21h18M12 21v-4"/>`,
  sagrada: `<path d="M5 21V10l1.5-5L8 10v11M10.5 21V8L12 2.5 13.5 8v13M16 21V10l1.5-5L19 10v11M3 21h18"/>`,
  belem: `<path d="M8 21V9h8v12M7 9h10M8 9V6.8h2V9M11 9V6.8h2V9M14 9V6.8h2V9M10.6 21v-3.2a1.4 1.4 0 0 1 2.8 0V21M10.5 13h3M4 21h16"/>`,
  marrakech: `<path d="M9 21V7h6v14M10.5 7V4.5h3V7M12 4.5V2.2M9 11h6M11 14.2h2M7 21h10"/>`,
  // monuments
  stonehenge: `<path d="M2 20h20M4.5 20v-7.5M8.5 20v-7.5M3.6 12.5h5.8M15.5 20v-7.5M19.5 20v-7.5M14.6 12.5h5.8M12 20v-4.5"/>`,
  angelnorth: `<path d="M12 7v14M2.5 9.2 12 11l9.5-1.8M2.5 9.2v1.6L12 12.6l9.5-1.8V9.2M9.5 21h5"/>${pmC(12, 5, 1.6)}`,
  colosseum: `<path d="M3 9c0-2.2 4-4 9-4s9 1.8 9 4v9.5c0 1.4-4 2.5-9 2.5s-9-1.1-9-2.5ZM3 9c0 2 4 3.4 9 3.4S21 11 21 9M6.2 13.2v6M9.1 13.8v6.6M12 14v7M14.9 13.8v6.6M17.8 13.2v6"/>`,
  brandenburg: `<path d="M3 8.5h18M4 8.5V6.5h16v2M5 8.5V21M8.5 8.5V21M15.5 8.5V21M19 8.5V21M10.5 8.5V21M13.5 8.5V21M3 21h18M10 6.5l2-2.5 2 2.5"/>`,
  acropolis: `<path d="M3 9 12 4l9 5ZM4 9h16M5.5 9v10M9 9v10M12.5 9v10M16 9v10M19 9v10M3 19h18M2 21h20"/>`,
  atomium: `<path d="m7.2 7.2 3.4 3.4M16.8 7.2l-3.4 3.4M7.2 16.8l3.4-3.4M16.8 16.8l-3.4-3.4M12 21v-6.6"/>${pmC(12, 12, 2)}${pmC(6, 6, 1.7)}${pmC(18, 6, 1.7)}${pmC(6, 18, 1.7)}${pmC(18, 18, 1.7)}`,
  windmills: `<path d="m10 21 1-9h2l1 9M12 12 7 7M12 12l5-5M12 12l-5 5M12 12l5 5M8 21h8M7 7l1.6-.4M17 7l.4 1.6M7 17l-.4-1.6M17 17l-1.6.4"/>`,
  littlemermaid: `<path d="M3 20.5h18M5 20.5c0-2.4 2.4-4 6-4s5 1.6 5 4M11.5 16.5c1.6-2.4 1.6-5.2-.4-7M11.1 9.5c-1.5 1.5-1.8 3.4-1.2 5M12.6 12.4l2.6 1.2"/>${pmC(11.8, 7.3, 1.6)}`,
  petra: `<path d="M4 21V4h16v17M7.5 21v-6h9v6M8 15V9.5h8V15M10 9.5V6.5h4v3M12 6.5V5M3 21h18M10.5 21v-3h3v3"/>`,
  liberty: `<path d="M10 21h4l-.8-9h-2.4ZM12 12V9M12 9l3-4.6M14.4 4.4l.6-1.6 1 1M8 21h8"/>${pmC(12, 7.5, 1.6)}`,
  christ: `<path d="M12 6.5V21M3 8.5h18M10.6 8.5 10 21h4l-.6-12.5M8 21h8"/>${pmC(12, 4.4, 1.5)}`,
  operahouse: `<path d="M2 19h20M4 19c1-5.5 3-8.5 6.5-9.5-1 3-1 6.4 0 9.5M10.5 19c1-6.5 4-9.6 7.5-10.6-1 4.2-1 7.4 0 10.6M18 19c.8-3 2-4.8 3.6-5.6"/>`,
  angkor: `<path d="M3 21h18M5 21v-6h14v6M7 15l1-4h8l1 4M10 11l2-7 2 7M6 15l1-3.4M18 15l-1-3.4M11 21v-3h2v3"/>`,
  rushmore: `<path d="m2 20 4-8 3-2 3 1 3-2 3 2 4 9Z"/>${pmC(8, 14.2, 1)}${pmC(12, 13.4, 1)}${pmC(16, 14.2, 1)}`,
  machupicchu: `<path d="M2 20h20M3 20l2-3h14l2 3M6 17l2-3h8l2 3M13 14l3.2-9 3 5 .8 4"/>`,
  // domes
  hagiasophia: `<path d="M4 21V8.5M20 21V8.5M4 8.5l.5-3 .5 3M19 8.5l.5-3 .5 3M7 21v-6a5 5 0 0 1 10 0v6M12 10V7.8M3 21h18M10.5 21v-3h3v3"/>`,
  redsquare: `<path d="M5 21v-6.5M12 21V10.5M19 21v-6.5M5 14.5c-2-1-2-3 0-5 2 2 2 4 0 5ZM12 10.5c-2.5-1.5-2.5-4 0-6.2 2.5 2.2 2.5 4.7 0 6.2ZM19 14.5c-2-1-2-3 0-5 2 2 2 4 0 5ZM3 21h18M12 4.3V2.8"/>`,
  tajmahal: `<path d="M3 21V9M21 21V9M6 21v-7h12v7M7.8 14c-1-3 1-6 4.2-7.2 3.2 1.2 5.2 4.2 4.2 7.2M12 6.8V4.8M2 21h20M10.6 21v-3.4a1.4 1.4 0 0 1 2.8 0V21"/>`,
  // castles
  edinburgh: `<path d="M2 21c2-3.2 4-5 7-6h6c3 1 5 2.8 7 6M8 15V9.5h1.6V8h1.4v1.5h2V8h1.4v1.5H16V15M11 15v-2.4h2V15"/>`,
  montstmichel: `<path d="M2 20c3-2 5-3 10-3s7 1 10 3M6 17l2-5h8l2 5M10 12l2-9 2 9M9 14.5h6"/>`,
  alhambra: `<path d="M3 21V10h4v11M17 21V10h4v11M7 21v-7h10v7M3 10V8.2h1.3v1h1.4v-1H7V10M17 10V8.2h1.3v1h1.4v-1H21V10M10.6 21v-3a1.4 1.4 0 0 1 2.8 0v3"/>`,
  neuschwanstein: `<path d="M6 21V11M10 21V8.5M14 21V6.5M18 21V11.5M5 11l1-4 1 4ZM9 8.5l1-4.2 1 4.2ZM13 6.5l1-4.3 1 4.3ZM17 11.5l1-3.2 1 3.2ZM4 21h16"/>`,
  prague: `<path d="M2 21h20M3 21v-6h18v6M9 15V8.5l1.5-4.5L12 8.5V15M12.5 15V8.5L14 4l1.5 4.5V15M5.5 15v-2M18.5 15v-2"/>`,
  forbidden: `<path d="M3 21h18M5 21v-6h14v6M2.5 15l2.5-3h14l2.5 3ZM6 12l2-3h8l2 3ZM12 9V7M10.6 21v-3.4h2.8V21"/>`,
  // bridges and water
  towerbridge: `<path d="M2 15h20M6 21V5.5M18 21V5.5M5 5.5l1-2 1 2M17 5.5l1-2 1 2M6 9h12M2 15c2 1 3 3 4 6M22 15c-2 1-3 3-4 6M5 5.5h2M17 5.5h2"/>`,
  goldengate: PM_ICON.bridge,
  venice: `<path d="M3 15c3 2 15 2 18-1M5 15 3.6 12M19 14.3l2.2-3.8M9 11v4.2M7.2 11h3.6M${WATER.slice(1)}"/>`,
  // cliffs and coasts
  dover: `<path d="M3 13.5c2.5-.8 4-3.5 6.5-3.5s3.5 2 6 2 4-1.6 5.5-3M3 13.5V18h18V9M${WATER.slice(1)}"/>`,
  causeway: `<path d="M4 20v-6l2-1 2 1v6M8 20v-9l2-1 2 1v9M12 20v-7.5l2-1 2 1V20M16 20v-5l2-1 2 1v5M2 20h20"/>`,
  santorini: `<path d="M3 20h18M5 20v-5h4v5M10 20v-7h5v7M16 20v-4h3v4M10 13a2.5 2.5 0 0 1 5 0M12.5 10.5V9M12 20v-2.5h1V20"/>`,
  fjords: `<path d="M2 5c2 3 3 8 5.2 12h9.6C19 13 20 8 22 5M7.2 17c2.4 1 7.2 1 9.6 0M10 14.5h4"/>`,
  halong: `<path d="M3 17.5c0-4 1-8.5 3-8.5s2 4.5 2 8.5M9 17.5c0-5 1-10.5 3-10.5s3 5.5 3 10.5M15.5 17.5c0-3 1-6.2 2.8-6.2S21 14.5 21 17.5M${WATER.slice(1)}"/>`,
  milford: `<path d="m3 17.5 4-10 2 4 3-8.5 3 7.5 2-3 4 10M${WATER.slice(1)}"/>`,
  // mountains
  matterhorn: `<path d="M3 20 10 8.5l1.2-4.5 2.3 3.5L21 20ZM10 8.5l2 1.2 1.6-2"/>`,
  vesuvius: VOLCANO, etna: VOLCANO,
  fuji: `<path d="M2 20 9.2 8h5.6L22 20ZM9.2 8l1.4 2.2 1.4-1.6 1.4 1.6L14.8 8M6 20.5h12"/>`,
  tablemtn: `<path d="M2 20l3-9h14l3 9ZM5 11h14M8.5 14l-1 6M15.5 14l1 6"/>`,
  uluru: `<path d="M2 19c1-5 4-7 10-7s9 2 10 7ZM2 19h20M7 14.4l1 4M12 12v6.4M16.6 13l-1.2 5.4"/>`,
  everest: `<path d="m2 20 7-13 3 4 2-2 8 11ZM9 7V3l3 1-3 1M7.4 10l1.6 1.2 1.2-.8"/>`,
  kilimanjaro: `<path d="M2 20c3-5 6-9 8-10h4c2 1 5 5 8 10ZM10 10l1.2 2 1.8-1.4 1 1.4"/>`,
  snowdon: `<path d="m2 20 5-8 3 2 3-6 3 4 6 8ZM13 8l1.4 1.2M7 20l4-4 3 1 3 3"/>`,
  bennevis: `<path d="M2 20c2-6 6-10 10-10 4.4 0 8 4 10 10ZM9 11.6c1.8-.8 4.2-.8 6 0"/>`,
  montblanc: `<path d="m2 20 6-9 2 2 2-5 2 3 2-1 6 10ZM8 11l1.2 2.2L12 8M14 11l2-1"/>`,
  aconcagua: `<path d="m2 20 4-7 2 2 3-8 2 3 2-4 2 5 5 9ZM11 7l.8 2.2L13 10M15 6l.8 1.6"/>`,
  cliffsmoher: `<path d="M3 20V9c2 0 2.5 2 4.5 2S10 7 12 7s2.5 3 4.5 3S19 8.5 21 8.5V20M7.5 11v9M12 7v13M16.5 10v10"/>`,
  iceland: `<path d="M2 5.5h7.5V21M22 5.5h-7.5V21M11 5.5c-.6 4 .6 9 0 13M13 5.5c.6 4-.6 9 0 13M8 20.5c2 1.2 6 1.2 8 0"/>`,
  niagara: `<path d="M3 6.5c3 3 15 3 18 0M5.5 9c-.8 3.5.8 7 0 10M9 10.2c-.8 3.5.8 7 0 10M12 10.6c-.8 3.5.8 7 0 10M15 10.2c-.8 3.5.8 7 0 10M18.5 9c-.8 3.5.8 7 0 10"/>`,
  victoriafalls: `<path d="M2 6.5h20M4 7.5c-.8 3.5.8 7.5 0 11M8 7.5c-.8 3.5.8 7.5 0 11M12 7.5c-.8 3.5.8 7.5 0 11M16 7.5c-.8 3.5.8 7.5 0 11M20 7.5c-.8 3.5.8 7.5 0 11M2 20.5c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>`,
  iguazu: `<path d="M2 6h6M10 4.5h5M17 7h5M4 6c-.6 3 .6 8 0 12M6.5 6c-.6 3 .6 7 0 11M12.5 4.5c-.6 4 .6 9 0 14M19.5 7c-.6 3 .6 7 0 11M2 20.5c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>`,
  // the rest
  pyramids: `<path d="m1.5 20 6-10 6 10M9.5 20l6-12 7 12M1.5 20h21"/>`,
  chichen: `<path d="M3 20h18M4.5 20v-3h15v3M6.5 17v-3h11v3M8.5 14v-3h7v3M10.5 11V8h3v3M11 20v-6h2v6"/>`,
};
const pmIco = (pm) => PM_MARK[pm.id] || PM_ICON[pm.kind] || PM_ICON.monument;
const pmDay = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()].toUpperCase()} ${String(d.getFullYear()).slice(2)}`; };
const pmName = (n) => n.replace(/^the /, "");
// the round postmark itself: a double ring, the landmark, the day, and the cancellation waves
const pmSeal = (pm) => `<span class="pmseal pm-${esc(pm.kind)}" aria-hidden="true"><svg viewBox="0 0 24 24" class="ico">${pmIco(pm)}</svg></span>`;
// under a letter that flew past somewhere famous
function postmarkHtml(m, mine) {
  if (!m.postmarks?.length || m.flying || m.lost) return "";
  return `<div class="pmarks${mine ? " me" : ""}" data-key="pm:${esc(m.id)}">${m.postmarks.map((pm) => `<button type="button" class="pmark pm-${esc(pm.kind)}" data-act="pmarkinfo" data-id="${esc(m.id)}:${esc(pm.id)}"
      aria-label="Postmark: flew past ${esc(pm.name)}">${pmSeal(pm)}<span class="pmt"><b>${esc(pmName(pm.name))}</b><small>${pmDay(pm.at)}</small></span></button>`).join("")}</div>`;
}
// the Flight Log's collection
function postmarksHtml(pm) {
  if (!pm) return "";
  const list = pm.marks || [], left = Math.max(0, pm.of - list.length);
  const tile = (x) => `<button type="button" class="pmtile pm-${esc(x.kind)}" data-act="pmarkall" data-id="${esc(x.id)}" aria-label="${esc(x.name)}: first flown past ${esc(fmtDate(x.at))}${x.n > 1 ? `, ${x.n} flights` : ""}">${pmSeal(x)}<b>${esc(pmName(x.name))}</b><small>${pmDay(x.at)}</small></button>`;
  return `<div class="ghead">Postmarks <span class="gcount">${list.length} of ${pm.of}</span></div>
    <div class="pmgrid">${list.map(tile).join("")}${Array.from({ length: Math.min(left, list.length ? (3 - (list.length % 3)) % 3 : 3) }, () => `<span class="pmtile unknown" aria-hidden="true"><span class="pmseal"><b>?</b></span><b>Somewhere</b><small>to find</small></span>`).join("")}</div>
    <div class="gfoot">${list.length ? `${left} more to find. ` : ""}A pigeon that flies past somewhere famous, like the Eiffel Tower or Mount Fuji, brings back its postmark on the letter. The ones in your own town don’t count.</div>`;
}
// In the Flight Log: your passport, closed, and what's in it (it opens as a book: passportBook)
function passportHtml(pp) {
  if (!pp) return "";
  const list = pp.places || [], last = list[0], pages = list.length ? passportPages(pp).length : 0, trips = new Set(list.map((p) => p.trip || p.at)).size;
  return `<div class="ghead">Passport <span class="gcount">${pp.countries} countr${pp.countries === 1 ? "y" : "ies"} · ${pp.seas} sea${pp.seas === 1 ? "" : "s"}</span></div>
    <button type="button" class="ppcard" data-act="passport" aria-label="Open your passport"><span class="ppmini" aria-hidden="true">${passportCover()}</span>
      <span class="ppt"><b>${esc(first(S.me.name))}’s Passport</b>${list.length ? `<small>${trips} journey${trips === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"} stamped</small>
      <small>Last stamp: ${esc(last.name.replace(/^the /, ""))}, ${esc(pmDay(last.at).slice(0, -3).replace(/(\w+)$/, (x) => x[0] + x.slice(1).toLowerCase()))}</small>` : `<small>Each country and sea your pigeons fly over gets a stamp, once they’ve landed.</small>`}
      <span class="pill">Open Passport</span></span></button>`;
}
/* ---------- the passport, as a passport ----------
   A book: a photo page (you, and how far your pigeons have flown), then visa
   pages that fill up with rubber stamps in the order your pigeons flew, a
   journey at a time: each country in its own ink with its outline inside
   (pigeon/shapes.js, loaded when the passport opens), each sea crossed, and
   "Arrived by sea" for a journey that came by ship. Swipe to turn the page. */
let SHAPES = null;
const shapesLoad = () => (SHAPES ? Promise.resolve(SHAPES) : import("./shapes.js").then((m) => (SHAPES = m.SHAPES)).catch(() => (SHAPES = {})));
const PP_INK = ["#b3262e", "#1f4fa3", "#5b3a9c", "#1d6b45", "#2a2a2e", "#126e78", "#7a4a1c"];
const ppHash = (x, k = 5) => [...String(x)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, k);
const ppInk = (p) => (p.sea ? "#1f4fa3" : PP_INK[ppHash(p.name) % PP_INK.length]);
const PP_PER = 10;
// The pages: oldest first, a journey's stamps together; a page holds PP_PER, and a journey
// that wouldn't get three on this one starts the next
function passportPages(pp) {
  const list = [...(pp.places || [])].sort((a, b) => a.at - b.at || a.ord - b.ord), pages = [];
  let cur = null, trip;
  for (const p of list) {
    const k = p.trip || `d${Math.floor(p.at / DAY)}`, fresh = k !== trip; trip = k;
    if (!cur || cur.stamps.length >= PP_PER || (fresh && cur.stamps.length > PP_PER - 3)) pages.push(cur = { stamps: [], trips: [] });
    cur.stamps.push(p); if (!cur.trips.some((t) => t.k === k)) cur.trips.push({ k, at: p.at, trip: pp.trips?.[p.trip] || null });
  }
  return pages;
}
// a journey, as the top of the page says it: "16 OCT · LONDON → SYDNEY"
const ppJourney = (t) => [pmDay(t.at).slice(0, -3), t.trip?.from && t.trip?.to ? `${t.trip.from} → ${t.trip.to}` : ""].filter(Boolean).join(" · ").toUpperCase();
const ppBird = `<path transform="translate(-12 -10)" d="${BIRD}"/>`;
const PP_STAMPS = ["rect", "circle", "oval", "hex", "tri"];
// One stamp, drawn in its local box, in its ink (SVG presentation attributes: no inline styles)
function ppStamp(p, kind, code) {
  const cap = p.name.replace(/^the /, "").toUpperCase(), d = pmDay(p.at), sh = !p.sea && SHAPES?.[p.name];
  const fit = (n, w) => (n.length * 9.6 > w ? ` textLength="${w}" lengthAdjust="spacingAndGlyphs"` : "");
  // (the Moon: its disc and a few craters, where a country has its outline)
  const moonMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="11" class="ps"/><circle cx="-3.5" cy="-3" r="3" class="ps"/><circle cx="4" cy="2" r="2.2" class="ps"/><circle cx="-1.5" cy="5.5" r="1.4" class="ps"/><circle cx="5" cy="-5" r="1" class="ps"/></g>`;
  // (Mars: a disc with its polar cap; Low Earth Orbit: the Earth with a ring round it)
  const marsMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="11" class="ps"/><path d="M-6-9a11 11 0 0 1 12 0Z" class="pf"/><path d="M-9 2c4-2 8 2 12 0s5-1 6 0" class="ps"/></g>`;
  const orbitMark = (x, y, k) => `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})"><circle r="8" class="ps"/><ellipse rx="13" ry="4" transform="rotate(-20)" class="ps"/><circle cx="11" cy="-4" r="1.6" class="pf"/></g>`;
  const land = (x, y, k) => (p.name === "the Moon" ? moonMark(x, y, k) : p.name === "Mars" ? marsMark(x, y, k) : p.name === "Low Earth Orbit" ? orbitMark(x, y, k) : sh ? `<path d="${sh}" transform="translate(${x} ${y}) scale(${k})" class="pf"/>` : `<g transform="translate(${x + 50 * k} ${y + 50 * k}) scale(${k * 3})" class="pf">${ppBird}</g>`);
  const T = (x, y, cls, txt, w) => `<text x="${x}" y="${y}" class="${cls}"${w ? fit(txt, w) : ""}>${esc(txt)}</text>`;
  const id = `pa${ppHash(p.name + p.at)}`;
  switch (kind) {
    case "rect": return [140, 88, `<rect x="2" y="2" width="136" height="84" rx="10" class="ps"/><rect x="7" y="7" width="126" height="74" rx="6" class="ps pst"/>
      ${T(70, 21, "px pxs", `ENTRY · ${code}`)}${land(13, 29, 0.32)}${T(92, 48, "px pxb", cap, 76)}${T(92, 63, "px", d)}<g transform="translate(92 74) scale(.55)" class="pf">${ppBird}</g>`];
    case "circle": return [100, 100, `<circle cx="50" cy="50" r="47" class="ps"/><circle cx="50" cy="50" r="40" class="ps pst"/>
      <defs><path id="${id}a" d="M14 50a36 36 0 0 1 72 0"/><path id="${id}b" d="M16 52a34 34 0 0 0 68 0"/></defs>
      <text class="px pxb"${fit(cap, 96)}><textPath href="#${id}a" startOffset="50%">${esc(cap)}</textPath></text><text class="px pxs"><textPath href="#${id}b" startOffset="50%">BY PIGEON · ${code}</textPath></text>
      ${land(38, 26, 0.24)}${T(50, 59, "px pxs", d)}`];
    case "oval": return [130, 80, `<ellipse cx="65" cy="40" rx="62" ry="37" class="ps"/><ellipse cx="65" cy="40" rx="55" ry="30" class="ps pst"/>
      ${T(65, 30, "px pxb", cap, 92)}${T(65, 45, "px", pmDay(p.at).replace(/ (\d\d)$/, " 20$1"))}<text x="65" y="56" class="px pxs" textLength="70" lengthAdjust="spacingAndGlyphs">DEPARTED · ${code}</text>`];
    case "hex": return [100, 100, `<path d="M50 2 93 26v48L50 98 7 74V26Z" class="ps"/><path d="M50 9 87 30v40L50 91 13 70V30Z" class="ps pst"/>
      ${land(32, 18, 0.36)}${T(50, 67, "px pxb", cap, 64)}${T(50, 79, "px pxs", d)}`];
    case "tri": return [110, 96, `<path d="M55 4 106 92H4Z" class="ps"/><path d="M55 16 95 85H15Z" class="ps pst"/>
      ${land(41, 34, 0.28)}${T(55, 70, "px pxb pxs2", cap, cap.length * 7.6 > 62 ? 62 : 0)}${T(55, 80, "px pxs", d)}`];
    case "sea": return [130, 66, `<rect x="2" y="2" width="126" height="62" rx="4" class="ps" stroke-dasharray="7 3"/>
      ${T(65, 20, "px pxs", p.ship ? "BY SHIP · CROSSED" : "AT SEA · CROSSED")}${T(65, 36, "px pxb", cap, 112)}${T(65, 50, "px pxs", d)}<path d="M14 56c5-4 8 4 13 0s8 4 13 0M90 56c5-4 8 4 13 0s8 4 13 0" class="ps pst"/>`];
    default: return [136, 74, `<rect x="2" y="2" width="132" height="70" rx="14" class="ps"/><rect x="8" y="8" width="120" height="58" rx="10" class="ps pst"/>
      <path d="M18 44h30l-5 8H23ZM26 44v-12h12l4 12M31 32v-6" class="ps"/>${T(88, 28, "px pxb", cap, 80)}${T(88, 42, "px", d)}${T(88, 55, "px pxs", "ARRIVED BY SEA")}`];
  }
}
// A visa page: its journeys at the top, then the stamps, two to a row, each a little off and askew
function ppVisa(pg, n) {
  const ship = new Map(pg.trips.map((t) => [t.k, !!t.trip?.ship]));
  const lastLand = new Map();
  for (const p of pg.stamps) if (!p.sea) lastLand.set(p.trip || `d${Math.floor(p.at / DAY)}`, p);
  const heads = pg.trips.map(ppJourney), head = heads.length > 2 ? `${heads.slice(0, 2).join(" · ")} · +${heads.length - 2}` : heads.join(" · ");
  const stamps = pg.stamps.map((p, i) => {
    const k = p.trip || `d${Math.floor(p.at / DAY)}`, h = ppHash(p.name + k), sailed = ship.get(k);
    const kind = p.sea ? "sea" : sailed && lastLand.get(k) === p ? "ship" : PP_STAMPS[ppHash(p.name, 9) % PP_STAMPS.length];
    const [w0, h0, body] = ppStamp({ ...p, ship: sailed }, kind, `IF ${100 + (ppHash(k) % 900)}`), K = 0.88, w = w0 * K, hgt = h0 * K;
    const col = i % 2, row = Math.floor(i / 2), cx = (col ? 264 : 94) + ((h % 21) - 10), cy = 104 + row * 89 + ((h >> 5) % 13) - 6, rot = ((h >> 9) % 27) - 13;
    const x = Math.max(4, Math.min(354 - w, cx - w / 2)), y = Math.max(52, Math.min(498 - hgt, cy - hgt / 2));
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${rot} ${w / 2} ${hgt / 2}) scale(${K})" color="${ppInk(p)}" filter="url(#pprough)" data-act="stampinfo" data-id="${esc(p.name)}" role="button" tabindex="0"
      aria-label="${esc(p.name)}: first flown over ${esc(fmtDate(p.at))}${p.n > 1 ? `, ${p.n} flights` : ""}"><g mask="url(#ppwear${h % 3})">${body}</g></g>`;
  }).join("");
  return `<svg viewBox="0 0 358 520" class="ppg" role="group" aria-label="Page ${n}"><rect width="358" height="520" rx="6" class="ppaper"/><rect width="358" height="520" rx="6" fill="url(#ppguil)"/>
    <g transform="translate(179 286) scale(6)" class="ppwm">${ppBird}</g>
    <text x="179" y="26" class="pphd">VISAS · VISAS</text><text x="179" y="42" class="ppjr"${head.length > 58 ? ` textLength="330" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(head)}</text>
    ${stamps}<text x="${n % 2 ? 340 : 18}" y="508" class="pppn">${n}</text></svg>`;
}
// The photo page
function ppData(d) {
  const pp = d.passport || {}, me = S.me, n = (x) => Math.round(x).toLocaleString("en-GB"), up = (x) => esc(String(x || "–").toUpperCase());
  const [given, ...rest] = String(me.name || "").trim().split(/\s+/), sur = rest.join(" ") || given;
  // (the machine-readable lines, as a real passport has them: "<" for every space; escaped, as they're written into the page)
  const mrz = (x) => String(x).toUpperCase().normalize("NFD").replace(/[^A-Z0-9]+/g, "<");
  const line1 = esc(`P<IFL${mrz(sur)}<<${mrz(rest.length ? given : "")}`.padEnd(40, "<").slice(0, 40));
  const line2 = esc(`${String(pp.countries || 0).padStart(4, "0")}IF195<${pp.seas || 0}SEA${Math.round((d.km || 0) * 0.621371)}MI`.padEnd(40, "<").slice(0, 40));
  const birds = S.birds.slice(0, 2).map((b) => b.name).join(" · ");
  const f = (label, val, cls = "") => `<span class="ppf ${cls}"><small>${label}</small><b>${val}</b></span>`;
  return `<div class="ppdata"><div class="pptop"><b>PASSPORT</b><small>PASSEPORT · CHAT</small><em>TYPE P · LOFT</em></div>
    <div class="ppid"><span class="ppphoto">${avatar(me, "xl")}</span><span class="ppfs">${f("Surname / Nom", up(sur))}${f("Given names / Prénoms", up(rest.length ? given : ""))}${f("Home loft / Pigeonnier", up(me.place))}${f("Handle", `@${up(me.handle)}`)}</span></div>
    <div class="ppgrid">${f("Keeping pigeons since", up(d.since ? fmtDate(d.since).replace(/^\d+ /, "") : ""))}${f("Miles flown / Milles", `${n((d.km || 0) * 0.621371)} MI`)}
      ${f("Countries / Pays", `${pp.countries || 0} OF 195`)}${f("Seas / Mers", n(pp.seas || 0))}
      ${f("Furthest flight", d.longest?.place ? `TO ${up(d.longest.place)}` : "–")}${f("Pigeons", birds ? up(birds) : "–")}</div>
    <div class="ppsig"><svg viewBox="0 0 160 30" aria-hidden="true"><path d="M4 20c14-14 22 6 34-4s18-12 28 1 20 4 28-7 14 6 26 4"/></svg><small>Signature of bearer</small></div>
    <div class="ppmrz" aria-label="Machine readable zone">${line1}<br>${line2}</div></div>`;
}
const passportCover = () => `<svg viewBox="0 0 250 350" class="ppcover"><rect width="250" height="350" rx="14" class="ppleather"/><rect x="6" width="5" height="350" fill="rgba(0,0,0,.25)"/>
  <g class="ppgold"><text x="125" y="70" class="ppc1">CHAT</text><circle cx="125" cy="170" r="46"/><circle cx="125" cy="170" r="39" stroke-width="1"/>
  <g transform="translate(125 172) scale(2.9)" class="ppgoldf">${ppBird}</g><path d="M74 205c-14-14-16-38-4-56M176 205c14-14 16-38 4-56M70 196l-8-2M66 184l-8-1M66 171l-8 1M70 159l-7 4M180 196l8-2M184 184l8-1M184 171l8 1M180 159l7 4" stroke-width="1.6"/>
  <text x="125" y="270" class="ppc2">PASSPORT</text><text x="125" y="290" class="ppc3">PASSEPORT · PASAPORTE</text><rect x="111" y="312" width="28" height="18" rx="3" stroke-width="1.4"/><circle cx="125" cy="321" r="4.5" stroke-width="1.2"/></g></svg>`;
// the ink: a little rough at the edges, and worn in places (one set for the whole book)
const PP_DEFS = `<svg width="0" height="0" class="ppdefs" aria-hidden="true"><defs>
  <filter id="pprough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter>
  ${[0, 1, 2].map((i) => `<filter id="ppspk${i}"><feTurbulence type="fractalNoise" baseFrequency="${[0.9, 1.2, 0.7][i]}" numOctaves="2" seed="${i * 7 + 1}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 ${[2.25, 2.4, 2.1][i]}"/></filter>
  <mask id="ppwear${i}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="200" height="160"><rect x="-20" y="-20" width="200" height="160" filter="url(#ppspk${i})"/></mask>`).join("")}
  <pattern id="ppguil" width="60" height="24" patternUnits="userSpaceOnUse"><path d="M0 12c10-10 20-10 30 0s20 10 30 0M0 4c10-10 20-10 30 0s20 10 30 0M0 20c10-10 20-10 30 0s20 10 30 0" class="ppguilp"/></pattern></defs></svg>`;
// The book: the photo page, then each visa page; only those near the one open are drawn
function passportBook(d) {
  const pages = passportPages(d.passport || {});
  return `${PP_DEFS}<div class="ppbook" role="region" aria-label="Your passport">${[`<div class="ppage" data-i="0">${ppData(d)}</div>`, ...pages.map((_, i) => `<div class="ppage" data-i="${i + 1}"></div>`)].join("")}</div>
    <div class="pppager"><button type="button" class="nbtn" data-act="ppturn" data-id="-1" aria-label="Previous page">${I.back}</button><span class="pplbl" aria-live="polite"></span><button type="button" class="nbtn ppnext" data-act="ppturn" data-id="1" aria-label="Next page">${I.back}</button></div>
    ${pages.length ? "" : `<div class="gfoot">Each country and sea your pigeons fly over gets a stamp on the next page, once they’ve landed.</div>`}`;
}
function ppFill(book, d) {
  const pages = passportPages(d.passport || {}), at = Math.round(book.scrollLeft / Math.max(1, book.clientWidth));
  book.querySelectorAll(".ppage").forEach((el) => {
    const i = +el.dataset.i; if (!i) return;
    const near = Math.abs(i - at) <= 1;
    if (near && !el.firstChild) el.innerHTML = ppVisa(pages[i - 1], i);
    else if (!near && el.firstChild) el.innerHTML = "";
  });
  const lbl = $(".pplbl", $layer); if (lbl) lbl.textContent = at ? `Page ${at} of ${pages.length}` : pages.length ? "Photo page · swipe to turn" : "Photo page";
  $layer.querySelectorAll("[data-act=ppturn]").forEach((b) => { b.disabled = +b.dataset.id < 0 ? at <= 0 : at >= pages.length; });
  if (S.sheet?.type === "passport") S.sheet.page = at;
}
async function openPassport(trip) {
  const from = S.sheet?.type === "flightlog" ? S.sheet : null;
  const sh = S.sheet = { type: "passport", data: from?.data || null, back: !!from, trip };
  renderSheet();
  try {
    if (!sh.data) sh.data = await api("flight-log");
    await shapesLoad();
    if (S.sheet !== sh) return;
    if (trip) { const i = passportPages(sh.data.passport || {}).findIndex((pg) => pg.stamps.some((p) => p.trip === trip)); if (i >= 0) sh.page = i + 1; }
    renderSheet();
  } catch (err) { if (S.sheet === sh) { S.sheet = null; renderSheet(); } toast(esc(err.message)); }
}
// (kept until the Flight Log is left: renderSheet notes them as seen then)
let badgesSeen = null;
function badgesHtml(list) {
  if (!list.length) return "";
  // badges earned since this phone last looked get a "New" tag (remembered on this phone only)
  let seen = null; try { seen = JSON.parse(localStorage.getItem("inflight-badges") || "null"); } catch (_) {}
  const earned = list.filter((b) => b.earned).map((b) => b.id);
  badgesSeen = earned;
  const tile = (b) => {
    const [icon, tint] = BADGE_LOOK[b.id] || ["bird", "gray"], fresh = b.earned && seen && !seen.includes(b.id);
    return `<div class="badge2${b.earned ? " earned" : ""}"><span class="bico tile ${b.earned ? tint : "gray"}">${I[icon] || I.bird}</span>
      <b>${esc(b.name)}${fresh ? ` <i class="newb">New</i>` : ""}</b><small>${esc(b.desc)}</small>
      ${!b.earned && b.of ? `<i class="bprog" data-w="${b.progress.toFixed(3)}"></i><small class="bnum">${b.n.toLocaleString("en-GB")} of ${b.of.toLocaleString("en-GB")}</small>` : ""}</div>`;
  };
  return `<div class="ghead">Achievements <span class="gcount">${earned.length} of ${list.length}</span></div><div class="badges">${[...list].sort((a, b) => b.earned - a.earned).map(tile).join("")}</div>`;
}

// Rare pigeons: pick a look you've unlocked (everyone you send to sees it)
function skinsHtml(list, mine) {
  if (!list.length) return "";
  const tile = (id, name, open, sub) => `<button type="button" class="skin2${open ? "" : " locked"}${(mine || null) === id ? " on" : ""}" ${open ? `data-act="skin" data-id="${id || "usual"}"` : "disabled"} aria-pressed="${(mine || null) === id}">
      <span class="sbig">${pg("standard", id)}</span><b>${esc(name)}</b><small>${sub}</small></button>`;
  const seas = list.filter((k) => k.season), rare = list.filter((k) => !k.season);
  const ssub = (k) => (k.season.kept ? "Yours to keep" : `Until ${esc(fmtDate(k.season.until - 1))} · ${k.season.n} of ${k.season.of} sent to keep it`);
  return `<div class="ghead">Rare Pigeons <span class="gcount">${rare.filter((k) => k.open).length} of ${rare.length}</span></div>
    <div class="badges skins">${tile(null, "Usual", true, "Every pigeon")}${seas.map((k) => tile(k.id, k.name, k.open, ssub(k))).join("")}${rare.map((k) => tile(k.id, k.name, k.open, k.open ? "Unlocked" : `Earn ${esc(SKINS[k.id]?.badge || "its badge")}`)).join("")}</div>
    <div class="gfoot">Your friends see the look on every pigeon you send. Its colour still says what kind it is.</div>`;
}
/* ---------- Coots: the bank, and its Coots Coins (called feathers in the code and the database) ---------- */
async function walletData() { try { const r = await api("feathers"); S.feathers = r.feathers; return r; } catch (err) { if (S.sheet?.type === "feathers") S.sheet.err = err.message; else toast(esc(err.message)); return null; } }
// what a sheet shows when what it needed didn't come (no signal, a hiccup): why, and a way to try again
const loadFail = (msg, act, id) => `<p class="empty"><b>Couldn’t load this</b>${esc(msg || "Try again in a moment.")}</p><div class="stack"><button type="button" class="btn small plain" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ""}>Try Again</button></div>`;
// A friend's loft: their pigeons, badges and kit (fetched each time: it changes as they fly)
async function openLoft(id) {
  S.sheet = { type: "loft", id, data: null }; renderSheet();
  let r; try { r = await api("loft?id=" + encodeURIComponent(id)); } catch (e) { r = { error: e.message || "Try again in a moment." }; }
  if (S.sheet?.type === "loft" && S.sheet.id === id) { S.sheet.data = r; renderSheet(); }
}
async function openFeathers() {
  S.sheet = { type: "feathers", data: null }; renderSheet();
  const r = await walletData(); if (S.sheet?.type !== "feathers") return;
  if (r) { S.sheet.data = r; S.sheet.err = null; renderSheet(); render(); } else renderSheet();
}
// which of your pigeons gets it
function wearItem(item, anchor) {
  if (!S.birds.length) return toast("Name a pigeon in Your Pigeons first.");
  openMenu(anchor, S.birds.map((b) => ({ label: b.name, sub: b.wear === item ? "Wearing it" : b.wear && WEAR[b.wear] ? `Has the ${WEAR[b.wear][0].toLowerCase()} on` : b.rank, act: "wearon", id: `${item}|${b.id}` })));
}
async function putOn(bird, item) {
  try {
    const r = await api("bird-wear", { method: "POST", body: { bird, item } });
    for (const b of S.birds) { if (item && b.wear === item) b.wear = null; if (b.id === bird) b.wear = item; }
    if (S.sheet?.type === "feathers") S.sheet.data = r;
    haptic("success"); renderSheet(); renderCompose();
    const b = S.birds.find((x) => x.id === bird);
    toast(item ? `${WEAR[item][1]} ${esc(b?.name || "Your pigeon")} has the ${esc(WEAR[item][0].toLowerCase())} on.` : `${esc(b?.name || "Your pigeon")} took it off.`);
  } catch (err) { toast(esc(err.message)); }
}
async function setSkin(id) {
  const skin = id === "usual" ? null : id;
  try {
    const r = await api("me", { method: "PATCH", body: { skin } });
    S.me = r.me || { ...S.me, skin };
    $(".kind", $compose).dataset.k = "";          // redrawn with the new look
    $layer.querySelectorAll(".skin2").forEach((b) => { const on = (b.dataset.id || "") === (skin || "usual"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    renderCompose();                              // the chosen tile lights up; no banner over the sheet
  } catch (err) { toast(esc(err.message)); }
}

/* ---------- replies and reactions ---------- */
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const chatName = (id, g) => (id === S.me.id ? "You" : first((g ? member(g, id) : friend(id))?.name || "Someone"));
// A quote shows what was really said: the original, when it's on this phone
// (its sender and words, not what the reply claims), else the reply's copy.
function quoteHtml(q, g) {
  const o = (S.msgs.get(S.chat) || []).find((x) => x.id === q.id), op = o && S.plain.get(o.id);
  if (o && op && !op.bad) q = { id: q.id, from: o.from, t: String(op.t || "").replace(/\s+/g, " ").slice(0, 90), p: op.v ? "voice" : op.p ? (op.p.m === "image/gif" ? "gif" : "photo") : "" };
  else q = { id: String(q.id || ""), from: String(q.from || ""), t: String(q.t || "").slice(0, 90), p: ["gif", "voice", "photo"].includes(q.p) ? q.p : "" };
  return `<button type="button" class="quote" data-act="jumpto" data-id="${esc(q.id)}"><b>${esc(chatName(q.from, g))}</b><span>${q.p ? `${q.p === "gif" ? "GIF" : q.p === "voice" ? "Voice pigeon" : "Photo"}${q.t ? ": " : ""}` : ""}${esc(q.t || "")}</span></button>`;
}
// A reaction's emoji, only on the message it was sealed for: its id goes inside it, so the server can't move it
// to another (one from before that has none: shown where the server says, until it goes after 30 days)
const reactOf = (r) => { const p = S.plain.get(r.id); return p?.r && (p.m === undefined || p.m === r.msg) ? p.r : null; };
// The reactions on a message: each once it has landed (yours straight away)
function reactsHtml(m, mine) {
  const list = (S.reacts.get(S.chat) || []).filter((r) => r.msg === m.id && (r.from === S.me.id || !r.flying) && reactOf(r));
  if (!list.length) return "";
  const by = new Map();
  for (const r of list) { const e = reactOf(r), x = by.get(e) || { n: 0, me: false, flying: false }; x.n++; if (r.from === S.me.id) { x.me = true; x.flying = r.flying; } by.set(e, x); }
  return `<div class="reacts${mine ? " me" : ""}" data-key="rx:${esc(m.id)}">${[...by].map(([e, x]) => `<span class="rpill${x.me ? " mine" : ""}${x.flying ? " flying" : ""}" data-key="rp:${esc(m.id)}:${esc(e)}" data-sig="${x.n}${x.flying ? "f" : ""}" data-in="pop" title="${x.flying ? "On its way" : ""}">${esc(e)}${x.n > 1 ? `<b>${x.n}</b>` : ""}</span>`).join("")}</div>`;
}
function openReactMenu(anchor, id) {
  const mineNow = (S.reacts.get(S.chat) || []).find((r) => r.msg === id && r.from === S.me.id);
  const cur = mineNow && reactOf(mineNow), m = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
  const flight = m && !m.flying && !m.lost && (m.route || m.moon || m.flock?.some((x) => x.route || x.moon));
  const words = m && S.plain.get(id)?.t;
  openMenu(anchor, [{ label: "Reply", icon: I.reply, act: "reply", id },
    ...(typeof words === "string" && words.trim() ? [{ label: "Copy", icon: I.copy, act: "copymsg", id }] : []),
    ...(flight ? [{ label: m.moon ? "Show the Trip" : "Show the Flight", sub: [m.km != null && !m.flock ? fmtMiles(m.km) : "", KIND[kindOf(m)].name, m.bird ? m.bird.name : ""].filter(Boolean).join(" · "), icon: m.moon ? I.moon : I.map, act: "map", id }] : [])]);
  if (m) {
    const g = group(S.chat), mine = m.from === S.me.id, bits = [`Sent ${fmtShort(m.sentAt)}`];
    if (!m.flying && !m.lost) bits.push(`${g && mine ? "First landed" : "Landed"} ${fmtShort(g && mine ? Math.min(...(m.flock || [{ deliverAt: m.deliverAt }]).map((x) => x.deliverAt || Infinity)) : m.deliverAt)}`);
    if (mine && !g && m.readAt) bits.push(`Read ${fmtShort(m.readAt)}`);
    $(".menu-pop", $pop).insertAdjacentHTML("afterbegin", `<div class="mtime" role="none">${bits.join(" · ")}</div>`);
  }
  $(".menu-pop", $pop).insertAdjacentHTML("afterbegin", `<div class="rrow" role="none">${REACTIONS.map((e) => `<button type="button" class="${e === cur ? "on" : ""}" data-act="react" data-id="${esc(id)}" data-e="${esc(e)}" role="menuitem" aria-label="React ${esc(e)}">${e}</button>`).join("")}</div>`);
}
async function sendReact(id, e) {
  haptic("tick");
  const g = group(S.chat), chat = S.chat, list = S.reacts.get(chat) || [];
  const mineNow = list.find((r) => r.msg === id && r.from === S.me.id);
  try {
    if (mineNow && reactOf(mineNow) === e) {          // the same one again takes it back
      await api("react", { method: "DELETE", body: { msg: id } });
      S.reacts.set(chat, list.filter((r) => r !== mineNow)); return render();
    }
    const m = (S.msgs.get(chat) || []).find((x) => x.id === id); if (!m) return;
    const rid = uuid(), payload = { r: e, m: id };
    let body;
    if (g) {
      const { body: sealed, key, h } = await E2E.sealGroup({ id: rid, from: S.me.id, group: g.id, type: "react" }, payload);
      const keys = {};
      for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id: rid, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
      body = { id: rid, msg: id, group: true, body: sealed, keys };
    } else {
      const to = m.from === S.me.id ? m.to : m.from;
      body = { id: rid, msg: id, ct: await E2E.seal(await base(chat), { id: rid, from: S.me.id, to, type: "react" }, payload) };
    }
    const r = await api("react", { method: "POST", body });
    S.plain.set(rid, payload);
    S.reacts.set(chat, [...list.filter((x) => x !== mineNow), r.react]);
    render();
  } catch (err) { toast(esc(err.message)); }
}
// Who joined, left or renamed the group: a quiet line in the chat. Adds by one
// person at one moment read as one line ("George added Mira and Theo").
/* ---------- mid-air moments ----------
   Near misses: two pigeons you can see that passed each other (or one
   overtook the other) in mid-air. Said from this chat's side; tap for the map. */
function momentText(m, n, chatId) {
  const me = S.me.id, nm = (id) => first(personById(id)?.name || "a friend"), o = n.other;
  const mineThis = m.from === me, mineOther = o.from === me, kind = (k) => (KIND[k]?.name || "Standard").toLowerCase();
  const over = n.place && n.place !== "land" ? ` over ${n.place}` : "";
  if (n.kind === "flock") {                                            // flying together
    const same = (mineOther ? o.to : o.from) === chatId, here = mineThis ? "your pigeon" : `${nm(chatId)}’s pigeon`;
    const there = same ? (mineOther ? "yours" : `${nm(chatId)}’s`) : mineOther ? `the one you sent ${nm(o.to)}` : `${nm(o.from)}’s`;
    const both = same && mineThis === mineOther ? `${mineThis ? "Your" : `${nm(chatId)}’s`} pigeons` : `${here[0].toUpperCase() + here.slice(1)} and ${there}`;
    return `${both} flew together${over}`;
  }
  if ((mineOther ? o.to : o.from) === chatId) {                        // both in this chat
    if (n.kind !== "overtake") return mineThis === mineOther ? `Your pigeons passed each other${over}` : `Your pigeon and ${nm(chatId)}’s passed each other${over}`;
    const [lead, back] = n.lead === "other" ? [[mineOther, o.pigeon], [mineThis, m.pigeon]] : [[mineThis, m.pigeon], [mineOther, o.pigeon]];
    if (lead[0] && back[0]) return `Your ${kind(lead[1])} pigeon overtook your ${kind(back[1])} one${over}`;
    if (!lead[0] && !back[0]) return `${nm(chatId)}’s ${kind(lead[1])} pigeon overtook their ${kind(back[1])} one${over}`;
    return `${lead[0] ? "Your" : nm(chatId) + "’s"} pigeon overtook ${back[0] ? "yours" : nm(chatId) + "’s"}${over}`;
  }
  const here = mineThis ? "your pigeon" : `${nm(chatId)}’s pigeon`, there = mineOther ? `your pigeon to ${nm(o.to)}` : `${nm(o.from)}’s pigeon`;
  const [a, b] = n.lead === "other" ? [there, here] : [here, there];
  return `${a[0].toUpperCase() + a.slice(1)} ${n.kind === "overtake" ? "overtook" : "passed"} ${b}${over}`;
}
// "New in your passport: Kazakhstan, Mongolia and 2 more" on the flight that collected them (tap for the passport)
function stampLines(msgs) {
  const and = (a) => (a.length > 3 ? `${a.slice(0, 2).join(", ")} and ${a.length - 2} more` : a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  return (msgs || []).filter((m) => m.from === S.me.id && m.stamps?.length && !m.flying).map((m) => ({ at: m.deliverAt + 1,
    html: `<button type="button" class="sysline stamps" data-key="ps:${esc(m.id)}" data-act="passport" data-id="${esc(m.id)}">${I.globe}<span>New in your passport: ${esc(and(m.stamps))}</span></button>` }));
}
// this chat's moments, each once (both pigeons may be here), in time order.
// Pigeons sent together meet the same one at the same minute: that reads as
// one line with a count.
const momLine = (x) => `<button type="button" class="sysline moment" data-key="s:${esc(x.key)}" data-sig="${x.n}" data-act="map" data-id="${esc(x.id)}">${x.kind === "flock" ? I.people : I.pass}<span>${esc(x.text)}<span class="t"> · ${fmtTime(x.at)}</span>${x.n > 1 ? `<span class="momx">×${x.n}</span>` : ""}</span></button>`;
function chatMoments(msgs, chatId) {
  const seen = new Set(), same = new Map(), out = [];
  for (const m of msgs || []) for (const n of m.near || []) {
    const key = [m.id, n.other.id].sort().join("|"); if (seen.has(key)) continue; seen.add(key);
    const text = momentText(m, n, chatId), dup = text, was = same.get(dup);
    if (was && Math.abs(was.at - n.at) < 10 * 60e3) { was.mom.n++; continue; }
    const x = { mom: { key, id: m.id, text, at: n.at, kind: n.kind, place: n.place && n.place !== "land" ? n.place : "", n: 1 }, at: n.at };
    same.set(dup, x); out.push(x);
  }
  for (const x of out) x.html = momLine(x.mom);
  out.push(...stampLines(msgs));
  for (const m of msgs || []) if (m.from === S.me.id && m.bird?.up && !m.flying && !m.lost)
    out.push({ at: m.deliverAt, html: `<button type="button" class="sysline rankup" data-key="rk:${esc(m.id)}" data-act="bird" data-id="${esc(m.bird.id)}">${I.bird}<span>${esc(m.bird.name)} became ${aRank(esc(m.bird.up))} on this flight</span></button>` });
  return out.sort((a, b) => a.at - b.at);
}
// Three or more mid-air moments in a row fold into one line ("5 near misses
// over India and Malaysia"); tap to see each. Stays open across re-renders.
const momOpen = new Set();
function momRun(items) {
  const out = []; let run = [];
  const flush = () => {
    const n = run.reduce((a, x) => a + x.mom.n, 0);
    if (run.length < 2 || n < 3) { out.push(...run.map((x) => x.html)); run = []; return; }
    const ms = run.map((x) => x.mom), key = ms[0].key, open = momOpen.has(key);
    const places = [...new Set(ms.map((x) => x.place).filter(Boolean))];
    const where = places.length > 3 ? ` over ${places.slice(0, 2).join(", ")} and ${places.length - 2} more` : places.length ? ` over ${places.length > 1 ? `${places.slice(0, -1).join(", ")} and ${places.at(-1)}` : places[0]}` : "";
    const what = ms.every((x) => x.kind === "flock") ? "flights together" : ms.some((x) => x.kind === "flock") ? "mid-air moments" : "near misses";
    const t0 = fmtTime(ms[0].at), t1 = fmtTime(ms.at(-1).at), when = t0 === t1 ? t0 : `${t0}–${t1}`;
    out.push(`<div class="momrun${open ? " open" : ""}" data-key="sr:${esc(key)}"><button type="button" class="sysline moment momsum" data-act="momrun" data-id="${esc(key)}" aria-expanded="${open}">${ms.every((x) => x.kind === "flock") ? I.people : I.pass}<span>${n} ${what}${esc(where)}<span class="t"> · ${when}</span></span>${chevSm}</button><div class="momlist"${open ? "" : " hidden"}>${run.map((x) => x.html).join("")}</div></div>`);
    run = [];
  };
  for (const x of items) { if (x.mom) { run.push(x); continue; } flush(); out.push(x.html); }
  flush();
  return out.join("");
}
// Flyovers in a chat with a friend: their pigeon over you (wave while it's
// fresh), yours over them (and whether they waved).
const WAVE_FOR = 12 * HOUR;
let wavedNow = null;                          // the one just waved at, for its little wave
function flyLines(f) {
  return (S.fly.get(f.id) || []).map((x) => {
    const name = esc(first(f.name)), can = !x.mine && !x.waved && now() - x.at < WAVE_FOR;
    const text = x.mine ? (x.waved ? `${name} waved at your pigeon${x.place ? ` over ${esc(x.place)}` : ""}` : `Your pigeon flew over ${name}${x.place ? ` in ${esc(x.place)}` : ""}`)
      : `${name}’s pigeon flew over you${x.waved ? " · you waved" : ""}`;
    return { at: x.at, html: `<div class="sysline fly${wavedNow === x.id ? " just" : ""}" data-key="fl:${esc(x.id)}" data-sig="${x.waved ? 1 : 0}">${I.wave}<span>${text}<span class="t"> · ${fmtTime(x.mine && x.waved ? x.waved : x.at)}</span></span>${can ? `<button type="button" class="wavebtn" data-act="wave" data-id="${esc(x.id)}">Wave</button>` : ""}</div>` };
  });
}
// Your pigeon in the air, in a line: who carries it, when it lands, and what's happened on the way
function flySub(m) {
  const k = kindOf(m), c = m.flock ? flockCount(m) : null, bits = [m.bird ? m.bird.name : "", m.mystery ? `Mystery: ${KIND[k].name.toLowerCase()}` : KIND[k].name];
  bits.push(c ? `${c.landed} of ${c.n} landed` : `lands ${atTime(m.deliverAt)}`);
  if (m.via) bits.push(`via ${first(friend(m.via)?.name || "a friend")}`);
  if ((m.legs || []).filter((l) => !l[3]).length > (m.via ? 2 : 0)) bits.push("changed course");
  if (m.cheers) bits.push(`cheered on ×${m.cheers}`);
  const w = wxSay(m, true) || (windWord(m.wind) && windWord(m.wind) !== "calm" ? windWord(m.wind) : "");
  if (w) bits.push(w);
  return bits.filter(Boolean).join(" · ");
}
// On your pigeon's map: who it flew over, and who waved
function flyText(m) {
  const l = m.fly || []; if (!l.length) return "";
  const nm = (x) => first(friend(x.who)?.name || "a friend"), and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  const w = l.filter((x) => x.waved);
  return w.length === 1 ? `${nm(w[0])} waved from ${w[0].place || "below"}` : w.length ? `${and(w.map(nm))} waved from below` : l.length === 1 ? `Flew over ${nm(l[0])}${l[0].place ? ` in ${l[0].place}` : ""}` : `Flew over ${and(l.map(nm))}`;
}
/* ---------- named pigeons ----------
   Up to five of yours, with names and careers (functions/_birds.js). They take
   turns carrying what you send: the one you pick, else the one that has
   rested longest. Miles bring rank and stamina (less rest between flights). */
const BIRDS_MAX = 5;
// feathers buy accessories for your named pigeons: [id, name, emoji]
const WEAR = { satchel: ["Satchel", "👜"], daisy: ["Daisy", "🌼"], ribbon: ["Ribbon", "🎀"], scarf: ["Scarf", "🧣"], goggles: ["Goggles", "🥽"], shades: ["Sunglasses", "🕶️"], tophat: ["Top Hat", "🎩"], crown: ["Crown", "👑"] };
const wearOn = (w) => (w && WEAR[w] ? `<i class="wear" aria-hidden="true">${WEAR[w][1]}</i>` : "");
const wearWord = (w) => (w && WEAR[w] ? ` in ${/^[aeiou]/i.test(WEAR[w][0]) ? "an" : w === "shades" ? "" : "a"} ${WEAR[w][0].toLowerCase()}`.replace("  ", " ") : "");
const RANKS = [["Fledgling", 0], ["Courier", 500], ["Navigator", 2000], ["Veteran", 8000], ["Ace", 20000], ["Legend", 40075]];
const RANK_TILE = { Fledgling: "gray", Courier: "green", Navigator: "blue", Veteran: "indigo", Ace: "orange", Legend: "rocket" };
const aRank = (r) => `${/^[AEIOU]/.test(r) ? "an" : "a"} ${r}`;
const birdReady = (b) => b.state === "ready" || (b.state === "resting" && now() >= (b.busyUntil || 0));
function birdFor() {
  if (S.birdPick === "none" || !S.birds.length) return null;
  const ready = S.birds.filter(birdReady);
  return ready.find((b) => b.id === S.birdPick) || [...ready].sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0] || null;
}
function birdState(b) {
  if (b.state === "flying") return `In the air · lands ${fmtLand(b.landAt)}`;
  if (b.state === "waiting") return "Booked to fly";
  return birdReady(b) ? "Ready" : `Resting · ready in ${fmtDur(b.busyUntil - now())}`;
}
// On a pigeon's map: who's carrying it (and, for yours, how far it has flown in all)
function birdLine(m) {
  const b = m.bird; if (!b) return "";
  const c = m.from === S.me.id && b.id ? [...S.birds, ...S.hall].find((x) => x.id === b.id) : null;
  return `<span class="birdline">${I.bird}Carried by ${esc(b.name)}${esc(wearWord(b.wear))} · ${esc(b.up || b.rank)}${c ? ` · ${fmtMiles(c.km)} in all` : ""}</span>`;
}
// at the top of a chat whose messages disappear
const vanishLine = (v) => (v?.ms ? `<div class="sysline vanishline" data-key="vl" data-sig="${v.ms}" role="note">${I.clock}Messages disappear ${vanishSay(v.ms)} after they’re read (or land, if read receipts are off)${v.by ? ` · set by ${v.by === S.me.id ? "you" : esc(first(personById(v.by)?.name || "a friend"))}` : ""}</div>` : "");
function geventLines(list) {
  const nm = (p) => (p.id === S.me.id ? "you" : first(personById(p.id)?.name || p.name || "Someone"));
  const cap = (x) => x[0].toUpperCase() + x.slice(1), and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  let out = "";
  for (let i = 0; i < list.length; i++) {
    const e = list[i], by = cap(nm(e.by));
    let text;
    if (e.kind === "add" || e.kind === "create") {
      const made = e.kind === "create", whos = [];
      let j = made ? i + 1 : i;
      while (j < list.length && list[j].kind === "add" && list[j].by.id === e.by.id && Math.abs(list[j].at - e.at) < 60e3) whos.push(nm(list[j++].who || {}));
      i = Math.max(i, j - 1);
      text = made ? `${by} made the group${whos.length ? ` with ${and(whos)}` : ""}` : `${by} added ${and(whos)}`;
    } else if (e.kind === "leave") text = `${by} left`;
    else if (e.kind === "rename") text = `${by} named the group “${e.name}”`;
    else if (e.kind === "vanish") text = Number(e.name) ? `${by} set messages to disappear ${vanishSay(Number(e.name))} after they’re read (or land, if read receipts are off)` : `${by} turned off disappearing messages`;
    else continue;
    out += `<div class="sysline" data-key="ge:${e.at}:${esc(e.kind)}" role="note">${esc(text)}<span class="t"> · ${fmtTime(e.at)}</span></div>`;
  }
  return out;
}
function vGroupChat(g) {
  const msgs = S.msgs.get(g.id);
  const evs = S.gevents.get(g.id) || [];
  // someone in it now whom no one was seen adding (the server alone says they're here): say so
  const added = new Set(evs.flatMap((e) => [e.who?.id, e.kind === "create" ? e.by?.id : null]).filter(Boolean));
  const told = msgs && S.geventsLive?.has(g.id);       // (only once its history has come from the server, not just this phone's copy)
  const ghosts = told ? (g.unseen || []).filter((id) => !added.has(id)) : [];
  if (told && g.unseen?.length) { S.pins["g:" + g.id] = [...new Set([...(S.pins["g:" + g.id] || []), ...g.members.map((p) => p.id)])]; g.unseen = []; savePins(); }
  if (ghosts.length) g.ghosts = [...new Set([...(g.ghosts || []), ...ghosts])];
  let body = "", lastAt = 0, prevFrom = null, ev = 0; runN = tsN = 0;
  const stl = stampLines(msgs).sort((a, b) => a.at - b.at); let si = 0;
  const stampsTo = (at) => { let h = ""; while (si < stl.length && stl[si].at <= at) h += stl[si++].html; return h; };
  // the group's changes up to a moment, as lines
  const evsTo = (at) => { const k = ev; while (ev < evs.length && evs[ev].at <= at) ev++; return ev > k ? geventLines(evs.slice(k, ev)) : ""; };
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length && (S.outbox.some((o) => o.to === g.id) || S.pending?.to === g.id)) body = "";
  else if (!msgs.length) body = `${evsTo(Infinity)}<p class="empty" data-key="empty"><b>Say hello</b>Each message flies to everyone in ${esc(g.name)} at once: one pigeon each, over the real distance to each of them.</p>`;
  const landed = (msgs || []).filter((m) => m.from === S.me.id && !m.flying && !m.lost && !m.waiting && !m.recalled);
  quietMeta = new Set(landed.slice(0, -1).map((m) => m.id));
  if (msgs?.length) for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], mine = m.from === S.me.id, at = mine || m.flying || m.lost ? m.sentAt : m.deliverAt;
    if (!sameDay(at, lastAt) || at - lastAt > TIME_GAP) { body += stampHtml(at); prevFrom = null; }
    lastAt = at;
    const lines = evsTo(at) + stampsTo(at); if (lines) { body += lines; prevFrom = null; }
    // pigeons still flying to you, one after another: one card between them
    let j = i; while (j < msgs.length && inbound(msgs[j])) j++;
    if (j - i >= 2) { body += flyRun(msgs.slice(i, j), g); i = j - 1; prevFrom = null; continue; }
    const who = member(g, m.from) || { id: m.from, name: "Former member" };
    if (!mine && prevFrom !== m.from && !m.lost) body += `<div class="who" data-key="wh:${esc(m.id)}">${avatar(who, "xs")}<span>${esc(first(who.name))}</span></div>`;
    body += bubble(who, m, prevFrom !== null && prevFrom !== m.from && (mine || m.lost), g);
    prevFrom = m.from;
  }
  if (msgs?.length) body += evsTo(Infinity) + stampsTo(Infinity);
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && (m.route || m.flock?.some((x) => x.route)));
  const changed = others(g).filter((p) => p.keyChanged);
  const gh = (g.ghosts || []).map((id) => member(g, id)).filter(Boolean);
  const ghostWarn = gh.length ? `<div class="warn" data-key="warn:g"><span>${gh.map((p) => esc(first(p.name))).join(" and ")} ${gh.length > 1 ? "are" : "is"} now in this group, but no one was seen adding them. If that’s unexpected, don’t send anything private and check with the group.</span></div>` : "";
  const warn = ghostWarn + (changed.length ? `<div class="warn" data-key="warn:k"><span>${changed.map((p) => esc(first(p.name))).join(" and ")}’s security key changed. This happens when someone makes a new account or resets their password. Check before you send anything private.</span><button class="btn small" data-act="safety" data-id="${esc(changed[0].id)}">Check</button></div>` : "");
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", S.backTo || "messages")}</div>
      <button class="chatwho" data-act="groupinfo" data-id="${esc(g.id)}" aria-label="${esc(g.name)}: details">${gavatar(g, "s")}<span class="wt"><span class="nm"><span>${esc(g.name)}</span>${I.chev}</span>${gchatSub(g)}</span></button>
      <div class="nb-right">${flying ? nbtn("map", I.map, "Watch the pigeons", `data-id="${esc(flying.id)}"`) : ""}${nbtn("groupmenu", I.more, "More")}</div>
    </div>
    <h1 class="sr">${esc(g.name)}</h1>${warn}<div class="msgs">${vanishLine(g.vanish)}${body}${outboxBubbles(g.id)}</div>`;
}
function vChat() {
  if (group(S.chat)) return vGroupChat(group(S.chat));
  const f = friend(S.chat);
  if (!f) return `${navbar("", { left: backBtn("tab", S.backTo || "messages"), solid: true })}<p class="empty"><b>Not in your friends</b>This person isn’t in your friends any more.</p>`;
  const msgs = S.msgs.get(f.id);
  let body = "", lastAt = 0, prevFrom = null; runN = tsN = 0;
  const lastLanded = [...(msgs || [])].reverse().find((m) => m.from === S.me.id && !m.flying && !m.lost && !m.waiting && !m.recalled)?.id;
  const moms = [...chatMoments(msgs, f.id), ...flyLines(f)].sort((a, b) => a.at - b.at); let mo = 0;
  const momsTo = (at) => { const h = []; while (mo < moms.length && moms[mo].at <= at) h.push(moms[mo++]); return momRun(h); };
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length && (S.outbox.some((o) => o.to === f.id) || S.pending?.to === f.id)) body = "";
  else if (!msgs.length) body = `${momsTo(Infinity)}<p class="empty" data-key="empty"><b>Say hello</b>Messages to ${esc(first(f.name))} are end-to-end encrypted and fly the real distance between you.</p>`;
  else for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], at = m.from === S.me.id || m.flying || m.lost ? m.sentAt : m.deliverAt;
    if (!sameDay(at, lastAt) || at - lastAt > TIME_GAP) { body += stampHtml(at); prevFrom = null; }
    lastAt = at;
    const ml = momsTo(at); if (ml) { body += ml; prevFrom = null; }
    let j = i; while (j < msgs.length && inbound(msgs[j])) j++;
    if (j - i >= 2) { body += flyRun(msgs.slice(i, j), null); i = j - 1; prevFrom = null; continue; }
    body += bubble(f, m, prevFrom !== null && prevFrom !== m.from);
    if (m.id === lastLanded) body += statusLine(m);
    prevFrom = m.from;
  }
  if (msgs?.length) body += momsTo(Infinity);
  // a pigeon in the air either way: the map button sits beside the menu
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && !m.waiting && m.route);
  const warn = f.keyChanged ? `<div class="warn${wasVerified(f) ? " strong" : ""}" data-key="warn:k"><span>${wasVerified(f) ? `You verified ${esc(first(f.name))} in person, and their security key has changed since. Verify again, together, before you send anything.` : `${esc(first(f.name))}’s security key changed. This happens when they make a new account or reset their password. Compare safety numbers before you send anything private.`}</span><button class="btn small" data-act="safety" data-id="${esc(f.id)}">Check</button></div>` : "";
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", S.backTo || "messages")}</div>
      <button class="chatwho" data-act="friendinfo" data-id="${esc(f.id)}" aria-label="${esc(f.name)}: details">${avatar(f, "s", true)}<span class="wt"><span class="nm"><span>${esc(first(f.name))}</span>${I.chev}</span>${chatSub(f)}</span></button>
      <div class="nb-right">${flying ? nbtn("map", I.map, "Watch the pigeon", `data-id="${esc(flying.id)}"`) : ""}${nbtn("chatmenu", I.more, "More")}</div>
    </div>
    <h1 class="sr">Chat with ${esc(first(f.name))}</h1>${warn}<div class="msgs">${vanishLine(f.vanish)}${body}${outboxBubbles(f.id)}</div>`;
}

/* ---------- sign-up and sign-in ---------- */
function field(name, placeholder, type, ac, prefix) {
  return `<label class="fcell">${prefix ? `<span class="pre">${prefix}</span>` : ""}<input id="f-${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" autocomplete="${ac}" aria-label="${esc(placeholder)}"${type === "email" || name === "handle" ? ' autocapitalize="off" spellcheck="false"' : ""}${name === "handle" ? ' maxlength="20"' : ""}>${type === "password" ? `<button type="button" class="peek" data-act="peek" aria-label="Show password">${I.eye}</button>` : ""}</label>`;
}
const ferr = `<p class="gfoot bad ferr" role="alert" hidden></p>`;
function vAuth() {
  switch (S.view) {
    case "loading": return `<div class="loading">Opening Chat…</div>`;
    case "welcome": return `<div class="auth welcome night ifl-in${S.welcomed ? " again" : ""}">
        <div class="wtop ifl-top">
          <div class="wlogo ifl-logo"><span class="appicon" aria-hidden="true">${I.bird}</span></div>
          <h1 class="wtitle ifl-title" aria-label="Chat">${[..."Chat"].map((c) => `<span aria-hidden="true">${c}</span>`).join("")}</h1>
          <p class="whisper ifl-tagline">Letters carried by pigeon</p>
          ${S.pendingAdd ? `<p class="winvite">@${esc(S.pendingAdd)} asked you to join. Sign in or make your account, and their request is ready to send.</p>` : ""}
        </div>
        ${welcomeCta()}</div>`;
    case "locpick": return `<div class="auth">${navbar("")}
        <h1 class="large">Where are you?</h1>
        <p class="sub">Pigeons fly from here, so it sets how long your messages take. It’s rounded to about a mile, and only your friends see it.</p>
        ${S.me?.place ? `<div class="group mt">${cell({ icon: I.check, tile: "green", label: esc(S.me.place), sub: "Your location" })}</div>` : ""}
        <div class="stack locfirst"><button class="btn wide" data-act="locate">${I.loc}${S.me?.place ? "Use my location again" : "Use my location"}</button></div>
        <div class="group">
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a city instead</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
          ${toggleCell({ act: "onbauto", icon: I.loc, tile: "green", label: "Keep it up to date", sub: "While Chat is open, so pigeons find you", on: S.onbAuto !== false })}
        </div>${ferr}
        ${S.me?.place ? `<div class="stack"><button class="btn wide plain" data-act="locdone">Continue</button></div>` : ""}</div>`;
    case "pkoffer": return `<div class="auth"><div class="hero tall"><span class="big-ico">${I.face}</span>
        <h1>Sign in faster next time</h1><p>A passkey signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site. On most newer phones it can also unlock your messages if you forget your password.</p></div>${ferr}
        <div class="stack"><button class="btn wide" data-act="pkadd" data-next="done">Add a passkey</button><button class="btn wide plain" data-act="onbdone">Not now</button></div></div>`;
  }
  return "";
}
/* ---------- composer and tab bar ---------- */
const chatKm = (f) => (S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : 500);
// A landing time chosen for this chat (one to one, not a /dumb pigeon), once it's still ahead
function schedFor(chat, dumb = dumbText()) {
  const sc = S.sched;
  if (!sc || sc.chat !== chat || group(chat) || dumb != null) return null;
  if (sc.at <= now()) { S.sched = null; return null; }
  return sc;
}
// A friend to stop over with on the way (one to one, still a friend, with a location)
function viaFor(chat, dumb = dumbText()) {
  const v = S.via;
  if (!v || v.chat !== chat || group(chat) || dumb != null) return null;
  if (friend(v.id)?.lat == null) { S.via = null; return null; }
  return v;
}
// Friends you and this friend both have (who a pigeon could stop over with), for How It Flies
const mutualsBusy = new Set();
async function loadMutuals(id) {
  if (mutualsBusy.has(id)) return; mutualsBusy.add(id);
  try { const r = await api("mutuals?with=" + encodeURIComponent(id)); S.mutuals = { chat: id, at: now(), ids: r.ids || [] }; if (S.sheet?.type === "flysheet" && S.chat === id) renderSheet(); }
  catch (_) { S.mutuals = { chat: id, at: now(), ids: [] }; }
  finally { mutualsBusy.delete(id); }
}
// Paid pigeons you have, fastest last: what a scheduled pigeon can be
const schedKind = () => (["swift", "turbo", "rocket"].includes(S.pick) && (S.me[S.pick] || 0) > 0 ? S.pick : ["swift", "turbo", "rocket"].find((k) => (S.me[k] || 0) > 0) || null);
// Times worth a tap: this evening, tomorrow morning and evening, Saturday morning
function schedPresets() {
  const at = (days, h) => { const d = new Date(now()); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return +d; };
  const out = [];
  if (at(0, 18) - now() > HOUR) out.push(["This Evening", at(0, 18)]);
  out.push(["Tomorrow Morning", at(1, 8)], ["Tomorrow Evening", at(1, 18)]);
  const sat = (6 - new Date(now()).getDay() + 7) % 7;
  if (sat > 1) out.push(["Saturday Morning", at(sat, 9)]);
  return out;
}
const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/* ---------- plan around the weather ----------
   Before you send: the forecast along the way, now and over the next day. If
   the weather would make it land well late, the composer says so, and when
   the skies clear: a pigeon booked to leave then flies through that hour's
   forecast instead. A strong tailwind gets a word too. */
const planBusy = new Set();
async function planWx(id) {
  const have = S.wxPlan.get(id);
  if (planBusy.has(id) || (have && now() - have.at < 20 * MIN)) return;
  planBusy.add(id);
  try { const d = await api("wx-plan?with=" + encodeURIComponent(id)); S.wxPlan.set(id, { at: now(), d }); if (S.chat === id) renderCompose(); }
  catch (_) { S.wxPlan.set(id, { at: now(), d: null }); }
  finally { planBusy.delete(id); }
}
const PAID = ["swift", "turbo", "rocket"];
function wxAdvice(f, kind) {
  const p = S.wxPlan.get(f.id)?.d; if (!p?.now || f.lat == null) return null;
  const km = chatKm(f), calm = (k) => flightMs(km, mySpeed(k)), late = (x, k) => calm(k) / x.f - calm(k), t = now();
  const d0 = late(p.now, kind);
  if (-d0 >= Math.max(10 * MIN, calm(kind) * 0.08)) return { early: Math.round(-d0 / MIN) * MIN, eta: Math.round(calm(kind) / p.now.f / MIN) * MIN };
  if (d0 < Math.max(20 * MIN, calm(kind) * 0.1)) return null;
  // waiting means booking it to land later, and that takes a swift pigeon or faster
  const sk = PAID.includes(kind) ? kind : schedKind(), k = sk || kind;
  const clear = (p.hours || []).find((h) => h.at >= t + HOUR && h.at <= t + 20 * HOUR && late(h, k) <= Math.max(5 * MIN, late(p.now, k) * 0.25));
  return { late: Math.round(d0 / MIN) * MIN, wx: p.now.wx, clear: clear && { off: clear.at, land: Math.ceil((clear.at + calm(k) / clear.f) / MIN) * MIN, kind: sk } };
}
function wxPlanHtml(a, kind) {
  if (a.early) return `<span class="wxline">${I.wind}<span>A tailwind today: about ${esc(fmtDur(a.early))} sooner than in calm air.</span></span>`;
  const w = a.wx && WX[a.wx.k], c = a.clear, by = (ts) => (sameDay(ts, now()) ? fmtTime(ts) : `${fmtTime(ts)} tomorrow`);
  let text = `${w ? `${w[0][0].toUpperCase()}${w[0].slice(1)} over ${wxWhere(a.wx.lon, a.wx.lat)}` : "Rough weather on the way"}: about ${fmtDur(a.late)} slower than in calm air.`;
  if (!c) text += " No clear skies in the next day.";
  else if (!c.kind) text += ` Clear by ${by(c.off)}, if you’d rather wait.`;
  else text += ` Clear by ${by(c.off)}: ${c.kind === kind ? "leave then and it lands" : `a ${KIND[c.kind].name.toLowerCase()} pigeon leaving then lands`} ${fmtLand(c.land)}.`;
  return `<span class="wxline">${I[w ? w[1] : "wind"]}<span>${esc(text)}</span></span>${c?.kind ? `<button type="button" class="btn small wxwait" data-act="wxwait" data-id="${esc(c.land)}" data-kind="${esc(c.kind)}">${c.kind === kind ? "Leave" : esc(KIND[c.kind].name)} at ${fmtTime(c.off)}</button>` : ""}`;
}
// What can fly from this chat now, and which one will
function composeState() {
  const g = S.chat ? group(S.chat) : null;
  // a group stands in for a friend here: its turn, and any member's changed key
  const f = g ? { id: g.id, turn: g.turn, keyChanged: others(g).some((p) => p.keyChanged) } : friend(S.chat);
  if (!f) return null;
  // (whose turn: the chat's, unless a sync since knows better; both say when, by the server's clock)
  const ct = S.turns.get(f.id), t = ct && ct.at >= (S.raw?.now || 0) ? ct : f.turn;
  // off the Earth: space pigeons only (lunar to the Moon, laser to Mars), any time, straight there
  if (!g && moonChat(f)) {
    const ks = kindsFor(f), can = Object.fromEntries(ks.map((k) => [k, (S.me[k] || 0) > 0]));
    return { g, f, t, dumb: null, sched: null, via: null, can, kind: can[S.pick] ? S.pick : ks.find((k) => can[k]) || null, moon: true, kinds: ks };
  }
  const dumb = dumbText();
  // told when to land: one to one only, and standard pigeons can't wait that long for a turn
  const sched = schedFor(S.chat, dumb), via = viaFor(S.chat, dumb);
  const can = { standard: !!t.free && !sched, swift: (S.me.swift || 0) > 0, turbo: (S.me.turbo || 0) > 0, rocket: (S.me.rocket || 0) > 0, mystery: (S.me.mystery || 0) > 0 && !sched,
    // by orbit: one to one, between two places on Earth, now and straight there
    orbital: !g && !sched && !via && f.lat != null && S.me.lat != null && (S.me.orbital || 0) > 0 };
  // your choice if it can fly now, else the slowest that can
  const kind = dumb != null ? (t.free ? "dumb" : null) : can[S.pick] ? S.pick : KINDS.map(([k]) => k).find((k) => can[k]) || null;
  return { g, f, t, dumb, sched, via, can, kind, moon: !!g && (!!S.me.moon || others(g).some((p) => p.onMoon)), orbit: !g && f.lat != null && S.me.lat != null };
}
// How long a pigeon of this kind takes: to the furthest of a group, or by way of a stopover
function etaMs(c, k) {
  if (!c.g && (c.moon || k === "orbital")) return spaceMs(k, endFor(S.me), endFor(c.f));
  const sp = mySpeed(k);
  if (c.g) return Math.max(0, ...others(c.g).map((p) => memberMs(p, k)));
  if (c.via) { const p = friend(c.via.id); return flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, c.f.lat ?? p.lat, c.f.lon ?? p.lon), sp); }
  return flightMs(chatKm(c.f), sp);
}
// The message box's hint: "Lands 18:40", "Via Nia · lands Thu 06:08", a group's "Lands in 2h" or "2h–1d 10h away"
function landHint(c, k) {
  if (k === "mystery") return "Who knows when?";
  if (c.sched) return `Lands ${atShort(c.sched.at)}`;
  if (c.g) {
    const all = others(c.g).map((p) => memberMs(p, k)).sort((a, b) => a - b), ms = (x) => durShort(x), n = all.length;
    return n ? (ms(all[0]) === ms(all[n - 1]) ? `Lands in ${ms(all[0])}` : `${ms(all[0])}–${ms(all[n - 1])} away`) : "Message";
  }
  return `${c.via ? `Via ${first(friend(c.via.id).name)} · lands` : "Lands"} ${atShort(now() + plannedMs(c, k))}`;
}
/* ---------- the composer: one row ----------
   +, then the message with its pigeon at the start (tap it for How It Flies)
   and when it would land as the hint, then send. A line above it only when
   something stops it flying. */
let planSoon = 0, planFor = "";
function renderCompose() {
  const show = S.view === "chat" && !!S.chat && !!(friend(S.chat) || group(S.chat)) && !!S.me;
  $compose.hidden = !show; if (!show) { composeH = 0; return; }
  const c = composeState(), { g, f, dumb, sched, via, kind } = c;
  const note = $(".note", $compose), btn = $(".send", $compose), pill = $(".kind", $compose);
  const has = (dumb ?? $ta.value).trim() || S.attach;
  S.sendKind = kind;
  const hatch = () => fmtDur(Math.min(...["swiftNextAt", "turboNextAt", "rocketNextAt"].map((x) => S.me[x] || Infinity)) - now());
  let stop = "", blocked = true;
  if (f.keyChanged) stop = "Check the new safety number before sending.";
  else if (S.me.lat == null && !S.me.moon) stop = "Set your location in Account before sending.";
  else if (!kind && c.moon && !g) {
    const ks = c.kinds || [], mars = ks.includes("laser"), next = fmtDur(Math.min(...ks.map((k) => S.me[k + "NextAt"] || Infinity)) - now());
    stop = mars ? `Only a laser pigeon reaches ${worldOf(S.me) === "mars" && worldOf(f) === "mars" ? "across Mars" : "Mars or comes from it"}, and your laser loft is empty. The next one hatches in ${next}.`
      : `Only a lunar pigeon reaches ${S.me.moon && f.moon ? "across the Moon" : S.me.moon ? "Earth from the Moon" : "the Moon"}, and your lunar lofts are empty. The next one hatches in ${next}.`;
  }
  else if (!kind && sched) stop = `Scheduled pigeons are swift or faster, and your lofts are empty. The next one hatches in ${hatch()}.`;
  else if (!kind && dumb != null) stop = "Dumb pigeons wait their turn.";
  else if (!kind) stop = `It isn’t your turn, and your lofts are empty. The next pigeon hatches in ${hatch()}.`;
  else if (sched && sched.at - etaMs(c, kind) < now()) stop = `Too soon for a ${KIND[kind].name.toLowerCase()} pigeon: it takes ${fmtDur(etaMs(c, kind))} to get there. Pick a later time or a faster pigeon.`;
  else blocked = false;
  if (S.err) stop = S.err;
  note.hidden = !stop; note.className = "note stop";
  if (note.textContent !== stop) note.textContent = stop;
  // its pigeon, at the start of the message: the named one carrying it, or its kind
  // (a moment after a chat opens, the planner's times, so the hint says what How It Flies will)
  const planKey = !g && !via && !sched && kind && KIND[kind] && !SPACE_KINDS.includes(kind) && f.lat != null && S.me.lat != null && !(S.routePlan?.key === f.id + ":" + (birdFor()?.id || "") && now() - S.routePlan.at < PLAN_KEEP) ? f.id + ":" + kind : "";
  if (planKey !== planFor) { clearTimeout(planSoon); planSoon = 0; planFor = planKey; }
  if (planKey && !planSoon) planSoon = setTimeout(() => { planSoon = -1; if (S.chat === f.id && S.view === "chat") routePlanFor(f.id, kind); }, 1200);   // (-1: asked, once, until the chat or pigeon changes)
  const here = S.me.lat != null || !!S.me.moon;
  const bd = kind && kind !== "dumb" && !SPACE_KINDS.includes(kind) ? birdFor() : null, hint = kind && !f.keyChanged && here ? landHint(c, kind) : "Message";
  pill.hidden = !!f.keyChanged || !here;
  pill.disabled = dumb != null;
  const pk = JSON.stringify([kind, bd?.id, bd?.name, bd?.wear, !!sched, !!via, S.me.skin]);
  if (pill.dataset.k !== pk) {
    pill.dataset.k = pk; pill.classList.toggle("named", !!bd);
    pill.innerHTML = `${kind ? `<span class="pgw">${pg(kind, S.me.skin)}${wearOn(bd?.wear)}</span>` : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}<span class="kl">${esc(!kind ? "None" : bd ? bd.name : KIND[kind].name)}</span>${sched ? I.clock : via ? I.people : ""}${I.chev}`;
  }
  pill.setAttribute("aria-label", `${kind ? `${KIND[kind].name} pigeon${bd ? `, carried by ${bd.name}` : ""}${kind === "dumb" ? "" : `. ${hint}`}` : "No pigeon can fly yet"}. How it flies`);
  if ($ta.placeholder !== hint) { $ta.placeholder = hint; if (!$ta.value) fitTa(); }
  // the weather along the way, for a pigeon about to leave now (one to one)
  const wp = $(".wxplan", $compose), plan = !g && !c.moon && !blocked && !S.err && !sched && !via && kind && kind !== "dumb" && kind !== "mystery" && kind !== "orbital" && f.lat != null && S.me.lat != null;
  if (plan) planWx(f.id);
  const adv = plan ? wxAdvice(f, kind) : null, wk = adv ? JSON.stringify([adv, kind]) : "";
  if (wp.dataset.k !== wk) { wp.dataset.k = wk; wp.hidden = !adv; wp.classList.toggle("early", !!adv?.early); wp.innerHTML = adv ? wxPlanHtml(adv, kind) : ""; }
  btn.disabled = blocked || !has || S.busy;
  btn.classList.toggle("busy", !!S.busy);               // (a spinner in it, while what you sent goes up)
  // nothing typed: the send button becomes a microphone (voice pigeons)
  const mic = $(".mic", $compose), showMic = !has && !blocked && voiceOK() && dumb == null;
  mic.hidden = !showMic || !!S.busy; btn.hidden = showMic && !S.busy; mic.disabled = !!S.busy;
  // you can always delete a /dumb that can't fly; and the box you're typing in is never switched off under you
  // (iOS puts the keyboard away the moment a focused field is disabled; Send stays off instead)
  const off = blocked && !S.err && dumb == null;
  if (!off || document.activeElement !== $ta) $ta.disabled = off;
  const rb = $(".replybar", $compose), rt = S.replyTo && S.replyTo.chat === S.chat ? S.replyTo : null;
  rb.hidden = !rt;
  if (rt && rb.dataset.for !== rt.id) {
    rb.dataset.for = rt.id;
    rb.innerHTML = `${I.reply}<span class="rtext"><b>Replying to ${esc(chatName(rt.from, g))}</b><span>${rt.p ? (rt.p === "gif" ? "GIF" : rt.p === "voice" ? "Voice pigeon" : "Photo") + (rt.t ? ": " : "") : ""}${esc(rt.t)}</span></span><button type="button" data-act="unreply" aria-label="Cancel reply">${I.x}</button>`;
  }
  if (!rt && rb.dataset.for) { rb.dataset.for = ""; rb.innerHTML = ""; }
  const a = $(".attach", $compose);
  a.hidden = !S.attach;
  if (S.attach?.voice && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<span class="vthumb">${I.mic}</span><span class="ainfo"><b>Voice · ${fmtClip(S.attach.ms)}</b><span class="atext" aria-live="polite">${attachText()}</span><i class="upbar" aria-hidden="true"><b></b></i></span><button type="button" data-act="unattach" aria-label="Remove voice pigeon">${I.x}</button>`;
  } else if (S.attach && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<img src="${S.attach.preview}" alt=""><span class="ainfo"><b>${S.attach.gif ? "GIF" : "Photo"}</b><span class="atext" aria-live="polite">${attachText()}</span><i class="upbar" aria-hidden="true"><b></b></i></span><button type="button" data-act="unattach" aria-label="Remove photo">${I.x}</button>`;
  }
  if (!S.attach && a.dataset.for) { a.dataset.for = ""; a.innerHTML = ""; }
  composeGlide();
}
const TABS = [["messages", "Messages", "bubble"], ["friends", "Friends", "people"], ["account", "Account", "person"]];
// Built once and then updated, so the highlight can slide between tabs.
function renderTabs() {
  const unread = [...S.friends, ...S.groups].reduce((n, f) => n + (f.unread || 0), 0);
  const cur = S.view === "chat" ? "messages" : S.view;
  const badges = { messages: unread, friends: S.incoming.length, account: 0 };
  let tabs = $(".tabs", $tabbar);
  if (!tabs) {
    // (and beside it, InFlite's tab bar's one round button: Search)
    $tabbar.innerHTML = `<div class="tabs">${TABS.map(([id, label, icon]) => `<button class="tab" data-act="tab" data-id="${esc(id)}" aria-current="false">${I[icon]}<span>${label}</span></button>`).join("")}</div><button type="button" class="tabacc" data-act="tabsearch" aria-label="Search">${I.search}</button>`;
    tabs = $(".tabs", $tabbar);
  }
  for (const btn of tabs.querySelectorAll(".tab")) {
    const id = btn.dataset.id, n = badges[id] || 0;
    btn.setAttribute("aria-current", String(cur === id));
    if (String(n) !== (btn.dataset.badge || "0")) {          // a new badge bounces in, a changed one bumps, a cleared one shrinks away
      const b = btn.querySelector(".badge:not(.out)");
      if (n && b) { b.textContent = n; b.classList.remove("new"); void b.offsetWidth; b.classList.add("new"); }
      else if (n) btn.insertAdjacentHTML("afterbegin", `<span class="badge new">${n}</span>`);
      else if (b) { b.classList.add("out"); setTimeout(() => b.remove(), 220); }
      btn.dataset.badge = String(n);
    }
  }
  const i = TABS.findIndex(([id]) => id === cur), was = tabs.dataset.tab;
  if (String(i) !== was) {
    tabs.style.setProperty("--tab", String(Math.max(0, i)));
    if (was != null && was !== "-1" && i >= 0) { tabs.classList.remove("moving"); void tabs.offsetWidth; tabs.classList.add("moving"); }
    tabs.dataset.tab = String(i);
  }
  document.title = unread ? `(${unread}) Chat` : "Chat";
}
function filterLists() {
  const run = (list, q) => { const el = $(`[data-list="${list}"]`); if (!el) return; q = q.trim().toLowerCase(); el.querySelectorAll("[data-find]").forEach((r) => { r.hidden = !!q && !r.dataset.find.includes(q); }); };
  run("m", S.q); run("f", S.fq);
  if (airEl) airEl.classList.toggle("q", !!S.q.trim());
  if (S.view === "messages") searchMessages(S.q);
}
/* ---------- search inside chats ----------
   On the phone only: every message it can open (the chats you've opened,
   and the last ones kept from before), matched without minding case or
   accents. The server never sees what you look for. */
const fold = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let searchSeq = 0;
async function searchMessages(q) {
  const box = $(".sres", $view); if (!box) return;
  const term = fold(q.trim()), seq = ++searchSeq;
  if (term.length < 2) { box.innerHTML = ""; return; }
  // open the kept chats first (once), so they can be searched too
  for (const [fid, d] of S.chatRaw) if (!S.msgs.has(fid) && (friend(fid) || group(fid))) await applyChat(fid, d, false).catch(() => {});
  if (seq !== searchSeq) return;
  const hits = [], seen = new Set();
  const look = (chat, m) => {
    if (!m || seen.has(m.id)) return; seen.add(m.id);
    const p = S.plain.get(m.id); if (!p || p.bad || typeof p.t !== "string" || !p.t) return;
    const at = fold(p.t).indexOf(term); if (at < 0) return;
    hits.push({ chat, m, p, at, when: m.from === S.me.id ? m.sentAt : m.deliverAt });
  };
  for (const [chat, list] of S.msgs) for (const m of list) look(chat, m);
  for (const f of S.friends) look(f.id, f.last);
  for (const g of S.groups) look(g.id, g.last);
  hits.sort((a, b) => b.when - a.when);
  const snip = (t, at) => {
    const a = Math.max(0, at - 28), b2 = Math.min(t.length, at + term.length + 60);
    return `${a ? "…" : ""}${esc(t.slice(a, at))}<mark>${esc(t.slice(at, at + term.length))}</mark>${esc(t.slice(at + term.length, b2))}${b2 < t.length ? "…" : ""}`;
  };
  const rows = hits.slice(0, 40).map(({ chat, m, p, at }) => {
    const g = group(chat), f = friend(chat), who = g ? gavatar(g, "s") : avatar(f || { name: "?" }, "s");
    const by = m.from === S.me.id ? "You" : g ? first(member(g, m.from)?.name || "Someone") : "";
    return `<button type="button" class="srow" data-act="searchopen" data-id="${esc(chat)}" data-m="${esc(m.id)}">${who}
      <span class="stext"><span class="stop"><b class="one">${esc(g ? g.name : first(f?.name || "Someone"))}</b><time>${fmtListTime(m.from === S.me.id ? m.sentAt : m.deliverAt)}</time></span>
      <span class="sbody">${by ? `<span class="sby">${esc(by)}: </span>` : ""}${snip(p.t.replace(/\s+/g, " "), fold(p.t.replace(/\s+/g, " ")).indexOf(term))}</span></span></button>`;
  }).join("");
  box.innerHTML = hits.length ? `<div class="ghead">Messages${hits.length > 40 ? " · newest 40" : ""}</div><div class="group">${rows}</div>`
    : `<p class="snone">No messages on this phone match “${esc(q.trim())}”.</p>`;
}
let gifTimer = 0;
/* ---------- Add Friend: look them up as you type ---------- */
const myLink = () => `${NEW_HOME ? NEW_HOME + "/" : location.origin + "/pigeon/"}#add=${S.me.handle}`;
let addTimer = 0, addSeq = 0;
function addLookup() {
  clearTimeout(addTimer); const seq = ++addSeq;
  const i = $("#add-h", $layer), box = $(".addres", $layer); if (!i || !box) return;
  const h = i.value.trim().replace(/^@/, "").toLowerCase();
  // It folds open under the field from three letters (and away again under them), and the row stays put as you type:
  // its handle follows you and a spinner fades in over its last answer, until the new answer takes its place.
  // (no flashing between "Looking…" and an answer at every key, and nothing below jumps: styles.css .addres)
  if (h.length < 3) { box.classList.remove("has"); return; }
  const in1 = box.firstElementChild || box.appendChild(document.createElement("div")), was = $(".addrow", in1);
  const row = (sub, btn = "", cls = "", hd = h) => `<div class="group"><div class="cell addrow ${cls}"><span class="addav">${avatar({ name: hd }, "s", false, true)}<span class="spin"></span></span><span class="ctext"><span class="addh">@${esc(hd)}</span><span class="csub">${sub}</span></span>${btn}</div></div>`;
  if (was) { was.classList.add("looking"); $(".addh", was).textContent = `@${h}`; $(".csub", was).textContent = "Looking…"; const b = $(".btn", was); if (b) b.disabled = true; }
  else in1.innerHTML = row("Looking…", "", "looking");
  box.classList.add("has");
  addTimer = setTimeout(async () => {
    let r; try { r = await api("friend-status?h=" + encodeURIComponent(h)); } catch (_) { if (seq === addSeq) box.classList.remove("has"); return; }
    if (seq !== addSeq) return;                                     // typed on, or sent already (addGo: this answer's from before)
    if (($("#add-h", $layer)?.value || "").trim().replace(/^@/, "").toLowerCase() !== h) return;     // typed on
    const hd = r.handle || h, html = {
      invalid: `<p class="gfoot bad">Handles use 3 to 20 letters, numbers or underscores.</p>`,
      none: row("No one has that handle yet", `<button type="button" class="btn small gray" data-act="share">Invite</button>`, "dim looking", hd),
      self: row("That’s you", "", "looking", hd),
      new: row("On Chat", `<button type="button" class="btn small" data-act="addgo" data-id="${esc(r.handle)}">Add</button>`, "looking", hd),
      sent: row("Request sent · waiting for them", `<button type="button" class="btn small gray" data-act="cancelreq" data-id="${esc(r.id)}">Cancel</button>`, "looking", hd),
      incoming: row("Wants to be your friend", `<button type="button" class="btn small" data-act="accept" data-id="${esc(r.id)}">Accept</button>`, "looking", hd),
      friends: row("Already friends", `<button type="button" class="btn small gray" data-act="addchat" data-id="${esc(r.id)}">Message</button>`, "looking", hd),
      blocked: row("You blocked them", `<button type="button" class="btn small gray" data-act="unblock" data-id="${esc(r.id)}">Unblock</button>`, "looking", hd),
    }[r.state] || "";
    if (!html) { box.classList.remove("has"); return; }
    // (drawn still looking, then let go of that: the spinner fades out, the picture and the button in, the words after)
    in1.innerHTML = html;
    const nr = $(".addrow", in1); if (!nr) return;
    void nr.offsetWidth; nr.classList.remove("looking");
    if (!STILL.matches) $(".csub", nr).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
  }, 300);
}
// Add: the button folds into a circle, a pigeon flies out of it, and it lands as a green tick.
async function addGo(h, btn) {
  clearTimeout(addTimer); addSeq++;                                 // (an answer still on its way is from before this)
  const msg = $(".add-msg", $layer), row = $(".addres .addrow", $layer);
  const b = row?.querySelector("[data-act=addgo]") || (btn?.classList.contains("btn") ? btn : null);
  const still = STILL.matches, wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
  if (b) { b.style.width = `${b.offsetWidth}px`; b.disabled = true; void b.offsetWidth; b.classList.add("sending"); b.style.width = ""; b.innerHTML = `<span class="flyb">${I.bird}</span>`; }
  else btn?.classList.add("pulsing");
  let r, err;
  try { [r] = await Promise.all([api("friends", { method: "POST", body: { handle: h } }), wait(700)]); } catch (e) { err = e; }
  btn?.classList.remove("pulsing");
  const ok = r && /^Request sent|joined/.test(r.message);
  if (ok) {
    keepAdd(null);
    if (b) { b.classList.remove("sending"); b.classList.add("sent"); b.innerHTML = I.check; b.setAttribute("aria-label", "Sent"); }
    haptic("success");
    const sub = row?.querySelector(".csub"); if (sub) sub.textContent = /joined/.test(r.message) ? "You’re friends now" : "Request sent";
    if (!b && row) { row.classList.remove("looking", "dim"); row.querySelector(".btn")?.remove(); }   // (sent before its answer came: it says so instead)
    if (!b) toast(esc(r.message));
    await sync();
    await wait(1200);
    // ready for the next one (unless they've started typing another already)
    const i = $("#add-h", $layer);
    if (i && i.value.trim().replace(/^@/, "").toLowerCase() === h.toLowerCase()) { i.value = ""; $(".addres", $layer)?.classList.remove("has"); }
    if (msg) { msg.className = "gfoot add-msg"; msg.textContent = "Add another, or let them scan your code."; }
    if (S.sheet?.type === "addfriend") renderSheet();
    return;
  }
  if (b) { b.classList.remove("sending"); b.disabled = false; b.textContent = "Add"; }
  if (msg) { msg.textContent = err ? err.message : r.message; msg.classList.add("bad"); }
  await sync(); if (S.sheet?.type === "addfriend") { renderSheet(); addLookup(); }
}
function onInput(e) {
  if (e.target.id === "add-h") { const m = $(".add-msg", $layer); if (m) m.classList.remove("bad"); return addLookup(); }
  if (e.target.id === "gif-q" && S.sheet?.type === "gifs") { clearTimeout(gifTimer); gifTimer = setTimeout(() => { if (S.sheet?.type !== "gifs") return; Object.assign(S.sheet, { q: e.target.value.trim(), list: [], next: 0, busy: false }); loadGifs(); }, 350); return; }
  if (e.target.id === "msearch") { S.q = e.target.value; filterLists(); }
  if (e.target.id === "fsearch") { S.fq = e.target.value; filterLists(); }
}

/* ---------- sheets ---------- */
// header: { left: {label, act}, right: {label, act} | {label, form}, strong }
// (Back to Privacy & Security, from Encryption and Passkeys: only where it's in the app, with no account page to have
// its settings: InFlite's menu has this phone's own, youMenu)
const toSecurity = () => (accountPage() ? null : { label: "Back", act: "securitysheet" });
function sheetHtml(title, body, { left, right = { label: "Done", act: "close" }, flush, plain, name } = {}) {
  const b = (x, cls) => !x ? ""
    : x.form ? `<button type="button" class="nbtn prominent ${cls}" data-act="submit" data-id="${esc(x.form)}" aria-label="${esc(x.label)}">${I.check}</button>`
    : `<button type="button" class="nbtn ${cls}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""} aria-label="${esc(x.label)}">${x.act === "close" ? I.x : I.back}</button>`;
  return `<div class="scrim" data-act="close"></div><div class="sheet${plain ? " plainbg" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title || name || "")}"><div class="grab"></div>
    <header><span class="l">${b(left, "l")}</span>${title ? `<h2 tabindex="-1">${esc(title)}</h2>` : `<h2 class="sr" tabindex="-1">${esc(name || "")}</h2>`}<span class="r">${b(right, "r")}</span></header>
    <div class="body${flush ? " flush" : ""}">${body}</div></div>`;
}
let sheetTimer = 0, sheetType = null, sheetUpAt = -1e9, sheetLater = 0, sheetPath = [], sheetOnAt = -1e9, sheetLaterFull = false;
// A sheet is still coming up (sliding in, its rows growing) for this long after it opens; the slide itself is the
// first SHEET_SLIDE_MS (styles.css: .sheet)
const SHEET_IN_MS = 1100, SHEET_SLIDE_MS = 500, SHEET_ON_MS = 420;
const sheetEntering = () => performance.now() - sheetUpAt < SHEET_IN_MS;
const gliding = new Map();            // switches mid-glide: key → { from, to, at }
const switchKey = (b) => `${b.dataset.act}:${b.dataset.id || ""}`;
// Redrawing replaces a switch, which would snap it to its end. Note where each
// one was before a redraw, then replay any glide from where it had got to.
const switchStates = (el) => new Map([...el.querySelectorAll("[role=switch]")].map((b) => [switchKey(b), b.getAttribute("aria-checked") === "true"]));
// A box that was already ticked stays still when its sheet redraws: only a new tick pops in.
const TICKED = "[aria-checked=true],[aria-pressed=true]";
const tickedKeys = (el) => new Set([...el.querySelectorAll(TICKED)].map(switchKey));
// (and one that was ticked and isn't now loses its fill gently: styles.css .unticked)
const keepTicks = (el, was) => {
  for (const b of el.querySelectorAll(TICKED)) if (was.has(switchKey(b))) b.classList.add("kept");
  for (const b of el.querySelectorAll("[aria-checked=false],[aria-pressed=false]")) if (was.has(switchKey(b))) b.classList.add("unticked");
};
function keepGlides(el, before) {
  for (const b of el.querySelectorAll("[role=switch]")) {
    const k = switchKey(b), was = before.get(k), is = b.getAttribute("aria-checked") === "true", sw = $(".switch", b);
    if (!sw || was === undefined) continue;
    const g = gliding.get(k), t = performance.now();       // frame time: unaffected by clock changes
    if (was !== is) gliding.set(k, { from: was, to: is, at: t });
    const run = was !== is ? gliding.get(k) : g && g.to === is && t - g.at < 600 ? g : null;
    if (!run || matchMedia("(prefers-reduced-motion: reduce)").matches) continue;
    // a brand-new switch has nothing for CSS to transition from, so play the
    // glide outright, picking up from wherever it had got to
    const track = (on) => { sw.classList.toggle("on", on); return getComputedStyle(sw).backgroundColor; };
    const [off, onCol] = [track(false), track(true)]; sw.classList.toggle("on", run.to);
    const timing = { duration: 500, delay: run.at - t, easing: cssVar(document.documentElement, "--snappy") || "ease-out", fill: "backwards" };
    sw.animate([{ transform: `translateX(${run.from ? 21 : 0}px)` }, { transform: `translateX(${run.to ? 21 : 0}px)` }], { ...timing, pseudoElement: "::after" });
    sw.animate([{ backgroundColor: run.from ? onCol : off }, { backgroundColor: run.to ? onCol : off }], { ...timing, duration: 300 });
  }
}
// A copy of something just left or taken away, fading where it was, kept out of everything's way: in a closed shadow
// root of its own (styled as the page is, from a copy of its rules), so nothing can find it by mistake, whether the
// app looking for what's drawn, a screen reader or a test, and nothing in it can be reached
let ghostCSS = null;
// (the page's own theme rules, :root's, apply to the copy's host instead: it carries the theme too. A host matches
// only as :host(…), so :root[data-theme="dark"] becomes :host([data-theme="dark"]))
const ghostStyles = () => ghostCSS || (ghostCSS = (() => { const c = new CSSStyleSheet(); try { c.replaceSync([...document.styleSheets].flatMap((x) => { try { return [...x.cssRules].map((r) => r.cssText); } catch (_) { return []; } }).join("\n").replace(/:root((?:\[[^\]]*\]|:not\([^)]*\))+)/g, ":host($1)").replace(/:root\b/g, ":host")); } catch (_) {} return c; })());
const canGhost = () => !STILL.matches && typeof CSSStyleSheet.prototype.replaceSync === "function" && "adoptedStyleSheets" in Document.prototype;
function ghostHost(cls, ...parts) {
  const host = document.createElement("div"); host.className = cls; host.inert = true; host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") || "light");
  const sr = host.attachShadow({ mode: "closed" }); sr.adoptedStyleSheets = [ghostStyles()]; sr.append(...parts);
  return host;
}
// Something closed while it was still coming in (or being dragged) goes away from where it is, not from fully open:
// where it's got to, read off it now, for the exit's keyframes (styles.css: down, fade-out, menu-out)
const freeze = (e) => { const cs = getComputedStyle(e), m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform); e.style.setProperty("--y0", `${m.m42}px`); e.style.setProperty("--s0", String(m.a)); e.style.setProperty("--o0", cs.opacity); };
// A sheet redrawn with what's on it changed (a switch that brings rows with it, a list arriving, a row signed out):
// each part that moved glides there from where it was, one that's new fades in, one that's gone fades out where it
// was, and a card that grew opens out. Where things were is measured on screen, so a redraw in the middle of one
// carries on from there. Each part is known by its button (or its row's), else by what it is and the heading it's under.
const FLIP_SEL = ":scope > *, :scope > :is(form, .nwrap, .addreqs, .profile-head, .wnhero) > *, :scope .group > *";
const headText = (h) => (h ? (h.firstChild?.nodeType === 3 ? h.firstChild.textContent : h.textContent).trim().slice(0, 30) : "");
function flipParts(root) {
  const n = new Map(), out = [];
  for (const el of root.querySelectorAll(FLIP_SEL)) {
    if (el.classList.contains("flipgone")) continue;
    const row = el.parentElement.classList.contains("group"), a = el.dataset.act ? el : row ? el.querySelector("[data-act]") : null;
    let k;
    if (a) k = `${a.dataset.act}|${a.dataset.id || ""}`;
    else {
      const box = row ? el.parentElement : el; let h = box.previousElementSibling;
      while (h && !h.classList.contains("ghead")) h = h.previousElementSibling;
      k = `${el.tagName}.${el.classList[0] || ""}|${headText(el.classList.contains("ghead") ? el : h)}|${row ? ($(".ctext > span", el)?.textContent || "").slice(0, 24) : ""}`;
    }
    const i = (n.get(k) || 0) + 1; n.set(k, i);
    out.push([i > 1 ? `${k}#${i}` : k, el]);
  }
  return out;
}
const flipOK = (body) => body && !body.classList.contains("flush") && !STILL.matches;
function flipRects(body) {
  const m = new Map(); if (!flipOK(body)) return m;
  for (const [k, el] of flipParts(body)) m.set(k, { el, r: el.getBoundingClientRect(), o: +getComputedStyle(el).opacity });
  return m;
}
function flipPlay(body, was) {
  if (!was?.size || !flipOK(body)) return;
  const ease = "cubic-bezier(.32,.72,0,1)", parts = flipParts(body), at = new Map(), keys = new Set(), br = body.getBoundingClientRect();
  const kept = new Map([...was.values()].map((w) => [w.el, w]));        // (a part left as it was, whatever it's called now)
  for (const [k, el] of parts) { keys.add(k); at.set(el, { k, r: el.getBoundingClientRect() }); }
  // (how far its nearest part that's moving too has moved: that part carries it the rest of the way)
  const carried = (el) => { for (let p = el.parentElement; p && p !== body; p = p.parentElement) { const c = at.get(p), w = c && (was.get(c.k) || kept.get(p)); if (w) return w.r.top - c.r.top; } return 0; };
  for (const [el, { k, r }] of at) {
    if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const w = was.get(k) || kept.get(el), busy = el.getAnimations({ subtree: true }).some((x) => x.animationName);
    if (!w) { if (!busy) el.animate([{ opacity: 0 }, { opacity: +getComputedStyle(el).opacity }], { duration: 240, delay: 60, easing: "ease", fill: "backwards" }); continue; }
    const dy = w.r.top - r.top - carried(el);
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 340, easing: ease });
    if (el.classList.contains("group") && r.height > w.r.height + 1) el.animate([{ clipPath: `inset(0 0 ${r.height - w.r.height}px 0 round 26px)` }, { clipPath: "inset(0 round 26px)" }], { duration: 340, easing: ease });
    const o = +getComputedStyle(el).opacity;
    if (!busy && Math.abs(o - w.o) > 0.05) el.animate([{ opacity: w.o }, { opacity: o }], { duration: 220, easing: "ease" });     // (dimmed or brought back: .dim)
  }
  // gone: a whole section or line fades where it was (not a row in a card, nor a word in a heading: those just go)
  for (const [k, w] of was) {
    const p = w.el.parentElement;
    if (keys.has(k) || w.el.isConnected || !w.r.height || !p?.matches(".body, form, .nwrap, .addreqs") || w.r.bottom < br.top || w.r.top > br.bottom) continue;
    if (!canGhost()) continue;
    // (in the sheet as it was, for its rules: wrappers that make no box of their own)
    const ws = document.createElement("div"), wb = document.createElement("div"); ws.className = "sheet gwrap"; wb.className = "body gwrap";
    w.el.style.margin = "0"; wb.append(w.el); ws.append(wb);
    const g = ghostHost("flipgone", ws);
    Object.assign(g.style, { left: `${w.r.left - br.left}px`, top: `${w.r.top - br.top + body.scrollTop}px`, width: `${w.r.width}px` });
    body.append(g);
    const a = g.animate([{ opacity: w.o }, { opacity: 0 }], { duration: 200, easing: "ease", fill: "forwards" });
    a.onfinish = a.oncancel = () => g.remove(); setTimeout(() => g.remove(), 400);
  }
}
// Opening springs the sheet up and settles the screen back behind it; closing
// slides it away. Redrawing an open sheet doesn't replay its entrance, and a
// switch that changed still glides across.
let shownSheet = null;
// Focus, for anyone moving through the app by keyboard or VoiceOver: a new screen starts at its title, and a sheet
// that closes hands focus back to the row or button it was opened from (or, that gone, the screen's title)
let lastTap = null, sheetFrom = null;
function focusTitle() {
  const h = $view && $(".navbar .nb-title, h1, h2", $view); if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  try { h.focus({ preventScroll: true }); } catch (_) {}
}
function focusBack(from) {
  const a = document.activeElement; if (a && a !== document.body && !$layer.contains(a)) return;     // (somewhere already)
  const sel = from && `[data-act="${CSS.escape(from.act)}"]${from.id ? `[data-id="${CSS.escape(from.id)}"]` : ""}`;
  const b = sel && ($(sel, $view) || $(sel, $tabbar));
  if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} } else focusTitle();
}
// what's under a sheet, or under a menu or question, can't be reached by Tab or Switch Control (as aria-modal says).
// (A menu opened with a tap while you're typing leaves the message box be, so the keyboard stays up under it.)
function syncInert() {
  if (!$view) return;
  const pop = !!$pop.querySelector(".menu-pop:not(.closing), .asheet:not(.closing)");
  const sheet = !!S.sheet && !!$layer.querySelector(".sheet:not(.closing), .viewer:not(.closing)");
  $view.inert = $tabbar.inert = sheet || pop;
  $compose.inert = sheet || (pop && !$compose.contains(document.activeElement));
  $layer.inert = pop;
}
// (going back to a page you came from inside a sheet: How It Flies doesn't play itself in again)
let sheetBack = false;
function renderSheet(refresh) {
  if (S.scan && S.sheet?.type !== "scan") stopScan();
  if (S.sheet && !shownSheet && !sheetFrom) sheetFrom = lastTap;
  if (!S.sheet && shownSheet) { const f = sheetFrom; sheetFrom = null; setTimeout(() => { if (!S.sheet) focusBack(f); }, 340); }
  if (S.sheet?.type !== "lookup" && (look.on || look.stream || look.camPending || look.watch != null)) lookStop();
  // the Flight Log's achievements seen: noted once you've left it (so a redraw while you're in it keeps their New tags)
  if (badgesSeen && S.sheet?.type !== "flightlog" && S.sheet?.type !== "passport") { try { localStorage.setItem("inflight-badges", JSON.stringify(badgesSeen)); } catch (_) {} badgesSeen = null; }
  // a question sheet replaced by anything else (a link, the lock, Back): it's answered "no" once this settles
  if (shownSheet !== S.sheet) { const was = shownSheet; shownSheet = S.sheet; if (S.moonReplay && S.sheet?.id !== S.moonReplay.id) S.moonReplay = null; if (was?.resolve && !was.done) setTimeout(() => was.resolve(was.type === "reauth" ? false : null), 0); }
  const open = $(".sheet, .viewer", $layer), closing = !!open?.classList.contains("closing");
  if (!S.sheet) {
    syncInert();
    root().classList.remove("sheeted"); sheetType = null;
    if (!open) { $layer.innerHTML = ""; return; }
    if (closing) return;
    // (from wherever it had got to: closed while still coming up, or while dragged, it goes from there)
    $layer.querySelectorAll(".sheet, .scrim, .viewer").forEach((e) => { freeze(e); e.classList.remove("still"); e.classList.add("closing"); });
    clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { if (!S.sheet) $layer.innerHTML = ""; }, STILL.matches ? 220 : 330);
    return;
  }
  clearTimeout(sheetTimer); clearTimeout(sheetLater);
  // (a full redraw that was waiting isn't lost to a lighter one asked for after it: an avatar arriving, say)
  if (sheetLaterFull) { refresh = undefined; sheetLaterFull = false; }
  // the same sheet redrawn while it slides up (its plan, its friends arriving): that waits until it's up, all in
  // one go. Redrawing is a long moment's work on a phone, and doing it mid-slide made the sheet judder.
  // (and the same for one just gone on to inside it: a friend's loft, say, arriving)
  const slid = performance.now() - sheetUpAt, on = performance.now() - sheetOnAt, wait = Math.max(SHEET_SLIDE_MS - slid, SHEET_ON_MS - on);
  if (open && !closing && sheetType === S.sheet.type && wait > 0) { if (!refresh) sheetLaterFull = true; sheetLater = setTimeout(() => renderSheet(refresh), wait + 20); return; }
  const had = !!open && !closing, swapped = had && sheetType !== S.sheet.type;
  const before = had ? switchStates($layer) : null, ticked = had ? tickedKeys($layer) : null;
  const old = $(".sheet", $layer);
  // opened again while the last was still closing: up from where that one had got to, over the dimming as it was
  // (not from the bottom, with the screen behind showing through for a moment)
  const sc = $(".scrim", $layer), reopen = open && closing && open.classList.contains("sheet") && !STILL.matches
    ? { y: new DOMMatrix(getComputedStyle(open).transform === "none" ? undefined : getComputedStyle(open).transform).m42, o: sc ? +getComputedStyle(sc).opacity : 0 } : null;
  // the same sheet drawn again (fresh data): it stays where you'd scrolled it, and what you're typing in (or the
  // button you'd reached by keyboard) keeps its focus, and a field its caret
  const same = had && !swapped, top = same ? $(".sheet .body", $layer)?.scrollTop || 0 : 0;
  const fa = had && $layer.contains(document.activeElement) ? document.activeElement : null;
  const fe = same && fa?.id ? fa : null, fk = same && !fe && fa?.dataset?.act ? switchKey(fa) : null;
  const caret = fe && typeof fe.selectionStart === "number" ? [fe.selectionStart, fe.selectionEnd] : null;
  // gone on to another page in the sheet: the one left is kept, to slide away under the new one (and its colour, to fade from)
  const leaving = swapped && old && !STILL.matches ? { b: $(":scope > .body", old), h: $(":scope > header", old), top: $(":scope > .body", old)?.scrollTop || 0, bg: getComputedStyle(old).backgroundColor,
    cls: [...old.classList].filter((c) => !["go-on", "go-back", "still", "closing"].includes(c)).join(" ") } : null;
  const flipWas = same ? flipRects($(".sheet .body", $layer)) : null;
  sheetBack = swapped && sheetPath.includes(S.sheet.type);
  drawSheet(refresh);
  sheetType = S.sheet?.type || null;
  const now = $(".sheet", $layer);
  if (had && now && now !== old && same && sheetEntering()) {
    // redrawn as it comes up (its plan or friends arriving): it carries on from where it had got to, rather than
    // jumping the rest of the way up, and its rows keep growing
    const late = performance.now() - sheetUpAt;
    try { for (const a of $layer.getAnimations({ subtree: true })) if (a.animationName && a.animationName !== "fc-pick") a.currentTime = late; } catch (_) {}
    keepGlides($layer, before); keepTicks($layer, ticked);
    const body = $(".sheet .body", $layer); if (top && body && !body.scrollTop) body.scrollTop = top;
  } else if (had && now && now !== old) {
    $layer.querySelectorAll(".sheet, .scrim").forEach((e) => e.classList.add("still"));
    if (swapped) {
      // the way you've come through this sheet: one you came from is "back", anything else is "on"
      const i = sheetPath.indexOf(sheetType), back = i >= 0;
      sheetPath = back ? sheetPath.slice(0, i + 1) : [...sheetPath, sheetType];
      now.classList.add(back ? "go-back" : "go-on"); $(".sheet .body", $layer)?.classList.add(back ? "go-back" : "go-on"); sheetOnAt = performance.now();
      // the page left slides the other way as it fades, under the new one, its header fading over the new header:
      // never an empty sheet (a copy of the sheet as it was, in a shadow root: styles.css .gsheet)
      if (leaving?.b && canGhost()) {
        const gs = document.createElement("div"), grab = document.createElement("div");
        gs.className = `${leaving.cls} gsheet${back ? " back" : ""}`; grab.className = "grab";
        leaving.b.classList.remove("go-on", "go-back", "enter");
        gs.append(grab, ...(leaving.h ? [leaving.h] : []), leaving.b);
        const host = ghostHost("sheetghost", gs); now.append(host); leaving.b.scrollTop = leaving.top;
        setTimeout(() => host.remove(), SHEET_ON_MS + 60);
      }
      // from a light sheet to a dark one (the map and Look Up, a trip to the Moon), or back: its colour fades across
      const bg = getComputedStyle(now).backgroundColor;
      if (leaving?.bg && leaving.bg !== bg) now.animate([{ backgroundColor: leaving.bg }, { backgroundColor: bg }], { duration: 420, easing: "cubic-bezier(.32,.72,0,1)" });
      if (fa) $("h2", now)?.focus({ preventScroll: true });       // (the new page starts at its title, as a new screen does)
    }
    keepGlides($layer, before); keepTicks($layer, ticked);
    if (same) { const body = $(".sheet .body", $layer); if (top && body && !body.scrollTop) body.scrollTop = top; }
  }
  if (same && now) {
    const back = fe ? document.getElementById(fe.id) : fk ? [...$layer.querySelectorAll(`[data-act="${CSS.escape(fa.dataset.act)}"]`)].find((x) => switchKey(x) === fk) : null;
    if (back && back !== fa && !$layer.contains(document.activeElement)) { back.focus({ preventScroll: true }); if (caret) try { back.setSelectionRange(...caret); } catch (_) {} }
    flipPlay($(".sheet .body", $layer), flipWas);
  }
  if (!had && now) {
    sheetUpAt = performance.now(); sheetPath = [sheetType];
    if (reopen) { now.style.setProperty("--y1", `${reopen.y}px`); $(".scrim", $layer)?.style.setProperty("--o1", String(reopen.o)); }
    // (ready before a page is gone on to: built when there's nothing else to do, or, without that, once it's up)
    if (!ghostCSS && canGhost()) window.requestIdleCallback ? requestIdleCallback(() => ghostStyles(), { timeout: 2000 }) : setTimeout(() => ghostStyles(), SHEET_SLIDE_MS + 200);
  }
  root().classList.toggle("sheeted", !!$(".sheet", $layer)); syncInert();
  // a sheet that has just come up: a screen reader starts in it (not on the screen behind), unless a field has already taken focus
  if (!had && now && !now.contains(document.activeElement)) setTimeout(() => { if ($layer.contains(now) && !now.classList.contains("closing") && !now.contains(document.activeElement)) $("h2", now)?.focus({ preventScroll: true }); }, SHEET_SLIDE_MS);
}
function drawSheet(refresh) {
  const s = S.sheet;
  if (refresh && s?.type !== "profile") return;
  if (!s) { $layer.innerHTML = ""; return; }
  const f = s.id ? friend(s.id) : null;
  switch (s.type) {
    case "lookup": return drawLook(s);
    case "map": {
      const mm = s.id === "skies" || s.id === "preview" ? null : (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
      if (mm && moonOf(mm)) return drawMoonFlight(s, mm);
      if (!$(".map", $layer)) $layer.innerHTML = sheetHtml(s.id === "skies" ? "The Skies" : s.id === "preview" ? "The Way" : ((m) => m?.flock ? (m.flying ? "Pigeons in Flight" : "The Flights") : m && !m.flying ? "The Flight" : "Pigeon in Flight")((S.msgs.get(S.chat) || []).find((x) => x.id === s.id)), `<canvas class="map" role="img" aria-label="Map of the pigeon’s route. Drag to move, pinch to zoom."></canvas>
        <div class="mapctl glass"><button type="button" data-act="mapzoom" data-id="in" aria-label="Zoom in">${I.plus}</button><button type="button" data-act="mapzoom" data-id="out" aria-label="Zoom out">${I.minus}</button><button type="button" class="fitbtn" data-act="mapzoom" data-id="fit" aria-label="Show the whole route">${I.loc}</button><button type="button" class="globebtn" data-act="mapglobe" aria-pressed="false" aria-label="Globe or flat map">${I.globe}</button><button type="button" class="layerbtn" data-act="maplayers" aria-pressed="${windOn()}" aria-label="Wind map">${I.layers}</button></div>
        <div class="windtip" hidden></div><div class="birdtip glass" hidden></div>
        <div class="mapcard"></div>`, { flush: true, ...(s.id === "preview" ? { left: { label: "Back", act: "flysheet" } } : {}) });
      if (!$(".map", $layer)._g) { $(".map", $layer)._g = 1; mapGestures($(".map", $layer)); }
      if (!$(".mapcard", $layer)._g) { $(".mapcard", $layer)._g = 1; fcDrag($(".mapcard", $layer)); }
      return tickMap();
    }
    case "shareflight": {
      if ($(".shpick", $layer)) return;                            // already up: its pictures and switch update in place
      const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), mine = m?.from === S.me.id;
      $layer.innerHTML = sheetHtml("Share Flight", `
        <div class="shpick" role="radiogroup" aria-label="Picture">${SHARE_FMTS.map(([f, label, sub]) => `<button type="button" class="shopt ${f}" role="radio" aria-checked="${s.fmt === f}" data-act="sharefmt" data-id="${f}" aria-label="${label}: ${sub}">
          <span class="shimg">${s.urls[f] ? `<img src="${s.urls[f]}" alt="">` : `<span class="shwait" aria-hidden="true">${I.bird}</span>`}</span>
          <span class="shl"><b>${label}</b><small>${sub}</small></span></button>`).join("")}</div>
        <div class="group">${toggleCell({ act: "sharename", icon: I.person, tile: "blue", label: "Show My Name", sub: esc(`“${mine ? "Sent" : "Received"} by ${first(S.me.name)}”`), on: s.name })}</div>
        <div class="gfoot">Only the two places, the day and the flight go on the picture: never the message, and never your friend’s name.</div>
        <div class="sharego"><button type="button" class="btn wide" data-act="shareimg"${s.urls[s.fmt] ? "" : " disabled"}>${I.share}${canShareFiles() ? "Share" : "Save Image"}</button></div>`,
        { left: { label: "Back to the map", act: "shareback" } });
      return;
    }
    case "news":
      $layer.innerHTML = sheetHtml("Friends’ News", S.news?.length ? `<div class="group mt-s news">${S.news.map(newsRow).join("")}</div>
        <div class="gfoot">The last two weeks of your friends’ pigeons: new countries, postmarks, ranks, streaks and more. Never what anyone wrote, or where anyone is.</div>`
        : `<p class="empty"><b>No news yet</b>When your friends’ pigeons reach somewhere new, rise a rank or keep a streak going, it’ll show here.</p>`);
      return;
    case "feathers": {
      const w = s.data;
      if (!w) { $layer.innerHTML = sheetHtml("Coots", s.err ? loadFail(s.err, "feathers") : `<p class="empty">Counting your Coots Coins…</p>`); return; }
      const named = S.birds.length > 0;
      const item = (x) => `<div class="cell has-icon shopi${x.owned ? " owned" : ""}"><span class="tile emo" aria-hidden="true">${x.emoji}</span>
        <span class="ctext"><span>${esc(x.name)}</span><span class="csub">${x.owned ? (x.on ? `On ${esc(x.on.name)}` : "Yours") : `${x.price} Coots Coins`}</span></span>
        ${x.owned ? (named ? `<button type="button" class="btn small plain" data-act="wearitem" data-id="${esc(x.id)}">${x.on ? "Move" : "Put On"}</button>` : "")
          : `<button type="button" class="btn small" data-act="buyitem" data-id="${esc(x.id)}"${w.feathers >= x.price ? "" : " disabled"} aria-label="Buy for ${x.price} Coots Coins">${I.coin}${x.price}</button>`}</div>`;
      $layer.innerHTML = sheetHtml("Coots", `<div class="fhead"><span class="fico">${I.coin}</span><b>${w.feathers.toLocaleString("en-GB")}</b><span>Coots Coin${w.feathers === 1 ? "" : "s"}</span></div>
        <div class="ghead">Shop</div><div class="group">${w.items.map(item).join("")}</div>
        <div class="gfoot">${named ? "Accessories go on your named pigeons, and everyone they fly to sees them." : "Accessories go on your named pigeons. Name one in Your Pigeons first."}</div>
        <div class="ghead">How to Earn Them</div>
        <div class="group">${cell({ icon: I.bird, tile: "orange", label: "A pigeon of yours lands", val: "1–6", sub: "One more for every 250 miles" })}
          ${cell({ icon: I.globe, tile: "blue", label: "A new country or sea", val: "3", sub: "In your passport" })}
          ${cell({ icon: I.pin, tile: "red", label: "A new postmark", val: "10", sub: "Flying past somewhere famous" })}
          ${cell({ icon: I.flame, tile: "orange", label: "A streak reaches 7, 30 or 100 days", val: "10–100", sub: "For you both" })}</div>
        ${w.recent.length ? `<div class="ghead">Lately</div><div class="group">${w.recent.map((r) => `<div class="cell"><span class="ctext"><span>${esc(r.why)}</span><span class="csub">${esc(agoText(r.at))}</span></span><span class="val fdelta${r.n < 0 ? " spent" : ""}">${r.n > 0 ? "+" : "−"}${Math.abs(r.n)}</span></div>`).join("")}</div>` : ""}`);
      return;
    }
    case "birds": {
      const sub = (b) => `${esc(b.rank)} · ${fmtMiles(b.km)} · ${birdState(b)}`;
      const row = (b, hall) => `<button type="button" class="cell has-icon" data-act="bird" data-id="${esc(b.id)}"><span class="tile wtile ${b.lostAt ? "gray" : RANK_TILE[b.rank]}">${b.lostAt ? I.skull : I.bird}${hall ? "" : wearOn(b.wear)}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub">${!hall ? sub(b) : b.lostAt ? `Lost${b.lostPlace ? ` over ${esc(b.lostPlace)}` : ""} · ${fmtDate(b.lostAt)}` : `${esc(b.rank)} · ${fmtMiles(b.km)} · retired ${fmtDate(b.retiredAt)}`}</span></span>${chevSm}</button>`;
      const ranks = RANKS.slice(1).map(([r, km]) => `${r} at ${fmtMiles(km)}`).join(", ");
      $layer.innerHTML = sheetHtml("Your Pigeons", (S.birds.length
        ? `<div class="group mt-s">${S.birds.map((b) => row(b)).join("")}${S.birds.length < BIRDS_MAX ? cell({ act: "birdnew", icon: I.plus, tile: "green", label: "Name a New Pigeon", cls: "action" }) : ""}</div>
          <div class="gfoot">They take turns carrying what you send, and rest between flights. Miles bring rank: ${ranks}, once around the world.</div>`
        : `<div class="birdempty">${I.bird}<b>Name your pigeons</b><span>Give up to ${BIRDS_MAX} of your pigeons names. They take turns carrying what you send, gain miles and stamina, rise from Fledgling to Legend, and retire to your Hall of Fame.</span><button type="button" class="btn" data-act="birdnew">Name a Pigeon</button></div>`)
        + (S.hall.length ? `<div class="ghead">Hall of Fame</div><div class="group">${S.hall.map((b) => row(b, true)).join("")}</div>` : ""));
      return;
    }
    case "bird": {
      const b = [...S.birds, ...S.hall].find((x) => x.id === s.id); if (!b) { S.sheet = { type: "birds" }; return renderSheet(); }
      const active = !b.lostAt && !b.retiredAt, from = RANKS.find((r) => r[0] === b.rank)[1], rest = Math.round((0.5 - (0.4 * b.stamina) / 100) * 100), again = !!$(".sheet .bbar", $layer);
      const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head"><span class="birdbig tile wtile ${b.lostAt ? "gray" : RANK_TILE[b.rank]}">${I.bird}${active ? wearOn(b.wear) : ""}</span><span class="name">${esc(b.name)}</span>
          <span class="sub">${esc(b.rank)}${active ? ` · ${birdState(b)}` : b.lostAt ? " · Lost" : " · Retired"}</span></div>
        <div class="bstats">${stat(fmtMiles(b.km), "Flown")}${stat(b.flights, b.flights === 1 ? "Flight" : "Flights")}${stat(fmtMiles(b.longest), "Longest")}${stat(b.stamina, "Stamina")}</div>
        ${active && b.next ? `<div class="group"><div class="cell brank"><span class="ctext"><span>Next: ${esc(b.next.rank)}</span><span class="csub">${fmtMiles(b.next.km - b.km)} to go</span><i class="bbar" aria-hidden="true"><b></b></i></span></div></div>` : ""}
        <div class="gfoot">${b.lostAt ? `Lost${b.lostPlace ? ` over ${esc(b.lostPlace)}` : ""} on ${fmtDate(b.lostAt)}, to Pigeon Death.` : b.retiredAt ? `Retired to your Hall of Fame on ${fmtDate(b.retiredAt)}.`
          : `Stamina ${b.stamina}: after a flight it rests about ${rest}% as long as it flew. Stamina grows with every mile.`}</div>
        ${active ? `<div class="group mt">${cell({ act: "wearpick", id: b.id, icon: I.feather, tile: "yellow", label: "Wearing", val: b.wear && WEAR[b.wear] ? `${WEAR[b.wear][1]} ${esc(WEAR[b.wear][0])}` : "Nothing", chev: true })}</div>` : ""}
        ${active ? `<div class="group mt">${cell({ act: "birdrename", id: b.id, label: "Rename", cls: "action" })}${b.rank === "Legend" ? cell({ act: "birdretire", id: b.id, label: "Retire to the Hall of Fame", cls: "action" }) : ""}</div>
          ${b.rank === "Legend" ? `<div class="gfoot">${esc(b.name)} has flown once around the world. Retire it to your Hall of Fame to make room for a new pigeon.</div>` : ""}` : ""}`,
        { left: { label: "Back", act: "birds" }, name: b.name });
      // (its rank bar fills as the page opens; drawn again, it's just there)
      const bar = $(".bbar b", $layer), fill = () => { bar.style.width = `${(Math.max(0, Math.min(1, (b.km - from) / (b.next.km - from))) * 100).toFixed(1)}%`; };
      if (bar && b.next) again ? fill() : requestAnimationFrame(() => requestAnimationFrame(fill));
      return;
    }
    case "birdname": {
      if ($("#f-bname", $layer)) return;
      const b = s.id ? S.birds.find((x) => x.id === s.id) : null;
      $layer.innerHTML = sheetHtml(b ? "Rename" : "Name a Pigeon", `<form id="bname-form" data-form="birdname" novalidate>
          <div class="group mt-s"><label class="fcell"><input id="f-bname" name="name" placeholder="${b ? "New name" : "Biscuit, Captain, Pip…"}" maxlength="20" autocomplete="off" autocapitalize="words" aria-label="Pigeon name"></label></div>
          <div class="gfoot">${b ? "Its career stays as it is." : "It starts as a Fledgling."} Everyone it flies to sees its name.</div>${ferr}</form>`,
        { left: { label: "Back", act: "birdback" }, right: { label: b ? "Save" : "Add", form: "bname-form" } });
      if (b) $("#f-bname", $layer).value = b.name;
      return;
    }
    case "safety": {
      // Verify in person: who they are and where you stand at the top, then the two ways to check (scan each
      // other's code, or read out the digits), and a moment of celebration when they match
      const f = personById(s.id);
      if (!f) { S.sheet = null; return renderSheet(); }       // (they've gone: not a friend or in a group with you any more)
      const nm = esc(first(f.name || "your friend")), st = safeState(f), won = s.won && performance.now() - s.won < 1600;
      const say = { ok: `<span class="verified">${I.check}Verified in person</span>`, warn: `<span class="safesay">${I.warn}Their key changed</span>`, none: `<span class="safesay">Not verified yet</span>` }[st];
      const digits = `<div class="group safedig"><div class="digits">${(s.digits || []).map((d) => `<span>${d}</span>`).join("")}</div>
        <button type="button" class="safecopy" data-act="safecopy">Copy</button></div>`;
      $layer.innerHTML = sheetHtml("Safety Number", `
        <div class="profile-head safehero s-${st}${won ? " won" : ""}"><span class="safering">${avatar(f, "l")}<span class="safebadge" aria-hidden="true">${st === "warn" ? I.warn : st === "ok" ? I.check : I.shield}</span>
          ${won ? `<svg class="safewin" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"/></svg>` : ""}</span>
          <span class="name">${esc(first(f?.name || ""))}</span>${say}</div>
        ${f?.keyChanged ? `<div class="warn sheetwarn"><span>${wasVerified(f) ? `You verified ${nm} in person, and their key has changed since. Don’t trust it until you’ve verified again, together.` : `${esc(first(f.name))}’s key changed. Only trust it once these digits match on both phones.`}</span></div>
          ${digits}<div class="group mt">${cell({ act: "trustsafe", id: f.id, label: "They Match: Trust New Key", cls: "center action" })}</div>`
        : st === "ok" ? `<div class="safedone"><span class="tile green" aria-hidden="true">${I.check}</span><span class="wnt"><b>You checked together</b><small>Your safety numbers matched, so only you and ${nm} can read your messages. If ${nm}’s key ever changes, you’ll be told.</small></span></div>
          <div class="ghead">Your Safety Number</div>${digits}
          <div class="group mt">${cell({ act: "unverify", id: f.id, label: "Clear Verification", cls: "center destructive" })}</div>`
        : `<div class="safecard"><div class="safestep"><span class="stepn">1</span><span class="wnt"><b>Scan each other’s code</b><small>Hold your phones up together, or on a video call.</small></span></div>
            <div class="safeqr"><div class="qrbox">${qrSvg(safetyCode(s.digits), { title: `Your safety number with ${nm}, as a QR code` })}</div></div>
            <button type="button" class="btn wide" data-act="scansafe" data-id="${esc(f.id)}">${I.camera}Scan ${nm}’s Code</button></div>
          <div class="safestep out"><span class="stepn">2</span><span class="wnt"><b>Or compare these 60 digits</b><small>Read them out to each other. They’re the same on both phones.</small></span></div>
          ${digits}
          <div class="group mt">${cell({ act: "verifyok", id: f.id, icon: I.check, tile: "green", label: "Mark as Verified", sub: "The 60 digits match on both phones" })}</div>
          <div class="gfoot">If they match, only the two of you can read your messages. Not even the server could swap in a different key.</div>`}`,
        { left: s.from ? { label: "Back", act: s.from, id: s.backId } : null });
      return;
    }
    case "scan": {
      const p = s.any ? null : personById(s.id), who = s.any ? "your friend" : first(p?.name || "your friend");
      if (!s.bad && S.scan?.on && S.scan.sheet === s && $(".scanbox video", $layer)) return;   // already scanning: a redraw leaves the camera be
      $layer.innerHTML = sheetHtml("Scan Their Code", `<div class="scanbox"><video playsinline muted autoplay aria-label="Camera"></video><span class="scanframe" aria-hidden="true"></span></div>
        <p class="gfoot scanmsg" aria-live="polite">${s.bad ? (s.any ? "That code isn’t your safety number with any of your friends. On their phone, they open Safety Number from your name." : `This isn’t the same safety number. Don’t trust this chat with ${esc(who)} until your codes match.`) : `Point your camera at ${esc(who)}’s code: ${s.any ? "Safety Number, from your name, on their phone" : "Safety Number on their phone"}.`}</p>
        ${s.bad ? `<div class="group mt">${cell({ act: s.any ? "scanany" : "scansafe", id: s.id, label: "Try Again", cls: "center action" })}</div>` : ""}`, { left: { label: "Back", act: "scanback" } });
      if (!s.bad) startScan(p, s.any ? s.codes : safetyCode(s.back?.digits));
      return;
    }
    case "security": {
      // The settings, grouped (a password and passkeys are the account's: Your Account opens its page)
      const u = S.me, lock = !!lockPrefs();
      const unlockBy = isIOS() ? "Face ID or Touch ID" : /Android/.test(navigator.userAgent) ? "your fingerprint or face" : "your passkey";
      $layer.innerHTML = sheetHtml("Privacy & Security", `
        <div class="ghead">Account</div>
        <div class="group">
          ${cell({ act: u.emailOk === false && S.emailOn ? "confirmsend" : null, icon: I.mail, tile: "blue", label: "Email", val: esc(u.email), sub: u.emailOk === false ? `<span class="warnc">Not confirmed${S.emailOn ? " · tap to send the link again" : ""}</span>` : "" })}
          ${accountPage() ? `<button type="button" class="cell has-icon" id="to-account" data-act="accountopen"><span class="tile indigo">${I.person}</span><span class="ctext"><span>Your Account</span><span class="csub">Password, passkeys and devices, for every app on the site</span></span>${chevSm}</button>` : ""}
        </div>
        <div class="ghead">Encryption</div>
        <div class="group">
          ${encCell(true)}
        </div>
        <div class="ghead">This Phone</div>
        <div class="group">
          ${passkeysSupported() ? toggleCell({ act: "applock", icon: I.face, tile: "green", label: "Lock Chat", sub: lock ? "Hides your chats in the app switcher too" : S.passkeys.length ? `Ready · ${unlockBy[0].toUpperCase()}${unlockBy.slice(1).replace(/^Your /, "")}` : `Unlock with ${unlockBy}`, on: lock }) : ""}
          ${lock ? `<label class="cell"><span class="ctext"><span>Lock</span></span><span class="val">${LOCK_AFTER.find(([ms]) => ms === (lockPrefs().after || 0))?.[1] || "Immediately"}</span>${chevSm}
            <select class="overlay" data-act="lockafter" aria-label="When to lock">${LOCK_AFTER.map(([ms, l]) => `<option value="${ms}"${ms === (lockPrefs().after || 0) ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
          ${cell({ act: "sessionssheet", icon: I.phone, tile: "blue", label: "Signed-In Phones", val: S.sessN || null, chev: true })}
        </div>
        <div class="ghead">Who Sees What</div>
        <div class="group">
          ${toggleCell({ act: "privacy", id: "showOnline", icon: I.clock, tile: "green", label: "Show When I’m Online", on: u.showOnline !== false })}
          ${toggleCell({ act: "privacy", id: "receipts", icon: I.check, tile: "blue", label: "Read Receipts", on: u.receipts !== false })}
          ${toggleCell({ act: "privacy", id: "shareNews", icon: I.people, tile: "teal", label: "Share My News", sub: "Ranks, streaks, new countries", on: u.shareNews !== false })}
          ${toggleCell({ act: "privacy", id: "approxLocation", icon: I.loc, tile: "blue", label: "Approximate Location", sub: "About 10 km, not exact", on: !!u.approxLocation })}
          ${toggleCell({ act: "privacy", id: "shareTracker", icon: I.globe, tile: "indigo", label: "Live Tracker", sub: "On the public map, no names", on: u.shareTracker !== false })}
          ${cell({ act: "blockedsheet", icon: I.block, tile: "red", label: "Blocked", val: S.blocked.length || "None", chev: true })}
        </div>
        <div class="gfoot">Online, read receipts and news work both ways: turn one off and you won’t see other people’s either.</div>
        <details class="learn"><summary>How the live tracker works</summary><p>The tracker (chat.inflite.ai/tracker, on a computer) shows pigeons in the air as rough dots: never a name, a message, a route, or anywhere near where one set off, stops or lands. A pigeon shows only if both you and your friend leave this on.</p></details>`);
      const vb = $(".vbar b", $layer); if (vb) vb.style.width = `${vb.dataset.w}%`;     // (set here: the page allows no inline styles)
      return;
    }
    case "encryption": {
      // Your key, as the pattern you'd know and its digits; a way straight to verifying a friend (scan their code, and
      // whichever friend it is is found); and where you stand with each one, a tap from their safety number. What it
      // all means is folded away at the foot.
      const st = (f) => safeState(f), order = { warn: 0, none: 1, ok: 2 };
      const fr = [...S.friends].sort((a, b) => order[st(a)] - order[st(b)] || a.name.localeCompare(b.name)), ver = fr.filter((f) => st(f) === "ok").length;
      const pill = { ok: `<span class="spill ok">${I.check}Verified</span>`, warn: `<span class="spill bad">${I.warn}Key changed</span>`, none: `<span class="spill">Not checked</span>` };
      const fp = S.fp.split(" ");
      $layer.innerHTML = sheetHtml("Encryption", `
        <div class="wnhero keyhero">${keyArt(S.fp, "keyhuge")}<h2>Sealed with your key</h2><p class="mono">${fp.slice(0, 4).join(" ")}<br>${fp.slice(4).join(" ")}</p>
          <button type="button" class="btn small plain" data-act="copyfp">Copy</button></div>
        ${fr.length ? `<div class="group">${cell({ act: "scanany", icon: I.qr, tile: "blue", label: "Verify a Friend", cls: "action" })}</div>
          <div class="ghead">Friends <span class="gcount">${ver} of ${fr.length} verified</span></div>
          <div class="group">${fr.map((x) => `<button type="button" class="cell" data-act="safety" data-id="${esc(x.id)}" data-from="encryptionsheet">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span></span>${pill[st(x)]}${chevSm}</button>`).join("")}</div>`
        : `<p class="empty"><b>No friends yet</b>Once you add a friend, you can check your safety number with them here.</p>`}
        <details class="learn"><summary>How it works</summary><p>Only you and the people you write to can read your pigeons: not Chat, and no one in between. Your key is made on this phone; a locked copy lets you sign in on a new one, and only your password or passkey opens it. Every pigeon (its words, photos, voice and reactions) is sealed before it flies, so the server only carries sealed scrolls it can’t open. Your safety number with a friend is your two keys together: the same on both phones, and no one could have swapped in a different key. Your key changes only if you reset your password without a passkey, or make a new account, and your friends are told if it does.</p></details>`, { left: toSecurity() });
      return;
    }
    case "safetylist":
      $layer.innerHTML = sheetHtml("Safety Numbers", S.friends.length
        ? `<div class="ghead">Choose a friend</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="safety" data-id="${esc(x.id)}" data-from="safetylist">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span></span>${chevSm}</button>`).join("")}</div>
          <div class="gfoot">Each friend has a safety number you can compare to check your messages are private.</div>`
        : `<p class="empty"><b>No friends yet</b>Safety numbers appear once you add a friend.</p>`,
        { left: { label: "Back", act: "encryptionsheet" } });
      return;
    case "newmsg":
      $layer.innerHTML = sheetHtml("New Message", S.friends.length
        ? `<div class="group mt-s">${cell({ act: "newgroup", icon: I.people, tile: "green", label: "New Group", cls: "action" })}</div>
          ${S.groups.length ? `<div class="ghead">Groups</div><div class="group">${S.groups.map((g) => `<button class="cell" data-act="open" data-id="${esc(g.id)}">${gavatar(g, "s")}<span class="ctext"><span class="one">${esc(g.name)}</span><span class="csub one">${g.members.length} people</span></span>${chevSm}</button>`).join("")}</div>` : ""}
          <div class="ghead">To</div><div class="group">${S.friends.map((x) => `<button class="cell" data-act="open" data-id="${esc(x.id)}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span><span class="csub one">${esc(x.place || "No location")}${S.me.lat != null && x.lat != null ? ` · ${fmtDur(flightMs(haversineKm(S.me.lat, S.me.lon, x.lat, x.lon)))} by pigeon` : ""}</span></span>${chevSm}</button>`).join("")}</div>`
        : `<p class="empty"><b>No friends yet</b>Add a friend first.<br><button class="btn" data-act="addfriend">Add a Friend</button></p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    case "newgroup": case "groupadd": {
      // pick friends with a tick; a new group also gets a name
      const g = s.type === "groupadd" ? group(s.id) : null;
      const pool = S.friends.filter((x) => !g || !member(g, x.id)).sort((a, b) => a.name.localeCompare(b.name));
      const name = $("#f-gname", $layer)?.value ?? s.name ?? "";
      const old = $(".sheet .body", $layer), top = old ? old.scrollTop : 0, hadGo = !!$(".sheet > header [data-act=submit]", $layer);
      const rows = pool.map((x) => `<button type="button" class="cell pickrow" role="checkbox" aria-checked="${s.pick.has(x.id)}" data-act="gpick" data-id="${esc(x.id)}">${avatar(x, "s")}<span class="ctext"><span class="one">${esc(first(x.name))}</span><span class="csub one">${esc(x.place || "No location")}</span></span><span class="tickbox" aria-hidden="true">${I.check}</span></button>`).join("");
      const n = s.pick.size + (g ? g.members.length : 1);
      $layer.innerHTML = sheetHtml(g ? "Add People" : "New Group", `<form id="group-form" data-form="${g ? "groupadd" : "newgroup"}" novalidate>
          ${g ? "" : `<div class="group mt-s"><label class="fcell"><input id="f-gname" name="name" placeholder="Group name" maxlength="40" autocomplete="off" aria-label="Group name"></label></div>`}
          ${pool.length ? `<div class="ghead">${g ? "Your friends" : "Who’s in it"}</div><div class="group">${rows}</div>
            <div class="gfoot">${n > GROUP_MAX ? `Groups can have up to ${GROUP_MAX} people.` : `${n} ${n === 1 ? "person" : "people"}, including you. Everyone gets their own pigeon, flying the real distance to them. People in a group see each other’s names, but only friends see where each other are.`}</div>`
            : `<p class="empty"><b>${g ? "Everyone’s already here" : "No friends yet"}</b>${g ? "All your friends are in this group." : "Add a friend first."}</p>`}
          ${ferr}</form>`,
        { left: g ? { label: "Back", act: "groupinfo" } : { label: "Cancel", act: "close" }, right: s.pick.size && n <= GROUP_MAX ? { label: g ? "Add" : "Create", form: "group-form" } : null });
      if ($("#f-gname", $layer)) $("#f-gname", $layer).value = name;
      if (top) $(".sheet .body", $layer).scrollTop = top;
      if (old && !hadGo) $(".sheet > header [data-act=submit]", $layer)?.classList.add("popin");     // (the ✓ pops in with the first one picked)
      return;
    }
    case "groupinfo": {
      const g = group(s.id); if (!g) { S.sheet = null; return renderSheet(); }
      const me = { ...S.me, id: S.me.id };
      const row = (p) => {
        const you = p.id === S.me.id, km = you ? null : memberKm(p);
        const sub = you ? "You" : p.friend ? `${esc(p.place || "No location")}${km != null ? ` · ${fmtDur(flightMs(km))} by pigeon` : ""}` : `Friend of ${esc(first(member(g, p.addedBy)?.name || "a member"))} · ${fmtDur(flightMs(km))} by pigeon`;
        // tap anyone for their safety number (friends of friends too)
        return you ? `<div class="cell">${avatar(me, "s")}<span class="ctext"><span class="one">${esc(first(p.name))}</span><span class="csub one">${sub}</span></span></div>`
          : `<button type="button" class="cell" data-act="safety" data-id="${esc(p.id)}" data-from="groupinfo" aria-label="${esc(first(p.name))}: safety number">${avatar(p, "s", p.friend)}<span class="ctext"><span class="one">${esc(first(p.name))}</span><span class="csub one">${p.keyChanged ? `<span class="keyw">${I.warn} Security key changed</span>` : sub}</span></span>${chevSm}</button>`;
      };
      const list = [S.me.id, ...others(g).sort((a, b) => memberKm(a) - memberKm(b)).map((p) => p.id)].map((id) => id === S.me.id ? { id, name: S.me.name } : member(g, id));
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${gavatar(g, "xl")}<span class="name">${esc(g.name)}</span><span class="sub">${g.members.length} people</span></div>
        <div class="ghead">People</div><div class="group">${list.map(row).join("")}
          ${g.members.length < GROUP_MAX ? cell({ act: "groupadd", id: g.id, icon: I.addp, tile: "green", label: "Add People", cls: "action" }) : ""}</div>
        <div class="gfoot">Only friends see where each other are. Anyone in the group can add their own friends. Tap someone for their safety number.</div>
        <div class="group mt">
          ${toggleCell({ act: "gmute", id: g.id, icon: I.moon, tile: "indigo", label: "Mute Notifications", sub: g.muted ? "No notifications or emails from this group" : "", on: g.muted })}
          ${cell({ act: "grouprename", id: g.id, icon: I.compose, tile: "gray", label: "Group Name", val: esc(g.name), chev: true })}
          ${cell({ act: "vanishask", id: g.id, icon: I.clock, tile: "indigo", label: "Disappearing Messages", val: g.vanish ? vanishSay(g.vanish.ms).replace(/^./, (c) => c.toUpperCase()) : "Off", chev: true })}
        </div>
        <div class="gfoot">${KEEP_SAY}</div>
        <div class="group mt">${cell({ act: "groupleaveask", id: g.id, label: "Leave Group", cls: "center destructive" })}</div>`, { name: `${g.name}: group info` });
      return;
    }
    case "gifs": {
      // built once; searching and loading more only touch the grid
      if (!$("#gif-q", $layer)) {
        $layer.innerHTML = sheetHtml("GIFs", `<label class="search gifsearch">${I.search}<input type="search" id="gif-q" placeholder="Search GIPHY" autocomplete="off" enterkeyhint="search" aria-label="Search GIFs"></label>
          <div class="gifgrid" role="group" aria-label="GIFs"></div><p class="giphy">Powered by GIPHY. Searches go through Chat, so GIPHY doesn’t see who’s looking. What you send is end-to-end encrypted.</p>`,
          { left: { label: "Cancel", act: "close" }, right: null });
        $("#gif-q", $layer).value = s.q || "";
      }
      drawGifs();
      return;
    }
    case "flightlog": {
      const d = s.data;
      if (!d) { $layer.innerHTML = sheetHtml("Flight Log", `<p class="empty">Opening your flight log…</p>`); return; }
      const mi = d.km * 0.621371, lap = mi / 24901, hrs = d.hours;
      const tile = (val, label, sub = "") => `<div class="lstat"><b>${val}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
      const n = (x) => Math.round(x).toLocaleString("en-GB");
      const kinds = [...KINDS.map(([k]) => k), "dumb"].filter((k) => d.kinds[k]);
      const most = Math.max(1, ...kinds.map((k) => d.kinds[k]));
      $layer.innerHTML = sheetHtml("Flight Log", d.sent ? `
        <div class="loghero"><div class="globe" data-lap="${Math.min(1, lap % 1 || (lap >= 1 ? 1 : 0)).toFixed(3)}"><span>${lap >= 1 ? `${Math.floor(lap)}×` : `${Math.round(lap * 100)}%`}</span></div>
          <div class="ltext"><b>${n(mi)} mi</b><span>flown by your pigeons</span><small>${lap >= 1 ? `That’s ${lap.toFixed(1)} times around the world.` : `${Math.round(lap * 100)}% of the way around the world.`}</small></div></div>
        <div class="lstats">
          ${tile(n(d.sent), "Pigeons sent", d.flying ? `${d.flying} in the air now` : "")}
          ${tile(n(d.received), "Pigeons received")}
          ${tile(hrs >= 48 ? `${n(hrs / 24)} days` : `${n(hrs)} h`, "In the air", "landed pigeons, end to end")}
          ${tile(d.longest ? `${n(d.longest.km * 0.621371)} mi` : "–", "Longest flight", d.longest?.place ? `to ${esc(d.longest.place)}` : "")}
          ${tile(d.fastest ? `${n(d.fastest.kmh * 0.621371)} mph` : "–", "Fastest pigeon", d.fastest ? `a ${esc(KIND[d.fastest.kind]?.name.toLowerCase() || "")} pigeon` : "")}
          ${tile(d.tailwind ? `${n(d.tailwind * 0.621371)} mph` : "–", "Best tailwind")}
          ${tile(n(d.dodged || 0), "Storms dodged", "went around them")}
          ${tile(d.sheltered >= 1 ? `${n(d.sheltered)} h` : d.sheltered ? `${n(d.sheltered * 60)} min` : "–", "Sheltered", d.early ? `best wind: ${esc(fmtDur(d.early))} early` : "from storms")}
        </div>
        ${passportHtml(d.passport)}
        ${postmarksHtml(d.postmarks)}
        ${badgesHtml(d.badges || [])}
        ${skinsHtml(d.skins || [], S.me.skin)}
        ${kinds.length ? `<div class="ghead">By pigeon</div><div class="group">${kinds.map((k) => `<div class="cell has-icon kindrow"><span class="tile ${k === "dumb" ? "gray" : k}">${I.bird}</span><span class="ctext"><span>${KIND[k].name}</span><i class="kbar ${k}" data-w="${(d.kinds[k] / most).toFixed(3)}"></i></span><span class="val">${n(d.kinds[k])}</span></div>`).join("")}</div>` : ""}
        <div class="group mt">${cell({ icon: I.skull, tile: "red", label: "Lost to Pigeon Death", val: n(d.lost) })}${cell({ icon: I.homing, tile: "blue", label: "Called back", val: n(d.recalled) })}</div>
        <div class="gfoot">Since ${fmtDate(d.since)}. Worked out from distances and times only: what you wrote stays between you and your friends.</div>`
        : `<p class="empty"><b>No flights yet</b>Send your first pigeon and its miles start here.</p>${(d.skins || []).some((k) => k.season) ? skinsHtml(d.skins, S.me.skin) : ""}`);
      // sizes set from code (inline style attributes are blocked)
      $layer.querySelectorAll("[data-lap]").forEach((el) => el.style.setProperty("--lap", el.dataset.lap));
      $layer.querySelectorAll(".kbar[data-w], .bprog[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w));
      return;
    }
    case "vianote": {
      if ($("#f-vianote", $layer)) return;
      const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), to = m && friend(m.finalTo);
      $layer.innerHTML = sheetHtml("Add a Line", `<form id="vianote-form" data-form="vianote" novalidate>
        <div class="group mt-s"><label class="fcell"><textarea id="f-vianote" rows="3" maxlength="200" placeholder="Say something to ${esc(first(to?.name || "them"))}" aria-label="Your line"></textarea></label></div>
        <div class="gfoot">It flies on with the pigeon, end-to-end encrypted: only ${esc(first(to?.name || "they"))} can read it, when it lands. You can add one line.</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Add", form: "vianote-form" } });
      return;
    }
    case "passport": {
      const d = s.data, left = s.back ? { label: "Back", act: "flightlogback" } : undefined;
      if (!d || !SHAPES) { $layer.innerHTML = sheetHtml("Passport", `<p class="empty">Opening your passport…</p>`, { left }); return; }
      if (s.drawn === d && $(".ppbook", $layer)) return ppFill($(".ppbook", $layer), d);          // (already open: just the pages near the one you're on)
      s.drawn = d;
      $layer.innerHTML = sheetHtml("Passport", passportBook(d), { left });
      const book = $(".ppbook", $layer);
      if (s.page) book.scrollLeft = s.page * book.clientWidth;
      ppFill(book, d);
      let tm = 0; book.addEventListener("scroll", () => { clearTimeout(tm); tm = setTimeout(() => ppFill(book, d), 60); }, { passive: true });
      return;
    }
    case "flysheet": {
      // How it flies: when it would land (up top), which pigeon, who carries it,
      // which way (and a picture of it), when it lands and where it stops
      const c = s.chat === S.chat ? composeState() : null;
      if (!c) { S.sheet = null; return renderSheet(); }
      const { g, f, t, sched, via, can, kind } = c, who = esc(first(g ? g.name : f.name));
      if (c.moon && !g) return drawLunarFly(c);
      const turn = g ? "Not your turn" : t.state === "outbound" ? "Yours is still on its way" : t.state === "inbound" ? `${who}’s is on its way` : `${who}’s turn first`;
      const when = (k) => (g ? landHint(c, k).replace(/^Lands/, "lands") : `lands ${atTime(sched ? sched.at : now() + plannedMs(c, k))}`);
      const style = routeStyle(), mapped = !g && !via && !sched && kind && kind !== "mystery" && kind !== "orbital" && f.lat != null && S.me.lat != null;
      const plans = mapped ? routePlanFor(f.id, kind)?.plans : null, plan = plans?.[style];
      // the top: when it lands, how long that is, where to, and the weather on the way
      const landAt = !kind || kind === "mystery" || g ? null : sched ? sched.at : now() + plannedMs(c, kind);
      const big = !kind ? "No pigeon free" : kind === "mystery" ? "Who knows when?" : g ? landHint(c, kind) : `Lands ${atTime(landAt)}`;
      const to = g ? `to ${esc(g.name)} · ${others(g).length + 1} people` : `to ${who}${f.place ? ` in ${esc(f.place)}` : ""}${S.me.lat != null && f.lat != null ? ` · ${plan?.km != null ? milesOf(plan.km, plan.legs) : fmtMiles(chatKm(f))}` : ""}`;      // (flown, and any stretch by ship)
      const adv = !g && kind && kind !== "dumb" && kind !== "orbital" && !sched && !via ? wxAdvice(f, kind) : null, wxNow = !g && S.wxPlan.get(f.id)?.d?.now;
      const sure = landAt ? landRange(landAt, now(), { wind: plan?.wind, legs: plan?.legs, sure: plan?.spread }) : null;          // (how sure that is)
      const wx = kind === "orbital" ? null : adv?.early ? ["early", I.wind, `${fmtDur(adv.early)} early on a tailwind`] : adv?.late ? ["late", I[(adv.wx && WX[adv.wx.k]?.[1]) || "storm"], `${fmtDur(adv.late)} late: ${adv.wx && WX[adv.wx.k] ? WX[adv.wx.k][0] : "rough weather"}`]
        : wxNow ? ["clear", I.sun, "Clear skies"] : null;
      const hero = `<div class="flyhero">${kind ? pg(kind, S.me.skin) : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}
        <span class="fht"><b class="fhbig">${esc(big)}</b><span class="flyto">${landAt && !sched && sure ? `likely ${esc(rangeText(sure))} · ` : ""}${landAt ? `in ${esc(fmtDur(landAt - now()))} · ` : ""}${to}</span>
        ${wx ? `<span class="fhwx ${wx[0]}">${wx[1]}${esc(wx[2])}</span>` : ""}</span></div>`;
      // the pigeons, each with a bar for how long it would take
      const most = Math.max(1, ...KINDS.map(([k]) => plannedMs(c, k) || 0));
      const kinds = KINDS.map(([k, name]) => {
        const left = S.me[k] || 0, next = S.me[k + "NextAt"];
        const sub = k === "standard" ? (sched ? "Can’t be booked ahead" : t.free ? `Free · ${when(k)}` : turn)
          : left ? `${left} left · ${when(k)}` : `None left${next ? ` · next in ${fmtDur(next - now())}` : ""}`;
        return `<button type="button" class="cell kc k-${k}" role="radio" aria-checked="${k === kind}" data-act="pigeon" data-id="${k}"${can[k] ? "" : " disabled"}>${pg(k, S.me.skin)}
          <span class="ctext"><span>${name}</span><span class="csub">${esc(sub)}</span><i class="kdur" data-w="${((plannedMs(c, k) || 0) / most).toFixed(3)}"></i></span><span class="val">${fmtDur(plannedMs(c, k))}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
      }).join("");
      const myLeft = S.me.mystery || 0, myNext = S.me.mysteryNextAt;
      const mystery = `<button type="button" class="cell kc" role="radio" aria-checked="${kind === "mystery"}" data-act="pigeon" data-id="mystery"${can.mystery ? "" : " disabled"}>${pg("mystery")}
          <span class="ctext"><span>Mystery</span><span class="csub">${esc(sched ? "Can’t be booked ahead" : myLeft ? "1 a day · any pigeon, any time" : `Used today${myNext ? ` · next in ${fmtDur(myNext - now())}` : ""}`)}</span></span><span class="val">?</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
      // by orbit: up, round the Earth, and down on the first pass near them (hours, however near or far)
      const orb = c.orbit ? ((ms) => `<button type="button" class="cell kc k-orbital" role="radio" aria-checked="${kind === "orbital"}" data-act="pigeon" data-id="orbital"${can.orbital ? "" : " disabled"}>${pg("orbital")}
          <span class="ctext"><span>Orbital</span><span class="csub">${esc(sched || via ? "Straight there, now" : S.me.orbital ? `${S.me.orbital} left · ${when("orbital")}` : `None left${S.me.orbitalNextAt ? ` · next in ${fmtDur(S.me.orbitalNextAt - now())}` : ""}`)}</span></span><span class="val">${fmtDur(ms)}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`)(etaMs(c, "orbital")) : "";
      const bd = kind ? birdFor() : null, busy = (b) => (b.state === "flying" ? "Flying" : b.state === "waiting" ? "Booked" : "Resting");
      const carriers = S.birds.length && kind ? `<div class="ghead">Carried By<button type="button" class="gmore" data-act="birds">Your Pigeons</button></div><div class="carriers chiprail" role="radiogroup" aria-label="Carried by">${S.birds.map((b) =>
        `<button type="button" class="cc" role="radio" aria-checked="${bd?.id === b.id}" data-act="birdset" data-id="${esc(b.id)}"${birdReady(b) ? "" : " disabled"}><span class="ccav" aria-hidden="true">${esc([...b.name][0] || "?")}</span><span><b>${esc(b.name)}</b><small>${birdReady(b) ? esc(b.rank) : busy(b)}</small></span></button>`).join("")}
        <button type="button" class="cc" role="radio" aria-checked="${!bd}" data-act="birdset" data-id="none"><span class="ccav any" aria-hidden="true">${I.bird}</span><span><b>Any Pigeon</b><small>No name</small></span></button></div>` : "";
      // which way: three to pick from, each with when it would land; then the way itself, as a line with its stops
      const route = via ? "" : `<div class="ghead">Route</div>${routeSeg(style, mapped && plans ? plansNow(now(), kind) : null)}${mapped ? "" : `<div class="gfoot">${esc(ROUTES.find((x) => x[0] === style)[2])}.</div>`}`;
      const way = !mapped ? "" : plan ? wayCard(plan, S.routePlan.data, style) : `<div class="waycard loading"><span class="wayhd"><b>See the Way</b></span><span class="wayline"><i></i></span><span class="waywords">Looking at the sky ahead…</span></div>`;
      // when it lands: as soon as it can, or a time worth a tap that it can make (it waits in your loft and leaves in time to land then), or another
      const chip = (act, id, on, b, small, off, av = "") => `<button type="button" class="cc" role="radio" aria-checked="${on}" data-act="${act}"${id != null ? ` data-id="${esc(String(id))}"` : ""}${off ? " disabled" : ""}>${av}<span><b>${b}</b><small>${small}</small></span></button>`;
      // by sea: a standard pigeon whose way crosses an ocean takes a ship, unless its sender's in a hurry
      const rd = mapped ? S.routePlan?.data : null, alone = rd?.noShip?.[kind]?.[style], shipped = rd?.kinds?.[kind]?.[style];
      const sh = shipped && shipOf(shipped.legs);
      const sea = alone && sh ? `<div class="ghead">By Sea</div><div class="carriers chiprail" role="radiogroup" aria-label="By sea">
          ${chip("shipset", "ship", !noShipOn(), "Take a Ship", `${esc(sh.from)} to ${esc(sh.to)} · ${esc(atTime(shipped.deliverAt + now() - rd.at))}`, false, `<span class="ccav when" aria-hidden="true">${I.ship}</span>`)}
          ${chip("shipset", "fly", noShipOn(), "Fly It All the Way", `No ships · ${esc(atTime(alone.deliverAt + now() - rd.at))}`, false, `<span class="ccav when" aria-hidden="true">${I.bird}</span>`)}</div>
          <div class="gfoot">${noShipOn() ? `In a hurry: it flies across ${esc(sh.sea)} itself, a long way with nowhere to land${S.me.risky ? ", and Pigeon Death’s odds go up" : ""}.` : `Too far to fly across ${esc(sh.sea)}, so it rides a ship. In a hurry? It can fly it all the way.`}</div>` : "";
      let landing = "", stop = "";
      if (!g) {
        const sk = schedKind(), ms = sk ? flightMs(chatKm(f), mySpeed(sk)) : 0, presets = schedPresets(), cur = sched?.at, other = cur && !presets.some(([, at]) => at === cur);
        landing = `<div class="ghead">When It Lands</div><div class="carriers chiprail" role="radiogroup" aria-label="When it lands">
          ${chip("schednow", null, !cur, "Soonest", kind && kind !== "mystery" ? esc(atTime(now() + plannedMs({ ...c, sched: null }, kind))) : "As soon as it can", false, `<span class="ccav when" aria-hidden="true">${I.bird}</span>`)}
          ${sk ? presets.filter(([, at]) => at - ms >= now() || cur === at).map(([label, at]) => chip("schedset", at, cur === at, esc(label), esc(atShort(at)))).join("") : ""}
          ${chip("schedule", null, !!other, other ? esc(atShort(cur)) : "Another Time", other ? "Your time" : sk ? "Pick one" : "Swift or faster", !sk, `<span class="ccav when" aria-hidden="true">${I.clock}</span>`)}</div>`;
        // a stop on the way: straight there, or with a friend you both have (and how much longer that takes)
        const mu = S.mutuals?.chat === f.id ? S.mutuals : null;
        if (!mu || now() - mu.at > 5 * MIN) loadMutuals(f.id);
        const pals = S.me.lat != null && f.lat != null ? (mu?.ids || []).map(friend).filter((p) => p?.lat != null).slice(0, 8) : [];
        if (pals.length || via) {
          const sp = mySpeed(kind && KIND[kind] ? kind : "standard"), direct = flightMs(chatKm(f), sp);
          const extra = (p) => flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, f.lat, f.lon), sp) - direct;
          stop = `<div class="ghead">Stop Over</div><div class="carriers chiprail" role="radiogroup" aria-label="Stop over">
            ${chip("viaclear", null, !via, "Straight There", "No stop", false, `<span class="ccav when" aria-hidden="true">${I.up}</span>`)}
            ${pals.map((p) => chip("viaset", p.id, via?.id === p.id, esc(first(p.name)), `${p.place ? `${esc(p.place)} · ` : ""}+${esc(fmtDur(Math.max(0, extra(p))))}`, false, avatar(p, "xs"))).join("")}</div>`;
        }
      }
      // (it plays in when it opens; redrawn for a new choice, only what changed moves)
      const old = $(".sheet .body", $layer), fresh = !$(".flyhero", $layer), top = old && !fresh ? old.scrollTop : 0;
      const rails = fresh ? [] : [...$layer.querySelectorAll(".sheet .chiprail")].map((r) => r.scrollLeft);
      const nowKey = { kind, style, land: landAt && Math.round(landAt / MIN) }, was = s.shown || (fresh && sheetBack ? nowKey : {});
      // (each pigeon's bar as it was, so a new plan's times grow or shrink them from there; and whether the way was still coming)
      const barW = fresh ? null : new Map([...$layer.querySelectorAll(".sheet .kinds .kc")].map((r) => [r.dataset.id, $(".kdur", r)?.getBoundingClientRect().width || 0])), wasLoading = !!$(".sheet .waycard.loading", $layer);
      const orbNote = kind === "orbital" ? (() => { const o = spaceFlight("orbital", asSent(endFor(S.me)), asSent(endFor(f)), now()); return `<div class="gfoot">It lifts off into orbit 250 miles up, goes round the Earth every 92 minutes at 17,000 mph, and comes down on the first pass near ${who}: ${((n) => `${n} lap${n === 1 ? "" : "s"}`)(Math.max(1, Math.round(o.laps)))} this time, then a gliding re-entry. Nearer isn’t quicker.</div>`; })() : "";
      $layer.innerHTML = sheetHtml("How It Flies", `${hero}<div class="group kinds" role="radiogroup" aria-label="Pigeon">${kinds}${mystery}${orb}</div>${orbNote}${kind === "orbital" ? "" : `${carriers}${landing}${stop}${route}${way}${sea}`}
        ${!carriers && (S.birds.length || S.hall.length) ? `<div class="group mt">${cell({ act: "birds", icon: I.bird, tile: "orange", label: "Your Pigeons", chev: true })}</div>` : ""}
        ${kind === "mystery" ? `<div class="gfoot">Your mystery pigeon could be anything from a rocket to a dumb one. You’ll find out as it takes off.</div>` : ""}
        ${c.moon && g ? `<div class="gfoot">${S.me.moon ? (worldOf(S.me) === "mars" ? "You’re on Mars, so every pigeon you send here goes as a laser pigeon, at the speed of light." : "You’re on the Moon, so every pigeon you send here goes as a lunar pigeon: about 3 days to Earth.")
          : others(g).filter((p) => p.onMoon).map((p) => `${esc(first(p.name))} is on ${worldOf(p) === "mars" ? "Mars: theirs goes as a laser pigeon, in minutes" : "the Moon: theirs goes as a lunar pigeon, about 3 days"}.`).join(" ")}</div>` : ""}
        ${S.me.risky ? `<div class="gfoot">Pigeon Death is on: 1.25× faster, but 1 in ${plan?.risk ? Math.round(1 / plan.risk.p) : style === "safe" && !via ? 200 : 100} is lost on the way${plan?.risk && riskWhy(plan.risk) ? ` (this way: ${esc(riskWhy(plan.risk))})` : ""}.</div>` : ""}`);
      const body = $(".sheet .body", $layer); body.classList.add("flysheet"); if (top) body.scrollTop = top;
      // the chip just tapped gives a little bounce
      if (S.flyTap) { const k = S.flyTap; S.flyTap = null; body.querySelector(`.chiprail [data-act="${k.dataset.act}"]${k.dataset.id ? `[data-id="${CSS.escape(k.dataset.id)}"]` : ""}`)?.classList.add("picked"); }
      body.querySelectorAll(".chiprail").forEach((r, i) => { r.scrollLeft = rails[i] || 0; const on = $("[aria-checked=true]", r); if (on && fresh) r.scrollLeft = Math.max(0, on.offsetLeft - 16 - (r.clientWidth - on.offsetWidth) / 3); });
      // (redrawn as it comes up: its rows keep growing, renderSheet keeps their place; come back to from The Way, it doesn't play in again)
      const entering = (fresh && !sheetBack) || sheetEntering();
      body.classList.toggle("enter", entering);
      if (!entering && was.land !== nowKey.land) $(".flyhero", body).classList.add("chg");
      if (!entering && (was.style !== style || was.kind !== kind)) $(".waycard", body)?.classList.add("chg");
      s.shown = nowKey;
      flyBits(body, fresh ? null : was.style);
      if (barW && !entering && !STILL.matches) body.querySelectorAll(".kinds .kc").forEach((r) => {
        const k = $(".kdur", r), a = barW.get(r.dataset.id), b = k?.getBoundingClientRect().width;
        if (a && b && Math.abs(a - b) > 1) k.animate([{ transform: `scaleX(${a / b})` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.32,.72,0,1)" });
      });
      if (wasLoading && !entering) $(".waycard:not(.loading)", body)?.classList.add("chg");        // (the way arriving late: its stops pop on)
      return;
    }
    case "via": {
      const f = friend(s.chat); if (!f) { S.sheet = null; return renderSheet(); }
      const k = S.sendKind && S.sendKind !== "dumb" ? S.sendKind : "standard", sp = mySpeed(k), cur = S.via?.chat === s.chat ? S.via.id : null;
      const direct = flightMs(chatKm(f), sp);
      const rows = (s.ids || []).map(friend).filter(Boolean).map((p) => {
        const ms = p.lat == null || f.lat == null || S.me.lat == null ? null : flightMs(haversineKm(S.me.lat, S.me.lon, p.lat, p.lon), sp) + HOUR + flightMs(haversineKm(p.lat, p.lon, f.lat, f.lon), sp);
        return `<button type="button" class="cell${cur === p.id ? " on" : ""}${ms == null ? " dim" : ""}" ${ms == null ? "disabled" : `data-act="viapick" data-id="${esc(p.id)}"`}>${avatar(p, "s")}
          <span class="ctext"><span>${esc(p.name)}</span><span class="csub">${ms == null ? "No location set" : `${esc(p.place || "")}${p.place ? " · " : ""}lands in ${fmtDur(ms)} (+${fmtDur(Math.max(0, ms - direct))})`}</span></span>${cur === p.id ? I.check : ""}</button>`;
      }).join("");
      $layer.innerHTML = sheetHtml("Stop Over", s.ids == null ? (s.err ? loadFail(s.err, "via") : `<p class="empty">Finding friends you share…</p>`)
        : rows ? `<div class="group mt-s">${rows}</div><div class="gfoot">Your pigeon rests with them for an hour on the way. They can read it and add a line for ${esc(first(f.name))}, then it flies on.</div>
          ${cur ? `<div class="stack"><button type="button" class="btn wide plain" data-act="unvia">Fly Straight There</button></div>` : ""}`
        : `<p class="empty"><b>No friends in common</b>A stopover needs a friend you and ${esc(first(f.name))} both have.</p>`,
        { left: { label: "Cancel", act: "close" }, right: null });
      return;
    }
    case "schedule": {
      const f = friend(s.chat); if (!f) { S.sheet = null; return renderSheet(); }
      if ($("#f-landat", $layer)) return;           // built once, so a sync can't undo a half-picked time
      const k = schedKind(), ms = k ? flightMs(chatKm(f), mySpeed(k)) : 0, cur = schedFor(s.chat, null);
      const rows = schedPresets().map(([label, at]) => {
        const soon = !k || at - ms < now();
        return cell({ act: soon ? null : "schedpick", id: String(at), label, sub: soon && k ? `Too soon for a ${KIND[k].name.toLowerCase()} pigeon` : "", val: `${DOW[new Date(at).getDay()]} ${fmtTime(at)}`, cls: soon ? "dim" : cur?.at === at ? "on" : "" });
      }).join("");
      $layer.innerHTML = sheetHtml("When Should It Land?", `<form id="sched-form" data-form="schedule" novalidate>
        <div class="group mt-s">${rows}</div>
        <div class="group"><label class="cell fcell schedat"><span class="ctext"><span>Another Time</span></span><input type="datetime-local" id="f-landat" aria-label="When it lands"></label></div>
        <div class="gfoot">${k ? `It waits in your loft and takes off in time to land then. ${esc(first(f.name))} won’t know it’s coming until it takes off. A ${KIND[k].name.toLowerCase()} pigeon takes ${fmtDur(ms)} to get there.` : "Scheduled pigeons are swift or faster, and your lofts are empty."} Up to 30 days ahead.</div>${ferr}
        ${cur ? `<div class="stack"><button type="button" class="btn wide plain" data-act="unschedule">Send It Now Instead</button></div>` : ""}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Set", form: "sched-form" } });
      const inp = $("#f-landat", $layer);
      inp.min = localInput(now() + ms + MIN); inp.max = localInput(now() + 30 * DAY);
      inp.value = localInput(cur?.at ?? Math.max(now() + ms + HOUR, schedPresets()[0][1]));
      return;
    }
    case "grouprename": {
      const g = group(s.id); if (!g) { S.sheet = null; return renderSheet(); }
      if (!$("#f-gname", $layer)) {
        $layer.innerHTML = sheetHtml("Group Name", `<form id="gname-form" data-form="grouprename" novalidate>
          <div class="group mt-s"><label class="fcell"><input id="f-gname" name="name" placeholder="Group name" maxlength="40" autocomplete="off" aria-label="Group name"></label></div>
          <div class="gfoot">Everyone in the group sees the new name.</div>${ferr}</form>`,
          { left: { label: "Back", act: "groupinfo" }, right: { label: "Save", form: "gname-form" } });
        $("#f-gname", $layer).value = g.name;
      }
      return;
    }
    case "addfriend":
      if (!$("#add-h", $layer)) {
        $layer.innerHTML = sheetHtml("Add Friend", `<form id="add-form" data-form="add" novalidate>
            <div class="group mt-s"><label class="fcell"><span class="pre">@</span><input name="h" id="add-h" placeholder="their handle" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-label="Friend’s handle"></label></div>
            <div class="addres" aria-live="polite"></div>
            <p class="gfoot add-msg" role="status">Type a friend’s handle, or let them scan your code.</p></form>
            <div class="addreqs"></div>
            <div class="ghead">Your code</div>
            <div class="mycode"><div class="qrbox">${qrSvg(myLink(), { title: "QR code for your add-a-friend link" })}</div>
              <b>@${esc(S.me.handle)}</b><span>A friend can scan this with their phone’s camera to add you.</span>
              <div class="row2"><button type="button" class="btn small" data-act="share">${I.up}Share Link</button><button type="button" class="btn small gray" data-act="copylink">Copy Link</button></div></div>`,
          { left: { label: "Cancel", act: "close" }, right: { label: "Send", form: "add-form" } });
        const i = $("#add-h", $layer); i.value = S.pendingAdd || ""; if (i.value) { addLookup(); try { localStorage.removeItem("inflight-add"); } catch (_) {} }   // (shown, signed in: not again next launch) setTimeout(() => i.focus(), 300);
      }
      // requests, kept here too (they change as you accept, decline or cancel)
      { const rq = $(".addreqs", $layer), row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext">${p.name ? `<span class="one">${esc(first(p.name))}</span><br><span class="csub">@${esc(p.handle)}</span>` : `<span class="one">@${esc(p.handle)}</span><br><span class="csub">Waiting for them to say yes</span>`}</span>
          <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${esc(p.id)}">Decline</button><button class="btn small" data-act="accept" data-id="${esc(p.id)}">Accept</button>` : `<button class="btn small gray" data-act="cancelreq" data-id="${esc(p.id)}">Cancel</button>`}</span></div>`;
        // (drawn again only when they've changed: renderSheet glides what moves and fades what comes and goes)
        const html = (S.incoming.length ? `<div class="ghead">Want to be your friend</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "")
          + (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "");
        if (rq && rq._html !== html) { rq.innerHTML = html; rq._html = html; } }
      return;
    case "whohas": {
      const g = group(S.chat), m = (S.msgs.get(S.chat) || []).find((x) => x.id === S.sheet.id);
      if (!g || !m?.flock) { S.sheet = null; return renderSheet(); }
      const c = flockCount(m), onMap = m.flock.some((x) => x.route);
      const status = (x) => {
        const st = whoState(x);
        return st === "read" ? `<span class="ws w-read">${I.check}Read ${esc(fmtShort(x.readAt))}</span>`
          : st === "landed" ? `<span class="ws w-landed">Landed ${esc(fmtShort(x.deliverAt))}</span>`
          : st === "fly" ? `<span class="ws w-fly"><span data-eta="${esc(x.deliverAt)}">${fmtDur(x.deliverAt - now())}</span> away</span>`
          : st === "lost" ? `<span class="ws w-lost">${I.skull}Lost</span>` : `<span class="ws w-back">${I.homing}Called back</span>`;
      };
      const rows = whoOrder(m).map((x) => { const p = member(g, x.to) || { name: "Someone" };
        return `<div class="cell whorow"><span class="who-av ${whoCls(x)}">${avatar(p, "s")}</span><span class="ctext"><span class="one">${esc(first(p.name))}</span>${x.toPlace ? `<span class="csub one">${esc(x.toPlace)}${x.km ? ` · ${fmtMiles(x.km + shipKm(x.legs))}` : ""}</span>` : ""}</span>${status(x)}</div>`; }).join("");
      const read = m.flock.filter((x) => x.readAt).length;
      $layer.innerHTML = sheetHtml("Who Has It",
        `<div class="whohead">${pgm(m)}<b>${m.flying ? `${c.landed} of ${c.n} landed` : `Landed for ${c.landed} of ${c.n}`}</b><span>${read ? `Read by ${read === c.n ? "everyone" : read}` : "Not read yet"}${m.flying && c.next ? ` · next lands in <span data-eta="${esc(c.next)}">${fmtDur(c.next - now())}</span>` : ""}</span>${whoDots(m)}</div>
        <div class="group">${rows}</div>
        ${onMap || m.flying ? `<div class="group mt">${onMap ? cell({ act: "map", id: m.id, icon: I.map, tile: "blue", label: m.flying ? "Watch on Map" : "See the Flights", chev: true }) : ""}${m.flying ? cell({ act: "recallask", id: m.id, label: "Call Them Back", cls: "center destructive" }) : ""}</div>` : ""}`);
      return;
    }
    case "requests": {
      const row = (p, inc) => `<div class="reqrow${inc ? " inc" : ""}">${avatar(p, "s")}<span class="ctext">${p.name ? `<span class="one">${esc(first(p.name))}</span><br><span class="csub">@${esc(p.handle)}</span>` : `<span class="one">@${esc(p.handle)}</span><br><span class="csub">Waiting for them to say yes</span>`}</span>
        <span class="acts">${inc ? `<button class="btn small gray" data-act="decline" data-id="${esc(p.id)}" aria-label="Decline ${esc(p.name)}">Decline</button><button class="btn small" data-act="accept" data-id="${esc(p.id)}" aria-label="Accept ${esc(p.name)}">Accept</button>`
          : `<button class="btn small gray" data-act="cancelreq" data-id="${esc(p.id)}" aria-label="Cancel request to @${esc(p.handle)}">Cancel</button>`}</span></div>`;
      $layer.innerHTML = sheetHtml("Friend Requests",
        (S.incoming.length ? `<div class="ghead">Waiting for you</div><div class="group">${S.incoming.map((p) => row(p, true)).join("")}</div>` : "") +
        (S.outgoing.length ? `<div class="ghead">Sent</div><div class="group">${S.outgoing.map((p) => row(p, false)).join("")}</div>` : "") +
        (S.incoming.length + S.outgoing.length ? "" : `<p class="empty"><b>All caught up</b>No friend requests right now.</p>`));
      return;
    }
    case "friendinfo": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const km = S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : null;
      $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${esc(first(f.name))}</span><span class="sub">@${esc(f.handle)}</span></div>
        <div class="group mt">${cell({ act: "loft", id: f.id, icon: I.bird, tile: "indigo", label: `Visit ${esc(first(f.name))}’s Loft`, sub: "Their pigeons, badges and kit", chev: true })}</div>
        <div class="group mt">
          ${cell({ icon: f.moon ? I.moon : I.pin, tile: f.moon ? (worldOf(f) === "mars" ? "red" : "indigo") : "blue", label: f.moon ? `On ${BODIES[worldOf(f)].name}` : "Location", val: esc((f.place || "Not set").replace(/, (the Moon|Mars)$/, "")), sub: f.locAt ? `Updated ${agoText(f.locAt)}` : "" })}
          ${km != null ? cell({ icon: I.dist, tile: "teal", label: "Distance", val: fmtMiles(km) }) : ""}
          ${f.streak && (f.streak.n || f.streak.best >= 2) ? cell({ icon: I.flame, tile: "orange", label: "Flight Streak", val: f.streak.n ? `${f.streak.n} day${f.streak.n === 1 ? "" : "s"}` : "None now",
            sub: [f.streak.n && !f.streak.today ? `Send a pigeon in the next ${esc(streakLeft(f.streak))} to keep it` : "", f.streak.best >= 2 ? `Best: ${f.streak.best} days` : ""].filter(Boolean).join(" · ") }) : ""}
          ${f.seenAt ? cell({ icon: I.clock, tile: "green", label: "Last Online", val: isOnline(f) ? '<span class="on-now">Online now</span>' : fmtSeen(f.seenAt) }) : ""}
          ${moonChat(f) ? kindsFor(f).map((k) => cell({ icon: k === "laser" ? I.up : I.moon, tile: k === "laser" ? "red" : "indigo", label: `${KIND[k].name} Pigeon`, val: fmtDur(spaceMs(k, endFor(S.me), endFor(f))) })).join("")
            : km != null ? KINDS.slice().reverse().map(([k, name]) => cell({ icon: I.bird, tile: k, label: `${name} Pigeon`, val: fmtDur(flightMs(km, mySpeed(k))) })).join("") : ""}
        </div>
        <div class="group mt">${cell({ act: "safety", id: f.id, icon: I.shield, tile: "teal", label: "Safety Number", val: isVerified(f) ? "Verified" : "", chev: true })}
          ${cell({ act: "vanishask", id: f.id, icon: I.clock, tile: "indigo", label: "Disappearing Messages", val: f.vanish ? vanishSay(f.vanish.ms).replace(/^./, (c) => c.toUpperCase()) : "Off", chev: true })}</div>
        <div class="gfoot">${KEEP_SAY}</div>
        <div class="group mt">${cell({ act: "unfriendask", id: f.id, label: "Remove Friend", cls: "center destructive" })}${cell({ act: "blockask", id: f.id, label: `Block @${esc(f.handle)}`, cls: "center destructive" })}</div>`, { name: `${f.name}: contact info` });
      return;
    }
    case "loft": {
      if (!f) { S.sheet = null; return renderSheet(); }
      const L = s.data, who = esc(first(f.name)), back = { left: { label: "Back", act: "loftback" }, name: `${f.name}’s loft` };
      if (!L) { $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span></div><p class="empty">Opening the loft…</p>`, back); return; }
      if (L.error || L.private) { $layer.innerHTML = sheetHtml("", `<div class="profile-head">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span></div>
        ${L.private ? `<p class="empty"><b>The loft is closed</b>${L.self ? "You don’t share your news, so lofts stay closed to you too. Turn on Share My News in Privacy &amp; Security to visit." : `${who} doesn’t share their news, so their loft stays private.`}</p>` : loadFail(L.error, "loft", s.id)}`, back); return; }
      const l = L.loft, mon = (t) => `${MON[new Date(t).getMonth()]} ${new Date(t).getFullYear()}`;
      const stat = (v, label) => `<div><b>${v}</b><span>${label}</span></div>`;
      const bird = (b) => `<div class="cell has-icon"><span class="tile wtile ${RANK_TILE[b.rank]}">${I.bird}${wearOn(b.wear)}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub">${esc(b.rank)}${b.wear && WEAR[b.wear] ? ` · wearing the ${esc(WEAR[b.wear][0].toLowerCase())}` : ""} · since ${mon(b.since)}</span></span></div>`;
      const hall = (b) => `<div class="cell has-icon"><span class="tile wtile ${b.lost ? "gray" : RANK_TILE[b.rank]}">${b.lost ? I.skull : I.bird}</span>
        <span class="ctext"><span class="one">${esc(b.name)}</span><span class="csub one">${esc(b.rank)} · ${b.lost ? `lost ${fmtDate(b.lost)}` : `retired ${fmtDate(b.retired)}`}</span></span></div>`;
      const badge = (b) => { const [icon, tint] = BADGE_LOOK[b.id] || ["bird", "gray"]; return `<div class="badge2 earned"><span class="bico tile ${tint}">${I[icon] || I.bird}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`; };
      const kit = [...l.kit.map((k) => `<span class="loftkit"><i aria-hidden="true">${k.emoji}</i>${esc(k.name)}</span>`), ...l.looks.map((k) => `<span class="loftkit">${pg("standard", k.id)}${esc(k.name)} look</span>`)];
      $layer.innerHTML = sheetHtml("", `<div class="profile-head lofthead">${avatar(f, "xl", true)}<span class="name">${who}’s Loft</span>
          <span class="sub">${l.skin && SKINS[l.skin] ? `${pg("standard", l.skin)} Flies ${esc(SKINS[l.skin].name)} pigeons · ` : ""}${l.since ? `Keeping pigeons since ${mon(l.since)}` : ""}</span></div>
        <div class="bstats">${stat(fmtMiles(l.km), "Flown")}${stat(l.landed.toLocaleString("en-GB"), l.landed === 1 ? "Landing" : "Landings")}${stat(l.countries, l.countries === 1 ? "Country" : "Countries")}${stat(l.postmarks, l.postmarks === 1 ? "Postmark" : "Postmarks")}</div>
        <div class="ghead">Pigeons${l.birds.length ? ` <span class="gcount">${l.birds.length}</span>` : ""}</div>
        ${l.birds.length ? `<div class="group">${l.birds.map(bird).join("")}</div>` : `<div class="gfoot">${who} hasn’t named any pigeons yet.</div>`}
        ${l.hall.length ? `<div class="ghead">Hall of Fame</div><div class="group">${l.hall.map(hall).join("")}</div>` : ""}
        ${l.badges.length ? `<div class="ghead">Achievements <span class="gcount">${l.badges.length}</span></div><div class="badges">${l.badges.map(badge).join("")}</div>` : ""}
        ${kit.length ? `<div class="ghead">Kit</div><div class="loftkits">${kit.join("")}</div>` : ""}
        <div class="gfoot mt">Where ${who}’s pigeons have been stays theirs: countries and postmarks are counted here, never named.</div>`, back);
      return;
    }
    case "sessions": {
      // Who's signed in: this phone, with how and since when, then any others (a new one marked), each a tap from
      // signing out, and what happens when there's a new one
      const list = s.list;
      const since = (at) => { const d = new Date(at); return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === new Date(now()).getFullYear() ? "" : ` ${d.getFullYear()}`}`; };
      const kind = (l) => /^(Mac|Windows|Linux|Chromebook)/.test(l) ? "laptop" : /^iPad/.test(l) ? "tablet" : "phone";
      const icon = (x, tile) => `<span class="tile ${tile}">${kind(x.label) === "laptop" ? I.laptop : I.phone}</span>`;
      const near = (x) => x.place ? ` · near ${esc(x.place)}` : "";
      if (!list) { $layer.innerHTML = sheetHtml("Signed-In Phones", s.err ? loadFail(s.err, "sessionssheet") : `<p class="empty">Looking…</p>`, { left: { label: "Back", act: "securitysheet" } }); return; }
      const me = list.find((x) => x.current), others = list.filter((x) => !x.current), fresh = (x) => now() - x.createdAt < DAY;
      const n = list.length, newOnes = others.filter(fresh).length;
      $layer.innerHTML = sheetHtml("Signed-In Phones", `
        <div class="wnhero sesshero${newOnes ? " alert" : ""}"><span class="wnlogo" aria-hidden="true">${I.phone}${n > 1 ? `<b>${n}</b>` : ""}</span><h2>${n > 1 ? `${n} Places Signed In` : "Only This Phone"}</h2>
          <p>${newOnes ? `${newOnes === 1 ? "One is" : `${newOnes} are`} new today. If it wasn’t you, sign it out.` : n > 1 ? "Your account is signed in on each of these." : "Your account isn’t signed in anywhere else."}</p></div>
        ${me ? `<div class="ghead">This Phone</div>
        <div class="group"><div class="cell has-icon sessrow">${icon(me, "green")}<span class="ctext"><span>${esc(me.label)}</span>
          <span class="csub"><span class="on-now">Active now</span> · ${standalone() ? "Home Screen app" : "In the browser"}</span>
          <span class="csub">Signed in ${esc(since(me.createdAt))}${near(me)}</span></span></div></div>` : ""}
        <div class="ghead">Other Phones${others.length ? ` <span class="gcount">${others.length}</span>` : ""}</div>
        <div class="group">${others.length ? others.map((x) => `<div class="cell has-icon sessrow${fresh(x) ? " fresh" : ""}">${icon(x, fresh(x) ? "orange" : "blue")}<span class="ctext"><span>${esc(x.label)}${fresh(x) ? ` <span class="newtag">New</span>` : ""}</span>
            <span class="csub">Active ${esc(agoText(x.seenAt))}${near(x)}</span><span class="csub">Signed in ${esc(since(x.createdAt))}</span></span>
            <button class="link danger" data-act="sessend" data-id="${esc(x.id)}" aria-label="Sign out ${esc(x.label)}">Sign Out</button></div>`).join("")
          : `<div class="cell sessnone"><span class="ctext"><span>None</span><span class="csub">Sign in anywhere else and it shows up here.</span></span></div>`}</div>
        ${others.length > 1 ? `<div class="group mt">${cell({ act: "sessothers", label: "Sign Out All Other Phones", cls: "center destructive" })}</div>` : ""}
        <div class="gfoot">A new sign-in is announced on your phones${S.me.emailOk === false ? "" : " and by email"}. Don’t know one? Sign it out and change your password. Places are the nearest town, never closer.</div>
        <div class="group mt">${cell({ act: "lockout", label: "Sign Out of This Phone", cls: "center destructive" })}</div>`,
        { left: { label: "Back", act: "securitysheet" } });
      return;
    }
    case "blocked":
      $layer.innerHTML = sheetHtml("Blocked", S.blocked.length ? `<div class="group mt-s">${S.blocked.map((p) => `<div class="cell has-icon">${avatar({ name: p.name || p.handle }, "s", false, true)}<span class="ctext"><span>${esc(p.name || "@" + p.handle)}</span><span class="csub">@${esc(p.handle)}</span></span><button class="link" data-act="unblock" data-id="${esc(p.id)}" aria-label="Unblock @${esc(p.handle)}">Unblock</button></div>`).join("")}</div>
        <div class="gfoot">They can’t send you friend requests or pigeons, or see your picture or where you are. They aren’t told.</div>`
        : `<p class="empty"><b>No one blocked</b>Block someone from their friend request or their contact info. They aren’t told.</p>`, { left: { label: "Back", act: "securitysheet" } });
      return;
    case "view":
      $layer.innerHTML = `<div class="viewer" data-act="close" role="dialog" aria-label="Photo"><img src="${S.photos.get(s.id) || ""}" alt="Photo"><p>Decrypted on this phone. Tap to close.</p></div>`;
      return;
    case "moved": {
      // Chat's new address, from its old one: in a browser it's one tap (the sign-in comes
      // too, pigeon/handover.js); a Home Screen app has its own storage, so it's a few steps
      // (drawn once: it never changes while it's open, and a redraw would play its rows in again)
      if (s.drawn && $(".sheet .body", $layer)) return; s.drawn = true;
      const home = NEW_HOME.replace(/^https?:\/\//, ""), app = standalone(), ios = isIOS();
      const row = ([ic, tile, title, sub], i) => `<div class="wnrow" data-i="${i}"><span class="tile ${tile}" aria-hidden="true">${I[ic]}</span><span class="wnt"><b>${esc(title)}</b><small>${esc(sub)}</small></span></div>`;
      const rows = app ? [
        ["globe", "blue", `1. Open it in ${ios ? "Safari" : "your browser"}`, home],
        ["plus", "green", ios ? "2. Add it to your Home Screen" : "2. Install it", ios ? "Tap Share, then Add to Home Screen." : "From the browser’s menu: Install App, or Add to Home Screen."],
        ["key", "orange", "3. Sign in there", "With Face ID or your password. Your chats and pigeons come with you."],
        ["bell", "red", "4. Turn notifications on there", "Then delete this Chat from your Home Screen."],
      ] : [
        ["check", "green", "Everything comes with you", "You’ll be signed in, with your chats, pigeons in flight and settings."],
        ["bell", "red", "Notifications move too", "Turn them on again there, from Account."],
      ];
      $layer.innerHTML = sheetHtml("", `<div class="wnhero"><span class="wnlogo" aria-hidden="true">${I.bird}</span><h2>Chat Has Moved</h2><p>It now lives at <b>${esc(home)}</b></p></div>
        <div class="wnlist">${rows.map(row).join("")}</div>
        <div class="wnfoot stack"><a class="btn wide" href="${esc(NEW_HOME)}/"${app ? ` target="_blank" rel="noopener"` : ""} data-act="movego">${app ? `Open ${esc(home)}` : `Go to ${esc(home)}`}</a>
          ${app ? `<button type="button" class="btn wide plain" data-act="movecopy">Copy the Address</button>` : ""}
          <button type="button" class="btn wide plain" data-act="close">Not Now</button></div>`, { name: "Chat Has Moved" });
      $layer.querySelectorAll(".wnrow").forEach((el) => el.style.setProperty("--i", el.dataset.i));
      return;
    }
    case "credits": {
      // where the weather, the heights and the maps come from, as their licences ask
      if (s.drawn && $(".sheet .body", $layer)) return; s.drawn = true;
      const out = (href, icon, tile, label, sub) => `<a class="cell has-icon" href="${href}" target="_blank" rel="noopener noreferrer"><span class="tile ${tile}">${icon}</span><span class="ctext"><span>${label}</span><span class="csub">${sub}</span></span>${chevSm}</a>`;
      $layer.innerHTML = sheetHtml("Map & Weather Data", `<div class="ghead">Weather</div>
        <div class="group">${out("https://open-meteo.com/", I.wind, "blue", "Open-Meteo", "Forecasts and the wind · CC BY 4.0")}
          ${out("https://api.met.no/", I.sun, "teal", "MET Norway", "When Open-Meteo can’t answer · CC BY 4.0")}</div>
        <div class="gfoot">Weather data by Open-Meteo.com and MET Norway, used under Creative Commons Attribution 4.0.</div>
        <div class="ghead">The Earth</div>
        <div class="group">${out("https://www.swpc.noaa.gov/products/planetary-k-index", I.compass, "indigo", "NOAA Space Weather", "Magnetic storms that put pigeons off course")}
          ${out("https://eonet.gsfc.nasa.gov/", I.volcano, "red", "NASA EONET", "Volcanoes and wildfires to fly around")}</div>
        <div class="gfoot">The planetary K index from NOAA’s Space Weather Prediction Center, and natural events from NASA’s Earth Observatory Natural Event Tracker: both US government data, free to use.</div>
        <div class="ghead">Mountains</div>
        <div class="group">${out("https://registry.opendata.aws/terrain-tiles/", I.dist, "green", "Terrain Tiles", "Heights for mountain passes · Mapzen and AWS")}</div>
        <div class="gfoot">Terrain Tiles bring together ETOPO1 and GMTED2010 (US government, public domain), SRTM (NASA), EU-DEM (produced using Copernicus data and information funded by the European Union) and other national elevation data. <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">All the sources</a></div>
        <div class="ghead">Maps</div>
        <div class="group">${out("https://www.naturalearthdata.com/", I.globe, "orange", "Natural Earth", "Coastlines, countries and places · public domain")}</div>
        <div class="ghead">GIFs</div>
        <div class="group">${out("https://giphy.com/", `<span class="gifico" aria-hidden="true">GIF</span>`, "indigo", "GIPHY", "Search and trending GIFs")}</div>
        <div class="gfoot">The maps and heights are kept on Chat’s own server, and it asks for the weather, the Earth’s news and GIFs itself, so none of these see who you are.</div>`);
      return;
    }
    case "appearance":
      $layer.innerHTML = sheetHtml("Appearance", `<div class="group mt-s">
        ${THEMES.map((k) => `<button type="button" class="cell" role="radio" aria-checked="${theme() === k}" data-act="theme" data-id="${esc(k)}"><span class="ctext"><span>${THEME_NAMES[k]}</span></span>${theme() === k ? `<span class="val tick">${I.check}</span>` : ""}</button>`).join("")}
        </div>
        <div class="gfoot">${theme() === "auto" ? "Matches your phone’s Light or Dark setting. " : ""}Saved to your account, so it’s the same on every phone you sign in on.</div>
        <div class="group mt">${toggleCell({ act: "haptics", icon: I.bird, tile: "indigo", label: "Haptics", sub: "A tap of feedback when you send, react and switch", on: hapticsOn() })}</div>
        <div class="gfoot">On this phone. iPhone needs iOS 18 or later.</div>`);
      return;
    case "notifications": {
      const old = $(".sheet .body", $layer), top = old ? old.scrollTop : 0;
      $layer.innerHTML = sheetHtml("Notifications", vNotifySheet());
      if (top) $(".sheet .body", $layer).scrollTop = top;    // toggling shouldn't jump the list
      return;
    }
    case "passkeys":
      $layer.innerHTML = sheetHtml("Passkeys", !passkeysSupported() && !S.passkeys.length ? `<p class="empty"><b>Not available</b>This browser can’t save passkeys.</p>`
        : S.passkeys.length ? `<div class="ghead">Saved Passkeys</div><div class="group">${S.passkeys.map((p) => `<div class="cell has-icon"><span class="tile indigo">${I.key}</span><span class="ctext"><span>${esc(p.label || "Passkey")}</span><span class="csub">Added ${fmtDate(p.createdAt)}${p.usedAt ? ` · used ${esc(agoText(p.usedAt))}` : ""}${p.unlocks ? " · unlocks messages" : ""}</span></span><button class="link danger" data-act="pkdel" data-id="${esc(p.id)}">Remove</button></div>`).join("")}</div>
          ${passkeysSupported() ? `<div class="group mt">${cell({ act: "pkadd", icon: I.plus, tile: "indigo", label: "Add Another Passkey", cls: "action" })}</div>` : ""}
          <div class="gfoot">Sign in with Face ID or your fingerprint. A passkey that unlocks your messages keeps them safe through a password reset.</div>`
        : `<div class="wnhero pkhero"><span class="wnlogo" aria-hidden="true">${I.face}</span><h2>No Password to Forget</h2><p>Sign in with Face ID or your fingerprint, the way you unlock your phone.</p></div>
          <div class="wnlist">${[["lock", "green", "Safer than a password", "Nothing to guess, reuse or type into the wrong site."],
            ["key", "indigo", "Keeps your messages", "On newer phones it also unlocks them, so a password reset doesn’t lose them."],
            ["face", "teal", "Lets Chat lock", "Lock Chat when you leave it, and open it with a glance."]].map(([ic, tile, t, sub], i) => `<div class="wnrow" data-i="${i}"><span class="tile ${tile}" aria-hidden="true">${I[ic]}</span><span class="wnt"><b>${t}</b><small>${sub}</small></span></div>`).join("")}</div>
          <div class="wnfoot"><button type="button" class="btn wide" data-act="pkadd">${I.plus}Add a Passkey</button></div>`, { left: toSecurity() });
      $layer.querySelectorAll(".wnrow").forEach((el) => el.style.setProperty("--i", el.dataset.i));
      return;
    case "reauth":
      if (!$("#reauth-form", $layer)) $layer.innerHTML = sheetHtml("Confirm It’s You", `<p class="gfoot mt-s">For your safety, enter your password to carry on.</p>
        <form id="reauth-form" data-form="reauth" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>
        ${S.passkeys?.length && passkeysSupported() ? `<div class="group mt">${cell({ act: "reauthpk", icon: I.face, tile: "green", label: "Use a Passkey Instead", cls: "action" })}</div>` : ""}`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Confirm", form: "reauth-form" } });
      return;
    case "askpw":
      if (!$("#f-password", $layer)) $layer.innerHTML = sheetHtml("Link Passkey", `<p class="gfoot mt-s">Enter your password once so this passkey can also unlock your messages on a new phone.</p>
        <form id="askpw-form" data-form="askpw" novalidate><div class="group mt-xs">${field("password", "Password", "password", "current-password")}</div>${ferr}</form>`,
        { left: { label: "Cancel", act: "close" }, right: { label: "Link", form: "askpw-form" } });
      return;
    case "profile": {
      // Where you are (your photo, name and handle are your account's: the card at the top of Account opens its page)
      // (the sheet's still called "profile" inside: Back from the Moon and Mars, and refreshProfile, come here)
      const u = S.me, old = $(".sheet .body", $layer), top = old && $(".locsheet", $layer) ? old.scrollTop : 0;
      $layer.innerHTML = sheetHtml("Location", `<div class="locsheet"></div>
        ${u.moon ? ((w, d) => `<div class="group">
          ${cell({ icon: w === "mars" ? I.up : I.moon, tile: w === "mars" ? "red" : "indigo", label: `On ${BODIES[w].name}`, val: esc((u.place || "").replace(/, (the Moon|Mars)$/, "")), sub: d })}
          ${cell({ act: "moonpick", id: w, icon: I.pin, tile: w === "mars" ? "red" : "indigo", label: `Move on ${BODIES[w].name}`, chev: true })}
          ${cell({ act: "moonpick", id: w === "mars" ? "moon" : "mars", icon: w === "mars" ? I.moon : I.up, tile: w === "mars" ? "indigo" : "red", label: w === "mars" ? "Go to the Moon" : "Go to Mars", chev: true })}
        </div>
        <div class="gfoot">Only ${w === "mars" ? "laser" : "lunar"} pigeons reach you here. Your spot on Earth isn’t kept while you’re away.</div>`)(worldOf(u), worldOf(u) === "mars"
          ? ((c) => `${c.hm} there · ${c.day ? "sunset" : "sunrise"} in ${fmtDur(c.next - now())}`)(marsClock(u.moon.lon, now()))
          : ((d) => `${d.day ? "Daytime" : "Night"} · ${d.day ? "sunset" : "sunrise"} in ${fmtDur(d.next - now())} · ${earthPhase(now()).name} in the sky`)(lunarDay(u.moon.lat, u.moon.lon, now()))) + `
        <div class="ghead">Back to Earth</div>
        <div class="group">
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
        </div>` : `<div class="group">
          ${cell({ icon: I.pin, tile: "blue", label: "Location", val: esc(u.place || "Not set"), sub: u.locAt ? `Updated ${agoText(u.locAt)}` : "" })}
          ${cell({ act: "locate", icon: I.loc, tile: "blue", label: "Use Current Location", cls: "action" })}
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a City</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
          ${toggleCell({ act: "autoloc", icon: I.loc, tile: "green", label: "Update Automatically", sub: "Every minute while Chat is open", on: u.autoLocation })}
          ${cell({ act: "moonpick", id: "moon", icon: I.moon, tile: "indigo", label: "Go to the Moon", sub: "Only lunar pigeons fly there", chev: true })}
          ${cell({ act: "moonpick", id: "mars", icon: I.up, tile: "red", label: "Go to Mars", sub: "Only laser pigeons reach it, at the speed of light", chev: true })}
        </div>`}
        <div class="gfoot">${u.moon ? "Choosing somewhere on Earth brings you home." : "Pigeons fly from here, and pigeons already on their way to you follow when you move. Only your friends see it, and only to within about a mile."}</div>`);
      if (top) $(".sheet .body", $layer).scrollTop = top;
      return;
    }
    case "moonpick": {
      // a spot on the Moon (near side or far) or Mars (east or west): tap the map, or pick a named place
      const body = s.body || "moon", mars = body === "mars", mine = worldOf(S.me) === body ? S.me.moon : null;
      const side = s.side || (mars ? (mine && mine.lon < 0 ? "west" : "east") : mine && farSide(mine.lon) ? "far" : "near"), mark = s.mark || mine || null;
      const name = mark ? siteName(mark.lat, mark.lon, body) : null, here = (x) => (mars ? (side === "west") === (x[2] < 0) : (side === "far") === farSide(x[2]));
      const SITES = BODIES[body].sites, world = BODIES[body].name;
      const chip = (act, id, on, b, small) => `<button type="button" class="cc" role="radio" aria-checked="${on}" data-act="${act}" data-id="${esc(id)}"><span><b>${esc(b)}</b><small>${esc(small)}</small></span></button>`;
      // (the places' rail stays where you'd scrolled it when a place or a spot is picked: only a new side starts it again)
      const rail0 = $(".moonpick", $layer) && $(".sheet .chiprail", $layer), railAt = rail0 && s.railSide === side ? rail0.scrollLeft : 0;
      const ll = mark ? `${Math.abs(mark.lat).toFixed(1)}° ${mark.lat >= 0 ? "N" : "S"}, ${Math.abs(mark.lon).toFixed(1)}° ${mark.lon >= 0 ? "E" : "W"}` : "";
      const where = !mark ? "" : mars ? `${ll} · ${marsClock(mark.lon, now()).hm} there now` : `${ll} · ${farSide(mark.lon) ? "far side: Earth is never in the sky" : "near side: Earth hangs in the sky"}`;
      const sides = mars ? chip("moonside", "east", side === "east", "East", "Syrtis, Jezero, Hellas") + chip("moonside", "west", side === "west", "West", "Olympus, Valles")
        : chip("moonside", "near", side === "near", "Near Side", "Faces Earth") + chip("moonside", "far", side === "far", "Far Side", "Faces away");
      $layer.innerHTML = sheetHtml(`On ${world}`, `<div class="mpwrap"><canvas class="moonpick" role="img" aria-label="Map of ${world}, ${side} side. Tap where you’d like to be."></canvas>
          <div class="mpside carriers" role="radiogroup" aria-label="Side">${sides}</div></div>
        <div class="mpsel" aria-live="polite">${mark ? `<b>${esc(name)}</b><small>${esc(where)}</small>` : `<b>Tap ${esc(world)}</b><small>or choose a place below</small>`}</div>
        <div class="carriers chiprail" role="radiogroup" aria-label="Places">${SITES.filter(here).map((x) => chip("moonsite", x[0], name === x[0], x[0], ABOUT[x[0]] || (/^(Sea|Ocean)/.test(x[0]) ? "A dark lava plain" : mars ? "A plain" : "A crater"))).join("")}</div>
        <div class="sharego"><button type="button" class="btn wide" data-act="moonland"${mark ? "" : " disabled"}>${mars ? I.up : I.moon}${mine ? "Move Here" : "Land Here"}</button></div>
        <div class="gfoot">Your friends see you on ${esc(world)}, at this spot. While you’re there your spot on Earth isn’t kept, and Update Automatically is off. ${mars ? "Only laser pigeons reach you: at the speed of light, 3 to 22 minutes from Earth as the planets move." : "Only lunar pigeons reach you: about 3 days from Earth, or a day by Lunar Express."}</div>`,
        { left: { label: "Back", act: "profile" }, right: { label: "Close", act: "close" } });
      const rail = $(".sheet .chiprail", $layer), pick = rail && $("[aria-checked=true]", rail); s.railSide = side;
      if (rail) {
        rail.scrollLeft = railAt;
        // (and the one picked, if it's off the edge, comes into view)
        const rr = rail.getBoundingClientRect(), cr = pick?.getBoundingClientRect();
        if (cr && (cr.left < rr.left || cr.right > rr.right)) rail.scrollBy({ left: cr.left - rr.left - 16, behavior: railAt && !STILL.matches ? "smooth" : "auto" });
      }
      const cv = $(".moonpick", $layer);
      s.view = drawPick(cv, { body, side, mark, focus: name });
      cv.addEventListener("click", (e) => {
        const r = cv.getBoundingClientRect(), p = pickAt(s.view, e.clientX - r.left, e.clientY - r.top); if (!p) return;
        s.mark = p; haptic("tick"); renderSheet();
      });
      return;
    }
  }
}
// How It Flies off the Earth: the space pigeons for it (two lunar ones to the Moon, a laser one to Mars),
// how far away it is today (its trip is as long as that), and what it does on the way
function drawLunarFly(c) {
  const { f, kind, can } = c, ks = c.kinds || [], who = esc(first(f.name)), a = endFor(S.me), b = endFor(f), t = now();
  const mars = ks.includes("laser"), same = a?.b === b?.b, ph = moonPhase(t);
  const km = same ? surfaceKm(a.b, a, b) : mars ? marsKm(t) : moonKm(t) - EARTH_R - MOON_R;      // (surface to surface, as the trip is measured)
  const landAt = kind ? t + etaMs(c, kind) : null, most = Math.max(...ks.map((k) => etaMs(c, k)));
  const where = same ? `across ${BODIES[a.b].name}` : !b || b.b === "earth" ? `in ${esc(f.place || "Earth")}` : `on ${BODIES[b.b].name}`;
  const chip = mars ? (same ? "By an orbiter overhead" : `Light takes ${fmtDur(lightMs(km))} to cross`) : same ? "No air, no wind, no weather" : `${ph.name} · ${((nf) => (nf ? nf[0].toUpperCase() + nf.slice(1) : "The Moon today"))(nearFar(moonKm(t)))}`;
  const hero = `<div class="flyhero">${kind ? pg(kind) : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}
    <span class="fht"><b class="fhbig">${kind ? `Lands ${esc(atTime(landAt))}` : "No space pigeon free"}</b><span class="flyto">${landAt ? `in ${esc(fmtDur(landAt - t))} · ` : ""}to ${who} ${where} · ${fmtMiles(km)}</span>
    <span class="fhwx clear">${mars ? I.up : I.moon}${esc(chip)}</span></span></div>`;
  const kinds = ks.map((k) => {
    const left = S.me[k] || 0, next = S.me[k + "NextAt"], ms = etaMs(c, k);
    const sub = left ? `${left} left · lands ${atTime(t + ms)}` : `None left${next ? ` · next in ${fmtDur(next - t)}` : ""}`;
    return `<button type="button" class="cell kc k-${k}" role="radio" aria-checked="${k === kind}" data-act="pigeon" data-id="${k}"${can[k] ? "" : " disabled"}>${pg(k)}
      <span class="ctext"><span>${KIND[k].name}</span><span class="csub">${esc(sub)}</span><i class="kdur" data-w="${(ms / most).toFixed(3)}"></i></span><span class="val">${fmtDur(ms)}</span><span class="ck" aria-hidden="true">${I.check}</span></button>`;
  }).join("");
  const how = mars
    ? (same ? "There’s no seeing across a planet, so it goes up to an orbiter overhead and back down: there in under a second."
      : `A laser pigeon is a pulse of light: it crosses the ${fmtMiles(km)} between Earth and Mars in ${fmtDur(lightMs(km))}. As the planets go round the Sun that’s anything from 3 to 22 minutes.`)
    : same ? "There’s no air on the Moon to fly in, so it bounds across the surface in the low gravity, straight there."
    : `${b?.b === "moon" ? "It lifts off from Earth" : "It lifts off from the Moon"} and coasts the ${fmtMiles(km)} between, slowing as ${b?.b === "moon" ? "Earth’s pull holds it back, then speeding up as the Moon’s takes over" : "it climbs out of the Moon’s pull, then falling faster and faster towards Earth"}. The Moon swings between about 221,000 and 252,000 miles away over a month, so the trip is longer or shorter with it.`;
  const fresh = !$(".flyhero", $layer);
  $layer.innerHTML = sheetHtml("How It Flies", `${hero}<div class="group kinds" role="radiogroup" aria-label="Pigeon">${kinds}</div>
    <div class="gfoot">Only ${mars ? "laser pigeons reach Mars or leave it" : `lunar pigeons reach ${same ? "across the Moon" : "the Moon or leave it"}`}. They go any time, straight there: no stopovers, no booking ahead and no weather. ${esc(how)}</div>
    ${S.me.risky && !mars ? `<div class="gfoot">Pigeon Death is on: 1.25× faster, but 1 in 100 is lost in space.</div>` : ""}`);
  const body = $(".sheet .body", $layer); body.classList.add("flysheet"); body.classList.toggle("enter", (fresh && !sheetBack) || sheetEntering());
  flyBits(body, null);
}
// each way's plan for a kind of pigeon as if it left now (the same clock as the card's)
function plansNow(t, kind) {
  const d = S.routePlan?.data, plans = kindPlans(d, kind) || d?.plans; if (!plans) return null;
  return Object.fromEntries(Object.entries(plans).map(([k, p]) => [k, { ...p, deliverAt: p.deliverAt + (t - d.at) }]));
}
// The way it would go, before you send: the map, and a card like a flight's,
// with the three ways to switch between (the map redraws for each)
function tickPreview(card, cv) {
  const m = S.preview; if (!m || !card || !cv) return;
  const t = now(), go = (x) => x + (t - m.sentAt), k = kindOf(m);
  // as if it left now
  const live = { ...m, sentAt: t, deliverAt: go(m.deliverAt), legs: (m.legs || []).map((l) => [l[0], l[1], go(l[2]), ...l.slice(3)]) };
  const others = plansNow(t, m.pigeon) || {};
  live.alts = ROUTES.filter(([k]) => k !== m.style && others[k]).map(([k, name]) => ({ style: k, name, route: m.route, sentAt: t, deliverAt: others[k].deliverAt,
    legs: (others[k].legs || []).map((l) => [l[0], l[1], l[2] + (t - S.routePlan.data.at), ...l.slice(3)]) }));
  card.classList.add("fc", "pv");
  const from = esc(m.fromPlace || "?"), to = esc(m.toPlace || "?"), coin = pgm(m);
  const rows = [{ at: t, now: true, coin, title: `Leaves ${from}`, sub: `${milesOf(m.km, live.legs)} · the ${esc((ROUTES.find((x) => x[0] === m.style)?.[1] || "fastest").toLowerCase())} way` }];
  for (const e of fcEvents({ ...live, via: true }, t)) rows.push({ ...e, time: fcAt(e.at, true), title: esc(e.title), sub: esc(e.sub || "") });
  rows.push({ at: live.deliverAt, time: fcAt(live.deliverAt), dot: "end", title: `Lands in ${to}` });
  const name = KIND[k]?.name || "Standard";
  const html = `<span class="fchead"><span class="fccoin lg">${coin}</span><span class="fct"><span class="big">Lands ${esc(clockIn(live.deliverAt, MY_TZ))}</span><span class="fcs">if it left now · ${(() => { const r = landRange(live.deliverAt, t, { wind: m.wind, legs: live.legs }); return r ? `likely ${esc(rangeText(r))}` : `in ${esc(fmtDur(live.deliverAt - t))}`; })()}</span></span></span>
    ${routeSeg(m.style, plansNow(t, m.pigeon))}
    <ol class="fctl" aria-label="The way it would go">${rows.map(fcRow).join("")}</ol>
    <span class="fcwho"><span class="fcav pgk" aria-hidden="true">${coin}</span><span class="fct"><span class="fckind">${/^[AEIOU]/.test(name) ? "An" : "A"} ${esc(name.toLowerCase())} pigeon</span><span class="fcs">${milesOf(m.km, m.legs)}${m.risky ? " · Pigeon Death on" : ""}</span></span>${m.risky ? `<span class="fctags">${m.risk ? riskTag(m.risk).replace('<em class="rk', '<span class="fcchip risk rk').replace("</em>", "</span>") : `<span class="fcchip risk">1.25×</span>`}</span>` : ""}</span>`;
  const body = $(".mcb", card) || (card.innerHTML = `<div class="mcb"></div>`, $(".mcb", card));
  if (body._html !== html) {
    body.innerHTML = html; body._html = html;
    const tl = $(".fctl", card);
    [...tl.children].forEach((li, i) => li.style.setProperty("--i", i));
    fcFades(tl); if (!tl._f) { tl._f = 1; tl.addEventListener("scroll", () => fcFades(tl), { passive: true }); }
    segGlide(card, card._style); card._style = m.style;
  }
  mapTick(cv, live, card.offsetHeight + 14);
  fcAside(card);
}
// (every: how long the whole map may go without being drawn again; smoothMap asks for twice a second)
function tickMap(every) {
  const s = S.sheet; if (!s || s.type !== "map") return;
  const m = s.id === "skies" || s.id === "preview" ? null : (S.msgs.get(S.chat) || []).find((x) => x.id === s.id);
  if (m && moonOf(m)) return tickMoon(m);
  const card = $(".mapcard", $layer), cv = $(".map", $layer);
  // only one pigeon's own card folds (The Skies and a group's flights keep theirs; the way before you send has one like it, unfolding)
  if (card?.classList.contains("fc") && (s.id === "skies" || m?.flock)) { card.classList.remove("fc", "fold", "swap", "pv"); $(".fcfold", card)?.remove(); const b = $(".mcb", card); if (b) b._html = ""; fcAside(card); }
  if (s.id === "skies") return tickSkies(card, cv);
  if (s.id === "preview") return tickPreview(card, cv);
  if (!m || !card || !(m.route || m.flock)) return;
  if (m.flock) return tickFlockMap(m, card, cv);
  // its way changed while the map was open (it turned for the weather, sheltered, or was cheered on): say so
  // (its shape: where it goes, not when; a cheer only speeds it up)
  const way = JSON.stringify((m.legs || []).filter((l) => l[3] !== "c" && l[3] !== "f").map((l) => [l[3], l[0], l[1]]));
  if (s.way != null && s.way !== way && !m.lost && m.deliverAt > now()) { const n = routeNote(m); toast(esc(n ? `Its way just changed: ${n.text[0].toLowerCase()}${n.text.slice(1)}.` : `Its way just changed: it now lands ${atTime(m.deliverAt)}.`)); haptic("tick"); }
  s.way = way;
  const { share, cheer, look } = cardShell(card), canShare = shareable(m);
  const fill = () => { if (share.hidden === canShare) share.hidden = !canShare; share.dataset.id = m.id; cheerState(cheer, m); lookState(look, m); flightCard(card, m); };
  // the card becoming something else (landed, lost or called back; its cheer, share or Look Up coming or going): it
  // springs to its new shape, the map re-fitting with it, rather than all of it changing in one frame
  const shape = `${m.lost ? "l" : m.recalled ? "b" : now() >= m.deliverAt ? "d" : "a"}|${canShare}|${cheerable(m).flying}|${!!lookAt(m)}`;
  if (s.shape && s.shape !== shape && !STILL.matches) { s.shape = shape; fcMorph(card, fill); } else { s.shape = shape; fill(); }
  mapTick(cv, m, card.offsetHeight + 14, every);
  smoothMap(m);
}
/* ---------- a pigeon to, from or across the Moon ----------
   No map of the Earth: the Earth and the Moon (or the Moon's surface) with
   the pigeon on its way, where it is now, and the moments of its trip. */
// its two ends, and the times of the one pigeon shown: { mn, sentAt, deliverAt, lost }
// (one that followed someone to another world: the leg it's on now, and `then`, the one still to come)
function moonOf(m) {
  const one = (mn, deliverAt, x) => { const L = legOf(mn, m.sentAt, deliverAt, now()); return { mn: L.mn, sentAt: L.from, deliverAt: L.to, then: L.then, endAt: deliverAt, lost: x.lost, lostAt: x.lostAt, recalled: !!x.recalled, km: x.km }; };
  if (m.moon) return one(m.moon, m.deliverAt, m);
  const fl = (m.flock || []).filter((x) => x.moon);
  if (!fl.length || fl.length !== (m.flock || []).length) return null;               // (a group's, all of them to or from the Moon)
  const x = fl.find((y) => y.to === S.moonWho?.[m.id]) || fl.find((y) => y.flying) || fl[0];
  return { ...one(x.moon, x.deliverAt, x), to: x.to, many: fl.length > 1 };
}
const MOON_ICON = { up: "up", globe: "globe", dot: "dot", dist: "dist", moon: "moon", check: "check", pin: "pin", fire: "fire" };
const TRIP_LABEL = { surface: "The pigeon bounding across the Moon", trip: "The pigeon on its way between the Earth and the Moon", laser: "A laser pigeon: a pulse of light between the worlds", orbit: "The pigeon’s path round the Earth in orbit" };
function drawMoonFlight(s, m) {
  const o = moonOf(m), mine = m.from === S.me.id, g = m.gid ? group(m.gid) : null;
  const other = g ? (mine ? member(g, o.to) : member(g, m.from)) : friend(mine ? m.to : m.from);
  const nm = (p) => (p?.id === S.me.id ? "You" : esc(first(p?.name || "Someone")));
  const flying = o.deliverAt > now() && !o.lost;
  if (!$(".moonsky", $layer)) {
    $layer.innerHTML = sheetHtml(flying ? "Pigeon in Flight" : "The Flight", `<canvas class="moonsky" role="img" aria-label="${esc(TRIP_LABEL[o.mn.k] || TRIP_LABEL.trip)}"></canvas>
      <div class="mooncard"><div class="mchead">${pg(kindOf(m))}<span class="mct"><b>${mine ? `To ${nm(other)}` : `From ${nm(other)}`}</b><small class="mcwhere"></small></span><span class="mceta"></span></div>
      ${o.many && mine && g ? `<div class="mcwho" role="group" aria-label="Whose pigeon">${m.flock.map((x) => `<button type="button" class="mcw" data-act="moonwho" data-id="${esc(m.id)}|${esc(x.to)}">${esc(first(member(g, x.to)?.name || "Someone"))}</button>`).join("")}</div>` : ""}
      <div class="mcnow"></div><div class="mcbar" aria-hidden="true"><i></i></div>
      <div class="mcplay"><input type="range" class="mcreplay" min="0" max="1000" step="1" aria-label="Replay the trip"><button type="button" class="mclive" data-act="moonlive">Live</button></div>
      <ol class="mcsteps"></ol>
      <div class="mclook" hidden><button type="button" class="btn wide plain lookbtn" data-act="lookup" data-id="${esc(m.id)}">${I.compass}Look Up</button></div>
      <div class="mcshare" hidden><button type="button" class="btn wide plain" data-act="shareflight" data-id="${esc(m.id)}">${I.share}Share Flight</button></div></div>`, { flush: true });
    $(".sheet .body", $layer).classList.add("moonbody");
    // scrub through the trip: the picture and where it was then (Live goes back to now)
    $(".mcreplay", $layer).addEventListener("input", (e) => { S.moonReplay = { id: m.id, f: Number(e.target.value) / 1000 }; tickMoon(m); });
  }
  tickMoon(m);
}
const placeOf = (e) => (e?.place ? e.place : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
function tickMoon(m) {
  const cv = $(".moonsky", $layer); if (!cv) return;
  const o = moonOf(m), now0 = now(), end = o.lost ? Math.min(now0, o.lostAt || now0) : now0;
  const live = Math.max(0, Math.min(1, (end - o.sentAt) / (o.deliverAt - o.sentAt)));
  // replaying: any moment up to now (or the whole trip, once it's landed)
  const rp = S.moonReplay?.id === m.id ? Math.min(live, S.moonReplay.f) : null, f = rp ?? live, t = rp == null ? now0 : o.sentAt + f * (o.deliverAt - o.sentAt);
  drawTrip(cv, o.mn, f, t, { lost: o.lost && !o.recalled && rp == null });
  const card = $(".mooncard", $layer), place = (e) => (e?.place ? esc(o.mn.k === "surface" || (o.mn.k === "laser" && o.mn.relay) ? e.place.replace(/, (the Moon|Mars)$/, "") : e.place) : e?.b === "moon" ? "the Moon" : e?.b === "mars" ? "Mars" : "Earth");
  $(".mcwhere", card).innerHTML = `${place(o.mn.from)} to ${place(o.mn.to)}`;
  // a group's: whose is showing (each member's pigeon went its own way)
  if (o.many && m.gid) {
    const g = group(m.gid), mine = m.from === S.me.id;
    if (mine) $(".mct b", card).textContent = `To ${first(member(g, o.to)?.name || "Someone")}`;
    for (const b of card.querySelectorAll(".mcw")) { const on = b.dataset.id.endsWith("|" + o.to); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  }
  const eta = $(".mceta", card), landed = !o.lost && now0 >= o.deliverAt;
  sheetTitle(o.lost || now0 >= o.endAt ? "The Flight" : "Pigeon in Flight");
  eta.innerHTML = rp != null ? `<b>${esc(atShort(t))}</b><small>replay</small>` : o.recalled ? `<b>Called back</b>` : o.lost ? `<b class="lost">Lost</b>` : landed ? `<b>Landed</b><small>${esc(atShort(o.deliverAt))}</small>` : `<b>${esc(airTime(o.endAt - now0))}</b><small>lands ${esc(atShort(o.endAt))}</small>`;
  const nowEl = $(".mcnow", card);
  nowEl.textContent = rp != null ? spaceNow(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth).line
    : o.recalled ? "Called back: it turned for home."
    : o.lost ? (o.mn.k === "laser" ? "The signal was lost: Pigeon Death." : o.mn.k === "orbit" ? "It burnt up coming down: Pigeon Death." : o.mn.k === "trip" && o.mn.to.b === "earth" ? "It burnt up on the way home: Pigeon Death." : "Lost in space: Pigeon Death.")
    : landed ? (o.mn.k === "laser" ? `Crossed ${fmtMiles(Number(o.km || o.mn.dist || 0))} at the speed of light` : o.km ? `${o.mn.k === "surface" ? "Bounded" : "Flew"} ${fmtMiles(Number(o.km))}` : o.mn.k === "surface" ? "Bounded across, and landed." : "Landed safely.")
    : spaceNow(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth).line;
  $(".mcbar i", card).style.width = `${(f * 100).toFixed(2)}%`;
  const slider = $(".mcreplay", card); if (document.activeElement !== slider) slider.value = String(Math.round(f * 1000));
  $(".mclive", card).hidden = rp == null;
  $(".mcshare", card).hidden = !(rp == null && shareable(m));
  $(".mclook", card).hidden = !(rp == null && lookAt(m));
  const steps = spaceMoments(o.mn, o.sentAt, o.deliverAt, t, whereOnEarth), key = steps.map((x) => +x.done).join("") + (o.lost ? "l" : "") + (o.then ? "r" : "");
  // followed them to another world: where it was handed on, or relayed from, and where it's relayed on to
  const by = (k) => (k === "laser" ? "a laser pigeon" : `a ${KIND[k]?.name.toLowerCase() || "space"} pigeon`);
  if (o.mn.hand) steps.unshift({ at: o.sentAt, done: t >= o.sentAt, icon: "up", text: `${o.mn.rested ? "After its stopover, handed" : "Handed"} to ${by(o.mn.pk)}${o.mn.from?.place ? ` ${o.mn.rested ? "in" : "over"} ${o.mn.from.place}` : ""}: they’d left the Earth` });
  else if (o.mn.prev) steps.unshift({ at: o.sentAt, done: t >= o.sentAt, icon: "up", text: `Relayed on from ${placeOf(o.mn.from)} by ${by(o.mn.pk)}: they’d moved` });
  if (o.then) steps.push({ at: o.deliverAt, done: false, icon: o.then.pk === "laser" ? "up" : "moon", text: `${o.then.pk === "laser" ? "Relayed by laser" : `Handed to a ${KIND[o.then.pk]?.name.toLowerCase() || "space"} pigeon`} to ${placeOf(o.then.to)}, where they are now` });
  const ol = $(".mcsteps", card);
  if (ol.dataset.k !== key) {
    ol.dataset.k = key;
    ol.innerHTML = steps.filter((x) => !o.lost || x.at <= o.lostAt).map((x) => `<li class="${x.done ? "done" : ""}"><span class="mci">${I[MOON_ICON[x.icon]] || I.dot}</span><span class="mcs">${esc(x.text)}</span><time>${esc(atShort(x.at))}</time></li>`).join("");
  }
  clearTimeout(S.moonTimer);
  S.moonTimer = setTimeout(() => { if (S.sheet?.type === "map" && $(".moonsky", $layer)) tickMap(); }, 1000);
}
/* ---------- choosing the way: How It Flies and The Way ----------
   Fastest, Scenic or Safe as one sliding switch (each with when it would
   land), and the way it would go as a line with its stops on it. */
const ROUTE_SHORT = { fastest: "Quickest", scenic: "Landmarks", safe: "Rests on islands" };
function routeSeg(style, plans) {
  const i = ROUTES.findIndex((r) => r[0] === style);
  return `<div class="seg" role="radiogroup" aria-label="Route" data-i="${i}"><i class="segthumb" aria-hidden="true"></i>${ROUTES.map(([k, name, , icon]) =>
    `<button type="button" role="radio" aria-checked="${k === style}" data-act="routeset" data-id="${k}">${icon}<b>${name}</b><small>${plans?.[k] ? esc(k === style || !plans[style] ? atTime(plans[k].deliverAt) : segDelta(plans[k].deliverAt - plans[style].deliverAt)) : ROUTE_SHORT[k]}</small>${S.me.risky && plans?.[k]?.risk ? riskTag(plans[k].risk) : ""}</button>`).join("")}</div>`;
}
// the other ways, against the chosen one: "+12 min", "same time", "−5 min"
const segDelta = (d) => (Math.abs(d) < MIN ? "same time" : `${d > 0 ? "+" : "−"}${fmtDur(Math.abs(d))}`);
// Pigeon Death's odds on a way (with it on): "1 in 140", green when better than usual, red when worse
const riskLevel = (r) => (r.p <= 0.007 ? "lo" : r.p >= 0.013 ? "hi" : "mid");
const riskTag = (r) => `<em class="rk ${riskLevel(r)}">1 in ${Math.round(1 / r.p)}</em>`;
// and why: "a long sea crossing, falcons around the Bosphorus"
function riskWhy(r) {
  const why = [r.sea > 500 ? (r.sea > 1500 ? "a very long sea crossing" : "a long sea crossing") : "", r.storms ? "storms it can’t get around" : "", r.hawk ? `falcons around ${r.hawk}` : ""].filter(Boolean);
  return why.length ? why.join(", ") : "";
}
// the switch's thumb glides from the last choice to this one
function segGlide(root, fromStyle) {
  const seg = $(".seg", root); if (!seg) return;
  const th = $(".segthumb", seg), to = +seg.dataset.i, from = fromStyle ? ROUTES.findIndex((r) => r[0] === fromStyle) : to;
  th.style.setProperty("--i", from < 0 ? to : from);
  if (from < 0 || from === to || STILL.matches) return th.style.setProperty("--i", to);
  void th.offsetWidth; th.classList.add("glide"); th.style.setProperty("--i", to);
}
// See the Way: from here to there, with each storm, wind, pass, island and landmark where it comes
// nothing on the way: what that means for the way picked
const STRAIGHT = { fastest: "Straight there: nothing on the way worth going around", scenic: "Straight there: no landmark near enough to fly past", safe: "Straight there: no long sea to rest on the way across" };
function wayCard(plan, d, style) {
  const t0 = d.at, span = Math.max(1, plan.deliverAt - t0);
  let last = -1;
  const dots = fcEvents({ legs: plan.legs, via: true, near: [] }, t0 - 1).map((e) => {
    const x = Math.max(last + 0.07, Math.min(0.93, Math.max(0.07, (e.at - t0) / span))); last = x;
    return `<span class="waystop ${e.tone || ""}" data-x="${Math.min(0.93, x).toFixed(3)}">${e.icon}</span>`;
  }).join("");
  return `<button type="button" class="waycard" data-act="routepreview">
    <span class="wayhd"><b>See the Way</b><span class="waygo">${I.map}On the map</span></span>
    <span class="wayline" aria-hidden="true"><i class="wayend from"></i>${dots}<i class="wayend to"></i></span>
    <span class="wayends"><span><b>${esc(d.fromPlace || "Here")}</b>now</span><span><b>${esc(d.toPlace || "There")}</b>${esc(atTime(now() + plan.deliverAt - t0))}</span></span>
    <span class="waywords">${esc(wayWords(plan.legs) === "the straight way" ? STRAIGHT[style] || "Straight there" : wayWords(plan.legs).replace(/^./, (x) => x.toUpperCase()))}</span></button>`;
}
// sizes and places set from code (inline style attributes are blocked)
function flyBits(root, fromStyle) {
  root.querySelectorAll(".kdur[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w));
  root.querySelectorAll(".waystop[data-x]").forEach((el, i) => { el.style.setProperty("--x", el.dataset.x); el.style.setProperty("--i", i); });
  root.querySelectorAll(".kinds .kc").forEach((el, i) => el.style.setProperty("--i", i));
  segGlide(root, fromStyle);
}
// the flight it would be, from the server's plan for that way (for the pigeon picked)
function previewFrom(style) {
  const c = composeState(), d = c?.f && c.kind && KIND[c.kind] ? routePlanFor(c.f.id, c.kind) : null, plan = d?.plans?.[style]; if (!plan) return null;
  return { id: "preview", preview: true, style, from: S.me.id, to: S.chat, pigeon: d.pigeon, skin: S.me.skin, route: [...d.from, ...d.to], legs: plan.legs, km: plan.km,
    sentAt: d.at, deliverAt: plan.deliverAt, fromPlace: d.fromPlace, toPlace: d.toPlace, flying: true, wind: plan.wind, risky: S.me.risky, risk: plan.risk };
}
/* ---------- A pigeon's map card ----------
   Folded, a slim bar over the map: how long it has left, where it is, and a
   cheer. Pulled up, the flight as a timeline: where it took off, what it does
   on the way (storms, wind, islands, passes, landmarks), where it is now, and
   where it lands. Tap or swipe the bar to switch; this phone keeps your choice.
   It springs between the two while the map re-fits around it, the rows rise
   in one after another, and the map's buttons step aside while it's up. */
const mapOpen = () => { try { return localStorage.getItem("inflight-mapcard") === "open"; } catch (_) { return false; } };
function mapFold(open) {
  try { localStorage.setItem("inflight-mapcard", open ? "open" : "fold"); } catch (_) {}
  const card = $(".mapcard.fc", $layer); if (!card) return;
  haptic("tick"); card._tl = 0;
  fcMorph(card, () => tickMap());
}
// redraw the card, then spring its height from the old to the new while the
// map follows it (the new side plays in once; the once-a-second redraws don't replay it)
// (replay: its rows play in again, as when it's folded or unfolded; not for The Way's switch, which only changes some)
function fcMorph(card, redraw, replay = true) {
  const h0 = card.offsetHeight;
  card.classList.remove("swap", "morph"); card.style.height = ""; void card.offsetWidth;
  if (replay) card.classList.add("swap");
  clearTimeout(card._sw);
  redraw();
  const done = () => { card.classList.remove("swap", "morph"); card.style.height = ""; };
  if (STILL.matches) { card._sw = setTimeout(done, 50); return; }
  const h1 = card.offsetHeight;
  card.style.height = h0 + "px"; void card.offsetHeight;
  card.classList.add("morph"); card.style.height = h1 + "px";
  fcFollow(card, 650);
  card._sw = setTimeout(done, 760);
}
// keep the map fitted above the card while it changes size: the picture as it was, moved and scaled to fit each frame
// (quick), and the whole map drawn again once the card has settled (drawing all of it every frame left it at a few
// frames a second on a phone)
function fcFollow(card, ms) {
  const cv = $(".map", $layer), end = performance.now() + ms;
  cancelAnimationFrame(fcFollow.raf);
  const step = () => {
    if (!cv?._m || !card.isConnected || S.sheet?.type !== "map") return;
    cv._cardH = card.offsetHeight + 14; nudgeMap(cv); fcAside(card);
    if (performance.now() < end) fcFollow.raf = requestAnimationFrame(step);
  };
  step();
}
// the same for a card that isn't a pigeon's own (The Skies, a group's flights) when what's on it changes
function cardMorph(card, redraw) {
  const h0 = card.offsetHeight; redraw();
  const h1 = card.offsetHeight;
  if (STILL.matches || !h0 || Math.abs(h1 - h0) < 2) return;
  card.style.overflow = "hidden";
  const a = card.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 500, easing: cssVar(document.documentElement, "--snappy") || "ease-out" });
  a.onfinish = a.oncancel = () => { card.style.overflow = ""; };
  fcFollow(card, 520);
}
// the map's buttons step aside when the card comes up over them (and back when it folds)
function fcAside(card) {
  const top = card?.classList.contains("fc") ? card.offsetTop : Infinity;
  for (const el of $layer.querySelectorAll(".mapctl")) {
    const under = top < el.offsetTop + el.offsetHeight + 10;
    if (el.classList.contains("fcaside") !== under) { el.classList.toggle("fcaside", under); if (el.matches(".mapctl")) el.inert = under; }
  }
}
// drag the card: it follows your finger (stiffly the wrong way), and past a
// little way it opens or folds; let go short of that and it springs back
function fcDrag(card) {
  let st = null;
  card.addEventListener("touchstart", (e) => {
    const tl = e.target.closest(".fctl");
    st = card.classList.contains("fc") && e.touches.length === 1 && !zoomed() && !(tl && tl.scrollHeight > tl.clientHeight + 1)
      ? { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now(), v: 0, dy: 0, dir: null } : null;
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (!st) return;
    const t = e.touches[0], dy = t.clientY - st.y, dx = t.clientX - st.x;
    if (!st.dir) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { st = null; return; }
      st.dir = "y"; card.classList.add("drag");
    }
    e.preventDefault();
    const now = performance.now(); st.v = (dy - st.dy) / Math.max(1, now - st.t); st.t = now; st.dy = dy;
    const open = !card.classList.contains("fold"), way = open ? dy > 0 : dy < 0;
    // (pulled up when it's already up, it gives only as far as the gap under the sheet's title, never under it)
    const y = way ? dy * 0.5 : open ? Math.max(dy * 0.15, -Math.max(0, card.offsetTop - 4)) : dy * 0.15;
    card.style.transform = `translateY(${y.toFixed(1)}px)`;
  }, { passive: false });
  const end = () => {
    if (!st?.dir) { st = null; return; }
    const s = st; st = null;
    card.classList.remove("drag"); card.style.transform = "";
    const open = !card.classList.contains("fold");
    if (open ? s.dy > 60 || (s.dy > 20 && s.v > 0.5) : s.dy < -30 || (s.dy < -10 && s.v < -0.4)) mapFold(!open);
  };
  card.addEventListener("touchend", end); card.addEventListener("touchcancel", end);
}
const passName = (n) => (!n ? "a pass" : /^a |^[A-Z][\w’']*['’]s /.test(n) ? n : `the ${n}`);
// what happens on the way, in time order: [{ at, icon, tone, title, sub, until }]
function fcEvents(m, t) {
  const ev = [], legs = m.legs || [], tagged = legs.filter((l) => l[3] && l[3] !== "c" && l[3] !== "f"), once = new Set();
  for (let i = 0; i < tagged.length; i++) {
    const l = tagged[i], [tag, n, at] = [l[3], l[4], l[2]], done = at <= t;
    if ((tag === "i" || tag === "h" || tag === "t") && tagged[i + 1]?.[3] === tag && tagged[i + 1][0] === l[0]) {
      const until = tagged[i + 1][2], over = until <= t;
      // a breather: its named pigeon tires on a long flight (fewer, shorter ones as it rises through the ranks)
      if (tag === "t") { ev.push({ at, until, icon: I.bird, tone: "", title: `${over ? "Caught its breath" : done ? "Catching its breath" : "A breather"} ${n || "on the way"}`, sub: `${fmtDur(until - at)} on the ground${m.bird?.name ? ` · ${m.bird.name} needs it` : ""}` }); i++; continue; }
      ev.push(tag === "h" ? { at, until, icon: severeIcon(l[5]?.k), tone: "warn", title: `${over ? "Sheltered" : done ? "Sheltering" : "Shelters"} from ${SEVERE_WORD[l[5]?.k] || "storms"}${n ? ` ${n}` : ""}`, sub: `${over ? "Until" : "Until about"} ${clockIn(until, MY_TZ)}` }
        : { at, until, icon: I.bird, tone: "teal", title: `${over ? "Rested" : done ? "Resting" : "Rests"} on ${n || "an island"}`, sub: `${over ? "Until" : "Until about"} ${clockIn(until, MY_TZ)}` });
      i++; continue;
    }
    // by ship: boarding (and the voyage), then coming ashore; the lane's own points aren't rows
    if (tag === "b") {
      if (once.has("b")) continue; once.add("b");
      const sh = shipOf(legs); if (!sh) continue;
      const sailing = t >= sh.off, ashore = t >= sh.ashore;
      ev.push({ at: sh.board, until: sh.ashore, icon: I.ship, tone: "teal", title: `${ashore || sailing ? "Boarded" : done ? "Waiting for" : "Boards"} a ship at ${sh.from}`, sub: `Across ${sh.sea} · ${fmtDur(sh.ashore - sh.off)} at sea` });
      ev.push({ at: sh.ashore, icon: I.ship, tone: "teal", title: `${ashore ? "Came" : "Comes"} ashore at ${sh.to}`, sub: "And flies on from there" });
      continue;
    }
    // storms and wind once each: the first place it meets them (it may bend around them, or ride the wind, several times)
    if (tag === "s" || tag === "w" || tag === "o") { if (once.has(tag + (tag === "s" ? done : ""))) continue; once.add(tag + (tag === "s" ? done : "")); }
    const say = {
      s: [severeIcon(severeKOf(legs)), "warn", `${done ? "Went" : "Goes"} around ${severeOf(legs)}${n ? ` over ${n}` : ""}`, ""],
      w: [I.wind, "green", done ? "Rode the wind" : "Rides the wind", "A longer way, but quicker"],
      p: [I.map, "", `${done ? "Came through" : "Through"} ${passName(n)}`, "Over the mountains"],
      v: [I.loc, "teal", `${done ? "Flew past" : "Past"} ${n || "a landmark"}`, "For its postmark"],
      o: [I.waves, "teal", `${done ? "Followed" : "Follows"} the coast${n ? ` of ${n}` : ""}`, "Over land, rather than open sea"],
      m: [I.map, "", `${done ? "Flew" : "Flies"} over ${n || "the mountains"}`, "High enough not to need a pass"],
      r: [n === "s" ? severeIcon(l[5]?.k) : I.wind, "warn", n === "s" ? `Turned to keep clear of ${SEVERE_WORD[l[5]?.k] || "storms"}` : "Turned to ride the wind", "Changed course in the air"],
    }[tag];
    if (say) ev.push({ at, tag, icon: say[0], tone: say[1], title: say[2], sub: say[3] });
  }
  // it turned to follow someone who moved
  if (!m.via) for (const l of legs.filter((x) => !x[3])) {
    const who = m.to === S.me.id ? "you" : esc(first(friend(m.to)?.name || "them"));
    ev.push({ at: l[2], icon: I.loc, tone: "", title: "Changed course", sub: `To follow ${who}${who === "you" ? ": you moved" : ""}` });
  }
  // near misses, once each (a pair can be stored from both sides): "Passed Reuben's pigeon", "Overtook your pigeon to Nia"
  const met = new Set();
  for (const n of m.near || []) {
    if (met.has(n.other.id)) continue; met.add(n.other.id);
    const o = n.other, nm = (id) => first(personById(id)?.name || "a friend");
    const whose = o.from === S.me.id ? `your pigeon to ${esc(nm(o.to))}` : `${esc(nm(o.from))}’s pigeon`;
    const over = n.place && n.place !== "land" ? `Over ${n.place}` : "In mid-air";
    if (n.kind === "flock") {                                       // (they part when the server says: n.until)
      const parts = n.until ?? n.at;
      ev.push({ at: n.at, icon: I.people, tone: "teal", cls: "near flock", title: `${n.at > t ? "Flies" : parts > t ? "Flying" : "Flew"} with ${whose}`, sub: `${over} · 10% faster together` }); continue;
    }
    ev.push({ at: n.at, icon: I.pass, tone: "orange", cls: "near", title: n.kind === "overtake" ? (n.lead === "other" ? `Overtaken by ${whose}` : `Overtook ${whose}`) : `Passed ${whose}`, sub: over });
  }
  return ev.sort((a, b) => a.at - b.at);
}
// a row's time: "14:02", or "Mon" under it on another day ("~" when it's still to come)
function fcAt(ts, soon) {
  const c = clockIn(ts, MY_TZ), [, day, hm] = /^(?:(\S+) )?(\d\d:\d\d)$/.exec(c) || [, "", c];
  return `${soon ? "~" : ""}${hm}${day ? `<small>${day}</small>` : ""}`;
}
function fcRow(r) {
  return `<li class="${r.cls || ""}${r.done ? " done" : ""}${r.flown ? " flown" : ""}${r.now ? " now" : ""}">
    <span class="fcat">${r.now ? "Now" : r.time}</span>
    <span class="fcdot ${r.dot || "ev"} ${r.tone || ""}">${r.now ? r.coin : r.dot === "ev" || !r.dot ? r.icon || "" : ""}</span>
    <span class="fcwhat"><span class="fctitle">${r.title}</span>${r.sub ? `<span class="fcs">${r.sub}</span>` : ""}${r.extra || ""}</span></li>`;
}
// the sheet's title follows the flight (it opened "Pigeon in Flight"; once it's down, it's "The Flight")
function sheetTitle(text) {
  const h = $(".sheet header h2", $layer); if (!h || h.textContent === text) return;
  h.textContent = text; if (!STILL.matches) h.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });     // (fading in, not a cut)
}
function flightCard(card, m) {
  const open = mapOpen(), t = m.lost ? m.lostAt : now(), left = m.deliverAt - now(), f = flightAt(m, t), k = kindOf(m);
  const landed = !m.lost && left <= 0, resting = restingOn(m), flew = m.deliverAt - m.sentAt, note = routeNote(m), wx = wxSay(m);
  if (S.sheet?.id === m.id) sheetTitle(m.lost || landed ? "The Flight" : "Pigeon in Flight");
  // the first time: it rises in a beat after the sheet
  if (!card.classList.contains("fc")) { card.classList.add("fc", "enter"); setTimeout(() => card.classList.remove("enter"), 900); }
  card.classList.toggle("fold", !open);
  if (!$(".fcfold", card)) card.insertAdjacentHTML("afterbegin", `<button type="button" class="fcfold" data-act="mapfold"><i></i></button>`);
  const fold = $(".fcfold", card), label = open ? "Fold the card away" : "Show the flight’s details";
  if (fold.getAttribute("aria-label") !== label) { fold.setAttribute("aria-label", label); fold.setAttribute("aria-expanded", String(open)); }
  const coin = m.recalled ? `<span class="homing">${I.homing}</span>` : m.lost ? `<span class="lostp">${I.skull}</span>` : pgm(m), from = esc(m.fromPlace || "?"), to = esc(m.toPlace || "?");
  const where = !m.lost && !landed && !resting ? esc(overWhere(...pigeonLL(m))) : "";
  const big = m.recalled ? "Called back" : m.lost ? "Lost on the way" : landed ? "Landed" : esc(fmtDur(left));
  const lands = landsLine(m).replace(/^Lands/, "lands");
  let html;
  if (!open) {
    // (folded, one line: just when it lands; the card pulled up has the likely range, and their time)
    const peek = `lands ${esc(clockIn(m.deliverAt, MY_TZ))}`;
    const sub = m.lost ? `${from} → ${to}` : landed ? `${from} → ${to} · flew ${esc(fmtDur(flew))}` : resting ? esc(note?.text || "Resting")
      : `${from} → ${to}${where ? ` · over <b>${where}</b>` : ""}`;
    html = `<span class="fcpeek"><span class="fccoin">${coin}</span><span class="fct"><span class="big">${big}${!m.lost && !landed ? `<small> · ${peek}</small>` : ""}</span><span class="fcs">${sub}</span></span></span>
      <span class="fcbar k-${k}${m.lost ? " lost" : ""}"><i></i></span>`;
  } else {
    const pill = m.lost ? "" : landed ? ["ok", `${I.check}Landed`] : resting ? (resting[2] === "h" ? ["warn", "Sheltering"] : resting[2] === "b" ? ["teal", "Waiting for a Ship"] : resting[2] === "sail" ? ["teal", "At Sea"] : resting[2] === "v" ? ["teal", "Stopover"] : ["teal", "Resting"])
      : f.phase === "up" ? ["ok", "Taking Off"] : f.phase === "down" ? ["ok", "Landing"] : ["tint", "In Flight"];
    const head = m.lost ? `${from} → ${to}` : landed ? `in ${to} · ${esc(fmtShort(m.deliverAt))}` : `to ${to} · <span class="lands">${lands}</span>`;
    // the rows: took off, what happens on the way, now, lands
    const rows = [{ at: m.sentAt, time: fcAt(m.sentAt), dot: "end", title: `Took off from ${from}`, sub: `${milesOf(m.km, m.legs)}${m.style ? ` · the ${esc((ROUTES.find((x) => x[0] === m.style)?.[1] || m.style).toLowerCase())} way` : ""}` }];
    for (const e of fcEvents(m, t)) rows.push({ ...e, time: fcAt(e.at, e.at > t), title: esc(e.title), sub: esc(e.sub || ""), now: !!(resting && e.until && e.at <= t && t < e.until) });
    const chips = [];
    if (!resting) chips.push(`<span class="fcchip speed">${esc(fmtMph(f.kmh))}</span>`);
    if (wx && !landed) chips.push(`<span class="fcchip wx ${wx.cls}">${wx.icon}${esc(wx.text)}</span>`);
    else if (m.wind != null && !landed) chips.push(`<span class="fcchip wind ${m.wind >= 3 ? "tail" : m.wind <= -3 ? "head" : ""}">${I.wind}${fmtWind(m.wind)}${Math.abs(m.wind) >= 3 ? ` · ${m.wind > 0 ? "faster" : "slower"} than usual` : ""}</span>`);
    chips.push(`<span class="fcchip dim">${Math.round(flownFrac(m, t) * 100)}% of the way</span>`);
    // (only what it's doing now: a turn for the weather, or a rest; the rest of its way has rows of its own)
    const said = note && /^(Rerouted|Sheltering|Resting on .* until|Waiting for a ship|At sea)/.test(note.text);
    const extra = `<span class="fcchips">${chips.join("")}</span>${said ? `<span class="waynote">${note.icon}${esc(note.text)}</span>` : ""}`;
    if (!m.lost && !landed) {
      const nr = rows.find((r) => r.now);
      if (nr) Object.assign(nr, { coin, extra });
      else rows.push({ at: t, now: true, coin, title: where ? `<span class="over">Over ${where}</span>` : esc(note?.text || "On its way"), extra });
    }
    if (m.recalled) rows.push({ at: t, time: fcAt(t), dot: "ev", icon: I.homing, title: "Called back", sub: m.from === S.me.id ? "You called it home" : "They called it home" });
    else if (m.lost) rows.push({ at: t, time: fcAt(t), dot: "ev", tone: "red", icon: I.skull, title: "Lost on the way", sub: m.risky ? "Pigeon Death was on" : "" });
    else rows.push({ at: m.deliverAt, time: fcAt(m.deliverAt), dot: "end", title: `${landed ? "Landed" : "Lands"} in ${to}`,
      sub: landed ? `Flew ${esc(fmtDur(flew))} · averaged ${esc(fmtMph(avgKmh(m)))}${stillMs(m) > HOUR ? " in the air" : ""}` : "", extra: landed && wx ? `<span class="wx ${wx.cls}">${wx.icon}${esc(wx.text)}</span>` : "" });
    rows.sort((a, b) => a.at - b.at || (a.now ? 1 : 0) - (b.now ? 1 : 0));
    rows.forEach((r, i) => { r.done = r.at <= t && !r.now; r.flown = !!rows[i + 1] && rows[i + 1].at <= t; });
    // anything else worth a line: who it flew over, cheers, the weather watch
    const notes = [flyText(m) ? `<span class="flyover">${I.wave}${esc(flyText(m))}</span>` : "",
      m.cheers ? `<span class="cheers">${I.wind}Cheered on ${m.cheers === 1 ? "once" : m.cheers + " times"} · ${esc(soonerText(m.cheerMs))} sooner</span>` : "",
      !m.lost && left > LIVE_LEFT ? `<span class="checked">${I.eye}Watching the weather ahead · checked ${m.liveAt ? agoText(m.liveAt) : "at take‑off"}</span>` : ""].join("");
    // who carries it (a named pigeon), or what kind of pigeon it is; and how it flies
    const b = m.bird, mine = b && m.from === S.me.id && b.id ? [...S.birds, ...S.hall].find((x) => x.id === b.id) : null;
    const tags = [b && k !== "standard" ? `<span class="fcchip k-${k}">${esc(KIND[k]?.name || k)}</span>` : "",
      m.style && m.style !== "fastest" ? `<span class="fcchip sty">${esc(ROUTES.find((x) => x[0] === m.style)?.[1] || m.style)}</span>` : "",
      m.noShip ? `<span class="fcchip sty">No Ships</span>` : "",
      m.risky ? `<span class="fcchip risk">1.25×</span>` : ""].join("");
    const who = b ? `<span class="fcav" aria-hidden="true">${esc([...b.name][0] || "?")}</span><span class="fct"><span class="birdline">Carried by ${esc(b.name)}${esc(wearWord(b.wear))}</span><span class="fcs">${esc(b.up || b.rank)}${mine?.km >= 1 ? ` · ${fmtMiles(mine.km)} in all` : ""}</span></span>`
      : `<span class="fcav pgk" aria-hidden="true">${coin}</span><span class="fct"><span class="fckind">${m.mystery ? "A mystery pigeon" : `${/^[AEIOU]/.test(KIND[k]?.name || "") ? "An" : "A"} ${esc((KIND[k]?.name || "standard").toLowerCase())} pigeon`}</span><span class="fcs">${milesOf(m.km, m.legs)}${m.risky ? " · Pigeon Death on" : ""}</span></span>`;
    html = `<span class="fchead" data-act="mapfold"><span class="fccoin lg">${coin}</span><span class="fct"><span class="big">${big}</span><span class="fcs">${head}</span></span>${pill ? `<span class="fcpill ${pill[0]}">${pill[1]}</span>` : ""}</span>
      <ol class="fctl" aria-label="The flight, start to finish">${rows.map(fcRow).join("")}</ol>${notes ? `<span class="fcnotes">${notes}</span>` : ""}<span class="fcwho">${who}${tags ? `<span class="fctags">${tags}</span>` : ""}</span>`;
  }
  const body = $(".mcb", card);
  if (body._html !== html) {
    const tl = $(".fctl", card), top = tl ? tl.scrollTop : 0;
    body.innerHTML = html; body._html = html;
    // the timeline keeps its place; opened, it starts at now (with a little of what came before)
    const tl2 = $(".fctl", card), nr = tl2 && $(".now", tl2);
    // (the ping where it is now keeps its beat when the rows are drawn again, each minute, rather than starting over)
    if (nr) { card._ping ??= performance.now() + 800; nr.style.setProperty("--ping", `${Math.round(card._ping - performance.now())}ms`); }
    if (tl2) {
      [...tl2.children].forEach((li, i) => li.style.setProperty("--i", i));        // (each row a beat after the last, as they rise in)
      if (card._tl) tl2.scrollTop = top;
      else { card._tl = 1; if (nr) tl2.scrollTop = Math.max(0, nr.offsetTop - 22); }
      fcFades(tl2); if (!tl2._f) { tl2._f = 1; tl2.addEventListener("scroll", () => fcFades(tl2), { passive: true }); }
    }
  }
  const bar = $(".fcbar i", card); if (bar) bar.style.width = (flownFrac(m, t) * 100).toFixed(2) + "%";
  fcAside(card);
}
// the timeline fades out at an edge with more to scroll to
function fcFades(tl) {
  const up = tl.scrollTop > 2, down = tl.scrollTop + tl.clientHeight < tl.scrollHeight - 2;
  tl.classList.toggle("more-up", up); tl.classList.toggle("more-down", down);
}
/* ---------- In the air: every pigeon flying to or from you, at the top of Messages ----------
   One element that outlives re-renders (the list is redrawn on every sync), so
   cards keep their place, their scroll and their animations. Cards spring in,
   the pigeon on each track flaps along it, and on landing it hops onto a tick
   and the card folds away. */
let airEl = null, airQuiet = false, airSoon = 0;
const airKey = (r) => String(r.id);
// 4:29 under an hour (it ticks), then 1h 04m, then 2d 3h
function airTime(ms) {
  ms = Math.max(0, ms);
  if (ms >= DAY) return fmtDur(ms);
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h ${pad2(Math.floor((ms % HOUR) / MIN))}m`;
  return `${Math.floor(ms / MIN)}:${pad2(Math.floor((ms % MIN) / 1000))}`;
}
function airMount() {
  const slot = $(".airslot", $view); if (!slot) return;
  if (!airEl) {
    airEl = document.createElement("section");
    airEl.className = "air"; airEl.setAttribute("aria-label", "Pigeons in the air");
    airEl.innerHTML = `<div class="airin"><div class="airhead"><b>In the air<span class="airn"></span></b><span class="airnext"></span></div><div class="rail" role="group" aria-label="Pigeons in the air"></div></div>`;
    // the pigeons already up are simply there when the list first draws: the
    // strip doesn't grow open under it, and the cards don't fly in
    airQuiet = true; airSync(); airQuiet = false;
  }
  const rail = $(".rail", airEl), x = rail.scrollLeft;
  slot.replaceWith(airEl);
  rail.scrollLeft = x;
  airSync();
  if (!S.skiesAt || Date.now() - S.skiesAt > 20e3) loadSkies();
}
function airCard(r) {
  const el = document.createElement("button");
  el.type = "button"; el.className = `acard k-${kindOf(r)}${r.out ? " mine" : ""}`;
  el.dataset.act = "airopen"; el.dataset.id = r.chat; el.dataset.m = String(r.id).split(":")[0]; el.dataset.k = airKey(r);
  el.innerHTML = `<span class="awho">${r.g && !r.who ? gavatar(r.g, "xs") : avatar(r.who || { name: "?" }, "xs")}<span class="one"></span></span>
    <span class="aeta"><span class="acd">${airTime(r.deliverAt - now())}</span><span class="aok">${I.check}Landed</span></span>
    <span class="atrack"><i></i><span class="abird">${I.bird}</span></span>
    <span class="asub"></span>`;
  return airFill(el, r);
}
// what a card says (names arrive with the sync; a rerouted pigeon lands at a new time)
const spaceSub = (mn, from, at) => ((L) => spaceNow(L.mn, L.from, L.to, now(), whereOnEarth))(legOf(mn, from, at, now())).line.replace(/ · (\d[\d,]* mph|at the speed of light)$/, "").replace(/^Over /, "over ");
function airFill(el, r) {
  const who = r.label.split(" · ")[0], wx = wxSay(r, true);
  el.dataset.at = r.deliverAt; el.dataset.from = r.sentAt;
  el.setAttribute("aria-label", `${who}, ${r.out ? "your pigeon" : "on its way to you"}${r.g ? `, in ${r.g.name}` : ""}, lands ${atTime(r.deliverAt)}. Watch it on the map.`);
  $(".awho .one", el).textContent = who;
  const sub = $(".asub", el);
  sub.className = `asub${wx ? (r.delay > 0 ? " late" : " early") : ""}`;
  // yours: when it lands (and where, in a group); theirs: sealed till then
  // (out in space: where it is instead, "142,000 mi from Earth", "over France · lap 3")
  el._space = r.moon || null; el.classList.toggle("space", !!r.moon);
  sub.innerHTML = r.moon ? `${r.out ? "" : I.lock}${esc(spaceSub(r.moon, +el.dataset.from, +el.dataset.at))}` : wx ? esc(wx) : `${r.out ? "" : I.lock}lands ${esc(atTime(r.deliverAt))}`;
  return el;
}
// One card per chat: a group's pigeons, coming and going, share one card.
function airModels() {
  const t = now(), list = (skyRoutes(true) || []).filter((r) => r.deliverAt > t - 1500), out = [], groups = new Map();
  for (const r of list) {
    if (!r.g) { out.push({ k: airKey(r), r, at: r.deliverAt }); continue; }
    let m = groups.get(r.g.id);
    if (!m) { m = { k: "g:" + r.g.id, g: r.g, pts: [] }; groups.set(r.g.id, m); out.push(m); }
    if (r.out) m.out = true;
    m.pts.push({ id: airKey(r), at: r.deliverAt, from: r.sentAt, kind: kindOf(r) });
  }
  // your own pigeons to the group that have already landed still count, and so do the lost (grey, apart)
  for (const m of S.skies?.groups || []) {
    const gm = groups.get(m.gid); if (!gm || m.from !== S.me.id) continue;
    for (const x of m.flock || []) if (!x.flying && !gm.pts.some((p) => p.id === m.id + ":" + x.to))
      gm.pts.push({ id: m.id + ":" + x.to, at: x.lost ? x.lostAt || m.sentAt : x.deliverAt, from: m.sentAt, kind: kindOf(m), ...(x.lost ? { lost: x.recalled ? "back" : "lost", end: x.deliverAt } : {}) });
  }
  for (const m of groups.values()) m.at = airNext(m.pts, t);
  return out;
}
// when a group's next pigeon lands (or, once they all have, when the last did)
const airNext = (pts, t) => { const up = pts.filter((p) => !p.lost && p.at > t).map((p) => p.at); return up.length ? Math.min(...up) : Math.max(...pts.map((p) => p.at)); };
function airGroupCard(m) {
  const el = document.createElement("button");
  el.type = "button"; el.className = `acard grp${m.out ? " mine" : ""}`;
  el.dataset.act = "airopen"; el.dataset.id = m.g.id; el.dataset.m = ""; el.dataset.k = m.k;
  el.innerHTML = `<span class="awho">${gavatar(m.g, "xs")}<span class="one"></span></span>
    <span class="aeta"><span class="acd"></span><span class="aok">${I.check}Landed</span></span>
    <span class="atrack dots"></span>
    <span class="asub"></span>`;
  el._pts = [];
  return airGroupFill(el, m);
}
function airGroupFill(el, m) {
  // a pigeon that has landed and left the sky stays on the card, green
  const t = now(), ids = new Set(m.pts.map((p) => p.id));
  el._pts = [...m.pts, ...el._pts.filter((p) => !ids.has(p.id) && p.at <= t)];
  el.dataset.at = airNext(el._pts, t);
  $(".awho .one", el).textContent = m.g.name;
  return el;
}
// bring the cards in line with what's in the air
function airSync() {
  if (!airEl || S.view !== "messages") return;
  const rail = $(".rail", airEl), list = airModels();
  const want = new Map(list.map((m) => [m.k, m])), have = new Map([...rail.children].map((c) => [c.dataset.k, c]));
  // gone from the sky: landed (early too, cheered on or with the wind behind it), or called back or lost, when it drops
  // away; which, its message says (the time only when it isn't on this phone)
  for (const [k, c] of have) if (!want.has(k) && !c.classList.contains("landed") && !c.classList.contains("out")) {
    const x = friend(c.dataset.id) || group(c.dataset.id), m = x?.last?.id === c.dataset.m ? x.last : (S.msgs.get(c.dataset.id) || []).find((y) => y.id === c.dataset.m);
    if (c._pts ? c._pts.every((p) => p.lost || p.at <= now()) && c._pts.some((p) => !p.lost) : m ? !m.lost && !m.recalled : +c.dataset.at <= now()) airLand(c); else { c.classList.add("lost"); airFold(c, 700); }
  }
  const atStart = rail.scrollLeft < 8;
  let i = 0;
  for (const m of list) {
    if (have.has(m.k)) { const c = have.get(m.k); if (!c.classList.contains("landed") && !c.classList.contains("out")) m.g ? airGroupFill(c, m) : airFill(c, m.r); continue; }
    if (m.g ? m.pts.every((p) => p.at <= now()) : m.at <= now()) continue;    // landed before we saw it
    const c = m.g ? airGroupCard(m) : airCard(m.r);
    c.style.setProperty("--i", i++);
    if (!airQuiet) {
      c.classList.add("enter");
      c.addEventListener("animationend", (e) => { if (e.animationName === "acard-in") c.classList.remove("enter"); });
    }
    // keep them in landing order
    const after = [...rail.children].find((x) => +x.dataset.at > m.at && !x.classList.contains("out"));
    rail.insertBefore(c, after || null);
  }
  if (atStart && i) rail.scrollLeft = 0;        // (scroll snapping would hold on to the card that was first)
  airTick();
}
// Soonest to land first. When that changes (a fresher copy, a group's next
// pigeon), the cards glide to their new places.
function airOrder(rail) {
  const live = [...rail.children].filter((c) => !c.classList.contains("out"));
  const sorted = [...live].sort((a, b) => +a.dataset.at - +b.dataset.at);
  if (sorted.every((c, i) => c === live[i])) return;
  const atStart = rail.scrollLeft < 8, was = new Map(live.map((c) => [c, c.getBoundingClientRect().left]));
  for (const c of sorted) rail.insertBefore(c, rail.querySelector(".acard.out"));
  if (atStart) rail.scrollLeft = 0;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const c of sorted) {
    const dx = was.get(c) - c.getBoundingClientRect().left;
    if (Math.abs(dx) > 1) c.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(.2,.9,.3,1)" });
  }
}
// A group card: each pigeon a dot along one line (nudged apart when they'd
// overlap), turning green with a pop as it lands.
function airDots(c, t) {
  const pts = c._pts, track = $(".atrack", c), n = pts.length;
  if (track.children.length !== n || [...track.children].some((d, i) => d.dataset.id !== pts[i].id))
    track.innerHTML = pts.map((p) => `<span class="adot ${p.kind}${p.lost ? " lost" : p.at <= t ? " done" : ""}" data-id="${esc(p.id)}"></span>`).join("");
  const gap = Math.min(0.1, 0.9 / Math.max(1, n)), fs = pts.map((p, i) => ({ i, f: Math.min(1, Math.max(0, p.lost ? (p.at - p.from) / Math.max(1, (p.end || p.at) - p.from) : (t - p.from) / Math.max(1, p.at - p.from))) })).sort((a, b) => a.f - b.f);
  fs.forEach((x, j) => { x.x = j ? Math.max(x.f, fs[j - 1].x + gap) : x.f; });
  for (let j = fs.length - 1; j >= 0; j--) fs[j].x = Math.min(fs[j].x, j === fs.length - 1 ? 1 : fs[j + 1].x - gap);
  let done = 0, lost = 0;
  for (const x of fs) {
    const d = track.children[x.i], p = pts[x.i], landed = !p.lost && p.at <= t;
    d.style.left = (Math.max(0, x.x) * 100).toFixed(2) + "%";
    if (p.lost) { lost++; d.classList.add("lost"); d.classList.remove("done"); continue; }
    if (landed) done++;
    if (landed && !d.classList.contains("done")) { d.classList.add("done", "pop"); setTimeout(() => d.classList.remove("pop"), 700); if (S.view === "messages" && !document.hidden) haptic("tick"); }
  }
  return { n, done, lost, back: lost > 0 && pts.every((p) => !p.lost || p.lost === "back"), next: pts.filter((p) => !p.lost && p.at > t).reduce((a, p) => Math.min(a, p.at), Infinity) };
}
function airLand(c) {
  if (c.classList.contains("landed")) return;
  c.classList.add("landed"); c.classList.remove("soon");
  setTimeout(() => c.classList.add("settled"), 1050);   // played once: a re-render mustn’t replay it
  if (S.view === "messages" && !document.hidden) haptic("success");
  airFold(c, 1900);
  setTimeout(() => sync(), 1150);                // the chat below shows what landed (once the tick has played)
}
function airFold(c, after) {
  setTimeout(() => {
    c.style.setProperty("--w", c.offsetWidth + "px");
    c.classList.add("out");
    setTimeout(() => { c.remove(); airTick(); }, 520);
  }, after);
}
// once a second: the countdowns, the pigeons along their tracks, and landings
function airTick() {
  if (!airEl) return;
  const t = now(), cards = [...$(".rail", airEl).children], flying = cards.filter((c) => !c.classList.contains("landed") && !c.classList.contains("out") && !c.classList.contains("lost"));
  let n = 0;
  for (const c of cards) {
    if (c._pts) {                                 // a group
      if (c.classList.contains("landed") || c.classList.contains("lost") || c.classList.contains("out")) continue;
      const g = airDots(c, t);
      const up = g.n - g.done - g.lost, gone = g.lost ? ` · ${g.lost} ${g.back ? "called back" : "lost"}` : "";
      $(".asub", c).textContent = `${g.done} of ${g.n} landed${gone}`;
      c.setAttribute("aria-label", `${$(".awho .one", c).textContent}: ${up} pigeon${up === 1 ? "" : "s"} in the air, ${g.done} landed${g.lost ? `, ${g.lost} ${g.back ? "called back" : "lost"}` : ""}. Open the chat.`);
      if (g.next === Infinity) { if (g.done) airLand(c); else { c.classList.add("lost"); airFold(c, 700); } continue; }
      n += up; c.dataset.at = g.next;
      $(".acd", c).textContent = airTime(g.next - t);
      c.classList.toggle("soon", g.next - t < 10 * MIN);
      continue;
    }
    const at = +c.dataset.at, from = +c.dataset.from, f = Math.min(1, Math.max(0, (t - from) / Math.max(1, at - from)));
    // (moved only by as much as shows, a thousandth of the track: on a long flight that's every few seconds or more,
    // rather than a fresh second-long glide, and a redraw, every second for each card)
    const fv = f.toFixed(3); if (c._f !== fv) { c._f = fv; c.style.setProperty("--f", fv); }
    if (c.classList.contains("landed") || c.classList.contains("lost")) continue;
    if (at <= t) { airLand(c); continue; }
    n++;
    $(".acd", c).textContent = airTime(at - t);
    if (c._space) { const sub = $(".asub", c), v = spaceSub(c._space, from, at); if (sub.textContent !== v) sub.lastChild ? (sub.lastChild.textContent = v) : (sub.textContent = v); }
    c.classList.toggle("soon", at - t < 10 * MIN);
    c.classList.toggle("final", at - t < MIN);
  }
  airOrder($(".rail", airEl));
  const next = flying.map((c) => +c.dataset.at).filter((x) => x > t).sort((a, b) => a - b)[0];
  clearTimeout(airSoon); if (next && next - t < 1500) airSoon = setTimeout(airTick, next - t + 20);    // (it lands on the dot, not up to a second after "0:00")
  airEl.classList.toggle("has", cards.length > 0);
  $(".airn", airEl).textContent = n ? ` · ${n}` : "";
  $(".airnext", airEl).textContent = next ? (cards.length > 1 ? `Next lands in ${airTime(next - t)}` : "") : cards.length ? "Landed" : "";
}

// The Skies: every pigeon in the air to or from you, from every chat.
let skiesLoading = null;
function loadSkies() { return (skiesLoading ||= loadSkies1().finally(() => { skiesLoading = null; })); }
async function loadSkies1() {
  try {
    const first = !S.skiesAt; S.skies = await api("skies"); S.skiesAt = Date.now(); if (S.sheet?.id === "skies") tickMap();
    // (the first, just after the list first showed: the strip is simply there, open, its cards still)
    if (first && airEl && performance.now() - (S.listAt || 0) < 800) { airQuiet = true; airEl.classList.add("still"); airSync(); void airEl.offsetWidth; airEl.classList.remove("still"); airQuiet = false; }
    else airSync();
  }
  catch (err) { if (!S.skies && !err.offline) toast(esc(err.message)); S.skiesAt = Date.now(); }        // (tried: not again at once, and no banner on every redraw)
}
function skyRoutes(all) {
  const d = S.skies; if (!d) return null;
  const out = [];
  for (const m of d.pigeons) {
    const other = m.from === S.me.id ? m.to : m.from, f = friend(other);
    out.push({ ...m, chat: other, out: m.from === S.me.id, who: f, label: `${m.from === S.me.id ? "To" : "From"} ${first(f?.name || "a friend")}` });
  }
  for (const m of d.groups) {
    const g = group(m.gid); if (!g) continue;
    if (m.from === S.me.id) for (const x of m.flock || []) {
      if (!x.flying) continue;
      const p = member(g, x.to);
      out.push({ ...x, id: m.id + ":" + x.to, sentAt: m.sentAt, pigeon: m.pigeon, risky: m.risky, skin: m.skin, fromPlace: m.fromPlace, chat: g.id, out: true, who: p, g, label: `To ${first(p?.name || "someone")} · ${g.name}` });
    } else out.push({ ...m, chat: g.id, out: false, who: member(g, m.from), g, label: `From ${first(member(g, m.from)?.name || "someone")} · ${g.name}` });
  }
  return out.filter((r) => (all || r.deliverAt > now()) && !(r.lostAt && r.lostAt <= now())).sort((a, b) => a.deliverAt - b.deliverAt);
}
function tickSkies(card, cv) {
  if (!card || !cv) return;
  const list = skyRoutes();
  if (!list) { if (!card._sk) { card._sk = 1; card.innerHTML = `<span class="speed">Looking up…</span>`; } return; }
  const onMap = list.filter((r) => r.route), n = list.length, key = list.map((r) => r.id).join() || "-";
  if (card.dataset.k !== key) {           // rows only change when the list does (the times tick by themselves)
    const first = !card._sk; card._sk = 1; card.dataset.k = key;
    const rows = list.map((r) => `<button type="button" class="frow skyrow" data-act="skyopen" data-id="${esc(r.chat)}">${r.g && !r.who ? gavatar(r.g, "xs") : avatar(r.who || { name: "?" }, "xs")}
        ${pgm(r)}<span class="one">${esc(r.label)}${r.route ? "" : ` <span class="hid">· not on map</span>`}</span><b><span data-eta="${esc(r.deliverAt)}">${fmtDur(r.deliverAt - now())}</span></b></button>`).join("");
    // (a pigeon taking off or landing: the card springs to its new size, the map re-fitting with it)
    const fill = () => { const top = $(".frows", card)?.scrollTop || 0; card.innerHTML = `<span class="big">${I.globe}<span>${n ? `${n} pigeon${n === 1 ? "" : "s"} in the air` : "Clear skies"}</span></span>
      ${n ? `<span class="speed">${list.filter((r) => r.out).length} yours, ${list.filter((r) => !r.out).length} coming to you</span>` : `<span class="speed">No pigeons are flying to or from you right now.</span>`}
      ${n ? `<span class="frows">${rows}</span>` : ""}`; const fr = $(".frows", card); if (fr && top) fr.scrollTop = top; };
    first ? fill() : cardMorph(card, fill);
  }
  // nothing in the air: just your roost
  const here = S.me.lat != null ? [{ here: true, route: [S.me.lat, S.me.lon, S.me.lat, S.me.lon], sentAt: 0, deliverAt: 1, km: 0, fromPlace: S.me.place, toPlace: S.me.place }] : [];
  const skies = onMap.length ? onMap : here;
  if (skies.length) { mapTick(cv, { skies }, card.offsetHeight + 14); smoothMap({ skies, lost: true }); }
}

// Your message to a group: how far each pigeon has got.
// A map's card: its words (redrawn every tick) and its buttons, kept (one
// redrawn under a finger never gets its tap): cheer it on while it flies, share it once it lands.
function cardShell(card) {
  if (!$(".mcb", card)) card.innerHTML = `<div class="mcb"></div><button type="button" class="btn wide plain lookbtn" data-act="lookup" hidden>${I.compass}Look Up</button><button type="button" class="btn wide plain cheerbtn" data-act="cheer" hidden>${I.wind}<span></span></button><button type="button" class="btn wide shareflight" data-act="shareflight" hidden>${I.share}Share Flight</button>`;
  return { share: $(".shareflight", card), cheer: $(".cheerbtn", card), look: $(".lookbtn", card) };
}
// Cheer it on: each cheer takes a little off the time it has left, up to three
// from each of you (twelve in all). Yours in the air, or the one flying to you.
const CHEER_EACH = 3, CHEER_MAX = 12;
function cheerable(m) {
  const t = now();
  if (m.flock) { const up = m.flock.filter((x) => x.flying && x.deliverAt - t > 60e3 && (x.cheers || 0) < CHEER_MAX); return { flying: m.flying, can: up.length > 0 && (m.cheered || 0) < CHEER_EACH, left: CHEER_EACH - (m.cheered || 0), them: true }; }
  // (landed by the clock, it's not flying: not only once the server's word comes, which would change the card a second time)
  const flying = m.flying && !m.waiting && !m.lost && !m.stopover && !(m.via && t < m.viaOff) && t < m.deliverAt;
  return { flying, can: flying && m.deliverAt - t > 60e3 && (m.cheered || 0) < CHEER_EACH && (m.cheers || 0) < CHEER_MAX, left: CHEER_EACH - (m.cheered || 0) };
}
function cheerState(btn, m) {
  const c = cheerable(m), label = c.can ? `Cheer ${c.them ? "Them" : "It"} On${c.left < CHEER_EACH ? ` · ${c.left} left` : ""}` : (m.cheered || 0) >= CHEER_EACH ? "Cheered On" : "Nearly There";
  const key = `${c.flying}|${c.can}|${label}|${m.id}`;
  if (btn.dataset.k === key) return;
  btn.dataset.k = key; btn.dataset.id = m.id; btn.hidden = !c.flying; btn.disabled = !c.can; $("span", btn).textContent = label;
}
/* ---------- Look up: which way your pigeon is, right now ----------
   Hold the phone up and turn: the sky ahead of you, with the pigeon where it really is (most often far past the
   curve of the Earth, so below the horizon), how far, and over where. A space pigeon: the Moon or Mars, where it is
   in your sky, or an orbital one going over. It uses where you've told Chat you are, and the phone's compass
   (iPhone asks first); without a compass, a dial says which way to face. */
const lookState = (btn, m) => { const on = !!lookAt(m); if (btn.hidden === on) btn.hidden = !on; btn.dataset.id = m.id; };
// where a pigeon in the air is from here: { az, el, km, over?, sky?, orbit? }, or null (landed, lost, not on the map,
// or you're not on the Earth)
// where you're looking from: where you are now, if you've asked (Where I Am; kept on this phone, only while Look Up is
// open), or where your profile says
const lookFrom = () => (look.here ? look.here : S.me?.lat != null && !S.me.moon ? { lat: S.me.lat, lon: S.me.lon } : null);
function lookAt(m, t = now()) {
  const me = lookFrom(); if (!me) return null;
  const o = moonOf(m);
  if (o) {
    if (o.lost || o.deliverAt <= t || t < o.sentAt) return null;
    if (o.mn.k === "orbit") {
      const [la, lo, phase] = orbitWhere(o.mn, t - o.sentAt);
      return { ...lookTo(me.lat, me.lon, la, lo, phase === "orbit" ? ORBIT.alt : 3), over: overWhere(lo, la), orbit: phase };
    }
    const mars = bodyOf(o.mn.from) === "mars" || bodyOf(o.mn.to) === "mars", f = (t - o.sentAt) / Math.max(1, o.deliverAt - o.sentAt);
    const out = bodyOf(o.mn.from) === "earth" ? distAt(o.mn, f) : bodyOf(o.mn.to) === "earth" ? 1 - distAt(o.mn, f) : 1;     // (how far out from the Earth)
    return { ...(mars ? marsLook(t, me.lat, me.lon) : moonLook(t, me.lat, me.lon)), km: out * (mars ? marsKm(t) : moonKm(t)), sky: mars ? "Mars" : "the Moon",
      home: bodyOf(o.mn.to) === "earth", surface: o.mn.k === "surface" };
  }
  if (m.flock || m.lost || m.deliverAt <= t || t < m.sentAt || !routesOf(m).length) return null;
  const [lon, lat] = pigeonLL(m);
  return { ...lookTo(me.lat, me.lon, lat, lon, 0.12), over: overWhere(lon, lat) };
}
// Its whole way across your sky, from where it set off to where it lands: a line through points along it, each as it
// would look from here (most of it under the horizon, past the curve of the Earth), the part flown solid
function lookArc(m) {
  if (m.flock || moonOf(m) || !m.route) return null;
  const me = lookFrom(); if (!me) return null;
  const pts = routePts(m), step = Math.max(1, Math.floor(pts.length / 80));
  const arc = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({ ...lookTo(me.lat, me.lon, latOf(p.y), p.x, 0.12), t: p.t }));
  return { arc, from: m.fromPlace || "where it set off", to: m.toPlace || "where it lands" };
}
async function lookHere(on) {
  const b = $(".lookhere", $layer);
  if (!on) { if (look.watch != null) navigator.geolocation?.clearWatch(look.watch); look.watch = null; look.here = null; look.tg = null; b?.setAttribute("aria-pressed", "false"); return; }
  if (!navigator.geolocation) return toast("This phone can’t say where it is, so Look Up uses where your profile says.");
  b?.setAttribute("aria-pressed", "true");
  look.watch = navigator.geolocation.watchPosition((p) => { look.here = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; look.tg = null; },
    () => { lookHere(false); toast("Couldn’t find where you are, so Look Up uses where your profile says."); }, { enableHighAccuracy: true, maximumAge: 30e3, timeout: 20e3 });
}
const look = { heading: null, pitch: 0, denied: false, raf: 0, tg: null, tgAt: 0, said: "", on: false, stars: null };
const POINTS = ["north", "north-north-east", "north-east", "east-north-east", "east", "east-south-east", "south-east", "south-south-east",
  "south", "south-south-west", "south-west", "west-south-west", "west", "west-north-west", "north-west", "north-north-west"];
const compassWord = (az) => POINTS[Math.round(az / 22.5) % 16];
const turnBy = (from, to) => ((to - from + 540) % 360) - 180;           // the shortest way round: + right, - left
function openLook(id) {
  // (an iPhone asks before it shares its compass, and only from a tap: this one)
  const ask = typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";
  const go = () => { S.sheet = { type: "lookup", id, chat: S.chat }; renderSheet(); };
  if (!ask) return go();
  DeviceOrientationEvent.requestPermission().then((r) => { look.denied = r !== "granted"; go(); }, () => { look.denied = true; go(); });
}
function lookSensor(e) {
  let h = typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading : e.absolute && e.alpha != null ? 360 - e.alpha : null;
  if (h == null) return;
  look.denied = false;   // (a heading's come after all: asked again in Settings, say, or never really refused)
  h = (h + (screen.orientation?.angle || 0) + 360) % 360;
  // smoothed, the shortest way round (a compass jitters)
  look.heading = look.heading == null ? h : (look.heading + turnBy(look.heading, h) * 0.2 + 360) % 360;
  if (typeof e.beta === "number") look.pitch += (Math.max(-60, Math.min(80, e.beta - 90)) - look.pitch) * 0.2;   // upright: the horizon ahead
}
function lookStart() {
  if (look.on) return;
  look.on = true; look.heading = null; look.said = "";
  addEventListener("deviceorientationabsolute", lookSensor); addEventListener("deviceorientation", lookSensor);
  if (!look.stars) { let x = 7; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647); look.stars = Array.from({ length: 220 }, () => [r() * 360, Math.asin(r()) / (Math.PI / 180), 0.4 + r() * 1.2]); }
  look.raf = requestAnimationFrame(lookLoop);
}
// What the lens takes in, corner to corner: a phone's main camera about 75°, an ultra-wide about 120°, a telephoto
// about 30°; zoomed in, less (where the phone says how far)
function lensFov(track) {
  const label = String(track?.label || "").toLowerCase(), st = track?.getSettings?.() || {};
  let fov = /ultra|0\.5/.test(label) ? 120 : /tele/.test(label) ? 30 : 75;
  if (st.zoom > 1) fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / st.zoom) * 180) / Math.PI;
  return fov;
}
// (a phone with several back cameras may hand over a combined, ultra-wide or zoomed one: the plain main one, if there is
// one, lines the sky up best)
async function mainCamera(stream) {
  const tr = stream.getVideoTracks()[0], odd = /ultra|tele|triple|dual|0\.5/i;
  if (!tr || !odd.test(tr.label || "")) return stream;
  const cams = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "videoinput" && /back|rear|environment/i.test(d.label) && !odd.test(d.label));
  if (!cams.length) return stream;
  try { const s2 = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cams[0].deviceId }, width: { ideal: 1280 } }, audio: false }); stream.getTracks().forEach((x) => x.stop()); return s2; }
  catch (_) { return stream; }
}
// Through the camera: the real sky ahead, with the pigeon drawn where it is. The picture stays on this phone (nothing
// is kept or sent), and the camera goes off as soon as you leave.
async function lookCamera(on) {
  const v = $(".lookvid", $layer), b = $(".lookcam", $layer);
  // off: the camera stops whatever else has gone (Back may already have taken the sheet away), and one still
  // starting is told not to bother
  if (!on) {
    look.camReq = (look.camReq || 0) + 1; look.camPending = false;
    look.stream?.getTracks().forEach((x) => x.stop()); look.stream = null;
    if (v) { v.srcObject = null; v.hidden = true; } b?.setAttribute("aria-pressed", "false"); return;
  }
  if (!v || !b || look.camPending || look.stream) return;
  const req = look.camReq = (look.camReq || 0) + 1; look.camPending = true; b.setAttribute("aria-pressed", "true");
  let stream;
  try { stream = await mainCamera(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })); }
  catch (_) { if (req === look.camReq) { look.camPending = false; b.hidden = true; b.setAttribute("aria-pressed", "false"); toast("The camera isn’t available, so here’s the sky drawn instead."); } return; }
  // (turned off, or Look Up left, while it was starting: it stops straight away)
  if (req !== look.camReq || !look.on || S.sheet?.type !== "lookup" || !$(".lookvid", $layer)) { stream.getTracks().forEach((x) => x.stop()); return; }
  look.camPending = false; look.stream = stream; look.fov = lensFov(stream.getVideoTracks()[0]);
  const v2 = $(".lookvid", $layer); v2.srcObject = stream; v2.hidden = false; v2.play().catch(() => {});
}
// the camera and where you are go off when the app goes to the background (turned on again by a tap on return)
document.addEventListener("visibilitychange", () => { if (document.hidden && (look.stream || look.camPending || look.watch != null)) { lookCamera(false); lookHere(false); } });
function lookStop() {
  lookCamera(false); lookHere(false); look.way = null;
  look.on = false; cancelAnimationFrame(look.raf);
  removeEventListener("deviceorientationabsolute", lookSensor); removeEventListener("deviceorientation", lookSensor);
}
function drawLook(s) {
  const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) { S.sheet = null; return renderSheet(); }
  if ($(".lookcv", $layer)) return;
  $layer.innerHTML = sheetHtml("Look Up", `<div class="look"><video class="lookvid" playsinline muted autoplay hidden></video><canvas class="lookcv" role="img" aria-label="The sky ahead of you, with the pigeon where it is"></canvas>
    <div class="lookbar"><button type="button" class="lookhere" data-act="lookhere" aria-pressed="false" aria-label="Use where I am now (it stays on this phone)">${I.loc}<span>Where I Am</span></button>
    <button type="button" class="lookcam" data-act="lookcam" aria-pressed="false" hidden>${I.camera || I.globe}<span>Camera</span></button></div>
    <div class="lookhud"><div class="lkwho"></div><div class="lkbig"></div><div class="lkwhere"></div><div class="lkhow" aria-live="polite"></div><div class="lksrc"></div></div></div>`, { flush: true, left: { label: "Back", act: "lookback" } });
  $(".sheet", $layer).classList.add("looksheet");
  // (the camera only helps with a compass to line it up)
  const cam = $(".lookcam", $layer); cam.hidden = !navigator.mediaDevices?.getUserMedia;
  look.tg = null; lookStart();
}
function lookLoop() {
  const s = S.sheet, cv = $(".lookcv", $layer);
  if (s?.type !== "lookup" || !cv || document.hidden) { if (s?.type !== "lookup") return lookStop(); look.raf = requestAnimationFrame(lookLoop); return; }
  const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id);
  if (!m) return lookStop();
  const t = now();
  if (!look.tg || t - look.tgAt > 500) {
    const me = lookFrom() || { lat: 0, lon: 0 };
    look.tg = lookAt(m, t); look.tgAt = t; look.sun = sunLook(t, me.lat, me.lon); look.moon = moonLook(t, me.lat, me.lon);
    if (!look.way || t - look.wayAt > 5000 || look.wayFrom !== `${me.lat},${me.lon}`) { look.way = lookArc(m); look.wayAt = t; look.wayFrom = `${me.lat},${me.lon}`;
      cv.setAttribute("aria-label", `The sky ahead of you, with the pigeon where it is${look.way ? `, and its way from ${look.way.from} to ${look.way.to}` : ""}`); }
  }
  if (!look.tg) { lookHud(m, null); const bar = $(".lookbar", $layer); if (bar) bar.hidden = true; return lookStop(); }       // landed while you looked
  lookDraw(cv, m); lookHud(m, look.tg);
  look.raf = requestAnimationFrame(lookLoop);
}
// the sky ahead (a compass): the horizon tilting as you tip the phone, its points, the stars or the day, the Moon,
// and the pigeon; or (no compass) a dial with it on, north up
function lookDraw(cv, m) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tg = look.tg, day = look.sun.el > -4, dusk = look.sun.el > -12 && !day, col = col0(kindOf(m));
  // (a camera the phone ended while the app was away isn't a view: back to the sky drawn)
  const live = look.heading != null && !look.denied, v = $(".lookvid", $layer), cam = live && look.stream?.getVideoTracks()[0]?.readyState === "live" && v?.videoWidth > 0;
  $(".lookcam", $layer).hidden = !live || !navigator.mediaDevices?.getUserMedia;
  // the camera coming on: the sky drawn until now fades away over it, rather than cutting to it
  if (cam !== !!look.camWas) {
    look.camWas = cam;
    if (cam && !STILL.matches && cv.width) {
      const gh = canvasCopy(cv, "lookghost");
      const a = gh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease", fill: "forwards" }); a.onfinish = a.oncancel = () => gh.remove();
    }
  }
  if (cam) g.clearRect(0, 0, W, H);
  else {
    const sky = g.createLinearGradient(0, 0, 0, H);
    if (day) { sky.addColorStop(0, "#2f78d6"); sky.addColorStop(1, "#9fcaf2"); } else if (dusk) { sky.addColorStop(0, "#14204a"); sky.addColorStop(1, "#c9724a"); }
    else { sky.addColorStop(0, "#03050f"); sky.addColorStop(1, "#16224a"); }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
  }
  if (!live) return lookDial(g, W, H, tg, col);
  // pixels per degree: a drawn sky shows 62° across; the camera, what its lens sees (a phone's main camera takes in about
  // 75° corner to corner), filling the screen
  let ppd = W / 62;
  if (cam) { const vw = v.videoWidth, vh = v.videoHeight, fit = Math.max(W / vw, H / vh), fov = 2 * Math.atan(Math.tan(((look.fov || 75) / 2) * Math.PI / 180) * vw / Math.hypot(vw, vh)) / (Math.PI / 180); ppd = (fit * vw) / fov; }
  const hd = look.heading, hy = H * 0.5 + look.pitch * ppd;
  const X = (az) => W / 2 + turnBy(hd, az) * ppd, Y = (el) => hy - el * ppd;
  if (!day && !cam) for (const [az, el, r] of look.stars) { const x = X(az), y = Y(el); if (x > -4 && x < W + 4 && y > -4 && y < hy) { g.fillStyle = `rgba(255,255,255,${dusk ? 0.35 : 0.8})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }
  // the Moon (and the Sun, by day), where they are
  if (cam) g.shadowColor = "rgba(0,0,0,.6)", g.shadowBlur = 4;          // (lines and words readable on any picture)
  if (look.moon.el > -1 && cam) { const x = X(look.moon.az), y = Y(look.moon.el); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 16, 0, 7); g.stroke(); g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText("The Moon", x, y - 24); }
  else if (look.moon.el > -1) { const x = X(look.moon.az), y = Y(look.moon.el); g.fillStyle = "#f4f1e6"; g.shadowColor = "rgba(255,255,230,.8)"; g.shadowBlur = 18; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.shadowBlur = 0; }
  if (day && !cam) { const x = X(look.sun.az), y = Y(look.sun.el), gl = g.createRadialGradient(x, y, 0, x, y, 60); gl.addColorStop(0, "rgba(255,250,220,.95)"); gl.addColorStop(1, "rgba(255,250,220,0)"); g.fillStyle = gl; g.fillRect(x - 60, y - 60, 120, 120); }
  // the ground, and the points of the compass along the horizon
  if (!cam) { g.fillStyle = day ? "#3f5a3a" : "#0b0f1c"; g.fillRect(0, hy, W, H - hy); }
  g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, hy); g.lineTo(W, hy); g.stroke();
  g.font = "600 13px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(255,255,255,.9)";
  for (let a = 0; a < 360; a += 15) {
    const x = X(a); if (x < -20 || x > W + 20) continue;
    g.beginPath(); g.moveTo(x, hy); g.lineTo(x, hy + (a % 45 ? 6 : 12)); g.stroke();
    if (!(a % 45)) g.fillText(["N", "NE", "E", "SE", "S", "SW", "W", "NW"][a / 45], x, hy + 28);
  }
  // its way: where it set off to where it lands, the part flown solid, the rest dashed, the two ends named
  if (look.way) {
    const ft = flightAt(m).t, pts = look.way.arc.map((p) => ({ x: X(p.az), y: Y(p.el), done: p.t <= ft }));
    g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round";
    // (each part one line, so its dashes run on; broken where it goes round the back of you)
    for (const done of [true, false]) {
      g.strokeStyle = done ? col : "rgba(255,255,255,.85)"; g.setLineDash(done ? [] : [8, 7]); g.beginPath();
      let on = false;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b.done !== done || Math.abs(b.x - a.x) > W * 0.6) { on = false; continue; }
        if (!on) { g.moveTo(a.x, a.y); on = true; }
        g.lineTo(b.x, b.y);
      }
      g.stroke();
    }
    g.setLineDash([]); g.font = "600 13px -apple-system, system-ui, sans-serif"; g.textAlign = "left";
    for (const [p, name] of [[pts[0], look.way.from], [pts[pts.length - 1], look.way.to]]) {
      if (p.x < 0 || p.x > W || p.y < 20 || p.y > H - 20) continue;
      g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 5, 0, 7); g.fill(); g.fillText(name, p.x + 10, p.y + 4);
    }
  }
  // the pigeon: under the horizon a line up to the point on it to face; off to the side, an arrow at the edge
  const x = X(tg.az), y = Y(tg.el), inX = x > 24 && x < W - 24, inY = y > 24 && y < H - 24;
  if (tg.el < 0 && inX && !look.way) { g.setLineDash([3, 4]); g.strokeStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.moveTo(x, hy); g.lineTo(x, Math.min(y, H - 30)); g.stroke(); g.setLineDash([]); }
  if (inX && inY) {
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 300);
    g.fillStyle = col; g.strokeStyle = "#fff"; g.lineWidth = 3; g.shadowColor = col; g.shadowBlur = 16;
    if (tg.el < 0 && cam) { g.font = "600 12px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(`${fmtMiles(tg.km)} away, past the horizon`, x, y + 32); g.fillStyle = col; }
    g.beginPath(); g.arc(x, y, 15 * pulse, 0, 7); g.fill(); g.shadowBlur = 0; g.stroke();
    g.save(); g.translate(x - 10, y - 9.5); g.scale(0.84, 0.84); g.fillStyle = "#fff"; g.fill(birdAt(0.9)); g.restore();      // (the pigeon in it)
  } else {
    const dx = turnBy(hd, tg.az), ex = dx > 0 ? W - 22 : 22, ey = Math.max(40, Math.min(H - 40, inY ? y : hy));
    g.save(); g.translate(ex, ey); g.rotate(dx > 0 ? 0 : Math.PI); g.fillStyle = col; g.strokeStyle = "#fff"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -11); g.lineTo(-8, 11); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  // facing it: the screen says so, and the phone taps once
  g.shadowBlur = 0;
  const on = Math.abs(turnBy(hd, tg.az)) < 6;
  if (on && !look.aligned) haptic("success");
  look.aligned = on;
}
const COL0 = new Map(), col0 = (k) => COL0.get(k) || (COL0.set(k, cssVar(document.documentElement, "--p-" + k) || "#3d9bff"), COL0.get(k));
function lookDial(g, W, H, tg, c) {
  const cx = W / 2, cy = H * 0.42, R = Math.min(W, H) * 0.32;
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.font = "600 14px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(255,255,255,.9)";
  ["N", "E", "S", "W"].forEach((p, i) => { const a = (i * 90 - 90) * Math.PI / 180; g.fillText(p, cx + Math.cos(a) * (R + 18), cy + Math.sin(a) * (R + 18)); });
  const a = (tg.az - 90) * Math.PI / 180;
  g.strokeStyle = c; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); g.stroke();
  g.fillStyle = c; g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 11, 0, 7); g.fill(); g.stroke();
  g.textBaseline = "alphabetic";
}
function lookHud(m, tg) {
  const hud = $(".lookhud", $layer); if (!hud) return;
  const mine = m.from === S.me.id || m.out, other = friend(mine ? m.to : m.from) || (m.gid ? member(group(m.gid), mine ? m.to : m.from) : null);
  const who = `${pgm(m)}<span>${mine ? "Your pigeon to" : "From"} ${esc(first(other?.name || "a friend"))}</span>`;
  if ($(".lkwho", hud)._h !== who) { $(".lkwho", hud).innerHTML = who; $(".lkwho", hud)._h = who; }
  if (!tg) { $(".lkbig", hud).textContent = "It’s landed"; $(".lkwhere", hud).textContent = ""; $(".lkhow", hud).textContent = ""; return; }
  const live = look.heading != null && !look.denied;
  $(".lkbig", hud).textContent = tg.sky ? (tg.surface ? `On ${tg.sky}` : `${fmtMiles(tg.km)} out`) : `${fmtMiles(tg.km)} away`;
  $(".lkwhere", hud).textContent = tg.sky ? (tg.surface ? "Across its surface, up there" : tg.home ? `On its way home from ${tg.sky}` : `On its way to ${tg.sky}`)
    : tg.orbit === "orbit" ? `In orbit, ${Math.round(ORBIT.alt * 0.621371)} miles up, over ${tg.over}` : `Over ${tg.over}`;
  const up = tg.el > 2 ? `${Math.round(tg.el)}° up` : tg.el < -1 ? (tg.sky ? "below the horizon just now" : "below the horizon, past the curve of the Earth") : "on the horizon";
  // (said again only when it changes enough to matter, so a screen reader isn't talking all the time)
  const turn = live ? Math.round(turnBy(look.heading, tg.az) / 10) * 10 : null;
  const how = live ? (look.aligned ? `There it is: ${up}.` : `Turn ${turn > 0 ? "right" : "left"} about ${Math.abs(turn) || 5}°. It’s ${up}.`)
    : `Face ${compassWord(tg.az)} (${Math.round(tg.az)}°). It’s ${up}.${look.denied ? " (Allow motion and orientation for the live compass.)" : ""}`;
  if (look.said !== how) { $(".lkhow", hud).textContent = how; look.said = how; }
  const src = look.here ? `From where you are now${look.here.acc ? ` (to within ${look.here.acc < 1000 ? `${Math.max(5, Math.round(look.here.acc / 5) * 5)} m` : `${(look.here.acc / 1609).toFixed(1)} mi`})` : ""}` : `From ${S.me.place || "where your profile says"}`;
  if ($(".lksrc", hud).textContent !== src) $(".lksrc", hud).textContent = src;
}
// "12 minutes", "1h 4m", "a few seconds"
const soonerText = (ms) => (ms < MIN ? "a few seconds" : ms < HOUR ? `${Math.round(ms / MIN)} minute${Math.round(ms / MIN) === 1 ? "" : "s"}` : fmtDur(ms));
function tickFlockMap(m, card, cv) {
  const g = group(S.chat), c = flockCount(m), end = Math.max(...m.flock.map((x) => x.deliverAt));
  const frac = Math.min(1, Math.max(0, (now() - m.sentAt) / Math.max(1, end - m.sentAt)));
  const rows = [...m.flock].sort((a, b) => a.deliverAt - b.deliverAt).map((x) => {
    const p = member(g, x.to), state = x.recalled ? `<span class="homing">${I.homing} Called back</span>` : x.lost ? `<span class="lostp">${I.skull} Lost</span>` : x.flying ? `<span data-eta="${esc(x.deliverAt)}">${fmtDur(x.deliverAt - now())}</span>` : "Landed";
    return `<span class="frow${x.flying ? " flying" : ""}">${avatar(p || { name: "?" }, "xs")}<span class="one">${esc(first(p?.name || "Someone"))}${x.route ? "" : ` <span class="hid">· not on map</span>`}</span><b>${state}</b></span>`;
  }).join("");
  const { share, cheer, look } = cardShell(card); share.hidden = true; look.hidden = true; cheerState(cheer, m);
  const html = `<span class="big">${pgm(m)}<span>${c.next ? `${c.landed} of ${c.n} landed` : c.lost === c.n ? "All lost" : `Landed for ${c.landed} of ${c.n}`}</span></span>
    ${c.next ? `<span class="speed">Next lands in ${fmtDur(c.next - now())}</span>` : ""}${birdLine(m)}
    <span class="prog k-${kindOf(m)}"><i>${I.bird}</i></span><span class="frows">${rows}</span>`;
  // (drawn again only when what it says changes, not every second: a list you'd scrolled stays put, and the card
  // springs to a new size)
  const mcb = $(".mcb", card);
  if (mcb._html !== html) {
    const fill = () => { const top = $(".frows", card)?.scrollTop || 0; mcb.innerHTML = html; mcb._html = html; const fr = $(".frows", card); if (fr && top) fr.scrollTop = top; };
    mcb._html ? cardMorph(card, fill) : fill();
  }
  $(".prog i", card).style.width = (frac * 100).toFixed(2) + "%";
  if (routesOf(m).length) { mapTick(cv, m, card.offsetHeight + 14); smoothMap({ ...m, lost: true }); }
}
// The once-a-second tick is plenty for a slow pigeon, but taking off, landing or a fast short hop would judder: then
// the pigeon moves on over the map as drawn every frame, and the whole map is drawn again twice a second (so the line
// flown keeps up). Otherwise just the wings flap (and the wind blows), and a pigeon just landed gets its ring.
let mapAnim = 0, mapAnimAt = 0;
function smoothMap(m) {
  if (mapAnim || STILL.matches) return;
  const f = flightAt(m), moving = !m.lost && f.phase !== "landed" && !(f.phase === "cruise" && m.deliverAt - m.sentAt > HOUR);
  mapAnim = requestAnimationFrame(function step(ts) {
    mapAnim = 0;
    if (S.sheet?.type !== "map" || document.hidden) return;
    const cv = $(".map", $layer);
    if (!cv) return;
    // (its first picture still to come, or the map moving or just moved: the picture as it was, moved and scaled to fit, till it's drawn again)
    if (!cv._base || mapMoving() || cv._dirty) { if (cv._base && cv._ffTs !== ts) fastFrame(cv); mapAnim = requestAnimationFrame(step); return; }
    if (moving) {
      const ok = placeBirds(cv, cv._m);
      if ((!ok || ts - (cv._fullAt || 0) > 500) && ts - mapAnimAt >= 30) { mapAnimAt = ts; return tickMap(500); }     // (tickMap calls back here)
      drawBirds(cv, ts); mapAnim = requestAnimationFrame(step); return;
    }
    if (ts - mapAnimAt < 30) { mapAnim = requestAnimationFrame(step); return; }
    mapAnimAt = ts;
    const landing = cv._birds?.some((b) => b.phase === "landed" && now() - b.r.deliverAt < 1000);
    if (!cv._birds?.some((b) => b.phase !== "landed" && b.phase !== "lost") && !(windOn() && S.windGrid) && !landing) return;
    placeBirds(cv, cv._m); drawBirds(cv, ts);
    mapAnim = requestAnimationFrame(step);
  });
}
// (as a share, --f, that the bar and its pigeon are moved by: transforms only, so the second-by-second glide doesn't lay
// the page out again every frame)
function setProgress(el) {
  el.querySelectorAll(".ctrack[data-from], .trk[data-from]").forEach((e) => { const a = +e.dataset.from, b = +e.dataset.to; e.style.setProperty("--f", Math.min(1, Math.max(0, (now() - a) / (b - a))).toFixed(4)); });
}
function live() {
  if (document.hidden) return;                       // nothing to see: nothing to redraw
  const r = root();
  r.querySelectorAll("[data-eta]").forEach((e) => { const v = fmtDur(+e.dataset.eta - now()); if (e.textContent !== v) e.textContent = v; });
  r.querySelectorAll("[data-clock]").forEach((e) => { const c = clockIn(now(), e.dataset.clock); if (e.textContent !== c) e.textContent = c; });
  setProgress(r);
  if (S.view === "messages") airTick();
  if (S.view === "chat") renderCompose();
  tickMap();
}

/* ---------- menus, action sheets and banners ---------- */
// iOS-style context menu anchored to a button. items: {label, sub, icon, act, id, destructive}
function openMenu(anchor, items) {
  haptic("tick");
  clearTimeout(popTimer);
  const box = root().getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const up = a.top - box.top > box.height * 0.55;
  const right = a.left + a.width / 2 > box.left + box.width / 2;
  $pop.innerHTML = `<div class="menu-scrim" data-act="closepop"></div>
    <div class="menu-pop" role="menu">${items.map((it) =>
      `<button class="mi${it.destructive ? " destructive" : ""}${it.sub ? " two" : ""}" role="menuitem" data-act="${it.act}"${it.id ? ` data-id="${esc(it.id)}"` : ""}><span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span>${it.icon || ""}</button>`).join("")}</div>`;
  const m = $(".menu-pop", $pop);
  if (up) m.style.bottom = `${box.bottom - a.top + 6}px`; else m.style.top = `${a.bottom - box.top + 6}px`;
  if (right) m.style.right = `${Math.max(8, box.right - a.right)}px`; else m.style.left = `${Math.max(8, a.left - box.left)}px`;
  m.style.setProperty("--origin", `${up ? "bottom" : "top"} ${right ? "right" : "left"}`);
  popOpened($(".mi", m)); syncInert();
}
function openActions({ title, message, actions }) {
  clearTimeout(popTimer);
  $pop.innerHTML = `<div class="scrim" data-act="closepop"></div><div class="asheet" role="dialog" aria-label="${esc(title || "Confirm")}">
    <div class="grp">${title || message ? `<div class="msg">${title ? `<b>${esc(title)}</b>` : ""}${esc(message || "")}</div>` : ""}${actions.map((x) =>
      `<button class="ab${x.destructive ? " destructive" : ""}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""}>${esc(x.label)}</button>`).join("")}</div>
    <button class="cancel" data-act="closepop">Cancel</button></div>`;
  popOpened($(".asheet .ab", $pop)); syncInert();
}
let popTimer = 0, popFrom = null, keyAt = -1e9;
// For a keyboard or VoiceOver: a menu or question opened with Enter or Space starts on its first choice, Up and Down
// (Home, End) move through them, and once it's closed (Escape, or a choice made) focus goes back to what opened it
document.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") keyAt = performance.now(); }, true);
document.addEventListener("pointerdown", () => { keyAt = -1e9; }, true);
function popOpened(first) {
  const a = document.activeElement;
  if (a && a !== document.body && !$pop.contains(a)) popFrom = a;
  if (!$pop._keys) { $pop._keys = 1; $pop.addEventListener("keydown", popKeys); }
  if (performance.now() - keyAt < 600) first?.focus({ preventScroll: true });
}
function popKeys(e) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = [...$pop.querySelectorAll(".menu-pop:not(.closing) .mi, .asheet:not(.closing) button")], n = items.length; if (!n) return;
  const i = items.indexOf(document.activeElement);
  e.preventDefault();
  items[e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowDown" ? (i + 1) % n : i < 0 ? n - 1 : (i - 1 + n) % n].focus({ preventScroll: true });
}
function closePop() {
  if (!$pop || !$pop.firstElementChild) return;
  const live = $pop.querySelectorAll(".menu-pop:not(.closing), .asheet:not(.closing)");
  if (!live.length) return;
  // (from wherever it had got to, if it's still coming in; taken away once its exit has played: styles.css .asheet.closing)
  $pop.querySelectorAll(".menu-pop, .asheet, .scrim, .menu-scrim, .lifted").forEach((e) => { freeze(e); e.classList.add("closing"); });
  syncInert();
  clearTimeout(popTimer); popTimer = setTimeout(() => {
    // (focus that's fallen to the page is lost too: what opened it was made inert under it, and let it go. Not for a
    // field, though, whose keyboard has gone: that doesn't come back up unasked)
    const f = popFrom, a = document.activeElement, lost = $pop.contains(a) || ((!a || a === document.body) && !inField(f)); popFrom = null;
    $pop.innerHTML = "";
    if (lost && f?.isConnected) f.focus({ preventScroll: true });
  }, STILL.matches ? 220 : 320);
}
let toastTimer = 0;
function toast(html, btn, fn) {
  if (!$toast || S.locked) return;                 // nothing shows over the lock
  const inner = `<span class="ticon" aria-hidden="true">${I.bird}</span><span>${html}</span>${btn ? `<button type="button" class="btn small" data-act="toast">${esc(btn)}</button>` : ""}`;
  // one already showing takes the new words where it is (they rise into place); else a new one drops in
  const cur = $(".toast:not(.out)", $toast);
  if (cur) { cur.innerHTML = inner; cur.classList.remove("swap"); void cur.offsetWidth; cur.classList.add("swap"); }
  else $toast.insertAdjacentHTML("beforeend", `<div class="toast">${inner}</div>`);
  S.toastFn = fn;
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, btn ? 5000 : 3500);
}
function hideToast() {
  const t = $(".toast:not(.out)", $toast); if (!t) return;
  clearTimeout(toastTimer); t.style.animation = ""; t.classList.add("out");     // (a swipe that let it go back left its own)
  setTimeout(() => { if (t.isConnected) t.remove(); }, STILL.matches ? 220 : 380);
}

/* ============================================================
   Actions
   ============================================================ */
function showErr(msg, field) {
  const scope = S.sheet && $("form", $layer) ? $layer : root();
  scope.querySelectorAll(".fcell.bad").forEach((e) => e.classList.remove("bad"));
  const f = field && $(`#f-${field}`, scope)?.closest(".fcell");
  if (f) { f.classList.add("bad"); $("input, textarea", f)?.focus(); }
  const g = $(".ferr", scope); if (g) { g.textContent = msg; g.hidden = false; } else toast(esc(msg));
}
// (the button's words fade to what it's doing, and back, and it keeps at least the width it had: nothing beside it jumps)
async function busyBtn(btn, label, fn) {
  const old = btn?.innerHTML, fade = (b) => { if (!STILL.matches) b.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 200, easing: "ease" }); };
  if (btn) { btn.style.minWidth = `${btn.offsetWidth}px`; btn.disabled = true; btn.textContent = label; fade(btn); }
  // (one that has become what it found, the place you're in, stays as it is)
  try { return await fn(); } finally { if (btn && btn.isConnected && !btn.classList.contains("done")) { btn.disabled = false; btn.innerHTML = old; btn.style.minWidth = ""; fade(btn); } }
}
// Buttons that ask the server for something only go once until it has answered
// (a double tap can't accept twice, buy twice or send two emails).
const ONCE_ACTS = new Set(["acctsignin", "acctjoin", "accept", "declinego", "cancelreq", "unblock", "sessend", "sessothersgo", "confirmsend", "pushtest", "buyitem", "wearon", "birdretirego", "wave", "cheer", "resetkeep", "resetfresh"]);
const acting = new Set();
async function onClick(e) {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  if (!t.closest(".layer, .poplayer")) lastTap = { act: t.dataset.act, id: t.dataset.id };     // (what a sheet opened from it gives focus back to)
  if (ONCE_ACTS.has(t.dataset.act)) {
    const key = `${t.dataset.act}:${t.dataset.id || ""}`;
    if (acting.has(key)) return;
    acting.add(key);
    try { return await onClick1(e, t); } finally { acting.delete(key); }
  }
  return onClick1(e, t);
}
async function onClick1(e, t) {
  const id = t.dataset.id;
  const inPop = !!t.closest(".poplayer") && t.dataset.act !== "closepop";
  if (inPop) closePop();
  if (t.getAttribute("role") === "switch" || t.dataset.act === "pigeon" || t.dataset.act === "schedpick" || t.dataset.act === "viapick") haptic("tick");
  switch (t.dataset.act) {
    case "tab": return go(id);
    // Search, beside the tabs: Friends' search where you're on Friends, else Messages' (within the tap, so the keyboard comes)
    case "tabsearch": {
      if (S.view !== "friends" && S.view !== "messages") go("messages");
      const f = $(S.view === "friends" ? "#fsearch" : "#msearch", $view);
      if (!f) return toast(S.view === "friends" ? "No friends to search yet." : "No messages to search yet.");
      f.scrollIntoView({ block: "center", behavior: STILL.matches ? "auto" : "smooth" }); f.focus({ preventScroll: true });
      return;
    }
    case "lockpick": { const lp = lockPrefs(); if (lp) setLockPrefs({ ...lp, after: Number(id) || 0 }); render(); return renderSheet(); }
    case "youmenu": return youMenu(t);
    case "to": return go(id);
    case "open":
      if (holding() && Date.now() - heldAt < 800 && !inPop) return;   // the end of a hold, not a tap
      return go("chat", id);
    case "shareflight": return openShare(id || t.dataset.id);
    case "birds": S.sheet = { type: "birds" }; return renderSheet();
    case "feathers": return openFeathers();
    case "newsall": S.sheet = { type: "news" }; renderSheet(); return loadNews(true);
    case "loft": return openLoft(id);
    case "loftback": S.sheet = { type: "friendinfo", id: S.sheet?.id }; return renderSheet();
    case "seasonhide": case "seasontry": { const s = seasonNow(); try { if (s) localStorage.setItem("inflight-season", s.key); } catch (_) {} render(); if (t.dataset.act === "seasontry") { haptic("tick"); return openFlightLog("skins"); } return; }
    case "buyitem": {
      const it = S.sheet?.data?.items.find((x) => x.id === id); if (!it) return;
      try { const r = await api("feathers-buy", { method: "POST", body: { item: id } }); S.sheet.data = r; S.feathers = r.feathers; haptic("success"); renderSheet(); render();
        toast(`${it.emoji} The ${esc(it.name.toLowerCase())} is yours.`, S.birds.length ? "Put It On" : null, S.birds.length ? () => wearItem(id, $(`[data-act=wearitem][data-id="${id}"]`, $layer) || $layer) : null); }
      catch (err) { toast(esc(err.message)); }
      return;
    }
    case "wearitem": return wearItem(id, t);
    case "wearon": { const [item, bird] = String(id).split("|"); closePop(); return putOn(bird, item === "none" ? null : item); }
    case "wearpick": {
      const w = await walletData(); if (!w) return;
      const b = S.birds.find((x) => x.id === id), owned = w.items.filter((x) => x.owned);
      if (!owned.length) { S.sheet = { type: "feathers", data: w, back: id }; renderSheet(); return toast("Buy something in the shop first."); }
      return openMenu(t, [...owned.map((x) => ({ label: `${x.emoji} ${x.name}`, sub: x.on && x.on.id !== id ? `On ${x.on.name}` : x.on?.id === id ? "Wearing" : "", act: "wearon", id: `${x.id}|${id}` })),
        ...(b?.wear ? [{ label: "Take It Off", act: "wearon", id: `none|${id}`, destructive: true }] : [])]);
    }
    case "bird": S.sheet = { type: "bird", id }; return renderSheet();
    case "birdnew": S.sheet = { type: "birdname" }; return renderSheet();
    case "birdrename": S.sheet = { type: "birdname", id }; return renderSheet();
    case "birdback": S.sheet = S.sheet?.id ? { type: "bird", id: S.sheet.id } : { type: "birds" }; return renderSheet();
    case "birdretire": { const b = S.birds.find((x) => x.id === id); return b && openMenu(t, [{ label: `Retire ${b.name}`, icon: I.bird, act: "birdretired", id }]); }
    case "birdretired": {
      const b = S.birds.find((x) => x.id === id); if (!b) return;
      try {
        const r = await api("bird-retire", { method: "POST", body: { id } });
        S.birds = r.birds; S.hall = r.hall; haptic("success"); toast(`${esc(b.name)} retires a Legend.`);
        S.sheet = { type: "bird", id }; renderSheet(); render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "birdset": S.flyTap = t; S.birdPick = id; renderCompose(); if (S.sheet?.type === "flysheet") renderSheet(); return;
    case "momrun": {
      const box = t.closest(".momrun"), list = box?.querySelector(".momlist"); if (!list) return;
      const open = !momOpen.has(id); open ? momOpen.add(id) : momOpen.delete(id);
      haptic(); box.classList.toggle("open", open); t.setAttribute("aria-expanded", open); list.hidden = !open;
      box.classList.toggle("unfold", open); if (open) setTimeout(() => box.classList.remove("unfold"), 600);
      return;
    }
    case "wave": {
      const chat = S.chat, x = (S.fly.get(chat) || []).find((y) => y.id === id && !y.mine); if (!x || x.waved) return;
      t.disabled = true;
      try {
        const r = await api("wave", { method: "POST", body: { id } });
        haptic("success"); x.waved = r.waved; wavedNow = id; setTimeout(() => { if (wavedNow === id) wavedNow = null; }, 1500);
        if (S.chat === chat) render();
        toast(`You waved. ${esc(first(friend(chat)?.name || "They"))} will see it.`);
      } catch (err) { toast(esc(err.message)); t.disabled = false; }
      return;
    }
    case "lookup": return openLook(id);
    case "lookcam": return look.on && lookCamera(!(look.stream || look.camPending));
    case "lookhere": return look.on && lookHere(look.watch == null);
    case "lookback": S.sheet = { type: "map", id: S.sheet?.id }; return renderSheet();
    case "cheer": {
      const chat = S.chat, m = (S.msgs.get(chat) || []).find((x) => x.id === id); if (!m || !cheerable(m).can) return;
      if (t.classList.contains("cheerbtn")) t.disabled = true;
      try {
        const r = await api(group(chat) ? "group-cheer" : "cheer", { method: "POST", body: { id } });
        haptic("success"); cheerFx = { id, at: performance.now() };
        toast(`A little tailwind: it lands ${esc(soonerText(r.cut))} sooner.`);
        await loadChat(chat); if (S.chat === chat) { render(); tickMap(); }
      } catch (err) { toast(esc(err.message)); if (t.classList.contains("cheerbtn")) { t.dataset.k = ""; tickMap(); } }
      return;
    }
    case "sharefmt": {
      const s = S.sheet; if (s?.type !== "shareflight") return;
      s.fmt = id; $layer.querySelectorAll(".shopt").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
      const go = $("[data-act=shareimg]", $layer); if (go) go.disabled = !s.urls[id];
      return;
    }
    case "sharename": {
      const s = S.sheet; if (s?.type !== "shareflight") return;
      s.name = !s.name; try { localStorage.setItem("inflight-share-name", s.name ? "1" : "0"); } catch (_) {}
      t.setAttribute("aria-checked", String(s.name)); $(".switch", t)?.classList.toggle("on", s.name);
      return shareRender(s);
    }
    case "shareimg": return shareImage();
    case "shareback": { const s = S.sheet; S.sheet = s?.id ? { type: "map", id: s.id } : null; return renderSheet(); }
    case "rowread": {
      const g = group(id), f = friend(id);
      if (g) { g.unread = 0; api("group-read", { method: "POST", body: { id } }).catch(() => {}); }
      else if (f) { f.unread = 0; api("read", { method: "POST", body: { with: id } }).catch(() => {}); }
      return render();
    }
    case "rowmute": {
      const g = group(id); if (!g) return;
      const on = !g.muted; g.muted = on; toast(on ? `${esc(g.name)} is muted.` : `${esc(g.name)} is unmuted.`);
      try { await api("group-mute", { method: "POST", body: { id, muted: on } }); }
      catch (err) { g.muted = !on; toast(esc(err.message)); }
      return;
    }
    case "newmsg": S.sheet = { type: "newmsg" }; return renderSheet();
    case "newgroup": S.sheet = { type: "newgroup", pick: new Set() }; renderSheet(); setTimeout(() => $("#f-gname", $layer)?.focus(), SHEET_SLIDE_MS); return;     // (once it's up: the keyboard doesn't rise while it slides)
    case "groupadd": S.sheet = { type: "groupadd", id: id || S.sheet?.id, pick: new Set() }; return renderSheet();
    case "gpick": {
      const s = S.sheet; if (!s?.pick) return;
      s.name = $("#f-gname", $layer)?.value; s.pick.has(id) ? s.pick.delete(id) : s.pick.add(id); return renderSheet();
    }
    case "groupinfo": S.sheet = { type: "groupinfo", id: id || S.sheet?.id || S.chat }; return renderSheet();
    case "groupmenu": {
      const g = group(S.chat); if (!g) return;
      return openMenu(t, [
        { label: "Group Info", icon: I.info, act: "groupinfo", id: g.id },
        { label: "Add People", icon: I.addp, act: "groupadd", id: g.id },
        { label: "Leave Group", icon: I.minusp, act: "groupleaveask", id: g.id, destructive: true },
      ]);
    }
    case "groupleaveask": {
      const g = group(id); if (!g) return;
      return openActions({ title: `Leave ${g.name}?`, message: "You’ll stop getting its pigeons, and won’t see anything sent after you leave.", actions: [{ label: "Leave Group", act: "groupleave", id, destructive: true }] });
    }
    case "groupleave":
      try { await api("group-leave", { method: "POST", body: { id } }); S.sheet = null; renderSheet(); await sync(); go("messages"); toast("You left the group."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "trustm": return trustNewKey(id);
    case "grouprename": S.sheet = { type: "grouprename", id }; return renderSheet();
    case "flightlog": return openFlightLog();
    case "passport": haptic("tick"); return openPassport(id || null);
    case "flightlogback": S.sheet = { type: "flightlog", data: S.sheet?.data || null }; renderSheet(); if (!S.sheet.data) openFlightLog(); return;
    case "ppturn": { const book = $(".ppbook", $layer); if (book) { haptic("tick"); book.scrollBy({ left: +id * book.clientWidth, behavior: STILL.matches ? "auto" : "smooth" }); } return; }
    case "pmarkinfo": {
      const [mid, pid] = String(id).split(":"), m = (S.msgs.get(S.chat) || []).find((x) => x.id === mid), pm = m?.postmarks?.find((x) => x.id === pid); if (!pm) return;
      haptic("tick");
      const mine = m.from === S.me.id, who = mine ? "Your pigeon" : `${esc(first((group(S.chat) ? member(group(S.chat), m.from) : friend(S.chat))?.name || "Their"))}’s pigeon`;
      return toast(`${who} flew past ${esc(pm.name)} on ${esc(fmtDate(pm.at))}.`, mine ? "Postmarks" : null, mine ? () => openFlightLog() : null);
    }
    case "pmarkall": {
      const x = S.sheet?.data?.postmarks?.marks.find((p) => p.id === id); if (!x) return;
      haptic("tick");
      return toast(`${esc(x.name[0].toUpperCase() + x.name.slice(1))}: first flown past ${esc(fmtDate(x.at))}${x.n > 1 ? `, and ${x.n - 1} flight${x.n === 2 ? "" : "s"} since` : ""}.`);
    }
    case "stampinfo": {
      const p = S.sheet?.data?.passport?.places.find((x) => x.name === id); if (!p) return;
      t.classList?.add("pphit"); setTimeout(() => t.classList?.remove("pphit"), 450);
      haptic("tick");
      return toast(`${esc(p.name[0].toUpperCase() + p.name.slice(1))}: first flown over ${esc(fmtDate(p.at))}${p.n > 1 ? `, and ${p.n - 1} flight${p.n === 2 ? "" : "s"} since` : ""}.`);
    }
    case "gifs": S.sheet = { type: "gifs", q: "", list: [], next: 0, busy: false }; renderSheet(); return loadGifs();
    case "gifmore": return loadGifs(true);
    case "gifpick": return pickGif(id, t);
    case "gmute": {
      const g = group(id); if (!g) return;
      const on = !g.muted; g.muted = on; renderSheet();            // the switch moves straight away
      try { await api("group-mute", { method: "POST", body: { id, muted: on } }); }
      catch (err) { g.muted = !on; renderSheet(); toast(esc(err.message)); }
      return;
    }
    case "requests": S.sheet = { type: "requests" }; return renderSheet();
    case "addfriend": S.sheet = { type: "addfriend" }; return renderSheet();
    case "safetylist": S.sheet = { type: "safetylist" }; return renderSheet();
    case "securitysheet": {
      S.sheet = { type: "security" }; renderSheet();
      // how many places you're signed in, for its row (quietly: the row just has no number if this fails)
      // (put straight into its row, not a redraw: that would replace the sheet under your finger)
      api("sessions").then(({ sessions }) => {
        S.sessN = sessions.length;
        const row = S.sheet?.type === "security" && $('.sheet [data-act=sessionssheet]', $layer); if (!row) return;
        const v = $(".val", row) || row.insertBefore(Object.assign(document.createElement("span"), { className: "val" }), $(".chev", row));
        v.textContent = S.sessN;
      }).catch(() => { S.sessN = null; const v = S.sheet?.type === "security" && $('.sheet [data-act=sessionssheet] .val', $layer); if (v) v.remove(); });
      return;
    }
    case "encryptionsheet": S.sheet = { type: "encryption" }; return renderSheet();
    case "passkeys": S.sheet = { type: "passkeys" }; return renderSheet();
    case "friendinfo": S.sheet = { type: "friendinfo", id: id || S.chat }; return renderSheet();
    case "close":
      if (S.sheet?.type === "askpw") S.sheet.resolve(null);
      if (S.sheet?.type === "reauth") { const r = S.sheet.resolve; S.sheet = S.sheet.back || null; renderSheet(); return r(false); }
      S.sheet = null; return renderSheet();
    case "closepop": return closePop();
    case "submit": return $("#" + id, $layer)?.requestSubmit();
    case "map": S.sheet = { type: "map", id }; return renderSheet();
    case "skies": S.sheet = { type: "map", id: "skies" }; renderSheet(); return loadSkies();
    case "skyopen": S.sheet = null; renderSheet(); return go("chat", id);
    case "airopen": haptic("tick"); S.mapNext = t.dataset.m; return go("chat", id);
    case "msgmenu": return openReactMenu(t, id);
    case "react": return sendReact(id, t.dataset.e);
    case "reply": {
      const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id), p = m && S.plain.get(id); if (!p) return;
      S.replyTo = { chat: S.chat, id, from: m.from, t: String(p.t || "").replace(/\s+/g, " ").slice(0, 90), p: p.v ? "voice" : p.p ? (p.p.m === "image/gif" ? "gif" : "photo") : "" };
      renderCompose(); $ta.focus(); return;
    }
    case "unreply": S.replyTo = null; return renderCompose();
    case "copymsg": {     // (the words are copied, not the page: copying is otherwise kept to the fields)
      const t = S.plain.get(id)?.t; if (typeof t !== "string" || !t) return;
      try { await navigator.clipboard.writeText(t); haptic("tick"); toast("Copied."); } catch (_) { toast("Couldn’t copy that here."); }
      return;
    }
    case "tonew": $view.scrollTo({ top: $view.scrollHeight, behavior: STILL.matches ? "auto" : "smooth" }); return newPill(false);
    case "searchopen": {
      const mid = t.dataset.m; S.q = ""; go("chat", id);
      const jump = () => { const el = $(`[data-mid="${CSS.escape(mid)}"]`, $view); if (!el) return false; S.stick = false; el.scrollIntoView({ block: "center" }); flashMsg(el, mid); return true; };
      if (!jump()) { let n = 0; const iv = setInterval(() => { if (jump() || ++n > 30) clearInterval(iv); }, 150); }
      return;
    }
    case "jumpto": {
      const el = $(`[data-mid="${CSS.escape(id)}"]`, $view); if (!el) return;
      el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      flashMsg(el, id); return;
    }
    case "applock": {
      if (lockPrefs()) { setLockPrefs(null); haptic("tick"); toast("Chat won’t lock."); render(); return renderSheet(); }
      if (!S.passkeys?.length) { toast("Add a passkey first: it’s what unlocks Chat."); S.sheet = { type: "passkeys" }; return renderSheet(); }
      try { await lockCheck(); } catch (_) { return toast("Couldn’t check it’s you, so Chat won’t lock yet."); }
      setLockPrefs({ on: true, after: 0 }); haptic("success"); toast("Chat locks when you leave it."); render(); return renderSheet();
    }
    case "unlock": return unlock();
    case "lockout": return openActions({ message: "Sign out of Chat on this phone? You’ll need your password or a passkey to sign in again.", actions: [{ label: "Sign Out", act: "signoutgo", destructive: true }] });
    case "reauthpk": {
      try { await busyBtn(t, "Waiting for your passkey…", reauthPasskey); const s = S.sheet; S.sheet = s.back || null; renderSheet(); haptic("success"); s.resolve(true); }
      catch (err) { if (err?.name !== "NotAllowedError") toast(esc(err.message || "That passkey didn’t work.")); }
      return;
    }
    case "recstart": return recStart();
    case "reccancel": return recStop(false);
    case "recsend": return recStop(true);
    case "vplay": return voicePlay(id);
    case "outmenu": {
      const o = S.outbox.find((x) => x.id === id); if (!o) return;
      return openMenu(t, [{ label: o.err ? "Try Again" : "Send Now", icon: I.up, act: "outretry", id }, { label: "Delete", icon: I.trash, act: "outdel", id, destructive: true }]);
    }
    case "outretry": {
      closePop(); const o = S.outbox.find((x) => x.id === id);
      if (o) {
        try { if (o.err) await outboxRetry(o); o.err = null; }
        catch (e) { o.err = e.message || "This pigeon couldn’t be sealed again. Delete it and send it again."; await outboxSave(); return render(); }
        await outboxSave(); render();
      }
      return outboxFlush(true);
    }
    case "outdel": { closePop(); S.outbox = S.outbox.filter((x) => x.id !== id); await outboxSave(); haptic("tick"); return render(); }
    case "whohas": haptic("tick"); S.sheet = { type: "whohas", id }; return renderSheet();
    case "flymenu": {
      const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id); if (!m || !m.flying) return;
      if (m.waiting) return openMenu(t, [{ label: "Cancel Pigeon", sub: `${m.bird ? `${m.bird.name} · ` : ""}takes off in ${fmtDur(m.sentAt - now())}`, icon: I.x, act: "recallask", id, destructive: true }]);
      const lunar = !!moonOf(m), onMap = lunar || m.route || m.flock?.some((x) => x.route), c = lunar ? { can: false } : cheerable(m);
      return openMenu(t, [...(onMap ? [{ label: lunar ? "Watch Its Trip" : "Watch on Map", sub: flySub(m), icon: lunar ? I.moon : I.map, act: "map", id }] : []),
        ...(c.can ? [{ label: `Cheer ${c.them ? "Them" : "It"} On`, sub: `${c.them ? "They land" : "It lands"} a little sooner${c.left < CHEER_EACH ? ` · ${c.left} left` : ""}`, icon: I.wind, act: "cheer", id }] : []),
        { label: "Call It Back", icon: I.homing, act: "recallask", id, destructive: true }]);
    }
    case "recallask": {
      const g = group(S.chat), n = S.me.swift || 0, w = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
      if (w?.waiting) return openActions({ title: "Cancel this pigeon?",
        message: `It hasn’t taken off yet, so ${first(friend(S.chat)?.name || "they")} will never know. What it carries is deleted${kindOf(w) === "standard" ? "" : `, and the ${KIND[kindOf(w)].name.toLowerCase()} pigeon goes back in your loft`}.`,
        actions: [{ label: "Cancel Pigeon", act: "recallgo", id, destructive: true }] });
      return openActions({ title: g ? "Call your pigeons back?" : "Call your pigeon back?",
        message: `A swift pigeon flies after ${g ? "them" : "it"} (you have ${n}). ${g ? "Any that haven’t landed turn for home, and whoever already has it keeps it." : "It won’t arrive, and what it carries is deleted."}`,
        actions: [{ label: "Call It Back", act: "recallgo", id, destructive: true }] });
    }
    case "recallgo":
      haptic("heavy");
      try {
        const g = group(S.chat), r = await api(g ? "group-recall" : "recall", { method: "POST", body: { id } });
        const list = S.msgs.get(S.chat) || [], i = list.findIndex((x) => x.id === id);
        if (r.cancelled) {
          if (i >= 0) list.splice(i, 1);
          S.plain.delete(id); S.photos.delete(id); S.me = r.me;
          render(); renderCompose(); toast("Cancelled. It never left."); return sync();
        }
        if (i >= 0) list[i] = r.message;
        if (r.message.recalled && !(r.message.flock || []).some((x) => !x.flying && !x.lost)) S.plain.delete(id);
        if (r.me) S.me = r.me;
        if (S.sheet?.type === "map") S.sheet = null;
        render(); toast(g ? "Your pigeons are flying home." : "Your pigeon is flying home."); await sync();
      } catch (err) { toast(esc(err.message)); }
      return;
    case "mapzoom": {
      const cv = $(".map", $layer); if (!cv || !cv._m) return;
      if (id === "fit") return fitMap(cv);
      return zoomMapBy(cv, id === "in" ? 2 : 0.5, cv.clientWidth / 2, mapFrame(cv, cv._m, cv._cardH).sy0);
    }
    case "view": S.sheet = { type: "view", id }; return renderSheet();
    case "viewonce": return viewOnce(id);
    case "maplayers": {
      const on = !windOn(); try { localStorage.setItem("inflight-windmap", on ? "1" : "0"); } catch (_) {}
      t.setAttribute("aria-pressed", String(on));
      const cv = $(".map", $layer); if (cv) { cv._parts = null; cv._trailKey = null; }
      redrawMap(); return;
    }
    case "mapfold": return mapFold(!mapOpen());
    case "mapglobe": {
      // (the picture it was shrinks into the globe, or grows away into the flat map, as it fades)
      const cv = $(".map", $layer); if (!cv?._m) return;
      const toGlobe = !globeOn(cv._m); mapFadeFrom(cv, toGlobe ? "scale(.55)" : "scale(1.8)"); cv._wasFast = false;
      S.sheet.globe = toGlobe; S.sheet.view = S.sheet.gview = null; cv._spin = 0; return redrawMap();
    }
    case "safety": {
      const f = personById(id); if (!f) return;
      S.sheet = { type: "safety", id, from: t.dataset.from || (S.sheet?.type === "friendinfo" ? "friendinfo" : S.sheet?.type === "groupinfo" ? "groupinfo" : null), backId: S.sheet?.id, digits: await E2E.safety(S.me.id, S.myPub || S.me.pub, f.id, f.pub) };
      return renderSheet();
    }
    case "vanishask": {
      const g = group(id), who = g ? "everyone in the group" : first(friend(id)?.name || "your friend");
      return openActions({ title: "Disappearing Messages", message: `New messages disappear this long after they’re read (or land, if read receipts are off), for you and ${who}. The flight stays in your Flight Log.`,
        actions: [[DAY, "1 Day"], [7 * DAY, "7 Days"], [30 * DAY, "30 Days"], [0, "Off"]].map(([ms, label]) => ({ label, act: "vanishset", id: `${id}|${ms}` })) });
    }
    case "vanishset": {
      const [cid, ms] = id.split("|"), g = group(cid);
      try {
        await api(g ? "group-vanish" : "vanish", { method: "POST", body: g ? { id: cid, ms: Number(ms) } : { with: cid, ms: Number(ms) } });
        await sync(); if (S.chat === cid) await loadChat(cid).catch(() => {});
        toast(Number(ms) ? `New messages disappear ${vanishSay(Number(ms))} after they’re read (or land, if read receipts are off).` : "Disappearing messages are off.");
        if (S.sheet) renderSheet(); render();
      } catch (err) { toast(esc(err.message)); }
      return;
    }
    case "scanany": {
      // (each friend's safety number, so the one scanned is known whoever's it is)
      const codes = new Map(await Promise.all(S.friends.map(async (f) => { const digits = await E2E.safety(S.me.id, S.myPub || S.me.pub, f.id, f.pub); return [safetyCode(digits), { f, digits }]; })));
      const back = S.sheet?.type === "scan" ? S.sheet.back : S.sheet;
      S.sheet = { type: "scan", any: true, codes, back }; return renderSheet();
    }
    case "scansafe": { const back = S.sheet?.type === "scan" ? S.sheet.back : S.sheet; S.sheet = { type: "scan", id, back }; return renderSheet(); }
    case "scanback": { stopScan(); S.sheet = S.sheet?.back ? { ...S.sheet.back } : null; return renderSheet(); }
    case "verifyok": { const p = personById(id); if (!p) return; setVerified(p, true); haptic("success"); toast(`${esc(first(p.name))} is verified.`); if (S.sheet?.type === "safety") S.sheet.won = performance.now(); return renderSheet(); }
    case "safecopy": { const d = (S.sheet?.digits || []).join(" "); try { await navigator.clipboard.writeText(d); toast("Safety number copied."); } catch (_) { toast(esc(d)); } return; }
    case "copyfp": try { await navigator.clipboard.writeText(S.fp); toast("Key copied."); } catch (_) { toast(esc(S.fp)); } return;
    case "unverify": { const p = personById(id); if (!p) return; setVerified(p, false); toast("Verification cleared."); return renderSheet(); }
    case "trustsafe": { await trustNewKey(id); haptic("success"); toast("Trusted. Messages can go to them again."); S.sheet = null; return renderSheet(); }
    case "chatmenu": {
      const f = friend(S.chat); if (!f) return;
      return openMenu(t, [
        { label: "Contact Info", icon: I.info, act: "friendinfo", id: f.id },
        { label: "Safety Number", icon: I.shield, act: "safety", id: f.id },
        { label: "Remove Friend", icon: I.minusp, act: "unfriendask", id: f.id, destructive: true },
        { label: "Block", icon: I.block, act: "blockask", id: f.id, destructive: true },
      ]);
    }
    // The phone's own picker already offers Photo Library, Take Photo and Choose File,
    // so go straight to it rather than putting a menu of ours in front of it.
    case "attachmenu":
      if (!S.gifsOn) { haptic("tick"); return $("#file-lib")?.click(); }
      return openMenu(t, [{ label: "Photo", icon: I.photo, act: "pick", id: "file-lib" }, { label: "GIF", icon: `<span class="gifico" aria-hidden="true">GIF</span>`, act: "gifs" }]);
    case "pick": return $("#" + id)?.click();
    case "trust": return trustNewKey(id);
    case "decline": {
      const p = S.incoming.find((x) => x.id === id);
      return openActions({ message: `Decline ${p ? "@" + p.handle + "’s" : "this"} request? They aren’t told, and can’t ask again for 30 days.`,
        actions: [{ label: "Decline", act: "declinego", id }, { label: "Decline and Block", act: "blockgo", id, destructive: true }] });
    }
    case "accept": case "declinego":
      await api("friends-respond", { method: "POST", body: { id, accept: t.dataset.act === "accept" } }).catch((err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    case "blockask": {
      const p = personById(id) || S.incoming.find((x) => x.id === id); if (!p) return;
      const shared = S.groups.some((g) => g.members?.some((m) => m.id === id));
      return openActions({ title: `Block @${p.handle}?`, message: `They won’t be able to send you pigeons or friend requests, or see your picture or where you are. They aren’t told.${shared ? " You’ll both still be in the groups you share." : ""}`,
        actions: [{ label: "Block", act: "blockgo", id, destructive: true }] });
    }
    case "blockgo": {
      const p = personById(id) || S.incoming.find((x) => x.id === id);
      try { await api("block", { method: "POST", body: { id } }); haptic("success"); toast(`Blocked${p ? " @" + esc(p.handle) : ""}.`); }
      catch (err) { return toast(esc(err.message)); }
      if (S.chat === id) { S.sheet = null; await sync(); renderSheet(); return go("messages"); }
      if (S.sheet?.type === "friendinfo") S.sheet = null;
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    }
    case "unblock": {
      const p = S.blocked.find((x) => x.id === id);
      await api("block", { method: "DELETE", body: { id } }).then(() => toast(`Unblocked${p ? " @" + esc(p.handle) : ""}.`), (err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    }
    case "blockedsheet": S.sheet = { type: "blocked" }; return renderSheet();
    case "sessionssheet": S.sheet = { type: "sessions" }; renderSheet(); return loadSessions();
    case "sessend": {
      const x = S.sheet?.list?.find((y) => y.id === id);
      return openActions({ message: `Sign out ${x ? x.label : "this phone"}${x?.place ? ` near ${x.place}` : ""}? It will need your password or a passkey to sign in again.`, actions: [{ label: "Sign Out", act: "sessendgo", id, destructive: true }] });
    }
    case "sessendgo":
      try { await api("sessions-end", { method: "POST", body: { id } }); haptic("success"); toast("Signed out."); } catch (err) { toast(esc(err.message)); }
      return loadSessions();
    case "sessothers": return openActions({ message: "Sign out of Chat everywhere except this phone? They’ll need your password or a passkey to sign in again.", actions: [{ label: "Sign Out Other Phones", act: "sessothersgo", destructive: true }] });
    case "sessothersgo":
      try { await api("sessions-end", { method: "POST", body: { others: true } }); haptic("success"); toast("Your other phones were signed out."); } catch (err) { toast(esc(err.message)); }
      return loadSessions();
    case "confirmsend":
      try { const r = await api("confirm-resend", { method: "POST" }); toast(r.already ? "Your email is already confirmed." : `Sent. Tap the link in the email to ${esc(S.me.email)}.`); if (r.already) { await sync(); renderSheet(); } }
      catch (err) { toast(esc(err.message)); }
      return;
    case "cancelreq":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      await sync(); renderSheet(); if (S.sheet?.type === "addfriend") addLookup(); return;
    case "addgo": return addGo(id, t);
    case "addchat": S.sheet = null; renderSheet(); return go("chat", id);
    case "copylink":
      try { await navigator.clipboard.writeText(myLink()); toast("Link copied."); } catch (_) { toast(esc(myLink())); }
      return;
    case "unfriendask": {
      const f = friend(id); if (!f) return;
      return openActions({ title: `Remove ${first(f.name)}?`, message: "You’ll stop seeing each other’s messages. You can add them again later.", actions: [{ label: "Remove Friend", act: "unfriend", id, destructive: true }] });
    }
    case "unfriend":
      await api("friends", { method: "DELETE", body: { id } }).catch((err) => toast(esc(err.message)));
      S.sheet = null; await sync(); return go("messages");
    case "share": return shareHandle();
    case "unattach": if (S.busy) return; return clearAttach();
    case "toast": { hideToast(); const fn = S.toastFn; S.toastFn = null; return fn && fn(); }
    case "peek": { const inp = t.parentElement.querySelector("input"); const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
    case "locate": {
      const found = await locate(t);
      // signing up: keep it fresh (unless switched off), then on to the next step by itself
      if (found && S.view === "locpick") { if (S.onbAuto !== false) setAutoLocation(true); setTimeout(() => { if (S.view === "locpick") onbNext(); }, 650); }
      return;
    }
    case "onbauto": S.onbAuto = S.onbAuto === false; return render();
    case "locdone": return onbNext();
    case "onbdone": return finishOnboarding();
    case "pkadd":
      try {
        const unlocks = await busyBtn(t, "Waiting for your passkey…", () => withFresh(addPasskey));
        await sync();
        if (t.dataset.next === "done") finishOnboarding(); else if (t.dataset.next) go(t.dataset.next); else renderSheet();
        toast(unlocks ? "Passkey saved. It can sign you in and unlock your messages." : "Passkey saved. On a new phone you’ll also need your password once.");
      } catch (err) { if (!err.cancelled && err.name !== "NotAllowedError" && err.name !== "AbortError") showErr(passkeyError(err)); }
      return;
    case "pkdel":
      try { await withFresh(() => api("passkey", { method: "DELETE", body: { id } })); toast("Passkey removed. You can also delete it from your phone’s Passwords app."); }
      catch (err) { if (!err.cancelled) toast(esc(err.message)); }
      await sync(); return renderSheet();
    case "acctsignin": return toAccountSignIn(e, "signin");
    case "retrysync": S.syncFails = 0; render(); return sync().then(() => { if (!S.started) render(); });
    case "acctjoin": return toAccountSignIn(e, "join");
    case "signout": {
      const waiting = S.outbox.filter((o) => !o.err).length;
      return openActions({ message: `You’ll need your password or a passkey to sign in again.${waiting ? ` ${waiting === 1 ? "One pigeon is" : `${waiting} pigeons are`} still waiting for signal and won’t be sent.` : ""}`, actions: [{ label: "Sign Out", act: "signoutgo", destructive: true }] });
    }
    case "creditsheet": S.sheet = { type: "credits" }; return renderSheet();
    case "moved": return movedNote(true);
    case "movego": if (!standalone()) { e?.preventDefault?.(); location.href = `${NEW_HOME}/${S.view === "welcome" ? location.hash : ""}`; } return;
    case "movecopy": try { await navigator.clipboard.writeText(NEW_HOME + "/"); toast("Address copied."); } catch (_) { toast(esc(NEW_HOME.replace(/^https?:\/\//, ""))); } return;
    case "appearancesheet": S.sheet = { type: "appearance" }; return renderSheet();
    case "theme": return themeFade(() => { setTheme(id); render(); renderSheet(); });
    case "pigeon": S.pick = id; renderCompose(); if (S.sheet?.type === "flysheet") renderSheet(); return;
    case "flysheet": haptic("tick"); S.sheet = { type: "flysheet", chat: S.chat }; return renderSheet();
    case "routepreview": {
      // the flight it would be, drawn on the map as if it were in the air
      const p = previewFrom(routeStyle()); if (!p) return;
      S.preview = p; S.sheet = { type: "map", id: "preview" }; return renderSheet();
    }
    case "routeset": {
      if (!ROUTES.some((r) => r[0] === id) || id === routeStyle()) return;
      try { localStorage.setItem("inflight-route", id); } catch (_) {}
      haptic("tick");
      // on The Way: that way instead, the map re-fitted to it and the card springing to its new size
      if (S.sheet?.type === "map" && S.sheet.id === "preview") {
        const p = previewFrom(id), card = $(".mapcard", $layer); if (!p || !card) return;
        S.preview = p; S.sheet.view = S.sheet.gview = null;
        return fcMorph(card, () => tickMap(), false);         // (its rows change in place, rather than all playing in again)
      }
      return renderSheet();
    }
    case "haptics": { const on = !hapticsOn(); try { localStorage.setItem("inflight-haptics", on ? "1" : "0"); } catch (_) {} if (on) haptic("success"); render(); return renderSheet(); }
    case "skin": return setSkin(id);
    case "vianote": S.sheet = { type: "vianote", id, chat: S.chat }; return renderSheet();
    case "via": S.sheet = { type: "via", chat: S.chat, ids: null }; renderSheet();
      try { const r = await api("mutuals?with=" + encodeURIComponent(S.chat)); if (S.sheet?.type === "via") { S.sheet.ids = r.ids; renderSheet(); } } catch (err) { if (S.sheet?.type === "via") { S.sheet.err = err.message; renderSheet(); } }
      return;
    case "viapick": S.via = { chat: S.sheet?.chat || S.chat, id }; S.sched = null; S.sheet = null; renderSheet(); return renderCompose();
    case "unvia": S.via = null; S.sheet = null; renderSheet(); return renderCompose();
    case "schedule": S.sheet = { type: "schedule", chat: S.chat }; return renderSheet();
    case "wxwait": S.sched = { chat: S.chat, at: +id }; S.pick = t.dataset.kind; S.via = null; haptic("tick"); return renderCompose();
    case "schedpick": S.sched = { chat: S.sheet?.chat || S.chat, at: +id }; S.via = null; S.sheet = null; renderSheet(); return renderCompose();
    // chosen right on How It Flies (it stays open)
    case "schednow": S.flyTap = t; S.sched = null; haptic("tick"); renderSheet(); return renderCompose();
    case "schedset": S.flyTap = t; S.sched = { chat: S.chat, at: +id }; S.via = null; haptic("tick"); renderSheet(); return renderCompose();
    case "viaset": S.flyTap = t; S.via = { chat: S.chat, id }; S.sched = null; haptic("tick"); renderSheet(); return renderCompose();
    case "viaclear": S.flyTap = t; S.via = null; haptic("tick"); renderSheet(); return renderCompose();
    case "shipset": S.flyTap = t; S.noShip = id === "fly" ? S.chat : null; haptic("tick"); renderSheet(); return renderCompose();
    case "unschedule": S.sched = null; S.sheet = null; renderSheet(); return renderCompose();
    case "autoloc": return setAutoLocation(!S.me.autoLocation, t);
    case "moonpick": haptic("tick"); S.sheet = { type: "moonpick", body: id === "mars" ? "mars" : "moon" }; return renderSheet();
    case "moonside": if (S.sheet?.type === "moonpick") { S.sheet.side = id; renderSheet(); } return;
    case "moonsite": { const x = BODIES[S.sheet?.body || "moon"].sites.find((y) => y[0] === id); if (x && S.sheet?.type === "moonpick") { S.sheet.mark = { lat: x[1], lon: x[2] }; renderSheet(); } return; }
    case "moonlive": S.moonReplay = null; return tickMap();
    case "moonwho": { const [mid, to] = id.split("|"); S.moonWho = { ...(S.moonWho || {}), [mid]: to }; S.moonReplay = null; return tickMap(); }
    case "moonland": {
      const body = S.sheet?.body || "moon", mk = S.sheet?.mark || (worldOf(S.me) === body ? S.me.moon : null); if (!mk) return;
      return busyBtn(t, "Landing…", async () => {
        try { const r = await api("me", { method: "PATCH", body: { moon: { lat: mk.lat, lon: mk.lon, body } } }); S.me = r.me; stopLocWatch(); haptic("success"); toast(`You’re on ${BODIES[body].name}: ${esc(r.me.place.replace(/, (the Moon|Mars)$/, ""))}.`); S.sheet = { type: "profile" }; render(); renderSheet(); return true; }
        catch (err) { toast(esc(err.message)); return false; }
      });
    }
    case "risky": return setRisky(!S.me.risky);
    case "privacy": {
      const on = S.me[id] === false;                                   // switching it back on
      S.me = { ...S.me, [id]: on }; renderSheet();
      try { S.me = (await api("me", { method: "PATCH", body: { [id]: on } })).me; await sync(); }
      catch (err) { S.me = { ...S.me, [id]: !on }; renderSheet(); toast(esc(err.message)); }
      return;
    }
    case "notifysheet": S.sheet = { type: "notifications" }; return renderSheet();
    case "npref": return setNotify({ [id]: !S.me.notify?.[id] });
    case "pushtoggle": return S.pushOn ? pushDisable() : pushEnable();
    case "pushtest":
      try { const r = await api("push-test", { method: "POST" }); toast(r.sent ? "Test sent. It should arrive in a moment." : "Couldn’t reach this phone. Turn notifications off and on again."); }
      catch (err) { toast(esc(err.message)); }
      return;
    case "emailtoggle": return setEmailNotify(!S.me.notifyEmail);
    case "signoutgo": {
      if (!STILL.matches) await new Promise((r) => setTimeout(r, 280));    // (the action card goes first; then dusk, to the welcome)
      const night = dusk();
      try {
        await pushDisable(true);
        api("logout", { method: "POST" }).catch(() => {});
        await night.dark;                                                  // (dark now: what's under it can go)
        await forget(); S.navQuiet = true; go("welcome");                  // (under the night: no change of screen of its own)
      } finally { night.done(); }
      // (and on to the sign-in page, which says so and offers the way back; none locally)
      if (accountPage() && !/\.localhost[:/]/.test(accountPage())) location.assign(toAuth(`#${new URLSearchParams({ signout: "inflight", back: location.origin + "/" })}`));
      return;
    }
    case "profile": S.sheet = { type: "profile" }; return renderSheet();
    case "accountedit": case "accountopen": return openAccount(t.dataset.act === "accountedit" ? "profile" : null);
    case "ifsettings": return openAccount("inflight");
  }
}
const passkeyError = (err) => err.name === "InvalidStateError" ? "This phone already has a passkey for your account." : err.name === "SecurityError" ? "Passkeys only work on inflite.ai." : err.message || "The passkey didn’t work. Try again.";

async function onChange(e) {
  const el = e.target;
  if (el.id === "file-lib" && el.files[0]) { const f = el.files[0]; el.value = ""; return setAttach(f); }
  if (el.dataset.act === "quiethour") return setNotify({ [el.dataset.id]: Number(el.value) });
  if (el.dataset.act === "lockafter") { const lp = lockPrefs(); if (lp) setLockPrefs({ ...lp, after: Number(el.value) || 0 }); render(); return renderSheet(); }
  if (el.dataset.act === "city" && el.value) {
    const p = PLACES.find((x) => x[0] === el.value);
    if (p) await savePlace(p[1], p[2], p[0]);
    if (p && S.view === "locpick" && S.me?.place) setTimeout(() => { if (S.view === "locpick") onbNext(); }, 650);   // signing up: straight on
  }
}
// how long ago, as you'd say it: "just now", "12 min ago", "2 hours ago", "3 days ago"
const agoText = (at) => {
  const m = Math.round((now() - at) / MIN), h = Math.round(m / 60), d = Math.round(m / 1440);
  return m < 2 ? "just now" : m < 60 ? `${m} min ago` : h < 24 ? `${h} hour${h > 1 ? "s" : ""} ago` : `${d} day${d > 1 ? "s" : ""} ago`;
};
// Opt-in: keep your location fresh while Chat is open (a web page can't
// look in the background), so pigeons on their way can follow you. It never
// asks for permission by itself (only when you turn it on). It checks every
// minute, saves when you've moved to a new square mile, and otherwise just
// says every ten minutes that you're still there (so a pigeon the server held
// back from turning, as it turns one at most every ten minutes, still turns).
const AUTO_EVERY = MIN, AUTO_KM = 1, AUTO_FRESH = 10 * MIN;
async function setRisky(on) {
  S.me = { ...S.me, risky: on }; render();             // the switch moves straight away
  try { const r = await api("me", { method: "PATCH", body: { risky: on } }); const same = !!r.me.risky === on; S.me = r.me; if (!same) render(); }
  catch (err) { S.me = { ...S.me, risky: !on }; render(); toast(esc(err.message)); }
}
async function setAutoLocation(on, btn) {
  S.me = { ...S.me, autoLocation: on }; render(); refreshProfile();       // the switch moves straight away
  try { const r = await api("me", { method: "PATCH", body: { autoLocation: on } }); const same = !!r.me.autoLocation === on; S.me = r.me; if (!same) { render(); refreshProfile(); } }
  catch (err) { S.me = { ...S.me, autoLocation: !on }; render(); refreshProfile(); return toast(esc(err.message)); }
  if (on) autoLocate(true); else stopLocWatch();
}
// While Chat is open (and you've turned it on) the phone watches your
// location: iPhone asks once a session, then reports as you move. The minute
// timer saves what it last heard (a new square mile at once; otherwise a
// "still here" every ten minutes, timed on this phone: the server's "Updated"
// moves only when you do), and asks directly if the watch goes quiet.
// (Safari often says permission is only "prompt" even once allowed, so only a
// clear "denied" stops it.)
let locWatch = null, lastFix = null, lastFixAt = 0, lastSave = 0, saving = false;
function stopLocWatch() { if (locWatch != null) { navigator.geolocation.clearWatch(locWatch); locWatch = null; } }
async function autoLocate(ask) {
  if (!S.me?.autoLocation || !navigator.geolocation) return stopLocWatch();
  if (document.visibilityState !== "visible") return;
  if (!ask) { try { if ((await navigator.permissions?.query({ name: "geolocation" }))?.state === "denied") return stopLocWatch(); } catch (_) { /* can't tell: try */ } }
  const opts = { enableHighAccuracy: false, timeout: 30000, maximumAge: 30e3 };
  const fail = (err) => { if (err.code === 1) { stopLocWatch(); if (ask) toast("Location is off for this site. Allow it in your phone’s settings to update automatically."); } };
  if (locWatch == null) locWatch = navigator.geolocation.watchPosition((pos) => { lastFix = pos; lastFixAt = Date.now(); saveFix(); }, fail, opts);
  // quiet for two minutes (or just switched on): ask once directly
  if (ask || Date.now() - lastFixAt > 2 * MIN) navigator.geolocation.getCurrentPosition((pos) => { lastFix = pos; lastFixAt = Date.now(); saveFix(true); }, fail, opts);
  else saveFix();
}
async function saveFix(force) {
  if (!lastFix || !S.me?.autoLocation || S.me.moon || saving) return;
  const { lat, lon } = snapToMile(lastFix.coords.latitude, lastFix.coords.longitude);     // the exact spot never leaves the phone
  // (with Approximate Location the server keeps the 10 km square it's in: that's what's compared, like with like)
  const at = S.me.approxLocation ? snapTo(lat, lon, 10) : { lat, lon };
  const moved = S.me.lat == null || haversineKm(S.me.lat, S.me.lon, at.lat, at.lon) >= AUTO_KM;
  if (!moved && Date.now() - lastSave < AUTO_FRESH) return;
  if (!force && Date.now() - lastSave < 20e3) return;                                       // a burst of fixes saves once
  // still here: keep the spot (and its name), so a pigeon held back from turning can catch up
  const body = moved ? { lat, lon, place: nearestPlace(lat, lon) } : { lat: S.me.lat, lon: S.me.lon, place: S.me.place };
  const before = S.me.place, was = JSON.stringify(S.me);
  saving = true; lastSave = Date.now();
  try {
    // (redrawn only if something changed, and calmly: never under a scroll or a tap)
    const r = await api("me", { method: "PATCH", body }); S.me = r.me; if (moved || JSON.stringify(r.me) !== was) { calmRender(); refreshProfile(); }
    if (moved && r.me.place !== before) toast(`Location updated to ${esc(r.me.place)}.`);
  } catch (_) { /* try again next time */ }
  saving = false;
}
// My Profile holds name and handle (saved with Done) next to settings that save
// as soon as they change (location, notifications, security).
// Your account's page, opened signed in as you: a code good once, for a minute, handed over in the address's # (the
// page swaps it for a sign-in of its own, in whichever browser it opens in, and takes it out of the address). The window's
// opened at once, from the tap (a phone won't open one later), and sent on when the code's back.
async function openAccount(open) {
  const page = accountPage(); if (!page) return;
  const w = window.open("", "_blank");
  try {
    const { code } = await api("account-link", { method: "POST" });
    const url = `${page}#${new URLSearchParams({ handoff: code, from: "inflight", ...(open ? { open } : {}) })}`;
    if (w && !w.closed) w.location.href = url; else location.href = url;
  } catch (err) { w?.close(); toast(esc(err.message)); }
}
const refreshProfile = () => { if (S.sheet?.type === "profile") renderSheet(true); };
async function savePlace(lat, lon, place) {
  try {
    const r = await api("me", { method: "PATCH", body: { lat, lon, place } }); S.me = r.me;
    // signing up, it moves straight on: the button says where you are, rather than the screen re-laying itself out
    const b = S.view === "locpick" && S.me.place && $("[data-act=locate]", $view);
    if (b) { b.classList.add("done"); b.disabled = true; b.innerHTML = `${I.check}${esc(S.me.place)}`; } else render();
    refreshProfile();
  } catch (err) { showErr(err.message); }
}
function locate(btn) {
  if (!navigator.geolocation) return showErr("This browser can’t share your location. Choose a city instead.");
  return busyBtn(btn, "Finding you…", () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const { lat, lon } = snapToMile(latitude, longitude);     // the exact spot never leaves the phone
      await savePlace(lat, lon, nearestPlace(lat, lon));
      resolve(!!S.me?.place);
    }, (err) => {
      showErr(err.code === 1 ? "Location is off for this site. Choose a city instead, or allow location in your browser settings." : "Couldn’t find your location. Choose a city instead.");
      resolve(false);
    }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * MIN });
  }));
}
async function shareHandle() {
  const url = myLink();
  const text = `Send me a pigeon on Chat: @${S.me.handle}`;
  try {
    if (navigator.share) await navigator.share({ title: "Chat", text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied."); }
  } catch (_) { /* share sheet closed */ }
}
async function onSubmit(e) {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form;
  if (kind !== "compose") {
    if (form.dataset.busy) return;                // already on its way (a second Go on the keyboard, a double tap)
    form.dataset.busy = "1";
    try { return await submitForm(e, form, kind); } finally { delete form.dataset.busy; }
  }
  return submitForm(e, form, kind);
}
async function submitForm(e, form, kind) {
  const btn = form.querySelector(".btn") || $(`[data-act=submit][data-id="${esc(form.id)}"]`, $layer);
  if (kind === "compose") return send();
  if (kind === "schedule") {
    const v = $("#f-landat", $layer)?.value, at = v ? +new Date(v) : NaN;
    if (!Number.isFinite(at) || at <= now()) return showErr("Pick a time that’s still to come.", "landat");
    if (at > now() + 30 * DAY) return showErr("Pick a time in the next 30 days.", "landat");
    S.sched = { chat: S.sheet.chat, at }; S.via = null; S.sheet = null; renderSheet(); return renderCompose();
  }
  if (kind === "vianote") {
    const s = S.sheet, text = String($("#f-vianote", $layer)?.value || "").trim();
    const m = (S.msgs.get(s.chat) || []).find((x) => x.id === s.id), to = m && friend(m.finalTo);
    if (!text) return showErr("Write a line first.", "vianote");
    if (!m || !to) return showErr("You’re not friends with who it’s going to any more.");
    try {
      await busyBtn(btn, "…", async () => {
        const ct = await E2E.seal(await pairFor(trustedPub(to)), { id: m.id + ":via", from: S.me.id, to: to.id, type: "note" }, { t: text });
        await api("stopover-note", { method: "POST", body: { id: m.id, ct } });
      });
      S.notes.set(m.id, text); m.mine = "sent"; S.sheet = null; renderSheet(); render(); toast(`Added. ${esc(first(to.name))} will see it when it lands.`);
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "birdname") {
    const s = S.sheet, name = String($("#f-bname", $layer)?.value || "").trim();
    if (!name) return showErr("Give your pigeon a name.", "bname");
    try {
      const r = await busyBtn(btn, "…", () => api(s.id ? "bird-name" : "birds", { method: "POST", body: s.id ? { id: s.id, name } : { name } }));
      S.birds = r.birds; S.hall = r.hall; haptic("success");
      if (!s.id) toast(`${esc(r.birds.at(-1)?.name || name)} joins your pigeons.`);
      S.sheet = s.id ? { type: "bird", id: s.id } : { type: "birds" }; renderSheet(); render();
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "grouprename") {
    const s = S.sheet;
    try { await busyBtn(btn, "…", () => api("group-name", { method: "POST", body: { id: s.id, name: String($("#f-gname", $layer)?.value || "") } })); await sync(); S.sheet = { type: "groupinfo", id: s.id }; renderSheet(); }
    catch (err) { showErr(err.message, err.field); }
    return;
  }
  if (kind === "newgroup" || kind === "groupadd") {
    const s = S.sheet, name = String($("#f-gname", $layer)?.value || "").trim();
    if (kind === "newgroup" && !name) return showErr("Give the group a name.", "gname");
    try {
      const r = await busyBtn(btn, "…", () => kind === "newgroup"
        ? api("groups", { method: "POST", body: { name, members: [...s.pick] } })
        : api("group-add", { method: "POST", body: { id: s.id, members: [...s.pick] } }));
      await sync();
      if (kind === "newgroup") { S.sheet = null; renderSheet(); go("chat", r.group.id); }
      else { S.sheet = { type: "groupinfo", id: s.id }; renderSheet(); toast(`Added to ${esc(group(s.id)?.name || "the group")}.`); }
    } catch (err) { showErr(err.message); }
    return;
  }
  if (kind === "add") {
    const h = form.h.value.trim().replace(/^@/, ""); if (!h) return;
    return addGo(h, btn);
  }
  const v = Object.fromEntries(new FormData(form));
  if (kind === "reauth") {
    if (!v.password) return showErr("Enter your password.", "password");
    try {
      await busyBtn(btn, "Checking…", async () => {
        const { salt } = await api("salt", { method: "POST", body: { email: S.me.email } });
        const { proof } = await E2E.fromPassword(v.password, salt);
        await api("reauth", { method: "POST", body: { proof } });
      });
      const s = S.sheet; S.sheet = s.back || null; renderSheet(); haptic("success"); s.resolve(true);
    } catch (err) { showErr(err.message, err.field); }
  } else if (kind === "askpw") {
    try {
      const jwk = await busyBtn(btn, "Unlocking…", async () => {
        const { vault, lockKey } = await vaultWith(v.password);
        try { return (await E2E.unlock(lockKey, vault)).ecdh; } catch (_) { throw Object.assign(new Error("That password didn’t unlock your key."), { field: "password" }); }
      });
      S.secretJwk = jwk;
      const s = S.sheet; S.sheet = null; renderSheet(); s.resolve(jwk);
    } catch (err) { showErr(err.message, err.field); }
  }
}
// Sign-up's last steps: the passkey offer (where it works), then your first screen
function onbNext() { if (passkeysSupported()) go("pkoffer"); else finishOnboarding(); }
function finishOnboarding() {
  S.started = true;                               // a brand new account: nothing to wait for
  if (S.pendingAdd) { go("friends"); S.sheet = { type: "addfriend" }; return renderSheet(); }   // came from a friend's link
  go("messages");
}
async function afterSignIn() {
  await sync();
  refreshPush(); autoLocate();
  if (ASK_NOTIFY) setTimeout(askNotify, 600);
  if (S.me.lat == null && !S.me.moon) return go("locpick");
  if (S.pendingAdd) { go("friends"); S.sheet = { type: "addfriend" }; return renderSheet(); }
  go("messages");
  if (S.pendingLink) { const h = S.pendingLink; S.pendingLink = null; openLink(h); }   // the link you came in on
}
// Animated GIFs keep every frame: they're sent as they are (sealed like any
// photo) instead of being redrawn as a still JPEG. Only the picture, its timing
// and looping are kept; comments and other extra blocks, which can carry
// details nobody meant to share, are dropped.
const GIF_MAX = 7 * 1024 * 1024;
function cleanGif(u) {
  const sig = String.fromCharCode(...u.slice(0, 6));
  if (u.length < 14 || (sig !== "GIF89a" && sig !== "GIF87a")) return null;
  const w = u[6] | (u[7] << 8), h = u[8] | (u[9] << 8);
  let i = 13 + (u[10] & 0x80 ? 3 * (2 << (u[10] & 7)) : 0);
  const keep = [u.subarray(0, i)];
  // a run of data sub-blocks ends with an empty one; returns where the next block starts
  const skip = (j) => { while (j < u.length && u[j] !== 0) j += u[j] + 1; return j < u.length ? j + 1 : -1; };
  while (i < u.length) {
    const t = u[i];
    if (t === 0x3b) break;                                         // the end
    let j;
    if (t === 0x2c) {                                              // a frame: descriptor, colours, then its pixels
      if (i + 10 >= u.length) return null;
      j = skip(i + 10 + (u[i + 9] & 0x80 ? 3 * (2 << (u[i + 9] & 7)) : 0) + 1);
      if (j < 0) return null;
      keep.push(u.subarray(i, j));
    } else if (t === 0x21) {                                       // an extension block
      const label = u[i + 1];
      j = skip(i + 2); if (j < 0) return null;
      const app = label === 0xff && u[i + 2] === 11 ? String.fromCharCode(...u.slice(i + 3, i + 14)) : "";
      if (label === 0xf9 || label === 0x01 || app === "NETSCAPE2.0" || app === "ANIMEXTS1.0") keep.push(u.subarray(i, j));   // timing, text, looping
    } else return null;
    i = j;
  }
  keep.push(new Uint8Array([0x3b]));
  const out = new Uint8Array(keep.reduce((n, x) => n + x.length, 0));
  let o = 0; for (const x of keep) { out.set(x, o); o += x.length; }
  return { bytes: out, w, h };
}
async function prepGif(blob) {
  const g = cleanGif(new Uint8Array(await blob.arrayBuffer()));
  if (!g) return prepImage(blob);                                  // not a GIF we can read: send it as a still
  if (g.bytes.length > GIF_MAX) throw Object.assign(new Error("big"), { big: true });
  return { ...g, gif: true, preview: URL.createObjectURL(new Blob([g.bytes], { type: "image/gif" })) };
}
/* ---------- GIF search ----------
   Through Chat's server (functions/_gifs.js): it asks GIPHY and fetches
   the GIFs, so GIPHY never sees who's looking. The one picked is attached like
   a GIF from the phone: sealed before it leaves. */
const gifPrev = new Map();            // id → blob URL of its little moving preview
async function loadGifs(more) {
  const s = S.sheet; if (!s || s.type !== "gifs" || s.busy || s.next == null) return;
  s.busy = true; drawGifs();
  const q = s.q;
  try {
    const d = await api(`gif-search?q=${encodeURIComponent(q)}&offset=${more ? s.next : 0}`);
    if (S.sheet !== s || s.q !== q) { s.busy = false; return; }
    s.list = more ? [...s.list, ...d.gifs.filter((g) => !s.list.some((x) => x.id === g.id))] : d.gifs; s.next = d.next; s.err = "";
  } catch (err) { s.err = err.message; }
  s.busy = false;
  if (S.sheet === s) drawGifs();
}
function drawGifs() {
  const s = S.sheet, grid = $(".gifgrid", $layer); if (!s || !grid) return;
  const tile = (g) => `<button type="button" class="giftile${s.picking === g.id ? " busy" : ""}" data-act="gifpick" data-id="${esc(g.id)}" aria-label="${esc(g.title || "GIF")}" data-ar="${(g.w / g.h).toFixed(3)}">${gifPrev.get(g.id) ? `<img src="${gifPrev.get(g.id)}" alt="">` : ""}</button>`;
  // two columns, each tile into whichever is shorter, so the grid packs like a wall of photos
  // (drawn again only when what's in it changes: not on every redraw of the app, which made its pictures flicker)
  const key = JSON.stringify([s.list.map((g) => g.id), s.picking || "", s.list.length ? "" : s.err || (s.busy ? 1 : 0)]);
  if (grid._k !== key) {
    grid._k = key;
    const cols = [[], []], hgt = [0, 0];
    for (const g of s.list) { const c = hgt[0] <= hgt[1] ? 0 : 1; cols[c].push(g); hgt[c] += g.h / g.w; }
    grid.innerHTML = s.list.length ? cols.map((c) => `<div class="gifcol">${c.map(tile).join("")}</div>`).join("")
      : `<p class="empty">${s.err ? esc(s.err) : s.busy ? "Finding GIFs…" : "No GIFs found. Try another word."}</p>`;
    grid.querySelectorAll("[data-ar]").forEach((el) => el.style.setProperty("--ar", el.dataset.ar));   // (inline style attributes are blocked)
  }
  grid.parentElement.querySelector(".gifmore")?.remove();
  if (s.list.length && s.next != null) grid.insertAdjacentHTML("afterend", `<div class="gifmore"><button type="button" class="btn gray" data-act="gifmore"${s.busy ? " disabled" : ""}>${s.busy ? "Loading…" : "More GIFs"}</button></div>`);
  // previews come through the server too, then stay as blob URLs
  for (const g of s.list) if (!gifPrev.has(g.id)) {
    gifPrev.set(g.id, "");
    api(`gif/${encodeURIComponent(g.id)}?s=p`, { raw: true }).then((r) => r.blob()).then((b) => {
      gifPrev.set(g.id, URL.createObjectURL(b));
      const el = $(`.giftile[data-id="${CSS.escape(g.id)}"]`, $layer);
      if (el && !el.querySelector("img")) el.insertAdjacentHTML("afterbegin", `<img class="in" src="${gifPrev.get(g.id)}" alt="">`);     // (fading in: styles.css)
    }).catch(() => gifPrev.delete(g.id));
  }
}
async function pickGif(id, el) {
  const s = S.sheet; if (!s || s.picking) return;
  s.picking = id; el?.classList.add("busy");
  try {
    const r = await api(`gif/${encodeURIComponent(id)}?s=f`, { raw: true });
    const blob = await r.blob();
    if (S.sheet !== s) return;
    S.sheet = null; renderSheet();
    await setAttach(blob);
  } catch (err) { s.picking = null; el?.classList.remove("busy"); toast(esc(err.message)); }
}
async function setAttach(blob) {
  clearAttach();
  try {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const gif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;      // "GIF8"
    S.attach = gif ? await prepGif(blob) : await prepImage(blob); S.err = "";
  } catch (e) { S.err = e.big ? `That GIF is too big to send. Choose one under ${GIF_MAX / 1024 / 1024} MB.` : "That file couldn’t be opened as a photo."; }
  renderCompose();
}
function clearAttach() {
  if (S.attach && S.attach === S.sending) { S.attach = null; if ($compose) renderCompose(); return; }    // (send() keeps it, and tidies it)
  if (S.attach) URL.revokeObjectURL(S.attach.preview); S.attach = null; if ($compose) renderCompose();
}
// Upload progress glides: the browser reports progress in uneven jumps, so the
// shown figure eases towards the real one every frame instead of leaping.
function smoothProgress(draw) {
  let target = 0, shown = 0, raf = 0, last = 0;
  const step = (ts) => {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60; last = ts;
    shown += (target - shown) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - shown) < 0.002) shown = target;
    draw(shown);
    raf = shown === target ? 0 : requestAnimationFrame(step);
  };
  return {
    set(f) { target = Math.max(target, Math.min(1, f)); if (!raf) { last = 0; raf = requestAnimationFrame(step); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
// The photo's upload, shown on its card: only once Send is pressed.
const attachText = () => `${fmtBytes(S.attach.bytes.length)} · End-to-end encrypted`;
let upAnim = null;
function showUpload(stage, f = 0) {
  const a = $(".attach", $compose); if (!a || !S.attach) return;
  const txt = $(".atext", a), bar = $(".upbar b", a);
  a.classList.toggle("uploading", !!stage);
  a.classList.toggle("sealing", stage === "seal");
  if (!stage) { upAnim?.stop(); upAnim = null; bar.style.transform = "scaleX(0)"; txt.textContent = attachText(); return; }
  if (stage === "seal") { txt.textContent = "Encrypting…"; return; }
  if (!upAnim) upAnim = smoothProgress((x) => {
    bar.style.transform = `scaleX(${x})`;
    txt.textContent = x >= 1 ? "Finishing up…" : `Sending… ${Math.floor(x * 100)}%`;
  });
  upAnim.set(f);
}
/* ---------- the app lock ----------
   Optional, per phone: Chat locks when you leave it (straight away, or
   after a minute, 15 minutes or an hour), and opens with Face ID, Touch ID
   or the phone's passkey. The check is the phone's own (a user-verified
   passkey assertion), so it works with no signal too. While locked nothing
   from your chats is drawn, and it's blurred in the app switcher. */
const LOCK_KEY = "inflight-lock", LOCK_AFTER = [[0, "Immediately"], [60e3, "After 1 Minute"], [15 * 60e3, "After 15 Minutes"], [HOUR, "After 1 Hour"]];
function lockPrefs() { try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); return v && S.me && v.uid === S.me.id && v.on ? v : null; } catch (_) { return null; } }
function setLockPrefs(v) { try { if (v) localStorage.setItem(LOCK_KEY, JSON.stringify({ ...v, uid: S.me.id })); else localStorage.removeItem(LOCK_KEY); } catch (_) {} }
// a user-verified passkey check, on this phone
async function lockCheck() {
  const ids = (S.passkeys || []).map((p) => p.id).filter(Boolean);
  const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: RP_ID, userVerification: "required", timeout: 60000,
    allowCredentials: ids.map((id) => ({ type: "public-key", id: fromB64url(id) })) } });
  const ad = a && new Uint8Array(a.response.authenticatorData);
  if (!ad || !(ad[32] & 0x04)) throw new Error("not verified");           // the UV flag: Face ID, Touch ID or the passcode was used
  return true;
}
function drawLock() {
  let el = $(".lockscreen", root());
  // unlocked: it fades away over the app, which render() has drawn underneath already
  if (!S.locked) { if (el && !el.classList.contains("out")) { el.classList.add("out"); el.inert = true; setTimeout(() => { if (el.classList.contains("out")) el.remove(); }, STILL.matches ? 220 : 360); } return; }
  if (el?.classList.contains("out")) { el.classList.remove("out"); el.inert = false; }     // (locked again as it went)
  if (!el) {
    el = document.createElement("div"); el.className = "lockscreen"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Chat is locked");
    el.innerHTML = `<div class="lockin"><div class="appicon">${I.bird}</div><h2>Chat is locked</h2><p>Unlock with ${isIOS() ? "Face ID or Touch ID" : /Android/.test(navigator.userAgent) ? "your fingerprint or face" : "your passkey"}.</p>
      <button type="button" class="btn wide" data-act="unlock">${I.face}Unlock</button><button type="button" class="link" data-act="lockout">Sign Out Instead</button></div>`;
    root().appendChild(el);
  }
}
async function unlock() {
  if (S.unlocking) return; S.unlocking = true;
  try { await lockCheck(); S.locked = false; haptic("success"); drawLock(); render(); sync(); }
  catch (_) { toast("Couldn’t unlock. Try again."); }
  finally { S.unlocking = false; }
}
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  const lp = lockPrefs(); if (!lp) return;
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); root()?.classList.add("veiled"); return; }
  root()?.classList.remove("veiled");
  if (!S.locked && hiddenAt && Date.now() - hiddenAt >= (lp.after || 0)) { S.locked = true; closePop(); S.sheet = null; render(); }
});

/* ---------- voice pigeons ----------
   Tap the microphone (when there's nothing typed) to record, up to 30
   seconds. The recording is sealed like a photo, with its own random key
   (labelled "voice", so it can't pass for a photo), and its shape travels
   inside the sealed scroll as 40 bars for the waveform. Like photos, the
   recording itself is deleted from the server 24 hours after it lands. */
const VOICE_MAX = 30000, VOICE_BARS = 40;
const voiceOK = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const voiceMime = (m) => (/^audio\/(mp4|webm|ogg|aac|mpeg)(;[\w=.,\s-]*)?$/.test(String(m || "")) ? String(m).split(";")[0] : "audio/mp4");
const fmtClip = (ms) => { const s = Math.max(1, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
// 40 bars, each 0–15, as 40 hex digits
const waveOf = (w) => { const s = /^[0-9a-f]{40}$/.test(String(w || "")) ? w : "4".repeat(VOICE_BARS); return [...s].map((c) => parseInt(c, 16) / 15); };
function voiceHtml(id, v, mine) {
  const bars = waveOf(v.w).map((h) => `<i data-h="${(0.18 + 0.82 * h).toFixed(2)}"></i>`).join("");   // (heights set after drawing: no inline styles here)
  const ready = !!S.photos.get(id), playing = S.player?.id === id && !S.player.paused;
  return `<span class="voice${playing ? " playing" : ""}" data-vid="${esc(id)}">
    <button type="button" class="vplay" data-act="vplay" data-id="${esc(id)}" aria-label="${playing ? "Pause" : "Play"} voice pigeon, ${fmtClip(v.d)}"${ready ? "" : " disabled"}>${playing ? I.pause : I.play}</button>
    <span class="vwave" aria-hidden="true">${bars}</span><span class="vdur">${fmtClip(v.d)}</span></span>`;
}
// one player for every voice pigeon; the bars fill in as it plays
function voicePlay(id) {
  const url = S.photos.get(id); if (!url) return;
  const pl = S.player || (S.player = new Audio());
  if (pl.id === id && !pl.paused) { pl.pause(); return voiceShow(); }
  if (pl.id !== id) { pl.pause(); pl.src = url; pl.id = id; }
  pl.onended = () => { pl.currentTime = 0; voiceShow(); };
  pl.play().then(() => { haptic("tick"); voiceShow(); requestAnimationFrame(voiceFrame); }).catch(() => toast("Couldn’t play that voice pigeon on this phone."));
}
function voiceShow() {
  const pl = S.player;
  root().querySelectorAll(".voice[data-vid]").forEach((el) => {
    const on = pl && pl.id === el.dataset.vid, playing = on && !pl.paused, b = $(".vplay", el);
    el.classList.toggle("playing", playing);
    if (b && b.dataset.state !== String(playing)) { b.dataset.state = String(playing); b.innerHTML = playing ? I.pause : I.play; b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/^(Play|Pause)/, playing ? "Pause" : "Play")); }
    const f = on && pl.duration > 0 && isFinite(pl.duration) ? pl.currentTime / pl.duration : 0;
    el.style.setProperty("--p", f.toFixed(4));
    const bars = $(".vwave", el)?.children || [];
    for (let i = 0; i < bars.length; i++) bars[i].classList.toggle("on", on && (i + 0.5) / bars.length <= f);
    const d = $(".vdur", el); if (d && on && (playing || pl.currentTime > 0)) d.textContent = fmtClip(Math.max(0, (pl.duration - pl.currentTime) * 1000));
  });
}
function voiceFrame() { voiceShow(); if (S.player && !S.player.paused) requestAnimationFrame(voiceFrame); }

let rec = null;
let recAsking = false;
async function recStart() {
  if (rec || recAsking || S.busy) return;
  let stream; const chat = S.chat;
  recAsking = true;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { return toast(e?.name === "NotAllowedError" ? "Chat needs the microphone for voice pigeons. You can allow it in Settings." : "Couldn’t use the microphone."); }
  finally { recAsking = false; }
  if (S.view !== "chat" || S.chat !== chat || S.busy || S.attach) { stream.getTracks().forEach((t) => t.stop()); return; }   // (left, or busy, while it asked)
  const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((m) => window.MediaRecorder.isTypeSupported?.(m)) || "";
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); }
  catch (_) { stream.getTracks().forEach((t) => t.stop()); return toast("Couldn’t record on this phone."); }
  const AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, an = ac ? ac.createAnalyser() : null;
  if (ac) { an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an); }
  rec = { chat: S.chat, stream, mr, ac, an, chunks: [], levels: [], t0: performance.now(), mime: (mr.mimeType || mime || "audio/webm").split(";")[0], buf: an ? new Float32Array(an.fftSize) : null };
  mr.ondataavailable = (e) => { if (e.data?.size) rec?.chunks.push(e.data); };
  mr.start(250);
  haptic("tick");
  $(".crow", $compose).hidden = true; $(".recbar", $compose).hidden = false; $(".recwave", $compose).innerHTML = ""; composeGlide();
  requestAnimationFrame(recFrame);
}
function recFrame() {
  if (!rec) return;
  const ms = performance.now() - rec.t0;
  if (rec.an) {
    rec.an.getFloatTimeDomainData(rec.buf);
    let sum = 0; for (const v of rec.buf) sum += v * v;
    rec.levels.push(Math.min(1, Math.sqrt(sum / rec.buf.length) * 4));
  }
  $(".rectime", $compose).textContent = fmtClip(ms);
  // the live waveform: the last few seconds, newest on the right
  const w = $(".recwave", $compose), n = Math.max(12, Math.floor(w.clientWidth / 5)), lv = rec.levels.slice(-n * 3);
  const bars = Array.from({ length: n }, (_, i) => { const a = lv.slice(i * 3, i * 3 + 3); return a.length ? Math.max(...a) : 0; });
  while (w.children.length < n) w.appendChild(document.createElement("i"));
  while (w.children.length > n) w.lastChild.remove();
  bars.forEach((h, i) => w.children[i].style.setProperty("--h", (0.12 + 0.88 * h).toFixed(2)));
  if (ms >= VOICE_MAX) return recStop(true);
  requestAnimationFrame(recFrame);
}
async function recStop(keep) {
  const r = rec; if (!r) return;
  rec = null;
  const ms = Math.min(VOICE_MAX, performance.now() - r.t0);
  await new Promise((res) => { r.mr.onstop = res; try { r.mr.state !== "inactive" ? r.mr.stop() : res(); } catch (_) { res(); } });
  r.stream.getTracks().forEach((t) => t.stop()); r.ac?.close().catch(() => {});
  { const row = $(".crow", $compose); $(".recbar", $compose).hidden = true; row.hidden = false; row.classList.remove("back"); void row.offsetWidth; row.classList.add("back"); composeGlide(); }
  if (keep && (S.view !== "chat" || S.chat !== r.chat)) keep = false;      // its chat isn't open any more: it goes nowhere
  if (!keep) { haptic("tick"); return renderCompose(); }
  if (ms < 800 || !r.chunks.length) { toast("Hold on a little longer to record."); return renderCompose(); }
  const blob = new Blob(r.chunks, { type: r.mime }), bytes = new Uint8Array(await blob.arrayBuffer());
  // the shape: 40 bars over the whole recording, scaled to its loudest
  const lv = r.levels.length ? r.levels : [0.3], step = lv.length / VOICE_BARS, top = Math.max(0.05, ...lv);
  const wave = Array.from({ length: VOICE_BARS }, (_, i) => { const a = lv.slice(Math.floor(i * step), Math.max(Math.floor(i * step) + 1, Math.floor((i + 1) * step))); return Math.round(15 * Math.min(1, Math.max(...a) / top)).toString(16); }).join("");
  S.attach = { voice: true, bytes, mime: r.mime, ms: Math.round(ms), wave, preview: URL.createObjectURL(blob) };
  renderCompose();                                // (now there's something to send)
  await send();
}

/* ---------- the outbox: pigeons waiting for signal ----------
   A message sent with no connection is already sealed; it waits here (in
   IndexedDB, as ciphertext, never as words) and takes off by itself once the
   phone is back online. The server takes each id once, so sending one twice
   is harmless. If the server turns one down (not your turn any more, say) it
   stays, marked, for you to retry or delete. */
const outKey = () => "outbox:" + S.me.id;
async function outboxSave() { try { await idb.set(outKey(), S.outbox.map(({ id, to, path, meta, blob, kind, at, err }) => ({ id, to, path, meta, blob, kind, at, err }))); } catch (_) {} }
async function outboxAdd(o) { S.outbox.push(o); await outboxSave(); }
async function outboxLoad() {
  let list = [];
  try { list = (await idb.get(outKey())) || []; } catch (_) {}
  S.outbox = list.filter((o) => o && o.id);
  for (const o of S.outbox) { try { await outboxOpen(o); } catch (e) { console.warn("outbox", e?.message); o.err = o.err || "This pigeon couldn’t be opened on this phone."; } }
}
// what one says, opened again with this phone's key (after a reload)
async function outboxOpen(o) {
  if (!S.plain.has(o.id)) {
    const g = group(o.to);
    if (g) await decryptGroup(g, { id: o.id, from: S.me.id, body: o.meta.body, key: o.meta.keys[S.me.id] });
    else if (friend(o.to)) await decrypt(o.to, { id: o.id, from: S.me.id, to: o.to, ct: o.meta.ct });
  }
  const p = S.plain.get(o.id);
  if (o.blob && (p?.p || p?.v) && !S.photos.has(o.id)) {
    try {
      const plain = p.v ? await E2E.openPhoto(o.id, p.v, o.blob, "voice") : await E2E.openPhoto(o.id, p.p, o.blob);
      S.photos.set(o.id, URL.createObjectURL(new Blob([plain], { type: p.v ? voiceMime(p.v.m) : p.p.m === "image/gif" ? "image/gif" : "image/jpeg" })));
    } catch (_) {}
  }
}
// Try Again, on one the server turned down: a group's may have changed since it was sealed, so the same key is
// wrapped again for whoever's in it now (the sealed words and photo stay as they are); one told when to land can't
// land in the past. (Only once you've seen why it didn't go: nothing is ever re-addressed by itself.)
async function outboxRetry(o) {
  if (o.meta?.landAt && o.meta.landAt <= now()) throw new Error("Its landing time has passed. Delete it and send it again.");
  const g = group(o.to); if (!g || !o.meta?.keys) return;
  const mine = { id: S.me.id, pub: S.myPub || S.me.pub };
  const w = await E2E.open(await pairFor(mine.pub), { id: o.id, from: S.me.id, to: S.me.id, type: "wrap" }, o.meta.keys[S.me.id]).catch(() => null);
  if (!w?.k) throw new Error("This pigeon couldn’t be sealed again. Delete it and send it again.");
  const keys = {};
  for (const p of [mine, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id: o.id, from: S.me.id, to: p.id, type: "wrap" }, { k: w.k, h: w.h });
  o.meta = { ...o.meta, keys };
}
let flushing = null;
async function outboxFlush(force) {
  if (!S.me || !S.outbox.length || flushing) return flushing;
  if (navigator.onLine === false && !force) return;
  flushing = (async () => {
    let sent = 0;
    for (const o of [...S.outbox]) {
      if (o.err && !force) continue;
      try {
        if (o.blob) {
          const form = new FormData();
          form.append("meta", JSON.stringify(o.meta));
          form.append("photo", new Blob([o.blob], { type: "application/octet-stream" }), "photo.bin");
          await api(o.path, { method: "POST", form });
        } else await api(o.path, { method: "POST", body: o.meta });
        sent++;
      } catch (e) {
        if (e.offline) break;                                   // still no signal: try again later
        // a hiccup (the server busy, too many at once): it stays waiting and goes next time; only a real "no" stops it
        if (!e.status || e.status >= 500 || e.status === 408 || e.status === 429) break;
        if (e.status !== 409 || !/already sent/.test(e.message)) { o.err = e.message; await outboxSave(); continue; }
      }
      S.outbox = S.outbox.filter((x) => x.id !== o.id); await outboxSave();   // (on screen, it turns from waiting to flying)
    }
    if (sent) { haptic("success"); toast(sent === 1 ? "Your pigeon took off." : `${sent} pigeons took off.`); }
    if (sent || S.outbox.some((o) => o.err)) { for (const id of new Set([S.chat])) if (id && S.view === "chat") await loadChat(id).catch(() => {}); render(); }
  })();
  try { await flushing; } finally { flushing = null; }
}
window.addEventListener("online", () => { S.offline = false; renderOffline(); outboxFlush(); sync(); });
window.addEventListener("offline", () => { S.offline = true; renderOffline(); });
// yours on its way to the server: an outline at the foot of the chat, "Sending…", until it takes off (send)
const pendingBubble = (p) => `<div class="b me sending k-${esc(p.kind || "standard")}${S.fresh.has(p.id) ? ` fresh" data-fresh="${esc(p.id)}` : ""}" data-key="m:${esc(p.id)}" data-sig="pending">${p.q ? quoteHtml(p.q, group(p.to)) : ""}${esc(p.t).replace(/\n/g, "<br>")}<span class="ft">Sending…</span></div>`;
// a waiting pigeon in its chat: your message, with a badge
function outboxBubbles(chat) {
  return S.outbox.filter((o) => o.to === chat).map((o) => {
    const p = S.plain.get(o.id) || { t: "" }, ph = S.photos.get(o.id);
    const pic = p.v ? voiceHtml(o.id, p.v, true) : p.p ? `<div class="ph"${ph ? "" : ' data-empty="1"'}>${ph ? `<img src="${esc(ph)}" alt="${p.p.m === "image/gif" ? "GIF" : "Photo"}">` : `<span>${p.p.m === "image/gif" ? "GIF" : "Photo"}</span>`}</div>` : "";
    return `<div class="b me pending${o.err ? " failed" : ""}" data-key="m:${esc(o.id)}" data-sig="wait${o.err ? "!" : ""}" data-mid="${esc(o.id)}">${pic}${esc(p.t || "").replace(/\n/g, "<br>")}</div>
      <div class="meta me" data-key="mt:${esc(o.id)}" data-sig="${o.err ? "!" : ""}"><button type="button" class="fl outq${o.err ? " bad" : ""}" data-act="outmenu" data-id="${esc(o.id)}">${o.err ? `${I.warn} Not sent · ${esc(o.err)}` : `${I.clock} Waiting for signal`}</button></div>`;
  }).join("") + (S.pending?.to === chat ? pendingBubble(S.pending) : "");
}

async function send() {
  const raw = $ta.value, text = (dumbText() ?? raw).trim();
  if ((!text && !S.attach) || S.busy || $(".send", $compose).disabled) return;
  if (S.sendKind === "standard" && S.outbox.some((o) => o.to === S.chat && o.kind === "standard" && !o.err)) { S.err = "Your pigeon is still waiting for signal. A swift, turbo or rocket can go too."; renderCompose(); return; }
  S.busy = true; S.err = ""; renderCompose();
  // what's being sent belongs to this chat, even if you leave it before it's gone
  const to = S.chat, att = S.attach, here = () => S.view === "chat" && S.chat === to;
  S.sendingTo = to; S.sending = att;
  // words alone show straight away, waiting at the foot of the chat as they go up, and the box is clear for the next
  // (a photo or a voice pigeon shows its own progress, in its card)
  const id = uuid(), rt = S.replyTo && S.replyTo.chat === to ? S.replyTo : null, kind = S.sendKind;   // (taken now: a /dumb pigeon's comes from the box)
  if (!att) {
    S.pending = { id, to, t: text, kind, q: rt && { id: rt.id, from: rt.from, t: rt.t, ...(rt.p ? { p: rt.p } : {}) } };
    S.fresh.set(id, Date.now()); S.replyTo = null; $ta.value = ""; fitTa(); S.stick = true; S.glideDown = true; render();
  }
  const tidy = () => {
    if (!att) return;              // (words alone left the box as they went up: what's in it now is the next one)
    if (att.preview && !(att.gif || att.voice)) URL.revokeObjectURL(att.preview); if (S.attach === att) S.attach = null;
    if (here()) { $ta.value = ""; fitTa(); } else S.drafts.delete(to);
  };
  try {
    const mc = !group(to) && moonChat(friend(to)), sc = !mc && schedFor(to), vi = !mc && !sc && viaFor(to);    // (a lunar pigeon goes straight there, now)
    const payload = { t: text };
    if (rt) payload.q = { id: rt.id, from: rt.from, t: rt.t, ...(rt.p ? { p: rt.p } : {}) };      // sealed with the rest
    let blob = null;
    if (att?.voice) {
      showUpload("seal");
      const sealed = await E2E.sealPhoto(id, att.bytes, "voice");
      payload.v = { k: sealed.k, iv: sealed.iv, m: att.mime, d: att.ms, w: att.wave };
      blob = sealed.data;
    } else if (att) {
      showUpload("seal");
      const sealed = await E2E.sealPhoto(id, att.bytes);
      payload.p = { k: sealed.k, iv: sealed.iv, w: att.w, h: att.h, ...(att.gif ? { m: "image/gif" } : {}) };
      blob = sealed.data;
    }
    const once = !!blob && !att?.voice && !att?.gif;            // photos are view-once; GIFs and voice pigeons aren't
    const g = group(to), bd = kind === "dumb" ? null : birdFor(), carry = { ...(bd ? { bird: bd.id } : {}), ...(blob ? { once } : {}) };
    let meta;
    const route = routeStyle() === "fastest" ? {} : { route: routeStyle() };   // the way it goes
    if (g) {
      // sealed once; its key sealed for each member (and for me, so my other phones can read it)
      const { body, key, h } = await E2E.sealGroup({ id, from: S.me.id, group: g.id, type: "msg" }, payload);
      const keys = {};
      for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
      meta = { id, group: g.id, body, keys, pigeon: kind, ...carry, ...route };
    } else meta = { id, to, ct: await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, payload), pigeon: kind, ...carry, ...(vi ? {} : route), ...(sc ? { landAt: sc.at } : {}),
      ...(!vi && !sc && noShipOn() && kind === "standard" ? { noShip: true } : {}),
      // a stopover: the friend on the way gets their own sealed copy (words only; photos stay between you two)
      ...(vi ? { via: vi.id, viaCt: await E2E.seal(await base(vi.id), { id, from: S.me.id, to: vi.id, type: "via" }, { t: text, ...(blob ? { ph: 1 } : {}) }) } : {}) };
    const path = g ? "group-messages" : "messages";
    // no signal: it waits on the perch (sealed already) and takes off once there is
    const queue = async () => {
      await outboxAdd({ id, to, path, meta, blob, kind, at: Date.now() });
      S.pending = null;                // (the same pigeon, waiting on the perch now)
      S.plain.set(id, payload);
      if (att && !once) { S.photos.set(id, att.preview); att.preview = null; }
      tidy();
      if (rt) S.replyTo = null;
      if (sc) S.sched = null; if (vi) S.via = null; S.noShip = null;
      S.pick = null; S.stick = true; showUpload(null);
      haptic("tick"); render();
    };
    if (navigator.onLine === false) { await queue(); S.busy = false; renderCompose(); return; }
    let r;
    try {
    if (blob) {
      const form = new FormData();
      form.append("meta", JSON.stringify(meta));
      form.append("photo", new Blob([blob], { type: "application/octet-stream" }), "photo.bin");
      showUpload("send", 0);
      r = await api(path, { method: "POST", form, size: blob?.size ?? blob?.byteLength, onProgress: (f) => showUpload("send", f) });
      showUpload("send", 1); await new Promise((res) => setTimeout(res, 300));   // let the bar finish its glide
      upAnim?.stop(); upAnim = null;
    } else r = await api(path, { method: "POST", body: meta });
    } catch (e) { if (!e.offline) throw e; upAnim?.stop(); upAnim = null; await queue(); S.busy = false; renderCompose(); return; }
    S.pick = null;                    // next time, back to the default
    { const f = friend(to), was = f?.streak, s = r.streak;
      if (f && s) { f.streak = s; if (s.n >= STREAK_MIN && (!was || !was.today || was.n < s.n)) toast(`${I.flame} ${s.n}-day streak with ${esc(first(f.name))}`); } }
    if (r.message.mystery) {
      const k = kindOf(r.message), word = { rocket: "A rocket pigeon!", turbo: "A turbo pigeon!", swift: "A swift pigeon.", standard: "A standard pigeon.", dumb: "A dumb pigeon…" }[k];
      if (r.me) S.me = r.me;
      setTimeout(() => toast(`${pg(k, S.me.skin)} ${word} ${r.message.flock ? "Off it goes." : `It lands ${esc(atTime(r.message.deliverAt))}.`}`), 350);
      if (k === "rocket") haptic("success");
    }
    S.birdPick = null; const flew = r.message.bird?.id && S.birds.find((b) => b.id === r.message.bird.id); if (flew) flew.state = "flying";
    haptic("success");
    if (rt) S.replyTo = null;
    if (sc) { S.sched = null; if (r.me) S.me = r.me; toast(`Scheduled. It lands ${fmtLand(r.message.deliverAt)}.`); }
    S.noShip = null;
    if (vi) { S.via = null; toast(`It’ll stop with ${esc(first(friend(vi.id)?.name || "your friend"))} on the way.`); }
    S.plain.set(id, payload);
    if (att && !once) { S.photos.set(id, att.preview); att.preview = null; }   // keep the preview as our own copy (not of a view-once photo)
    tidy(); S.stick = true; S.pending = null;
    const list = S.msgs.get(to) || []; list.push(r.message); S.msgs.set(to, list);
    if (att) S.fresh.set(r.message.id, Date.now());        // (words were up already: they just take off)
    loadSkies();                      // it's in the air now: ready for the strip on Messages
    render();                         // show it now; on a slow connection the sync below can outlast the pop
    await sync();
    offerNotify();
  } catch (err) {
    // (the browser's own errors, a key it can't use, can come with no words: never a silent nothing)
    const say = err.message || "Couldn’t seal this pigeon. Try again, or check their safety number.";
    if (here()) S.err = say; else toast(esc(say)); showUpload(null);
    // words that were up already come back down into the box (or its draft), with what they replied to
    if (!att && S.pending?.id === id) {
      S.pending = null;
      if (here()) { $ta.value = $ta.value.trim() ? `${raw}\n${$ta.value}` : raw; fitTa(); }
      else { const d = S.drafts.get(to); S.drafts.set(to, d?.trim() ? `${raw}\n${d}` : raw); }     // (with anything typed after, kept as its draft)
      if (rt && !S.replyTo) S.replyTo = rt;
      if (here()) render();
    }
  }
  if (att?.preview && S.attach !== att) URL.revokeObjectURL(att.preview);     // (left behind when you left its chat, and not kept)
  S.busy = false; S.sendingTo = null; S.sending = null; renderCompose();
}
// Drawn buttons (a passport's stamps: SVG, not <button>) answer Enter and Space too; the passport turns with the arrow keys
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && !(e.target instanceof HTMLButtonElement) && e.target.getAttribute("role") === "button" && e.target.dataset?.act) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && S.sheet?.type === "passport" && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
    const book = $(".ppbook", $layer); if (book) { e.preventDefault(); book.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * book.clientWidth, behavior: STILL.matches ? "auto" : "smooth" }); }
  }
});
$(".page").addEventListener("keydown", (e) => {
  const f = e.target.closest?.("form[data-form=signup], form[data-form=signin]");
  if (f && e.key === "Enter" && e.target.tagName === "INPUT") {
    const ins = [...f.querySelectorAll("input")], i = ins.indexOf(e.target);
    if (i < ins.length - 1) { e.preventDefault(); ins[i + 1].focus(); return; }
  }
  if (e.target.id === "msg" && e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); send(); }
});

/* ============================================================
   Appearance (theme.js applies it before the page draws)
   ============================================================ */
const THEMES = ["light", "dark", "auto"];
const THEME_NAMES = { light: "Light", dark: "Dark", auto: "Automatic" };
function theme() { try { const t = localStorage.getItem("inflight-theme"); return THEMES.includes(t) ? t : "light"; } catch (_) { return "light"; } }
// Saved to the account (so every phone you sign in on matches) and kept on
// this phone too, so theme.js can draw the right colours before the app loads.
function setTheme(t) {
  if (!THEMES.includes(t)) return;
  keepTheme(t);
  if (S.me) {
    S.me.appearance = t;
    api("me", { method: "PATCH", body: { appearance: t } }).catch(() => toast("Couldn’t save that to your account. It’s set on this phone for now."));
  }
}
function keepTheme(t) {
  try { localStorage.setItem("inflight-theme", t); } catch (_) { /* this visit only */ }
  applyTheme(t);
}
// After each sync: the account's choice wins; an account that has never
// chosen takes this phone's, if it was chosen here (not just the default: the
// account's appearance is every app's on the site, so only a choice is kept).
function syncTheme() {
  if (!S.me) return;
  const mine = S.me.appearance;
  if (THEMES.includes(mine)) { if (mine !== theme()) themeFade(() => { keepTheme(mine); if (S.view === "account" || S.sheet?.type === "appearance") { render(); renderSheet(); } }); }
  else if (!S.themeSent && chosenTheme()) { S.themeSent = true; api("me", { method: "PATCH", body: { appearance: theme() } }).then((r) => { S.me = r.me; }).catch(() => {}); }
}
// Light to Dark (or back): the whole app cross-fades to its new colours, rather than changing in one frame
// (a cross-fade is what Reduce Motion keeps too: shorter, styles.css)
function themeFade(go) { if (document.startViewTransition && !document.hidden) { const t = document.startViewTransition(go); t.ready.catch(() => {}); t.finished.catch(() => {}); } else go(); }
function chosenTheme() { try { return THEMES.includes(localStorage.getItem("inflight-theme")); } catch (_) { return false; } }
function applyTheme(t = theme()) {
  document.documentElement.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", document.documentElement.classList.contains("night") ? "#03050c" : dark ? "#1b2860" : "#dde3fb");   // (the sky at its top: styles.css --sky-top)
}
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

/* ============================================================
   Notifications
   ============================================================ */
// Push needs a service worker, and on iPhone only works once Chat is on the Home Screen.
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => !!(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone);
function pushState() {
  if (!pushSupported()) return isIOS() && !standalone() ? "homescreen" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return S.pushOn ? "on" : "off";
}
const sameKey = (sub, key) => { const k = sub.options?.applicationServerKey; return !!k && b64url(new Uint8Array(k)) === key; };
async function pushSub(ask) {
  const reg = await navigator.serviceWorker.register("/pigeon/sw.js", { scope: "/pigeon/" });
  await navigator.serviceWorker.ready;
  const { key } = await api("push-key");
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe(); sub = null; }
  if (!sub && !ask) return null;
  sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) });
  // told the server about this one lately (same account, same phone): no need again on every launch
  const mark = `${S.me?.id}|${sub.endpoint}`;
  let last = null; try { last = JSON.parse(localStorage.getItem("inflight-pushsub") || "null"); } catch (_) {}
  if (ask || !last || last.k !== mark || Date.now() - last.at > DAY) {
    await api("push-sub", { method: "POST", body: sub.toJSON() });
    try { localStorage.setItem("inflight-pushsub", JSON.stringify({ k: mark, at: Date.now() })); } catch (_) {}
  }
  return sub;
}
async function pushEnable() {
  if (pushState() !== "off") return;
  S.pushBusy = true; render();
  try {
    const perm = await Notification.requestPermission();    // first, while the tap still counts
    if (perm !== "granted") { if (perm === "denied") toast("Notifications are blocked. Turn them on for Chat in your phone’s Settings."); return; }
    S.pushOn = !!(await pushSub(true));
    if (S.pushOn) toast("Notifications are on. You’ll hear when a pigeon lands.");
  } catch (err) { console.warn("push", err); toast("Couldn’t turn on notifications on this phone."); }
  finally { S.pushBusy = false; render(); if (S.sheet?.type === "notifications") renderSheet(); }
}
// Notifications on this phone, in one tap (from the account's Notifications page, #notify): asked as Chat's ready
function askNotify() {
  const ps = pushState();
  if (ps === "on") return toast("Notifications are already on on this phone.");
  if (ps !== "off") return toast(esc({ homescreen: "On iPhone, notifications need Chat on your Home Screen: tap Share, then Add to Home Screen.", denied: "Notifications are blocked for Chat. Turn them on in your phone’s Settings.", unsupported: "This browser can’t show notifications." }[ps] || "Notifications can’t be turned on here."));
  IFL.allow("chat", "Chat tells you when a pigeon lands, and when friends ask. What it tells you is set in your account.", async () => { await pushEnable(); return !!S.pushOn; });
}
async function pushDisable(quiet) {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/pigeon/");
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await api("push-sub", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  } catch (_) { /* nothing to undo */ }
  S.pushOn = false;
  if (!quiet) { toast("Notifications are off on this phone."); render(); if (S.sheet?.type === "notifications") renderSheet(); }
}
// On launch: if this phone already has push on, make sure the server knows it (and for this sign-in).
async function refreshPush() {
  // quiet hours follow the phone's time zone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && S.me?.notify && S.me.notify.tz !== tz) api("me", { method: "PATCH", body: { notify: { tz } } }).then((r) => { S.me = r.me; }).catch(() => {});
  if (!pushSupported() || Notification.permission !== "granted") { S.pushOn = false; return; }
  try { S.pushOn = !!(await pushSub(false)); } catch (_) { S.pushOn = false; }
  if (S.view === "account") render();
  if (S.sheet?.type === "notifications") renderSheet();
}
async function loadSessions() {
  try { const { sessions } = await api("sessions"); if (S.sheet?.type === "sessions") { S.sheet.list = sessions; S.sheet.err = null; renderSheet(); } }
  catch (err) { if (S.sheet?.type === "sessions") { S.sheet.err = err.message; renderSheet(); } else toast(esc(err.message)); }
}
async function confirmEmail(token) {
  try {
    const r = await api("confirm-email", { method: "POST", body: { token } });
    haptic("success"); toast(`Email confirmed for @${esc(r.handle)}.`);
    if (S.me && S.me.handle === r.handle) { S.me.emailOk = true; if (S.sheet) renderSheet(); }
  } catch (err) { toast(esc(err.message)); }
}
async function setEmailNotify(on) {
  try { const r = await api("me", { method: "PATCH", body: { notifyEmail: on } }); S.me = r.me; render(); if (S.sheet?.type === "notifications") renderSheet(); toast(!on ? "Emails are off." : S.me.emailOk === false ? `Confirm ${esc(S.me.email)} first: tap the link we emailed you.` : `We’ll email ${esc(S.me.email)} when a pigeon has been waiting a while.`); }
  catch (err) { toast(esc(err.message)); }
}
// After someone's first pigeon: offer to tell them when the reply lands. Asked once per phone.
async function offerNotify() {
  if (S.pushOn || S.me?.notifyEmail || S.notifyAsked) return;
  S.notifyAsked = true;
  if (await idb.get("notify-asked")) return;
  await idb.set("notify-asked", true);
  const ps = pushState();
  if (ps === "off") toast("Want to hear when the reply lands?", "Notify Me", () => pushEnable());
  else if (S.emailOn) toast("Want an email when the reply lands?", "Email Me", () => setEmailNotify(true));
  else if (ps === "homescreen") toast("Add Chat to your Home Screen to get notified when the reply lands.", "How", () => go("account"));
}
async function openFlightLog(at) {
  const sh = S.sheet = { type: "flightlog", data: null }; renderSheet();
  try {
    sh.data = await api("flight-log"); if (S.sheet !== sh) return;
    shapesLoad();                       // (the passport's country outlines, fetched now: it opens as a book straight away)
    renderSheet();
    // straight to the looks, once they're drawn (that can wait until the sheet is up)
    if (at === "skins") { const t0 = performance.now(), go = () => { const el = $(".badges.skins", $layer)?.previousElementSibling; if (el) return setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 150); if (performance.now() - t0 < 2000 && S.sheet) setTimeout(go, 100); }; go(); }
  }
  catch (err) { if (S.sheet === sh) { S.sheet = null; renderSheet(); } toast(esc(err.message)); }
}
// Links from notifications and emails: #open=<friend> opens that chat,
// #requests the friend requests, #account the Account tab, #flightlog your
// Flight Log; and from the site's other apps, #share=<words>, to send to a
// friend (it waits in the message box of the next chat you open). Opened
// while signed out, they wait until you've signed in.
function openLink(hash) {
  const o = /#open=([0-9a-f-]{36})/.exec(hash || ""), rq = /#requests/.test(hash || ""), acc = /#account\b/.test(hash || ""), log = /#flightlog\b/.test(hash || "");
  let sh = null;
  try { sh = /#share=/.test(hash || "") ? (new URLSearchParams(String(hash).slice(1)).get("share") || "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500) : null; } catch (_) {}
  if (!o && !rq && !acc && !log && !sh) return false;
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (!S.me) { S.pendingLink = hash; return true; }
  closePop(); S.sheet = null; renderSheet();
  if (sh) { S.share = sh; go("messages"); toast("Pick who to send it to. It’s waiting in the message box."); return true; }
  if (log) { go("account"); openFlightLog(); }
  else if (acc) go("account");
  else if (o && (friend(o[1]) || group(o[1]))) go("chat", o[1]);
  else { go("friends"); if (S.incoming.length) { S.sheet = { type: "requests" }; renderSheet(); } }
  return true;
}

/* ============================================================
   Start
   ============================================================ */
// Dynamic Type: iPhones set the reading size in Settings; message text, chat
// rows and the message box follow it (the rest stays put, so nothing breaks)
function textSize() {
  const probe = document.createElement("span"); probe.className = "tsprobe"; probe.textContent = "x"; document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize); probe.remove();
  const ts = px > 0 && CSS.supports?.("font", "-apple-system-body") ? Math.min(1.6, Math.max(0.85, px / 17)) : 1;
  document.documentElement.style.setProperty("--ts", ts.toFixed(3));
}
// A computer: the page says Chat isn't available (theme.js decided, before
// anything was drawn), with a code to scan that opens this same link on a phone.
// Nothing else runs: no session, no sync, nothing stored.
function notAvailable() {
  const site = $(".na-site"); if (site) site.textContent = NEW_HOME ? NEW_HOME.replace(/^https?:\/\//, "") : HERE();
  const box = $(".na-qr"); if (!box) return;
  const link = /#(add|reset|verify|open|invite)=/.test(location.hash);
  box.innerHTML = `${qrSvg(NEW_HOME ? `${NEW_HOME}/${location.hash}` : location.href, { title: link ? "QR code for this link" : "QR code for Chat" })}<small>${link ? "Scan with your phone’s camera to open this link there." : "Scan with your phone’s camera to open it there."}</small>`;
  box.hidden = false;
}
// The move to chat.inflite.ai: the first time Chat starts at the new
// address on a phone, it brings over what the phone kept at the old one (the sign-in,
// unsent pigeons, trusted keys, settings) from a hidden page there (pigeon/handover.js),
// so nobody has to sign in again. Once only: signing out here doesn't bring it back.
// Then, signed in here, what was kept there is cleared (once, for a phone that moved before
// too), so the key isn't left at an address the home page shares.
// (Chat's on a site of its own now, inflite.ai, whose pages can't see what the old one kept: there's no handing over
// from there any more, so this is off. Signing in brings the key back, with a passkey or the password.)
const OLD_HOME = null;
async function moveIn() {
  const DONE = "inflight-movedin", CLEARED = "inflight-oldcleared";
  let moved, cleared;
  try { moved = localStorage.getItem(DONE); cleared = localStorage.getItem(CLEARED); } catch (_) { return; }
  if (!OLD_HOME || (moved && cleared)) return;
  const here = !!(await idb.get("session"))?.token;
  if (!here && moved) return;                              // (signed out here since: nothing to bring, and nothing to clear for)
  const f = document.createElement("iframe");
  const ask = (wanted, ms, post) => new Promise((res) => {
    const done = (v) => { clearTimeout(late); removeEventListener("message", on); res(v); };
    const on = (e) => { if (e.origin === OLD_HOME && e.source === f.contentWindow && e.data?.inflight === wanted) done(e.data); };
    const late = setTimeout(() => done(null), ms);       // (the old address not answering: try again next time)
    addEventListener("message", on);
    post();
  });
  const got = await ask("handover", 5000, () => {
    f.hidden = true; f.title = "Chat’s old address"; f.src = new URL("pigeon/handover", OLD_HOME + "/").href;   // (written so: the new address rewrites "/pigeon/…" paths to its root)
    document.body.append(f);
  });
  if (!got) return f.remove();
  if (!moved && !here) {
    const kv = got.kv && typeof got.kv === "object" ? got.kv : {}, ls = got.ls && typeof got.ls === "object" ? got.ls : {};
    // signed in there (with the key it signs in with): that sign-in, and all that goes with it
    if (kv.session?.token && kv.session.priv instanceof CryptoKey) for (const [k, v] of Object.entries(kv)) await idb.set(k, v);
    try {
      // (the old address's note of its push subscription is the old address's; this one makes its own)
      for (const [k, v] of Object.entries(ls)) if (/^inflight-[\w-]+$/.test(k) && k !== "inflight-pushsub" && typeof v === "string" && localStorage.getItem(k) == null) localStorage.setItem(k, v);
      localStorage.setItem(DONE, String(Date.now()));
    } catch (_) {}
    applyTheme();
  }
  // signed in here now: the old address's copy cleared
  if ((await idb.get("session"))?.token && await ask("handover-cleared", 3000, () => f.contentWindow?.postMessage({ inflight: "handover-clear" }, OLD_HOME)))
    try { localStorage.setItem(CLEARED, String(Date.now())); } catch (_) {}
  f.remove();
}

// At the old address: say where Chat went (at most once a day, and from Account any time)
function movedNote(force) {
  if (!NEW_HOME) return;
  try { const last = Number(localStorage.getItem("inflight-movednote") || 0); if (!force && Date.now() - last < DAY) return; localStorage.setItem("inflight-movednote", String(Date.now())); } catch (_) {}
  if (!force && (S.locked || S.sheet)) return;
  S.sheet = { type: "moved" }; renderSheet();
}

async function start() {
  if (document.documentElement.dataset.device === "computer") {
    // (a sign-in handed back is no use here: out of the address, and so out of the code to scan)
    if (/^#signin=/.test(location.hash)) history.replaceState(null, "", location.pathname);
    return notAvailable();
  }
  // at the old address, signed out in a browser: straight to the new one, with whatever link
  // brought you (an invite, a reset); a Home Screen app stays, to say how to move (movedNote)
  if (NEW_HOME && !standalone() && !(await idb.get("session"))?.token) return location.replace(`${NEW_HOME}/${location.hash}`);
  mount();
  textSize(); window.addEventListener("focus", textSize);
  // back from signing in on the account's page, with the code it handed back (taken out of the address at once)
  const signedBack = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash)?.[1];
  const you = signedBack ? new URLSearchParams(location.hash.slice(1)).get("f") : null;
  if (signedBack) history.replaceState(null, "", location.pathname);
  // (it comes in under the account's page's last picture, which theme.js has drawn already: app.js's own copy now)
  if (signedBack) arrival = arriving(you); else document.documentElement.classList.remove("arriving");
  if (/#(open=|requests|account\b|flightlog\b|share=)/.test(location.hash)) { S.pendingLink = location.hash; history.replaceState(null, "", location.pathname); }
  navigator.serviceWorker?.addEventListener?.("message", (e) => { if (e.data?.inflight === "open") openLink(e.data.hash); else if (e.data?.inflight === "sync" && S.me) sync(); });
  const m = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
  if (m) { keepAdd(m[1].toLowerCase()); history.replaceState(null, "", location.pathname); }
  else S.pendingAdd = keptAdd();                 // (a friend's link from before, still to use: making the account on its page in between)
  // a confirm-your-email link: works signed in or not, on any phone
  const cf = /#verify=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (cf) { history.replaceState(null, "", location.pathname); confirmEmail(cf[1]); }
  // an invite, or a reset link (from before they were the account's page's): passed on to it
  const away = /#(invite|reset)=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (away) return location.replace(toAccount(`#${away[1]}=${away[2]}`));
  if (!window.crypto?.subtle || !window.indexedDB) { S.view = "welcome"; render(); arrival?.away(); return toast("This browser can’t run Chat’s encryption. Try Safari or Chrome."); }
  // the old address asked for what it kept: signed in here already, that's only clearing it, done alongside; signed out,
  // the welcome is up while it's asked (what it hands over, a sign-in, is taken up below)
  if ((await idb.get("session"))?.token) moveIn().catch(() => {});
  else {
    let fresh = false; try { fresh = !!OLD_HOME && !localStorage.getItem("inflight-movedin"); } catch (_) {}
    if (fresh) { S.view = "welcome"; render(); }
    await moveIn().catch(() => {});
  }
  const saved = await idb.get("session");
  if (saved?.token && saved.priv) {
    S.token = saved.token; S.me = saved.me; S.priv = saved.priv;
    S.myPub = saved.pub || saved.me.pub;          // sessions saved before this kept the key as it was at sign-in
    if (!saved.pub) idb.set("session", { ...saved, pub: S.myPub });
    S.fp = await E2E.fingerprint(S.myPub);
    S.pins = (await idb.get("pins:" + saved.me.id)) || {};
    const had = Object.keys(S.pins).length; await restorePins();
    if (had && !S.pinsUnread && !(await idb.get("pinsup:" + saved.me.id).catch(() => null))) savePins();      // trusted before backups: save them now
    // (that sign-in ended while the app was closed, signed out elsewhere: the welcome, as from the start)
    if (!S.token) { movedNote(); if (signedBack) signInBack(signedBack); else resumeCheck(); } else {
    // (a code for a sign-in, signed in already: one from elsewhere, used up and no more)
    if (signedBack) {
      try { localStorage.removeItem(SIGNIN_KEY); } catch (_) {}
      // (swapped already on the first frame: the sign-in it made, not wanted here, signed out again; else used up)
      if (window.arvSwap?.code === signedBack) window.arvSwap.answer.then((x) => { if (x.ok && x.d?.token) fetch("/api/pigeon/logout", { method: "POST", headers: { Authorization: "Bearer " + x.d.token } }).catch(() => {}); }, () => {});
      else api("handback", { method: "POST", body: { code: signedBack, verifier: "" } }).catch(() => {});
      window.arvSwap = null;
    }
    S.view = S.pendingAdd ? "friends" : "messages";
    if (lockPrefs()) S.locked = true;               // the app lock: locked before anything is drawn
    await cacheLoad();                             // what you saw last time, at once
    await outboxLoad();
    render();
    arrival?.away();                               // (and the account's page's sky it came in under clears to it)
    // (the app is up by now: anything below going wrong mustn't stop the polling and the rest)
    try {
      // back from an update: the chat you were in (if it was moments ago)
      try { const here = JSON.parse(sessionStorage.getItem("inflight-here") || "null"); sessionStorage.removeItem("inflight-here");
        if (here && Date.now() - here.at < 60e3 && !S.pendingLink && (friend(here.chat) || group(here.chat))) S.pendingLink = "#open=" + here.chat; } catch (_) {}
      // a chat to open (a notification, or the one you were in) that's already on this phone: at once, not after the network
      if (S.pendingLink && !S.locked) { const id = /#open=([\w-]+)/.exec(S.pendingLink)?.[1]; if (id && (friend(id) || group(id))) { const h = S.pendingLink; S.pendingLink = null; openLink(h); } }
      await sync();
      outboxFlush();
      if (S.me && S.me.lat == null && !S.me.moon) go("locpick");
      else if (S.pendingAdd) { S.sheet = { type: "addfriend" }; renderSheet(); }
      else if (S.pendingLink) { const h = S.pendingLink; S.pendingLink = null; openLink(h); }
      refreshPush(); autoLocate(); movedNote();
      if (ASK_NOTIFY) setTimeout(askNotify, 600);
    } catch (e) { console.error("start", e); }
    }
  } else { if (S.view !== "welcome") go("welcome"); movedNote(); if (signedBack) signInBack(signedBack); else resumeCheck(); }
  // (Chat as it was before you went to sign in, brought back by the browser: anew, if you're signed in now)
  addEventListener("pageshow", (e) => { if (e.persisted && !S.me) idb.get("session").then((x) => (x?.token ? location.reload() : resumeCheck()), () => {}); });
  // an add-a-friend link opened while Chat is already open in this tab (an invite or a reset link: passed on)
  window.addEventListener("hashchange", async () => {
    if (openLink(location.hash)) return;
    const away = /#(invite|reset)=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
    if (away) { history.replaceState(null, "", location.pathname); return location.assign(toAccount(`#${away[1]}=${away[2]}`)); }
    const cf = /#verify=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
    if (cf) { history.replaceState(null, "", location.pathname); return confirmEmail(cf[1]); }
    const a = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
    if (!a) return;
    history.replaceState(null, "", location.pathname);
    keepAdd(a[1].toLowerCase()); if (S.me) { go("friends"); S.sheet = { type: "addfriend" }; renderSheet(); }
  });
  setInterval(() => { if (!AUTH_VIEWS.has(S.view) && $view) live(); flightCheck(); }, 1000);
  // every 15 s while open; after failures, less often (up to every 2 minutes) until one works
  let skipped = 0;
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const every = Math.min(8, 2 ** Math.max(0, (S.syncFails || 0) - 1));
    if (++skipped < every) return;
    skipped = 0; sync();
  }, POLL_MS);
  window.addEventListener("online", () => { S.syncFails = 0; sync(); });
  setInterval(() => { if (document.visibilityState === "visible") autoLocate(); }, AUTO_EVERY);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); checkUpdate(); autoLocate(); } else { stopLocWatch(); if (rec) recStop(false); } });     // (a recording stops when you leave the app)
  setInterval(checkUpdate, UPDATE_MS);
}

/* ---------------- updates ----------------
   The page carries a fingerprint of the app. When a newer one is live, an open
   copy reloads itself, unless you're in the middle of something, when it asks. */
// (the page's own version: its files' fingerprints, which the server checks before a phone may keep them)
const VERSION = document.querySelector('meta[name="inflight-version"]')?.content || "";
// a reload for a new version comes back to the chat you were in, where you were in it
function reloadHere() {
  try { if (S.me && S.view === "chat" && S.chat) sessionStorage.setItem("inflight-here", JSON.stringify({ chat: S.chat, at: Date.now() })); } catch (_) {}
  location.reload();
}
const UPDATE_MS = 5 * 60 * 1000;
let updateReady = false;
// (and its version, kept for your account's page, and said once if it's new since last time)
IFL.built("chat", APP_VERSION);
async function checkUpdate() {
  if (!VERSION || document.visibilityState !== "visible") return;
  let live = "";
  try { live = /name="inflight-version" content="([\w-]+)"/.exec(await (await fetch("/pigeon/", { cache: "no-store" })).text())?.[1] || ""; } catch { return; }
  if (!live || live === VERSION) return;
  const busy = S.sheet || S.attach || ($ta && $ta.value.trim()) || (AUTH_VIEWS.has(S.view) && S.view !== "welcome") || $(".asheet, .menu-pop")
    || S.view === "chat" || inField(document.activeElement)               // (never under your fingers: a reload would take the keyboard away)
    || rec || onceOpen || (S.player && !S.player.paused) || S.busy;       // (never mid-recording, mid-photo, mid-voice-note or mid-send)
  if (!busy) return reloadHere();
  updateReady = true;
  toast("A new version of Chat is ready.", "Update", reloadHere);
}
// When a pigeon you can see lands, fetch it straight away instead of waiting for the next poll.
let nextLanding = 0;
function flightCheck() {
  if (!S.me) return;
  const t = now();
  const lands = [];
  for (const f of S.friends) if (f.last?.flying) lands.push(f.last.deliverAt);
  // (only the chat on screen: sync fetches no other, so a chat you've left keeps the copy it had, its pigeons still "flying")
  const open = S.view === "chat" && S.chat && !S.locked ? S.msgs.get(S.chat) : null;
  for (const m of open || []) if (m.flying) lands.push(m.waiting ? m.sentAt : m.deliverAt);
  const due = lands.filter((x) => x <= t);
  if (due.length && Date.now() > nextLanding) { nextLanding = Date.now() + 5000; setTimeout(sync, 1500); }
}
// if starting goes wrong, say so and offer a way out, rather than "Opening Chat…" for ever
function bootFail(err) {
  console.error("start", err);
  document.documentElement.classList.remove("arriving"); arrival?.away();      // (never the account's page's sky over what went wrong)
  if (S.view !== "loading" && $view?.firstElementChild && !$(".loading", root())) return;
  try { if (S.me?.id) idb.del("cache:" + S.me.id); } catch (_) {}
  const scr = root(); if (!scr) return;
  scr.innerHTML = `<div class="bootfail" role="alert"><div class="appicon">${I.bird}</div><h1>Chat couldn’t open</h1>
    <p>Something on this phone got in the way. Your messages are safe: they’re on the server, and your key is still here.</p>
    <button type="button" class="btn wide" id="bootretry">Try Again</button></div>`;
  $("#bootretry")?.addEventListener("click", () => location.reload());
}
window.addEventListener("unhandledrejection", (e) => { if (S.view === "loading") bootFail(e.reason); });
// the copy of the app kept for opening with no signal (and notifications) live in the service worker
if ("serviceWorker" in navigator && document.documentElement.dataset.device !== "computer") navigator.serviceWorker.register("/pigeon/sw.js", { scope: "/pigeon/" }).catch(() => {});
start().catch(bootFail);
