import { createLiveRoutes } from "./routes-live.js";
import { routeTraining } from "./routes-training.js";
export { forgetRoutePlans } from "./routes-account.js";

let styles;
function loadStyles(doc) {
  if (styles) return styles;
  styles = new Promise((resolve, reject) => {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./routes.css", import.meta.url).href;
    const failed = () => {
      clearTimeout(timer);
      link.remove();
      styles = null;
      reject(new Error("The route styles could not load."));
    };
    const timer = setTimeout(failed, 10000);
    link.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
    link.addEventListener("error", failed, { once: true });
    doc.head.append(link);
  });
  return styles;
}

export async function mount(host, { owner, current, core, state, onBusy }) {
  await loadStyles(host.ownerDocument);
  if (!current() || !host.isConnected) return null;
  return createLiveRoutes(host, {
    owner, current, onBusy, metric: core.U.metric !== false, light: core.lightNow,
    ...routeTraining(core, state),
    map: (element, options) => core.M.routeMap(element, { ...options, light: core.lightNow() })
  });
}
