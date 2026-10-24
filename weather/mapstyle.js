// The map under the radar, drawn on the phone from OpenFreeMap's vector map of OpenStreetMap (the OpenMapTiles
// schema), in the app's own style, after Apple's Weather map: by day (the phone light), near-white land and a pale
// grey-blue sea, roads in light greys, the names dark; at night (the phone dark), land and sea in quiet blue-greys,
// the names crisp and white. Either way the country faintly shaded, roads a whisper, borders only on land. The names
// are drawn last, above the rain (radar.js puts the radar's frames under the first of them), so they read through it.
// Pure: no page, no network.

export const TILES = "https://tiles.openfreemap.org/planet";
export const RELIEF = "https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
// the first of the layers drawn over the rain
export const ABOVE_RAIN = "water-names";
// the dashed box round the models' grid, in the map's ink
export const boxColour = (light) => (light ? DAY : NIGHT).box;

const NIGHT = {
  land: "#272b33", water: "#17263a", ice: "#30363f", green: "#232f2a", town: "#2d323c",
  motorway: "#4a5160", road: "#363c48", border: "rgba(222, 230, 245, 0.32)", region: "rgba(222, 230, 245, 0.13)",
  label: "#f4f6fa", label2: "rgba(235, 238, 245, 0.78)", label3: "rgba(235, 238, 245, 0.56)", sea: "#5f7896",
  halo: "rgba(8, 11, 17, 0.75)", box: "#ffffff",
  relief: { "raster-brightness-min": 0, "raster-brightness-max": 0.32, "raster-opacity": [2, 0.5, 5, 0.35, 7, 0] },
};
const DAY = {
  land: "#f5f4f1", water: "#dfe7ee", ice: "#ffffff", green: "#e3ecdc", town: "#edebe6",
  motorway: "#d2cfc8", road: "#e2dfd8", border: "rgba(60, 60, 67, 0.36)", region: "rgba(60, 60, 67, 0.16)",
  label: "#1c1c1e", label2: "rgba(28, 28, 30, 0.82)", label3: "rgba(60, 60, 67, 0.62)", sea: "#8d97a6",
  halo: "rgba(255, 255, 255, 0.9)", box: "#3c3c43",
  relief: { "raster-brightness-min": 0.72, "raster-brightness-max": 1, "raster-opacity": [2, 0.35, 5, 0.22, 7, 0] },
};
let C = NIGHT;
// the countries too small to name from afar (their capitals are named)
const TINY = ["MC", "AD", "LI", "SM", "VA", "GI", "MT", "LU"];
// a place's name: in English where the map has it, else in Latin letters, else its own
const NAME = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
const zoom = (...stops) => ["interpolate", ["linear"], ["zoom"], ...stops];
const lines = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const areas = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const points = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
// (a town's name over it, or where something's in the way, under or over it: the place's dot, mapgl.js)
const label = (id, filter, { font = "Noto Sans Regular", size, color = C.label, minzoom, maxzoom, caps = false, spacing = 0, width = 9, sort, moves = false } = {}) => ({
  id, type: "symbol", source: "map", "source-layer": "place", filter: ["all", points, ...filter], ...(minzoom != null ? { minzoom } : {}), ...(maxzoom != null ? { maxzoom } : {}),
  layout: { "text-field": NAME, "text-font": [font], "text-size": size, "text-max-width": width, "text-letter-spacing": spacing, "text-padding": 4,
    ...(moves ? { "text-variable-anchor": ["center", "top", "bottom"], "text-radial-offset": 1.25 } : {}),
    ...(caps ? { "text-transform": "uppercase" } : {}), ...(sort ? { "symbol-sort-key": sort } : {}) },
  paint: { "text-color": color, "text-halo-color": C.halo, "text-halo-width": 1.2, "text-halo-blur": 0.6 },
});

