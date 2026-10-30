// Markets: your money and the markets, said simply. Three screens on a tab bar:
//
// - Today: what you own, worth now and how it's done today, drawn through the day; one line on what moved it; what's
//   worth knowing, one card at a time (an odd move, a holding near its high, a big week, how much is in one company,
//   your dividends, how you've done since you bought); your biggest movers; and London, New York and Bitcoin.
// - Holdings: everything you own and follow (in your order: press and hold one to move it), the ring of your mix, and your accounts (ISA, pension, general) with what's
//   left of your ISA's allowance for the tax year; your income: the dividends you can expect, month by month; and your
//   year against the market (the FTSE 100, the world's shares, the S&P 500), drawn line against line.
// - News: the day in two sentences, then the stories about what you hold.
//
// Tap anything for its page: its price, a chart you can read with your finger, from a day to five years (reshaping as
// you switch); why it's moving (the day's news about it, or the market it's moving with); what yours is worth; its day,
// its year and its dividends; your buys and sales of it (how many you own, and what each cost on average, worked out from
// them); and an alert for when it moves 3%, or it sent to a friend in Chat. And once a weekday, after
// your markets close, the evening wrap: how your day went, on your phone.
//
// Signed in only: with your InFlite account, the one every app on the site uses, signed in on the account's own page
// (account.js). Your list is kept with the account; the prices come through Markets's own API, fetched once a minute
// for everyone (functions/_markets.js), and kept fresh here every half a minute while the app is open.

import * as A from "./account.js";
import * as C from "./charts.js";

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

// (Markets's version: up by 0.01 with each change to it that goes out)
const BUILD = "1.68";
const INDICES = ["^FTSE", "^GSPC", "BTC-USD"];
const INDEX_NAMES = { "^FTSE": "FTSE 100", "^GSPC": "S&P 500", "BTC-USD": "Bitcoin", "^IXIC": "Nasdaq" };
// each exchange's market, to say how a holding did against it (the two the app has prices for anyway)
const MARKET_OF = { London: "^FTSE", Nasdaq: "^GSPC", NYSE: "^GSPC", "NYSE American": "^GSPC", "NYSE Arca": "^GSPC" };
// what your year's set against: London's market, the world's shares and America's, each followed through a fund that
// tracks it (iShares' FTSE 100, Vanguard's All-World, SPDR's S&P 500), so its dividends count as yours do
const BENCHES = [["ISF.L", "FTSE 100"], ["VWRL.L", "the world"], ["SPY", "S&P 500"]];
// the accounts a holding can be held in; and an ISA's allowance, for each tax year (6 April to 5 April)
const ACCOUNTS = [["isa", "ISA"], ["sipp", "Pension"], ["gia", "General"]];
const ACCOUNT_NAME = Object.fromEntries(ACCOUNTS);
// your portfolio, seen over the day, or (as if you'd held what you own now) a week, a month or a year
const PRANGES = [["1d", "1D", "today"], ["5d", "1W", "this week"], ["1mo", "1M", "this month"], ["1y", "1Y", "this year"]];
const RANGES = [["1d", "1D", "today"], ["5d", "1W", "this week"], ["1mo", "1M", "this month"], ["1y", "1Y", "this year"], ["5y", "5Y", "in 5 years"]];

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), sbody = $("#sbody"), tabsEl = $("#tabs"), toastEl = $("#toast");
const S = { me: null, list: [], q: {}, fx: { GBP: 1 }, years: {}, news: null, tab: "today", charts: new Map(), pushOn: false, newer: false, alertsOff: false, isa: null, wrap: true, vs: null, paid: null, prange: "1d", mix: "holding", fig: "day" };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("markets:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("markets:" + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem("markets:" + k); } catch (_) {} },
};

// ---- building the page ----
function h(sel, attrs = {}, ...kids) {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(sel), e = document.createElement(m[1]);
  for (const part of m[2].match(/[.#][\w-]+/g) || []) part[0] === "." ? e.classList.add(part.slice(1)) : (e.id = part.slice(1));
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "text") e.textContent = v;
    // (styles set as the page's own, never as an attribute: its rules allow no inline ones)
    else if (k === "style") e.style.cssText = v;
    else if (k === "vars") for (const [n, x] of Object.entries(v)) e.style.setProperty("--" + n, x);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
// (InFlite's glyphs, and Markets's own few)
const GLYPHS_MK = { check: '<path d="m5 12.5 4.5 4.5L19 7"/>' };
const icon = (name, size = 18, w = 2.2) => { const s = C.el("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }); s.innerHTML = GLYPHS_MK[name] || IFL.glyph(name).replace(/^<svg[^>]*>|<\/svg>$/g, ""); return s; };

// ---- saying numbers ----
const SYM = { GBP: "£", USD: "$", EUR: "€", JPY: "¥", INR: "₹" };
const fmt = (n, d = 2) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, cur = "GBP", d = 2) => (v < 0 ? "−" : "") + (SYM[cur] ?? "") + fmt(Math.abs(v), d) + (SYM[cur] || !cur ? "" : " " + cur);
const signed = (v, cur = "GBP", d = 2) => (v >= 0 ? "+" : "−") + (SYM[cur] ?? "") + fmt(Math.abs(v), d) + (SYM[cur] || !cur ? "" : " " + cur);
const pct = (v, d = 2) => (v == null ? "–" : (v >= 0 ? "+" : "−") + fmt(Math.abs(v), d) + "%");
const tone = (v) => (v == null || Math.abs(v) < 0.005 ? "flat-t" : v >= 0 ? "up-t" : "down-t");
const isIndex = (q) => q?.type === "INDEX";
// what kind of thing it is (functions/_markets.js kindOf), and said
const kindOf = (q) => q?.kind || (q?.type === "ETF" || q?.type === "MUTUALFUND" ? "fund" : q?.type === "INDEX" ? "index" : q?.type === "CRYPTOCURRENCY" ? "crypto" : "share");
const KIND_SAID = { share: "Share", trust: "Investment trust", fund: "Fund", index: "Index", crypto: "Crypto", currency: "Currency" };
const KINDS_SAID = { share: "Shares", trust: "Investment trusts", fund: "Funds", crypto: "Crypto" };
// a few well-known investment trusts, to start from
const TRUST_PICKS = [["SMT.L", "Scottish Mortgage"], ["FCIT.L", "F&C"], ["CTY.L", "City of London"], ["ALW.L", "Alliance Witan"], ["PCT.L", "Polar Capital Technology"], ["MNKS.L", "Monks"], ["RCP.L", "RIT Capital Partners"], ["MYI.L", "Murray International"]];
const digits = (v) => (v >= 10000 ? 0 : v >= 1000 ? 1 : v < 1 ? 4 : 2);
// (London's under a pound, in pence, as it's quoted there)
const priceSaid = (q, v = q?.price) => (v == null ? "–" : isIndex(q) ? fmt(v, v >= 1000 ? 1 : 2) : q.cur === "GBP" && Math.abs(v) < 1 ? `${fmt(v * 100, 2)}p` : money(v, q.cur, q.type === "CRYPTOCURRENCY" && v >= 1000 ? 0 : digits(v) === 1 ? 2 : digits(v)));
const nameOf = (sym) => S.list.find((x) => x.symbol === sym)?.name || INDEX_NAMES[sym] || S.q[sym]?.name || sym;
const plainSym = (s) => s.replace(/\.L$/, "").replace(/^\^/, "");
const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "now" : m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const and2 = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0] || "");

// ---- your money ----
const rate = (cur) => (cur ? S.fx[cur] ?? null : null);
const owned = () => S.list.filter((x) => x.qty > 0 && S.q[x.symbol]?.price != null && rate(S.q[x.symbol].cur) != null);
const valueOf = (x) => { const q = S.q[x.symbol]; return q?.price != null && rate(q.cur) != null ? q.price * x.qty * rate(q.cur) : null; };
const dayOf = (x) => { const q = S.q[x.symbol]; return q?.price != null && q.prev && rate(q.cur) != null ? (q.price - q.prev) * x.qty * rate(q.cur) : null; };
// what one's paid you in dividends since you bought it, in pounds (null: not known, with no day to count from)
const divsOf = (x) => { const p = S.paid?.v?.[x.symbol], r = rate(S.q[x.symbol]?.cur); return p && r != null ? p.paid * r : null; };
// what one cost you, in pounds
const paidFor = (x) => x.cost * x.qty * rate(S.q[x.symbol].cur);
// (gain: in price; divs: the dividends on top, from those with a day to count from; back: the two together, on what you paid)
function totals() {
  const o = owned(), value = o.reduce((a, x) => a + valueOf(x), 0), day = o.reduce((a, x) => a + (dayOf(x) || 0), 0);
  const costed = o.filter((x) => x.cost != null), paid = costed.reduce((a, x) => a + paidFor(x), 0), now = costed.reduce((a, x) => a + valueOf(x), 0);
  const divs = costed.reduce((a, x) => a + (divsOf(x) || 0), 0), gain = costed.length ? now - paid : null;
  return { o, value, day, dayPct: value - day ? (day / (value - day)) * 100 : 0, paid, gain, gainPct: paid ? ((now - paid) / paid) * 100 : null, costed,
    divs, back: gain == null ? null : gain + divs, backPct: paid ? ((gain + divs) / paid) * 100 : null, undated: costed.filter((x) => divsOf(x) == null && S.years[x.symbol]?.div12 > 0) };
}
// your money in each account (and what's in none yet): [{ key, name, o, value, day }], largest first
function byAccount(o = owned()) {
  const out = [...ACCOUNTS, [null, "Not in an account"]].map(([key, name]) => { const xs = o.filter((x) => (x.account || null) === key);
    return { key, name, o: xs, value: xs.reduce((a, x) => a + valueOf(x), 0), day: xs.reduce((a, x) => a + (dayOf(x) || 0), 0) }; });
  return out.filter((a) => a.o.length).sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || b.value - a.value);
}
// Your income: each dividend each holding paid over the last year, for what you own now, expected again a year on, in
// the month it went ex-dividend. { months: the next twelve, from this one ({ d, total, items }), events (to come, soonest
// first), payers (largest first, with each one's yield), total (a year's) }
function income() {
  const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth();
  const months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(y0, m0 + i, 1), total: 0, items: [] })), events = [], payers = [];
  for (const x of owned()) {
    const yr = S.years[x.symbol], q = S.q[x.symbol];
    if (!yr?.divs?.length) continue;
    let year = 0;
    for (const d of yr.divs) {
      // (only the last year's: one older isn't next year's to expect)
      if (d.t * 1000 < now - 365 * 864e5) continue;
      const v = d.amount * x.qty * rate(q.cur), at = new Date(d.t * 1000);
      at.setFullYear(at.getFullYear() + 1);
      // (one that's gone this month already comes round again next year, in this month's place)
      let k = (at.getFullYear() - y0) * 12 + at.getMonth() - m0;
      if (k >= 12) k -= 12;
      year += v;
      months[Math.max(0, k)].total += v; months[Math.max(0, k)].items.push({ x, v, at });
      events.push({ x, v, at });
    }
    payers.push({ x, year, yld: q.price ? (yr.div12 / q.price) * 100 : null });
  }
  return { months, events: events.filter((e) => e.at > now).sort((a, b) => a.at - b.at), payers: payers.sort((a, b) => b.year - a.year), total: payers.reduce((a, p) => a + p.year, 0) };
}
const monthSaid = (d, long = false) => d.toLocaleDateString("en-GB", { month: long ? "long" : "short" });
// a year of it, a bar a month (the chosen one bright)
function incomeBars(I, chosen, onPick, tall = 120) {
  const max = Math.max(...I.months.map((m) => m.total), 0.01);
  // (as buttons, each says its month and what's in it; drawn small in a row, the row is a picture, its words the row's)
  return h("div.ibars", onPick ? { role: "group", "aria-label": "Dividends by month" } : { "aria-hidden": "true" }, I.months.map((m, i) => h(onPick ? "button.ib" : "span.ib", { ...(onPick ? { type: "button", "aria-pressed": String(i === chosen), onclick: () => onPick(i), "aria-label": `${monthSaid(m.d, true)}: ${money(m.total, "GBP", 0)}` } : {}), vars: { k: String(i) } },
    h("i", { class: m.total > 0 ? null : "none", style: `height:${Math.max(3, Math.round((m.total / max) * tall))}px` }), h("span", { text: monthSaid(m.d).slice(0, onPick ? 3 : 1) }))));
}

