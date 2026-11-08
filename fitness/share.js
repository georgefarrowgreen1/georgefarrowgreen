// Pictures to share: a ride (its route, its figures, its efforts) and a year (its distance, month by month, its
// highlights), drawn on a canvas, 1080 × 1920 (Instagram Stories, 9:16), in the app's own
// night-sky look for indoor/year cards, or a map with floating panels for outdoor rides.
// Map tiles load only when an outdoor share is requested; failed maps keep a route-only export.
// Titles, figures and branding stay inside the story's top/bottom controls (250 px each).
//
// ride: { name, when, coords: [[lon, lat], ...] | null, route: [x, y, …] (0 to 100, as formats.js routeShape has it) | null, zones: [secs × 7] | null,
//   stats: [[label, value]] (up to six), chip: string | null, sport }
// year: { title, big: [value, unit], line, months: [secs × 12], top: month index, rows: [[label, value, sub]] }
// → a PNG, as a Blob

const W = 1080, H = 1920, PAD = 84;
const FONT = "-apple-system, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif";
const font = (weight, size) => `${weight} ${size}px ${FONT}`;
const ZONE = ["#a3abc0", "#4aa3ff", "#3fd08f", "#ffd23f", "#ff9440", "#ff5a5a", "#c07bff"];

function canvas() {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  return [c, c.getContext("2d")];
}
// the sky: deep blue, a warm aura top left, a cool one right, as the app's background
function sky(g) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14122e"); bg.addColorStop(0.55, "#0d0f24"); bg.addColorStop(1, "#080a18");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const aura = (x, y, r, c) => { const a = g.createRadialGradient(x, y, 0, x, y, r); a.addColorStop(0, c); a.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = a; g.fillRect(0, 0, W, H); };
  aura(160, 120, 640, "rgba(150, 70, 160, 0.42)");
  aura(1000, 260, 560, "rgba(50, 90, 220, 0.38)");
  aura(540, H + 50, 700, "rgba(40, 60, 160, 0.30)");
}
// a few words over as many lines as they need (at most `lines`), the last cut with an ellipsis
function wrap(g, text, x, y, maxW, lh, lines = 2, draw = true) {
  const words = String(text).split(/\s+/), out = [];
  let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; let last = out[lines - 1]; while (g.measureText(`${last}…`).width > maxW && last.length) last = last.slice(0, -1); out[lines - 1] = `${last}…`; }
  if(draw)out.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return out.length;
}
function pill(g, x, y, text, fg, bg) {
  g.font = font(650, 30);
  const w = g.measureText(text).width + 44, h = 56;
  g.fillStyle = bg; round(g, x, y, w, h, h / 2); g.fill();
  g.fillStyle = fg; g.fillText(text, x + 22, y + 38);
  return w;
}
function round(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
let logo;
function brandLogo() {
  return logo ||= new Promise(resolve => {
    const img = new Image();
    const done = value => { clearTimeout(timer); img.onload = img.onerror = null; resolve(value); };
    const timer = setTimeout(() => done(null), 2000);
    img.onload = () => done(img); img.onerror = () => done(null);
    img.src = new URL('./inflite.svg', import.meta.url).href;
  });
}
async function foot(g,light=false) {
  const mark = await brandLogo(), label = "Powered by InFlite", size = 36, gap = 10, y = H - 286;
  g.font = font(600, 26); g.fillStyle = light ? '#526172' : "rgba(235, 238, 250, 0.75)";
  const x = (W - g.measureText(label).width - (mark ? size + gap : 0)) / 2;
  if (mark) { g.save(); round(g, x, y - size / 2, size, size, 9); g.clip(); g.drawImage(mark, x, y - size / 2, size, size); g.restore(); }
  g.fillText(label, x + (mark ? size + gap : 0), y + 9);
}
const blob = (c) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("The picture couldn’t be made"))), "image/png"));

