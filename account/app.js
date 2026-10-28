// Your georgefarrowgreen.com account, on its own page: the one account every app on the site signs in with
// (functions/_account.js), in one place. Signed out: signing in, with a passkey or your email and password. Signed in:
// your profile (photo, name, handle), your apps, and sign-in and security (your password, passkeys and signed-in
// devices), signing out, and deleting the account. Each opens in a sheet that comes up from below; what could hurt if
// someone had only your sign-in asks you to show it's you first (functions/api/account/[[path]].js). The page never
// holds the sign-in itself: the browser keeps it, out of any page's reach, and the page asks with it.
//
// The password is stretched here as everywhere on the site (crypto.js, Chat's own, served here too): it never leaves
// this device, only a proof of it. A new one locks your key anew with it, here, so nothing that's locked changes hands.
//
// Also: a security check-up (email confirmed, a passkey, the password against data breaches, devices long unused), your
// email (confirming it, changing it), recent activity, passkeys' names and where they're saved, preferences for every app
// (appearance; Weather's units), your data as a PDF (datapdf.js) or a JSON file, and deleting the account in 7 days unless it's kept. The page keeps
// up with changes made elsewhere when you come back to it. Links in the account's emails open here (#confirm=, #email=,
// #keep=).
//
// And: your photo changed by tapping it; your code (a QR code of the link that adds you in Chat); each app's card, a
// way into it and what you have there (what it keeps of yours in its own sheet, behind ⓘ); the check-up kept in Sign-in
// and security, opened as a sheet; rows that say how things are (and, where there's something to do, a button); your
// name and photo kept at the top once the profile's scrolled away; what each app emails you; recent activity with a
// filter, the app on each, the place said once a day; "Not you?" on a password sign-in from somewhere else; a word about
// a passkey after signing in with a password; device and passkey rows that slide to sign out or remove (on a touch
// screen); and two even columns on a wide one.

import { E2E, b64url, fromB64url } from "./crypto.js";

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

const API = "/api/account";
const $ = (s, r = document) => r.querySelector(s);
const main = $("#main"), sheetEl = $("#sheet"), toastEl = $("#toast");
const still = matchMedia("(prefers-reduced-motion: reduce)"), dark = matchMedia("(prefers-color-scheme: dark)");
// the motion the stylesheet sets out (its :root: the curves and times every app on the site shares), read for what's
// animated from here: tok("--ease-glide"), ms("--dur-base") (with none, a plain curve and a third of a second)
const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;
const ms = (name) => (parseFloat(tok(name)) || 0.3) * 1000;
const S = { me: null, settled: false, pulled: 0 };
// (the account page's version, in InFlite's menu: up by 0.01 with each change to it that goes out)
const BUILD = "1.05";
try { S.invite = sessionStorage.getItem("acct:invite") || null; } catch (_) {}
// Opened from an app (Chat's profile, Weather's account card): a sign-in handed over by a code in the address's #
// (good once, for a minute: taken out of the address at once, so it's never in the history or a bookmark), what to open,
// and the way back. (Kept for the visit, so a reload still knows the way back.)
// (the home page's site, for the apps' one: siteUrl)
const HOME_SITES = { "inflite.ai": "georgefarrowgreen.com", "ifl.test": "gfg.test" };
// (Mail's icon, asked for by its version, so a copy kept from before its new look isn't shown)
const MAIL_ICON = "/apps/mail.png?v=2";
const appIcon = (id) => (id === "mail" ? MAIL_ICON : `/apps/${id}.png`);
const APPS = { inflight: { name: "Chat", sub: "chat" }, weather: { name: "Weather", sub: "weather" }, fitness: { name: "Fitness", sub: "fitness" }, mail: { name: "Mail", sub: "email" }, home: { name: "Home", sub: "" } };
const ARRIVED = location.hash;            // (what the address said, before what's below takes it out)
const HANDOFF = (() => {
  const p = new URLSearchParams(location.hash.slice(1)), code = p.get("handoff");
  if (!code) return null;
  history.replaceState(null, "", location.pathname + location.search);
  if (APPS[p.get("from")]) try { sessionStorage.setItem("acct-from", p.get("from")); } catch (_) {}
  return { code, open: p.get("open") };
})();
// (opened from the site's home page, which needs no hand-over, as the browser's signed in to both or neither: #from=home,
// for the way back)
if (/^#from=home$/.test(location.hash)) {
  history.replaceState(null, "", location.pathname + location.search);
  try { sessionStorage.setItem("acct-from", "home"); } catch (_) {}
}
// Sent here by an app to sign in: Chat's welcome, Weather's Settings, the home page's Sign in (#signin=<app>, or
// #join=<app> to make an account first). With it, the app's word for this sign-in (ask: the hash of what that tab
// keeps: functions/_handback.js), Chat's key for what unlocks its own key there (seal), and where the app is (back).
// Signed in, or carrying on as yourself, you're sent straight back, the sign-in handed back with a code good once, for
// two minutes, in that tab alone. Taken out of the address at once, and kept for the visit (half an hour), so a reload,
// or making an account on the way, doesn't lose it; arriving any other way (an app's other links, the home page's)
// drops one kept from before.
const SIGN_FOR = (() => {
  const m = /^#(signin|join)=(inflight|weather|fitness|mail|home)(&|$)/.exec(ARRIVED);
  if (!m) {
    try {
      const k = JSON.parse(sessionStorage.getItem("acct-for") || "null");
      if (k && !ARRIVED && Date.now() - k.at < 30 * 60e3) return k;
      // (and the way back it gave, unless the address gave one of its own just now)
      if (k) { sessionStorage.removeItem("acct-for"); if (!ARRIVED) sessionStorage.removeItem("acct-from"); }
    } catch (_) {}
    return null;
  }
  history.replaceState(null, "", location.pathname + location.search);
  const p = new URLSearchParams(ARRIVED.slice(1)), word = (k, n) => (new RegExp(`^[A-Za-z0-9_-]{${n}}$`).test(p.get(k) || "") ? p.get(k) : null);
  const a = { app: m[2], join: m[1] === "join", ask: word("ask", 43), seal: word("seal", 87), back: backFor(m[2], p.get("back")), at: Date.now() };
  // (an app asks with its word, and Chat with its key as well: without them, it didn't come from the app; and one
  // kept from before is dropped, as arriving any other way drops it)
  if ((a.app !== "home" && !a.ask) || (a.app === "inflight" && !a.seal)) {
    try { sessionStorage.removeItem("acct-for"); } catch (_) {}
    return null;
  }
  try { sessionStorage.setItem("acct-for", JSON.stringify(a)); sessionStorage.setItem("acct-from", a.app); } catch (_) {}
  return a;
})();
S.signFor = SIGN_FOR;
// (the way back warmed while you sign in: its connection open before it's wanted)
if (SIGN_FOR?.back) try { document.head.append(Object.assign(document.createElement("link"), { rel: "preconnect", href: new URL(SIGN_FOR.back).origin })); } catch (_) {}
// (from the home page, to show it's you before changing it: #confirm=edit; once that's done, back there, editing)
if (/^#confirm=edit$/.test(location.hash)) {
  history.replaceState(null, "", location.pathname + location.search);
  try { sessionStorage.setItem("acct-from", "home"); sessionStorage.setItem("acct-confirm", "edit"); } catch (_) {}
}
// (whether it will: a sheet asking it's you, unless it's been shown already)
function homeEdit() { try { return sessionStorage.getItem("acct-confirm") === "edit" && !S.me.fresh; } catch (_) { return false; } }
function confirmForHome() {
  let want = null; try { want = sessionStorage.getItem("acct-confirm"); sessionStorage.removeItem("acct-confirm"); } catch (_) {}
  if (want !== "edit" || !S.me?.signedIn) return;
  const edit = () => location.replace(homeVia(siteUrl("") + "#edit", true));
  if (S.me.fresh) return edit();
  openSheet(() => ({ title: "Change the home page", body: [
    h("p.hint", { text: "Show it’s you first, then you’re back on the home page to change it." }),
    confirmCard(edit, () => { closeSheet(); backToApp(); })] }));
}
// a page the browser kept and brought back (back and forward): opened afresh instead, so it's never last version's
addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
// (which app sent you here: Chat's profile, or Weather's account card)
function fromApp() { try { const f = sessionStorage.getItem("acct-from"); return APPS[f] ? f : null; } catch (_) { return null; } }
// (sent here only to edit your profile: Done and Cancel go straight back)
const justEditing = () => HANDOFF?.open === "profile" && fromApp();
// (what an app's link opens straight away: Edit profile, or Chat's settings, from its own Settings)
const OPENS = { profile: () => profileView, inflight: () => inflightView, fitness: () => fitnessSetView, weather: () => weatherSetView };
const opens = () => OPENS[HANDOFF?.open]?.() || null;
// back to the app: this window closed where Chat opened it, else the app opened here (the home page in this
// page's place, so Back from it doesn't come here again)
function backToApp() {
  if (S.signFor) return leaveFor(S.signFor.app === "home" ? homeVia(S.signFor.back) : S.signFor.back);
  const from = fromApp(), app = APPS[from] || APPS.inflight;
  try { sessionStorage.removeItem("acct-from"); } catch (_) {}
  if (from === "home") return location.replace(homeVia(siteUrl(app.sub)));
  try { window.close(); } catch (_) {}
  setTimeout(() => { location.href = siteUrl(app.sub); }, 250);
}
const backPill = () => h("button.pill.quiet.backapp", { type: "button", onclick: backToApp }, icon("back", 17, 2.4), APPS[fromApp()].name);
const backButton = (r) => fromApp() && r(backPill());

// ---- building the page ----
// h("button.row.action", { type: "button", onclick }, ...children): an element, its classes, attributes and children
function h(spec, props, ...kids) {
  const [tag, ...cls] = spec.split(".");
  const el = document.createElement(tag || "div");
  if (cls.length) el.className = cls.join(" ");
  // (a form says what's missing in its own words, not the browser's bubbles)
  if (tag === "form") el.noValidate = true;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (k === "value" || k === "disabled" || k === "hidden") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false && x !== ""));
  return el;
}
const ICONS = {
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.4 12.6 20 3m-3.5 3.5 3 3m-5.5-.5 2 2"/>',
  passkey: '<circle cx="9" cy="8" r="3.8"/><path d="M2.5 20.5c.4-3.6 3.2-6 6.5-6 1.3 0 2.5.3 3.5 1"/><circle cx="18" cy="13.5" r="2.6"/><path d="M18 16.1v5.4m0-2h2.2"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.8"/><path d="M10.8 18.5h2.4"/>',
  computer: '<rect x="3" y="4" width="18" height="12.5" rx="2.2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  devices: '<rect x="2.5" y="4.5" width="13.5" height="10" rx="1.8"/><path d="M5.5 18.5h7"/><rect x="16" y="8.5" width="5.5" height="11" rx="1.4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="m3.8 7 8.2 6 8.2-6"/>',
  camera: '<path d="M4 8h3l1.8-2.6h6.4L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/><path class="slash" d="M4.5 4.5l15 15"/>',
  caps: '<path d="M12 4 5 11h4v4h6v-4h4z"/><path d="M9 19h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  open: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  face: '<path d="M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2M9 9.2v1.2M15 9.2v1.2M12.2 9.2v3.8h-1M9.2 15.6c1.6 1.3 4 1.3 5.6 0"/>',
  person: '<circle cx="12" cy="8.6" r="3.9"/><path d="M4.6 20c1.2-3.6 4-5.6 7.4-5.6s6.2 2 7.4 5.6"/>',
  shield: '<path d="M12 3.2 19.5 6v5.6c0 4.7-3.2 7.9-7.5 9.2-4.3-1.3-7.5-4.5-7.5-9.2V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
  people: '<circle cx="9" cy="8.5" r="3.4"/><path d="M3 19.5c.6-3.2 3-5.2 6-5.2s5.4 2 6 5.2"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.4c2.4.2 4 1.9 4.5 4.6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  gift: '<rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v6.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V13M12 9v11.5M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9z"/>',
  doc: '<path d="M7 3.5h7l4.5 4.5V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4.5M9.5 12.5h5M9.5 16h5"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  ruler: '<path d="M3.5 15.5 15.5 3.5l5 5-12 12z"/><path d="m7.5 11.5 2 2m1-5 2 2m1-5 2 2"/>',
  trash: '<path d="M4.5 7h15M10 11v6m4-6v6M6.5 7l.9 11.3a2 2 0 0 0 2 1.7h5.2a2 2 0 0 0 2-1.7L17.5 7M9.5 7V4.5h5V7"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.2M12 17h.01"/>',
  signin: '<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10.5 16.5 15 12l-4.5-4.5M15 12H4.5"/>',
  signout: '<path d="M9.5 19.5h-3a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h3M15.5 16.5 20 12l-4.5-4.5M20 12H9.5"/>',
  pencil: '<path d="M4.5 19.5 5.3 15.6 15.8 5.1a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.4 18.7z"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M13.5 13.5h3v3h-3zM17.5 17.5h3v3h-3zM13.5 20.5v-1M20.5 13.5v1"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><path d="M12 7.7v.1" stroke-width="2.8"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M6.5 11H5.5a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-6.5a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
  watch: '<rect x="7" y="3.5" width="10" height="17" rx="3"/><path d="M10 7.5h4M10 16.5h4"/>',
  heart: '<path d="M12 20s-7.5-4.7-7.5-10.4A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.3 12 20 12 20z"/>',
  wave: '<path d="M3 12h3l2.5-6 4 12 2.5-6H21"/>',
  map: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  sliders: '<path d="M4 7.5h9M18.5 7.5H20M4 16.5h1.5M11 16.5h9"/><circle cx="15.8" cy="7.5" r="2.4"/><circle cx="8.2" cy="16.5" r="2.4"/>',
  home: '<path d="M4 11.2 12 4.8l8 6.4"/><path d="M6.2 9.8v9.7h11.6V9.8"/><path d="M10 19.5v-5h4v5"/>',
  bubble: '<path d="M5.5 4.5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5V16.5h-1a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  block: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  car: '<path d="M5 16v-5l2-4.5h10l2 4.5v5"/><path d="M3.5 16h17v2.5h-17z"/><path d="M5 11h14"/>',
};
function icon(name, size = 20, width = 2) {
  const t = document.createElement("template");
  t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

// ---- asking the account ----
// (on the Home Screen, not in the browser: said with each ask, so Signed-in devices calls this sign-in "Account")
const homeScreen = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// (iOS 15 has no AbortSignal.timeout, which every request here gives up with: the same, by hand, as Weather has)
if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout) AbortSignal.timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
async function call(path, { method = "GET", body, type } = {}) {
  let r;
  const headers = { ...(type ? { "Content-Type": type } : body !== undefined ? { "Content-Type": "application/json" } : {}), ...(homeScreen ? { "X-Home-Screen": "1" } : {}) };
  try { r = await fetch(`${API}/${path}`, { method, headers, body: type ? body : body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30000) }); }
  catch (_) { throw Object.assign(new Error("You’re offline. Try again when you’re back online."), { offline: true }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Something went wrong (${r.status}).`), { status: r.status, field: j.field });
  return j;
}
const post = (path, body = {}) => call(path, { method: "POST", body });
const passkeysWork = () => !!(window.PublicKeyCredential && navigator.credentials?.get);
// (one passkey asked for at a time: one offered in the keyboard put away first)
const passkeyAsk = async (o) => { stopAutofill(); await new Promise((r) => setTimeout(r)); return navigator.credentials.get(o); };
const passkeyMake = async (o) => { stopAutofill(); await new Promise((r) => setTimeout(r)); return navigator.credentials.create(o); };
// A passkey offered in the keyboard (passkey autofill): asked for, quietly, as soon as a sign-in card with an email field
// is there; one picked from the field's suggestions signs in as the passkey button does (picked). Asked for again if
// that didn't sign in, while the field's still there.
let autofill = null;
function stopAutofill() { autofill?.abort(); autofill = null; }
async function startAutofill(field, picked) {
  stopAutofill();
  if (!passkeysWork()) return;
  try { if (!(await PublicKeyCredential.isConditionalMediationAvailable?.())) return; } catch (_) { return; }
  const ac = new AbortController(); autofill = ac;
  try {
    const o = await post("signin/options");
    if (ac.signal.aborted || !field.isConnected) return;
    // (its challenge lasts 5 minutes, and a keyboard's ask has no end: asked for anew before then, while the page is in
    // sight, else on coming back to it)
    const renew = () => {
      if (autofill !== ac || !field.isConnected) return;
      if (document.hidden) return document.addEventListener("visibilitychange", renew, { once: true });
      startAutofill(field, picked);
    };
    setTimeout(renew, 4 * 60e3);
    const a = await navigator.credentials.get({ mediation: "conditional", signal: ac.signal, publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required",
      extensions: S.signFor?.app === "inflight" ? { prf: { eval: { first: await E2E.prfSalt() } } } : undefined } });
    if (!a || ac.signal.aborted) return;
    autofill = null;
    await picked(o, a);
    if (field.isConnected && !S.me?.signedIn) startAutofill(field, picked);
  } catch (_) { if (autofill === ac) autofill = null; }
}

// the apps, from here (account.inflite.ai → chat.inflite.ai, weather.inflite.ai), and the home page, on a site of its
// own (georgefarrowgreen.com; the tests' ifl.test → gfg.test; localhost's own)
function siteUrl(sub) {
  const { protocol, hostname, port } = location, p = port ? ":" + port : "", apps = hostname.slice(8);
  if (!hostname.startsWith("account.")) return sub ? `https://${sub}.inflite.ai/` : "https://georgefarrowgreen.com/";
  return sub ? `${protocol}//${sub}.${apps}${p}/` : `${protocol}//${HOME_SITES[apps] || apps}${p}/`;
}
// (to the home page, signed in there too: its sign-in carried over, functions/_hop.js. fresh: one just made here, so
// carried over even if the home page was signed in to before, perhaps as someone else)
const homeVia = (to, fresh = false) => `${new URL(siteUrl("")).origin}/api/hop/start?to=${encodeURIComponent(to)}${fresh ? "&fresh=1" : ""}`;

// Where an app that sent you here to sign in is (back, as it said), so long as it's that app's own address on this site:
// chat.<site>/, weather.<site>/, fitness.<site>/, or the home page (beside this page's account.<site>, on the
// same port); else the app's usual address. (Nowhere else, so a link can't make this page send a sign-in elsewhere.)
function backFor(app, back) {
  const usual = siteUrl(APPS[app].sub);
  try {
    const u = new URL(back), site = location.hostname.replace(/^account\./, ""), home = new URL(siteUrl("")).hostname;
    // (and Chat at /pigeon/, where the home page and the apps are one: locally)
    const ok = { inflight: [`chat.${site}/`, ...(home === site ? [`${site}/pigeon/`] : [])], weather: [`weather.${site}/`], fitness: [`fitness.${site}/`], mail: [`email.${site}/`], home: [`${home}/`] }[app];
    return ok.includes(u.hostname + u.pathname) && u.protocol === location.protocol && u.port === location.port && !u.search && !u.username && !u.password ? u.origin + u.pathname : usual;
  } catch (_) { return usual; }
}

// ---- words for times ----
const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" }), rtfShort = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto", style: "short" });
// (short: "24 min ago", for a row with a button beside it)
function ago(t, short = false) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  for (const [n, unit] of [[3600, "minute"], [86400, "hour"], [86400 * 7, "day"]]) if (s < n) return (short ? rtfShort : rtf).format(-Math.round(s / { minute: 60, hour: 3600, day: 86400 }[unit]), unit);
  return "on " + day(t);
}
const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
// (a day as briefly as it'll go, for a row's value: today, yesterday, 3 Oct, or Oct 2025)
function when(t) {
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return "today";
  if (d.toDateString() === new Date(Date.now() - 86400e3).toDateString()) return "yesterday";
  return d.toLocaleDateString("en-GB", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { month: "short", year: "numeric" });
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- appearance: the account's (Automatic, Light or Dark, as Chat has it), remembered here for next time ----
// (fade: changed while you're looking, the page and any sheet on it cross-fade from one to the other, where the
// browser can and motion's welcome; else, and as the page opens, at once). (What's put is the last asked for, so a fade
// still on its way doesn't undo one asked for since: a choice put back, as it couldn't be kept.)
let themed;
function theme(pref, fade) {
  themed = pref;
  const go = () => {
    const root = document.documentElement, pref = themed;
    if (pref === "light" || pref === "dark") root.dataset.theme = pref; else delete root.dataset.theme;
    try { localStorage.setItem("acct:appearance", pref || "auto"); } catch (_) {}
    // (the browser's bar: Light or Dark, both its tags that one's colour; Automatic, each its own scheme's, so the bar
    // still follows the device as it changes)
    const top = (d) => (d ? "#1b2860" : "#dde3fb");   // (the top of the sky: styles.css --sky-top)
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", top(root.dataset.theme ? isDark() : (m.getAttribute("media") || "").includes("dark")));
  };
  const looks = pref === "light" || pref === "dark" ? pref === "dark" : dark.matches;
  if (fade && looks !== isDark() && document.startViewTransition && !still.matches && !document.hidden) viewTransition(go);
  else go();
}
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : dark.matches);
// (what's remembered is put on the page before it's first drawn: theme.js)