// the ISA's tax year: what's left of its allowance, and how long to use it (it ends on 5 April, London's)
function isaYear() {
  if (!S.isa) return null;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  const endY = m > 4 || (m === 4 && d >= 6) ? y + 1 : y, days = Math.round((Date.UTC(endY, 3, 5) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
  const left = Math.max(0, S.isa.allowance - S.isa.paid);
  return { ...S.isa, left, days, used: Math.min(1, S.isa.paid / S.isa.allowance) };
}
const tracksIsa = () => !!S.isa && (S.isa.paid > 0 || S.list.some((x) => x.account === "isa"));
const allowBar = (used) => h("div.allow", {}, h("i", { style: `width:${Math.max(used > 0 ? 2 : 0, used * 100)}%` }));

// your money through the day: each holding at its price at each moment (its last close before it opened)
function daySeries() {
  const o = owned(), drawn = o.filter((x) => S.q[x.symbol].sparkT?.length > 1);
  if (!drawn.length) return null;
  const T = [...new Set(drawn.flatMap((x) => S.q[x.symbol].sparkT))].sort((a, b) => a - b);
  if (T.length < 2) return null;
  const base = o.reduce((a, x) => a + S.q[x.symbol].prev * x.qty * rate(S.q[x.symbol].cur), 0);
  const vals = T.map((t) => o.reduce((a, x) => {
    const q = S.q[x.symbol]; let p = q.prev, j = -1;
    for (let i = 0; i < (q.sparkT?.length || 0) && q.sparkT[i] <= t; i++) j = i;
    if (j >= 0) p = q.spark[j];
    return a + p * x.qty * rate(q.cur);
  }, 0));
  // (now, at the end: the prices as they are)
  vals[vals.length - 1] = totals().value;
  return { T, vals, base };
}

// ---- the markets, open or shut ----
function marketSaid() {
  const now = Date.now() / 1000, say = (sym, where) => {
    const q = S.q[sym], o = q?.open;
    if (!o) return null;
    if (now >= o.start && now < o.end) { const m = Math.round((o.end - now) / 60), hrs = Math.floor(m / 60); return { open: true, text: `${where} open · closes in ${hrs ? `${hrs}h ` : ""}${m % 60}m` }; }
    return null;
  };
  return say("^FTSE", "London") || say("^GSPC", "New York") || { open: false, text: "Markets closed" };
}

// ---- what's worth knowing ----
function insights() {
  const out = [], o = owned(), T = totals(), list = S.list.filter((x) => S.q[x.symbol]?.chgPct != null);
  // an odd one: a holding going the other way from its market, by a fair way
  for (const x of list) {
    const q = S.q[x.symbol], m = S.q[MARKET_OF[q.ex]];
    if (!m || m.chgPct == null) continue;
    if (Math.sign(q.chgPct) !== Math.sign(m.chgPct) && Math.abs(q.chgPct - m.chgPct) > 1.5) {
      out.push({ rank: 5, kick: "An odd one", c: "var(--warn)", sym: x.symbol, h: `${x.name} is ${q.chgPct < 0 ? "falling" : "rising"} while the ${INDEX_NAMES[MARKET_OF[q.ex]]} ${m.chgPct >= 0 ? "rises" : "falls"}`,
        p: `${x.name} is ${q.chgPct < 0 ? "down" : "up"} ${fmt(Math.abs(q.chgPct))}% today; the market's ${m.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(m.chgPct))}%.`,
        viz: () => vbars([[x.name, q.chgPct], [INDEX_NAMES[MARKET_OF[q.ex]], m.chgPct]]) });
      break;
    }
  }
  // near its year's high or low
  for (const x of list) {
    const q = S.q[x.symbol], y = S.years[x.symbol], hi = q.hi52 ?? y?.hi52, lo = q.lo52 ?? y?.lo52;
    if (!hi || !lo || hi <= lo) continue;
    const at = (q.price - lo) / (hi - lo);
    if (q.price >= hi * 0.98) { out.push({ rank: 4, kick: "Near its high", c: "var(--up)", sym: x.symbol, h: `${x.name} is close to its 52-week high`, p: y?.yr != null ? `It's ${y.yr >= 0 ? "up" : "down"} ${fmt(Math.abs(y.yr), 0)}% on a year ago.` : `${priceSaid(q, hi)} is the highest it's been in a year.`, viz: () => range52(q, lo, hi, at) }); break; }
    if (q.price <= lo * 1.02) { out.push({ rank: 4, kick: "Near its low", c: "var(--down)", sym: x.symbol, h: `${x.name} is close to its 52-week low`, p: `It's ${fmt((1 - q.price / hi) * 100, 0)}% below its high of the year.`, viz: () => range52(q, lo, hi, at) }); break; }
  }
  // a big week
  const wk = list.map((x) => ({ x, w: S.years[x.symbol]?.wk })).filter((a) => a.w != null && Math.abs(a.w) >= 6).sort((a, b) => Math.abs(b.w) - Math.abs(a.w))[0];
  if (wk) out.push({ rank: 3, kick: "This week", c: "var(--blue)", sym: wk.x.symbol, h: `${wk.x.name} is ${wk.w >= 0 ? "up" : "down"} ${fmt(Math.abs(wk.w), 0)}% this week`, p: `Over the last five trading days, against ${pct(S.q[wk.x.symbol].chgPct)} today.`, viz: () => sparkCard(wk.x.symbol) });
  // how much is in one company (or one trust, which spreads it across many itself; a fund's spread is the point of it)
  if (o.length >= 2) {
    const top = [...o].sort((a, b) => valueOf(b) - valueOf(a))[0], share = Math.round((valueOf(top) / T.value) * 100), k = kindOf(S.q[top.symbol]);
    const part = share >= 50 ? "over half" : share >= 34 ? "over a third" : "almost a third";
    if (share >= 30 && (k === "share" || k === "trust")) out.push({ rank: 2, kick: "Your mix", c: "var(--blue)", sym: top.symbol, h: `${share}% of your money is in one ${k === "trust" ? "trust" : "company"}`,
      p: k === "trust" ? `${top.name} is ${part} of what you own. It spreads that across many companies itself, but its days still move your total most.`
        : `${top.name} is ${part} of what you own, so its days move your total more than the market does.`, viz: () => mixBar(o) });
  }
  // dividends, from what each paid over the last year
  const divs = o.map((x) => ({ x, v: (S.years[x.symbol]?.div12 || 0) * x.qty * rate(S.q[x.symbol].cur) })).filter((a) => a.v > 0.5).sort((a, b) => b.v - a.v);
  if (divs.length) {
    const sum = divs.reduce((a, d) => a + d.v, 0);
    out.push({ rank: 1.5, kick: "Dividends", c: "var(--up)", open: () => openSheet(incomeView), h: `About ${money(sum, "GBP", 0)} a year in dividends`, p: `From ${and2(divs.slice(0, 3).map((d) => d.x.name))}${divs.length > 3 ? " and others" : ""}, at what they paid over the last year.`,
      viz: () => vbars(divs.slice(0, 3).map((d) => [d.x.name, d.v]), (v) => money(v, "GBP", 0), divs[0].v) });
  }
  // what's left of the ISA's allowance, in the tax year's last eight weeks
  const iy = isaYear();
  if (iy && tracksIsa() && iy.left > 0 && iy.days <= 56) out.push({ rank: 2.6, kick: "Your ISA", c: "var(--up)", open: () => openSheet(isaView), h: `${money(iy.left, "GBP", 0)} of your ISA allowance left`,
    p: `It goes on 5 April, ${plural(iy.days, "day")} from now, and what isn't used doesn't carry over to the next tax year.`, viz: () => allowBar(iy.used) });
  // since you bought
  if (T.back != null && T.costed.length) out.push({ rank: 1, kick: "Since you bought", c: T.back >= 0 ? "var(--up)" : "var(--down)", h: `${T.back >= 0 ? "Up" : "Down"} ${money(Math.abs(T.back), "GBP", 0)} on what you paid`,
    p: `${pct(T.backPct, 1)} across ${plural(T.costed.length, "holding")} you've said what you paid for${T.divs >= 0.5 ? `, ${money(T.divs, "GBP", 0)} of it in dividends` : ""}.` });
  if (!out.length && list.length) {
    const big = [...list].sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0], q = S.q[big.symbol];
    out.push({ rank: 0, kick: "A quiet day", c: "var(--text-2)", sym: big.symbol, h: "Nothing out of the ordinary today", p: `Your biggest mover is ${big.name}, ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct))}%.` });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 4);
}
const vbars = (rows, say = (v) => pct(v), max = Math.max(...rows.map((r) => Math.abs(r[1])), 0.01)) =>
  h("div.vbar", {}, rows.map(([k, v], i) => h("div", {}, h("span", { text: k }), h("s", { style: `width:${Math.max(4, (Math.abs(v) / max) * 100)}%;background:${v >= 0 ? "var(--up)" : "var(--down)"};animation-delay:${i * 0.12 + 0.2}s` }), h("b.num", { class: `num ${tone(v)}`, text: say(v) }))));
const range52 = (q, lo, hi, at) => [h("div.range52", { vars: { c: at > 0.5 ? "var(--up-soft)" : "var(--down-soft)" } }, h("i", { style: `left:${Math.max(0, Math.min(100, at * 100))}%` })), h("div.ends.num", {}, h("span", { text: priceSaid(q, lo) }), h("span", { text: priceSaid(q, hi) }))];
const MIXC = ["#7db8ff", "#9b8cff", "#5ed6cc", "#ffc56e", "#ff9fb2", "#a5b4c8"];
const mixBar = (o) => h("div.mix", {}, [...o].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 6).map((x, i) => h("i", { style: `flex:${valueOf(x)};background:${MIXC[i]};animation-delay:${0.2 + i * 0.06}s` })));
function sparkCard(sym) {
  const q = S.q[sym], s = C.el("svg", { viewBox: "0 0 300 44", preserveAspectRatio: "none", style: "width:100%;height:44px;margin-top:6px;overflow:visible", "aria-hidden": "true" });
  const p = C.el("path", { d: C.spark(q.spark, 300, 44, q.prev), fill: "none", stroke: q.chgPct >= 0 ? "var(--up)" : "var(--down)", "stroke-width": 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" });
  s.append(p); requestAnimationFrame(() => C.drawIn(p, 0.3)); return s;
}

// ---- the screens ----
function head(title) {
  const said = marketSaid(), line = h("span.eyebrow", { style: "font-size:15px" }, h("i.live" + (said.open ? "" : ".shut")), said.text);
  return IFL.header({ title, me: meFace(), onMe: youMenu, cls: "mhead", lineNode: line,
    acts: [{ icon: "search", label: "Find and add", onclick: () => openSheet(searchView) }] });
}
const meFace = () => (S.me?.photoAt ? h("img", { src: A.photoUrl(S.me.photoAt), alt: "", width: 44, height: 44 }) : document.createTextNode((S.me?.name || "Y").trim().slice(0, 1).toUpperCase()));

// On a big screen (an iPad across, a Mac): the desk, everything at once (desk.js, fetched only there)
const DESK = matchMedia("(min-width: 1100px)");
let deskMod = null;
function render(animate = true) {
  if (!S.me) return;
  document.body.classList.remove("out");
  if (DESK.matches && S.list.length) {
    deskMod ??= import("./desk.js").catch(() => null);
    deskMod.then((m) => {
      // (if it couldn't be fetched, the phone's layout instead)
      if (!m) { DESK.failed = true; render(animate); return; }
      if (!DESK.matches) return;
      document.body.classList.add("desk-on");
      main.replaceChildren(m.deskView(animate));
      main.removeAttribute("aria-busy");
      document.title = "Markets";
    });
    if (!DESK.failed) return;
  }
  document.body.classList.remove("desk-on");
  tabsEl.style.setProperty("--tab", ["today", "holdings", "news"].indexOf(S.tab));
  tabsEl.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === S.tab ? "page" : "false"));
  const body = S.tab === "holdings" ? holdingsView() : S.tab === "news" ? newsView() : todayView();
  const view = h("section.view", {}, body);
  if (!animate) view.style.animation = "none";
  main.replaceChildren(head({ today: "Markets", holdings: "Holdings", news: "News" }[S.tab]), view);
  main.removeAttribute("aria-busy");
  document.title = { today: "Markets", holdings: "Holdings · Markets", news: "News · Markets" }[S.tab];
  requestAnimationFrame(() => { IFL.settle(window); afterDraw(animate); });
}
// (once drawn: the lines drawn in, as they come into view)
function afterDraw(animate) {
  if (!animate) return;
  main.querySelectorAll("path[data-draw]").forEach((p, i) => C.drawIn(p, Number(p.dataset.draw) || i * 0.05));
}

