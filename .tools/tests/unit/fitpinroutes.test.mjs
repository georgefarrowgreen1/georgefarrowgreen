import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanQuery, generateRoutes } from "../../../functions/_fitroutes.js";

const start = [-0.3, 51.45], first = [-0.295, 51.45], second = [-0.29, 51.45];
const query = { mode: "pins", start, pins: [first, second], surface: "road", roadPreference: "quiet" };
const track = (coordinates, tag = "highway=residential surface=asphalt") => Response.json({
  features: [{ geometry: { type: "LineString", coordinates }, properties: { messages: [["Distance", "WayTags"], [650, tag]] } }]
});
const shape = [start, [-0.298, 51.4505], first, [-0.292, 51.451], second];
const missing = data => Response.json({ error: "no_route", ...data }, { status: 422 });
const reply = response => async () => response();

test("pin inputs are bounded, normalized, UK covered and cannot choose an arbitrary engine profile", () => {
  assert.deepEqual(cleanQuery(query), { ...query, avoidUnpaved: true, returnToStart: false });
  for (const [patch, status, field] of [
    [{ pins: [] }, 400, "pins"], [{ pins: Array(9).fill(first) }, 400, "pins"],
    [{ pins: [first, [2.3, 48.8]] }, 422, "pins.1"], [{ start: [2.3, 48.8] }, 422, "start"],
    [{ pins: [first, first] }, 400, "pins.1"], [{ pins: [first, start], returnToStart: true }, 400, "returnToStart"],
    [{ pins: [[-4.25, 55.86]] }, 422, "pins.0"], [{ pins: [[NaN, 51]] }, 400, "pins.0"],
    [{ pins: [[...first, 25]] }, 400, "pins.0"], [{ returnToStart: "false" }, 400, "returnToStart"],
    [{ roadPreference: "mtb-rural" }, 400, "roadPreference"], [{ surface: "car" }, 400, "surface"],
    [{ avoidUnpaved: "off" }, 400, "avoidUnpaved"]
  ]) assert.throws(() => cleanQuery({ ...query, ...patch }), { status, field });
  assert.throws(() => cleanQuery({ ...query, mode: "bogus" }), {status:400});
});

test("the private router receives all pins in order; the answer retains mapped bends and elevations", async () => {
  const requests = [];
  const result = await generateRoutes({ ...query, profile: "car-fast" }, { now: 123, fetcher: async (url, init) => {
    requests.push({ url: url.href, method: init.method, form: Object.fromEntries(new URLSearchParams(init.body)) });
    return track(shape.map((point, i) => [...point, 20 + i * 3]));
  } });
  assert.deepEqual(requests, [{ url: "https://routing.internal/route", method: "POST",
    form: { mode: "pins", profile: "road-quiet-paved", lonlats: [start, first, second].map(p => p.join(",")).join("|") } }]);
  const [route] = result.routes;
  assert.equal(result.partial, false);
  assert.equal(route.source, "map-pins");
  assert.deepEqual(route.coords[3], [...shape[3], 29]);
  assert.equal(route.ascent, 12);
  assert.equal(route.generatedAt, 123);
  assert.deepEqual(route.pins, query.pins);
  assert.deepEqual(route.pinIndices, [2, 4]);
  assert.ok(route.terrain.paved > 0);
});

test("out-and-back tracks retain repeated checkpoint visits and the optional return leg", async () => {
  const outback = [start, first, second, first, start];
  const result = await generateRoutes({ ...query, pins: [first, second, first], returnToStart: true },
    { fetcher: async (_, {body}) => {
      assert.equal(new URLSearchParams(body).get("lonlats"), outback.map(p => p.join(",")).join("|"));
      return track(outback);
    } });
  assert.deepEqual(result.routes[0].pinIndices, [1, 2, 3]);
  assert.equal(result.routes[0].returnToStart, true);
});

test("the first unreachable point has an actionable field, with bounded probes only when the engine omits its index", async () => {
  const probes = [];
  let reservations = 0;
  const pins = Array.from({length:8}, (_,i) => [-0.295 + i * 0.002, 51.45]);
  await assert.rejects(generateRoutes({ ...query, pins }, {
    reserveAdditionalCall: async () => { reservations++; },
    fetcher: async (_, {body}) => {
      const points = new URLSearchParams(body).get("lonlats").split("|").map(value => value.split(",").map(Number));
      probes.push(points.length);
      return points.length >= 6 ? missing() : track(points);
    }
  }), {status:422, field:"pins.4"});
  assert.deepEqual(probes, [9, 5, 7, 6]);
  assert.equal(reservations, 3);
  for (const [pointIndex, field] of [[0,"start"], [1,"pins.0"], [3,"returnToStart"]]) {
    await assert.rejects(generateRoutes({ ...query, returnToStart:true }, {
      reserveAdditionalCall: () => assert.fail("engine already named the waypoint"), fetcher: reply(() => missing({pointIndex}))
    }), {status:422, field});
  }
  await assert.rejects(generateRoutes(query, { fetcher: reply(missing), reserveAdditionalCall: () => {
    throw Object.assign(new Error("At capacity"), {status:429});
  } }), {status:429});
});

test("unavailable service, cancellation, unsafe terrain, skipped stops and oversnapped finishes never return a synthetic route", async () => {
  for (const response of [
    () => new Response(null, {status:503}), () => new Response(null, {status:400}),
    () => Response.json({features:[]}), () => new Response("bad json"), () => track([[Infinity,51], second])
  ]) await assert.rejects(generateRoutes(query, { fetcher: reply(response) }), {status:503});
  await assert.rejects(generateRoutes(query, { fetcher: reply(() => track(shape,"highway=footway bicycle=no")) }), {status:422});
  await assert.rejects(generateRoutes({ ...query, pins: [[-0.28,51.45], second] }, { fetcher: reply(() => track(shape)) }), {status:422,field:"pins.0"});
  await assert.rejects(generateRoutes(query, { fetcher: reply(() => track([start,first])) }), {status:422,field:"pins.1"});
  await assert.rejects(generateRoutes(query, { signal: AbortSignal.abort(), fetcher: () => assert.fail("cancelled") }), {status:503});
});
