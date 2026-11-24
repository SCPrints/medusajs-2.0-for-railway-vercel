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

// Scraps: a white hairline (2 px wide) in the navy outline band is painted navy; a white sparkle in a
// small dark eye (enclosed by yellow) is art and stays.
{
  const W2 = 80, H2 = 40, img = { width: W2, height: H2, data: new Uint8ClampedArray(W2 * H2 * 4) };
  const navy = [20, 24, 80, 255], white = [250, 250, 248, 255];
  for (let i = 0; i < W2 * H2; i++) {
    const x = i % W2, y = (i - x) / W2;
    let c = [0, 0, 0, 0];
    if (x >= 5 && x < 35 && y >= 5 && y < 35) c = x >= 14 && x < 16 && y >= 14 && y < 20 ? white : navy;
    if (x >= 40 && x < 76 && y >= 5 && y < 35) {
      c = x === 40 || x === 75 || y === 5 || y === 34 ? navy : [255, 210, 31, 255];
      if (x >= 55 && x < 61 && y >= 15 && y < 21) c = x >= 57 && x < 59 && y >= 17 && y < 19 ? white : navy;
    }
    img.data.set(c, i * 4);
  }
  const out = fillScraps(img, [246, 246, 239], [20, 24, 80], 40, 100).image.data;
  assert(out[(15 * W2 + 15) * 4] < 60, "hairline in the outline band is painted navy");
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

// Sliders that fought each other (2026-11-17):
// 1. Knock-out with Black raised: dark grey must fade out, not turn into white specks.
{
  const n = 30 * 30, g = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { g[i * 4] = g[i * 4 + 1] = g[i * 4 + 2] = 50; g[i * 4 + 3] = 255; }
  const out = darkArt({ width: 30, height: 30, data: g }, { method: "knockout", scale: 1, black: 40, fade: 52, dot: 6 }).image.data;
  for (let i = 0; i < out.length; i += 4) if (out[i + 3]) assert(out[i] <= 92, "dark grey became a bright dot: " + out[i]);
}
// 2. Edge colour fix leaves solid art alone: a dark solid outline round a white fill, next to a cut, stays dark.
{
  const w = 30, img = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = Math.max(Math.abs(x - 15), Math.abs(y - 15));
    if (r > 10) continue; // empty round the square
    const v = r > 7 ? 20 : 255; img[i] = img[i + 1] = img[i + 2] = v; img[i + 3] = 255; // 3 px dark outline, white inside
  }
  for (const matte of ["none", [255, 255, 255]]) { // with no background known, and cut from white
    const o = clean({ width: w, height: w, data: img }, { scale: 2, matte, choke: 0, defringe: 8 }).image;
    const at = (x, y) => o.data[(y * o.width + x) * 4];
    assert(at(30, 11) < 60, "dark outline turned light: " + at(30, 11));
  }
}
// ...but a solid pixel that is the art mixed with the old background (a soft edge cut from white) is fixed.
{
  const w = 30, img = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = Math.max(Math.abs(x - 15), Math.abs(y - 15));
    if (r > 10) continue;
    const mix = r === 10 ? 0.5 : 0; // outermost ring: red half mixed with white, but fully solid
    img[i] = 200 + 55 * mix; img[i + 1] = img[i + 2] = 30 + 225 * mix; img[i + 3] = 255;
  }
  const o = clean({ width: w, height: w, data: img }, { scale: 2, matte: [255, 255, 255], choke: 0 }).image, p = (30 * o.width + 10) * 4;
  assert(o.data[p + 3] === 255 && o.data[p + 1] < 70, "pale edge ring left on a red square: green = " + o.data[p + 1]);
}
console.log("ok: knock-out keeps dark grey dark, edge colour fix keeps solid outlines and fixes pale edges");
// 3. A nearly see-through pixel that Smooth fills in takes the colour of the art round it, not its own
//    blown-up colour: a faint 3 px hole in a red square on a white background must come out red.
{
  const w = 30, img = new Uint8ClampedArray(w * w * 4);
  for (let y = 4; y < 26; y++) for (let x = 4; x < 26; x++) { const i = (y * w + x) * 4; img[i] = 200; img[i + 1] = 30; img[i + 2] = 30; img[i + 3] = 255; }
  for (let y = 14; y <= 16; y++) for (let x = 14; x <= 16; x++) { const i = (y * w + x) * 4; img[i] = 235; img[i + 1] = 240; img[i + 2] = 250; img[i + 3] = 20; } // faint, mostly white: un-mixes to blue
  const o = clean({ width: w, height: w, data: img }, { scale: 2, matte: [255, 255, 255] }).image, p = (31 * o.width + 31) * 4;
  assert(o.data[p + 3] === 255, "pinhole should be filled in");
  assert(o.data[p] > 170 && o.data[p + 1] < 70 && o.data[p + 2] < 70, "filled pinhole has the wrong colour: " + [o.data[p], o.data[p + 1], o.data[p + 2]]);
}
console.log("ok: faint pixels take the colour of the art round them");

