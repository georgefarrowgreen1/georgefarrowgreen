// The selectors end-to-end tests may rely on under One roof (spec §3.14), frozen by B0. Tests (Q's, TD's, WX's, FW's)
// select DOM only through these; anything else needs the owner's sign-off, and owners keep every one working. One
// constant per hook, its owner in the comment; the functions only fill in a value.

// ---- the page (FW) ----
export const HTML_APP = 'html[data-app]';                 // FW: the shown screen's app ("inflite" on tab screens)
export const htmlApp = (app) => `html[data-app="${app}"]`;  // FW
export const HTML_ROUTE = 'html[data-route]';             // FW: = router.format(F.route)
export const htmlRoute = (path) => `html[data-route="${path}"]`; // FW
export const HTML_FILL = 'html.ifl-fill';                 // FW: a screen fills the window (Radar), D20

// ---- the header (FW) ----
export const HD_TITLE = '#hd h1.ifh-name';                // FW
export const HD_PICK = '#hd .ifh-pick';                   // FW: the title's ▾ (Weather: Places)
export const HD_CRUMB = '#hd .ifh-crumb';                 // FW
export const HD_LINE = '#hd .ifh-line';                   // FW
export const HD_BACK = '#hd .ifl-back';                   // FW: app screens only, aria-label "Back to …"
export const HD_ME = '#hd .ifh-me';                       // FW: your photo, tab screens only (opens InFlite's menu)
export const HD_SEARCH = '#hd [data-act=search]';         // FW
export const hdAct = (icon) => `#hd [data-act="${icon}"]`; // FW: an act button, data-act = its icon (search, edit, settings)
export const HD_SETTINGS = '#hd [data-act=settings]';     // FW (button) / WX (Weather's one act: Weather Settings)
export const HD_EDIT = '#hd [data-act=edit]';             // FW (button) / TD (Today's Edit)
export const HD_TABLIST = '#hd [role=tablist]';           // FW: the section switcher (app screens only)
export const HD_SEC = '#hd [role=tablist] [role=tab][data-sec]'; // FW: + aria-selected
export const hdSec = (id) => `#hd [role=tablist] [role=tab][data-sec="${id}"]`; // FW
export const SEC_BADGE = '.ifl-sec-badge';                // FW: a section's count (Warnings in force)

// ---- the tab bar (FW) ----
export const TAB = 'nav#tabs .ifl-tab[data-tab]';         // FW: + aria-current ("page" on tab screens, "true" for Apps in an app)
export const tab = (id) => `nav#tabs .ifl-tab[data-tab="${id}"]`; // FW: today, chats, apps, you

// ---- sheets, search, toast, error (FW) ----
export const SHEET_OPEN = 'dialog.ifl-sheet[open]';       // FW
export const SHEET_TITLE = 'dialog.ifl-sheet[open] h2';   // FW
export const SHEET_CLOSE = 'dialog.ifl-sheet[open] [data-close]'; // FW
export const sheet = (name) => `dialog.ifl-sheet[data-sheet="${name}"]`; // FW: open(spec).sheet → data-sheet
//   (every sheet's name is fixed here: search, connector, places, confirm-place, wxsettings, day, detail, warning, credits)
export const CONNECTOR_SHEET = 'dialog.ifl-sheet[data-sheet=connector]'; // FW: connectors.openConnector(F, app) (You's Connected Apps rows, Apps)
export const SEARCH_SHEET = 'dialog.ifl-sheet[data-sheet=search]'; // FW
export const SEARCH_INPUT = 'dialog.ifl-sheet[data-sheet=search] input[type=search]'; // FW
export const SEARCH_RESULT = 'dialog.ifl-sheet[data-sheet=search] [role=option]'; // FW
export const TOAST = '.ifl-toast';                        // FW
export const ERROR = '.ifl-error';                        // FW: a module that didn't open
export const ERROR_RETRY = '.ifl-error [data-act=retry]'; // FW: Try Again
export const ERROR_OWN = '.ifl-error [data-act=own]';     // FW: Open Weather on Its Own
export const ERROR_RELOAD = '.ifl-error [data-act=reload]'; // FW: Reload (after a second failure)

