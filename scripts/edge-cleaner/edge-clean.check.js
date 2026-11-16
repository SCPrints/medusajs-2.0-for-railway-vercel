// Self-check for edge-clean.js. Run: node scripts/edge-cleaner/edge-clean.check.js
// Fake "background removed" art: a red disc cut from a black background, so its edge pixels are
// half-transparent AND darkened by the old black — the same fault as the real artwork.
const assert = require("assert");
const { clean, removeOutside, removeAt, removeGaps, restoreAt, selectAt, selectSimilar, eraseMask, findGaps, fillScraps, darkArt } = require("./edge-clean.js");

const W = 40, R = 12, C = 20;
const data = new Uint8ClampedArray(W * W * 4);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  let cov = 0; // 4x4 supersampled coverage = low-res antialiasing
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const dx = x + (sx + 0.5) / 4 - C, dy = y + (sy + 0.5) / 4 - C;
    if (dx * dx + dy * dy <= R * R) cov++;
  }
  const a = cov / 16, i = (y * W + x) * 4;
  data[i] = 230 * a; data[i + 3] = 255 * a; // red mixed with black, not un-mixed
}
data[(2 * W + 2) * 4 + 3] = 255; // a one-pixel speck left over from background removal

const { image, matte } = clean({ width: W, height: W, data }, { scale: 4 });
assert(matte && matte[0] < 120 && matte[1] < 10, "should detect a dark old background, got " + matte);
assert.strictEqual(image.width, W * 4);

let area = 0, minRed = 255, maxDev = 0;
const S = 4, d = image.data;
for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
  const i = (y * image.width + x) * 4, a = d[i + 3];
  assert(a === 0 || a === 255, "alpha must be solid or empty");
  if (!a) continue;
  area++;
  minRed = Math.min(minRed, d[i]);
  assert(d[i + 1] < 10 && d[i + 2] < 10, "edge picked up a foreign colour");
  const onEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !d[((y + dy) * image.width + x + dx) * 4 + 3]);
  if (onEdge) maxDev = Math.max(maxDev, Math.abs(Math.hypot((x + 0.5) / S - C, (y + 0.5) / S - C) - R) * S); // output px off the true circle
}
assert(d[(2 * S * image.width + 2 * S) * 4 + 3] === 0, "speck should be gone");
assert(minRed > 215, "dark ring left on the edge, darkest red = " + minRed);
const ideal = Math.PI * (R * S) ** 2;
assert(Math.abs(area / ideal - 1) < 0.06, "shape grew or shrank too much: " + (area / ideal).toFixed(3));
assert(maxDev < 3, "edge not round, worst " + maxDev.toFixed(2) + " px");
console.log(`ok: matte ${matte.map(Math.round)}, darkest edge red ${minRed}, area ${(area / ideal).toFixed(3)} of ideal`);

// Background removal: solid cream image, navy ring around a yellow disc with a cream hole in the middle
// (like the inside of an "O"). Outside removal must keep the hole; a click on the hole removes it.
{
  const N = 60, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N, r = Math.hypot(x + 0.5 - 30, y + 0.5 - 30);
    const c = r < 6 ? [246, 243, 234] : r < 18 ? [255, 210, 31] : r < 22 ? [20, 24, 80] : [246, 243, 234];
    img.data.set([...c, 255], i * 4);
  }
  const at = (im, x, y) => im.data[(y * N + x) * 4 + 3];
  const out = removeOutside(img, 40);
  assert.deepStrictEqual(out.ref, [246, 243, 234], "border colour");
  assert.strictEqual(at(out.image, 2, 2), 0, "corner should be removed");
  assert.strictEqual(at(out.image, 30, 30), 255, "enclosed hole must survive outside removal");
  assert.strictEqual(at(out.image, 30, 14), 255, "art must survive");
  // The hole is rimmed by yellow, not the navy outline, so it reads as a highlight: keep it.
  assert.strictEqual(at(removeGaps(out.image, out.ref, 40, 15).image, 30, 30), 255, "highlight-like patch must be kept");
  const holed = removeAt(out.image, 30 * N + 30, 40).image;
  assert.strictEqual(at(holed, 30, 30), 0, "click should remove the hole");
  assert.strictEqual(at(holed, 30, 14), 255, "click must not touch the art");
  assert.strictEqual(at(restoreAt(holed, img, 30 * N + 30, 40), 30, 30), 255, "restore click should bring it back");
  const { image: done } = clean(holed, { scale: 2, matte: out.ref });
  for (let i = 0; i < done.data.length; i += 4) {
    if (done.data[i + 3] && done.data[i] > 200 && done.data[i + 2] > 200) assert.fail("cream left on the edge");
  }
  console.log("ok: background removal (outside + click on enclosed hole)");
}