function todayView() {
  if (!S.list.length) return emptyView();
  const T = totals(), parts = [];
  if (T.o.length) {
    const [a, b] = fmt(T.value).split(".");
    parts.push(h("div.hero", {},
      h("span.eyebrow", { text: "Your portfolio" }),
      h("span.big.num", { id: "pv" }, `£${a}`, h("span.p", { text: "." + b })),
      h("span.delta.num", {}, h("span", { id: "pd", class: tone(T.day), text: signed(T.day) }), h("span", { id: "pp", class: tone(T.day), text: pct(T.dayPct) }), h("span.muted", { id: "ps", text: "today" }))));
    parts.push(portfolioBox());
  } else {
    const up = S.list.filter((x) => (S.q[x.symbol]?.chgPct || 0) > 0).length;
    parts.push(h("div.hero", {}, h("span.eyebrow", { text: "Your list" }), h("span.big", { style: "font-size:40px" }, `${up} of ${S.list.length} up`), h("span.delta", {}, h("span.muted", { text: "today" }))));
  }
  parts.push(h("p.say", { id: "say" }, ...daySaid(T)));
  const cards = insights();
  if (cards.length) {
    parts.push(h("h3.label", {}, "Worth knowing", h("span", { id: "cardn", text: cards.length > 1 ? `1 of ${cards.length}` : "" })));
    const box = h("div.cards", {}, cards.map((c, i) => h("button.card.glass.press.rise", { type: "button", vars: { c: c.c, i: String(i) }, onclick: () => (c.open ? c.open() : c.sym && openStock(c.sym)) },
      h("span.kick", { text: c.kick }), h("h4", { text: c.h }), h("p", { text: c.p }), c.viz ? c.viz() : null)));
    const dots = h("div.dots", { role: "group", "aria-label": "Cards" }, cards.map((_, i) => h("button", { type: "button", "aria-label": `Card ${i + 1} of ${cards.length}`,
      onclick: () => box.scrollTo({ left: i * (box.firstElementChild.offsetWidth + 12), behavior: C.still() ? "auto" : "smooth" }) }, h("i", { class: i ? null : "on" }))));
    box.addEventListener("scroll", () => { const w = box.firstElementChild.offsetWidth + 12, i = Math.round(box.scrollLeft / w); [...dots.children].forEach((d, k) => d.firstChild.classList.toggle("on", k === i)); const n = $("#cardn"); if (n) n.textContent = `${i + 1} of ${cards.length}`; }, { passive: true });
    parts.push(box, cards.length > 1 ? dots : null);
  }
  const movers = [...S.list].filter((x) => S.q[x.symbol]).sort((a, b) => Math.abs(S.q[b.symbol].chgPct ?? 0) - Math.abs(S.q[a.symbol].chgPct ?? 0)).slice(0, 4);
  parts.push(h("h3.label", {}, "Moving today", S.list.length > 4 ? h("button", { type: "button", onclick: () => go("holdings"), text: "See all" }) : null));
  parts.push(h("div.list", { id: "movers" }, movers.map((x, i) => itemRow(x, i, "day"))));
  // (what's coming up: the dividends expected in the next two months)
  const soon = T.o.length ? income().events.filter((e) => e.at - Date.now() < 62 * 864e5).slice(0, 3) : [];
  if (soon.length) {
    parts.push(h("h3.label", {}, "Coming up", h("button", { type: "button", onclick: () => openSheet(incomeView), text: "Income" })));
    parts.push(h("div.list", {}, soon.map((e, i) => { const d = Math.max(1, Math.round((e.at - Date.now()) / 864e5));
      return h("button.item.two.rise", { type: "button", vars: { i: String(i) }, onclick: () => openStock(e.x.symbol) },
        h("span", {}, h("b", { text: e.x.name }), h("small", { text: `Dividend, around ${e.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` })),
        h("span.r", {}, h("b.num", { text: `about ${money(e.v, "GBP", e.v >= 100 ? 0 : 2)}` }), h("small", { text: d < 14 ? plural(d, "day") : `${Math.round(d / 7)} weeks` }))); })));
  }
  parts.push(h("h3.label", {}, "Markets"));
  parts.push(h("div.markets", {}, INDICES.filter((s) => S.q[s]).map((s, i) => { const q = S.q[s];
    return h("button.mk.rise.press", { type: "button", vars: { i: String(i + 4) }, onclick: () => openStock(s) }, h("small", { text: INDEX_NAMES[s] }), h("b.num", { "data-px": s, text: priceSaid(q) }), h("span", { class: `num ${tone(q.chgPct)}`, "data-pct": s, text: pct(q.chgPct) })); })));
  return parts;
}
function daySaid(T) {
  const o = T.o;
  if (o.length >= 2) {
    const by = [...o].sort((a, b) => (dayOf(b) || 0) - (dayOf(a) || 0)), top = by[0], low = by.at(-1), tg = dayOf(top) || 0, lg = dayOf(low) || 0;
    if (Math.abs(T.day) < 0.01) return ["No change today yet: your holdings are as they closed."];
    const out = [];
    if (tg > 0) out.push(h("b", { text: top.name }), ` did most of the work, adding ${money(tg)}.`);
    if (lg < 0) out.push(out.length ? " " : "", h("b", { text: low.name }), ` ${out.length ? "gave back" : "took away"} ${money(-lg)}.`);
    return out;
  }
  if (o.length === 1) { const q = S.q[o[0].symbol]; return [h("b", { text: o[0].name }), ` is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct))}% today.`]; }
  const big = [...S.list].filter((x) => S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0];
  return big ? ["Biggest mover: ", h("b", { text: big.name }), `, ${pct(S.q[big.symbol].chgPct)}. Add what you own to see your portfolio.`] : [];
}
// Your portfolio's chart, in a box you can read along, with its ranges under it: the day's from its prices through the
// day; a week's, a month's and a year's from each holding's chart, what you own now at today's exchange rates
function portfolioBox() {
  const svg = portfolioChart(), box = h("div.pbox", { id: "pbox" }, svg);
  // (the range chosen kept when the page is drawn again: the day's drawn first, then reshaped to it)
  const kept = PRANGES.some(([r]) => r === S.prange) ? S.prange : "1d";
  const seg = h("div.seg.pseg", { role: "group", "aria-label": "Your portfolio over" }, h("span.sl"), PRANGES.map(([r, label]) => h("button", { type: "button", "aria-pressed": String(r === kept), "data-r": r, text: label })));
  S.prange = "1d";
  if (kept !== "1d") requestAnimationFrame(() => { const b = seg.querySelector(`[data-r="${kept}"]`); if (b) seg.querySelector(".sl").style.transform = `translateX(${b.offsetLeft}px)`; show(kept); });
  let seq = 0;
  const show = async (r) => {
    const n = ++seq;
    S.prange = r;
    box.classList.add("loading");
    const s = r === "1d" ? daySeries() : await rangeSeries(r);
    if (n !== seq || !box.isConnected) return;
    box.classList.remove("loading");
    if (!s) { toast("Couldn't draw that just now.", true); return; }
    const t0 = s.T[0], t1 = s.T.at(-1), { pts } = C.place(s.vals, 390, 150, { pad: 14, xs: s.T.map((t) => (t - t0) / (t1 - t0 || 1)), base: s.base });
    const up = s.vals.at(-1) >= s.base, line = svg.querySelector("path[data-draw]"), fill = svg.querySelectorAll("path")[0];
    svg.querySelectorAll("stop").forEach((x) => x.setAttribute("stop-color", up ? "#5fe0a6" : "#ff8a80"));
    line.setAttribute("stroke", up ? "var(--up)" : "var(--down)");
    const k = Math.max(pts.length, portfolioChart.pts?.length || 0), rs = (p) => C.resample(p.map((x) => x[0]), k).map((x, i) => [x, C.resample(p.map((y) => y[1]), k)[i]]);
    if (portfolioChart.pts) await C.tween(rs(portfolioChart.pts), rs(pts), 700, (p) => { line.setAttribute("d", C.smooth(p)); fill.setAttribute("d", C.area(p, 150)); });
    portfolioChart.pts = pts; portfolioChart.raw = { pts, s, r };
    // (and what's said over it: the change over the range, and who did it)
    const ch = s.vals.at(-1) - s.base, chp = s.base ? (ch / s.base) * 100 : 0, pd = $("#pd"), pp = $("#pp"), ps = $("#ps"), say = $("#say");
    if (pd) { pd.textContent = signed(ch); pd.className = tone(ch); pp.textContent = pct(chp); pp.className = tone(ch); ps.textContent = PRANGES.find((x) => x[0] === r)[2]; }
    if (say) say.replaceChildren(...(r === "1d" ? daySaid(totals()) : rangeSaid(s, r)));
  };
  C.scrubber(box, (x, w) => {
    const raw = portfolioChart.raw || { pts: portfolioChart.pts, s: daySeries(), r: "1d" };
    if (!raw.pts || !raw.s) return null;
    const xv = (x / w) * 390;
    let k = 0, best = Infinity;
    raw.pts.forEach((p, i) => { const d = Math.abs(p[0] - xv); if (d < best) { best = d; k = i; } });
    const t = raw.s.T[k] * 1000, r = raw.r;
    const when = r === "1d" ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : r === "5d" ? new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { x: (raw.pts[k][0] / 390) * w, y: raw.pts[k][1], label: `${money(raw.s.vals[k], "GBP", 0)} · ${when}` };
  });
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    seg.querySelector(".sl").style.transform = `translateX(${b.offsetLeft}px)`;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    show(b.dataset.r);
  });
  return [box, seg];
}
// what you own now, through a range: each holding's chart (kept ten minutes), its price carried over when its market's
// shut, at today's exchange rates. { T, vals, base, by: each holding's change over it, in pounds }
async function rangeSeries(r) {
  const o = owned(), charts = {};
  const get = async (sym) => { const k = `${sym}:${r}`, kept = S.charts.get(k); if (kept && Date.now() - kept.at < 600e3) return kept.c; const c = await A.chart(sym, r); S.charts.set(k, { at: Date.now(), c }); return c; };
  for (let i = 0; i < o.length; i += 6) await Promise.all(o.slice(i, i + 6).map((x) => get(x.symbol).then((c) => { charts[x.symbol] = c; }, () => {})));
  const held = o.filter((x) => charts[x.symbol]?.c?.length > 1);
  if (!held.length) return null;
  const key = r === "5d" ? (t) => Math.round(t / 1800) * 1800 : (t) => Date.parse(dayKey(t)) / 1000;
  const T = [...new Set(held.flatMap((x) => charts[x.symbol].t.map(key)))].sort((a, b) => a - b), vals = T.map(() => 0), by = [];
  for (const x of held) {
    const c = charts[x.symbol], m = new Map(c.t.map((t, i) => [key(t), c.c[i]])), k = x.qty * rate(S.q[x.symbol].cur);
    let last = c.c[0];
    T.forEach((t, i) => { if (m.has(t)) last = m.get(t); vals[i] += last * k; });
    by.push({ x, v: (S.q[x.symbol].price - c.c[0]) * k });
  }
  // (ending now: the prices as they are)
  vals[vals.length - 1] = held.reduce((a, x) => a + valueOf(x), 0);
  return { T, vals, base: vals[0], by };
}
function rangeSaid(s, r) {
  const by = [...s.by].sort((a, b) => b.v - a.v), top = by[0], low = by.at(-1), out = [];
  const over = { "5d": "the week", "1mo": "the month", "1y": "the year" }[r];
  if (top?.v > 0) out.push(`Over ${over}, `, h("b", { text: top.x.name }), ` did most of the work, adding ${money(top.v, "GBP", 0)}.`);
  if (low && low !== top && low.v < 0) out.push(out.length ? " " : `Over ${over}, `, h("b", { text: low.x.name }), ` ${out.length ? "gave back" : "took away"} ${money(-low.v, "GBP", 0)}.`);
  out.push(h("small", { text: " As if you'd held what you own now all along." }));
  return out;
}
function portfolioChart() {
  const s = daySeries(), svg = C.el("svg", { class: "pchart", viewBox: "0 0 390 150", preserveAspectRatio: "none", role: "img", "aria-label": "Your portfolio today", id: "pchart" });
  if (!s) return svg;
  const up = s.vals.at(-1) >= s.base, col = up ? "var(--up)" : "var(--down)", t0 = s.T[0], t1 = s.T.at(-1);
  const { pts, baseY } = C.place(s.vals, 390, 150, { pad: 14, xs: s.T.map((t) => (t - t0) / (t1 - t0 || 1)), base: s.base });
  svg.innerHTML = `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? "#5fe0a6" : "#ff8a80"}" stop-opacity=".22"/><stop offset="1" stop-color="${up ? "#5fe0a6" : "#ff8a80"}" stop-opacity="0"/></linearGradient></defs>`;
  svg.append(C.el("line", { class: "base", x1: 0, x2: 390, y1: baseY, y2: baseY, "vector-effect": "non-scaling-stroke" }));
  const fill = C.el("path", { d: C.area(pts, 150), fill: "url(#pg)", style: "opacity:0;transition:opacity 1.4s .5s" }), line = C.el("path", { d: C.smooth(pts), fill: "none", stroke: col, "stroke-width": 2, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", "data-draw": "0" });
  svg.append(fill, line);
  requestAnimationFrame(() => { fill.style.opacity = "1"; });
  portfolioChart.pts = pts;
  return svg;
}
function itemRow(x, i, mode, open = (s) => openStock(s)) {
  const q = S.q[x.symbol];
  if (!q) return h("div.item", {}, h("span", {}, h("b", { text: x.name }), h("small", { text: "Price not available just now" })));
  const own = x.qty > 0, sp = C.el("svg", { viewBox: "0 0 64 26", "aria-hidden": "true" });
  sp.append(C.el("path", { d: C.spark(q.spark, 64, 26, q.prev), fill: "none", stroke: (q.chgPct || 0) >= 0 ? "var(--up)" : "var(--down)", "stroke-width": 1.6, "stroke-linecap": "round", "data-draw": String(0.15 + i * 0.05) }));
  const right = mode === "value" && own ? [h("b.num", { "data-val": x.symbol, text: money(valueOf(x)) })] : own ? [h("b.num", { "data-dg": x.symbol, text: signed(dayOf(x)) })] : [h("b.num", { "data-px": x.symbol, text: priceSaid(q) })];
  return h("button.item.rise", { type: "button", vars: { i: String(i) }, "data-sym": x.symbol, onclick: () => open(x.symbol) },
    h("span", {}, h("b", { text: x.name }), h("small", {}, mode === "value" ? (own ? `${fmt(x.qty, x.qty % 1 ? 2 : 0)} ${x.qty === 1 ? "share" : "shares"} · ` : "") : "",
      mode === "day" && !own ? "Following" : mode === "value" && !own ? [plainSym(x.symbol), q.ex].filter(Boolean).join(" · ") : h("span.num", { "data-px": x.symbol, text: priceSaid(q) }))),
    sp, h("span.r", {}, ...right, mode === "value" && own ? figOf(x) : h("small", { class: `num ${tone(q.chgPct)}`, "data-pct": x.symbol, text: pct(q.chgPct) })));
}
// under a holding's worth: today's change, or (switched) how it's done since you bought, with its dividends
function figOf(x) {
  const q = S.q[x.symbol];
  if (S.fig !== "back") return h("small", { class: `num ${tone(q.chgPct)}`, "data-pct": x.symbol, text: pct(q.chgPct) });
  if (x.cost == null || !x.cost) return h("small", { class: "num flat-t", text: "–" });
  const paid = paidFor(x), g = valueOf(x) - paid + (divsOf(x) || 0);
  return h("small", { class: `num ${tone(g)}`, text: pct((g / paid) * 100, 1) });
}
function emptyView() {
  const picks = [["RR.L", "Rolls-Royce"], ["AAPL", "Apple"], ["VUSA.L", "Vanguard S&P 500"], ["SMT.L", "Scottish Mortgage"], ["NVDA", "Nvidia"], ["TSCO.L", "Tesco"], ["BTC-USD", "Bitcoin"]];
  return [h("div.empty", {}, h("h2.rise", { text: "Start with what you own" }),
    h("p.rise", { vars: { i: "1" }, text: "Add your shares, funds and investment trusts, and Markets tells you each day what they're worth, what moved them and what's worth knowing. Or just follow a few." }),
    h("div.rise", { vars: { i: "2" } }, h("button.btn.go.press", { type: "button", onclick: () => openSheet(searchView), style: "margin-top:10px" }, "Find and Add")),
    h("div.chips.rise", { vars: { i: "3" } }, picks.map(([s, n]) => h("button.chip.glass.press", { type: "button", onclick: () => openStock(s, { name: n }), text: n })))),
  h("h3.label", {}, "Markets"),
  h("div.markets", {}, INDICES.filter((s) => S.q[s]).map((s, i) => { const q = S.q[s];
    return h("button.mk.rise.press", { type: "button", vars: { i: String(i + 4) }, onclick: () => openStock(s) }, h("small", { text: INDEX_NAMES[s] }), h("b.num", { "data-px": s, text: priceSaid(q) }), h("span", { class: `num ${tone(q.chgPct)}`, "data-pct": s, text: pct(q.chgPct) })); }))];
}

function holdingsView() {
  if (!S.list.length) return emptyView();
  const T = totals(), parts = [];
  if (T.o.length) parts.push(...mixPart(T));
  if (T.o.length) parts.push(...statsPart(T));
  const own = S.list.filter((x) => x.qty > 0), fol = S.list.filter((x) => !(x.qty > 0));
  if (own.length) {
    // (under each one's worth: today's change, or how it's done since you bought, switched here)
    const fig = T.costed.length ? h("div.per", { role: "group", "aria-label": "Under each, show" }, [["day", "Today"], ["back", "Since bought"]].map(([k, label]) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === S.fig), text: label,
      onclick: (e) => { if (S.fig === k) return; S.fig = k; e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); $("#all")?.querySelectorAll(".item[data-sym]").forEach((r) => r.querySelector(".r small")?.replaceWith(figOf(S.list.find((x) => x.symbol === r.dataset.sym)))); } }))) : null;
    parts.push(h("h3.label", {}, "Your holdings", fig));
    parts.push(movable(h("div.list.sortable", { id: "all" }, own.map((x, i) => itemRow(x, i, "value")))));
  }
  if (fol.length) {
    parts.push(h("h3.label", {}, "Following", h("span", { text: "price today" })));
    parts.push(movable(h("div.list.sortable", { id: "following" }, fol.map((x, i) => itemRow(x, i, "value")))));
  }
  parts.push(h("div.links", {}, h("button", { type: "button", onclick: () => openSheet(searchView), text: "Find and Add" })));
  if (S.list.length > 1) parts.push(h("p.hint.center", { style: "margin-top:4px", text: "Press and hold one to move it." }));
  if (T.o.length) parts.push(...accountsPart(T), ...incomePart(), ...vsPart());
  return parts;
}

// Your mix: a dial of it, by holding (the five largest, and the rest), by kind (shares, trusts, funds), or by account,
// switched above it. Its slices are rounded and apart, on a faint track; what it's worth in the middle. Tap a slice,
// or its name under the dial, and it's lifted out (the others fade back), what it's worth said in the middle; tap it
// again, or another, to change that
const MIX = ["var(--m1)", "var(--m2)", "var(--m3)", "var(--m4)", "var(--m5)", "var(--m6)"];
const MIX_KINDS = { share: MIX[0], trust: MIX[2], fund: MIX[1], crypto: MIX[3] }, MIX_ACCTS = { isa: MIX[2], sipp: MIX[1], gia: MIX[0] };
function mixSlices(T, by) {
  if (by === "kind") {
    const kinds = {};
    for (const x of T.o) { const k = kindOf(S.q[x.symbol]); kinds[k] = (kinds[k] || 0) + valueOf(x); }
    return Object.entries(kinds).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ n: KINDS_SAID[k] || "Other", v, c: MIX_KINDS[k] || MIX[5] }));
  }
  if (by === "account") return byAccount(T.o).map((a) => ({ n: a.name, v: a.value, c: MIX_ACCTS[a.key] || MIX[5], key: a.key }));
  const all = [...T.o].sort((a, b) => valueOf(b) - valueOf(a)), top = all.slice(0, 5), rest = all.slice(5).reduce((a, x) => a + valueOf(x), 0);
  return [...top.map((x, i) => ({ n: x.name, v: valueOf(x), c: MIX[i], sym: x.symbol })), ...(rest > 0 ? [{ n: "Everything else", v: rest, c: MIX[5] }] : [])];
}
const bigMoney = (v) => (v >= 1e6 ? `£${fmt(v / 1e6, 2)}m` : money(v, "GBP", 0));
function mixRing(T, by) {
  const slices = mixSlices(T, by), R = 82, SW = 17, cap = SW / 2 / R, gapA = slices.length > 1 ? 2 * cap + 0.045 : 0;
  const svg = C.el("svg", { viewBox: "0 0 200 200", class: "dialsvg", role: "img", "aria-label": `Your mix, by ${by}: ${slices.map((sl) => `${sl.n} ${Math.round((sl.v / T.value) * 100)}%`).join(", ")}` });
  svg.append(C.el("circle", { class: "track", cx: 100, cy: 100, r: R }));
  let a0 = -Math.PI / 2;
  const arcs = slices.map((sl, i) => {
    const span = (sl.v / T.value) * Math.PI * 2, s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a0 + span - gapA / 2), P = (a) => [100 + R * Math.cos(a), 100 + R * Math.sin(a)];
    a0 += span;
    const el = slices.length === 1 ? C.el("circle", { class: "arc", cx: 100, cy: 100, r: R, pathLength: 1 })
      : (() => { const [x0, y0] = P(s0), [x1, y1] = P(s1); return C.el("path", { class: "arc", d: `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${s1 - s0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`, pathLength: 1 }); })();
    el.style.cssText = `--c:${sl.c};--i:${i}`;
    el.addEventListener("click", () => pick(i));
    svg.append(el);
    return el;
  });
  const big = h("b.num", { text: bigMoney(T.value) }), name = h("span", { text: plural(T.o.length, "holding") }), share = h("small.num");
  const centre = h("div.dialc", { "aria-live": "polite" }, name, big, share);
  const keys = slices.map((sl, i) => h("button.mkey", { type: "button", "aria-pressed": "false", onclick: () => pick(i) }, h("i", { style: `background:${sl.c}` }), h("span", { text: sl.n }), h("b.num", { text: `${Math.round((sl.v / T.value) * 100)}%` })));
  let on = -1;
  function pick(i) {
    on = on === i ? -1 : i;
    arcs.forEach((a, k) => { a.classList.toggle("on", k === on); a.classList.toggle("dim", on >= 0 && k !== on); });
    keys.forEach((b, k) => b.setAttribute("aria-pressed", String(k === on)));
    const sl = slices[on];
    if (!sl) { name.textContent = plural(T.o.length, "holding"); big.textContent = bigMoney(T.value); share.textContent = ""; return; }
    name.textContent = sl.n; big.textContent = bigMoney(sl.v); share.textContent = `${Math.round((sl.v / T.value) * 100)}% of your money`;
  }
  return h("div.dial", { id: "ring" }, h("div.dialw", {}, svg, centre), h("div.mkeys", {}, keys));
}
function mixPart(T) {
  const ways = [["holding", "Holdings"], ["kind", "Kinds"], ["account", "Accounts"]].filter(([k]) => k === "holding" || mixSlices(T, k).length > 1);
  if (!ways.some(([k]) => k === S.mix)) S.mix = "holding";
  const ring = mixRing(T, S.mix);
  if (ways.length < 2) return [ring];
  // (a segmented control, its thumb sliding to the one chosen)
  const at = ways.findIndex(([k]) => k === S.mix);
  const seg = h("div.seg.ways", { role: "group", "aria-label": "Your mix, by", vars: { n: String(ways.length) } }, h("span.sl", { style: `transform:translateX(${at * 100}%)` }),
    ways.map(([k, label], i) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === S.mix), text: label,
      onclick: () => { if (S.mix === k) return; S.mix = k; seg.querySelector(".sl").style.transform = `translateX(${i * 100}%)`; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); $("#ring")?.replaceWith(mixRing(totals(), k)); } })));
  return [h("div.mixrow", {}, seg), ring];
}
// How you've done, under the ring: since you bought (with the dividends it's paid you), or where that's not known, a
// year's dividends; and today. Then what it's from, where that's not everything, and a day asked for where one that
// pays has none to count its dividends from
function statsPart(T) {
  const I = T.back == null ? income() : null, stat = (label, v, cls, sub) => h("div.stat", {}, h("small", { text: label }), h("b", { class: `num ${cls}`, text: v }), h("span.num", { text: sub }));
  const notes = [];
  if (T.back != null && T.costed.length < T.o.length) notes.push(`Since you bought is from the ${T.costed.length} of your ${T.o.length} holdings you've said what you paid for. `);
  if (T.undated.length === 1) notes.push("Say when you bought ", h("button.inline", { type: "button", onclick: () => openSheet(editView, T.undated[0].symbol), text: T.undated[0].name }), " to count the dividends it's paid you.");
  else if (T.undated.length) notes.push("Say when you bought each (Edit Holding, on its page) to count the dividends they've paid you.");
  return [h("div.stats", {},
      T.back != null ? stat("Since you bought", signed(T.back, "GBP", Math.abs(T.back) >= 1e4 ? 0 : 2), tone(T.back), `${pct(T.backPct, 1)}${T.divs >= 0.5 ? ` · ${money(T.divs, "GBP", 0)} in dividends` : ""}`)
        : I?.total ? stat("Dividends", `${money(I.total, "GBP", 0)}`, "", "a year, expected") : null,
      stat("Today", signed(T.day, "GBP", Math.abs(T.day) >= 1e4 ? 0 : 2), tone(T.day), pct(T.dayPct))),
    notes.length ? h("p.stats-note", {}, notes) : null];
}
// A list put in your order: press and hold a row (or, with a mouse, hold and drag), it lifts, and follows your finger, the
// others parting for it; let go and it settles there, and the order's kept with your account
function movable(list) {
  let wait = null, drag = null, y0 = 0, pid = null, quiet = 0, edge = 0, lastY = 0;
  // (the tap that ends a move doesn't open it)
  list.addEventListener("click", (e) => { if (Date.now() < quiet) { e.stopPropagation(); e.preventDefault(); } }, true);
  const end = async (keep) => {
    clearTimeout(wait); wait = null;
    if (!drag) return;
    const { row, rows, from, to } = drag;
    drag = null; edge = 0;
    list.classList.remove("sorting");
    rows.forEach((r) => { r.style.transform = ""; });
    row.classList.remove("lifted");
    quiet = Date.now() + 450;
    if (!keep || from === to) return;
    list.insertBefore(row, rows.filter((r) => r !== row)[to] || null);
    const order = [...main.querySelectorAll(".sortable .item[data-sym]")].map((r) => r.dataset.sym);
    try { const r = await A.order(order); S.list = r.holdings; } catch (e) { toast(e.message, true); render(false); }
  };
  list.addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".item[data-sym]");
    if (!row || e.button > 0) return;
    y0 = e.clientY; pid = e.pointerId;
    wait = setTimeout(() => {
      const rows = [...list.children].filter((r) => r.dataset.sym), from = rows.indexOf(row);
      drag = { row, rows, from, to: from, step: row.offsetHeight };
      row.classList.add("lifted"); list.classList.add("sorting");
      try { row.setPointerCapture(pid); } catch (_) {}
      navigator.vibrate?.(8);
    }, 420);
  });
  // (near the screen's top or bottom, the page scrolls with the lifted row)
  const roll = () => {
    if (!drag || !edge) { edge = 0; return; }
    const before = scrollY;
    scrollBy(0, edge);
    y0 -= scrollY - before;
    move(lastY);
    requestAnimationFrame(roll);
  };
  const move = (y) => {
    const dy = y - y0, { row, rows, from, step } = drag;
    const to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
    drag.to = to;
    row.style.transform = `translateY(${dy}px) scale(1.02)`;
    rows.forEach((r, i) => { if (r !== row) r.style.transform = i > from && i <= to ? `translateY(${-step}px)` : i < from && i >= to ? `translateY(${step}px)` : ""; });
  };
  list.addEventListener("pointermove", (e) => {
    if (!drag) { if (wait && Math.abs(e.clientY - y0) > 8) { clearTimeout(wait); wait = null; } return; }
    lastY = e.clientY;
    move(lastY);
    const was = edge;
    edge = e.clientY < 90 ? -8 : e.clientY > innerHeight - 120 ? 8 : 0;
    if (edge && !was) requestAnimationFrame(roll);
  });
  list.addEventListener("pointerup", () => end(true));
  list.addEventListener("pointercancel", () => end(false));
  // (while one's lifted, the page doesn't scroll under the finger)
  list.addEventListener("touchmove", (e) => { if (drag) e.preventDefault(); }, { passive: false });
  list.addEventListener("contextmenu", (e) => { if (drag || wait) e.preventDefault(); });
  return list;
}