// ---- Today, Apps and You (TD) ----
export const TODAY = 'main#today';                        // TD
export const APPS = 'main#apps';                          // TD
export const YOU = 'main#you';                            // TD
export const YOU_APPS = '#yfBody #youApps';               // TD: Connected Apps (W3: in its folder's sheet, #sh-youfolder)
export const YOU_APP_ROW = '#yfBody #youApps [data-app]'; // TD: a Connected Apps row (tap → connectors.openConnector → CONNECTOR_SHEET)
export const youAppRow = (app) => `#yfBody #youApps [data-app="${app}"]`; // TD: weather, chats, fitness, markets, mail
export const YOU_NOTIFY = '#youApps2';                    // TD: From Each App (each app's notifications; Today 1.19's #youNotify is this phone's, the morning's and quiet hours')
export const SH_WXNOTIFY = 'dialog#sh-wxnotify';          // TD: Weather Notifications
export const APP_TILE = '.ifl-tile[data-app]';            // TD: Apps tiles
export const appTile = (app) => `.ifl-tile[data-app="${app}"]`; // TD: weather, chats, fitness, markets, mail
export const TODAY_WX_CARD = 'main#today .tcard[data-app="weather"]'; // TD: Today's weather card (cards.js markup, as today)
export const TODAY_WX_OPEN = 'main#today .tcard[data-app="weather"] a.tc-head'; // TD: the card's head link (opens Weather)
export const TODAY_WX_WARN = 'main#today .tcard[data-app="weather"] a.wx-warn'; // TD: the card's warning chip (→ that place's Warnings)

// ---- Weather's screen (WX: the frame of it; WV: what's in Now, 16 Days, Warnings) ----
export const M_WEATHER = '#m-weather';                // FW makes it, WX mounts in it
export const WX_SEC = 'section.wx-sec[data-sec]';         // WX
export const wxSec = (id) => `section.wx-sec[data-sec="${id}"]`; // WX: now, days, radar, warnings
export const WX_HERO = '.wx-hero';                        // WV
export const WX_ALERTS = '.wx-alerts';                    // WV: the warnings slot under the hero
export const WX_CREDITS = '.wx-credits';                  // WV: "Learn more about weather data and map data"
export const RADAR_MAP = '.radar-map';                    // WX
// Now (WV, now.js)
export const NOW_SEND = 'section.wx-sec[data-sec="now"] .wx-hero [data-act=send]'; // WV places fw.sendButton()'s button (data-act=send, FW) in the hero
export const NOW_RETRY = 'section.wx-sec[data-sec="now"] .wx-hero [data-act=retry]'; // WV: the hero's Retry, while the forecast failed (S.error)
export const NOW_REFRESH = 'section.wx-sec[data-sec="now"] [data-act=refresh]'; // WV: the foot's "Refresh" (core.refresh())
export const NOW_METRIC = 'section.wx-sec[data-sec="now"] [data-key=metric]'; // WV: Next 48 hours' ui.seg, options segValue("temp"|"rain"|"wind")
export const DETAIL_TILE = 'section.wx-sec[data-sec="now"] [data-detail]'; // WV: a Right now tile, the tappable element (→ open.detail(kind))
export const detailTile = (kind) => `section.wx-sec[data-sec="now"] [data-detail="${kind}"]`; // WV: kind = weather/detail.js's: feels, wind, humidity, rain, pressure, visibility, uv, air, sun, moon, sea
// 16 Days (WV, days.js)
export const DAYS_BY = 'section.wx-sec[data-sec="days"] [data-key=daysby]'; // WV: the "Days by" ui.seg, options segValue("temp"|"rain"|"wind")
export const DAY_ROW = 'section.wx-sec[data-sec="days"] [data-day]'; // WV: one per day (16), the tappable row (→ open.day(key))
export const dayRow = (key) => `section.wx-sec[data-sec="days"] [data-day="${key}"]`; // WV: key "YYYY-MM-DD", the place's date
// Warnings (WV, warnings.js)
export const WARNING_ROW = 'section.wx-sec[data-sec="warnings"] [data-warning]'; // WV: the tappable row (→ open.warning(w))
export const warningRow = (i) => `section.wx-sec[data-sec="warnings"] [data-warning="${i}"]`; // WV: i = 0-based index in the list as shown (official in force first, then alert insights)
export const WARNINGS_EMPTY = 'section.wx-sec[data-sec="warnings"] .ifl-empty[data-empty]'; // WV: ui.empty(), only when there are no rows
export const warningsEmpty = (which) => `section.wx-sec[data-sec="warnings"] .ifl-empty[data-empty="${which}"]`; // WV: "none" (wx.official is []), "unavailable" (wx.official is null)
// Weather's sheets (WV), opened through fw.sheet.open({ sheet: <name>, … })
export const DAY_SHEET = 'dialog.ifl-sheet[data-sheet=day]';         // WV: days.openDay(ctx, key)
export const DETAIL_SHEET = 'dialog.ifl-sheet[data-sheet=detail]';   // WV: wxui.openDetail(ctx, kind)
export const WARNING_SHEET = 'dialog.ifl-sheet[data-sheet=warning]'; // WV: warnings.openWarning(ctx, w)
export const CREDITS_SHEET = 'dialog.ifl-sheet[data-sheet=credits]'; // WV: wxui.openCredits(ctx, which)

