#!/usr/bin/env python3
"""Linux keeps 'Interface/Icons' and 'interface/icons' apart, the game client does not: of each set of
files that differ only in case, keep the newest (extracted from the later patch) and drop the others."""
import os, sys, collections
for root in sys.argv[1:]:
    g = collections.defaultdict(list)
    for dp, dn, fn in os.walk(root):
        for f in fn:
            p = os.path.join(dp, f); g[p.lower()].append(p)
    moved = 0
    for k, ps in g.items():
        if len(ps) < 2: continue
        ps.sort(key=lambda p: os.path.getmtime(p))
        newest, keep = ps[-1], ps[0]          # newest content, oldest (stock) spelling
        if newest != keep: os.replace(newest, keep)
        for p in ps[1:-1]: os.remove(p)
        moved += 1
    for dp, dn, fn in os.walk(root, topdown=False):   # drop folders left empty
        if not os.listdir(dp): os.rmdir(dp)
    print(root, moved, 'merged')
