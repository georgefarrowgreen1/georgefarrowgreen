// Chats' media: GIFs, voice pigeons, photos (MediaRecorder and the picker here; the Blob sealed in the core; object URLs
// made and revoked only here, never in the core).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-B's to write.
// openGifs(ctx, id) and recordVoice(ctx, id) open their sheets (gifs, voice) and return the handle; pickPhoto(ctx, id) →
// Promise<{ id } | null> (the photo chosen and sent through svc.call("sendBlob", …), or null: none chosen).
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function openGifs(ctx, id) { void id; return stub(ctx, "gifs", "GIFs"); }
export function recordVoice(ctx, id) { void id; return stub(ctx, "voice", "Voice Pigeon"); }
export function pickPhoto(ctx, id) { void ctx; void id; return Promise.resolve(null); }