// ---- Places (WX) ----
export const PLACES_SHEET = 'dialog.ifl-sheet[data-sheet=places]'; // WX
export const PLACE_ROW = 'dialog.ifl-sheet[data-sheet=places] [data-place]'; // WX: data-place = index in wx:places
export const placeRow = (i) => `dialog.ifl-sheet[data-sheet=places] [data-place="${i}"]`; // WX
export const PLACE_CURRENT = 'dialog.ifl-sheet[data-sheet=places] [data-place][aria-current="true"]'; // WX: ticked
export const PLACES_FIND = 'dialog.ifl-sheet[data-sheet=places] input[type=search]'; // WX: Find a place
export const PLACES_FOUND = 'dialog.ifl-sheet[data-sheet=places] [data-found]'; // WX: a result
export const PLACES_LOCATE = 'dialog.ifl-sheet[data-sheet=places] [data-act=locate]'; // WX: Use My Location
export const PLACES_EDIT = 'dialog.ifl-sheet[data-sheet=places] [data-act=edit]'; // WX
export const PLACE_DELETE = '[data-act=delete]';          // WX: inside a place row, in Edit
export const PLACE_UP = '[data-act=up]';                  // WX: inside a place row, in Edit
export const PLACE_DOWN = '[data-act=down]';              // WX: inside a place row, in Edit
export const CONFIRM_SHEET = 'dialog.ifl-sheet[data-sheet=confirm-place]'; // WX
export const CONFIRM_ADD = 'dialog.ifl-sheet[data-sheet=confirm-place] [data-act=add]'; // WX
export const CONFIRM_LOOK = 'dialog.ifl-sheet[data-sheet=confirm-place] [data-act=look]'; // WX: Just Look