// ---- the page ----
// (the account as boot.js asked for it while this was on its way, taken once; refused, asked for here, to say why;
// not reached at all, said as call() says it, not waited for a second time)
const firstMe = async () => {
  const p = self.acctMe; self.acctMe = null;
  const r = p && (await p);
  if (r === "offline") throw Object.assign(new Error("You’re offline. Try again when you’re back online."), { offline: true });
  return r || call("me");
};
async function load() {
  fromGate();
  if (S.signFor?.join && !S.gate) S.gate = "join";
  await fromLink();
  // (the account asked for once, whatever a hand-off below does: one that fails falls back on it, and an account that
  // can't be reached is said once, by the page, not by the hand-off too)
  const mine = firstMe();
  // (a sign-in handed over by an app: who it's for asked first, alongside who's signed in here, and only taken once
  // that's said yes to, as a page elsewhere could send this browser here with a code of its own; never over a different
  // account's sign-in here)
  if (HANDOFF) {
    try {
      const [now, who] = await Promise.all([mine, post("handoff/who", { code: HANDOFF.code })]);
      if (now.signedIn && now.id === who.id) S.me = await post("handoff", { code: HANDOFF.code });
      else if (now.signedIn) { S.me = now; HANDOFF.open = null; S.said = { text: `You’re signed in here as @${now.handle}. Sign out first to use @${who.handle} here.`, bad: true }; }
      else { S.me = now; S.handoff = who; }
    } catch (e) {
      // (whose code it was not known: what it was to open isn't opened for whoever's signed in here)
      HANDOFF.open = null; mine.then(() => setTimeout(() => toast(e.message, true), 400), () => {});
    }
  }
  try { if (!S.me) S.me = await mine; S.pulled = Date.now(); }
  catch (e) {
    main.removeAttribute("aria-busy");
    return main.replaceChildren(h("div.welcome.rise", {}, h("div.mark", {}, icon("shield", 44, 1.8)), h("h1", { text: "Can’t reach your account" }),
      h("p", { text: e.offline ? "You’re offline. Your account will be here when you’re back online." : e.message }),
      h("button.pill", { type: "button", onclick: () => location.reload() }, "Try again")));
  }
  if (S.me.prefs) theme(S.me.prefs.appearance);
  // (an invite, or a link to make an account, opened signed in: said, as making another means signing out first)
  if (S.me?.signedIn && S.gate === "join") S.said = { text: `You’re signed in as @${S.me.handle}. To make another account, sign out first.` };
  if (S.me?.signedIn) S.gate = null;
  // (a sheet coming straight up over it, from an app, Admin's link or the home page: the page behind it there already,
  // not rising under it as it comes)
  if (S.me?.signedIn && (opens() || (S.me.admin && location.hash === "#admin") || homeEdit())) S.settled = true;
  await anew(render);
  if (opens() && S.me?.signedIn) openSheet(opens());
  confirmForHome();
}
// The page drawn anew, signed in or out, or being deleted (or as it opens, from its skeleton): the old one fading as
// the new one settles in, where the browser can and motion's welcome. Any sheet closes first, so it isn't caught in the
// picture of the old one.
async function anew(fn) {
  if (sheetEl.open) await closeSheet();
  if (!document.startViewTransition || still.matches || document.hidden) return fn();
  await viewTransition(fn).updateCallbackDone;
}
// A view transition, started; one the browser gives up on (the window resized as it runs, say) is no error, its change
// made all the same, so what it'd have said is let go
function viewTransition(fn) {
  const t = document.startViewTransition(fn);
  t.ready.catch(() => {}); t.finished.catch(() => {});
  return t;
}
// once the page has settled in, less a moment (a sheet coming up as it rises made too much move at once)
const afterRise = (fn, at = 0) => setTimeout(fn, Math.max(at, (S.riseUntil || 0) - 500 - Date.now()));
// A way in from elsewhere: #join and #forgot (the apps link here for both), #invite= (an invite, kept for the visit) and
// #reset= (a reset link from the email). Taken out of the address at once.
function fromGate() {
  const m = /^#(join|forgot|signin)$|^#(invite|reset)=([A-Za-z0-9_-]{40,50})$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, "", location.pathname + location.search);
  if (m[1]) S.gate = m[1];
  else if (m[2] === "invite") { S.invite = m[3]; S.join = null; S.gate = "join"; try { sessionStorage.setItem("acct:invite", m[3]); } catch (_) {} }
  else { S.reset = { token: m[3] }; resetCheck(); }
  return true;
}
// A link from one of the account's emails: confirming the email, a new email, or keeping the account. The link's own
// token is what counts, so it works signed in or not, in whichever browser the email opens it in. (Keeping it waits
// for a tap: keepPage, so a mail scanner that opens the link to see where it goes doesn't keep it.)
async function fromLink() {
  const m = /^#(confirm|email|keep)=([A-Za-z0-9_-]{40,50})$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  const [, kind, token] = m;
  if (kind === "keep") { S.keep = { token }; return; }
  try {
    const r = await post({ confirm: "email/confirm", email: "email/change-confirm" }[kind], { token });
    S.said = { kind, text: kind === "confirm" ? "Your email is confirmed." : `Your account’s email is now ${r.email}.` };
  } catch (e) { S.said = { kind, bad: true, text: e.message }; }
}
// (and one opened in a tab where the page is already open)
addEventListener("hashchange", async () => {
  Sheet.hist = 0;          // (a link arrived over an open sheet: its steps are behind this one now, and stay there)
  if (fromGate()) return anew(() => { S.settled = false; render(); });
  if (!/^#(confirm|email|keep)=/.test(location.hash)) return;
  await fromLink();
  let m = S.me;
  try { m = await call("me"); S.pulled = Date.now(); } catch (_) {}
  anew(() => { S.me = m; S.settled = false; render(); });
});
function render() {
  // (settling into place the first time each way round: signed in, out, or being deleted; after that, drawn again in
  // place, from where everything was)
  const rise = !S.settled; S.settled = true;
  const was = rise ? null : where(), risers = [];
  const r = (el) => { if (rise && el) risers.push(el); return el; };
  main.replaceChildren(...(S.reset ? resetPage(r) : S.keep ? keepPage(r) : S.me?.deleting ? deleting(r) : S.me?.signedIn ? (S.signFor ? continuePage(r) : signedIn(r)) : signedOut(r)).filter(Boolean));
  if (rise) settle(risers); else moved(was);
  main.removeAttribute("aria-busy");
  document.title = S.me?.signedIn ? `${S.me.name} · Account` : "Account · InFlite";
  IFL.watch(window);
  scrolled();
  if (S.said) { const { text, bad } = S.said; S.said = null; toast(text, bad, 5000); }
}
// the page drawn again with what's new, once it's settled into place (what changed behind the scenes)
function patch() { clearTimeout(S.patchT); S.patchT = setTimeout(render, Math.max(0, (S.riseUntil || 0) - Date.now())); }
// each part of the page rising into place in the order it's read: down the page, and across where two sit side by side
function settle(els) {
  const at = els.map((el) => { const b = el.getBoundingClientRect(); return { el, y: Math.round(b.top / 8), x: b.left }; }).sort((a, b) => a.y - b.y || a.x - b.x);
  at.forEach(({ el }, i) => { el.style.setProperty("--i", i); el.classList.add("rise"); });
  S.riseUntil = Date.now() + at.length * 70 + 950;
}
// Where each part of the page is (by its data-sec), what each row says (by its data-k), and what has the focus: taken
// before it's drawn again, for moved()
function where() {
  const secs = new Map(), vals = new Map();
  for (const el of main.querySelectorAll("[data-sec]")) {
    const b = el.getBoundingClientRect(), near = (d) => { for (let x = el[d]; x; x = x[d]) if (x.dataset?.sec) return x.dataset.sec; return null; };
    secs.set(el.dataset.sec, { el, x: b.left, y: b.top, next: near("nextElementSibling"), prev: near("previousElementSibling") });
  }
  for (const el of main.querySelectorAll("[data-k]")) vals.set(el.dataset.k, says(el));
  for (const el of main.querySelectorAll(".rise")) el.classList.remove("rise");      // (risen once: not again as it's put back)
  return { secs, vals, focus: main.contains(document.activeElement) ? keyOf(document.activeElement) : null };
}
const says = (row) => [row.querySelector(".val"), row.querySelector(".tx small")].map((x) => x?.textContent ?? null);
// The page drawn again, from where everything was: a part that's moved slides from there to where it is now, a new one
// fades in where it goes, one that's gone fades and folds away where it was; what a row says that's changed fades in;
// and what had the focus has it again
function moved(was) {
  for (const [k, w] of was.secs) {
    if (main.querySelector(`[data-sec="${k}"]`)) continue;
    const next = w.next && main.querySelector(`[data-sec="${w.next}"]`), prev = !next && w.prev && main.querySelector(`[data-sec="${w.prev}"]`);
    if (next) next.before(w.el); else if (prev) prev.after(w.el); else continue;
    w.el.inert = true; fold(w.el, false).then(() => w.el.remove());
  }
  // (where the page is stepped back behind a sheet, how far it moved on the screen, in the page's own size)
  const page = $("#page"), k = page.getBoundingClientRect().width / (page.offsetWidth || 1) || 1;
  for (const el of main.querySelectorAll("[data-sec]")) {
    const w = was.secs.get(el.dataset.sec);
    if (el.inert) continue;
    if (!w) { el.animate(still.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(-8px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: ms(still.matches ? "--dur-fast" : "--dur-base"), easing: tok("--ease-glide") }); continue; }
    const b = el.getBoundingClientRect(), dx = (w.x - b.left) / k, dy = (w.y - b.top) / k;
    if (!still.matches && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: ms("--dur-base"), easing: tok("--ease-glide") });
  }
  for (const el of main.querySelectorAll("[data-k]")) {
    const w = was.vals.get(el.dataset.k), now = says(el), parts = [el.querySelector(".val"), el.querySelector(".tx small")];
    if (w) now.forEach((t, i) => { if (t != null && t !== w[i]) parts[i].animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-fast"), easing: tok("--ease-out") }); });
  }
  if (was.focus && (!document.activeElement || document.activeElement === document.body)) refocus(main, was.focus);
}
// Something going, folded away: it fades (a row sliding off as it does), then the room it took closes up, the list, or
// the sheet, closing round it. With Reduce Motion it just fades.
async function fold(el, slide = true) {
  if (!el?.isConnected) return;
  const done = (a) => a.finished.catch(() => {});
  if (still.matches) return done(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms("--dur-fast"), fill: "forwards" }));
  const gone = slide ? "translateX(-24px)" : "scale(0.98)";
  await done(el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: gone }], { duration: ms("--dur-fast"), easing: tok("--ease-in"), fill: "forwards" }));
  if (!el.isConnected) return;
  const cs = getComputedStyle(el);
  el.style.overflow = "hidden";
  await done(el.animate([{ height: `${el.offsetHeight}px`, minHeight: least(cs), paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    { height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" }], { duration: ms("--dur-base"), easing: tok("--ease-glide"), fill: "forwards" }));
}
// (as short as it's let be, as a length a height can be animated from or to)
const least = (cs) => (cs.minHeight === "auto" ? "0px" : cs.minHeight);
// What has the focus, in a word, to find it again once it's drawn anew: the sheet's title; a row by what it's for; a
// field by its name; else what it's called or says
function keyOf(el) {
  if (!el || el === document.body || !el.closest) return null;
  if (el.id === "sheet-title") return "#title";
  return el.closest("[data-k]")?.dataset.k || el.getAttribute("aria-label") || (el.tagName === "INPUT" && (el.name || el.closest("label")?.textContent)) || el.textContent.trim().slice(0, 80) || null;
}
function refocus(root, key, sel) {
  const el = key === "#title" ? $("#sheet-title", sheetEl) : [...root.querySelectorAll("button, a[href], input, [tabindex]")].find((x) => !x.closest(".going, [inert]") && keyOf(x) === key);
  el?.focus({ preventScroll: true });
  if (el && sel) try { el.setSelectionRange(...sel); } catch (_) {}
}
// A picture (a photo, an app's mark): faded in the first time it's shown, once it's ready to be (not as it's put in the
// page, with nothing yet to show), and from then on, each time the page is drawn, just there. With Reduce Motion, a
// quick fade and no more.
const SHOWN = new Set();
function photo(src, props = {}, spec = "img") {
  const known = SHOWN.has(src), img = h(spec, { src, alt: "", decoding: known ? "sync" : "async", ...props });
  if (known) return img;
  img.style.opacity = "0";
  const show = () => {
    SHOWN.add(src); img.style.opacity = "";
    img.animate(still.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: "1.06" }, { opacity: 1, scale: "1" }],
      { duration: still.matches ? ms("--dur-fast") : 600, easing: tok("--ease-out") });
  };
  img.decode().then(show, () => { img.style.opacity = ""; });
  return img;
}
function avatar(m, small) {
  const el = h(small ? "div.avatar.small" : "div.avatar", { "aria-hidden": "true" }, [...String(m.name || m.handle || "?").trim()][0]?.toUpperCase() || "?");
  if (m.photoAt) el.append(photo(`${API}/me/photo?v=${m.photoAt}`));
  return el;
}
function section(title, group, foot) {
  return h("section.section", {}, title && h("h3", { text: title }), group, foot && h("p.foot", { text: foot }));
}
// (value: how things are, amber where it needs you (warn); or, where there's one thing to do, that (a node: a button's look))
function row({ icon: ic, tint, title, sub, subWarn, value, warn, onclick, label, cls = "" }) {
  return h("button.row" + cls, { type: "button", onclick, "aria-label": label, "data-k": title },
    h(`span.ic.${tint}`, {}, icon(ic, 19)),
    h("span.tx", {}, h("b", { text: title }), sub && h("small" + (subWarn ? ".warn" : ""), { text: sub })),
    value != null && (value instanceof Node ? h("span.val", {}, value) : h("span.val" + (warn ? ".warn" : ""), { text: String(value) })),
    h("span.chev", {}, icon("chev", 16, 2.4)));
}
const unitsSaid = (u) => [u.temp === "f" ? "°F" : "°C", { mph: "mph", kmh: "km/h", ms: "m/s", kn: "knots" }[u.wind], u.precip].join(" · ");

// (this device, as Signed-in devices names it, in a word: "This iPhone")
const thisOne = (d) => { const k = String(d.label || "").split(" · ")[0]; return /^(iPhone|iPad|Mac)$/.test(k) ? `This ${k}` : "This device"; };
function signedIn(r) {
  const m = S.me, ap = m.apps || {}, pw = m.password || {};
  // each app: a way into it, and what you have there (what it keeps of yours, behind ⓘ)
  // (an app's settings that are the account's, a tap from its card: inflightView, weatherSetView, fitnessSetView)
  const SETS = { inflight: inflightView, weather: weatherSetView, fitness: fitnessSetView };
  // (and those kept in the app itself: Mail's addresses are its own, so its settings button opens Mail at them)
  const SET_LINKS = { mail: "#settings" };
  const open = (id, name) => h("a.open-app", { href: siteUrl(APPS[id].sub), "aria-label": `Open ${name}` }, "Open", icon("open", 15, 2.6));
  const app = (id, name, img, use, sub) => h("div.app.glass", {},
    h("div.app-top", {}, h("img", { src: img, alt: "", width: 54, height: 54 }),
      h("button.about", { type: "button", "aria-label": `About ${name}`, "data-k": `about-${id}`, onclick: () => openSheet(() => appView(id)) }, icon("info", 17, 1.9))),
    h("b", { text: name }), h("span.use", { text: use }), h("span.sub", { text: sub }),
    SETS[id] ? h("div.app-acts", {}, h("button.app-set", { type: "button", "aria-label": `${name} settings`, "data-k": `${id}-settings`, onclick: () => openSheet(SETS[id]) },
      icon("sliders", 18, 2.1)), open(id, name))
      : SET_LINKS[id] ? h("div.app-acts", {}, h("a.app-set", { href: siteUrl(APPS[id].sub) + SET_LINKS[id], "aria-label": `${name} settings`, "data-k": `${id}-settings` },
        icon("sliders", 18, 2.1)), open(id, name))
      : open(id, name));
  const f = ap.inflight || {}, w = ap.weather || {}, fx = ap.fitness || {}, alerts = !!(w.notify?.places || w.notify?.brief), plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // (each part named, so it's found again when the page is drawn anew: render, moved)
  const sec = (k, el) => { if (el) el.dataset.sec = k; return el; };
  const apps = r(sec("apps", section("Your apps", h("div.apps", {},
    app("inflight", "Chat", "/apps/inflight.png", f.friends ? `${plural(f.friends, "friend", "friends")} · ${f.sent || 0} sent` : "No friends yet",
      f.places ? `${plural(f.places, "place", "places")} in your passport` : "Letters carried by pigeon"),
    app("weather", "Weather", "/apps/weather.png", w.places ? plural(w.places, "place", "places") : "No places yet",
      w.places ? (alerts ? "Alerts on" : "Alerts off") : "Forecasts, radar and alerts"),
    app("fitness", "Fitness", "/apps/fitness.png", fx.activities ? plural(fx.activities, "activity", "activities") : "No rides yet",
      fx.plan ? "On a plan" : "Training, using AI"),
    // (Mail, the site's inbox, is the admin's alone: functions/_mailapp.js)
    m.admin && app("mail", "Mail", MAIL_ICON, "The site’s inbox", "Yours alone, as admin")))));
  const top = [
    r(sec("card", posterCard(m))),
    (!m.emailOk || m.emailNew) && r(sec("banner", banner(m))),
    pw.leaked && r(sec("leak", leakBanner())),
  ];
  if (m.admin && location.hash === "#admin") {
    history.replaceState(null, "", location.pathname + location.search);
    afterRise(() => (m.admin.ready ? openAdmin() : openSheet(passkeysView)));
  }
  // the account: sign-in and security (how it stands, by the check-up), and your data (deleting the account at its
  // foot), a row each; the rest in their sheets
  const todo = checks(m).filter((x) => !x.ok).length;
  const account = r(sec("account", section("Account", h("div.group.glass", {},
    row({ icon: "shield", tint: todo ? "amber" : "green", title: "Sign-in and security", value: todo ? `${todo} to do` : "Secure", warn: !!todo, onclick: () => openSheet(securityView) }),
    row({ icon: "download", tint: "green", title: "Your data", onclick: () => openSheet(exportView) })))));
  const prefs = r(sec("prefs", section("Preferences", h("div.group.glass", {},
    row({ icon: "contrast", tint: "indigo", title: "Appearance", value: { auto: "Automatic", light: "Light", dark: "Dark" }[m.prefs.appearance], onclick: () => openSheet(appearanceView) }),
    row({ icon: "ruler", tint: "blue", title: "Units", value: unitsSaid({ ...unitsHere(), ...(m.prefs.units || {}) }), onclick: () => openSheet(unitsView) }),
    row({ icon: "mail", tint: "red", title: "Emails", value: emailsSaid(m.emails), onclick: () => openSheet(emailsView) })))));
  // (opened from an app, in its own window: signing out is the app's to do, not this window's; the home page has none
  // of its own, so from there it's here)
  const ending = [
    // (the site's admin, for the linked account only, at the foot, over Sign out: the top's about you and your apps;
    // #admin, from the old dashboard or its email, opens it, once the page has settled)
    m.admin && r(sec("admin", ADM ? ADM.adminRow(m) : adminRowSoon())),
    (!fromApp() || fromApp() === "home") && r(sec("end", section(null, h("div.group.glass", {}, h("button.row.action.danger", { type: "button", onclick: (e) => signOut(e.currentTarget) }, "Sign out"))))),
  ];
  return [r(sec("title", acctHead(m, todo))), h("div.cols", {}, h("div.col-a", {}, top.filter(Boolean)), h("div.col-b", {}, [apps, account, prefs, ...ending].filter(Boolean)))];
}
// InFlite's header, the same in every app: your photo (InFlite's menu), Account large with its line under it (your
// handle, and how safe it is), and, opened from an app, the way back to it in the capsule; compact as it's scrolled
function acctHead(m, todo) {
  const hd = IFL.header({ title: "Account", me: avatar(m), onMe: (b) => youMenu(b, m), cls: "ahead",
    line: `@${String(m.handle).replace(/[&<>"]/g, "")} · ${todo ? `<i>${todo} to do</i>` : "secure"}` });
  if (fromApp()) hd.querySelector(".ifh-acts").append(backPill());
  return hd;
}
function youMenu(at, m) {
  IFL.menu(at, {
    app: "account", build: BUILD,
    me: { name: m.name, line: `@${m.handle}`, photo: avatar(m) },
    // (what needs you first, in amber, till it's done; your passkeys, the way into every app; how every app looks and
    // measures; your data on its own)
    rows: [
      ((todo) => ({ icon: "shield", color: "green", label: "Sign-in and Security", value: todo ? `${todo} to do` : "Secure", warn: !!todo, open: () => openSheet(securityView) }))(checks(m).filter((x) => !x.ok).length),
      { icon: "key", color: "indigo", label: "Passkeys", value: String(m.passkeys?.length || "Add one"), open: () => openSheet(passkeysView) },
      { icon: "moon", color: "grey", label: "Appearance", value: { auto: "Automatic", light: "Light", dark: "Dark" }[m.prefs.appearance], open: () => openSheet(appearanceView) },
      { icon: "ruler", color: "blue", label: "Units", value: unitsSaid({ ...unitsHere(), ...(m.prefs.units || {}) }).split(" · ").slice(0, 2).join(" · "), open: () => openSheet(unitsView) },
      "-",
      { icon: "data", color: "grey", label: "Your Data", open: () => openSheet(exportView) },
    ],
    account: () => scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" }),
    signOut: (!fromApp() || fromApp() === "home") ? () => signOut(at) : null,
  });
}
// Your card: your photo as its poster (the point of it you chose in view), carried on, blurred, behind the buttons under
// it, your name and handle on it (your email's in Edit profile, and Sign-in and security); no photo, your colours and initial, and Add a photo. The camera opens Your photo.
const posterSrc = (m) => (m.poster?.at ? `${API}/me/poster?v=${m.poster.at}` : `${API}/me/photo?v=${m.photoAt}`);
const focusOf = (m) => (m.poster?.focus || "50 50").split(" ").map(Number);
const placed = (img, f) => { img.style.objectPosition = `${f[0]}% ${f[1]}%`; return img; };
// (the card as it was last drawn, and what it showed: the same one put back while none of that's changed, so its photo
// isn't put in anew each time the page is drawn)
let card = null;
// (its buttons each with a data-k, so a sheet one opened gives it the focus back once it closes, even with the card drawn
// anew meanwhile: the camera and Add a photo the same one, as each becomes the other)
function posterCard(m) {
  const key = [m.photoAt, m.poster?.at, m.poster?.focus, m.name, m.handle].join("|");
  if (card?.key === key) return card.el;
  const pic = !!m.photoAt, file = photoInput();
  const el = h("section.hero.poster-card.glass" + (pic ? "" : ".none"), { "aria-label": "Your profile" },
    h("div.pc-blur", { "aria-hidden": "true" }, pic && photo(`${API}/me/photo?v=${m.photoAt}`)),
    h("div.pc-top", {},
      h("div.pc-photo", { "aria-hidden": "true" }, pic ? placed(photo(posterSrc(m)), focusOf(m))
        : h("span.pc-initial", { text: [...String(m.name || m.handle || "?").trim()][0]?.toUpperCase() || "?" })),
      h("div.pc-shade", { "aria-hidden": "true" }),
      pic ? h("button.pc-cam", { type: "button", "aria-label": "Your photo", "data-k": "photo", onclick: () => { forgetPhoto(); openSheet(photoView); } }, icon("camera", 19, 2))
        : h("button.pc-add", { type: "button", "data-k": "photo", onclick: () => file.click() }, icon("camera", 17, 2.2), "Add a photo"),
      h("div.pc-id", {}, h("h2" + ([...m.name].length > 14 ? ".long" : ""), { text: m.name }), h("div.who", { text: `@${m.handle}` }))),
    h("div.pc-body", {},
      h("div.hero-acts", {},
        h("button.pill.primary", { type: "button", "data-k": "edit-profile", onclick: () => openSheet(profileView) }, icon("pencil", 17, 2.2), "Edit profile"),
        h("button.pill", { type: "button", "data-k": "your-code", onclick: () => openSheet(codeView) }, icon("qr", 17, 2), "Your code"))),
    file);
  card = { key, el };
  return el;
}
// (a photo picked: into Your photo, to choose what shows before it's saved)
function photoInput() {
  const file = h("input.vh", { type: "file", accept: "image/*", tabindex: "-1", "aria-hidden": "true", onchange: () => {
    const f = file.files[0]; file.value = "";
    if (!f) return;
    if (PV.url) URL.revokeObjectURL(PV.url);
    Object.assign(PV, { file: f, url: URL.createObjectURL(f), focus: [50, 50] });
    if (sheetEl.open && Sheet.stack.at(-1) === photoView) redraw(); else openSheet(photoView);
  } });
  return file;
}

// Your photo: what shows of it, chosen by dragging it (the card's poster, and the circle every app shows), another one,
// or none. A new one is saved twice: the circle, 512 pixels square, and the poster, at most 1600 across.
const PV = { file: null, url: null, focus: [50, 50], shown: null };
function photoView() {
  const m = S.me, fresh = !!PV.url, src = fresh ? PV.url : posterSrc(m), said = h("p.said", { role: "alert" }), file = photoInput();
  if (!fresh && PV.shown !== m.photoAt) { PV.focus = focusOf(m); PV.shown = m.photoAt; }
  // (another photo chosen: it fades in, once it's ready)
  const big = photo(src, { draggable: "false" }), small = photo(src);
  const place = () => { placed(big, PV.focus); placed(small, PV.focus); };
  place();
  const frame = h("div.pv-frame", { tabindex: "0", role: "group", "aria-label": "Your photo: drag it, or use the arrow keys, to choose what shows" },
    big, h("span.pv-tip", { "aria-hidden": "true" }, "Drag to choose what shows"));
  dragFocus(frame, big, place);
  const save = h("button.link.done", { type: "button", onclick: () => savePhoto(save, said) }, "Save");
  return { title: "Your photo",
    left: h("button.link", { type: "button", onclick: () => { forgetPhoto(); closeSheet(); } }, "Cancel"), right: save,
    body: [frame,
      h("div.pv-also", {}, h("span.pv-circle", { "aria-hidden": "true" }, small),
        h("p", { text: "Your card shows the photo across; every app shows the circle." })),
      h("div.group", {},
        h("button.row.action", { type: "button", onclick: () => file.click() }, fresh || m.photoAt ? "Choose another photo" : "Choose a photo"),
        !fresh && m.photoAt && h("button.row.action.danger", { type: "button", onclick: async (e) => {
          try { S.me = await busy(e.currentTarget, "Removing…", () => call("me/photo", { method: "DELETE" })); forgetPhoto(); closeSheet(); render(); toast("Photo removed."); }
          catch (err) { say(said, err.message); }
        } }, "Remove photo")),
      file, said] };
}
function forgetPhoto() { if (PV.url) URL.revokeObjectURL(PV.url); Object.assign(PV, { file: null, url: null, shown: null }); }
// dragging the photo moves what shows (as the image moves under a finger); the arrow keys, a little at a time
function dragFocus(frame, img, moved) {
  let at = null;
  const clamp = (v) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
  frame.addEventListener("pointerdown", (e) => {
    const r = frame.getBoundingClientRect(), w = img.naturalWidth, ht = img.naturalHeight;
    if (!w || !ht) return;
    const s = Math.max(r.width / w, r.height / ht);
    at = { x: e.clientX, y: e.clientY, f: [...PV.focus], ox: w * s - r.width, oy: ht * s - r.height };
    frame.setPointerCapture(e.pointerId); frame.classList.add("dragging");
  });
  frame.addEventListener("pointermove", (e) => {
    if (!at) return;
    PV.focus = [at.ox > 1 ? clamp(at.f[0] - ((e.clientX - at.x) / at.ox) * 100) : at.f[0], at.oy > 1 ? clamp(at.f[1] - ((e.clientY - at.y) / at.oy) * 100) : at.f[1]];
    moved();
  });
  const up = () => { at = null; frame.classList.remove("dragging"); };
  frame.addEventListener("pointerup", up); frame.addEventListener("pointercancel", up);
  frame.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] }[e.key];
    if (!d) return;
    e.preventDefault(); PV.focus = [clamp(PV.focus[0] + d[0]), clamp(PV.focus[1] + d[1])]; moved();
  });
}
async function savePhoto(btn, said) {
  const m = S.me, f = PV.focus;
  say(said, "");
  try {
    await busy(btn, "Saving…", async () => {
      // a new photo, or the poster cut again so the circle follows what shows; with only the small one (sent before
      // posters were), just the point that shows
      const source = PV.file || (m.poster?.at ? await fetch(posterSrc(m), { credentials: "same-origin" }).then((r) => (r.ok ? r.blob() : null)) : null);
      if (!source) { S.me = await call("me/poster", { method: "PATCH", body: { focus: { x: f[0], y: f[1] } } }); return; }
      const img = await readImage(source);
      // (the same photo, what shows of it moved: only the circle sent again, the poster kept as it is, with its new
      // focus, rather than made again and sent again whole)
      if (!PV.file) { S.me = await call(`me/photo?at=${m.poster.at}&focus=${f[0]},${f[1]}`, { method: "PUT", body: await asAvatar(img, f), type: "image/jpeg" }); return; }
      const [circle, poster] = await Promise.all([asAvatar(img, f), asPoster(img)]);
      S.me = await call("me/photo", { method: "PUT", body: circle, type: "image/jpeg" });
      S.me = await call(`me/poster?focus=${f[0]},${f[1]}`, { method: "PUT", body: poster, type: "image/jpeg" });
    });
    const was = !!PV.file;
    forgetPhoto(); closeSheet(); render(); toast(was ? "Photo updated." : "Saved.");
  } catch (e) {
    // (refused, the photo having changed elsewhere since: the account asked for again, so the card, and Your photo
    // opened again, show the one there now, and its next Save goes by that one's poster)
    if (e.status === 409) try { S.me = await call("me"); S.pulled = Date.now(); forgetPhoto(); closeSheet(); render(); return toast(e.message, true); } catch (_) {}
    say(said, e.message);
  }
}
// Your code: a QR code of the link that adds you in Chat, to show a friend (or share the link itself)
function codeView() {
  const m = S.me, link = `${siteUrl("chat")}#add=${m.handle}`, qr = h("div.qr");
  import("./qr.js").then(({ qrSvg }) => {
    qr.innerHTML = qrSvg(link, { dark: "#0d1020", light: "transparent", title: `Add @${m.handle} in Chat` });   // (on its card, whichever its colour: styles.css --qr-card)
    // (drawn in on its card, not just there)
    qr.firstElementChild?.animate(still.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 250, easing: tok("--ease-out") });
  })
    .catch(() => qr.replaceChildren(h("span.qr-none", { text: "The code couldn’t be drawn here. Copy the link instead." })));
  return { title: "Your code", body: [
    // (who it adds, as a contact is shown; then the code itself, as large as the sheet allows, on its white card)
    h("div.code-who", {}, avatar(m, true), h("div", {}, h("b", { text: m.name }), h("span", { text: `@${m.handle}` }))),
    h("div.code-big", {}, qr),
    h("div.code-acts" + (navigator.share ? ".two" : ""), {},
      navigator.share && h("button.btn", { type: "button", onclick: () => navigator.share({ title: `${m.name} on Chat`, text: `Add me on Chat: @${m.handle}`, url: link }).catch(() => {}) }, icon("share", 19, 2), "Share"),
      h("button.btn" + (navigator.share ? ".quiet" : ""), { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch (_) { toast(link); } } }, "Copy link")),
  ] };
}
const notifySaid = (n) => [n?.places && `${n.places} ${n.places === 1 ? "place" : "places"}`, n?.brief && "morning brief"].filter(Boolean).join(" · ") || "Off";
// An app: what it keeps of yours, in a word or two, and the way into it
function appView(id) {
  if (id === "fitness") return fitnessView();
  if (id === "mail") return mailView();
  const m = S.me, ap = m.apps || {}, inflight = id === "inflight";
  const head = h("div.app-head", {}, h("img", { src: inflight ? "/apps/inflight.png" : "/apps/weather.png", alt: "", width: 64, height: 64 }),
    h("b", { text: inflight ? "Chat" : "Weather" }), h("span", { text: inflight ? "Letters carried by pigeon" : "A forecast that explains itself" }));
  const stat = (n, label) => h("div.stat", {}, h("b", { text: String(n) }), h("span", { text: label }));
  const open = h("a.btn", { href: siteUrl(inflight ? "chat" : "weather") }, `Open ${inflight ? "Chat" : "Weather"}`, icon("open", 18, 2.4));
  if (inflight) {
    const f = ap.inflight || {};
    return { title: "Chat", quiet: true, body: [head,
      h("div.stats", {}, stat(f.friends || 0, f.friends === 1 ? "friend" : "friends"), stat(f.sent || 0, f.sent === 1 ? "pigeon sent" : "pigeons sent"),
        stat(f.places || 0, f.places === 1 ? "place in your passport" : "places in your passport"), stat(f.groups || 0, f.groups === 1 ? "group" : "groups")),
      open] };
  }
  const w = ap.weather || {}, names = w.placeNames || [];
  return { title: "Weather", quiet: true, body: [head,
    h("div.group", {},
      h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Saved places" })), h("span.val", { text: String(w.places || 0) })),
      names.length > 0 && h("div.row.plain.places", {}, h("span.tx", {}, h("small", { text: names.join(" · ") + (w.places > names.length ? ` · and ${w.places - names.length} more` : "") }))),
      h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Notifications" })), h("span.val", { text: notifySaid(w.notify) })),
      h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Units" })), h("span.val", { text: unitsSaid({ ...unitsHere(), ...(m.prefs.units || {}) }) }))),
    open] };
}

// What Fitness keeps of yours: your activities (each with its file), the space they take, your plan and your own workouts
// (Mail: what it is, and where; its mail is kept by Mail itself, not here)
function mailView() {
  return { title: "Mail", quiet: true, body: [
    h("div.app-head", {}, h("img", { src: MAIL_ICON, alt: "", width: 64, height: 64 }), h("b", { text: "Mail" }), h("span", { text: "The site’s inbox" })),
    h("p.hint", { text: "Mail sent to any address at inflite.ai arrives here, and you can send from any of them. Only the site’s admin can open it, with a passkey, confirming it’s you every 12 hours." }),
    h("a.btn", { href: siteUrl("email") }, "Open Mail", icon("open", 18, 2.4))] };
}
function fitnessView() {
  const x = S.me.apps?.fitness || {}, mb = (x.bytes || 0) / 1048576;
  const row = (k, v) => h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: k })), h("span.val", { text: v }));
  return { title: "Fitness", quiet: true, body: [
    h("div.app-head", {}, h("img", { src: "/apps/fitness.png", alt: "", width: 64, height: 64 }), h("b", { text: "Fitness" }), h("span", { text: "Training, using AI" })),
    h("div.group", {}, row("Activities", String(x.activities || 0)), x.last && row("Latest", day(x.last)),
      row("Files", mb < 0.1 ? "None" : mb < 1000 ? `${mb.toFixed(mb < 10 ? 1 : 0)} MB` : `${(mb / 1024).toFixed(1)} GB`),
      row("Plan", x.plan ? "On a plan" : "None"), row("Your workouts", String(x.workouts || 0))),
    h("a.btn", { href: siteUrl("fitness") }, "Open Fitness", icon("open", 18, 2.4))] };
}

