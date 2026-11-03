// Chats' QR scan (network-only).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-B's to write.
// Each opener opens its sheet (fw.sheet.open, data-sheet as roofhooks.mjs names it) and returns the handle;
// ctx = { fw, svc, store, open } (open.*: the bound openers). The stub opens a placeholder sheet only.
import * as jsqr from "../jsqr.js";
void jsqr;
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function openScan(ctx) { return stub(ctx, "scan", "Scan a Code"); }