// ---- Weather Settings (WS) ----
export const WXSETTINGS = 'dialog.ifl-sheet[data-sheet=wxsettings]'; // WS
export const WX_PAGES = Object.freeze(['units', 'arrange', 'best', 'commute', 'solar', 'forecast']); // WS
export const wxPage = (page) => `dialog.ifl-sheet[data-sheet=wxsettings] [data-page="${page}"]`; // WS: a pushed page
export const wxGo = (page) => `dialog.ifl-sheet[data-sheet=wxsettings] [data-go="${page}"]`; // WS: its row on the list
export const wxSetting = (key) => `dialog.ifl-sheet[data-sheet=wxsettings] [data-key="${key}"]`; // WS: a wx:settings key's control
export const segValue = (v) => `[role=radio][data-value="${v}"]`; // FW (ui.seg): an option of a segmented control
export const WX_NOTIFY_ROW = 'dialog.ifl-sheet[data-sheet=wxsettings] a[href="/#you=notify-weather"]'; // WS

// ==== Stages 2–4 (batch j0: s2/handoff.md B0 step 4, s4/spec.md §10.2; roof/s24-contracts.md). Gain only. ====

// ---- the modules' screens (FW keeps each #m-<app> stable across pane/full-screen presentation) ----
// Use the stable ID for identity; native main and pane region semantics are asserted separately.
export const M_MARKETS = '#m-markets';                // FW makes it, MK mounts in it
export const M_FITNESS = '#m-fitness';                // FW makes it, FXA mounts in it
export const M_MAIL = '#m-mail';                      // FW makes it, MM mounts in it
export const mScreen = (app) => `#m-${app}`;          // FW
export const FX_DROP = M_FITNESS;                         // FXA: Fitness's drop target (S2-D12)
// header acts (FW's buttons, data-act = the icon)
export const HD_PLUS = hdAct('plus');                     // MK: Add a Stock
export const HD_UPLOAD = hdAct('upload');                 // FXA: Add Files
export const HD_COMPOSE = hdAct('compose');               // MM: Mail's Write (S4-D26)
//   (Fitness Settings is HD_SETTINGS, as Weather Settings is)

// ---- Markets (MK) ----
export const MK_SEC = 'section.mk-sec[data-sec]';         // MK
export const mkSec = (id) => `section.mk-sec[data-sec="${id}"]`; // MK: today, holdings, news
export const mkRow = (sym) => `.m-markets [data-k=holding][data-sym="${sym}"]`; // MK: a holding's row
export const MK_EDIT = '.m-markets [data-k=edit]';        // MK: Holdings' Edit (reorder, S2-D19)
export const mkMove = (sym, dir) => `.m-markets [data-k="move-${dir}"][data-sym="${sym}"]`; // MK: dir up | down
export const MK_HERO = '.m-markets [data-k=portfolio]';   // MK: Today's portfolio card
export const MK_PORTFOLIO_SEND = '.m-markets [data-k=portfolio] [data-act=send]'; // MK (fw.sendButton's button)
export const MK_STOCK_SEND = 'dialog.ifl-sheet[data-sheet=stock] [data-act=send]'; // MK
export const MK_STOCK_REMOVE = 'dialog.ifl-sheet[data-sheet=stock] [data-k=remove]'; // MK
export const MK_ALERT = 'dialog.ifl-sheet[data-sheet=stock] input[data-k=alert]'; // MK: the price alert's percent
export const MK_ADD_INPUT = 'dialog.ifl-sheet[data-sheet=add-stock] input[data-k=find]'; // MK: focused in the tap (RI9)
export const MK_ADD_RESULT = 'dialog.ifl-sheet[data-sheet=add-stock] [data-k=result][data-sym]'; // MK
export const MK_ABOUT = '.m-markets [data-k=about]';      // MK: opens mk-about
export const mkStory = (id) => `.m-markets [data-k=story][data-id="${id}"]`; // MK: a News story's row
export const MK_ACCOUNT_ROW = '.m-markets [data-k=account]'; // MK: an account's row (→ mk-account)
//   Markets' sheets (fw.sheet.open({ sheet })): stock, add-stock, holding, income, isa, vs, story, mk-account, mk-about