// (a confirm link sent this last week, as one is as the account's made: said so, rather than offered as if none had
// gone, as a new one would stop that one working)
const linkSent = (m) => !!m.emailSentAt && Date.now() - m.emailSentAt < 7 * 864e5;
// (and one just sent: the page drawn again to say so)
const confirmSent = (r) => { if (!r.already) { S.me.emailSentAt = Date.now(); patch(); } };
// Your email isn't confirmed (or a new one's waiting to be): said up top, with what to do
function banner(m) {
  const sent = linkSent(m);
  const sending = async (b) => {
    try { confirmSent(await busy(b, "Sending…", () => post("email/confirm-send"))); toast(`A link is on its way to ${m.email}.`); }
    catch (e) { toast(e.message, true); }
  };
  return m.emailNew
    ? h("section.banner.glass", {}, h("span.ic.blue", {}, icon("mail", 19)),
      h("span.tx", {}, h("b", { text: "Confirm your new email" }), h("small", { text: `We sent a link to ${m.emailNew}. Your email changes when you open it.` })),
      h("button.mini.go", { type: "button", onclick: () => openSheet(emailView) }, "Details"))
    : h("section.banner.warn.glass", {}, h("span.ic.amber", {}, icon("alert", 19)),
      h("span.tx", {}, h("b", { text: "Confirm your email" }), h("small", { text: sent ? `We sent a link to ${m.email}. Open it to confirm.` : "So password resets and security notes reach you. We’ll send a link to it." })),
      h("button.mini.go", { type: "button", onclick: (e) => sending(e.currentTarget) }, sent ? "Send again" : "Send link"));
}
// Your password found in a data breach: said up top, as it's the one check that can't wait
function leakBanner() {
  // (no live role on these: the page is drawn again with every change, and each time it would be read out again)
  return h("section.banner.warn.glass", {}, h("span.ic.red", {}, icon("alert", 19)),
    h("span.tx", {}, h("b", { text: "Your password is in a data breach" }), h("small", { text: "It’s one of the first anyone would try. Change it to keep your account safe." })),
    h("button.mini.go", { type: "button", onclick: () => openSheet(passwordView) }, "Change"));
}
// The security check-up: what keeps the account safe, done or to do. A row in Sign-in and security says how it
// stands; tapped, a sheet with a ring for how far along and each check with its fix (opened over it, Back to return).
function checks(m) {
  const stale = m.devices.filter((d) => d.stale).length, pw = m.password || {};
  return [
    { ok: m.emailOk, label: m.emailOk ? "Email confirmed" : "Confirm your email", go: linkSent(m) ? "Send again" : "Send link", act: async (b) => {
      try { confirmSent(await busy(b, "", () => post("email/confirm-send"))); redraw(); toast(`A link is on its way to ${m.email}.`); } catch (e) { toast(e.message, true); } } },
    { ok: m.passkeys.length > 0, label: m.passkeys.length ? `Passkey saved${m.passkeys.length > 1 ? ` (${m.passkeys.length})` : ""}` : "Add a passkey", go: "Add", act: () => pushSheet(passkeysView) },
    { ok: pw.leaked === false, label: pw.leaked ? "Password found in a data breach" : pw.leaked === false ? "Password not in a known data breach" : "Check your password for data breaches",
      go: pw.leaked ? "Change" : "Check", act: () => pushSheet(pw.leaked ? passwordView : checkView) },
    { ok: !stale, label: stale ? `${stale} device${stale > 1 ? "s" : ""} unused for 3 months` : "No devices left unused", go: "Review", act: () => pushSheet(devicesView) },
  ];
}
// Sign-in and security: the check-up at its head (what's left to do, each a tap; all done, just that), then how you
// sign in, and where and when; each row says how things are, and opens its own sheet
function securityView() {
  const m = S.me, pw = m.password || {}, here = m.devices.find((d) => d.current);
  return { title: "Sign-in and security", body: [
    ...checkupView(true).body,
    h("h4.app-k", { text: "Signing in" }),
    h("div.group", {},
      row({ icon: "mail", tint: "blue", title: "Email", value: m.emailOk ? "Confirmed" : "Not confirmed", warn: !m.emailOk, onclick: () => pushSheet(emailView) }),
      row({ icon: "key", tint: "blue", title: "Password",
        value: pw.setAt ? `${Math.abs(pw.setAt - m.since) < 5 * 60e3 ? "Set" : "Changed"} ${when(pw.setAt)}` : null, onclick: () => pushSheet(passwordView) }),
      row({ icon: "passkey", tint: "indigo", title: "Passkeys", value: m.passkeys.length || h("span.mini.go", { text: "Add one" }), onclick: () => pushSheet(passkeysView) })),
    h("h4.app-k", { text: "Where and when" }),
    h("div.group", {},
      row({ icon: "devices", tint: "green", title: "Signed-in devices", value: m.devices.length === 1 && here ? thisOne(here) : m.devices.length, onclick: () => pushSheet(devicesView) }),
      row({ icon: "clock", tint: "grey", title: "Recent activity", value: m.lastActivity ? cap(when(m.lastActivity)) : null, onclick: () => pushSheet(activityView) })),
  ] };
}
// (brief: all done, just that it is, not the list)
function checkupView(brief = false) {
  const items = checks(S.me), todo = items.filter((x) => !x.ok).length, frac = (items.length - todo) / items.length;
  // (the ring fills, from where it stood, and a check that's just been done pops, only when how it stands has changed:
  // the first time it's shown in a sheet, and after a fix; not again each time it's drawn, on coming back to it)
  const was = Sheet.ck; Sheet.ck = { frac, ok: items.map((x) => x.ok) };
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 64 64"); ring.setAttribute("aria-hidden", "true"); ring.classList.add("ring");
  if (was?.frac !== frac) { ring.classList.add("grow"); ring.style.setProperty("--from", ((was?.frac || 0) * 100).toFixed(1)); }
  ring.innerHTML = `<circle class="trk" cx="32" cy="32" r="27"/><circle class="arc" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="${(frac * 100).toFixed(1)} 100"/>`;
  return { title: "Security check-up", body: [h(`div.checkup${todo ? ".todo" : ".ok"}`, {},
    h("div.ck-top", {}, h("span.ck-ring", {}, ring, icon("shield", 24, 1.9)),
      h("span.tx", {}, h("b", { text: todo ? `${todo} thing${todo > 1 ? "s" : ""} to do` : "Well protected" }),
        h("small", { text: todo ? "A minute each, and your account is safer." : "Everything that keeps your account safe is on." }))),
    !(brief && !todo) && h("div.group.ck-list", {}, items.map((x, i) => h("div.ck-row" + (x.ok ? ".ok" : "") + (x.ok && !was?.ok[i] ? ".pop" : ""), {},
      h("span.ck-dot", { "aria-hidden": "true" }, x.ok && icon("check", 13, 3)), h("span.ck-t", { text: x.label }),
      !x.ok && h("button.mini.go", { type: "button", onclick: (e) => x.act(e.currentTarget) }, x.go)))))] };
}
// Being deleted: when, and keeping it
function deleting(r) {
  const m = S.me;
  return [h("div.welcome", {},
    r(h("div", {}, h("div.mark.red", {}, icon("trash", 44, 1.7)))),
    r(h("h1", { text: "Your account is being deleted" })),
    r(h("p", { text: `On ${new Date(m.deleteAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, @${m.handle} and everything kept with it, in every app on the site, will be deleted. Until then, you can keep it.` })),
    r(h("div.signin.glass", {},
      h("button.btn", { type: "button", onclick: async (e) => {
        try { S.me = await busy(e.currentTarget, "Keeping it…", () => post("delete/cancel")); anew(() => { S.settled = false; theme(S.me.prefs?.appearance); render(); toast("Your account is staying."); }); }
        catch (err) { toast(err.message, true); }
      } }, icon("undo", 20, 2.2), "Keep my account"),
      h("button.btn.quiet", { type: "button", onclick: (e) => signOut(e.currentTarget) }, "Sign out")))),
  ];
}
// The email's link to keep it (#keep=): kept once that's tapped, not as the link's opened. (A link that won't work is
// put away, said why; offline, or the server not answering, it stays, to try again.)
function keepPage(r) {
  const go = h("button.btn", { type: "button", onclick: async () => {
    try { await busy(go, "Keeping it…", () => post("delete/keep", { token: S.keep.token })); S.said = { text: "Your account is staying. Sign in to carry on." }; }
    catch (err) { if (err.status !== 400) return toast(err.message, true); S.said = { text: err.message, bad: true }; }
    let m = S.me;
    try { m = await call("me"); S.pulled = Date.now(); } catch (_) {}
    anew(() => { S.keep = null; S.me = m; S.settled = false; render(); });
  } }, icon("undo", 20, 2.2), "Keep my account");
  return [h("div.welcome", {},
    r(h("div", {}, h("div.mark.red", {}, icon("trash", 44, 1.7)))),
    r(h("h1", { text: "Keep your account?" })),
    r(h("p", { text: "It’s being deleted. Tap below to keep it." })),
    r(h("div.signin.glass", {}, go,
      h("button.btn.quiet", { type: "button", onclick: () => anew(() => { S.keep = null; S.settled = false; render(); }) }, "Not now")))),
  ];
}

// ---- signed out: signing in; or making an account (by invite: accounts are made here, and only here); or a forgotten
// password (a link to the email), and a new one from its link (resetPage). Which: S.gate, "signin", "join" or "forgot"
// (#join, #forgot and #invite= open the last two, as the apps link here) ----
const HANDLE_OK = /^[a-z0-9_]{3,20}$/, EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// the way between them: the form below changed in place, the rest of the page staying put
// InFlite's own mark (inflite.svg: a petal in each app's colour round the sun), where you sign in to them all; the
// account's icon (icon.svg: a warm head, frosted glass shoulders) is kept for the account among the apps
const logo = () => h("div.mark.logo", {}, h("img", { src: "/inflite.svg?v=1", alt: "", width: 92, height: 92 }));
// (where the browser can, and motion's welcome, the card goes to its new size as the title and what's in it cross-fade:
// the page as a picture of before and after, .vt-gate naming its parts while it's happening; else what's new fades in)
let gating = 0;
function gate(to) {
  const go = () => { S.gate = to; S.settled = true; render(); }, ready = () => $("main .signin input")?.focus();
  if (!document.startViewTransition || still.matches || document.hidden) {
    go();
    for (const k of $("main .welcome")?.children || []) k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-fast"), easing: tok("--ease-out") });
    return ready();
  }
  gating++; main.classList.add("vt-gate");
  const t = viewTransition(go), done = () => { if (!--gating) main.classList.remove("vt-gate"); };
  t.updateCallbackDone.then(ready);
  t.finished.then(done, done);
}
function signedOut(r) {
  if (S.handoff) return handoffPage(r);
  const mode = S.gate || "signin", last = mode === "signin" ? lastHere() : null;
  if (!S.join) joinState();
  if (mode !== "signin") stopAutofill();
  const to = S.signFor && S.signFor.app !== "home" ? APPS[S.signFor.app].name : null;
  // (no account to be made without an invite, as on the real site: said so up top, plainly, and what to do in the card)
  const needInvite = mode === "join" && S.join && !S.join.pending && !(S.join.open || S.join.ok);
  const head = { signin: [last ? `Welcome back, ${String(last.name).trim().split(/\s+/)[0]}` : "Your account"],
    join: needInvite ? (S.invite ? ["That invite didn’t work", `${S.join.error || "It may have been used already, or have run out."} Ask for a new one, or paste another below.`]
      : ["You’ll need an invite"]) : ["Create your account", to ? `One account for every app on InFlite. Once it’s made, you’re straight back in ${to}.` : "One account for every app on InFlite, made here and used everywhere."],
    forgot: ["Forgot your password?", "We’ll email you a link to choose a new one. It works once, for an hour."] }[mode];
  const sw = (lead, label, to) => h("p.foot.new", {}, lead, h("button.link", { type: "button", onclick: () => gate(to) }, label));
  return [backButton(r), h("div.welcome", {},
    // (the mark floats; it rises in inside something else, as one animation can't do both)
    r(h("div", {}, mode === "forgot" ? h("div.mark", {}, icon("key", 48, 1.7)) : needInvite ? h("div.mark", {}, icon("mail", 46, 1.7)) : last ? avatar(last) : logo())),
    r(h("h1", { text: head[0] })),
    head[1] && r(h("p", { text: head[1] })),
    // (sent here by an app: which, as that's where you'll be once you're in)
    mode === "signin" && r(to ? h("p.lead", {}, "Sign in to continue to ", h("img", { src: appIcon(S.signFor.app), alt: "" }), h("b", { text: to }))
      : last ? h("p.lead", { text: `@${last.handle}` })
      : h("p.lead", {}, "One sign-in for ", h("img", { src: "/apps/inflight.png", alt: "" }), h("b", { text: "Chat" }),
        ", ", h("img", { src: "/apps/weather.png", alt: "" }), h("b", { text: "Weather" }), " and ", h("img", { src: "/apps/fitness.png", alt: "" }), h("b", { text: "Fitness" }))),
    r(mode === "join" ? joinCard() : mode === "forgot" ? forgotCard() : last ? rememberedCard(last) : signinCard()),
    r(mode === "signin" ? (last ? notYouLine() : joinLine()) : sw(mode === "join" ? "Already have an account? " : "Remembered it? ", "Sign in", "signin"))),
  ];
}
// (how a new account's made: here, where anyone can, or with the invite this page was opened with; else, by invitation,
// nothing said: the line kept, empty)
function joinLine() {
  return S.join?.open || S.join?.ok ? h("p.foot.new", { id: "joinline" }, "New here? ", h("button.link", { type: "button", onclick: () => gate("join") }, "Create your account"))
    : h("p.foot.new.invite", { id: "joinline" });
}
// Opened from an app, signed in there: carry on as that account here, said yes to
function handoffPage(r) {
  const w = S.handoff, said = h("p.said", { role: "alert" }), app = APPS[fromApp()]?.name;
  const go = h("button.btn", { type: "button", onclick: async () => {
    try {
      const m = await busy(go, "Signing in…", () => post("handoff", { code: HANDOFF.code }));
      S.handoff = null; welcome(m, null, opens());
    } catch (err) { anew(() => { S.handoff = null; S.settled = false; render(); }); toast(err.message, true, 4000); }
  } }, `Continue as ${String(w.name).trim().split(/\s+/)[0]}`);
  return [h("div.welcome", {},
    r(h("div", {}, logo())),
    r(h("h1", { text: w.name })),
    r(h("p", { text: `@${w.handle}${app ? `, from ${app}` : ""}. Carry on as this account in this browser?` })),
    r(h("div.signin.glass", {}, go, h("button.link.forgot", { type: "button", onclick: () => { S.handoff = null; gate("signin"); } }, "Not you? Sign in"), said)))];
}
// ---- sent here by an app to sign in (S.signFor): back to it once you're in, the sign-in handed back (functions/
// _handback.js), and for Chat what unlocks its key there, sealed to its tab ----
// Signed in here already: carrying on as yourself. For Chat, once you've shown it's you, as what opens its key goes
// back with you: a passkey with its own copy of the key, or your password (just the password, after signing in with a
// passkey that hasn't one, or can't give its secret in this browser: S.need).
function continuePage(r) {
  const m = S.me, a = S.signFor, name = APPS[a.app].name, said = h("p.said" + (S.said?.bad ? ".bad" : ""), { role: "alert", text: S.said?.text || "" });
  S.said = null;
  const go = a.app !== "inflight" && h("button.btn", { type: "button", onclick: () => handBack(m, {}, go) }, a.app === "home" ? "Continue" : `Continue to ${name}`);
  return [backButton(r), h("div.welcome", {},
    r(h("div", {}, avatar(m))),
    r(h("h1", { text: m.name })),
    r(h("p", { text: `@${m.handle}. ${a.app === "home" ? "Carry on as this account?" : S.need ? `One more step for ${name}.` : `Continue to ${name} as this account?`}` })),
    r(go ? h("div.signin.glass", {}, go, said) : unlockCard(m, said)),
    r(h("p.foot.new", {}, "Not you? ", h("button.link", { type: "button", onclick: (e) => { S.need = null; signOut(e.currentTarget); } }, "Sign out"))))];
}
// (Chat's key, opened there with what you show here)
function unlockCard(m, said) {
  const pks = S.need ? [] : (m.passkeys || []).filter((p) => p.messages), byKey = passkeysWork() && pks.length > 0;
  const pw = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true, onfocus: warmUp });
  const go = h("button.btn" + (byKey ? ".quiet" : ""), { type: "submit" }, "Continue");
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!pw.value) return say(said, "Enter your password.", pw);
    try {
      const k = await working(go, "Checking", async () => {
        const k = await E2E.fromPassword(pw.value, m.salt);
        await post("reauth", { proof: k.proof });
        const nk = !E2E.isCurrent(m.salt) && await restretch(pw.value, k);
        if (nk) m.salt = nk.salt;
        return nk || k;
      });
      handBack(m, { lock: k.lock }, go);
    } catch (err) { say(said, err.message, pw); }
  } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }), pwField("Password", pw), go);
  const key = byKey && h("button.btn", { type: "button", onclick: async (e) => {
    const b = e.currentTarget; say(said, "");
    try {
      const way = await working(b, "Waiting for your passkey", async () => {
        const o = await post("signin/options");
        let a;
        try { a = await passkeyAsk({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
          allowCredentials: pks.map((p) => ({ type: "public-key", id: fromB64url(p.id) })), extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } }); }
        catch (_) { throw new Error("No passkey was used."); }
        await post("reauth", { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
          authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) });
        return { prf: prfOf(a), id: a.id };
      });
      if (way.prf) return handBack(m, way, b);
      // (a passkey that can't give its secret in this browser: the password, then)
      morph(b.parentElement, () => { b.remove(); or.remove(); go.classList.remove("quiet"); });
      say(said, "That passkey can’t open your messages in this browser. Use your password.", pw);
    } catch (err) { say(said, err.message); }
  } }, icon("face", 21, 1.9), "Continue with a passkey");
  const or = key && h("div.or", { text: "or with your password" });
  return h("div.signin.glass", {},
    h("p.hint.center", { text: S.need ? "Your Chat messages are locked with a key only your devices hold, and that passkey can’t open it here. Enter your password, and they open in Chat."
      : "Your Chat messages are locked with a key only your devices hold. Show it’s you, and they open in Chat." }),
    key, or, form, said);
}
// Back to the app, signed in (way: what opens Chat's key, for Chat: { lock } or { prf, id }): its code made, and
// off there with it; for the home page, which shares this page's sign-in, just back. With nothing to open Chat's key
// with (a passkey that can't), the password's asked for first; with anything else wrong, it's said, to try again.
async function handBack(m, way, btn) {
  const a = S.signFor;
  S.me = m; S.pulled = Date.now(); stopAutofill();
  // (a sign-in an app handed over to this browser, signed in to nothing, is this page's alone: it goes on to an app once
  // you've shown it's you here, as Chat's way on always asks anyway)
  if (m.handed && a.app !== "inflight") { if (!(await shownHere())) return; m.handed = false; m.fresh = true; }
  // (Mail, the site's inbox, is the admin's alone, and opens only once you've shown it's you: as Admin's lists do)
  if (a.app === "mail" && !m.fresh) { if (!(await shownHere())) return; m.fresh = true; }
  // (the home page: back, saying it's from signing in, so it greets you)
  if (a.app === "home") { const face = await leaving(btn, m); return leaveFor(homeVia(`${a.back}#signedin${faceHint(m, face)}`, true)); }
  const go = async () => {
    const key = a.app === "inflight" ? await keyFor(m, way) : {};
    if (!key) throw Object.assign(new Error(""), { more: true });
    const { code } = await post("handback", { app: a.app, ask: a.ask, ...key });
    const face = await leaving(btn, m);
    leaveFor(`${a.back}#signin=${code}${faceHint(m, face)}`);
    await new Promise(() => {});             // (going: you, there, until the app's there)
  };
  try { await (!btn?.isConnected ? go() : btn.classList.contains("working") ? go() : working(btn, `Opening ${APPS[a.app].name}`, go)); }
  catch (e) {
    S.need = e.more ? "password" : S.need; S.said = e.more ? null : { text: e.message, bad: true };
    anew(() => { S.settled = false; render(); scrollTo(0, 0); });
  }
}
// (showing it's you, in a sheet of its own, from the page itself: → whether it was)
const shownHere = () => new Promise((ok) => {
  Sheet.cancel = () => ok(false);
  openSheet(() => confirmView(() => { Sheet.cancel = null; closeSheet(); ok(true); }, closeSheet));
});
// what opens Chat's key there, sealed to its tab: the password's first half; or the PRF secret of the passkey just
// used, if it has its own copy of the key; else nothing (the password's needed)
async function keyFor(m, way) {
  if (way.lock) return { box: await E2E.sealFor(S.signFor.seal, { lock: way.lock }) };
  if (way.prf && m.passkeys?.some((p) => p.id === way.id && p.messages)) return { box: await E2E.sealFor(S.signFor.seal, { prf: b64url(way.prf) }), pk: way.id };
  return null;
}
// (off to the app, in this page's place in the history)
function leaveFor(url) {
  try { sessionStorage.removeItem("acct-for"); sessionStorage.removeItem("acct-from"); } catch (_) {}
  S.signFor = null; S.need = null;
  location.replace(url);
}
// An account from before Argon2id, signed in to with its password: stretched again the new way (a new salt, and the
// key locked anew with what that gives; the same password and key), as Chat did when it signed in itself. → what
// the new one gives, and its salt; or nothing, if that didn't happen (the old one still works)
async function restretch(pw, k) {
  try {
    const { vault } = await post("password/vault", { proof: k.proof });
    const inner = await E2E.unlock(k.lockKey, vault), salt = E2E.newSalt(), nk = await E2E.fromPassword(pw, salt);
    await post("password/upgrade", { oldProof: k.proof, salt, proof: nk.proof, vault: await E2E.lock(nk.lockKey, inner) });
    return { ...nk, salt };
  } catch (_) { return null; }
}
// (can an account be made: by anyone, on a test server; else with the invite this page was opened with)
async function joinState() {
  S.join = { pending: true };
  try { S.join = await post("join", { invite: S.invite || undefined }); } catch (_) { S.join = { open: false, ok: !!S.invite }; }
  if (S.me?.signedIn || S.reset) return;
  // (said in place, the rest of the page as it was: the card that was waiting, going to the form's size; or the line
  // under the card, still rising with the rest if it is, else faded in)
  const waiting = $("main .signin.joining"), line = $("#joinline");
  if (S.gate === "join") { if (waiting && (S.join.open || S.join.ok)) cardTo(waiting, joinCard()); else { S.settled = true; render(); } }
  else if (line) {
    const nu = joinLine(), rising = line.getAnimations().some((a) => a.animationName === "rise");
    line.className = nu.className + (line.classList.contains("rise") ? " rise" : ""); line.replaceChildren(...nu.childNodes);
    if (!rising) line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: tok("--ease-out") });
  }
}
// a card on a signed-out page given what's new, in place: it goes to its new size as what's in it fades in
function cardTo(old, nu) {
  morph(old, () => { old.className = nu.className + (old.classList.contains("rise") ? " rise" : ""); old.replaceChildren(...nu.childNodes); });
}
function signinCard() {
  const said = h("p.said", { role: "alert" });
  const email = h("input", { type: "email", name: "email", autocomplete: "username webauthn", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const pw = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true, onfocus: warmUp });
  const go = h("button.btn" + (passkeysWork() ? ".quiet" : ""), { type: "submit" }, "Sign in");
  const form = h("form.form", { onsubmit: (e) => { e.preventDefault(); withPassword(email.value.trim(), email, pw, go, said); } }, field("Email", email), pwField("Password", pw), go);
  const pk = passkeysWork() && h("button.btn", { type: "button", onclick: (e) => withPasskey(e.currentTarget, said, () => signInWithPasskey()) }, icon("face", 21, 1.9), "Sign in with a passkey");
  startAutofill(email, (o, a) => withPasskey(pk || go, said, () => passkeySignedIn(o, a)));
  return h("div.signin.glass", {}, pk, pk && h("div.or", { text: "or with your email" }), form,
    h("button.link.forgot", { type: "button", onclick: () => gate("forgot") }, "Forgot password?"), said);
}
// You, signed in here before: your passkey first, if that's how you did (the password a tap away), or your password, your
// email known (a passkey offered in its keyboard too, and a button for one)
function rememberedCard(l) {
  const said = h("p.said", { role: "alert" }), can = passkeysWork(), byKey = can && l.way === "passkey";
  const pw = h("input", { type: "password", name: "password", autocomplete: "current-password webauthn", required: true, onfocus: warmUp });
  const go = h("button.btn" + (byKey ? ".quiet" : ""), { type: "submit" }, "Sign in");
  const form = h("form.form", { onsubmit: (e) => { e.preventDefault(); withPassword(l.email, null, pw, go, said); } },
    h("input.vh", { type: "email", autocomplete: "username", value: l.email, tabindex: "-1", "aria-hidden": "true", readonly: true }), pwField("Password", pw), go);
  const pwBox = h("div.pwbox", { hidden: byKey }, form);
  const key = can && h("button.btn" + (byKey ? "" : ".quiet"), { type: "button", onclick: (e) => withPasskey(e.currentTarget, said, () => signInWithPasskey(byKey ? l.id : undefined)) },
    icon("face", 21, 1.9), byKey ? "Continue with your passkey" : "Sign in with a passkey");
  if (can) startAutofill(pw, (o, a) => withPasskey(key, said, () => passkeySignedIn(o, a)));
  const card = h("div.signin.glass.remembered", {},
    byKey && h("span.last", {}, icon("face", 15, 2), "Last time, you used a passkey"),
    byKey ? [key, pwBox] : [pwBox, key],
    byKey && h("button.link.usepw", { type: "button", onclick: (e) => {
      const open = pwBox.hidden, b = e.currentTarget;
      morph(card, () => { pwBox.hidden = !open; b.textContent = open ? "Use your passkey instead" : "Use your password instead"; key.classList.toggle("quiet", open); go.classList.toggle("quiet", !open); });
      if (open) pw.focus();
    } }, "Use your password instead"),
    h("button.link.forgot", { type: "button", onclick: () => gate("forgot") }, "Forgot password?"), said);
  return card;
}
// (not you: that account forgotten here, and the usual sign-in)
function notYouLine() {
  return h("p.foot.new", {}, "Not you? ", h("button.link.notyou", { type: "button", onclick: () => { forget(); stopAutofill(); anew(() => { S.settled = false; render(); }); } }, "Use another account"));
}
// (the password's stretching needs its WebAssembly: fetched as soon as a password field's used, not when it's sent)
function warmUp() { import("./argon2.js").catch(() => {}); }