// White parts of a design on a white background. One black block holding white patches:
// an empty one (a gap: ticked), one with an eye drawn inside (a face: kept), a faintly shaded one (kept),
// a 12 px bandage (wide: never painted over), a 2 px hairline (too thin to cut: painted black), a small
// soft-edged area (kept: ribs and bandage cells look like this), and two squares that touch at a corner.
{
  const { removeRegions } = require("./edge-clean.js");
  const Wd = 140, Hd = 100, img = { width: Wd, height: Hd, data: new Uint8ClampedArray(Wd * Hd * 4) };
  const box = (x, y, x0, y0, w, h) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
  for (let i = 0; i < Wd * Hd; i++) {
    const x = i % Wd, y = (i - x) / Wd;
    let c = box(x, y, 10, 10, 120, 80) ? [0, 0, 0] : [255, 255, 255];
    if (box(x, y, 20, 20, 20, 20) || box(x, y, 50, 20, 30, 30) || box(x, y, 20, 60, 12, 12) || box(x, y, 60, 60, 2, 20)) c = [255, 255, 255];
    if (box(x, y, 100, 60, 8, 8) || box(x, y, 108, 68, 8, 8)) c = [255, 255, 255];
    if (box(x, y, 116, 45, 9, 9)) c = box(x, y, 117, 46, 7, 7) ? [255, 255, 255] : [236, 236, 236]; // soft edge: its average is off-white
    if (box(x, y, 62, 32, 6, 6)) c = [0, 0, 0]; // the eye
    if (box(x, y, 90, 20, 20, 20)) c = [248, 247, 246]; // 14 off white: faint, but not the paper's own colour
    img.data.set([...c, 255], i * 4);
  }
  const out = removeOutside(img, 40, true), g = findGaps(out.image, out.ref, 40, 15), reg = (x, y) => g.regions[g.labels[y * Wd + x] - 1];
  assert.strictEqual(g.regions.length, 7, "seven areas for review (the hairline is too thin to list), got " + g.regions.length);
  assert(!reg(120, 49).likely, "a small soft-edged area averages off-white: kept (it may be a rib or a bandage)");
  assert(reg(30, 30).likely, "an empty white pocket in the outline is a gap");
  assert(!reg(55, 25).likely, "a white area with something drawn inside it is part of the design");
  assert(!reg(100, 30).likely, "a shaded area is not the background's flat colour");
  const fl = fillScraps(out.image, out.ref, g.outline, 40, 400, null).image, red = (x, y) => fl.data[(y * Wd + x) * 4];
  assert(red(26, 66) > 200, "a wide white patch must not be painted the outline colour");
  assert(red(60, 70) < 60 && red(61, 70) < 60, "a hairline in the outline is painted over");
  const hold = new Uint8Array(Wd * Hd);
  for (let y = 60; y < 80; y++) hold[y * Wd + 60] = hold[y * Wd + 61] = 1;
  assert(fillScraps(out.image, out.ref, g.outline, 40, 400, hold).image.data[(70 * Wd + 60) * 4] > 200, "pixels in the keep mask are never painted");
  // two areas that touch only at a corner: removing one must not fade the other's corner pixel
  const corner = removeRegions(out.image, g.labels, g.regions.map((r) => r === reg(103, 63)), 40, out.ref);
  assert.strictEqual(corner.data[(63 * Wd + 103) * 4 + 3], 0, "ticked square removed");
  assert.strictEqual(corner.data[(68 * Wd + 108) * 4 + 3], 255, "kept square stays whole where it touches the removed one");
  // removing one area must leave the others alone
  const cut = removeRegions(out.image, g.labels, g.regions.map((r) => r === reg(30, 30)), 40, out.ref);
  assert.strictEqual(cut.data[(30 * Wd + 30) * 4 + 3], 0, "ticked area removed");
  assert.strictEqual(cut.data[(66 * Wd + 26) * 4 + 3], 255, "unticked area kept");
  console.log("ok: white parts of the design (face and shaded area kept, wide patch not painted, hairline filled)");
}