// Colour select: two separate red squares on white. A click picks one; "similar" picks both; erase clears them.
{
  const N = 30, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N, red = (x > 2 && x < 9 || x > 20 && x < 27) && y > 5 && y < 15;
    img.data.set(red ? [200 + (i % 7), 10, 10, 255] : [255, 255, 255, 255], i * 4); // noisy red
  }
  const one = selectAt(img, 10 * N + 5, 30), count = (m) => m.reduce((a, b) => a + b, 0);
  assert.strictEqual(count(one), 6 * 9, "click selects one square");
  const both = selectSimilar(img, one, 30);
  assert.strictEqual(count(both), 2 * 6 * 9, "similar selects both squares");
  const { image } = eraseMask(img, both, 30);
  assert.strictEqual(image.data[(10 * N + 23) * 4 + 3], 0, "erase clears the second square");
  assert.strictEqual(image.data[(20 * N + 15) * 4 + 3], 255, "erase leaves the white alone");
  console.log("ok: colour select + select similar + erase");
}

// Gap review: a cream pocket ringed by navy is "likely" (pre-ticked); one ringed by yellow is art (kept).
{
  const N = 60, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N;
    const navyHole = x >= 10 && x < 20 && y >= 10 && y < 20, yellowHole = x >= 40 && x < 50 && y >= 10 && y < 20;
    const navyRing = x >= 6 && x < 24 && y >= 6 && y < 24, yellowRing = x >= 36 && x < 54 && y >= 6 && y < 24;
    img.data.set(navyHole || yellowHole ? [246, 243, 234, 255] : navyRing ? [20, 24, 80, 255] : yellowRing ? [255, 210, 31, 255] : [0, 0, 0, 0], i * 4);
  }
  // the yellow block gets a navy outline so navy is the cut-out's rim colour
  for (let i = 0; i < N * N; i++) { const x = i % N, y = (i - x) / N; if ((x === 35 || x === 54) && y >= 5 && y < 25 || (y === 5 || y === 24) && x >= 35 && x < 55) img.data.set([20, 24, 80, 255], i * 4); }
  const g = findGaps(img, [246, 243, 234], 40, 15);
  assert.strictEqual(g.regions.length, 2, "two pockets found");
  const at = (x, y) => g.regions[g.labels[y * N + x] - 1];
  assert(at(15, 15).likely, "navy-ringed pocket should be pre-ticked");
  assert(!at(45, 15).likely, "yellow-ringed patch is art, should start kept");
  console.log("ok: gap review (navy pocket ticked, yellow-rimmed patch kept)");
}

// Scraps: a white speck in the navy outline band is painted navy; a white sparkle in a small dark eye
// (enclosed by yellow) is art and stays.
{
  const W2 = 80, H2 = 40, img = { width: W2, height: H2, data: new Uint8ClampedArray(W2 * H2 * 4) };
  const navy = [20, 24, 80, 255], white = [250, 250, 248, 255];
  for (let i = 0; i < W2 * H2; i++) {
    const x = i % W2, y = (i - x) / W2;
    let c = [0, 0, 0, 0];
    if (x >= 5 && x < 35 && y >= 5 && y < 35) c = x >= 14 && x < 17 && y >= 14 && y < 17 ? white : navy;
    if (x >= 40 && x < 76 && y >= 5 && y < 35) {
      c = x === 40 || x === 75 || y === 5 || y === 34 ? navy : [255, 210, 31, 255];
      if (x >= 55 && x < 61 && y >= 15 && y < 21) c = x >= 57 && x < 59 && y >= 17 && y < 19 ? white : navy;
    }
    img.data.set(c, i * 4);
  }
  const out = fillScraps(img, [246, 246, 239], [20, 24, 80], 40, 100).image.data;
  assert(out[(15 * W2 + 15) * 4] < 60, "speck in the outline band is painted navy");
  assert(out[(17 * W2 + 57) * 4] > 200, "eye sparkle stays white");
  console.log("ok: scraps filled in the outline band, eye sparkle kept");
}

