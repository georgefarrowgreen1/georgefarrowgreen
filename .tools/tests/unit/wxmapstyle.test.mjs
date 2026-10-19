// The radar's vector map (weather/mapstyle.js): drawn from OpenFreeMap's tiles in the OpenMapTiles schema, with
// only fonts it serves, borders on land only, and the names drawn above the rain (radar.js puts the radar's
// frames under ABOVE_RAIN: everything under it is the map, everything from it up is names).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapStyle, ABOVE_RAIN, TILES, GLYPHS } from "../../../weather/mapstyle.js";

const SCHEMA = ["water", "waterway", "landcover", "landuse", "mountain_peak", "park", "boundary", "aeroway", "transportation", "building", "water_name", "transportation_name", "place", "housenumber", "poi", "aerodrome_label"];
const FONTS = ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"];

test("OpenFreeMap's map, its fonts, and its shaded relief", () => {
  const s = mapStyle();
  assert.equal(s.version, 8);
  assert.equal(TILES, "https://tiles.openfreemap.org/planet");
  assert.deepEqual(s.sources.map, { type: "vector", url: TILES });
  assert.equal(s.sources.relief.type, "raster");
  assert.match(s.sources.relief.tiles[0], /^https:\/\/tiles\.openfreemap\.org\/natural_earth\/ne2sr\/\{z\}\/\{x\}\/\{y\}\.png$/);
  assert.equal(s.glyphs, GLYPHS);
  assert.match(GLYPHS, /^https:\/\/tiles\.openfreemap\.org\/fonts\/\{fontstack\}\/\{range\}\.pbf$/);
});

test("its layers: each once, from the schema, in fonts the server has", () => {
  const { layers } = mapStyle(), ids = layers.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(layers[0].type, "background");
  for (const l of layers.filter((x) => x.source === "map")) assert.ok(SCHEMA.includes(l["source-layer"]), `${l.id}: ${l["source-layer"]}`);
  for (const l of layers.filter((x) => x.type === "symbol")) for (const f of l.layout["text-font"]) assert.ok(FONTS.includes(f), `${l.id}: ${f}`);
});

test("the names above the rain, the map under it", () => {
  const { layers } = mapStyle(), at = layers.findIndex((l) => l.id === ABOVE_RAIN);
  assert.ok(at > 0, "the first of the names is there");
  assert.ok(layers.slice(at).every((l) => l.type === "symbol"), "from it up, only names");
  assert.ok(layers.slice(0, at).every((l) => l.type !== "symbol"), "under it, no names");
});

test("borders on land only, and no tiny countries' names from afar", () => {
  const { layers } = mapStyle(), text = (x) => JSON.stringify(x);
  for (const l of layers.filter((x) => x["source-layer"] === "boundary")) assert.match(text(l.filter), /\["!=",\["get","maritime"\],1\]/, l.id);
  const countries = layers.find((l) => l.id === "countries");
  assert.match(text(countries.filter), /"MC".*"LI"/);
});