// Your accounts: each one's worth and day; and the ISA's allowance, what's left of it this tax year
function accountsPart(T) {
  const accts = byAccount(T.o), tagged = accts.some((a) => a.key), iy = isaYear();
  if (!tagged && !tracksIsa()) return [h("p.foot", { class: "foot", style: "padding-top:22px" }, "Hold some in an ISA or a pension? Say which on each one's page (Edit Holding) to see each account's total. ",
    h("button.inline", { type: "button", onclick: () => openSheet(isaView), text: "Track your ISA allowance" }))];
  const rows = (tagged ? accts : []).map((a, i) => h("button.item.two.rise", { type: "button", vars: { i: String(i) }, onclick: () => openSheet(accountView, a.key) },
    h("span", {}, h("b", { text: a.name }), h("small", { text: `${plural(a.o.length, "holding")} · ${Math.round((a.value / T.value) * 100)}% of your money` })),
    h("span.r", {}, h("b.num", { text: money(a.value) }), h("small", { class: `num ${tone(a.day)}`, text: `${signed(a.day)} today` }))));
  if (iy && tracksIsa()) rows.push(h("button.item.two.rise", { type: "button", vars: { i: String(rows.length) }, onclick: () => openSheet(isaView) },
    h("span", {}, h("b", { text: "ISA allowance" }), h("small", { text: `${iy.year} · ${plural(iy.days, "day")} left to use it` })),
    h("span.r", {}, h("b.num", { text: money(iy.left, "GBP", 0) }), h("small", { text: "left" })), S.isa.said === false ? h("span.todo", { text: "Say what you've paid in so far" }) : allowBar(iy.used)));
  return [h("h3.label", {}, "Accounts"), h("div.list", {}, rows)];
}
// Your income, in a row: a year of dividends, the next one coming, and the year's shape
function incomePart() {
  const I = income();
  if (!I.total) return [];
  const next = I.events[0];
  return [h("h3.label", {}, "Income"), h("div.list", {}, h("button.item.two.rise", { type: "button", onclick: () => openSheet(incomeView) },
    h("span", {}, h("b", { text: "Dividends" }), h("small", { text: next ? `Next: about ${money(next.v, "GBP", 0)} in ${monthSaid(next.at, true)}, from ${next.x.name}` : `From ${plural(I.payers.length, "holding")}` })),
    h("span.r", {}, h("b.num", { text: money(I.total, "GBP", 0) }), h("small", { text: "a year" })),
    h("div.mini", {}, incomeBars(I, -1, null, 26))))];
}
// Your income: a year of dividends, month by month; what's coming next; and who pays what
function incomeView() {
  const I = income();
  // (dividends asked for where they aren't here yet: once)
  if (!incomeView.asked && owned().some((x) => !S.years[x.symbol]?.divs)) { incomeView.asked = true; loadYears().then(() => { if (Sheet.stack.at(-1)?.[0] === incomeView) drawSheet(); }); }
  let chosen = Math.max(0, I.months.findIndex((m) => m.total > 0));
  const month = h("div", { id: "imonth" }), say = h("p.why", { style: "margin-top:22px" });
  const pick = (i) => {
    chosen = i;
    bars.querySelectorAll(".ib").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    const m = I.months[i];
    say.replaceChildren(m.total > 0 ? `About ${money(m.total, "GBP", 0)} in ${monthSaid(m.d, true)}` : `Nothing expected in ${monthSaid(m.d, true)}`, h("small", { text: m.total > 0 ? `From ${and2(m.items.map((e) => e.x.name))}` : "Tap another month" }));
    month.replaceChildren(h("div.list.flush", {}, m.items.sort((a, b) => b.v - a.v).map((e, k) => h("button.item.two.rise", { type: "button", vars: { i: String(k) }, onclick: () => pushSheet(stockView, e.x.symbol) },
      h("span", {}, h("b", { text: e.x.name }), h("small", { text: `Around ${e.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` })), h("span.r", {}, h("b.num", { text: `about ${money(e.v)}` }))))));
  };
  const bars = incomeBars(I, chosen, pick);
  pick(chosen);
  return [h("div.shead", {}, h("small", { text: "Income" }), closeBtn()),
    h("div.sprice.num", { style: "margin-top:14px", text: I.total ? `${money(I.total, "GBP", 0)} a year` : "No dividends yet" }),
    h("p.hint", { style: "margin-top:8px", text: I.total ? `About ${money(I.total / 12, "GBP", 0)} a month on average, from ${plural(I.payers.length, "holding")}, at what each paid over the last year for what you own now.` : "None of what you own has paid a dividend in the last year." }),
    ...(I.total ? [h("div.ichart", {}, bars), say, month,
      h("h3.slabel", { text: "Who pays" }),
      h("div.list.flush", {}, I.payers.map((p, k) => h("button.item.two.rise", { type: "button", vars: { i: String(k) }, onclick: () => pushSheet(stockView, p.x.symbol) },
        h("span", {}, h("b", { text: p.x.name }), h("small", { text: p.yld != null ? `Yield ${fmt(p.yld, 1)}% · ${plural(S.years[p.x.symbol].divs.length, "payment")} a year` : "" })),
        h("span.r", {}, h("b.num", { text: money(p.year, "GBP", 0) }), h("small", { text: `${Math.round((p.year / I.total) * 100)}%` }))))),
      h("p.hint", { text: "Expected from last year's dividends, in the month each went ex-dividend (it's paid a few weeks after). Amounts and dates can change, and ones paid in dollars are shown in pounds at today's rate." })] : [])];
}

// Your year against the market, from your holdings' years and the market's (before its chart's been drawn): what you own
// now, as if held all year, with the dividends it paid, beside the first market's, with its
function vsQuick() {
  const b = S.years[BENCHES[0][0]], o = owned().filter((x) => S.years[x.symbol]?.first);
  if (!b?.first || !o.length) return null;
  let a0 = 0, a1 = 0;
  for (const x of o) { const y = S.years[x.symbol], k = x.qty * rate(S.q[x.symbol].cur); a0 += y.first * k; a1 += (y.last + y.div12) * k; }
  return { you: (a1 / a0 - 1) * 100, bench: ((b.last + b.div12) / b.first - 1) * 100, name: BENCHES[0][1] };
}
// Your year against the market, in a row
function vsPart() {
  const v = S.vs?.at && Date.now() - S.vs.at < 3600e3 ? S.vs : vsQuick(), gap = v ? v.you - v.bench : 0;
  return [h("h3.label", {}, "Against the market"), h("div.list", {}, h("button.item.two.rise", { type: "button", onclick: () => openSheet(vsView) },
    h("span", {}, h("b", { text: "Your year" }), h("small", { text: v ? `${fmt(Math.abs(gap), 1)} points ${gap >= 0 ? "ahead of" : "behind"} ${v.name}` : "Against the FTSE 100, the world and the S&P 500" })),
    h("span.r", {}, v ? h("b", { class: `num ${tone(v.you)}`, text: pct(v.you, 1) }) : icon("chev", 16, 2.4))))];
}
// a day's key, for lining up days across markets
const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);
// Your year against the market: what you own now, as if held all year (at today's exchange rates), its value through
// the year beside a market's, both from where they started; the market changed with a tap, the lines reshaping to it
function vsView() {
  const box = h("div.chartbox.vsbox.loading", { id: "vsbox" }), say = h("p.why", { id: "vssay" }, h("span", { style: "opacity:.35", text: "Working out your year…" }));
  const big = h("div.sprice.num", { style: "margin-top:14px", text: "–" });
  const seg = h("div.seg.thirds", { role: "group", "aria-label": "Against" }, h("span.sl"), BENCHES.map(([sym, name], i) => h("button", { type: "button", "aria-pressed": String(i === 0), "data-b": sym, text: name === "the world" ? "World" : name })));
  const legend = h("div.vslegend", {}, h("span.you", {}, h("i"), "You"), h("span.mk", {}, h("i"), h("b", { id: "vsname", text: BENCHES[0][1] })));
  requestAnimationFrame(() => vsDraw(box, seg, big, say));
  return [h("div.shead", {}, h("small", { text: "Against the market · this year" }), closeBtn()), big,
    h("div.sdelta", {}, h("span", { style: "color:var(--text-3)", text: "your year, on what you own now" })), box, legend, seg, say,
    h("p.hint", { text: "As if you'd held what you own now all year, at today's exchange rates, with the dividends it paid. Each market is followed through a fund that tracks it (iShares' FTSE 100, Vanguard's All-World, SPDR's S&P 500), with its dividends too." })];
}
async function vsDraw(box, seg, big, say) {
  const o = owned(), W = () => box.clientWidth || 390, H = 210, N = 120;
  const get = async (sym) => { const k = `${sym}:1y`, kept = S.charts.get(k); if (kept && Date.now() - kept.at < 600e3) return kept.c; const c = await A.chart(sym, "1y"); S.charts.set(k, { at: Date.now(), c }); return c; };
  const charts = {};
  try {
    const syms = [...o.map((x) => x.symbol), ...BENCHES.map((b) => b[0])];
    for (let i = 0; i < syms.length; i += 6) await Promise.all(syms.slice(i, i + 6).map((s) => get(s).then((c) => { charts[s] = c; }, () => {})));
  } catch (_) {}
  if (!box.isConnected) return;
  box.classList.remove("loading");
  const held = o.filter((x) => charts[x.symbol]?.c?.length > 1);
  if (!held.length) { say.replaceChildren("Couldn't work out your year just now. Try again in a minute."); return; }
  // (the days, across every market; each price carried over the days its market was shut; and its dividends added from
  // the day each went ex-dividend, as cash, a share's)
  const days = [...new Set(held.flatMap((x) => charts[x.symbol].t.map(dayKey)))].sort();
  const along = (c) => {
    const m = new Map(c.t.map((t, i) => [dayKey(t), c.c[i]])), divs = (c.divs || []).map((d) => [dayKey(d.t), d.amount]).filter(([k]) => k > days[0]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let last = c.c[0], paid = 0, j = 0;
    // (one gone ex-dividend since the last price there is, counted at the end)
    return days.map((d, i) => { if (m.has(d)) last = m.get(d); while (j < divs.length && (divs[j][0] <= d || i === days.length - 1)) paid += divs[j++][1]; return last + paid; });
  };
  const value = days.map(() => 0);
  for (const x of held) { const r = rate(S.q[x.symbol].cur), p = along(charts[x.symbol]); p.forEach((v, i) => { value[i] += v * x.qty * r; }); }
  const you = value.map((v) => (v / value[0] - 1) * 100);
  const svg = C.el("svg", { viewBox: `0 0 ${W()} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Your year against the market" });
  const base = C.el("line", { class: "base", x1: 0, x2: W(), "vector-effect": "non-scaling-stroke" });
  const mk = C.el("path", { class: "line mkline", "vector-effect": "non-scaling-stroke" }), yl = C.el("path", { class: "line", "vector-effect": "non-scaling-stroke" });
  svg.append(base, mk, yl); box.append(svg);
  let shown = null, cur = null;
  const show = async (bsym, first) => {
    const c = charts[bsym], name = BENCHES.find((b) => b[0] === bsym)[1];
    const bench = c?.c?.length > 1 ? along(c).map((v, i, a) => (v / a[0] - 1) * 100) : days.map(() => 0);
    const w = W(), all = [...you, ...bench, 0], lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1, pad = 26;
    const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / span), at = (vals) => C.resample(vals, N).map((v, i) => [(i / (N - 1)) * w, y(v)]);
    const target = { you: at(you), mk: at(bench) };
    svg.setAttribute("viewBox", `0 0 ${w} ${H}`); base.setAttribute("x2", w); base.setAttribute("y1", y(0)); base.setAttribute("y2", y(0));
    yl.style.stroke = you.at(-1) >= 0 ? "var(--up)" : "var(--down)";
    const draw = (p, q) => { yl.setAttribute("d", C.smooth(p)); mk.setAttribute("d", C.smooth(q)); };
    if (!shown || first) { draw(target.you, target.mk); C.drawIn(yl, 0.15, 1.3); mk.style.opacity = "0"; requestAnimationFrame(() => { mk.style.transition = "opacity 0.9s ease 0.6s"; mk.style.opacity = "1"; }); }
    else { const from = shown; await C.tween([...from.you, ...from.mk], [...target.you, ...target.mk], 700, (p) => draw(p.slice(0, N), p.slice(N))); }
    shown = target; cur = { bench, name };
    const yv = you.at(-1), bv = bench.at(-1), gap = yv - bv;
    big.className = `sprice num ${tone(yv)}`; big.textContent = pct(yv, 1);
    const nm = $("#vsname"); if (nm) nm.textContent = name === "the world" ? "World" : name;
    say.replaceChildren(`You're ${yv >= 0 ? "up" : "down"} ${fmt(Math.abs(yv), 1)}% over the year with dividends, and ${name} is ${bv >= 0 ? "up" : "down"} ${fmt(Math.abs(bv), 1)}%: ${Math.abs(gap) < 0.05 ? "level with it" : `${fmt(Math.abs(gap), 1)} points ${gap >= 0 ? "ahead" : "behind"}`}.`,
      h("small", { text: held.length < o.length ? `From ${plural(held.length, "holding")} of your ${o.length} with a year's prices` : held.length === 1 ? "From your one holding" : `From all ${held.length} of your holdings` }));
    S.vs = { at: Date.now(), you: yv, bench: bv, name };
  };
  C.scrubber(box, (x, w) => {
    if (!cur) return null;
    const i = Math.max(0, Math.min(days.length - 1, Math.round((x / w) * (days.length - 1)))), k = Math.round((i / Math.max(1, days.length - 1)) * (N - 1));
    const when = new Date(days[i] + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { x: shown.you[k][0], y: shown.you[k][1], label: `You ${pct(you[i], 1)} · ${cur.name === "the world" ? "World" : cur.name} ${pct(cur.bench[i], 1)} · ${when}` };
  });
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-b]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    const i = [...seg.querySelectorAll("button")].indexOf(b);
    seg.querySelector(".sl").style.transform = `translateX(${i * 100}%)`;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    show(b.dataset.b);
  });
  await show(BENCHES[0][0], true);
}