// A break in an outline. Two white boxes drawn with a 2 px black line, each with a 3 px break at the top,
// plus two bars 3 px apart. The plain flood runs in through the breaks and deletes both boxes. With the
// necks sealed they are held for review, the hairline channel between the bars is still removed, and
// removing one box leaves the other.
{
  const { removeRegions } = require("./edge-clean.js");
  const Wd = 150, Hd = 80, img = { width: Wd, height: Hd, data: new Uint8ClampedArray(Wd * Hd * 4) };
  const ring = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !(x >= x0 + 2 && x <= x1 - 2 && y >= y0 + 2 && y <= y1 - 2);
  for (let i = 0; i < Wd * Hd; i++) {
    const x = i % Wd, y = (i - x) / Wd;
    let black = ring(x, y, 30, 10, 75, 70) || ring(x, y, 95, 10, 140, 70) || (y >= 10 && y <= 70 && (x >= 6 && x <= 9 || x >= 13 && x <= 16));
    if (y <= 11 && (x >= 51 && x <= 53 || x >= 116 && x <= 118)) black = false; // the breaks
    img.data.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4);
  }
  const al = (im, x, y) => im.data[(y * Wd + x) * 4 + 3];
  assert.strictEqual(al(removeOutside(img, 40).image, 52, 40), 0, "plain flood gets in through the break");
  const out = removeOutside(img, 40, true);
  assert.strictEqual(al(out.image, 52, 40), 255, "area behind a narrow opening is held for review");
  assert.strictEqual(al(out.image, 117, 40), 255, "second area held too");
  assert.strictEqual(al(out.image, 11, 40), 0, "a hairline channel is still removed");
  assert.strictEqual(al(out.image, 85, 40), 0, "open background is still removed");
  assert.strictEqual(al(out.image, 29, 40), 0, "background right beside the art is removed too, not held with the box");
  const g = findGaps(out.image, out.ref, 40, 15);
  assert.strictEqual(g.regions.length, 2, "both held areas are listed for review, got " + g.regions.length);
  const first = g.regions[g.labels[40 * Wd + 52] - 1], cut = removeRegions(out.image, g.labels, g.regions.map((r) => r === first), 40, out.ref);
  assert.strictEqual(al(cut, 52, 40), 0, "ticked area removed");
  assert.strictEqual(al(cut, 117, 40), 255, "the other area must stay (a flood from a seed would cross the background into it)");
  console.log("ok: breaks in an outline (areas held for review, hairline channel removed, one removal leaves the rest)");
}