// A new account: name, handle (suggested from the name, and checked as it's typed), email and password. The slow parts
// (the key pair, the password's stretching) start while it's typed, so creating it is quick; the key's made, and locked
// with the password, here: the server only ever has it locked.
const handleFrom = (name) => { const p = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).filter(Boolean); return (p.length > 1 ? p[0] + "_" + p[p.length - 1][0] : p[0] || "").replace(/[^a-z0-9_]/g, "").slice(0, 20); };
function joinCard() {
  const said = h("p.said", { role: "alert" });
  if (S.join?.pending) return h("div.signin.glass.joining", {}, h("div.empty", {}, h("span.spin")));
  if (!(S.join?.open || S.join?.ok)) return inviteCard();
  const prep = {};
  const ready = () => { prep.keys ||= E2E.newIdentity(); };
  const name = h("input", { type: "text", name: "name", autocomplete: "name", maxlength: "50", required: true });
  const handle = h("input", { type: "text", name: "handle", autocomplete: "off", autocapitalize: "none", spellcheck: "false", maxlength: "20", required: true });
  const email = h("input", { type: "email", name: "email", autocomplete: "username", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const pw = h("input", { type: "password", name: "password", autocomplete: "new-password", required: true, onfocus: warmUp });
  const hstat = h("p.hint.handle", { "aria-live": "polite", text: "Friends find you by your handle." }), { meter, hint } = rated(pw);
  const go = h("button.btn", { type: "submit" }, "Next");
  let touched = false, hT = 0, pT = 0, known = { v: "", r: null };
  const handleNow = () => handle.value.trim().replace(/^@/, "").toLowerCase();
  // (→ what's said of the handle there now: free, or taken and why; null if it couldn't be asked)
  const check = async () => {
    const v = handleNow();
    if (v.length < 3) { hstat.className = "hint handle"; hstat.textContent = "Friends find you by your handle."; return null; }
    try {
      const r = known.v === v ? known.r : await call(`handle?h=${encodeURIComponent(v)}`);
      known = { v, r };
      if (handleNow() !== v) return r;
      hstat.className = "hint handle " + (r.free ? "ok" : "bad");
      hstat.replaceChildren(r.free ? `@${v} is yours.` : r.reason, ...(r.try?.length ? [" Try ", ...r.try.flatMap((t, i) => [i ? " or " : "",
        h("button.link", { type: "button", onclick: () => { handle.value = t; touched = true; check(); handle.focus(); } }, `@${t}`)]), "."] : []));
      return r;
    } catch (_) { return null; }    // (checked again when it's made)
  };
  name.addEventListener("input", () => { ready(); if (!touched) { handle.value = handleFrom(name.value); clearTimeout(hT); hT = setTimeout(check, 350); } });
  handle.addEventListener("input", () => { ready(); touched = true; clearTimeout(hT); hT = setTimeout(check, 350); });
  pw.addEventListener("input", () => {
    ready(); clearTimeout(pT);
    if (pw.value.length >= 10) { const v = pw.value; pT = setTimeout(() => { const salt = E2E.newSalt(); prep.pw = { pw: v, salt, p: E2E.fromPassword(v, salt) }; prep.pw.p.catch(() => {}); }, 700); }
  });
  // One thing at a time: your name, a handle, your email, then a password, each its own step, the card growing or
  // shrinking to each as it slides in. (Back keeps what's typed.)
  const steps = [
    h("div.jstep", {}, field("Your name", name), h("p.hint", { text: "As your friends will see it." })),
    h("div.jstep", { hidden: true }, field("Choose a handle", h("div.at", {}, "@", handle)), hstat),
    h("div.jstep", { hidden: true }, field("Email", email), h("p.hint", { text: "For sign-in alerts and a forgotten password. Never shown to anyone." })),
    h("div.jstep", { hidden: true }, pwField("Choose a password", pw), meter, hint,
      h("p.hint", { text: "It also locks your Chat encryption key, here on this device: the key is never sent anywhere unlocked." })),
  ];
  let at = 0;
  const back = h("button.link.back", { type: "button", disabled: true, onclick: () => { say(said, ""); toStep(at - 1); } }, icon("back", 16, 2.4), "Back");
  const dots = h("span.d", { "aria-hidden": "true" }, steps.map((_, i) => h(i ? "i" : "i.on")));
  const of = h("span.of", { "aria-live": "polite", text: `1 of ${steps.length}` });
  const toStep = (n, focus = true) => {
    if (n === at || !steps[n]) return;
    const dir = n > at ? 1 : -1, now = steps[n], box = form.closest(".signin") || form;
    morph(box, () => {
      steps[at].hidden = true; now.hidden = false; at = n;
      [...dots.children].forEach((d, i) => { d.classList.toggle("on", i === n); d.classList.toggle("done", i < n); });
      of.textContent = `${n + 1} of ${steps.length}`; back.disabled = n === 0;
      go.textContent = n === steps.length - 1 ? "Create account" : "Next";
    }, false);
    if (!still.matches) now.animate([{ opacity: 0, transform: `translateX(${36 * dir}px)` }, { opacity: 1, transform: "none" }], { duration: ms("--dur-base"), easing: tok("--ease-out") });
    if (focus) now.querySelector("input")?.focus({ preventScroll: true });
  };
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (go.disabled) return;
    const v = { name: name.value.trim(), handle: handleNow(), email: email.value.trim(), password: pw.value };
    if (at === 0) return v.name ? toStep(1) : say(said, "Enter your name.", name);
    if (at === 1) {
      if (!HANDLE_OK.test(v.handle)) return say(said, "Handles use 3 to 20 letters, numbers or underscores.", handle);
      clearTimeout(hT); go.disabled = true;
      const r = await check().finally(() => { go.disabled = false; });
      // (taken: said where the handle is, with some free ones to tap)
      if (r && !r.free) { shake(hstat); return handle.focus(); }
      return toStep(2);
    }
    if (at === 2) return EMAIL_OK.test(v.email) ? toStep(3) : say(said, "That doesn’t look like an email address.", email);
    if (v.password.length < 10) return say(said, "Use at least 10 characters for your password.", pw);
    try {
      let proof, lock, checked = false;
      const m = await working(go, "Creating your account", async () => {
        const n = await leakedCount(v.password);
        if (n) throw Object.assign(new Error(leakedSay(n)), { field: "password" });
        checked = n === 0;
        ready();
        const { privJwk, pub } = await prep.keys;
        const done = prep.pw?.pw === v.password ? prep.pw : null, salt = done ? done.salt : E2E.newSalt();
        const k = await (done ? done.p : E2E.fromPassword(v.password, salt));
        proof = k.proof; lock = k.lock;
        return post("signup", { name: v.name, handle: v.handle, email: v.email, salt, proof, vault: await E2E.lock(k.lockKey, { ecdh: privJwk }), pub, invite: S.invite || undefined });
      });
      S.invite = null; S.gate = null; try { sessionStorage.removeItem("acct:invite"); } catch (_) {}
      remember(m, "password");
      // (made for an app: straight back to it, the password already checked against data breaches, above, if it could be)
      if (S.signFor) { if (checked) post("password/checked", { proof, leaked: false }).catch(() => {}); return handBack(m, { lock }, go); }
      dawnBreak(true); await ticked(go);
      welcome(m, `Welcome, ${String(m.name).trim().split(/\s+/)[0]}. Your account is ready.`);
      checkQuietly(v.password, proof); maybeNudge(m);
    } catch (err) {
      if (err.field === "invite") { S.join = { open: false, ok: false, error: err.message }; return cardTo(form.closest(".signin"), joinCard()); }
      // (something about an earlier step, found as it's made: back to it, to say so there)
      const i = ["name", "handle", "email", "password"].indexOf(err.field);
      if (i >= 0) toStep(i, false);
      say(said, err.message, [name, handle, email, pw][i] || null);
    }
  } }, ...steps, go);
  return h("div.signin.glass.joinsteps", {}, S.invite && !S.join.open && h("p.invited", { text: "You’ve been invited." }),
    h("div.jhead", {}, back, dots, of), form, said);
}
// No account without an invite: what it takes, at a glance (open the invite, make the account, back in the app that
// sent you), and a place for the link, if it was sent somewhere it can't be opened from (a Home Screen app, say):
// pasted, it's taken as if it had been opened (#invite=, fromGate), the way back to the app kept
function inviteCard() {
  const said = h("p.said", { role: "alert" }), to = S.signFor && S.signFor.app !== "home" ? S.signFor.app : null;
  const link = h("input", { type: "url", name: "invite", inputmode: "url", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "Paste the link you were sent" });
  const step = (ic, text) => h("li", {}, h("span.step-ic", { "aria-hidden": "true" }, ic), h("span", { text }));
  return h("div.signin.glass.invite", {},
    h("ol.invite-steps", { "aria-label": "How it works" },
      step(icon("mail", 22, 1.9), "Open your invite"),
      step(icon("person", 22, 1.9), "Make your account"),
      step(to ? h("img", { src: appIcon(to), alt: "" }) : icon("check", 22, 2.4), to ? `Back in ${APPS[to].name}` : "Use it everywhere")),
    h("form.form", { onsubmit: (e) => {
      e.preventDefault(); say(said, "");
      const m = /(?:#invite=|^)([A-Za-z0-9_-]{40,50})(?=[&\s]|$)/.exec(link.value.trim());
      if (!m) return say(said, "That doesn’t look like an invite link: it ends in #invite= and a long code.", link);
      location.hash = `#invite=${m[1]}`;
    } }, field("Invite link", link), h("button.btn", { type: "submit" }, "Continue")),
    said);
}
// A forgotten password: a link to the email (said the same whether there's an account for it or not)
function forgotCard() {
  const said = h("p.said", { role: "alert" });
  const email = h("input", { type: "email", name: "email", autocomplete: "username", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
  const go = h("button.btn", { type: "submit" }, "Email me a link");
  const box = h("div.signin.glass", {}, h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!EMAIL_OK.test(email.value.trim())) return say(said, "Enter the email your account uses.", email);
    try {
      const r = await busy(go, "Sending…", () => post("reset/request", { email: email.value.trim() }));
      // (the card going to the size of what it says now, as that fades in)
      morph(box, () => box.replaceChildren(h("div.sent", {}, icon("mail", 28, 1.8), h("p", { text: r.message }))));
    } catch (err) { say(said, err.message, email); }
  } }, field("Email", email), go),
  h("p.hint.center", { text: "With a passkey, a reset keeps your Chat messages. Without one, you start with a new key, and older messages can’t be opened." }), said);
  return box;
}
// A reset link's own page: who it's for, and a new password. With a passkey that holds a copy of the key (one made in
// Chat, where it can), the key's kept: unlocked with it here, and locked anew with the new password. Otherwise a
// new key pair, and older messages stay sealed.
// (again: asked again from Try again, the page drawn anew only if the answer's changed)
async function resetCheck(again) {
  const R = S.reset, was = R.error;
  R.error = null; R.away = false;
  // (no signal, or the server not answering, isn't the link's fault: said so, with Try again, not "get a new one")
  try { R.info = await post("reset/check", { token: R.token }); } catch (e) { R.error = e.message; R.away = !!e.offline || e.status >= 500; }
  if (again && R.away && R.error === was) return;
  anew(() => { S.settled = false; render(); });
}
function resetPage(r) {
  const R = S.reset, info = R.info;
  if (!info && !R.error) return [h("div.welcome", {}, r(h("div.empty", {}, h("span.spin"))))];
  if (R.error && R.away) return [h("div.welcome", {},
    r(h("div", {}, h("div.mark", {}, icon("key", 44, 1.8)))), r(h("h1", { text: "Can’t check this link" })), r(h("p", { text: R.error })),
    r(h("div.signin.glass", {}, h("button.btn", { type: "button", onclick: (e) => busy(e.currentTarget, "Checking…", () => resetCheck(true)) }, "Try again"))))];
  if (R.error) return [h("div.welcome", {},
    r(h("div", {}, h("div.mark.red", {}, icon("key", 44, 1.8)))), r(h("h1", { text: "This link won’t work" })), r(h("p", { text: R.error })),
    r(h("div.signin.glass", {}, h("button.btn", { type: "button", onclick: () => { S.reset = null; gate("forgot"); } }, "Get a new link"),
      h("button.btn.quiet", { type: "button", onclick: () => { S.reset = null; gate("signin"); } }, "Sign in"))))];
  const said = h("p.said", { role: "alert" });
  const pw = h("input", { type: "password", name: "password", autocomplete: "new-password", required: true, onfocus: warmUp }), { meter, hint } = rated(pw);
  const canKeep = info.passkeys.length > 0 && passkeysWork(), other = S.me?.signedIn && S.me.handle !== info.handle;
  const act = (mode) => async (e) => {
    const b = e.currentTarget; say(said, "");
    if (pw.value.length < 10) return say(said, "Use at least 10 characters.", pw);
    try {
      let proof;
      const m = await busy(b, mode === "keep" ? "Waiting for your passkey…" : "Making your new key…", async () => {
        const n = await leakedCount(pw.value);
        if (n) throw new Error(leakedSay(n));
        let ecdh, pub;
        if (mode === "keep") {
          let a;
          try { a = await passkeyAsk({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: info.rpId, userVerification: "required", timeout: 120000,
            allowCredentials: info.passkeys.map((p) => ({ type: "public-key", id: fromB64url(p.id) })), extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } }); }
          catch (_) { throw new Error("No passkey was used. You can start fresh instead."); }
          const res = a?.getClientExtensionResults?.().prf?.results?.first, pk = a && info.passkeys.find((p) => p.id === a.id);
          if (!res || !pk) throw new Error("That passkey couldn’t unlock your key here. You can start fresh instead.");
          try { ({ ecdh } = await E2E.unlock(await E2E.fromSecret(new Uint8Array(res)), pk.vault)); }
          catch (_) { throw new Error("That passkey couldn’t unlock your key. You can start fresh instead."); }
        } else ({ privJwk: ecdh, pub } = await E2E.newIdentity());
        const salt = E2E.newSalt(), k = await E2E.fromPassword(pw.value, salt);
        proof = k.proof;
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(R.token)))].map((x) => x.toString(16).padStart(2, "0")).join("");
        const keyProof = pub ? undefined : await E2E.keyProof(await E2E.importPriv(ecdh), info.kx, "reset|" + hash);
        return post("reset/complete", { token: R.token, salt, proof, vault: await E2E.lock(k.lockKey, { ecdh }), ...(pub ? { pub } : { keyProof }) });
      });
      S.reset = null; S.gate = null;
      welcome(m, m.kept ? "Password changed. Your messages are safe." : "Password changed. You’re starting fresh with a new key.");
      checkQuietly(pw.value, proof);
    } catch (err) { say(said, err.message, pw); }
  };
  return [h("div.welcome", {},
    r(h("div", {}, h("div.mark", {}, icon("key", 48, 1.7)))),
    r(h("h1", { text: "Choose a new password" })),
    r(h("p", { text: `For ${info.name} (@${info.handle}, ${info.email}).` })),
    r(h("div.signin.glass", {},
      other && h("p.hint.bad", { text: `You’re signed in here as @${S.me.handle}. This link is for a different account: only carry on if it’s yours.` }),
      h("form.form", { onsubmit: (e) => { e.preventDefault(); e.currentTarget.parentNode.querySelector(".btn")?.click(); } },
        h("input.vh", { type: "email", autocomplete: "username", value: info.email, tabindex: "-1", "aria-hidden": "true", readonly: true }),
        pwField("New password", pw), meter, hint),
      h("p.hint", { text: `${canKeep ? "Use your passkey to keep your Chat messages readable. Starting fresh" : "This"} makes a new key: your friends stay, but older messages can’t be opened, and friends see that your key changed. Every device is signed out, and your passkeys are removed: add one again once you’re in.` }),
      canKeep && h("button.btn", { type: "button", onclick: act("keep") }, icon("passkey", 20, 2), "Keep messages with passkey"),
      h("button.btn" + (canKeep ? ".quiet" : ""), { type: "button", onclick: act("fresh") }, canKeep ? "Start fresh instead" : "Set new password"),
      S.me?.signedIn && h("button.link", { type: "button", onclick: () => anew(() => { S.reset = null; S.settled = false; render(); }) }, "Cancel"),
      said))),
  ];
}
// → { m: the account, signed in; prf, id: the passkey's PRF secret and id, for Chat (where it sent you here: what
// opens the passkey's own copy of its key, if it has one) }. (only: the one passkey to ask for, yours, remembered here)
async function signInWithPasskey(only) {
  const o = await post("signin/options"), inflight = S.signFor?.app === "inflight";
  let a;
  try { a = await passkeyAsk({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
    allowCredentials: only ? [{ type: "public-key", id: fromB64url(only) }] : undefined,
    extensions: inflight ? { prf: { eval: { first: await E2E.prfSalt() } } } : undefined } }); }
  catch (e) { throw new Error(e?.name === "NotAllowedError" ? "No passkey was used." : "Your passkey couldn’t be used here."); }
  if (!a) throw new Error("No passkey was used.");
  return passkeySignedIn(o, a);
}
async function passkeySignedIn(o, a) {
  const m = await post("signin/passkey", { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
    authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature), app: S.signFor?.app });
  return { m, prf: S.signFor?.app === "inflight" ? prfOf(a) : null, id: a.id };
}
// Signed in, with a passkey (get: asked for, or picked from the keyboard) or a password: who it was kept here, then back to
// the app that sent you, or this page as yours
async function withPasskey(btn, said, get) {
  try {
    const { m, prf, id } = await working(btn, "Waiting for your passkey", get);
    remember(m, "passkey", id);
    if (S.signFor && !m.deleting) return handBack(m, { prf, id }, btn);
    if (!m.deleting) { dawnBreak(true); await ticked(btn); }
    welcome(m);
  } catch (err) { say(said, err.message); }
}
async function withPassword(email, emailIn, pw, go, said) {
  say(said, "");
  if (!email) return say(said, "Enter your email.", emailIn);
  if (!pw.value) return say(said, "Enter your password.", pw);
  try {
    let k;
    const m = await working(go, "Signing in", async () => {
      const { salt } = await post("signin/salt", { email });
      k = await E2E.fromPassword(pw.value, salt);
      const m = await post("signin/password", { email, proof: k.proof, app: S.signFor?.app });
      // (an account from before Argon2id: stretched the new way, now the password's here)
      const nk = !m.deleting && !E2E.isCurrent(salt) && await restretch(pw.value, k);
      if (nk) { k = nk; m.salt = nk.salt; }
      return m;
    });
    remember(m, "password");
    if (S.signFor && !m.deleting) return (await offerFits(m)) ? offerThen(m, k, go.closest(".signin")) : handBack(m, { lock: k.lock }, go);
    if (!m.deleting) { dawnBreak(true); await ticked(go); }
    welcome(m);
    if (!m.deleting) { checkQuietly(pw.value, k.proof); maybeNudge(m); }
  } catch (err) { say(said, err.message, err.field === "email" ? emailIn : pw); }
}
// Who signed in here last (in this browser only): their name, handle and email, and how (with a passkey: which), so that
// coming back is a tap. Forgotten with Not you?
const LAST = "acct:last";
function lastHere() { try { const l = JSON.parse(localStorage.getItem(LAST) || "null"); return l?.email && l.name ? l : null; } catch (_) { return null; } }
function remember(m, way, id) {
  try { localStorage.setItem(LAST, JSON.stringify({ name: m.name, handle: m.handle, email: m.email, way, id: way === "passkey" ? id : undefined })); } catch (_) {}
}
function forget() { try { localStorage.removeItem(LAST); } catch (_) {} }
// Signed in with a password, for an app, on a device that can make a passkey, with none yet: one offered before going
// back, once a month at most (with a nudge here, the same month); for Chat with its own copy of the key, made now
// the password's here to open it
async function offerFits(m) {
  if (!passkeysWork() || m.passkeys?.length || m.deleting) return false;
  try { if (Date.now() - Number(localStorage.getItem("acct:nudged") || 0) < 30 * 86400e3) return false; } catch (_) {}
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (_) { return false; }
}
function offerThen(m, k, card) {
  try { localStorage.setItem("acct:nudged", String(Date.now())); } catch (_) {}
  const said = h("p.said", { role: "alert" }), inflight = S.signFor?.app === "inflight";
  const yes = h("button.btn", { type: "button", onclick: async () => {
    try {
      let made;
      await working(yes, "Waiting for your device", async () => {
        made = await addPasskey();
        if (made.secret) {
          const { vault } = await post("password/vault", { proof: k.proof });
          S.me = await post("passkeys/vault", { id: made.id, vault: await E2E.lock(await E2E.fromSecret(made.secret), await E2E.unlock(k.lockKey, vault)) });
        }
      });
      remember(S.me?.signedIn ? S.me : m, "passkey", made.id);
      handBack(S.me?.signedIn ? S.me : m, { lock: k.lock }, yes);
    } catch (e) { say(said, e.message); }
  } }, icon("face", 21, 1.9), "Add a passkey");
  const no = h("button.link", { type: "button", onclick: () => handBack(m, { lock: k.lock }, no) }, "Not now");
  cardTo(card, h("div.signin.glass.offer", {},
    h("div.offer-art", { "aria-hidden": "true" }, icon("face", 40, 1.6)),
    h("h2", { text: "Next time, just a glance" }),
    h("p", { text: `A passkey signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site${inflight ? ", and opens your Chat messages too" : ""}.` }),
    yes, no, said));
}
// (next: a sheet to open straight away, over the page there already rather than rising under it)
async function welcome(m, word, next) {
  S.me = m; S.pulled = Date.now(); stopAutofill();
  await anew(() => {
    S.settled = !!next;
    if (m.prefs) theme(m.prefs.appearance);
    render(); scrollTo(0, 0);
    if (next) openSheet(next);
    toast(word || `Welcome back, ${String(m.name).trim().split(/\s+/)[0]}.`, false, word ? 4000 : 2800);
  });
}
// Signed in with a password, no passkey yet, on a device that can make one (Face ID, Touch ID, Windows Hello…): a word
// about one, once a month at most
async function maybeNudge(m) {
  if (!passkeysWork() || m.passkeys?.length) return;
  try { if (Date.now() - Number(localStorage.getItem("acct:nudged") || 0) < 30 * 86400e3) return; } catch (_) {}
  let can = false;
  try { can = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (_) {}
  if (!can) return;
  // (once the page has settled in after signing in, so it doesn't come up as everything else is moving)
  afterRise(() => {
    if (sheetEl.open || !S.me?.signedIn || S.me.passkeys.length) return;
    try { localStorage.setItem("acct:nudged", String(Date.now())); } catch (_) {}
    openSheet(nudgeView);
  }, 1500);
}
function nudgeView() {
  const add = h("button.btn", { type: "button", onclick: async () => {
    try {
      const made = await freshly(() => busy(add, "Waiting for your device…", addPasskey)); patch();
      if (made?.secret) { await swapped(); openSheet(() => keyCopyView(made.id, made.secret, "Passkey added.")); }
      else { closeSheet(); toast("Passkey added."); }
    }
    catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
  } }, icon("face", 21, 1.9), "Add a passkey");
  return { title: "Add a passkey", quiet: true, right: h("button.x", { type: "button", "aria-label": "Not now", onclick: closeSheet }, icon("x", 17, 2.6)), body: [
    h("div.nudge", {}, h("div.nudge-art", { "aria-hidden": "true" }, icon("face", 56, 1.5)),
      h("h3", { text: "Sign in faster next time" }),
      h("p", { text: "A passkey signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site. Nothing to type, and nothing for anyone to steal." })),
    add, h("button.btn.quiet", { type: "button", onclick: closeSheet }, "Not now"), h("p.said", { role: "alert" })] };
}
// The password just typed, checked against data breaches (only 5 characters of its hash asked), and how it went kept
// with the account (with its proof), for the check-up (no answer: nothing kept)
async function checkQuietly(pw, proof) {
  try { const n = await leakedCount(pw); if (n === null) return; S.me = await post("password/checked", { proof, leaked: n > 0 }); patch(); } catch (_) {}
}
async function signOut(btn) {
  try { await busy(btn, "Signing out…", () => post("signout")); }
  catch (e) { if (!e.offline) return toast(e.message, true); }
  S.me = { signedIn: false };
  duskFall();
  anew(() => { S.settled = false; render(); scrollTo(0, 0); toast("Signed out."); });
}

// ---- small things ----
function field(label, input) { return h("label.field", {}, h("span", { text: label }), input); }
// A password field: an eye, to see what's been typed (struck through while it shows), and a word under it while Caps
// Lock is on, before a password typed in capitals is found to be wrong
function pwField(label, input) {
  const eye = h("button.eye", { type: "button", "aria-label": "Show password", "aria-pressed": "false",
    onpointerdown: (e) => e.preventDefault(),        // (the field keeps the focus, and the keyboard stays up)
    onclick: () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password"; eye.classList.toggle("on", show);
      eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); eye.setAttribute("aria-pressed", String(show));
    } }, icon("eye", 22, 1.9));
  const caps = h("p.caps", { role: "status", hidden: true }, icon("caps", 16, 2), "Caps Lock is on");
  const shown = (on) => {
    if (caps.hidden === !on) return;
    const change = () => { caps.hidden = !on; }, box = !caps.closest("#sheet") && caps.closest(".signin");
    if (box) morph(box, change, false); else change();
    if (on) caps.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-fast"), easing: tok("--ease-out") });
  };
  const sense = (e) => { if (e.getModifierState) shown(e.getModifierState("CapsLock")); };
  input.addEventListener("keydown", sense); input.addEventListener("keyup", sense);
  input.addEventListener("blur", () => shown(false));
  return h("div.pwf", {}, h("label.field", {}, h("span", { text: label }), h("div.pw", {}, input, eye)), caps);
}
// (what went wrong fades in with a shake, or just fades with Reduce Motion; in a card on the page the card goes to its
// new size as it's said or cleared, the line under it with it; a sheet does that by itself, fitting what's in it)
function say(el, text, input) {
  if (!el) return;
  const change = () => { el.textContent = text; el.classList.toggle("bad", !!text); }, box = text !== el.textContent && !el.closest("#sheet") && el.closest(".signin");
  if (box) morph(box, change, false); else change();
  if (text) shake(el);
  if (input) input.focus();
}
function shake(el) {
  el.animate(still.matches ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ opacity: 0, transform: "translateX(0)" }, { opacity: 1, transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
    { duration: still.matches ? ms("--dur-fast") : 380, easing: tok("--ease-out") });
}
// (a button busy: as wide as it was, so what's beside it stays put, and what it says now faded in; the focus back on
// it after, if it had it, as being held loses it)
async function busy(btn, label, fn) {
  const kids = [...btn.childNodes], was = btn.disabled, wide = btn.style.minWidth, had = document.activeElement === btn;
  btn.style.minWidth = `${btn.offsetWidth}px`;
  btn.disabled = true; btn.replaceChildren(h("span.spin"), h("span", { text: label }));
  for (const k of btn.children) k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-fast"), easing: tok("--ease-out") });
  try { return await fn(); }
  finally {
    btn.disabled = was; btn.replaceChildren(...kids); btn.style.minWidth = wide;
    if (had && btn.isConnected && (!document.activeElement || document.activeElement === document.body)) btn.focus({ preventScroll: true });
  }
}
// A sign-in's button while it works: drawn in to a circle, turning (what it's doing said to a screen reader); and, once
// it's done (ticked), a tick drawn in it, in green. As it was, if it fails. (No drawing in, with Reduce Motion: the circle.)
async function working(btn, label, fn) {
  const kids = [...btn.childNodes];
  btn.style.width = `${btn.offsetWidth}px`; void btn.offsetWidth;
  btn.disabled = true; btn.classList.add("working"); btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-label", label);
  btn.replaceChildren(h("span.spin"));
  btn.firstChild.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: ms("--dur-fast"), easing: tok("--ease-out") });
  try { return await fn(); }
  catch (e) { if (btn.isConnected) unwork(btn, kids); throw e; }
}
function unwork(btn, kids) {
  btn.classList.remove("working", "done"); btn.removeAttribute("aria-busy"); btn.removeAttribute("aria-label");
  btn.replaceChildren(...kids); btn.disabled = false;
  const clear = () => { btn.style.width = ""; };
  if (still.matches) clear(); else { btn.addEventListener("transitionend", clear, { once: true }); setTimeout(clear, ms("--dur-base") + 120); }
}
const pause = (t) => new Promise((r) => setTimeout(r, t));
async function ticked(btn) {
  const t = icon("check", 26, 2.8); t.classList.add("tick");
  btn.classList.add("done"); btn.replaceChildren(t);
  if (!still.matches) btn.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 460, easing: tok("--ease-spring") });
  await pause(still.matches ? 160 : 260);
}
// Dawn over the sky, as you're signed in: in, as the page hands you on; or in and away again (passing), staying here
function dawnBreak(passing, dur = 1100) {
  const d = $(".sky .dawn"); if (!d) return;
  $(".sky").classList.add("lit");
  d.getAnimations().forEach((a) => a.cancel());
  d.animate(passing ? [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
    { duration: still.matches ? 400 : passing ? 2600 : dur, easing: tok("--ease-out"), fill: passing ? "none" : "forwards" })
    .finished.then(() => { if (passing) $(".sky").classList.remove("lit"); }).catch(() => {});
}
function duskFall() {
  const d = $(".sky .dusk"); if (!d) return;
  $(".sky").classList.add("dim");
  d.getAnimations().forEach((a) => a.cancel());
  d.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: still.matches ? 400 : 2400, easing: tok("--ease-out") })
    .finished.then(() => $(".sky").classList.remove("dim")).catch(() => {});
}
// Leaving for the app, signed in: the tick lifts out of the page as the page lets go, to where the app takes over (the
// middle, a third of the way down), turning into you (your photo, or your initial) on the way, as dawn breaks over the
// sky and its drifting lights go, leaving just what the app opens on: the sky, its dawn and you. One movement, with
// nothing held. (With Reduce Motion: there, without the journey.) → you, as you're left there (for the app's picture)
async function leaving(btn, m) {
  dawnBreak(false, 700);
  if (btn?.isConnected && btn.classList.contains("working")) await ticked(btn);
  const r = btn?.isConnected ? btn.getBoundingClientRect() : { left: innerWidth / 2 - 26, top: innerHeight / 2 - 26, width: 52, height: 52 };
  const face = h("span.face", {}, initialOf(m));
  if (m.photoAt) face.append(h("img", { src: `${API}/me/photo?v=${m.photoAt}`, alt: "" }));
  const me = h("div.leave", { "aria-hidden": "true" }, icon("check", 26, 2.8), face);
  const x = r.left + r.width / 2, y = r.top + r.height / 2, tx = innerWidth / 2 - x, ty = innerHeight * 0.3 - y;
  me.style.left = `${x}px`; me.style.top = `${y}px`;
  document.body.append(me);
  if (btn?.isConnected) btn.style.visibility = "hidden";
  const page = $("main"), ease = tok("--ease-out"), glide = tok("--ease-glide");
  for (const a of document.querySelectorAll(".sky .aura")) a.animate([{ opacity: getComputedStyle(a).opacity }, { opacity: 0 }], { duration: still.matches ? 300 : 560, easing: ease, fill: "forwards" });
  if (still.matches) {
    me.style.transform = `translate(${tx}px, ${ty}px) scale(1.5)`; face.style.opacity = "1"; me.firstChild.style.opacity = "0";
    await page.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: ease, fill: "forwards" }).finished.catch(() => {});
    return face;
  }
  page.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 380, easing: ease, fill: "forwards" });
  const move = me.animate([{ transform: "none" }, { transform: `translate(${tx}px, ${ty}px) scale(1.5)` }], { duration: 560, easing: glide, fill: "forwards" });
  await pause(200);
  me.firstChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: ease, fill: "forwards" });
  face.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: tok("--ease-spring"), fill: "forwards" });
  await move.finished.catch(() => {});
  await pause(80);
  return face;
}
const initialOf = (m) => [...String(m.name || m.handle || "?").trim()][0]?.toUpperCase() || "?";
// Who's coming, for the app to draw from its very first frame: the initial and, if your photo's here, a small copy of
// it (only ever in the address's #, which goes to no server, and taken out of it at once). So the picture this page
// ends on carries straight on, rather than going and coming back once the app has the sign-in.
function faceHint(m, face) {
  const q = new URLSearchParams({ f: initialOf(m) }), img = face?.querySelector("img");
  try {
    if (img?.complete && img.naturalWidth) {
      const c = document.createElement("canvas"), s = Math.min(img.naturalWidth, img.naturalHeight);
      c.width = c.height = 156;
      c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 156, 156);
      q.set("p", c.toDataURL("image/jpeg", 0.72).split(",")[1].replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    }
  } catch (_) {}
  return `&${q}`;
}
// What's in a box changed, the box going smoothly from its size to its new one (what's under it moving with it) as
// what's new fades in (fade: all of what's in it); from where it is, if it was already on its way. Just the fade with
// Reduce Motion.
function morph(box, change, fade = true) {
  const run = box.getAnimations().find((a) => a.id === "morph"), from = box.offsetHeight;
  run?.cancel();
  change();
  if (fade) for (const k of box.children) k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(still.matches ? "--dur-fast" : "--dur-base"), easing: tok("--ease-out") });
  const to = box.offsetHeight;
  if (still.matches || !box.isConnected || Math.abs(to - from) < 2) return;
  box.style.overflow = "hidden";
  const a = box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ms("--dur-base"), easing: tok("--ease-glide") });
  a.id = "morph"; a.onfinish = a.oncancel = () => { box.style.overflow = ""; };
}
let toastT = 0, toastAt = 0;
function toast(text, bad, ms = bad ? 5000 : 2800) {     // (something gone wrong stays long enough to read)
  const top = !!toastEl.showPopover, showing = toastEl.classList.contains("on");
  toastEl.replaceChildren(bad ? icon("x", 18, 2.4) : icon("check", 18, 2.4), h("span", { text }));
  toastEl.classList.toggle("bad", !!bad);
  // (a new word over one still showing fades in, rather than taking its place in a frame)
  if (showing) for (const k of toastEl.children) k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: tok("--ease-out") });
  // (clear of the way back to the app at the top of the page, where there's one in sight)
  const back = $("main .ifh .backapp")?.getBoundingClientRect();
  if (back && back.bottom > 0 && back.top < 120) toastEl.style.setProperty("--below", `${Math.round(back.bottom + 8)}px`); else toastEl.style.removeProperty("--below");
  // (above an open sheet too: the top layer)
  if (top && !toastEl.matches(":popover-open")) { toastEl.showPopover(); void toastEl.offsetWidth; }
  toastEl.classList.add("on"); toastAt = Date.now();
  // (a sheet that's up is modal, so the toast, outside it, is seen but never read out: said in the sheet as well, on the
  // next frame, so the same words again are said again)
  const at = toastAt, heard = sheetEl.open && !sheetEl.classList.contains("closing") && $("#sheet-say", sheetEl);
  if (heard) { heard.textContent = ""; requestAnimationFrame(() => { heard.textContent = text; }); }
  // (a sheet on its way out is still modal, so the toast is too: said again once it's gone, the same words put back)
  else if (sheetEl.classList.contains("closing")) Sheet.closed?.then(() => {
    const s = toastAt === at && toastEl.classList.contains("on") && toastEl.querySelector("span");
    if (s) s.replaceWith(h("span", { text: s.textContent }));
  });
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.classList.remove("on"); $("#sheet-say", sheetEl)?.replaceChildren(); toastT = setTimeout(() => top && toastEl.matches(":popover-open") && toastEl.hidePopover(), 600); }, ms);
}
// (a sheet opened since: the word put back above it, dropping in again if it had only just started to)
function toastOnTop() {
  if (!toastEl.matches?.(":popover-open") || !toastEl.classList.contains("on")) return;
  toastEl.hidePopover(); toastEl.showPopover();
  if (Date.now() - toastAt > 400) return;
  toastEl.style.transition = "none"; toastEl.classList.remove("on"); void toastEl.offsetWidth;
  toastEl.style.transition = ""; toastEl.classList.add("on");
}
if (toastEl.showPopover) toastEl.popover = "manual";
// a button that asks once more before it acts ("Remove" → "Remove?"), going back after a moment
function twice(label, sure, act, spec = "button.mini") {
  let t = 0;
  // (its colour eases over, and its width to the new word's, rather than both changing in a frame)
  const word = (text, on) => {
    const w = b.offsetWidth; b.classList.toggle("sure", on); b.textContent = text;
    if (!still.matches && b.offsetWidth !== w) b.animate([{ width: `${w}px` }, { width: `${b.offsetWidth}px` }], { duration: ms("--dur-fast"), easing: tok("--ease-out") });
  };
  const b = h(spec, { type: "button", onclick: () => {
    if (!b.classList.contains("sure")) { word(sure, true); clearTimeout(t); t = setTimeout(() => word(label, false), 3500); return; }
    clearTimeout(t); act(b);
  } }, label);
  return b;
}
// A row that slides left to show what it does (sign out, remove), as a list does on a phone; the button's there
// for a keyboard too. One open at a time: another touched, or the sheet scrolled, and it shuts (slid).
let slid = null;
sheetEl.addEventListener("scroll", () => slid?.(), true);
function swipeable(row, label, act) {
  const btn = h("button.swipe-act", { type: "button", tabindex: "-1", onclick: (e) => act(e.currentTarget) }, label);
  const box = h("div.swipe", {}, btn, row), W = 92;
  let down = false, x0 = 0, y0 = 0, dx = 0, open = false, way = null;
  const slide = (x, held) => { box.classList.toggle("dragging", held); box.style.setProperty("--dx", `${x}px`); };
  const shut = () => { open = false; slide(0, false); box.classList.remove("open"); if (slid === shut) slid = null; };
  row.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; if (slid !== shut) slid?.(); down = true; x0 = e.clientX; y0 = e.clientY; way = null; });
  row.addEventListener("pointermove", (e) => {
    if (!down) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    // (sideways or not, decided by the first few pixels: up and down scrolls the sheet as ever)
    if (!way && Math.abs(mx) + Math.abs(my) > 8) way = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    if (way !== "x") return;
    dx = Math.max(-W * 1.6, Math.min(0, (open ? -W : 0) + mx)); slide(dx, true);
  });
  const up = () => {
    if (down && way === "x") { open = dx < -W / 2; slide(open ? -W : 0, false); box.classList.toggle("open", open); if (open) slid = shut; else if (slid === shut) slid = null; }
    down = false; way = null;
  };
  row.addEventListener("pointerup", up); row.addEventListener("pointercancel", up);
  // (a tap on a row that's open closes it, rather than doing what the row does)
  row.addEventListener("click", (e) => { if (open) { e.preventDefault(); e.stopImmediatePropagation(); shut(); } }, true);
  return box;
}
// (a row going: signed out, removed)
const leave = (el) => fold(el);