// One account: what's in it, worth what, and how it's done
function accountView(key) {
  const T = totals(), a = byAccount(T.o).find((x) => x.key === key) || { key, name: ACCOUNT_NAME[key] || "Not in an account", o: [], value: 0, day: 0 };
  const costed = a.o.filter((x) => x.cost != null), paid = costed.reduce((s, x) => s + paidFor(x), 0), divs = costed.reduce((s, x) => s + (divsOf(x) || 0), 0), gain = costed.reduce((s, x) => s + valueOf(x), 0) - paid + divs, iy = isaYear();
  return [h("div.shead", {}, h("small", { text: key === "isa" ? "Stocks & Shares ISA" : key === "sipp" ? "Pension (SIPP)" : key === "gia" ? "General account" : "Your holdings" }), closeBtn()),
    h("div.sname", { text: a.name }),
    h("div.sprice.num", { text: money(a.value) }),
    h("div.sdelta.num", {}, h("span", { class: tone(a.day), text: `${signed(a.day)} (${pct(a.value - a.day ? (a.day / (a.value - a.day)) * 100 : 0)})` }), h("span", { style: "color:var(--text-3)", text: "today" })),
    h("div.facts", {},
      costed.length ? h("div.fact", {}, h("span", { text: "Since you bought" }), h("b", { class: `num ${tone(gain)}`, text: signed(gain) }), h("i.num", { text: `${pct(paid ? (gain / paid) * 100 : 0, 1)} on ${money(paid, "GBP", 0)}${divs >= 0.5 ? `, with ${money(divs, "GBP", 0)} of dividends` : ""}` })) : null,
      key === "isa" && iy ? h("button.fact.press", { type: "button", onclick: () => pushSheet(isaView) }, h("span", { text: `Allowance, ${iy.year}` }), h("b.num", { text: `${money(iy.left, "GBP", 0)} left` }), h("i.num", { text: `of ${money(iy.allowance, "GBP", 0)}` }), allowBar(iy.used)) : null),
    h("h3.slabel", { text: plural(a.o.length, "holding") }),
    h("div.list.flush", {}, [...a.o].sort((x, y) => valueOf(y) - valueOf(x)).map((x, i) => itemRow(x, i, "value", (s) => pushSheet(stockView, s))))];
}
// The ISA's allowance: what you've paid in this tax year, and what's left
function isaView() {
  const iy = isaYear() || { year: "", paid: 0, allowance: 20000, left: 20000, days: 0, used: 0 };
  const paid = h("input", { type: "text", inputmode: "decimal", id: "mk-isa", placeholder: "0", value: iy.paid ? String(iy.paid) : "", "aria-label": "Paid in this tax year" });
  const inIsa = owned().filter((x) => x.account === "isa"), worth = inIsa.reduce((a, x) => a + valueOf(x), 0);
  const save = h("button.btn.go.press", { type: "button", style: "width:100%;margin-top:26px", id: "mk-isa-save" }, "Save");
  save.onclick = async () => {
    const v = paid.value.trim() === "" ? 0 : Number(paid.value.replace(/[,£\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) return toast("What you've paid in should be a number.", true);
    save.disabled = true;
    try { S.isa = (await A.setIsa(v)).isa; toast("Saved"); if (Sheet.stack.length > 1) backSheet(); else closeSheet(); render(false); }
    catch (e) { toast(e.message, true); save.disabled = false; }
  };
  return [h("div.shead", {}, backBtn(), h("small", { text: `ISA allowance · ${iy.year}` }), closeBtn()),
    h("div.sprice.num", { style: "margin-top:14px", text: iy.left > 0 ? `${money(iy.left, "GBP", 0)} left` : "All used" }),
    h("p.why", { style: "margin-top:6px" }, `Of your ${money(iy.allowance, "GBP", 0)} for this tax year, with ${plural(iy.days, "day")} to use it: it ends on 5 April, and what's left doesn't carry over.`),
    allowBar(iy.used),
    inIsa.length ? h("div.facts", {}, h("div.fact", {}, h("span", { text: "In your ISA now" }), h("b.num", { text: money(worth) }), h("i", { text: plural(inIsa.length, "holding") }))) : null,
    h("div.form", {}, h("label", { for: "mk-isa", text: "Paid in so far this tax year" }), h("div.field", {}, h("span.unit", { text: "£" }), paid)),
    h("p.hint", { text: "What you've put in, not what it's grown to. Money moved in from past years' ISAs doesn't count. It starts again on 6 April." }), save];
}

function newsView() {
  if (!S.list.length) return emptyView();
  const f = S.q["^FTSE"], g = S.q["^GSPC"], parts = [], said = [];
  const mv = (q, where) => (q?.chgPct == null ? null : `${where} ${Math.abs(q.chgPct) < 0.05 ? "is flat" : `is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`}`);
  const l1 = [mv(f, "London"), mv(g, "New York")].filter(Boolean);
  if (l1.length) said.push(`${l1.join(" and ")} today.`);
  const big = [...S.list].filter((x) => S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0];
  const story = big && S.news?.find((n) => n.for === big.symbol && Date.now() - n.at < 36 * 3600e3);
  if (big) said.push(`Your biggest mover is ${big.name}, ${S.q[big.symbol].chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(S.q[big.symbol].chgPct), 1)}%${story ? `: ${story.title.replace(/[.!?]$/, "")}.` : "."}`);
  parts.push(h("div.digest", {}, h("span.eyebrow", { text: "Today, in brief" }), said.map((t, i) => h("p.rise", { vars: { i: String(i) }, text: t }))));
  parts.push(h("h3.label", {}, "For you"));
  // (asked for when there's none, and again after a quarter of an hour; one that couldn't come, said, with Try Again)
  if (!S.newsErr && (S.news == null || Date.now() - (S.newsAt || 0) > 15 * 60e3)) loadNews();
  if (S.newsErr && S.news == null) parts.push(h("p.foot", { style: "padding-top:0" }, "Couldn't get the news just now. ", h("button.inline", { type: "button", onclick: () => { S.newsErr = null; loadNews(); render(false); }, text: "Try Again" })));
  else if (S.news == null) parts.push(h("div.list", {}, [0, 1, 2].map((i) => h("div.story", {}, h("span.m", { text: " " }), h("b", { style: "opacity:.25", text: "—" })))));
  else if (!S.news.length) parts.push(h("p.foot", { style: "padding-top:0", text: "No stories about your list just now." }));
  else parts.push(h("div.list", {}, S.news.slice(0, 20).map((n, i) => { const q = S.q[n.for];
    return h("a.story.rise", { href: n.link, target: "_blank", rel: "noopener", vars: { i: String(Math.min(i, 8)) } },
      h("span.m", {}, h("span", { text: `${n.src} · ${ago(n.at)}` }), q ? h("span", { class: `num ${tone(q.chgPct)}`, text: `${nameOf(n.for)} ${pct(q.chgPct, 1)}` }) : null),
      h("b", { text: n.title })); })));
  return parts;
}
async function loadNews() {
  if (loadNews.busy) return;
  loadNews.busy = true;
  try {
    const syms = [...S.list].sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)).slice(0, 10).map((x) => x.symbol);
    S.news = syms.length ? (await A.news(syms)).news : [];
    S.newsAt = Date.now(); S.newsErr = null;
    if (S.tab === "news") render(false);
  } catch (e) { S.newsErr = e.message || "offline"; S.newsAt = Date.now(); if (S.tab === "news") render(false); } finally { loadNews.busy = false; }
}

function go(tab) {
  if (S.tab === tab) { scrollTo({ top: 0, behavior: C.still() ? "auto" : "smooth" }); return; }
  S.tab = tab; render(); scrollTo(0, 0);
  if (tab === "holdings") loadPaid();
}
function drawTabs() {
  tabsEl.replaceChildren(...[["today", "Today"], ["holdings", "Holdings"], ["news", "News"]].map(([t, l]) => h("button.tab", { type: "button", "data-tab": t, onclick: () => go(t), text: l })));
}

