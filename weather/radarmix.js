// The minutes between the radar's frames, drawn on the graphics chip (radar.js): each frame's tiles kept as rain
// (rainmap.js rainValues: how much of each pixel the rain covers, its strength, and whether it's snow), two frames
// moved along the rain's way and blended as rain, then coloured as the radar colours it (rainmap.js palette). So a
// heavy core easing between two frames goes through the radar's own colours for the rain in between, rather than a
// yellow fading out over a blue. WebGL 1, so it runs on the phones Leaflet's map is for too; where there's none (or
// it's lost), radar.js draws the minutes between itself.
//
// glMix() → null, or { canvas, atlas(id, x0, y0, nx, ny), draw(W, H, parts, fade), drop(), ok() }: an atlas is a
// frame's tiles side by side over a range of the map's (x0, y0: its first tile; nx × ny of them), each put in as it
// comes (atlas.put(tx, ty, vals), atlas.has(tx, ty)); parts: [{ atlas, ox, oy (its first tile's place on the canvas,
// px), sx, sy (how far it's moved, px), w (its share) }], one or two; drop(): the atlases let go.

import { palette } from "./rainmap.js";

const VS = `attribute vec2 a; uniform vec2 size; varying vec2 p;
void main() { p = vec2((a.x + 1.0) * 0.5 * size.x, (1.0 - a.y) * 0.5 * size.y); gl_Position = vec4(a, 0.0, 1.0); }`;
// (each frame's rain where it came from, blended by share; its strength back out of the blend, then its colour; a
// little less of it the further ahead: fade)
const FS = `precision highp float;
varying vec2 p;
uniform sampler2D ta, tb, lut;
uniform vec4 ra, rb;
uniform vec2 sa, sb;
uniform float wa, wb, fade;
vec3 at(sampler2D t, vec4 r, vec2 q) {
  vec2 u = (q - r.xy) / r.zw;
  return (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) ? vec3(0.0) : texture2D(t, u).rgb;
}
void main() {
  vec3 v = at(ta, ra, p - sa) * wa;
  if (wb > 0.0) v += at(tb, rb, p - sb) * wb;
  if (v.g < 0.004) { gl_FragColor = vec4(0.0); return; }
  float x = clamp(v.r / v.g, 0.0, 1.0);
  vec4 c = texture2D(lut, vec2((floor(x * 255.0 + 0.5) + 0.5) / 256.0, v.b * 2.0 > v.g ? 0.75 : 0.25));
  float al = c.a * min(v.g, 1.0) * fade;
  gl_FragColor = vec4(c.rgb * al, al);
}`;

export function glMix(soft) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  let gl = null;
  try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false }); } catch (_) {}
  if (!gl) return null;
  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const u = Object.fromEntries(["size", "ta", "tb", "lut", "ra", "rb", "sa", "sb", "wa", "wb", "fade"].map((k) => [k, gl.getUniformLocation(prog, k)]));
  // (one triangle strip over the canvas)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const texture = (w, h, data, smooth) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const f = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // the radar's colours: rain's along the top row, snow's below
  const lut = new Uint8Array(256 * 2 * 4);
  lut.set(palette(false, soft), 0); lut.set(palette(true, soft), 256 * 4);
  const lutTex = texture(256, 2, lut, false);
  const most = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
  // the frames' atlases, the last few kept
  const atlases = new Map();
  return {
    canvas,
    ok: () => !lost,
    atlas(id, x0, y0, nx, ny) {
      if (atlases.has(id)) { const t = atlases.get(id); atlases.delete(id); atlases.set(id, t); return t; }
      if (nx * 256 > most || ny * 256 > most) return null;
      const tex = texture(nx * 256, ny * 256, null, true), has = new Set();
      const t = {
        x0, y0, nx, ny, tex,
        has: (tx, ty) => has.has(`${tx},${ty}`),
        put(tx, ty, vals) {
          const i = tx - x0, j = ty - y0;
          if (i < 0 || j < 0 || i >= nx || j >= ny || has.has(`${tx},${ty}`)) return;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, i * 256, j * 256, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, vals);
          has.add(`${tx},${ty}`);
        },
      };
      atlases.set(id, t);
      for (const [k, x] of atlases) { if (atlases.size <= 4) break; gl.deleteTexture(x.tex); atlases.delete(k); }
      return t;
    },
    // (the radar put away: the atlases let go, made again as they're next wanted)
    drop() { for (const x of atlases.values()) gl.deleteTexture(x.tex); atlases.clear(); },
    draw(W, H, parts, fade = 1) {
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const [A, B = null] = parts;
      if (!A) return;
      gl.uniform2f(u.size, W, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.atlas.tex); gl.uniform1i(u.ta, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (B || A).atlas.tex); gl.uniform1i(u.tb, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.uniform1i(u.lut, 2);
      const r = (p) => [p.ox, p.oy, p.atlas.nx * 256, p.atlas.ny * 256];
      gl.uniform4f(u.ra, ...r(A)); gl.uniform2f(u.sa, A.sx, A.sy); gl.uniform1f(u.wa, A.w);
      gl.uniform4f(u.rb, ...r(B || A)); gl.uniform2f(u.sb, B ? B.sx : 0, B ? B.sy : 0); gl.uniform1f(u.wb, B ? B.w : 0);
      gl.uniform1f(u.fade, fade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
