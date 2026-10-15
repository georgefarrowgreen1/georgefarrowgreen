/* ---------- islands, by name ----------
   The names islands are known by, [name, lat, lon]: the islands pigeons rest
   on (functions/_islands.data.js, every island out at sea in Natural Earth's
   10 m coastline) take the name of the nearest of these within 250 km (see
   .tools/geo). Big archipelagos have a point at each end. */
export const ISLANDS = [
  // (big archipelagos have a point at each end, so every island in them is named)
  ["the Azores", 39.45, -31.13], ["the Canary Islands", 28.4, -14.0], ["Hawaii", 19.6, -155.5], ["Cape Verde", 16.6, -22.9],
  ["the Galápagos", 0.4, -91.0], ["the Aleutian Islands", 52.0, 178.0], ["the Aleutian Islands", 54.0, -165.0], ["the Kuril Islands", 50.3, 155.5],
  ["the Bahamas", 22.0, -74.0], ["the Marquesas", -8.0, -140.6], ["the Tuamotus", -16.5, -143.0], ["the Solomon Islands", -8.0, 157.0],
  ["Svalbard", 79.5, 22.0], ["the Faroe Islands", 61.8, -6.9], ["the Maldives", 1.0, 73.2], ["the Seychelles", -9.4, 46.4],
  // the North Atlantic and the Arctic
  ["Iceland", 64.15, -21.94], ["the Faroe Islands", 62.01, -6.77], ["Shetland", 60.15, -1.15], ["Orkney", 58.98, -2.96],
  ["the Outer Hebrides", 57.76, -7.02], ["the Isle of Man", 54.15, -4.48], ["the Channel Islands", 49.45, -2.54],
  ["Jan Mayen", 70.98, -8.5], ["Svalbard", 78.22, 15.65], ["Bear Island", 74.43, 19.07], ["Greenland", 64.18, -51.72],
  ["Newfoundland", 47.56, -52.71], ["Sable Island", 43.93, -59.91], ["Bermuda", 32.3, -64.78],
  ["the Azores", 37.74, -25.67], ["Madeira", 32.65, -16.91], ["the Canary Islands", 28.29, -16.63],
  ["Cape Verde", 14.93, -23.51], ["the Bahamas", 25.05, -77.35], ["Puerto Rico", 18.47, -66.11], ["Barbados", 13.1, -59.61],
  ["Guadeloupe", 16.25, -61.58], ["Jamaica", 18.0, -76.8],
  // the South Atlantic
  ["Fernando de Noronha", -3.85, -32.42], ["Ascension Island", -7.95, -14.36], ["St Helena", -15.97, -5.71],
  ["Tristan da Cunha", -37.07, -12.31], ["the Falkland Islands", -51.7, -57.85], ["South Georgia", -54.28, -36.51],
  ["São Tomé", 0.34, 6.73], ["Bouvet Island", -54.42, 3.36],
  // the Mediterranean and the Baltic
  ["Mallorca", 39.57, 2.65], ["Menorca", 39.95, 4.1], ["Corsica", 42.04, 9.01], ["Sardinia", 40.12, 9.01], ["Sicily", 37.6, 14.0],
  ["Malta", 35.9, 14.5], ["Lampedusa", 35.5, 12.6], ["Crete", 35.24, 24.81], ["Rhodes", 36.43, 28.22], ["Cyprus", 35.13, 33.43],
  ["Gotland", 57.47, 18.49], ["Bornholm", 55.13, 14.92], ["the Åland Islands", 60.1, 19.94],
  // the Indian Ocean
  ["Socotra", 12.5, 53.8], ["Lakshadweep", 10.57, 72.64], ["the Maldives", 4.18, 73.51], ["Diego Garcia", -7.31, 72.41],
  ["the Seychelles", -4.68, 55.49], ["Zanzibar", -6.16, 39.2], ["the Comoros", -11.7, 43.3], ["Mauritius", -20.25, 57.55],
  ["Réunion", -21.12, 55.53], ["Rodrigues", -19.72, 63.42], ["the Andaman Islands", 11.67, 92.74], ["the Cocos Islands", -12.19, 96.83],
  ["Christmas Island", -10.49, 105.62], ["Amsterdam Island", -37.83, 77.55], ["Kerguelen", -49.35, 70.22],
  // the Pacific
  ["Hawaii", 21.31, -157.86], ["Kauai", 22.08, -159.5], ["Midway", 28.21, -177.38], ["Wake Island", 19.28, 166.65],
  ["Guam", 13.44, 144.79], ["Saipan", 15.18, 145.75], ["Palau", 7.5, 134.6], ["Okinawa", 26.21, 127.68], ["Taiwan", 23.7, 121.0],
  ["the Bonin Islands", 27.09, 142.19], ["the Marshall Islands", 7.09, 171.38], ["Kiribati", 1.45, 173.0], ["Kiritimati", 1.87, -157.36],
  ["Nauru", -0.52, 166.93], ["Tuvalu", -8.52, 179.2], ["the Solomon Islands", -9.43, 159.95], ["Vanuatu", -17.73, 168.32],
  ["New Caledonia", -22.27, 166.46], ["Norfolk Island", -29.04, 167.95], ["Lord Howe Island", -31.55, 159.08], ["Fiji", -17.71, 178.06],
  ["Tonga", -21.14, -175.2], ["Samoa", -13.83, -171.76], ["the Cook Islands", -21.23, -159.78], ["Tahiti", -17.65, -149.43],
  ["the Marquesas", -9.0, -139.5], ["the Tuamotus", -14.97, -147.63], ["Pitcairn", -25.07, -130.1], ["Easter Island", -27.11, -109.35],
  ["the Galápagos", -0.74, -90.31], ["the Juan Fernández Islands", -33.64, -78.83], ["the Chatham Islands", -43.95, -176.56],
  ["the Kermadec Islands", -29.25, -177.92], ["Macquarie Island", -54.5, 158.94], ["the Revillagigedo Islands", 18.8, -110.98],
  ["Kodiak", 57.79, -152.41], ["Unalaska", 53.87, -166.54], ["Adak", 51.88, -176.66], ["Attu", 52.93, 173.18], ["the Commander Islands", 55.2, 165.98],
  ["the Kuril Islands", 46.5, 151.5], ["the Pribilof Islands", 57.15, -170.27],
];
