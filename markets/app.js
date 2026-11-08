import { quoteSession } from "./session.js";
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
// (account.js). Your list is kept with the account; the prices come through Markets's own API, fetched every 15 seconds
// for everyone (functions/_markets.js), and kept fresh here every 15 seconds while the app is open.

import * as A from "./account.js";
import * as C from "./charts.js";
import { marked as markDivs, health, project, taxYearOf, csv, yearDivs, yearOn } from "./income.js";
import { sameStory, storiesOf } from "./stories.js";
import { stockSendCard, chatHash } from "./send.js";

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
    window.visualViewport?.removeEventListener("resize", m.fit);
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
        const f = [...pop.querySelectorAll("button, a")];
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
    const tall = () => Math.min(window.innerHeight, window.visualViewport?.height || Infinity);
    const r = anchor.getBoundingClientRect(), H = tall(), W = window.innerWidth;
    const left = Math.max(12, Math.min(r.left - 2, W - pop.offsetWidth - 12));
    const below = r.bottom + 10 + pop.offsetHeight <= H - 12 || r.top < H / 2;
    const top = below ? r.bottom + 10 : Math.max(12, r.top - 10 - pop.offsetHeight);
    const fit = () => { if (below) pop.style.maxHeight = `${Math.max(0, tall() - top - 12)}px`; };
    fit();
    window.visualViewport?.addEventListener("resize", fit);
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${below ? "-10px" : "calc(100% + 10px)"}`;
    anchor.classList.add("ifm-lit");
    open = { anchor, layer, pop, key, fit, behind, onClose: o.onClose, redraw: (list) => {
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
      const layer = el("div", "ifb-layer", box);
      const text = () => [`${manual ? "Problem report" : "Bug report"} ${r.code}`, ...facts.map(([k, v]) => `${k}: ${String(v).replace(/\n/g, " · ")}`), note.value.trim() ? `Note: ${note.value.trim()}` : ""].filter(Boolean).join("\n");
      const done = () => { layer.remove(); document.removeEventListener("keydown", key, true); showing = null; };
      const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
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

// (Markets's version: up by 0.01 with each change to it that goes out; and what's new in it, said once it's in)
const BUILD = "2.18";
const NEWS = "Page zoom is blocked consistently across all InFlite apps";
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
const S = { me: null, list: [], q: {}, fx: { GBP: 1 }, years: {}, news: null, tab: "today", charts: new Map(), pushOn: false, alertsOff: false, isa: null, wrap: true, vs: null, paid: null, prange: "1d", mix: "holding", fig: "day",
  inc: null, imode: "coming", goal: 100, add: 0, reinvest: true, buyAmt: 1000, newsTopics: {}, nfilter: "all", newsSince: null };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("markets:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("markets:" + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem("markets:" + k); } catch (_) {} },
};
// (the Income sheet's plan, as you left it on this phone)
{ const p = store.get("plan"); if (p) { S.goal = +p.goal || 100; S.add = +p.add || 0; S.reinvest = p.reinvest !== false; } }

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
const GLYPHS_MK = { check: '<path d="m5 12.5 4.5 4.5L19 7"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>' };
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
// (and its day's change likewise: in pence beside a price in pence)
const chgSaid = (q, v = q.chg) => (q.cur === "GBP" && !isIndex(q) && Math.abs(q.price) < 1 ? `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v) * 100, 2)}p` : signed(v, q.cur, q.price < 1 ? 4 : 2));
// A price typed in, in its own currency: London's in pounds, or in pence as its prices are quoted and contract notes
// give them ("52p"). → the number (in pounds), null where nothing's typed, NaN where it isn't one
function priceIn(s, q) {
  const t = s.replace(/[,£$€\s]/g, "");
  if (t === "") return null;
  return q?.cur === "GBP" && /^[\d.]+p$/i.test(t) ? Number(t.slice(0, -1)) / 100 : Number(t);
}
// (pence typed as pounds, by the look of it: twenty times or more today's price, and in reason as pence) → what it may
// have meant, said ("52p"), to ask; else null
function penceMeant(c, q, typed) {
  if (q?.cur !== "GBP" || !q.price || c == null || !Number.isFinite(c) || /p\s*$/i.test(typed) || c < q.price * 20 || c / 100 > q.price * 5) return null;
  return `${+c.toFixed(4)}p`;
}
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
// what you own that isn't in your total just now (no price for it: one that's stopped trading, or none in pounds), said
const unpriced = () => S.list.filter((x) => x.qty > 0 && valueOf(x) == null);
const leftOutSaid = (xs = unpriced()) => (xs.length ? `${and2(xs.map((x) => x.name))} ${xs.length === 1 ? "isn't" : "aren't"} in this total: no price for ${xs.length === 1 ? "it" : "them"} just now.` : "");
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
// Your income: each dividend each holding paid over the last year (a year of its paying, by how often it pays: yearDivs),
// for what you own now, expected again a year on, in the month it went ex-dividend; one-offs (specials) said apart,
// and not expected again. { months: the next twelve, from
// this one ({ d, total, items }), events (to come, soonest first), payers (largest first, with each one's yield and how
// many it pays a year), total (a year's), none (what you own that's paid nothing over the year), specials ({ x, v, at }) }
function income() {
  const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth();
  const months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(y0, m0 + i, 1), total: 0, items: [] })), events = [], payers = [], none = [], specials = [];
  for (const x of owned()) {
    const yr = S.years[x.symbol], q = S.q[x.symbol];
    if (!yr) continue;
    // (only a year's: one older isn't next year's to expect; from the years it's paid, where they're here)
    const last = yearDivs(divHistory(x.symbol), now / 1000);
    // (one-offs told from the years it's paid, where they're here; else from its last year's)
    const one = new Set(markDivs(divHistory(x.symbol)).filter((d) => d.special).map((d) => d.t));
    let year = 0, n = 0;
    for (const d of last) {
      const v = d.amount * x.qty * rate(q.cur), at = new Date(d.t * 1000);
      if (one.has(d.t)) { specials.push({ x, v, at }); continue; }
      at.setFullYear(at.getFullYear() + 1);
      // (one that's gone this month already comes round again next year, in this month's place)
      let k = (at.getFullYear() - y0) * 12 + at.getMonth() - m0;
      if (k >= 12) k -= 12;
      year += v; n++;
      months[Math.max(0, k)].total += v; months[Math.max(0, k)].items.push({ x, v, at });
      events.push({ x, v, at });
    }
    if (n) payers.push({ x, year, n, yld: q.price ? (year / (x.qty * rate(q.cur)) / q.price) * 100 : null });
    else none.push(x);
  }
  return { months, events: events.filter((e) => e.at > now).sort((a, b) => a.at - b.at), payers: payers.sort((a, b) => b.year - a.year), total: payers.reduce((a, p) => a + p.year, 0), none, specials };
}
// one's dividends over the years (from your income's history, S.inc), else over the last year
const divHistory = (sym) => (S.inc?.v?.[sym]?.divs?.length ? S.inc.v[sym].divs : S.years[sym]?.divs || []);
// every dividend that's paid you (S.inc), in pounds at today's rate, oldest first: [{ x (the holding, or one you've sold
// all of), v, at, qty, amount (a share's, in its currency), cur, special }]
function gotAll() {
  const out = [];
  for (const [sym, g] of Object.entries(S.inc?.v || {})) {
    const q = S.q[sym], r = rate(q?.cur);
    if (r == null) continue;
    const x = S.list.find((y) => y.symbol === sym) || { symbol: sym, name: nameOf(sym), qty: 0 }, one = new Set(markDivs(g.divs).filter((d) => d.special).map((d) => d.t));
    for (const e of g.got) out.push({ x, v: e.amount * e.qty * r, at: new Date(e.t * 1000), qty: e.qty, amount: e.amount, cur: q.cur, special: one.has(e.t) });
  }
  return out.sort((a, b) => a.at - b.at);
}
// What's paid you, month by month over the last twelve, this month last: { months ({ d, total, items }), total (the
// twelve's), since (all of it), from (the first day counted, ms) }
function received() {
  const now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth(), months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(y0, m0 - 11 + i, 1), total: 0, items: [] }));
  let since = 0, from = null;
  for (const e of gotAll()) {
    since += e.v;
    const k = (e.at.getFullYear() - y0) * 12 + e.at.getMonth() - m0 + 11;
    if (k >= 0 && k < 12) { months[k].total += e.v; months[k].items.push(e); }
  }
  for (const g of Object.values(S.inc?.v || {})) if (g.from && (!from || g.from < from)) from = g.from;
  return { months, total: months.reduce((a, m) => a + m.total, 0), since, from };
}
// The tax year's dividends, April to March: what's paid so far, and what's expected for the rest of it. { months ({ d,
// total, paid, items }), paid, coming, name ("2026–27"), outside (paid so far outside an ISA or pension: what counts
// towards the dividend allowance), outsideComing, inside (paid so far in one, tax-free) }
const DIVIDEND_ALLOWANCE = 500;     // (the UK's, a tax year, since April 2024)
function taxMonths(I = income()) {
  const ty = taxYearOf(), now = Date.now(), months = Array.from({ length: 12 }, (_, i) => ({ d: new Date(ty.start, 3 + i, 1), total: 0, paid: 0, items: [] }));
  const at = (d) => (d.getFullYear() - ty.start) * 12 + d.getMonth() - 3, wrapped = (x) => x.account === "isa" || x.account === "sipp";
  const T = { months, paid: 0, coming: 0, name: ty.name, outside: 0, outsideComing: 0, inside: 0 };
  for (const e of gotAll()) {
    const k = at(e.at);
    if (+e.at < ty.from || +e.at > now || k < 0 || k > 11) continue;
    months[k].total += e.v; months[k].paid += e.v; months[k].items.push({ ...e, done: true }); T.paid += e.v;
    if (wrapped(e.x)) T.inside += e.v; else T.outside += e.v;
  }
  for (const e of I.events) {
    const k = at(e.at);
    if (+e.at >= ty.to || k < 0 || k > 11) continue;
    months[k].total += e.v; months[k].items.push(e); T.coming += e.v;
    if (!wrapped(e.x)) T.outsideComing += e.v;
  }
  return T;
}
// how fast your dividends have grown, a year, over five (each payer's, weighted by what it pays you; null where none's
// paid long enough to say), kept between a 5% fall and a 10% rise
function growthOf(I) {
  let w = 0, g = 0;
  for (const p of I.payers) { const r = health(divHistory(p.x.symbol)); if (r?.growth != null) { w += p.year; g += p.year * r.growth; } }
  return w ? Math.max(-0.05, Math.min(0.1, g / w)) : null;
}
const monthSaid = (d, long = false) => d.toLocaleDateString("en-GB", { month: long ? "long" : "short" });
// (a dividend to come, its day ("1 Oct") or month ("October"): with its year where that's this month's a year on, so it
// isn't read as a day that's been: income.js yearOn)
const aroundDay = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(yearOn(d) ? { year: "numeric" } : {}) });
const aroundMonth = (d) => `${monthSaid(d, true)}${yearOn(d) ? ` ${d.getFullYear()}` : ""}`;
// a year of it, a bar a month (the chosen one bright). o: { add: twelve more, drawn on top apart (what a buy would add),
// est (m) → true where it's still to come (drawn outlined) }
function incomeBars(I, chosen, onPick, tall = 120, o = {}) {
  const max = Math.max(...I.months.map((m, i) => m.total + (o.add?.[i] || 0)), 0.01), bar = (v) => `height:${Math.max(3, Math.round((v / max) * tall))}px`;
  // (as buttons, each says its month and what's in it; drawn small in a row, the row is a picture, its words the row's)
  return h("div.ibars", onPick ? { role: "group", "aria-label": "Dividends by month" } : { "aria-hidden": "true" }, I.months.map((m, i) => h(onPick ? "button.ib" : "span.ib", { ...(onPick ? { type: "button", "aria-pressed": String(i === chosen), onclick: () => onPick(i), "aria-label": `${monthSaid(m.d, true)}: ${money(m.total, "GBP", 0)}` } : {}), vars: { k: String(i) } },
    o.add?.[i] ? h("i.add", { style: bar(o.add[i]) }) : null,
    h("i", { class: m.total > 0 ? (o.est?.(m) ? "est" : null) : "none", style: bar(m.total) }), h("span", { text: monthSaid(m.d).slice(0, onPick ? 3 : 1) }))));
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
    if (now >= o.start && now < o.end) { const m = Math.round((o.end - now) / 60), hrs = Math.floor(m / 60), left = `${hrs ? `${hrs}h ` : ""}${m % 60}m`; return { open: true, text: `${where} open · closes in ${left}`, short: `${where} · ${left} left` }; }
    return null;
  };
  return say("^FTSE", "London") || say("^GSPC", "New York") || { open: false, text: "Markets closed" };
}
// How old the prices are, where they're old: not got for a few minutes (this phone's copy, offline, or Markets's prices
// not answering), said as from when they were; or given by Markets from before, its source not answering (stale), said
// as delayed. null while they're fresh
const clock = (t) => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }); };
function oldSaid() {
  // (not in the moment the app's opening, its account's answer on the way: this phone's copy would be said as old, then
  // not, on nearly every open; S.opening, till when)
  if (Date.now() < (S.opening || 0)) return null;
  if (S.pricesAt && Date.now() - S.pricesAt > 150e3) return `Prices from ${clock(S.pricesAt)}`;
  return [...INDICES, ...owned().map((x) => x.symbol)].some((s) => S.q[s]?.stale) ? "Prices delayed" : null;
}
// what's said along the top: the prices' age where they're old (the dot grey), else the markets, open or shut
function lineSaid() { const old = oldSaid(); return old ? { open: false, text: old } : marketSaid(); }
// (and when the prices were got, for the desk's foot, while they're fresh: once they're old, the line beside it says so)
const pricesAtSaid = () => (oldSaid() ? "" : `Prices at ${clock(S.pricesAt || Date.now())}`);
// said again where it shows, as the prices come in or don't
function sayLine() {
  const line = $(".mhead .ifh-line .eyebrow");
  if (line) lineIn(line, lineSaid());
  dispatchEvent(new Event("mk:said"));
}
// (its dot and its words; in fewer words where the header's too narrow for them all, an iPhone SE's: "London · 2h 5m
// left", so the time's never what's cut)
function lineIn(line, said) {
  const words = h("span.said", { text: said.text, ...(said.short ? { "data-full": said.text, "data-short": said.short } : {}) });
  line.replaceChildren(h("i.live" + (said.open ? "" : ".shut")), words);
  if (said.short) requestAnimationFrame(() => fitLine(words));
  return line;
}
// (all its words where they fit, else fewer: measured again as the phone turns or the window's resized, a frame at a time
// at most, and only its words, not the page)
function fitLine(words) { words.textContent = words.dataset.full; if (words.scrollWidth > words.clientWidth + 1) words.textContent = words.dataset.short; }
let refit = 0;
for (const ev of ["resize", "orientationchange"]) addEventListener(ev, () => { refit ||= requestAnimationFrame(() => { refit = 0; const w = $(".mhead .ifh-line .said[data-short]"); if (w) fitLine(w); }); });

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
  // (opening Holdings, each one's figure there how it's done since you bought it)
  if (T.back != null && T.costed.length) out.push({ rank: 1, kick: "Since you bought", c: T.back >= 0 ? "var(--up)" : "var(--down)", open: () => { S.fig = "back"; go("holdings"); }, h: `${T.back >= 0 ? "Up" : "Down"} ${money(Math.abs(T.back), "GBP", 0)} on what you paid`,
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
  const line = lineIn(h("span.eyebrow", { style: "font-size:15px" }), lineSaid());
  const hd = IFL.header({ title, me: meFace(), onMe: youMenu, cls: "mhead", lineNode: line,
    acts: [{ icon: "search", label: "Find and add", onclick: () => openSheet(searchView) }, IFL.hub.on && { icon: "sliders", label: "Settings", onclick: () => openSheet(settingsView) }] });
  // (at InFlite's hub the menu button is Back, and Markets' own few settings sit beside Find and Add: your account,
  // notifications and signing out are InFlite's there, in You)
  if (IFL.hub.on) hd.querySelector(".ifh-me")?.replaceWith(hubBack());
  return hd;
}
// ---- at InFlite's hub: Markets a page of inflite.ai (/markets/), in one window with Today, Chats and every app ----
// Known by the marker the hub's server puts on the page (IFL.hub.on), never by the address. There: Back where you came
// from (IFL.hub.back: the page you left, else Apps); signing in through Chats (markets/account.js); a stock sent through
// Chats' sheet over this page (IFL.hub.send); your account, notifications and signing out in You (/#you); and the
// notifications' subscription InFlite's own, which Markets never asks for, keeps with the account or lets go, and the
// icon's badge InFlite's too (Chat's count among it), which Markets never clears. Off the hub, all as it ever was.
// (on a narrow phone, under 360 points, the chevron alone, so the header's title keeps its room: styles.css; its name
// Back all the same)
const hubBack = () => h("button.ifl-back.press", { type: "button", "aria-label": "Back", onclick: () => IFL.hub.back() }, icon("back", 20, 2.4), h("span", { text: "Back", "aria-hidden": "true" }));
const toYou = () => { const to = IFL.hub.href("today", "you"); if (to) location.assign(to); };

// ---- sections, by the address: #today, #holdings, #news (the tabs) and #s=TSCO.L (a stock's page) ----
// Read as Markets opens, whenever the hash changes (an open page told again: a link, or a notification tapped while
// it's open at the hub) and from Markets' own worker's markets:open (a notification tapped while it's open off the
// hub). Then taken out of the address, as a stock's always was; at the hub the address says the tab you're on instead
// (#holdings, kept as you change tabs), so the way back to this page (Back, Chats' back=) comes back to it.
const SECTIONS = ["today", "holdings", "news"];
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
// → { sym } or { tab }, or null for a hash that asks for neither
function sectionOf(hash) {
  const s = String(hash || "").replace(/^#/, ""), m = /(?:^|&)s=([^&]*)/.exec(s);
  if (m) { let sym = null; try { sym = decodeURIComponent(m[1]).toUpperCase(); } catch (_) {} return sym && SYMBOL.test(sym) ? { sym } : null; }
  return SECTIONS.includes(s) ? { tab: s } : null;
}
// (the address, as it should be now: at the hub, the tab; off it, the page alone)
// At the hub, a stock asked for stays in the address until it's opened, once it's known who's signed in: so Sign in
// (the hub's, which comes back to this address), Try Again (a reload) and a notification tapped after the sign-in
// lapsed still come to it. Off the hub, taken out at once, as ever.
function addressSays() {
  try { history.replaceState(history.state, "", location.pathname + location.search + (IFL.hub.on ? `#${S.tab}` : "")); } catch (_) {}
}
function openTo(hash) {
  const at = sectionOf(hash);
  if (!at) return false;
  if (!S.me) {
    if (at.tab) S.tab = at.tab;
    if (at.tab || !IFL.hub.on) addressSays();
    return true;
  }
  addressSays();
  if (at.tab) { if (Sheet.stack.length) closeSheet(); if (S.tab !== at.tab) go(at.tab); }
  else openStock(at.sym);
  return true;
}
const meFace = () => (S.me?.photoAt ? h("img", { src: A.photoUrl(S.me.photoAt), alt: "", width: 44, height: 44 }) : document.createTextNode((S.me?.name || "Y").trim().slice(0, 1).toUpperCase()));