// Narrow is not the same as enclosed. White channels that are narrow all the way along are background
// and must go even with the necks sealed: the gaps of a grid of squares, a channel with a bend, a slanted
// channel. (Holding those back put white lines through art.) A 6 px break on a 2400 px file is narrow
// for that size, so the box behind it is held. And an area whose surroundings are cut in two by the
// image edge has nothing "drawn inside it": an empty one is still a gap.
{
  const mk = (w, h, f) => { const im = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; for (let i = 0; i < w * h; i++) im.data.set(f(i % w, (i / w) | 0), i * 4); return im; };
  const K = [0, 0, 0, 255], Wt = [255, 255, 255, 255], al = (im, x, y) => im.data[(y * im.width + x) * 4 + 3], seal = (im) => removeOutside(im, 40, true).image;
  const grid = seal(mk(400, 400, (x, y) => (x < 100 || x >= 288 || y < 100 || y >= 288 || (x - 100) % 64 >= 60 || (y - 100) % 64 >= 60 ? Wt : K)));
  assert(al(grid, 162, 162) === 0 && al(grid, 162, 130) === 0, "4 px gaps between a grid of squares are removed");
  const bend = seal(mk(300, 300, (x, y) => (x >= 50 && x < 250 && y >= 50 && y < 250 && !((y >= 148 && y < 152 && x < 152) || (x >= 148 && x < 152 && y >= 148)) ? K : Wt)));
  assert(al(bend, 100, 150) === 0 && al(bend, 150, 150) === 0, "a 4 px channel with a bend is removed");
  for (const hw of [5, 7, 9, 11]) assert.strictEqual(al(seal(mk(400, 400, (x, y) => (x >= 100 && x < 300 && y >= 100 && y < 300 && Math.abs(x - y) > (hw - 1) / 2 ? K : Wt))), 200, 200), 0, "a slanted channel " + hw + " px across is removed");
  const ringAt = (x, y) => x >= 100 && x <= 160 && y >= 10 && y <= 50 && !(x >= 102 && x <= 158 && y >= 12 && y <= 48) && !(y <= 11 && x >= 128 && x <= 133);
  assert.strictEqual(al(seal(mk(2400, 60, (x, y) => (ringAt(x, y) ? K : Wt))), 130, 30), 255, "a 6 px break is a narrow opening on a 2400 px file");
  // an empty box against the left edge of the image, joined to the background by two 3 px gaps at that edge
  const edgeBox = mk(300, 200, (x, y) => (x < 2 && (y >= 79 && y <= 81 || y >= 119 && y <= 121) ? Wt : x <= 120 && y >= 50 && y <= 150 && !(x >= 2 && x <= 118 && y >= 52 && y <= 148) ? K : Wt));
  const eo = removeOutside(edgeBox, 40, true), eg = findGaps(eo.image, eo.ref, 40, 15);
  assert(eg.regions.length === 1 && eg.regions[0].likely, "an empty area cut by the image edge is still a gap");
  console.log("ok: narrow channels removed, break size follows the file, image edge is not 'something inside'");
}

