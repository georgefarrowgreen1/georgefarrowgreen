// Weather's Places sheet (One roof, spec §7.1, WX, UI8, UI10) and the "Add “X” to your places?" sheet. B0's stub
// (STUB = true); WX writes it.
// Frozen: openPlaces(ctx) → sheet Handle | null: data-sheet=places; your places as one-tap rows [data-place=<index in
//   S.places>] at the top (the current one aria-current="true", ticked, each with core.peek's temperature); Edit
//   ([data-act=edit]: delete [data-act=delete], Move Up/Down [data-act=up|down] with an aria-live line); Find a place
//   (input[type=search], focused in the tap; results [data-found]); Use My Location ([data-act=locate]).
// confirmPlace(ctx, p) → Promise<"add" | "look" | null>: data-sheet=confirm-place, buttons [data-act=add] (Add) and
//   [data-act=look] (Just Look); null when closed otherwise.
import { searchPlaces, nameOf } from "../data.js";
import { weatherIcon } from "../icons.js";
import { makeFormat } from "../format.js";

export const STUB = true;
export function openPlaces(ctx) { return null; }
export async function confirmPlace(ctx, p) { return null; }