// On a big screen (an iPad across, a Mac): the desk, everything at once (desk.js, fetched only there)
const DESK = matchMedia("(min-width: 1100px)");
// (the desk's module once it's in; and what was on it before an update, put back as it's first drawn)
let deskMod = null, deskApi = null, deskWas = null;
function render(animate = true) {
  if (!S.me) return;
  document.body.classList.remove("out");
  // (once it's failed, never asked for again here: drawn again from its failure, it'd be asked again, round and round)
  if (DESK.matches && S.list.length && !DESK.failed) {
    deskMod ??= import("./desk.js").catch(() => null);
    deskMod.then((m) => {
      // (if it couldn't be fetched, the phone's layout instead; and where that's because a new version's files have come
      // in under this one (its worker's renewed them, and the new desk.js asks this app.js for what it hasn't got), the
      // new version put in now, unless you're in the middle of something: it opens on the desk)
      if (!m) { if (DESK.failed) return; DESK.failed = true; render(animate); if (IFL.updateReady() && calm()) IFL.update(); return; }
      if (!DESK.matches) return;
      deskApi = m;
      if (deskWas) { m.deskBack(deskWas); deskWas = null; }
      document.body.classList.add("desk-on");
      keepFocus(() => main.replaceChildren(m.deskView(animate)));
      main.removeAttribute("aria-busy");
      document.title = "Markets";
    });
    return;
  }
  document.body.classList.remove("desk-on");
  tabsEl.style.setProperty("--tab", ["today", "holdings", "news"].indexOf(S.tab));
  tabsEl.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === S.tab ? "page" : "false"));
  const body = S.tab === "holdings" ? holdingsView() : S.tab === "news" ? newsView() : todayView();
  const view = h("section.view", {}, body);
  if (!animate) view.style.animation = "none";
  keepFocus(() => main.replaceChildren(head({ today: "Markets", holdings: "Holdings", news: "News" }[S.tab]), view));
  main.removeAttribute("aria-busy");
  document.title = { today: "Markets", holdings: "Holdings · Markets", news: "News · Markets" }[S.tab];
  requestAnimationFrame(() => { IFL.settle(window); afterDraw(animate); });
}
// Something drawn again under you, your place kept: what had the keyboard (or VoiceOver) has it again, found by its id
// or its data-k (or, where that's gone, the control it came from: "m:comp:SPY", then "m:comp"), with what was typed in
// it and where in it
function keepFocus(redo) {
  const a = document.activeElement, id = a?.id || null, k = a?.dataset?.k || null, v = a?.tagName === "INPUT" ? a.value : null;
  let s = null, e = null;
  try { s = a?.selectionStart ?? null; e = a?.selectionEnd ?? null; } catch (_) {}
  redo();
  if (!a || a.isConnected || (!id && !k)) return;
  let n = id ? document.getElementById(id) : null;
  for (let key = k; !n && key; key = key.includes(":") ? key.slice(0, key.lastIndexOf(":")) : "") n = document.querySelector(`[data-k="${CSS.escape(key)}"]`);
  if (!n) return;
  if (v && n.tagName === "INPUT" && !n.value) n.value = v;
  n.focus({ preventScroll: true });
  if (s != null && n.tagName === "INPUT") try { n.setSelectionRange(s, e); } catch (_) {}
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
      h("span.delta.num", {}, h("span", { id: "pd", class: tone(T.day), text: signed(T.day) }), h("span", { id: "pp", class: tone(T.day), text: pct(T.dayPct) }), h("span.muted", { id: "ps", text: "today" })),
      leftOutSaid() ? h("span.leftout", { text: leftOutSaid() }) : null));
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
  // (the range drawn: where another can't be, it stays, pressed again, and today's goes on being kept fresh: refresh)
  let seq = 0, drawn = "1d";
  const press = (r) => { const b = seg.querySelector(`[data-r="${r}"]`); if (!b) return; seg.querySelector(".sl").style.transform = `translateX(${b.offsetLeft}px)`; seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); };
  const show = async (r) => {
    const n = ++seq;
    S.prange = r;
    box.classList.add("loading");
    const s = r === "1d" ? daySeries() : await rangeSeries(r);
    if (n !== seq || !box.isConnected) return;
    box.classList.remove("loading");
    if (!s) { S.prange = drawn; press(drawn); toast("Couldn't draw that just now. Try again in a moment.", true); return; }
    drawn = r;
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
    press(b.dataset.r);
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
  // (one with no price, still yours to open, move, change or remove: one that's stopped trading, as when it's been taken over)
  if (!q) return h("button.item.rise", { type: "button", vars: { i: String(i) }, "data-sym": x.symbol, onclick: () => open(x.symbol) },
    h("span", {}, h("b", { text: x.name }), h("small", { text: "Price not available just now" })));
  const own = x.qty > 0, sp = C.el("svg", { viewBox: "0 0 64 26", "aria-hidden": "true" });
  sp.append(C.el("path", { d: C.spark(q.spark, 64, 26, q.prev), fill: "none", stroke: (q.chgPct || 0) >= 0 ? "var(--up)" : "var(--down)", "stroke-width": 1.6, "stroke-linecap": "round", "data-draw": String(0.15 + i * 0.05) }));
  // (yours, but not in pounds yet, its currency's rate not in: nothing said as £0.00, and it's said as left out (figOf))
  const out = own && valueOf(x) == null;
  const right = mode === "value" && own ? [h("b.num", { "data-val": x.symbol, text: out ? "–" : money(valueOf(x)) })] : own ? [h("b.num", { "data-dg": x.symbol, text: out ? "–" : signed(dayOf(x)) })] : [h("b.num", { "data-px": x.symbol, text: priceSaid(q) })];
  return h("button.item.rise", { type: "button", vars: { i: String(i) }, "data-sym": x.symbol, onclick: () => open(x.symbol) },
    h("span", {}, h("b", { text: x.name }), h("small", {}, mode === "value" ? (own ? `${fmt(x.qty, x.qty % 1 ? 2 : 0)} ${x.qty === 1 ? "share" : "shares"} · ` : "") : "",
      mode === "day" && !own ? "Following" : mode === "value" && !own ? [plainSym(x.symbol), q.ex].filter(Boolean).join(" · ") : h("span.num", { "data-px": x.symbol, text: priceSaid(q) }))),
    sp, h("span.r", {}, ...right, mode === "value" && own ? figOf(x) : h("small", { class: `num ${tone(q.chgPct)}`, "data-pct": x.symbol, text: pct(q.chgPct) })));
}
// under a holding's worth: today's change, or (switched) how it's done since you bought, with its dividends
function figOf(x) {
  const q = S.q[x.symbol];
  if (valueOf(x) == null) return h("small.flat-t", { text: "Not in total" });
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
  if (S.list.length > 1) parts.push(h("p.hint.center", { style: "margin-top:4px" }, "Press and hold one to move it, or ", h("button.inline", { type: "button", onclick: () => openSheet(orderView), text: "move them a step at a time" }), "."));
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
  // (the biggest five and the rest together; six, each its own: one on its own is no "everything else")
  const all = [...T.o].sort((a, b) => valueOf(b) - valueOf(a)), n = all.length === 6 ? 6 : 5, top = all.slice(0, n), rest = all.slice(n).reduce((a, x) => a + valueOf(x), 0);
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
  if (leftOutSaid()) notes.push(`${leftOutSaid()} `);
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
      drag = { row, rows, from, to: from, step: row.offsetHeight, hs: rows.map((r) => r.offsetHeight) };
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
    const dy = y - y0, { row, rows, from, step, hs } = drag, way = Math.sign(dy);
    // (past each once past its middle, by its own height: one whose name's over two lines is taller)
    let to = from;
    for (let i = from + way, d = Math.abs(dy); way && i >= 0 && i < rows.length && d > hs[i] / 2; d -= hs[i], i += way) to = i;
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

// Your list's order, a step at a time: each one's Move Up and Move Down, for where pressing and holding isn't the way
// (VoiceOver, Switch Control, a keyboard). Each change kept with your account as it's made, in turn (the last one's
// answer taken as the list); one at the top or foot can't go further, but keeps the keyboard where it is
const ORDER = { q: Promise.resolve(), n: 0 };
function orderView() {
  const own = S.list.filter((x) => x.qty > 0), fol = S.list.filter((x) => !(x.qty > 0));
  const move = (group, i, by) => {
    const j = i + by;
    if (j < 0 || j >= group.length) return;
    [group[i], group[j]] = [group[j], group[i]];
    S.list = [...own, ...fol];
    // (drawn again where it was, not back at its top, the one moved kept in sight)
    const y = sbody.scrollTop;
    drawSheet(); render(false);
    sbody.scrollTop = y; if (sbody.contains(document.activeElement)) document.activeElement.scrollIntoView({ block: "nearest" });
    $("#sheet-say").textContent = `${group[j].name}: ${j + 1} of ${group.length}`;
    const n = ++ORDER.n, syms = S.list.map((x) => x.symbol);
    ORDER.q = ORDER.q.then(() => A.order(syms)).then((r) => { if (n === ORDER.n) { S.list = r.holdings; render(false); } }, (e) => { toast(e.message, true); });
  };
  const rows = (group, label) => (group.length > 1 ? [h("h3.slabel", { text: label }), h("div.list.flush", {}, group.map((x, i) => h("div.item.ord", {},
    h("span", {}, h("b", { text: x.name }), h("small", { text: plainSym(x.symbol) })),
    h("button.mv", { type: "button", "data-k": `up:${x.symbol}`, "aria-label": `Move ${x.name} up`, "aria-disabled": String(i === 0), onclick: () => move(group, i, -1) }, icon("up", 18, 2.4)),
    h("button.mv", { type: "button", "data-k": `down:${x.symbol}`, "aria-label": `Move ${x.name} down`, "aria-disabled": String(i === group.length - 1), onclick: () => move(group, i, 1) }, icon("down", 18, 2.4)))))] : []);
  return [h("div.shead", {}, h("span"), h("h2", { text: "Change Order" }), closeBtn()), ...rows(own, "Your holdings"), ...rows(fol, "Following")];
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
    h("span", {}, h("b", { text: "Dividends" }), h("small", { text: next ? `Next: about ${money(next.v, "GBP", 0)} in ${aroundMonth(next.at)}, from ${next.x.name}` : `From ${plural(I.payers.length, "holding")}` })),
    h("span.r", {}, h("b.num", { text: money(I.total, "GBP", 0) }), h("small", { text: "a year" })),
    h("div.mini", {}, incomeBars(I, -1, null, 26))))];
}
// Your income: what's coming, month by month; what's paid you; the tax year, with its allowance; what it pays on what
// you paid; where it could go; who pays, and how dependably; and each tax year's payments, to keep
function incomeView() {
  const I = income();
  // (dividends asked for where they aren't here yet, and your income's history: once)
  if (!incomeView.asked && owned().some((x) => !S.years[x.symbol]?.divs)) { incomeView.asked = true; loadYears().then(() => { if (Sheet.stack.at(-1)?.[0] === incomeView) drawSheet(); }); }
  loadIncome();
  const mode = S.imode, have = !!S.inc;
  const sw = h("div.per.imode", { role: "group", "aria-label": "Show" }, [["coming", "Coming"], ["received", "Received"], ["tax", "Tax year"]].map(([k, label]) => h("button", { type: "button", "data-k": `im:${k}`, "aria-pressed": String(mode === k), text: label,
    onclick: () => { if (S.imode !== k) { S.imode = k; drawSheet(); } } })));
  const top = [h("div.shead", {}, h("small", { text: "Income" }), closeBtn()), sw];
  if (mode !== "coming" && !have) return [...top, loadIncome.failed && !loadIncome.busy
    ? h("p.hint", { style: "margin-top:18px" }, "Couldn't count what's been paid just now. ", h("button.inline", { type: "button", "data-k": "inc:again", onclick: () => { loadIncome(true); drawSheet(); }, text: "Try Again" }))
    : h("p.hint", { style: "margin-top:18px", text: "Counting what's been paid…" })];
  const R = mode === "received" ? received() : null, T = have ? taxMonths(I) : null, M = mode === "coming" ? I : mode === "received" ? R : T;
  const total = mode === "coming" ? I.total : mode === "received" ? R.total : T.paid + T.coming;
  // (the month first shown: the next with anything coming; the last that paid; this one)
  let chosen = mode === "coming" ? Math.max(0, M.months.findIndex((m) => m.total > 0)) : mode === "received" ? Math.max(0, M.months.findLastIndex((m) => m.total > 0)) : Math.max(0, M.months.findIndex((m) => m.d.getMonth() === new Date().getMonth()));
  const month = h("div", { id: "imonth" }), say = h("p.why", { style: "margin-top:22px" });
  const dayMon = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const row = (e) => e.done || mode === "received"
    ? h("button.item.two.rise", { type: "button", onclick: () => pushSheet(stockView, e.x.symbol) }, h("span", {}, h("b", { text: e.x.name }), h("small", { text: `Went ex-dividend ${dayMon(e.at)} · ${fmt(e.qty, e.qty % 1 ? 2 : 0)} ${e.qty === 1 ? "share" : "shares"}${e.special ? " · a one-off" : ""}` })), h("span.r", {}, h("b.num", { text: money(e.v) })))
    // (one whose day's been, with nothing paid yet, counted in this month: said as due, not as a day that's been)
    : h("button.item.two.rise", { type: "button", onclick: () => pushSheet(stockView, e.x.symbol) }, h("span", {}, h("b", { text: e.x.name }), h("small", { text: +e.at < new Date().setHours(0, 0, 0, 0) ? `Ex-dividend due, was around ${dayMon(e.at)}` : `Goes ex-dividend around ${aroundDay(e.at)}` })), h("span.r", {}, h("b.num", { text: `about ${money(e.v)}` })));
  const pick = (i) => {
    chosen = i;
    bars.querySelectorAll(".ib").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    const m = M.months[i], past = mode === "received" || (mode === "tax" && m.paid >= m.total - 0.005 && m.total > 0);
    // (this month's, where all that's in it is next year's: said as next year's)
    const later = mode === "coming" && m.items.length && m.items.every((e) => yearOn(e.at));
    say.replaceChildren(m.total > 0 ? `${past ? "" : "About "}${money(m.total, "GBP", 0)} in ${monthSaid(m.d, true)}${mode === "coming" ? (later ? ` ${m.items[0].at.getFullYear()}` : "") : ` ${m.d.getFullYear()}`}` : `Nothing ${mode === "received" ? "paid" : "expected"} in ${monthSaid(m.d, true)}`,
      h("small", { text: m.total > 0 ? `From ${and2([...new Set(m.items.map((e) => e.x.name))])}` : "Tap another month" }));
    month.replaceChildren(h("div.list.flush", {}, m.items.slice().sort((a, b) => b.v - a.v).map((e, k) => { const r = row(e); r.style.setProperty("--i", String(k)); return r; })));
  };
  const bars = incomeBars(M, chosen, pick, 120, mode === "tax" ? { est: (m) => m.paid < m.total / 2 } : {});
  pick(chosen);
  const head = mode === "coming" ? (I.total ? `${money(I.total, "GBP", 0)} a year` : "No dividends yet") : mode === "received" ? `${money(R.total, "GBP", 0)} in a year` : `${money(T.paid, "GBP", 0)} this tax year`;
  const sub = mode === "coming"
    ? (I.total ? `About ${money(I.total / 12, "GBP", 0)} a month on average, from ${plural(I.payers.length, "holding")}, at what each paid over the last year for what you own now.${I.specials.length ? ` One-offs left out: ${and2(I.specials.map((e) => `${money(e.v, "GBP", 0)} from ${e.x.name}`))}.` : ""}` : "None of what you own has paid a dividend in the last year.")
    : mode === "received" ? (R.from ? `${money(R.since, "GBP", 0)} since ${new Date(R.from).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}, on the shares you had each time one went ex-dividend. In pounds at today's rate.` : "Say when you bought each holding (on its page) to count what it's paid you.")
    : `${T.name}, so far. About ${money(T.paid + T.coming, "GBP", 0)} by 5 April, with what's still to come outlined.`;
  return [...top,
    h("div.sprice.num", { style: "margin-top:14px", text: head }),
    h("p.hint", { style: "margin-top:8px", text: sub }),
    ...(total || mode !== "coming" ? [h("div.ichart", {}, bars), mode === "tax" ? h("div.ilegend", {}, h("span", {}, h("i"), "Paid"), h("span", {}, h("i.est"), "To come")) : null, say, month] : []),
    ...(I.total ? yieldPart(I) : []),
    ...(T ? allowancePart(T) : []),
    ...(I.total ? [h("h3.slabel", { text: "Where it could go" }), planCard(I)] : []),
    ...(I.payers.length || I.none.length ? [h("h3.slabel", { text: "Who pays" }), h("div.list.flush", {}, I.payers.map((p, k) => payerRow(p, k, I)), I.none.map((x) => h("button.item.two", { type: "button", onclick: () => pushSheet(stockView, x.symbol) },
      h("span", {}, h("b", { text: x.name }), h("small", { text: /\b(acc|accumulating|accumulation)\b/i.test(x.name) ? "Accumulation units: it reinvests inside the fund" : "No dividends in the last year" })), h("span.r", {}, h("b.flat-t", { text: "None" })))))] : []),
    ...exportPart(),
    h("p.hint", { text: "Expected from last year's dividends, in the month each went ex-dividend (it's paid a few weeks after); one-offs are left out. Amounts and dates can change, and ones paid in dollars are shown in pounds at today's rate." })];
}
// what it pays on what it's worth, and on what you paid
function yieldPart(I) {
  const T = totals(), costed = I.payers.filter((p) => p.x.cost != null), paidIn = costed.reduce((a, p) => a + paidFor(p.x), 0), fromCosted = costed.reduce((a, p) => a + p.year, 0);
  const stat = (label, v, sub) => h("div.stat", {}, h("small", { text: label }), h("b.num", { text: v }), h("span", { text: sub }));
  return [h("h3.slabel", { text: "What it pays you" }), h("div.stats.flush", {},
    stat("Yield, at today's prices", T.value ? `${fmt((I.total / T.value) * 100, 1)}%` : "–", `on the ${money(T.value, "GBP", 0)} it's all worth`),
    paidIn ? stat("On what you paid", `${fmt((fromCosted / paidIn) * 100, 1)}%`, `on the ${money(paidIn, "GBP", 0)} you put in`) : stat("On what you paid", "–", "Say what you paid on each one's page"))];
}
// the tax year's dividend allowance: what outside an ISA or pension has used of it
function allowancePart(T) {
  const used = Math.min(1, T.outside / DIVIDEND_ALLOWANCE), soon = Math.min(1 - used, T.outsideComing / DIVIDEND_ALLOWANCE);
  return [h("h3.slabel", { text: `Dividend allowance, ${T.name}` }),
    h("div.irow", {}, h("b.num", { text: `${money(T.outside, "GBP", 0)} of ${money(DIVIDEND_ALLOWANCE, "GBP", 0)} used` }), h("small", { text: T.outsideComing >= 0.5 ? `about ${money(T.outside + T.outsideComing, "GBP", 0)} by 5 April` : `${money(Math.max(0, DIVIDEND_ALLOWANCE - T.outside), "GBP", 0)} left` })),
    h("div.allow2", {}, h("i", { style: `width:${used * 100}%` }), h("i.soon", { style: `width:${soon * 100}%` })),
    h("p.ismall", { text: `Dividends outside an ISA or pension count towards it; in one they're tax-free${T.inside >= 0.5 ? ` (${money(T.inside, "GBP", 0)} so far)` : ""}. Counted by when each went ex-dividend: it's paid, and taxed, a few weeks after.` })];
}
// a payer, and how dependable it's been
function payerRow(p, k, I) {
  const r = health(divHistory(p.x.symbol)), tags = [];
  if (r?.raised >= 2) tags.push(["up", `Raised ${r.raised} years running`]);
  else if (r?.held >= 3) tags.push(["", `No cut in ${r.held} years`]);
  if (r?.cut) tags.push(["warn", `Cut in ${r.cut}`]);
  if (r?.growth != null && Math.abs(r.growth) >= 0.005) tags.push(["", `${r.growth > 0 ? "+" : "−"}${fmt(Math.abs(r.growth) * 100, 1)}% a year over 5 years`]);
  for (const e of I.specials.filter((e) => e.x === p.x)) tags.push(["warn", `One-off ${money(e.v, "GBP", 0)} in ${monthSaid(e.at, true)}, left out`]);
  return h("button.item.two.rise", { type: "button", vars: { i: String(k) }, onclick: () => pushSheet(stockView, p.x.symbol) },
    h("span", {}, h("b", { text: p.x.name }), h("small", { text: `${p.yld != null ? `Yield ${fmt(p.yld, 1)}% · ` : ""}${plural(p.n, "payment")} a year · ${p.x.account ? ACCOUNT_NAME[p.x.account] : "Not in an account"}` }),
      tags.length ? h("span.ichips", {}, tags.map(([c, t]) => h(c ? `span.ichip.${c}` : "span.ichip", { text: t }))) : null),
    h("span.r", {}, h("b.num", { text: money(p.year, "GBP", 0) }), h("small", { text: `${Math.round((p.year / I.total) * 100)}%` })));
}
// Where it could go: a monthly income to aim for, how far along you are, and twenty years ahead, reinvesting or not
function planCard(I) {
  const T = totals(), g = growthOf(I), growth = g ?? 0.03, y = T.value ? I.total / T.value : 0, year0 = new Date().getFullYear();
  const ring = h("span.gring"), head = h("b"), sub = h("small"), goalSaid = h("span"), addSaid = h("span"), chart = h("div.proj"), out = h("p.out"), note = h("p.ismall");
  const update = () => {
    const P = project({ worth: T.value, yield: y, growth, add: S.add, reinvest: S.reinvest, goal: S.goal * 12 }), now = I.total / 12;
    goalSaid.textContent = `${money(S.goal, "GBP", 0)} a month`; addSaid.textContent = money(S.add, "GBP", 0);
    ring.replaceChildren(ringSvg(now / S.goal));
    head.textContent = `${money(now, "GBP", 0)} of ${money(S.goal, "GBP", 0)} a month`;
    sub.textContent = `${Math.round(Math.min(1, now / S.goal) * 100)}% of your goal, at today's yield`;
    chart.replaceChildren(projSvg(P, S.goal * 12, year0));
    out.textContent = P.reach === 0 ? "You're there already." : P.reach != null ? `About ${money(S.goal, "GBP", 0)} a month by ${year0 + P.reach}, in ${plural(P.reach, "year")}.` : "Not within 60 years like this. Try adding more each month.";
    note.textContent = `${S.reinvest ? "" : `Paid to you over 20 years: about ${money(P.cash, "GBP", 0)}. `}Assumes today's yield (${fmt(y * 100, 1)}%), and that dividends and prices grow ${fmt(growth * 100, 1)}% a year${g != null ? ", as your holdings' dividends have over five years" : " (there's too little history to go on)"}. Before inflation and tax.`;
    store.set("plan", { goal: S.goal, add: S.add, reinvest: S.reinvest });
  };
  const knob = (id, label, said, key, min, max, step) => h("div.knob", {}, h("label", { for: id }, label, said),
    h("input", { id, type: "range", min: String(min), max: String(max), step: String(step), value: String(S[key]), oninput: (e) => { S[key] = +e.target.value; update(); } }));
  const sw = h("div.per", { role: "group", "aria-label": "Dividends" }, [[true, "Reinvest"], [false, "Take as cash"]].map(([v, label]) => h("button", { type: "button", "aria-pressed": String(S.reinvest === v), text: label,
    onclick: () => { S.reinvest = v; sw.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String((i === 0) === v))); update(); } })));
  update();
  return h("div.plan", { id: "plan" }, h("div.goal", {}, ring, h("span", {}, head, sub)),
    knob("igoal", "Your goal", goalSaid, "goal", 25, 1000, 25), knob("iadd", "Adding each month", addSaid, "add", 0, 1500, 50),
    h("div.knob.inline", {}, h("span", { text: "Dividends" }), sw), chart, out, note);
}
const ringSvg = (f) => {
  const c = 2 * Math.PI * 22, s = C.el("svg", { viewBox: "0 0 56 56", width: 56, height: 56, "aria-hidden": "true" });
  s.append(C.el("circle", { class: "rbg", cx: 28, cy: 28, r: 22 }), C.el("circle", { class: "rfg", cx: 28, cy: 28, r: 22, "stroke-dasharray": c.toFixed(1), "stroke-dashoffset": (c * (1 - Math.max(0, Math.min(1, f)))).toFixed(1), transform: "rotate(-90 28 28)" }));
  return s;
};
// twenty years of a year's income, drawn to scale, with the goal across it
function projSvg(P, goal, year0) {
  const W = 320, H = 150, l = 40, r = 8, t = 14, b = 22, top = Math.max(...P.income, goal) * 1.08;
  const step = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000].find((v) => v * 2 >= top) || Math.ceil(top / 2), ymax = step * 2;
  const X = (i) => l + (i / 20) * (W - l - r), Y = (v) => t + (1 - v / ymax) * (H - t - b), k = (v) => (v >= 1000 ? `£${fmt(v / 1000, v % 1000 ? 1 : 0)}k` : money(v, "GBP", 0));
  const txt = (x, y, said, anchor) => { const e = C.el("text", { x, y, "text-anchor": anchor }); e.textContent = said; return e; };
  const s = C.el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `A year's dividends, ${year0} to ${year0 + 20}` });
  for (const v of [0, step, ymax]) s.append(C.el("line", { class: "pg", x1: l, x2: W - r, y1: Y(v), y2: Y(v) }), txt(l - 6, Y(v) + 3.5, k(v), "end"));
  const line = P.income.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  s.append(C.el("path", { class: "pa", d: `${line} L${X(20)} ${Y(0)} L${X(0)} ${Y(0)} Z` }), C.el("path", { class: "pl", d: line }));
  s.append(C.el("line", { class: "pgoal", x1: l, x2: W - r, y1: Y(goal), y2: Y(goal) }), txt(W - r, Y(goal) - 5, `Goal ${k(goal)} a year`, "end"));
  if (P.reach != null && P.reach <= 20) s.append(C.el("circle", { class: "pdot", r: 4.5, cx: X(P.reach), cy: Y(P.income[P.reach]) }));
  for (const i of [0, 10, 20]) s.append(txt(X(i), H - 6, String(year0 + i), i === 0 ? "start" : i === 20 ? "end" : "middle"));
  return s;
}
// each tax year's dividends, as a spreadsheet to keep (the last whole one, and this one so far)
function exportPart() {
  const got = gotAll(), ty = taxYearOf(), last = taxYearOf(ty.from - 864e5);
  const years = [[last, `The ${last.name} tax year`], [ty, `${ty.name}, so far`]].filter(([y]) => got.some((e) => +e.at >= y.from && +e.at < y.to));
  if (!years.length) return [];
  return [h("h3.slabel", { text: "For your tax return" }), h("div.list.flush", {}, years.map(([y, label]) => h("button.item.two", { type: "button", onclick: () => keepFile(`dividends-${y.name}.csv`, yearCsv(got, y)) },
    h("span", {}, h("b", { text: label }), h("small", { text: "Each dividend, its holding and account, as a spreadsheet" })), h("span.r", {}, h("b.tint-t", { text: "CSV" }))))),
    h("p.ismall", { text: "Dated when each went ex-dividend; your broker's statements say when each was paid." })];
}
function yearCsv(got, y) {
  const rows = [["Went ex-dividend", "Holding", "Symbol", "Account", "Shares", "Per share", "Currency", "Amount", "In pounds, at today's rate", "One-off"]];
  for (const e of got) if (+e.at >= y.from && +e.at < y.to) rows.push([e.at.toLocaleDateString("en-CA"), e.x.name, e.x.symbol, e.x.account ? ACCOUNT_NAME[e.x.account] : "Not in an account", +e.qty.toFixed(6), +e.amount.toFixed(6), e.cur, +(e.amount * e.qty).toFixed(2), +e.v.toFixed(2), e.special ? "Yes" : ""]);
  return csv(rows);
}
// a file of the app's own, to keep: offered to share where the phone can (an iPhone's way to save one), else downloaded
async function keepFile(name, text, type = "text/csv") {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  const a = h("a", { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
// If you bought some of one: what a year of its dividends would add (at what it paid over the last year, one-offs aside)
// and when, drawn on your own year, and whether it pays when nothing else does
function whatIf(q, y) {
  const box = h("div.whatif", { id: "whatif" }), r = rate(q.cur), one = new Set(markDivs(y.divs).filter((d) => d.special).map((d) => d.t)), now = new Date(), y0 = now.getFullYear(), m0 = now.getMonth();
  const draw = () => {
    const shares = S.buyAmt / (q.price * r), add = Array(12).fill(0), I = income();
    for (const d of yearDivs(y.divs, now / 1000)) {
      if (one.has(d.t)) continue;
      const at = new Date(d.t * 1000); at.setFullYear(at.getFullYear() + 1);
      let k = (at.getFullYear() - y0) * 12 + at.getMonth() - m0; if (k >= 12) k -= 12;
      add[Math.max(0, k)] += d.amount * shares * r;
    }
    const per = add.reduce((a, v) => a + v, 0), when = I.months.map((m, i) => (add[i] ? monthSaid(m.d) : null)).filter(Boolean), gaps = I.months.map((m, i) => (add[i] && !m.total ? monthSaid(m.d) : null)).filter(Boolean);
    const said = !I.total ? `In ${and2(when)}.` : gaps.length === when.length ? `In ${and2(when)}, when nothing comes now.` : gaps.length ? `In ${and2(when)}: ${and2(gaps)} when nothing comes now.` : `In ${and2(when)}, beside what you have.`;
    box.replaceChildren(h("div.whead", {}, h("span", { text: "If you bought" }), h("div.per", { role: "group", "aria-label": "How much" }, [500, 1000, 5000].map((v) => h("button", { type: "button", "aria-pressed": String(S.buyAmt === v), text: money(v, "GBP", 0), onclick: () => { S.buyAmt = v; draw(); } })))),
      h("b.num", { text: `About ${money(per, "GBP", 0)} a year` }),
      h("p", { text: `${said}${I.total ? ` Your year would go from ${money(I.total, "GBP", 0)} to about ${money(I.total + per, "GBP", 0)}.` : ""}` }),
      h("div.mini", {}, incomeBars(I, -1, null, 30, { add })));
  };
  draw();
  return box;
}

// Your year against the market, from your holdings' years and the market's (before its chart's been drawn): what you own
// now, as if held all year, with the dividends it paid, beside the first market's, with its
function vsQuick() {
  const b = S.years[BENCHES[0][0]], o = owned().filter((x) => S.years[x.symbol]?.first);
  if (!b?.first || !o.length) return null;
  let a0 = 0, a1 = 0;
  for (const x of o) { const y = S.years[x.symbol], k = x.qty * rate(S.q[x.symbol].cur); a0 += y.first * k; a1 += (y.last + (y.got12 ?? y.div12)) * k; }
  return { you: (a1 / a0 - 1) * 100, bench: ((b.last + (b.got12 ?? b.div12)) / b.first - 1) * 100, name: BENCHES[0][1] };
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

// ---- News: the day in brief (the markets, and the headline behind them; your day, who did it, and why; what's coming),
// then the stories: by what you own (each one's own, and for a trust or fund, the market it invests in), what you
// follow, and the markets; what's new since you last looked marked, and counted on the News tab ----
const TOPIC_NAME = { UK: "FTSE 100", US: "S&P 500" }, TOPIC_INDEX = { UK: "^FTSE", US: "^GSPC" };
const TOPIC_SAID = { UK: "UK companies", US: "US companies", WORLD: "companies around the world" };
const newsKey = (n) => n.link.replace(/[?#].*$/, "");
const aboutIt = (n, sym) => n.for === sym || n.tickers.includes(sym);
const sansStop = (t) => t.replace(/[.!?]$/, "");
// (when you last looked: stories since are new; set as you leave News, or the app, from it)
const newsSeen = () => store.get("newsSeen", 0);
function newsBrief() {
  const f = S.q["^FTSE"], g = S.q["^GSPC"], out = [], now = Date.now();
  const mv = (q, where) => (q?.chgPct == null ? null : `${where} ${Math.abs(q.chgPct) < 0.05 ? "is flat" : `is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`}`);
  const l1 = [mv(f, "London"), mv(g, "New York")].filter(Boolean);
  if (l1.length) {
    // (the headline behind the bigger of the two moves)
    const t = Math.abs(g?.chgPct ?? 0) >= Math.abs(f?.chgPct ?? 0) ? "US" : "UK", head = S.news?.find((n) => n.topic === t && now - n.at < 18 * 3600e3 && !newsHidden().has(n.src));
    out.push(head ? [`${l1.join(" and ")} today: `, h("span.hl", { text: sansStop(head.title) }), "."] : `${l1.join(" and ")} today.`);
  }
  const T = totals();
  if (T.o.length) {
    const top = [...T.o].sort((a, b) => Math.abs(dayOf(b) || 0) - Math.abs(dayOf(a) || 0))[0], q = S.q[top.symbol], t = S.newsTopics?.[top.symbol], iq = S.q[TOPIC_INDEX[t]];
    const own = S.news?.find((n) => aboutIt(n, top.symbol) && now - n.at < 36 * 3600e3 && !newsHidden().has(n.src));
    const why = own ? `: ${sansStop(own.title)}` : iq?.chgPct != null && q.chgPct != null && Math.sign(iq.chgPct) === Math.sign(q.chgPct) ? `: it invests in ${TOPIC_SAID[t]}, and ${t === "US" ? "US" : "UK"} shares ${iq.chgPct >= 0 ? "rose" : "fell"}` : "";
    const moved = `${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`;
    out.push(Math.abs(T.day) < 0.5 ? `Your portfolio's little changed today.`
      : `You're ${T.day >= 0 ? "up" : "down"} ${money(Math.abs(T.day), "GBP", 0)} today (${fmt(Math.abs(T.dayPct), 1)}%). ${T.o.length === 1 ? `${top.name} is ${moved}` : `${top.name} did most of it, ${moved}`}${why}.`);
  } else {
    const big = [...S.list].filter((x) => S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0];
    if (big) out.push(`The biggest mover on your list is ${big.name}, ${S.q[big.symbol].chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(S.q[big.symbol].chgPct), 1)}%.`);
  }
  const ev = income().events[0];
  if (ev) out.push((ev.at - now) / 864e5 <= 14 ? `Coming up: about ${money(ev.v, "GBP", 0)} from ${ev.x.name}, around ${ev.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`
    : `Your next dividend: about ${money(ev.v, "GBP", 0)} from ${ev.x.name}, in ${aroundMonth(ev.at)}.`);
  return out;
}
const newsHidden = () => new Set(store.get("newsHide", []));
const newsRead = () => new Set(store.get("newsRead", []));
// the stories in groups: { kind (holdings, following, markets), x (the holding), topic, stories }, each story once
function newsGroups(all) {
  const used = new Set(), out = [], newest = (a, b) => b.at - a.at;
  const take = (pred, n) => { const got = all.filter((s) => !used.has(s) && pred(s)).sort(newest).slice(0, n); got.forEach((s) => used.add(s)); return got; };
  for (const x of [...owned()].sort((a, b) => valueOf(b) - valueOf(a))) {
    const t = S.newsTopics?.[x.symbol], mine = take((s) => aboutIt(s, x.symbol), 5), mkt = t ? take((s) => s.topic && (t === "WORLD" || s.topic === t), 3) : [];
    if (mine.length || mkt.length) out.push({ kind: "holdings", x, topic: t, stories: [...mine, ...mkt].sort(newest) });
  }
  for (const x of S.list.filter((y) => !(y.qty > 0))) { const st = take((s) => aboutIt(s, x.symbol), 3); if (st.length) out.push({ kind: "following", x, stories: st }); }
  const mk = take((s) => !!s.topic, 8);
  if (mk.length) out.push({ kind: "markets", stories: mk });
  // (the same story from several publishers, once, the others under it)
  for (const g of out) g.items = storiesOf(g.stories);
  return out;
}
// what's new since you last looked, about what you own (and its markets) or follow, that you haven't read
function newsNew() {
  if (!S.news) return [];
  const seen = S.tab === "news" && S.newsSince != null ? S.newsSince : newsSeen(), read = newsRead(), hidden = newsHidden();
  return newsGroups(S.news.filter((n) => !hidden.has(n.src))).filter((g) => g.kind !== "markets").flatMap((g) => g.stories).filter((n) => n.at > seen && !read.has(newsKey(n)));
}
// the News tab's count of them (none on News itself)
function newsBadge() {
  const b = $('.tab[data-tab="news"] .tabn');
  if (!b) return;
  const n = S.tab === "news" ? 0 : newsNew().length;
  b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n);
  b.closest(".tab").setAttribute("aria-label", n ? `News, ${plural(n, "new story", "new stories")}` : "News");
}
// A story's link, opened in Markets: over the sheet that's up (a holding's page: Back comes back to it), else on its
// own; a click held for a new tab, as one
const readsIn = (n) => (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return markRead(n); e.preventDefault(); (Sheet.stack.length ? pushSheet : openSheet)(storyView, n); };
function storyRow(n, ctx, fresh, read, more = 0) {
  const chips = [];
  if (n.topic) { const iq = S.q[TOPIC_INDEX[n.topic]]; chips.push(h("span.nchip.via", { text: `${TOPIC_NAME[n.topic]}${iq?.chgPct != null ? ` ${pct(iq.chgPct, 1)}` : ""}` })); }
  for (const t of n.tickers) {
    const x = t !== ctx && S.list.find((y) => y.symbol === t), q = x && S.q[t];
    if (x) chips.push(h(`span.nchip.${tone(q?.chgPct)}`, { text: q?.chgPct != null ? `${x.name} ${pct(q.chgPct, 1)}` : x.name }));
  }
  if (more) chips.push(h("span.nchip.more", { text: `+${more} more on this` }));
  const cls = ["div.nstory", fresh && !read ? "fresh" : "", read ? "read" : ""].filter(Boolean).join(".");
  return h(cls, { "data-key": newsKey(n) },
    // (opened in Markets; a click held for a new tab, as one)
    h("a.story", { href: n.link, target: "_blank", rel: "noopener", onclick: readsIn(n) },
      h("span.m", {}, h("span", { text: `${n.src} · ${ago(n.at)}` })), h("b", { text: n.title }), chips.length ? h("span.nchips", {}, chips.slice(0, 4)) : null),
    h("button.nmore", { type: "button", "aria-label": `More: ${n.title}`, onclick: () => storyMenu(n) }, h("span", { "aria-hidden": "true" }, h("i"), h("i"), h("i"))));
}
// A story, in Markets: what it says (its page's own summary for link previews, and its picture, both through Markets),
// what it means for what you own, and the rest of the same story; its publisher's page a tap away (from the Home
// Screen, opened over the app in iPhone's own browser view, Done coming back)
function storyView(n) {
  markRead(n);
  const pic = h("div.rpic", { hidden: true }), sum = h("div.rsum", {}, h("p.rwait", { text: "Getting what it says…" }));
  const show = (src) => pic.replaceChildren(h("img", { alt: "", src: A.picUrl(src, n.link, n.k), decoding: "async", onload: () => { pic.hidden = false; }, onerror: () => pic.remove() }));
  if (n.pic) show(n.pic);
  A.story(n.link, n.k).then(({ story: p }) => {
    if (!sum.isConnected) return;
    sum.replaceChildren(...(p?.summary ? [h("h4.rlab", { text: `From ${p.site || n.src}` }), h("p.rtext", { text: p.summary })]
      : [h("p.rnone", { text: `${n.src} doesn't say more than its headline here.` })]));
    if (!n.pic && p?.image) show(p.image);
  }, () => { if (sum.isConnected) sum.replaceChildren(h("p.rnone", { text: "Couldn't get what it says just now." })); });
  const home = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const others = (S.news || []).filter((m) => m !== n && !newsHidden().has(m.src) && sameStory(n, m)).slice(0, 5);
  return [h("div.shead", {}, backBtn(), h("small", { text: `${n.src} · ${ago(n.at)}` }), closeBtn()),
    pic, h("h2.rhead", { text: n.title }),
    h("p.rsrc", { text: `${n.src} · ${new Date(n.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` }),
    sum, forYou(n),
    // (spread: a sheet's parts are each its own, never a list of them)
    ...(others.length ? [h("h3.slabel", { text: "More on this" }), h("div.list.flush", {}, others.map((m) => h("button.item.two.rmore", { type: "button", onclick: () => pushSheet(storyView, m) },
      h("span", {}, h("small", { text: `${m.src} · ${ago(m.at)}` }), h("b", { text: m.title })))))] : []),
    h("div.racts", {},
      h("a.readit", { href: n.link, rel: "noopener", ...(home ? {} : { target: "_blank" }) }, `Read it at ${n.src}`),
      h("div.rtwo", {}, h("button", { type: "button", onclick: () => shareStory(n), text: "Send in Chat" }), h("button", { type: "button", onclick: () => copyStory(n), text: "Copy Link" })),
      home ? h("a.rsafari", { href: n.link, target: "_blank", rel: "noopener", text: "Open in Safari instead" }) : null)];
}
// what a story means for what you own: yours, one you follow, or your holdings' market
function forYou(n) {
  const own = owned(), on = [...new Set([n.for, ...n.tickers])].map((s) => S.list.find((x) => x.symbol === s)).filter(Boolean);
  const chips = [], said = [];
  if (n.topic) { const iq = S.q[TOPIC_INDEX[n.topic]]; chips.push(h("span.nchip.via", { text: `${TOPIC_NAME[n.topic]}${iq?.chgPct != null ? ` ${pct(iq.chgPct, 1)}` : ""}` })); }
  for (const x of on) { const q = S.q[x.symbol]; chips.push(h(`span.nchip.${tone(q?.chgPct)}`, { text: q?.chgPct != null ? `${x.name} ${pct(q.chgPct, 1)}` : x.name })); }
  const mine = on.filter((x) => x.qty > 0), followed = on.filter((x) => !(x.qty > 0));
  if (mine.length) said.push(`You own ${and2(mine.map((x) => `${x.name} (${money(valueOf(x) || 0, "GBP", 0)})`))}.`);
  if (followed.length) said.push(`You follow ${and2(followed.map((x) => x.name))}.`);
  if (!on.length && n.topic) {
    const by = own.filter((x) => { const t = S.newsTopics?.[x.symbol]; return t && (t === "WORLD" || t === n.topic); });
    for (const x of by) { const q = S.q[x.symbol]; if (q?.chgPct != null) chips.push(h(`span.nchip.${tone(q.chgPct)}`, { text: `${x.name} ${pct(q.chgPct, 1)}` })); }
    said.push(by.length ? `It's news about the ${TOPIC_NAME[n.topic]}, the market ${and2(by.map((x) => x.name))} ${by.length === 1 ? "invests" : "invest"} in.` : `It's news about the ${TOPIC_NAME[n.topic]}.`);
  }
  if (!said.length) return null;
  return h("div.ryou", {}, h("h4.rlab", { text: "For you" }), chips.length ? h("span.nchips", {}, chips.slice(0, 5)) : null, h("p", { text: said.join(" ") }));
}
function markRead(n) {
  const r = store.get("newsRead", []), k = newsKey(n);
  if (!r.includes(k)) { r.push(k); store.set("newsRead", r.slice(-300)); }
  setTimeout(() => { const e = $(`.nstory[data-key="${CSS.escape(k)}"]`); e?.classList.add("read"); e?.classList.remove("fresh"); newsBadge(); }, 400);
}
// a story's own few things: sent in Chat, its link copied, or its source not shown again
function storyMenu(n) {
  const back = document.activeElement, esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const close = () => { removeEventListener("keydown", esc, true); layer.classList.add("closing"); setTimeout(() => layer.remove(), 260); back?.focus?.({ preventScroll: true }); };
  const act = (label, fn, cls) => h(cls ? `button.${cls}` : "button", { type: "button", onclick: () => { close(); fn(); }, text: label });
  const layer = h("div.amenu", { role: "dialog", "aria-modal": "true", "aria-label": n.title, onclick: (e) => { if (e.target === layer) close(); } },
    h("div.amg", {}, h("p.amt", { text: n.title }), act("Send in Chat", () => shareStory(n)), act("Copy Link", () => copyStory(n)), act(`Hide Stories from ${n.src}`, () => hideSource(n.src), "warn")),
    h("button.amc", { type: "button", onclick: close, text: "Cancel" }));
  document.body.append(layer);
  addEventListener("keydown", esc, true);
  requestAnimationFrame(() => layer.querySelector(".amg button")?.focus());
}
function shareStory(n) {
  const text = `${n.title} (${n.src})\n${n.link}`, chat = A.chatPage();
  // (at InFlite's hub: Chats' own sheet, over this page)
  if (IFL.hub.on) { IFL.hub.send(text, null).catch(() => toast("Couldn’t open Chats just now. Try again.", true)); return; }
  if (chat) { location.assign(`${chat}#${new URLSearchParams({ share: text })}`); return; }
  if (navigator.share) { navigator.share({ title: n.title, url: n.link }).catch(() => {}); return; }
  copyStory(n);
}
const copyStory = (n) => navigator.clipboard?.writeText(n.link).then(() => toast("Link copied"), () => toast(n.link)) ?? toast(n.link);
function hideSource(src) { store.set("newsHide", [...new Set([...store.get("newsHide", []), src])].slice(-50)); toast(`Stories from ${src} hidden`); render(false); newsBadge(); }
function newsView() {
  if (!S.list.length) return emptyView();
  // (asked for when there's none, and again after a quarter of an hour; one that couldn't come, said, with Try Again)
  if (!S.newsErr && (S.news == null || Date.now() - (S.newsAt || 0) > 15 * 60e3)) loadNews();
  S.newsSince ??= newsSeen();
  const parts = [h("div.digest", {}, h("span.eyebrow", { text: "Today, in brief" }), newsBrief().map((t, i) => h("p.rise", { vars: { i: String(i) } }, t)))];
  if (S.newsErr && S.news == null) return [...parts, h("p.foot", {}, "Couldn't get the news just now. ", h("button.inline", { type: "button", onclick: () => { S.newsErr = null; loadNews(); render(false); }, text: "Try Again" }))];
  if (S.news == null) return [...parts, h("div.list.nlist", {}, [0, 1, 2].map(() => h("div.story.ghost", {}, h("span.m", { text: " " }), h("b", { text: " " }))))];
  const hidden = newsHidden(), read = newsRead(), groups = newsGroups(S.news.filter((n) => !hidden.has(n.src)));
  const kinds = ["holdings", "following", "markets"].filter((k) => groups.some((g) => g.kind === k));
  if (!kinds.includes(S.nfilter)) S.nfilter = "all";
  const shown = groups.filter((g) => S.nfilter === "all" || g.kind === S.nfilter), fresh = newsNew().length;
  if (kinds.length > 1) parts.push(h("div.nfilter", { role: "group", "aria-label": "Show" }, [["all", "All"], ["holdings", "Holdings"], ["following", "Following"], ["markets", "Markets"]].filter(([k]) => k === "all" || kinds.includes(k))
    .map(([k, label]) => h("button", { type: "button", "data-k": `nf:${k}`, "aria-pressed": String(S.nfilter === k), text: label, onclick: () => { if (S.nfilter !== k) { S.nfilter = k; render(false); } } }))));
  if (fresh) parts.push(h("p.nnew", { text: `${plural(fresh, "new story", "new stories")} since you last looked` }));
  if (!shown.length) parts.push(h("p.foot", { style: "padding-top:12px", text: "No stories about your list just now." }));
  shown.forEach((g, gi) => {
    const q = g.x ? S.q[g.x.symbol] : null;
    const sub = g.kind === "markets" ? [["^FTSE", "FTSE 100"], ["^GSPC", "S&P 500"]].filter(([s]) => S.q[s]?.chgPct != null).map(([s, nm]) => `${nm} ${pct(S.q[s].chgPct, 1)}`).join(" · ")
      : g.kind === "following" ? "You follow it" : [money(valueOf(g.x), "GBP", 0), g.topic ? `Invests in ${TOPIC_SAID[g.topic]}` : null].filter(Boolean).join(" · ");
    parts.push(h("section.ngroup.rise", { vars: { i: String(Math.min(gi + 2, 8)) }, "aria-label": g.x?.name || "Markets" },
      h(g.x ? "button.nghead" : "div.nghead", g.x ? { type: "button", onclick: () => openSheet(stockView, g.x.symbol) } : {},
        h("span", {}, h("b", { text: g.x?.name || "Markets" }), h("small", { text: sub })), q?.chgPct != null ? h("span", { class: `num ${tone(q.chgPct)}`, text: pct(q.chgPct) }) : null),
      h("div.list.nlist", {}, g.items.map(({ lead: n, more }) => storyRow(n, g.x?.symbol, n.at > S.newsSince, read.has(newsKey(n)), more.length)))));
  });
  if (hidden.size) parts.push(h("p.foot", {}, `Not showing stories from ${and2([...hidden])}. `, h("button.inline", { type: "button", onclick: () => { store.del("newsHide"); render(false); newsBadge(); }, text: "Show Them" })));
  return parts;
}
async function loadNews() {
  if (loadNews.busy) return;
  loadNews.busy = true;
  try {
    const syms = [...S.list].sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)).slice(0, 10).map((x) => x.symbol);
    const r = syms.length ? await A.news(syms) : { news: [], topics: {} };
    S.news = r.news; S.newsTopics = r.topics || {};
    S.newsAt = Date.now(); S.newsErr = null;
    if (S.tab === "news" && calm()) render(false);
    newsBadge();
  } catch (e) { S.newsErr = e.message || "offline"; S.newsAt = Date.now(); if (S.tab === "news") render(false); } finally { loadNews.busy = false; }
}

function go(tab) {
  if (S.tab === tab) { scrollTo({ top: 0, behavior: C.still() ? "auto" : "smooth" }); return; }
  // (News left: what was there, seen; News opened: what's new marked from when you last looked)
  if (S.tab === "news") store.set("newsSeen", Date.now());
  if (tab === "news") S.newsSince = newsSeen();
  S.tab = tab; addressSays(); render(); scrollTo(0, 0); newsBadge();
  requestAnimationFrame(() => fitScreen.fit?.());
  if (tab === "holdings") loadPaid();
}
function drawTabs() {
  tabsEl.replaceChildren(...[["today", "Today"], ["holdings", "Holdings"], ["news", "News"]].map(([t, l]) => h("button.tab", { type: "button", "data-tab": t, onclick: () => go(t) }, l, t === "news" ? h("span.tabn", { hidden: true, "aria-hidden": "true" }) : null)));
  newsBadge();
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
  keepFocus(() => sbody.replaceChildren(...[view(...args)].flat(9).filter(Boolean)));
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
    const head = [h("div.shead", {}, backBtn(), h("small", { text: plainSym(sym) }), closeBtn()), h("div.sname", { text: o.name || held?.name || sym })];
    // (asked for once: where there's no price for it, that's said, with a way to ask again)
    // (and one of yours kept yours to change or take off: one that's stopped trading never has a price again)
    if (stockView.failed.has(sym)) return [...head, h("p.why", { text: "Couldn't get its price just now." }, h("small", { text: "The markets' data may be busy, or it may not be traded any more." })),
      h("div.btns", {}, h("button.btn.press.wide", { type: "button", onclick: () => { stockView.failed.delete(sym); drawSheet(); } }, "Try Again")),
      held ? h("div.links", {}, h("button", { type: "button", onclick: () => pushSheet(editView, sym), text: held.qty > 0 ? "Edit Holding" : "Add What You Own" }), removeBtn(sym, held)) : null];
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
    h("div.sdelta.num", {}, h("span", { class: tone(q.chgPct), "data-pct": sym, id: "rpct", text: q.chg != null && !isIndex(q) ? `${chgSaid(q)} (${pct(q.chgPct)})` : pct(q.chgPct) }), h("span", { style: "color:var(--text-3)", id: "rsaid", text: "today" })),
    h("p.hint", { "data-session": sym, style: "white-space:pre-line", text: quoteSession(q, priceSaid, pct) }),
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
// (at InFlite's hub, whether Markets' notifications come to this phone isn't Markets' to know: they're turned on for
// every app at once in You (Get Every App's Notifications Here), so where is said with what's been set)
const HUB_NOTIFY = " (notifications for every app are in You)";
// An alert set (p: how much a move in a day, 0 for none), and said: this phone asked to allow notifications first,
// where it hasn't, and where they can't be turned on here, why said with it (not lost under "You'll hear…")
async function alertSet(sym, p) {
  let why = null;
  // (at InFlite's hub, never asked here: whether they come to this phone is InFlite's to say, in You)
  if (p && !S.pushOn && !IFL.hub.on) await turnOnHere((m) => { why = m; });
  const r = await A.setAlert(sym, !!p, p || 3), name = S.list.find((x) => x.symbol === sym)?.name || nameOf(sym);
  S.list = r.holdings;
  if (!p) return toast("Alert off");
  if (S.alertsOff) return toast(`You'll hear when ${name} moves ${p}% in a day (alerts are off in your account)`);
  if (why) return toast(`Alert set. ${why}`, true);
  toast(`You'll hear when ${name} moves ${p}% in a day${IFL.hub.on ? HUB_NOTIFY : !S.pushOn ? " (notifications are off on this phone)" : ""}`);
}
// Alert Me: how much a move in a day is worth hearing about (or off)
function alertView(sym) {
  const held = S.list.find((x) => x.symbol === sym), name = held?.name || nameOf(sym), cur = held?.alert || null;
  const pick = async (p, btn) => {
    btn.disabled = true;
    try { await alertSet(sym, p); backSheet(); render(false); }
    catch (e) { toast(e.message, true); btn.disabled = false; }
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
      held?.qty > 0 && rate(q.cur) != null ? h("p", {}, `About ${money(y.div12 * held.qty * rate(q.cur), "GBP", 0)} a year to you`, nx ? h("span.nx", { text: ` · next about ${money(nx.v, "GBP", nx.v >= 100 ? 0 : 2)}, around ${aroundDay(nx.at)}` }) : null) : null)); }
  if (y?.div12 > 0 && q.price && rate(q.cur) != null && !isIndex(q) && y.divs?.length) rows.push(whatIf(q, y));
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
  let b = null, failed = false;
  if (held?.buys) { try { b = await A.buys(sym); } catch (_) { failed = true; } }
  if (!el.isConnected) return;
  const add = h("button", { type: "button", onclick: () => pushSheet(buyView, sym), text: held?.buys ? "Add a Buy or Sale" : held?.qty > 0 ? "Record Your Buys" : "Record a Buy" });
  // (ones that couldn't come: said, with Try Again, and one more can still be added)
  if (failed) { el.replaceChildren(h("h3.slabel", {}, "Buys and sales"), h("p.hint", {}, "Couldn't get your buys and sales just now. ", h("button.inline", { type: "button", onclick: () => drawBuys(sym), text: "Try Again" })), h("div.links", { style: "margin-top:14px" }, add)); return; }
  if (!b?.buys?.length) { el.replaceChildren(h("div.links", { style: "margin-top:20px" }, add)); return; }
  const when = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const row = (x, i) => {
    const del = h("button.del.press", { type: "button", "aria-label": "Delete" }, icon("x", 14, 2.6));
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!del.classList.contains("sure")) { del.classList.add("sure"); del.replaceChildren("Delete"); setTimeout(() => { if (del.isConnected) { del.classList.remove("sure"); del.replaceChildren(icon("x", 14, 2.6)); } }, 3000); return; }
      del.disabled = true;
      try { const r = await A.dropBuy(x.id); S.list = r.holdings; toast(x.qty > 0 ? "Buy taken off" : "Sale taken off"); await refresh(true); drawSheet(); render(false); loadPaid(true); S.inc = null; }
      catch (err) { toast(err.message, true); del.disabled = false; }
    };
    return h("div.item.buy.rise", { vars: { i: String(i) } },
      h("span", {}, h("b", { text: `${x.qty > 0 ? "Bought" : "Sold"} ${fmt(Math.abs(x.qty), Math.abs(x.qty) % 1 ? 2 : 0)}` }), h("small", { text: when(x.at) })),
      h("span.r", {}, h("b.num", { text: x.price != null ? priceSaid(q, x.price) : "–" }), h("small", { text: x.price != null ? (rate(q.cur) != null ? money(Math.abs(x.qty) * x.price * rate(q.cur)) : money(Math.abs(x.qty) * x.price, q.cur)) : "price not said" })), del);
  };
  // (what's made on sales only once there's been one: replaceChildren writes a null out as the word, as h() doesn't)
  el.replaceChildren(...[h("h3.slabel", {}, "Buys and sales"),
    h("div.list.flush", {}, [...b.buys].reverse().map(row)),
    b.made != null ? h("div.facts", { style: "margin-top:8px" }, h("div.fact", {}, h("span", { text: "Made on what you've sold" }), h("b", { class: `num ${tone(b.made)}`, text: rate(q.cur) != null ? signed(b.made * rate(q.cur)) : signed(b.made, q.cur) }), h("i", { text: "over what it cost you on average" }))) : null,
    h("div.links", { style: "margin-top:14px" }, add)].filter(Boolean));
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
  // (a price in pence typed as pounds, by the look of it: asked about under it, and once more on saving)
  let sure = false;
  const echo = h("p.echo", { id: "mk-becho", "aria-live": "polite" });
  const tell = () => {
    const p = penceMeant(priceIn(price.value, q), q, price.value);
    sure = false;
    echo.replaceChildren(p ? h("button.inline", { type: "button", onclick: () => { price.value = p; tell(); price.focus(); }, text: `Did you mean ${p}?` }) : "");
  };
  price.addEventListener("input", tell);
  save.onclick = async () => {
    const num = (s) => (s.trim() === "" ? null : Number(s.replace(/[,£$€\s]/g, "")));
    const n = num(qty.value), p = priceIn(price.value, q), at = day.value ? Date.parse(day.value + "T12:00:00Z") : Date.now();
    if (!n || !Number.isFinite(n) || n <= 0) return toast("How many should be a number.", true);
    if (p != null && (!Number.isFinite(p) || p < 0)) return toast("The price should be a number.", true);
    const pp = penceMeant(p, q, price.value);
    if (pp && !sure) { sure = true; return toast(`Did you mean ${pp}? Save again to keep ${money(p, q.cur)} a share.`, true); }
    save.disabled = true;
    try {
      const r = await A.addBuy({ symbol: sym, qty: n, price: p, at, sold });
      S.list = r.holdings;
      toast(sold ? "Sale saved" : "Buy saved");
      await refresh(true);
      backSheet(); render(false); loadPaid(true); S.inc = null;
    } catch (e) { toast(e.message, true); save.disabled = false; }
  };
  return [h("div.shead", {}, backBtn(), h("h2", { text: name }), closeBtn()),
    h("div.form", {}, kind,
      h("label", { for: "mk-day", text: "On" }), h("div.field", {}, day),
      h("label", { for: "mk-bqty", text: "How many shares" }), h("div.field", {}, qty),
      h("label", { for: "mk-bprice", text: `Price each${cs || !q?.cur ? "" : ` (${q.cur})`}${q?.cur === "GBP" ? ", in pounds or as pence (52p)" : ""}` }), h("div.field", {}, cs ? h("span.unit", { text: cs }) : null, price), echo),
    h("p.hint", { text: held?.qty > 0 && !held?.buys ? `Your ${fmt(held.qty, held.qty % 1 ? 2 : 0)} shares${held.cost != null ? ` at ${priceSaid(q, held.cost)}` : ""} are kept as your first buy, and this one's added to them. How many you own and what they cost on average are worked out from them all from now on.` : "How many you own and what they cost on average are worked out from all your buys and sales: a sale takes shares out at the average." }), save];
}