// The edge of art cut off a flat background (clean's cutFrom). The cut is a yes/no mask, so on its own
// it gives stair-stepped curves and leaves background colour in the edge pixels. With cutFrom the
// clean-up reads how much of each edge pixel is art, which must give: no pale ring, a truer and smoother
// edge, thin lines kept whole at their real weight, and nothing changed that is not a mix of art and
// background (pale art beside dark art, the far side of a thin line, flat grey art).
{
  const WHITE = [255, 255, 255], K = [0, 0, 0], Y = [255, 235, 60];
  const draw = (w, h, at) => { // 4x4 supersampled on white, like real anti-aliased art
    const im = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) { const c = at(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4) || WHITE; r += c[0]; g += c[1]; b += c[2]; }
      im.data.set([r / 16, g / 16, b / 16, 255], (y * w + x) * 4);
    }
    return im;
  };
  const run = (img, o) => clean(removeOutside(img, 40).image, { cutFrom: WHITE, ...o });
  const at = (im, sx, sy, S = 4) => Array.from(im.data.subarray((Math.round(sy * S) * im.width + Math.round(sx * S)) * 4, (Math.round(sy * S) * im.width + Math.round(sx * S)) * 4 + 4));
  const onEdge = (d, w, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !d[((y + dy) * w + x + dx) * 4 + 3]);

  // a black disc, off the pixel grid
  const R = 30.4, cx = 50.3, cy = 49.6, disc = draw(100, 100, (x, y) => (Math.hypot(x - cx, y - cy) <= R ? K : null));
  for (const S of [2, 4]) {
    const f = S / 4, fit = (v) => Math.max(0, Math.ceil(v * f - 0.5));
    const o = run(disc, { scale: S, smooth: fit(5), choke: fit(1), defringe: Math.round(6 * f), specks: Math.round(20 * f * f) }), d = o.image.data, w = o.image.width;
    assert(o.matte.every((v) => v === 255), "the old background is the colour that was cut, got " + o.matte);
    let bright = 0, sum = 0, sq = 0, n = 0, area = 0;
    for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      area++; bright = Math.max(bright, d[i], d[i + 1], d[i + 2]);
      if (onEdge(d, w, x, y)) { const e = (Math.hypot((x + 0.5) / S - cx, (y + 0.5) / S - cy) - R) * S; sum += e; sq += e * e; n++; }
    }
    const mean = sum / n, wobble = Math.sqrt(sq / n - mean * mean);
    assert(bright <= 10, S + "x: pale pixels left on a black disc, brightest " + bright);
    assert(Math.abs(mean) < 1.2, S + "x: edge sits " + mean.toFixed(2) + " px off the true circle");
    assert(wobble < (S === 4 ? 0.47 : 0.32), S + "x: edge is stair-stepped, wobble " + wobble.toFixed(3) + " px");
    assert(Math.abs(area / (Math.PI * R * R * S * S) - 1) < 0.03, S + "x: disc grew or shrank");
  }

  // the rebuilt edge does not depend on the Old background colour setting: clicking a grey shadow away
  // changes that setting to grey, and "None" turns it off, and neither may bring the pale ring back
  for (const matte of ["none", [150, 150, 150]]) {
    const im = run(disc, { scale: 4, matte }).image;
    let worst = 0;
    for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) worst = Math.max(worst, im.data[i], im.data[i + 1], im.data[i + 2]);
    assert(worst <= 10, "pale ring with Old background colour = " + matte + ", brightest " + worst);
  }

  // a thin slanted line, 1.3 px wide: stays in one piece at about its real width
  const cos = Math.cos(Math.atan(0.3)), line = run(draw(120, 60, (x, y) => (x > 10 && x < 110 && Math.abs(y - (12 + 0.3 * x)) * cos <= 0.65 ? K : null)), { scale: 4 }).image;
  let ink = 0, cols = 0;
  for (let x = 60; x < 420; x++) { let has = false; for (let y = 0; y < line.height; y++) if (line.data[(y * line.width + x) * 4 + 3]) { ink++; has = true; } if (has) cols++; }
  const width = ink / 360 / 4 * cos;
  assert.strictEqual(cols, 360, "a thin line must not break up");
  assert(width > 1.0 && width < 1.6, "a 1.3 px line came out " + width.toFixed(2) + " px wide");

  // dust is not brought back by the thin-line guard
  const dust = run(draw(60, 40, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30) || (x >= 44 && x < 46 && y >= 20 && y < 22) ? K : null), { scale: 4 }).image;
  assert.strictEqual(at(dust, 45, 21)[3], 0, "a 2 px dot is still smoothed away");
  assert.strictEqual(at(dust, 20, 20)[3], 255);

  // not a mix of art and background: left as drawn
  const isY = (p) => p[3] === 255 && p[0] > 235 && p[1] > 215 && p[1] < 250 && p[2] < 90;
  const inside = run(draw(80, 40, (x) => (x >= 20 && x < 22 ? K : x >= 22 && x < 60 ? Y : null)), { scale: 4 }).image;
  assert(isY(at(inside, 23.5, 20)) && isY(at(inside, 40, 20)), "yellow fill just inside a black outline stays yellow: " + at(inside, 23.5, 20));
  const outside = run(draw(80, 40, (x) => (x >= 20 && x < 22 ? Y : x >= 22 && x < 60 ? K : null)), { scale: 4 }).image;
  assert(isY(at(outside, 21, 20)), "a 2 px pale band on the outside of dark art is art, not a soft edge: " + at(outside, 21, 20));
  // a 1 px outline that falls across two pixels (so both are half art), with white inside it
  const box = run(draw(60, 60, (x, y) => (x >= 10.5 && x < 49.5 && y >= 10.5 && y < 49.5 && !(x >= 11.5 && x < 48.5 && y >= 11.5 && y < 48.5) ? K : null)), { scale: 4 }).image;
  for (const sx of [12.6, 13.5, 30]) assert.deepStrictEqual(at(box, sx, 30), [255, 255, 255, 255], "white on the far side of a thin line stays white and solid, at x = " + sx);
  assert(at(box, 11, 30)[3] === 255 && at(box, 11, 30)[0] < 140, "the line itself is kept (mid grey, as it is in the file): " + at(box, 11, 30));
  // a faint hairline on the edge, then a 1 px white slot, then black: the hairline is its own grey line,
  // not the soft edge of the black across the slot, so it stays grey and the slot stays light
  const slot = run(draw(60, 60, (x, y) => (y < 10 || y >= 50 || x < 10 || x >= 40 ? null : x < 11 && y >= 12 && y < 48 ? [128, 128, 128] : x < 12 && y >= 12 && y < 48 ? null : K)), { scale: 4 }).image;
  assert(at(slot, 10.5, 30)[3] === 255 && Math.abs(at(slot, 10.5, 30)[0] - 128) < 30, "a faint hairline keeps its own colour: " + at(slot, 10.5, 30));
  assert.strictEqual(at(slot, 11.5, 30)[3], 255, "the slot behind it stays solid");
  // a thin slanted outline (its pixels vary from faint to full) with white inside: the white is on the far
  // side of the line and must not be eaten into
  const dia = run(draw(60, 60, (x, y) => { const l = Math.abs(x - 30) + Math.abs(y - 30); return l >= 18 && l < 19.7 ? K : null; }), { scale: 4 }).image;
  let holes = 0;
  for (let y = 0; y < dia.height; y++) for (let x = 0; x < dia.width; x++) if (Math.abs((x + 0.5) / 4 - 30) + Math.abs((y + 0.5) / 4 - 30) < 17 && dia.data[(y * dia.width + x) * 4 + 3] !== 255) holes++;
  assert.strictEqual(holes, 0, "white inside a thin outline was eaten into: " + holes + " px");
  // a blurry edge, three pixels from background to full art: no pale ring left two and three pixels in
  const blurry = run(draw(100, 100, (x, y) => { const c = Math.max(0, Math.min(1, (R - Math.hypot(x - cx, y - cy)) / 3 + 0.5)) * 255; return [255 - c, 255 - c, 255 - c]; }), { scale: 4 }).image;
  let pale = 0;
  for (let i = 0; i < blurry.data.length; i += 4) if (blurry.data[i + 3]) pale = Math.max(pale, blurry.data[i]);
  assert(pale <= 12, "pale pixels left in a blurry edge, brightest " + pale);
  const grey = run(draw(80, 40, (x) => (x >= 20 && x < 60 ? [150, 150, 150] : null)), { scale: 4 }).image;
  for (const sx of [20.6, 21.5, 40]) { const p = at(grey, sx, 20); assert(p[3] === 255 && Math.abs(p[0] - 150) <= 12, "flat grey art keeps its colour to the edge, got " + p + " at x = " + sx); }

  // a file that arrived already cut out, with white still mixed into its soft edges: the old background is
  // read off as white itself, not the light grey that the average of the faint pixels gives
  const pre = { width: 80, height: 80, data: new Uint8ClampedArray(80 * 80 * 4) };
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) { const a = Math.max(0, Math.min(1, (30 - Math.hypot(x - 40, y - 40)) / 4)); pre.data.set([255 - 225 * a, 255 - 195 * a, 255 - 95 * a, 255 * a], (y * 80 + x) * 4); }
  const pm = clean(pre, { scale: 2 }).matte;
  assert(pm.every((v) => v > 245), "old background of a pre-cut file should read as white, got " + pm.map(Math.round));
  console.log("ok: cut edge rebuilt (no pale ring, smooth, thin line whole, dust still gone, real art untouched), old background read exactly");
}

