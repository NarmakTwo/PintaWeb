// Pixel engine for the browser build.
// Pinta's GTK 4 / libadwaita shell has no static WebAssembly target.
// OpenSilver expects Silverlight XAML, and Avalonia or Blazor would be a second UI
// that still could not host Gir.Core. This module is the part that belongs in WASM:
// fills, selections, brushes that stamp exact pixels, and the adjustment/effect set.

let cr: i32 = 0;
let cg: i32 = 0;
let cb: i32 = 0;

let gw: i32 = 0;
let gh: i32 = 0;
let gmode: i32 = 0;
let gtol: i32 = 0;
let gsr: i32 = 0;
let gsg: i32 = 0;
let gsb: i32 = 0;
let gsa: i32 = 0;
let gfr: i32 = 0;
let gfg: i32 = 0;
let gfb: i32 = 0;
let gfa: i32 = 0;
let gvisited: i32 = 0;
let gstack: i32 = 0;
let gsp: i32 = 0;
let gmax: i32 = 0;
let gguard: i32 = 0;

export function ping(): i32 {
  return 1;
}

export function setColor(r: i32, g: i32, b: i32): void {
  cr = r;
  cg = g;
  cb = b;
}

export function growTo(minBytes: i32): i32 {
  if (minBytes <= 0) return 1;
  const pages = (minBytes + 65535) >> 16;
  const have = memory.size();
  if (pages > have) {
    const grown = memory.grow(pages - have);
    if (grown < 0) return 0;
  }
  return 1;
}

function load8(index: i32): i32 {
  return <i32>load<u8>(<usize>index);
}

function store8(index: i32, value: i32): void {
  let v = value;
  if (v < 0) v = 0;
  else if (v > 255) v = 255;
  store<u8>(<usize>index, <u8>v);
}

function iabs(v: i32): i32 {
  return v < 0 ? -v : v;
}

function copyBuf(dst: i32, src: i32, n: i32): void {
  if (n <= 0) return;
  memory.copy(<usize>dst, <usize>src, <usize>n);
}

function zero(dst: i32, n: i32): void {
  if (n <= 0) return;
  memory.fill(<usize>dst, 0, <usize>n);
}

function lumAt(o: i32): i32 {
  return (load8(o) * 299 + load8(o + 1) * 587 + load8(o + 2) * 114) / 1000;
}

function hash(x: i32, y: i32, seed: i32): i32 {
  let n = x * 374761393 + y * 668265263 + seed * 1274126177;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return n & 0x7fffffff;
}

function coldist(o: i32, r: i32, g: i32, b: i32, a: i32): i32 {
  let m = iabs(load8(o) - r);
  let d = iabs(load8(o + 1) - g);
  if (d > m) m = d;
  d = iabs(load8(o + 2) - b);
  if (d > m) m = d;
  d = iabs(load8(o + 3) - a);
  if (d > m) m = d;
  return m;
}

function marked(i: i32): bool {
  return load8(gvisited + i) != 0;
}

function mark(i: i32): void {
  store8(gvisited + i, gmode == 0 ? 1 : 255);
  if (gmode == 0) {
    const o = i * 4;
    store8(o, gfr);
    store8(o + 1, gfg);
    store8(o + 2, gfb);
    store8(o + 3, gfa);
  }
}

function can(x: i32, y: i32): bool {
  if (u32(x) >= u32(gw) || u32(y) >= u32(gh)) return false;
  const i = y * gw + x;
  if (marked(i)) return false;
  return coldist(i * 4, gsr, gsg, gsb, gsa) <= gtol;
}

function push(x: i32, y: i32): void {
  if (gsp >= gmax) return;
  store<i32>(<usize>(gstack + gsp * 4), x | (y << 16));
  gsp++;
}

function spanFill(x: i32, y: i32): void {
  if (!can(x, y)) return;
  push(x, y);
  while (gsp > 0 && gguard > 0) {
    gguard--;
    gsp--;
    const packed = load<i32>(<usize>(gstack + gsp * 4));
    let cx = packed & 0xffff;
    const cy = (packed >>> 16) & 0xffff;
    while (can(cx - 1, cy)) cx--;
    let spanUp = false;
    let spanDown = false;
    while (can(cx, cy)) {
      mark(cy * gw + cx);
      if (cy > 0) {
        const up = can(cx, cy - 1);
        if (!spanUp && up) {
          push(cx, cy - 1);
          spanUp = true;
        } else if (spanUp && !up) spanUp = false;
      }
      if (cy + 1 < gh) {
        const down = can(cx, cy + 1);
        if (!spanDown && down) {
          push(cx, cy + 1);
          spanDown = true;
        } else if (spanDown && !down) spanDown = false;
      }
      cx++;
    }
  }
}

function prepareSpan(w: i32, h: i32, x: i32, y: i32, mode: i32, tol: i32): bool {
  if (w <= 0 || h <= 0 || u32(x) >= u32(w) || u32(y) >= u32(h)) return false;
  const n = w * h;
  const stack = (n * 4 + n + 3) & ~3;
  if (growTo(stack + n * 4) == 0) return false;
  gw = w;
  gh = h;
  gmode = mode;
  gtol = tol < 0 ? 0 : tol;
  gvisited = n * 4;
  gstack = stack;
  gsp = 0;
  gmax = n;
  gguard = n * 8;
  zero(gvisited, n);
  const o = (y * w + x) * 4;
  gsr = load8(o);
  gsg = load8(o + 1);
  gsb = load8(o + 2);
  gsa = load8(o + 3);
  return true;
}

