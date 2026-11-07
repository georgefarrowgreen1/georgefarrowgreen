// Demo plans belong to one account on this device. They are separate from completed
// activities and the account's training plan. This module never calls an API.
import { ROUTES } from './routes-catalog.js';
export { ROUTES };
const ids = new Set(ROUTES.map(r => r.id));
export const planKey = owner => `fitness:routes-demo:${owner}`;
export function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === day;
}
export function cleanPlan(p) {
  if (!p || p.v !== 1 || !ids.has(p.routeId) || !validDay(p.day) || typeof p.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) return null;
  return { v: 1, routeId: p.routeId, day: p.day, time: p.time };
}
export function readPlan(owner, storage) {
  if (!owner) return null;
  try { return cleanPlan(JSON.parse((storage ?? globalThis.localStorage).getItem(planKey(owner)))); } catch { return null; }
}
export function savePlan(owner, plan, storage) {
  const p = cleanPlan(plan);
  if (!owner || !p) throw new Error('Choose a route, date and departure time.');
  (storage ?? globalThis.localStorage).setItem(planKey(owner), JSON.stringify(p));
  return p;
}
export function clearPlan(owner, storage) {
  if (owner) (storage ?? globalThis.localStorage).removeItem(planKey(owner));
}
export function localDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