// Flat background with halftone fades: a black ring with white inside, and a red brush-like fade outside
// it that thins out into the white background. The fade turns into red dots that get sparser outwards,
// the ring stays a smooth solid shape, and the white inside the ring stays solid.
{
  const { flatHalftone, DEFAULTS } = require("./edge-clean.js");
  const N = 100, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N, r = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
    const t = r >= 24 && r < 44 ? 0.8 * (1 - (r - 24) / 20) : 0; // share of red mixed into white
    img.data.set(r >= 20 && r < 24 ? [0, 0, 0, 255] : [255, 255 * (1 - t), 255 * (1 - t), 255], i * 4);
  }
  const cut = removeOutside(img, 40), S = 2;
  const out = flatHalftone(cut.image, { ...DEFAULTS, cutFrom: cut.ref, scale: S, halftone: { dot: 6, angle: 45, shape: "round" } }).image;
  const band = (r0, r1) => { let on = 0, all = 0, pale = 0;
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const r = Math.hypot((x + 0.5) / S - 50, (y + 0.5) / S - 50); if (r < r0 || r >= r1) continue;
      const p = (y * out.width + x) * 4; all++;
      assert(out.data[p + 3] === 0 || out.data[p + 3] === 255, "halftone alpha is solid or empty");
      if (out.data[p + 3]) { on++; if (out.data[p + 1] > 80) pale++; }
    } return { cover: on / all, pale }; };
  const inner = band(27, 31), outer = band(36, 40), ring = band(21, 23), inside = band(0, 18);
  assert(inner.cover > 0.35 && inner.cover < 0.85, "inner fade should be part dots, got " + inner.cover.toFixed(2));
  assert(outer.cover > 0.02 && outer.cover < inner.cover * 0.7, "dots should thin out outwards: " + inner.cover.toFixed(2) + " -> " + outer.cover.toFixed(2));
  assert.strictEqual(inner.pale + outer.pale, 0, "fade dots should be full-strength red, not pale pink");
  assert.strictEqual(ring.cover, 1, "the solid ring must stay solid");
  assert.strictEqual(inside.cover, 1, "white enclosed by the ring must stay solid");
  console.log(`ok: flat halftone (fade ${inner.cover.toFixed(2)} -> ${outer.cover.toFixed(2)} coverage, ring and enclosed white solid)`);
}

