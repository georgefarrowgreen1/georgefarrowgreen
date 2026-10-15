# Geographic data for routing

One-off scripts that make `functions/_islands.data.js` and `functions/_elevgrid.data.js`.
Run from this folder with Node 20+:

```
npm i --no-save pngjs topojson-client
curl -sO https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-10m.json
node tiles.mjs ./tiles elev05.bin          # AWS Terrain Tiles (zoom 4) -> average height per 0.5° square
node islands.mjs land-10m.json islands.json # Natural Earth 10 m land -> islands out at sea, named
node encode.mjs islands.json elev05.bin ../../functions/_islands.data.js ../../functions/_elevgrid.data.js
```

Islands are named from the hand-made list in `functions/_islands.js` where
one's within 250 km, else by the country they belong to or are off.