export function flood(w: i32, h: i32, x: i32, y: i32, r: i32, g: i32, b: i32, a: i32, tol: i32): void {
  if (!prepareSpan(w, h, x, y, 0, tol)) return;
  gfr = r;
  gfg = g;
  gfb = b;
  gfa = a;
  spanFill(x, y);
}

export function wand(w: i32, h: i32, x: i32, y: i32, tol: i32): void {
  if (!prepareSpan(w, h, x, y, 1, tol)) return;
  spanFill(x, y);
}

export function recolor(w: i32, h: i32, cx: i32, cy: i32, radius: i32, tr: i32, tg: i32, tb: i32, fr: i32, fg: i32, fb: i32, tol: i32): void {
  if (radius < 1) radius = 1;
  const rad2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    if (u32(y) >= u32(h)) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (u32(x) >= u32(w)) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > rad2) continue;
      const o = (y * w + x) * 4;
      if (coldist(o, tr, tg, tb, load8(o + 3)) <= tol) {
        store8(o, fr);
        store8(o + 1, fg);
        store8(o + 2, fb);
      }
    }
  }
}

function plot(w: i32, h: i32, cx: i32, cy: i32, size: i32, r: i32, g: i32, b: i32, a: i32, erase: i32): void {
  const rad = size < 1 ? 0 : (size - 1) >> 1;
  const rad2 = rad * rad + rad;
  for (let y = cy - rad; y <= cy + rad; y++) {
    if (u32(y) >= u32(h)) continue;
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (u32(x) >= u32(w)) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > rad2) continue;
      const o = (y * w + x) * 4;
      if (erase != 0) store8(o + 3, 0);
      else {
        store8(o, r);
        store8(o + 1, g);
        store8(o + 2, b);
        store8(o + 3, a);
      }
    }
  }
}

export function stamp(w: i32, h: i32, x0: i32, y0: i32, x1: i32, y1: i32, size: i32, r: i32, g: i32, b: i32, a: i32, erase: i32): void {
  if (w <= 0 || h <= 0) return;
  let dx = iabs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  let dy = -iabs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    plot(w, h, x0, y0, size, r, g, b, a, erase);
    if (x0 == x1 && y0 == y1) break;
    const e2 = err << 1;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function over(o: i32, sr: i32, sg: i32, sb: i32, sa: i32): void {
  const da = load8(o + 3);
  const outA = sa + (da * (255 - sa)) / 255;
  if (outA <= 0) {
    store8(o, 0);
    store8(o + 1, 0);
    store8(o + 2, 0);
    store8(o + 3, 0);
    return;
  }
  const inv = 255 - sa;
  store8(o, (sr * sa + (load8(o) * da / 255) * inv) / outA);
  store8(o + 1, (sg * sa + (load8(o + 1) * da / 255) * inv) / outA);
  store8(o + 2, (sb * sa + (load8(o + 2) * da / 255) * inv) / outA);
  store8(o + 3, outA);
}

export function paintGradient(w: i32, h: i32, x0: i32, y0: i32, x1: i32, y1: i32, r0: i32, g0: i32, b0: i32, a0: i32, r1: i32, g1: i32, b1: i32, a1: i32, kind: i32): void {
  if (w <= 0 || h <= 0) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let len2 = dx * dx + dy * dy;
  if (len2 < 1) len2 = 1;
  let diamond = iabs(dx);
  const ady = iabs(dy);
  if (ady > diamond) diamond = ady;
  if (diamond < 1) diamond = 1;
  const ang0 = f32(Math.atan2(f32(dy), f32(dx)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let t: f32 = 0;
      if (kind == 1) {
        const ddx = f32(x - x0);
        const ddy = f32(y - y0);
        t = f32(Math.sqrt(ddx * ddx + ddy * ddy)) / f32(Math.sqrt(f32(len2)));
      } else if (kind == 2) {
        let m = iabs(x - x0);
        const my = iabs(y - y0);
        if (my > m) m = my;
        t = f32(m) / f32(diamond);
      } else if (kind == 3) {
        let ang = f32(Math.atan2(f32(y - y0), f32(x - x0))) - ang0;
        const pi2 = f32(Math.PI) * 2;
        while (ang < 0) ang += pi2;
        while (ang >= pi2) ang -= pi2;
        t = ang / pi2;
      } else {
        t = f32((x - x0) * dx + (y - y0) * dy) / f32(len2);
      }
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      const inv = f32(1) - t;
      over(
        (y * w + x) * 4,
        <i32>(f32(r0) * inv + f32(r1) * t),
        <i32>(f32(g0) * inv + f32(g1) * t),
        <i32>(f32(b0) * inv + f32(b1) * t),
        <i32>(f32(a0) * inv + f32(a1) * t),
      );
    }
  }
}

export function clip(w: i32, h: i32): void {
  const n = w * h;
  const prev = n * 4;
  const mask = prev + n * 4;
  for (let i = 0; i < n; i++) {
    const m = load8(mask + i);
    const d = i * 4;
    const s = prev + d;
    if (m >= 255) continue;
    if (m <= 0) {
      store<u32>(<usize>d, load<u32>(<usize>s));
      continue;
    }
    const inv = 255 - m;
    for (let c = 0; c < 4; c++) {
      store8(d + c, (load8(d + c) * m + load8(s + c) * inv) / 255);
    }
  }
}

export function feather(w: i32, h: i32, radius: i32): void {
  if (w <= 0 || h <= 0) return;
  if (radius < 1) radius = 1;
  if (radius > 24) radius = 24;
  const n = w * h;
  if (growTo(n * 2 + 16) == 0) return;
  const tmp = n;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (u32(xx) >= u32(w)) continue;
        sum += load8(y * w + xx);
        count++;
      }
      store8(tmp + y * w + x, count > 0 ? sum / count : 0);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (u32(yy) >= u32(h)) continue;
        sum += load8(tmp + yy * w + x);
        count++;
      }
      store8(y * w + x, count > 0 ? sum / count : 0);
    }
  }
}

