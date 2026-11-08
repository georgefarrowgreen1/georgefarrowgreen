import { MONITOR_POLICY } from "../../functions/_monitorlist.js";

// Full response deadline and byte cap, including chunked/stalled bodies.
export async function probeApi(svc, { fetcher = fetch, now = Date.now, timeoutMs = 10000 } = {}) {
  const start = now(), controller = new AbortController();
  let timer, reader;
  const result = (s, why = null) => ({ id: svc.id, s, ms: Math.max(0, Math.round(now() - start)), why });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(svc.probe, { method: "GET", credentials: "omit", redirect: "manual", cache: "no-store",
          headers: { Accept: "application/json", "User-Agent": "InFlite-Status/1 (+https://status.inflite.ai)" }, signal: controller.signal });
        if (controller.signal.aborted) { response.body?.cancel().catch(() => {}); return result("down", "timeout"); }
        const type = response.headers.get("content-type") || "";
        if (response.headers.get("cf-mitigated") === "challenge" || response.status === 403 && type.includes("html")) {
          response.body?.cancel().catch(() => {}); return result("none", "bot check");
        }
        if (response.status !== svc.status || !type.includes("application/json")) {
          response.body?.cancel().catch(() => {}); return result("down", "API response contract failed");
        }
        reader = response.body?.getReader();
        if (!reader) return result("down", "empty response");
        let bytes = 0, text = ""; const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          if ((bytes += value.byteLength) > 4096) { reader.cancel().catch(() => {}); return result("down", "response too large"); }
          text += decoder.decode(value, { stream: true });
        }
        const json = JSON.parse(text + decoder.decode());
        if (json?.[svc.field] !== svc.value) return result("down", "API response contract failed");
        return result(now() - start > MONITOR_POLICY.apiSlowMs ? "warn" : "ok");
      })(),
      new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); reader?.cancel().catch(() => {}); resolve(result("down", "timeout")); }, timeoutMs); }),
    ]);
  } catch { return result("down", "unreachable or invalid JSON"); }
  finally { clearTimeout(timer); }
}
