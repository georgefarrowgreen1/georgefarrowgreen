// A draft belongs to this Routes instance and its signed-in owner. Only a
// successful route matching the current draft can enter review or be saved.
import { icon } from "./ui.js";
import { MAX_ROUTE_PINS, RIDE_TYPES, estimate, geometry, metresBetween, pointOK, routeLabel } from "./routes-geometry.js";

const loadMap = async (...args) => (await import("./routes-pin-map.js")).mountPinMap(...args);
const pointName = index => index === 0 ? "Start" : "Pin " + index;
const coordsText = p => p[1].toFixed(5) + ", " + p[0].toFixed(5);
const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function draftFrom(route) {
  return {
    mode: "pins",
    start: route?.start?.slice(0, 2) || null,
    pins: route?.pins?.map(p => p.slice()) || [],
    returnToStart: route?.returnToStart === true,
    surface: route?.surface || "road",
    roadPreference: route?.roadPreference || "main",
    avoidUnpaved: route?.avoidUnpaved !== false,
  };
}

export function createPinPlanner({ e, owner, alive, generate, pinMap = loadMap, light, km, up, duration, speed, onReview }) {
  let draft = draftFrom(null), confirmed = null, confirmedDraft = null;
  let release = null;
  function restore(route) {
    draft = draftFrom(route);
    confirmed = route;
    confirmedDraft = draft;
  }
  function mount(parent) {
    release?.();
    const life = new AbortController();
    const current = () => !life.signal.aborted && alive() && parent.isConnected;
    let request = null, timer = null, gpsTurn = 0, locating = false;
    let map = null, mapLife = null, pendingCenter = null, editing = null;
    let routing = false, routeError = "", errorField = "", inputMessage = "", showEditor = null;
    const resolved = () => confirmed && sameDraft(draft, confirmedDraft) ? confirmed : null;
    const model = () => {
      const route = resolved();
      const snaps = route ? [route.coords[0], ...route.pinIndices.map(i => route.coords[i])] : [];
      return { start: draft.start, pins: draft.pins, coords: route?.coords || [], snaps };
    };
    function button(text, action, cls = "pill") {
      const b = e("button", cls, text);
      b.type = "button";
      b.onclick = () => { if (current()) action(); };
      return b;
    }
    function namedButton(text, action, iconName) {
      const b = button(text, action, "fr-pin-action");
      if (iconName) b.prepend(icon(iconName, 15));
      return b;
    }
    const layout = e("div", "fr-pin-layout"), mapCard = e("section", "card glass fr-pin-main");
    const mapHead = e("header", "fr-pin-head"), title = e("h2", "", "Plan a ride"), hint = e("p", "fr-pin-hint");
    mapHead.append(title, hint);
    const frame = e("div", "fr-pin-frame"), canvas = e("div", "fr-pin-map"), mapFallback = e("div", "fr-pin-map-state");
    canvas.setAttribute("aria-label", "Cycling route map");
    const mapStatus = e("span"), retryMap = button("Retry map", startMap);
    mapStatus.setAttribute("role", "status"); mapFallback.append(mapStatus, retryMap); frame.append(canvas, mapFallback);
    const mapActions = e("div", "fr-pin-tools");
    const gps = button("Use current location", locate), fit = button("Fit route", () => map?.fit());
    mapActions.append(gps, fit);
    const coordinateEntry = e("details", "fr-pin-disclosure"), coordToggle = e("summary", "", "Enter coordinates");
    const form = e("form", "fr-pin-coordinates"), lat = coordinateInput("Latitude", -85, 85), lon = coordinateInput("Longitude", -180, 180);
    function coordinateInput(label, min, max) {
      const field = e("label"), input = e("input");
      field.append(e("span", "", label), input);
      input.type = "number"; input.step = "any"; input.required = true;
      input.inputMode = "decimal"; input.min = min; input.max = max;
      form.append(field);
      return input;
    }
    const add = e("button", "pill", "Add point"); add.type = "submit";
    form.append(add);
    form.onsubmit = ev => {
      ev.preventDefault();
      if (!current() || !form.reportValidity()) return;
      const point = [lon.valueAsNumber, lat.valueAsNumber];
      if (place(point, editing)) { center(point); form.reset(); }
    };
    coordinateEntry.append(coordToggle, form);
    const editCancel = button("Cancel move", () => {
      editing = null; inputMessage = ""; form.reset(); render();
    }, "link fr-pin-cancel");
    mapCard.append(mapHead, frame, mapActions, editCancel, coordinateEntry);

    const side = e("div", "fr-pin-side"), stops = e("section", "card glass fr-pin-stops");
    const stopHead = e("header", "fr-pin-section-head"), count = e("span", "fr-pin-count");
    stopHead.append(e("h3", "", "Stops"), count);
    const list = e("ol", "fr-pin-list");
    function switchTrack(input) {
      const wrap = e("span", "fr-road-switch"), track = e("span", "fr-road-track");
      track.setAttribute("aria-hidden", "true");
      wrap.append(input, track);
      return wrap;
    }
    const returnField = e("label", "fr-pin-return"), round = e("input");
    round.type = "checkbox"; round.onchange = () => change({ returnToStart: round.checked });
    returnField.append(e("span", "", "Return to start"), switchTrack(round));
    stops.append(stopHead, list, returnField);

    const preferences = e("details", "card glass fr-pin-preferences");
    const prefTitle = e("summary", "", "Ride preferences"), prefFields = e("div", "fr-pin-fields");
    function selectField(label, choices, key) {
      const field = e("label"), input = e("select");
      for (const [value, text] of choices) {
        const option = e("option", "", text); option.value = value; input.append(option);
      }
      input.onchange = () => change({ [key]: input.value });
      field.append(e("span", "", label), input); prefFields.append(field);
      return input;
    }
    const ride = selectField("Ride type", RIDE_TYPES.map(r => [r, routeLabel(r)]), "surface");
    const roads = selectField("Roads", [["main", "Main roads"], ["quiet", "Quiet lanes"]], "roadPreference");
    const pavedLabel = e("label", "fr-pin-return"), paved = e("input");
    paved.type = "checkbox"; paved.onchange = () => change({ avoidUnpaved: paved.checked });
    pavedLabel.append(e("span", "", "Avoid unpaved roads"), switchTrack(paved));
    prefFields.append(pavedLabel); preferences.append(prefTitle, prefFields);

    const results = e("section", "card glass fr-pin-results");
    const summary = e("p", "fr-pin-summary"), feedback = e("p", "fr-pin-feedback");
    feedback.setAttribute("role", "status");
    const review = button("Review route", () => { const r = resolved(); if (r) onReview(r); }, "btn");
    const retry = button("Retry route", () => schedule(0));
    const undo = button("Restore previous route", () => { draft = confirmedDraft; editing = null; showEditor = null; schedule(); map?.fit(); });
    results.append(summary, feedback, retry, undo, review);
    side.append(results, stops, preferences); layout.append(mapCard, side); parent.append(layout);

    function center(point) {
      if (map) map.center(point); else pendingCenter = point;
    }
    function place(point, index) {
      if (!current()) return false;
      if (!pointOK(point)) { inputMessage = "Enter a valid latitude and longitude."; render(); return false; }
      if (index === null && !draft.start) index = 0;
      if (index === null && draft.pins.length >= MAX_ROUTE_PINS) {
        inputMessage = "You have eight pins. Move or remove a pin to continue."; render(); return false;
      }
      if (index !== null && (!Number.isInteger(index) || index < 0 || index > draft.pins.length)) return false;
      const p = point.slice(0, 2).map(x => +x.toFixed(6));
      editing = null; showEditor = null;
      if (index === 0) change({ start: p });
      else {
        const pins = draft.pins.slice();
        pins[index === null ? pins.length : index - 1] = p;
        change({ pins });
      }
      return true;
    }
    function change(fields) {
      if (!current()) return;
      gpsTurn++; locating = false; inputMessage = "";
      draft = { ...draft, ...fields };
      schedule();
    }
    function locate() {
      const geolocation = parent.ownerDocument.defaultView.navigator.geolocation;
      const turn = ++gpsTurn;
      const failed = err => {
        if (!current() || turn !== gpsTurn) return;
        locating = false;
        inputMessage = err?.code === 1 ? "Location access is off. Tap the map to choose your start." : "Couldn’t locate you. Tap the map to choose your start.";
        render();
      };
      if (!geolocation) { failed(); return; }
      locating = true; inputMessage = ""; render();
      try {
        geolocation.getCurrentPosition(pos => {
          if (!current() || turn !== gpsTurn) return;
          const p = [pos.coords.longitude, pos.coords.latitude];
          if (!pointOK(p) || !Number.isFinite(pos.coords.accuracy) || pos.coords.accuracy > 200) { failed(); return; }
          if (place(p, 0)) center(p);
        }, failed, { timeout: 15000, maximumAge: 30000, enableHighAccuracy: true });
      } catch { failed(); }
    }

    function schedule(delay = 400) {
      clearTimeout(timer); request?.abort(); request = null;
      routeError = ""; errorField = "";
      routing = !!draft.start && !!draft.pins.length && !resolved();
      render(); map?.update(model());
      if (!routing) return;
      const next = draft, controller = new AbortController();
      request = controller;
      timer = setTimeout(async () => {
        try {
          const [route] = await generate(next, { owner, signal: controller.signal });
          if (!current() || controller.signal.aborted || draft !== next) return;
          if (!route || route.source !== "map-pins") throw Error("A cycling route could not be found through these pins.");
          confirmed = route; confirmedDraft = next;
        } catch (err) {
          if (!current() || controller.signal.aborted) return;
          routeError = err?.message || "Couldn’t calculate the route. Move a pin or try again.";
          errorField = err?.field || "";
        } finally {
          if (current() && request === controller) {
            request = null; routing = false; render(); map?.update(model());
          }
        }
      }, delay);
    }

    function startMap() {
      mapLife?.abort(); map?.destroy(); map = null;
      const controller = new AbortController();
      mapLife = controller;
      const liveMap = () => current() && !controller.signal.aborted;
      canvas.replaceChildren();
      mapStatus.textContent = "Loading map…"; mapFallback.hidden = false; retryMap.hidden = true;
      function unavailable() {
        if (!liveMap()) return;
        controller.abort(); map = null;
        mapStatus.textContent = "Street map unavailable. You can still enter coordinates.";
        retryMap.hidden = false; mapFallback.hidden = false; coordinateEntry.open = true; render();
      }
      Promise.resolve().then(() => {
        if (!liveMap()) return null;
        return pinMap(canvas, {
          ...model(), light: typeof light === "function" ? light() : !!light, signal: controller.signal,
          onTap: point => {
            if (!liveMap()) return;
            const choosingStart = !draft.start;
            if (place(point, editing) && choosingStart) center(point);
          },
          onMove: (index, point) => { if (liveMap()) place(point, index); },
          onReady: () => { if (liveMap()) mapFallback.hidden = true; },
          onError: unavailable,
        });
      }).then(result => {
        if (!result) return;
        if (!liveMap()) { result.destroy(); return; }
        map = result; map.update(model());
        if (pendingCenter) { map.center(pendingCenter); pendingCenter = null; }
        render();
      }).catch(unavailable);
    }

    function editPoint(index, point) {
      editing = index; showEditor = null; inputMessage = "";
      lat.value = String(point[1]); lon.value = String(point[0]); center(point); render();
      if (coordinateEntry.open) lat.focus();
      else { hint.tabIndex = -1; hint.focus(); }
    }
    function shift(index, step) {
      const pins = draft.pins.slice(), from = index - 1, to = from + step;
      if (from < 0 || to < 0 || to >= pins.length) return;
      [pins[from], pins[to]] = [pins[to], pins[from]];
      showEditor = to + 1; editing = null; change({ pins });
      list.querySelector('[data-pin-row="' + (to + 1) + '"] summary')?.focus({preventScroll:true});
    }
    function remove(index) {
      editing = null; showEditor = null;
      if (index === 0) change({ start: null });
      else change({ pins: draft.pins.filter((_, i) => i !== index - 1) });
      (list.querySelector('[data-pin-row="' + Math.min(index, draft.pins.length) + '"] summary') || gps).focus({preventScroll:true});
    }
    let lastListKey = "";
    function updateList(r) {
      const key = JSON.stringify([draft.start, draft.pins, draft.returnToStart, r?.id, errorField, editing, showEditor]);
      if (lastListKey === key) return;
      lastListKey = key;
      const hasFocus = list.contains(parent.ownerDocument.activeElement);
      const focusIndex = hasFocus && parent.ownerDocument.activeElement.closest("[data-pin-row]")?.dataset.pinRow;
      list.replaceChildren();
      const distances = r ? geometry(r).distances : null;
      const points = [draft.start, ...draft.pins];
      points.forEach((point, index) => {
        if (!point) return;
        const name = pointName(index), last = index === points.length - 1 && !draft.returnToStart;
        const row = e("li"); row.dataset.pinRow = index;
        const options = e("details"), top = e("summary"), badge = e("span", "fr-pin-badge", index || "S"), copy = e("span", "fr-pin-stop-copy");
        options.open = showEditor === index;
        top.setAttribute("aria-label", "Edit " + name);
        badge.setAttribute("aria-hidden", "true");
        const routeIndex = index === 0 ? 0 : r?.pinIndices?.[index - 1];
        const arrival = r?.coords?.[routeIndex];
        const offset = arrival && Math.round(metresBetween(point, arrival));
        const sub = distances && arrival ? (index === 0 ? "Departure" : km(distances[routeIndex]) + " into ride") + (offset > 15 ? " · " + up(offset) + " from pin" : "") : coordsText(point);
        copy.append(e("b", "", name + (index > 0 && last ? " · Finish" : "")), e("small", "", sub));
        top.append(badge, copy, icon("chev", 15));
        const actions = e("div", "fr-pin-row-actions");
        function action(short, label, fn, glyph) {
          const b = namedButton(short, fn, glyph); b.setAttribute("aria-label", label); actions.append(b); return b;
        }
        action("Move", "Move " + name + " on map", () => editPoint(index, point), "edit");
        if (index > 0 && draft.pins.length > 1) {
          action("Earlier", "Move " + name + " earlier", () => shift(index, -1)).disabled = index === 1;
          action("Later", "Move " + name + " later", () => shift(index, 1)).disabled = index === draft.pins.length;
        }
        action("Remove", "Remove " + name, () => remove(index), "trash");
        options.ontoggle = () => {
          if (!options.isConnected) return;
          if (options.open) {
            showEditor = index;
            for (const other of list.querySelectorAll("details[open]")) if (other !== options) other.open = false;
          } else if (showEditor === index) showEditor = null;
        };
        if (errorField === (index === 0 ? "start" : "pins." + (index - 1))) row.dataset.invalid = "true";
        options.append(top, actions); row.append(options); list.append(row);
      });
      if (focusIndex !== false && focusIndex !== undefined) list.querySelector('[data-pin-row="' + focusIndex + '"] summary')?.focus({preventScroll:true});
    }

    function render() {
      const r = resolved(), n = draft.pins.length;
      hint.textContent = editing !== null ? "Tap a new position for " + pointName(editing).toLowerCase() + " or enter its coordinates." :
        !draft.start ? "Choose a start on the UK map or use your current location." :
        !n ? "Tap the map to add your first destination." :
        n === MAX_ROUTE_PINS ? "All eight pins are placed. Drag a pin to adjust it." :
        "Tap to add another stop. Drag a pin to move it.";
      count.textContent = n + " of " + MAX_ROUTE_PINS + " pins"; editCancel.hidden = editing === null;
      add.textContent = editing === null ? "Add point" : "Move point";
      add.disabled = !!draft.start && n >= MAX_ROUTE_PINS && editing === null;
      gps.disabled = locating; gps.textContent = locating ? "Finding location…" : "Use current location";
      fit.disabled = !map || (!draft.start && !n);
      round.checked = draft.returnToStart; paved.checked = draft.avoidUnpaved;
      ride.value = draft.surface; roads.value = draft.roadPreference;
      roads.parentNode.hidden = pavedLabel.hidden = draft.surface !== "road";
      list.hidden = !draft.start && !n;
      updateList(r);
      summary.hidden = !r;
      summary.textContent = r ? km(r.metres) + " · ≈ " + duration(estimate(r, speed)) + (r.ascent == null ? "" : " · ↑ " + up(r.ascent)) : "";
      feedback.textContent = [inputMessage, routeError || (routing ? "Calculating cycling route…" : "")].filter(Boolean).join(" ");
      retry.hidden = !routeError; undo.hidden = !routeError || !confirmedDraft;
      review.disabled = !r;
      results.hidden = !n && !inputMessage;
    }
    release = () => {
      life.abort(); gpsTurn++; clearTimeout(timer); request?.abort(); mapLife?.abort(); map?.destroy();
      release = null;
    };
    schedule(); startMap();
  }
  return { mount, restore, hide: () => release?.() };
}
