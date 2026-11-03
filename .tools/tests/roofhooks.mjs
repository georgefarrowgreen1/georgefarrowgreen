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
export const YOU_APPS = '#youApps';                       // TD: Connected Apps
export const YOU_NOTIFY = '#youNotify';                   // TD: Notifications by App
export const SH_WXNOTIFY = 'dialog#sh-wxnotify';          // TD: Weather Notifications
export const APP_TILE = '.ifl-tile[data-app]';            // TD: Apps tiles
export const appTile = (app) => `.ifl-tile[data-app="${app}"]`; // TD: weather, chats, fitness, markets, mail

// ---- Weather's screen (WX: the frame of it; WV: what's in Now, 16 Days, Warnings) ----
export const M_WEATHER = 'main#m-weather';                // FW makes it, WX mounts in it
export const WX_SEC = 'section.wx-sec[data-sec]';         // WX
export const wxSec = (id) => `section.wx-sec[data-sec="${id}"]`; // WX: now, days, radar, warnings
export const WX_HERO = '.wx-hero';                        // WV
export const WX_ALERTS = '.wx-alerts';                    // WV: the warnings slot under the hero
export const WX_CREDITS = '.wx-credits';                  // WV: "Learn more about weather data and map data"
export const RADAR_MAP = '.radar-map';                    // WX

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
