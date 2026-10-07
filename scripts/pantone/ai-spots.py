import re, sys, zlib, json
# Spot colour names referenced in .ai (PDF-compatible) files: scans raw bytes + every inflatable stream.
#   python3 scripts/pantone/ai-spots.py "<swatch book>.ai" [...] > spots.json
# pressed-swatches.txt next to this file is the de-duplicated union over the studio's swatch-book files.
pat = re.compile(rb"PANTONE[ #]+(?:[A-Za-z0-9.+\-]+[ #]+)*?(?:[0-9]{2,5}|[A-Za-z]+(?:[ #]+[A-Za-z0-9]+)?)[ #]+(?:C|U|CP|UP|XGC|TCX|TPX)\b")
out = {}
for path in sys.argv[1:]:
    data = open(path, "rb").read()
    chunks = [data]
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end < 0: continue
        try:
            chunks.append(zlib.decompressobj().decompress(data[start:end]))
        except Exception:
            pass
    names = set()
    for c in chunks:
        for m in pat.finditer(c):
            n = m.group(0).replace(b"#20", b" ").replace(b"#", b" ").decode("latin1")
            n = re.sub(r"\s+", " ", n).strip()
            names.add(n)
    out[path.rsplit("/", 1)[-1]] = sorted(names)
    print(path.rsplit("/", 1)[-1], len(names), file=sys.stderr)
json.dump(out, sys.stdout, indent=1)