// ---- sheets: one dialog, each view drawn into it; the page steps back while it's up ----
// Each sheet, and each one gone on to inside it, is a step in the browser's history too, so the phone's back swipe (or
// a computer's Back) closes it, or goes back a step in it, rather than leaving the page. (Sheet.hist: the steps added.)
const Sheet = { stack: [], cancel: null, ask: null, from: null, hist: 0 };
let histSkip = 0;
function histPush() { try { history.pushState({ sheet: Sheet.hist + 1 }, ""); Sheet.hist++; } catch (_) {} }
function histDrop(n) { n = Math.min(n, Sheet.hist); if (n > 0) { Sheet.hist -= n; histSkip++; history.go(-n); } }
addEventListener("popstate", () => {
  if (histSkip) { histSkip--; return; }                 // (ours, from a sheet closed here)
  if (!sheetEl.open || !Sheet.hist) return;
  Sheet.hist--; stepBack();
});
function openSheet(view) {
  if (sheetEl.classList.contains("closing")) Sheet.shut?.();      // (opened again as one goes: that one's gone at once)
  // (one opened over another: on to it, as from one sheet to the next)
  if (sheetEl.open) { Sheet.ask?.no(); Sheet.stack = [view]; draw("push"); histDrop(Sheet.hist - 1); return; }
  Sheet.stack = [view]; draw();
  // (the sheet itself takes the focus, not a field in it, so a phone's keyboard doesn't jump up before you ask for it,
  // nor a button, with a ring round it; the row it was opened from has it back when it closes)
  Sheet.from = document.activeElement?.closest?.("[data-k]")?.dataset.k || null; Sheet.at = performance.now();
  $("#page").style.setProperty("--sy", `${scrollY}px`);       // (the page steps back where it's scrolled to)
  sheetEl.showModal(); sheetEl.focus({ preventScroll: true }); document.body.classList.add("sheet-up"); histPush();
  toastOnTop();
}
sheetEl.tabIndex = -1;
function pushSheet(view) { Sheet.ask?.no(); Sheet.stack.push(view); draw("push"); histPush(); }
function popSheet() { if (Sheet.hist > 1) histDrop(1); stepBack(); }
function stepBack() { Sheet.ask?.no(); Sheet.stack.pop(); if (Sheet.stack.length) draw("back"); else closeSheet(); }
const redraw = () => sheetEl.open && Sheet.stack.length && !sheetEl.classList.contains("closing") && draw("same");
// The view on top, drawn into the sheet. mode: "push" (on to it) or "back" (back to it), the one that was there sliding
// away under it as it comes in from the side it's coming from; "same", the view that's there drawn again with what's
// new, in place (where it was scrolled to, and what had the focus, kept, and its coming in carrying on); or none, a
// sheet just opened. (What a view's drawn for, so it can tell: Sheet.mode, and Sheet.waited, after a spinner.) The
// sheet fits its new height by itself: below.
function draw(mode) {
  const body0 = $(".sheet-body:not(.going)", sheetEl), head0 = $(".sheet-head:not(.going)", sheetEl);
  Sheet.mode = mode; Sheet.waited = !!body0?.querySelector(".adm-wait, [aria-busy='true']");
  const v = Sheet.stack.at(-1)(), deep = Sheet.stack.length > 1;
  const left = v.left || (deep ? h("button.link.back", { type: "button", onclick: () => (v.onBack || popSheet)() }, h("span.vh", { text: "Back" }), icon("back", 22, 2.4)) : null);
  const right = v.right || h("button.x", { type: "button", "aria-label": "Close", onclick: closeSheet }, icon("x", 17, 2.6));
  if (mode === "same" && body0 && head0) return again(v, left, right, body0, head0);
  const head = h("div.sheet-head", {}, h("div.l", {}, left), h(v.quiet ? "h2.vh" : "h2", { id: "sheet-title", text: v.title, tabindex: "-1" }), h("div.r", {}, right));
  const body = h("div.sheet-body", {}, ...v.body);
  // (still waiting for what it shows: as tall as the one before meanwhile, so the sheet fits just once, to what comes)
  if (body0 && body.querySelector(".adm-wait, [aria-busy='true']")) body.style.minHeight = `${body0.offsetHeight}px`;
  body.classList.add("arriving"); setTimeout(() => body.classList.remove("arriving"), 250);
  const swap = (mode === "push" || mode === "back") && body0 && head0;
  // (with somewhere in it for a toast to be read out: toast())
  if (!swap) sheetEl.replaceChildren(h("div.grab", { "aria-hidden": "true" }), head, body, h("p.vh", { id: "sheet-say", role: "status" }));
  else if (still.matches) { head.classList.add("swap"); body.classList.add("swap"); head0.replaceWith(head); body0.replaceWith(body); }
  else {
    const going = [head0, body0].map((el) => ({ el, y: el.offsetTop, h: el.offsetHeight, cs: getComputedStyle(el) })).map((g) => ({ ...g, o: g.cs.opacity, tf: g.cs.transform }));
    head.classList.add("swap", mode); body.classList.add("swap", mode);
    head0.before(head); body0.before(body);
    for (const { el, y, h: ht, o, tf } of going) {
      // (the one before, kept a moment where it was, sliding away from however far it had come in)
      for (const [k, x] of [["--y", `${y}px`], ["--h", `${ht}px`], ["--o", o], ["--tf", tf]]) el.style.setProperty(k, x);
      el.querySelector("#sheet-title")?.removeAttribute("id");
      el.classList.remove("swap", "push", "back"); el.classList.add("going", mode); el.inert = true;
      el.addEventListener("animationend", (e) => { if (e.target === el) el.remove(); });
      setTimeout(() => el.remove(), 600);
    }
  }
  // (on to another sheet, or back: the new one's title has the focus, so it's read out, and you're not left nowhere)
  if (swap) $("#sheet-title", sheetEl)?.focus({ preventScroll: true });
}
// The view drawn again in place: its title, its buttons (each drawn afresh, for what they do now) and what's in it, in
// the same sheet; where it was scrolled to and what had the focus kept; what's come in place of a spinner faded in, and
// anything new in a list growing in where it goes
function again(v, left, right, body, head) {
  const active = sheetEl.contains(document.activeElement) ? document.activeElement : null, key = keyOf(active), top = body.scrollTop;
  const sel = active?.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const had = new Set([...body.querySelectorAll("[data-id]")].map((x) => x.dataset.id));
  const t = $("#sheet-title", head); t.textContent = v.title; t.classList.toggle("vh", !!v.quiet);
  $(".l", head).replaceChildren(...[left].filter(Boolean)); $(".r", head).replaceChildren(right);
  body.replaceChildren(...v.body.flat(Infinity).filter((x) => x != null && x !== false && x !== ""));
  if (Sheet.ask) { body.classList.add("asking"); askAt(body); }
  body.style.minHeight = "";
  body.scrollTop = top;
  if (key && !sheetEl.contains(document.activeElement)) refocus(sheetEl, key, sel);
  if (Sheet.waited) for (const k of body.children) k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: tok("--ease-out") });
  else for (const el of body.querySelectorAll("[data-id]")) if (!had.has(el.dataset.id)) grow(el);
}
// something new in a list: it opens up room for itself as it fades in (just fades, with Reduce Motion)
function grow(el) {
  if (still.matches) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-fast") });
  const cs = getComputedStyle(el), full = { height: `${el.offsetHeight}px`, minHeight: least(cs), paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 };
  el.style.overflow = "hidden";
  el.animate([{ height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 }, full], { duration: ms("--dur-base"), easing: tok("--ease-glide") })
    .finished.then(() => { el.style.overflow = ""; }, () => {});
}
// (once the sheet's done swapping, if it is, so one swap doesn't break into the next)
const swapped = () => Promise.all(($(".sheet-body:not(.going)", sheetEl)?.getAnimations() || []).map((a) => a.finished.catch(() => {})));
// (done once it's gone: Sheet.closed, for what waits on that)
function closeSheet() {
  if (!sheetEl.open) return Promise.resolve();
  if (sheetEl.classList.contains("closing")) return Sheet.closed;
  const cancel = Sheet.cancel, from = Sheet.from; Sheet.cancel = null; Sheet.from = null;
  histDrop(Sheet.hist);
  // (going from wherever it is, still on its way up or where a finger let it go, the dim from as dark as it had got)
  const cs = getComputedStyle(sheetEl);
  let dim = 1; try { dim = parseFloat(getComputedStyle(sheetEl, "::backdrop").opacity); } catch (_) {}
  sheetEl.style.setProperty("--from-tf", cs.transform); sheetEl.style.setProperty("--from-o", cs.opacity); sheetEl.style.setProperty("--dim-o", Number.isFinite(dim) ? dim : 1);
  document.body.classList.remove("sheet-up");
  let gone;
  Sheet.closed = new Promise((ok) => { gone = ok; });
  const done = () => {
    clearTimeout(t); sheetEl.removeEventListener("animationend", end); Sheet.shut = null;
    sheetEl.classList.remove("closing");
    for (const p of ["--from-tf", "--from-o", "--dim-o", "transform", "opacity"]) sheetEl.style.removeProperty(p);
    sheetEl.close(); sheetEl.replaceChildren(); Sheet.stack = []; Sheet.ck = null; cancel?.();
    // (the page may have been drawn again meanwhile: the row it was opened from, found again by what it says)
    const back = from && [...main.querySelectorAll("[data-k]")].find((el) => el.dataset.k === from);
    if (back && (document.activeElement === document.body || !document.activeElement)) back.focus({ preventScroll: true });
    gone();
  };
  const end = (e) => { if (e.target === sheetEl && !e.pseudoElement) done(); };
  // (in case it never says it's ended: no longer than it takes, or a quick fade with Reduce Motion)
  const t = setTimeout(done, still.matches ? 300 : 700);
  Sheet.shut = done;
  sheetEl.classList.add("closing");
  sheetEl.addEventListener("animationend", end);
  return Sheet.closed;
}
sheetEl.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
// A tap on the dim closes it: only one that began there (a press on its title, carried off it, isn't one), and not the
// second tap of a double tap that opened it
{
  let downOut = false;
  const outside = (e) => { const b = sheetEl.getBoundingClientRect(); return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom; };
  sheetEl.addEventListener("pointerdown", (e) => { downOut = e.target === sheetEl && outside(e); }, true);
  sheetEl.addEventListener("click", (e) => {
    if (e.target !== sheetEl || !downOut || !outside(e) || performance.now() - (Sheet.at || 0) < 450) return;
    closeSheet();
  });
}
// the page behind holds still while it's up: a finger (or a wheel) on the dim, or on what in the sheet doesn't scroll,
// moves nothing (done here, not by stopping the page scrolling, which has iOS Safari put the sheet in the wrong place)
{
  let free = false;
  sheetEl.addEventListener("touchstart", (e) => { free = e.touches.length > 1 || scrollsIn(e.target, sheetEl); }, { passive: true });
  sheetEl.addEventListener("touchmove", (e) => { if (!free && e.cancelable) e.preventDefault(); }, { passive: false });
  sheetEl.addEventListener("wheel", (e) => { if (!scrollsIn(e.target, sheetEl) && e.cancelable) e.preventDefault(); }, { passive: false });
}
// (whether what's under a finger, inside a sheet, would scroll: a list longer than it is, a row wider; or a field,
// which has its own)
function scrollsIn(el, top) {
  if (el.closest?.("input, select, textarea, [contenteditable]")) return true;
  for (; el && el !== top; el = el.parentElement) {
    const y = el.scrollHeight > el.clientHeight + 1, x = el.scrollWidth > el.clientWidth + 1;
    if (!y && !x) continue;
    const s = getComputedStyle(el);
    if ((y && /auto|scroll/.test(s.overflowY)) || (x && /auto|scroll/.test(s.overflowX))) return true;
  }
  return false;
}
// swiping it down, by its top (caught still on its way up, it's held there, where it is, not sent back to start again)
{
  let y0 = null, dy = 0, t0 = 0, at = "";
  sheetEl.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".grab, .sheet-head") || e.target.closest("button, input, a")) return;
    const rising = sheetEl.getAnimations().find((a) => a.animationName === "sheet-in");
    at = "";
    if (rising) { const cs = getComputedStyle(sheetEl); at = cs.transform === "none" ? "" : cs.transform; sheetEl.style.opacity = cs.opacity; rising.cancel(); sheetEl.style.transform = at; }
    y0 = e.clientY; t0 = e.timeStamp; dy = 0;
    sheetEl.setPointerCapture(e.pointerId); sheetEl.classList.add("dragging");
  });
  sheetEl.addEventListener("pointermove", (e) => {
    if (y0 == null) return;
    const d = e.clientY - y0; dy = d > 0 ? d : d / 6;
    sheetEl.style.transform = `translateY(${dy}px) ${at}`;
  });
  const up = (e) => {
    if (y0 == null) return;
    y0 = null; sheetEl.classList.remove("dragging");
    const fast = dy / Math.max(1, e.timeStamp - t0) > 0.55;
    // (let go far enough, or flicked: it goes from there; else back up into place from there)
    if (dy > 110 || (fast && dy > 30)) return closeSheet();
    const from = getComputedStyle(sheetEl), tf = from.transform, o = from.opacity;
    sheetEl.style.transform = ""; sheetEl.style.opacity = "";
    if (tf !== "none" || o !== "1") sheetEl.animate([{ transform: tf, opacity: o }, { transform: "none", opacity: 1 }], { duration: ms("--dur-release"), easing: tok("--ease-glide") });
  };
  sheetEl.addEventListener("pointerup", up);
  sheetEl.addEventListener("pointercancel", up);
}
// A sheet fits what's in it as that changes (on to another view, back, something arriving or changing in it), going
// smoothly from the height it's at, even partway to another, to its new one; in a frame with Reduce Motion. (Its
// height, as layout, for that moment: cheap enough on the one sheet. What's in it doesn't scroll meanwhile.)
{
  let shown = 0;
  new ResizeObserver(([e]) => { shown = e.borderBoxSize?.[0]?.blockSize ?? sheetEl.offsetHeight; }).observe(sheetEl);
  const fit = (start, more = 1) => {
    if (!sheetEl.open || !shown || sheetEl.matches(".closing, .dragging")) return;
    const run = sheetEl.getAnimations().find((a) => a.id === "fit"), from = start ?? (run ? sheetEl.offsetHeight : shown);
    run?.cancel();
    const to = sheetEl.offsetHeight;
    if (still.matches || Math.abs(to - from) < 2) return;
    const body = $(".sheet-body:not(.going)", sheetEl);
    if (body) body.style.overflowY = "hidden";
    const a = sheetEl.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ms("--dur-base"), easing: tok("--ease-glide") });
    a.id = "fit";
    a.oncancel = () => { if (body) body.style.overflowY = ""; };
    // (and on from there, once, should what's in it have changed size meanwhile without anything new in it)
    a.onfinish = () => { if (body) body.style.overflowY = ""; if (more) fit(to, 0); };
  };
  // (not its class, nor style, which change as it fits)
  new MutationObserver(() => fit()).observe(sheetEl, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
}