// ---- a ride ----
function glass(g,back,x,y,w,h){
 g.save();g.shadowColor='rgba(31,46,66,.13)';g.shadowBlur=32;g.shadowOffsetY=12;g.fillStyle='rgba(255,255,255,.9)';round(g,x,y,w,h,40);g.fill();g.restore();
 g.save();round(g,x,y,w,h,40);g.clip();if(back){g.filter='blur(20px)';g.drawImage(back,0,0,W,H);g.filter='none';}g.fillStyle='rgba(255,255,255,.86)';g.fillRect(x,y,w,h);g.restore();g.strokeStyle='rgba(255,255,255,.95)';g.lineWidth=2;round(g,x+1,y+1,w-2,h-2,39);g.stroke();
}
function shapeOf(coords){
 const pts=coords?.filter(p=>Number.isFinite(p?.[0])&&Number.isFinite(p?.[1])&&Math.abs(p[1])<=85);if(!pts||pts.length<2)return null;
 const k=Math.cos(pts.reduce((n,p)=>n+p[1],0)/pts.length*Math.PI/180),xs=pts.map(p=>p[0]*k),ys=pts.map(p=>p[1]);
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),span=Math.max(x1-x0,y1-y0);if(!span)return null;
 return pts.flatMap((p,i)=>[50+(xs[i]-(x0+x1)/2)*88/span,50-(ys[i]-(y0+y1)/2)*88/span]);
}
export async function rideImage(r) {
  const [c, g] = canvas();
  g.font=font(750,76);const titleY=404,n=wrap(g,r.name,PAD,titleY,W-2*PAD,84,2,false),light=Array.isArray(r.coords)&&r.coords.length>=2;
  const headBottom=titleY+(n-1)*84+52,statsH=r.stats.length>3?284:134,statsTop=1544-statsH;
  const top=headBottom+40,bottom=statsTop-(r.chip?110:40),box={x:PAD,y:top,w:W-2*PAD,h:bottom-top};
  let back=null;
  if(light){
   try{const {routeSnapshot}=await import('./map.js');back=await routeSnapshot(r.coords,{top:top/3,bottom:(H-bottom)/3});}catch{}
   g.fillStyle='#f4f2ee';g.fillRect(0,0,W,H);if(back)g.drawImage(back,0,0,W,H);
   const fade=g.createLinearGradient(0,1520,0,1680);fade.addColorStop(0,'rgba(247,249,252,0)');fade.addColorStop(1,'rgba(247,249,252,.98)');g.fillStyle=fade;g.fillRect(0,1520,W,H-1520);
   glass(g,back,44,250,W-88,headBottom-250);
  }else sky(g);
  g.fillStyle = light ? '#667487' : "rgba(235, 238, 250, 0.62)"; g.font = font(650, 30); g.fillText(r.when.toUpperCase(), PAD, 314);
  g.fillStyle = light ? '#17283c' : "#f5f6fb"; g.font = font(750, 76);
  wrap(g, r.name, PAD, titleY, W - 2 * PAD, 84, 2);
  // the route, glowing, from green to red; else (indoors) the ride's time in each zone
  const shape=r.route?.length>=4?r.route:shapeOf(r.coords);
  if (!back && shape?.length >= 4) {
    const pts = []; for (let i = 0; i + 1 < shape.length; i += 2) pts.push([Number(shape[i]) || 0, Number(shape[i + 1]) || 0]);
    const s = Math.min(box.w, box.h) / 100, ox = box.x + (box.w - 100 * s) / 2, oy = box.y + (box.h - 100 * s) / 2, P = (p) => [ox + p[0] * s, oy + p[1] * s];
    // (green to red across the route's own box: a loop starts and ends in the same place)
    const grad = g.createLinearGradient(ox, oy + 100 * s, ox + 100 * s, oy);
    grad.addColorStop(0, "#4fdc8e"); grad.addColorStop(0.5, "#ffb547"); grad.addColorStop(1, "#ff6a5f");
    g.lineJoin = "round"; g.lineCap = "round";
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p)))); };
    g.save();g.shadowColor=light?'rgba(25,65,110,.2)':"rgba(255, 170, 90, 0.55)";g.shadowBlur=light?12:34;
    if(light){g.strokeStyle='#fff';g.lineWidth=22;path();g.stroke();}
    g.strokeStyle=light?'#1677ed':grad;g.lineWidth=12;path();g.stroke();g.restore();
    if(!light){g.strokeStyle="rgba(255,255,255,0.9)";g.lineWidth=3;path();g.stroke();}
    const dot = (p, col) => { const [x, y] = P(p); g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); };
    dot(pts.at(-1), "#ff6a5f"); dot(pts[0], "#4fdc8e");
  } else if (!back && !light && r.zones?.some((z) => z > 0)) {
    const tot = r.zones.reduce((a, b) => a + b, 0), bh = 46, gap = 18, y0 = box.y + (box.h - 7 * (bh + gap)) / 2;
    g.font = font(650, 28);
    r.zones.forEach((z, i) => {
      const y = y0 + i * (bh + gap), w = Math.max(6, ((box.w - 220) * z) / Math.max(...r.zones));
      g.fillStyle = "rgba(235, 238, 250, 0.6)"; g.fillText(`Z${i + 1}`, box.x, y + 33);
      g.fillStyle = ZONE[i]; round(g, box.x + 70, y, w, bh, 12); g.fill();
      g.fillStyle = "rgba(235, 238, 250, 0.75)"; g.fillText(`${Math.round((z / tot) * 100)}%`, box.x + 70 + w + 16, y + 33);
    });
  }
  // the efforts, where it was a session
  if (r.chip) pill(g, PAD, statsTop-84, r.chip, light ? (r.chipOk?'#087c46':'#8d550c') : r.chipOk ? "#7ff0b0" : "#ffcf7a",light?'rgba(255,255,255,.94)': r.chipOk ? "rgba(79, 220, 142, 0.16)" : "rgba(255, 181, 71, 0.16)");
  const y=statsTop+12;
  if(light)glass(g,back,44,statsTop,W-88,statsH);
  // the figures, three to a row
  const cols = 3, cw = (W - 2 * PAD) / cols;
  r.stats.slice(0, 6).forEach(([label, value], i) => {
    const x = PAD + (i % cols) * cw, yy = y + Math.floor(i / cols) * 150;
    g.fillStyle = light ? '#667487' : "rgba(235, 238, 250, 0.58)"; g.font = font(650, 26); g.fillText(label.toUpperCase(), x, yy + 30);
    g.fillStyle = light ? '#17283c' : "#f5f6fb"; g.font = font(750, 58); g.fillText(value, x, yy + 98, cw - 20);
  });
  await foot(g,light);
  return blob(c);
}