function box(w: i32, h: i32, radius: i32, src: i32, dst: i32): void {
  if (radius < 1) radius = 1;
  if (radius > 8) radius = 8;
  const area = (radius * 2 + 1) * (radius * 2 + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        let yy = y + ky;
        if (yy < 0) yy = 0;
        else if (yy >= h) yy = h - 1;
        for (let kx = -radius; kx <= radius; kx++) {
          let xx = x + kx;
          if (xx < 0) xx = 0;
          else if (xx >= w) xx = w - 1;
          const o = src + (yy * w + xx) * 4;
          r += load8(o);
          g += load8(o + 1);
          b += load8(o + 2);
          a += load8(o + 3);
        }
      }
      const o = dst + (y * w + x) * 4;
      store8(o, r / area);
      store8(o + 1, g / area);
      store8(o + 2, b / area);
      store8(o + 3, a / area);
    }
  }
}

function blurInPlace(w: i32, h: i32, radius: i32, passes: i32): void {
  const bytes = w * h * 4;
  const tmp = bytes;
  for (let p = 0; p < passes; p++) {
    box(w, h, radius, 0, tmp);
    copyBuf(0, tmp, bytes);
  }
}

function eachChannel(w: i32, h: i32, kind: i32, p1: i32, p2: i32, p3: i32): void {
  const n = w * h;
  if (kind == 3) {
    let min = 255;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (load8(o + 3) == 0) continue;
      for (let c = 0; c < 3; c++) {
        const v = load8(o + c);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (max <= min) return;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      for (let c = 0; c < 3; c++) store8(o + c, (load8(o + c) - min) * 255 / (max - min));
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = load8(o);
    const g = load8(o + 1);
    const b = load8(o + 2);
    if (kind == 0) {
      store8(o, 255 - r);
      store8(o + 1, 255 - g);
      store8(o + 2, 255 - b);
    } else if (kind == 1) {
      const y = (r * 299 + g * 587 + b * 114) / 1000;
      store8(o, y);
      store8(o + 1, y);
      store8(o + 2, y);
    } else if (kind == 2) {
      store8(o, (r * 393 + g * 769 + b * 189) / 1000);
      store8(o + 1, (r * 349 + g * 686 + b * 168) / 1000);
      store8(o + 2, (r * 272 + g * 534 + b * 131) / 1000);
    } else if (kind == 4) {
      let contrast = p2 * 255 / 100;
      if (contrast > 254) contrast = 254;
      if (contrast < -255) contrast = -255;
      const bright = p1 * 255 / 100;
      const num = 259 * (contrast + 255);
      const den = 255 * (259 - contrast);
      store8(o, num * (r - 128) / den + 128 + bright);
      store8(o + 1, num * (g - 128) / den + 128 + bright);
      store8(o + 2, num * (b - 128) / den + 128 + bright);
    } else if (kind == 6) {
      let levels = p1;
      if (levels < 2) levels = 2;
      if (levels > 32) levels = 32;
      const step = 255 / (levels - 1);
      store8(o, ((r + step / 2) / step) * step);
      store8(o + 1, ((g + step / 2) / step) * step);
      store8(o + 2, ((b + step / 2) / step) * step);
    } else if (kind == 28) {
      if (r > 70 && r > g + 25 && r > b + 25) store8(o, (g + b) / 2);
    } else if (kind == 36) {
      let black = p1;
      let white = p2;
      if (black < 0) black = 0;
      if (white > 255) white = 255;
      if (white <= black) white = black + 1;
      let gamma = f32(p3) / 100;
      if (gamma < 0.1) gamma = 0.1;
      if (gamma > 5) gamma = 5;
      const invG = f32(1) / gamma;
      const span = white - black;
      for (let c = 0; c < 3; c++) {
        let t = f32(load8(o + c) - black) / f32(span);
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        store8(o + c, <i32>(f32(Math.pow(t, invG)) * 255));
      }
    } else if (kind == 37) {
      const strength = f32(p1) / 100;
      for (let c = 0; c < 3; c++) {
        const t = f32(load8(o + c)) / 255;
        const smooth = t * t * (3 - 2 * t);
        let mixed: f32;
        if (strength >= 0) mixed = t + (smooth - t) * strength;
        else mixed = (t - 0.5) * (1 - strength) + 0.5;
        if (mixed < 0) mixed = 0;
        if (mixed > 1) mixed = 1;
        store8(o + c, <i32>(mixed * 255));
      }
    }
  }
}

function hueSat(w: i32, h: i32, hue: i32, sat: i32, light: i32): void {
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let rf = f32(load8(o)) / 255;
    let gf = f32(load8(o + 1)) / 255;
    let bf = f32(load8(o + 2)) / 255;
    let max = rf;
    if (gf > max) max = gf;
    if (bf > max) max = bf;
    let min = rf;
    if (gf < min) min = gf;
    if (bf < min) min = bf;
    const d = max - min;
    let hh: f32 = 0;
    if (d > 0.00001) {
      if (max == rf) hh = (gf - bf) / d + (gf < bf ? 6 : 0);
      else if (max == gf) hh = (bf - rf) / d + 2;
      else hh = (rf - gf) / d + 4;
      hh /= 6;
    }
    let ss: f32 = max == 0 ? 0 : d / max;
    let vv: f32 = max;
    hh += f32(hue) / 360;
    if (hh < 0) hh += 1;
    if (hh >= 1) hh -= 1;
    ss *= 1 + f32(sat) / 100;
    if (ss < 0) ss = 0;
    if (ss > 1) ss = 1;
    vv += f32(light) / 100;
    if (vv < 0) vv = 0;
    if (vv > 1) vv = 1;
    const sector = hh * 6;
    const si = <i32>Math.floor(sector);
    const f = sector - f32(si);
    const p = vv * (1 - ss);
    const q = vv * (1 - f * ss);
    const t = vv * (1 - (1 - f) * ss);
    let nr: f32 = 0;
    let ng: f32 = 0;
    let nb: f32 = 0;
    const m = si % 6;
    if (m == 0) { nr = vv; ng = t; nb = p; }
    else if (m == 1) { nr = q; ng = vv; nb = p; }
    else if (m == 2) { nr = p; ng = vv; nb = t; }
    else if (m == 3) { nr = p; ng = q; nb = vv; }
    else if (m == 4) { nr = t; ng = p; nb = vv; }
    else { nr = vv; ng = p; nb = q; }
    store8(o, <i32>(nr * 255));
    store8(o + 1, <i32>(ng * 255));
    store8(o + 2, <i32>(nb * 255));
  }
}