// ---- Fitness (FXA: core and Today) ----
export const FX_SEC = 'section.fx-sec[data-sec]';         // FXA
export const fxSec = (id) => `section.fx-sec[data-sec="${id}"]`; // FXA: today, activities, progress
export const fxDay = (day) => `.m-fitness [data-k=day][data-day="${day}"]`; // FXA: day YYYY-MM-DD (the strip)
export const FX_GRID_DAY = '.m-fitness .gday[draggable]'; // FXA: a week grid's day (drag to swap)
export const FX_DAYCARD = '.m-fitness [data-k=daycard]';  // FXA: Today's day card
export const FX_FILES = '.m-fitness input[type=file][data-k=files]'; // FXA: Add Files' picker
export const fxOffer = (id, act) => `.m-fitness [data-offer="${id}"] [data-k="${act}"]`; // FXA: act keep | undo
export const FX_SESSION_SEND = '.m-fitness [data-k=daycard] [data-act=send]'; // FXA
// ---- Fitness (FXB: the sheets) ----
export const fxAct = (id) => `.m-fitness [data-k=act][data-id="${id}"]`; // FXB: an activity's row
export const fxSettingsPage = (id) => `dialog.ifl-sheet[data-sheet=fxsettings] [data-page="${id}"]`; // FXB
export const FX_STRAVA = 'dialog.ifl-sheet[data-sheet=fxsettings] a[data-k=strava]'; // FXB: a real link (S2-D13)
export const FX_ACT_MAP = 'dialog.ifl-sheet[data-sheet=act] [data-k=map]'; // FXB
export const FX_ACT_SHARE = 'dialog.ifl-sheet[data-sheet=act] [data-k=share]'; // FXB
//   Fitness's sheets: act, act-map, act-share, form, upload, session, workout, fx-day, move, workouts, rhythm-setup,
//   send-device, power, training, engine, year, offer, fxsettings

// ---- Today, Apps and You (TD's markup, unchanged; FW for You's switch) ----
export const TODAY_MK_CARD = 'main#today .tcard[data-app="markets"]'; // TD
export const TODAY_MK_OPEN = 'main#today .tcard[data-app="markets"] a.tc-head'; // TD
export const TODAY_FX_CARD = 'main#today .tcard[data-app="fitness"]'; // TD
export const TODAY_FX_OPEN = 'main#today .tcard[data-app="fitness"] a.tc-head'; // TD
export const TODAY_MAIL_CARD = 'main#today .tcard[data-app="mail"]'; // MT (Mail's card, once its drawer's in)
export const YOU_MK_WRAP = '#youApps2 [data-app=markets] [data-k=wrap]'; // FW: Markets' Evening Wrap switch (in From Each App)
export const SH_MAILNOTIFY = 'dialog#sh-mailnotify';      // B0-b (markup), MT (its logic): Mail Notifications

// ---- Mail (stage 4: MM the list, MR the reader and sheets, MB the body frame) ----
export const MAIL_THREAD = '.m-mail [data-thread]';       // MM: a row, data-thread = the thread's id
export const mailThread = (id) => `.m-mail [data-thread="${id}"]`; // MM
export const MAIL_BODY = '.m-mail iframe.mail-body';      // MB: a message's body, framed from Mail's own address
export const mailAct = (act) => `.m-mail [data-act="${act}"]`; // MM/MR: done, later, reply, send, undo, compose
export const MAIL_DONE = '.m-mail [data-act=done]';       // MM
export const MAIL_LATER = '.m-mail [data-act=later]';     // MM
export const MAIL_REPLY = '.m-mail [data-act=reply]';     // MR
export const MAIL_SEND = '[data-act=send]';               // MR: in mail-compose (sheet(MAIL_SHEETS.compose) + ' ' + MAIL_SEND)
export const MAIL_UNDO = '[data-act=undo]';               // MM: in the toast or the row
export const MAIL_SHEETS = Object.freeze({                // MM/MR: Mail's sheets, by name (data-sheet)
  views: 'mail-views', later: 'mail-later', compose: 'mail-compose', rowmenu: 'mail-rowmenu', unsub: 'mail-unsub',
  viewer: 'mail-viewer', settings: 'mail-settings', confirm: 'mail-confirm',
});
export const mailSheet = (k) => `dialog.ifl-sheet[data-sheet="${MAIL_SHEETS[k] || k}"]`; // MM/MR
// ---- the framework's own sheet of stages 2–4 ----
export const SIGNOUT_ANYWAY = 'dialog.ifl-sheet[data-sheet=confirm]'; // FW (j0): "Sign Out Anyway?" (C10)

