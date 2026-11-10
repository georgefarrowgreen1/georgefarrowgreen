// Chat — the phone app. Everything readable is encrypted and decrypted
// here; the server (functions/api/pigeon) only ever sees ciphertext.
import { E2E, te, rand, b64, b64url, fromB64url, uuid } from "./crypto.js";
import { PLACES, nearestPlace, snapToMile, snapTo } from "./places.js";
import { RANGES } from "./countries.js";
import { placeAt } from "./placegrid.js";
import { qrSvg } from "./qr.js";
import { linkParts, linksIn } from "./links.js";
import { payloadParts, padPayload, readShareHash, canForward, liveKey, liveItem, isLive, cardWords, normCard, packCard } from "./cards.js";
import { cardHtml, askHtml, sideBySideHtml, inviteHtml, answerHtml, whenHtml } from "./cardview.js";
import { waitingDigest } from "./digest.js";
import { surfaceKm, moonKm, marsKm, spaceKinds, spaceFlight, spaceNow, legOf, lunarDay, marsClock } from "./space.js";

// ==== InFlite's menu, shared: from .tools/inflite/menu.js by node .tools/iflmenu.mjs (change it there) ====
// InFlite's menu: one menu, the same in every app, opened from your photo. You (a tap to your account), the app's own
// few rows, and a foot with its version and Sign Out. With it: the same note in every app after it's updated itself,
// the updater every app shares (updates, below), and the hub (hub, below: every app as a page of inflite.ai).
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
    bubble: '<path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5Z"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    // (and the ones the hub's sections ask for by name: InFlite Today's framework, ui.icon, today/public/roof/ui.js)
    up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
    mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    minus: '<path d="M5 12h14"/>',
    more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
    reply: '<path d="M10 8 4 13l6 5"/><path d="M4 13h10a6 6 0 0 1 6 6v1"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4.5 2 4.5H5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
    warn: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5M12 17.3v.1"/>',
    map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
    bird: '<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.3-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3M14 17.8V21"/>',
    gif: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10H8.5a1.5 1.5 0 0 0 0 3H10v-1.5M12.5 9.5v5M15.5 14.5v-5H18M15.5 12H17"/>',
    attachment: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    heart: '<path d="M19.5 13.6 12 21l-7.5-7.4A5 5 0 1 1 12 7a5 5 0 1 1 7.5 6.6Z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
    sparkle: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z"/><path d="M19 15.5c.2 1.5.9 2.2 2.5 2.5-1.6.3-2.3 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5Z"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    wave: '<path d="M3 12h3l2.5-6 4 13 3-9 2 2H21"/>',
    ride: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="m5.5 16.5 4-8h6l3 8M9.5 8.5 12.5 16.5M14 5.5h3"/>',
    medal: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10 6 3h4l2 4 2-4h4l-2.5 7"/><path d="m12 12.5.9 1.7 1.9.3-1.4 1.3.3 1.9-1.7-.9-1.7.9.3-1.9-1.4-1.3 1.9-.3Z"/>',
    strength: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  // (the same glyph, by the other names the apps' sections use for it)
  const ALSO = { photo: "image", edit: "pen", done: "check", later: "clock", chat: "bubble", clip: "attachment", today: "calendar", news: "file", weather: "sun", markets: "trend", fitness: "heart" };
  const svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] || GLYPHS[ALSO[name]] || ""}</svg>`;
  const urls = {};
  // (an app's icon, by its name or the hub's for it (its sections: chats, finance); one it hasn't, no picture at all, never
  // a broken one)
  const APP_AS = { chats: "chat", finance: "markets", email: "mail" };
  const iconUrl = (a) => { a = APP_AS[a] || a; return !ICONS[a] ? "" : urls[a] || (urls[a] = URL.createObjectURL(new Blob([ICONS[a]], { type: "image/svg+xml" }))); };
  const el = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  };

  // the same short note in every app
  // (read out from a place that's always there, unseen, as the home page's toast is: a note only just put in the page
  // with its words already in it often isn't read out at all)
  const sayEl = el("p", "ifm-say"); sayEl.setAttribute("role", "status"); sayEl.setAttribute("aria-live", "polite");
  document.body?.append(sayEl);
  let noteEl = null, noteT = 0;
  function note(app, title, sub) {
    noteEl?.remove();
    clearTimeout(noteT);
    const img = el("img", "ifm-note-ic"); img.src = iconUrl(app); img.alt = "";
    noteEl = el("div", "ifm-note", img, el("span", "ifm-note-tx", el("b", "", title), sub ? el("small", "", sub) : null));
    document.body.append(noteEl);
    if (!sayEl.isConnected) document.body.append(sayEl);
    sayEl.textContent = "";
    const n = noteEl;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (noteEl !== n) return; n.classList.add("on"); sayEl.textContent = sub ? `${title}. ${sub}` : title; }));
    // (what it said emptied as it goes, so the same words next time are a change, and read out again)
    noteT = setTimeout(() => { n.classList.remove("on"); sayEl.textContent = ""; setTimeout(() => n.remove(), 400); }, 3600);
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
  // this app's version, as it opens: said once if it's new since last time, with what's new in it (news: a line, set
  // beside the app's version with each one that goes out)
  function built(app, build, news) {
    let was = null;
    try { was = localStorage.getItem(`ifl-build:${app}`); localStorage.setItem(`ifl-build:${app}`, build); } catch (_) {}
    if (was && was !== build) setTimeout(() => note(app, `${NAME[app]} updated`, news ? `V${build} · ${news}` : `Now V${build}`), 600);
  }

  // ---- updates, the same in every app ----
  // A new version's looked for as the app opens, every time you come back to it, and every five minutes while it's on
  // the screen (an app on a phone's Home Screen is brought back, not opened again, so looking only as it opened left it
  // days behind): at the app's own address (/version: functions/_version.js), against the version it's running. Once
  // there's one, it's put in at the first moment it's not in your way: straight away if you've only just opened the app
  // or come back to it and not touched it yet (before you'd notice); else once you've left it be for a minute, never
  // while you're typing, in a sheet or a menu, or the app says it's busy (sending, recording, uploading). One that must
  // go in (min: a fix that can't wait) goes in at the first moment you're not busy. Meanwhile the menu's foot has Update
  // instead of its green dot. The new version's files are fetched afresh first, past any copy the app or the browser
  // keeps, so it's never a mix of the old and the new (and if you start on something meanwhile, it waits again); then
  // where you are is kept (the app's save()) and it opens there again (here()); once for each new version, so a copy
  // that's still the old one mid-release isn't loaded over and over.
  // o: { app, build, url (default "version"), field (in its answer, default "build"), busy() → true while it's not to
  //      be interrupted, save() → where you are (to JSON), files: what to fetch afresh where there's no service worker }
  const U = { app: "", build: "", url: "version", field: "build", busy: null, save: null, files: null, ready: null, fresh: "", at: 0, back: Date.now(), touch: 0, going: false, told: "" };
  const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a.tagName === "INPUT" && !a.readOnly && !/^(button|checkbox|radio|range|submit|reset|file|color)$/.test(a.type))); };
  const busyNow = () => typing() || !!open || !!document.querySelector("dialog[open], .ifa-layer, [aria-busy='true']") || !!U.busy?.();
  // (a version's parts as numbers: 1.76 after 1.8, as 1.80 is written)
  const older = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
  function updates(o) {
    Object.assign(U, o);
    const touched = () => { U.touch = Date.now(); };
    for (const ev of ["pointerdown", "keydown", "wheel"]) addEventListener(ev, touched, { capture: true, passive: true });
    const back = () => { U.back = Date.now(); U.touch = 0; check(true); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") back(); });
    addEventListener("pageshow", (e) => { if (e.persisted) back(); });
    addEventListener("online", () => check(true));
    // (a service worker that's noticed the app's files change, as it opened: looked at now)
    navigator.serviceWorker?.addEventListener("message", (e) => { if (/:new$/.test(e.data?.type || "")) check(true); });
    setInterval(() => { if (document.visibilityState === "visible") check(); }, 5 * 60e3);
    setInterval(soon, 4000);
    setTimeout(() => check(true), 2000);     // (as it opens, a moment after: out of the way of its opening)
  }
  async function check(now) {
    const t = Date.now();
    if (!U.app || U.going || t - U.at < (now ? 3e3 : 4 * 60e3)) return;     // (now: back, online, a worker's word, as one)
    U.at = t;
    try {
      const r = await fetch(U.url, { cache: "no-store", credentials: "same-origin" });
      if (r.ok) { const j = await r.json(); offer(j[U.field], j.min); }
    } catch (_) {}
  }
  // the version deployed: from /version, or handed over by an app that asks its server anyway (Mail, as it syncs)
  function offer(build, min) {
    if (!build) return;
    build = String(build);
    if (build === U.build) { U.ready = null; return; }
    if (U.ready?.build !== build) U.ready = { build, at: Date.now(), must: !!min && older(U.build, min) };
    soon();
  }
  function soon() {
    const r = U.ready, t = Date.now();
    if (!r || U.going || document.visibilityState !== "visible") return;
    if (busyNow()) return tell();
    const fresh = t - U.back < 8e3 && !U.touch, still = t - (U.touch || U.back) > (window.__iflQuiet || 60e3);     // (__iflQuiet: tests' shorter minute)
    if (fresh || still || r.must) return apply();
    tell();
  }
  // (said once, if it's been waiting a while: it'll go in by itself, or now from the menu)
  function tell() {
    const r = U.ready;
    if (!r || U.told === r.build || Date.now() - r.at < 90e3) return;
    U.told = r.build;
    note(U.app, `A new ${NAME[U.app]} is ready`, r.must ? "It updates as soon as you’re done" : "It updates itself, or tap Update in the menu");
  }
  async function apply(asked) {
    const r = U.ready;
    if (!r || U.going) return;
    // (its files already fetched afresh, the last time it was about to go in: U.fresh, below)
    const key = `ifl-upd:${U.app}`, got = U.fresh === r.build;
    try {
      const k = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!asked && !got && k?.build === r.build && Date.now() - k.at < 10 * 60e3) return;
      sessionStorage.setItem(key, JSON.stringify({ build: r.build, at: Date.now() }));
    } catch (_) {}
    U.going = true;
    close(true);
    if (!got) {
      const t = U.touch;
      if (!(await afresh())) {
        // (a new version's worker that couldn't fetch all its files (Weather's are all or none), or hasn't yet: loaded
        // now, it'd be the old version again. Still offered, it's tried again once that worker's taken over, else in ten
        // minutes; tried afresh, not taken as fresh: a worker taking over has fetched its own files, not always the
        // app's (Mail's are fetched by the page, U.files))
        U.going = false;
        navigator.serviceWorker?.addEventListener("controllerchange", () => { if (U.ready?.build === r.build) try { sessionStorage.removeItem(key); } catch (_) {} }, { once: true });
        if (asked) note(U.app, `${NAME[U.app]} couldn’t update just now`, "It tries again by itself");
        return;
      }
      // (and if you've started on something meanwhile (typing, a sheet, a tap), it waits for the next moment you're not)
      if (!asked && (busyNow() || (!r.must && U.touch !== t))) { U.fresh = r.build; U.going = false; return; }
    }
    // (where you are kept as it goes, not before the wait: you may have scrolled meanwhile)
    try { const at = U.save?.(); if (at != null) sessionStorage.setItem(`ifl-here:${U.app}`, JSON.stringify({ at, t: Date.now() })); } catch (_) {}
    location.reload();
  }
  // the new version's files, fetched afresh before it loads: a service worker of the app's own for each version (as
  // Weather's) installed with all of them; one that keeps one version's files (Markets', Fitness') asked to fetch them
  // again; and without one, the page and its files asked of the network past the browser's own copy. → false if a new
  // worker was being installed and hasn't taken over (its files not all fetched, or not yet)
  async function afresh() {
    const sw = navigator.serviceWorker, wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    try {
      const reg = await sw?.getRegistration();
      if (reg) {
        const was = reg.active;
        await Promise.race([reg.update().catch(() => {}), wait(6000)]);
        if (reg.installing || reg.waiting) {
          await Promise.race([new Promise((ok) => sw.addEventListener("controllerchange", ok, { once: true })), wait(10000)]);
          if (reg.active === was) return false;
        }
        const c = sw.controller;
        if (c) await Promise.race([new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = ok; c.postMessage({ ifl: "renew" }, [ch.port2]); }), wait(8000)]);
      }
      if (U.files) await Promise.race([Promise.all(U.files.map((u) => fetch(u, { cache: "reload", credentials: "same-origin" }).catch(() => null))), wait(4000)]);
    } catch (_) {}
    return true;
  }
  // where you were as it updated (save()), as the new version opens: once, and only if moments ago; else null
  function here(app) {
    try {
      const k = JSON.parse(sessionStorage.getItem(`ifl-here:${app}`) || "null");
      sessionStorage.removeItem(`ifl-here:${app}`);
      return k && Date.now() - k.t < 2 * 60e3 ? k.at : null;
    } catch (_) { return null; }
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
    window.removeEventListener("resize", m.fit);
    window.visualViewport?.removeEventListener("resize", m.fit);
    window.visualViewport?.removeEventListener("scroll", m.fit);
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
          const b = el("button", "ifm-row go", ic, el("span", "ifm-l", r.label), el("span", "ifm-val" + (r.warn ? " ifm-warn" : ""), r.value || ""));
          b.insertAdjacentHTML("beforeend", svg("chev", "ifm-chev"));
          b.type = "button"; b.onclick = r.stay ? () => r.open?.(b) : act(r.open);
          if (r.key) b.dataset.k = r.key;
          rows.append(b);
        }
      }
      return groups.filter((g) => g.childNodes.length);
    };
    // (and last, in every app: Report a Problem, the bug window for anything that isn't right)
    const rowsBox = el("div", "ifm-rows", ...drawRows([...(o.rows || []), "-", { icon: "warn", color: "grey", label: "Report a Problem", key: "bug", open: () => BUG.report() }]));
    const mark = el("img", "ifm-foot-ic"); mark.src = iconUrl(o.app); mark.alt = "";
    // (its foot: the app and its version, quietly, a green dot while it's up to date; a new version waiting, an Update
    // button in the dot's place; and Sign Out, the one round button at the end, named for screen readers)
    const said = (t) => el("span", "ifm-sr", t);
    let status;
    const update = o.update || (U.ready ? () => apply(true) : null);
    if (update) { status = el("button", "ifm-upd"); status.innerHTML = svg("install"); status.append("Update"); status.type = "button"; status.onclick = act(update); }
    else { status = el("span", "ifm-dot", said(" · Up to date")); }
    const out = el("button", "ifm-out", said("Sign Out")); out.insertAdjacentHTML("afterbegin", svg("signout")); out.type = "button"; out.onclick = act(o.signOut);
    const foot = el("div", "ifm-foot", el("span", "ifm-ver", mark, `${NAME[o.app]} ${o.build}`, update ? null : status), update ? status : null, o.signOut ? out : null);
    const pop = el("div", `ifm-pop ifm-in-${o.app}`, card, rowsBox, foot);
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-label", "You and your apps");
    const layer = el("div", "ifm-layer", pop);
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) { e.preventDefault(); close(); } });
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus?.({ preventScroll: true }); }
      else if (e.key === "Tab") {
        const f = [...pop.querySelectorAll("button:not(:disabled), a[href]")];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    // (the page behind out of reach while it's open: a screen reader stays in the menu. Not the notes' place, so one
    // said meanwhile (a new version's ready) is still read out)
    const behind = [...document.body.children].filter((c) => !c.inert && c.tagName !== "SCRIPT" && c !== sayEl);
    behind.forEach((c) => { c.inert = true; });
    document.body.append(layer);
    // (under your photo, from where it grows; over it, if your photo's low on the screen. Under it, no taller than the
    // screen leaves it, so on a short one (a phone on its side) it scrolls, and its foot's never out of reach below;
    // fitted again as what's in sight changes while it's open: the keyboard going as the menu takes the focus from a
    // field, which left it short, or the phone turned)
    const fit = () => {
      const vv = window.visualViewport, y = vv?.offsetTop || 0, x = vv?.offsetLeft || 0;
      const H = Math.min(window.innerHeight, vv?.height || Infinity), W = Math.min(window.innerWidth, vv?.width || Infinity);
      const r = anchor.getBoundingClientRect();
      pop.style.maxHeight = `${Math.max(0, H - 24)}px`;
      const roomBelow = y + H - r.bottom - 22, roomAbove = r.top - y - 22;
      const below = pop.offsetHeight <= roomBelow || roomBelow >= roomAbove;
      pop.style.maxHeight = `${Math.max(0, Math.min(H - 24, below ? roomBelow : roomAbove))}px`;
      const left = Math.max(x + 12, Math.min(r.left - 2, x + W - pop.offsetWidth - 12));
      const top = Math.max(y + 12, Math.min(below ? r.bottom + 10 : r.top - 10 - pop.offsetHeight, y + H - pop.offsetHeight - 12));
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
      pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${below ? "-10px" : "calc(100% + 10px)"}`;
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    anchor.classList.add("ifm-lit");
    open = { anchor, layer, pop, key, fit, behind, onClose: o.onClose, redraw: (list) => {
      // (the focus kept on the row it was on, by its key)
      const k = document.activeElement?.dataset?.k;
      rowsBox.replaceChildren(...drawRows(list));
      fit();
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
  // (--p is 0 or 1, never a fraction tracking the finger: the header goes compact past 28px and back above 8px, and CSS
  // animates the change in one smooth movement (menu.css registers --p), instead of a resize on every scroll frame)
  // Keep selection behaviour local to the app; leave browser zoom gestures alone.
  if (!globalThis.__iflSelectionGuard && typeof document !== "undefined") {
    globalThis.__iflSelectionGuard = true;
    const typing = (t) => t && t.closest?.("input, textarea, select, [contenteditable]");
    document.addEventListener("copy", (e) => { if (!typing(e.target)) e.preventDefault(); });
    document.addEventListener("selectstart", (e) => { if (!typing(e.target)) e.preventDefault(); });
  }
  const upNow = new WeakMap();
  function settle(t = window) {
    const y = t === window ? scrollY : t.scrollTop, was = upNow.get(t) || false, up = was ? y > 8 : y > 28;
    upNow.set(t, up);
    for (const hd of (t === window ? document : t).querySelectorAll(".ifh")) { if (hd.style.getPropertyValue("--p") !== (up ? "1" : "0")) hd.style.setProperty("--p", up ? "1" : "0"); hd.classList.toggle("ifh-up", up); }
  }
  function watch(t = window) {
    if (!watched.has(t)) { watched.add(t); let q = 0; t.addEventListener("scroll", () => { if (!q) q = requestAnimationFrame(() => { q = 0; settle(t); }); }, { passive: true }); }
    settle(t);
  }
  const glyph = (name) => svg(name);

  // (the open menu's rows drawn again, as what they say changes: one that's come or gone)
  const redraw = (rows) => open?.redraw(rows);

  // ---- the hub: every app a page of inflite.ai, in one window ----
  // At inflite.ai, Today, Apps and You are one page (/, /#apps, /#you), and Chats, Weather, Fitness and Markets are pages
  // beside it (/chats/, /weather/, /fitness/, /markets/), each fetched from the app's own address by the site's Worker,
  // which marks each one it serves with a meta tag named ifl-hub, its content the app's path ("/weather/"; Today's own page has "/"). That
  // marker, and never the address, is what says an app is at the hub: at chat.inflite.ai, chat.localhost or a test's
  // address there's none, and every app is exactly what it was. (Mail stays at its own address, framed at /mail/.)
  //   on, base           the marker's there; what it says ("" where it isn't)
  //   go(url)            an app's own address as the hub's: https://chat.<site>/#x → /chats/#x, weather. → /weather/,
  //                      fitness. → /fitness/, finance. → /markets/, email. → /mail/, <site>/ → /; account., auth. and
  //                      any other site as they are (a test's site, ifl.test, the same way); off the hub, url as it is
  //   href(app, section) an app at a section: ("weather", "radar") → "/weather/#radar", ("markets", "s=TSCO") →
  //                      "/markets/#s=TSCO", ("chat", "open=<id>") → "/chats/#open=<id>"; off the hub, null (the hub's
  //                      paths aren't pages at an app's own address: the app links its own way, as it always has)
  //   tabs(el, current)  Today · Chats · Apps · You, the hub's tab bar, into el; current (its key: today, chats, apps or
  //                      you) marked; off the hub, el left as it is
  //   back()             back where you came from in the window (the breadcrumb, below), else to Apps; never history's
  //                      own back (Mail keeps history of its own, and an app opened from a notification has none). → true;
  //                      off the hub, nothing done: false
  //   chat()             Chat's engine: Chat's own page (/chats/?engine=1) in a frame over this one, unseen until it shows
  //                      its send sheet, which sends a card without leaving. A promise of it (its IFLChat, ready), or of
  //                      null: not ready (signed out of Chats, its key not here yet, locked), or no answer in 15 seconds.
  //                      Made on first use, kept while the page is open, dropped after 10 minutes out of sight
  //   send(words, packed, { to })   a card to a friend: the engine's sheet over this page, else Chats' own, which comes
  //                      back here after (#share=…&card=…&back=<this page>). → a promise of what the engine's sheet says,
  //                      or true once it's gone to Chats'; off the hub, of false, nothing done (the app sends its own
  //                      way, chat.<site>/#share=…, as it always has)
  //   sent(say), closed()           the engine's word that it's sent (the frame put away, and "Sent to Pat. You’re still
  //                      here" said) or that its sheet's shut (put away)
  //   signIn()           a signed-out app at the hub signs in by Today's own trip (never waiting on Chat's key, which
  //                      only Chats needs), and comes back here. → true; off the hub,
  //                      nothing done: false
  //   moved(app, { off })           an old Home Screen icon (off the hub, opened from the Home Screen, filling it: never
  //                      iOS's small browser, which a link from another Home Screen app opens): once, the card saying
  //                      InFlite is one app now, with How to Add and Turn Off Notifications Here (off). → true if shown
  //   degrade(links)     this page of the hub runs as the apps did before it (its Worker can't serve them yet: Today's
  //                      /api/hub says not ready): go, href and the tabs give the apps' own addresses (links: { chat,
  //                      weather, fitness, finance, email }, each an origin; else <app>.<site>), send goes to
  //                      chat.<site>/#share=…, and there's no engine. degraded: whether it does
  // The breadcrumb: where a page of the hub was left from, for its Back (Chat's pages send no Referer). Written, as the
  // page you're on (its path, ≤ 200 characters), by go and href to another page, the tabs and links to one, and a
  // notification opened on another page; read once as a page opens (what it was left from); taken as Back goes, so Back
  // never bounces between two pages.
  // A notification tapped while a page of the hub is open: the root worker (/sw.js) posts { ifl: "open", url } to the
  // window, and the page goes there (a path of this site's only), in the same window; within an app, its hashchange.
  // Sent from Chats' own sheet (send's way through Chats): sessionStorage["ifl-sent"], said once here as the page opens.
  const CRUMB = "ifl-crumb", SENT = "ifl-sent";
  const SUBS = { chat: "/chats/", weather: "/weather/", fitness: "/fitness/", finance: "/markets/", email: "/mail/" };
  const HUB_APPS = { today: "/", chat: "/chats/", chats: "/chats/", weather: "/weather/", fitness: "/fitness/", markets: "/markets/", mail: "/mail/" };
  // (each hub path's app, by its own address's first part: degraded, the way back to it)
  const OWN = { chats: "chat", weather: "weather", fitness: "fitness", markets: "finance", mail: "email" };
  // (keys, not words: no app's copy but Today's names Today as an app, iflmenu.test.mjs)
  const TABS = { today: ["Today", "/", "sun"], chats: ["Chats", "/chats/", "bubble"], apps: ["Apps", "/#apps", "grid"], you: ["You", "/#you", "person"] };
  const marker = typeof document !== "undefined" ? document.querySelector?.('meta[name="ifl-hub"]') : null;
  // (a path of this site's: starts /, not //, no \ and nothing unseen (a tab or a new line, which an address drops, so
  // "/\n/x" would be "//x"), no more than 200 characters)
  const ownPath = (p) => typeof p === "string" && p.length <= 200 && /^\/(?!\/)/.test(p) && !/[\\\u0000-\u001f\u007f]/.test(p);
  const pageOf = (p) => { try { return new URL(p, location.origin).pathname; } catch (_) { return null; } };
  const store = () => { try { return sessionStorage; } catch (_) { return null; } };
  const crumb = () => { const p = location.pathname + location.hash; try { if (ownPath(p)) store()?.setItem(CRUMB, p); } catch (_) {} };
  // (what this page was left from, read as it opens: its own later writes are for the page it goes to next)
  const cameFrom = (() => { try { const c = store()?.getItem(CRUMB); return ownPath(c) ? c : null; } catch (_) { return null; } })();
  const leaving = (p) => ownPath(p) && pageOf(p) !== location.pathname;
  const standalone = () => { try { return navigator.standalone === true || !!matchMedia?.("(display-mode: standalone)").matches; } catch (_) { return false; } };
  // (the app's own Home Screen icon, filling the screen: not iOS's small browser, which a link from another Home Screen
  // app opens it in, "standalone" too but under its own bars and short of the screen, where moved()'s card would cover
  // the page. On an iPhone or iPad (navigator.standalone): filling the screen from top to bottom (upright, its height; on
  // its side, its short side: the small browser's bars leave it short either way), or running up behind the status bar
  // (a top inset: every app's page is viewport-fit=cover); elsewhere, standalone is enough)
  const ownIcon = () => {
    if (navigator.standalone !== true) return true;
    try {
      const w = window.screen?.width || 0, h = window.screen?.height || 0;
      const tall = matchMedia("(orientation: portrait)").matches ? h : (w && h ? Math.min(w, h) : w || h);
      if (tall && innerHeight >= tall - 2) return true;
      const p = document.createElement("div");
      p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.append(p);
      const inset = p.offsetHeight;
      p.remove();
      return inset > 0;
    } catch (_) { return true; }
  };
  // The screen's foot, on an iPhone's or iPad's Home Screen: iOS can lay the page out shorter than the screen (by about
  // the status bar's height, after a while away, or from the start), and what's fixed to its foot (a background, the tab
  // bar, a sheet) then stops that much above the screen's bottom, with the page's own colour showing under it. The gap,
  // measured against the screen itself, is --fix-gap on html, for each app's styles to take back (markets/app.js did it
  // first). Only filling the screen, behind the status bar (not iOS's small browser, short of it by its own bars); never
  // the keyboard (that shortens the visual viewport, not innerHeight).
  const fitScreen = () => {
    if (navigator.standalone !== true || !window.screen?.width || !window.screen?.height) return;
    const doc = document.documentElement;
    const behind = () => {
      if (!matchMedia("(orientation: portrait)").matches) return true;
      const p = document.createElement("div");
      p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.append(p);
      const t = p.offsetHeight;
      p.remove();
      return t > 0;
    };
    const fit = () => {
      try {
        const portrait = matchMedia("(orientation: portrait)").matches, a = screen.width, b = screen.height;
        const w = portrait ? Math.min(a, b) : Math.max(a, b), h = portrait ? Math.max(a, b) : Math.min(a, b);
        const gap = Math.abs(innerWidth - w) < 2 && behind() ? Math.round(h - innerHeight) : 0;
        doc.style.setProperty("--fix-gap", `${gap > 0 && gap < 120 ? gap : 0}px`);
      } catch (_) {}
    };
    fit();
    for (const ev of ["resize", "pageshow", "focus"]) addEventListener(ev, fit);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && fit());
    addEventListener("orientationchange", () => setTimeout(fit, 300));
  };
  if (document.body) fitScreen(); else document.addEventListener("DOMContentLoaded", fitScreen, { once: true });
  // degraded: the apps' own addresses (degrade's links, else <app>.<site>), and a hub path back to its app's
  let links = {};
  const origin = (sub) => links[sub] || `${location.protocol}//${sub}.${location.host.replace(/^next\./, "")}`;
  const ownAt = (p) => { const m = /^\/(chats|weather|fitness|markets|mail)(?=$|[/?#])\/?([\s\S]*)$/.exec(p); return m ? `${origin(OWN[m[1]])}/${m[2]}` : null; };
  const stillHere = (say) => (/still here/i.test(say) ? say : `${say.replace(/[.\s]+$/, "")}. You’re still here`);
  const hub = {
    on: !!marker,
    base: marker ? marker.getAttribute("content") || "/" : "",
    degraded: false,
    go(url) {
      if (!hub.on) return url;
      let u;
      try { u = new URL(String(url), location.href); } catch (_) { return url; }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) return url;
      // (the site: this page's, the staging hub's next. taken off, so its links to the apps' own addresses come here too)
      const site = location.host.replace(/^next\./, ""), rest = u.pathname + u.search + u.hash, sub = /^([a-z]+)\.(.+)$/.exec(u.host);
      let p = null;
      if (u.host === location.host || u.host === site) p = rest;
      else if (sub && sub[2] === site && SUBS[sub[1]]) p = SUBS[sub[1]].slice(0, -1) + rest;
      if (p == null) return url;
      if (hub.degraded) return ownAt(p) || (ownPath(p) ? p : url);
      if (leaving(p)) crumb();
      return p;
    },
    href(app, section = "") {
      if (!hub.on) return null;
      const s = String(section || ""), p = (HUB_APPS[app] || "/") + (!s ? "" : /^[#?]/.test(s) ? s : "#" + s);
      if (hub.degraded) return ownAt(p) || p;
      if (leaving(p)) crumb();
      return p;
    },
    tabs(nav, current) {
      if (!nav || !hub.on) return nav;
      if (nav.tagName !== "NAV") nav.setAttribute("role", "navigation");
      nav.setAttribute("aria-label", "InFlite");
      nav.classList.add("ifl-tabs");
      nav.replaceChildren(...Object.entries(TABS).map(([k, [label, to, icon]]) => {
        const a = document.createElement("a"), href = hub.degraded ? ownAt(to) || to : to;
        a.className = "ifl-tab"; a.href = href; a.dataset.tab = k;
        a.insertAdjacentHTML("afterbegin", svg(icon, "ifl-tab-ic"));
        a.append(el("span", "ifl-tab-l", label));
        if (k === current) a.setAttribute("aria-current", "page");
        a.addEventListener("click", () => { if (!hub.degraded && leaving(to)) crumb(); });
        return a;
      }));
      return nav;
    },
    back() {
      if (!hub.on) return false;
      const to = cameFrom && pageOf(cameFrom) !== location.pathname ? cameFrom : "/#apps";
      try { store()?.removeItem(CRUMB); } catch (_) {}
      location.assign(to);
      return true;
    },
    chat,
    send(words, packed, { to } = {}) {
      if (!hub.on) return Promise.resolve(false);
      const card = typeof packed === "string" && /^[A-Za-z0-9_-]+$/.test(packed) ? "&card=" + packed : "";
      if (hub.degraded) {
        location.assign(`${origin("chat")}/#share=${encodeURIComponent(String(words ?? ""))}${card}`);
        return Promise.resolve(true);
      }
      return hub.chat().then((c) => {
        if (c && c.state === "ready") return c.share(words, packed, { to });
        location.assign("/chats/#share=" + encodeURIComponent(String(words ?? "")) + card + "&back=" + encodeURIComponent(location.pathname + location.hash));
        return true;
      });
    },
    sent(say) { hide(); if (say) toast(stillHere(String(say).slice(0, 200))); },
    closed() { hide(); },
    signIn() {
      if (!hub.on || hub.degraded) return false;
      // (Today's own trip, on every device, and back here: no app but Chats needs Chat's key, and Chats asks to unlock
      // itself the first time it's opened)
      location.assign("/#signin-today&then=" + encodeURIComponent(location.pathname + location.hash));
      return true;
    },
    moved(app, { off } = {}) {
      if (hub.on || !standalone() || !document.body || !NAME[app] || !ownIcon()) return false;
      const k = `ifl-moved:${app}`;
      try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, String(Date.now())); } catch (_) { return false; }
      movedCard(app, typeof off === "function" ? off : null);
      return true;
    },
    degrade(own = {}) {
      if (!hub.on) return false;
      links = {};
      for (const k of Object.values(OWN)) if (typeof own?.[k] === "string" && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(own[k])) links[k] = own[k];
      hub.degraded = true;
      dropEngine();
      return true;
    },
  };

  // Chat's engine: /chats/?engine=1 in a frame over the page, its IFLChat once it says it's ready (ifl-chat-ready, on
  // this window), and the frame seen only while it shows its sheet (put away by sent or closed, or when its answer says
  // no sheet is showing). The frame is in a dialog of its own: shown, the dialog's modal, so it's in the top layer, over
  // every sheet of the page's own (a modal one too, which would otherwise make it inert) and the only thing a tap
  // reaches; put away, the dialog's shut but still laid out (unseen, never in the way of a tap: menu.css), so the engine
  // runs on and its sheet opens at once. The frame is never moved (that would load it again)
  const ENGINE_WAIT = 15e3, ENGINE_DROP = 10 * 60e3;
  let engine = null, resting = false;
  function dropEngine() { engine?.box.remove(); engine = null; }
  function hide() {
    const b = engine?.box;
    if (!b) return;
    b.classList.remove("on");
    try { if (b.open) b.close(); } catch (_) {}
  }
  function show() {
    const b = engine?.box;
    if (!b) return;
    b.classList.add("on");
    try { if (!b.open) b.showModal(); } catch (_) {}
  }
  // (the engine as the page uses it: its own calls, the frame shown for its sheet, and put away where nothing's showing:
  // a card refused (false, { ok: false }, { why }); sendTo's one tap sent ({ ok: true, say }: said here too). A sheet
  // that's shown is put away by its own word, sent or closed)
  const none = (r) => r === false || (!!r && typeof r === "object" && (r.ok === false || !!r.why));
  const wrap = (c) => ({
    get state() { return c.state; },
    share(...a) { show(); return Promise.resolve().then(() => c.share(...a)).then((r) => { if (none(r)) hide(); return r; }, (e) => { hide(); throw e; }); },
    sendTo(...a) {
      show();
      return Promise.resolve().then(() => c.sendTo(...a)).then((r) => { if (r?.ok === true) hub.sent(r.say || "Sent"); else if (none(r)) hide(); return r; }, (e) => { hide(); throw e; });
    },
    waiting: (...a) => c.waiting(...a),
    since: (...a) => c.since(...a),
    refresh: (...a) => c.refresh(...a),
    signOut: (...a) => c.signOut(...a),
  });
  const ready = () => { const c = engine?.api; return c && c.state === "ready" ? wrap(c) : null; };
  function chat() {
    if (!hub.on || hub.degraded || resting || !document.body) return Promise.resolve(null);
    if (engine) return engine.api ? Promise.resolve(ready()) : engine.wait;
    const box = document.createElement("dialog"), f = document.createElement("iframe");
    box.className = "ifl-engine-box";
    box.setAttribute("aria-label", "Chats");
    // (shut some other way (Escape, while the page has the focus): put away, as closed() would. Not when it's been shown
    // again since: this word comes a moment after it's shut)
    box.addEventListener("close", () => { if (!box.open) box.classList.remove("on"); });
    f.name = "ifl-chat"; f.className = "ifl-engine"; f.src = "/chats/?engine=1";
    f.setAttribute("title", "Chats");
    box.append(f);
    const e = engine = { box, frame: f, api: null, wait: null };
    e.wait = new Promise((ok) => {
      let t = 0;
      const done = () => {
        clearTimeout(t);
        removeEventListener("ifl-chat-ready", done);
        if (engine !== e) return ok(null);
        let c = null;
        try { c = f.contentWindow?.IFLChat || null; } catch (_) {}
        // (no engine in time: the frame dropped, and for two minutes none asked for again (a Send goes through Chats'
        // own sheet at once meanwhile); after that, the next use asks again)
        if (!c) { dropEngine(); resting = true; setTimeout(() => { resting = false; }, 2 * 60e3); return ok(null); }
        e.api = c;
        ok(ready());
      };
      addEventListener("ifl-chat-ready", done);
      t = setTimeout(done, ENGINE_WAIT);
    });
    document.body.append(box);
    return e.wait;
  }
  // (out of sight for ten minutes, the engine's let go: made again when it's next wanted)
  let hiddenAt = 0, dropT = 0;
  if (hub.on) document.addEventListener("visibilitychange", () => {
    clearTimeout(dropT);
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); dropT = setTimeout(() => { if (document.visibilityState === "hidden") dropEngine(); }, ENGINE_DROP); return; }
    if (hiddenAt && Date.now() - hiddenAt >= ENGINE_DROP) dropEngine();
    hiddenAt = 0;
  });

  // (a link to another of the hub's pages, followed: the breadcrumb, as the page is left, with where it was scrolled to)
  if (hub.on) document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[href]");
    if (hub.degraded || !a || a.target === "_blank" || a.hasAttribute("download")) return;
    let u;
    try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin === location.origin && leaving(u.pathname + u.hash)) crumb();
  }, true);
  // (a notification tapped while this page is open: the root worker's word, to a path of this site's only. Heard, it's
  // said so on the port the worker gave, else the worker opens it some other way: a page that has no ear for it)
  if (hub.on) navigator.serviceWorker?.addEventListener?.("message", (e) => {
    const d = e.data;
    if (!d || d.ifl !== "open" || !ownPath(d.url)) return;
    try { e.ports?.[0]?.postMessage({ ifl: "opened" }); } catch (_) {}
    if (hub.degraded) return location.assign(hub.go(d.url));
    if (leaving(d.url)) crumb();
    location.assign(d.url);
  });
  // (the hub's look: html.ifl-hub, and pages that cross-fade into each other, the tab bar staying put. menu.css asks for
  // it of every page (@view-transition, which can't be kept to html.ifl-hub there, and must be in a stylesheet to be
  // there as the next page's first shown): off the hub, every page lets it go as it's left, so nothing changes there; at
  // the hub, one that can't be done is let go quietly, before it can fail out loud: below)
  if (hub.on) document.documentElement?.classList.add("ifl-hub");
  // (the Home Screen icon's badge, as many notifications as are still showing: counted again by the root worker as a
  // page of the hub opens and each time it's back in sight, so those tapped or cleared meanwhile are gone from it)
  const recount = () => { try { navigator.serviceWorker?.getRegistration?.("/")?.then?.((r) => r?.active?.postMessage({ ifl: "badge" }), () => {}); } catch (_) {} };
  if (hub.on) {
    recount();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recount(); });
  }
  // A cross-fade that ends on a page that doesn't ask for it (one of this site's that isn't the hub's: an /api/ answer,
  // a 404) is called off in that page, which then says so as an error no script of its own can catch ("Transition was
  // aborted because of invalid state. ViewTransition opt-in disabled"). So a page of the hub lets go of one that's
  // bound anywhere but the hub's own pages (Today, Chats, the apps and Mail's, whose stylesheets all ask for it), as
  // it's left. And the one this page opened with is caught as it starts (document.activeViewTransition): called off
  // before it's shown, it would say so out loud too. This runs from the page's module, which a slow load can bring in
  // after that's happened: Today's page catches it first, as its head is read (the inflite repo's today/public/fade.js),
  // and any page of the hub that loads that script before its module does the same.
  const FADES = /^\/(?:index\.html)?$|^\/(?:chats|weather|fitness|markets|mail)\/(?:index\.html)?$/;
  const fades = (to) => { try { const u = new URL(to, location.href); return u.origin === location.origin && FADES.test(u.pathname); } catch (_) { return false; } };
  const hush = (t) => { if (t) for (const k of ["ready", "finished", "updateCallbackDone"]) t[k]?.catch?.(() => {}); return t; };
  const vt = (e) => {
    const t = hush(e.viewTransition), to = e.type === "pageswap" ? e.activation?.entry?.url : null;
    if (t && (!hub.on || (to && !fades(to)))) t.skipTransition?.();
  };
  try { hush(document.activeViewTransition); } catch (_) {}
  addEventListener("pageswap", vt);
  addEventListener("pagereveal", vt);

  // the card for an old Home Screen icon: InFlite is one app now (as allow's sheet looks)
  function movedCard(app, off) {
    const img = el("img", "ifa-ic"); img.src = iconUrl(app); img.alt = "";
    const how = el("button", "ifa-go", "How to Add"), stop = off ? el("button", "ifa-later ifa-off", "Turn Off Notifications Here") : null, later = el("button", "ifa-later", "Not Now");
    for (const b of [how, stop, later]) if (b) b.type = "button";
    const steps = el("p", "ifa-p ifa-steps", "In Safari, open inflite.ai, tap Share, then Add to Home Screen. Sign in there once, and every app is in it.");
    steps.hidden = true;
    const sheet = el("div", "ifa-sheet", img, el("h2", "ifa-t", "InFlite is one app now"), el("p", "ifa-p", "Today, Chats and every app in one place. Add inflite.ai to your Home Screen."), steps, how, stop, later);
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "InFlite is one app now");
    const layer = el("div", "ifa-layer ifl-moved", sheet), was = document.activeElement;
    const shut = () => { document.removeEventListener("keydown", key, true); layer.classList.remove("on"); setTimeout(() => layer.remove(), 320); was?.focus?.({ preventScroll: true }); };
    // (Escape shuts it; Tab and Shift-Tab go round its buttons, never behind it)
    const key = (e) => {
      if (e.key === "Escape") return shut();
      if (e.key !== "Tab") return;
      const f = [how, stop, later].filter((b) => b && !b.hidden && !b.disabled);
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(document.activeElement);
      f[i < 0 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus({ preventScroll: true });
    };
    how.onclick = () => { steps.hidden = false; how.hidden = true; later.textContent = "Done"; later.focus({ preventScroll: true }); };
    if (stop) stop.onclick = async () => {
      stop.disabled = true; stop.textContent = "Turning Off…";
      const done = await Promise.resolve().then(off).then(() => true, () => false);
      if (done) { shut(); note(app, "Notifications off here", "They come to InFlite instead, once it’s on your Home Screen"); }
      else { stop.disabled = false; stop.textContent = "Turn Off Notifications Here"; }
    };
    later.onclick = shut;
    layer.addEventListener("pointerdown", (e) => { if (e.target === layer) shut(); });
    document.addEventListener("keydown", key, true);
    document.body.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("on")));
    how.focus?.({ preventScroll: true });
  }
  // a plain toast: the words alone, said out, gone in a few seconds
  let toastEl = null, toastT = 0;
  function toast(text) {
    toastEl?.remove();
    clearTimeout(toastT);
    const t = toastEl = el("div", "ifm-note ifl-toast", el("span", "ifm-note-tx", el("b", "", text)));
    document.body.append(t);
    if (!sayEl.isConnected) document.body.append(sayEl);
    sayEl.textContent = "";
    requestAnimationFrame(() => requestAnimationFrame(() => { if (toastEl !== t) return; t.classList.add("on"); sayEl.textContent = text; }));
    toastT = setTimeout(() => { t.classList.remove("on"); sayEl.textContent = ""; setTimeout(() => t.remove(), 400); }, 3600);
  }
  // (sent from Chats' own sheet, and back: said once, here)
  if (hub.on) {
    let said = null;
    try { said = store()?.getItem(SENT); store()?.removeItem(SENT); } catch (_) {}
    if (said) toast(stillHere(String(said).slice(0, 200)));
  }

  // ---- Something went wrong: the window every app shows when it breaks, each issue its own code ----
  // What broke in this app's own code (an error nothing caught, a promise that failed with a real bug in it), or an API of
  // the site's that failed and said under what code (the site files those itself: functions/_bugs.js), shown once a page
  // in a window that can be screenshotted as it is: the code (IF-, the app's letter, five more: the same for the same bug
  // every time, as functions/_bugs.js works it out), what happened in a line, the app and its version, the page, when,
  // the device, and Send to InFlite, which files it (POST /api/bugs) for a GitHub Action to make an issue of, where it's
  // fixed. Report a Problem (the menu's last row) opens it for anything else. Never anything of what's on the screen or
  // anyone's words: the page's path alone, an error's words with addresses, numbers and anything like a key taken out.
  //   bug({ words, where, kind }) → the window for one an app caught itself; bug.report() → Report a Problem
  const BUG = (() => {
    const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const LETTER = { chat: "C", chats: "C", weather: "W", fitness: "F", markets: "M", finance: "M", account: "A", auth: "A", hub: "T", mail: "E", email: "E", home: "H", fitting: "P" };
    const HOSTS = { chat: "chat", weather: "weather", fitness: "fitness", finance: "markets", account: "account", auth: "auth", email: "mail", fitting: "fitting" };
    const HUB = { chats: "chats", weather: "weather", fitness: "fitness", markets: "markets", mail: "mail" };
    const NAMES = { chats: "Chats", auth: "Sign in", home: "georgefarrowgreen.com", fitting: "Fit Studio", hub: "InFlite" };
    const same = (s) => String(s || "").toLowerCase().replace(/https?:\/\/\S+/g, "<url>").replace(/[0-9a-f]{8,}/g, "#").replace(/\d+/g, "#")
      .replace(/(["'`]).*?\1/g, "''").replace(/\s+/g, " ").trim().slice(0, 200);
    const fnv = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
    const codeOf = (app, kind, words, where = "") => {
      let h = fnv(`${kind}|${same(words)}|${String(where).replace(/:\d+(:\d+)?$/, "")}`), out = "";
      for (let i = 0; i < 5; i++) { out += ALPHA[h % 32]; h = Math.floor(h / 32); }
      return `IF-${letterOf(app)}-${out}`;
    };
    const scrub = (s, n = 400) => String(s ?? "").replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "<email>")
      .replace(/[A-Za-z0-9_\-+/=]{32,}/g, "<long>").replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1").slice(0, n);
    // (the app it's in: at the hub, the section's (its own page's own app aside); else the app's address, or what it said)
    const appNow = () => {
      const host = HOSTS[location.hostname.split(".")[0]], seg = HUB[location.pathname.split("/")[1]];
      if (seg && !host) return seg;
      return U.app || host || (/georgefarrowgreen|gfg/.test(location.hostname) ? "home" : "hub");
    };
    const letterOf = (a) => LETTER[a] || String(a || "X")[0].toUpperCase();
    const nameOf = (a) => NAMES[a] || NAME[a] || a;
    const device = () => {
      const ua = navigator.userAgent || "";
      const kind = /iPhone/.test(ua) ? "iPhone" : /iPad|Macintosh.*Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer";
      const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${RegExp.$1}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}` : /CriOS\/(\d+)|Chrome\/(\d+)/.exec(ua) ? `Chrome ${RegExp.$1 || RegExp.$2}` : /Version\/(\d+)[^ ]* .*Safari/.exec(ua) ? `Safari ${RegExp.$1}` : "a browser";
      const home = navigator.standalone === true || (() => { try { return matchMedia("(display-mode: standalone)").matches; } catch (_) { return false; } })();
      return `${kind} · ${b}${home ? " · Home Screen" : ""}`;
    };
    // (where in this site's own code: the file and line, from an error's stack, its other frames for the report)
    const FRAME = /(?:https?:\/\/[^/\s]+)?(\/[^\s():]*\.m?js)(?:\?[^\s():]*)?:(\d+)(?::\d+)?/;
    const frames = (stack) => String(stack || "").split("\n").map((l) => FRAME.exec(l)).filter(Boolean).map((m) => `${m[1]}:${m[2]}`);
    const ours = (stack) => String(stack || "").includes(location.origin);
    const shownNow = new Set();
    let showing = null, count = 0;
    const when = () => { try { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); } catch (_) { return new Date().toISOString(); } };
    const reportId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHA[b % 32]).join("").replace(/^(.{4})/, "$1-");

    function show(r) {
      if (showing || !document.body) return;
      if (r.kind !== "manual" && (shownNow.has(r.code) || ++count > 3)) return;
      shownNow.add(r.code);
      const manual = r.kind === "manual", app = r.app, ver = r.version;
      const facts = [["App", `${nameOf(app)}${ver ? " " + ver : ""}`], ["Page", r.path || "/"], ["When", r.when], ["Device", r.device]];
      if (!manual && r.words) facts.push(["What", r.words + (r.where ? `\n${r.where}` : "")]);
      facts.push(["Report", r.id]);
      const dl = el("dl", "ifb-facts", ...facts.flatMap(([k, v]) => [el("dt", "", k), el("dd", k === "What" ? "ifb-tech" : "", v)]));
      const head = el("div", "ifb-head"); head.innerHTML = svg("warn", "ifb-ic");
      const title = el("b", "", manual ? "Report a Problem" : "Something went wrong"); title.id = "ifb-t"; head.append(title);
      const note = el("textarea", "ifb-note"); note.rows = 2; note.maxLength = 1000;
      note.placeholder = manual ? "What’s wrong? What were you doing?" : "What were you doing? (if you like)"; note.setAttribute("aria-label", note.placeholder);
      const send = el("button", "ifb-btn ifb-go", "Send to InFlite"), copy = el("button", "ifb-btn", "Copy"), shut = el("button", "ifb-btn", "Close");
      for (const b of [send, copy, shut]) b.type = "button";
      const said = el("p", "ifb-said"); said.setAttribute("role", "status");
      const box = el("div", "ifb",
        head, el("p", "ifb-code", r.code),
        el("p", "ifb-say", manual ? "Say what’s wrong, and send it with this code. A screenshot of the screen it’s on helps too."
          : "InFlite hit a problem it didn’t expect. Send it on and it’ll be looked into: the code says which."),
        dl, note, el("p", "ifb-who", "What you write here is read by InFlite’s owner alone."), el("div", "ifb-acts", send, copy, shut), said);
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "ifb-t");
      const was = document.activeElement, layer = el("dialog", "ifb-layer", box);
      layer.setAttribute("aria-labelledby", "ifb-t");
      const text = () => [`${manual ? "Problem report" : "Bug report"} ${r.code}`, ...facts.map(([k, v]) => `${k}: ${String(v).replace(/\n/g, " · ")}`), note.value.trim() ? `Note: ${note.value.trim()}` : ""].filter(Boolean).join("\n");
      const done = () => { layer.close?.(); layer.remove(); document.removeEventListener("keydown", key, true); showing = null; if (was?.isConnected) was.focus?.({ preventScroll: true }); };
      const key = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); }
        else if (e.key === "Tab") {
          const f = [...layer.querySelectorAll("textarea, button:not([disabled]), a[href]")].filter((n) => n.getClientRects().length);
          if (f.length && (!layer.contains(document.activeElement) || (e.shiftKey && document.activeElement === f[0]) || (!e.shiftKey && document.activeElement === f.at(-1)))) {
            e.preventDefault(); (e.shiftKey ? f.at(-1) : f[0]).focus();
          }
        }
      };
      shut.onclick = done;
      layer.addEventListener("pointerdown", (e) => { if (e.target === layer) done(); });
      copy.onclick = async () => { try { await navigator.clipboard.writeText(text()); said.textContent = "Copied."; } catch (_) { said.textContent = "Couldn’t copy: a screenshot works as well."; } };
      send.onclick = async () => {
        if (manual && !note.value.trim()) { said.textContent = "Say what’s wrong first."; note.focus(); return; }
        send.disabled = true; said.textContent = "Sending…";
        try {
          const res = await (fetch.__iflReal || fetch)("/api/bugs", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ code: r.code, app, kind: r.kind, version: ver, words: r.words, where: r.where, stack: r.stack, path: r.path, device: r.device, note: note.value.trim() }) });
          if (!res.ok) throw new Error(String(res.status));
          send.textContent = "Sent"; said.textContent = "Sent. Thank you: it’ll be looked into. ";
          // (where it stands, on the status page: the link the server gave, its own address only)
          const j = await res.json().catch(() => null);
          if (typeof j?.status === "string" && /^https:\/\/status\.[^/]+\/#IF-[A-Z]-[0-9A-Z]{4,6}$/.test(j.status)) {
            const a = el("a", "ifb-link", "See where this stands"); a.href = j.status; a.target = "_blank"; a.rel = "noopener"; said.append(a);
          }
        } catch (_) { send.disabled = false; said.textContent = "That didn’t send. Try again, or screenshot this and send it on."; }
      };
      document.body.append(layer);
      layer.showModal?.();
      document.addEventListener("keydown", key, true);
      showing = layer;
      (manual ? note : shut).focus({ preventScroll: true });
    }
    // one this app caught, or found: { words, where, stack, kind, code }
    function bug(o = {}) {
      try {
        const app = appNow(), kind = o.kind || "crash", words = scrub(o.words, 300), where = scrub(o.where, 160);
        show({ code: o.code || codeOf(app, kind, words, where), app, kind, version: U.build || "", words, where, stack: scrub(o.stack, 1500),
          path: location.pathname, when: when(), device: device(), id: reportId() });
      } catch (_) {}
    }
    bug.report = () => { try { const app = appNow(); show({ code: `IF-${letterOf(app)}-R${reportId().replace("-", "").slice(0, 4)}`, app, kind: "manual", version: U.build || "", path: location.pathname, when: when(), device: device(), id: reportId() }); } catch (_) {} };
    bug.code = codeOf;
    // (once a page, whichever copy of the menu runs first)
    if (typeof window !== "undefined" && typeof addEventListener === "function" && !window.__iflBugs) {
      window.__iflBugs = true;
      addEventListener("error", (e) => {
        if (!(e instanceof ErrorEvent) || !e.filename || !e.filename.startsWith(location.origin)) return;
        const m = String(e.message || "");
        if (/^(Uncaught )?Script error\.?$/i.test(m) || /ResizeObserver loop/i.test(m)) return;
        const st = e.error?.stack || "", where = frames(st)[0] || `${new URL(e.filename).pathname}:${e.lineno || 0}`;
        bug({ words: e.error ? `${e.error.name || "Error"}: ${e.error.message || m}` : m, where, stack: frames(st).slice(0, 8).join("\n") });
      });
      addEventListener("unhandledrejection", (e) => {
        const r = e.reason;
        // (a real bug only: a mistake in the code, never a request that failed, was called off or met no signal)
        if (!(r instanceof Error) || !/^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(r.name) || !navigator.onLine) return;
        if (/fetch|load failed|network|abort/i.test(r.message) || !ours(r.stack)) return;
        bug({ words: `${r.name}: ${r.message}`, where: frames(r.stack)[0] || "", stack: frames(r.stack).slice(0, 8).join("\n") });
      });
      // (an API of the site's that failed, and said under what code it's filed: its window, for the person to send theirs)
      const real = window.fetch;
      if (typeof real === "function" && !real.__iflReal) {
        const watched = function (input) {
          const p = real.apply(globalThis, arguments);
          p.then((res) => {
            try {
              if (res.status < 500) return;
              const u = new URL(res.url || input?.url || String(input), location.href);
              if (u.origin !== location.origin || !u.pathname.startsWith("/api/") || u.pathname === "/api/bugs") return;
              res.clone().json().then((j) => { if (typeof j?.code === "string" && /^IF-S-[0-9A-Z]{5}$/.test(j.code)) bug({ kind: "server", code: j.code, words: j.error || `The server said ${res.status}`, where: u.pathname }); }).catch(() => {});
            } catch (_) {}
          }, () => {});
          return p;
        };
        watched.__iflReal = real;
        window.fetch = watched;
      }
    }
    bug.app = appNow;
    return bug;
  })();

  // ---- Something's wrong with this app: a slim banner under its header while status.inflite.ai has an incident going on
  // that touches it, or maintenance (the site's functions/_status.js bannerFor, asked at this app's own address, as
  // /api/status-banner), linking there. Asked a moment after the page opens and every five minutes it's on screen; one
  // closed stays closed for the visit; gone by itself when the incident is ----
  const BANNER = (() => {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof addEventListener !== "function" || typeof fetch !== "function") return null;
    let now = null, el = null, off = false, gone = new Set();
    try { gone = new Set(JSON.parse(sessionStorage.getItem("ifl-sb") || "[]")); } catch (_) {}
    const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const place = () => {
      if (!now || gone.has(now.id)) { el?.remove(); return; }
      const hd = [...document.querySelectorAll(".ifh")].find((x) => x.offsetParent !== null || x.getClientRects().length);
      if (!el) {
        el = document.createElement("div"); el.className = "ifl-sb"; el.setAttribute("role", "status");
        el.addEventListener("click", (e) => {
          if (e.target.closest(".ifl-sb-x")) { gone.add(now.id); try { sessionStorage.setItem("ifl-sb", JSON.stringify([...gone])); } catch (_) {} el.remove(); return; }
          if (now?.url) window.open(now.url, "_blank", "noopener");
        });
      }
      const maint = now.kind === "maint";
      el.dataset.k = now.kind;
      el.innerHTML = `<span class="ifl-sb-dot" aria-hidden="true"></span><span class="ifl-sb-t"><b>${esc(maint ? `Maintenance: ${now.title}` : now.title)}</b><small>${esc(maint ? `Until ${hhmm(now.until)}${now.text ? ` · ${now.text}` : ""}` : now.text || "Being looked into.")}</small></span>`
        + `<span class="ifl-sb-go">Status${svg("chev")}</span><button type="button" class="ifl-sb-x" aria-label="Hide this">${svg("x")}</button>`;
      if (hd) { if (el.previousElementSibling !== hd) hd.after(el); el.classList.remove("float"); }
      else { if (el.parentNode !== document.body) document.body.prepend(el); el.classList.add("float"); }
    };
    const ask = async () => {
      if (off || document.visibilityState === "hidden") return;
      try {
        const r = await (fetch.__iflReal || fetch)(`/api/status-banner?app=${encodeURIComponent(BUG.app ? BUG.app() : "hub")}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
        if (r.status === 404) { off = true; return; }
        if (!r.ok) return;
        now = (await r.json())?.banner || null;
        place();
      } catch (_) {}
    };
    // (timers that never keep anything running that would otherwise end: a test's stand-in window, under Node)
    const loose = (t) => (t && typeof t.unref === "function" ? t.unref() : t);
    loose(setTimeout(ask, 2500));
    loose(setInterval(ask, 5 * 60e3));
    // (an app that draws its header anew: put back under it)
    loose(setInterval(() => { if (now) place(); }, 3000));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ask(); });
    return { ask, place };
  })();

  // ---- Sign in, warmed: the connection to the sign-in page (auth.<site>) opened while Sign in's on the screen ----
  // An app calls warm() as it draws its Sign in (and any Sign in, .ifl-go, touched or pointed at does it too), so the tap
  // doesn't wait on finding the address and making a secure connection: the browser has one ready (a preconnect, and a
  // DNS look-up for one that hasn't). Once a page; never on the sign-in page itself, nor where there's no site (localhost).
  const WARM = (() => {
    let done = false;
    const origin = () => {
      if (typeof location === "undefined") return null;
      const { protocol, hostname, port } = location;
      if (!hostname.includes(".") || /(^|\.)localhost$/.test(hostname)) return null;
      const site = hostname.replace(/^(chat|weather|fitness|finance|email|account|auth|next|www)\./, "");
      return `${protocol}//auth.${site}${port ? ":" + port : ""}`;
    };
    function warm() {
      const o = origin();
      if (done || !o || o === location.origin || typeof document === "undefined" || !document.head) return;
      done = true;
      for (const rel of ["preconnect", "dns-prefetch"]) { const l = document.createElement("link"); l.rel = rel; l.href = o; document.head.append(l); }
    }
    if (typeof document !== "undefined" && document.addEventListener)
      for (const ev of ["pointerover", "pointerdown", "focusin"]) document.addEventListener(ev, (e) => { if (!done && e.target?.closest?.(".ifl-go")) warm(); }, { capture: true, passive: true });
    return warm;
  })();

  // ---- How fast this page was, on this device: numbers only, sent once as it's left (POST /api/vitals, functions/_vitals.js)
  // The time to its first answer (ttfb), to anything on the screen (fcp), to its largest part drawn (lcp: not Safari's
  // to give, before 26), its slowest tap's answer (inp: the longest event that tap ran, from the press to the next frame)
  // and how much it jumped about (cls: the worst burst of shifts no tap caused). With the app (at the hub, the part of it
  // that's open) and whether it's a phone or tablet (a finger's the pointer) or a computer, nothing else: no account, page,
  // address or time of day. Never from a frame (the page around it counts), nor a page first opened out of sight (its
  // drawing waited on nothing of its own). VITALS.sent() → what went, for a test; VITALS.now() → what's been seen so far.
  const VITALS = (() => {
    const out = {};
    let sent = null, shown = true;
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined" || typeof performance === "undefined") return { now: () => out, sent: () => sent };
    try { if (window.top !== window) return { now: () => out, sent: () => sent }; } catch (_) { return { now: () => out, sent: () => sent }; }
    shown = document.visibilityState !== "hidden";
    const watch = (type, fn, more = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...more }); } catch (_) {} };
    watch("paint", (e) => { if (e.name === "first-contentful-paint" && shown) out.fcp = Math.round(e.startTime); });
    let tapped = false;
    watch("largest-contentful-paint", (e) => { if (shown && !tapped) out.lcp = Math.round(e.startTime); });
    for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => { tapped = true; }, { capture: true, once: true, passive: true });
    watch("event", (e) => { if (e.interactionId) out.inp = Math.max(out.inp || 0, Math.round(e.duration)); }, { durationThreshold: 40 });
    let burst = 0, first = 0, last = 0;
    watch("layout-shift", (e) => {
      if (e.hadRecentInput) return;
      if (burst && e.startTime - last < 1000 && e.startTime - first < 5000) burst += e.value;
      else { burst = e.value; first = e.startTime; }
      last = e.startTime;
      out.cls = Math.max(out.cls || 0, Math.round(burst * 1000) / 1000);
    });
    addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(); }, { capture: true });
    addEventListener("pagehide", () => send(), { capture: true });
    function send() {
      try { const n = performance.getEntriesByType("navigation")[0]; if (n && n.responseStart > 0) out.ttfb = Math.round(n.responseStart); } catch (_) {}
      if (sent || !Object.keys(out).length || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
      const coarse = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch (_) { return false; } })();
      sent = { app: BUG.app(), dev: coarse ? "phone" : "computer", m: { ...out } };
      try { navigator.sendBeacon("/api/vitals", new Blob([JSON.stringify(sent)], { type: "text/plain" })); } catch (_) {}
    }
    return { now: () => out, sent: () => sent };
  })();

  const api = { bug: BUG, banner: BANNER, header, headerHtml, watch, settle, glyph, APPS, NAME, menu, close, redraw, isOpen: () => !!open, built, note, iconUrl, allow, wantsAllow,
    updates, offer, here, update: () => apply(true), updateReady: () => !!U.ready, hub, warm: WARM, vitals: VITALS };
  // (at the hub, the page's IFL on its window too: so Chat's engine, a frame of this page's, can say it's sent or shut its
  // sheet (parent.IFL.hub.sent(say), parent.IFL.hub.closed(), §8.2), and Today's day and cards find the page's own hub.
  // A const at the top of a module or a script is never the window's own. It can be taken back (configurable), so a
  // page's own global IFL never clashes with it, and one put there first (a test's stand-in) is left as it is)
  if (hub.on && typeof window !== "undefined") try { Object.defineProperty(window, "IFL", { value: api, configurable: true, writable: true }); } catch (_) {}
  return api;
})();
// ==== end of InFlite's menu ====
/* ---------- InFlite's hub: Chat as a page of inflite.ai (/chats/), and as the engine in a frame of another ----------
   At the hub (IFL.hub.on: the marker the hub's Worker puts on the page, never the address) Chat draws the hub's tab bar
   for its own, leaves notifications to the hub's own worker (You), signs in for the whole of InFlite and goes back to
   where it was asked from (then), and back to the page a card came from once it's sent (back). As /chats/?engine=1 in a
   frame of another page of the hub (ENGINE), it draws nothing of its own but its send sheet, and gives that page
   window.IFLChat: Today's words for who's waiting (read in memory, never kept), and any card sent without leaving.
   Off the hub, none of this: Chat is as it always was. */
