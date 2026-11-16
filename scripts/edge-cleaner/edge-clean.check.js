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

// White parts of a design on a white background. One black block holding five white patches:
// an empty one (a gap: ticked), one with an eye drawn inside (a face: kept), a shaded one (kept),
// a 12 px bandage (wide: never painted over) and a 2 px hairline (too thin to cut: painted black).
{
  const { removeRegions } = require("./edge-clean.js");
  const Wd = 140, Hd = 100, img = { width: Wd, height: Hd, data: new Uint8ClampedArray(Wd * Hd * 4) };
  const box = (x, y, x0, y0, w, h) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
  for (let i = 0; i < Wd * Hd; i++) {
    const x = i % Wd, y = (i - x) / Wd;
    let c = box(x, y, 10, 10, 120, 80) ? [0, 0, 0] : [255, 255, 255];
    if (box(x, y, 20, 20, 20, 20) || box(x, y, 50, 20, 30, 30) || box(x, y, 20, 60, 12, 12) || box(x, y, 60, 60, 2, 20)) c = [255, 255, 255];
    if (box(x, y, 62, 32, 6, 6)) c = [0, 0, 0]; // the eye
    if (box(x, y, 90, 20, 20, 20)) c = [245, 240, 232];
    img.data.set([...c, 255], i * 4);
  }
  const out = removeOutside(img, 40, true), g = findGaps(out.image, out.ref, 40, 15), reg = (x, y) => g.regions[g.labels[y * Wd + x] - 1];
  assert.strictEqual(g.regions.length, 4, "four areas for review (the hairline is too thin to list), got " + g.regions.length);
  assert(reg(30, 30).likely, "an empty white pocket in the outline is a gap");
  assert(!reg(55, 25).likely, "a white area with something drawn inside it is part of the design");
  assert(!reg(100, 30).likely, "a shaded area is not the background's flat colour");
  const fl = fillScraps(out.image, out.ref, g.outline, 40, 400, null).image, red = (x, y) => fl.data[(y * Wd + x) * 4];
  assert(red(26, 66) > 200, "a wide white patch must not be painted the outline colour");
  assert(red(60, 70) < 60 && red(61, 70) < 60, "a hairline in the outline is painted over");
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
  const g = findGaps(out.image, out.ref, 40, 15);
  assert.strictEqual(g.regions.length, 2, "both held areas are listed for review, got " + g.regions.length);
  const first = g.regions[g.labels[40 * Wd + 52] - 1], cut = removeRegions(out.image, g.labels, g.regions.map((r) => r === first), 40, out.ref);
  assert.strictEqual(al(cut, 52, 40), 0, "ticked area removed");
  assert.strictEqual(al(cut, 117, 40), 255, "the other area must stay (a flood from a seed would cross the background into it)");
  console.log("ok: breaks in an outline (areas held for review, hairline channel removed, one removal leaves the rest)");
}
