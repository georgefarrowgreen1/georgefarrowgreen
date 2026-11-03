// Chats' Send (S3-D7): Chat's send sheet in a framework sheet, the card checked as engineCard checks it, the rows from
// svc.call("share", card, words), the ranking from "rank", sealing by "sendRun" (progress from the send patches).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-B's to write.
// openSend(ui, svc, { card, words, to }) → Promise<{ ok: true, say } | { ok: false, why }> (ui: the Chats fw; on sent,
// ui.toast with "Sent to Pat. You’re still here"; not ready: S3-D7's five states). The stub's sheet resolves
// { ok: false, why: "no" } when it closes.
import { normCard } from "../cards.js";
import { cardHtml } from "../cardview.js";
void normCard; void cardHtml;
export const STUB = true;

export function openSend(ui, svc, { card = null, words = "", to = null } = {}) {
  void svc; void card; void words; void to;
  return new Promise((ok) => {
    ui.sheet.open({ sheet: "send", title: "Send", body: ui.ui.empty({ title: "Send", body: "Not built yet." }), onClose: () => ok({ ok: false, why: "no" }) });
  });
}