// ==== the hub's rules (engine.test.mjs runs this block on its own: it reads nothing of the page) ====
// a path of this site's, for then= and back=: starts with /, not //, no : or \ (nor anything unseen), ≤ 200 characters
const hubPath = (p) => typeof p === "string" && p.length > 0 && p.length <= 200 && p[0] === "/" && p[1] !== "/" && !/[:\\\u0000-\u001f\u007f]/.test(p);
// (a hash's then= or back=, only ever as such a path)
const hashPath = (hash, key) => { try { const v = new URLSearchParams(String(hash || "").replace(/^#/, "")).get(key); return hubPath(v) ? v : null; } catch (_) { return null; } };
// The engine: at the hub, asked for (?engine=1), in a frame, of a page of this same site; never at the top, never
// across sites, never off the hub
function engineRule(on, search, win, par) {
  if (!on || !win || !par || par === win) return false;
  try { if (!new URLSearchParams(search || "").has("engine")) return false; } catch (_) { return false; }
  try { return par.location.origin === win.location.origin; } catch (_) { return false; }
}
// (the engine's sync, and Chats' at the top: the engine never says you've been seen just now, as Today being open isn't
// you in Chats; delivered ticks still happen)
const syncPath = (engine) => (engine ? "sync?quiet=1" : "sync");
// The page's tap (its user activation), read through this document's own getters (getUA: Navigator's userActivation,
// getActive: UserActivation's isActive), so nothing a script on the page sets on its navigator, or on its own copies of
// them, counts. (A script of the page's own could still do more than this: only the site's own scripts run on it, and
// that's the boundary; this only raises the bar.)
function tappedOn(nav, getUA, getActive) {
  try { const ua = typeof getUA === "function" ? getUA.call(nav) : null; return !!(ua && typeof getActive === "function" && getActive.call(ua) === true); } catch (_) { return false; }
}
// IFLChat, as the page the engine's in has it: these keys only. A card sent in one tap (sendTo) only from a tap on that
// page (its user activation, as the page's own Send button gives it); anything else is refused, and says why
function makeIFLChat(d) {
  return Object.freeze({
    get state() { return d.state(); },
    share(words, packed, { to } = {}) { return d.share(words, packed, { to }); },
    sendTo(id, words, packed) { return d.tapped() ? d.sendOne(id, words, packed) : Promise.resolve({ ok: false, why: "tap" }); },
    waiting({ ids, stocks } = {}) { return d.waiting({ ids, stocks }); },
    since(id, t) { return d.since(id, t); },
    // (a reply from Today's card: only where the engine can send one, from a real tap; else Today opens the chat)
    reply(id, text) { return !d.reply ? Promise.resolve({ ok: false, why: "engine" }) : d.tapped() ? d.reply(id, text) : Promise.resolve({ ok: false, why: "tap" }); },
    refresh() { return d.refresh(); },
    signOut() { return d.signOut(); },
  });
}
// ==== end of the hub's rules ====
const HUB = !!IFL.hub?.on;
const ENGINE = engineRule(HUB, location.search, window, window.parent);
// Chat's own page at InFlite's /chats/in/ (One roof stage 3, S3-D8: signing in, unlocking and keys, while Chats is a
// module of InFlite's page at /chats/): no worker of its own registered there; signed in with nowhere asked to go back
// to, back to /chats/; and found signed in with no sign-in under way, on to /chats/ with its link (never all of Chat in
// that page). Written as /pigeon/in/ so each address says it as its own (functions/_app.js atRoot); nowhere else.
const IN_PAGE = ["/pigeon/in/", "/pigeon/in/index.html"].includes(location.pathname), IN_AT = IN_PAGE ? location.hash : "";
if (ENGINE) document.documentElement.classList.add("engine");
// the site, as the hub's own address has it (its staging copy's next. taken off): for the account's page beside it
const hubSite = () => location.host.replace(/^next\./, "");
// (opened from the account's Notifications page to turn them on here: #notify, asked as soon as Chat's ready; never at
// the hub, where notifications are You's)
const ASK_NOTIFY = IFL.wantsAllow() && !HUB;

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SPEED_KMH = 80, SWIFT_MAX = 9, TURBO_MAX = 3, ROCKET_MAX = 1;
// Pigeon kinds: [id, name, speed, loft size]. Standard is free on your turn;
// swift, turbo and rocket fly any time and come from lofts that refill through the day.
const APP_VERSION = "1.99";            // shown in InFlite's menu
const APP_NEWS = "Smoother springs, transitions and interrupted motion across InFlite";       // (said once it's in)
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
const mySpeed = (kind) => KIND[kind].speed * (S.me?.risky ? RISKY_SPEED : 1);
const dumbText = () => DUMB.test($ta.value) ? $ta.value.replace(DUMB, "") : null;
const kindOf = (m) => (m && Object.hasOwn(KIND, m.pigeon) ? m.pigeon : m?.swift ? "swift" : "standard");
/* ---------- pigeons: a switch on each account ----------
   Off, Chat is a quick messenger: messages arrive as soon as they're sent, with no birds, maps or landing times. On,
   any one message can go by pigeon (the Now button in the message box), or a whole chat (its way, from its name).
   A copy of you from before the switch (no pigeons at all) counts as on. */
const pigeonsOn = () => S.me?.pigeons !== false;
const chatOf = (key) => friend(key) || group(key);
// a chat's usual way for what you send (a copy from before ways, with none: by pigeon, so nothing goes instant by mistake)
const wayOf = (c) => (c?.way ?? S.me?.newChats ?? "pigeon") === "instant" ? "instant" : "pigeon";
// how a chat's next message goes when nothing's been chosen for it with the button: its usual way (pigeons off: now)
const defaultNext = (c) => (pigeonsOn() && wayOf(c) === "pigeon" ? "pigeon" : "now");
// how this chat's next message goes: a choice made with the message box's button (S.next), else its usual way
const nextOf = (key) => (!pigeonsOn() ? "now" : S.next.get(key) ?? defaultNext(chatOf(key)));
// a time as "1h 05m" (or "45m", "1d 3h"), for how long a letter takes
const durPad = (ms) => { const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.round((ms % HOUR) / MIN); return d ? `${d}d ${h}h` : h ? `${h}h ${pad2(m)}m` : `${Math.max(1, m)}m`; };
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
  chatRaw: new Map(), outbox: [], viewedOnce: new Set(), pctx: new Map(), pendingAdd: null, offline: false, seenLanded: new Set(), fresh: new Map(), rise: new Map(), nav: null,
  avatars: new Map(), q: "", fq: "", addMsg: null,
  reacts: new Map(), fly: new Map(), wxPlan: new Map(), gevents: new Map(), drafts: new Map(), replyTo: null,
  birds: [], hall: [], birdPick: null,       // your named pigeons, your Hall of Fame, and the one picked to carry the next message ("none": unnamed)
  cardNow: new Map(), cardWait: null, laterOpen: null,   // cards' live "Now" (memory only), a card waiting above a chat's message box, an invite's other times shown
  next: new Map(), lines: new Map(),          // a chat's next message, as chosen with the message box's button ("now" | "pigeon"); a chat's way changes, as lines
  // the pulse (section "the pulse"): what's changed, typing, and when to ask next
  live: { since: Date.now(), seen: new Map(), typingIn: new Map(), typingOut: null, typingOk: true, quietSince: Date.now(), timer: 0, fails: 0, off: false,
    lastSync: 0, lastGroupLoad: new Map(), busy: false, again: false, lastAt: 0, next: 3000, okAt: 0, keyAt: 0, after: new Map(), fullAt: new Map(), tsig: "" },
};
const now = () => Date.now() + S.skew;
const $ = (sel, root = document) => root.querySelector(sel);
// passkeys belong to georgefarrowgreen.com, which lets Chat's address on inflite.ai use them (as the server has it: rpIdFor)
const RP_ID = /(^|\.)(georgefarrowgreen\.com|inflite\.ai)$/.test(location.hostname) ? "georgefarrowgreen.com" : location.hostname;
// (and from now on, a passkey made at Chat's address on inflite.ai is inflite.ai's own, needing nothing of the home site,
// with or without a signal: each saved passkey says whose it is (rp). The one this phone made or used last is noted, so
// its lock and "it's you" ask that site's, and name only that site's passkeys: a browser asks one site at a time)
const RP_NOTE = "inflight-rp";
function chatRp() {
  try { const r = localStorage.getItem(RP_NOTE); if (r) return r; } catch (_) {}
  const rps = new Set((S.passkeys || []).map((p) => p.rp || RP_ID));
  return rps.size === 1 ? [...rps][0] : RP_ID;
}
const noteRp = (rp) => { try { if (rp) localStorage.setItem(RP_NOTE, rp); } catch (_) {} };
const ofRp = (rp) => (S.passkeys || []).filter((p) => (p.rp || RP_ID) === rp).map((p) => ({ type: "public-key", id: fromB64url(p.id) }));
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
// What's written, as it's shown: its lines kept, and its web addresses links that open outside Chat, in the browser
// (pigeon/links.js: only ever a web page)
const linked = (t) => linkParts(t).map((x) => (x.href ? `<a class="lnk" href="${esc(x.href)}" target="_blank" rel="noopener noreferrer" data-act="link">${esc(x.text)}</a>` : esc(x.text))).join("").replace(/\n/g, "<br>");

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
// A change to your settings sent (and when it's answered): a sync already on its way says what they were before it, so
// it's no reason to change them back (sync)
let meTurn = 0, meOut = 0;
async function api(path, { method = "GET", body, form, raw, blob, size, onProgress } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (blob) { headers["Content-Type"] = blob.type; payload = blob; }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  // nothing waits forever on a weak signal: a reply that hasn't come in 25 s (a minute for anything carrying a file) is treated as no signal
  // (a photo, GIF or voice pigeon fetched, raw, two minutes: the time covers reading it too, and a big GIF on a weak signal takes a while)
  const quit = !onProgress && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(payload instanceof Blob || payload instanceof FormData ? 90000 : raw ? 120000 : 25000) : undefined;
  const mine = path === "me" && method === "PATCH";
  if (mine) { meTurn++; meOut++; }
  try { r = onProgress ? await xhrFetch("/api/pigeon/" + path, { method, headers, body: payload, size, onProgress }) : await fetch("/api/pigeon/" + path, { method, headers, body: payload, signal: quit }); }
  catch (_) { S.offline = true; renderOffline(); throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); }
  finally { if (mine) { meTurn++; meOut--; } }
  if (S.offline) { S.offline = false; renderOffline(); }
  if (raw && r.ok) return r;
  // a page that isn't ours (a café's sign-in screen, a proxy) answering in our place isn't success
  if (r.ok && !/json/.test(r.headers.get("Content-Type") || "")) { S.offline = true; renderOffline(); throw Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true }); }
  let data = {};
  try { data = await r.json(); } catch (_) {}
  // only a sign-in that has ended signs you out (not a wrong password on a "confirm it's you")
  if (r.status === 401 && S.token && data.field === "session") { await forget(true); go("welcome"); announce("You’ve been signed out, as this sign-in was ended on another device or by a new password."); }
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
// The wind a pigeon had at take-off: what blew its way (km/h; negative is a headwind).
const windWord = (w) => (w == null ? "" : Math.abs(w) < 3 ? "calm" : w > 0 ? "tailwind" : "headwind");
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
  tick1: ico(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  bolt: ico(`<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>`),
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
// (the full-size picture, 48 MB or so for a 12 MP photo, and the canvas let go of as soon as they're done with, not
// whenever they're collected: a few photos in a row mustn't have iOS close the app for its memory)
async function prepImage(blob) {
  const bmp = await loadBitmap(blob), c = document.createElement("canvas");
  try {
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!out) throw new Error("That photo couldn’t be prepared.");
    return { bytes: new Uint8Array(await out.arrayBuffer()), w: c.width, h: c.height, preview: URL.createObjectURL(out) };
  } finally { bmp.close?.(); c.width = c.height = 0; }
}
const cssVar = (el, n) => getComputedStyle(el).getPropertyValue(n).trim();
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
// "France", "the North Atlantic": the nearest country's middle (bigger countries reach further), or the sea it's in
// The country or sea at a point, by the borders: the same grid the server names
// places from (pigeon/placegrid.js), so the card and a push about it agree
function overWhere(lon, lat) {
  return placeAt(lat, ((lon + 540) % 360) - 180);
}
const STILL = matchMedia("(prefers-reduced-motion: reduce)");

/* ============================================================
   Keys and accounts
   ============================================================ */
// This phone's own public key comes from its private key, never from the
// server: safety numbers and "Your Encryption Key" are built from it, so a
// server that showed friends a different key for you couldn't hide it.
async function useKeys(token, me, privJwk) {
  S.token = token; S.me = me; S.ended = null;
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
// (ended: the server ended this sign-in, from another phone or with a new password, rather than you signing out here.
// Pigeons still waiting for signal, and what you'd started writing, stay on this phone, sealed as they are, for when
// you're back in as you (afterSignIn), and the welcome says why you're there)
async function forget(ended) {
  if (ended && S.me) S.ended ||= { waiting: S.outbox.filter((o) => !o.err).length };
  S.photos.forEach((u) => URL.revokeObjectURL(u));
  S.avatars?.forEach((u) => { if (u) URL.revokeObjectURL(u); });
  clearTimeout(cacheTimer); clearTimeout(draftsTimer);
  // nothing of this account carries on into the next one: sound, the mic, location, drafts, searches, news
  try { S.player?.pause(); } catch (_) {}
  if (rec) recStop(false);
  stopLocWatch(); airEl = null;
  try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem("inflight-badges"); localStorage.removeItem("inflight-pushsub"); localStorage.removeItem(OPENED_KEY); } catch (_) {}
  openedFor = null;
  if (S.me?.id) { await idb.del("cache:" + S.me.id).catch(() => {});
    if (!ended) { await idb.del("outbox:" + S.me.id).catch(() => {}); await idb.del("drafts:" + S.me.id).catch(() => {}); themeDone(); }
    if (await idb.get("pinsup:" + S.me.id).catch(() => null)) { await idb.del("pins:" + S.me.id).catch(() => {}); await idb.del("pinsup:" + S.me.id).catch(() => {}); } }
  S.outbox = [];
  S.raw = null; S.chatRaw = new Map(); S.skies = null; S.skiesAt = 0; S.fromCache = false; S.started = false; S.synced = false; S.locked = false;
  Object.assign(S, { token: null, me: null, priv: null, secretJwk: null, myPub: null, keyWarned: false, keyBad: false, fp: "", sessN: null, friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [],
    msgs: new Map(), plain: new Map(), notes: new Map(), photos: new Map(), photoGone: new Set(), pairs: new Map(), chat: null, sheet: null, drafts: new Map(), gevents: new Map(),
    avatars: new Map(), viewedOnce: new Set(), q: "", fq: "", news: null, newsAt: 0, replyTo: null, sched: null, via: null, pick: null, birdPick: null, player: null,
    syncSig: "", chatSigs: new Map(), syncFails: 0, birds: [], hall: [], feathers: 0, resumable: null, pinsWait: null });
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
const newHere = () => `<p class="wnew ifl-new"><a href="${esc(toAuth("#join"))}" data-act="acctjoin">Create an account</a></p>`;
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
  IFL.warm();                    // (Sign in's connection to the sign-in page made ahead, while it's on the screen)
  const r = S.resumable;
  if (S.signingIn) return `<div class="wcta ifl-cta">${brandLine}<button class="btn wide wglow ifl-go" disabled>Signing in…</button></div>`;
  // (at the hub, the key couldn't be unlocked here just now: Not Now, back where it was asked from, signed in to the rest)
  const later = S.notNow ? `<button class="btn wide plain ifl-notnow" data-act="signinnotnow">Not Now</button><p class="wnew">Today, Apps and You are signed in. Chats needs your key here: sign in again when you’re ready.</p>` : "";
  if (r) return `<div class="wcta ifl-cta">${brandLine}<button class="btn wide wglow ifl-go" data-act="acctsignin">Continue as ${esc(first(r.name))}</button>${later}</div>`;
  return `<div class="wcta ifl-cta">${brandLine}<button class="btn wide wglow ifl-go" data-act="acctsignin">Sign in</button>${later || newHere()}</div>`;
}
// Signing in is on the account's own page (account.<site>), where every app on the site signs in: there with a word for
// the sign-in, and a key pair for what unlocks the key here (pigeon/crypto.js handbackPair: kept on this phone, with the
// link you came in on, for half an hour or until it's used; on the phone, not just the tab, as a Home Screen app can
// open the account's page in a view of its own), and back with a code for it (signInBack).
const SIGNIN_KEY = "inflight-signin";
// (one started and never finished, its word and key not kept past a couple of hours)
try { const k = JSON.parse(localStorage.getItem(SIGNIN_KEY) || "null"); if (k && !(Math.abs(Date.now() - k.at) < 2 * 3600e3)) localStorage.removeItem(SIGNIN_KEY); } catch (_) {}
// (then: at the hub, the page of it this sign-in was asked from, gone back to once it's done: a path of this site's only)
// (one trip at a time: a second tap while one is getting ready would write a new word over the first's, and whichever
// went would come back to the wrong one; free again if it doesn't go, or the browser brings this page back)
let signInGoing = false;
const freeSignIn = () => { signInGoing = false; if (S.signingIn && !S.me) { S.signingIn = false; if (S.view === "welcome") render(); } };
addEventListener("pageshow", (e) => { if (e.persisted) freeSignIn(); });
async function toAccountSignIn(e, mode, { then = null } = {}) {
  e?.preventDefault?.();
  if (signInGoing) return;
  signInGoing = true;
  const covered = handOff();      // (the page's sky comes in while the trip's got ready)
  try {
    const t = await E2E.handbackPair();
    localStorage.setItem(SIGNIN_KEY, JSON.stringify({ word: t.word, pub: t.pub, priv: t.priv, at: now(), link: S.pendingLink || null, ...(HUB && hubPath(then) ? { then } : {}) }));
    const back = location.origin + (location.pathname.startsWith("/pigeon/") ? "/pigeon/" : "/");
    await covered;
    const q = new URLSearchParams({ [mode]: "inflight", ask: t.ask, seal: t.pub, back });
    location.assign(toAuth(`#${q}`));
    // (and if the page never goes, as a page sometimes doesn't: free to try again, as the sky goes)
    setTimeout(() => { if (document.visibilityState === "visible") freeSignIn(); }, 15000);
  } catch (_) { handBack(); freeSignIn(); toast("This browser can’t sign in to Chat. Try Safari or Chrome."); }
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
    } catch (_) { throw Object.assign(new Error("Signed in, but your key couldn’t be unlocked here. Sign in again."), { key: true }); }
    await useKeys(r.token, r.me, ecdh);
    if (k.link && !S.pendingLink) S.pendingLink = k.link;
    S.signingIn = false;
    // (asked from another page of the hub: back there, signed in for the whole of InFlite)
    const then = HUB && hubPath(k.then) ? k.then : null;
    if (then && then !== location.pathname) { location.replace(then); return; }
    if (!then && IN_PAGE) { location.replace("/pigeon/"); return; }
    await afterSignIn();
    arrival?.in();                         // (in: the sky clears to Chat, signed in)
  } catch (err) {
    // (at the hub, signed in but the key not unlocked here: Not Now goes back to where it was asked from, signed in to
    // the rest of InFlite by the site's own sign-in, and Chats asks for the key another time)
    S.notNow = err?.key && HUB && hubPath(k.then) ? k.then : null;
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
  noteRp(o.rpId);
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
  // (Today First's: whether your notifications are held now (a ride, quiet hours), your calls and rides agreed with a
  // friend, for the held row at the hub and the send sheet's reasons)
  S.hold = d.hold && typeof d.hold === "object" ? d.hold : null; S.times = Array.isArray(d.times) ? d.times : []; S.rides = Array.isArray(d.rides) ? d.rides : [];
  syncTheme();
  for (const f of S.friends) {
    checkPin(f);
    if (f.last) await decrypt(f.id, f.last);
    // a notice for pigeons that land while the app is open (not for ones already waiting at launch)
    if (f.last && !f.last.flying && !f.last.lost && !f.last.waiting && !S.seenLanded.has(f.last.id)) {
      S.seenLanded.add(f.last.id);                 // (one landing in front of you comes down on screen: playKeyed)
      const nm = esc(first(f.name));
      // a message: said in another chat (on the list, the row says so; in its own chat, it's there); a letter: as it lands
      if (S.started && f.last.from === f.id && !f.last.readAt && !(S.view === "chat" && S.chat === f.id)) {
        if (!f.last.instant) toast(pigeonsOn() ? `<b>${nm}</b><br>A pigeon just landed.` : `A letter from <b>${nm}</b> arrived.`, "Read", () => go("chat", f.id));
        else if (S.view === "chat") toast(`New message from <b>${nm}</b>`, "Open", () => go("chat", f.id));
      }
      else if (S.started && f.last.from === f.id && !f.last.readAt) announce(f.last.instant ? msgSay(first(f.name), f.last.id) : landedSay(first(f.name), f.last.id));     // (in it: comes down on screen, and said)
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
      const who = esc(first(member(g, l.from)?.name || "someone"));
      if (S.started && !l.readAt && !(S.view === "chat" && S.chat === g.id)) {
        if (!l.instant) toast(`<b>${esc(g.name)}</b><br>${pigeonsOn() ? `A pigeon from ${who} just landed.` : `A letter from ${who} arrived.`}`, "Read", () => go("chat", g.id));
        else if (S.view === "chat") toast(`<b>${esc(g.name)}</b><br>New message from ${who}`, "Open", () => go("chat", g.id));
      }
      else if (S.started && !l.readAt) announce(l.instant ? msgSay(first(member(g, l.from)?.name || "someone"), l.id) : landedSay(first(member(g, l.from)?.name || "someone"), l.id));
    }
  }
}
// (what's said of one landing in the chat you're in: who from, and its words, as they're on screen)
const msgSay = (who, id) => { const t = (S.plain.get(id)?.t || "").trim(); return `Message from ${who}${t ? `: ${t.length > 280 ? t.slice(0, 280) + "…" : t}` : "."}`; };
const landedSay = (who, id) => { const t = (S.plain.get(id)?.t || "").trim(); return `A pigeon from ${who} just landed${t ? `: ${t.length > 280 ? t.slice(0, 280) + "…" : t}` : "."}`; };
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
      if (S.pinsWait) { await S.pinsWait; if (!S.token) return; }      // (the keys trusted before, still being fetched at the start: first)
      const tok = S.token, turn = meTurn, d = await api(syncPath(ENGINE));
      if (S.token !== tok) return;                // signed out (or in as someone else) meanwhile: not theirs to show
      if (!Number.isFinite(d.now) || !d.me || !Array.isArray(d.friends)) throw new Error("A sync came back incomplete.");
      // (a setting changed here while it was asked, or still being saved: what it says of you is from before, and this
      // phone's are newer, Appearance, Pigeon Death and the rest; the next sync has them as saved)
      if (S.me && (turn !== meTurn || meOut) && d.me.id === S.me.id) d.me = { ...d.me, ...S.me };
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
      // (an Appearance this phone couldn't save to your account yet goes again with any sync, not only one bringing news: syncTheme)
      if (same && themeWaits() && !themeSaving) saveTheme(theme());
      S.started = true;
      if (S.view === "chat" && S.chat && !S.locked && chatDue(S.chat)) await loadChat(S.chat).catch((e) => console.warn("chat", e.message));     // (locked: nothing is opened, or marked read; a slow chat doesn't hold up the rest)
      S.live.forceChat = false;
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
// The server should show everyone the key this phone holds. If it ever says otherwise, say so: on Messages and in every
// chat for as long as it does (myKeyWarn), and once as it's found (if it can be: nothing shows over the lock)
function checkMyKey(me) {
  S.keyBad = !!(S.myPub && me?.pub && keyId(me.pub) !== keyId(S.myPub));
  if (!S.keyBad || S.keyWarned || S.locked) return;
  S.keyWarned = true;
  toast("<b>Your security key doesn’t match</b><br>The server is showing a different key for you than the one on this phone. Don’t send anything private, and sign out and back in.");
}
const myKeyWarn = () => (S.keyBad ? `<div class="warn strong" data-key="warn:me"><span><b>Your security key doesn’t match.</b> The server is showing a different key for you than the one on this phone. Don’t send anything private, and sign out and back in.</span><button class="btn small" data-act="signout">Sign Out</button></div>` : "");
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
const isVerified = (p) => !!p?.pub && !p.keyChanged && S.pins["v:" + p.id] === keyId(p.pub);
const wasVerified = (p) => !!p?.keyChanged && !!S.pins["v:" + p.id];         // verified, and their key has changed since
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
async function loadChat(fid, pre) {
  const g = group(fid), tok = S.token, tags = (S.chatTags ||= new Map());
  // (a chat that's here already says which copy it has: unchanged, the server just says so, rather than send it all again)
  const tag = S.msgs.has(fid) && tags.get(fid);
  const d = pre || await api((g ? "group-messages?id=" : "messages?with=") + encodeURIComponent(fid) + (tag ? "&tag=" + encodeURIComponent(tag) : ""));
  if (S.token !== tok) return;                     // signed out meanwhile
  S.skew = d.now - Date.now();
  // (what the next ask of only what's changed starts from, and when this chat was last fetched whole: the pulse)
  if (!g && Number.isFinite(d.now)) { S.live.after.set(fid, d.now); S.live.fullAt.set(fid, Date.now()); }
  if (d.same) { if (S.msgs.has(fid) && tags.get(fid) === d.tag) return fetchMedia(fid); tags.delete(fid); return loadChat(fid); }
  if (d.tag) tags.set(fid, d.tag); else tags.delete(fid);
  // the same as last time: nothing to open, draw or save again
  const sig = JSON.stringify({ ...d, now: 0 }), sigs = (S.chatSigs ||= new Map());
  if (sigs.get(fid) === sig && S.msgs.has(fid)) return fetchMedia(fid);
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
const KEEP_MS = 30 * DAY, keepSay = () => (pigeonsOn() ? "Messages are kept for 30 days after they land, then deleted for everyone. Your Flight Log, passport and badges keep every flight." : "Messages are kept for 30 days after they arrive, then deleted for everyone.");
// (what disappearing messages wait for, besides being read)
const orLand = () => (pigeonsOn() ? "(or land, if read receipts are off)" : "(or arrive, if read receipts are off)");
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
  // (a group's fresh copy: a member whose new message is in it, their dots go at once)
  if (g && live && S.msgs.has(fid) && S.live.typingIn.has(fid)) {
    const L = S.live, tin = L.typingIn.get(fid), had = new Set(S.msgs.get(fid).map((m) => m.id));
    const by = new Set(d.messages.filter((m) => !had.has(m.id) && !m.flying).map((m) => m.from)), ids = tin.ids.filter((x) => !by.has(x));
    if (ids.length !== tin.ids.length) { if (ids.length) L.typingIn.set(fid, { ...tin, ids }); else L.typingIn.delete(fid); L.tsig = typingSig(); }
  }
  S.msgs.set(fid, d.messages); S.turns.set(fid, d.turn && { ...d.turn, at: d.now || 0 }); S.reacts.set(fid, d.reacts || []); if (!g) S.fly.set(fid, d.fly || []);
  if (!g) { S.lines.set(fid, Array.isArray(d.lines) ? d.lines.filter((x) => x && typeof x.by === "string" && Number.isFinite(x.at)) : []); const f = friend(fid); if (f && (d.way === "instant" || d.way === "pigeon")) f.way = d.way; if (f && (d.theirWay === "instant" || d.theirWay === "pigeon")) f.theirWay = d.theirWay; }
  if (g) { S.gevents.set(fid, d.events || []); if (live) (S.geventsLive ||= new Set()).add(fid); }
  for (const m of d.messages) if (m.photo === 2 && S.photos.has(m.id)) { URL.revokeObjectURL(S.photos.get(m.id)); S.photos.delete(m.id); }
  if (!live) return;
  fetchMedia(fid);
  const unread = (m) => (g ? m.from !== S.me.id : m.from === fid && !m.stopover) && !m.flying && !m.lost && !m.readAt;
  if (!S.locked && S.view === "chat" && S.chat === fid && document.visibilityState === "visible" && d.messages.some(unread)) {     // (only a chat you're looking at is read)
    api(g ? "group-read" : "read", { method: "POST", body: g ? { id: fid } : { with: fid } }).catch(() => {});
    for (const m of d.messages) if ((g ? m.from !== S.me.id : m.from === fid) && !m.flying && !m.lost) m.readAt = m.readAt || now();
    const x = g || friend(fid); if (x) x.unread = 0;
  }
}

