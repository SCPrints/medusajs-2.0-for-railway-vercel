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
    return n ? [r / n, g / n, b / n] : null;
  }

  // Un-mix the background: seen = art*a + matte*(1-a)  →  art = (seen - matte*(1-a)) / a
  function removeMatte(img, m) {
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3] / 255;
      if (a <= 0 || a >= 1) continue;
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

  // Replace the colour of the outer d px of every shape with colour pulled from further inside,
  // one ring at a time. Shapes thinner than 2d keep their own innermost colour.
  function defringe(img, m, d) {
    var w = img.width, h = img.height, px = img.data, dist = new Int32Array(m.length), q = new Int32Array(m.length), head = 0, tail = 0;
    for (var i = 0; i < m.length; i++) { if (m[i]) dist[i] = -1; else q[tail++] = i; }
    while (head < tail) {
      var c = q[head++], x = c % w, y = (c - x) / w;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var X = x + dx, Y = y + dy, j = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && dist[j] === -1) { dist[j] = dist[c] + 1; q[tail++] = j; }
      }
    }
    // Pixels touching the image border with no empty pixel nearby still got -1: treat as deep inside.
    for (var L = d; L >= 1; L--) {
      for (var p = 0; p < m.length; p++) {
        if (dist[p] !== L) continue;
        var px0 = p % w, py0 = (p - px0) / w, r = 0, g = 0, b = 0, n = 0;
        for (var ey = -1; ey <= 1; ey++) for (var ex = -1; ex <= 1; ex++) {
          var NX = px0 + ex, NY = py0 + ey, k = NY * w + NX;
          if (NX < 0 || NY < 0 || NX >= w || NY >= h) continue;
          if (dist[k] > L || dist[k] === -1) { r += px[k * 4]; g += px[k * 4 + 1]; b += px[k * 4 + 2]; n++; }
        }
        if (n) { px[p * 4] = r / n; px[p * 4 + 1] = g / n; px[p * 4 + 2] = b / n; }
      }
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
  function removeOutside(img, tol) {
    var ref = borderColour(img);
    return { image: removeBackground(img, borderPixels(img), tol, ref), ref: ref };
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

  // Every enclosed patch of the background colour (minArea px or more), for staff to review.
  // likely = its surroundings are mostly the art's outline colour (the colour that rims the cut-out),
  // which is what a pocket between letters looks like. A white area inside the outline (a cloud,
  // eye whites) can look the same, hence the review.
  // Returns { labels: Int32Array (region index + 1 per pixel, 0 = none), regions: [{ seed, size, likely, box }] }.
  function findGaps(img, ref, tol, minArea) {
    var w = img.width, h = img.height, d = img.data, n = w * h, rim = [];
    var labels = new Int32Array(n), regions = [];
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
      var head = 0, tail = 0, edge = 0, rimLike = 0, off = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      seen[s] = 1; q[tail++] = s;
      while (head < tail) {
        var c = q[head++], cx = c % w, cy = (c - cx) / w, nb2 = nbrs(c);
        off += dist(d, c * 4, ref);
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (var m = 0; m < nb2.length; m++) {
          var j = nb2[m];
          if (seen[j]) continue;
          if (solid(j) && dist(d, j * 4, ref) <= tol) { seen[j] = 1; q[tail++] = j; }
          else if (solid(j)) { edge++; if (outline && onBlend(d, j * 4, ref, outline)) rimLike++; }
        }
      }
      if (tail < minArea) continue;
      // A real pocket is ringed by the outline AND is the background's flat colour. Shading or
      // a different rim (light blue round a cloud's white) means it's part of the art.
      // ponytail: fixed cut-offs; tune here if review keeps flipping the same kind of patch.
      var likely = edge > 0 && rimLike / edge >= 0.6 && off / tail <= tol * 0.5;
      regions.push({ seed: s, size: tail, likely: likely, box: [x0, y0, x1, y1] });
      for (var p = 0; p < tail; p++) labels[q[p]] = regions.length;
    }
    return { labels: labels, regions: regions, outline: outline };
  }

  // Scraps of background too small to cut cleanly (pockets under the review size, hairline slivers
  // where two outlines nearly touch) get painted the colour of the outline round them instead. A scrap qualifies when
  // it's background-ish (near ref, or a blend leaning toward ref) and is mostly ringed by the outline,
  // so letter highlights (ringed by the letter colour) and eye catch-lights (ringed by black) stay.
  // keep (optional 0/1 mask): pixels never painted, e.g. gaps staff chose to keep, or protected colour.
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
    var seen = new Uint8Array(n), q = new Int32Array(n), filled = 0;
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
      if (!inOutlineBand(q, tail)) continue; // a white sparkle in a dark eye or mouth: the dark is enclosed by art
      for (var ring = 0, from = 0; ring < 2; ring++) { // plus its soft edge: up to 2 px of cream-to-outline blend round it
        var end = tail;
        for (var r = from; r < end; r++) {
          var rc = q[r], rx = rc % w, rn = [rx > 0 ? rc - 1 : -1, rx < w - 1 ? rc + 1 : -1, rc - w, rc + w];
          for (var rk = 0; rk < 4; rk++) {
            var rj = rn[rk];
            if (rj >= 0 && rj < n && !seen[rj] && d[rj * 4 + 3] === 255 && onBlend(d, rj * 4, ref, outline)) { seen[rj] = 1; q[tail++] = rj; }
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
    var g = findGaps(img, ref, tol, minArea), seeds = g.regions.filter(function (r) { return r.likely; }).map(function (r) { return r.seed; });
    return { image: seeds.length ? removeBackground(img, seeds, tol, ref) : img, ref: ref, removed: seeds.length, outline: g.outline };
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

  function knockout(input, o) {
    var img = o.scale > 1 ? upscale(input, o.scale) : { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
    var d = img.data, n = img.width * img.height, span = Math.max(1, o.fade);
    for (var i = 0; i < n; i++) d[i * 4 + 3] *= ss((Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) - o.black) / span);
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
      var p = i * 4, mx = Math.max(s[p], s[p + 1], s[p + 2]), a = inside[i] ? 1 : ss((mx - o.black) / span);
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
    for (var i = 0; i < n; i++) { // clustered dots (or lines) on a screen turned by o.angle
      var p = i * 4, m = Math.max(d[p], d[p + 1], d[p + 2]), a = d[p + 3] / 255;
      if (pm) a = pm[p + 1] >= 128 ? 0 : pm[p] >= 128 ? 1 : a; // painted: solid art / gone, with no dots at the brush edge
      if (a < 0.06) { d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0; continue; } // dots too small to print
      var k = Math.min(255 / Math.max(m, 1), 1 / a); // un-mix the black: seen = colour * a
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
    return clean(img, { scale: o.scale, smooth: 2, threshold: 128, choke: 0, defringe: 0, specks: o.specks, matte: "none" });
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

  var DEFAULTS = { scale: 4, matte: "auto", smooth: 5, threshold: 128, choke: 1, defringe: 6, specks: 20 };

  // opts.matte: "auto" | "none" | [r, g, b]
  function clean(input, opts) {
    var o = {}; for (var key in DEFAULTS) o[key] = opts && opts[key] != null ? opts[key] : DEFAULTS[key];
    var img = { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };

    var matte = o.matte === "auto" ? estimateMatte(img) : o.matte === "none" ? null : o.matte;
    if (matte) removeMatte(img, matte);
    if (o.scale > 1) img = upscale(img, o.scale);

    var w = img.width, h = img.height, d = img.data, a = new Float32Array(w * h);
    for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    blur(a, w, h, Math.round(o.smooth));
    var m = new Uint8Array(a.length);
    for (i = 0; i < a.length; i++) m[i] = a[i] >= o.threshold ? 1 : 0;
    if (o.specks > 0) removeSpecks(m, w, h, o.specks);
    if (o.choke > 0) erode(m, w, h, Math.round(o.choke));
    if (o.defringe > 0) defringe(img, m, Math.round(o.defringe));

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

  // What the page runs for every change: the right clean-up for the artwork type, plus the thin-line check
  // when opts.minLinePx is set (solid-shape results only; halftone dots are thin on purpose).
  function process(img, opts) {
    var out = (opts.dark ? darkArt : clean)(img, opts);
    if (opts.minLinePx) out.thin = thinLines(out.image, opts.minLinePx);
    return out;
  }

  var api = { process: process, thinLines: thinLines, clean: clean, removeOutside: removeOutside, removeAt: removeAt, removeGaps: removeGaps, findGaps: findGaps, fillScraps: fillScraps, darkArt: darkArt, darkSizes: darkSizes, borderColour: borderColour, DARK_DEFAULTS: DARK_DEFAULTS, removeBackground: removeBackground, restoreAt: restoreAt, selectAt: selectAt, selectSimilar: selectSimilar, eraseMask: eraseMask, estimateMatte: estimateMatte, upscale: upscale, DEFAULTS: DEFAULTS };
  return api;
});