// ---- the sheet: a stock, search, adding, settings ----
const Sheet = { stack: [] };
function openSheet(view, ...args) {
  const fresh = !Sheet.stack.length;
  if (fresh) Sheet.back = document.activeElement;
  Sheet.stack = [[view, args]];
  drawSheet();
  sheetEl.hidden = false;
  $("#page").inert = true; tabsEl.inert = true;
  // (Back, or the edge swipe, closes it rather than leaving the app)
  if (fresh && !history.state?.mkSheet) history.pushState({ mkSheet: true }, "");
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add("sheet-up"); focusSheet(); }));
}
const focusSheet = () => (sbody.querySelector("h2, .sname, input, button:not(.x)") || sheetEl).focus?.({ preventScroll: true });
addEventListener("popstate", () => { if (Sheet.stack.length) closeSheet(true); });
function pushSheet(view, ...args) { Sheet.stack.push([view, args]); drawSheet(); focusSheet(); }
function backSheet() { Sheet.stack.pop(); if (!Sheet.stack.length) return closeSheet(); drawSheet(); }
function drawSheet() {
  const [view, args] = Sheet.stack.at(-1);
  sbody.replaceChildren(...[].concat(view(...args)).filter(Boolean));
  sbody.querySelectorAll("h2, .sname").forEach((e) => e.setAttribute("tabindex", "-1"));
  sbody.scrollTop = 0;
}
function closeSheet(fromBack = false) {
  const was = Sheet.stack.length;
  document.body.classList.remove("sheet-up");
  Sheet.stack = [];
  $("#page").inert = false; tabsEl.inert = false;
  if (was && !fromBack && history.state?.mkSheet) history.back();
  if (was && Sheet.back?.isConnected) Sheet.back.focus?.({ preventScroll: true });
  Sheet.back = null;
  setTimeout(() => { if (!document.body.classList.contains("sheet-up")) { sheetEl.hidden = true; sbody.replaceChildren(); } }, 650);
}
$("#dim").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("sheet-up") && !IFL.isOpen()) closeSheet(); });
// (dragged down by its handle: it follows, and goes once far enough)
(() => {
  let y0 = null;
  const g = $("#grab");
  g.addEventListener("pointerdown", (e) => { y0 = e.clientY; sheetEl.classList.add("dragging"); g.setPointerCapture(e.pointerId); });
  g.addEventListener("pointermove", (e) => { if (y0 != null) sheetEl.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  const end = (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; sheetEl.classList.remove("dragging"); sheetEl.style.transform = ""; if (dy > 110) closeSheet(); };
  g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
})();
const closeBtn = () => h("button.ifs-btn.x.press", { type: "button", "aria-label": "Close", onclick: closeSheet }, icon("x", 16, 2.4));
const backBtn = () => (Sheet.stack.length > 1 ? h("button.ifs-btn.x.press", { type: "button", "aria-label": "Back", onclick: backSheet }, icon("back", 18, 2.4)) : null);

// A stock's page
function openStock(sym, o = {}) { openSheet(stockView, sym, o); }
function stockView(sym, o = {}) {
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym];
  if (!q) {
    const head = [h("div.shead", {}, backBtn(), h("small", { text: plainSym(sym) }), closeBtn()), h("div.sname", { text: o.name || sym })];
    // (asked for once: where there's no price for it, that's said, with a way to ask again)
    if (stockView.failed.has(sym)) return [...head, h("p.why", { text: "Couldn't get its price just now." }, h("small", { text: "The markets' data may be busy, or it may not be traded any more." })),
      h("div.btns", {}, h("button.btn.press.wide", { type: "button", onclick: () => { stockView.failed.delete(sym); drawSheet(); } }, "Try Again"))];
    const here = () => Sheet.stack.at(-1)?.[1]?.[0] === sym;
    A.quotes([sym]).then((r) => { Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates); if (!r.quotes[sym]) stockView.failed.add(sym); if (here()) drawSheet(); },
      () => { stockView.failed.add(sym); if (here()) drawSheet(); });
    return [...head, h("div.sprice", { style: "opacity:.3", text: "–" })];
  }
  const name = held?.name || INDEX_NAMES[sym] || o.name || q.name;
  const box = h("div.chartbox", { id: "cb" });
  const seg = h("div.seg", { role: "group", "aria-label": "Chart range" }, h("span.sl"), RANGES.map(([r, label], i) => h("button", { type: "button", "aria-pressed": String(i === 0), "data-r": r, text: label })));
  const why = h("p.why", { id: "why" }, h("span", { style: "opacity:.35", text: "Finding out why…" }));
  const parts = [
    h("div.shead", {}, backBtn(), h("small", { text: [plainSym(sym), q.ex, ["trust", "fund"].includes(kindOf(q)) ? KIND_SAID[kindOf(q)] : null].filter(Boolean).join(" · ") }), closeBtn()),
    h("div.sname", { text: name }),
    h("div.sprice.num", { "data-px": sym, text: priceSaid(q) }),
    h("div.sdelta.num", {}, h("span", { class: tone(q.chgPct), "data-pct": sym, id: "rpct", text: q.chg != null && !isIndex(q) ? `${signed(q.chg, q.cur, q.price < 1 ? 4 : 2)} (${pct(q.chgPct)})` : pct(q.chgPct) }), h("span", { style: "color:var(--text-3)", id: "rsaid", text: "today" })),
    held?.qty > 0 && valueOf(held) != null ? yoursPart(sym, held, q) : null,
    box, seg, why, h("div", { id: "snews" }), facts(sym, held, q),
    held ? h("div", { id: "buys" }) : null,
  ];
  // what can be done with it
  const tool = (sel, ic, label, on, attrs = {}) => h(`button.tool.press${sel}`, { type: "button", onclick: on, ...attrs }, icon(ic, 20, 2), h("span", { text: label }));
  if (held) parts.push(h("div.links", {}, removeBtn(sym, held)),
    h("div.sbar", {},
      tool(held.alert ? ".on" : "", "bell", held.alert ? `Alert On · ±${fmt(held.alert, 0)}%` : "Alert Me", () => pushSheet(alertView, sym), { id: "alert" }),
      tool("", "send", "Send in Chat", () => sendInChat(sym)),
      tool("", "pen", held.qty > 0 ? "Edit Holding" : "Add What You Own", () => pushSheet(editView, sym))));
  else parts.push(h("div.sbar.two", {}, h("button.btn.go.press", { type: "button", onclick: () => pushSheet(editView, sym, { name }) }, "Add to Your List"), tool("", "send", "Send in Chat", () => sendInChat(sym, name))));
  requestAnimationFrame(() => { stockChart(sym, box, seg); whyMoving(sym, why); if (held) drawBuys(sym); });
  return parts;
}
stockView.failed = new Set();
// what you have of it, up top: what it's worth, its day, and since you bought (with its dividends)
function yoursPart(sym, held, q) {
  const v = valueOf(held), d = dayOf(held) || 0, dv = divsOf(held) || 0, paid = held.cost ? paidFor(held) : null, g = paid != null ? v - paid + dv : null;
  const stat = (label, b, sub) => h("div.ystat", {}, h("small", { text: label }), b, sub);
  return h("div", { id: "yours" }, h("div.ystats", {},
      stat("Yours", h("b.num", { "data-val": sym, text: money(v, "GBP", v >= 1e5 ? 0 : 2) }), h("span", { text: `${fmt(held.qty, held.qty % 1 ? 2 : 0)} shares` })),
      stat("Today", h("b", { class: `num ${tone(d)}`, "data-dg": sym, text: signed(d) }), h("span", { class: `num ${tone(q.chgPct)}`, "data-pct": sym, text: pct(q.chgPct) })),
      g != null ? stat("Since bought", h("b", { class: `num ${tone(g)}`, text: signed(g, "GBP", Math.abs(g) >= 1e4 ? 0 : 2) }), h("span", { class: `num ${tone(g)}`, text: pct((g / paid) * 100, 1) }))
        : stat("Since bought", h("button.inline", { type: "button", onclick: () => pushSheet(editView, sym), text: "Add cost" }), h("span", { text: "to see it" }))),
    h("p.ynote", { text: [held.account ? `In your ${ACCOUNT_NAME[held.account]}` : null, held.cost != null ? `${held.buys > 1 ? "average" : "paid"} ${priceSaid(q, held.cost)} a share` : null, dv >= 0.5 ? `${money(dv, "GBP", 0)} of dividends counted` : null].filter(Boolean).join(" · ") }));
}
// Alert Me: how much a move in a day is worth hearing about (or off)
function alertView(sym) {
  const held = S.list.find((x) => x.symbol === sym), name = held?.name || nameOf(sym), cur = held?.alert || null;
  const pick = async (p, btn) => {
    btn.disabled = true;
    try {
      if (p && !S.pushOn) await turnOnHere();
      const r = await A.setAlert(sym, !!p, p || 3);
      S.list = r.holdings;
      toast(p ? `You'll hear when ${name} moves ${p}% in a day${S.alertsOff ? " (alerts are off in your account)" : !S.pushOn ? " (notifications are off on this phone)" : ""}` : "Alert off");
      backSheet(); render(false);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  };
  return [h("div.shead", {}, backBtn(), h("h2", { text: "Alert Me" }), closeBtn()),
    h("p.why", { style: "margin-top:14px" }, `When ${name} moves this much in a day, up or down:`),
    h("div.choice.amt", { role: "group", "aria-label": "How much" }, [2, 3, 5, 10].map((p) => h("button.press", { type: "button", "aria-pressed": String(cur === p), onclick: (e) => pick(p, e.currentTarget), text: `${p}%` }))),
    h("p.hint", { text: "You'll hear once a day at most, on the phones you've turned notifications on for. Your account's Quiet Hours are kept." }),
    cur ? h("div.links", {}, h("button.danger", { type: "button", onclick: (e) => pick(0, e.currentTarget), text: "Turn Off" })) : null];
}
function facts(sym, held, q) {
  const rows = [], y = S.years[sym];
  if (q.dayLo != null && q.dayHi != null && q.dayHi > q.dayLo) { const at = (q.price - q.dayLo) / (q.dayHi - q.dayLo);
    rows.push(h("div.fact", {}, h("span", { text: "Today's range" }), h("b", { text: at >= 0.85 ? "Near the day's high" : at <= 0.15 ? "Near the day's low" : "Mid-range" }), h("i.num", { text: q.prev ? `closed ${priceSaid(q, q.prev)} yesterday` : "" }), ...range52(q, q.dayLo, q.dayHi, at))); }
  const hi = q.hi52 ?? y?.hi52, lo = q.lo52 ?? y?.lo52;
  if (hi && lo && hi > lo) { const at = (q.price - lo) / (hi - lo); rows.push(h("div.fact", {}, h("span", { text: "52-week range" }), h("b", { text: at >= 0.9 ? "Near its high" : at <= 0.1 ? "Near its low" : at >= 0.5 ? "In the upper half" : "In the lower half" }), h("i.num", { text: y?.yr != null ? `${pct(y.yr, 1)} on a year ago` : "" }), ...range52(q, lo, hi, at))); }
  if (y?.div12 > 0 && q.price) { const nx = held?.qty > 0 ? income().events.find((e) => e.x.symbol === sym) : null;
    rows.push(h("div.fact", {}, h("span", { text: "Dividends" }), h("b.num", { text: `${priceSaid(q, y.div12)} a share a year` }), h("i.num", { text: `yield ${fmt((y.div12 / q.price) * 100, 1)}%` }),
      held?.qty > 0 && rate(q.cur) != null ? h("p", {}, `About ${money(y.div12 * held.qty * rate(q.cur), "GBP", 0)} a year to you`, nx ? h("span.nx", { text: ` · next about ${money(nx.v, "GBP", nx.v >= 100 ? 0 : 2)}, around ${nx.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` }) : null) : null)); }
  if (kindOf(q) === "trust") rows.push(h("details.more", {}, h("summary", {}, h("b", { text: "What's an investment trust?" }), icon("chev", 16, 2.4)),
    h("p", { text: "A company that invests in many others. You buy its shares like any other, and it spreads your money across what it holds. Its share price can sit above or below what those holdings are worth: a premium, or a discount." })));
  if (!y && !isIndex(q) && q.type !== "CURRENCY") A.years([sym]).then((r) => { if (r.years[sym]) { S.years[sym] = r.years[sym]; const f = $("#facts"); if (f && Sheet.stack.at(-1)?.[1]?.[0] === sym) f.replaceWith(facts(sym, S.list.find((x) => x.symbol === sym), S.q[sym])); } }, () => {});
  return h("div.facts", { id: "facts" }, rows);
}
// Your buys and sales of one: each, newest first, and what sales have made; one more, or one taken off
async function drawBuys(sym) {
  const el = $("#buys");
  if (!el) return;
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym];
  let b = null;
  if (held?.buys) { try { b = await A.buys(sym); } catch (_) { return; } }
  if (!el.isConnected) return;
  const add = h("button", { type: "button", onclick: () => pushSheet(buyView, sym), text: held?.buys ? "Add a Buy or Sale" : held?.qty > 0 ? "Record Your Buys" : "Record a Buy" });
  if (!b?.buys?.length) { el.replaceChildren(h("div.links", { style: "margin-top:20px" }, add)); return; }
  const when = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const row = (x, i) => {
    const del = h("button.del.press", { type: "button", "aria-label": "Delete" }, icon("x", 14, 2.6));
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!del.classList.contains("sure")) { del.classList.add("sure"); del.replaceChildren("Delete"); setTimeout(() => { if (del.isConnected) { del.classList.remove("sure"); del.replaceChildren(icon("x", 14, 2.6)); } }, 3000); return; }
      del.disabled = true;
      try { const r = await A.dropBuy(x.id); S.list = r.holdings; toast(x.qty > 0 ? "Buy taken off" : "Sale taken off"); await refresh(true); drawSheet(); render(false); loadPaid(true); }
      catch (err) { toast(err.message, true); del.disabled = false; }
    };
    return h("div.item.buy.rise", { vars: { i: String(i) } },
      h("span", {}, h("b", { text: `${x.qty > 0 ? "Bought" : "Sold"} ${fmt(Math.abs(x.qty), Math.abs(x.qty) % 1 ? 2 : 0)}` }), h("small", { text: when(x.at) })),
      h("span.r", {}, h("b.num", { text: x.price != null ? priceSaid(q, x.price) : "–" }), h("small", { text: x.price != null ? (rate(q.cur) != null ? money(Math.abs(x.qty) * x.price * rate(q.cur)) : money(Math.abs(x.qty) * x.price, q.cur)) : "price not said" })), del);
  };
  el.replaceChildren(h("h3.slabel", {}, "Buys and sales"),
    h("div.list.flush", {}, [...b.buys].reverse().map(row)),
    b.made != null ? h("div.facts", { style: "margin-top:8px" }, h("div.fact", {}, h("span", { text: "Made on what you've sold" }), h("b", { class: `num ${tone(b.made)}`, text: rate(q.cur) != null ? signed(b.made * rate(q.cur)) : signed(b.made, q.cur) }), h("i", { text: "over what it cost you on average" }))) : null,
    h("div.links", { style: "margin-top:14px" }, add));
}
// A buy or a sale: which, the day, how many and the price each (today's to start with)
function buyView(sym) {
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym], cs = SYM[q?.cur] ?? "", name = held?.name || q?.name || sym;
  let sold = false;
  const kind = h("div.choice", { role: "group", "aria-label": "Bought or sold" }, [["buy", "Bought"], ["sell", "Sold"]].map(([k, n]) => h("button.press", { type: "button", "data-k": k, "aria-pressed": String(k === "buy"), text: n,
    onclick: () => { sold = k === "sell"; kind.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); save.textContent = sold ? "Save Sale" : "Save Buy"; } })));
  const today = new Date().toLocaleDateString("en-CA");
  const day = h("input", { type: "date", id: "mk-day", value: today, max: today, "aria-label": "The day" });
  const qty = h("input", { type: "text", inputmode: "decimal", id: "mk-bqty", placeholder: "0", "aria-label": "How many" });
  const price = h("input", { type: "text", inputmode: "decimal", id: "mk-bprice", value: q?.price != null ? String(+q.price.toFixed(q.price < 1 ? 4 : 2)) : "", "aria-label": "Price each" });
  const save = h("button.btn.go.press", { type: "button", style: "width:100%;margin-top:26px", id: "mk-bsave" }, "Save Buy");
  save.onclick = async () => {
    const num = (s) => (s.trim() === "" ? null : Number(s.replace(/[,£$€\s]/g, "")));
    const n = num(qty.value), p = num(price.value), at = day.value ? Date.parse(day.value + "T12:00:00Z") : Date.now();
    if (!n || !Number.isFinite(n) || n <= 0) return toast("How many should be a number.", true);
    if (p != null && (!Number.isFinite(p) || p < 0)) return toast("The price should be a number.", true);
    save.disabled = true;
    try {
      const r = await A.addBuy({ symbol: sym, qty: n, price: p, at, sold });
      S.list = r.holdings;
      toast(sold ? "Sale saved" : "Buy saved");
      await refresh(true);
      backSheet(); render(false); loadPaid(true);
    } catch (e) { toast(e.message, true); save.disabled = false; }
  };
  return [h("div.shead", {}, backBtn(), h("h2", { text: name }), closeBtn()),
    h("div.form", {}, kind,
      h("label", { for: "mk-day", text: "On" }), h("div.field", {}, day),
      h("label", { for: "mk-bqty", text: "How many shares" }), h("div.field", {}, qty),
      h("label", { for: "mk-bprice", text: `Price each${cs ? "" : ` (${q?.cur || ""})`}` }), h("div.field", {}, cs ? h("span.unit", { text: cs }) : null, price)),
    h("p.hint", { text: held?.qty > 0 && !held?.buys ? `Your ${fmt(held.qty, held.qty % 1 ? 2 : 0)} shares${held.cost != null ? ` at ${priceSaid(q, held.cost)}` : ""} are kept as your first buy, and this one's added to them. How many you own and what they cost on average are worked out from them all from now on.` : "How many you own and what they cost on average are worked out from all your buys and sales: a sale takes shares out at the average." }), save];
}

// Why it's moving: the day's story about it, where it's moved enough for one to matter; else how it's done against its market
async function whyMoving(sym, el) {
  const q = S.q[sym], m = S.q[MARKET_OF[q.ex]], said = (text, small, link) => el.replaceChildren(link ? h("a", { href: link, target: "_blank", rel: "noopener", text }) : text, small ? h("small", { text: small }) : null);
  if (isIndex(q) || q.type === "CRYPTOCURRENCY" || q.type === "CURRENCY") {
    const big = q.symbol === "^FTSE" || q.symbol === "^GSPC" ? S.list.filter((x) => MARKET_OF[S.q[x.symbol]?.ex] === sym && S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0] : null;
    return said(`${INDEX_NAMES[sym] || q.name} is ${Math.abs(q.chgPct || 0) < 0.05 ? "flat" : `${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`} today.${big ? ` Of yours here, ${big.name} has moved most, ${pct(S.q[big.symbol].chgPct, 1)}.` : ""}`, "From the day's prices");
  }
  let story = null, about = [];
  try {
    const r = await A.news([sym]);
    about = r.news.filter((n) => n.tickers.includes(sym) || n.for === sym);
    story = about.find((n) => Date.now() - n.at < 36 * 3600e3) || null;
  } catch (_) {}
  if (!el.isConnected) return;
  // (the latest few about it, under what's said)
  const list = $("#snews");
  if (list && about.length) list.replaceChildren(h("h3.slabel", { text: "News" }), h("div.snews", {}, about.slice(0, 3).map((n) => h("a.story", { href: n.link, target: "_blank", rel: "noopener" },
    h("span.m", {}, h("span", { text: `${n.src} · ${ago(n.at)}` })), h("b", { text: n.title })))));
  const move = q.chgPct || 0, vsMarket = m?.chgPct != null ? ` The ${INDEX_NAMES[MARKET_OF[q.ex]]} is ${m.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(m.chgPct), 1)}%.` : "";
  if (story && Math.abs(move) >= 1) return said(story.title, `${story.src} · ${ago(story.at)}`, story.link);
  if (Math.abs(move) < 1) return said(`A quiet day for it, moving with the market.${vsMarket}`, story ? `Latest: ${story.title.slice(0, 90)}${story.title.length > 90 ? "…" : ""}` : "No news about it today");
  return said(`No news about it today, so it's ${m && Math.sign(m.chgPct) === Math.sign(move) ? "moving with the market" : "moving on its own"}.${vsMarket}`, "From the day's prices and news");
}
// The chart: drawn in, then reshaped as the range changes; read with a finger along it
async function stockChart(sym, box, seg) {
  const N = 120, W = () => box.clientWidth || 390, H = 210;
  const svg = C.el("svg", { viewBox: `0 0 ${W()} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Price chart" });
  const gid = "g" + Math.random().toString(36).slice(2, 8);
  svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity=".2"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>`;
  const base = C.el("line", { class: "base", x1: 0, x2: W(), "vector-effect": "non-scaling-stroke" }), fill = C.el("path", { class: "fill", fill: `url(#${gid})` }), line = C.el("path", { class: "line", "vector-effect": "non-scaling-stroke" });
  svg.append(base, fill, line); box.append(svg);
  const axis = h("div.axis.num"), now = h("i.nowdot"), blabel = h("span.blabel.num");
  box.append(now, blabel); box.after(axis);
  let shown = null, raw = null, range = "1d", seq = 0;
  const show = async (r, first) => {
    const n = ++seq;
    range = r; box.dataset.range = r;
    const key = `${sym}:${r}`;
    box.classList.add("loading");
    const kept = S.charts.get(key), fresh = kept && Date.now() - kept.at < (r === "1d" ? 60e3 : 600e3);
    let c = fresh ? kept.c : null;
    if (!c) { try { c = await A.chart(sym, r); S.charts.set(key, { at: Date.now(), c }); } catch (e) { box.classList.remove("loading"); if (kept) c = kept.c; else { if (n === seq) toast(e.message, true); return; } } }
    if (n !== seq || !box.isConnected) return;
    box.classList.remove("loading");
    if (!c.c.length) return;
    const q = S.q[sym], w = W(), session = r === "1d" && q.open && c.t.length ? q.open : null;
    const vals = [...c.c], ts = [...c.t];
    // (today's line to now: the price as it is, at the end)
    if (r === "1d" && q.price != null && q.time && q.time > ts.at(-1)) { vals.push(q.price); ts.push(q.time); }
    const xs = session ? ts.map((t) => Math.max(0, Math.min(1, (t - session.start) / (session.end - session.start)))) : null;
    const b = r === "1d" ? (c.prev ?? q.prev ?? vals[0]) : vals[0];
    const { pts, baseY } = C.place(vals, w, H, { pad: 26, xs, base: b });
    raw = { pts, vals, ts, cur: q };
    const up = vals.at(-1) >= b, col = up ? "var(--up)" : "var(--down)";
    svg.setAttribute("viewBox", `0 0 ${w} ${H}`);
    base.setAttribute("x2", w); base.setAttribute("y1", baseY); base.setAttribute("y2", baseY);
    line.style.stroke = col;
    svg.querySelectorAll("stop").forEach((s) => s.setAttribute("stop-color", up ? "#5fe0a6" : "#ff8a80"));
    const target = C.resample(pts.map((p) => p[0]), N).map((x, i) => [x, C.resample(pts.map((p) => p[1]), N)[i]]);
    const draw = (p) => { line.setAttribute("d", C.smooth(p)); fill.setAttribute("d", C.area(p, H)); };
    if (!shown || first) { draw(target); C.drawIn(line, 0.1, 1.2); fill.style.opacity = "0"; requestAnimationFrame(() => { fill.style.opacity = "1"; }); }
    else await C.tween(shown, target, 700, draw);
    shown = target;
    // (along the bottom: the day's open and close, or where the range starts and ends; on the line, now, while it's
    // open; and on the dashed line, what it is)
    const tz = q.tz || undefined, tm = (t) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const dd = (t) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: r === "1y" || r === "5y" ? "numeric" : undefined, timeZone: tz });
    axis.replaceChildren(...(session ? [tm(session.start), tm((session.start + session.end) / 2), tm(session.end)] : [dd(ts[0]), r === "5d" ? "Now" : "Today"]).map((t) => h("span", { text: t })));
    const live = session && Date.now() / 1000 < session.end, last = pts.at(-1);
    now.hidden = !live;
    if (live) { now.style.transform = `translate(${last[0]}px, ${last[1]}px)`; now.style.color = col; }
    blabel.textContent = r === "1d" ? `${priceSaid(q, b)} yesterday` : `${priceSaid(q, b)} then`;
    blabel.style.top = `${Math.max(0, baseY - 20)}px`;
    // what's said over it: the change over the range
    const ch = vals.at(-1) - b, chp = (vals.at(-1) / b - 1) * 100, rp = $("#rpct"), rs = $("#rsaid");
    if (rp && rs) { rp.className = `num ${tone(chp)}`; rp.textContent = isIndex(q) ? pct(chp) : `${signed(ch, q.cur, q.price < 1 ? 4 : 2)} (${pct(chp)})`; rs.textContent = RANGES.find((x) => x[0] === r)[2]; }
  };
  C.scrubber(box, (x) => {
    if (!raw) return null;
    let k = 0, best = Infinity;
    raw.pts.forEach((p, i) => { const d = Math.abs(p[0] - x); if (d < best) { best = d; k = i; } });
    const [px, py] = raw.pts[k], t = raw.ts[k] * 1000, tz = raw.cur.tz || undefined;
    const when = range === "1d" ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })
      : range === "5d" ? new Date(t).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })
      : range === "5y" ? new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: tz })
      : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: range === "1y" ? "2-digit" : undefined, timeZone: tz });
    return { x: px, y: py, label: `${priceSaid(raw.cur, raw.vals[k])} · ${when}` };
  });
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]");
    if (!b || b.dataset.r === range) return;
    const i = [...seg.querySelectorAll("button")].indexOf(b);
    seg.querySelector(".sl").style.transform = `translateX(${b.offsetLeft}px)`;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    show(b.dataset.r);
  });
  // (the phone turned, or the window resized: drawn again at the new width)
  let drawnW = W();
  const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); if (shown && Math.abs(W() - drawnW) > 2) { drawnW = W(); show(range, true); } });
  ro.observe(box);
  await show("1d", true);
}