function sample(w: i32, h: i32, x: i32, y: i32, ch: i32): i32 {
  if (x < 0) x = 0;
  else if (x >= w) x = w - 1;
  if (y < 0) y = 0;
  else if (y >= h) y = h - 1;
  return load8((y * w + x) * 4 + ch);
}

function bilerpChannel(w: i32, h: i32, x: f32, y: f32, ch: i32): i32 {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  const maxX = f32(w - 1);
  const maxY = f32(h - 1);
  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;
  const x0 = <i32>Math.floor(x);
  const y0 = <i32>Math.floor(y);
  let x1 = x0 + 1;
  let y1 = y0 + 1;
  if (x1 >= w) x1 = w - 1;
  if (y1 >= h) y1 = h - 1;
  const tx = x - f32(x0);
  const ty = y - f32(y0);
  const c00 = f32(sample(w, h, x0, y0, ch));
  const c10 = f32(sample(w, h, x1, y0, ch));
  const c01 = f32(sample(w, h, x0, y1, ch));
  const c11 = f32(sample(w, h, x1, y1, ch));
  const top = c00 + (c10 - c00) * tx;
  const bot = c01 + (c11 - c01) * tx;
  return <i32>(top + (bot - top) * ty);
}

function sharpen(w: i32, h: i32, amount: i32): void {
  if (amount < 1) amount = 1;
  if (amount > 20) amount = 20;
  const bytes = w * h * 4;
  const dst = bytes;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        const center = sample(w, h, x, y, c);
        if (c == 3) {
          store8(dst + (y * w + x) * 4 + c, center);
          continue;
        }
        const around = sample(w, h, x - 1, y, c) + sample(w, h, x + 1, y, c) + sample(w, h, x, y - 1, c) + sample(w, h, x, y + 1, c);
        store8(dst + (y * w + x) * 4 + c, center + (center * 4 - around) * amount / 16);
      }
    }
  }
  copyBuf(0, dst, bytes);
}

function kernelGray(w: i32, h: i32, kind: i32): void {
  const bytes = w * h * 4;
  const dst = bytes;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lumAt((y * w + x) * 4);
      const l1 = (sample(w, h, x - 1, y - 1, 0) * 299 + sample(w, h, x - 1, y - 1, 1) * 587 + sample(w, h, x - 1, y - 1, 2) * 114) / 1000;
      const l2 = (sample(w, h, x + 1, y + 1, 0) * 299 + sample(w, h, x + 1, y + 1, 1) * 587 + sample(w, h, x + 1, y + 1, 2) * 114) / 1000;
      let v = 0;
      if (kind == 11) v = 128 + l1 - l2;
      else if (kind == 13) v = 128 + (l1 - l2) / 2 + (l - 128) / 4;
      else v = iabs(l - sample(w, h, x + 1, y, 0)) + iabs(l - sample(w, h, x, y + 1, 0));
      const o = dst + (y * w + x) * 4;
      if (kind == 12) {
        store8(o, v);
        store8(o + 1, v);
        store8(o + 2, v);
      } else if (kind == 34) {
        const on = v > 48 ? 0 : 255;
        store8(o, on);
        store8(o + 1, on);
        store8(o + 2, on);
      } else {
        store8(o, v);
        store8(o + 1, v);
        store8(o + 2, v);
      }
      store8(o + 3, sample(w, h, x, y, 3));
    }
  }
  copyBuf(0, dst, bytes);
}