export function mapStyle(light = false) {
  C = light ? DAY : NIGHT;
  return {
    version: 8,
    name: light ? "Weather day" : "Weather night",
    glyphs: GLYPHS,
    sources: {
      map: { type: "vector", url: TILES },
      relief: { type: "raster", tiles: [RELIEF], tileSize: 256, maxzoom: 5 },      // (faint, so coarse tiles do: each is a fifth of a megabyte at 6)
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": C.land } },
      // the lie of the land, faintly (Natural Earth's shaded relief, its colour taken out)
      { id: "relief", type: "raster", source: "relief", maxzoom: 7,       // (only zoomed well out: closer in, it can hardly be seen and costs the most)
        paint: { "raster-saturation": -1, "raster-contrast": 0.1, "raster-brightness-min": C.relief["raster-brightness-min"], "raster-brightness-max": C.relief["raster-brightness-max"], "raster-opacity": zoom(...C.relief["raster-opacity"]), "raster-fade-duration": 0 } },
      { id: "ice", type: "fill", source: "map", "source-layer": "landcover", filter: ["all", areas, ["match", ["get", "subclass"], ["glacier", "ice_shelf"], true, false]],
        paint: { "fill-color": C.ice, "fill-opacity": 0.8 } },
      { id: "green", type: "fill", source: "map", "source-layer": "landcover", minzoom: 6, filter: ["all", areas, ["match", ["get", "class"], ["wood", "forest"], true, false]],
        paint: { "fill-color": C.green, "fill-opacity": zoom(6, 0, 8, 0.6) } },
      { id: "towns", type: "fill", source: "map", "source-layer": "landuse", minzoom: 5, filter: ["all", areas, ["match", ["get", "class"], ["residential", "suburb", "commercial", "industrial", "retail"], true, false]],
        paint: { "fill-color": C.town, "fill-opacity": zoom(5, 0, 7, 0.9) } },
      { id: "water", type: "fill", source: "map", "source-layer": "water", filter: ["all", areas, ["!=", ["get", "brunnel"], "tunnel"]], paint: { "fill-color": C.water } },
      { id: "rivers", type: "line", source: "map", "source-layer": "waterway", minzoom: 7, filter: ["all", lines, ["==", ["get", "class"], "river"], ["!=", ["get", "brunnel"], "tunnel"]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.water, "line-width": zoom(7, 0.6, 10, 1.6) } },
      // roads: the main ones, thin and quiet (the rain's what's to be seen)
      { id: "roads", type: "line", source: "map", "source-layer": "transportation", minzoom: 6, filter: ["all", lines, ["match", ["get", "class"], ["trunk", "primary"], true, false]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.road, "line-width": zoom(6, 0.4, 10, 1.4) } },
      { id: "motorways", type: "line", source: "map", "source-layer": "transportation", minzoom: 5, filter: ["all", lines, ["==", ["get", "class"], "motorway"], ["!=", ["get", "ramp"], 1]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.motorway, "line-width": zoom(5, 0.5, 7, 1, 10, 2) } },
      // borders on land only (not the lines out to sea)
      { id: "regions", type: "line", source: "map", "source-layer": "boundary", minzoom: 5, filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.region, "line-width": zoom(5, 0.6, 10, 1.1), "line-dasharray": [3, 3] } },
      { id: "borders", type: "line", source: "map", "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.border, "line-width": zoom(2, 0.6, 6, 1, 10, 1.6) } },
      // (the radar goes here)
      { id: ABOVE_RAIN, type: "symbol", source: "map", "source-layer": "water_name", filter: ["all", points, ["match", ["get", "class"], ["ocean", "sea"], true, false]],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": zoom(2, 11, 8, 14), "text-letter-spacing": 0.12, "text-max-width": 6 },
        paint: { "text-color": C.sea, "text-halo-color": C.halo, "text-halo-width": 1 } },
      label("villages", [["==", ["get", "class"], "village"]], { minzoom: 8.5, size: zoom(8.5, 10.5, 10, 12), color: C.label3, moves: true }),
      label("towns-names", [["==", ["get", "class"], "town"]], { minzoom: 6.5, size: zoom(6.5, 11, 10, 13.5), color: C.label2, sort: ["get", "rank"], moves: true }),
      // (the biggest cities a size up)
      label("cities", [["==", ["get", "class"], "city"]], { font: "Noto Sans Bold", minzoom: 3, sort: ["get", "rank"], moves: true,
        size: zoom(3, ["case", ["<=", ["get", "rank"], 2], 12.5, 11], 6, ["case", ["<=", ["get", "rank"], 3], 15, 13], 10, ["case", ["<=", ["get", "rank"], 5], 18, 16]) }),
      label("regions-names", [["==", ["get", "class"], "state"]], { minzoom: 4.5, maxzoom: 7.5, size: zoom(4.5, 10, 7, 11.5), color: C.label3, caps: true, spacing: 0.14, width: 9 }),
      label("countries", [["==", ["get", "class"], "country"], ["match", ["get", "iso_a2"], TINY, false, true]], { font: "Noto Sans Bold", maxzoom: 6.5, size: zoom(2, 10.5, 5, 13), color: C.label2, caps: true, spacing: 0.16, width: 7, sort: ["get", "rank"] }),
    ],
  };
}
