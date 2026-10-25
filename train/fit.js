// FIT, the file Garmin's and Wahoo's devices record a ride in and read a workout from, written and read here with no
// library (as the account page writes its own PDF). A FIT file is a 14-byte header, then messages, each laid out by a
// definition sent before it (which fields, how big, which way round the bytes go), then a CRC. Only what Cadence needs
// is named here: a file's type and maker, a ride's records, laps and session, a device's name, and a workout and its
// steps. Anything else in a file is read past.
//
// Numbers as FIT keeps them: times are seconds since 31 December 1989 (UTC), places are semicircles (2³¹ of them to 180°),
// and most other fields are whole numbers with a scale and an offset (altitude is metres × 5 + 500). A value of all ones
// (or 0x7F…, or 0 for the z types) means "not recorded".

export const FIT_EPOCH = 631065600;           // (1989-12-31T00:00:00Z, in Unix seconds)
const SEMI = 2 ** 31 / 180;

// base types: [id, bytes, invalid]
const T = {
  enum: [0x00, 1, 0xff], sint8: [0x01, 1, 0x7f], uint8: [0x02, 1, 0xff], sint16: [0x83, 2, 0x7fff], uint16: [0x84, 2, 0xffff],
  sint32: [0x85, 4, 0x7fffffff], uint32: [0x86, 4, 0xffffffff], string: [0x07, 1, 0], float32: [0x88, 4, null], float64: [0x89, 8, null],
  uint8z: [0x0a, 1, 0], uint16z: [0x8b, 2, 0], uint32z: [0x8c, 4, 0], byte: [0x0d, 1, 0xff],
};
const BY_ID = Object.fromEntries(Object.entries(T).map(([k, v]) => [v[0] & 0x1f, k]));

// The messages named here: their number, and each field's [number, type, scale, offset]
const MESGS = {
  fileId: [0, { type: [0, "enum"], manufacturer: [1, "uint16"], product: [2, "uint16"], serial: [3, "uint32z"], created: [4, "uint32"], productName: [8, "string"] }],
  deviceInfo: [23, { timestamp: [253, "uint32"], deviceIndex: [0, "uint8"], manufacturer: [2, "uint16"], product: [4, "uint16"], productName: [27, "string"] }],
  event: [21, { timestamp: [253, "uint32"], event: [0, "enum"], eventType: [1, "enum"] }],
  record: [20, {
    timestamp: [253, "uint32"], lat: [0, "sint32"], lon: [1, "sint32"], altitude: [2, "uint16", 5, 500], heartRate: [3, "uint8"], cadence: [4, "uint8"],
    distance: [5, "uint32", 100], speed: [6, "uint16", 1000], power: [7, "uint16"], compressedSD: [8, "byte"], temperature: [13, "sint8"],
    enhancedSpeed: [73, "uint32", 1000], enhancedAltitude: [78, "uint32", 5, 500],
  }],
  lap: [19, {
    timestamp: [253, "uint32"], messageIndex: [254, "uint16"], event: [0, "enum"], eventType: [1, "enum"], startTime: [2, "uint32"],
    elapsed: [7, "uint32", 1000], timer: [8, "uint32", 1000], distance: [9, "uint32", 100], avgHeartRate: [15, "uint8"], maxHeartRate: [16, "uint8"],
    avgCadence: [17, "uint8"], avgPower: [19, "uint16"], maxPower: [20, "uint16"], ascent: [21, "uint16"], descent: [22, "uint16"], intensity: [23, "enum"],
    trigger: [24, "enum"], sport: [25, "enum"], normalizedPower: [33, "uint16"],
  }],
  session: [18, {
    timestamp: [253, "uint32"], messageIndex: [254, "uint16"], event: [0, "enum"], eventType: [1, "enum"], startTime: [2, "uint32"],
    sport: [5, "enum"], subSport: [6, "enum"], elapsed: [7, "uint32", 1000], timer: [8, "uint32", 1000], distance: [9, "uint32", 100],
    calories: [11, "uint16"], avgHeartRate: [16, "uint8"], maxHeartRate: [17, "uint8"], avgCadence: [18, "uint8"], avgPower: [20, "uint16"],
    maxPower: [21, "uint16"], ascent: [22, "uint16"], descent: [23, "uint16"], firstLap: [25, "uint16"], laps: [26, "uint16"], trigger: [28, "enum"],
    normalizedPower: [34, "uint16"], tss: [35, "uint16", 10], intensityFactor: [36, "uint16", 1000], work: [48, "uint32"], thresholdPower: [45, "uint16"],
  }],
  activity: [34, { timestamp: [253, "uint32"], timer: [0, "uint32", 1000], sessions: [1, "uint16"], type: [2, "enum"], event: [3, "enum"], eventType: [4, "enum"], local: [5, "uint32"] }],
  workout: [26, {
    sport: [4, "enum"], capabilities: [5, "uint32z"], steps: [6, "uint16"], name: [8, "string"], subSport: [11, "enum"], poolLength: [14, "uint16", 100],
    poolUnit: [15, "enum"], description: [17, "string"],
  }],
  workoutStep: [27, {
    messageIndex: [254, "uint16"], name: [0, "string"], durationType: [1, "enum"], durationValue: [2, "uint32"], targetType: [3, "enum"],
    targetValue: [4, "uint32"], low: [5, "uint32"], high: [6, "uint32"], intensity: [7, "enum"], notes: [8, "string"],
    // (a second target alongside the first, as newer Edges and watches follow it: a cadence while the power's held)
    target2Type: [19, "enum"], target2Value: [20, "uint32"], low2: [21, "uint32"], high2: [22, "uint32"],
  }],
};
const BY_NUM = Object.fromEntries(Object.entries(MESGS).map(([name, [num, fields]]) => [num, { name, fields: Object.fromEntries(Object.entries(fields).map(([k, f]) => [f[0], [k, ...f.slice(1)]])) }]));