// ---- showing it's you: for what needs it, asked when it's needed, then on with what you were doing ----
// (here: in the sheet you're in, a card under what you were doing, not a sheet of its own: Admin's changes; the button
// that asked, so the card goes just after what it's in, not at the foot of a long sheet)
async function freshly(act, here) {
  try { return await act(); }
  catch (e) { if (e.status !== 403 || e.field !== "reauth") throw e; }
  await new Promise((ok, no) => {
    const quiet = () => no(Object.assign(new Error(""), { quiet: true }));
    if (here && sheetEl.open) {
      const done = (yes) => {
        const card = Sheet.ask?.card, b = card?.parentElement;
        Sheet.cancel = null; Sheet.ask = null;
        // (the card goes, and what was held back behind it comes back)
        if (b) { b.classList.remove("asking"); for (const k of b.children) if (k !== card) k.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 250, easing: tok("--ease-out") }); }
        if (card) { card.inert = true; card.animate(still.matches ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px) scale(0.98)" }],
          { duration: 150, easing: tok("--ease-in"), fill: "forwards" }).finished.then(() => card.remove(), () => card.remove()); }
        (yes ? ok : quiet)();
      };
      const b = $(".sheet-body:not(.going)", sheetEl);
      let at = here instanceof Element ? here : null;
      while (at && at.parentElement !== b) at = at.parentElement;
      Sheet.ask = { card: confirmCard(() => done(true), () => done(false)), no: () => done(false), at: at ? [...b.children].indexOf(at) : -1 };
      Sheet.cancel = Sheet.ask.no;
      b.classList.add("asking"); askAt(b);
      // (lifted in once, here, so it isn't lifted in again each time the sheet's drawn anew under it)
      Sheet.ask.card.animate(still.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: tok("--ease-out") });
      Sheet.ask.card.scrollIntoView({ block: "nearest", behavior: still.matches ? "auto" : "smooth" });
      return;
    }
    Sheet.cancel = quiet;
    pushSheet(() => confirmView(() => { Sheet.cancel = null; Sheet.stack.pop(); draw("back"); ok(); }, () => { Sheet.cancel = null; Sheet.stack.pop(); draw("back"); quiet(); }));
  });
  return act();
}
// (the card asking it's you, in the sheet: just after what asked for it, where that is in it)
function askAt(b) {
  const after = Sheet.ask.at >= 0 && b.children[Sheet.ask.at];
  if (after && after !== Sheet.ask.card) after.after(Sheet.ask.card); else b.append(Sheet.ask.card);
}
// the ways to show it's you: a passkey, or your password (ok once it's done)
function confirmWays(ok) {
  const m = S.me, said = h("p.said", { role: "alert" }), pk = passkeysWork() && m.passkeys.length > 0;
  const pw = h("input", { type: "password", autocomplete: "current-password", name: "password" });
  const go = h("button.btn" + (pk ? ".quiet" : ""), { type: "submit" }, "Continue");
  const key = pk && h("button.btn", { type: "button", onclick: async (e) => {
    say(said, "");
    try {
      await busy(e.currentTarget, "Waiting for your passkey…", async () => {
        const o = await post("signin/options");
        let a;
        try { a = await passkeyAsk({ publicKey: { challenge: fromB64url(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 120000,
          allowCredentials: m.passkeys.map((p) => ({ type: "public-key", id: fromB64url(p.id) })) } }); }
        catch (_) { throw new Error("No passkey was used."); }
        await post("reauth", { challenge: o.challenge, id: a.id, clientDataJSON: b64url(a.response.clientDataJSON),
          authenticatorData: b64url(a.response.authenticatorData), signature: b64url(a.response.signature) });
      });
      ok();
    } catch (err) { say(said, err.message); }
  } }, icon("face", 21, 1.9), "Use a passkey");
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!pw.value) return say(said, "Enter your password.", pw);
    try {
      let proof;
      await busy(go, "Checking…", async () => { ({ proof } = await E2E.fromPassword(pw.value, m.salt)); return post("reauth", { proof }); });
      ok(); checkQuietly(pw.value, proof);
    }
    catch (err) { say(said, err.message, pw); }
  } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }), pwField("Password", pw), go);
  return { pk, key, form, pw, said };
}
function confirmView(ok, back) {
  const w = confirmWays(ok);
  return { title: "Confirm it’s you", onBack: back, body: [
    h("p", { text: "This needs you to show it’s you again, with a passkey or your password." }),
    w.key, w.pk && h("div.or", { text: "or your password" }), w.form, w.said] };
}
// the same in place: the passkey first, the password if you'd rather
function confirmCard(ok, no) {
  const w = confirmWays(ok);
  w.form.hidden = !!w.pk;
  return h("div.confirm-card", { role: "group", "aria-label": "Confirm it’s you" },
    h("span.face", {}, icon("face", 40, 1.6)), h("b", { text: "Confirm it’s you" }),
    h("span", { text: w.pk ? "A quick check with your passkey first." : "Your password first." }),
    w.key, w.form,
    w.pk && h("button.link", { type: "button", onclick: (e) => { w.form.hidden = false; e.currentTarget.remove(); w.pw.focus(); } }, "Use your password instead"),
    h("button.link", { type: "button", onclick: no }, "Not now"),
    w.said);
}

// ---- your profile ----
function profileView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const name = h("input", { type: "text", value: m.name, autocomplete: "name", maxlength: "50", enterkeyhint: "done" });
  const handle = h("input", { type: "text", value: m.handle, autocomplete: "off", autocapitalize: "none", spellcheck: "false", maxlength: "20", enterkeyhint: "done" });
  const done = h("button.link.done", { type: "button", onclick: save }, "Done");
  async function save() {
    const changes = {};
    if (name.value.trim() !== m.name) changes.name = name.value.trim();
    if (handle.value.trim().replace(/^@/, "").toLowerCase() !== m.handle) changes.handle = handle.value.trim().replace(/^@/, "").toLowerCase();
    if (!Object.keys(changes).length) return justEditing() ? backToApp() : closeSheet();
    try {
      S.me = await busy(done, "Saving…", () => call("me/profile", { method: "PATCH", body: changes }));
      closeSheet(); render(); toast(changes.handle ? `You’re @${S.me.handle} now.` : "Profile saved.");
      if (justEditing()) setTimeout(backToApp, 1100);         // (back to Chat, where it shows already)
    } catch (e) { say(said, e.message, e.field === "handle" ? handle : name); }
  }
  for (const i of [name, handle]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  return { title: "Edit profile",
    left: h("button.link", { type: "button", onclick: () => (justEditing() ? backToApp() : closeSheet()) }, "Cancel"), right: done,
    body: [
      h("div.form", {}, field("Name", name), field("Handle", h("div.at", {}, "@", handle)),
        field("Email", h("input", { type: "email", value: m.email || "", readonly: true, tabindex: "-1" }))),
      said] };
}
// A picture, read (a file, or the poster fetched again)
async function readImage(file) {
  try { return await createImageBitmap(file); }
  catch (_) {
    const url = URL.createObjectURL(file);
    try { return await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }); }
    catch (_) { throw new Error("That picture couldn’t be read. Try another one."); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
// as a JPEG (which leaves out anything else in the file, such as where it was taken)
async function jpeg(c, q) {
  const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
  if (!b) throw new Error("That picture couldn’t be read. Try another one.");
  return b;
}
// the profile photo: the square of it around the point that shows (f, in percent, as the poster places it), at most
// 512 pixels across
async function asAvatar(img, f) {
  const w = img.width, ht = img.height, side = Math.min(w, ht), size = Math.min(512, side), c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, ((w - side) * f[0]) / 100, ((ht - side) * f[1]) / 100, side, side, 0, 0, size, size);
  return jpeg(c, 0.85);
}
// the card's poster: the whole picture, at most 1600 pixels on its longer side (and under 2 MB)
async function asPoster(img) {
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const b = await jpeg(c, 0.84);
  return b.size < 1.9e6 ? b : jpeg(c, 0.7);
}

// ---- your password ----
// Has this password turned up in a data breach? Only the first 5 characters of its SHA-1 are asked (k-anonymity), and
// the answers checked here. No answer (Pwned Passwords not reached, or too many asks from here): null, and nothing's
// said or kept. An answer's kept for the visit (LEAKS, by the hash), so one password's asked about once, not again as
// it's sent and again as it's kept with the account; an ask on its way is shared.
const LEAKS = new Map();
async function leakedCount(pw) {
  let hx;
  try { hx = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase(); }
  catch (_) { return null; }
  if (!LEAKS.has(hx)) {
    const p = (async () => {
      const r = await fetch(`${API}/pwned?p=${hx.slice(0, 5)}`, { cache: "no-store" });
      const text = r.ok ? await r.text() : "";
      if (!text) throw new Error("no answer");      // (a real one, padded, is never empty: the server's empty 200 is none)
      for (const line of text.split("\n")) { const [suf, n] = line.trim().split(":"); if (suf === hx.slice(5)) return Number(n) || 0; }
      return 0;
    })();
    LEAKS.set(hx, p); p.catch(() => LEAKS.delete(hx));
  }
  return LEAKS.get(hx).catch(() => null);
}
const leakedSay = (n) => `This password has turned up in ${n === 1 ? "a data breach" : `${n.toLocaleString("en-GB")} data breaches`}, so it’s one of the first anyone would try. Choose another.`;
// how strong a password looks, 0 to 4 (at least 10 characters to count at all)
function strength(pw) {
  if (pw.length < 10 || /^(.)\1+$/.test(pw)) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  return Math.min(4, 1 + (pw.length >= 14) + (pw.length >= 18) + (kinds >= 3));
}
// A new password, as it's typed: how strong, and whether it's turned up in a data breach (asked a moment after typing
// stops). { meter, hint } go under its field.
function rated(nw) {
  const bar = h("i"), meter = h("div.meter", { "aria-hidden": "true" }, bar), hint = h("p.hint", { "aria-live": "polite" });
  let leakT = 0, leaked = 0;
  const rate = () => {
    const s = strength(nw.value), v = nw.value;
    bar.style.setProperty("--m", v ? (leaked ? 0.12 : [0.12, 0.4, 0.62, 0.84, 1][s]) : 0);
    bar.style.setProperty("--mc", leaked || s === 0 ? "var(--danger)" : s === 1 ? "var(--warn)" : "var(--good)");
    // (only when it's changed: its words are read out each time they're set)
    const c = "hint" + (v && (leaked || !s) ? " bad" : v && s >= 2 ? " ok" : ""), t = !v ? "At least 10 characters. A few unrelated words make a strong one." : leaked ? leakedSay(leaked) : ["Use at least 10 characters.", "Fair. Longer would be stronger.", "Good.", "Strong.", "Very strong."][s];
    if (hint.className !== c) hint.className = c;
    if (hint.textContent !== t) hint.textContent = t;
  };
  nw.addEventListener("input", () => {
    leaked = 0; rate(); clearTimeout(leakT);
    if (nw.value.length >= 10) { const v = nw.value; leakT = setTimeout(async () => { const n = await leakedCount(v); if (nw.value === v) { leaked = n; rate(); } }, 450); }
  });
  rate();
  return { meter, hint };
}
// (then: what to open once it's changed, as "Not you?" goes on to the passkeys)
function passwordView({ then } = {}) {
  const m = S.me, said = h("p.said", { role: "alert" });
  const pw = (ac) => h("input", { type: "password", autocomplete: ac });
  const cur = pw("current-password"), nw = pw("new-password"), again = pw("new-password");
  const { meter, hint } = rated(nw);
  const go = h("button.btn", { type: "submit" }, "Change password");
  return { title: "Change password", body: [
    h("p", { text: "Your password signs you in to every app on the site. Changing it signs you out on your other devices." }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      if (!cur.value) return say(said, "Enter your current password.", cur);
      if (nw.value.length < 10) return say(said, "Use at least 10 characters for your new password.", nw);
      if (nw.value !== again.value) return say(said, "The new passwords don’t match.", again);
      if (nw.value === cur.value) return say(said, "That’s your current password. Choose a new one.", nw);
      try {
        S.me = await busy(go, "Changing…", async () => {
          const n = await leakedCount(nw.value);
          if (n) throw Object.assign(new Error(leakedSay(n)), { field: "password" });
          // the key, unlocked with the current password, and locked anew with the new one, here
          const old = await E2E.fromPassword(cur.value, m.salt);
          const { vault } = await post("password/vault", { proof: old.proof });
          let inner;
          try { inner = await E2E.unlock(old.lockKey, vault); } catch (_) { throw Object.assign(new Error("Your current password isn’t right."), { field: "current" }); }
          const salt = E2E.newSalt(), next = await E2E.fromPassword(nw.value, salt);
          // (and whether it was checked against data breaches: with no answer, it's kept as not checked yet)
          return post("password", { oldProof: old.proof, salt, proof: next.proof, vault: await E2E.lock(next.lockKey, inner), checked: n === 0 });
        });
        closeSheet(); render(); toast("Password changed. Your other devices were signed out.");
        if (then) setTimeout(() => openSheet(then), 500);
      } catch (err) { say(said, err.message, err.field === "current" ? cur : nw); }
    } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }),
      pwField("Current password", cur), pwField("New password", nw), meter, hint, pwField("New password again", again), go),
    said] };
}

// ---- passkeys: each with its name (yours to change) and where it's saved ----
function passkeysView() {
  const m = S.me, said = h("p.said", { role: "alert" }), can = !!(window.PublicKeyCredential && navigator.credentials?.create);
  // (each by its id, data-id: found again to fold away once it's removed, even if showing it's you drew it anew)
  const list = m.passkeys.length
    ? h("div.group", {}, m.passkeys.map((p) => { const box = swipeable(h("button.row", { type: "button", onclick: () => pushSheet(() => passkeyView(p.id)) },
      h("span.ic.indigo", {}, icon("passkey", 19)),
      h("span.tx", {}, h("b", { text: p.label }), h("small", { text: [p.provider, `added ${day(p.createdAt)}`].filter(Boolean).join(" · ") })),
      h("span.chev", {}, icon("chev", 16, 2.4))), "Remove", async (b) => {
        try { S.me = await freshly(() => busy(b, "", () => post("passkeys/remove", { id: p.id }))); await leave(sheetEl.querySelector(`.sheet-body:not(.going) [data-id="${CSS.escape(p.id)}"]`)); redraw(); patch(); toast("Passkey removed."); }
        catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
      }); box.dataset.id = p.id; return box; }))
    : h("div.group", {}, h("div.empty", { text: "No passkeys yet." }));
  return { title: "Passkeys", body: [
    list,
    can && h("button.btn", { type: "button", onclick: async (e) => {
      const b = e.currentTarget; say(said, "");
      try {
        const made = await freshly(() => busy(b, "Waiting for your device…", addPasskey)); redraw(); patch();
        if (made?.secret) { await swapped(); pushSheet(() => keyCopyView(made.id, made.secret, "Passkey added.")); }
        else toast("Passkey added.");
      }
      catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
    } }, icon("plus", 19, 2.4), "Add a passkey"),
    said] };
}
// One passkey: its name, where it's saved, when it was added and last used, and taking it away
function passkeyView(id) {
  const p = S.me.passkeys.find((x) => x.id === id), said = h("p.said", { role: "alert" });
  if (!p) return { title: "Passkey", body: [h("div.empty", { text: "This passkey has been taken away." })] };
  const name = h("input", { type: "text", value: p.label, maxlength: "40", autocomplete: "off", enterkeyhint: "done", "aria-label": "Name" });
  const save = h("button.link.done", { type: "button", onclick: async () => {
    if (name.value.trim() === p.label) return popSheet();
    try { S.me = await busy(save, "Saving…", () => post("passkeys/rename", { id, label: name.value })); patch(); popSheet(); toast("Renamed."); }
    catch (e) { say(said, e.message, name); }
  } }, "Save");
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save.click(); } });
  const info = (k, v) => h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: k })), h("span.val", { text: v }));
  return { title: p.label, right: save, body: [
    h("div.form", {}, field("Name", name)),
    h("div.group", {}, info("Saved in", p.provider || "Not known"), info("Added", day(p.createdAt)), info("Last used", p.usedAt ? ago(p.usedAt) : "Not yet"),
      info("Chat messages", p.messages ? "Opens them" : "Needs your password")),
    !p.messages && passkeysWork() && h("div.group", {}, h("button.row.action", { type: "button", onclick: async (e) => {
      const b = e.currentTarget; say(said, "");
      try {
        const secret = await busy(b, "Waiting for your passkey…", async () => prfByUse(p.id, (await post("signin/options")).rpId));
        if (secret) pushSheet(() => keyCopyView(id, secret));
        else say(said, "This passkey can’t open messages from here: it isn’t on this device, or its device doesn’t offer that yet.");
      } catch (err) { say(said, err.message); }
    } }, "Use it for Chat messages")),
    h("div.group", {}, twice("Remove passkey", "Remove it? Tap again", async (b) => {
      try { S.me = await freshly(() => busy(b, "Removing…", () => post("passkeys/remove", { id }))); patch(); popSheet(); toast("Passkey removed."); }
      catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
    }, "button.row.action.danger")),
    said] };
}
async function addPasskey() {
  const o = await post("passkeys/options");
  let cred;
  try {
    cred = await passkeyMake({ publicKey: {
      challenge: fromB64url(o.challenge), rp: { id: o.rpId, name: "InFlite" },
      user: { id: fromB64url(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: o.exclude.map((id) => ({ type: "public-key", id: fromB64url(id) })), attestation: "none", timeout: 120000,
      extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } });
  } catch (e) {
    throw new Error(e?.name === "InvalidStateError" ? "This device already has a passkey for your account." : e?.name === "NotAllowedError" ? "No passkey was saved." : "A passkey couldn’t be made here.");
  }
  const r = cred.response, spki = r.getPublicKey?.(), alg = r.getPublicKeyAlgorithm?.();
  if (!spki) throw new Error("This browser can’t save passkeys here yet.");
  // (the authenticator data says where it's saved: iCloud Keychain, Google Password Manager…)
  S.me = await post("passkeys", { challenge: o.challenge, id: cred.id, publicKey: b64url(spki), alg, clientDataJSON: b64url(r.clientDataJSON),
    authenticatorData: r.getAuthenticatorData ? b64url(r.getAuthenticatorData()) : undefined });
  // (its PRF secret, for its own copy of the messages' key: given as it's made, or, by some devices, only once it's used)
  const secret = prfOf(cred) || (cred.getClientExtensionResults?.().prf?.enabled ? await prfByUse(cred.id, o.rpId) : null);
  return { id: cred.id, secret };
}

// ---- a passkey that opens Chat's messages too: what only it can work out (its PRF secret, for the site's one salt)
// locks its own copy of the key to them, made here from the password-locked one, as Chat does with one added there.
// So on a new phone, signing in with it opens the messages with no password. ----
const prfOf = (cred) => { const r = cred?.getClientExtensionResults?.().prf; return r?.results?.first ? new Uint8Array(r.results.first) : null; };
async function prfByUse(id, rpId) {
  try {
    const a = await passkeyAsk({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId, userVerification: "required", timeout: 120000,
      allowCredentials: [{ type: "public-key", id: fromB64url(id) }], extensions: { prf: { eval: { first: await E2E.prfSalt() } } } } });
    return prfOf(a);
  } catch (_) { return null; }
}
function keyCopyView(id, secret, added = "") {
  const m = S.me, said = h("p.said", { role: "alert" });
  const pw = h("input", { type: "password", autocomplete: "current-password", name: "password" });
  const go = h("button.btn", { type: "submit" }, "Continue");
  const form = h("form.form", { onsubmit: async (e) => {
    e.preventDefault(); say(said, "");
    if (!pw.value) return say(said, "Enter your password.", pw);
    try {
      await busy(go, "Locking a copy…", async () => {
        const { lockKey, proof } = await E2E.fromPassword(pw.value, m.salt);
        const { vault } = await post("password/vault", { proof });
        const inner = await E2E.unlock(lockKey, vault);
        S.me = await post("passkeys/vault", { id, vault: await E2E.lock(await E2E.fromSecret(secret), inner) });
      });
      patch(); popSheet(); toast("This passkey opens your Chat messages too.");
    } catch (err) { say(said, err.message, pw); }
  } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }), pwField("Password", pw), go);
  return { title: added ? "Passkey added" : "Chat messages", body: [
    h("p.hint", { text: "Your Chat messages are locked with a key only your devices hold. Enter your password once and this passkey gets its own copy of it: on a new phone, signing in with the passkey opens your messages by itself." }),
    form,
    h("button.link", { type: "button", onclick: () => { popSheet(); if (added) toast(added); } }, "Not now"),
    said] };
}

// ---- signed-in devices: each with where and when; those unused for 3 months marked, to sign out in one go ----
function devicesView() {
  const m = S.me, others = m.devices.filter((d) => !d.current), stale = others.filter((d) => d.stale);
  // (the rows it signs out, by their ids: found again to fold away, as showing it's you may have drawn them anew)
  const end = async (b, body, ids) => {
    try {
      const next = await freshly(() => busy(b, "", () => post("devices/end", body)));
      await Promise.all(ids.map((id) => leave(sheetEl.querySelector(`.sheet-body:not(.going) [data-id="${CSS.escape(id)}"]`))));
      S.me = next; redraw(); patch();
      toast(body.id ? "Signed out." : body.stale ? `${stale.length} unused device${stale.length > 1 ? "s were" : " was"} signed out.` : "Your other devices were signed out.");
    } catch (e) { if (!e.quiet) say(sheetEl.querySelector(".said"), e.message); }
  };
  // (each by its app, where it's used in just one, with its icon, or else its browser; what it is and the country left
  // out where they're this one's: "Safari", "Norwich")
  const me = m.devices.find((d) => d.current), home = (me?.place || "").split(", ").pop();
  const where = (p) => (p && home && p.endsWith(`, ${home}`) ? p.slice(0, -home.length - 2) : p);
  const rows = m.devices.map((d) => {
    const name = d.app ? { inflight: "Chat", weather: "Weather", fitness: "Fitness", mail: "Mail", account: "Account" }[d.app] : d.browser || d.label;
    const el = h(d.current ? "div.row.current" : "div.row", {},
      d.app ? h("span.ic.app-ic", {}, photo(APP_MARK[name], { width: 32, height: 32 }))
        : h("span.ic.grey", {}, icon(/iphone|android|phone|ipad|mobile/i.test(d.label) ? "phone" : "computer", 19)),
      h("span.tx", {}, h("b", {}, name, d.current && h("span.tag", { text: thisOne(d) })),
        h(d.stale ? "small.warn" : "small", { text: [d.kind !== me?.kind && d.kind !== name && d.kind, where(d.place),
          d.current ? "Active now" : d.stale ? `Not used for ${monthsSince(d.seenAt)}` : ago(d.seenAt, true)].filter(Boolean).join(" · ") })),
      !d.current && twice("Sign out", "Sign out?", (b) => end(b, { id: d.id }, [d.id])));
    // (marked on what's in the list itself: the row, or the box it slides in)
    const box = d.current ? el : swipeable(el, "Sign out", (b) => end(b, { id: d.id }, [d.id]));
    box.dataset.id = d.id; box.dataset.stale = d.stale ? "1" : "";
    return box;
  });
  return { title: "Signed-in devices", body: [
    h("p", { text: "Where your account’s signed in. On iPhone, each Home Screen app signs in on its own." }),
    h("div.group", {}, rows),
    (stale.length > 0 || others.length > 1) && h("div.group", {},
      stale.length > 0 && h("button.row.action", { type: "button", onclick: (e) => end(e.currentTarget, { stale: true }, rows.filter((r) => r.dataset.stale).map((r) => r.dataset.id)) },
        `Sign out ${stale.length} unused device${stale.length > 1 ? "s" : ""}`),
      others.length > 1 && h("button.row.action.danger", { type: "button", onclick: (e) => end(e.currentTarget, { others: true }, rows.filter((r) => !r.classList.contains("current")).map((r) => r.dataset.id)) }, "Sign out of all other devices")),
    h("p.said", { role: "alert" })] };
}
const monthsSince = (t) => { const n = Math.max(3, Math.floor((Date.now() - t) / (30.44 * 86400e3))); return n >= 24 ? `${Math.floor(n / 12)} years` : `${n} months`; };