function pixelate(w: i32, h: i32, size: i32): void {
  if (size < 2) size = 4;
  if (size > 64) size = 64;
  const bytes = w * h * 4;
  const dst = bytes;
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const y2 = by + size < h ? by + size : h;
      const x2 = bx + size < w ? bx + size : w;
      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const o = (y * w + x) * 4;
          r += load8(o);
          g += load8(o + 1);
          b += load8(o + 2);
          a += load8(o + 3);
          count++;
        }
      }
      if (count < 1) count = 1;
      r /= count;
      g /= count;
      b /= count;
      a /= count;
      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const o = dst + (y * w + x) * 4;
          store8(o, r);
          store8(o + 1, g);
          store8(o + 2, b);
          store8(o + 3, a);
        }
      }
    }
  }
  copyBuf(0, dst, bytes);
}

function noise(w: i32, h: i32, amount: i32, seed: i32): void {
  if (amount < 0) amount = 0;
  if (amount > 100) amount = 100;
  if (seed == 0) seed = 1;
  const amp = amount * 2;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const y = i / w;
    const x = i - y * w;
    for (let c = 0; c < 3; c++) {
      const span = amp * 2 + 1;
      const delta = span > 0 ? (hash(x + c * 19, y, seed) % span) - amp : 0;
      store8(o + c, load8(o + c) + delta);
    }
  }
}

function dither(w: i32, h: i32, levels: i32): void {
  if (levels < 2) levels = 2;
  if (levels > 16) levels = 16;
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const old = load8(o + c);
        const neu = ((old + step / 2) / step) * step;
        store8(o + c, neu);
        const err = old - (neu < 0 ? 0 : neu > 255 ? 255 : neu);
        if (x + 1 < w) store8(o + 4 + c, load8(o + 4 + c) + err * 7 / 16);
        if (y + 1 < h) {
          const down = o + w * 4 + c;
          if (x > 0) store8(down - 4, load8(down - 4) + err * 3 / 16);
          store8(down, load8(down) + err * 5 / 16);
          if (x + 1 < w) store8(down + 4, load8(down + 4) + err * 1 / 16);
        }
      }
    }
  }
}

function clouds(w: i32, h: i32, scale: i32, seed: i32): void {
  if (scale < 4) scale = 32;
  if (seed == 0) seed = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = x / scale;
      const y0 = y / scale;
      const tx = f32(x - x0 * scale) / f32(scale);
      const ty = f32(y - y0 * scale) / f32(scale);
      const v00 = f32(hash(x0, y0, seed) & 255);
      const v10 = f32(hash(x0 + 1, y0, seed) & 255);
      const v01 = f32(hash(x0, y0 + 1, seed) & 255);
      const v11 = f32(hash(x0 + 1, y0 + 1, seed) & 255);
      const top = v00 + (v10 - v00) * tx;
      const bot = v01 + (v11 - v01) * tx;
      const v = <i32>(top + (bot - top) * ty);
      const o = (y * w + x) * 4;
      store8(o, v);
      store8(o + 1, v);
      store8(o + 2, v);
      store8(o + 3, 255);
    }
  }
}

function fractal(w: i32, h: i32, julia: bool, p1: i32, p2: i32): void {
  let cx = f32(p1) / 1000;
  let cy = f32(p2) / 1000;
  if (p1 == 0 && p2 == 0) {
    cx = -0.8;
    cy = 0.156;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let zx = f32(x) / f32(w) * 3.2 - 2.2;
      let zy = f32(y) / f32(h) * 2.4 - 1.2;
      let crv = zx;
      let civ = zy;
      if (julia) {
        crv = cx;
        civ = cy;
      }
      let iter = 0;
      while (iter < 40 && zx * zx + zy * zy < 4) {
        const nzx = zx * zx - zy * zy + crv;
        zy = 2 * zx * zy + civ;
        zx = nzx;
        iter++;
      }
      const o = (y * w + x) * 4;
      const shade = iter * 255 / 40;
      store8(o, shade);
      store8(o + 1, shade * shade / 255);
      store8(o + 2, 255 - shade / 2);
      store8(o + 3, 255);
    }
  }
}

function cells(w: i32, h: i32, cell: i32, seed: i32): void {
  if (cell < 4) cell = 24;
  if (seed == 0) seed = 5;
  const rad = cell * 2 / 5;
  const rad2 = rad * rad;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const gy = y / cell;
      const ccx = gx * cell + cell / 2;
      const ccy = gy * cell + cell / 2;
      const dx = x - ccx;
      const dy = y - ccy;
      const o = (y * w + x) * 4;
      if (dx * dx + dy * dy <= rad2) {
        const c = hash(gx, gy, seed);
        store8(o, c & 255);
        store8(o + 1, (c >> 8) & 255);
        store8(o + 2, (c >> 16) & 255);
      } else {
        store8(o, 245);
        store8(o + 1, 245);
        store8(o + 2, 245);
      }
      store8(o + 3, 255);
    }
  }
}

