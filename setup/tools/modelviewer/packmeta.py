#!/usr/bin/env python3
"""
One-off: pack the model viewer's meta/<kind>/<id>.json files into meta/<kind>/<id >> 8>.json bundles
({"<id>": obj, ..}). A single file is deleted only after its bundle is written and reads back the same.

    python3 setup/tools/modelviewer/packmeta.py [--dir static/modelviewer/data/meta]
"""

import argparse, json, os


def load(p):
    with open(p, 'rb') as fh:
        return json.load(fh)


def is_bundle(obj):                                     # a bundle's keys are display ids, a display's are names
    return isinstance(obj, dict) and bool(obj) and all(k.isdigit() and isinstance(v, dict) for k, v in obj.items())


def pack(folder):
    ids = sorted(int(f[:-5]) for f in os.listdir(folder) if f.endswith('.json') and f[:-5].isdigit())
    if not ids:
        return 0, 0
    bundles = set(n for n in ids if is_bundle(load(os.path.join(folder, '%d.json' % n))))
    have = set(ids)
    files = bundles_written = 0
    # ascending: bundle b replaces the file b.json, a single file of a lower bucket that is packed (and deleted) by then
    for b in sorted(set(n >> 8 for n in have - bundles) | bundles):
        p = os.path.join(folder, '%d.json' % b)
        entries = dict(load(p)) if b in bundles else {}
        singles = {}
        for x in range(b << 8, (b + 1) << 8):
            if x in have and x not in bundles and (x != b or b not in bundles):
                singles[x] = load(os.path.join(folder, '%d.json' % x))
        if not singles:
            continue
        for x, obj in singles.items():
            entries.setdefault(str(x), obj)             # an entry already in a bundle is newer
        entries = dict(sorted(entries.items(), key=lambda e: int(e[0])))
        tmp = p + '.pack.tmp'
        with open(tmp, 'wb') as fh:
            fh.write(json.dumps(entries, separators=(',', ':')).encode())
        if load(tmp) != entries:
            raise SystemExit('verify failed: ' + tmp)
        os.replace(tmp, p)
        back = load(p)
        if back != entries:
            raise SystemExit('verify failed: ' + p)
        for x in singles:
            if x != b:
                os.remove(os.path.join(folder, '%d.json' % x))
        files += len(singles)
        bundles_written += 1
    return files, bundles_written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='static/modelviewer/data/meta')
    a = ap.parse_args()
    for kind in sorted(os.listdir(a.dir)):
        if os.path.isdir(os.path.join(a.dir, kind)):
            n, b = pack(os.path.join(a.dir, kind))
            print('%-7s %6d files -> %4d bundles' % (kind, n, b), flush=True)


if __name__ == '__main__':
    main()
