// Chats' lock screen and veil (S3-D14): the passkey UV check in the page (lockCheck), a privacy veil, not a cipher.
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-A's to write.
// view(el, ctx) → { show(route), hide(), busy(), unmount() } (el: its section or host; ctx = { fw, svc, store, open }).
export const STUB = true;

export function view(el, ctx) {
  void ctx;
  return { show() { el.hidden = false; }, hide() { el.hidden = true; }, busy: () => false, unmount() { el.replaceChildren(); } };
}