function voronoi(w: i32, h: i32, count: i32, seed: i32): void {
  if (count < 4) count = 16;
  if (count > 28) count = 28;
  if (seed == 0) seed = 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0x7fffffff;
      let color = 0;
      for (let i = 0; i < count; i++) {
        const sx = hash(i, seed, 1) % w;
        const sy = hash(i, seed, 2) % h;
        const dx = x - sx;
        const dy = y - sy;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          color = hash(i, seed, 3);
        }
      }
      const o = (y * w + x) * 4;
      store8(o, color & 255);
      store8(o + 1, (color >> 8) & 255);
      store8(o + 2, (color >> 16) & 255);
      store8(o + 3, 255);
    }
  }
}

function displace(w: i32, h: i32, kind: i32, p1: i32, p2: i32): void {
  const bytes = w * h * 4;
  const dst = bytes;
  const cx = f32(w - 1) * 0.5;
  const cy = f32(h - 1) * 0.5;
  let maxr = f32(Math.sqrt(cx * cx + cy * cy));
  if (maxr < 1) maxr = 1;
  const samples = 8;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rsum = 0;
      let gsum = 0;
      let bsum = 0;
      let asum = 0;
      let used = 0;
      if (kind == 14 || kind == 15 || kind == 32 || kind == 21) {
        const dist = p1 < 1 ? 6 : p1;
        for (let s = 0; s < samples; s++) {
          let sx = f32(x);
          let sy = f32(y);
          const t = f32(s) / f32(samples - 1) - 0.5;
          if (kind == 14) {
            const ang = f32(p2) * f32(Math.PI) / 180;
            sx += f32(Math.cos(ang)) * f32(dist) * t * 2;
            sy += f32(Math.sin(ang)) * f32(dist) * t * 2;
          } else if (kind == 15) {
            const pull = f32(dist) / 40 * f32(s) / f32(samples);
            sx = f32(x) + (cx - f32(x)) * pull;
            sy = f32(y) + (cy - f32(y)) * pull;
          } else if (kind == 32) {
            const dx = f32(x) - cx;
            const dy = f32(y) - cy;
            const rad = f32(Math.sqrt(dx * dx + dy * dy));
            const ang = f32(Math.atan2(dy, dx)) + t * f32(dist) / 40;
            sx = cx + f32(Math.cos(ang)) * rad;
            sy = cy + f32(Math.sin(ang)) * rad;
          } else {
            const ox = ((s & 1) == 0 ? -dist : dist);
            const oy = ((s & 2) == 0 ? -dist : dist);
            sx = f32(x + ox);
            sy = f32(y + oy);
          }
          rsum += bilerpChannel(w, h, sx, sy, 0);
          gsum += bilerpChannel(w, h, sx, sy, 1);
          bsum += bilerpChannel(w, h, sx, sy, 2);
          asum += bilerpChannel(w, h, sx, sy, 3);
          used++;
        }
      } else {
        let sx = f32(x);
        let sy = f32(y);
        const dx = f32(x) - cx;
        const dy = f32(y) - cy;
        const rad = f32(Math.sqrt(dx * dx + dy * dy));
        if (kind == 16 && rad > 0.001) {
          let exp = f32(1) + f32(p1) / 100;
          if (exp < f32(0.05)) exp = f32(0.05);
          const nr = f32(Math.pow(rad / maxr, exp)) * maxr;
          sx = cx + dx / rad * nr;
          sy = cy + dy / rad * nr;
        } else if (kind == 17 && rad > 0.001) {
          const ang = f32(Math.atan2(dy, dx)) + f32(p1) / 100 * f32(Math.PI) * (1 - rad / maxr);
          sx = cx + f32(Math.cos(ang)) * rad;
          sy = cy + f32(Math.sin(ang)) * rad;
        } else if (kind == 33 && rad > 0.5) {
          const nr = maxr * maxr / (rad * (p1 == 0 ? 1 : f32(iabs(p1)) / 50));
          sx = cx + dx / rad * nr;
          sy = cy + dy / rad * nr;
        } else if (kind == 22) {
          let size = p1;
          if (size < 2) size = 16;
          const period = size * 2;
          let tx = x % period;
          let ty = y % period;
          if (tx < 0) tx += period;
          if (ty < 0) ty += period;
          if (tx >= size) tx = period - 1 - tx;
          if (ty >= size) ty = period - 1 - ty;
          sx = f32(tx);
          sy = f32(ty);
        } else if (kind == 23 || kind == 35) {
          let reach = p1;
          if (reach < 1) reach = 4;
          const seed = p2 == 0 ? 9 : p2;
          const jx = (hash(x, y, seed) % (reach * 2 + 1)) - reach;
          const jy = (hash(x, y, seed + 3) % (reach * 2 + 1)) - reach;
          sx = f32(x + jx);
          sy = f32(y + jy);
        }
        rsum = bilerpChannel(w, h, sx, sy, 0);
        gsum = bilerpChannel(w, h, sx, sy, 1);
        bsum = bilerpChannel(w, h, sx, sy, 2);
        asum = bilerpChannel(w, h, sx, sy, 3);
        used = 1;
      }
      const o = dst + (y * w + x) * 4;
      store8(o, rsum / used);
      store8(o + 1, gsum / used);
      store8(o + 2, bsum / used);
      store8(o + 3, asum / used);
    }
  }
  copyBuf(0, dst, bytes);
}

