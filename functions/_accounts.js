// Accounts going: "Delete my account", the admin's delete, and one nobody has used for a year (functions/_retention.js).
import { db, DAY } from "./_pigeon.js";
import { removeFromGroups } from "./_groups.js";
import { dropReacts } from "./_reacts.js";
import { keepSentTo } from "./_retention.js";
import { dropAccount } from "./_wxpush.js";

import { avatarKey, posterKey } from "./_profile.js";
export { avatarKey };

export async function removeAccount(env, id) {
  await dropReacts(env, { user: id });
  await removeFromGroups(env, id);
  const D = await db(env);
  if (env.BIO_R2) await env.BIO_R2.delete([avatarKey(id), posterKey(id)]);
  const { results } = await D.prepare("SELECT id FROM pg_msgs WHERE photo = 1 AND (sender = ?1 OR recipient = ?1)").bind(id).all();
  if (env.BIO_R2 && results.length) await env.BIO_R2.delete(results.map((r) => `pigeon/${r.id}`));
  await D.batch([
    keepSentTo(D, id, Date.now()),
    D.prepare("DELETE FROM pg_msgs WHERE sender = ?1 OR recipient = ?1").bind(id),
    D.prepare("DELETE FROM pg_flyover WHERE sender = ?1 OR user_id = ?1").bind(id),
    D.prepare("DELETE FROM pg_birds WHERE owner = ?").bind(id),
    D.prepare("UPDATE pg_msgs SET via_ct = '', via_note = NULL, via_place = NULL, legs = NULL WHERE via = ?1").bind(id),     // a stopover with them: their copy, and where they were, go
    D.prepare("DELETE FROM pg_passport WHERE user_id = ?1").bind(id),
    // their pigeons' lines go; a pigeon of someone else's that went to them stays in that sender's log, unnamed
    D.prepare("DELETE FROM pg_flights WHERE sender = ?1").bind(id),
    D.prepare("UPDATE pg_flights SET recipient = NULL WHERE recipient = ?1").bind(id),
    D.prepare("DELETE FROM pg_postmarks WHERE user_id = ?1").bind(id),
    D.prepare("DELETE FROM pg_stamped WHERE user_id = ?1").bind(id),
    D.prepare("DELETE FROM pg_feathers WHERE user_id = ?1").bind(id),
    D.prepare("DELETE FROM pg_kit WHERE user_id = ?1").bind(id),
    D.prepare("DELETE FROM pg_streaks WHERE a = ?1 OR b = ?1").bind(id),
    D.prepare("UPDATE pg_invites SET used_by = NULL WHERE used_by = ?1").bind(id),
    D.prepare("UPDATE pg_gevents SET actor_name = 'A deleted account' WHERE actor = ?1").bind(id),
    D.prepare("UPDATE pg_gevents SET target_name = 'A deleted account' WHERE target = ?1").bind(id),
    D.prepare("DELETE FROM pg_links WHERE a = ?1 OR b = ?1").bind(id),
    D.prepare("DELETE FROM pg_passkeys WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_sessions WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_active WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_push WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_resets WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_events WHERE user_id = ?").bind(id),
    // their handle is held for 30 days, for no one, so no one can pose as them to their friends
    D.prepare("INSERT OR REPLACE INTO pg_handles_held (handle, user_id, until) SELECT handle, NULL, ? FROM pg_users WHERE id = ?").bind(Date.now() + 30 * DAY, id),
    D.prepare("DELETE FROM pg_handles_held WHERE user_id = ?").bind(id),
    D.prepare("DELETE FROM pg_users WHERE id = ?").bind(id),
  ]);
  // (and what the site's other apps kept with the account, now no session can add to it: functions/_account.js)
  await dropAccount(env, id);
}