// Find something to add
// Find and Add. Before anything's typed: what you looked at last, and rows to browse (each with its price today). As
// you type: what matches in your list and those rows, at once, then the markets' own answer under them; each with its
// price and day, the letters typed shown bold, and a + to follow it in one tap (a tick once it's in your list).
// Return opens the first
const BROWSE = [
  ["Popular in the UK", [["SHEL.L", "Shell"], ["AZN.L", "AstraZeneca"], ["HSBA.L", "HSBC"], ["ULVR.L", "Unilever"], ["BP.L", "BP"], ["RR.L", "Rolls-Royce"], ["LLOY.L", "Lloyds"], ["TSCO.L", "Tesco"]]],
  ["Index funds", [["VWRL.L", "Vanguard All-World"], ["VUSA.L", "Vanguard S&P 500"], ["ISF.L", "iShares FTSE 100"], ["VUKE.L", "Vanguard FTSE 100"], ["VFEM.L", "Vanguard Emerging Markets"]]],
  ["Investment trusts", TRUST_PICKS],
  ["US tech", [["AAPL", "Apple"], ["NVDA", "Nvidia"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["META", "Meta"]]],
];
const recent = { get: () => store.get("recent", []), add(sym, name) { store.set("recent", [{ s: sym, n: name }, ...recent.get().filter((x) => x.s !== sym)].slice(0, 6)); } };
// the letters typed, bold where they are in a name
function marked(name, q) {
  const k = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
  return k < 0 ? [name] : [name.slice(0, k), h("mark", { text: name.slice(k, k + q.length) }), name.slice(k + q.length)];
}
// following one in a tap: added with none owned; the + turns to a tick
async function follow(sym, name, btn) {
  if (S.list.some((x) => x.symbol === sym)) return pushSheet(stockView, sym, { name });
  btn.disabled = true;
  try {
    const r = await A.putHolding({ symbol: sym, name, qty: 0 });
    S.list = r.holdings; S.news = null;
    btn.classList.add("on"); btn.replaceChildren(icon("check", 15, 2.8)); btn.setAttribute("aria-label", `${name} is in your list`);
    navigator.vibrate?.(8);
    toast(`Following ${name}`);
    render(false);
  } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
}
const addBtn = (sym, name) => { const have = S.list.some((x) => x.symbol === sym), b = h("button.addb.press" + (have ? ".on" : ""), { type: "button", "aria-label": have ? `${name} is in your list` : `Follow ${name}` }, icon(have ? "check" : "plus", 15, 2.8));
  b.onclick = (e) => { e.stopPropagation(); follow(sym, name, b); }; return b; };
const dayOfQ = (sym) => { const q = S.q[sym]; return q?.price != null ? [h("b.num", { text: priceSaid(q) }), h("small", { class: `num ${tone(q.chgPct)}`, text: pct(q.chgPct) })] : [h("b.num.dimmed", { text: "–" })]; };
function searchView() {
  const input = h("input", { type: "search", id: "mk-q", placeholder: "Company, fund, trust or symbol", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", "aria-label": "Find a company, fund, investment trust or symbol" });
  const open = (sym, name) => { recent.add(sym, name); pushSheet(stockView, sym, { name }); };
  // one result: its name (what's typed, bold), what it is, its price and day, and a + to follow it
  const row = (x, q) => h("div.res", { "data-sym": x.symbol },
    h("button.resopen", { type: "button", onclick: () => open(x.symbol, x.name), "aria-label": x.name }),
    h("span.rn", {}, h("b", {}, marked(x.name, q)), h("small", { text: [plainSym(x.symbol), x.ex, KIND_SAID[x.kind]].filter(Boolean).join(" · ") })),
    h("span.rp", {}, dayOfQ(x.symbol)), addBtn(x.symbol, x.name));
  // a row to browse: cards across, each with its price today
  const card = ([sym, name], i) => h("div.bcard.glass.rise", { vars: { i: String(i) } },
    h("button.resopen", { type: "button", onclick: () => open(sym, name), "aria-label": name }),
    h("b", { text: name }), h("small", { text: [plainSym(sym), S.q[sym]?.ex].filter(Boolean).join(" · ") }), h("span.bp", {}, dayOfQ(sym)), addBtn(sym, name));
  const start = () => {
    const rec = recent.get();
    return [
      rec.length ? h("div.browse", {}, h("h3", {}, "Recent", h("button", { type: "button", onclick: () => { store.del("recent"); results.replaceChildren(...start()); }, text: "Clear" })),
        h("div.list.flush", {}, rec.slice(0, 4).map((x) => row({ symbol: x.s, name: x.n, ex: S.q[x.s]?.ex, kind: S.q[x.s] ? kindOf(S.q[x.s]) : null }, "")))) : null,
      ...BROWSE.map(([title, list]) => h("div.browse", {}, h("h3", { text: title }), h("div.brow", {}, list.map(card))))].filter(Boolean);
  };
  const results = h("div.results", { id: "results" }, ...start());
  // (the prices for what's to browse, and what was looked at last: asked for once, drawn in as they come)
  const want = [...new Set([...BROWSE.flatMap(([, l]) => l.map((x) => x[0])), ...recent.get().map((x) => x.s)])].filter((sym) => !S.q[sym]);
  if (want.length) A.quotes(want.slice(0, 64)).then((r) => { Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates); if (!input.value.trim() && results.isConnected) results.replaceChildren(...start()); }, () => {});
  // (what matches here already, before the markets answer: in your list first, then the rows)
  const local = (q) => {
    const k = q.toLowerCase(), pool = [...S.list.map((x) => [x.symbol, x.name]), ...BROWSE.flatMap(([, l]) => l)], seen = new Set();
    return pool.filter(([sym, name]) => (name.toLowerCase().includes(k) || plainSym(sym).toLowerCase().startsWith(k)) && !seen.has(sym) && seen.add(sym))
      .slice(0, 4).map(([sym, name]) => ({ symbol: sym, name, ex: S.q[sym]?.ex || "", kind: S.q[sym] ? kindOf(S.q[sym]) : null }));
  };
  let t = null, n = 0, shown = [];
  const draw = (list, q) => { shown = list; results.replaceChildren(h("div.list.flush", {}, list.map((x) => row(x, q)))); };
  input.addEventListener("input", () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (!q) { shown = []; results.replaceChildren(...start()); return; }
    const mine = local(q);
    if (mine.length) draw(mine, q);
    t = setTimeout(async () => {
      const k = ++n;
      try {
        const r = await A.search(q);
        if (k !== n) return;
        const seen = new Set(), all = [...mine, ...r.results].filter((x) => !seen.has(x.symbol) && seen.add(x.symbol)).slice(0, 10);
        if (!all.length) { shown = []; results.replaceChildren(h("div.nores", {}, h("b", { text: `Nothing found for “${q}”` }), h("p", { text: "Check the spelling, or try its symbol (like RR or AAPL). For a fund, paste its ISIN from your broker (like GB00B41YBW71)." }))); return; }
        draw(all, q);
        // (their prices, for those that haven't one here yet)
        const need = all.map((x) => x.symbol).filter((sym) => !S.q[sym]);
        if (need.length) A.quotes(need).then((qr) => { Object.assign(S.q, qr.quotes); Object.assign(S.fx, qr.rates); if (k === n && results.isConnected) draw(all, q); }, () => {});
      } catch (e) { if (k === n) results.replaceChildren(h("p.hint", { text: e.message })); }
    }, 250);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); open(shown[0].symbol, shown[0].name); } });
  setTimeout(() => input.focus({ preventScroll: true }), 420);
  return [h("div.shead", {}, h("h2", { text: "Find and Add" }), closeBtn()), h("label.field", {}, icon("search", 18, 2.2), input), results];
}
// Adding one to your list, or changing how many you own and what you paid
function editView(sym, o = {}) {
  const held = S.list.find((x) => x.symbol === sym), q = S.q[sym], name = held?.name || o.name || q?.name || sym, cs = SYM[q?.cur] ?? "";
  const qty = h("input", { type: "text", inputmode: "decimal", id: "mk-qty", placeholder: "0", value: held?.qty ? String(held.qty) : "", "aria-label": "Shares you own" });
  const cost = h("input", { type: "text", inputmode: "decimal", id: "mk-cost", placeholder: q?.price ? fmt(q.price, 2).replace(/,/g, "") : "", value: held?.cost != null ? String(held.cost) : "", "aria-label": "What you paid per share" });
  // (when you bought it: for the dividends it's paid you since)
  const today = new Date().toLocaleDateString("en-CA");
  const since = h("input", { type: "date", id: "mk-since", max: today, value: held?.since ? new Date(held.since).toISOString().slice(0, 10) : "", "aria-label": "When you bought" });
  // (what you paid: for each, or in total, as your broker may say it; and what that comes to, said under it as you type)
  const num = (s) => (s.trim() === "" ? null : Number(s.replace(/[,£$€\s]/g, "")));
  const curMoney = (v) => (cs ? money(v, q.cur) : `${fmt(v)} ${q?.cur || ""}`.trim());
  let per = "each";
  const echo = h("p.echo", { id: "mk-echo", "aria-live": "polite" });
  const tell = () => {
    const n = num(qty.value) ?? 0, c = num(cost.value);
    echo.textContent = c == null || !Number.isFinite(c) || !(n > 0) ? "" : per === "each" ? `${curMoney(c * n)} in all, for ${fmt(n, n % 1 ? 2 : 0)} shares` : `${curMoney(c / n)} each`;
  };
  const perSeg = h("div.per", { role: "group", "aria-label": "What you paid is" }, [["each", "Each"], ["total", "In total"]].map(([k, label]) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === per), text: label,
    onclick: () => {
      if (k === per) return;
      const n = num(qty.value) ?? 0, c = num(cost.value);
      if (c != null && Number.isFinite(c) && n > 0) cost.value = String(k === "total" ? +(c * n).toFixed(2) : +(c / n).toFixed(4));
      per = k;
      perSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === per)));
      cost.setAttribute("aria-label", per === "each" ? "What you paid per share" : "What you paid in total");
      cost.placeholder = q?.price ? fmt(per === "each" ? q.price : q.price * (n || 1), 2).replace(/,/g, "") : "";
      tell();
    } })));
  qty.addEventListener("input", tell); cost.addEventListener("input", tell);
  tell();
  let acct = held?.account ?? null;
  const choice = h("div.choice", { role: "group", "aria-label": "Held in" }, ACCOUNTS.map(([k, n]) => h("button.press", { type: "button", "data-a": k, "aria-pressed": String(acct === k), text: n,
    onclick: (e) => { acct = acct === k ? null : k; choice.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.a === acct))); } })));
  const save = h("button.btn.go.press", { type: "button", style: "width:100%;margin-top:26px", id: "mk-save" }, held ? "Save" : "Add to Your List");
  save.onclick = async () => {
    const n = num(qty.value) ?? 0, c0 = num(cost.value), t = since.value ? Date.parse(since.value + "T12:00:00Z") : null;
    if (!Number.isFinite(n) || n < 0) return toast("How many you own should be a number.", true);
    if (c0 != null && (!Number.isFinite(c0) || c0 < 0)) return toast("What you paid should be a number.", true);
    if (c0 != null && per === "total" && !(n > 0)) return toast("Say how many shares you own, to work out what each cost.", true);
    const c = c0 != null && per === "total" ? +(c0 / n).toPrecision(10) : c0;
    if (t != null && (!Number.isFinite(t) || t > Date.now() + 864e5)) return toast("Choose the day you bought it, as on a calendar.", true);
    save.disabled = true;
    try {
      const r = await A.putHolding({ symbol: sym, name, qty: n, cost: c, account: acct, ...(held?.buys ? {} : { since: t }) });
      S.list = r.holdings; S.news = null;
      toast(held ? "Saved" : `${name} added`);
      const back = Sheet.stack.length > 1 && Sheet.stack.at(-2)[0] === stockView;
      await refresh(true);
      if (back) { Sheet.stack.pop(); drawSheet(); } else closeSheet();
      render(false);
      loadYears(); loadPaid(true);
    } catch (e) { toast(e.message, true); save.disabled = false; }
  };
  if (held?.buys) return [h("div.shead", {}, backBtn(), h("h2", { text: name }), closeBtn()),
    h("div.form", {}, h("label", { text: "Held in" }), choice),
    h("p.hint", { text: `How many you own (${fmt(held.qty, held.qty % 1 ? 2 : 0)}) and what each cost${held.cost != null ? ` (${priceSaid(q, held.cost)} on average)` : ""} come from your buys and sales, on its page.` }), save];
  return [h("div.shead", {}, backBtn(), h("h2", { text: held ? name : `Add ${name}` }), closeBtn()),
    h("div.form", {},
      h("label", { for: "mk-qty", text: "Shares you own" }), h("div.field", {}, qty),
      h("div.lrow", {}, h("label", { for: "mk-cost", text: `What you paid${cs ? "" : ` (${q?.cur || ""})`}` }), perSeg), h("div.field", {}, cs ? h("span.unit", { text: cs }) : null, cost), echo,
      h("label", { for: "mk-since", text: "When you bought" }), h("div.field", {}, since),
      h("label", { text: "Held in" }), choice),
    h("p.hint", { text: "Leave shares at 0 to just follow it. The rest is optional, for how you've done since you bought (dividends included) and each account's total. Bought at different times? Record each buy on its page instead." }), save];
}
// Remove: a second tap to be sure, saying what goes with it (its buys and sales, its alert)
function removeBtn(sym, held) {
  const b = h("button.danger", { type: "button", text: "Remove" });
  b.onclick = () => {
    if (b.classList.contains("sure")) return removeHolding(sym);
    b.classList.add("sure");
    b.textContent = held.buys ? `Remove, with ${plural(held.buys, "buy and sale", "buys and sales")}?` : "Tap again to remove";
    setTimeout(() => { if (b.isConnected) { b.classList.remove("sure"); b.textContent = "Remove"; } }, 3500);
  };
  return b;
}
async function removeHolding(sym) {
  const name = nameOf(sym);
  try { const r = await A.dropHolding(sym); S.list = r.holdings; S.news = null; closeSheet(); toast(`${name} removed`); render(false); }
  catch (e) { toast(e.message, true); }
}

// ---- alerts: on this phone, and for each holding you choose ----
const pushable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function checkPush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration(), sub = reg && Notification.permission === "granted" ? await reg.pushManager.getSubscription() : null;
    S.pushOn = !!sub;
    // (this phone kept with the sign-in it's opened with now: the alerts go where you're signed in, and stop where you're not)
    if (sub) A.pushOn(sub.toJSON()).catch(() => {});
  } catch (_) { S.pushOn = false; }
}
const b64key = (k) => { const raw = atob(k.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((k.length + 3) % 4)); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
// turned on here (from a tap: a phone asks only then) → whether it's on
async function turnOnHere() {
  if (!pushable()) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(matchMedia("(display-mode: standalone)").matches || navigator.standalone);
    toast(ios ? "Add Markets to your Home Screen first (Share, then Add to Home Screen) to get alerts there." : "This browser can’t show notifications.", true);
    return false;
  }
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications aren’t allowed for Markets. Turn them on in this browser’s settings.", true); return false; }
    const reg = await navigator.serviceWorker.ready, { key } = await A.pushKey();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(key) }));
    await A.pushOn(sub.toJSON());
    S.pushOn = true;
    return true;
  } catch (e) { toast(e.message || "Couldn’t turn on alerts here just now.", true); return false; }
}
// ---- sending one to a friend, in Chat ----
function sendInChat(sym, name = nameOf(sym)) {
  const q = S.q[sym], text = `${name} (${plainSym(sym)}) is ${q?.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q?.chgPct || 0), 1)}% today, at ${priceSaid(q)}.`;
  const chat = A.chatPage();
  if (chat) { location.assign(`${chat}#${new URLSearchParams({ share: text })}`); return; }
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  navigator.clipboard?.writeText(text).then(() => toast("Copied, to paste in Chat"), () => toast(text));
}

