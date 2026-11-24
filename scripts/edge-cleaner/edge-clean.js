// Edge Cleaner: pure pixel maths, no DOM. Used by index.html (window.EdgeClean) and the
// Node self-check (edge-clean.check.js). An image is { width, height, data: RGBA bytes }.
//
// Pipeline (all sizes in pixels at the OUTPUT size):
//   remove old background colour from semi-transparent pixels → upscale (bilinear)
//   → blur the alpha → threshold → drop specks → shrink edge → bleed inner colour over the edge ring.
// The result has only fully solid or fully empty pixels, so DTF gets no see-through halo.
(function (root, factory) {
  var api = factory();
  api.source = "(" + factory + ")()"; // lets index.html run it in a background worker
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EdgeClean = api;
})(this, function () {
  "use strict";

  // Average colour of the faint edge pixels: those are mostly old background.
  function estimateMatte(img) {
    var d = img.data, r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3];
      if (a > 0 && a <= 96) { var w = 255 - a; r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w; }
    }
    if (!n) return null;
    // Faint pixels still hold some art, so their average leans toward the art colour (white came out as
    // light grey, which left a pale ring). Each see-through pixel is background + a * (art - background),
    // so a straight line fitted through colour against a, read off at a = 0, is the background itself.
    var N = 0, sa = 0, saa = 0, sc = [0, 0, 0], sac = [0, 0, 0], k;
    for (i = 0; i < d.length; i += 4) {
      a = d[i + 3];
      if (a <= 0 || a >= 200) continue;
      a /= 255; N++; sa += a; saa += a * a;
      for (k = 0; k < 3; k++) { sc[k] += d[i + k]; sac[k] += a * d[i + k]; }
    }
    var det = N * saa - sa * sa;
    if (N < 30 || det < N * N * 0.01) return [r / n, g / n, b / n]; // too few, or all about the same faintness
    return [0, 1, 2].map(function (c) { return Math.max(0, Math.min(255, (sc[c] * saa - sa * sac[c]) / det)); });
  }

  // Un-mix the background: seen = art*a + matte*(1-a)  →  art = (seen - matte*(1-a)) / a
  function removeMatte(img, m, skip) { // skip = pixels whose colour is already pure art (softenCut)
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3] / 255;
      if (a <= 0 || a >= 1 || (skip && skip[i >> 2])) continue;
      for (var k = 0; k < 3; k++) d[i + k] = (d[i + k] - m[k] * (1 - a)) / a;
    }
  }

  // Bilinear on premultiplied colour, so empty pixels don't bleed dark into the edge.
  function upscale(img, s) {
    var w = img.width, h = img.height, W = w * s, H = h * s, src = img.data;
    var pm = new Float32Array(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      var a = src[i * 4 + 3] / 255;
      pm[i * 4] = src[i * 4] * a; pm[i * 4 + 1] = src[i * 4 + 1] * a; pm[i * 4 + 2] = src[i * 4 + 2] * a; pm[i * 4 + 3] = src[i * 4 + 3];
    }
    var out = new Uint8ClampedArray(W * H * 4);
    for (var y = 0; y < H; y++) {
      var sy = Math.min(h - 1, Math.max(0, (y + 0.5) / s - 0.5)), y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
      for (var x = 0; x < W; x++) {
        var sx = Math.min(w - 1, Math.max(0, (x + 0.5) / s - 0.5)), x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
        var p00 = (y0 * w + x0) * 4, p01 = (y0 * w + x1) * 4, p10 = (y1 * w + x0) * 4, p11 = (y1 * w + x1) * 4, o = (y * W + x) * 4;
        var w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
        var a3 = pm[p00 + 3] * w00 + pm[p01 + 3] * w01 + pm[p10 + 3] * w10 + pm[p11 + 3] * w11;
        out[o + 3] = a3;
        if (!a3) continue;
        var inv = 255 / a3;
        for (var k = 0; k < 3; k++) out[o + k] = (pm[p00 + k] * w00 + pm[p01 + k] * w01 + pm[p10 + k] * w10 + pm[p11 + k] * w11) * inv;
      }
    }
    return { width: W, height: H, data: out };
  }

  // Box blur, run twice per axis (close to a Gaussian). Edges clamp.
  function blur(a, w, h, r) {
    if (r < 1) return a;
    var tmp = new Float32Array(a.length), n = 2 * r + 1;
    function pass(src, dst, len, lines, step, lineStep) {
      for (var l = 0; l < lines; l++) {
        var base = l * lineStep, sum = 0;
        for (var i = -r; i <= r; i++) sum += src[base + Math.min(len - 1, Math.max(0, i)) * step];
        for (var j = 0; j < len; j++) {
          dst[base + j * step] = sum / n;
          sum += src[base + Math.min(len - 1, j + r + 1) * step] - src[base + Math.max(0, j - r) * step];
        }
      }
    }
    for (var t = 0; t < 2; t++) { pass(a, tmp, w, h, 1, w); pass(tmp, a, h, w, w, 1); }
    return a;
  }

  // Shrink solid areas by k px. Alternating + and square kernels ≈ round corners.
  function erode(m, w, h, k) {
    for (var p = 0; p < k; p++) {
      var src = m.slice(), sq = p % 2 === 1;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (!src[i]) continue;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!sq && dx && dy) continue;
          var X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h || !src[Y * w + X]) { m[i] = 0; dy = dx = 2; }
        }
      }
    }
  }

  // Drop solid islands smaller than min pixels (leftover background specks).
  function removeSpecks(m, w, h, min) {
    var seen = new Uint8Array(m.length), q = new Int32Array(m.length);
    for (var s = 0; s < m.length; s++) {
      if (!m[s] || seen[s]) continue;
      var head = 0, tail = 0; q[tail++] = s; seen[s] = 1;
      while (head < tail) {
        var i = q[head++], x = i % w, y = (i - x) / w;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var X = x + dx, Y = y + dy, j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && m[j] && !seen[j]) { seen[j] = 1; q[tail++] = j; }
        }
      }
      if (tail < min) for (var t = 0; t < tail; t++) m[q[t]] = 0;
    }
  }

  // Colour repair, before the edge is touched. A pixel that was nearly see-through (alpha under `rel`) has
  // no colour worth printing: pixels Smooth / Threshold added have none, and un-mixing the old background
  // from a faint pixel blows its colour up (black specks on a white background, white specks on a dark
  // one). Each one that ends up solid takes the colour of the nearest trustworthy art, spreading outward
  // from it, up to `reach` px (so a long faint line joined to a shape keeps its own colour past that).
  // img still holds the alpha from before smoothing. q = scratch Int32Array(pixels).
  function repairColour(img, m, rel, reach, q) {
    var w = img.width, h = img.height, px = img.data, n = m.length, lvl = new Uint8Array(n), head = 0, tail = 0, i, dx, dy, X, Y, j;
    // lvl: 0 = not printed, 1 = trusted colour, 255 = needs colour, 2.. = filled (steps from trusted art + 1)
    for (i = 0; i < n; i++) if (m[i]) lvl[i] = px[i * 4 + 3] < rel ? 255 : 1;
    for (i = 0; i < n; i++) { // start from trusted pixels that touch one needing colour
      if (lvl[i] !== 1) continue;
      var x = i % w, y = (i - x) / w, edge = false;
      for (dy = -1; dy <= 1 && !edge; dy++) for (dx = -1; dx <= 1; dx++) {
        X = x + dx; Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && lvl[Y * w + X] === 255) { edge = true; break; }
      }
      if (edge) q[tail++] = i;
    }
    while (head < tail) {
      var c = q[head++], L = lvl[c], cx = c % w, cy = (c - cx) / w, r = 0, g = 0, b = 0, cnt = 0;
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        X = cx + dx; Y = cy + dy; j = Y * w + X;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        if (lvl[j] === 255) { if (L <= reach) { lvl[j] = L + 1; q[tail++] = j; } }
        else if (L > 1 && lvl[j] && lvl[j] < L) { r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; cnt++; }
      }
      if (cnt) { px[c * 4] = r / cnt; px[c * 4 + 1] = g / cnt; px[c * 4 + 2] = b / cnt; }
    }
  }

  // Is solid pixel i the colour further inside (`inner`) with some old background (`bg`) mixed in, i.e. a
  // soft edge? It must sit on the line from inner to bg, part of the way along. A dark outline round a
  // light fill is not on that line, and a pixel that is nearly all background colour yet solid is art.
  function tinted(px, i, inner, bg) {
    var ab = [bg[0] - inner[0], bg[1] - inner[1], bg[2] - inner[2]], len = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    if (len < 2500) return false; // inner colour is about the background colour: nothing to tell apart
    var t = ((px[i] - inner[0]) * ab[0] + (px[i + 1] - inner[1]) * ab[1] + (px[i + 2] - inner[2]) * ab[2]) / len;
    return t >= 0.1 && t <= 0.85 && dist(px, i, [inner[0] + t * ab[0], inner[1] + t * ab[1], inner[2] + t * ab[2]]) <= 40;
  }

  // Edge colour fix: recolour the outer d px of every shape with colour pulled from further inside, one
  // ring at a time, but only pixels that carry the old background: ones that were see-through before the
  // edge was rebuilt (alpha < 250), and solid ones that are plainly the inner colour mixed with the
  // background (`matte`, when known). Other solid pixels are real art, so a dark outline next to a cut-out
  // stays dark; recolouring everything smeared light streaks through outlines. img still holds that alpha.
  function defringe(img, m, d, q, matte) {
    var w = img.width, h = img.height, px = img.data, dist = new Int32Array(m.length), head = 0, tail = 0;
    for (var i = 0; i < m.length; i++) { if (m[i]) dist[i] = -1; else q[tail++] = i; }
    var empty = tail;
    while (head < tail) {
      var c = q[head++], x = c % w, y = (c - x) / w;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var X = x + dx, Y = y + dy, j = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && dist[j] === -1) { dist[j] = dist[c] + 1; q[tail++] = j; }
      }
    }
    // Deepest first (the queue is in distance order), so every ring reads colour already fixed inside it.
    // Pixels touching the image border with no empty pixel nearby still got -1: treat as deep inside.
    for (var t = tail - 1; t >= empty; t--) {
      var p = q[t], L = dist[p];
      if (L > d) continue;
      var px0 = p % w, py0 = (p - px0) / w, r = 0, g = 0, b = 0, n = 0;
      for (var ey = -1; ey <= 1; ey++) for (var ex = -1; ex <= 1; ex++) {
        var NX = px0 + ex, NY = py0 + ey, k = NY * w + NX;
        if (NX < 0 || NY < 0 || NX >= w || NY >= h) continue;
        if (dist[k] > L || dist[k] === -1) { r += px[k * 4]; g += px[k * 4 + 1]; b += px[k * 4 + 2]; n++; }
      }
      if (!n) continue;
      r /= n; g /= n; b /= n;
      if (px[p * 4 + 3] >= 250 && !(matte && tinted(px, p * 4, [r, g, b], matte))) continue;
      px[p * 4] = r; px[p * 4 + 1] = g; px[p * 4 + 2] = b;
    }
  }

  function dist(d, i, r) {
    var a = d[i] - r[0], b = d[i + 1] - r[1], c = d[i + 2] - r[2];
    return Math.sqrt(a * a + b * b + c * c);
  }

  // Flood-fill the background away from the seed pixels: every connected pixel within tol of ref
  // goes fully transparent (already-transparent pixels are walked through, so one click can reach
  // across earlier removals). The ring just outside gets partial alpha by how close it is to ref, so
  // clean() can un-mix that colour off the edge. Enclosed areas (inside letters) need their own click.
  // 4-connected flood from seeds over pixels where ok(i); returns a 0/1 mask.
  function flood(w, n, seeds, ok) {
    var m = new Uint8Array(n), q = new Int32Array(n), head = 0, tail = 0;
    function add(i) { if (!m[i] && ok(i)) { m[i] = 1; q[tail++] = i; } }
    for (var s = 0; s < seeds.length; s++) add(seeds[s]);
    while (head < tail) {
      var i = q[head++], x = i % w;
      if (x > 0) add(i - 1);
      if (x < w - 1) add(i + 1);
      if (i >= w) add(i - w);
      if (i < n - w) add(i + w);
    }
    return m;
  }

  function removeBackground(input, seeds, tol, ref) {
    var d = input.data;
    var gone = flood(input.width, input.width * input.height, seeds, function (i) { return d[i * 4 + 3] === 0 || dist(d, i * 4, ref) <= tol; });
    return cutMask(input, gone, tol, ref);
  }

  // Make the masked pixels transparent; the ring just outside fades by its distance to ref.
  function cutMask(input, gone, tol, ref) {
    var w = input.width, h = input.height, d = new Uint8ClampedArray(input.data), n = w * h, x;
    for (var i = 0; i < n; i++) {
      if (gone[i]) { d[i * 4 + 3] = 0; continue; }
      if (!d[i * 4 + 3]) continue;
      var y = (i - (x = i % w)) / w, edge = false;
      for (var dy = -1; dy <= 1 && !edge; dy++) for (var dx = -1; dx <= 1; dx++) {
        var X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && gone[Y * w + X]) { edge = true; break; }
      }
      if (edge) d[i * 4 + 3] = Math.min(d[i * 4 + 3], 255 * Math.max(0, Math.min(1, (dist(d, i * 4, ref) - tol) / (1.5 * tol + 1))));
    }
    return { width: w, height: h, data: d };
  }

  // Background = the commonest colour round the border (per-channel median); seeds = border pixels near it.
  function borderPixels(img) {
    var w = img.width, h = img.height, border = [];
    for (var x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (var y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
    return border;
  }
  function borderColour(img) {
    var border = borderPixels(img);
    return [0, 1, 2].map(function (k) {
      var v = border.map(function (i) { return img.data[i * 4 + k]; }).sort(function (a, b) { return a - b; });
      return v[v.length >> 1];
    });
  }
  // sealNecks: sketchy line art has small breaks in its outlines, and the flood gets through them into
  // white parts of the design (trousers, a sleeve) and deletes them with no warning. With sealNecks, any
  // area the flood only reaches by squeezing through an opening narrower than about 2k px is held back
  // and left solid, so findGaps lists it for review like an enclosed gap. Channels that are that narrow
  // all the way along (between two letters, a bent or slanted gap, the tip of a notch) are not areas at
  // all and are still removed as before.
  function removeOutside(img, tol, sealNecks) {
    var ref = borderColour(img), w = img.width, h = img.height, n = w * h, d = img.data, border = borderPixels(img);
    var gone = flood(w, n, border, function (i) { return d[i * 4 + 3] === 0 || dist(d, i * 4, ref) <= tol; });
    if (sealNecks) holdPockets(gone, w, h, border, neckSize(w, h));
    return { image: cutMask(img, gone, tol, ref), ref: ref };
  }

  // 1 where every pixel within k (in a square) is 1. Past the image edge counts as 1.
  function shrinkMask(m, w, h, k) {
    var t = new Uint8Array(m.length), o = new Uint8Array(m.length), x, y, last;
    for (y = 0; y < h; y++) { // rows: distance to the nearest 0, from the left then from the right
      for (last = -1e9, x = 0; x < w; x++) { if (!m[y * w + x]) last = x; t[y * w + x] = x - last > k ? 1 : 0; }
      for (last = 1e9, x = w - 1; x >= 0; x--) { if (!m[y * w + x]) last = x; if (last - x <= k) t[y * w + x] = 0; }
    }
    for (x = 0; x < w; x++) {
      for (last = -1e9, y = 0; y < h; y++) { if (!t[y * w + x]) last = y; o[y * w + x] = y - last > k ? 1 : 0; }
      for (last = 1e9, y = h - 1; y >= 0; y--) { if (!t[y * w + x]) last = y; if (last - y <= k) o[y * w + x] = 0; }
    }
    return o;
  }

  // Clears from `gone` (the flood's 0/1 answer) the pockets it only reached through a narrow opening.
  function holdPockets(gone, w, h, border, k) {
    var n = w * h, core = shrinkMask(gone, w, h, k);
    // The open background: where a (2k+1) px square fits, walking in from the border, grown back by k.
    // The square may step diagonally (the two positions overlap, so nothing can sit between them); with
    // straight steps only, a slanted channel just wide enough for the square read as a sealed pocket.
    var open = new Uint8Array(n), q = new Int32Array(n), head = 0, tail = 0, i, c, x, j, dx, dy;
    for (i = 0; i < border.length; i++) if (core[border[i]] && !open[border[i]]) { open[border[i]] = 1; q[tail++] = border[i]; }
    while (head < tail) {
      c = q[head++]; x = c % w;
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        j = c + dy * w + dx;
        if (x + dx >= 0 && x + dx < w && j >= 0 && j < n && core[j] && !open[j]) { open[j] = 1; q[tail++] = j; }
      }
    }
    head = 0; // every open pixel is in q: grow back from all of them
    for (var step = 0; step < k; step++) {
      for (var end = tail; head < end; head++) {
        c = q[head]; x = c % w;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          j = c + dy * w + dx;
          if (x + dx >= 0 && x + dx < w && j >= 0 && j < n && gone[j] && !open[j]) { open[j] = 1; q[tail++] = j; }
        }
      }
    }
    // What's left was reached through a neck. It is a real area only if the same square fits somewhere
    // inside it (it holds a `core` pixel); otherwise it is a channel too narrow for the square all the
    // way along, and stays removed. (Judging "narrow" any other way held back bent and slanted channels.)
    for (var s = 0; s < n; s++) {
      if (!gone[s] || open[s]) continue;
      var roomy = false;
      head = 0; tail = 0; q[tail++] = s; open[s] = 1;
      while (head < tail) {
        c = q[head++]; x = c % w;
        if (core[c]) roomy = true;
        var nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
        for (var m = 0; m < 4; m++) { j = nb[m]; if (j >= 0 && j < n && gone[j] && !open[j]) { open[j] = 1; q[tail++] = j; } }
      }
      if (roomy) for (i = 0; i < tail; i++) gone[q[i]] = 0;
    }
  }

  // Remove the areas of findGaps' answer whose flag is set (remove[k] for regions[k]), by their own pixels.
  // A flood from a seed would also walk across the removed background into every other area that touches it.
  function removeRegions(img, labels, remove, tol, ref) {
    var gone = new Uint8Array(labels.length), any = false;
    for (var i = 0; i < labels.length; i++) if (labels[i] && remove[labels[i] - 1]) { gone[i] = 1; any = true; }
    if (!any) return img;
    var out = cutMask(img, gone, tol, ref);
    // cutMask fades the pixels touching a removed area; a kept area that touches one at a corner stays whole
    for (i = 0; i < labels.length; i++) if (labels[i] && !gone[i]) out.data[i * 4 + 3] = img.data[i * 4 + 3];
    return out;
  }

  // One click: remove the region connected to pixel i, matched to that pixel's colour.
  function removeAt(img, i, tol) {
    var ref = [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]];
    return { image: removeBackground(img, [i], tol, ref), ref: ref };
  }

  // Most frequent colour (32-level bins), averaged within its bin.
  function commonest(cols) {
    var bins = {}, best = null;
    cols.forEach(function (c) {
      var key = (c[0] >> 5) + "," + (c[1] >> 5) + "," + (c[2] >> 5), b = bins[key] || (bins[key] = [0, 0, 0, 0]);
      b[0] += c[0]; b[1] += c[1]; b[2] += c[2]; b[3]++;
      if (!best || b[3] > best[3]) best = b;
    });
    return [best[0] / best[3], best[1] / best[3], best[2] / best[3]];
  }

  // Is pixel i the outline colour, or a blend of background and outline (an anti-aliased edge)?
  function onBlend(d, i, a, b) {
    var ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
    var t = ((d[i] - a[0]) * ab[0] + (d[i + 1] - a[1]) * ab[1] + (d[i + 2] - a[2]) * ab[2]) / len;
    t = Math.max(0, Math.min(1, t));
    return t >= 0.15 && dist(d, i, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]) <= 50;
  }

  // Layers to peel before a patch counts as too thin to cut cleanly: 1, so up to 2 px wide. Anything
  // wider cuts fine and may be art (a skeleton's ribs, fingers, whiskers), so it is never painted over.
  var THIN = 1;
  // A break in an outline counts as narrow up to about twice this many px: 5 px on a 1000 px file, 7 px
  // on 2400. It grows with the file because the same drawing has wider breaks at a higher resolution.
  function neckSize(w, h) { return Math.max(2, Math.round(Math.max(w, h) / 800)); }

  // Is the patch q[0..count) a hairline or a speck, i.e. gone once `passes` layers are peeled off it?
  // own = scratch Uint8Array(pixels), all 0 on entry and on exit.
  function thinPatch(q, count, w, n, passes, own) {
    var i, c, x, left = count;
    for (i = 0; i < count; i++) own[q[i]] = 1;
    for (var p = 0; p < passes && left; p++) {
      for (i = 0; i < count; i++) { // 1 = still there, 3 = goes in this pass (still counts as there), 2 = peeled
        c = q[i];
        if (own[c] !== 1) continue;
        x = c % w;
        if (x === 0 || x === w - 1 || c < w || c >= n - w || own[c - 1] % 2 === 0 || own[c + 1] % 2 === 0 || own[c - w] % 2 === 0 || own[c + w] % 2 === 0) own[c] = 3;
      }
      for (i = 0; i < count; i++) if (own[q[i]] === 3) { own[q[i]] = 2; left--; }
    }
    for (i = 0; i < count; i++) own[q[i]] = 0;
    return !left;
  }

  // Every enclosed patch of the background colour (minArea px or more), for staff to review. Hairlines and
  // specks are left out: they are too thin to cut, and fillScraps deals with them.
  // likely = a real gap, ticked for removal. It must be ringed mostly by the art's outline colour (the
  // colour that rims the cut-out), be the same flat colour as the background that was removed, and have
  // nothing drawn inside it. A face, a skull or a speech bubble has eyes or letters inside, so it is part
  // of the design and stays unless staff tick it. A white area with nothing in it (a plain dress, white
  // lettering) still looks exactly like a gap, hence the review.
  // Returns { labels: Int32Array (region index + 1 per pixel, 0 = none), regions: [{ seed, size, likely, box }] }.
  function findGaps(img, ref, tol, minArea) {
    var w = img.width, h = img.height, d = img.data, n = w * h, rim = [];
    var labels = new Int32Array(n), regions = [], own = new Uint8Array(n), passes = THIN;
    var bgSum = 0, bgN = 0;
    for (var b = 0; b < n; b++) if (!d[b * 4 + 3]) { bgSum += dist(d, b * 4, ref); bgN++; }
    // How far the removed background itself strays from its colour (JPEG noise, paper grain). A gap is
    // the same paper, so it strays about as little; shaded or cream art strays more.
    var paper = Math.min(tol * 0.5, Math.max(6, 3 * (bgN ? bgSum / bgN : 0)));
    function solid(i) { return d[i * 4 + 3] === 255; }
    function nbrs(i) {
      var x = i % w, r = [];
      if (x > 0) r.push(i - 1); if (x < w - 1) r.push(i + 1); if (i >= w) r.push(i - w); if (i < n - w) r.push(i + w);
      return r;
    }
    for (var i = 0; i < n; i++) {
      if (!solid(i) || dist(d, i * 4, ref) <= 3 * tol) continue; // skip blended edge pixels
      var nb = nbrs(i);
      for (var k = 0; k < nb.length; k++) if (d[nb[k] * 4 + 3] < 255) { rim.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]); break; }
    }
    var outline = rim.length ? commonest(rim) : null, seen = new Uint8Array(n), q = new Int32Array(n);
    for (var s = 0; s < n; s++) {
      if (seen[s] || !solid(s) || dist(d, s * 4, ref) > tol) continue;
      // The pixels round the patch are kept at the far end of q (they never overlap the patch itself).
      var head = 0, tail = 0, edge = 0, rimLike = 0, off = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, ring = 0;
      seen[s] = 1; q[tail++] = s;
      while (head < tail) {
        var c = q[head++], cx = c % w, cy = (c - cx) / w, nb2 = nbrs(c);
        off += dist(d, c * 4, ref);
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (var m = 0; m < nb2.length; m++) {
          var j = nb2[m];
          if (seen[j]) continue;
          if (solid(j) && dist(d, j * 4, ref) <= tol) { seen[j] = 1; q[tail++] = j; continue; }
          if (solid(j)) { edge++; if (outline && onBlend(d, j * 4, ref, outline)) rimLike++; }
          if (!own[j]) { own[j] = 1; q[n - 1 - ring++] = j; }
        }
      }
      // Something drawn inside the patch? Its surroundings then come in more than one piece: the loop
      // round the outside plus one piece per thing inside. A piece is part of the outside loop if it
      // holds the pixel above the seed (the patch's top-left pixel) or reaches the image edge (the edge
      // cuts the loop into pieces). Count the pixels of the other pieces; a few stray ones are just noise.
      var inside = 0;
      if (tail >= minArea) for (var r0 = 0; r0 < ring; r0++) {
        var start = q[n - 1 - r0];
        if (own[start] !== 1) continue;
        var st = [start], size = 0, outer = false; own[start] = 2;
        while (st.length) {
          var rc = st.pop(), rx = rc % w;
          size++;
          if (rc === s - w || rx === 0 || rx === w - 1 || rc < w || rc >= n - w) outer = true;
          for (var ry = -1; ry <= 1; ry++) for (var rxx = -1; rxx <= 1; rxx++) {
            var rj = rc + ry * w + rxx;
            if (rx + rxx < 0 || rx + rxx >= w || rj < 0 || rj >= n || own[rj] !== 1) continue;
            own[rj] = 2; st.push(rj);
          }
        }
        if (!outer) inside += size;
      }
      for (var rr = 0; rr < ring; rr++) own[q[n - 1 - rr]] = 0;
      if (tail < minArea || thinPatch(q, tail, w, n, passes, own)) continue;
      // The average must match the paper. A small soft-edged area (a rib, a bandage cell, the inside of a
      // letter in small text) averages off-white and so stays kept. Loosening this for small areas was
      // tried: it ticked the ribs and bandages of real designs again. Kept is the safer mistake.
      // ponytail: fixed cut-offs; tune here if review keeps flipping the same kind of patch.
      var likely = edge > 0 && rimLike / edge >= 0.6 && off / tail <= paper && inside < 8;
      regions.push({ seed: s, size: tail, likely: likely, box: [x0, y0, x1, y1] });
      for (var p = 0; p < tail; p++) labels[q[p]] = regions.length;
    }
    return { labels: labels, regions: regions, outline: outline };
  }

  // Scraps of background too small to cut cleanly (specks, hairline slivers where two outlines nearly
  // touch) get painted the colour of the outline round them instead. A scrap qualifies when it's
  // background-ish (near ref, or a blend leaning toward ref), is mostly ringed by the outline, so letter
  // highlights (ringed by the letter colour) and eye catch-lights (ringed by black) stay, AND is a
  // hairline (thinPatch: up to 2 px wide). Anything wider is left exactly as the customer drew it: it is
  // either a gap for the review or white art (a bandage, a rib, a tooth, the cells of a wrapped arm).
  // Painting by area instead turned those black, small ones included.
  // keep (optional 0/1 mask): pixels never painted: every area the review showed and kept, protected colour.
  // Returns { image, filled: count }.
  function fillScraps(img, ref, outline, tol, maxArea, keep) {
    if (!outline) return { image: img, filled: 0 };
    var w = img.width, h = img.height, n = w * h, d = new Uint8ClampedArray(img.data);
    var ab = [outline[0] - ref[0], outline[1] - ref[1], outline[2] - ref[2]], len = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
    function light(i) {
      if (d[i * 4 + 3] !== 255 || (keep && keep[i])) return false;
      if (dist(d, i * 4, ref) <= tol) return true;
      var t = ((d[i * 4] - ref[0]) * ab[0] + (d[i * 4 + 1] - ref[1]) * ab[1] + (d[i * 4 + 2] - ref[2]) * ab[2]) / len;
      return t > 0 && t <= 0.6 && dist(d, i * 4, [ref[0] + t * ab[0], ref[1] + t * ab[1], ref[2] + t * ab[2]]) <= 50;
    }
    // Real scraps sit in the outline band: the outlines all join into one big dark network that also
    // runs out to the cut-out's edge. An eye's pupil or a mouth is a small dark patch inside the art.
    // So walk the dark outline-coloured pixels round the scrap: it's a scrap if that dark area is big
    // or reaches the edge. ponytail: BIG is a fraction of the image; tune if a huge mouth gets filled.
    var BIG = Math.max(3000, n / 400), mark = new Int32Array(n), stamp = 0, bq = new Int32Array(n);
    function inOutlineBand(cells, count) {
      stamp++;
      var head = 0, tail = 0;
      for (var i = 0; i < count; i++) { mark[cells[i]] = stamp; bq[tail++] = cells[i]; }
      while (head < tail) {
        var c = bq[head++], x = c % w, nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
        for (var k = 0; k < 4; k++) {
          var j = nb[k];
          if (j < 0 || j >= n || d[j * 4 + 3] < 255) return true; // reached the cut edge
          if (mark[j] === stamp || light(j) || !(dist(d, j * 4, outline) <= 60 || onBlend(d, j * 4, ref, outline))) continue;
          mark[j] = stamp; bq[tail++] = j;
          if (tail - count > BIG) return true;
        }
      }
      return false;
    }
    var seen = new Uint8Array(n), q = new Int32Array(n), filled = 0, own = new Uint8Array(n), passes = THIN;
    for (var s = 0; s < n; s++) {
      if (seen[s] || !light(s)) continue;
      var head = 0, tail = 0, edge = 0, rimLike = 0, sum = [0, 0, 0];
      seen[s] = 1; q[tail++] = s;
      while (head < tail) { // explore the whole patch, so a big one (the cloud) is never judged in pieces
        var c = q[head++], x = c % w, nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
        for (var k = 0; k < 4; k++) {
          var j = nb[k];
          if (j < 0 || j >= n || seen[j]) continue;
          if (light(j)) { seen[j] = 1; q[tail++] = j; }
          else if (d[j * 4 + 3] === 255) {
            edge++;
            if (onBlend(d, j * 4, ref, outline) || dist(d, j * 4, outline) <= 60) { rimLike++; sum[0] += d[j * 4]; sum[1] += d[j * 4 + 1]; sum[2] += d[j * 4 + 2]; }
          }
        }
      }
      if (tail > maxArea || !edge || rimLike / edge < 0.6) continue; // big (the cloud) or not ringed by the outline
      if (!thinPatch(q, tail, w, n, passes, own)) continue; // wider than a hairline: leave it
      if (!inOutlineBand(q, tail)) continue; // a white sparkle in a dark eye or mouth: the dark is enclosed by art
      for (var ring = 0, from = 0; ring < 2; ring++) { // plus its soft edge: up to 2 px of cream-to-outline blend round it
        var end = tail;
        for (var r = from; r < end; r++) {
          var rc = q[r], rx = rc % w, rn = [rx > 0 ? rc - 1 : -1, rx < w - 1 ? rc + 1 : -1, rc - w, rc + w];
          for (var rk = 0; rk < 4; rk++) {
            var rj = rn[rk];
            if (rj >= 0 && rj < n && !seen[rj] && !(keep && keep[rj]) && d[rj * 4 + 3] === 255 && onBlend(d, rj * 4, ref, outline)) { seen[rj] = 1; q[tail++] = rj; }
          }
        }
        from = end;
      }
      // Fill with the band's own colour just outside the painted ring (not the design-wide average,
      // and not the soft edge, which is lighter).
      var out3 = [0, 0, 0], no = 0;
      for (var u = from; u < tail; u++) {
        var uc = q[u], ux = uc % w, un = [ux > 0 ? uc - 1 : -1, ux < w - 1 ? uc + 1 : -1, uc - w, uc + w];
        for (var uk = 0; uk < 4; uk++) {
          var uj = un[uk];
          if (uj >= 0 && uj < n && !seen[uj] && d[uj * 4 + 3] === 255 && dist(d, uj * 4, outline) <= 60) { out3[0] += d[uj * 4]; out3[1] += d[uj * 4 + 1]; out3[2] += d[uj * 4 + 2]; no++; }
        }
      }
      var fill = no ? out3.map(function (v) { return v / no; }) : sum.map(function (v) { return v / rimLike; });
      for (var p = 0; p < tail; p++) { d[q[p] * 4] = fill[0]; d[q[p] * 4 + 1] = fill[1]; d[q[p] * 4 + 2] = fill[2]; }
      filled++;
    }
    return { image: { width: w, height: h, data: d }, filled: filled };
  }

  // Remove the likely pockets without review (used by the self-check).
  function removeGaps(img, ref, tol, minArea) {
    var g = findGaps(img, ref, tol, minArea), flags = g.regions.map(function (r) { return r.likely; });
    return { image: removeRegions(img, g.labels, flags, tol, ref), ref: ref, removed: flags.filter(Boolean).length, outline: g.outline };
  }

  // Undo removal for one area: the patch of the ORIGINAL image connected to pixel i, near its colour.
  function restoreAt(img, original, i, tol) {
    var w = img.width, n = w * img.height, o = original.data, out = new Uint8ClampedArray(img.data);
    var ref = [o[i * 4], o[i * 4 + 1], o[i * 4 + 2]], seen = new Uint8Array(n), q = new Int32Array(n), head = 0, tail = 0;
    seen[i] = 1; q[tail++] = i;
    while (head < tail) {
      var c = q[head++], x = c % w;
      var nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      for (var m = 0; m < 4; m++) {
        var j = nb[m];
        if (j >= 0 && j < n && !seen[j] && dist(o, j * 4, ref) <= tol) { seen[j] = 1; q[tail++] = j; }
      }
    }
    // Also bring back a 3 px ring round the area: its outline was the part made see-through.
    for (var ring = 0; ring < 3; ring++) {
      var end = tail;
      for (var p = 0; p < end; p++) {
        var cc = q[p], xx = cc % w, around = [xx > 0 ? cc - 1 : -1, xx < w - 1 ? cc + 1 : -1, cc - w, cc + w];
        for (var a = 0; a < 4; a++) if (around[a] >= 0 && around[a] < n && !seen[around[a]]) { seen[around[a]] = 1; q[tail++] = around[a]; }
      }
    }
    for (p = 0; p < tail; p++) for (var k = 0; k < 4; k++) out[q[p] * 4 + k] = o[q[p] * 4 + k];
    return { width: w, height: img.height, data: out };
  }

  // Magic wand: the visible area connected to pixel i, within tol of its colour. Returns a 0/1 mask.
  function selectAt(img, i, tol) {
    var d = img.data, ref = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    if (!d[i * 4 + 3]) return new Uint8Array(img.width * img.height);
    return flood(img.width, img.width * img.height, [i], function (j) { return d[j * 4 + 3] > 0 && dist(d, j * 4, ref) <= tol; });
  }

  // Average colour of the masked pixels.
  function maskColour(img, mask) {
    var s = [0, 0, 0], c = 0, d = img.data;
    for (var i = 0; i < mask.length; i++) if (mask[i]) { s[0] += d[i * 4]; s[1] += d[i * 4 + 1]; s[2] += d[i * 4 + 2]; c++; }
    return c ? s.map(function (v) { return v / c; }) : null;
  }

  // Every visible pixel anywhere in the image within tol of the selection's average colour.
  function selectSimilar(img, mask, tol) {
    var ref = maskColour(img, mask), d = img.data, out = new Uint8Array(mask.length);
    if (!ref) return out;
    for (var i = 0; i < out.length; i++) out[i] = mask[i] || (d[i * 4 + 3] > 0 && dist(d, i * 4, ref) <= tol) ? 1 : 0;
    return out;
  }

  function eraseMask(img, mask, tol) {
    var ref = maskColour(img, mask);
    return ref ? { image: cutMask(img, mask, tol, ref), ref: ref } : { image: img };
  }

  // ---- Art painted on black, where black is both background and art (shirts, shadows, fades).
  // Colour rules can't split those, so instead of cutting the subject out there are two print routes:
  //   knockout: black becomes see-through and the black shirt IS the black. Brightness sets how solid
  //     each pixel is; colour darkened by the black is un-mixed; the fades become halftone dots so DTF
  //     still gets only solid or empty pixels. Black / very dark shirts only.
  //   backing: keep every pixel and cut one smooth outline round the whole design (a black patch).
  //     Works on any shirt colour.
  // hug / margin / smooth are image px; index.html sets them in proportion to the image (darkSizes).
  // paint: staff brush fixes, { width, height, data } at the input's size, data 0 = leave, 1 = keep as art, 2 = remove.
  var DARK_DEFAULTS = { method: "knockout", black: 18, fade: 52, dot: 8, angle: 45, shape: "round", hug: 30, margin: 8, artLevel: 40, smooth: 15, scale: 4, specks: 20, paint: null };
  function darkSizes(w, h) { // starting outline sizes in proportion to the image, so a 4200 px file isn't treated like a 1500 px one
    var side = Math.max(w, h);
    return { hug: Math.round(side * 0.02), margin: Math.round(side * 0.005), smooth: Math.round(side * 0.01), max: Math.round(side * 0.08) };
  }

  function darkArt(input, opts) {
    var o = {}; for (var key in DARK_DEFAULTS) o[key] = opts && opts[key] != null ? opts[key] : DARK_DEFAULTS[key];
    return o.method === "backing" ? backing(input, o) : o.method === "keep" ? keepDark(input, o) : knockout(input, o);
  }
  function ss(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  // How much of a pixel prints, from its brightness. Solid from Black + Fade up. Below that the dots are that
  // top brightness (see dots), so brightness / top keeps the tone true; the bottom third of the fade rolls
  // off to nothing at Black so haze goes. (A plain ramp from Black dimmed soft glows and cut them short.)
  function cover(mx, black, fade) {
    var top = Math.min(255, black + fade);
    return mx >= top ? 1 : mx / top * ss((mx - black) / (fade / 3));
  }

  function knockout(input, o) {
    var img = o.scale > 1 ? upscale(input, o.scale) : { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
    var d = img.data, n = img.width * img.height, span = Math.max(1, o.fade);
    for (var i = 0; i < n; i++) d[i * 4 + 3] *= cover(Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]), o.black, span);
    return dots(img, o);
  }

  // keep: a knock-out that doesn't lose dark art. A pixel stays if ANY pass says it's art, and only black
  // that every pass calls background goes:
  //   brightness (same as knockout) · colour (dim but still coloured) · texture (detail inside dark areas)
  //   · outline (inside the design's outline, pulled in a little, catches flat black like shirts).
  // Colours always come from the original. Black art prints as black ink, so it suits any shirt colour.
  function keepDark(input, o) {
    var w = input.width, h = input.height, n = w * h, s = input.data, i;
    var m1 = new Float32Array(n), m2 = new Float32Array(n);
    for (i = 0; i < n; i++) { m1[i] = 0.3 * s[i * 4] + 0.59 * s[i * 4 + 1] + 0.11 * s[i * 4 + 2]; m2[i] = m1[i] * m1[i]; }
    blur(m1, w, h, 2); blur(m2, w, h, 2); // local mean + mean of squares = brightness spread
    var inside = outlineMask(input, o, -Math.max(2, Math.round(Math.max(w, h) * 0.003)));
    var img = { width: w, height: h, data: new Uint8ClampedArray(s) }, d = img.data, span = Math.max(1, o.fade);
    for (i = 0; i < n; i++) {
      var p = i * 4, mx = Math.max(s[p], s[p + 1], s[p + 2]), a = inside[i] ? 1 : cover(mx, o.black, span);
      // ponytail: fixed colour/texture thresholds sit just above clean black's noise (chroma 0, spread ~1.4);
      // tie them to the Black level slider if noisy JPEGs keep grey haze.
      if (a < 1 && mx > 9) a = Math.max(a, ss((mx - Math.min(s[p], s[p + 1], s[p + 2]) - 4) / 12), ss((Math.sqrt(Math.max(0, m2[i] - m1[i] * m1[i])) - 3) / 8));
      d[p + 3] = a * s[p + 3];
    }
    return dots(o.scale > 1 ? upscale(img, o.scale) : img, o);
  }

  // Alpha -> print: colour darkened by the black is un-mixed, partial alpha becomes halftone dots.
  function dots(img, o) {
    var w = img.width, d = img.data, n = w * img.height, pm = o.paint ? paintMap(o.paint, w) : null;
    var f = 2 * Math.PI / Math.max(2, o.dot), th = o.angle * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), line = o.shape === "line";
    // A fading pixel is printed as dots no brighter than the top of the fade (Black + Fade), where solid art
    // starts. Brightening it further turned dark grey into white specks, worse the higher Black went.
    var top = Math.min(255, o.black + o.fade);
    for (var i = 0; i < n; i++) { // clustered dots (or lines) on a screen turned by o.angle
      var p = i * 4, m = Math.max(d[p], d[p + 1], d[p + 2]), a = d[p + 3] / 255;
      if (pm) a = pm[p + 1] >= 128 ? 0 : pm[p] >= 128 ? 1 : a; // painted: solid art / gone, with no dots at the brush edge
      if (a < 0.06) { d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0; continue; } // dots too small to print
      var k = o.unmix === false ? 1 : Math.max(1, Math.min(top / Math.max(m, 1), 1 / a)); // un-mix the black: seen = colour * a
      d[p] *= k; d[p + 1] *= k; d[p + 2] *= k;
      var x = i % w, y = (i - x) / w, u = (x * cs + y * sn) * f, v = (y * cs - x * sn) * f;
      d[p + 3] = a >= 0.97 || a > 1 - (line ? Math.cos(u) / 2 + 0.5 : (Math.cos(u) + Math.cos(v)) / 4 + 0.5) ? 255 : 0;
    }
    return { image: img, matte: null };
  }

  // Paint mask scaled up to the output (bilinear, so a 0.5 cut gives a smooth brush edge): R = keep, G = remove.
  function paintMap(pt, W) {
    var n = pt.width * pt.height, img = { width: pt.width, height: pt.height, data: new Uint8ClampedArray(n * 4) };
    for (var i = 0; i < n; i++) { img.data[i * 4] = pt.data[i] === 1 ? 255 : 0; img.data[i * 4 + 1] = pt.data[i] === 2 ? 255 : 0; img.data[i * 4 + 3] = 255; }
    return W === pt.width ? img.data : upscale(img, Math.round(W / pt.width)).data;
  }

  function backing(input, o) {
    var w = input.width, h = input.height, s = input.data, m = outlineMask(input, o, o.margin);
    if (o.paint) for (var j = 0; j < w * h; j++) if (o.paint.data[j]) m[j] = o.paint.data[j] === 1 ? 255 : 0;
    var img = { width: w, height: h, data: new Uint8ClampedArray(s) };
    for (var i = 0; i < w * h; i++) img.data[i * 4 + 3] = Math.min(s[i * 4 + 3], m[i]);
    return clean(img, { scale: o.scale, smooth: 2, threshold: 128, choke: 0, defringe: 0, specks: o.specks, matte: "none", thin: false }); // an outline, not line art: its thin spikes should smooth away
  }

  // One smooth outline round the whole design (w*h, 0/255): art grown by hug, holes filled, shrunk back to
  // `margin` px outside the art (negative = inside it), smoothed.
  function outlineMask(input, o, margin) {
    var w = input.width, h = input.height, s = input.data, i, x, y;
    var hug = Math.max(1, o.hug), sm = Math.max(0, Math.round(o.smooth));
    margin = Math.min(hug, margin);
    // Work on a mask with empty space round the file, so the outline can curve back in near the file's
    // edge instead of the space past the edge counting as art (it gave a flat black tab).
    var P = Math.ceil(hug * 1.2) + 2 * sm + 2, W = w + 2 * P, H = h + 2 * P, N = W * H, m = new Float32Array(N);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = (y * w + x) * 4;
      if (s[i + 3] > 127 && Math.max(s[i], s[i + 1], s[i + 2]) > o.artLevel) m[(y + P) * W + x + P] = 255;
    }
    // Blur + threshold = grow / shrink by roughly the blur's reach (two box passes of radius r reach ~1.6r).
    function grow(px, out) { var r = Math.max(1, Math.round(px / 1.6)); blur(m, W, H, r); for (var k = 0; k < N; k++) m[k] = (out ? m[k] > 8 : m[k] > 247) ? 255 : 0; }
    grow(hug, true); // grow the art outwards...
    var outside = flood(W, N, borderPixels({ width: W, height: H }), function (j) { return !m[j]; });
    for (i = 0; i < N; i++) m[i] = outside[i] ? 0 : 255; // ...fill every hole inside it...
    if (hug - margin >= 1) grow(hug - margin, false); // ...shrink back, stopping `margin` px outside the art (keeps dark rims)
    if (sm > 0) { blur(m, W, H, sm); for (i = 0; i < N; i++) m[i] = m[i] >= 128 ? 255 : 0; } // round off bumps
    var out = new Uint8Array(w * h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) out[y * w + x] = m[(y + P) * W + x + P];
    return out;
  }

  // The soft edge of art that this tool cut off a flat background (opts.cutFrom = that background colour).
  // The cut is a yes/no mask with one faded ring, so the edge only knows whole pixels: curves come out as
  // stair-steps, and the pixels just inside still carry background colour (a pale ring on a dark shirt).
  // But each pixel along the edge of the art is the art colour and the old background mixed:
  // seen = art * t + background * (1 - t), where t is how much of the pixel the art covers. The background
  // is known and the art is the strongest colour just inside, so t is how far the pixel sits along the
  // line from background to art.
  // - t places the edge to a fraction of a pixel, so the upscale can draw a smooth line. Alpha is
  //   t * COVER_GAIN: the edge lands where the art covers 1/(2 * gain) of a pixel, about where the yes/no
  //   cut put it, so lines keep their weight.
  // - The colour becomes the art colour with the background taken out, so no pale ring is left. Those
  //   pixels are returned as a 0/1 mask so the general un-mixing (removeMatte) leaves them alone.
  // Only pixels that really are that mix are touched, working inward from the cut while the art keeps
  // getting stronger: a pale part of the design beside a dark one is off the line and stays as drawn, and
  // so does whatever lies on the far side of a thin line (the white inside a thin outline). The art
  // colour must join up with the pixel, so a faint hairline is not read as the soft edge of a dark shape
  // that sits across a gap from it. Everything else keeps the cut's own alpha.
  // s = the cut as it came in (read only), d = the copy being cleaned (written).
  var COVER_GAIN = 2, COVER_DEPTH = 3, COVER_REACH = 2, COVER_OFF = 36, COVER_MIN = 100;
  function softenCut(s, d, w, h, ref) {
    var n = w * h, i, x, y, X, Y, j, dx, dy, k, c, lvl = new Uint8Array(n), tt = new Float32Array(n), cur = [], next, done = new Uint8Array(n);
    for (i = 0; i < n; i++) { // the pixels touching the cut
      if (!s[i * 4 + 3]) continue;
      x = i % w; y = (i - x) / w;
      for (dy = -1; dy <= 1 && !lvl[i]; dy++) for (dx = -1; dx <= 1; dx++) {
        X = x + dx; Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && !s[(Y * w + X) * 4 + 3]) { lvl[i] = 1; cur.push(i); break; }
      }
    }
    for (var depth = 1; depth <= COVER_DEPTH && cur.length; depth++) {
      next = [];
      for (k = 0; k < cur.length; k++) {
        i = cur[k]; x = i % w; y = (i - x) / w; tt[i] = 1; // 1 = art, or not a mix: nothing past it is edge
        var best = -1, far = 0, dd, before = 0, own = dist(s, i * 4, ref), mx, my, joined;
        for (dy = -COVER_REACH; dy <= COVER_REACH; dy++) for (dx = -COVER_REACH; dx <= COVER_REACH; dx++) {
          X = x + dx; Y = y + dy; j = Y * w + X;
          if (X < 0 || Y < 0 || X >= w || Y >= h || !s[j * 4 + 3]) continue;
          dd = dist(s, j * 4, ref);
          if (dd <= far) continue;
          if (dx > 1 || dx < -1 || dy > 1 || dy < -1) { // two away: it must join up, not sit across a paler gap
            joined = false;
            for (my = y - 1; my <= y + 1 && !joined; my++) for (mx = x - 1; mx <= x + 1; mx++) {
              if (mx < 0 || my < 0 || mx >= w || my >= h || mx - X > 1 || X - mx > 1 || my - Y > 1 || Y - my > 1 || (mx === x && my === y)) continue;
              if (s[(my * w + mx) * 4 + 3] && dist(s, (my * w + mx) * 4, ref) >= own - 10) { joined = true; break; }
            }
            if (!joined) continue;
          }
          far = dd; best = j;
        }
        if (best < 0 || far < COVER_MIN) continue; // the art here is close to the background colour itself
        var ax = s[best * 4] - ref[0], ay = s[best * 4 + 1] - ref[1], az = s[best * 4 + 2] - ref[2];
        var px = s[i * 4] - ref[0], py = s[i * 4 + 1] - ref[1], pz = s[i * 4 + 2] - ref[2];
        var t = (px * ax + py * ay + pz * az) / (ax * ax + ay * ay + az * az);
        if (t >= 0.97) continue;
        if (t < 0) t = 0;
        var ox = px - t * ax, oy = py - t * ay, oz = pz - t * az;
        if (Math.sqrt(ox * ox + oy * oy + oz * oz) > COVER_OFF) continue; // not a mix of the two: real art
        if (depth > 1) { // must still be climbing from the edge pixel(s) it touches
          for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
            X = x + dx; Y = y + dy; j = Y * w + X;
            if (X >= 0 && Y >= 0 && X < w && Y < h && lvl[j] === depth - 1 && tt[j] < 1 && tt[j] > before) before = tt[j];
          }
          if (!before || t < before - 0.05) continue;
        }
        tt[i] = Math.max(t, 0.001);
        var a = Math.min(1, t * COVER_GAIN), o = i * 4;
        // the art colour: un-mixed where there is enough of it to trust, else the strongest colour nearby
        for (c = 0; c < 3; c++) d[o + c] = t >= 0.4 ? Math.max(0, Math.min(255, (s[o + c] - ref[c] * (1 - t)) / t)) : s[best * 4 + c];
        d[o + 3] = Math.round(255 * a); done[i] = 1;
        if (depth < COVER_DEPTH) for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          X = x + dx; Y = y + dy; j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && !lvl[j] && s[j * 4 + 3] === 255) { lvl[j] = depth + 1; next.push(j); }
        }
      }
      cur = next;
    }
    return done;
  }

  // Smoothing must not wipe out or break up a thin line. A line narrower than the blur fades under the
  // threshold: fine text, whiskers, the tail of a stroke, the tip of a point. So the thin parts of the art
  // are taken from before the smoothing (`sharp`: the same edge, not blurred) and put back. Thin = it
  // does not hold a square of 2D + 1 px, which is what the blur cannot be trusted with. Only pieces long
  // enough to be a line or a point: a dot smaller than the blur is left to the smoothing as before, so
  // dust is not brought back. Wide shapes are untouched, so their edges stay smooth. m = smoothed 0/1 mask.
  function boxPass(src, w, h, r, all) { // 1 where the (2r+1) square has any solid pixel, or (all) nothing empty; past the image edge counts as solid for `all`
    var n = w * h, tmp = new Uint8Array(n), out = new Uint8Array(n), x, y, c, cells;
    for (y = 0; y < h; y++) {
      c = 0;
      for (x = 0; x < Math.min(w, r); x++) c += src[y * w + x];
      for (x = 0; x < w; x++) {
        if (x + r < w) c += src[y * w + x + r];
        if (x - r - 1 >= 0) c -= src[y * w + x - r - 1];
        cells = Math.min(w - 1, x + r) - Math.max(0, x - r) + 1;
        tmp[y * w + x] = (all ? c === cells : c > 0) ? 1 : 0;
      }
    }
    for (x = 0; x < w; x++) {
      c = 0;
      for (y = 0; y < Math.min(h, r); y++) c += tmp[y * w + x];
      for (y = 0; y < h; y++) {
        if (y + r < h) c += tmp[(y + r) * w + x];
        if (y - r - 1 >= 0) c -= tmp[(y - r - 1) * w + x];
        cells = Math.min(h - 1, y + r) - Math.max(0, y - r) + 1;
        out[y * w + x] = (all ? c === cells : c > 0) ? 1 : 0;
      }
    }
    return out;
  }
  function keepThin(m, sharp, soft, w, h, D) {
    var n = w * h, i, any = false;
    for (i = 0; i < n; i++) if (sharp[i] && !m[i]) { any = true; break; }
    if (!any) return; // smoothing took nothing away
    var wide = boxPass(boxPass(sharp, w, h, D, true), w, h, D, false); // the parts that hold the square
    var q = new Int32Array(n), minLen = 4 * D + 2, x, y, X, Y, j, dx, dy;
    for (i = 0; i < n; i++) wide[i] = sharp[i] && !wide[i] ? 1 : 0; // now: the thin parts
    for (var st = 0; st < n; st++) {
      if (wide[st] !== 1) continue;
      var head = 0, tail = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      q[tail++] = st; wide[st] = 2;
      while (head < tail) {
        i = q[head++]; x = i % w; y = (i - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          X = x + dx; Y = y + dy; j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && wide[j] === 1) { wide[j] = 2; q[tail++] = j; }
        }
      }
      if (Math.max(x1 - x0, y1 - y0) + 1 < minLen) continue;
      // Put the piece back, with the pixels beside it that the barely blurred edge (`soft`) also holds:
      // that rounds its stair-steps off without thinning it.
      for (var k = 0; k < tail; k++) {
        i = q[k]; m[i] = 1; x = i % w; y = (i - x) / w;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          X = x + dx; Y = y + dy; j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && soft[j]) m[j] = 1;
        }
      }
    }
  }

  var DEFAULTS = { scale: 4, matte: "auto", smooth: 5, threshold: 128, choke: 1, defringe: 6, specks: 20, cutFrom: null, thin: true };

  // opts.matte: "auto" | "none" | [r, g, b]
  // opts.cutFrom: [r, g, b] when this tool cut the art off a flat background of that colour (and the file
  // had no see-through pixels of its own): the cut edge is then rebuilt first, see softenCut.
  // opts.thin: false turns off the thin-line guard (keepThin).
  function clean(input, opts) {
    var o = {}; for (var key in DEFAULTS) o[key] = opts && opts[key] != null ? opts[key] : DEFAULTS[key];
    var img = { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };

    var rebuilt = o.cutFrom ? softenCut(input.data, img.data, img.width, img.height, o.cutFrom) : null;
    var matte = o.matte === "auto" ? o.cutFrom || estimateMatte(img) : o.matte === "none" ? null : o.matte;
    if (matte) removeMatte(img, matte, rebuilt);
    if (o.scale > 1) img = upscale(img, o.scale);

    var w = img.width, h = img.height, d = img.data, a = new Float32Array(w * h);
    for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    var sm0 = Math.round(o.smooth), sharp = null, soft = null;
    if (sm0 >= 1 && o.thin) { // the edge before smoothing, for the thin-line guard: as it is, and barely blurred at a lower level
      var a0 = new Float32Array(a);
      sharp = new Uint8Array(a.length); soft = new Uint8Array(a.length);
      for (i = 0; i < a.length; i++) sharp[i] = a0[i] >= o.threshold ? 1 : 0;
      blur(a0, w, h, 1);
      for (i = 0; i < a.length; i++) soft[i] = a0[i] >= o.threshold * 0.9 ? 1 : 0;
      a0 = null;
    }
    blur(a, w, h, sm0);
    var m = new Uint8Array(a.length);
    for (i = 0; i < a.length; i++) m[i] = a[i] >= o.threshold ? 1 : 0;
    if (sharp) keepThin(m, sharp, soft, w, h, sm0 + 1);
    if (o.specks > 0) removeSpecks(m, w, h, o.specks);
    if (o.choke > 0) erode(m, w, h, Math.round(o.choke));
    // d's alpha is still the one from before smoothing, which is what says whose colour can be trusted:
    // under 96 (mostly old background) once a background was un-mixed, else only pixels with no colour.
    var q = new Int32Array(a.length), sm = Math.round(o.smooth), fr = Math.round(o.defringe);
    repairColour(img, m, matte ? 96 : 8, Math.max(8, 2 * sm + fr), q);
    if (fr > 0) defringe(img, m, fr, q, matte);

    for (i = 0; i < m.length; i++) {
      if (m[i]) d[i * 4 + 3] = 255;
      else d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = d[i * 4 + 3] = 0;
    }
    return { image: img, matte: matte };
  }

  // Lines too thin to print: parts of the solid shape narrower than about minPx that are also long (so
  // sharp corners don't count). Returns their boxes [x0, y0, x1, y1] in image px, biggest first.
  // Works on a reduced copy so a 6000 px file takes well under a second.
  function thinLines(img, minPx) {
    var s = Math.max(1, Math.floor(minPx / 3)), w = Math.ceil(img.width / s), h = Math.ceil(img.height / s), n = w * h, d = img.data;
    var e = Math.max(1, Math.round(minPx / s / 2)), m = new Uint8Array(n), open = new Uint8Array(n), i, x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) m[y * w + x] = d[(y * s * img.width + x * s) * 4 + 3] > 127 ? 1 : 0;
    open.set(m); erode(open, w, h, e); // opening = erode, then grow back (erode the inverse)
    for (i = 0; i < n; i++) open[i] = open[i] ? 0 : 1;
    erode(open, w, h, e + 1);
    for (i = 0; i < n; i++) open[i] = m[i] && open[i] ? 1 : 0; // solid, but gone after the opening = thin
    var seen = new Uint8Array(n), q = new Int32Array(n), out = [];
    for (var st = 0; st < n; st++) {
      if (!open[st] || seen[st]) continue;
      var head = 0, tail = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; q[tail++] = st; seen[st] = 1;
      while (head < tail) {
        i = q[head++]; x = i % w; y = (i - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var X = x + dx, Y = y + dy, j = Y * w + X;
          if (X >= 0 && Y >= 0 && X < w && Y < h && open[j] && !seen[j]) { seen[j] = 1; q[tail++] = j; }
        }
      }
      if (tail >= 12 * e * e) out.push({ area: tail, box: [x0 * s, y0 * s, (x1 + 1) * s, (y1 + 1) * s] });
    }
    out.sort(function (a, b) { return b.area - a.area; });
    return out.slice(0, 200).map(function (r) { return r.box; });
  }

  // ---- Flat background with halftone fades (opts.halftone = { dot, angle, shape }, dot in output px).
  // Soft parts of the art that fade into the removed background (brush strokes, glows, airbrush) print as
  // dots of their full-strength colour instead of a pale solid smear with a hard cut edge. How much of a
  // pixel is art is read off the old background colour the way "colour to alpha" does it: the share of the
  // way from that colour to the edge of the colour range (pale pink off white = red at 40%). Only fades
  // joined to the removed background count, and never the 2 px next to full-strength art, so anti-aliased
  // edges of solid shapes stay smooth edges and pale art enclosed by an outline (white inside a ring) stays solid.
  var FADE_SOLID = 0.97, FADE_PALE = 0.08, FADE_EDGE = 2;
  function mixShare(d, p, bg) { // 0 = the background colour, 1 = full-strength colour
    var a = 0;
    for (var c = 0; c < 3; c++) {
      var v = d[p + c] - bg[c], r = v > 0 ? (bg[c] < 255 ? v / (255 - bg[c]) : 0) : v < 0 ? (bg[c] > 0 ? -v / bg[c] : 0) : 0;
      if (r > a) a = r;
    }
    return a;
  }
  function flatHalftone(input, opts) {
    var w = input.width, h = input.height, n = w * h, s = input.data, bg = opts.cutFrom, i, p, c;
    var mix = new Float32Array(n), core = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      mix[i] = bg ? mixShare(s, i * 4, bg) : 1;
      core[i] = s[i * 4 + 3] >= 250 && mix[i] >= FADE_SOLID ? 1 : 0;
    }
    var nearCore = boxPass(core, w, h, FADE_EDGE, false);
    var fadeOk = function (j) { return s[j * 4 + 3] > 0 && !nearCore[j] && mix[j] >= FADE_PALE && s[j * 4 + 3] / 255 * mix[j] < FADE_SOLID; };
    var seeds = [], x, y;
    for (i = 0; i < n; i++) {
      if (!fadeOk(i)) continue;
      x = i % w; y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !s[(i - 1) * 4 + 3] || !s[(i + 1) * 4 + 3] || !s[(i - w) * 4 + 3] || !s[(i + w) * 4 + 3]) seeds.push(i);
    }
    var fade = flood(w, n, seeds, fadeOk);
    // whole: the soft tones away from the cut edge too (pink inside a white ring). Their dots sit on the old
    // background colour printed solid (white ink between the dots), so the art stays one solid piece.
    var inner = opts.halftone.whole && bg ? new Uint8Array(n) : null;
    var solid = { width: w, height: h, data: new Uint8ClampedArray(s) }, soft = { width: w, height: h, data: new Uint8ClampedArray(n * 4) }, f = soft.data;
    for (i = 0; i < n; i++) {
      if (!fade[i] && !(inner && fadeOk(i) && (inner[i] = 1))) continue;
      p = i * 4;
      for (c = 0; c < 3; c++) f[p + c] = bg ? bg[c] + (s[p + c] - bg[c]) / mix[i] : s[p + c];
      f[p + 3] = s[p + 3] * mix[i];
      if (fade[i]) solid.data[p] = solid.data[p + 1] = solid.data[p + 2] = solid.data[p + 3] = 0;
      else { solid.data[p] = bg[0]; solid.data[p + 1] = bg[1]; solid.data[p + 2] = bg[2]; }
    }
    var out = clean(solid, opts), img = out.image, d = img.data, W = img.width, S = W / w;
    if (opts.minLinePx) out.thin = thinLines(img, opts.minLinePx); // the solid shapes only: dots are thin on purpose
    var t = dots(opts.scale > 1 ? upscale(soft, opts.scale) : soft, { dot: opts.halftone.dot, angle: opts.halftone.angle, shape: opts.halftone.shape, unmix: false }).image.data;
    for (p = 0; p < d.length; p += 4) {
      if (!t[p + 3] || (d[p + 3] && !(inner && inner[Math.floor(p / 4 / W / S) * w + Math.floor(p / 4 % W / S)]))) continue;
      d[p] = t[p]; d[p + 1] = t[p + 1]; d[p + 2] = t[p + 2]; d[p + 3] = 255;
    }
    return out;
  }

  // What the page runs for every change: the right clean-up for the artwork type, plus the thin-line check
  // when opts.minLinePx is set (solid-shape results only; halftone dots are thin on purpose).
  function process(img, opts) {
    var out = (opts.dark ? darkArt : opts.halftone ? flatHalftone : clean)(img, opts);
    if (opts.minLinePx && !out.thin) out.thin = thinLines(out.image, opts.minLinePx);
    return out;
  }

  var api = { process: process, flatHalftone: flatHalftone, thinLines: thinLines, clean: clean, removeOutside: removeOutside, removeAt: removeAt, removeGaps: removeGaps, findGaps: findGaps, removeRegions: removeRegions, fillScraps: fillScraps, darkArt: darkArt, darkSizes: darkSizes, borderColour: borderColour, DARK_DEFAULTS: DARK_DEFAULTS, removeBackground: removeBackground, restoreAt: restoreAt, selectAt: selectAt, selectSimilar: selectSimilar, eraseMask: eraseMask, estimateMatte: estimateMatte, upscale: upscale, DEFAULTS: DEFAULTS };
  return api;
});