// ---- stage 3: Chats (roof/s3/spec.md §2, §10.2; frozen by stage 3's B0: may only gain) ----
// Chats' module draws in #m-chats > .m-chats (FW makes it, UI-A mounts in it). Owners: UI-A (entry, list, Friends,
// chat, lock), UI-B (sheets), HOST (tab bar, Today), FW (the frame's own, as above).
export const M_CHATS = '#m-chats';                    // FW makes it, UI-A mounts in it
export const CH_SEC = 'section.ch-sec[data-sec]';         // UI-A
export const chSec = (id) => `section.ch-sec[data-sec="${id}"]`; // UI-A: chats, friends
export const CH_ROW = '.m-chats [data-k=row][data-id]';   // UI-A: a chat's or group's row on the list
export const chRow = (id) => `.m-chats [data-k=row][data-id="${id}"]`; // UI-A
export const CH_ROW_UNREAD = '[data-k=unread]';           // UI-A: inside a row, its unread count
export const CH_AIR = '.m-chats [data-k=air]';            // UI-A: In the Air (pigeons on)
export const chAir = (id) => `.m-chats [data-k=air] [data-id="${id}"]`; // UI-A: one letter in the air
export const CH_REQUESTS = '.m-chats [data-k=requests]';  // UI-A: the requests banner (opens requests)
export const CH_KEYWARN = '.m-chats [data-k=keywarn]';    // UI-A: "your key doesn't match" (myKeyWarn)
export const CH_FRIEND = '.m-chats [data-k=friend][data-id]'; // UI-A: a friend's row in Friends
export const chFriend = (id) => `.m-chats [data-k=friend][data-id="${id}"]`; // UI-A
export const CH_ADD = '.m-chats [data-act=addfriend]';    // UI-A: Add Friend (opens addfriend)
export const CH_CHAT = '.m-chats .ch-chat';               // UI-A: the chat host (a chat or group shown)
export const CH_SCROLLER = '.m-chats .ch-chat [data-k=scroller]'; // UI-A: the chat's one scroller (S3-D17)
export const CH_BUBBLE = '.m-chats [data-k=msg][data-id]'; // UI-A: a message (data-from = me | them | a member's id)
export const chBubble = (id) => `.m-chats [data-k=msg][data-id="${id}"]`; // UI-A
export const CH_COMPOSER = '.m-chats [data-k=composer]';  // UI-A: the composer (fixed under the scroller)
export const CH_INPUT = '.m-chats [data-k=composer] textarea'; // UI-A: what you type
export const CH_SEND_BTN = '.m-chats [data-k=composer] [data-act=send]'; // UI-A
export const CH_TYPING = '.m-chats [data-k=typing]';      // UI-A: "typing…" in the open chat
export const CH_STATE = '.m-chats [data-state]';          // UI-A: a state's screen: data-state = signin | key | locked | ended | offline | device | error
export const chState = (s) => `.m-chats [data-state="${s}"]`; // UI-A
export const CH_SIGNIN = '.m-chats [data-act=signin]';    // UI-A: Sign In (signin, ended)
export const CH_UNLOCK = '.m-chats [data-act=unlock]';    // UI-A: Unlock Chats (key: → /chats/in/#signin-start&then=…)
export const CH_LOCK = '.m-chats .ch-lock';               // UI-A: the lock screen (S3-D14)
export const CH_LOCK_OPEN = '.m-chats .ch-lock [data-act=unlock-lock]'; // UI-A: the passkey check that lets you in
export const CH_QR = '.m-chats [data-state=device] [data-k=qr]'; // UI-A: "Chats is on your phone"'s code
export const CH_RETRY = '.m-chats [data-act=retry]';      // UI-A: Try Again ("Chats couldn’t open")
export const CH_OWN = '.m-chats [data-act=own]';          // UI-A: Open Chats on Its Own
export const HD_NEWCHAT = hdAct('compose');               // UI-A: New Chat (the Chats header's act)
export const HD_CHATSETTINGS = hdAct('settings');         // UI-A: Chat Settings (the Chats header's act)
export const HD_INFO = hdAct('info');                     // UI-A: a chat's Info (opens friendinfo or groupinfo)
export const TAB_BADGE = 'nav#tabs .ifl-tab[data-tab="chats"] .ifl-tab-badge'; // HOST: the Chats tab's unread count (a number only)
export const TABS_AWAY = 'nav#tabs.away';                 // HOST: the tab bar out of the way (a chat's composer up)
// (Chats' sheets by name, data-sheet; each opened by its file's opener, spec §2.2: list.js, friends.js UI-A; the rest UI-B)
export const CH_SHEETS = Object.freeze({
  newmsg: 'newmsg', newgroup: 'newgroup', requests: 'requests', addfriend: 'addfriend',                     // UI-A
  send: 'send',                                                                                             // UI-B (send.js)
  friendinfo: 'friendinfo', groupinfo: 'groupinfo', groupadd: 'groupadd', grouprename: 'grouprename', safety: 'safety',
  whohas: 'whohas', view: 'view', schedule: 'schedule', timetalk: 'timetalk', fromapps: 'fromapps', hold: 'hold', // UI-B (sheets.js)
  flightlog: 'flightlog', passport: 'passport', map: 'map', skies: 'skies', lookup: 'lookup', way: 'way', moonpick: 'moonpick',
  birds: 'birds', bird: 'bird', birdname: 'birdname', loft: 'loft', feathers: 'feathers', news: 'news',     // UI-B (flight.js)
  gifs: 'gifs', voice: 'voice', scan: 'scan', chatsettings: 'chatsettings',                                  // UI-B (media.js, scan.js, settings.js)
});
export const chSheet = (k) => `dialog.ifl-sheet[data-sheet="${CH_SHEETS[k] || k}"]`; // UI-A/UI-B
export const CH_SEND_ROW = 'dialog.ifl-sheet[data-sheet=send] [data-k=to][data-id]'; // UI-B: a friend to send to
export const chSendRow = (id) => `dialog.ifl-sheet[data-sheet=send] [data-k=to][data-id="${id}"]`; // UI-B
export const CH_SEND_GO = 'dialog.ifl-sheet[data-sheet=send] [data-act=sendgo]'; // UI-B: the sheet's Send
export const CH_SEND_WORDS = 'dialog.ifl-sheet[data-sheet=send] [data-act=words] input'; // UI-B: the words to go with the card (Chat's #f-sendwords); added at integration for hubshare
export const CH_SEND_STATE = 'dialog.ifl-sheet[data-sheet=send] [data-state]'; // UI-B: a not-ready Send: signin | key | locked | device | offline
export const CH_PRIVACY = 'dialog.ifl-sheet[data-sheet=chatsettings] a[href="/chats/in/#account"]'; // UI-B: Privacy & Security (Chat's own page)
export const CH_SAFETY_DIGITS = 'dialog.ifl-sheet[data-sheet=safety] [data-k=digits]'; // UI-B
// (Today's own hooks, above, stay as they are with Chats under the roof)