// Why it's moving: the day's story about it, where it's moved enough for one to matter; else how it's done against its market
async function whyMoving(sym, el) {
  const q = S.q[sym], m = S.q[MARKET_OF[q.ex]], said = (text, small, n) => el.replaceChildren(n ? h("a", { href: n.link, target: "_blank", rel: "noopener", onclick: readsIn(n), text }) : text, small ? h("small", { text: small }) : null);
  if (isIndex(q) || q.type === "CRYPTOCURRENCY" || q.type === "CURRENCY") {
    const big = q.symbol === "^FTSE" || q.symbol === "^GSPC" ? S.list.filter((x) => MARKET_OF[S.q[x.symbol]?.ex] === sym && S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0] : null;
    return said(`${INDEX_NAMES[sym] || q.name} is ${Math.abs(q.chgPct || 0) < 0.05 ? "flat" : `${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`} today.${big ? ` Of yours here, ${big.name} has moved most, ${pct(S.q[big.symbol].chgPct, 1)}.` : ""}`, "From the day's prices");
  }
  let story = null, about = [];
  try {
    const r = await A.news([sym], false);
    about = r.news.filter((n) => n.tickers.includes(sym) || n.for === sym);
    story = about.find((n) => Date.now() - n.at < 36 * 3600e3) || null;
  } catch (_) {}
  if (!el.isConnected) return;
  // (the latest few about it, under what's said: not the one said, where it's the day's story)
  const move = q.chgPct || 0, vsMarket = m?.chgPct != null ? ` The ${INDEX_NAMES[MARKET_OF[q.ex]]} is ${m.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(m.chgPct), 1)}%.` : "";
  const shown = story && Math.abs(move) >= 1 ? story : null, rest = about.filter((n) => n !== shown).slice(0, 3), list = el.parentNode?.querySelector("#snews");
  if (list && rest.length) list.replaceChildren(h("h3.slabel", { text: "News" }), h("div.snews", {}, rest.map((n) => h("a.story", { href: n.link, target: "_blank", rel: "noopener", onclick: readsIn(n) },
    h("span.m", {}, h("span", { text: `${n.src} · ${ago(n.at)}` })), h("b", { text: n.title })))));
  if (shown) return said(shown.title, `${shown.src} · ${ago(shown.at)}`, shown);
  // (a quiet day: its latest story said small, unless it's in the news just under this, to tap there; on the desk there's none)
  if (Math.abs(move) < 1) return said(`A quiet day for it, moving with the market.${vsMarket}`, !story ? "No news about it today" : list && rest.includes(story) ? "From the day's prices" : `Latest: ${story.title.slice(0, 90)}${story.title.length > 90 ? "…" : ""}`);
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
  // (drawn: the range shown. One that can't be drawn leaves it as it was, pressed again, so it can be asked for again)
  let shown = null, raw = null, range = "1d", drawn = "1d", seq = 0;
  const press = (r) => { const b = seg.querySelector(`[data-r="${r}"]`); if (!b) return; seg.querySelector(".sl").style.transform = `translateX(${b.offsetLeft}px)`; seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); };
  const back = (n, why) => { if (n !== seq) return; range = drawn; box.dataset.range = drawn; press(drawn); if (why) toast(why, true); };
  const show = async (r, first) => {
    const n = ++seq;
    range = r; box.dataset.range = r;
    const key = `${sym}:${r}`;
    box.classList.add("loading");
    const kept = S.charts.get(key), fresh = kept && Date.now() - kept.at < (r === "1d" ? 15e3 : 600e3);
    let c = fresh ? kept.c : null;
    if (!c) { try { c = await A.chart(sym, r); S.charts.set(key, { at: Date.now(), c }); } catch (e) { box.classList.remove("loading"); if (kept) c = kept.c; else return back(n, e.message); } }
    if (n !== seq || !box.isConnected) return;
    box.classList.remove("loading");
    if (!c.c.length) return back(n, shown ? "Nothing to draw for that just now." : null);
    drawn = r;
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
    if (rp && rs) { rp.className = `num ${tone(chp)}`; rp.textContent = isIndex(q) ? pct(chp) : `${chgSaid(q, ch)} (${pct(chp)})`; rs.textContent = RANGES.find((x) => x[0] === r)[2]; }
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
    press(b.dataset.r);
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
  const input = h("input", { type: "search", id: "mk-q", placeholder: "Company, fund or symbol", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", "aria-label": "Find a company, fund, investment trust or symbol" });
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
  // (what you paid: for each, or in total, as your broker may say it; and what that comes to, said under it as you type,
  // asking where it looks like pence typed as pounds)
  const num = (s) => (s.trim() === "" ? null : Number(s.replace(/[,£$€\s]/g, "")));
  const curMoney = (v) => (cs ? money(v, q.cur) : `${fmt(v)} ${q?.cur || ""}`.trim());
  let per = "each", sure = false;
  const echo = h("p.echo", { id: "mk-echo", "aria-live": "polite" });
  const meant = () => (per === "each" ? penceMeant(priceIn(cost.value, q), q, cost.value) : null);
  const tell = () => {
    const n = num(qty.value) ?? 0, c = priceIn(cost.value, q), p = meant();
    sure = false;
    echo.replaceChildren(c == null || !Number.isFinite(c) || !(n > 0) ? "" : per === "each" ? `${curMoney(c * n)} in all, for ${fmt(n, n % 1 ? 2 : 0)} shares` : `${curMoney(c / n)} each`,
      p ? h("button.inline", { type: "button", style: "margin-left:6px", onclick: () => { cost.value = p; tell(); cost.focus(); }, text: `Did you mean ${p}?` }) : "");
  };
  const perSeg = h("div.per", { role: "group", "aria-label": "What you paid is" }, [["each", "Each"], ["total", "In total"]].map(([k, label]) => h("button", { type: "button", "data-k": k, "aria-pressed": String(k === per), text: label,
    onclick: () => {
      if (k === per) return;
      const n = num(qty.value) ?? 0, c = priceIn(cost.value, q);
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
    const n = num(qty.value) ?? 0, c0 = priceIn(cost.value, q), t = since.value ? Date.parse(since.value + "T12:00:00Z") : null;
    if (!Number.isFinite(n) || n < 0) return toast("How many you own should be a number.", true);
    if (c0 != null && (!Number.isFinite(c0) || c0 < 0)) return toast("What you paid should be a number.", true);
    if (c0 != null && per === "total" && !(n > 0)) return toast("Say how many shares you own, to work out what each cost.", true);
    // (pounds that look like pence: asked once, kept as typed if it's saved again)
    const p = meant();
    if (p && !sure) { sure = true; return toast(`Did you mean ${p}? Save again to keep ${curMoney(c0)} a share.`, true); }
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
      loadYears(); loadPaid(true); S.inc = null;
    } catch (e) { toast(e.message, true); save.disabled = false; }
  };
  if (held?.buys) return [h("div.shead", {}, backBtn(), h("h2", { text: name }), closeBtn()),
    h("div.form", {}, h("label", { text: "Held in" }), choice),
    h("p.hint", { text: `How many you own (${fmt(held.qty, held.qty % 1 ? 2 : 0)}) and what each cost${held.cost != null ? ` (${q ? priceSaid(q, held.cost) : fmt(held.cost)} on average)` : ""} come from your buys and sales, on its page.` }), save];
  return [h("div.shead", {}, backBtn(), h("h2", { text: held ? name : `Add ${name}` }), closeBtn()),
    h("div.form", {},
      h("label", { for: "mk-qty", text: "Shares you own" }), h("div.field", {}, qty),
      h("div.lrow", {}, h("label", { for: "mk-cost", text: `What you paid${cs || !q?.cur ? "" : ` (${q.cur})`}` }), perSeg), h("div.field", {}, cs ? h("span.unit", { text: cs }) : null, cost), echo,
      h("label", { for: "mk-since", text: "When you bought" }), h("div.field", {}, since),
      h("label", { text: "Held in" }), choice),
    h("p.hint", { text: `Leave shares at 0 to just follow it. The rest is optional, for how you've done since you bought (dividends included) and each account's total.${q?.cur === "GBP" ? " A price in pence? Type it as 52p." : ""} Bought at different times? Record each buy on its page instead.` }), save];
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
  // (at InFlite's hub the subscription is InFlite's own, made and kept by Today's You for every app: never kept with
  // Markets here, where it would bring Markets' alerts to it without being asked)
  if (IFL.hub.on) { S.pushOn = false; return; }
  try {
    const reg = await navigator.serviceWorker?.getRegistration(), sub = reg && Notification.permission === "granted" ? await reg.pushManager.getSubscription() : null;
    S.pushOn = !!sub;
    // (this phone kept with the sign-in it's opened with now: the alerts go where you're signed in, and stop where you're not)
    if (sub) A.pushOn(sub.toJSON()).catch(() => {});
  } catch (_) { S.pushOn = false; }
}
const b64key = (k) => { const raw = atob(k.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((k.length + 3) % 4)); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
// turned on here (from a tap: a phone asks only then) → whether it's on; where it can't be, why's said (say: how,
// a toast unless the caller says it along with its own word)
async function turnOnHere(say = (m) => toast(m, true)) {
  if (IFL.hub.on) return false;
  if (!pushable()) {
    // (an iPad's Safari says it's a Mac: told by its touch)
    const ios = (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !(matchMedia("(display-mode: standalone)").matches || navigator.standalone);
    say(ios ? "Add Markets to your Home Screen first (Share, then Add to Home Screen) to get alerts there." : "This browser can’t show notifications.");
    return false;
  }
  try {
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") { say("Notifications aren’t allowed for Markets. Turn them on in this browser’s settings."); return false; }
    const reg = await navigator.serviceWorker.ready, { key } = await A.pushKey();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(key) }));
    await A.pushOn(sub.toJSON());
    S.pushOn = true;
    return true;
  } catch (e) { say(e.message || "Couldn’t turn on alerts here just now."); return false; }
}
// Off the hub, on an old Home Screen icon: Markets' notifications turned off here, as InFlite's take over (IFL.hub.moved's
// Turn Off Notifications Here): taken off the account (DELETE push), and the subscription let go, so opening the old
// icon again doesn't keep it again (checkPush). → a promise, rejected where the account couldn't be told
async function turnOffHere() {
  const reg = await navigator.serviceWorker?.getRegistration(), sub = await reg?.pushManager.getSubscription();
  if (sub) { await A.pushOff(sub.endpoint); await sub.unsubscribe().catch(() => {}); }
  S.pushOn = false;
}
// ---- sending one to a friend, in Chat ----
// (the words as ever, and beside them the day's move as a card Chat draws and keeps up to date: in percent only, never
// a price or anything you hold: send.js. Chat's address ends in "/", and the hash starts with "#")
// At InFlite's hub, Chats' own sheet over this page, through the hub (IFL.hub.send): the words in percent too, never the
// price, beside the same card.
function sendInChat(sym, name = nameOf(sym)) {
  const q = S.q[sym];
  if (IFL.hub.on) {
    const move = typeof q?.chgPct === "number" && Number.isFinite(q.chgPct) ? ` is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}% today` : "";
    IFL.hub.send(`${name} (${plainSym(sym)})${move}.`, packCard(stockSendCard(sym, name, q, Date.now()))).catch(() => toast("Couldn’t open Chats just now. Try again.", true));
    return;
  }
  const text = `${name} (${plainSym(sym)}) is ${q?.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q?.chgPct || 0), 1)}% today, at ${priceSaid(q)}.`;
  const chat = A.chatPage();
  if (chat) { location.assign(chat + chatHash(text, stockSendCard(sym, name, q, Date.now()))); return; }
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  navigator.clipboard?.writeText(text).then(() => toast("Copied, to paste in Chat"), () => toast(text));
}
// (a card packed as Chat reads one from an address: send.js's own packing, taken from the address it makes; none where
// there's no card, or it's too long for one)
function packCard(card) {
  return (card && new URLSearchParams(chatHash("", card).slice(1)).get("card")) || null;
}

// ---- you, your apps, and Markets's own few: InFlite's menu, from your photo ----
// (at InFlite's hub, where it's the desk's alone (the phone's header has Back in its place): Back first, your account and
// notifications in You, and no Sign Out (signing out of InFlite is You's))
function youMenu(at) {
  const hub = IFL.hub.on;
  IFL.menu(at, {
    app: "markets", build: BUILD,
    me: { name: S.me?.name || "You", line: S.me?.handle ? `@${S.me.handle}` : "", photo: meFace() },
    rows: [
      hub && { key: "back", icon: "back", color: "blue", label: "Back", open: () => IFL.hub.back() },
      hub && "-",
      { key: "notify", icon: "bell", color: "red", label: "Notifications", value: hub ? "In You" : S.pushOn ? "On" : "Off here", warn: !hub && !S.pushOn, open: () => openAccount("notify-markets") },
      { icon: "plus", color: "green", label: "Find and Add", open: () => openSheet(searchView) },
      "-",
      { icon: "sliders", color: "grey", label: "Settings", open: () => openSheet(settingsView) },
    ],
    account: openAccount, signOut: hub ? null : () => signOutHere(),
  });
}
function settingsView() {
  return [h("div.shead", {}, h("span"), closeBtn()),
    h("div.ifs-hero", {}, h("img", { src: "icon.svg", alt: "", width: 64, height: 64 }), h("b", { text: "Markets" }), h("span", { text: "Your money, said simply" })),
    h("button.acct.glass.press", { type: "button", onclick: () => openAccount(), "aria-label": "Your account" },
      h("span.me", {}, meFace()), h("span", {}, h("b", { text: S.me?.name || "You" }), h("small", { text: S.me?.handle ? `@${S.me.handle}` : "" })), h("span.chev", {}, icon("chev", 17, 2.4))),
    h("div.rows", {},
      h("button.srow", { type: "button", onclick: () => openAccount("notify-markets") }, h("span", { text: "Notifications" }), h("i", { text: IFL.hub.on ? "In You" : S.pushOn ? "On here" : "Off here" })),
      h("div.srow", {}, h("span", {}, "Evening Wrap", h("small", { text: "How your day went, once your markets close" })), wrapSwitch()),
      h("div.srow", {}, h("span", { text: "Values in" }), h("i", { text: "Pounds" })),
      h("div.srow", {}, h("span", { text: "Prices" }), h("i", { text: "Yahoo Finance, up to 20 min behind" })),
      !IFL.hub.on && h("button.srow.danger", { type: "button", onclick: signOutHere }, "Sign Out")),
    h("p.hint", { style: "text-align:center", text: "Markets shows prices and news to help you follow your money. It isn't financial advice." })];
}
// the evening wrap, on or off (on it asks this phone to allow notifications, where it hasn't: straight from the tap, as
// a phone asks only then, and saved after, as Alert Me does)
function wrapSwitch() {
  const sw = h("button.sw", { type: "button", role: "switch", id: "mk-wrap", "aria-checked": String(!!S.wrap), "aria-label": "Evening Wrap" });
  sw.onclick = async () => {
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(on)); sw.disabled = true;
    try {
      let why = null;
      if (on && !S.pushOn && !IFL.hub.on) await turnOnHere((m) => { why = m; });
      S.wrap = (await A.setWrap(on)).wrap;
      toast(!on ? "Evening wrap off" : why ? `Evening wrap on. ${why}` : IFL.hub.on ? `You'll get the evening wrap once your markets close${HUB_NOTIFY}` : S.pushOn ? "You'll get the evening wrap once your markets close" : "Evening wrap on, but notifications are off on this phone", !!why);
    } catch (e) { sw.setAttribute("aria-checked", String(!on)); toast(e.message, true); } finally { sw.disabled = false; }
  };
  return sw;
}
// (asks=1: its Notifications folder, with them off here, whose Turn On comes back to #notify, which asks)
// (at InFlite's hub: You, where your account and every app's notifications are)
async function openAccount(open) {
  if (IFL.hub.on) return toYou();
  const page = A.accountPage();
  if (!page) return toast("Your account is at account.inflite.ai");
  const asks = open === "notify-markets" && !S.pushOn ? { asks: "1" } : {};
  try { const { code } = await A.accountLink(); location.assign(`${page}#${new URLSearchParams({ handoff: code, from: "markets", ...(typeof open === "string" ? { open } : {}), ...asks })}`); }
  catch (e) { if (e.status === 401) return signedOut(); toast(e.message, true); }
}

// ---- signed out: the way in ----
// (again: where who's signed in couldn't be asked (offline, or Markets not answering) and nothing's kept here to show,
// Try Again in place of Sign in, as you may well be signed in)
function welcome(note = null, again = null) {
  S.me = null;
  document.body.classList.add("out");
  document.body.classList.remove("desk-on");
  const page = A.accountPage(), hub = IFL.hub.on, W = 1200, Hh = 520;
  const walk = (seed, drift, n = 60) => { let s = seed, v = 0; const out = []; for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; v += (s / 233280 - 0.5) * 3 + drift; out.push(v); } return out; };
  const line = (vals, top, span) => C.smooth(C.place(vals, W, span, { pad: 0 }).pts.map(([x, y]) => [x, y + top]));
  const scene = C.el("svg", { class: "scene", viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: "xMidYMax slice", "aria-hidden": "true" });
  const l1 = walk(7, 0.55), end = C.place(l1, W, 260, { pad: 0 }).pts.at(-1);
  scene.append(C.el("path", { class: "l3", pathLength: 1, d: line(walk(91, 0.2), 230, 220) }), C.el("path", { class: "l2", pathLength: 1, d: line(walk(33, 0.35), 180, 240) }),
    C.el("path", { class: "l1", pathLength: 1, d: line(l1, 140, 260) }), C.el("circle", { class: "glow", cx: end[0], cy: end[1] + 140, r: 7 }));
  IFL.warm();                    // (Sign in's connection to the sign-in page made ahead, while it's on the screen)
  main.replaceChildren(h("div.welcome.ifl-in", {}, scene, hub && hubBack(),
    h("div.ifl-top", {}, h("div.ifl-logo", {}, h("img.mark", { src: "icon.svg", alt: "", width: 96, height: 96 })),
      h("h1.ifl-title", { "aria-label": "Markets" }, [..."Markets"].map((c, i) => h("span", { "aria-hidden": "true", vars: { i: String(i) }, text: c }))),
      h("p.ifl-tagline", { text: "Your money, said simply" })),
    h("div.ifl-cta", {}, note && h("p.said", { role: "status", text: note }),
      (page || hub) && h("p.ifl-brand", {}, h("img", { src: "inflite.svg", alt: "", width: 22, height: 22 }), "Powered by InFlite"),
      again ? h("button.btn.go.ifl-go.press", { type: "button", id: "try-again", onclick: again }, "Try Again")
        : h("button.btn.go.ifl-go.press", { type: "button", id: "sign-in", disabled: !page && !hub, onclick: (e) => toAccountSignIn(e) }, "Sign in"),
      !page && !hub && !again && h("p.said", { style: "margin-top:12px", text: "Signing in is at finance.inflite.ai." }),
      page && !again && h("p.ifl-new", {}, "New here? ", h("button", { type: "button", onclick: (e) => toAccountSignIn(e, "join") }, "Create your account")))));
  main.removeAttribute("aria-busy");
  document.title = "Markets";
}
async function toAccountSignIn(e, mode = "signin") {
  // (at InFlite's hub: through Chats, and back to this page: markets/account.js)
  if (A.hubSignIn()) return;
  const page = A.authPage() || A.accountPage(), b = mode === "signin" ? e?.currentTarget : null;
  if (!page) return;
  if (b) { b.disabled = true; b.textContent = "Signing in…"; }
  try {
    const { word, ask } = await A.signInWord();
    store.set("signin", { word, at: Date.now() });
    // (in a browser's tab, the sign-in's shared: straight back, nothing to swap (jar=shared); a Home Screen app, a code)
    // (Sign in by the sign-in page's /go: signed in to the site already, the server sends you straight back, with no page)
    const q = new URLSearchParams({ [mode]: "markets", ask, back: `${location.origin}/`, ...((() => { try { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; } catch (_) { return false; } })() ? {} : { jar: "shared" }) });
    location.assign(mode === "signin" && A.authPage() ? `${A.authPage()}go?${q}` : `${page}#${q}`);
  } catch (_) { if (b) { b.disabled = false; b.textContent = "Sign in"; } toast("This browser can’t sign in here. Try Safari or Chrome.", true); }
}
// Back from signing in: its code swapped for the sign-in. → { m (the account, as GET me gives it) } or, where it
// couldn't be (too old, or the answer lost), { why }
async function signedBack(code) {
  const k = store.get("signin");
  store.del("signin");
  // (back in this tab, which shares the sign-in just made: the account, as GET me gives it)
  if (code === "shared") {
    try { const m = await A.me(); return m?.signedIn ? { m } : { why: "That sign-in didn’t reach Markets. Sign in again here." }; }
    catch (e) { return { why: e.message }; }
  }
  if (!k || Date.now() - k.at > 30 * 60e3) { A.handback(code, "").catch(() => {}); return { why: "That sign-in was started somewhere else. Sign in again here." }; }
  try { return { m: await A.handback(code, k.word) }; }
  catch (e) { return { why: e.message }; }
}
async function signOutHere() {
  closeSheet();
  // (at InFlite's hub, signing out is InFlite's, in You: never this phone's subscription let go from here)
  if (IFL.hub.on) return toYou();
  try { const reg = await navigator.serviceWorker?.getRegistration(), sub = await reg?.pushManager.getSubscription(); if (sub) await A.pushOff(sub.endpoint).catch(() => {}); } catch (_) {}
  try { await A.signOut(); } catch (_) {}
  signedOut();
  A.outVia("markets");
}
function signedOut() { forget(); closeSheet(); welcome(); }
// What this phone keeps of you (your portfolio's copy and its years, what you've searched for, read and hidden, your
// income plan), let go: signed out here, or anywhere else (Sign Out Other Devices, a new password, another app), as
// the account's answer or a price refresh then says; or another account signed in
function forget() {
  for (const k of ["last", "years", "recent", "newsRead", "newsHide", "newsSeen", "plan"]) store.del(k);
  S.list = []; S.years = {}; S.yearsAt = 0; S.isa = null; S.paid = null; S.inc = null; S.newsErr = null; S.newsAt = 0; S.news = null; S.charts.clear();
  S.goal = 100; S.add = 0; S.reinvest = true; loadIncome.failed = 0;
}

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
// your income's history (each holding's dividends over the years, and each that's paid you), for the Income sheet:
// kept ten minutes, and asked again once what you own has changed (S.inc emptied). One that couldn't come is said
// (loadIncome.failed), and not asked for again by itself for a minute: Try Again asks at once
async function loadIncome(force = false) {
  if (loadIncome.busy || (!force && ((S.inc && Date.now() - S.inc.at < 600e3) || Date.now() - (loadIncome.failed || 0) < 60e3)) || !owned().length) return;
  loadIncome.busy = true; loadIncome.failed = 0;
  try { S.inc = { at: Date.now(), v: (await A.income()).income }; } catch (_) { loadIncome.failed = Date.now(); } finally { loadIncome.busy = false; }
  if (Sheet.stack.at(-1)?.[0] === incomeView) drawSheet();
}
// (the page drawn again behind only while nothing's open over it, and nothing's being moved)
const calm = () => !document.body.classList.contains("sheet-up") && !$(".sortable.sorting");
// Prices again: every 15 seconds while the app's open and in front, each change flashed where it shows
async function refresh(force = false) {
  // (one at a time: a slow answer isn't asked for again over itself; one that's needed now, after a change, still is)
  if (!S.me || (!force && (document.hidden || refresh.busy))) return;
  const stock = Sheet.stack.find(([view]) => view === stockView)?.[1]?.[0];
  const syms = [...new Set([...INDICES, ...S.list.map((x) => x.symbol), ...(stock ? [stock] : [])])];
  refresh.busy = true;
  try {
    const was = { ...S.q }, wasT = totals(), wasOut = unpriced().map((x) => x.symbol).join(), r = await A.quotes(syms);
    Object.assign(S.q, r.quotes); Object.assign(S.fx, r.rates);
    // (when they came, by this phone's clock, as their age is told by it: never the server's, a few minutes apart from it)
    S.pricesAt = Date.now();
    store.set("last", { me: S.me, holdings: S.list, quotes: S.q, rates: S.fx, isa: S.isa, at: S.pricesAt });
    if (force) return;
    sayLine();
    for (const n of document.querySelectorAll("[data-session]")) n.textContent = quoteSession(S.q[n.dataset.session], priceSaid, pct);
    // (one of yours now in your total that wasn't (its price, or its currency's rate, come in), or the other way: all
    // said again, behind)
    if (unpriced().map((x) => x.symbol).join() !== wasOut && S.tab !== "news" && calm()) { render(false); return; }
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
  } catch (e) {
    // (signed out somewhere else meanwhile; else offline a moment, tried again in half a minute, the prices said as old
    // once they are)
    if (e.status === 401) signedOut(); else sayLine();
  } finally { refresh.busy = false; }
}
// one symbol's numbers, wherever they show, said afresh and flashed up or down
function paint(sym, up) {
  const q = S.q[sym], held = S.list.find((x) => x.symbol === sym);
  const flash = (el) => { el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(up ? "flash-up" : "flash-down"); };
  document.querySelectorAll(`[data-px="${CSS.escape(sym)}"]`).forEach((el) => { el.textContent = priceSaid(q); flash(el); });
  document.querySelectorAll(`[data-pct="${CSS.escape(sym)}"]`).forEach((el) => {
    // (a stock's page showing a longer range than today says its change over that, not today's)
    if (el.id === "rpct" && ($("#cb")?.dataset.range || "1d") !== "1d") return;
    el.textContent = el.id === "rpct" && q.chg != null && !isIndex(q) ? `${chgSaid(q)} (${pct(q.chgPct)})` : pct(q.chgPct); el.classList.remove("up-t", "down-t", "flat-t"); el.classList.add(tone(q.chgPct)); });
  if (held?.qty > 0 && valueOf(held) != null) {
    document.querySelectorAll(`[data-val="${CSS.escape(sym)}"]`).forEach((el) => { el.textContent = money(valueOf(held)); flash(el); });
    document.querySelectorAll(`[data-dg="${CSS.escape(sym)}"]`).forEach((el) => { el.textContent = el.tagName === "I" ? `${signed(dayOf(held))} today` : signed(dayOf(held)); });
  }
}

// opened: Markets's notifications are seen, and the icon's badge goes
// (at InFlite's hub the icon is InFlite's, its badge and notifications every app's, Chat's count among them: left to
// InFlite's own worker, which sets the badge from what's showing)
async function seen() {
  if (IFL.hub.on) return;
  try { navigator.clearAppBadge?.().catch(() => {}); const reg = await navigator.serviceWorker?.getRegistration(); (await reg?.getNotifications?.())?.forEach((n) => n.close()); } catch (_) {}
}

let toastT = null;
function toast(msg, bad = false) {
  // (said inside an open sheet too: a reader there hears nothing outside it)
  const say = $("#sheet-say"); if (say) say.textContent = document.body.classList.contains("sheet-up") ? msg : "";
  toastEl.textContent = msg; toastEl.classList.toggle("bad", !!bad); toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), bad ? 4200 : 2400); }

// ---- starting ----
let pointed = 0;
// At InFlite's hub: whether InFlite's own sign-in, as Today keeps it in this browser (today:session, { id }: kept as
// Today finds you signed in, gone as you sign out in You or Today finds you signed out), is the account given. Read
// only, never written (rule 6: nothing of Markets' under today:*); where it's missing or unreadable, no
// (Markets then waits for the account's answer before drawing anything)
const HUB_KEPT = "today:session";
function hubKeptIs(id) {
  try { const k = JSON.parse(localStorage.getItem(HUB_KEPT) || "null"); return id != null && k?.id === id; } catch (_) { return false; }
}
// (a page whose files didn't all come from one version, an app.js newer than the account.js beside it, say: the files
// fetched afresh together and the page opened again, once, rather than stopping where the two disagree)
function mixed(app) {
  try { if (sessionStorage.getItem(app + ":mixed")) return false; sessionStorage.setItem(app + ":mixed", "1"); } catch (_) { return false; }
  const c = navigator.serviceWorker?.controller, wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  (c ? Promise.race([new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = ok; c.postMessage({ ifl: "renew" }, [ch.port2]); }), wait(8000)]) : Promise.resolve())
    .then(() => location.reload());
  return true;
}
async function start() {
  if (typeof A.atHub !== "function" && mixed("markets")) return;
  A.atHub?.(IFL.hub);
  drawTabs();
  IFL.built("markets", BUILD, NEWS);
  IFL.watch(window);
  // (a new version put in by itself, the same in every app: never with a sheet up or a list being reordered, nor on the
  // desk while the pointer's been moving over it in the last minute (reading a chart presses nothing); the tab you
  // were on, how far down, and what was on the desk (its screen, the one chosen, its chart's range and studies), kept
  // for it: back there below)
  addEventListener("pointermove", () => { pointed = Date.now(); }, { passive: true });
  IFL.updates({ app: "markets", build: BUILD, busy: () => !calm() || (document.body.classList.contains("desk-on") && Date.now() - pointed < 60e3),
    save: () => (S.me ? { tab: S.tab, y: Math.round(scrollY), desk: document.body.classList.contains("desk-on") ? deskApi?.deskSaved() ?? null : null } : null) });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "markets:open") { let hash = ""; try { hash = new URL(e.data.url || "", location.href).hash; } catch (_) {} if (S.me) openTo(hash); }
    });
  }
  addEventListener("hashchange", () => openTo(location.hash));
  // (a sign-in started here and never finished: its word not kept past half an hour)
  if (Date.now() - (store.get("signin")?.at || Date.now()) > 30 * 60e3) store.del("signin");
  // (at InFlite's hub, notifications are allowed in You, never here)
  const askNotify = !IFL.hub.on && IFL.wantsAllow();
  const code = /^#signin=([A-Za-z0-9_-]{20,64}|shared)(?:&|$)/.exec(location.hash)?.[1];
  const asked = code ? null : sectionOf(location.hash);
  if (code) history.replaceState(null, "", location.pathname);
  // (just updated: the tab you were on, how far down, and on the desk what was on it; a tab asked for by the address
  // before it)
  const was = IFL.here("markets");
  if (was?.tab && SECTIONS.includes(was.tab)) S.tab = was.tab;
  if (asked?.tab) S.tab = asked.tab;
  if (asked?.tab || (asked && !IFL.hub.on)) addressSays();
  deskWas = was?.desk || null;
  // (whose this phone's copy is: where the account that answers is someone else's, all of it let go, drawn or not)
  const keptId = store.get("last")?.me?.id ?? null;
  let m = null, why = null;
  if (code) { ({ m = null, why = null } = await signedBack(code)); document.documentElement.classList.remove("arriving"); }
  // (and where a sign-in couldn't be handed back, who's signed in asked all the same: the browser may well be, its
  // sign-in being the site's own)
  if (!m) {
    // (drawn at once from this phone's copy, while the account's is asked for: its prices said as from when it was kept.
    // At InFlite's hub, only while InFlite's own sign-in kept here is the same account's: signing out in You lets that
    // go, never Markets' copy, which would otherwise be drawn for whoever opens Markets next)
    const last = code ? null : store.get("last");
    if (last?.me && (!IFL.hub.on || hubKeptIs(last.me.id))) {
      take({ ...last.me, holdings: last.holdings, quotes: last.quotes, rates: last.rates, isa: last.isa }); S.pricesAt = last.at || 0; const ys = store.get("years"); S.years = ys?.years || {}; S.yearsAt = ys?.at || 0;
      // (said as old only if the account's slow to answer: oldSaid)
      S.opening = Date.now() + 4000; setTimeout(() => { if (S.opening) { S.opening = 0; sayLine(); } }, 4100);
      render();
    }
    try { m = await A.me(); }
    catch (e) {
      if (S.me) { S.opening = 0; toast(e.message, true); sayLine(); live(); return; }
      // (offline, or Markets not answering, and nothing here to show: never taken for signed out. Asked again once the
      // network's back, or on Try Again)
      if (e.offline || e.status >= 500) { addEventListener("online", () => location.reload(), { once: true }); return welcome(e.message, () => location.reload()); }
      return welcome(e.message);
    }
  }
  if (code) toast(m?.signedIn ? `Signed in as ${String(m.name).trim().split(/\s+/)[0]}` : why || "That sign-in didn't finish. Sign in again here.", !m?.signedIn);
  // (signed out since, wherever it was: what this phone kept of you goes with it)
  if (!m?.signedIn) return m ? signedOut() : welcome();
  const same = S.me?.id === m.id;
  if ((S.me && !same) || (keptId != null && keptId !== m.id)) forget();
  take(m);
  S.pricesAt = Date.now(); S.opening = 0;
  render(!same);
  if (was?.y) requestAnimationFrame(() => scrollTo(0, was.y));
  store.set("last", { me: S.me, holdings: S.list, quotes: S.q, rates: S.fx, isa: S.isa, at: S.pricesAt });
  checkPush();
  loadYears();
  loadPaid();
  // (a stock asked for: at the hub, as the address says it now, which a notification tapped while Markets was opening
  // may have changed; the address back to the tab under it as it opens)
  const stock = IFL.hub.on ? sectionOf(location.hash)?.sym : asked?.sym;
  if (stock) { if (IFL.hub.on) addressSays(); openStock(stock); }
  // (off the hub, opened from an old Home Screen icon: once, that InFlite is one app now, with a way to turn
  // Markets' notifications off here)
  else if (!IFL.hub.on && !askNotify && !code && ownIcon()) IFL.hub.moved("markets", { off: turnOffHere });
  if (askNotify) IFL.allow("markets", "Markets tells you when something you hold moves a lot in a day (you choose which, on each one's page), and how your day went once your markets close.", turnOnHere);
  live();
}
// kept fresh: every 15 seconds, on coming back to it, and when the network's back
function live() {
  if (live.on) return;
  live.on = true;
  setInterval(refresh, 15000);
  seen();
  setTimeout(() => { if (S.news == null) loadNews(); }, 2500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { refresh(); seen(); if (Date.now() - (S.newsAt || 0) > 15 * 60e3) loadNews(); }
    else if (S.tab === "news") store.set("newsSeen", Date.now());
  });
  addEventListener("online", () => refresh());
}
// On the Home Screen, running up behind the status bar, iOS can lay the page out shorter than the screen (by the
// status bar's height, after a while away), and what's fixed to its foot (the tab bar, a sheet, a toast) then sits
// that much above the screen's: the gap, measured against the screen itself, is taken back (--fix-gap: styles.css).
// Only on an iPhone's or iPad's Home Screen, filling it; and never the keyboard's height, which is far more.
// A page shorter than the screen is laid out that way more than a longer one (so News, with little in it, had its tab bar
// sitting higher than Today's): there, every page is a little taller than the screen (html.homescreen: styles.css),
// and the gap's measured again as each tab's drawn.
// (and only where the page itself fills the screen, running up behind the status bar: a link from another Home Screen
// app opens Markets in iOS's own small browser, still "standalone" but under its bar, with no status bar inset. Its
// window is short of the screen by that bar, not by iOS's slip, and taking that back put a sheet's foot off the screen)
const behindBar = () => { if (!matchMedia("(orientation: portrait)").matches) return true; const p = document.createElement("div"); p.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"; document.body.appendChild(p); const t = p.offsetHeight; p.remove(); return t > 0; };
// (Markets' own Home Screen icon, filling the screen: not iOS's small browser, opened from another Home Screen app's link,
// which says it's "standalone" too but sits under its own bars, short of the screen. Elsewhere (no navigator.standalone:
// not an iPhone or iPad), IFL.hub.moved decides by itself)
const ownIcon = () => navigator.standalone !== true || behindBar() || innerHeight >= screen.height - 2;
function fitScreen() {
  if (navigator.standalone !== true || !screen.width || !screen.height || !behindBar()) return;
  const doc = document.documentElement;
  doc.classList.add("homescreen");
  const fit = () => {
    const portrait = matchMedia("(orientation: portrait)").matches;
    const w = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const h = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const gap = Math.abs(innerWidth - w) < 2 && behindBar() ? Math.round(h - innerHeight) : 0;
    doc.style.setProperty("--fix-gap", `${gap > 0 && gap < 120 ? gap : 0}px`);
  };
  fit();
  fitScreen.fit = fit;
  for (const ev of ["resize", "pageshow", "focus"]) addEventListener(ev, fit);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && fit());
  addEventListener("orientationchange", () => setTimeout(fit, 300));
}
fitScreen();
start();

// ---- for the desk (desk.js): what it shares with the rest ----
DESK.addEventListener("change", () => render(false));
export { S, h, A, C, $, icon, fmt, money, signed, pct, tone, priceSaid, chgSaid, plainSym, nameOf, valueOf, dayOf, totals, owned, unpriced, leftOutSaid, rate, divsOf, paidFor, income, kindOf, KIND_SAID,
  aroundDay, INDEX_NAMES, INDICES, RANGES, openSheet, pushSheet, stockView, searchView, editView, alertView, alertSet, toast, ago, dayKey, rangeSeries, marketSaid, lineSaid, pricesAtSaid, whyMoving, sendInChat, store, meFace, youMenu, daySeries,
  shareStory, copyStory, TOPIC_NAME, TOPIC_INDEX, TOPIC_SAID, storyView, IFL, keepFocus };