/* ---------- the pulse: what's changed, typing, delivered and read, while Chat is open ----------
   A small ask every few seconds (the server says how often: next) while a chat or Messages is on screen. It says which
   chat is open (so a notification for it isn't sent), whether you're typing (only when the next message goes now), and
   marks what's reached this phone as delivered. Its answer: which chats changed (the open one fetches only what changed),
   unread counts for the list, and who's typing. No pulse while hidden, locked, offline, or on Friends or Account. */
const pulseOpen = () => (S.view === "chat" && S.chat ? S.chat : "");
function pulseWanted() {
  const L = S.live;
  if (ENGINE || L.off || !S.token || !S.me || !S.priv || S.locked || AUTH_VIEWS.has(S.view) || document.visibilityState !== "visible" || navigator.onLine === false) return false;
  return (S.view === "chat" && !!S.chat) || (S.view === "messages" && !S.sheet);
}
// what this pulse says of typing: "typing" (the box has words, the next message goes now, a key since: every 3 s at most),
// "stop" (it was, and isn't now, or it's another chat), or nothing
function typingSay(open) {
  const L = S.live, out = L.typingOut;
  const can = !!open && S.view === "chat" && L.typingOk && S.me?.showTyping !== false && document.visibilityState === "visible" && !S.locked && nextOf(open) === "now" && !!$ta?.value.trim();
  if (can && L.keyAt > (out?.at || 0) && (!out || out.chat !== open || Date.now() - out.at >= 3000)) return "typing";
  if (out && (!can || out.chat !== open)) return "stop";
  return null;
}
// a pulse as soon as it may go (never within a second of the last one)
function pulseNow() {
  const L = S.live;
  if (L.busy) { L.again = true; return; }
  clearTimeout(L.timer);
  L.timer = setTimeout(pulse, Math.max(0, 1050 - (Date.now() - L.lastAt)));
}
async function pulse() {
  const L = S.live;
  clearTimeout(L.timer); L.timer = 0;
  if (L.busy || L.off || (!pulseWanted() && !(L.force && S.token && document.visibilityState === "visible"))) return;
  const forced = L.force; L.force = false;
  const open = pulseOpen(), body = { since: L.since, open }, ty = typingSay(open);
  // (a chat just opened, or back to the list, or back after being away: quiet from now, not from before)
  if (open !== L.quietFor) { L.quietFor = open; L.quietSince = Date.now(); }
  if (ty === "typing") { body.typing = open; L.typingOut = { chat: open, at: Date.now() }; L.quietSince = Date.now(); }
  else if (ty === "stop") { body.stop = L.typingOut.chat; L.typingOut = null; }
  L.busy = true; L.lastAt = Date.now();
  const tok = S.token;
  let wait = L.next || 3000;
  try {
    const r = await fetch("/api/pigeon/pulse", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15000) : undefined });
    if (S.token !== tok) return;
    if (r.status === 404) { L.off = true; return; }                                   // (no pulse on this server: the 15 s sync, as before)
    if (r.status === 429) {                                                           // (too soon: not a failure; a told-at-once one, or a stop, goes again)
      const d = await r.json().catch(() => ({})); wait = Math.max(250, Number(d.retry) || 1000);
      if (body.stop && !L.typingOut) L.typingOut = { chat: body.stop, at: 0 };
      if (forced) L.force = true;
      return;
    }
    if (!r.ok || !/json/.test(r.headers.get("Content-Type") || "")) throw new Error(`pulse ${r.status}`);
    const d = await r.json();
    L.fails = 0; L.okAt = Date.now();
    if (Number.isFinite(d.now)) L.since = d.now;
    if (Number.isFinite(d.next) && d.next >= 1000) L.next = d.next;
    wait = L.next;
    await pulseApply(d, open);
  } catch (_) {
    L.fails++;
    wait = Math.min(30000, (L.next || 3000) * 2 ** L.fails);
  } finally {
    L.busy = false;
    // (nothing either way for two minutes: every 10 s at most, until something changes or you type)
    if (Date.now() - L.quietSince > 120e3) wait = Math.max(wait, 10000);
    if (L.again) { L.again = false; wait = Math.min(wait, Math.max(0, 1050 - (Date.now() - L.lastAt))); }
    clearTimeout(L.timer); L.timer = 0;
    if (!L.off && S.token === tok && (pulseWanted() || (L.force && document.visibilityState === "visible"))) L.timer = setTimeout(pulse, wait);
  }
}
const typingSig = () => [...S.live.typingIn].map(([k, v]) => `${k}:${v.ids.join(",")}`).sort().join("|");
async function pulseApply(d, open) {
  const L = S.live;
  if (d.typing === null) { L.typingOk = false; L.typingOut = null; }          // (typing isn't on, on this server: not asked again)
  // the list's unread counts, at once (one to one; the chat you're in is read)
  let listMoved = false;
  if (d.unread && typeof d.unread === "object") for (const f of S.friends) {
    if (S.view === "chat" && S.chat === f.id) continue;
    const n = Math.max(0, Number(d.unread[f.id]) || 0);
    if ((f.unread || 0) !== n) { f.unread = n; listMoved = true; }
  }
  // what changed: the open chat, only what's new; any other, a sync (every 5 s at most on the list, 15 s in a chat)
  let other = false;
  for (const c of Array.isArray(d.changed) ? d.changed : []) {
    if (!c || typeof c.chat !== "string" || L.seen.get(c.chat) === c.at) continue;
    L.seen.set(c.chat, c.at); L.quietSince = Date.now();
    if (c.chat === open && friend(open)) deltaFetch(open);
    else if (c.chat === open && group(open)) groupLoad(open);
    else other = true;
  }
  if (other) syncSoon(S.view === "chat" ? 15e3 : 5e3);
  // who's typing (shown for 7 s at most without a fresh word: pulseTick)
  const ty = d.typing && typeof d.typing === "object" ? d.typing : {}, until = Date.now() + 7000, next = new Map();
  for (const [k, ids] of Object.entries(ty)) { const xs = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x !== S.me?.id) : []; if (xs.length) next.set(k, { ids: xs, until }); }
  if (next.size) L.quietSince = Date.now();
  L.typingIn = next;
  const sig = typingSig();
  if (sig !== L.tsig || (listMoved && S.view === "messages")) { L.tsig = sig; if (S.view === "chat" || S.view === "messages") calmRender(); }
  else if (listMoved) renderTabs();
}
// every second: dots that have gone quiet go, and the pulse starts or stops as the screen changes
function pulseTick() {
  const L = S.live;
  if (L.typingIn.size) {
    for (const [k, v] of L.typingIn) if (v.until <= Date.now()) L.typingIn.delete(k);
    const sig = typingSig(); if (sig !== L.tsig) { L.tsig = sig; if (S.view === "chat" || S.view === "messages") calmRender(); }
  }
  if (pulseWanted()) { if (!L.timer && !L.busy) pulseNow(); }
  else { L.quietFor = null; if (L.timer && !L.force) { clearTimeout(L.timer); L.timer = 0; } }     // (no pulse here: back again, it starts afresh)
}
// going away: one last word, that nothing's open now and you've stopped typing (it outlives the page if it must)
function pulseHide() {
  const L = S.live;
  clearTimeout(L.timer); L.timer = 0; L.quietFor = null;
  L.fullAt.clear();                               // (back again, the open chat is fetched whole: anything may have changed)
  if (L.off || !S.token || !(S.view === "chat" || S.view === "messages")) return;
  const body = { since: L.since, open: "" };
  if (L.typingOut) { body.stop = L.typingOut.chat; L.typingOut = null; }
  L.lastAt = Date.now();
  try { fetch("/api/pigeon/pulse", { method: "POST", keepalive: true, headers: { Authorization: "Bearer " + S.token, "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {}); } catch (_) {}
}
// a key in the message box: typing, said with the next pulse (sooner if it's due)
function typingKey() {
  const L = S.live; L.keyAt = Date.now();
  if (S.view !== "chat" || !S.chat) return;
  const ty = typingSay(S.chat);
  if (ty) { L.quietSince = Date.now(); pulseNow(); }
}
// the open chat's full fetch: on opening, after being away, every 60 s, or when asked; between, the pulse brings what changed
// (a group's, every sync as before; no pulse working, every sync too)
function chatDue(id) {
  const L = S.live, live = !L.off && Date.now() - L.okAt < 20e3;
  return !live || !!group(id) || !!L.forceChat || Date.now() - (L.fullAt.get(id) || 0) >= 60e3;
}
function syncSoon(gap) {
  const L = S.live, left = (S.lastSync || 0) + gap - Date.now();
  if (left <= 0) return sync();
  if (!L.syncTimer) L.syncTimer = setTimeout(() => { L.syncTimer = 0; sync(); }, left);
}
// a group that changed: fetched whole, once every 3 s at most
function groupLoad(gid) {
  const L = S.live, left = (L.lastGroupLoad.get(gid) || 0) + 3000 - Date.now();
  if (left > 0) { if (!L.gTimer) L.gTimer = setTimeout(() => { L.gTimer = 0; if (S.view === "chat" && S.chat === gid) groupLoad(gid); }, left); return; }
  L.lastGroupLoad.set(gid, Date.now());
  loadChat(gid).then(() => { if (S.view === "chat" && S.chat === gid) calmRender(); }).catch(() => {});
}
// a notification arrived while Chat's open: the chat it's for, if it's on screen, at once
function pushTag(tag) {
  if (typeof tag !== "string" || S.view !== "chat" || !S.chat || S.locked) return;
  if (tag === "msg-" + S.chat || tag === "from-" + S.chat) { if (friend(S.chat)) deltaFetch(S.chat); }
  else if ((tag === "gmsg-" + S.chat || tag === "group-" + S.chat) && group(S.chat)) groupLoad(S.chat);
}
// The open chat, only what's changed since its last answer (GET messages?with=&after=); whole when that's too old,
// it's not been fetched whole for a minute, or the server answers in full
async function deltaFetch(fid) {
  const L = S.live;
  if (L.deltaBusy) { L.deltaAgain = fid; return; }
  L.deltaBusy = true;
  try {
    const after = L.after.get(fid), whole = !after || !S.msgs.has(fid) || Date.now() - (L.fullAt.get(fid) || 0) >= 60e3 || now() - after > 590e3;
    if (whole) await loadChat(fid);
    else {
      const tok = S.token, d = await api(`messages?with=${encodeURIComponent(fid)}&after=${encodeURIComponent(after)}`);
      if (S.token !== tok) return;
      if (d.delta) await applyDelta(fid, d); else await loadChat(fid, d);
    }
    if (S.view === "chat" && S.chat === fid) calmRender();
  } catch (e) { if (!e.offline) console.warn("delta", e.message); }
  finally {
    L.deltaBusy = false;
    if (L.deltaAgain) { const x = L.deltaAgain; L.deltaAgain = null; if (S.view === "chat" && S.chat === x) deltaFetch(x); }
  }
}
// what changed, merged in: messages by id, those gone taken out, their reactions as they are now, new way lines
async function applyDelta(fid, d) {
  const f = friend(fid); if (!f || !Array.isArray(d.messages)) return;
  const L = S.live;
  if (Number.isFinite(d.now)) { S.skew = d.now - Date.now(); L.after.set(fid, d.now); }
  const list = [...(S.msgs.get(fid) || [])], at = new Map(list.map((m, i) => [m.id, i]));
  const gone = new Set(Array.isArray(d.gone) ? d.gone.filter((x) => typeof x === "string") : []);
  for (const r of d.reacts || []) await decrypt(fid, r, "react");
  for (const m of d.messages) {
    if (vanished(m)) { gone.add(m.id); S.plain.delete(m.id); S.pctx.delete(m.id); continue; }
    await decrypt(fid, m);
    if (m.note && m.via) await openNote(m.id, m.via, S.me.id, m.note);
    if (m.stopover && m.mine) await openNote(m.id, S.me.id, m.finalTo, m.mine);
    if (at.has(m.id)) list[at.get(m.id)] = m; else list.push(m);
    // (a message from them: their dots go at once)
    if (m.from === fid && L.typingIn.has(fid) && !m.flying) { L.typingIn.delete(fid); L.tsig = typingSig(); }
  }
  for (const id of gone) { S.plain.delete(id); S.pctx.delete(id); }
  S.msgs.set(fid, list.filter((m) => !gone.has(m.id)).sort((a, b) => a.sentAt - b.sentAt));
  const ids = new Set(d.messages.map((m) => m.id));
  S.reacts.set(fid, [...(S.reacts.get(fid) || []).filter((r) => !ids.has(r.msg) && !gone.has(r.msg)), ...(Array.isArray(d.reacts) ? d.reacts : [])]);
  // a line collapsed into a later one (a change undone within 10 minutes) replaces it
  const nl = (Array.isArray(d.lines) ? d.lines : []).filter((x) => x && typeof x.by === "string" && Number.isFinite(x.at));
  if (nl.length) {
    let have = S.lines.get(fid) || [];
    for (const x of nl) have = have.filter((y) => !(y.by === x.by && (y.at === x.at || (y.at < x.at && x.at - y.at < 600e3))));
    S.lines.set(fid, [...have, ...nl].sort((a, b) => a.at - b.at));
  }
  if (d.turn) S.turns.set(fid, { ...d.turn, at: d.now || 0 });
  if (d.way === "instant" || d.way === "pigeon") f.way = d.way;
  if (d.theirWay === "instant" || d.theirWay === "pigeon") f.theirWay = d.theirWay;
  S.chatChanged = true;
  // read, as a whole chat is: only one on screen
  const msgs = S.msgs.get(fid), unread = (m) => m.from === fid && !m.stopover && !m.flying && !m.lost && !m.readAt;
  if (!S.locked && S.view === "chat" && S.chat === fid && document.visibilityState === "visible" && msgs.some(unread)) {
    api("read", { method: "POST", body: { with: fid } }).catch(() => {});
    for (const m of msgs) if (m.from === fid && !m.flying && !m.lost) m.readAt = m.readAt || now();
    f.unread = 0;
  }
  fetchMedia(fid);
}

/* ---------- the last-known state, kept on this phone so Chat opens at once ----------
   What the server last sent (message contents still sealed; they open with the
   key that's already on this phone) and the last few chats you opened. Shown
   straight away at launch while the fresh copy loads; deleted on sign out. */
const CACHE_V = 1, CACHE_CHATS = 12;
let cacheTimer = 0;
function cacheSave() {
  if (ENGINE) return;                // (the engine keeps nothing: Chats' own copy is Chats')
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
/* ---------- drafts: what you'd started writing, kept on this phone ----------
   Each chat's draft, and what's in the box of the one that's open, sealed with your own key (as the keys you've trusted
   are: never kept as words), so they outlast an update putting itself in, or iOS closing the app while it's away.
   Deleted on sign out (not when a sign-in is ended from elsewhere: forget). */
const draftsMeta = () => ({ type: "draft", id: "drafts", from: S.me.id, to: S.me.id });
let draftsTimer = 0;
const draftsSoon = () => { clearTimeout(draftsTimer); draftsTimer = setTimeout(draftsSave, 800); };
async function draftsSave() {
  clearTimeout(draftsTimer);
  if (!S.me || !S.priv || !S.myPub) return;
  const me = S.me.id, d = new Map(S.drafts);
  // (the open chat's as it is in the box; not words going up with a photo or a voice pigeon)
  if (S.view === "chat" && S.chat && $ta) { const v = $ta.value; if (v.trim() && !(S.busy && S.sending && S.sendingTo === S.chat)) d.set(S.chat, v); else d.delete(S.chat); }
  try {
    const ct = d.size ? await E2E.seal(await pairFor(S.myPub), draftsMeta(), { d: [...d] }) : null;
    if (S.me?.id !== me) return;                   // (signed out meanwhile: nothing of theirs kept)
    if (ct) await idb.set("drafts:" + me, ct); else await idb.del("drafts:" + me);
  } catch (_) {}
}
async function draftsLoad() {
  try {
    const ct = await idb.get("drafts:" + S.me.id); if (!ct) return;
    const o = await E2E.open(await pairFor(S.myPub), draftsMeta(), ct);
    for (const [id, v] of Array.isArray(o?.d) ? o.d : []) if (typeof id === "string" && typeof v === "string" && v.trim() && !S.drafts.has(id)) S.drafts.set(id, v);
  } catch (_) {}                                   // (one this key can't open: as if there were none)
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
// past its time it's gone, even before the server has tidied it away
const picGone = (m) => m.photo === 2 || S.photoGone.has(m.id) || (m.expiresAt != null && now() >= m.expiresAt);
// A view-once photo whose download didn't arrive (no signal, cut off, the server busy) may still have been counted as
// opened by the server, which says so with the next sync: it lets who it was for ask again for a few minutes after the
// first ask (functions/_pigeon.js ONCE_AGAIN), so till then it's still there to tap here (not quite all of them: the
// asking takes a moment too)
const ONCE_RETRY = 4 * MIN, onceMissed = new Map();
const onceAgain = (m) => onceMissed.has(m.id) && now() - (m.viewedAt || onceMissed.get(m.id)) < ONCE_RETRY;
async function loadPhoto(fid, m, p) {
  S.photos.set(m.id, "");                         // loading
  let got = false;
  try {
    const r = await api((group(fid) ? "group-photo/" : "photo/") + m.id, { raw: true }), bytes = await r.arrayBuffer();
    got = true;
    const plain = p.v ? await E2E.openPhoto(m.id, p.v, bytes, "voice") : await E2E.openPhoto(m.id, p.p, bytes);
    S.photos.set(m.id, URL.createObjectURL(new Blob([plain], { type: p.v ? voiceMime(p.v.m) : p.p.m === "image/gif" ? "image/gif" : "image/jpeg" }))); bornAt.set(S.photos.get(m.id), Date.now());
    trimPhotos(fid);
  } catch (e) {
    S.photos.delete(m.id);
    // gone, or it can't be opened on this phone: don't fetch it again every time (no signal, the server busy, or a
    // download cut off or too slow: it will be, next time the chat is looked at: fetchMedia)
    if (got || !passing(e)) S.photoGone.add(m.id);
  }
  if (S.view === "chat" && S.chat === fid) render();
}
const passing = (e) => e.offline || !e.status || e.status >= 500 || [408, 425, 429].includes(e.status);
// the photos, GIFs and voice pigeons a chat should have and doesn't yet (none on its way, none gone): fetched
function fetchMedia(fid) {
  const g = group(fid);
  for (const m of S.msgs.get(fid) || []) {
    const p = S.plain.get(m.id), theirs = g ? m.from !== S.me.id : m.to === S.me.id;
    if (m.photo === 1 && (p?.p || p?.v) && !onceP(p) && !S.photos.has(m.id) && !S.photoGone.has(m.id) && !(theirs && (m.flying || m.lost))) loadPhoto(fid, m, p);
  }
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
// No copying (outside the fields), and no zoom, by a pinch or a double tap (the map and a photo pinch themselves).
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
  if (HUB) return;                // (at the hub, the tabs are the hub's own pages: no swiping between Chat's)
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
// the photo: swipe it away, up or down (not while it's enlarged, nor once a second finger comes: that's pinchZoom's)
function viewerDrag() {
  let st = null;
  $layer.addEventListener("touchstart", (e) => {
    const v = e.target.closest?.(".viewer"); st = null;
    if (v && e.touches.length === 1 && !zoomed() && !v.classList.contains("zoomed")) st = { v, img: $("img", v), y: e.touches[0].clientY, x: e.touches[0].clientX, ly: e.touches[0].clientY, lx: e.touches[0].clientX, lt: performance.now(), vy: 0, dy: 0, dir: null };
  }, { passive: true });
  $layer.addEventListener("touchmove", (e) => {
    if (!st) return;
    if (e.touches.length > 1) { if (st.dir) unstyle(st.img, st.v); st.v.style.backgroundColor = ""; st = null; return; }
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
    stepBack(true);
  });
  // …and Android's Back, the gesture or the button, the same (backStep)
  addEventListener("popstate", () => {
    if (!ANDROID) return;
    if (unwinding) { unwinding = false; return backStep(); }
    // (Back lands where the step was kept from; a link opened in place, #open=… say, moves history too, and isn't Back:
    // what it opens is its own to say, hashchange)
    if (location.href !== backFrom) return;
    stepBack(false); backStep();
  });
}
function stepBack(key) {
  if (!key && IFL.isOpen()) { IFL.close(); return; }     // (InFlite's menu answers Escape itself)
  if (onceOpen) { onceOpen.el.click(); return; }   // a view-once photo closes first
  if ($pop.firstElementChild) { closePop(); return; }
  if (S.sheet) { closeTop(); return; }
  if (key && inField(document.activeElement)) { document.activeElement.blur(); return; }     // (Android's Back puts the keyboard away itself)
  $(".nb-left .nbtn.back", $view)?.click();
}
// Android's Back goes back through the page's history, and Chat's screens aren't pages: so while there's something to step
// back from (a menu, a sheet, a photo, a chat), one step of history is kept for it, which Back takes (popstate, as
// Escape); still more to close, it's kept again; nothing left, it's taken away, so Back from Messages leaves Chat as it
// should. (Each page's own steps only: one left from before a reload isn't this page's to take back)
const ANDROID = /Android/.test(navigator.userAgent), BACK_STEP = Math.random().toString(36).slice(2);
let unwinding = false, backFrom = null;
function backStep() {
  if (!ANDROID || unwinding || !$view) return;
  const ours = history.state?.chatBack === BACK_STEP;
  const want = !S.locked && !!(IFL.isOpen() || onceOpen || $pop.querySelector(".menu-pop:not(.closing), .asheet:not(.closing)") || S.sheet || $(".nb-left .nbtn.back", $view));
  try {
    if (want && !ours) { backFrom = location.href; history.pushState({ chatBack: BACK_STEP }, ""); }
    else if (!want && ours) { unwinding = true; history.back(); }
  } catch (_) { unwinding = false; }
}
function lockPage() {
  document.addEventListener("touchstart", () => {}, { passive: true });    // lets :active press states show on iPhone
  // (two fingers zoom nothing: InFlite's menu stops every app's page being pinched; the map and a photo pinch themselves)
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
        <button type="button" class="plus" data-act="attachmenu" aria-label="${HUB ? "Add to Your Message" : "Add a photo"}">${I.plus}</button>
        <div class="field-wrap">
          <button type="button" class="mode" data-act="nextmode" data-next="now" hidden></button>
          <button type="button" class="kind" data-act="flysheet" aria-haspopup="dialog" hidden></button>
          <textarea rows="1" placeholder="Message" aria-label="Message" id="msg" maxlength="2000" enterkeyhint="enter"></textarea>
          <button type="button" class="mic" data-act="recstart" aria-label="Record a voice pigeon" hidden>${I.mic}</button>
        </div>
        <button type="submit" class="send" aria-label="Release the pigeon">${I.up}</button>
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
    <div class="toasts" role="status" aria-live="polite"></div>
    <div class="sr said" role="status"></div>`;
  $view = $(".view"); $compose = $(".compose"); $tabbar = $(".tabbar"); $layer = $(".layer"); $pop = $(".poplayer"); $toast = $(".toasts"); $ta = $("#msg"); $said = $(".said");
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
  $ta.addEventListener("input", () => { fitTa(); renderCompose(); draftsSoon(); typingKey(); });
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
  const behindBar = () => { if (!matchMedia("(orientation: portrait)").matches) return true; const p = document.createElement("div"); p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"; document.body.appendChild(p); const t = p.offsetHeight; p.remove(); return t > 0; };
  const fit = () => {
    const portrait = matchMedia("(orientation: portrait)").matches;
    const w = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const h = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    // (only when the window is the whole screen, not an iPad window beside another app)
    // (and only when the page itself fills it, running up behind the status bar: a link from another Home Screen app
    // opens in iOS's own small browser, still "standalone" but under its bar, with no status bar inset, where sized
    // to the screen the page ran off its foot, Sign in with it)
    const whole = Math.abs(window.innerWidth - w) < 2 && behindBar();
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
  // (any pointer that's a finger: an iPad with a trackpad says its own pointer is a fine one, and its keyboard can come off)
  const vv = window.visualViewport; if (!vv || !matchMedia("(any-pointer: coarse)").matches) return;
  const doc = document.documentElement;
  let raf = 0, was = false;
  const fit = () => {
    raf = 0;
    // (pinched in, the page is where you've moved it: fitted again once it's back to size; and a finger on the message
    // box moves it too, styles.css html.zoomed)
    if (doc.classList.toggle("zoomed", zoomed())) return;
    // (up when the visible part is well short of the page, or, where iOS shrinks the page itself for the keyboard as
    // newer ones do on the Home Screen, well short of the screen: else the box kept the home bar's spacing above it)
    const portrait = matchMedia("(orientation: portrait)").matches, tall = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const kb = inField(document.activeElement) && (window.innerHeight - vv.height > 80 || (tall > 0 && tall - vv.height > 260));
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
function renderOffline() {
  const o = $(".offline"); if (!o) return;
  o.classList.toggle("on", !!S.offline); o.setAttribute("aria-hidden", String(!S.offline));
  const w = !S.me || pigeonsOn() ? "You’re offline. Pigeons will wait." : "You’re offline. Messages will wait.";
  if (o.textContent !== w) o.textContent = w;
}

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
  if (!same && $ta && S.view === "chat" && S.chat && !(S.busy && S.sending && S.sendingTo === S.chat)) { const v = $ta.value; if (v.trim()) S.drafts.set(S.chat, v); else S.drafts.delete(S.chat); draftsSoon(); }
  if (!same && rec) recStop(false);                // a recording never carries on (or sends) after you leave its chat
  if (!same && S.chat) S.next.delete(S.chat);      // (Now, or by pigeon, chosen for the next message: for this visit only)
  if (!same) newPill(false);
  S.chatWas = S.chat;
  S.view = view; S.chat = chat ?? null; S.sheet = null; S.err = ""; S.stick = true;
  if (!same && TABS.some(([id]) => id === view) && S.token && Date.now() - (S.lastSync || 0) > 2000) setTimeout(sync, 0);   // a tab you switch to is up to date
  if (view !== "chat" || chat !== S.chatWas) clearAttach();      // (a photo you'd picked stays with its chat; one being sent goes on)
  if (!same && $ta) $ta.value = (view === "chat" && chat && S.drafts.get(chat)) || "";
  // (something another app sent here to be shared, as Markets's Send in Chat does: into the first chat you open)
  if (!same && $ta && view === "chat" && chat && S.share) { $ta.value = ($ta.value.trim() ? `${$ta.value.trimEnd()}\n` : "") + S.share; S.share = null; }
  if (!same && view === "chat" && chat && S.cardWait && !S.cardWait.chat) S.cardWait.chat = chat;      // (and a card sent here the same way)
  closePop();
  if (!same && $view) { $view.scrollTop = 0; $view.classList.remove("scrolled", "titled"); }
  render();
  if (!same && $ta) fitTa();                                      // (after render: the composer is showing now)
  backStep();
  if (!same && !S.sheet && !AUTH_VIEWS.has(view)) focusTitle();
  if (!same && (view === "chat" || S.chatWas)) { S.live.force = true; pulseNow(); }    // (the chat on screen, or none: told at once, with typing stopped)
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
  for (const [id, at] of S.fresh) if (t - at > 700) { S.fresh.delete(id); S.rise.delete(id); }
  $view.querySelectorAll("[data-fresh]").forEach((el) => {
    const at = S.fresh.get(el.dataset.fresh); if (!at) { el.classList.remove("fresh"); return; }
    el.style.animationDelay = `${at - t}ms`;
    const r = S.rise.get(el.dataset.fresh); if (r != null) el.style.setProperty("--rise", `${r}px`);
  });
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
    // what you sent, now in the air: drawn in that shape already, so only its "Sending…" becomes when it lands
    if (o.sig === "pending" && sig !== "pending") { const ft = $(".ft", el); if (ft && !still) ft.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" }); }
    else if (o.sig !== sig) {
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
// (and while words you've sent are rising out of the box: sendingAt)
let sendingAt = -1e9;
const SEND_MS = 560;
function calmRender() {
  if (calmWait) return;
  const busy = () => touching > 0 || performance.now() - glidedAt < 180 || performance.now() - navAt < NAV_MS + 40 || performance.now() - sendingAt < SEND_MS;
  if (!busy()) return render();
  const later = () => { if (busy()) { calmWait = setTimeout(later, 120); return; } calmWait = null; render(); };
  calmWait = setTimeout(later, 120);
}
let drawnView = null;            // (the screen render() last drew: a redraw of that one keeps its focus)
function render() {
  if (!$view) return;
  if (calmWait) { clearTimeout(calmWait); calmWait = null; }
  clearSwipes();
  // the engine: no screen of its own, only its sheet (and its lock, if it's locked), over the page it's in
  if (ENGINE) {
    $view.innerHTML = ""; drawnView = null; $compose.hidden = true; $tabbar.hidden = true;
    if (S.locked) { $layer.innerHTML = ""; syncInert(); drawLock(); return; }
    drawLock(); renderSheet(); return;
  }
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
    $view.innerHTML = vAuth(); drawnView = null; $compose.hidden = true; $tabbar.hidden = true; if (HUB) hubTabs(S.view === "welcome"); renderSheet(); animateNav();
    if (S.view === "welcome") S.welcomed = true;
    return;
  }
  if (document.documentElement.classList.contains("night")) { document.documentElement.classList.remove("night"); applyTheme(); }
  if (S.locked) { $view.innerHTML = ""; drawnView = null; $compose.hidden = true; $tabbar.hidden = true; if (HUB) hubTabs(false); $layer.innerHTML = ""; syncInert(); drawLock(); return; }
  drawLock();
  // (at the hub: the hub's tab bar for Chat's own, as on every page of it; none in a chat, nor on Chat's settings, which
  // open from You and go back to it)
  if (HUB) hubTabs(!chat && S.view !== "account");
  const tabsBack = !HUB && $tabbar.hidden && !chat;
  $tabbar.hidden = HUB || chat;
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
  const recalledOpen = new Set([...$view.querySelectorAll("details.recall-run[open]")].map((el) => el.dataset.key));
  $view.innerHTML = chat ? vChat() : S.view === "friends" ? vFriends() : S.view === "account" ? vAccount() : vMessages();
  drawnView = kView();
  if (chat) for (const el of $view.querySelectorAll("details.recall-run")) el.open = recalledOpen.has(el.dataset.key);
  if (chat) $view.querySelectorAll("[data-ar]").forEach((el) => { el.style.aspectRatio = el.dataset.ar; });
  if (chat) $view.querySelectorAll("[data-h]").forEach((el) => { el.style.setProperty("--h", el.dataset.h); });
  if (chat && S.player) voiceShow();
  // down to the newest (what you've just sent rises into place itself: sendRise)
  if (chat && S.stick) $view.scrollTop = $view.scrollHeight;
  else if (Math.abs($view.scrollTop - keepTop) > 1) $view.scrollTop = keepTop;     // (left be when it's there already: setting it stops a glide)
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
  if (was?.chat === S.chat && last && was.id !== last.id && !S.stick && last.from !== S.me.id) newPill(true, !!last.instant);
}
function newPill(on, msg) {
  let p = $compose && $(".newpill", $compose);
  if (!on) { if (p && !p.classList.contains("out")) { p.classList.add("out"); setTimeout(() => p.remove(), 220); } return; }
  if (p && !p.classList.contains("out")) return;
  p?.remove();
  p = document.createElement("button"); p.type = "button"; p.className = "newpill"; p.dataset.act = "tonew"; p.textContent = msg ? "New message ↓" : "New pigeon ↓";
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
    .replace('<div class="ifh-acts"></div>', `<div class="ifh-acts">${right.replace(/class="nbtn( [^"]*)?"/g, (_, x) => `class="ifh-act${x || ""}"`)}</div>`);
  const me = root && S.me && !left;
  return `<div class="navbar${solid ? " solid" : ""}${root ? ` root b${(right.match(/class="nbtn/g) || []).length}` : ""}${me ? " me" : ""}"><div class="nb-left">${me ? meBtn() : left}</div><div class="nb-title one">${titleHtml ?? esc(title)}</div><div class="nb-right">${right}</div></div>`;
};
// (each tab's one line, under its name: what's true now)
function rootLine(title) {
  if (title === "Messages") {
    const unread = [...S.friends, ...S.groups].reduce((n, f) => n + (f.unread || 0), 0), going = S.outbox.length;
    return unread ? `<i>${unread} unread</i>` : going && pigeonsOn() ? `<i>${going} on the way</i>` : "All read";
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
    onClose: () => backStep(),
  });
  backStep();
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
    // (at the hub, every app's notifications come to InFlite, turned on in You: said so, and a tap goes there)
    HUB ? { key: "notify", icon: "bell", color: "red", label: "Notifications", value: "Set in You", open: () => location.assign("/#you") }
      : accountPage() ? { key: "notify", icon: "bell", color: "red", label: "Notifications", value: ps === "on" ? "On" : "Off here", warn: ps !== "on", open: () => openAccount("notify-inflight") }
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
  // (at the hub, the account's page beside it: account.<site>, a deliberate pop-up)
  : HUB ? `${location.protocol}//account.${hubSite()}/`
  : location.hostname === "georgefarrowgreen.com" ? "https://account.inflite.ai/"
  : /(^|\.)localhost$/.test(location.hostname) ? `${location.protocol}//account.localhost${location.port ? ":" + location.port : ""}/` : null;
const pg = (kind, skin) => kind === "mystery" ? `<span class="pg mystery" aria-hidden="true">?</span>` : `<span class="pg ${kind}${skin && SKINS[skin] ? " sk-" + skin : ""}" aria-hidden="true">${I.bird}</span>`;     // a pigeon in its colour (and its look, if rare)
const pgm = (m) => pg(kindOf(m), m?.skin);

const onceP = (p) => !!p?.p && p.p.m !== "image/gif";
const picWord = (p, m) => (p.v ? (m?.instant || !pigeonsOn() ? "Voice message" : "Voice pigeon") : p.p?.m === "image/gif" ? "GIF" : "Photo");
// A pigeon in the air, in a list: yours with its pigeon and when it lands, theirs sealed
const riderIcon = (m) => `<span class="rider k-${kindOf(m)}">${I.bird}</span>`;
const sealedIcon = (m) => `<span class="sealedi k-${kindOf(m)}">${I.lock}</span>`;
function preview(f) {
  const out = S.outbox.filter((o) => o.to === f.id).at(-1);
  if (out) return { html: `<span class="${out.err ? "lostp" : "fl"}">${out.err ? I.warn : I.clock} ${out.err ? "Not sent" : "Waiting for signal"}</span>`, at: out.at };
  const l = f.last;
  if (!l) return { html: "No messages yet", at: 0 };
  const on = pigeonsOn(), mine = l.from === S.me.id;
  // (pigeons off: letters said plainly, with no birds)
  if (l.recalled) return { html: `<span class="homing">${I.homing} ${on ? (mine ? "You called your pigeon back" : `${esc(first(f.name))} called their pigeon back`) : mine ? "You called a letter back" : `${esc(first(f.name))} called a letter back`}</span>`, at: l.lostAt };
  if (l.lost) return { html: `<span class="lostp">${on ? I.skull : I.warn} ${on ? (mine ? "Your pigeon was lost on the way" : "A pigeon was lost on its way") : mine ? "Your letter didn’t arrive" : "A letter didn’t arrive"}</span>`, at: l.lostAt };
  if (mine && l.instant && l.waiting) return { html: `<span class="fl">${I.clock} You: sends ${atTime(l.sentAt)}</span>`, at: l.sentAt };
  if (mine && l.flying) return { html: on ? `<span class="upp">${riderIcon(l)}In the air · lands ${atTime(l.deliverAt)}</span>` : `<span class="upp">You: a letter, arrives ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  if (!mine && l.flying) return { html: on ? `<span class="upp">${sealedIcon(l)}Sealed · lands ${atTime(l.deliverAt)}</span>` : `<span class="upp">A letter, arrives ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? (p.unchecked ? "Check their new safety number to read this" : "Couldn’t open this message") : p.v ? `${picWord(p, l)} (${fmtClip(p.v.d)})${l.photo === 2 ? " · expired" : ""}` : p.p ? (l.photo === 2 ? `${picWord(p, l)} (expired)` : picWord(p, l)) + (p.t ? ": " + p.t : "") : p.t;
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
  if (!pigeonsOn()) {
    // (pigeons off: letters said plainly, with no birds)
    if (l.from === S.me.id && l.recalled && !flockCount(l).landed) return { html: `<span class="homing">${I.homing} You called a letter back</span>`, at: l.sentAt };
    if (l.from !== S.me.id && l.recalled) return { html: `<span class="homing">${I.homing} ${who} called a letter back</span>`, at: l.lostAt };
    if (l.lost) return { html: `<span class="lostp">${I.warn} ${l.from === S.me.id ? "Your letter didn’t arrive" : `${who}’s letter didn’t arrive`}</span>`, at: l.from === S.me.id ? l.sentAt : l.lostAt };
    if (l.from === S.me.id && l.flying) return { html: `<span class="upp">You: a letter, on its way</span>`, at: l.sentAt };
    if (l.from !== S.me.id && l.flying) return { html: `<span class="upp">${who}: a letter, arrives ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  }
  if (l.from === S.me.id && l.recalled && !flockCount(l).landed) return { html: `<span class="homing">${I.homing} You called your pigeons back</span>`, at: l.sentAt };
  if (l.from !== S.me.id && l.recalled) return { html: `<span class="homing">${I.homing} ${who} called their pigeon back</span>`, at: l.lostAt };
  if (l.from === S.me.id && l.lost) return { html: `<span class="lostp">${I.skull} Your pigeons were lost on the way</span>`, at: l.sentAt };
  if (l.from === S.me.id && l.flying) { const c = flockCount(l); return { html: `<span class="upp">${riderIcon(l)}In the air · ${c.landed} of ${c.n} landed</span>`, at: l.sentAt }; }
  if (l.from !== S.me.id && l.lost) return { html: `<span class="lostp">${I.skull} ${who}’s pigeon was lost on its way</span>`, at: l.lostAt };
  if (l.from !== S.me.id && l.flying) return { html: `<span class="upp">${sealedIcon(l)}${who}: sealed · lands ${atTime(l.deliverAt)}</span>`, at: l.sentAt };
  const p = S.plain.get(l.id) || { t: "" };
  const body = p.bad ? "Couldn’t open this message" : p.v ? `${picWord(p, l)} (${fmtClip(p.v.d)})` : p.p ? picWord(p, l) + (p.t ? ": " + p.t : "") : p.t;
  return { html: `${who}: ${esc(body)}`, at: l.from === S.me.id ? l.sentAt : l.deliverAt };
}
const fmtListTime = (ts) => { if (!ts) return ""; if (sameDay(ts, now())) return fmtTime(ts); if (sameDay(ts, now() - DAY)) return "Yesterday"; const d = new Date(ts); return now() - ts < 6 * DAY ? DOW[d.getDay()] : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };

/* ---------- flight streaks: days in a row with a pigeon between you ---------- */
const STREAK_MIN = 3;
const streakOf = (f) => (pigeonsOn() && f?.streak && f.streak.n >= STREAK_MIN ? f.streak : null);
// alive but nothing sent today, and under six hours to go
const streakRisk = (s) => s && !s.today && s.endsAt - now() < 6 * HOUR;
const streakLeft = (s) => fmtDur(Math.max(MIN, s.endsAt - now()));
const streakBadge = (f) => { const s = streakOf(f); return s ? `<span class="streak${streakRisk(s) ? " risk" : ""}" aria-label="${s.n}-day flight streak${streakRisk(s) ? `, ends in ${esc(streakLeft(s))}` : ""}">${I.flame}${s.n}</span>` : ""; };

// A new season: its look, for anyone, until it ends
function seasonCard() {
  const s = seasonNow(); if (!s || !S.me || !pigeonsOn()) return "";
  try { if (localStorage.getItem("inflight-season") === s.key) return ""; } catch (_) { return ""; }
  // one slim row: what it is, until when, Try It (the looks, with how to keep it), and an × to put it away
  return `<div class="seasoncard" data-key="season" role="note"><span class="semoji" aria-hidden="true">${s.emoji}</span><span class="stext"><b>${esc(s.words)} pigeons are here</b>
    <span>The ${esc(s.look)} look, until ${esc(fmtDate(s.to - 1).replace(/ \d{4}$/, ""))}</span></span>
    <button type="button" class="btn small" data-act="seasontry">Try It</button><button type="button" class="sx" data-act="seasonhide" aria-label="Not now">${I.x}</button></div>`;
}

/* ---------- Messages ---------- */
// The bird at the top of Messages and Friends: pigeons on or off, at a tap
const birdBtn = () => `<button class="nbtn birdt" data-act="pigeons" aria-pressed="${pigeonsOn()}" aria-label="Pigeons, ${pigeonsOn() ? "on" : "off"}">${I.bird}</button>`;
// this phone's own small memories (a tip put away): never needed, so nothing goes wrong without them
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} };
// On Messages, where the In the air strip goes: the one-time note that messages can be instant now (pigeons on, not seen
// yet), else a tip: pigeons are still here (off), or how to use them (just turned on, on this phone). Inline, never over anything
function noteCard() {
  if (!S.me) return "";
  // (Chats at the hub for the first time on this phone (spec §11.2): what came with the sign-in and what didn't, said
  // plainly, and the lock offered once, as it doesn't come across)
  // (not for a brand-new account, with nothing to have brought: no friends or groups once Chats has heard from the server,
  // decided then and kept)
  if (HUB && lsGet("inflight-hubnote") !== "done" && !S.friends.length && !S.groups.length && S.synced) lsSet("inflight-hubnote", "done");
  if (HUB && lsGet("inflight-hubnote") !== "done" && (S.friends.length || S.groups.length)) return `<div class="notecard" data-key="hubnote" role="note"><div class="tt"><i aria-hidden="true">${I.lock}</i><b>Chats is part of InFlite now</b></div>
    <p>Your friends and every message are here. Drafts, anything still waiting to send and Chat’s lock stay with Chat on its own.${passkeysSupported() ? ` Lock Chats with ${isIOS() ? "Face ID" : "a passkey"}?` : ""}</p>
    <div class="tfoot">${passkeysSupported() ? `<button type="button" class="btn small" data-act="hubnotelock">Lock Chats</button>` : ""}<button type="button" class="btn small plain" data-act="hubnoteok">${passkeysSupported() ? "Not Now" : "Got It"}</button></div></div>`;
  const tip = (key, title, text, btns) => `<div class="pgtip" data-key="${key}" role="note"><div class="tt"><i aria-hidden="true">${I.bird}</i><b>${title}</b></div><p>${text}</p><div class="tfoot">${btns}</div></div>`;
  if (S.me.noted === false && pigeonsOn()) return `<div class="notecard" data-key="note" role="note"><div class="tt"><i aria-hidden="true">${I.bolt}</i><b>Messages can be instant now</b></div>
    <p>Messages can arrive as soon as you send them, with typing and read ticks. Your chats go by pigeon until you change them, and you can send any one message either way.</p>
    <div class="tfoot"><button type="button" class="btn small" data-act="noteinstant">Make Chats Instant</button><button type="button" class="btn small plain" data-act="notekeep">Keep Them by Pigeon</button></div></div>`;
  if (!pigeonsOn()) return lsGet("inflight-pgtip") === "off" ? "" : tip("pgtip:off", "Pigeons are still here", "Turn them on to send letters that take real time to fly, and watch them on the map.",
    `<button type="button" class="btn small" data-act="pgtipon">Turn On Pigeons</button><button type="button" class="btn small plain" data-act="pgtipoff">Not Now</button>`);
  if (lsGet("inflight-pgtipon") === "1") return tip("pgtip:on", "Pigeons are on", "In a chat, the Now button sends the next message by pigeon. To make a whole chat go by pigeon, tap the button beside its name.",
    `<button type="button" class="btn small" data-act="pgtipok">Got It</button>`);
  return "";
}
// The ticks on your message (instant ones only): sent (the server has it), delivered (their Chat has it), read (blue).
// A group's: delivered once everyone's has, read once everyone has read it
function tickState(m) {
  if (m.flock) { const fl = m.flock.filter((x) => !x.lost && !x.recalled); return fl.length && fl.every((x) => x.readAt) ? "read" : fl.length && fl.every((x) => x.delivered || x.readAt) ? "delivered" : "sent"; }
  return m.readAt ? "read" : m.delivered ? "delivered" : "sent";
}
const TICK_SAY = { sent: "Sent", delivered: "Delivered", read: "Read" };
const tickHtml = (st) => `<span class="tk${st === "read" ? " read" : ""}" data-st="${st}" role="img" aria-label="${TICK_SAY[st]}">${st === "sent" ? I.tick1 : I.ticks}</span>`;
// who's typing in a chat (one to one: the friend; a group: its members), while it's fresh
const typingOf = (key) => { const x = S.live.typingIn.get(key); return x && x.until > Date.now() ? x.ids.filter((id) => id !== S.me?.id) : []; };
// (at the hub, Friends from a button of Chats' own, as the hub's tab bar has no Friends: with how many are asking)
const peopleBtn = () => { const n = S.incoming.length; return `<button class="nbtn hubpeople" data-act="to" data-id="friends" aria-label="Friends${n ? `, ${n} asking` : ""}">${I.people}${n ? `<span class="pbadge" aria-hidden="true">${n}</span>` : ""}</button>`; };
// (the hub: whether your notifications are held now, and why, at the top of the list: a ride, or quiet hours)
function heldRow() {
  const h = HUB && S.hold; if (!h || !Number.isFinite(h.until) || h.until <= now()) return "";
  const words = h.why === "ride" ? "Riding · messages held" : `Quiet hours until ${fmtTime(h.until)} · Warnings still get through`;
  return `<div class="heldrow" role="status" data-key="held">${h.why === "ride" ? I.bird : I.moon}<span>${esc(words)}</span></div>`;
}
function vMessages() {
  const on = pigeonsOn(), right = birdBtn() + (on ? nbtn("skies", I.globe, "The Skies: every pigeon in the air") : "") + (HUB ? peopleBtn() : "") + nbtn("newmsg", I.compose, "New message");
  const fr = [
    ...S.friends.map((f) => ({ f, ...preview(f) })).filter((x) => x.f.last || S.outbox.some((o) => o.to === x.f.id)),
    ...S.groups.map((g) => ({ f: g, g, ...gpreview(g) })),
  ].sort((a, b) => b.at - a.at);
  const rows = fr.map(({ f, g, html, at }) => {
    // typing (one to one only); under the time: the unread count, else the ticks on your last message, else (pigeons on) the streak
    const ty = !g && typingOf(f.id).length > 0, l = f.last;
    const rt = f.unread ? `<span class="badge-n" aria-hidden="true">${f.unread}</span>` : l && l.from === S.me.id && l.instant && !l.waiting && !S.outbox.some((o) => o.to === f.id) ? tickHtml(tickState(l)) : g ? "" : streakBadge(f);
    const place = on && !g && f.place ? `<small class="mplace one">· ${esc(f.place.replace(/, (the Moon|Mars)$/, ""))}</small>` : "";
    return `<button class="mrow${g ? " grow" : ""}" data-key="r:${esc(f.id)}" data-act="open" data-id="${esc(f.id)}" data-find="${esc((g ? g.name + " " + g.members.map((p) => p.name).join(" ") : f.name + " " + f.handle).toLowerCase())}">
      ${f.unread ? `<span class="dot" data-key="d:${esc(f.id)}" data-in="pop" aria-hidden="true"></span><span class="sr">Unread</span>` : ""}
      ${g ? gavatar(g, "m") : avatar(f, "m", true)}
      <span class="mtext" data-key="t:${esc(f.id)}" data-sig="${kSig(`${at}|${html}|${S.drafts.get(f.id) || ""}|${ty}|${rt}`)}">
        <span class="mtop"><span class="mname one">${esc(g ? g.name : first(f.name))}</span>${place}<time>${fmtListTime(at)}</time>${chevSm}</span>
        <span class="mprev"><span class="mpt">${ty ? `<span class="typingnow">typing…</span>` : S.drafts.get(f.id)?.trim() ? `<span class="draft">Draft:</span> ${esc(S.drafts.get(f.id).trim().replace(/\s+/g, " "))}` : html}</span>${rt ? `<span class="mrt">${rt}</span>` : ""}</span>
      </span>
    </button>`;
  }).join("");
  // nothing on this phone yet and the first sync couldn't come (the server, not the network: that's the offline pill):
  // said, with Try Again, not placeholder rows for ever
  if (!rows && !S.started && !S.fromCache && S.syncFails) return `${navbar("Messages", { root: true, titleHtml: brandMark() })}
    <p class="empty"><b>Couldn’t open your messages</b>Chat’s server didn’t answer just now. <br><button class="btn small" data-act="retrysync">Try Again</button></p>`;
  // nothing on this phone yet and the first sync still on its way: placeholder rows, not "No messages"
  if (!rows && !S.started && !S.fromCache) return `${navbar("Messages", { root: true, titleHtml: brandMark(), right })}
    <div class="search skp" aria-hidden="true"></div><div class="mlist skel" aria-busy="true" aria-label="Loading your messages">${'<div class="mrow"><span class="sk av"></span><span class="mtext"><span class="sk l1"></span><span class="sk l2"></span></span></div>'.repeat(4)}</div>`;
  const what = on ? "pigeon" : "message";
  const empty = S.friends.length
    ? `<p class="empty"><b>No messages yet</b>Tap the pencil to send your first ${what}.</p>`
    : S.outgoing.length || S.incoming.length
    ? `<p class="empty"><b>No messages yet</b>Once a friend says yes, send them your first ${what}.<br><button class="btn" data-act="tab" data-id="friends">Friends</button></p>`
    // brand new: the two ways to get a friend, right here
    : `<div class="firstrun"><div class="appicon">${I.bird}</div><h2>${on ? "Your loft is ready" : "Your chats are ready"}</h2>
        <p>${on ? "Pigeons fly between friends. Send your link to someone, or add them by their handle." : "Messages arrive as soon as you send them, end-to-end encrypted. Add a friend to start."}</p>
        <div class="stack"><button class="btn wide" data-act="share">${I.up}Share My Link</button><button class="btn wide plain" data-act="addfriend">Add a Friend by Handle</button></div>
        <p class="me">You’re <b>@${esc(S.me.handle)}</b></p></div>`;
  return `${navbar("Messages", { root: true, titleHtml: brandMark(), right })}
    ${myKeyWarn()}${heldRow()}${rows ? `<label class="search" data-key="search">${I.search}<input type="search" id="msearch" placeholder="Search" value="${esc(S.q)}" autocomplete="off" aria-label="Search messages"></label>` : ""}
    ${seasonCard()}${noteCard()}${on ? `<div class="airslot"></div>` : ""}
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
  if (S.me?.shareNews === false || !S.news?.length || !pigeonsOn()) return "";
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
// Under a friend's name with pigeons off: "online", "last seen 12:20", or nothing (when they hide it)
const seenLine = (f) => (isOnline(f) ? "online" : f?.seenAt ? `last seen ${fmtSeen(f.seenAt).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}` : "");
function vFriends() {
  const on = pigeonsOn();
  if (S.me && on) loadNews();
  const fr = [...S.friends].sort((a, b) => a.name.localeCompare(b.name));
  const inc = S.incoming.length, out = S.outgoing.length;
  const rows = fr.map((f) => { const sub = on ? friendWhere(f) : seenLine(f); return `<button class="cell" data-key="f:${esc(f.id)}" data-act="open" data-id="${esc(f.id)}" data-find="${esc((f.name + " " + f.handle).toLowerCase())}">${avatar(f, "s", true)}
      <span class="ctext"><span class="one">${esc(first(f.name))}</span>${sub ? `<span class="csub one">${sub}</span>` : ""}</span>${on && f.pigeons === false ? `<span class="uses">Messages only</span>` : ""}${chevSm}</button>`; }).join("");
  // (pigeons on: who has them off, and what that means for a letter to them)
  const offs = on ? fr.filter((f) => f.pigeons === false) : [], n1 = offs[0] && esc(first(offs[0].name));
  const offNote = !offs.length ? "" : offs.length === 1 ? `${n1} has pigeons off. Letters you send ${n1} still fly and land at their time; ${n1} sees when they’ll arrive, without the birds.`
    : "Some friends have pigeons off. Letters you send them still fly and land at their time; they see when they’ll arrive, without the birds.";
  // (at the hub, Friends is a page of Chats, opened from its people button: back to Chats from it)
  return `${navbar("Friends", { root: true, left: HUB ? backBtn("to", "messages", "Chats") : "", right: birdBtn() + nbtn("share", I.share, "Share your handle") + nbtn("addfriend", I.addp, "Add a friend") })}
    ${fr.length ? `<label class="search" data-key="search">${I.search}<input type="search" id="fsearch" placeholder="Search" value="${esc(S.fq)}" autocomplete="off" aria-label="Search friends"></label>` : ""}
    ${inc || out ? `<div class="group" data-key="g:req" data-sig="${inc}|${out}|${esc(S.incoming[0]?.id || "")}">${cell({ act: "requests", icon: I.addp, tile: "red", label: "Friend Requests", sub: inc ? esc(S.incoming[0].name) + (inc === 2 ? ` and ${esc(S.incoming[1].name)}` : inc > 2 ? ` and ${inc - 1} others` : " wants to be friends") : `${out} sent, waiting for a reply`, val: inc ? `<span class="badge-n">${inc}</span>` : "", chev: true })}</div>` : ""}
    ${newsHtml()}
    ${fr.length ? `<div class="ghead" data-key="h:fr" data-sig="${fr.length}">${fr.length} friend${fr.length === 1 ? "" : "s"}</div><div class="group" data-key="g:fr" data-list="f">${rows}</div>
      ${offNote ? `<div class="gfoot pgoff" data-key="ft:pg" data-sig="${kSig(offNote)}">${offNote}</div>` : ""}
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
  const pgOn = pigeonsOn(), nc = u.newChats === "instant" ? "instant" : "pigeon";
  const seg = (v, label) => `<button type="button" data-act="newchats" data-id="${v}" aria-pressed="${nc === v}">${label}</button>`;
  const pigeonsGroup = `<div class="group pgset mt" data-key="g:pg" data-sig="${pgOn}|${nc}">
      <button type="button" class="cell has-icon" id="pg-switch" role="switch" aria-checked="${pgOn}" data-act="pigeons"><span class="tile orange">${I.bird}</span><span class="ctext"><span>Pigeons</span><span class="csub">Letters that take real time to fly, with the map, birds and streaks</span></span><span class="switch${pgOn ? " on" : ""}" aria-hidden="true"></span></button>
      ${pgOn ? `<div class="cell wayrow"><span class="ctext"><span>New Chats Start As</span></span><span class="wayseg" role="group" aria-label="New chats start as">${seg("instant", "Instant")}${seg("pigeon", "By Pigeon")}</span></div>` : ""}</div>`;
  // (at the hub, Chat's settings open from You, Chat Settings: no tab bar, and back to You)
  return `${navbar("Account", { root: true, left: HUB ? `<button class="nbtn back" data-act="hubyou" aria-label="Back to You">${I.back}<span>You</span></button>` : "" })}
    ${NEW_HOME ? `<div class="group">${cell({ act: "moved", icon: I.globe, tile: "blue", label: "Chat Has Moved", sub: esc(NEW_HOME.replace(/^https?:\/\//, "")), chev: true })}</div>` : ""}
    ${pigeonsGroup}
    ${pgOn ? `<div class="ghead">Today’s Pigeons</div>
    ${((space) => `<div class="group loft">${space.length > 1 ? `<div class="lrow">${earth}</div><div class="lrow space"><span class="lcap">Space</span>${space.join("")}</div>` : `<div class="lrow five">${earth}${space[0]}</div>`}</div>`)(
      [col("orbital", "Orbital", "Orbital"), ...(on("moon") ? [col("lunar", "Lunar", "Lunar"), col("lunarx", "Lunar Express", "Express")] : []), ...(on("mars") ? [col("laser", "Laser", "Laser")] : [])])}
    <div class="gfoot">New ones hatch through the day: 1 rocket, 3 turbo, 9 swift, a mystery and 2 orbital, which go round the Earth.${on("moon") ? " Only lunar pigeons reach the Moon." : ""}${on("mars") ? " Only laser pigeons reach Mars." : ""} Standard pigeons are free and fly on your turn.</div>
    <div class="ghead">Your Loft</div>
    <div class="group">${cell({ act: "birds", icon: I.bird, tile: "orange", label: "Your Pigeons", sub: S.birds.length ? esc(S.birds.map((b) => b.name).join(", ")) : "Name them, and they build careers", chev: true })}
      ${cell({ act: "flightlog", icon: I.dist, tile: "teal", label: "Flight Log", sub: "Miles, passport, badges and looks", chev: true })}
      ${cell({ act: "feathers", icon: I.coin, tile: "yellow", label: "Coots", sub: "Your Coots Coins, for the shop", val: `<span class="fbal">${(S.feathers || 0).toLocaleString("en-GB")}</span>`, chev: true })}</div>
    <div class="ghead">Flying</div>
    <div class="group">${toggleCell({ act: "risky", icon: I.skull, tile: "red", label: "Pigeon Death", on: u.risky })}</div>
    <div class="gfoot">Every pigeon you send flies 1.25× faster, but 1 in 100 never arrives. You won’t know until it happens, and then it’s your turn again.</div>` : ""}
    ${accountPage() ? `<div class="group mt">` : `<div class="ghead">Settings</div>
    <div class="group">${notifyCell(u)}${cell({ act: "securitysheet", icon: I.shield, tile: "green", label: "Privacy &amp; Security", chev: true })}`}
      ${cell({ act: "profile", icon: u.moon ? (worldOf(u) === "mars" ? I.up : I.moon) : I.pin, tile: u.moon ? (worldOf(u) === "mars" ? "red" : "indigo") : "teal", label: "Location", val: esc((u.place || "Not set").replace(/, (the Moon|Mars)$/, "")), chev: true })}
    </div>
    <p class="aver"><button type="button" class="alink" data-act="creditsheet">Map &amp; Weather Data</button></p>
    <div class="gap"></div>`;
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
  if (typingOf(f.id).length) return `<small class="sub ty">typing…</small>`;
  if (!pigeonsOn()) { const s = seenLine(f); return s ? `<small class="sub"><span class="one">${esc(s)}</span></small>` : ""; }
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
const gchatSub = (g) => { if (typingOf(g.id).length) return `<small class="sub ty">typing…</small>`; const n = others(g).map((p) => esc(first(p.name))); return n.length ? `<small class="sub"><span class="one">${n.join(", ")}</span></small>` : ""; };
// The pill in a chat's header (pigeons on): how what you send in it goes, Instant or By Pigeon; tap to change it
const wayPill = (c, g) => { const w = wayOf(c); return `<button type="button" class="nbtn mpill${w === "pigeon" ? " pigeon" : ""}" data-act="waysheet" data-id="${esc(c.id)}" data-way="${w}" aria-label="${g ? "How your messages to the group go" : `How messages to ${esc(first(c.name))} go`}">${w === "pigeon" ? `${I.bird}<span>By Pigeon</span>` : `${I.bolt}<span>Instant</span>`}</button>`; };
// Typing dots at the foot of a chat (before what's still to go), and in a group who it is
function typingHtml(key, g) {
  const ids = typingOf(key); if (!ids.length) return "";
  const nm = (id) => first((g ? member(g, id) : friend(id))?.name || "Someone");
  const say = ids.length === 1 ? `${nm(ids[0])} is typing` : ids.length === 2 ? `${nm(ids[0])} and ${nm(ids[1])} are typing` : `${ids.length} people are typing`;
  return `<div class="typing" data-key="typing" role="status" aria-label="${esc(say)}"><i></i><i></i><i></i></div>${g ? `<div class="typing-who" data-key="typingwho" aria-hidden="true">${esc(say)}</div>` : ""}`;
}
// The time under each run of messages from one side, with your ticks (messages only: letters keep "Landed" and "Read")
const runMeta = (m) => { const mine = m.from === S.me.id, st = mine ? tickState(m) : ""; return `<div class="mt rm${mine ? " me" : ""}" data-key="rm:${esc(m.id)}" data-sig="${st}">${fmtTime(m.sentAt)}${mine ? tickHtml(st) : ""}</div>`; };
// does a run end after msgs[i] (the next is someone else's, not a message, or comes after a gap with its own time)?
const runEnds = (msgs, i) => {
  const m = msgs[i], n = msgs[i + 1]; if (!n) return true;
  const at = (x) => (x.from === S.me.id || x.flying || x.lost ? x.sentAt : x.deliverAt);
  return n.from !== m.from || !n.instant || n.waiting || !sameDay(at(n), at(m)) || at(n) - at(m) > TIME_GAP;
};
// A friend's way changing, as a line in the chat (lines, from GET messages)
function wayLines(f) {
  const nm = esc(first(f.name)), on = pigeonsOn();
  return (S.lines.get(f.id) || []).map((x) => {
    const me = x.by === S.me.id, inst = x.way === "instant";
    const text = me ? (inst ? `Your messages to ${nm} are instant now.` : `Your messages to ${nm} now go by pigeon, unless you choose Now.`)
      : inst ? `${nm}’s messages to you are instant now.` : on ? `${nm}’s messages to you now go by pigeon.` : `${nm}’s messages to you now come as letters, sealed until they arrive.`;
    return { at: x.at, html: `<div class="sysline way" data-key="wl:${esc(x.by)}:${x.at}" role="note">${inst ? I.bolt : I.bird}<span>${text}<span class="t"> · ${fmtTime(x.at)}</span></span></div>` };
  });
}
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
// …said after a verb: "at 14:40" today, else "tomorrow 09:10", "Fri 09:10" (never "at tomorrow")
const atWhen = (ts) => { const w = atTime(ts); return /^\d/.test(w) ? `at ${w}` : w; };
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
// letters say so ("Letter · flew 1h 05m") only in a chat that has messages too: set as the chat is drawn
let ltagOn = false;
// one to three emoji on their own: big, with no bubble
const JUMBO_RE = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*){1,3}$/u;
// a header over each stretch of the chat, as in Messages: "Today 17:24", "Yesterday 10:19", "Mon 13 Oct 09:02"
const TIME_GAP = HOUR;
// (keyed by its place in the chat: a stretch whose first pigeon lands keeps its header, which changes its time)
let tsN = 0;
const stampHtml = (at) => `<div class="stamp" data-key="ts:${tsN++}" data-sig="${at}"><b>${dayLabel(at)}</b></div>`;
// under your latest landed message (one to one): landed, or read, and when
const recallOnly = (m, g) => m.recalled && (!g || m.from !== S.me.id || !flockCount(m).landed);
function recallRun(f, run, g) {
  return `<details class="recall-run" data-key="recalls:${esc(run[0].id)}"><summary>${I.homing}<span>${run.length} messages called back</span></summary><div class="recall-events">${run.map((m) => `<div><time>${dayLabel(m.sentAt)} ${fmtTime(m.sentAt)}</time>${bubble(g ? member(g, m.from) || { name: "Former member" } : f, m, false, g)}</div>`).join("")}</div></details>`;
}
const letterTimeHtml = (m) => `<time class="letter-time${m.from === S.me.id ? " me" : ""}" datetime="${new Date(m.from === S.me.id || m.flying || m.lost ? m.sentAt : m.deliverAt).toISOString()}">${fmtTime(m.from === S.me.id || m.flying || m.lost ? m.sentAt : m.deliverAt)}</time>`;
function statusLine(m) {
  return `<div class="meta me rstat" data-key="st" data-sig="${m.readAt ? "read" : "landed"}">${m.readAt ? `Read ${fmtShort(m.readAt)}` : `Landed ${fmtShort(m.deliverAt)}`}</div>`;
}
function bubble(f, m, gapTop, g) {
  if (m.stopover) return stopCard(f, m);
  const mine = m.from === S.me.id, k = kindOf(m);
  const fresh = S.fresh.has(m.id) ? ` fresh" data-fresh="${esc(m.id)}` : "";
  // (its key, for a redraw: what it is now, and that it comes down to land)
  const st = m.recalled ? "back" : m.lost ? "lost" : m.flying ? "fly" : m.waiting ? "wait" : "in", kk = (sig = st, c = "") => ` data-key="m:${esc(m.id)}${c}" data-sig="${sig}" data-in="land"${m.instant ? ' data-instant="1"' : ""}`;
  const on = pigeonsOn(), who = esc(first(f.name));
  // pigeons off: letters shown simply, with no birds, maps or landing words: when they arrive, sealed until then
  if (!on && !m.instant) {
    if (m.recalled && (!mine || !g || !flockCount(m).landed)) return `<div class="lostnote homing${fresh}"${kk("back")}>${I.homing}<span>${mine ? "You called this letter back." : `${who} called their letter back.`}</span></div>`;
    if (m.lost && (!g || !mine)) return `<div class="lostnote${fresh}"${kk("lost")}>${I.warn}<span>${mine ? `Your letter to ${esc(first(friend(S.chat)?.name || "them"))} didn’t arrive.` : `A letter from ${who} didn’t arrive.`}</span></div>`;
    if (!mine && m.flying) return `<button type="button" class="sealedb${gapTop ? " gap-top" : ""}${fresh}"${kk("fly")} data-act="sealedtap" data-id="${esc(m.id)}" aria-label="A letter from ${who}, sealed until it arrives ${esc(atWhen(m.deliverAt))}">${I.lock}<span><b>A letter from ${who}</b><br>Arrives ${atWhen(m.deliverAt)}. Sealed until then.</span></button>`;
  }
  if (m.recalled && (!mine || !g || !flockCount(m).landed)) return `<div class="lostnote homing${fresh}"${kk("back")}>${I.homing}<span>${mine ? `You called ${g ? "these pigeons" : "this pigeon"} back.` : `${esc(first(f.name))} called their pigeon back.`}</span></div>`;
  if (!mine && m.lost) return `<div class="lostnote${fresh}"${kk("lost")}>${I.skull}<span>${esc(first(f.name))}’s pigeon was lost on the way.</span></div>`;
  if (!mine && m.flying) {
    // sealed until it lands: when, and its pigeon on the way
    const via = m.via ? ` via ${esc(first(friend(m.via)?.name || "a friend"))}` : "";
    return `<button type="button" class="b up sealed fly k-${k}${gapTop ? " gap-top" : ""}${fresh}"${kk("fly")} data-act="map" data-id="${esc(m.id)}" aria-label="${k === "standard" ? "A pigeon" : `A ${KIND[k].name.toLowerCase()} pigeon`} from ${esc(first(f.name))}${via}, sealed until it lands ${esc(atTime(m.deliverAt))}. Watch it on the map.">
      <span class="sl">${I.lock}<b>Sealed letter${via}</b></span><span class="sealed-time">Lands in <span data-eta="${esc(m.deliverAt)}">${esc(fmtDur(m.deliverAt - now()))}</span></span>${airTrack(m)}</button>`;
  }
  const p = S.plain.get(m.id) || { t: "" };
  const quote = p.q ? quoteHtml(p.q, g) : "";
  // a card, a request, an invite or an answer inside it (pigeon/cards.js), drawn under its words
  const cb = !p.p && !p.v && !p.bad ? cardBlock(f, m, p, g) : null;
  const jumbo = !cb && !p.p && !p.v && !p.q && !p.bad && !m.flying && !m.lost && JUMBO_RE.test(p.t || "");
  const text = p.bad ? `<span class="bad-scroll">${p.unchecked ? "Check the new safety number to open this message." : "This message couldn’t be opened on this phone."}</span>` : linked(p.t);
  // yours still to go (a message sent at a time, or with pigeons off, a letter yet to take off): it can be cancelled
  const toGo = mine && m.waiting && (m.instant || !on);
  // tap: your pigeon in the air → its flight (pigeons off, when it arrives); yours still to go → cancel it; anything that's arrived → react, reply or its flight
  const tapAct = toGo ? ` data-act="waitmenu" data-id="${esc(m.id)}" role="button" tabindex="0" aria-haspopup="menu"`
    : mine && m.flying ? ` data-act="${on ? "flymenu" : "lettertap"}" data-id="${esc(m.id)}" role="button" tabindex="0"${on ? ' aria-haspopup="menu"' : ""}`
    : !m.flying && !m.lost && !p.bad ? ` data-act="msgmenu" data-id="${esc(m.id)}" role="button" tabindex="0" aria-haspopup="menu"` : "";
  const up = mine && m.flying && !toGo, foot = toGo ? `<span class="ft">${I.clock}sends ${atShort(m.sentAt)}</span>` : !on && up && !g ? `<span class="ft">${I.clock}arrives ${atTime(m.deliverAt)}</span>` : footHtml(m, mine, g);
  // in the air (one to one): the way so far, then when it lands (pigeons off: when it arrives, no way drawn)
  const tail = up && !g && on ? `<span class="frow">${m.waiting ? "" : airTrack(m)}${foot}</span>` : foot;
  const cls = `${mine ? " me" : ""}${up ? ` up k-${k}` : ""}${m.waiting ? " waiting" : ""}${m.lost ? " lost" : ""}${gapTop ? " gap-top" : ""}${fresh}`;
  // a letter among messages says so (pigeons on, landed: how long it flew; pigeons off: just "Letter", and always on yours still to arrive)
  const lt = !m.instant && !m.lost && ((!on && mine && m.flying) || (ltagOn && (!on || !m.flying))) ? `<span class="ltag">${I.bird}${on ? `Letter · flew ${durPad(Math.max(MIN, m.deliverAt - m.sentAt))}` : "Letter"}</span>` : "";
  // who it's from, for VoiceOver (on screen, which side it's on, and its colour, say so): first in what it reads out
  const by = `<span class="sr">${mine ? "You" : esc(first(f.name))}: </span>`;
  let html;
  if (p.v) {
    const gone = m.photo === 2 || S.photoGone.has(m.id);
    html = `<div class="b voicem${cls}" data-mid="${esc(m.id)}"${kk(gone ? st + ":gone" : st)}${tapAct}>${by}${lt}${quote}${gone ? `<span class="vgone">${I.gone}${picWord(p, m)} expired</span>` : voiceHtml(m.id, p.v, mine, !!m.instant || !pigeonsOn())}${tail}</div>`;
  } else if (onceP(p)) {
    // view once: a pill to tap (theirs), what became of it (yours), the words below
    const gone = picGone(m), seen = (m.flock || []).filter((x) => x.viewedAt).length;
    const opened = mine ? (g ? seen > 0 : !!m.viewedAt) : !!(m.viewedAt || openedOnce(m.id)) && !onceAgain(m);
    const label = mine ? (g && seen ? `Opened by ${seen}` : opened ? "Opened" : gone ? "Photo expired" : "Photo") : opened ? "Opened" : gone ? "Photo expired" : "View photo";
    const can = !mine && !opened && !gone && !m.flying && !m.lost;
    const words = p.t || quote;
    html = can ? `<button type="button" class="b once live${cls}" data-mid="${esc(m.id)}"${kk(`${st}:${label}`)} data-act="viewonce" data-id="${esc(m.id)}" aria-label="${esc(first(f.name))}: View photo, once">${I.once}<b>${label}</b></button>`
      : `<div class="b once${opened || gone ? " done gone" : ""}${cls}" data-mid="${esc(m.id)}"${kk(`${st}:${label}`)}${tapAct}>${by}${I.once}<b>${label}</b>${words ? "" : tail}</div>`;
    if (words) html += `<div class="b ocap${cls}" data-mid="${esc(m.id)}"${kk(st, ":c")}${tapAct}>${by}${lt}${quote}${text}${tail}</div>`;
  } else if (p.p && picGone(m)) {
    // gone: a quiet outline of where it was, the time beside it; its words (if any) in their own bubble below
    const words = p.t || quote;
    html = `<div class="b gone${cls}" data-mid="${esc(m.id)}"${kk(st + ":gone")}${tapAct}>${by}<span class="gonel">${I.gone}${picWord(p)} expired</span>${words ? "" : tail}</div>`;
    if (words) html += `<div class="b ocap${cls}" data-mid="${esc(m.id)}"${kk(st, ":c")}${tapAct}>${by}${quote}${text}${tail}</div>`;
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
  } else if (cb) html = `<div class="b withcard${cls}" data-mid="${esc(m.id)}"${kk(`${st}:c${cb.sig}`)}${tapAct}>${by}${lt}${quote}${p.t ? text : ""}${cb.html}${tail}</div>`;
  else html = `<div class="b${jumbo && !lt ? " jumbo" : ""}${cls}" data-mid="${esc(m.id)}"${kk(st + (p.bad ? ":bad" : ""))}${tapAct}>${by}${lt}${quote}${text}${tail}</div>`;
  // a line added by the friend it stopped with on the way
  if (m.via && !mine && S.notes.get(m.id)) html += `<div class="vianote" data-key="vn:${esc(m.id)}"><b>${esc(first(friend(m.via)?.name || "A friend"))} added</b><span>${esc(S.notes.get(m.id))}</span></div>`;
  html += reactsHtml(m, mine);
  html += postmarkHtml(m, mine);
  const meta = [];
  if (g && mine && !m.instant) {
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
  const text = p && !p.bad ? `<p class="stext">${linked(p.t)}${p.ph ? `<span class="hid">${I.photo} A photo only ${toName} can see</span>` : ""}</p>` : p?.bad ? `<p class="stext bad-scroll">This message couldn’t be opened on this phone.</p>` : "";
  const line = S.notes.get(m.id);
  const add = line != null ? `<p class="smine"><b>You added</b>${esc(line)}</p>` : m.resting && to ? `<button type="button" class="btn small" data-act="vianote" data-id="${esc(m.id)}">${I.compose}Add a Line for ${toName}</button>` : "";
  return `<div class="stopcard${fresh}" data-mid="${esc(m.id)}"${kk(`${t < m.viaAt ? "a" : t < m.viaOff ? "r" : "d"}${line != null ? "+" : ""}`)}><span class="st1">${pgm(m)}<span>${state}</span></span>${text}${add}</div>`;
}
const shareable = (m) => !!((m?.route || m?.moon) && !m.flock && !m.lost && !m.recalled && m.km != null && m.deliverAt <= now());
const shareNamePref = () => { try { return localStorage.getItem("inflight-share-name") !== "0"; } catch (_) { return true; } };
let shareUrls = [];
function openShare(id) {
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id);
  if (!shareable(m)) return;
  shareUrls.forEach((u) => URL.revokeObjectURL(u)); shareUrls = [];
  S.sheet = { type: "shareflight", id, chat: S.chat, fmt: "postcard", name: shareNamePref(), urls: {}, blobs: {} };
  renderSheet(); shareRender(S.sheet);
}
const shareRender = viaLater("shareRender");
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
  if (!m.postmarks?.length || m.flying || m.lost || !pigeonsOn()) return "";
  return `<div class="pmarks${mine ? " me" : ""}" data-key="pm:${esc(m.id)}">${m.postmarks.map((pm) => `<button type="button" class="pmark pm-${esc(pm.kind)}" data-act="pmarkinfo" data-id="${esc(m.id)}:${esc(pm.id)}"
      aria-label="Postmark: flew past ${esc(pm.name)}">${pmSeal(pm)}<span class="pmt"><b>${esc(pmName(pm.name))}</b><small>${pmDay(pm.at)}</small></span></button>`).join("")}</div>`;
}
/* ---------- the passport, as a passport ----------
   A book: a photo page (you, and how far your pigeons have flown), then visa
   pages that fill up with rubber stamps in the order your pigeons flew, a
   journey at a time: each country in its own ink with its outline inside
   (pigeon/shapes.js, loaded when the passport opens), each sea crossed, and
   "Arrived by sea" for a journey that came by ship. Swipe to turn the page. */
let SHAPES = null;
const shapesLoad = () => (SHAPES ? Promise.resolve(SHAPES) : import("./shapes.js").then((m) => (SHAPES = m.SHAPES)).catch(() => (SHAPES = {})));
const openPassport = viaLater("openPassport");
/* ---------- Coots: the bank, and its Coots Coins (called feathers in the code and the database) ---------- */
async function walletData() { try { const r = await api("feathers"); S.feathers = r.feathers; return r; } catch (err) { if (S.sheet?.type === "feathers") S.sheet.err = err.message; else toast(esc(err.message)); return null; } }
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

/* ---------- replies and reactions ---------- */
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const chatName = (id, g) => (id === S.me.id ? "You" : first((g ? member(g, id) : friend(id))?.name || "Someone"));
// A quote shows what was really said: the original, when it's on this phone
// (its sender and words, not what the reply claims), else the reply's copy.
function quoteHtml(q, g) {
  const o = (S.msgs.get(S.chat) || []).find((x) => x.id === q.id), op = o && S.plain.get(o.id);
  if (o && op && !op.bad) q = { id: q.id, from: o.from, t: String(op.t || "").replace(/\s+/g, " ").slice(0, 90), p: op.v ? "voice" : op.p ? (op.p.m === "image/gif" ? "gif" : "photo") : "" };
  else q = { id: String(q.id || ""), from: String(q.from || ""), t: String(q.t || "").slice(0, 90), p: ["gif", "voice", "photo"].includes(q.p) ? q.p : "" };
  return `<button type="button" class="quote" data-act="jumpto" data-id="${esc(q.id)}"><b>${esc(chatName(q.from, g))}</b><span>${q.p ? `${q.p === "gif" ? "GIF" : q.p === "voice" ? (o?.instant || !pigeonsOn() ? "Voice message" : "Voice pigeon") : "Photo"}${q.t ? ": " : ""}` : ""}${esc(q.t || "")}</span></button>`;
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
  const flight = pigeonsOn() && m && !m.instant && !m.flying && !m.lost && (m.route || m.moon || m.flock?.some((x) => x.route || x.moon));
  const words = m && S.plain.get(id)?.t;
  // (each web address in it, to open: also what VoiceOver reaches them by, as a bubble's links are part of its button)
  const links = typeof words === "string" ? linksIn(words).slice(0, 3) : [];
  // a card in it, sent on to a friend: your own of any kind, a friend's only if it's public (cards.js canForward)
  const pc = m && !m.flying && !m.lost ? partsOf(S.plain.get(id))?.card : null;
  let fwd = false; try { fwd = !!pc && canForward(pc, { mine: m.from === S.me.id }); } catch (_) {}
  // (its reactions and its times at its head, there as it's placed, so it's placed whole)
  let head = `<div class="rrow" role="none">${REACTIONS.map((e) => `<button type="button" class="${e === cur ? "on" : ""}" data-act="react" data-id="${esc(id)}" data-e="${esc(e)}" role="menuitem" aria-label="React ${esc(e)}">${e}</button>`).join("")}</div>`;
  if (m) {
    const g = group(S.chat), mine = m.from === S.me.id, bits = [`Sent ${fmtShort(m.sentAt)}`];
    // (a message: sent, delivered, read; a letter: sent, landed, read)
    if (m.instant) { if (mine && !g && (m.delivered || m.readAt)) bits.push(m.gotAt ? `Delivered ${fmtShort(m.gotAt)}` : "Delivered"); }
    else if (!m.flying && !m.lost) bits.push(`${g && mine ? "First landed" : "Landed"} ${fmtShort(g && mine ? Math.min(...(m.flock || [{ deliverAt: m.deliverAt }]).map((x) => x.deliverAt || Infinity)) : m.deliverAt)}`);
    if (mine && !g && m.readAt) bits.push(`Read ${fmtShort(m.readAt)}`);
    head += `<div class="mtime" role="none">${bits.join(" · ")}</div>`;
  }
  openMenu(anchor, [{ label: "Reply", icon: I.reply, act: "reply", id },
    ...(fwd ? [{ label: "Send to a Friend", icon: I.share, act: "cardfwd", id }] : []),
    ...(typeof words === "string" && words.trim() ? [{ label: "Copy", icon: I.copy, act: "copymsg", id }] : []),
    ...links.map((u) => ({ label: "Open Link", sub: new URL(u).hostname.replace(/^www\./, ""), icon: I.globe, act: "openlink", id: u })),
    ...(flight ? [{ label: m.moon ? "Show the Trip" : "Show the Flight", sub: [m.km != null && !m.flock ? fmtMiles(m.km) : "", KIND[kindOf(m)].name, m.bird ? m.bird.name : ""].filter(Boolean).join(" · "), icon: m.moon ? I.moon : I.map, act: "map", id }] : [])], head);
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
// feathers buy accessories for your named pigeons: [id, name, emoji]
const WEAR = { satchel: ["Satchel", "👜"], daisy: ["Daisy", "🌼"], ribbon: ["Ribbon", "🎀"], scarf: ["Scarf", "🧣"], goggles: ["Goggles", "🥽"], shades: ["Sunglasses", "🕶️"], tophat: ["Top Hat", "🎩"], crown: ["Crown", "👑"] };
const wearOn = (w) => (w && WEAR[w] ? `<i class="wear" aria-hidden="true">${WEAR[w][1]}</i>` : "");
const aRank = (r) => `${/^[AEIOU]/.test(r) ? "an" : "a"} ${r}`;
const birdReady = (b) => b.state === "ready" || (b.state === "resting" && now() >= (b.busyUntil || 0));
function birdFor() {
  if (S.birdPick === "none" || !S.birds.length) return null;
  const ready = S.birds.filter(birdReady);
  return ready.find((b) => b.id === S.birdPick) || [...ready].sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0))[0] || null;
}
// at the top of a chat whose messages disappear
const vanishLine = (v) => (v?.ms ? `<div class="sysline vanishline" data-key="vl" data-sig="${v.ms}" role="note">${I.clock}Messages disappear ${vanishSay(v.ms)} after they’re read ${orLand()}${v.by ? ` · set by ${v.by === S.me.id ? "you" : esc(first(personById(v.by)?.name || "a friend"))}` : ""}</div>` : "");
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
    else if (e.kind === "vanish") text = Number(e.name) ? `${by} set messages to disappear ${vanishSay(Number(e.name))} after they’re read ${orLand()}` : `${by} turned off disappearing messages`;
    // a member's way for what they send to the group (functions/_groups.js "way")
    else if (e.kind === "way") {
      const me = e.by?.id === S.me.id, inst = e.name === "instant";
      text = me ? (inst ? "Your messages to the group are instant now." : "Your messages to the group now go by pigeon.")
        : `${first(personById(e.by?.id)?.name || e.by?.name || "Someone")}’s messages to the group ${inst ? "are instant now." : "now go by pigeon."}`;
      out += `<div class="sysline way" data-key="ge:${e.at}:way:${esc(e.by?.id || "")}" role="note">${inst ? I.bolt : I.bird}<span>${esc(text)}<span class="t"> · ${fmtTime(e.at)}</span></span></div>`;
      continue;
    }
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
  const on = pigeonsOn(); ltagOn = (msgs || []).some((m) => m.instant);
  const stl = on ? stampLines(msgs).sort((a, b) => a.at - b.at) : []; let si = 0;
  const stampsTo = (at) => { let h = ""; while (si < stl.length && stl[si].at <= at) h += stl[si++].html; return h; };
  // the group's changes up to a moment, as lines
  const evsTo = (at) => { const k = ev; while (ev < evs.length && evs[ev].at <= at) ev++; return ev > k ? geventLines(evs.slice(k, ev)) : ""; };
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length && (S.outbox.some((o) => o.to === g.id) || S.pending?.to === g.id)) body = "";
  else if (!msgs.length) body = `${evsTo(Infinity)}<p class="empty" data-key="empty"><b>Say hello</b>${on && wayOf(g) === "pigeon" ? `Each message flies to everyone in ${esc(g.name)} at once: one pigeon each, over the real distance to each of them.` : "Messages to the group are end-to-end encrypted."}</p>`;
  const landed = (msgs || []).filter((m) => m.from === S.me.id && !m.flying && !m.lost && !m.waiting && !m.recalled);
  quietMeta = new Set(landed.slice(0, -1).map((m) => m.id));
  if (msgs?.length) for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], mine = m.from === S.me.id, at = mine || m.flying || m.lost ? m.sentAt : m.deliverAt;
    if (!sameDay(at, lastAt)) { body += stampHtml(at); prevFrom = null; }
    lastAt = at;
    const lines = evsTo(at) + stampsTo(at); if (lines) { body += lines; prevFrom = null; }
    // pigeons still flying to you, one after another: one card between them
    if (recallOnly(m, g)) {
      let end = i + 1;
      while (end < msgs.length && recallOnly(msgs[end], g) && (!evs[ev] || evs[ev].at > msgs[end].sentAt) && (!stl[si] || stl[si].at > msgs[end].sentAt)) end++;
      if (end - i > 1) { body += recallRun({ name: g.name }, msgs.slice(i, end), g); lastAt = msgs[end - 1].sentAt; i = end - 1; prevFrom = null; continue; }
    }
    let j = i; while (on && j < msgs.length && inbound(msgs[j])) j++;
    if (j - i >= 2) { body += flyRun(msgs.slice(i, j), g); i = j - 1; prevFrom = null; continue; }
    const who = member(g, m.from) || { id: m.from, name: "Former member" };
    if (!mine && prevFrom !== m.from && !m.lost) body += `<div class="who" data-key="wh:${esc(m.id)}">${avatar(who, "xs")}<span>${esc(first(who.name))}</span></div>`;
    body += bubble(who, m, prevFrom !== null && prevFrom !== m.from && (mine || m.lost), g);
    if (m.instant && !m.waiting && runEnds(msgs, i)) { body += runMeta(m); prevFrom = null; continue; }
    if (!m.instant && !m.recalled) body += letterTimeHtml(m);
    prevFrom = m.from;
  }
  if (msgs?.length) body += evsTo(Infinity) + stampsTo(Infinity);
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && (m.route || m.flock?.some((x) => x.route)));
  const changed = others(g).filter((p) => p.keyChanged);
  const gh = (g.ghosts || []).map((id) => member(g, id)).filter(Boolean);
  const ghostWarn = gh.length ? `<div class="warn" data-key="warn:g"><span>${gh.map((p) => esc(first(p.name))).join(" and ")} ${gh.length > 1 ? "are" : "is"} now in this group, but no one was seen adding them. If that’s unexpected, don’t send anything private and check with the group.</span></div>` : "";
  const warn = myKeyWarn() + ghostWarn + (changed.length ? `<div class="warn" data-key="warn:k"><span>${changed.map((p) => esc(first(p.name))).join(" and ")}’s security key changed. This happens when someone makes a new account or resets their password. Check before you send anything private.</span><button class="btn small" data-act="safety" data-id="${esc(changed[0].id)}">Check</button></div>` : "");
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", S.backTo || "messages")}</div>
      <button class="chatwho" data-act="groupinfo" data-id="${esc(g.id)}" aria-label="${esc(g.name)}: details">${gavatar(g, "s")}<span class="wt"><span class="nm"><span>${esc(g.name)}</span>${I.chev}</span>${gchatSub(g)}</span></button>
      <div class="nb-right">${on ? wayPill(g, true) : ""}${on && flying ? nbtn("map", I.map, "Watch the pigeons", `data-id="${esc(flying.id)}"`) : ""}${nbtn("groupmenu", I.more, "More")}</div>
    </div>
    <h1 class="sr">${esc(g.name)}</h1>${warn}${(liveSoon(g.id), "")}<div class="msgs">${vanishLine(g.vanish)}${body}${typingHtml(g.id, g)}${outboxBubbles(g.id)}</div>`;
}
function vChat() {
  if (group(S.chat)) return vGroupChat(group(S.chat));
  const f = friend(S.chat);
  if (!f) return `${navbar("", { left: backBtn("tab", S.backTo || "messages"), solid: true })}<p class="empty"><b>Not in your friends</b>This person isn’t in your friends any more.</p>`;
  const msgs = S.msgs.get(f.id);
  let body = "", lastAt = 0, prevFrom = null; runN = tsN = 0;
  const on = pigeonsOn(); ltagOn = (msgs || []).some((m) => m.instant);
  const lastLanded = [...(msgs || [])].reverse().find((m) => m.from === S.me.id && !m.flying && !m.lost && !m.waiting && !m.recalled)?.id;
  // (mid-air moments, flyovers and passport lines are the pigeons'; a change of way is anyone's)
  const moms = [...(on ? [...chatMoments(msgs, f.id), ...flyLines(f)] : []), ...wayLines(f)].sort((a, b) => a.at - b.at); let mo = 0;
  const momsTo = (at) => { const h = []; while (mo < moms.length && moms[mo].at <= at) h.push(moms[mo++]); return momRun(h); };
  if (!msgs) body = `<p class="empty">Opening your messages…</p>`;
  else if (!msgs.length && (S.outbox.some((o) => o.to === f.id) || S.pending?.to === f.id)) body = "";
  else if (!msgs.length) body = `${momsTo(Infinity)}<p class="empty" data-key="empty"><b>Say hello</b>Messages to ${esc(first(f.name))} are end-to-end encrypted${on && wayOf(f) === "pigeon" ? " and fly the real distance between you" : ""}.</p>`;
  else for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], at = m.from === S.me.id || m.flying || m.lost ? m.sentAt : m.deliverAt;
    if (!sameDay(at, lastAt)) { body += stampHtml(at); prevFrom = null; }
    lastAt = at;
    const ml = momsTo(at); if (ml) { body += ml; prevFrom = null; }
    if (recallOnly(m, null)) {
      let end = i + 1;
      while (end < msgs.length && recallOnly(msgs[end], null) && (!moms[mo] || moms[mo].at > msgs[end].sentAt)) end++;
      if (end - i > 1) { body += recallRun(f, msgs.slice(i, end), null); lastAt = msgs[end - 1].sentAt; i = end - 1; prevFrom = null; continue; }
    }
    let j = i; while (on && j < msgs.length && inbound(msgs[j])) j++;
    if (j - i >= 2) { body += flyRun(msgs.slice(i, j), null); i = j - 1; prevFrom = null; continue; }
    body += bubble(f, m, prevFrom !== null && prevFrom !== m.from);
    if (m.instant && !m.waiting && runEnds(msgs, i)) { body += runMeta(m); prevFrom = null; continue; }
    if (!m.instant && !m.recalled) body += letterTimeHtml(m);
    if (m.id === lastLanded && !m.instant) body += statusLine(m);
    prevFrom = m.from;
  }
  if (msgs?.length) body += momsTo(Infinity);
  // a pigeon in the air either way: the map button sits beside the menu
  const flying = msgs && [...msgs].reverse().find((m) => m.flying && !m.waiting && m.route);
  const warn = f.keyChanged ? `<div class="warn${wasVerified(f) ? " strong" : ""}" data-key="warn:k"><span>${wasVerified(f) ? `You verified ${esc(first(f.name))} in person, and their security key has changed since. Verify again, together, before you send anything.` : `${esc(first(f.name))}’s security key changed. This happens when they make a new account or reset their password. Compare safety numbers before you send anything private.`}</span><button class="btn small" data-act="safety" data-id="${esc(f.id)}">Check</button></div>` : "";
  return `<div class="navbar solid chatnav">
      <div class="nb-left">${backBtn("tab", S.backTo || "messages")}</div>
      <button class="chatwho" data-act="friendinfo" data-id="${esc(f.id)}" aria-label="${esc(f.name)}: details">${avatar(f, "s", true)}<span class="wt"><span class="nm"><span>${esc(first(f.name))}</span>${I.chev}</span>${chatSub(f)}</span></button>
      <div class="nb-right">${on ? wayPill(f) : ""}${on && flying ? nbtn("map", I.map, "Watch the pigeon", `data-id="${esc(flying.id)}"`) : ""}${nbtn("chatmenu", I.more, "More")}</div>
    </div>
    <h1 class="sr">Chat with ${esc(first(f.name))}</h1>${myKeyWarn()}${warn}${(liveSoon(f.id), "")}<div class="msgs">${vanishLine(f.vanish)}${body}${typingHtml(f.id)}${outboxBubbles(f.id)}</div>`;
}
const ferr = `<p class="gfoot bad ferr" role="alert" hidden></p>`;
function vAuth() {
  switch (S.view) {
    case "loading": return `<div class="loading">Opening Chat…</div>`;
    case "welcome": return `<div class="auth welcome night ifl-in${S.welcomed ? " again" : ""}">
        <div class="wtop ifl-top">
          <div class="wlogo ifl-logo"><span class="appicon" aria-hidden="true">${I.bird}</span></div>
          <h1 class="wtitle ifl-title" aria-label="Chat">${[..."Chat"].map((c) => `<span aria-hidden="true">${c}</span>`).join("")}</h1>
          ${S.ended ? `<p class="winvite">You’ve been signed out, as this sign-in was ended on another device or by a new password.${S.ended.waiting ? ` Sign in again and ${S.ended.waiting === 1 ? "the pigeon" : `the ${S.ended.waiting} pigeons`} waiting for signal will still go.` : ""}</p>` : ""}
          ${S.pendingAdd ? `<p class="winvite">@${esc(S.pendingAdd)} asked you to join. Sign in or make your account, and their request is ready to send.</p>` : ""}
        </div>
        ${welcomeCta()}</div>`;
    case "locpick": return `<div class="auth">${navbar("")}
        <h1 class="large">Where are you?</h1>
        <p class="sub">${pigeonsOn() ? "Pigeons fly from here, so it sets how long your messages take." : "Friends see your town and local time, and letters sent to you by pigeon fly here."} It’s rounded to about a mile, and only your friends see it.</p>
        ${S.me?.place ? `<div class="group mt">${cell({ icon: I.check, tile: "green", label: esc(S.me.place), sub: "Your location" })}</div>` : ""}
        <div class="stack locfirst"><button class="btn wide" data-act="locate">${I.loc}${S.me?.place ? "Use my location again" : "Use my location"}</button></div>
        <div class="group">
          <label class="cell has-icon"><span class="tile gray">${I.map}</span><span class="ctext"><span>Choose a city instead</span></span>${chevSm}
            <select class="overlay" data-act="city" id="city" aria-label="Choose a city">${cityOptions()}</select></label>
          ${toggleCell({ act: "onbauto", icon: I.loc, tile: "green", label: "Keep it up to date", sub: pigeonsOn() ? "While Chat is open, so pigeons find you" : "While Chat is open", on: S.onbAuto !== false })}
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
// Paid pigeons you have, fastest last: what a scheduled pigeon can be
const schedKind = () => (["swift", "turbo", "rocket"].includes(S.pick) && (S.me[S.pick] || 0) > 0 ? S.pick : ["swift", "turbo", "rocket"].find((k) => (S.me[k] || 0) > 0) || null);
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
let planSoon = 0, planFor = "", saidErr = "";
function renderCompose() {
  const show = S.view === "chat" && !!S.chat && !!(friend(S.chat) || group(S.chat)) && !!S.me;
  $compose.hidden = !show; if (!show) { composeH = 0; return; }
  const c = composeState(), { g, f, dumb, sched, via, kind } = c;
  const note = $(".note", $compose), btn = $(".send", $compose), pill = $(".kind", $compose);
  const cw = S.cardWait && S.cardWait.chat === S.chat ? S.cardWait.card : null;     // (a card waiting to go with it: Send to a Friend)
  // the next message goes now (a message, there at once) or by pigeon (a letter): pigeons off, always now
  const on = pigeonsOn(), quick = nextOf(S.chat) === "now";
  const has = (quick ? $ta.value : dumb ?? $ta.value).trim() || S.attach || cw;
  S.sendKind = kind;
  // (the button that switches it, pigeons on: "Now" as a pill, or a round bolt beside the pigeon; drawn again only when it changes, as this runs every second)
  const mode = $(".mode", $compose), mk = on ? (quick ? "now" : "pigeon") : "";
  mode.hidden = !on;
  if (mode.dataset.k !== mk) {
    mode.dataset.k = mk; mode.dataset.next = quick ? "now" : "pigeon"; mode.classList.toggle("round", !quick);
    mode.innerHTML = quick ? `${I.bolt}<span>Now</span>` : I.bolt;
    mode.setAttribute("aria-label", quick ? "Next message goes now: send it by pigeon instead" : "Send this one now instead");
  }
  const hatch = () => fmtDur(Math.min(...["swiftNextAt", "turboNextAt", "rocketNextAt"].map((x) => S.me[x] || Infinity)) - now());
  let stop = "", blocked = true;
  if (f.keyChanged) stop = "Check the new safety number before sending.";
  else if (quick) blocked = false;            // (a message needs no location, turn, loft or time: only the key)
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
  if (S.err && S.err !== saidErr) announce(S.err);       // (what went wrong is said once; the rest, why it can't go yet, is only shown)
  saidErr = S.err;
  // its pigeon, at the start of the message: the named one carrying it, or its kind
  // (a moment after a chat opens, the planner's times, so the hint says what How It Flies will)
  const planKey = !quick && !g && !via && !sched && kind && KIND[kind] && !SPACE_KINDS.includes(kind) && f.lat != null && S.me.lat != null && !(S.routePlan?.key === f.id + ":" + (birdFor()?.id || "") && now() - S.routePlan.at < PLAN_KEEP) ? f.id + ":" + kind : "";
  if (planKey !== planFor) { clearTimeout(planSoon); planSoon = 0; planFor = planKey; }
  if (planKey && !planSoon) planSoon = setTimeout(() => { planSoon = -1; if (S.chat === f.id && S.view === "chat") routePlanFor(f.id, kind); }, 1200);   // (-1: asked, once, until the chat or pigeon changes)
  const here = S.me.lat != null || !!S.me.moon;
  const bd = kind && kind !== "dumb" && !SPACE_KINDS.includes(kind) ? birdFor() : null, hint = !quick && kind && !f.keyChanged && here ? landHint(c, kind) : "Message";
  pill.hidden = quick || !!f.keyChanged || !here;
  pill.classList.toggle("pigeon", !quick);
  pill.disabled = dumb != null;
  const pk = JSON.stringify([kind, bd?.id, bd?.name, bd?.wear, !!sched, !!via, S.me.skin]);
  if (pill.dataset.k !== pk) {
    pill.dataset.k = pk; pill.classList.toggle("named", !!bd);
    pill.innerHTML = `${kind ? `<span class="pgw">${pg(kind, S.me.skin)}${wearOn(bd?.wear)}</span>` : `<span class="pg none" aria-hidden="true">${I.bird}</span>`}<span class="kl">${esc(!kind ? "None" : bd ? bd.name : KIND[kind].name)}</span>${sched ? I.clock : via ? I.people : ""}${I.chev}`;
  }
  pill.setAttribute("aria-label", `${kind ? `${KIND[kind].name} pigeon${bd ? `, carried by ${bd.name}` : ""}${kind === "dumb" ? "" : `. ${hint}`}` : "No pigeon can fly yet"}. How it flies`);
  if ($ta.placeholder !== hint) { $ta.placeholder = hint; if (!$ta.value) fitTa(); }
  // the weather along the way, for a pigeon about to leave now (one to one)
  const wp = $(".wxplan", $compose), plan = !quick && !g && !c.moon && !blocked && !S.err && !sched && !via && kind && kind !== "dumb" && kind !== "mystery" && kind !== "orbital" && f.lat != null && S.me.lat != null;
  if (plan) planWx(f.id);
  const adv = plan ? wxAdvice(f, kind) : null, wk = adv ? JSON.stringify([adv, kind]) : "";
  if (wp.dataset.k !== wk) { wp.dataset.k = wk; wp.hidden = !adv; wp.classList.toggle("early", !!adv?.early); wp.innerHTML = adv ? wxPlanHtml(adv, kind) : ""; }
  btn.disabled = blocked || !has || S.busy;
  btn.classList.toggle("busy", !!S.busy);               // (a spinner in it, while what you sent goes up)
  // (now: an arrow, in blue; by pigeon: the bird, in the pigeons' orange)
  const bk = quick ? "now" : "pigeon";
  if (btn.dataset.k !== bk) { btn.dataset.k = bk; btn.classList.toggle("pigeon", !quick); btn.innerHTML = quick ? I.up : I.bird; btn.setAttribute("aria-label", quick ? "Send" : "Send by pigeon"); }
  // nothing typed: the send button becomes a microphone (voice messages)
  const mic = $(".mic", $compose), showMic = !has && !blocked && voiceOK() && (quick || dumb == null);
  mic.hidden = !showMic || !!S.busy; btn.hidden = showMic && !S.busy; mic.disabled = !!S.busy;
  const ml = quick ? "Record a voice message" : "Record a voice pigeon";
  if (mic.getAttribute("aria-label") !== ml) { mic.setAttribute("aria-label", ml); $(".recbar", $compose)?.setAttribute("aria-label", quick ? "Recording a voice message" : "Recording a voice pigeon"); $(".recsend", $compose)?.setAttribute("aria-label", quick ? "Send voice message" : "Send voice pigeon"); }
  // you can always delete a /dumb that can't fly; and the box you're typing in is never switched off under you
  // (iOS puts the keyboard away the moment a focused field is disabled; Send stays off instead)
  const off = blocked && !S.err && (quick || dumb == null);
  if (!off || document.activeElement !== $ta) $ta.disabled = off;
  const rb = $(".replybar", $compose), rt = S.replyTo && S.replyTo.chat === S.chat ? S.replyTo : null;
  rb.hidden = !rt;
  if (rt && rb.dataset.for !== rt.id) {
    rb.dataset.for = rt.id;
    const ro = (S.msgs.get(S.chat) || []).find((x) => x.id === rt.id);
    rb.innerHTML = `${I.reply}<span class="rtext"><b>Replying to ${esc(chatName(rt.from, g))}</b><span>${rt.p ? (rt.p === "gif" ? "GIF" : rt.p === "voice" ? (ro?.instant || !on ? "Voice message" : "Voice pigeon") : "Photo") + (rt.t ? ": " : "") : ""}${esc(rt.t)}</span></span><button type="button" data-act="unreply" aria-label="Cancel reply">${I.x}</button>`;
  }
  if (!rt && rb.dataset.for) { rb.dataset.for = ""; rb.innerHTML = ""; }
  const a = $(".attach", $compose);
  a.hidden = !S.attach;
  if (S.attach?.voice && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<span class="vthumb">${I.mic}</span><span class="ainfo"><b>Voice · ${fmtClip(S.attach.ms)}</b><span class="atext">${attachText()}</span><i class="upbar" aria-hidden="true"><b></b></i></span><button type="button" data-act="unattach" aria-label="Remove voice pigeon">${I.x}</button>`;
  } else if (S.attach && a.dataset.for !== S.attach.preview) {
    a.dataset.for = S.attach.preview;
    a.innerHTML = `<img src="${S.attach.preview}" alt=""><span class="ainfo"><b>${S.attach.gif ? "GIF" : "Photo"}</b><span class="atext">${attachText()}</span><i class="upbar" aria-hidden="true"><b></b></i></span><button type="button" data-act="unattach" aria-label="Remove photo">${I.x}</button>`;
  }
  if (!S.attach && a.dataset.for) { a.dataset.for = ""; a.innerHTML = ""; }
  // a card waiting to go with what's written (from Send to a Friend), above the message box like a photo, with its ✕
  let ca = $(".cardatt", $compose);
  if (!ca) { ca = document.createElement("div"); ca.className = "cardatt"; ca.hidden = true; a.before(ca); }
  const ck = cw ? kSig(JSON.stringify(cw)) : "";
  if (ca.dataset.k !== ck) {
    ca.dataset.k = ck; ca.hidden = !cw;
    ca.innerHTML = cw ? `<span class="cthumb" aria-hidden="true">${I.share}</span><span class="ainfo"><b>${esc(cardLabel(cw))}</b><span class="atext">${esc(cw.say || "")}</span></span><button type="button" data-act="cardrm" aria-label="Remove the card">${I.x}</button>` : "";
  }
  composeGlide();
}
const TABS = [["messages", "Messages", "bubble"], ["friends", "Friends", "people"], ["account", "Account", "person"]];
// At the hub: the hub's tab bar (IFL.hub.tabs, Today · Chats · Apps · You) in place of Chat's own, at the foot, Chats
// chosen; shown or put away as Chat's own would be
let $hubtabs = null;
function hubTabs(on) {
  if (!HUB || ENGINE || !root()) return;
  if (!$hubtabs || !$hubtabs.isConnected) { $hubtabs = document.createElement("nav"); $hubtabs.className = "hubtabs"; root().append($hubtabs); IFL.hub.tabs($hubtabs, "chats"); }
  $hubtabs.hidden = !on;
}
// Built once and then updated, so the highlight can slide between tabs.
function renderTabs() {
  const unread = [...S.friends, ...S.groups].reduce((n, f) => n + (f.unread || 0), 0);
  if (HUB) { document.title = unread ? `(${unread}) Chats` : "Chats"; return; }
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
/* ---------- Add Friend: look them up as you type ---------- */
const myLink = () => `${NEW_HOME ? NEW_HOME + "/" : location.origin + "/pigeon/"}#add=${S.me.handle}`;
/* ---------- later.js: what's only needed after the first screen ----------
   Every sheet (renderSheet, drawSheet), the maps, a pigeon's flight card and Look Up, the share pictures and the
   passport, Send to a Friend, and the taps, fields and forms only those have (sheetClick, sheetInput, sheetSubmit), are
   in later.js: loaded the first time one is wanted, and at the first quiet moment once Chat is up (start), so a tap
   seldom waits for it and Chat's worker has a copy for opening with no signal. It imports nothing of this file: load()
   is given what it uses of it (laterKit), and hands back what this file calls of it (LATER). */
let LATER = null, laterP = null;
function later() {
  return (laterP ||= import("./later.js").then((m) => (LATER = m.load(laterKit())), (err) => { laterP = null; throw err; }));
}
// (one of later.js's, called from here: at once once it's here, else as soon as it is)
function viaLater(name) { return (...a) => (LATER ? LATER[name](...a) : later().then((L) => L[name](...a))); }
// (at the first quiet moment: the screen's up, and nothing's waiting on the network for it)
const laterSoon = () => { const go = () => later().catch(() => {}); window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1500); };
let sheetWaits = false;
function laterKit() {
  return {
    $, $compose, $layer, $ta, $tabbar, $view, BIRD, CHEER_EACH, DAY, DOW, DOW_LONG, ENGINE, HOUR, I, KIND, KINDS,
    LOCK_AFTER, MIN, MON, MY_TZ, NEW_HOME, NO_SIGNAL, OPENED_KEY, PAID, ROUTES, S, SHEET_IN_MS, SHEET_ON_MS,
    SHEET_SLIDE_MS, SKINS, SPACE_KINDS, STILL, STREAK_MIN, THEMES, WAIT_KEY, WEAR, WX, accountPage, airTime, api,
    appOrigin, asSent, atShort, atTime, avatar, backStep, base, birdFor, birdReady, busyBtn, cardLinks, cell, chatKm,
    chatOf, chatRp, cheerable, chevSm, cityOptions, clockIn, clockSay, closePop, closeTop, composeState, cssVar,
    defaultNext, digestMsg, doAct, dropRef, dtf, durPad, durShort, endFor, esc, etaMs, ferr, first, fitOffer, fitTa,
    flightMs, flockCount, fmtDate, fmtDur, fmtLand, fmtMiles, fmtSeen, fmtShort, fmtTime, focusTitle, freeze, friend,
    gavatar, go, group, haptic, hapticsOn, haversineKm, hubParent, isIOS, isOnline, isVerified, keepAdd, keepGlides,
    keepIn, keepSay, keepTheme, keyId, keyOfCard, kindOf, kindPlans, kindsFor, landHint, linkActs, loadChat,
    lockPrefs, look, member, memberKm, moonChat, moonOf, myLink, mySpeed, newsRow, noRef, noShipOn, noteRp, now,
    nowFor, nowHad, nowVal, ofRp, onceAgain, onceMissed, onceP, openAccount, openActions, openFlightLog, openMenu,
    opened, orLand, others, overWhere, pad2, pairFor, partsOf, passkeysSupported, personById, pg, pgm, picGone,
    pigeonsOn, plannedMs, pmDay, pmName, pmSeal, pushState, render, renderCompose, replyUnsure, root, routePlanFor,
    routeStyle, sameDay, savePins, saveTheme, schedFor, schedKind, setAttach, setAutoLocation, setEmailNotify,
    setLockPrefs, setNotify, shapesLoad, shareRef, shareable, showErr, skyRoutes, spaceMs, standalone, stopLocWatch,
    streakLeft, streakOf, streakRisk, switchKey, switchStates, sync, syncInert, theme, themeFade, timeBody, toast,
    toggleCell, trustNewKey, trustedPub, vanishSay, walletData, wasVerified, wayOf, wearOn, whereOnEarth, whoCls,
    whoDots, whoOrder, whoState, withFresh, worldOf, wxAdvice, wxSay, zoomed,
    get sheetFrom() { return sheetFrom; }, set sheetFrom(v) { sheetFrom = v; },
    get lastTap() { return lastTap; },
    get SHAPES() { return SHAPES; },
    get onceOpen() { return onceOpen; }, set onceOpen(v) { onceOpen = v; },
    get shareUrls() { return shareUrls; }
  };
}
function onInput(e) {
  if (e.target.id === "add-h" || e.target.id === "gif-q") return LATER?.sheetInput(e);    // (fields only later.js's sheets have)
  if (e.target.id === "f-sendwords" && S.sheet?.type === "send") { S.sheet.words = e.target.value.slice(0, 500); S.sheet.edited = true; return; }
  if (e.target.id === "f-askwords" && S.sheet?.type === "askback") { S.sheet.words = e.target.value.slice(0, 500); return; }
  if (e.target.id === "msearch") { S.q = e.target.value; filterLists(); }
  if (e.target.id === "fsearch") { S.fq = e.target.value; filterLists(); }
}
// A sheet is still coming up (sliding in, its rows growing) for this long after it opens; the slide itself is the
// first SHEET_SLIDE_MS (styles.css: .sheet)
const SHEET_IN_MS = 1100, SHEET_SLIDE_MS = 500, SHEET_ON_MS = 420;
const gliding = new Map();            // switches mid-glide: key → { from, to, at }
const switchKey = (b) => `${b.dataset.act}:${b.dataset.id || ""}`;
// Redrawing replaces a switch, which would snap it to its end. Note where each
// one was before a redraw, then replay any glide from where it had got to.
const switchStates = (el) => new Map([...el.querySelectorAll("[role=switch]")].map((b) => [switchKey(b), b.getAttribute("aria-checked") === "true"]));
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
// Something closed while it was still coming in (or being dragged) goes away from where it is, not from fully open:
// where it's got to, read off it now, for the exit's keyframes (styles.css: down, fade-out, menu-out)
const freeze = (e) => { const cs = getComputedStyle(e), m = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform); e.style.setProperty("--y0", `${m.m42}px`); e.style.setProperty("--s0", String(m.a)); e.style.setProperty("--o0", cs.opacity); };
// Focus, for anyone moving through the app by keyboard or VoiceOver: a new screen starts at its title, and a sheet
// that closes hands focus back to the row or button it was opened from (or, that gone, the screen's title)
let lastTap = null, sheetFrom = null;
function focusTitle() {
  const h = $view && $(".navbar .nb-title, h1, h2", $view); if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  try { h.focus({ preventScroll: true }); } catch (_) {}
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
  backStep();                    // (Android's Back: a step of history for each, while there's anything to close)
}
// Draws S.sheet, or puts the last one away: later.js's renderSheet. Asked for before later.js is here, the sheet's drawn
// as soon as it is; with no signal and no copy of it kept, it can't open, and says so
function renderSheet(refresh) {
  if (LATER) return LATER.renderSheet(refresh);
  // (none asked for, and none drawn yet: as its renderSheet does with none to put away)
  if (!S.sheet) { syncInert(); root().classList.remove("sheeted"); $layer.innerHTML = ""; return; }
  if (sheetWaits) return;
  sheetWaits = true;
  later().then(() => { sheetWaits = false; LATER.renderSheet(); }, () => {
    sheetWaits = false;
    const s = S.sheet; if (!s) return;
    S.sheet = null; if (s.resolve && !s.done) s.resolve(s.type === "reauth" ? false : null);
    toast(NO_SIGNAL);
  });
}
// (only ever a map sheet's, so later.js's: nothing to tick till it's here)
const tickMap = (every) => LATER?.tickMap(every);
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
const look = { heading: null, pitch: 0, denied: false, raf: 0, tg: null, tgAt: 0, said: "", on: false, stars: null };
function openLook(id) {
  // (an iPhone asks before it shares its compass, and only from a tap: this one)
  const ask = typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";
  const go = () => { S.sheet = { type: "lookup", id, chat: S.chat }; renderSheet(); };
  if (!ask) return go();
  DeviceOrientationEvent.requestPermission().then((r) => { look.denied = r !== "granted"; go(); }, () => { look.denied = true; go(); });
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
function openMenu(anchor, items, head = "") {
  haptic("tick");
  clearTimeout(popTimer);
  const box = root().getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const up = a.top - box.top > box.height * 0.55;
  const right = a.left + a.width / 2 > box.left + box.width / 2;
  $pop.innerHTML = `<div class="menu-scrim" data-act="closepop"></div>
    <div class="menu-pop" role="menu">${head}${items.map((it) =>
      `<button class="mi${it.destructive ? " destructive" : ""}${it.sub ? " two" : ""}" role="menuitem" data-act="${it.act}"${it.id ? ` data-id="${esc(it.id)}"` : ""}><span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span>${it.icon || ""}</button>`).join("")}</div>`;
  const m = $(".menu-pop", $pop);
  // (beside the letter, on the side with room for the whole menu: a tall letter, a card in it, can leave room on
  // neither, and then the menu sits over the letter, held inside the screen, rather than running off its foot)
  const cs = getComputedStyle(root()), lo = box.top + (parseFloat(cs.paddingTop) || 0) + 8, hi = box.bottom - 12, h = m.offsetHeight;
  const below = hi - a.bottom - 6 >= h, above = a.top - 6 - lo >= h;
  const side = up ? (above ? "up" : below ? "down" : "over") : below ? "down" : above ? "up" : "over";
  if (side === "up") m.style.bottom = `${box.bottom - a.top + 6}px`;
  else if (side === "down") m.style.top = `${a.bottom - box.top + 6}px`;
  else { m.style.top = `${Math.max(lo, Math.min(hi - h, a.top + (a.height - h) / 2)) - box.top}px`; if (h > hi - lo) { m.style.maxHeight = `${hi - lo}px`; m.style.overflowY = "auto"; } }
  if (right) m.style.right = `${Math.max(8, box.right - a.right)}px`; else m.style.left = `${Math.max(8, a.left - box.left)}px`;
  m.style.setProperty("--origin", `${side === "up" ? "bottom" : side === "down" ? "top" : "center"} ${right ? "right" : "left"}`);
  popOpened($(".mi", m)); syncInert();
}
function openActions({ title, message, actions }) {
  clearTimeout(popTimer);
  $pop.innerHTML = `<div class="scrim" data-act="closepop"></div><div class="asheet" role="dialog" aria-modal="true" aria-label="${esc(title || "Confirm")}">
    <div class="grp">${title || message ? `<div class="msg" tabindex="-1">${title ? `<b>${esc(title)}</b>` : ""}${esc(message || "")}</div>` : ""}${actions.map((x) =>
      `<button class="ab${x.destructive ? " destructive" : ""}" data-act="${x.act}"${x.id ? ` data-id="${esc(x.id)}"` : ""}>${esc(x.label)}</button>`).join("")}</div>
    <button class="cancel" data-act="closepop">Cancel</button></div>`;
  popOpened($(".asheet .ab", $pop), $(".asheet .msg", $pop)); syncInert();
}
let popTimer = 0, popFrom = null, keyAt = -1e9;
// For a keyboard or VoiceOver: a menu or question opened with Enter or Space starts on its first choice, Up and Down
// (Home, End) move through them, and once it's closed (Escape, or a choice made) focus goes back to what opened it.
// Opened with a tap (VoiceOver's double tap is one), focus goes to it all the same, to the question first if it asks
// one, as what's behind is out of reach now: only the message box keeps it, so the keyboard stays up under a menu
document.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") keyAt = performance.now(); }, true);
document.addEventListener("pointerdown", () => { keyAt = -1e9; }, true);
function popOpened(first, lead) {
  const a = document.activeElement;
  if (a && a !== document.body && !$pop.contains(a)) popFrom = a;
  if (!$pop._keys) { $pop._keys = 1; $pop.addEventListener("keydown", popKeys); }
  if (performance.now() - keyAt < 600) first?.focus({ preventScroll: true });
  else if (!inField(a)) (lead || first)?.focus({ preventScroll: true });
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
// Said to VoiceOver (and the like), with nothing shown: the stages of a send, a pigeon landing in the chat you're in, why
// one couldn't go. (Emptied first, so the same words twice are said twice; nothing's said over the lock)
let $said = null, saidTimer = 0;
function announce(words) {
  if (!$said || S.locked) return;
  clearTimeout(saidTimer); $said.textContent = "";
  saidTimer = setTimeout(() => { $said.textContent = words; }, 80);
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
const ONCE_ACTS = new Set(["noteinstant", "notekeep", "setway", "cancelwait", "acctsignin", "acctjoin", "accept", "declinego", "cancelreq", "unblock", "sessend", "sessothersgo", "confirmsend", "pushtest", "buyitem", "wearon", "birdretirego", "wave", "cheer", "resetkeep", "resetfresh", "planans", "planlater", "asksend", "sendgo", "whenans", "ttsend"]);
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
    // (at the hub: Chat's settings, opened from You, go back to it)
    case "hubyou": return location.assign("/#you");
    case "signinnotnow": { const to = S.notNow; S.notNow = null; return to && location.replace(to); }
    // Search, beside the tabs: Friends' search where you're on Friends, else Messages' (within the tap, so the keyboard comes)
    case "tabsearch": {
      if (S.view !== "friends" && S.view !== "messages") go("messages");
      const f = $(S.view === "friends" ? "#fsearch" : "#msearch", $view);
      if (!f) return toast(S.view === "friends" ? "No friends to search yet." : "No messages to search yet.");
      f.scrollIntoView({ block: "center", behavior: STILL.matches ? "auto" : "smooth" }); f.focus({ preventScroll: true });
      return;
    }
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
    case "seasonhide": case "seasontry": { const s = seasonNow(); try { if (s) localStorage.setItem("inflight-season", s.key); } catch (_) {} render(); if (t.dataset.act === "seasontry") { haptic("tick"); return openFlightLog("skins"); } return; }
    case "bird": S.sheet = { type: "bird", id }; return renderSheet();
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
    case "groupinfo": S.sheet = { type: "groupinfo", id: id || S.sheet?.id || S.chat }; return renderSheet();
    case "groupmenu": {
      const g = group(S.chat); if (!g) return;
      return openMenu(t, [
        { label: "Group Info", icon: I.info, act: "groupinfo", id: g.id },
        { label: "Add People", icon: I.addp, act: "groupadd", id: g.id },
        { label: "Leave Group", icon: I.minusp, act: "groupleaveask", id: g.id, destructive: true },
      ]);
    }
    case "trustm": return trustNewKey(id);
    case "grouprename": S.sheet = { type: "grouprename", id }; return renderSheet();
    case "flightlog": return openFlightLog();
    case "passport": haptic("tick"); return openPassport(id || null);
    case "requests": S.sheet = { type: "requests" }; return renderSheet();
    case "addfriend": S.sheet = { type: "addfriend" }; return renderSheet();
    case "friendinfo": S.sheet = { type: "friendinfo", id: id || S.chat }; return renderSheet();
    case "close":
      if (S.sheet?.type === "askpw") S.sheet.resolve(null);
      // (a card another app sent, not sent from the sheet: it waits above the next chat's message box, as its words did)
      // (the engine's sheet: put away, the card left as it was; Chats' own, opened from another page of the hub: back there)
      if (S.sheet?.type === "send" && S.sheet.engine && !S.sheet.busy) { const en = S.sheet.engine; en.done?.({ ok: false, why: "closed" }); hubParent()?.closed?.(); S.sheet = null; renderSheet(); return; }
      if (S.sheet?.type === "send" && S.sheet.back && !S.sheet.busy) { const b = S.sheet.back; S.sheet = null; renderSheet(); return location.replace(b); }
      if (S.sheet?.type === "send" && S.sheet.link && !S.sheet.busy) { const w = S.sheet.edited ? S.sheet.words.trim() : S.sheet.base; S.cardWait = { chat: null, card: S.sheet.card }; S.share = w && w !== S.sheet.card.say ? w : null; }
      if (S.sheet?.type === "reauth") { const r = S.sheet.resolve; S.sheet = S.sheet.back || null; renderSheet(); return r(false); }
      S.sheet = null; return renderSheet();
    case "closepop": return closePop();
    case "submit": return $("#" + id, $layer)?.requestSubmit();
    case "map": S.sheet = { type: "map", id }; return renderSheet();
    case "skies": S.sheet = { type: "map", id: "skies" }; renderSheet(); return loadSkies();
    case "airopen": haptic("tick"); S.mapNext = t.dataset.m; return go("chat", id);
    case "msgmenu": return openReactMenu(t, id);
    case "cardfwd": return cardFwd(id);
    case "cardrm": S.cardWait = null; return renderCompose();
    case "link": return;                 // (a link in a message: the browser opens it, and the message's menu doesn't)
    case "openlink": { const u = linksIn(id)[0]; if (u) window.open(u, "_blank", "noopener,noreferrer"); return; }
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
    case "view": S.sheet = { type: "view", id }; return renderSheet();
    case "chatmenu": {
      const f = friend(S.chat); if (!f) return;
      return openMenu(t, [
        { label: "Contact Info", icon: I.info, act: "friendinfo", id: f.id },
        { label: "Safety Number", icon: I.shield, act: "safety", id: f.id },
        { label: "Remove Friend", icon: I.minusp, act: "unfriendask", id: f.id, destructive: true },
        { label: "Block", icon: I.block, act: "blockask", id: f.id, destructive: true },
      ]);
    }
    // The +: at the hub, Photo and GIF and the cards that fit this chat, from your apps (openFromApps). Off it, as it
    // was: the phone's own picker already offers Photo Library, Take Photo and Choose File, so straight to it rather
    // than a menu of ours in front of it (or Photo and GIF)
    case "attachmenu":
      if (HUB) { haptic("tick"); return openFromApps(S.chat); }
      if (!S.gifsOn) { haptic("tick"); return $("#file-lib")?.click(); }
      return openMenu(t, [{ label: "Photo", icon: I.photo, act: "pick", id: "file-lib" }, { label: "GIF", icon: `<span class="gifico" aria-hidden="true">GIF</span>`, act: "gifs" }]);
    case "pick": return $("#" + id)?.click();
    case "trust": return trustNewKey(id);
    case "share": return shareHandle();
    case "unattach": if (S.busy) return; return clearAttach();
    case "toast": { hideToast(); const fn = S.toastFn; S.toastFn = null; return fn && fn(); }
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
    case "acctsignin": return toAccountSignIn(e, "signin", { then: S.notNow || S.thenTo });
    case "retrysync": S.syncFails = 0; render(); return sync().then(() => { if (!S.started) render(); });
    case "acctjoin": return toAccountSignIn(e, "join");
    case "signout": {
      const waiting = S.outbox.filter((o) => !o.err).length;
      return openActions({ message: `You’ll need your password or a passkey to sign in again.${waiting ? ` ${waiting === 1 ? "One pigeon is" : `${waiting} pigeons are`} still waiting for signal and won’t be sent.` : ""}`, actions: [{ label: "Sign Out", act: "signoutgo", destructive: true }] });
    }
    case "moved": return movedNote(true);
    case "pigeon": S.pick = id; renderCompose(); if (S.sheet?.type === "flysheet") renderSheet(); return;
    case "flysheet": haptic("tick"); S.sheet = { type: "flysheet", chat: S.chat }; return renderSheet();
    // the message box's Now button: the next message goes now, or by pigeon (this chat, this message)
    case "nextmode": { const k = S.chat; if (!k || !pigeonsOn()) return; S.next.set(k, nextOf(k) === "now" ? "pigeon" : "now"); haptic("tick"); renderCompose(); return pulseNow(); }
    case "vianote": S.sheet = { type: "vianote", id, chat: S.chat }; return renderSheet();
    case "via": S.sheet = { type: "via", chat: S.chat, ids: null }; renderSheet();
      try { const r = await api("mutuals?with=" + encodeURIComponent(S.chat)); if (S.sheet?.type === "via") { S.sheet.ids = r.ids; renderSheet(); } } catch (err) { if (S.sheet?.type === "via") { S.sheet.err = err.message; renderSheet(); } }
      return;
    case "schedule": S.sheet = { type: "schedule", chat: S.chat }; return renderSheet();
    case "wxwait": S.sched = { chat: S.chat, at: +id }; S.pick = t.dataset.kind; S.via = null; haptic("tick"); return renderCompose();
    case "risky": return setRisky(!S.me.risky);
    // a chat's way (its header's pill): the sheet, and a choice in it
    case "waysheet": if (!pigeonsOn()) return; haptic("tick"); S.sheet = { type: "way", id: id || S.chat }; return renderSheet();
    // pigeons off: a letter in the air, either way, says when (nothing to watch)
    case "sealedtap": case "lettertap": {
      const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id); if (!m) return;
      haptic("tick"); return toast(t.dataset.act === "sealedtap" ? `It opens ${esc(atWhen(m.deliverAt))}.` : `It arrives ${esc(atWhen(m.deliverAt))}.`);
    }
    // yours still to go: a message sent at a time, or (pigeons off) a letter yet to take off, cancelled
    case "waitmenu": {
      const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id); if (!m || !m.waiting) return;
      return openMenu(t, [{ label: m.instant ? "Cancel Message" : "Cancel Letter", sub: `sends ${atShort(m.sentAt)}`, icon: I.x, act: "cancelwait", id, destructive: true }]);
    }
    case "pigeons": case "pgtipon": return setPigeons(t.dataset.act === "pgtipon" ? true : !pigeonsOn());
    case "pgtipoff": lsSet("inflight-pgtip", "off"); haptic("tick"); return render();
    case "hubnoteok": lsSet("inflight-hubnote", "done"); haptic("tick"); return render();
    case "hubnotelock": lsSet("inflight-hubnote", "done"); render(); return doAct("applock");
    case "pgtipok": lsSet("inflight-pgtipon", null); haptic("tick"); return render();
    case "newchats": return setNewChats(id);
    case "noteinstant": case "notekeep": return noteAnswer(t.dataset.act === "noteinstant");
    case "pushtoggle": return S.pushOn ? pushDisable() : pushEnable();
    case "signoutgo": {
      if (!STILL.matches) await new Promise((r) => setTimeout(r, 280));    // (the action card goes first; then dusk, to the welcome)
      const night = dusk();
      try {
        await pushDisable(true);
        // (signed out on the server before the sign-in page, given a few seconds, so that page needn't ask again)
        const out = api("logout", { method: "POST" }).catch(() => {});
        await night.dark;
        await Promise.race([out, new Promise((r) => setTimeout(r, 4000))]);                                                  // (dark now: what's under it can go)
        await forget(); S.navQuiet = true; go("welcome");                  // (under the night: no change of screen of its own)
      } finally { night.done(); }
      // (and on to the sign-in page, which says so and offers the way back; none locally)
      if (accountPage() && !/\.localhost[:/]/.test(accountPage())) location.assign(toAuth(`#${new URLSearchParams({ signout: "inflight", back: location.origin + "/" })}`));
      return;
    }
    case "profile": S.sheet = { type: "profile" }; return renderSheet();
    case "ifsettings": return openAccount("inflight");
    default: return LATER ? LATER.sheetClick(e, t, id, inPop) : later().then((L) => L.sheetClick(e, t, id, inPop));
  }
}
const passkeyError = (err) => err.name === "InvalidStateError" ? "This phone already has a passkey for your account." : err.name === "SecurityError" ? "Passkeys only work on inflite.ai." : err.message || "The passkey didn’t work. Try again.";

async function onChange(e) {
  const el = e.target;
  if (el.id === "file-lib" && el.files[0]) { const f = el.files[0]; el.value = ""; return setAttach(f); }
  if (el.dataset.act === "quiethour") return setNotify({ [el.dataset.id]: Number(el.value) });
  // (A Time to Talk: its day, or its time of day, chosen; the other times offered start again from the new one)
  if ((el.id === "f-ttday" || el.id === "f-tttime") && S.sheet?.type === "timetalk") {
    const s = S.sheet, d = new Date(s.start); d.setHours(0, 0, 0, 0);
    const day = el.id === "f-ttday" ? Number(el.value) : d.getTime(), q = el.id === "f-tttime" ? Number(el.value) : new Date(s.start).getHours() * 60 + new Date(s.start).getMinutes();
    if (!Number.isFinite(day) || !Number.isFinite(q)) return;
    const at = new Date(day); at.setHours(Math.floor(q / 60), q % 60, 0, 0);
    s.start = Math.max(at.getTime(), Math.ceil((now() + 15 * MIN) / (15 * MIN)) * 15 * MIN); s.opts = [];
    return renderSheet();
  }
  if (el.dataset.act === "lockafter") { const lp = lockPrefs(); if (lp) setLockPrefs({ ...lp, after: Number(el.value) || 0 }); render(); return renderSheet(); }
  if (el.dataset.act === "city" && el.value) {
    const p = PLACES.find((x) => x[0] === el.value);
    if (p) await savePlace(p[1], p[2], p[0]);
    if (p && S.view === "locpick" && S.me?.place) setTimeout(() => { if (S.view === "locpick") onbNext(); }, 650);   // signing up: straight on
  }
}
// Opt-in: keep your location fresh while Chat is open (a web page can't
// look in the background), so pigeons on their way can follow you. It never
// asks for permission by itself (only when you turn it on). It checks every
// minute, saves when you've moved to a new square mile, and otherwise just
// says every ten minutes that you're still there (so a pigeon the server held
// back from turning, as it turns one at most every ten minutes, still turns).
const AUTO_EVERY = MIN, AUTO_KM = 1, AUTO_FRESH = 10 * MIN;
// Pigeons on or off (your account's, so the same on every phone): the screen changes at once, a little flock crosses it,
// and it's saved. Turning them off brings nothing down: letters in the air still land
async function setPigeons(on) {
  if (S.pgBusy || !S.me) return;
  S.pgBusy = true;
  const was = S.me;
  S.me = { ...S.me, pigeons: on }; lsSet("inflight-pgtipon", on ? "1" : null);
  render(); if (S.sheet) renderSheet();
  flockFx(on);
  try {
    const r = await api("me", { method: "PATCH", body: { pigeons: on } });
    S.me = r.me; haptic("success");
    toast(on ? "Pigeons on. Any message can fly now." : "Pigeons off. Letters in the air still land.");
    render(); await sync();
  } catch (err) { S.me = was; lsSet("inflight-pgtipon", null); render(); toast(esc(err.message)); }
  finally { S.pgBusy = false; }
}
// a few pigeons cross the screen as they come (or fly off up it as they go); not with reduced motion
function flockFx(on) {
  if (STILL.matches || !root()) return;
  const w = root().clientWidth, f = document.createElement("div");
  f.className = `flockfx${on ? "" : " away"}`; f.setAttribute("aria-hidden", "true");
  f.innerHTML = Array.from({ length: 7 }, () => `<span class="fb">${I.bird}</span>`).join("");
  // (placed from here: the page allows no inline styles in its markup)
  [...f.children].forEach((b, i) => { const st = b.style; st.top = `${18 + ((i * 37) % 55)}%`; st.setProperty("--w", `${w}px`); st.setProperty("--d", `${(1.5 + (i % 3) * 0.35).toFixed(2)}s`); st.setProperty("--dl", `${(i * 0.09).toFixed(2)}s`); st.setProperty("--x", `${20 + ((i * 23) % 60)}%`); });
  root().append(f);
  setTimeout(() => f.remove(), 2800);
}
// how new chats start (pigeons on): instant, or by pigeon
async function setNewChats(v) {
  if (!["instant", "pigeon"].includes(v) || !S.me || S.me.newChats === v) return;
  const was = S.me.newChats;
  S.me = { ...S.me, newChats: v }; render(); haptic("tick");
  try { const r = await api("me", { method: "PATCH", body: { newChats: v } }); S.me = r.me; render(); }
  catch (err) { S.me = { ...S.me, newChats: was }; render(); toast(esc(err.message)); }
}
// The one-time note's buttons: every chat instant (and new ones), or nothing changes. Either way it's seen
async function noteAnswer(instant) {
  if (!S.me || S.noteBusy) return;
  S.noteBusy = true;
  const was = S.me;
  S.me = { ...S.me, noted: true }; render();
  try {
    const r = await api("me", { method: "PATCH", body: instant ? { noted: true, allChats: "instant", newChats: "instant" } : { noted: true } });
    S.me = r.me; haptic("success");
    toast(instant ? "Your chats are instant now. A letter by pigeon is a tap away in the message box." : "Your chats still go by pigeon. Change any chat from its name.");
    render(); await sync();
  } catch (err) { S.me = was; render(); toast(esc(err.message)); }
  finally { S.noteBusy = false; }
}
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
// (its Notifications folder, with them off here and askable: asks=1, so the account's Turn On closes that window and
// comes back, and they're asked for once Chat's in sight again, within a quarter of an hour; Not Now lets them be)
let ASK_BACK = 0;
async function openAccount(open) {
  const page = accountPage(); if (!page) return;
  const w = window.open("", "_blank");
  const asks = open === "notify-inflight" && pushState() === "off" ? { asks: "1" } : {};
  if (asks.asks) ASK_BACK = Date.now();
  try {
    const { code } = await api("account-link", { method: "POST" });
    const url = `${page}#${new URLSearchParams({ handoff: code, from: "inflight", ...(open ? { open } : {}), ...asks })}`;
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
  if (kind === "compose") return send();
  return (LATER || (await later())).sheetSubmit(e, form, kind);
}
// Sign-up's last steps: the passkey offer (where it works), then your first screen
// (not to an account that has one already, added on the account's page as you signed in, say)
function onbNext() { if (passkeysSupported() && !S.passkeys?.length) go("pkoffer"); else finishOnboarding(); }
function finishOnboarding() {
  S.started = true;                               // a brand new account: nothing to wait for
  if (S.pendingAdd) { go("friends"); S.sheet = { type: "addfriend" }; return renderSheet(); }   // came from a friend's link
  go("messages");
}
async function afterSignIn() {
  await sync();
  // (back in after a sign-in of yours here was ended: what was waiting to go goes, and your drafts are back: forget)
  await outboxLoad(); await draftsLoad(); outboxFlush();
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
  // (said as each stage starts: the percentage as it climbs is only shown)
  if (stage === "seal") { txt.textContent = "Encrypting…"; announce("Encrypting…"); return; }
  if (!upAnim) {
    announce("Sending…");
    upAnim = smoothProgress((x) => {
      bar.style.transform = `scaleX(${x})`;
      txt.textContent = x >= 1 ? "Finishing up…" : `Sending… ${Math.floor(x * 100)}%`;
    });
  }
  upAnim.set(f);
}
/* ---------- the app lock ----------
   Optional, per phone: Chat locks when you leave it (straight away, or
   after a minute, 15 minutes or an hour), and opens with Face ID, Touch ID
   or the phone's passkey. The check is the phone's own (a user-verified
   passkey assertion). (On inflite.ai the browser first asks
   georgefarrowgreen.com that its passkeys may be used there, so it needs a signal.) While locked nothing
   from your chats is drawn, and it's blurred in the app switcher. */
const LOCK_KEY = "inflight-lock", LOCK_AFTER = [[0, "Immediately"], [60e3, "After 1 Minute"], [15 * 60e3, "After 15 Minutes"], [HOUR, "After 1 Hour"]];
function lockPrefs() { try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); return v && S.me && v.uid === S.me.id && v.on ? v : null; } catch (_) { return null; } }
function setLockPrefs(v) { try { if (v) localStorage.setItem(LOCK_KEY, JSON.stringify({ ...v, uid: S.me.id })); else localStorage.removeItem(LOCK_KEY); } catch (_) {} }
// a user-verified passkey check, on this phone
async function lockCheck() {
  const rp = chatRp();
  const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), rpId: rp, userVerification: "required", timeout: 60000,
    allowCredentials: ofRp(rp) } });
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
  try { await lockCheck(); S.locked = false; haptic("success"); drawLock(); render(); backStep(); sync(); }      // (Android's Back: the chat you're back in has its step again)
  // (on inflite.ai the passkey is the home site's, and the browser asks that site before it will take one: with no
  // signal it can't, so it's said, not "try again" with no end)
  catch (_) { toast(navigator.onLine === false && chatRp() !== location.hostname.split(".").slice(-2).join(".") && RP_ID !== location.hostname ? "Unlocking needs a connection here. Try again once you’re online." : "Couldn’t unlock. Try again."); }
  finally { S.unlocking = false; }
}
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  const lp = lockPrefs(); if (!lp) return;
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); root()?.classList.add("veiled"); return; }
  root()?.classList.remove("veiled");
  if (!S.locked && hiddenAt && Date.now() - hiddenAt >= (lp.after || 0)) {
    // (and nothing left over the lock, or showing through it as it goes: a chat's menu with its row lifted, InFlite's
    // menu, a banner)
    S.locked = true; closePop(); $pop.innerHTML = ""; IFL.close(true);
    clearTimeout(toastTimer); $toast.innerHTML = ""; S.toastFn = null;
    S.sheet = null; render();
  }
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
// (msg: a message, not a pigeon: one sent instant, or any with pigeons off)
function voiceHtml(id, v, mine, msg = !pigeonsOn()) {
  const bars = waveOf(v.w).map((h) => `<i data-h="${(0.18 + 0.82 * h).toFixed(2)}"></i>`).join("");   // (heights set after drawing: no inline styles here)
  const ready = !!S.photos.get(id), playing = S.player?.id === id && !S.player.paused;
  return `<span class="voice${playing ? " playing" : ""}" data-vid="${esc(id)}">
    <button type="button" class="vplay" data-act="vplay" data-id="${esc(id)}" aria-label="${playing ? "Pause" : "Play"} voice ${msg ? "message" : "pigeon"}, ${fmtClip(v.d)}"${ready ? "" : " disabled"}>${playing ? I.pause : I.play}</button>
    <span class="vwave" aria-hidden="true">${bars}</span><span class="vdur">${fmtClip(v.d)}</span></span>`;
}
// one player for every voice pigeon; the bars fill in as it plays
function voicePlay(id) {
  const url = S.photos.get(id); if (!url) return;
  const pl = S.player || (S.player = new Audio());
  if (pl.id === id && !pl.paused) { pl.pause(); return voiceShow(); }
  if (pl.id !== id) { pl.pause(); pl.src = url; pl.id = id; }
  pl.onended = () => { pl.currentTime = 0; voiceShow(); };
  pl.play().then(() => { haptic("tick"); voiceShow(); requestAnimationFrame(voiceFrame); }).catch(() => { const vm = (S.msgs.get(S.chat) || []).find((x) => x.id === id); toast(`Couldn’t play that voice ${vm?.instant || !pigeonsOn() ? "message" : "pigeon"} on this phone.`); });
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
  catch (e) { return toast(e?.name === "NotAllowedError" ? `Chat needs the microphone for voice ${pigeonsOn() ? "pigeons" : "messages"}. You can allow it in Settings.` : "Couldn’t use the microphone."); }
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
// (a photo, GIF or voice pigeon whose upload was cut off, signal or not: tried again less often each time, from 30 s up to
// 10 minutes apart, rather than started afresh with every sync on an uplink too slow for it; Try Again, or the phone
// coming back online, tries straight away)
let outRest = { n: 0, until: 0 };
async function outboxFlush(force) {
  if (!S.me || !S.outbox.length || flushing) return flushing;
  if (navigator.onLine === false && !force) return;
  flushing = (async () => {
    let sent = 0, sentInst = 0;
    for (const o of [...S.outbox]) {
      if (o.err && !force) continue;
      if (!S.outbox.some((x) => x.id === o.id)) continue;      // (deleted while the one before it went: it doesn't go)
      if (o.blob && !force && Date.now() < outRest.until) break;
      try {
        if (o.blob) {
          const form = new FormData();
          form.append("meta", JSON.stringify(o.meta));
          form.append("photo", new Blob([o.blob], { type: "application/octet-stream" }), "photo.bin");
          // (as one sent there and then goes: given longer the bigger it is, not a fixed minute and a half: xhrFetch)
          await api(o.path, { method: "POST", form, size: o.blob.size ?? o.blob.byteLength, onProgress: () => {} });
          outRest = { n: 0, until: 0 };
        } else await api(o.path, { method: "POST", body: o.meta });
        sent++; if (o.meta?.instant) sentInst++;
      } catch (e) {
        if (e.offline && o.blob) { outRest.n++; outRest.until = Date.now() + Math.min(10 * MIN, 15e3 * 2 ** outRest.n); }
        if (e.offline) break;                                   // still no signal: try again later
        // a hiccup (the server busy, too many at once): it stays waiting and goes next time; only a real "no" stops it
        if (!e.status || e.status >= 500 || e.status === 408 || e.status === 429) break;
        if (e.status !== 409 || !/already sent/.test(e.message)) { o.err = e.message; await outboxSave(); continue; }
      }
      S.outbox = S.outbox.filter((x) => x.id !== o.id); await outboxSave();   // (on screen, it turns from waiting to flying)
    }
    if (sent) {
      haptic("success");
      const msgs = sentInst, birds = sent - sentInst, said = (n, one, many) => (n === 1 ? one : many.replace("N", n));
      toast(!birds ? said(msgs, "Sent.", "N messages sent.") : !msgs ? said(birds, "Your pigeon took off.", "N pigeons took off.")
        : `${said(birds, "Your pigeon took off", "N pigeons took off")}, and ${said(msgs, "a message was sent.", "N messages were sent.")}`);
    }
    if (sent || S.outbox.some((o) => o.err)) { for (const id of new Set([S.chat])) if (id && S.view === "chat") await loadChat(id).catch(() => {}); render(); }
  })();
  try { await flushing; } finally { flushing = null; }
}
window.addEventListener("online", () => { S.offline = false; renderOffline(); outRest.until = 0; outboxFlush(); sync(); });
window.addEventListener("offline", () => { S.offline = true; renderOffline(); });
// yours on its way to the server: an outline at the foot of the chat, "Sending…", until it takes off (send)
// (in its shape once it's in the air, to a friend: its track there from the start, "Sending…" where it'll say when it lands,
// so the bubble doesn't change its size as it goes up)
const pendingBubble = (p) => p.instant ? `<div class="b me pending${S.fresh.has(p.id) ? ` fresh" data-fresh="${esc(p.id)}` : ""}" data-key="m:${esc(p.id)}" data-sig="pending" data-instant="1">${p.q ? quoteHtml(p.q, group(p.to)) : ""}${linked(p.t)}<span class="pclock" aria-label="Sending">${I.clock}</span></div>` : `<div class="b me sending k-${esc(p.kind || "standard")}${S.fresh.has(p.id) ? ` fresh" data-fresh="${esc(p.id)}` : ""}" data-key="m:${esc(p.id)}" data-sig="pending">${p.q ? quoteHtml(p.q, group(p.to)) : ""}${linked(p.t)}${group(p.to) ? `<span class="ft">Sending…</span>` : `<span class="frow"><span class="trk" aria-hidden="true"><i></i><b class="cb">${I.bird}</b></span><span class="ft">Sending…</span></span>`}</div>`;
// What you've sent rises out of the box into its place by itself. It's added to the chat as it is, rather than the chat
// being drawn again (on a phone that took a frame or several, with the bubble already moving: and three times over, as
// it went up and its answer and the sync came back); the chat is at its foot at once, and the bubble starts from the box.
// A redraw that would come meanwhile waits until it's there (calmRender), and so do notices (afterRise).
function sendRise(id) {
  sendingAt = performance.now();
  const box = $(".field-wrap", $compose)?.getBoundingClientRect(), list = $(".msgs", $view);
  // (an empty chat, its "say hello" to go: drawn anew)
  if (!list || $(".msgs > .empty", $view) || S.view !== "chat") render();
  else { list.insertAdjacentHTML("beforeend", pendingBubble(S.pending)); renderCompose(); $view.scrollTop = $view.scrollHeight; }
  const el = $(`[data-fresh="${CSS.escape(id)}"]`, $view);
  if (el && box && !STILL.matches) { const d = Math.max(0, Math.round(box.bottom - el.getBoundingClientRect().bottom)); S.rise.set(id, d); el.style.setProperty("--rise", `${d}px`); }
}
// once what you've sent is in its place (a notice before then would land on top of it moving)
const afterRise = () => new Promise((res) => setTimeout(res, Math.max(0, sendingAt + SEND_MS - performance.now()) + 120));
// a waiting pigeon in its chat: your message, with a badge
function outboxBubbles(chat) {
  return S.outbox.filter((o) => o.to === chat).map((o) => {
    const p = S.plain.get(o.id) || { t: "" }, ph = S.photos.get(o.id);
    const pic = p.v ? voiceHtml(o.id, p.v, true, !!o.instant || !pigeonsOn()) : p.p ? `<div class="ph"${ph ? "" : ' data-empty="1"'}>${ph ? `<img src="${esc(ph)}" alt="${p.p.m === "image/gif" ? "GIF" : "Photo"}">` : `<span>${p.p.m === "image/gif" ? "GIF" : "Photo"}</span>`}</div>` : "";
    return `<div class="b me pending${o.err ? " failed" : ""}" data-key="m:${esc(o.id)}" data-sig="wait${o.err ? "!" : ""}" data-mid="${esc(o.id)}">${pic}${linked(p.t || "")}</div>
      <div class="meta me" data-key="mt:${esc(o.id)}" data-sig="${o.err ? "!" : ""}"><button type="button" class="fl outq${o.err ? " bad" : ""}" data-act="outmenu" data-id="${esc(o.id)}">${o.err ? `${I.warn} Not sent · ${esc(o.err)}` : `${I.clock} Waiting for signal`}</button></div>`;
  }).join("") + (S.pending?.to === chat ? pendingBubble(S.pending) : "");
}

async function send() {
  // now (a message, there at once) or by pigeon (a letter), as the message box says (a /dumb pigeon is a letter's)
  const instant = !!S.chat && nextOf(S.chat) === "now";
  const raw = $ta.value, text = (instant ? raw : dumbText() ?? raw).trim();
  // a card waiting above the box (Send to a Friend) goes with it, and with no words its own line is what it says
  // (not with a photo or a voice pigeon, which draw no card: it stays waiting, to go next on its own)
  const cw = S.cardWait && S.cardWait.chat === S.chat && !S.attach ? S.cardWait : null, words = text || (cw ? String(cw.card.say || cardWords(cw.card) || "").slice(0, 500) : "");
  if ((!text && !S.attach && !cw) || S.busy || $(".send", $compose).disabled) return;
  // (the weather where a friend is: only ever to that friend, one to one, as canForward says)
  if (cw?.card?.there && (group(S.chat) || !canForward(cw.card, { mine: true, to: S.chat }))) { S.err = `Only for ${first(friend(cw.card.ref?.friend)?.name || "the friend it’s about")}.`; renderCompose(); return; }
  if (!instant && S.sendKind === "standard" && S.outbox.some((o) => o.to === S.chat && o.kind === "standard" && !o.err)) { S.err = "Your pigeon is still waiting for signal. A swift, turbo or rocket can go too."; renderCompose(); return; }
  S.busy = true; S.err = "";
  if (S.attach) renderCompose();          // (words alone: the box drawn once, cleared, as they go up: sendRise)
  // what's being sent belongs to this chat, even if you leave it before it's gone
  const to = S.chat, att = S.attach, here = () => S.view === "chat" && S.chat === to;
  S.sendingTo = to; S.sending = att;
  // words alone show straight away, waiting at the foot of the chat as they go up, and the box is clear for the next
  // (a photo or a voice pigeon shows its own progress, in its card)
  const id = uuid(), rt = S.replyTo && S.replyTo.chat === to ? S.replyTo : null, kind = instant ? "instant" : S.sendKind;   // (taken now: a /dumb pigeon's comes from the box)
  const chose = S.next.get(to);
  S.next.delete(to);                              // (Now, or by pigeon, was for this one: the next goes the chat's usual way)
  if (!att) {
    S.pending = { id, to, t: words, kind, instant, q: rt && { id: rt.id, from: rt.from, t: rt.t, ...(rt.p ? { p: rt.p } : {}) } };
    S.fresh.set(id, Date.now()); S.replyTo = null; $ta.value = ""; fitTa(); S.stick = true; sendRise(id); draftsSoon();
  }
  const tidy = () => {
    if (!att) return;              // (words alone left the box as they went up: what's in it now is the next one)
    if (att.preview && !(att.gif || att.voice)) URL.revokeObjectURL(att.preview); if (S.attach === att) S.attach = null;
    if (here()) { $ta.value = ""; fitTa(); } else S.drafts.delete(to);
    draftsSoon();
  };
  let ref = null;
  try {
    const mc = !instant && !group(to) && moonChat(friend(to)), sc = !instant && !mc && schedFor(to), vi = !instant && !mc && !sc && viaFor(to);    // (a lunar pigeon goes straight there, now; a message, at once)
    const payload = { t: words };
    // (a Fitness card one to one gets its share id now, at Send; in a group it shows "When sent" only)
    if (cw) { const sr = group(to) ? { card: noRef(cw.card), id: null } : await shareRef(cw.card); ref = sr.id; payload.c = sr.card; }
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
    const g = group(to), bd = instant || kind === "dumb" ? null : birdFor(), carry = { ...(bd ? { bird: bd.id } : {}), ...(blob ? { once } : {}) };
    let meta;
    const route = routeStyle() === "fastest" ? {} : { route: routeStyle() };   // the way it goes
    if (g) {
      // sealed once; its key sealed for each member (and for me, so my other phones can read it)
      const { body, key, h } = await E2E.sealGroup({ id, from: S.me.id, group: g.id, type: "msg" }, padPayload({ ...payload }));      // (padded to a size bucket: cards.js)
      const keys = {};
      for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
      meta = instant ? { id, group: g.id, body, keys, instant: true, ...(blob ? { once } : {}) } : { id, group: g.id, body, keys, pigeon: kind, ...carry, ...route };
    } else if (instant) meta = { id, to, ct: await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, padPayload({ ...payload })), instant: true, ...(blob ? { once } : {}) };
    else meta = { id, to, ct: await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, padPayload({ ...payload })), pigeon: kind, ...carry, ...(vi ? {} : route), ...(sc ? { landAt: sc.at } : {}),
      ...(!vi && !sc && noShipOn() && kind === "standard" ? { noShip: true } : {}),
      // a stopover: the friend on the way gets their own sealed copy (words only; photos stay between you two)
      ...(vi ? { via: vi.id, viaCt: await E2E.seal(await base(vi.id), { id, from: S.me.id, to: vi.id, type: "via" }, { t: words, ...(blob ? { ph: 1 } : {}) }) } : {}) };
    const path = g ? "group-messages" : "messages";
    // no signal: it waits on the perch (sealed already) and takes off once there is
    const queue = async () => {
      await outboxAdd({ id, to, path, meta, blob, kind, at: Date.now() });
      S.pending = null;                // (the same pigeon, waiting on the perch now)
      S.plain.set(id, payload); if (cw && S.cardWait === cw) S.cardWait = null;
      if (att && !once) { S.photos.set(id, att.preview); att.preview = null; }
      tidy();
      if (rt) S.replyTo = null;
      if (sc) S.sched = null; if (vi) S.via = null; S.noShip = null;
      S.pick = null; S.stick = true; showUpload(null);
      haptic("tick"); render(); announce(instant ? "You’re offline. It’ll send when there’s signal." : "You’re offline. Your pigeon will wait for signal.");
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
    if (!instant) { const f = friend(to), was = f?.streak, s = r.streak;
      if (f && s) { f.streak = s; if (s.n >= STREAK_MIN && (!was || !was.today || was.n < s.n)) afterRise().then(() => toast(`${I.flame} ${s.n}-day streak with ${esc(first(f.name))}`)); } }
    if (!instant && r.message.mystery) {
      const k = kindOf(r.message), word = { rocket: "A rocket pigeon!", turbo: "A turbo pigeon!", swift: "A swift pigeon.", standard: "A standard pigeon.", dumb: "A dumb pigeon…" }[k];
      if (r.me) S.me = r.me;
      afterRise().then(() => toast(`${pg(k, S.me.skin)} ${word} ${r.message.flock ? "Off it goes." : `It lands ${esc(atTime(r.message.deliverAt))}.`}`));
      if (k === "rocket") haptic("success");
    }
    S.birdPick = null; const flew = r.message.bird?.id && S.birds.find((b) => b.id === r.message.bird.id); if (flew) flew.state = "flying";
    haptic("success");
    if (rt) S.replyTo = null;
    if (sc) { S.sched = null; if (r.me) S.me = r.me; afterRise().then(() => toast(`Scheduled. It lands ${fmtLand(r.message.deliverAt)}.`)); }
    S.noShip = null;
    if (vi) { S.via = null; afterRise().then(() => toast(`It’ll stop with ${esc(first(friend(vi.id)?.name || "your friend"))} on the way.`)); }
    S.plain.set(id, payload); if (cw && S.cardWait === cw) S.cardWait = null;
    if (att && !once) { S.photos.set(id, att.preview); att.preview = null; }   // keep the preview as our own copy (not of a view-once photo)
    tidy(); S.stick = true; S.pending = null;
    if (att) announce("Sent.");
    // (the pulse's delta may have brought it already, while the answer was on its way: kept once, as the delta has it,
    // which is newer: delivered, or read, since)
    const list = S.msgs.get(to) || [];
    if (!list.some((x) => x.id === r.message.id)) list.push(r.message);
    S.msgs.set(to, list);
    if (att) S.fresh.set(r.message.id, Date.now());        // (words were up already: they just take off)
    if (!instant) loadSkies();        // it's in the air now: ready for the strip on Messages
    if (S.live.typingOut) pulseNow();  // (and the dots go, for them)
    // shown now (on a slow connection the sync below can outlast the pop): words that went up already, once they're in place
    if (att) render(); else calmRender();
    await sync();
    await afterRise(); offerNotify(instant);
  } catch (err) {
    // (the browser's own errors, a key it can't use, can come with no words: never a silent nothing)
    dropRef(ref);                      // (a share id made for a card that didn't go: gone again)
    const say = err.message || "Couldn’t seal this pigeon. Try again, or check their safety number.";
    if (here()) S.err = say; else toast(esc(say)); showUpload(null);
    // (it didn't go: Now, or by pigeon, if chosen for it, is still the choice for the next try, in this visit to the chat)
    if (chose && here() && !S.next.has(to)) S.next.set(to, chose);
    // words that were up already come back down into the box (or its draft), with what they replied to
    if (!att && S.pending?.id === id) {
      S.pending = null;
      if (here()) { $ta.value = $ta.value.trim() ? `${raw}\n${$ta.value}` : raw; fitTa(); }
      else { const d = S.drafts.get(to); S.drafts.set(to, d?.trim() ? `${raw}\n${d}` : raw); }     // (with anything typed after, kept as its draft)
      draftsSoon();
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
// (nothing chosen: Light, or at InFlite's hub the phone's, as Today has it, theme.js)
const THEME_DEFAULT = typeof document !== "undefined" && document.querySelector?.('meta[name="ifl-hub"]') ? "auto" : "light";
function theme() { try { const t = localStorage.getItem("inflight-theme"); return THEMES.includes(t) ? t : THEME_DEFAULT; } catch (_) { return THEME_DEFAULT; } }
// One that couldn't be saved to your account yet (no signal, say) waits on this phone, marked as whose it is, and goes
// again with each sync until it's saved, rather than the account's old one being taken back (syncTheme)
const THEME_WAIT = "inflight-theme-wait";
const themeWaits = () => { try { return !!S.me && localStorage.getItem(THEME_WAIT) === S.me.id; } catch (_) { return false; } };
const themeDone = () => { try { localStorage.removeItem(THEME_WAIT); } catch (_) {} };
let themeSaving = null;
function saveTheme(t, say) {
  try { localStorage.setItem(THEME_WAIT, S.me.id); } catch (_) {}
  const p = themeSaving = api("me", { method: "PATCH", body: { appearance: t } })
    .then(() => { if (theme() === t) themeDone(); })          // (another chosen since: that one's own save clears it)
    .catch((e) => {
      // (one the account turned down stays as the account has it; anything else goes again)
      if (e.status && e.status < 500 && ![408, 429].includes(e.status)) { themeDone(); if (say) toast(esc(e.message)); }
      else if (say) toast("Couldn’t save that to your account just now. It’s set on this phone, and Chat will save it to your account as soon as it can.");
    })
    .finally(() => { if (themeSaving === p) themeSaving = null; });
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
  // (one chosen here that the account hasn't had yet: this phone's stands, and goes again)
  if (themeWaits()) { if (!themeSaving) saveTheme(theme()); return; }
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101210" : "#f8f9f6");   // (the sky at its top: styles.css --sky-top)
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
  if (HUB) return location.assign("/#you");          // (the hub's notifications are You's: one subscription, the hub's own)
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
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !ASK_BACK) return;
  const fresh = Date.now() - ASK_BACK < 15 * 60e3; ASK_BACK = 0;
  if (fresh && pushState() === "off" && S.me) setTimeout(askNotify, 400);
});
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
  // (at the hub, Chat's own push stands down: the hub's worker holds the one subscription, written for Chat only from
  // You's Get Every App's Notifications Here; never asked for, re-sent or registered here)
  if (HUB || !pushSupported() || Notification.permission !== "granted") { S.pushOn = false; return; }
  try { S.pushOn = !!(await pushSub(false)); } catch (_) { S.pushOn = false; }
  if (S.view === "account") render();
  if (S.sheet?.type === "notifications") renderSheet();
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
async function offerNotify(instant) {
  if (HUB) return;
  if (S.pushOn || S.me?.notifyEmail || S.notifyAsked) return;
  S.notifyAsked = true;
  if (await idb.get("notify-asked")) return;
  await idb.set("notify-asked", true);
  const ps = pushState(), when = instant ? "they reply" : "the reply lands";
  if (ps === "off") toast(`Want to hear when ${when}?`, "Notify Me", () => pushEnable());
  else if (S.emailOn) toast(`Want an email when ${when}?`, "Email Me", () => setEmailNotify(true));
  // (How: the steps, there and then; the Account tab has none to show where Chat has an account page)
  else if (ps === "homescreen") toast(`Add Chat to your Home Screen to get notified when ${when}.`, "How", () => toast("Tap Share, then Add to Home Screen, and open Chat from there."));
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
// while signed out, they wait until you've signed in. With a card beside the
// words (&card=, pigeon/cards.js), Send to a Friend opens with it instead.
function openLink(hash) {
  const o = /#open=([0-9a-f-]{36})/.exec(hash || ""), rq = /#requests/.test(hash || ""), acc = /#account\b/.test(hash || ""), log = /#flightlog\b/.test(hash || "");
  let sh = null, card = null;
  try { sh = /#share=/.test(hash || "") ? (new URLSearchParams(String(hash).slice(1)).get("share") || "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500) : null; } catch (_) {}
  // (the card never trusted: unpacked and checked field by field, any Fitness share id dropped, and only ever filling in the sheet)
  if (sh != null) try { const r = readShareHash(String(hash)); card = r?.card || null; if (typeof r?.words === "string") sh = r.words; } catch (_) { card = null; }
  if (!o && !rq && !acc && !log && !sh && !card) return false;
  if (location.hash) history.replaceState(null, "", location.pathname);
  if (!S.me) { S.pendingLink = hash; return true; }
  closePop(); S.sheet = null; renderSheet();
  // (sent from another page of the hub: back= that page, a path of this site's only, gone back to once it's sent)
  const back = HUB ? hashPath(hash, "back") : null;
  if (card) { go("messages"); openSendSheet(card, { words: sh || "", link: true, back }); return true; }
  if (sh) { S.share = sh; go("messages"); toast("Pick who to send it to. It’s waiting in the message box."); return true; }
  if (log) { go("account"); openFlightLog(); }
  else if (acc) go("account");
  else if (o && (friend(o[1]) || group(o[1]))) go("chat", o[1]);
  else { go("friends"); if (S.incoming.length) { S.sheet = { type: "requests" }; renderSheet(); } }
  return true;
}

/* ============================================================
   Send to a Friend: cards in letters
   ============================================================
   Another of the site's apps (Weather, Fitness, Markets, Today) sends a card beside its words (#share=…&card=…,
   openLink). The card travels inside the sealed letter ({ t, c, ask?, plan?, ans?, re? }: pigeon/cards.js), padded
   to a size bucket, never in the clear, and t is always a sentence of its own, so an older Chat shows the words.
   Here: the sheet that picks who it goes to (ranked by pigeon/rank.js), sendLetter (one letter, taking nothing of
   the message box's), the card drawn in its letter with "When sent" and "Now" (pigeon/cardview.js), asking back
   ("How's yours?"), and plans made together, which go to each person's Fitness to add. */
const NO_SIGNAL = "No signal. Try again when you have some.";
// another of the site's apps, beside Chat (chat.<site> → weather.<site>); none where Chat's at another kind of address
const appOrigin = (name) => (/^chat\./.test(location.host) ? location.origin.replace("//chat.", `//${name}.`) : null);
// (at the hub, the apps are its own pages, /weather/ and /markets/: the card's links are drawn for their own addresses,
// then made the hub's paths, in the same window, by linkActs)
const HUB_APP = { weather: "/weather/", finance: "/markets/" };
const hubOwn = (name) => `${location.protocol}//${name}.${hubSite()}`;
// (none to Weather on the weather where a friend is, at the hub or off it: its place is that friend's Chat place, and
// Weather's address would carry it)
const cardLinks = (c) => {
  const l = HUB ? { weather: hubOwn("weather"), finance: hubOwn("finance") } : { weather: appOrigin("weather"), finance: appOrigin("finance") };
  return c?.there ? { ...l, weather: null } : l;
};
// a letter's parts, each checked on its own: a card that fails is words only, never "couldn't be opened"
// (a group's letter read as a group's: no time to talk, no answer to one, and never the weather where a friend is;
// unless told, as the chat on screen is)
const partsOf = (p, inGroup = !!(S.chat && group(S.chat))) => { if (!p || p.bad || typeof p !== "object") return null; try { return payloadParts(p, { group: !!inGroup }); } catch (_) { return null; } };
const cardLabel = (c) => ({ weather: `Weather · ${c.snap?.place || ""}`, fitness: `Fitness · ${c.snap?.name || ""}`, markets: `Markets · ${c.snap?.name || ""}`, streak: "Chat · Flight streak" })[c?.kind] || "Card";
// a card without its Fitness share id (a forwarded one, or one whose id couldn't be had: it shows "When sent" only)
const noRef = (c) => { if (!c || c.kind !== "fitness" || !c.ref) return c; const { ref, ...rest } = c; return rest; };
// a time on this phone's clock: "10:00" today, "Sat 10:00" another day
const clockSay = (ms) => (sameDay(ms, now()) ? fmtTime(ms) : `${DOW[new Date(ms).getDay()]} ${fmtTime(ms)}`);
const keptList = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
const keepIn = (k, id) => { const l = keptList(k); if (!l.includes(id)) l.push(id); try { localStorage.setItem(k, JSON.stringify(l.slice(-300))); } catch (_) {} };
// (any link in a card opens as a link, not the letter's menu)
// At the hub, a card's link to Weather or Markets is the hub's own page, opened in the same window, and never says a
// place by name (the square only: no Chat place in an address)
const linkActs = (h) => {
  const s = String(h || "").replace(/<a /g, '<a data-act="link" ');
  if (!HUB) return s;
  return s.replace(/<a ([^>]*?)href="([^"]*)"([^>]*)>/g, (all, a, href, b) => {
    const raw = href.replace(/&amp;/g, "&");
    for (const [name, path] of Object.entries(HUB_APP)) {
      const o = hubOwn(name) + "/";
      if (!raw.startsWith(o)) continue;
      let u; try { u = new URL(raw); } catch (_) { return all; }
      u.searchParams.delete("name");
      const to = path + (u.search || "") + (u.hash || "");
      return `<a ${a}href="${esc(to)}"${b.replace(/\s*target="_blank"/, "").replace(/\s*rel="noopener"/, "")}>`;
    }
    return all;
  });
};

/* ---------- the live "Now": asked of the server for the cards a chat (or a sheet) shows, kept in memory only ---------- */
const NOW_KEEP = { weather: 10 * MIN, markets: 2 * MIN, fitness: 5 * MIN };
let nowBusy = false, nowFailAt = -1e9, nowSoon = 0, nowNext = null;
const nowAsked = new Map();
const keyOfCard = (c) => { try { return liveKey(c) || null; } catch (_) { return null; } };
const nowHad = (c) => { const k = keyOfCard(c); return k ? S.cardNow.get(k) || null : null; };
// what a card's "Now" is: the answer, or "wait" (asked, or about to be)
const nowVal = (c) => nowHad(c)?.v ?? "wait";
async function nowFor(cards) {
  // (asked while another is on its way: asked again as soon as that one's answered, so a sheet opened meanwhile still fills)
  if (nowBusy) { nowNext = [...(nowNext || []), ...cards].slice(-24); return; }
  if (document.hidden || Date.now() - nowFailAt < 60e3) return;
  const items = new Map(); let fit = 0;
  for (const c of cards) {
    const k = keyOfCard(c), had = k && S.cardNow.get(k);
    if (!k || items.has(k) || (had && now() - had.at < (NOW_KEEP[c.kind] || 5 * MIN))) continue;
    let it = null; try { it = liveItem(c); } catch (_) {}
    if (!it || (c.kind === "fitness" && ++fit > 4)) continue;
    items.set(k, it); if (items.size >= 12) break;
  }
  if (!items.size) return;
  nowBusy = true;
  try {
    const r = await api("card-now", { method: "POST", body: { items: [...items.values()] } }), ks = [...items.keys()], t = now();
    (Array.isArray(r.now) ? r.now : []).forEach((v, i) => { if (ks[i] && v && typeof v === "object" && !v.quiet) S.cardNow.set(ks[i], { at: t, v }); });
    if (S.view === "chat") render();
    if (S.sheet?.type === "send" || S.sheet?.type === "askback") renderSheet();
  } catch (_) { nowFailAt = Date.now(); }
  finally { nowBusy = false; }
  const next = nowNext; nowNext = null;
  if (next) nowFor(next);
}
// A chat drawn: its live cards (newest first, a dozen at most), asked for together, once in 30 s, not while hidden
function liveSoon(chat) {
  if (!chat || document.hidden || now() - (nowAsked.get(chat) || 0) < 30e3) return;
  clearTimeout(nowSoon);
  nowSoon = setTimeout(() => {
    if (S.view !== "chat" || S.chat !== chat || !S.me) return;
    const g = group(chat), cards = [], t = now();
    for (const m of [...(S.msgs.get(chat) || [])].reverse()) {
      if ((m.flying && m.from !== S.me.id) || m.lost || m.recalled) continue;
      const c = partsOf(S.plain.get(m.id))?.card;
      if (!c || (g && c.kind === "fitness")) continue;
      let live = false; try { live = isLive(c, { landedAt: m.deliverAt, mine: m.from === S.me.id, now: t }); } catch (_) {}
      if (live) cards.push(c);
      if (cards.length >= 24) break;
    }
    if (!cards.length) return;
    nowAsked.set(chat, t); nowFor(cards);
  }, 400);
}

/* ---------- a card in its letter ---------- */
// The card part of a letter (its card, a request, an invite, an answer), drawn by pigeon/cardview.js: { html, sig },
// or null for words only (and words only, never a blank, if drawing it fails)
function cardBlock(f, m, p, g) {
  const pp = partsOf(p, !!g); if (!pp || !(pp.card || pp.plan || pp.ans || pp.when)) return null;
  try {
    const mine = m.from === S.me.id, who = first(f?.name || "A friend"), t = now(), tz = MY_TZ, id = m.id;
    const list = S.msgs.get(S.chat) || [];
    const any = (fn) => list.some((x) => x.id !== id && fn(x, partsOf(S.plain.get(x.id), !!g)));
    // (answered by you: a ride's invite by its letter's id (re), a time to talk by its own (id))
    const answered = () => any((x, q) => x.from === S.me.id && (q?.ans?.re === id || q?.ans?.id === id));
    // (the weather where a friend is: "Where Leo is" on yours, "Where you are" only on that friend's own phone)
    const one = (c, mineC, landedAt) => {
      const live = !(g && c.kind === "fitness") && isLive(c, { landedAt, mine: mineC, now: t });
      return { live, html: cardHtml(c, { now: live ? nowVal(c) : null, viewAt: t, sentAt: m.sentAt, live, mine: mineC, links: cardLinks(c), tz, who: mineC ? who : "", me: S.me.id }), sig: live ? `${nowHad(c)?.at || "w"}` : "s" };
    };
    let html = "", sig = `${Math.floor(t / 600e3)}`;            // (phrased for when it's seen: "Rain due 15:00", then "Rain was due 15:00")
    if (pp.when && !pp.ans) {
      // a time to talk (one to one only): Yes, Another Time (its other times), No; and once a friend's said Yes to yours,
      // it's in your Today, as theirs is (time-offer: the backstop for an invite whose Yes came before yours was written)
      const done = !mine && answered();
      html = whenHtml(pp.when, { mine, who, id, canAnswer: !g && !mine && !done, tz, viewAt: t, showLater: S.laterOpen === id });
      sig += `w${done ? 1 : 0}${S.laterOpen === id ? "l" : ""}`;
    } else if (pp.ans) {
      const done = !mine && answered();
      html = answerHtml(pp.ans, { mine, who, id, canAnswer: !g && !mine && !done && pp.ans.a === "later" && pp.ans.plan?.start > t, tz, viewAt: t });
      sig += `a${done ? 1 : 0}`;
      if (!g && !mine && pp.ans.a === "yes" && pp.ans.plan) offerSoon(m, pp.ans, f);
      else if (!g && mine && pp.ans.a === "yes" && pp.ans.plan) answerArrived(m, pp.ans, f);
      else if (!g && !mine && pp.ans.a === "yes" && pp.ans.id) timeSoon(m, pp.ans, f);
    } else if (pp.plan) {
      const done = !mine && answered();
      if (pp.card) { const c = one(pp.card, mine, m.deliverAt); html += c.html; sig += c.sig; }
      html += inviteHtml(pp.plan, { mine, who, id, canAnswer: !g && !mine && !done, tz, viewAt: t, showLater: S.laterOpen === id });
      if (S.laterOpen === id && !done && !mine && !/planlater|cd-later/.test(html)) html += laterChips(pp.plan, id);
      sig += `p${done ? 1 : 0}${pp.plan.start < t ? "x" : ""}${S.laterOpen === id ? "l" : ""}`;
    } else {
      // (only with the request it answers: a letter that asked, of this kind, from the other one of you two)
      const c = pp.card, orig = pp.re && list.find((x) => x.id === pp.re.ask && x.from !== m.from), op = orig && partsOf(S.plain.get(orig.id));
      const oc = op?.ask && op.card && op.ask.kind === c.kind && op.card.kind === c.kind ? op.card : null;
      if (oc && !g) {
        // a "How's yours?" answered: both, side by side, you on the left (on both phones)
        const origMine = orig.from === S.me.id, [mc, tc] = origMine ? [oc, c] : [c, oc], [ma, ta] = origMine ? [orig, m] : [m, orig];
        const lm = isLive(mc, { landedAt: ma.deliverAt, mine: true, now: t }), lt = isLive(tc, { landedAt: ta.deliverAt, mine: false, now: t });
        html = sideBySideHtml(mc, tc, { nowMine: lm ? nowVal(mc) : null, nowTheirs: lt ? nowVal(tc) : null, who, viewAt: t, tz });
        sig += `b${lm ? nowHad(mc)?.at || "w" : ""}${lt ? nowHad(tc)?.at || "w" : ""}`;
      } else {
        const one1 = one(c, mine, m.deliverAt); html = one1.html; sig += one1.sig;
        if (pp.ask && !g) {
          const state = mine ? (any((x, q) => x.from !== S.me.id && q?.re?.ask === id) ? "sent" : "open")
            : any((x, q) => x.from === S.me.id && q?.re?.ask === id) ? "sent" : keptList("inflight-askno").includes(id) ? "declined" : "open";
          html += askHtml(pp.ask, { mine, who, state, id });
          sig += state;
        }
      }
    }
    return html ? { html: linkActs(html), sig } : null;
  } catch (e) { console.warn("card", e?.message); return null; }
}
// "Later": the invite's other times still ahead, as chips (where the invite doesn't draw them itself)
function laterChips(plan, id) {
  const opts = (plan.opts || []).filter((o) => o.start > now());
  return `<div class="laterpick">${opts.length ? opts.map((o) => `<button type="button" class="schip" data-act="planlater" data-id="${esc(id)}" data-t="${esc(o.start)}">${esc(clockSay(o.start))}</button>`).join("") : `<span>No other time is dry for you both.</span>`}</div>`;
}
// A plan said yes to, in each person's Fitness to add (nothing changes in anyone's plan until they add it there)
// (extra: with, the friend's id, so the server knows which friend it's with, once it's checked you're friends; re, the
// invite a Yes answers; state "pending" and opts, the inviter's own record as the invite goes)
const fitOffer = (id, plan, f, role, extra = {}) => api("fit-offer", { method: "POST", body: { id, start: plan.start, stop: plan.end, tz: plan.tz || MY_TZ, sport: plan.sport, wid: plan.wid, name: plan.name, secs: plan.secs, who: first(f?.name || "A friend").slice(0, 40), role, far: !!plan.far, dry: !!plan.dry, ...extra } });
// a friend's Yes to your own invite (or to your own "later"), once per phone
const offerBusy = new Set();
// (only what your own letter offered: its workout, at its time or one of its other times; never what the answer says of its own)
function offerSoon(m, ans, f) {
  if (group(S.chat) || m.from === S.me.id) return;
  const o = (S.msgs.get(S.chat) || []).find((x) => x.id === ans.re), op = o && o.from === S.me.id ? partsOf(S.plain.get(o.id)) : null;
  const mineP = op?.plan || (op?.ans?.a === "later" ? op.ans.plan : null), a = ans.plan;
  const w = mineP && [mineP, ...(op.plan ? mineP.opts || [] : [])].find((x) => x.start === a.start && x.end === a.end);
  if (!w || !(w.end > now()) || offerBusy.has(m.id) || keptList("inflight-offered").includes(m.id)) return;
  offerBusy.add(m.id);
  // (the backstop, for every invite: the server agrees nothing twice, and this is what an invite from an older Chat has)
  setTimeout(() => fitOffer(m.id, { ...mineP, start: w.start, end: w.end, dry: w.dry === true }, f, "asked", { with: f.id, re: ans.re }).then(() => { keepIn("inflight-offered", m.id); toast("In Fitness, to add to your plan."); }, () => {}), 0);
}

// your own Yes whose reply never came, seen in the chat after all (it reached the server, and the chat now has it): it's
// in your Fitness as a tap again would have put it, as its buttons are gone
function answerArrived(m, ans, f) {
  const u = replyUnsure.get(ans.re); if (!u || u.id !== m.id || offerBusy.has(m.id)) return;
  replyUnsure.delete(ans.re); offerBusy.add(m.id);
  setTimeout(() => fitOffer(m.id, ans.plan, f, "answered", { with: f.id, re: ans.re }).then(() => toast("In Fitness, to add to your plan."), () => {}), 0);
}

/* ---------- sending one letter ---------- */
// A Fitness share id for a card about to go (made now, at Send, never before): the card with it, or without one
async function shareRef(card) {
  if (card?.kind !== "fitness") return { card, id: null };
  const sn = card.snap || {};
  try {
    const r = await api("fit-share", { method: "POST", body: { day: sn.day, tz: sn.tz || MY_TZ, sport: sn.sport } });
    if (typeof r.id === "string" && /^[A-Za-z0-9_-]{22}$/.test(r.id)) return { card: { ...card, ref: { share: r.id } }, id: r.id };
  } catch (_) {}
  return { card: noRef(card), id: null };
}
const dropRef = (id) => { if (id) api("fit-share", { method: "POST", body: { drop: id } }).catch(() => {}); };
const openSendSheet = viaLater("openSendSheet");
// (the engine's, which has later.js before it's ready)
const sendRows = (s) => LATER?.sendRows(s) || [];
// one letter, as pigeon/digest.js reads it (its words and parts, and when it landed); null if it can't be read
function digestMsg(m, inGroup) {
  const p = S.plain.get(m.id); if (!p || p.bad) return null;
  const pp = partsOf(p, inGroup);
  return { text: typeof (pp?.t ?? p.t) === "string" ? (pp?.t ?? p.t) : "", card: pp?.card || null, plan: pp?.plan || null, when: pp?.when || null, ask: pp?.ask || null, ans: pp?.ans || null, at: m.deliverAt };
}
const sendRun = viaLater("sendRun");
// A card in a letter, sent on: your own of any kind; a friend's only if it's public (a forecast, a stock's move)
function cardFwd(id) {
  const m = (S.msgs.get(S.chat) || []).find((x) => x.id === id), c = m && partsOf(S.plain.get(id))?.card;
  let ok = false; try { ok = !!c && canForward(c, { mine: m.from === S.me.id }); } catch (_) {}
  if (ok) openSendSheet(noRef(c), { words: c.say || "" });
}
// A reply to a letter (an answer to a plan, or yours sent back) whose own reply never came: it may have gone, so a
// second tap sends it again as it was, with the same id ("That scroll was already sent." is then the one that went),
// never as a second letter: by the letter replied to ("ask:<id>" for yours sent back)
const replyUnsure = new Map();
const openFromApps = viaLater("openFromApps");
const timeBody = (id, w, start, f, extra = {}) => ({ id, kind: w.kind, start, stop: start + w.mins * MIN, tz: w.tz || MY_TZ, with: f.id, ...extra });
// a friend's Yes to your own time to talk, seen: the server told it's agreed (the backstop: for an invite written
// before its Yes, or from an older Chat; the server changes nothing that's agreed already). Once per phone
function timeSoon(m, ans, f) {
  if (group(S.chat) || m.from === S.me.id || !f) return;
  const o = (S.msgs.get(S.chat) || []).find((x) => x.id === ans.id), w = o && o.from === S.me.id ? partsOf(S.plain.get(o.id), false)?.when : null;
  if (!w || !Number.isFinite(ans.start) || ![w.start, ...(w.opts || [])].includes(ans.start) || !(ans.start + w.mins * MIN > now())) return;
  const k = `${ans.id}:${m.id}`;
  if (offerBusy.has(k) || keptList("inflight-timed").includes(k)) return;
  offerBusy.add(k);
  setTimeout(() => api("time-offer", { method: "POST", body: timeBody(ans.id, w, ans.start, f, { role: "asked" }) }).then(() => keepIn("inflight-timed", k), () => offerBusy.delete(k)), 0);
}

/* ---------- the engine: Chat in a frame of another page of the hub, its window.IFLChat for that page (spec §8.2) ----------
   It loads the sign-in kept on this phone, runs one sync (sync?quiet=1: Today open isn't you seen in Chats) and none on
   a timer, then says it's ready on the page it's in (ifl-chat-ready). It draws only its send sheet, shown by the page
   over itself, and says so when it's sent (parent.IFL.hub.sent) or shut (closed). What's waiting for you is read here,
   in memory, and only the words the page will show go to it, through pigeon/digest.js: nothing marked read, nothing
   kept. */
const WAIT_KEY = "ifl-chat-wait";
// the page this engine is in, its own IFL.hub (null off the hub, or at the top)
const hubParent = () => { if (!ENGINE) return null; try { return parent.IFL?.hub || null; } catch (_) { return null; } };
let engineKey = false;
const engineState = () => (!S.token || !S.me || !S.priv ? (engineKey ? "key" : "signin") : S.locked ? "locked" : "ready");
// a card given to the engine, checked exactly as a #share= link's is (pigeon/cards.js readShareHash: normCard, from a
// link, so never with a Fitness share id), and its words. → { card, words } | null
function engineCard(words, packed) {
  const w = String(words ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
  const c = typeof packed === "string" && /^[A-Za-z0-9_-]+$/.test(packed) ? `&card=${packed}` : "";
  let r = null; try { r = readShareHash(`#share=${encodeURIComponent(w)}${c}`); } catch (_) {}
  return r?.card ? { card: r.card, words: typeof r.words === "string" ? r.words : w } : null;
}
// share: the send sheet over the page, with the card; → once it's sent ({ ok: true, say }), shut ({ ok: false, why }),
// or refused (false: not ready, or no card that passes)
// (bySendTo: the sheet sendTo opened for a friend it couldn't send to in one tap; once it's sent, the page's sendTo says
// so from the answer, so the engine doesn't say it too)
function engineShare(words, packed, { to } = {}, bySendTo = false) {
  if (engineState() !== "ready") return Promise.resolve(false);
  const x = engineCard(words, packed); if (!x) return Promise.resolve(false);
  return new Promise((ok) => {
    const en = { finished: false, bySendTo, done: (r) => { if (en.finished) return; en.finished = true; ok(r); } };
    closePop();
    openSendSheet(x.card, { words: x.words, link: true, engine: en, to: typeof to === "string" ? to : null });
    if (S.sheet?.engine !== en) en.done(false);
  });
}
// sendTo: one tap, to one friend whose key you trust and that hasn't changed (or a group, every one of theirs so),
// as the sheet's Send would; anyone else, the sheet with them chosen
async function engineSendOne(id, words, packed) {
  if (engineState() !== "ready") return { ok: false, why: engineState() };
  const x = engineCard(words, packed); if (!x) return { ok: false, why: "card" };
  const f = friend(id), g = !f && group(id);
  if ((!f && !g) || f?.keyChanged || (g && others(g).some((p) => p.keyChanged))) return engineShare(words, packed, { to: id }, true);
  const s = { type: "send", card: x.card, base: String(x.words || x.card.say || cardWords(x.card) || "").trim().slice(0, 500), words: "", edited: false, link: true, engine: null, back: null,
    pick: [], when: "now", ask: false, plan: false, together: null, win: 0, rain: null, seen: new Map(), asked: [], busy: false, progress: null, err: "", note: "" };
  if (!sendRows(s).some((r) => r.id === id && r.can)) return engineShare(words, packed, { to: id }, true);
  s.pick = [id];
  const r = await sendRun(s);
  if (!r) return { ok: false, why: s.err || "offline" };
  if (r.failed.length) return { ok: false, why: "failed", say: r.results.find((x) => !x.ok)?.err || "Couldn’t send it." };
  sync().catch(() => {});
  return { ok: true, say: r.say || "Sent" };
}
// one chat's messages from them since your last (5 at most), read and opened here, in memory: nothing marked read,
// nothing kept. after: only those that landed at or after it. → digest.js's item | null
async function waitingItem(id, after = -Infinity) {
  const f = friend(id), g = !f && group(id); if (!f && !g) return null;
  // (quiet=1, as the engine's sync: Today being open isn't a day you used Chats, where the server reads it)
  const d = await api(f ? `messages?with=${encodeURIComponent(id)}&quiet=1` : `group-messages?id=${encodeURIComponent(id)}&quiet=1`);
  const list = Array.isArray(d.messages) ? d.messages : [];
  let i = list.length - 1; while (i >= 0 && list[i].from !== S.me.id) i--;
  const theirs = list.slice(i + 1).filter((m) => m.from !== S.me.id && !m.flying && !m.lost && !m.waiting && (m.deliverAt || 0) >= after).slice(-5);
  if (!theirs.length) return null;
  for (const m of theirs) { try { if (g) await decryptGroup(g, m); else await decrypt(id, m); } catch (_) {} }
  const msgs = theirs.map((m) => digestMsg(m, !!g)).filter(Boolean);
  return msgs.length ? { id, first: g ? g.name : first(f.name), at: theirs.at(-1).deliverAt, msgs } : null;
}
async function engineWaiting({ ids, stocks } = {}) {
  if (engineState() !== "ready") return [];
  if (Array.isArray(stocks)) S.stocks = stocks.filter((x) => x && typeof x === "object" && (typeof x.sym === "string" || typeof x.name === "string"))
    .slice(0, 50).map((x) => ({ sym: typeof x.sym === "string" ? x.sym.slice(0, 12) : undefined, name: typeof x.name === "string" ? x.name.slice(0, 60) : undefined }));
  const want = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && x.length <= 64))].slice(0, 6), items = [];
  for (const id of want) { try { const it = await waitingItem(id); if (it) items.push(it); } catch (_) {} }
  try { return waitingDigest(items, { stocks: S.stocks || [], now: Date.now() }); } catch (_) { return []; }
}
// their messages delivered at or after t, the same way: → { said, at } | null
async function engineSince(id, t) {
  if (engineState() !== "ready" || typeof id !== "string" || !Number.isFinite(t)) return null;
  try {
    const it = await waitingItem(id, t); if (!it) return null;
    const d = waitingDigest([it], { stocks: S.stocks || [], now: Date.now() })[0];
    return d ? { said: d.said, at: d.at } : null;
  } catch (_) { return null; }
}
async function engineSignOut() {
  try { if (S.token) await api("logout", { method: "POST" }).catch(() => {}); } catch (_) {}
  await forget(true).catch(() => {});
  engineKey = false;
  return true;
}
// (the keyboard, for the engine's sheet: the page's own visual viewport, as a frame's own doesn't shrink for it)
function engineKeyboard() {
  let vv = null; try { vv = parent.visualViewport; } catch (_) {}
  if (!vv) return;
  const doc = document.documentElement, fit = () => {
    let h = 0, ih = 0; try { h = vv.height + vv.offsetTop; ih = parent.innerHeight; } catch (_) { return; }
    if (ih - h > 80) doc.style.setProperty("--app-h", `${Math.round(h)}px`); else doc.style.removeProperty("--app-h");
    doc.classList.toggle("kbup", ih - h > 80);
  };
  vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
}
// (the engine's own getters for the page's tap, taken as it starts, before anything of the page's could reach them)
const UA_GET = (() => { try { return Object.getOwnPropertyDescriptor(Navigator.prototype, "userActivation")?.get || null; } catch (_) { return null; } })();
const ACTIVE_GET = (() => { try { return Object.getOwnPropertyDescriptor(UserActivation.prototype, "isActive")?.get || null; } catch (_) { return null; } })();
function engineReady() {
  window.IFLChat = makeIFLChat({ state: engineState, share: engineShare, sendOne: engineSendOne, waiting: engineWaiting, since: engineSince,
    refresh: () => (S.token && S.priv ? sync().then(() => true, () => false) : Promise.resolve(false)), signOut: engineSignOut,
    tapped: () => { try { return tappedOn(parent.navigator, UA_GET, ACTIVE_GET); } catch (_) { return false; } } });
  try { parent.dispatchEvent(new parent.Event("ifl-chat-ready")); } catch (_) {}
}
// At the top, at the hub: a card handed over by the engine's Write More in the Chat (this tab's own storage, once, for
// ten minutes), waiting above that chat's box, checked again as any card is. Kept till the chat it's for is known here
function takeWait() {
  if (!HUB || ENGINE) return;
  let w = null; try { w = JSON.parse(sessionStorage.getItem(WAIT_KEY) || "null"); } catch (_) {}
  if (!w) return;
  const drop = () => { try { sessionStorage.removeItem(WAIT_KEY); } catch (_) {} };
  if (typeof w.chat !== "string" || !(Date.now() - w.at < 10 * MIN)) return drop();
  if (!chatOf(w.chat)) return;
  drop();
  let card = null; try { card = normCard(w.card, { from: "hash" }); } catch (_) {}
  if (!card || (card.there && (group(w.chat) || !canForward(card, { mine: true, to: w.chat })))) return;
  S.cardWait = { chat: w.chat, card };
  if (S.view === "chat") renderCompose();
}
async function engineStart() {
  // (a computer: Chat doesn't run there, so the page sends through Chats' own address at once, which says so)
  if (document.documentElement.dataset.device === "computer") return engineReady();
  // (its one sheet is later.js's: loaded alongside, and there before it says it's ready)
  const sheets = later().catch(() => {});
  engineKeyboard();
  try {
    const saved = await idb.get("session");
    if (saved?.token && saved.priv) {
      S.token = saved.token; S.me = saved.me; S.priv = saved.priv; S.myPub = saved.pub || saved.me.pub;
      S.fp = await E2E.fingerprint(S.myPub);
      S.pins = (await idb.get("pins:" + saved.me.id)) || {};
      if (Object.keys(S.pins).length) await restorePins(); else S.pinsWait = restorePins().catch(() => {}).finally(() => { S.pinsWait = null; });
      if (lockPrefs()) S.locked = true;
      S.view = "engine"; render();
      await sync();
    } else {
      // (signed in to InFlite by the site's cookie, with Chat's key not on this phone yet: key; else signed out)
      const r = await api("resume", { method: "POST", body: {} }).catch(() => null);
      engineKey = !!r?.signedIn;
    }
  } catch (e) { console.warn("engine", e?.message); }
  await sheets;
  engineReady();
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
  // the engine: in a frame of another page of the hub, its own start (no screen, no timers, one quiet sync)
  if (ENGINE) { mount(); return engineStart(); }
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
  // signing in for the whole of InFlite, asked from another page of the hub (Today's Sign In: #signin-start&then=/):
  // straight to the sign-in page, and back to that page once it's done (then, a path of this site's only)
  const startIn = /^#signin-start(?:&|$)/.test(location.hash), thenTo = startIn && HUB ? hashPath(location.hash, "then") : null;
  if (startIn) history.replaceState(null, "", location.pathname);
  // (its welcome, while the trip gets ready, says "Signing in…" and takes no tap; then kept for the visit, so a sign-in
  // tried again by hand, back from the account's page say, still ends where it was asked from)
  if (startIn) { S.signingIn = true; S.thenTo = thenTo; }
  navigator.serviceWorker?.addEventListener?.("message", (e) => { if (e.data?.inflight === "open") openLink(e.data.hash); else if (e.data?.inflight === "sync" && S.me) { sync(); pushTag(e.data.tag); } });
  const m = /#add=([A-Za-z0-9_]{3,20})/.exec(location.hash);
  if (m) { keepAdd(m[1].toLowerCase()); history.replaceState(null, "", location.pathname); }
  else S.pendingAdd = keptAdd();                 // (a friend's link from before, still to use: making the account on its page in between)
  // a confirm-your-email link: works signed in or not, on any phone
  const cf = /#verify=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (cf) { history.replaceState(null, "", location.pathname); confirmEmail(cf[1]); }
  // an invite, or a reset link (from before they were the account's page's): passed on to it
  const away = /#(invite|reset)=([A-Za-z0-9_-]{40,50})/.exec(location.hash);
  if (away) return location.replace(toAccount(`#${away[1]}=${away[2]}`));
  if (!window.crypto?.subtle || !window.indexedDB) { S.signingIn = false; S.view = "welcome"; render(); arrival?.away(); return toast("This browser can’t run Chat’s encryption. Try Safari or Chrome."); }
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
    // (none on the phone yet, a friendless account say: the copy on the server is asked for once the screen's up, below)
    const had = Object.keys(S.pins).length;
    if (had) { await restorePins(); if (!S.pinsUnread && !(await idb.get("pinsup:" + saved.me.id).catch(() => null))) savePins(); }      // trusted before backups: save them now
    // (that sign-in ended while the app was closed, signed out elsewhere: the welcome, as from the start)
    if (!S.token) { movedNote(); if (signedBack) signInBack(signedBack); else if (startIn) toAccountSignIn(null, "signin", { then: thenTo }); else resumeCheck(); } else {
    S.signingIn = false;
    // (a code for a sign-in, signed in already: one from elsewhere, used up and no more)
    if (signedBack) {
      try { localStorage.removeItem(SIGNIN_KEY); } catch (_) {}
      // (swapped already on the first frame: the sign-in it made, not wanted here, signed out again; else used up)
      if (window.arvSwap?.code === signedBack) window.arvSwap.answer.then((x) => { if (x.ok && x.d?.token) fetch("/api/pigeon/logout", { method: "POST", headers: { Authorization: "Bearer " + x.d.token } }).catch(() => {}); }, () => {});
      else api("handback", { method: "POST", body: { code: signedBack, verifier: "" } }).catch(() => {});
      window.arvSwap = null;
    }
    // (signed in here already, and asked to sign in from another page of the hub: back there, nothing to do)
    if (startIn && thenTo && thenTo !== location.pathname) return location.replace(thenTo);
    if (IN_PAGE && !signedBack && !startIn && !/^#(signin|verify=|invite=|reset=|account\b)/.test(IN_AT)) return location.replace("/pigeon/" + IN_AT);
    S.view = S.pendingAdd ? "friends" : "messages";
    if (lockPrefs()) S.locked = true;               // the app lock: locked before anything is drawn
    await cacheLoad();                             // what you saw last time, at once
    await outboxLoad();
    await draftsLoad();
    render();
    // (nothing trusted on this phone yet: the copy on the server, fetched now, and waited for by any sync before it
    // trusts a key it shows, not by what's drawn above)
    if (!had) S.pinsWait = restorePins().catch(() => {}).finally(() => { S.pinsWait = null; });
    arrival?.away();                               // (and the account's page's sky it came in under clears to it)
    // (the app is up by now: anything below going wrong mustn't stop the polling and the rest)
    try {
      // back from an update: the chat you were in (if it was moments ago: IFL.updates)
      const here = IFL.here("chat");
      if (here?.chat && !S.pendingLink && (friend(here.chat) || group(here.chat))) S.pendingLink = "#open=" + here.chat;
      takeWait();
      // a chat to open (a notification, or the one you were in) that's already on this phone: at once, not after the network
      if (S.pendingLink && !S.locked) { const id = /#open=([\w-]+)/.exec(S.pendingLink)?.[1]; if (id && (friend(id) || group(id))) { const h = S.pendingLink; S.pendingLink = null; openLink(h); } }
      await sync();
      outboxFlush();
      takeWait();
      if (S.me && S.me.lat == null && !S.me.moon) go("locpick");
      else if (S.pendingAdd) { S.sheet = { type: "addfriend" }; renderSheet(); }
      else if (S.pendingLink) { const h = S.pendingLink; S.pendingLink = null; openLink(h); }
      refreshPush(); autoLocate(); movedNote();
      if (ASK_NOTIFY) setTimeout(askNotify, 600);
      // (an old Home Screen icon, off the hub: once, that InFlite is one app now, and notifications here can be turned off)
      if (!HUB) IFL.hub?.moved?.("chat", { off: () => pushDisable(true) });
    } catch (e) { console.error("start", e); }
    }
  } else {
    if (S.view !== "welcome") go("welcome"); movedNote();
    if (signedBack) signInBack(signedBack);
    else if (startIn) toAccountSignIn(null, "signin", { then: thenTo });
    else resumeCheck();
  }
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
  setInterval(() => { if (!AUTH_VIEWS.has(S.view) && $view) live(); flightCheck(); pulseTick(); }, 1000);
  // every 15 s while open; after failures, less often (up to every 2 minutes) until one works
  let skipped = 0;
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const every = Math.min(8, 2 ** Math.max(0, (S.syncFails || 0) - 1));
    if (++skipped < every) return;
    skipped = 0; sync();
  }, POLL_MS);
  window.addEventListener("online", () => { S.syncFails = 0; S.live.fullAt.clear(); S.live.fails = 0; sync(); pulseNow(); });
  window.addEventListener("offline", () => S.live.fullAt.clear());
  setInterval(() => { if (document.visibilityState === "visible") autoLocate(); }, AUTO_EVERY);
  laterSoon();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(); autoLocate(); pulseNow(); } else { stopLocWatch(); if (rec) recStop(false); draftsSave(); pulseHide(); } });     // (a recording stops when you leave the app; what's in the box is kept)
}

/* ---------------- updates ----------------
   A new version's put in by itself, the same in every app (InFlite's menu: IFL.updates): never while you're writing,
   recording, sending, playing a voice note, signing in or in a sheet; the chat you were in kept for it, and opened
   again (start). */
if (!ENGINE) IFL.updates({ app: "chat", build: APP_VERSION,
  busy: () => !!(S.sheet || S.attach || ($ta && $ta.value.trim()) || (AUTH_VIEWS.has(S.view) && S.view !== "welcome") || $(".asheet, .menu-pop")
    || inField(document.activeElement) || rec || onceOpen || (S.player && !S.player.paused) || S.busy),
  save: () => (S.me && S.view === "chat" && S.chat ? { chat: S.chat } : null) });
// (and its version, kept for your account's page, and said once if it's new since last time, with what's new)
if (!ENGINE) IFL.built("chat", APP_VERSION, APP_NEWS);
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
  if (due.length && Date.now() > nextLanding) { nextLanding = Date.now() + 5000; setTimeout(() => { S.live.forceChat = true; sync(); }, 1500); }
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
// (never the engine's: the page it's in has its own, and the hub's worker holds its notifications)
if (!ENGINE && "serviceWorker" in navigator && !IN_PAGE && document.documentElement.dataset.device !== "computer") navigator.serviceWorker.register("/pigeon/sw.js", { scope: "/pigeon/" }).catch(() => {});
start().catch(bootFail);