// ---- the site's admin: its own file (admin.js), fetched only for the account that's the site's admin, so no one
// else's page carries it; until it's here, its row as it will be, without its figures ----
let ADM = null, admComing = null;
function loadAdmin() {
  admComing ||= import("./admin.js").then((mod) => {
    ADM = mod.setup({ $, sheetEl, API, S, Sheet, again, ago, avatar, busy, call, day, draw, field, freshly, grow, h, icon, ms, openSheet, passkeysView, patch, photo, post, pushSheet, redraw, row, say, section, siteUrl, still, toast, tok, when });
    patch();
    return ADM;
  }, (e) => { admComing = null; throw e; });
  return admComing;
}
const openAdmin = () => loadAdmin().then((a) => openSheet(a.adminView), () => toast("Admin couldn’t be loaded. Try again.", true));
function adminRowSoon() {
  loadAdmin().catch(() => {});
  return section(null, h("div.group.glass", {}, row({ icon: "sliders", tint: "indigo", title: "Admin", onclick: openAdmin })));
}

// ---- recent activity: the last 30 days, newest first, by day ----
const DID = {
  signin: (e) => (e.detail === "Passkey" ? "Signed in with a passkey" : e.detail === "Password" ? "Signed in with your password" : "Signed in"),
  signup: () => "Account made", password: () => "Password changed", reset: () => "Password reset by email", upgrade: () => "Password protection strengthened",
  "passkey-add": (e) => `Passkey added${e.detail ? `: ${e.detail}` : ""}`, "passkey-remove": (e) => `Passkey removed${e.detail ? `: ${e.detail}` : ""}`,
  "signout-device": (e) => `Signed out ${e.detail || "a device"}`, "signout-others": () => "Signed out of all other devices",
  "signout-stale": (e) => `Signed out ${e.detail || "some"} unused device${e.detail === "1" ? "" : "s"}`,
  "email-confirmed": () => "Email confirmed", "email-change-asked": (e) => `New email asked for${e.detail ? `: ${e.detail}` : ""}`,
  "email-changed": (e) => `Email changed${e.detail ? ` to ${e.detail}` : ""}`, export: () => "Your data downloaded",
  "delete-asked": () => "Deletion asked for", "delete-cancelled": () => "Deletion called off",
  admin: (e) => `Admin: ${e.detail ? e.detail[0].toLowerCase() + e.detail.slice(1) : "a change"}`,
};
const KIND_LOOK = { signin: ["signin", "green"], signup: ["person", "green"], password: ["key", "blue"], reset: ["key", "amber"], upgrade: ["key", "blue"], "passkey-add": ["passkey", "indigo"],
  "passkey-remove": ["passkey", "grey"], "signout-device": ["signout", "grey"], "signout-others": ["signout", "grey"], "signout-stale": ["signout", "grey"],
  "email-confirmed": ["mail", "blue"], "email-change-asked": ["mail", "amber"], "email-changed": ["mail", "blue"], export: ["download", "green"],
  "delete-asked": ["trash", "red"], "delete-cancelled": ["undo", "green"], admin: ["shield", "indigo"] };