function vignette(w: i32, h: i32, amount: i32): void {
  if (amount < 0) amount = 0;
  if (amount > 100) amount = 100;
  const cx = f32(w - 1) * 0.5;
  const cy = f32(h - 1) * 0.5;
  let maxr = f32(Math.sqrt(cx * cx + cy * cy));
  if (maxr < 1) maxr = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = f32(x) - cx;
      const dy = f32(y) - cy;
      let dark = f32(Math.sqrt(dx * dx + dy * dy)) / maxr;
      dark = dark * dark * f32(amount) / 100;
      if (dark > 1) dark = 1;
      const o = (y * w + x) * 4;
      const keep = f32(1) - dark;
      store8(o, <i32>(f32(load8(o)) * keep));
      store8(o + 1, <i32>(f32(load8(o + 1)) * keep));
      store8(o + 2, <i32>(f32(load8(o + 2)) * keep));
    }
  }
}

function oil(w: i32, h: i32, radius: i32): void {
  if (radius < 1) radius = 1;
  if (radius > 3) radius = 3;
  if (w * h > 1500000 && radius > 1) radius = 1;
  const bytes = w * h * 4;
  const dst = bytes;
  const hist = bytes * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      zero(hist, 16 * 16);
      for (let ky = -radius; ky <= radius; ky++) {
        const yy = y + ky;
        if (u32(yy) >= u32(h)) continue;
        for (let kx = -radius; kx <= radius; kx++) {
          const xx = x + kx;
          if (u32(xx) >= u32(w)) continue;
          const o = (yy * w + xx) * 4;
          const bucket = lumAt(o) >> 4;
          const base = hist + bucket * 16;
          store<i32>(<usize>base, load<i32>(<usize>base) + 1);
          store<i32>(<usize>(base + 4), load<i32>(<usize>(base + 4)) + load8(o));
          store<i32>(<usize>(base + 8), load<i32>(<usize>(base + 8)) + load8(o + 1));
          store<i32>(<usize>(base + 12), load<i32>(<usize>(base + 12)) + load8(o + 2));
        }
      }
      let best = -1;
      let chosen = 0;
      for (let b = 0; b < 16; b++) {
        const count = load<i32>(<usize>(hist + b * 16));
        if (count > best) {
          best = count;
          chosen = b;
        }
      }
      const base = hist + chosen * 16;
      const count = load<i32>(<usize>base);
      const div = count > 0 ? count : 1;
      const o = dst + (y * w + x) * 4;
      store8(o, load<i32>(<usize>(base + 4)) / div);
      store8(o + 1, load<i32>(<usize>(base + 8)) / div);
      store8(o + 2, load<i32>(<usize>(base + 12)) / div);
      store8(o + 3, sample(w, h, x, y, 3));
    }
  }
  copyBuf(0, dst, bytes);
}

function median(w: i32, h: i32, radius: i32): void {
  if (radius < 1) radius = 1;
  if (radius > 2) radius = 2;
  const bytes = w * h * 4;
  const dst = bytes;
  const scratch = bytes * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        const yy = y + ky;
        if (u32(yy) >= u32(h)) continue;
        for (let kx = -radius; kx <= radius; kx++) {
          const xx = x + kx;
          if (u32(xx) >= u32(w)) continue;
          const o = (yy * w + xx) * 4;
          store<i32>(<usize>(scratch + n * 4), load8(o));
          store<i32>(<usize>(scratch + 160 + n * 4), load8(o + 1));
          store<i32>(<usize>(scratch + 320 + n * 4), load8(o + 2));
          n++;
        }
      }
      for (let channel = 0; channel < 3; channel++) {
        const base = scratch + channel * 160;
        for (let i = 1; i < n; i++) {
          const key = load<i32>(<usize>(base + i * 4));
          let j = i - 1;
          while (j >= 0 && load<i32>(<usize>(base + j * 4)) > key) {
            store<i32>(<usize>(base + (j + 1) * 4), load<i32>(<usize>(base + j * 4)));
            j--;
          }
          store<i32>(<usize>(base + (j + 1) * 4), key);
        }
      }
      const mid = n > 0 ? n / 2 : 0;
      const o = dst + (y * w + x) * 4;
      store8(o, load<i32>(<usize>(scratch + mid * 4)));
      store8(o + 1, load<i32>(<usize>(scratch + 160 + mid * 4)));
      store8(o + 2, load<i32>(<usize>(scratch + 320 + mid * 4)));
      store8(o + 3, sample(w, h, x, y, 3));
    }
  }
  copyBuf(0, dst, bytes);
}

function glow(w: i32, h: i32, radius: i32): void {
  if (radius < 1) radius = 2;
  const bytes = w * h * 4;
  const orig = bytes;
  const blurred = bytes * 2;
  copyBuf(orig, 0, bytes);
  box(w, h, radius, 0, blurred);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    for (let c = 0; c < 3; c++) {
      const a = load8(orig + o + c);
      const d = load8(blurred + o + c);
      store8(o + c, 255 - ((255 - a) * (255 - d)) / 255);
    }
    store8(o + 3, load8(orig + o + 3));
  }
}

