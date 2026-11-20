#!/usr/bin/env python3
"""
One-off: turn the model viewer's t/**/*.png textures into .webp (same settings as extract.py).
Each PNG is deleted only after its WebP is written and opens with the same size. Safe to rerun.

    python3 setup/tools/modelviewer/png2webp.py [--dir static/modelviewer/data/t] [--jobs 12] [--keep]
    --keep: write the WebPs but leave the PNGs (run again without it to delete them)
"""

import argparse, os, sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import webp_bytes
from PIL import Image

KEEP = False


def convert(png):
    webp = png[:-4] + '.webp'
    try:
        with Image.open(png) as im:
            im.load()
            size = im.size
            if not os.path.exists(webp):
                img = im if im.mode in ('RGBA', 'RGB') else im.convert('RGBA')
                tmp = '%s.%d.tmp' % (webp, os.getpid())
                with open(tmp, 'wb') as fh:
                    fh.write(webp_bytes(img))
                os.replace(tmp, webp)
        with Image.open(webp) as w:                     # must decode, at the same size
            w.load()
            if w.size != size:
                raise ValueError('size %s != %s' % (w.size, size))
        if not KEEP:
            os.remove(png)
        return 0, os.path.getsize(webp), None
    except Exception as e:
        return 1, 0, '%s: %s' % (png, e)


def init(keep):
    global KEEP
    KEEP = keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='static/modelviewer/data/t')
    ap.add_argument('--jobs', type=int, default=12)
    ap.add_argument('--keep', action='store_true')
    a = ap.parse_args()
    files = [os.path.join(d, f) for d, _, fs in os.walk(a.dir) for f in fs if f.endswith('.png')]
    print(len(files), 'png files', flush=True)
    done = failed = size = 0
    with Pool(a.jobs, init, (a.keep,)) as pool:
        for bad, n, err in pool.imap_unordered(convert, files, chunksize=16):
            done += 1
            failed += bad
            size += n
            if err:
                print('  failed', err, flush=True)
            if done % 2000 == 0:
                print('  %d / %d  webp %.0f MB' % (done, len(files), size / 1e6), flush=True)
    print('done: %d converted, %d failed, webp %.0f MB' % (done - failed, failed, size / 1e6))


if __name__ == '__main__':
    main()