const SIGNINS = new Set(["signin", "signup", "signout-device", "signout-others", "signout-stale"]);
const APP_MARK = { Chat: "/apps/inflight.png", Weather: "/apps/weather.png", Fitness: "/apps/fitness.png", Mail: MAIL_ICON, Account: "/icon.svg?v=2" };
function activityView() {
  let events = null, show = "all";
  // (as tall as a list, near enough, while it's asked for; the list faded up into place as it comes, and each time the
  // filter changes, the sheet fitting it)
  const box = h("div.activity", { "aria-busy": "true" }, h("div.empty", {}, h("span.spin")));
  box.style.minHeight = "300px";
  const came = () => { box.style.minHeight = ""; box.closest(".sheet-body")?.style.removeProperty("min-height");
    box.animate(still.matches ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: still.matches ? ms("--dur-fast") : 240, easing: tok("--ease-out") }); };
  const draw = () => {
    const list = events.filter((e) => show === "all" || (show === "signins") === SIGNINS.has(e.kind));
    if (!list.length) { box.replaceChildren(h("div.group", {}, h("div.empty", { text: show === "all" ? "Nothing in the last 30 days." : "None of these in the last 30 days." }))); return came(); }
    const byDay = new Map();
    for (const e of list) { const k = dayWord(e.at); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
    box.replaceChildren(...[...byDay].map(([k, day]) => {
      // (where most of the day's happened, said once by the day; a row's own place only where it's somewhere else)
      const n = new Map(); for (const e of day) if (e.place) n.set(e.place, (n.get(e.place) || 0) + 1);
      const place = [...n].sort((x, y) => y[1] - x[1])[0]?.[0] || null;
      return h("div.day", {}, h("h4", {}, k, place && h("small", { text: ` · ${place}` })),
        h("div.group", {}, day.map((e) => { const [ic, tint] = KIND_LOOK[e.kind] || ["clock", "grey"];
          return h("div.row", {}, h(`span.ic.${tint}`, {}, icon(ic, 18), e.app && APP_MARK[e.app] && photo(APP_MARK[e.app], { alt: e.app }, "img.app-mark")),
            h("span.tx", {}, h("b", { text: (DID[e.kind] || (() => e.kind))(e) }), h("small", { text: [e.device, e.place !== place && e.place].filter(Boolean).join(" · ") || e.app || "" })),
            h("span.end", {}, h("span.t", { text: new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }),
              elsewhere(e) && h("button.mini", { type: "button", onclick: () => pushSheet(() => notMeView(e)) }, "Not you?"))); })));
    }));
    came();
  };
  call("activity").then((r) => { if (!box.isConnected) return; events = r.events; box.removeAttribute("aria-busy"); draw(); })
    .catch((e) => { if (box.isConnected) { box.removeAttribute("aria-busy"); box.replaceChildren(h("div.group", {}, h("div.empty", { text: e.message }))); came(); } });
  return { title: "Recent activity", body: [
    h("p", { text: "What’s happened to your account in the last 30 days, in every app on the site. Something you don’t recognise? Change your password." }),
    seg("Show", [["all", "All"], ["signins", "Sign-ins"], ["changes", "Changes"]], "all", (v) => { show = v; if (events) draw(); }),
    box] };
}
// (a sign-in with a password from a device or place other than this browser's: a passkey one needs your own device)
function elsewhere(e) {
  const here = S.me.devices.find((d) => d.current);
  return e.kind === "signin" && e.detail !== "Passkey" && here && (e.device !== here.label || (e.place && e.place !== here.place));
}
// A sign-in you don't recognise: everywhere else signed out, then a new password, in two steps
function notMeView(e) {
  const said = h("p.said", { role: "alert" });
  const go = h("button.btn.danger", { type: "button", onclick: async () => {
    try {
      S.me = await freshly(() => busy(go, "Signing out…", () => post("devices/end", { others: true })));
      patch(); toast("Every other device was signed out."); pushSheet(() => passwordView({ then: passkeysView }));
    } catch (err) { if (!err.quiet) say(said, err.message); }
  } }, "Secure my account");
  const step = (n, t, sub) => h("li", {}, h("span.n", { text: String(n) }), h("span.tx", {}, h("b", { text: t }), h("small", { text: sub })));
  return { title: "Not you?", body: [
    h("div.group", {}, h("div.row.plain", {}, h("span.ic.amber", {}, icon("signin", 18)),
      h("span.tx", {}, h("b", { text: (DID[e.kind] || (() => e.kind))(e) }),
        h("small", { text: [`${dayWord(e.at)}, ${new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, e.app, e.device, e.place].filter(Boolean).join(" · ") })))),
    h("p", { text: "If this wasn’t you, someone may know your password. Three steps put it right:" }),
    h("ol.steps", {},
      step(1, "Sign out everywhere else", "Every device but this one, in every app on the site."),
      step(2, "Choose a new password", "So whoever it was can’t sign back in."),
      step(3, "Look over your passkeys", "Remove any you don’t know: one someone else added would still sign in.")),
    go, said] };
}
const dayWord = (t) => {
  const d = new Date(t), today = new Date(), y = new Date(Date.now() - 86400e3);
  return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
};

// ---- your email: confirmed or not, and a new one (a link to it; it changes only when that's opened) ----
function emailView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const input = h("input", { type: "email", autocomplete: "email", inputmode: "email", autocapitalize: "none", spellcheck: "false", placeholder: "you@example.com" });
  const go = h("button.btn", { type: "submit" }, "Send a link to it");
  const sentSay = "We sent a link to it. Open it to confirm.";
  const hint = !m.emailOk && h("p.hint", { text: linkSent(m) ? sentSay : "Not confirmed yet: open the link we send to it." });
  const status = h("div.group", {},
    h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: m.email })),
      m.emailOk ? h("span.badge", {}, "Confirmed") : h("button.mini.go", { type: "button", onclick: async (e) => {
        const b = e.currentTarget;
        try {
          const r = await busy(b, "", () => post("email/confirm-send")); confirmSent(r);
          // (said here in place, not drawn again, so a new email half typed below stays)
          if (!r.already) { b.textContent = "Send again"; hint.textContent = sentSay; }
          toast(`A link is on its way to ${m.email}.`);
        } catch (err) { say(said, err.message); }
      } }, linkSent(m) ? "Send again" : "Send link")));
  return { title: "Email", body: [
    status,
    hint,
    m.emailNew && h("div.pending.glass", {}, h("span.ic.blue", {}, icon("mail", 18)),
      h("span.tx", {}, h("b", { text: `Waiting for ${m.emailNew}` }), h("small", { text: "Open the link we sent there (it lasts 2 days). Until then, nothing changes." })),
      h("button.mini", { type: "button", onclick: async (e) => {
        try { S.me = await busy(e.currentTarget, "", () => post("email/cancel")); redraw(); patch(); toast("Cancelled. Your email stays as it is."); } catch (err) { say(said, err.message); }
      } }, "Cancel")),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      const email = input.value.trim();
      if (!email) return say(said, "Enter the new email.", input);
      try { S.me = await freshly(() => busy(go, "Sending…", () => post("email/change", { email }))); redraw(); patch(); toast(`A link is on its way to ${email}.`); }
      catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message, sheetEl.querySelector("input[type=email]")); }
    } }, field(m.emailNew ? "Or another new email" : "New email", input), go),
    said] };
}

// ---- checking the password against data breaches (it's typed here; only 5 characters of its hash are asked) ----
function checkView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const pw = h("input", { type: "password", autocomplete: "current-password" });
  const go = h("button.btn", { type: "submit" }, "Check");
  // (one Change password, shown once a check finds it: checking again doesn't add another)
  const change = h("button.btn.danger", { type: "button", hidden: true, onclick: () => pushSheet(passwordView) }, "Change password");
  return { title: "Check your password", body: [
    h("p", { text: "See if your password has turned up in a known data breach. It’s checked here, on this device: only the first 5 characters of a scrambled copy of it are sent to Have I Been Pwned, so neither they nor the site learn it." }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      if (!pw.value) return say(said, "Enter your password.", pw);
      try {
        const n = await busy(go, "Checking…", async () => {
          const n = await leakedCount(pw.value);
          if (n === null) throw new Error("Couldn’t reach Have I Been Pwned just now. Try again in a few minutes.");
          const { proof } = await E2E.fromPassword(pw.value, m.salt);
          S.me = await post("password/checked", { proof, leaked: n > 0 });
          return n;
        });
        patch();
        if (n) { say(said, leakedSay(n).replace("Choose another.", "Change it now.")); change.hidden = false; }
        else { if (Sheet.stack.length > 1) popSheet(); else closeSheet(); toast("Your password isn’t in any known data breach."); }
      } catch (err) { say(said, err.message, pw); }
    } }, h("input.vh", { type: "email", autocomplete: "username", value: m.email || "", tabindex: "-1", "aria-hidden": "true", readonly: true }), pwField("Your password", pw), go),
    said, change] };
}

// ---- preferences, for every app on the site that has them ----
const APPEAR = [["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]];
// (S.me is only ever what was kept, so a choice that wasn't is put back from it, and said why: once the last of that
// sheet's saves is back, not as each fails, so replies that come back in another order than they were asked for still
// end on what's kept. out: that sheet's saves on their way, and whether one of them wasn't kept)
const prefsOut = { appearance: { n: 0 }, units: { n: 0 } };
async function setPrefs(changes, out, putBack) {
  out.n++;
  try { S.me = await call("prefs", { method: "PUT", body: changes }); patch(); }
  catch (e) { toast(e.message, true); out.missed = true; }
  if (--out.n || !out.missed) return;
  out.missed = false; putBack();
}
function appearanceView() {
  const m = S.me;
  const opts = APPEAR.map(([k, label]) => h(`button.appear${m.prefs.appearance === k ? ".on" : ""}`, { type: "button", "aria-pressed": String(m.prefs.appearance === k), onclick: () => {
    theme(k, true);
    for (const b of sheetEl.querySelectorAll(".appear")) { const on = b === opts[APPEAR.findIndex(([x]) => x === k)]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
    setPrefs({ appearance: k }, prefsOut.appearance, () => {
      theme(S.me.prefs.appearance, true);
      if (Sheet.stack.at(-1) === appearanceView) redraw();
    });
  } }, h(`span.shot.${k}`, { "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { text: label }), h("span.tick", { "aria-hidden": "true" }, icon("check", 13, 3))));
  return { title: "Appearance", body: [
    h("div.appears", {}, opts)] };
}
// the units where the account has none chosen yet, whatever the device's language (as Weather starts with them)
const unitsHere = () => ({ temp: "c", wind: "mph", precip: "mm", pressure: "hpa", clock: "24" });
const UNIT_OPTS = [
  ["temp", "Temperature", [["c", "°C"], ["f", "°F"]]],
  ["wind", "Wind", [["mph", "mph"], ["kmh", "km/h"], ["ms", "m/s"], ["kn", "knots"]]],
  ["precip", "Rain", [["mm", "mm"], ["in", "in"]]],
  ["pressure", "Pressure", [["hpa", "hPa"], ["inhg", "inHg"], ["mmhg", "mmHg"]]],
  ["clock", "Time", [["24", "24-hour"], ["12", "12-hour"]]],
];
// a segmented control, its thumb sliding to what's chosen
function seg(name, opts, value, onpick) {
  const thumb = h("span.thumb", { "aria-hidden": "true" }), el = h("div.seg", { role: "radiogroup", "aria-label": name }, thumb);
  const place = (k) => { el.style.setProperty("--n", opts.length); el.style.setProperty("--k", Math.max(0, opts.findIndex(([v]) => v === k))); };
  // (as radio buttons are, by keyboard: one stop for the group, on what's chosen, and the arrow keys move the choice)
  const pick = (b, v, label) => {
    for (const x of el.querySelectorAll("button")) { const on = x.textContent === label; x.setAttribute("aria-checked", String(on)); x.tabIndex = on ? 0 : -1; }
    place(v); onpick(v);
  };
  for (const [v, label] of opts) el.append(h("button", { type: "button", role: "radio", "aria-checked": String(v === value), tabindex: v === value ? "0" : "-1", onclick: (e) => pick(e.currentTarget, v, label) }, label));
  el.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!step) return;
    e.preventDefault();
    const bs = [...el.querySelectorAll("button")], i = bs.indexOf(document.activeElement), j = (Math.max(0, i) + step + bs.length) % bs.length;
    bs[j].focus(); pick(bs[j], opts[j][0], opts[j][1]);
  });
  if (!opts.some(([v]) => v === value)) el.querySelector("button")?.setAttribute("tabindex", "0");
  place(value);
  return el;
}
function unitsView() {
  const m = S.me, u = { ...unitsHere(), ...(m.prefs.units || {}) };
  return { title: "Units", body: [
    h("p", { text: "For Weather, on every device it’s signed in on: forecasts, the map and notifications." }),
    h("div.units", {}, UNIT_OPTS.map(([k, label, opts]) => h("div.unit", {}, h("span", { text: label }), seg(label, opts, u[k], (v) => setPrefs({ units: { [k]: v } }, prefsOut.units, () => Sheet.stack.at(-1) === unitsView && redraw()))))),
  ] };
}

// ---- emails: what each app sends you (each from its own address). The account's, about signing in and its security,
// always; Chat's, on or off here as in its own Notifications (which ones, those say); Weather's warnings and
// briefing, a switch each (for which places and when, its Notifications say) ----
// What the apps email besides the account's own: all of it, none, or which apps
function emailsSaid(e = {}) {
  const on = [e.inflight, e.weather?.warn, e.weather?.brief];
  if (on.every(Boolean)) return "All on";
  const apps = [e.inflight && "Chat", (e.weather?.warn || e.weather?.brief) && "Weather"].filter(Boolean);
  return apps.length ? apps.join(", ") : "Security only";
}
function emailsView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  // a switch for one of the apps' emails (emails: what's sent to prefs, from on or off)
  const toggle = (on, emails) => {
    const sw = h("input.switch", { type: "checkbox", role: "switch", checked: on, disabled: !m.emailOk, onchange: async () => {
      sw.disabled = true; say(said, "");
      try { S.me = await call("prefs", { method: "PUT", body: { emails: emails(sw.checked) } }); patch(); }
      catch (e) { sw.checked = !sw.checked; say(said, e.message); }
      finally { sw.disabled = !S.me.emailOk; }
    } });
    return sw;
  };
  const sw = toggle(!!m.emails?.inflight, (on) => ({ inflight: on }));
  // Weather's: its warnings and its briefing, for the places and time chosen in its Notifications
  const W = m.emails?.weather || {}, and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  const wxRow = (k, title, sub) => h("label.row.plain.info", {}, h("span.tx", {}, h("b", { text: title }), h("small", { text: m.emailOk ? sub : "Confirm your email first" })),
    toggle(!!W[k], (on) => ({ weather: { [k]: on } })));
  const head = (img, name) => h("h4.app-k", {}, h("img", { src: img, alt: "" }), name);
  return { title: "Emails", body: [
    h("p", { text: "What each app emails you, from its own address." }),
    head("/icon.svg?v=2", "Account"),
    h("div.group", {}, h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Sign-ins and security" }), h("small", { text: "So you’d know if it wasn’t you" })),
      h("span.val", { text: "Always on" }))),
    head("/apps/inflight.png", "Chat"),
    h("div.group", {}, h("label.row.plain.info", {}, h("span.tx", {}, h("b", { text: "Notifications by email" }),
      h("small", { text: m.emailOk ? "Pigeons landing, friend requests and your week in flight, as its Notifications have them" : "Confirm your email first" })), sw)),
    head("/apps/weather.png", "Weather"),
    h("div.group", {},
      wxRow("warn", "Warnings", W.warnFor?.length ? `Official warnings as they’re issued, for ${and(W.warnFor)}` : "Official warnings, for the places you choose in Weather"),
      wxRow("brief", "Morning briefing", W.briefFor ? `${W.briefFor}, at ${W.briefAt}` : "For the place you choose in Weather")),
    h("p.hint", { text: "Which places, and when, are in Weather’s Notifications. Rain alerts stay on your phone." }),
    said] };
}

// ---- Chat's settings that are the account's (functions/api/account inflight): which notifications, how they read
// on the lock screen, quiet hours and email; who sees what; and who's blocked. Its own Settings opens them here
// (open=inflight), with the way back to it; a push on or off, its lock and haptics are each phone's, and stay in the app ----
// (ifFor: whose they are; ifSeq, ifBusy: what's been asked for, and the changes on their way; ifStale: a fetch dropped
// for one of those)
let IF = null, ifAt = 0, ifFor = null, ifSeq = 0, ifBusy = 0, ifStale = false;
// (a fetch dropped for a change: the sheet drawn again once the last change is back, from what that gave back, so the
// rows it didn't touch don't stay as they were cached; and, if one couldn't be kept, fetched again as it's drawn)
// (on any of its pages: the sheet's own, its notifications, who sees what, and who's blocked)
const onIf = () => [inflightView, ifNotifyView, ifPrivacyView, ifBlockedView].includes(Sheet.stack.at(-1));
const ifCaughtUp = () => { if (ifBusy || !ifStale) return; ifStale = false; if (onIf()) redraw(); };
const IF_NOTIFY = [["landed", "A pigeon lands"], ["takeoff", "Takes off", "When a friend sends you one"], ["rerouted", "Changes course", "When a friend moves while yours is flying"],
  ["lost", "Is lost", "When Pigeon Death takes one of yours"], ["delays", "Weather delays", "When one flies into weather that makes it late"], ["requests", "Friend requests"],
  ["accepted", "Request accepted"], ["reactions", "Reactions", "When someone reacts to your message"], ["moments", "Mid-air moments", "Near misses, cheers, ships, and friends’ pigeons flying over you"],
  ["streaks", "Flight streaks", "A few hours before a streak with a friend runs out"], ["weekly", "Your week in flight", "Sunday evening: miles flown and badges earned"]];
const IF_PRIVACY = [["showOnline", "Show when I’m online"], ["receipts", "Read receipts"], ["shareNews", "Share my news", "Ranks, streaks, new countries"],
  ["approxLocation", "Approximate location", "About 10 km, not exact"], ["shareTracker", "Live tracker", "On the public map, no names"]];
const hh = (n) => `${String(n).padStart(2, "0")}:00`;
// Chat's settings, fetched (what was last fetched, at once, and fetched again behind it; the sheet drawn again as it
// comes. Another account's, signed in here since, never shown; and what comes dropped if a change was made since it was
// asked for, or is still being made, as what that change gave back is newer) → the parts its pages are drawn with, or
// what to show while there are none
function ifParts(title) {
  if (ifFor !== S.me.id) { IF = null; ifAt = 0; ifFor = S.me.id; }
  if (!IF || Date.now() - ifAt > 5000) {
    ifAt = Date.now();
    const s = ++ifSeq, who = S.me.id;
    call("inflight").then((r) => {
      if (who !== S.me?.id) return;
      if (s === ifSeq && !ifBusy) { IF = r; if (onIf()) redraw(); } else { ifStale = true; ifCaughtUp(); }
    }, (e) => { if (who === S.me?.id && !IF) { IF = { error: e.message }; redraw(); } });
  }
  const back = title === "Chat" && HANDOFF?.open === "inflight" && fromApp() === "inflight"
    ? h("button.link.back.toapp", { type: "button", onclick: backToApp }, icon("back", 22, 2.4), "Chat") : null;
  if (!IF) return { wait: { title, left: back, body: [h("div.empty", { "aria-busy": "true" }, h("span.spin"))] } };
  if (IF.error) return { wait: { title, left: back, body: [h("div.group", {}, h("div.empty", { text: IF.error }))] } };
  const said = h("p.said", { role: "alert" });
  // a change, as it's made: kept, and what's kept shown (the switch put back, or the hour drawn again as it's kept, and
  // why, if it can't be)
  const change = async (input, patch, after) => {
    input.disabled = true; ifSeq++; ifBusy++;
    try { IF = await call("inflight", { method: "PATCH", body: patch }); after?.(); }
    catch (e) { ifAt = 0; if (input.type === "checkbox") input.checked = !input.checked; else if (onIf()) redraw(); toast(e.message, true); }
    finally { ifBusy--; input.disabled = false; ifCaughtUp(); }
  };
  const input = (key, on, patch, { after, disabled } = {}) => {
    const el = h("input.switch", { type: "checkbox", role: "switch", id: `if-${key}`, name: key, checked: !!on, disabled: !!disabled });
    el.onchange = () => change(el, patch(el.checked), after);
    return el;
  };
  const sw = (key, title, sub, on, patch, opts) => switchRow({ title, sub, input: input(key, on, patch, opts) });
  return { back, said, change, input, sw };
}
const hhRange = (n) => `${hh(n.quietFrom)}–${hh(n.quietTo)}`;
function inflightView() {
  const P = ifParts("Chat");
  if (P.wait) return P.wait;
  const n = IF.notify, on = IF_NOTIFY.filter(([k]) => n[k]).length, shared = IF_PRIVACY.filter(([k]) => k === "approxLocation" ? !IF.privacy[k] : IF.privacy[k]).length;
  return { title: "Chat", quiet: true, left: P.back, body: [
    setHead("inflight", "Chat"),
    h("div.group", {},
      row({ icon: "bell", tint: "red", title: "Notifications", sub: n.quiet ? `Quiet ${hhRange(n)}` : null, value: `${on} of ${IF_NOTIFY.length}`, onclick: () => pushSheet(ifNotifyView) }),
      switchRow({ icon: "mail", tint: "blue", title: "Email me", sub: IF.emailOk ? "After 10 minutes unread" : "Confirm your email first",
        input: P.input("email", IF.email, (v) => ({ email: v }), { disabled: !IF.emailOk }) })),
    h("h4.app-k", { text: "Privacy" }),
    h("div.group", {},
      row({ icon: "eye", tint: "teal", title: "Who sees what", value: shared === IF_PRIVACY.length ? "All shared" : shared ? `${shared} of ${IF_PRIVACY.length}` : "Nothing", onclick: () => pushSheet(ifPrivacyView) }),
      row({ icon: "block", tint: "grey", title: "Blocked", value: IF.blocked.length ? String(IF.blocked.length) : "No one", onclick: () => pushSheet(ifBlockedView) })),
    P.said,
    ...openIn("inflight", "Chat", "For push, Lock Chat and haptics, on each phone")] };
}
// which notifications, how they read on the lock screen, and quiet hours
function ifNotifyView() {
  const P = ifParts("Notifications");
  if (P.wait) return P.wait;
  const n = IF.notify, notify = (k) => (v) => ({ notify: { [k]: v } });
  const hour = (k, title) => {
    const sel = h("select", { "aria-label": title, id: `if-${k}`, name: k }, Array.from({ length: 24 }, (_, i) => h("option", { value: String(i), selected: n[k] === i, text: hh(i) })));
    const val = h("span.val", { text: hh(n[k]) });
    sel.onchange = () => { val.textContent = hh(Number(sel.value)); P.change(sel, { notify: { [k]: Number(sel.value), tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }, redraw); };
    return h("label.row.plain.info.pick", {}, h("span.tx", {}, h("b", { text: title })), val, icon("chev", 16, 2.4), sel);
  };
  const list = (ks) => IF_NOTIFY.filter(([k]) => ks.includes(k)).map(([k, t, sub]) => P.sw(k, t, sub, n[k], notify(k)));
  return { title: "Notifications", body: [
    h("h4.app-k", { text: "Pigeons" }),
    h("div.group", {}, list(["landed", "takeoff", "rerouted", "lost", "delays"])),
    h("h4.app-k", { text: "Friends" }),
    h("div.group", {}, list(IF_NOTIFY.map(([k]) => k).filter((k) => !["landed", "takeoff", "rerouted", "lost", "delays"].includes(k)))),
    h("h4.app-k", { text: "On the lock screen" }),
    h("div.group", {}, P.sw("names", "Show names", n.names ? "Who sent it, never what it says" : "Just “A pigeon has landed”", n.names, notify("names"), { after: redraw })),
    h("h4.app-k", { text: "Quiet hours" }),
    h("div.group", {}, P.sw("quiet", "Quiet hours", n.quiet ? `In ${n.tz} time: those that land meanwhile, when they end` : "Hold them overnight, or whenever suits", n.quiet,
      (v) => ({ notify: { quiet: v, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }), { after: redraw }),
      n.quiet && hour("quietFrom", "From"), n.quiet && hour("quietTo", "To")),
    P.said] };
}
// who sees what (each works both ways)
function ifPrivacyView() {
  const P = ifParts("Who sees what");
  if (P.wait) return P.wait;
  return { title: "Who sees what", body: [
    h("div.group", {}, IF_PRIVACY.map(([k, t, sub]) => P.sw(k, t, sub, IF.privacy[k], (v) => ({ privacy: { [k]: v } })))),
    h("p.hint", { text: "Online, read receipts and news work both ways: turn one off and you won’t see other people’s either." }),
    P.said] };
}
// who's blocked, each to be unblocked
function ifBlockedView() {
  const P = ifParts("Blocked");
  if (P.wait) return P.wait;
  const rows = IF.blocked.length ? IF.blocked.map((b) => h("div.row.plain", { "data-id": b.id },
    h("span.ic.grey.initial", { text: String(b.name || b.handle).trim().charAt(0).toUpperCase() }),
    h("span.tx", {}, h("b", { text: b.name }), h("small", { text: `@${b.handle}` })),
    twice("Unblock", "Unblock?", async (btn) => {
      ifSeq++;
      try { IF = await busy(btn, "", () => call("inflight/block", { method: "DELETE", body: { id: b.id } })); redraw(); toast(`${b.name} is unblocked.`); }
      catch (e) { say(P.said, e.message); }
    }))) : [h("div.row.plain.info", {}, h("span.tx", {}, h("small", { text: "No one. Block someone from their chat in Chat." })))];
  return { title: "Blocked", body: [h("div.group", {}, rows), P.said] };
}

// ---- an app's settings sheet: its head, its rows, and the way into the app ----
const setHead = (id, name) => h("div.app-head.set", {}, h("img", { src: `/apps/${id}.png`, alt: "", width: 64, height: 64 }), h("b", { text: name }),
  h("span", { text: "Kept with your account, on every device" }));
// (what's set in the app itself, on each device: the way in, and what's there)
const openIn = (id, name, what) => [h("a.pill.open-in", { href: siteUrl(APPS[id].sub) }, `Open ${name}`, icon("open", 15, 2.6)), h("p.hint", { text: what })];
// a row that ends in a switch, or a choice of two (w: the choice's width)
const switchRow = ({ icon: ic, tint, title, sub, input }) => h("label.row.plain.info", {}, ic && h(`span.ic.${tint}`, {}, icon(ic, 19)),
  h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })), input);
function choiceRow({ icon: ic, tint, title, sub, opts, value, onpick, w }) {
  const el = seg(title, opts, value, onpick);
  el.classList.add("mini"); if (w) el.style.setProperty("--w", `${w}px`);
  return h("div.row.plain.info", {}, ic && h(`span.ic.${tint}`, {}, icon(ic, 19)), h("span.tx", {}, h("b", { text: title }), sub && h("small", { text: sub })), el);
}

// ---- Weather's settings that are the account's (functions/api/account weather), signed in and kept with it: its units
// (the page's own Units), its commute and whether its forecast is tuned for where you are. Its own Settings opens them
// here (open=weather), with the way back to it; its notifications (each device's), best times, look and the order of its
// page are set in Weather ----
let WXS = null, wxFor = null, wxAt = 0;
function weatherSetView() {
  if (wxFor !== S.me.id) { WXS = null; wxAt = 0; wxFor = S.me.id; }
  if (!WXS || Date.now() - wxAt > 5000) {
    wxAt = Date.now();
    const who = S.me.id;
    call("weather").then((r) => { if (who === S.me?.id) { WXS = r; if (Sheet.stack.at(-1) === weatherSetView) redraw(); } },
      (e) => { if (who === S.me?.id && !WXS) { WXS = { error: e.message }; redraw(); } });
  }
  const back = HANDOFF?.open === "weather" && fromApp() === "weather"
    ? h("button.link.back.toapp", { type: "button", onclick: backToApp }, icon("back", 22, 2.4), "Weather") : null;
  if (!WXS) return { title: "Weather", left: back, body: [h("div.empty", { "aria-busy": "true" }, h("span.spin"))] };
  if (WXS.error) return { title: "Weather", left: back, body: [h("div.group", {}, h("div.empty", { text: WXS.error }))] };
  // a change, kept as it's made (put back, and why, if it can't be)
  const change = async (input, patch) => {
    input.disabled = true;
    try { WXS = await call("weather", { method: "PATCH", body: patch }); }
    catch (e) { if (input.type === "checkbox") input.checked = !input.checked; toast(e.message, true); }
    finally { input.disabled = false; if (Sheet.stack.at(-1) === weatherSetView) redraw(); }
  };
  const sw = (id, on, patch) => {
    const input = h("input.switch", { type: "checkbox", role: "switch", id, name: id, checked: !!on });
    input.onchange = () => change(input, patch(input.checked));
    return input;
  };
  // (a time, each quarter of an hour)
  const at = (k, title) => {
    const times = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`), v = WXS.commute[k];
    if (!times.includes(v)) times.push(v), times.sort();
    const sel = h("select", { "aria-label": title, id: `wx-${k}`, name: k }, times.map((t) => h("option", { value: t, selected: t === v, text: t })));
    const val = h("span.val", { text: v });
    sel.onchange = () => { val.textContent = sel.value; change(sel, { commute: { [k]: sel.value } }); };
    return h("label.row.plain.info.pick", {}, h("span.tx", {}, h("b", { text: title })), val, icon("chev", 16, 2.4), sel);
  };
  const c = WXS.commute, u = { ...unitsHere(), ...(S.me.prefs.units || {}) };
  return { title: "Weather", quiet: true, left: back, body: [
    setHead("weather", "Weather"),
    h("div.group", {},
      row({ icon: "ruler", tint: "blue", title: "Units", value: unitsSaid(u), onclick: () => pushSheet(unitsView) }),
      switchRow({ icon: "chart", tint: "indigo", title: "Tune the forecast", sub: "For how it’s been here lately", input: sw("wx-tune", WXS.tune, (v) => ({ tune: v })) }),
      switchRow({ icon: "car", tint: "amber", title: "Commute", sub: "Weekdays, in Highlights", input: sw("wx-commute", c.on, (v) => ({ commute: { on: v } })) }),
      c.on && at("am", "Leave"), c.on && at("pm", "Return")),
    ...openIn("weather", "Weather", "For notifications, best times, its look and your page")] };
}

// ---- Fitness's settings that are the account's (functions/api/account fitness): kilometres or miles, and whether it
// asks how you are each morning; and everything it keeps, as files, in one zip. Its own Settings opens them here
// (open=fitness), with the way back to it; its look and its morning reminder are each phone's, and stay in the app ----
let FX = null, fxFor = null, fxAt = 0;
function fitnessSetView() {
  if (fxFor !== S.me.id) { FX = null; fxAt = 0; fxFor = S.me.id; }
  if (!FX || Date.now() - fxAt > 5000) {
    fxAt = Date.now();
    const who = S.me.id;
    call("fitness").then((r) => { if (who === S.me?.id) { FX = r; if (Sheet.stack.at(-1) === fitnessSetView) redraw(); } },
      (e) => { if (who === S.me?.id && !FX) { FX = { error: e.message }; redraw(); } });
  }
  const back = HANDOFF?.open === "fitness" && fromApp() === "fitness"
    ? h("button.link.back.toapp", { type: "button", onclick: backToApp }, icon("back", 22, 2.4), "Fitness") : null;
  if (!FX) return { title: "Fitness", left: back, body: [h("div.empty", { "aria-busy": "true" }, h("span.spin"))] };
  if (FX.error) return { title: "Fitness", left: back, body: [h("div.group", {}, h("div.empty", { text: FX.error }))] };
  const said = h("p.said", { role: "alert" });
  // a change, kept as it's made (put back, and why, if it can't be)
  const change = async (patch, undo) => {
    say(said, "");
    try { FX = await call("fitness", { method: "PATCH", body: patch }); }
    catch (e) { undo?.(); toast(e.message, true); }
  };
  // (none chosen yet: the app goes by the phone's region, as it says)
  const here = /-(US|LR|MM)\b/i.test(navigator.language || "") ? "imperial" : "metric";
  const ask = h("input.switch", { type: "checkbox", role: "switch", id: "fx-ask", name: "ask", checked: FX.ask });
  ask.onchange = async () => { ask.disabled = true; await change({ ask: ask.checked }, () => { ask.checked = !ask.checked; }); ask.disabled = false; };
  const fx = (k) => FX[k] || {};
  return { title: "Fitness", quiet: true, left: back, body: [
    setHead("fitness", "Fitness"),
    h("h4.app-k", { text: "Sources" }),
    h("div.group", {},
      row({ icon: "watch", tint: "garmin", title: "Garmin Connect", sub: fxSaid(fx("garmin"), "Your rides and nights, in by themselves"), onclick: () => pushSheet(fxGarminView) }),
      fx("strava").ready !== false && row({ icon: "wave", tint: "strava", title: "Strava", sub: fxSaid(fx("strava"), "What you record on Strava, in by itself"), onclick: () => pushSheet(fxStravaView) }),
      row({ icon: "heart", tint: "health", title: "Apple Health", sub: fx("health").on ? (fx("health").last ? `Last sent ${ago(fx("health").last)}` : "Waiting for the Shortcut’s first morning") : "Your nights from your Apple Watch, by a Shortcut", onclick: () => pushSheet(fxHealthView) }),
      (FX.devices || []).length > 0 && row({ icon: "watch", tint: "grey", title: "Devices", value: String(FX.devices.length), onclick: () => pushSheet(fxDevicesView) })),
    h("h4.app-k", { text: "Preferences" }),
    h("div.group", {},
      // (none chosen yet: the app goes by the phone's region, as it says)
      choiceRow({ icon: "ruler", tint: "blue", title: "Distances", sub: FX.units ? null : "From your phone’s region", opts: [["metric", "km"], ["imperial", "mi"]], value: FX.units || here, onpick: (v) => change({ units: v }, () => redraw()), w: 104 }),
      choiceRow({ icon: "map", tint: "teal", title: "Ride maps", sub: "From OpenFreeMap, which sees where", opts: [["tap", "On tap"], ["always", "Always"]], value: FX.maps || "tap", onpick: (v) => change({ maps: v }, () => redraw()), w: 150 }),
      switchRow({ icon: "sun", tint: "amber", title: "Ask how I am", sub: "Each morning, on Today", input: ask })),
    h("div.group", {}, h("button.row", { type: "button", onclick: (e) => exportFitness(e.currentTarget, said) },
      h("span.ic.green", {}, icon("download", 19)), h("span.tx", {}, h("b", { text: "Export everything" }), h("small", { text: "Every file and workout, in one zip" })),
      h("span.get", {}, icon("download", 20, 2.2)))),
    said,
    ...openIn("fitness", "Fitness", "For its morning reminder and uploading files, on each phone")] };
}
// (a connection, said: whose, and when it last looked)
function fxSaid(c, off) {
  if (!c.on) return c.n ? `Not connected · ${c.n === 1 ? "1 activity" : `${c.n} activities`} from before` : off;
  if (!c.ok) return c.said === "revoked" || c.said === "expired" ? "Stopped letting Fitness in: connect again" : "Connected, but not answering";
  return `${c.name ? `${c.name} · ` : "Connected · "}${c.last ? `checked ${ago(c.last)}` : "connected"}`;
}
// Disconnecting, or clearing up after: what it brought in kept, or removed (not yours, say)
function fxLeave(kind, label) {
  const c = FX[kind] || {}, n = c.n || 0;
  if (!c.on && !n) return null;
  const go = async (b, acts) => {
    try { const r = await busy(b, acts ? "Removing…" : "Disconnecting…", () => call(`fitness/${kind}${acts ? "?acts=1" : ""}`, { method: "DELETE" })); FX = r;
      stepBack(); toast([c.on && `Disconnected from ${label}`, acts && `${r.gone === 1 ? "1 activity" : `${r.gone || 0} activities`} removed`].filter(Boolean).join("; ")); }
    catch (e) { if (!e.quiet) toast(e.message, true); }
  };
  const sure = h("div.group", { hidden: true },
    c.on && h("button.row.plain.act", { type: "button", onclick: (e) => go(e.currentTarget, false) }, h("span.tx", {}, h("b", { text: n ? `Disconnect, and keep its ${n === 1 ? "activity" : `${n} activities`}` : "Disconnect" }))),
    n > 0 && h("button.row.plain.act.danger", { type: "button", onclick: (e) => go(e.currentTarget, true) }, h("span.tx", {}, h("b", { text: `${c.on ? "Disconnect, and remove" : "Remove"} ${n === 1 ? "the activity" : `all ${n} activities`} from ${label}` }))));
  const first = h("button.row.plain.act.danger", { type: "button", onclick: (e) => { e.currentTarget.closest(".group").hidden = true; sure.hidden = false; } }, h("span.tx", {}, h("b", { text: c.on ? "Disconnect" : `Remove what ${label} brought in` })));
  return [h("h4.app-k", { text: c.on ? "Disconnecting" : `From ${label} before` }), h("div.group", {}, first), sure,
    h("p.hint", { text: c.on ? "New activities stop coming in. You choose whether the ones it brought in stay." : `${n === 1 ? "1 activity" : `${n} activities`} in Fitness came from ${label}. If they’re not yours, remove them.` })];
}
const fxStat = (k, v) => h("div.row.plain", {}, h("span.tx", {}, h("b", { text: k })), h("span.val", { text: v }));
// Garmin Connect: your Personal API key, pasted (locked with your account, never shown again)
function fxGarminView() {
  const c = FX.garmin || {};
  if (!c.on) {
    const key = h("input", { type: "password", id: "fx-garmin-key", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Personal API key" });
    const btn = h("button.btn", { type: "button", onclick: async () => {
      if (!key.value.trim()) return key.focus();
      try { FX = await busy(btn, "Connecting…", () => call("fitness/garmin", { method: "POST", body: { key: key.value } })); key.value = ""; redraw(); toast("Connected: your rides come in as you open Fitness"); }
      catch (e) { if (!e.quiet) toast(e.message, true); }
    } }, "Connect");
    return { title: "Garmin Connect", body: [
      h("p", { text: "Your rides, runs and swims, and your nights, in Fitness by themselves." }),
      h("ol.steps-list", {}, h("li", { text: "In Garmin Connect: Settings › Personal API Key › Create" }), h("li", { text: "Copy it, and paste it here: Garmin shows it only once" })),
      field("Personal API key", key), btn,
      h("p.hint", { text: "Kept locked with your account and never shown again. Garmin’s personal keys only read: Fitness brings in the last six months, then each new one." }),
      ...(fxLeave("garmin", "Garmin") || [])] };
  }
  const all = h("button.btn.quiet", { type: "button", onclick: async () => {
    try { FX = await busy(all, "Starting…", () => call("fitness/garmin/all", { method: "POST" })); redraw(); toast("All your rides are coming in: open Fitness to see them"); }
    catch (e) { if (!e.quiet) toast(e.message, true); }
  } }, c.back ? "Carry on bringing them in" : "Bring in all your rides");
  return { title: "Garmin Connect", body: [
    h("div.group", {}, fxStat("Status", fxSaid(c, "")), fxStat("Activities from it", String(c.n || 0))),
    all, h("p.hint", { text: c.back ? "Part way through all your history: it carries on by itself." : "Everything on Garmin Connect, not just the last six months, oldest first. Carries on by itself." }),
    ...(fxLeave("garmin", "Garmin") || [])] };
}
// Strava: its own page to say yes on, which sends you back to Fitness, the rides coming in
function fxStravaView() {
  const c = FX.strava || {};
  const go = h("button.btn.strava", { type: "button", onclick: async () => {
    try { const { url } = await busy(go, "Opening Strava…", () => call("fitness/strava", { method: "POST" })); location.assign(url); }
    catch (e) { if (!e.quiet) toast(e.message, true); }
  } }, c.on ? "Connect with Strava again" : "Connect with Strava");
  if (!c.on) return { title: "Strava", body: [
    h("p", { text: "Your rides, runs and swims from Strava, in Fitness by themselves: the last six months, then each new one." }),
    go, h("p.hint", { text: "Strava shows its own page, so you see whose Strava it is; then you’re back in Fitness, the rides coming in. Fitness only reads: it never posts to Strava." }),
    ...(fxLeave("strava", "Strava") || []), h("p.hint.powered", { text: "Powered by Strava" })] };
  const all = h("button.btn.quiet", { type: "button", onclick: async () => {
    try { FX = await busy(all, "Starting…", () => call("fitness/strava/all", { method: "POST" })); redraw(); toast("All your rides are coming in: open Fitness to see them"); }
    catch (e) { if (!e.quiet) toast(e.message, true); }
  } }, c.back ? "Carry on bringing them in" : "Bring in all your rides");
  return { title: "Strava", body: [
    h("div.group", {}, fxStat("Status", fxSaid(c, "")), fxStat("Activities from it", String(c.n || 0))),
    !c.ok && go, c.ok && all,
    h("p.hint", { text: "Strava tells Fitness as each new activity’s saved, so it’s there a minute or two after." }),
    ...(fxLeave("strava", "Strava") || []), h("p.hint.powered", { text: "Powered by Strava" })] };
}
// Apple Health: a key for a Shortcut that sends last night each morning (made here, shown once, with the steps)
let fxKey = null;
function fxHealthView() {
  const c = FX.health || {};
  const make = h("button.btn" + (c.on ? ".quiet" : ""), { type: "button", onclick: async () => {
    try { const r = await busy(make, "Making your key…", () => call("fitness/health", { method: "POST" })); fxKey = r.address; FX = r; redraw(); }
    catch (e) { if (!e.quiet) toast(e.message, true); }
  } }, c.on ? "Make a new key, and see the steps again" : "Make my key");
  const copy = (text) => h("button.btn.quiet", { type: "button", onclick: () => navigator.clipboard?.writeText(text).then(() => toast("Address copied"), () => toast("Couldn’t copy: press and hold to select it", true)) }, "Copy the address");
  const steps = fxKey && [
    h("h4.app-k", { text: "Your address" }), h("p.fx-addr", { text: fxKey }), copy(fxKey),
    h("p.hint", { text: "Yours alone, and shown this once: copy it now. It can only send your nights to Fitness." }),
    h("h4.app-k", { text: "Make the Shortcut" }),
    h("ol.steps-list", {},
      h("li", { text: "Shortcuts › Automation › New Automation: Time of Day, 07:30, Daily, Run Immediately; then New Blank Automation." }),
      h("li", { text: "Find Health Samples: Heart Rate Variability, Start Date in the last 12 hours." }),
      h("li", { text: "Find Health Samples: Resting Heart Rate, in the last 1 day (if it says Filter, tap Health Samples and Clear it)." }),
      h("li", { text: "Find Health Samples: Sleep, in the last 16 hours, Value not In Bed, not Awake; then Get Details of Health Samples: Duration." }),
      h("li", { text: "Get Contents of URL: paste your address. Method POST, Request Body JSON." }),
      h("li", { text: "Three fields: hrv, step 2’s Health Samples; rhr, step 3’s; sleep, step 4’s Duration (each a blue variable chip). Then tap Run once." }))];
  const off = c.on && h("button.row.plain.act.danger", { type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.querySelector("b").textContent = "Turn off: the key stops, its nights forgotten"; return; }
    try { FX = await call("fitness/health", { method: "DELETE" }); fxKey = null; stepBack(); toast("Apple Health off"); } catch (er) { toast(er.message, true); }
  } }, h("span.tx", {}, h("b", { text: "Turn off" })));
  return { title: "Apple Health", body: [
    c.on ? h("div.group", {}, fxStat("Last sent", c.last ? ago(c.last) : "Not yet"), fxStat("Nights", String(c.nights || 0)))
      : h("p", { text: "Apple keeps Health on your iPhone, with no way for a website to ask for it. So a Shortcut sends it: each morning, last night’s HRV, resting heart rate and sleep, with a key of your own. Rhythm eases the day when your night says you need it." }),
    ...(steps || []), make,
    off && h("div.group", {}, off)] };
}
function fxDevicesView() {
  return { title: "Devices", body: [h("p", { text: "What your activities were recorded on, from their files." }),
    h("div.group", {}, (FX.devices || []).map(([d, n]) => fxStat(d, n === 1 ? "1 file" : `${n} files`)))] };
}
// Everything, as files: each activity as it came, and your workouts as FIT (and ZWO, for a ride), drawn with the app's
// own code (formats.js, shared with it)
async function exportFitness(btn, said) {
  try {
    const file = await busy(btn, "Gathering…", async () => {
      const [x, F] = await Promise.all([call("fitness/export"), import("./formats.js")]), files = [], seen = new Set();
      const unzip = async (u8) => (u8.length > 18 && u8[0] === 0x1f && u8[1] === 0x8b ? new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()) : u8);
      for (const [i, a] of x.acts.entries()) {
        const lbl = btn.querySelector("span:not(.spin)"); if (lbl) lbl.textContent = `Gathering ${i + 1} of ${x.acts.length}…`;
        const r = await fetch(`${API}/fitness/file?id=${encodeURIComponent(a.id)}`, { credentials: "same-origin" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "One of your files couldn’t be fetched. Try again.");
        const bytes = await unzip(new Uint8Array(await r.arrayBuffer()));
        // (a file of several parts, kept once)
        if (seen.has(a.file + bytes.length)) continue;
        seen.add(a.file + bytes.length);
        files.push({ name: `activities/${F.fileName(`${new Date(a.start).toISOString().slice(0, 10)} ${a.name}`, a.type || "fit")}`, data: bytes });
      }
      for (const w of x.workouts) {
        files.push({ name: `workouts/${F.fileName(w.name, "fit")}`, data: F.fitFromWorkout(w, { pace: w.sport === "run" ? x.pace.run : w.sport === "swim" ? x.pace.swim : 4 }) });
        if (w.sport === "ride") files.push({ name: `workouts/${F.fileName(w.name, "zwo")}`, data: F.zwoFromWorkout(w) });
      }
      return files.length ? new Blob([F.zip(files)], { type: "application/zip" }) : null;
    });
    if (!file) return toast("Nothing to export yet: add an activity in Fitness first.");
    const a = h("a", { href: URL.createObjectURL(file), download: "Fitness export.zip" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast("Your Fitness files are downloading.");
  } catch (e) { if (!e.quiet) say(said, e.message); }
}

// ---- your data, as a file ----
function exportView() {
  const said = h("p.said", { role: "alert" });
  // (as a PDF to read and keep, written here from what the export gives: datapdf.js)
  const get = async (e) => {
    const b = e.currentTarget; say(said, "");
    try {
      const file = await freshly(() => busy(b, "Making your PDF…", async () => {
        const data = await post("export");
        const { dataPdf } = await import("./datapdf.js");
        return dataPdf(data, { did: (x) => (DID[x.kind] || (() => x.kind))(x), units: (u) => unitsSaid({ ...unitsHere(), ...u }) });
      }));
      const a = h("a", { href: URL.createObjectURL(file), download: `georgefarrowgreen-account-${S.me.handle}.pdf` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      toast("Your data is downloading.");
    } catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
  };
  // (a list, as Settings has it: the download, then deleting the account apart, asked again in its own sheet)
  return { title: "Your data", body: [
    h("div.group", {}, h("button.row", { type: "button", onclick: get },
      h("span.ic.blue", {}, icon("doc", 19)), h("span.tx", {}, h("b", { text: "Download as PDF" })), h("span.get", {}, icon("download", 20, 2.2)))),
    said,
    h("div.group.apart", {}, h("button.row.action.danger", { type: "button", onclick: () => pushSheet(deleteView) }, "Delete account…"))] };
}

// ---- deleting the account: in 7 days, unless you keep it ----
function deleteView() {
  const m = S.me, said = h("p.said", { role: "alert" });
  const sure = h("input", { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: m.handle, "aria-label": `Type ${m.handle} to confirm` });
  const go = h("button.btn.danger", { type: "submit", disabled: true }, "Delete account");
  sure.addEventListener("input", () => { go.disabled = sure.value.trim().replace(/^@/, "").toLowerCase() !== m.handle; });
  return { title: "Delete account", body: [
    h("p", { text: "This deletes your account and everything kept with it, in every app on the site:" }),
    h("ul.gone", {}, h("li", { text: "Chat: your letters, friends and keys" }), h("li", { text: "Weather: your saved places and notifications" }),
      h("li", { text: "Fitness: your activities and their files, your plan and your workouts" }),
      h("li", { text: "Your profile, password and passkeys" })),
    h("p", { text: "It’s signed out everywhere now and deleted in 7 days. Until then you can keep it: sign in here, or use the link we’ll email you." }),
    h("form.form", { onsubmit: async (e) => {
      e.preventDefault(); say(said, "");
      const confirm = sure.value.trim();
      try {
        const r = await freshly(() => busy(go, "Deleting…", () => post("delete", { confirm })));
        S.me = { signedIn: false }; forget();
        anew(() => { S.settled = false; render(); scrollTo(0, 0); });
        toast(`Your account will be deleted on ${new Date(r.deleteAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`, false, 6000);
      } catch (err) { if (!err.quiet) say(sheetEl.querySelector(".said"), err.message); }
    } }, field(`Type ${m.handle} to confirm`, h("div.at", {}, "@", sure)), go),
    said] };
}

// ---- keeping up with changes made elsewhere: looked at again on coming back to the page, and now and then ----
async function refresh() {
  if (document.hidden || !S.me || Date.now() - S.pulled < 15000) return;
  S.pulled = Date.now();
  let m;
  try { m = await call("me"); } catch (_) { return; }
  const was = S.me, same = (x) => JSON.stringify({ ...x, fresh: 0, devices: x.devices?.map((d) => ({ ...d, seenAt: 0 })) });
  if (!!was.signedIn !== !!m.signedIn || !!was.deleting !== !!m.deleting) {
    S.me = m;
    anew(() => { S.settled = false; render(); });
    if (was.signedIn && !m.signedIn) toast("You were signed out.", true);
    return;
  }
  if (m.signedIn && same(was) !== same(m)) {
    S.me = m;
    if (m.prefs && m.prefs.appearance !== was.prefs?.appearance) theme(m.prefs.appearance, true);
    patch();
  }
}
document.addEventListener("visibilitychange", refresh);
addEventListener("focus", refresh);
setInterval(refresh, 5 * 60000);      // (and on coming back to the page: a look every minute redid the account's figures for nothing)

// ---- glass behind the status bar, once the page has scrolled under it ----
// (how far, on the bar itself: on the page's root, every part of the page was styled anew at each frame of a scroll)
const statusEl = $(".status");
let ticking = false;
function scrolled() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const t = Math.min(1, Math.max(0, scrollY / 24));
    statusEl.style.setProperty("--bar", t.toFixed(3));
    // (your card's photo: a little slower than the page as it scrolls away, and stretched as it's pulled down at the
    // top; held still for Reduce Motion)
    const pc = $("main .poster-card");
    if (pc && !still.matches) {
      pc.style.setProperty("--drift", Math.min(36, Math.max(0, scrollY) * 0.22).toFixed(1));
      pc.style.setProperty("--pull", (1 + Math.max(0, -scrollY) / 280).toFixed(3));
    }
  });
}
addEventListener("scroll", scrolled, { passive: true });

IFL.built("account", BUILD);
load();