// All soft colours: a pale pink patch inside the white of the ring becomes red dots on solid white (no holes
// through to the shirt); with "edges only" it stays a solid pale patch.
{
  const { flatHalftone, DEFAULTS } = require("./edge-clean.js");
  const N = 100, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N, r = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
    img.data.set(r >= 20 && r < 24 ? [0, 0, 0, 255] : r < 10 ? [255, 150, 150, 255] : [255, 255, 255, 255], i * 4);
  }
  const cut = removeOutside(img, 40), S = 2, ht = { dot: 6, angle: 45, shape: "round" };
  const spot = (o) => { let red = 0, white = 0, pale = 0, holes = 0;
    for (let y = 0; y < N * S; y++) for (let x = 0; x < N * S; x++) {
      const r = Math.hypot((x + 0.5) / S - 50, (y + 0.5) / S - 50); if (r >= 7) continue;
      const p = (y * N * S + x) * 4, d = o.data;
      if (d[p + 3] !== 255) holes++; else if (d[p + 1] > 230) white++; else if (d[p + 1] < 60) red++; else pale++;
    } return { red, white, pale, holes }; };
  const edges = spot(flatHalftone(cut.image, { ...DEFAULTS, cutFrom: cut.ref, scale: S, halftone: ht }).image);
  const whole = spot(flatHalftone(cut.image, { ...DEFAULTS, cutFrom: cut.ref, scale: S, halftone: { ...ht, scope: "soft" } }).image);
  assert(edges.pale > 0 && edges.red === 0 && edges.holes === 0, "edges only: the patch inside the ring stays solid pale pink " + JSON.stringify(edges));
  assert(whole.red > 0 && whole.white > 0 && whole.holes === 0, "all soft colours: red dots on solid white, no holes " + JSON.stringify(whole));
  console.log("ok: soft-colours halftone (dots on solid white inside the ring, no holes)", JSON.stringify(whole));
}