// ---- you, your apps, and Markets's own few: InFlite's menu, from your photo ----
function youMenu(at) {
  IFL.menu(at, {
    app: "markets", build: BUILD,
    me: { name: S.me?.name || "You", line: S.me?.handle ? `@${S.me.handle}` : "", photo: meFace() },
    rows: [
      { key: "notify", icon: "bell", color: "red", label: "Notifications", value: S.pushOn ? "On" : "Off here", warn: !S.pushOn, open: () => openAccount("notify-markets") },
      { icon: "plus", color: "green", label: "Find and Add", open: () => openSheet(searchView) },
      "-",
      { icon: "sliders", color: "grey", label: "Settings", open: () => openSheet(settingsView) },
    ],
    account: openAccount, signOut: () => signOutHere(), update: S.newer ? () => location.reload() : null,
  });
}
function settingsView() {
  return [h("div.shead", {}, h("span"), closeBtn()),
    h("div.ifs-hero", {}, h("img", { src: "icon.svg", alt: "", width: 64, height: 64 }), h("b", { text: "Markets" }), h("span", { text: "Your money, said simply" })),
    h("button.acct.glass.press", { type: "button", onclick: () => openAccount(), "aria-label": "Your account" },
      h("span.me", {}, meFace()), h("span", {}, h("b", { text: S.me?.name || "You" }), h("small", { text: S.me?.handle ? `@${S.me.handle}` : "" })), h("span.chev", {}, icon("chev", 17, 2.4))),
    h("div.rows", {},
      h("button.srow", { type: "button", onclick: () => openAccount("notify-markets") }, h("span", { text: "Notifications" }), h("i", { text: S.pushOn ? "On here" : "Off here" })),
      h("div.srow", {}, h("span", {}, "Evening Wrap", h("small", { text: "How your day went, once your markets close" })), wrapSwitch()),
      h("div.srow", {}, h("span", { text: "Values in" }), h("i", { text: "Pounds" })),
      h("div.srow", {}, h("span", { text: "Prices" }), h("i", { text: "Yahoo Finance, up to 20 min behind" })),
      h("button.srow.danger", { type: "button", onclick: signOutHere }, "Sign Out")),
    h("p.hint", { style: "text-align:center", text: "Markets shows prices and news to help you follow your money. It isn't financial advice." })];
}
// the evening wrap, on or off (on it asks this phone to allow notifications, where it hasn't)
function wrapSwitch() {
  const sw = h("button.sw", { type: "button", role: "switch", id: "mk-wrap", "aria-checked": String(!!S.wrap), "aria-label": "Evening Wrap" });
  sw.onclick = async () => {
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(on)); sw.disabled = true;
    try {
      S.wrap = (await A.setWrap(on)).wrap;
      if (on && !S.pushOn) await turnOnHere();
      toast(on ? (S.pushOn ? "You'll get the evening wrap once your markets close" : "Evening wrap on, but notifications are off on this phone") : "Evening wrap off");
    } catch (e) { sw.setAttribute("aria-checked", String(!on)); toast(e.message, true); } finally { sw.disabled = false; }
  };
  return sw;
}
async function openAccount(open) {
  const page = A.accountPage();
  if (!page) return toast("Your account is at account.inflite.ai");
  try { const { code } = await A.accountLink(); location.assign(`${page}#${new URLSearchParams({ handoff: code, from: "markets", ...(typeof open === "string" ? { open } : {}) })}`); }
  catch (e) { if (e.status === 401) return signedOut(); toast(e.message, true); }
}

// ---- signed out: the way in ----
function welcome(note = null) {
  S.me = null;
  document.body.classList.add("out");
  const page = A.accountPage(), W = 1200, Hh = 520;
  const walk = (seed, drift, n = 60) => { let s = seed, v = 0; const out = []; for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; v += (s / 233280 - 0.5) * 3 + drift; out.push(v); } return out; };
  const line = (vals, top, span) => C.smooth(C.place(vals, W, span, { pad: 0 }).pts.map(([x, y]) => [x, y + top]));
  const scene = C.el("svg", { class: "scene", viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: "xMidYMax slice", "aria-hidden": "true" });
  const l1 = walk(7, 0.55), end = C.place(l1, W, 260, { pad: 0 }).pts.at(-1);
  scene.append(C.el("path", { class: "l3", pathLength: 1, d: line(walk(91, 0.2), 230, 220) }), C.el("path", { class: "l2", pathLength: 1, d: line(walk(33, 0.35), 180, 240) }),
    C.el("path", { class: "l1", pathLength: 1, d: line(l1, 140, 260) }), C.el("circle", { class: "glow", cx: end[0], cy: end[1] + 140, r: 7 }));
  main.replaceChildren(h("div.welcome.ifl-in", {}, scene,
    h("div.ifl-top", {}, h("div.ifl-logo", {}, h("img.mark", { src: "icon.svg", alt: "", width: 96, height: 96 })),
      h("h1.ifl-title", { "aria-label": "Markets" }, [..."Markets"].map((c, i) => h("span", { "aria-hidden": "true", vars: { i: String(i) }, text: c }))),
      h("p.ifl-tagline", { text: "Your money, said simply" })),
    h("div.ifl-cta", {}, note && h("p.said", { role: "status", text: note }),
      page && h("p.ifl-brand", {}, h("img", { src: "inflite.svg", alt: "", width: 22, height: 22 }), "Powered by InFlite"),
      h("button.btn.go.ifl-go.press", { type: "button", id: "sign-in", disabled: !page, onclick: (e) => toAccountSignIn(e) }, "Sign in"),
      !page && h("p.said", { style: "margin-top:12px", text: "Signing in is at finance.inflite.ai." }),
      page && h("p.ifl-new", {}, "New here? ", h("button", { type: "button", onclick: (e) => toAccountSignIn(e, "join") }, "Create your account")))));
  main.removeAttribute("aria-busy");
  document.title = "Markets";
}
async function toAccountSignIn(e, mode = "signin") {
  const page = A.accountPage(), b = mode === "signin" ? e?.currentTarget : null;
  if (!page) return;
  if (b) { b.disabled = true; b.textContent = "Signing in…"; }
  try {
    const { word, ask } = await A.signInWord();
    store.set("signin", { word, at: Date.now() });
    location.assign(`${page}#${new URLSearchParams({ [mode]: "markets", ask, back: `${location.origin}/` })}`);
  } catch (_) { if (b) { b.disabled = false; b.textContent = "Sign in"; } toast("This browser can’t sign in here. Try Safari or Chrome.", true); }
}
async function signedBack(code) {
  const k = store.get("signin");
  store.del("signin");
  if (!k || Date.now() - k.at > 30 * 60e3) { A.handback(code, "").catch(() => {}); toast("That sign-in was started somewhere else. Sign in again here.", true); return null; }
  try { const m = await A.handback(code, k.word); toast(`Signed in as ${String(m.name).trim().split(/\s+/)[0]}`); return m; }
  catch (e) { toast(e.message, true); return null; }
}
async function signOutHere() {
  closeSheet();
  try { const reg = await navigator.serviceWorker?.getRegistration(), sub = await reg?.pushManager.getSubscription(); if (sub) await A.pushOff(sub.endpoint).catch(() => {}); } catch (_) {}
  try { await A.signOut(); } catch (_) {}
  signedOut();
}
function signedOut() { store.del("last"); store.del("years"); S.list = []; S.years = {}; S.isa = null; S.newsErr = null; S.newsAt = 0; S.news = null; S.charts.clear(); closeSheet(); welcome(); }

// ---- signed in: your list and its prices ----
function take(m) {
  S.me = { id: m.id, name: m.name, handle: m.handle, photoAt: m.photoAt };
  S.list = m.holdings || []; S.q = { ...S.q, ...(m.quotes || {}) }; S.fx = { ...S.fx, ...(m.rates || {}) }; S.alertsOff = !!m.alertsOff; S.isa = m.isa ?? S.isa; S.wrap = m.wrap ?? S.wrap;
  if (m.appearance && m.appearance !== "auto") { document.documentElement.dataset.theme = m.appearance; store.set("appearance", m.appearance); try { localStorage.setItem("markets:appearance", m.appearance); } catch (_) {} }
  else { delete document.documentElement.dataset.theme; try { localStorage.removeItem("markets:appearance"); } catch (_) {} }
}
// your holdings' years (for what's worth knowing), behind: drawn again once they're in
async function loadYears() {
  const old = Date.now() - (S.yearsAt || 0) > 12 * 3600e3;
  const syms = [...S.list.map((x) => x.symbol), ...BENCHES.map((b) => b[0])].filter((s, i, a) => a.indexOf(s) === i && (old || !S.years[s]?.divs || S.years[s].first == null));
  if (!syms.length) return;
  try { const r = await A.years(syms.slice(0, 60)); Object.assign(S.years, r.years); if (old) S.yearsAt = Date.now(); store.set("years", { at: S.yearsAt || Date.now(), years: S.years }); if (S.tab !== "news" && calm()) render(false); } catch (_) {}
}
// what each holding's paid you since you bought it (its dividends), behind: kept ten minutes, and asked again once
// what you own has changed
async function loadPaid(force = false) {
  if (!force && S.paid && Date.now() - S.paid.at < 600e3) return;
  if (!owned().length) return;
  try { S.paid = { at: Date.now(), v: (await A.paid()).paid }; } catch (_) { return; }
  if (S.tab !== "news" && calm()) render(false);
  // (and on a holding's page, if that's open, its facts)
  const top = Sheet.stack.at(-1), f = $("#facts");
  if (f && top?.[0] === stockView) { const sym = top[1][0], held = S.list.find((x) => x.symbol === sym); f.replaceWith(facts(sym, held, S.q[sym])); if (held?.qty > 0 && valueOf(held) != null) $("#yours")?.replaceWith(yoursPart(sym, held, S.q[sym])); }
}
// (the page drawn again behind only while nothing's open over it, and nothing's being moved)
const calm = () => !document.body.classList.contains("sheet-up") && !$(".sortable.sorting");
// Prices again: every half a minute while the app's open and in front, each change flashed where it shows
async function refresh(force = false) {
  if (!S.me || (!force && document.hidden)) return;
  const syms = [...new Set([...INDICES, ...S.list.map((x) => x.symbol)])];
  try {
    const was = { ...S.q }, wasT = totals(), r = await A.quotes(syms);
    Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates);
    store.set("last", { me: S.me, holdings: S.list, quotes: S.q, rates: S.fx, isa: S.isa, at: Date.now() });
    if (force) return;
    const said = marketSaid(), line = $(".mhead .ifh-line .eyebrow");
    if (line) line.replaceChildren(h("i.live" + (said.open ? "" : ".shut")), said.text);
    for (const s of syms) { const a = was[s], b = S.q[s]; if (a && b && a.price !== b.price) paint(s, b.price > a.price); }
    dispatchEvent(new Event("mk:prices"));
    const T = totals(), pv = $("#pv");
    if (pv && Math.abs(T.value - wasT.value) > 0.004) {
      C.count(wasT.value, T.value, 700, (v) => { const [a, b] = fmt(v).split("."); pv.replaceChildren(`£${a}`, h("span.p", { text: "." + b })); });
      const pd = S.prange === "1d" && $("#pd"), pp = $("#pp");
      if (pd) { pd.textContent = signed(T.day); pd.className = tone(T.day); pp.textContent = pct(T.dayPct); pp.className = tone(T.day); }
      const say = S.prange === "1d" && $("#say"); if (say) say.replaceChildren(...daySaid(T));
      // the day's line: reshaped to take the new prices in
      const svg = S.prange === "1d" && $("#pchart"), line = svg?.querySelector("path[data-draw]"), fill = svg?.querySelectorAll("path")[0], s = daySeries();
      if (line && s && portfolioChart.pts) {
        const t0 = s.T[0], t1 = s.T.at(-1), { pts } = C.place(s.vals, 390, 150, { pad: 14, xs: s.T.map((t) => (t - t0) / (t1 - t0 || 1)), base: s.base });
        const n = Math.max(pts.length, portfolioChart.pts.length), rs = (p) => C.resample(p.map((x) => x[0]), n).map((x, i) => [x, C.resample(p.map((y) => y[1]), n)[i]]);
        const from = rs(portfolioChart.pts), to = rs(pts);
        C.tween(from, to, 800, (p) => { line.setAttribute("d", C.smooth(p)); fill?.setAttribute("d", C.area(p, 150)); });
        portfolioChart.pts = pts;
      }
    }
  } catch (_) { /* offline a moment: tried again in half a minute */ }
}
// one symbol's numbers, wherever they show, said afresh and flashed up or down
function paint(sym, up) {
  const q = S.q[sym], held = S.list.find((x) => x.symbol === sym);
  const flash = (el) => { el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(up ? "flash-up" : "flash-down"); };
  document.querySelectorAll(`[data-px="${CSS.escape(sym)}"]`).forEach((el) => { el.textContent = priceSaid(q); flash(el); });
  document.querySelectorAll(`[data-pct="${CSS.escape(sym)}"]`).forEach((el) => {
    // (a stock's page showing a longer range than today says its change over that, not today's)
    if (el.id === "rpct" && ($("#cb")?.dataset.range || "1d") !== "1d") return;
    el.textContent = el.id === "rpct" && q.chg != null && !isIndex(q) ? `${signed(q.chg, q.cur, q.price < 1 ? 4 : 2)} (${pct(q.chgPct)})` : pct(q.chgPct); el.classList.remove("up-t", "down-t", "flat-t"); el.classList.add(tone(q.chgPct)); });
  if (held?.qty > 0) {
    document.querySelectorAll(`[data-val="${CSS.escape(sym)}"]`).forEach((el) => { el.textContent = money(valueOf(held)); flash(el); });
    document.querySelectorAll(`[data-dg="${CSS.escape(sym)}"]`).forEach((el) => { el.textContent = el.tagName === "I" ? `${signed(dayOf(held))} today` : signed(dayOf(held)); });
  }
}

// opened: Markets's notifications are seen, and the icon's badge goes
async function seen() {
  try { navigator.clearAppBadge?.().catch(() => {}); const reg = await navigator.serviceWorker?.getRegistration(); (await reg?.getNotifications?.())?.forEach((n) => n.close()); } catch (_) {}
}

let toastT = null;
function toast(msg, bad = false) {
  // (said inside an open sheet too: a reader there hears nothing outside it)
  const say = $("#sheet-say"); if (say) say.textContent = document.body.classList.contains("sheet-up") ? msg : "";
  toastEl.textContent = msg; toastEl.classList.toggle("bad", !!bad); toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), bad ? 4200 : 2400); }

// ---- starting ----
async function start() {
  drawTabs();
  IFL.built("markets", BUILD);
  IFL.watch(window);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "markets:new") S.newer = true;
      if (e.data?.type === "markets:open") { const s = /#s=([^&]+)/.exec(e.data.url || "")?.[1]; if (s && S.me) openStock(decodeURIComponent(s)); }
    });
  }
  // (a sign-in started here and never finished: its word not kept past half an hour)
  if (Date.now() - (store.get("signin")?.at || Date.now()) > 30 * 60e3) store.del("signin");
  const askNotify = IFL.wantsAllow();
  const deep = /(?:^#|&)s=([^&]+)/.exec(location.hash)?.[1];
  const code = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash)?.[1];
  if (code || deep) history.replaceState(null, "", location.pathname);
  let m = null;
  if (code) { m = await signedBack(code); document.documentElement.classList.remove("arriving"); }
  else {
    // (drawn at once from this phone's copy, while the account's is asked for)
    const last = store.get("last");
    if (last?.me) { take({ ...last.me, holdings: last.holdings, quotes: last.quotes, rates: last.rates, isa: last.isa }); const ys = store.get("years"); S.years = ys?.years || {}; S.yearsAt = ys?.at || 0; render(); }
    try { m = await A.me(); }
    catch (e) { if (S.me) { toast(e.message, true); live(); return; } return welcome(e.message); }
  }
  if (!m?.signedIn) return welcome();
  const same = S.me?.id === m.id;
  take(m);
  render(!same);
  store.set("last", { me: S.me, holdings: S.list, quotes: S.q, rates: S.fx, isa: S.isa, at: Date.now() });
  checkPush();
  loadYears();
  loadPaid();
  if (deep) openStock(decodeURIComponent(deep));
  if (askNotify) IFL.allow("markets", "Markets tells you when something you hold moves a lot in a day (you choose which, on each one's page), and how your day went once your markets close.", turnOnHere);
  live();
}
// kept fresh: every half a minute, on coming back to it, and when the network's back
function live() {
  if (live.on) return;
  live.on = true;
  setInterval(refresh, 30000);
  seen();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh(); seen(); } });
  addEventListener("online", () => refresh());
}
start();

// ---- for the desk (desk.js): what it shares with the rest ----
DESK.addEventListener("change", () => render(false));
export { S, h, A, C, $, icon, fmt, money, signed, pct, tone, priceSaid, plainSym, nameOf, valueOf, dayOf, totals, owned, rate, divsOf, paidFor, income, kindOf, KIND_SAID,
  INDEX_NAMES, INDICES, RANGES, openSheet, pushSheet, stockView, searchView, editView, alertView, toast, ago, dayKey, rangeSeries, marketSaid, whyMoving, sendInChat, store, meFace, youMenu, daySeries };