// ---- a year ----
export async function yearImage(r) {
  const [c, g] = canvas();
  sky(g);
  g.fillStyle = "rgba(235, 238, 250, 0.62)"; g.font = font(650, 32); g.fillText(r.title.toUpperCase(), PAD, 314);
  g.fillStyle = "#f5f6fb"; g.font = font(800, 168); g.fillText(r.big[0], PAD, 510);
  const bw = g.measureText(r.big[0]).width;
  g.font = font(700, 56); g.fillStyle = "rgba(235, 238, 250, 0.7)"; g.fillText(r.big[1], PAD + bw + 18, 510);
  g.font = font(550, 34); g.fillStyle = "rgba(235, 238, 250, 0.78)"; wrap(g, r.line, PAD, 590, W - 2 * PAD, 46, 2);
  // month by month
  const mx = PAD, my = 700, mw = W - 2 * PAD, mh = 300, max = Math.max(1, ...r.months), slot = mw / 12, bar = slot - 22;
  r.months.forEach((s, i) => {
    const h = Math.max(s ? 8 : 0, (s / max) * (mh - 50)), x = mx + i * slot + 11;
    const gr = g.createLinearGradient(0, my + mh - 50 - h, 0, my + mh - 50);
    if (i === r.top) { gr.addColorStop(0, "#7db6ff"); gr.addColorStop(1, "#2f7af0"); } else { gr.addColorStop(0, "rgba(125, 182, 255, 0.55)"); gr.addColorStop(1, "rgba(47, 122, 240, 0.35)"); }
    g.fillStyle = gr; round(g, x, my + mh - 50 - h, bar, h, Math.min(12, bar / 2)); g.fill();
    g.fillStyle = i === r.top ? "#f5f6fb" : "rgba(235, 238, 250, 0.5)"; g.font = font(650, 26); g.textAlign = "center"; g.fillText("JFMAMJJASOND"[i], x + bar / 2, my + mh - 8); g.textAlign = "left";
  });
  // the highlights
  let y = 1080;
  for (const [label, value, sub] of r.rows.slice(0, 4)) {
    g.fillStyle = "rgba(255, 255, 255, 0.07)"; round(g, PAD, y, W - 2 * PAD, 92, 26); g.fill();
    g.fillStyle = "rgba(235, 238, 250, 0.62)"; g.font = font(600, 28); g.fillText(label, PAD + 30, y + 40);
    if (sub) { g.font = font(500, 24); g.fillStyle = "rgba(235, 238, 250, 0.45)"; g.fillText(sub, PAD + 30, y + 74, W - 2 * PAD - 320); }
    g.fillStyle = "#f5f6fb"; g.font = font(750, 40); g.textAlign = "right"; g.fillText(value, W - PAD - 30, y + 60); g.textAlign = "left";
    y += 112;
  }
  await foot(g);
  return blob(c);
}