// The whole picture: every part is screened at one dot strength. The white inside the ring is white dots,
// the black ring is black dots, the pink patch is red dots ringed by white; the shirt shows between them
// everywhere, and nothing appears outside the art. 100% prints it all solid; 0% prints nothing.
{
  const { flatHalftone, DEFAULTS } = require("./edge-clean.js");
  const N = 100, img = { width: N, height: N, data: new Uint8ClampedArray(N * N * 4) };
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N, r = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
    img.data.set(r >= 20 && r < 26 ? [0, 0, 0, 255] : r < 10 ? [255, 150, 150, 255] : [255, 255, 255, 255], i * 4);
  }
  const cut = removeOutside(img, 40), S = 2;
  const run = (strength) => flatHalftone(cut.image, { ...DEFAULTS, cutFrom: cut.ref, scale: S, halftone: { dot: 6, angle: 45, shape: "round", scope: "whole", strength } }).image;
  const band = (o, r0, r1) => { const k = { white: 0, red: 0, black: 0, empty: 0, all: 0 };
    for (let y = 0; y < N * S; y++) for (let x = 0; x < N * S; x++) {
      const r = Math.hypot((x + 0.5) / S - 50, (y + 0.5) / S - 50); if (r < r0 || r >= r1) continue;
      const p = (y * N * S + x) * 4, d = o.data; k.all++;
      assert(d[p + 3] === 0 || d[p + 3] === 255, "whole picture: alpha is solid or empty");
      if (!d[p + 3]) k.empty++; else if (d[p] > 230 && d[p + 1] > 230) k.white++; else if (d[p] < 40) k.black++; else if (d[p + 1] < 60) k.red++;
    } return k; };
  const mid = run(0.6), plain = band(mid, 12, 18), pink = band(mid, 0, 7), ring = band(mid, 21, 25), out = band(mid, 29, 50);
  assert(Math.abs(plain.white / plain.all - 0.6) < 0.1 && plain.empty > 0, "white prints as dots at about 60%: " + JSON.stringify(plain));
  assert(Math.abs(ring.black / ring.all - 0.6) < 0.1 && ring.empty > 0, "black prints as dots at about 60% too: " + JSON.stringify(ring));
  assert(pink.red > 0 && pink.white > 0 && pink.empty > 0, "pink becomes red dots with white round them: " + JSON.stringify(pink));
  assert.strictEqual(out.all, out.empty, "nothing outside the art");
  const full = run(1), none = run(0);
  assert(band(full, 12, 18).white === band(full, 12, 18).all && band(full, 21, 25).black === band(full, 21, 25).all, "Dot strength 100% prints it all solid");
  assert.strictEqual(band(none, 0, 50).empty, band(none, 0, 50).all, "Dot strength 0% prints nothing");
  console.log("ok: whole-picture halftone (white, black and pink all dots at one strength)", (plain.white / plain.all).toFixed(2), (ring.black / ring.all).toFixed(2));
}
