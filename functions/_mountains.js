/* ---------- passes through the mountains ----------
   Where the land is high (functions/_elevgrid.js) a pigeon goes through a pass
   rather than over the top: one of these, the known passes through the great
   ranges, when there's one near; else the lowest way across it can find.
   [name, lat, lon]. */
export const PASSES = [
  // the Alps
  ["Col de Tende", 44.15, 7.56], ["Mont Cenis Pass", 45.26, 6.9], ["Great St Bernard Pass", 45.87, 7.17], ["Simplon Pass", 46.25, 8.03],
      ["Gotthard Pass", 46.56, 8.56], ["San Bernardino Pass", 46.5, 9.17], ["Reschen Pass", 46.83, 10.51], ["Brenner Pass", 47.0, 11.51],
      ["Radstädter Tauern Pass", 47.25, 13.56], ["Semmering Pass", 47.63, 15.83],
  // the Pyrenees
  ["Roncesvalles Pass", 43.02, -1.33], ["Somport Pass", 42.79, -0.53], ["Col de Puymorens", 42.55, 1.82], ["Col du Perthus", 42.46, 2.86],
  // the Himalayas
  ["Khunjerab Pass", 36.85, 75.43], ["Karakoram Pass", 35.51, 77.82], ["Shipki La", 31.82, 78.75], ["Nathu La", 27.39, 88.83],
  // the Rockies
  ["Yellowhead Pass", 52.88, -118.46], ["Kicking Horse Pass", 51.45, -116.28], ["Rogers Pass", 51.3, -117.52], ["Marias Pass", 48.32, -113.35],
      ["South Pass", 42.36, -108.92], ["Loveland Pass", 39.66, -105.88],
  // the Andes
  ["Paso de Jama", -23.24, -67.03], ["Paso de los Libertadores", -32.82, -70.08], ["Paso Pehuenche", -35.98, -70.4],
      ["Paso Cardenal Samoré", -40.7, -71.94], ["Ticlio Pass", -11.6, -76.2],
  // the Caucasus
  ["Cross Pass", 42.52, 44.45], ["Mamison Pass", 42.7, 43.78],
  // more ranges
  ["Hardanger Pass", 60.53, 7.5], ["Dovrefjell Pass", 62.27, 9.55],                              // Norway's mountains
  ["Tizi n'Tichka Pass", 31.29, -7.38], ["Tizi n'Test Pass", 30.87, -8.38],             // the Atlas
  ["Predeal Pass", 45.5, 25.58], ["Dukla Pass", 49.4, 21.7],   // the Carpathians
  ["Kaimai Saddle", -37.85, 175.95], ["Arthur's Pass", -42.94, 171.56], ["Haast Pass", -44.1, 169.35],   // New Zealand
  ["Usui Pass", 36.36, 138.66], ["Nomugi Pass", 36.08, 137.71],                          // Japan's Alps
  ["Khyber Pass", 34.09, 71.1], ["Salang Pass", 35.32, 69.03],                           // the Hindu Kush
  ["Torugart Pass", 40.55, 75.39], ["Irkeshtam Pass", 39.68, 73.9],                      // the Tian Shan
  ["Tehachapi Pass", 35.1, -118.45], ["Donner Pass", 39.32, -120.33], ["Snoqualmie Pass", 47.42, -121.41],   // the Sierra and the Cascades
  ["Paytak Pass", 34.25, 46.05], ["Tarmaber Pass", 9.85, 39.73],                                // the Zagros, the Ethiopian highlands
  ["Dead Horse Gap", -36.52, 148.27],                                                              // the Snowy Mountains
];