// Keep dark detail: art on black = a white ring round a flat black "shirt", plus a dim orange patch outside.
// Knock-out loses both; keep mode keeps the shirt (inside the outline) and the patch (still coloured),
// and still removes the plain black background.
{
  const N = 80, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N, r = Math.hypot(x - 40, y - 40);
    img.data.set(r >= 14 && r < 22 ? [250, 250, 250, 255] : x >= 4 && x < 10 && y >= 4 && y < 10 ? [30, 12, 0, 255] : [0, 0, 0, 255], i * 4);
  }
  const o = { scale: 1, hug: 6, smooth: 2, dot: 6 }, a = (out, x, y) => out.image.data[(y * N + x) * 4 + 3];
  const ko = darkArt(img, { ...o, method: "knockout" }), keep = darkArt(img, { ...o, method: "keep" });
  assert.strictEqual(a(ko, 40, 40), 0, "knock-out drops the flat black shirt");
  assert.strictEqual(a(keep, 40, 40), 255, "keep mode keeps the flat black shirt");
  assert.strictEqual(a(keep, 6, 6), 255, "keep mode keeps the dim orange");
  assert.strictEqual(a(keep, 70, 70), 0, "plain background still goes");
  console.log("ok: keep dark detail (black shirt + dim orange kept, background removed)");
}

// Thin lines: a 2 px hairline is flagged, a 12 px bar and a square's corners are not. Line dots differ from round.
{
  const { thinLines } = require("./edge-clean.js");
  const N = 120, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N;
    if ((y >= 10 && y < 12 && x >= 10 && x < 110) || (y >= 30 && y < 42 && x >= 10 && x < 110) || (x >= 40 && x < 80 && y >= 60 && y < 100)) img.data[i * 4 + 3] = 255;
  }
  const t = thinLines(img, 6);
  assert.strictEqual(t.length, 1, "only the hairline is flagged, got " + JSON.stringify(t));
  assert(t[0][1] <= 12 && t[0][3] >= 10, "box sits on the hairline");
  const ramp = { width: 64, height: 16, data: new Uint8ClampedArray(64 * 16 * 4) };
  for (let i = 0; i < 64 * 16; i++) { const v = (i % 64) * 2; ramp.data.set([v, v, v, 255], i * 4); }
  const a = darkArt(ramp, { scale: 1, dot: 6, angle: 22.5 }).image.data, b = darkArt(ramp, { scale: 1, dot: 6, angle: 22.5, shape: "line" }).image.data;
  assert(a.some((v, i) => v !== b[i]), "line screen differs from round dots");
  for (let i = 3; i < a.length; i += 4) assert(a[i] === 0 || a[i] === 255, "halftone alpha is solid or empty");
  console.log("ok: thin-line check (hairline flagged, bar and corners not), dot angle + line screen");
}

// Paint fixes: brushed "keep" brings back plain black, brushed "remove" takes out art, in every on-black type
// and at an upscale (the mask is scaled with the image).
{
  const N = 40, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) }, paint = { width: N, height: N, data: new Uint8Array(N * N) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N;
    img.data.set(x >= 20 && x < 36 && y >= 10 && y < 30 ? [240, 240, 240, 255] : [0, 0, 0, 255], i * 4);
    if (x >= 4 && x < 14 && y >= 15 && y < 25) paint.data[i] = 1; // keep a patch of plain black
    if (x >= 24 && x < 32 && y >= 16 && y < 24) paint.data[i] = 2; // punch a hole in the white square (bigger than a speck)
  }
  for (const method of ["knockout", "keep", "backing"]) for (const scale of [1, 2]) {
    const out = darkArt(img, { method, scale, dot: 6, hug: 3, margin: 0, smooth: 0, specks: 0, paint }).image, W = out.width;
    const a = (x, y) => out.data[((y * scale + scale / 2 | 0) * W + (x * scale + scale / 2 | 0)) * 4 + 3];
    assert.strictEqual(a(9, 20), 255, `${method} ${scale}x: painted black kept`);
    assert.strictEqual(a(28, 20), 0, `${method} ${scale}x: painted-away art removed`);
    assert.strictEqual(a(22, 12), 255, `${method} ${scale}x: unpainted art untouched`);
    assert.strictEqual(a(2, 37), 0, `${method} ${scale}x: unpainted black still removed`);
  }
  console.log("ok: paint fixes (keep + remove, all on-black types, 1x and 2x)");
}