function ink(w: i32, h: i32): void {
  const bytes = w * h * 4;
  const dst = bytes;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const yv = lumAt(o);
      const edge = iabs(yv - lumAt(((y < h - 1 ? y + 1 : y) * w + x) * 4)) + iabs(yv - lumAt((y * w + (x < w - 1 ? x + 1 : x)) * 4));
      const v = yv - edge * 2;
      const out = dst + o;
      store8(out, v);
      store8(out + 1, v);
      store8(out + 2, v);
      store8(out + 3, load8(o + 3));
    }
  }
  copyBuf(0, dst, bytes);
}

function pencilSketch(w: i32, h: i32): void {
  const bytes = w * h * 4;
  const gray = bytes;
  const blurred = bytes * 2;
  for (let i = 0; i < w * h; i++) {
    const y = lumAt(i * 4);
    const o = gray + i * 4;
    store8(o, y);
    store8(o + 1, y);
    store8(o + 2, y);
    store8(o + 3, 255);
  }
  box(w, h, 2, gray, blurred);
  for (let i = 0; i < w * h; i++) {
    const g = load8(gray + i * 4);
    let inv = 255 - load8(blurred + i * 4);
    if (inv < 1) inv = 1;
    let out = g * 255 / inv;
    if (out > 255) out = 255;
    store8(i * 4, out);
    store8(i * 4 + 1, out);
    store8(i * 4 + 2, out);
    store8(i * 4 + 3, 255);
  }
}

function outline(w: i32, h: i32, spread: i32): void {
  if (spread < 1) spread = 1;
  if (spread > 8) spread = 8;
  const bytes = w * h * 4;
  const dst = bytes;
  copyBuf(dst, 0, bytes);
  const spread2 = spread * spread;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (load8(o + 3) > 20) continue;
      let hit = false;
      for (let ky = -spread; ky <= spread; ky++) {
        for (let kx = -spread; kx <= spread; kx++) {
          if (kx * kx + ky * ky > spread2) continue;
          const xx = x + kx;
          const yy = y + ky;
          if (u32(xx) >= u32(w) || u32(yy) >= u32(h)) continue;
          if (load8((yy * w + xx) * 4 + 3) > 20) hit = true;
        }
      }
      if (hit) {
        const d = dst + o;
        store8(d, cr);
        store8(d + 1, cg);
        store8(d + 2, cb);
        store8(d + 3, 255);
      }
    }
  }
  copyBuf(0, dst, bytes);
}

function soften(w: i32, h: i32, radius: i32, keep: i32): void {
  const bytes = w * h * 4;
  const orig = bytes;
  const blurred = bytes * 2;
  copyBuf(orig, 0, bytes);
  box(w, h, radius, 0, blurred);
  const blend = keep < 0 ? 0 : keep > 100 ? 100 : keep;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    for (let c = 0; c < 4; c++) {
      const a = load8(orig + o + c);
      const b = load8(blurred + o + c);
      store8(o + c, (a * blend + b * (100 - blend)) / 100);
    }
  }
}

export function run(id: i32, w: i32, h: i32, p1: i32, p2: i32, p3: i32): void {
  if (w <= 0 || h <= 0) return;
  if (growTo(w * h * 16 + 512) == 0) return;
  if (id == 0 || id == 1 || id == 2 || id == 3 || id == 4 || id == 6 || id == 28 || id == 36 || id == 37) eachChannel(w, h, id, p1, p2, p3);
  else if (id == 5) hueSat(w, h, p1, p2, p3);
  else if (id == 7) blurInPlace(w, h, p1 < 1 ? 2 : p1, 3);
  else if (id == 8) sharpen(w, h, p1);
  else if (id == 9) pixelate(w, h, p1);
  else if (id == 10) noise(w, h, p1, p2);
  else if (id == 11 || id == 12 || id == 13 || id == 34) kernelGray(w, h, id == 34 ? 34 : id);
  else if (id == 14 || id == 15 || id == 16 || id == 17 || id == 21 || id == 22 || id == 23 || id == 32 || id == 33 || id == 35) displace(w, h, id, p1, p2);
  else if (id == 18) vignette(w, h, p1);
  else if (id == 19) oil(w, h, p1);
  else if (id == 20 || id == 40) median(w, h, p1 < 1 ? 1 : p1);
  else if (id == 24) dither(w, h, p1);
  else if (id == 25) clouds(w, h, p1, p2);
  else if (id == 26) fractal(w, h, true, p1, p2);
  else if (id == 27) fractal(w, h, false, 0, 0);
  else if (id == 29) ink(w, h);
  else if (id == 30) pencilSketch(w, h);
  else if (id == 31) glow(w, h, p1 < 1 ? 3 : p1);
  else if (id == 38) blurInPlace(w, h, p1 < 1 ? 3 : p1, 2);
  else if (id == 39) soften(w, h, p1 < 1 ? 3 : p1, 45);
  else if (id == 41) cells(w, h, p1, p2);
  else if (id == 42) voronoi(w, h, p1, p2);
  else if (id == 43) outline(w, h, p1);
}