// What's in a FIT file's enums that Cadence says in words
export const FILE = { activity: 4, workout: 5, course: 6 };
export const SPORT = { generic: 0, running: 1, cycling: 2, fitnessEquipment: 4, swimming: 5, training: 10, walking: 11, rowing: 15, hiking: 17, eBiking: 21 };
export const SUB = { generic: 0, treadmill: 1, trail: 3, track: 4, indoorCycling: 6, road: 7, mountain: 8, lapSwimming: 17, openWater: 18, strength: 20, virtual: 58, gravel: 46 };
export const MAKER = { 1: "Garmin", 32: "Wahoo", 260: "Zwift", 265: "Strava", 281: "TrainerRoad", 289: "Hammerhead" };
export const DURATION = { time: 0, distance: 1, open: 5, repeat: 6 };
export const TARGET = { speed: 0, heartRate: 1, open: 2, cadence: 3, power: 4 };
export const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4, interval: 5 };

// ---- the CRC every FIT file ends with (and its 14-byte header too) ----
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
export function crc16(bytes, from = 0, to = bytes.length, crc = 0) {
  for (let i = from; i < to; i++) {
    const b = bytes[i];
    let t = CRC_TABLE[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc = crc ^ t ^ CRC_TABLE[b & 0xf];
    t = CRC_TABLE[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc = crc ^ t ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

// ---- reading ----
// A FIT file (its bytes) as its messages by name, each a plain object of the fields named above, scaled (a record's
// lat and lon in degrees, its timestamp in Unix seconds). Throws, saying why, on what isn't a FIT file. A file that
// stops short (a device that lost power mid-ride) is read as far as it goes.
export function readFit(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 12) throw new Error("That file is too short to be a FIT file.");
  const hsize = b[0], dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if ((hsize !== 12 && hsize !== 14) || String.fromCharCode(b[8], b[9], b[10], b[11]) !== ".FIT") throw new Error("That isn’t a FIT file.");
  const dataSize = dv.getUint32(4, true), end = Math.min(b.length, hsize + dataSize);
  const out = { messages: {}, truncated: hsize + dataSize + 2 > b.length };
  if (!out.truncated) {
    const want = dv.getUint16(hsize + dataSize, true);
    if (want !== 0 && crc16(b, 0, hsize + dataSize) !== want) out.damaged = true;
  }
  const defs = [];
  let p = hsize, last = 0;
  try {
    while (p < end) {
      const h = b[p++];
      if (h & 0x80) {
        // a compressed timestamp header: a data message, with five bits of time counted on from the last timestamp
        const def = defs[(h >> 5) & 3], off = h & 0x1f;
        if (!def) throw new Error("bad");
        last = (last & ~0x1f) + off + ((off < (last & 0x1f)) ? 0x20 : 0);
        p = readData(b, dv, p, def, out, last);
        continue;
      }
      const local = h & 0x0f;
      if (h & 0x40) {
        const big = b[p + 1] === 1, num = big ? dv.getUint16(p + 2, false) : dv.getUint16(p + 2, true), n = b[p + 4];
        const fields = [];
        for (let i = 0; i < n; i++) fields.push([b[p + 5 + i * 3], b[p + 6 + i * 3], b[p + 7 + i * 3]]);
        p += 5 + n * 3;
        let devBytes = 0;
        if (h & 0x20) { const dn = b[p++]; for (let i = 0; i < dn; i++) devBytes += b[p + i * 3 + 1]; p += dn * 3; }
        defs[local] = { num, big, fields, devBytes };
      } else {
        const def = defs[local];
        if (!def) throw new Error("bad");
        p = readData(b, dv, p, def, out, null);
        if (out._ts != null) { last = out._ts; out._ts = null; }
      }
    }
  } catch (_) {
    // (what came before the break is kept: a ride cut short is still a ride)
    out.truncated = true;
  }
  delete out._ts;
  if (!out.messages.fileId) throw new Error("That FIT file has nothing in it Cadence can read.");
  return out;
}
function readData(b, dv, p, def, out, ts) {
  const known = BY_NUM[def.num], m = {};
  for (const [num, size, type] of def.fields) {
    const name = known && known.fields[num];
    if (name) {
      const v = readValue(b, dv, p, size, BY_ID[type & 0x1f] || "byte", def.big);
      if (v != null) {
        const [key, , scale = 1, offset = 0] = name;
        m[key] = typeof v === "string" ? v : Array.isArray(v) ? v.map((x) => x / scale - offset) : v / scale - offset;
      }
    } else if (num === 253 && size === 4) {
      // (a timestamp on a message not named here: kept, as the next compressed one counts on from it)
      const v = readValue(b, dv, p, 4, "uint32", def.big);
      if (v != null) out._ts = v;
    }
    p += size;
  }
  p += def.devBytes;
  if (ts != null && m.timestamp == null) m.timestamp = ts;
  if (m.timestamp != null) { out._ts = m.timestamp; m.timestamp += FIT_EPOCH; }
  if (!known) return p;
  for (const k of ["startTime", "created", "local"]) if (m[k] != null) m[k] += FIT_EPOCH;
  if (m.lat != null) m.lat /= SEMI;
  if (m.lon != null) m.lon /= SEMI;
  (out.messages[known.name] ||= []).push(m);
  return p;
}
function readValue(b, dv, p, size, type, big) {
  const [, width, invalid] = T[type];
  if (type === "string") {
    let e = p; while (e < p + size && b[e] !== 0) e++;
    const s = new TextDecoder().decode(b.subarray(p, e)).trim();
    return s || null;
  }
  const one = (q) => {
    let v;
    switch (type) {
      case "sint8": v = dv.getInt8(q); break;
      case "sint16": v = dv.getInt16(q, !big); break;
      case "uint16": case "uint16z": v = dv.getUint16(q, !big); break;
      case "sint32": v = dv.getInt32(q, !big); break;
      case "uint32": case "uint32z": v = dv.getUint32(q, !big); break;
      case "float32": v = dv.getFloat32(q, !big); return Number.isFinite(v) ? v : null;
      case "float64": v = dv.getFloat64(q, !big); return Number.isFinite(v) ? v : null;
      default: v = b[q];
    }
    return v === invalid ? null : v;
  };
  if (size === width) return one(p);
  if (size % width) return null;
  const vs = [];
  for (let q = p; q < p + size; q += width) vs.push(one(q));
  return vs.every((v) => v == null) ? null : vs;
}

// ---- writing ----
// A FIT file from its messages, in order: [[name, fields], …], each field by the names above, in the units they're read
// in (times in Unix seconds, places in degrees). A definition's sent once for each shape of message, as devices write
// them, so a ride of thousands of records costs a definition and then just its values.
export function writeFit(messages) {
  const parts = [], shapes = new Map();
  let size = 0, nextLocal = 0;
  const push = (u8) => { parts.push(u8); size += u8.length; };
  for (const [name, values] of messages) {
    const [num, fields] = MESGS[name];
    const used = Object.entries(fields).filter(([k]) => values[k] != null && values[k] !== "");
    const sizes = used.map(([k, [, type]]) => (type === "string" ? Math.min(255, new TextEncoder().encode(String(values[k])).length + 1) : T[type][1]));
    const key = name + ":" + used.map(([k], i) => k + "/" + sizes[i]).join(",");
    let local = shapes.get(key);
    if (local == null) {
      // (sixteen local slots: the oldest shape is put out of its slot when a seventeenth is needed)
      local = nextLocal++ % 16;
      for (const [k, v] of shapes) if (v === local) shapes.delete(k);
      shapes.set(key, local);
      const d = new Uint8Array(6 + used.length * 3);
      d[0] = 0x40 | local; d[2] = 0; d[3] = num & 0xff; d[4] = num >> 8; d[5] = used.length;
      used.forEach(([, [fnum, type]], i) => { d[6 + i * 3] = fnum; d[7 + i * 3] = sizes[i]; d[8 + i * 3] = T[type][0]; });
      push(d);
    }
    const d = new Uint8Array(1 + sizes.reduce((a, s) => a + s, 0)), dv = new DataView(d.buffer);
    d[0] = local;
    let p = 1;
    used.forEach(([k, [, type, scale = 1, offset = 0]], i) => {
      let v = values[k];
      if (type === "string") { d.set(new TextEncoder().encode(String(v)).subarray(0, sizes[i] - 1), p); p += sizes[i]; return; }
      if (k === "timestamp" || k === "startTime" || k === "created" || k === "local") v -= FIT_EPOCH;
      if (k === "lat" || k === "lon") v *= SEMI;
      v = Math.round((v + offset) * scale);
      const [, , invalid] = T[type];
      // (out of the field's range: not recorded, rather than wrapped round to something wrong)
      const max = { sint8: 0x7e, uint8: 0xfe, enum: 0xfe, sint16: 0x7ffe, uint16: 0xfffe, sint32: 0x7ffffffe, uint32: 0xfffffffe, uint32z: 0xffffffff }[type];
      const min = type.startsWith("sint") ? -max : 0;
      if (!(v >= min && v <= max)) v = invalid;
      switch (type) {
        case "sint8": dv.setInt8(p, v); break;
        case "sint16": dv.setInt16(p, v, true); break;
        case "uint16": dv.setUint16(p, v, true); break;
        case "sint32": dv.setInt32(p, v, true); break;
        case "uint32": case "uint32z": dv.setUint32(p, v, true); break;
        default: d[p] = v;
      }
      p += sizes[i];
    });
    push(d);
  }
  const out = new Uint8Array(14 + size + 2), dv = new DataView(out.buffer);
  out[0] = 14; out[1] = 0x10;                                  // (header size, protocol 1.0: all of this is in it, and every device reads it)
  dv.setUint16(2, 21218, true);                                 // (the profile it's written to: 21.218)
  dv.setUint32(4, size, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8);                         // ".FIT"
  dv.setUint16(12, crc16(out, 0, 12), true);
  let p = 14;
  for (const u8 of parts) { out.set(u8, p); p += u8.length; }
  dv.setUint16(p, crc16(out, 0, p), true);
  return out;
}
