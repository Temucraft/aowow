#!/usr/bin/env python3
"""
Temucraft map POI icons: the pictures static/js/maps.js shows for townsfolk, vendors, travel and locations
(static/images/wow/maps/poi/<type>.png, 32x32).

Most come from the 3.3.5 client's own UI art (minimap tracking icons, gossip icons, PvP badges). Point the script at a
folder with the client's Interface files extracted (from locale-<xx>.MPQ and patch-<xx>*.MPQ); names are matched
without caring about case. The few types the client has no small icon for (barber, portals, meeting stones,
dungeons, raids, boats, zeppelins, routes) are drawn here as simple badges.

    python3 setup/tools/temucraft-poi-icons.py <extracted client folder> [static/images/wow/maps/poi]

Needs Pillow (pip install pillow), which reads BLP files.
"""

import os
import sys

from PIL import Image, ImageDraw

SIZE = 32

# type -> client file (inside Interface), and an optional crop box (x0, y0, x1, y1) in the source picture
FROM_CLIENT = {
    'ah':        ('Minimap/TRACKING/Auctioneer.blp', None),
    'bank':      ('Minimap/TRACKING/Banker.blp', None),
    'bm':        ('Minimap/TRACKING/BattleMaster.blp', None),
    'class':     ('Minimap/TRACKING/Class.blp', None),
    'fm':        ('Minimap/TRACKING/FlightMaster.blp', None),
    'inn':       ('Minimap/TRACKING/Innkeeper.blp', None),
    'mail':      ('Minimap/TRACKING/Mailbox.blp', None),
    'rep':       ('Minimap/TRACKING/Repair.blp', None),
    'stable':    ('Minimap/TRACKING/StableMaster.blp', None),
    'v-food':    ('Minimap/TRACKING/Food.blp', None),
    'v-ammo':    ('Minimap/TRACKING/Ammunition.blp', None),
    'v-poison':  ('Minimap/TRACKING/Poisons.blp', None),
    'v-reagent': ('Minimap/TRACKING/Reagents.blp', None),
    'wm':        ('GossipFrame/TrainerGossipIcon.blp', None),
    'sh':        ('GossipFrame/HealerGossipIcon.blp', None),
    'qh':        ('GossipFrame/AvailableQuestIcon.blp', None),
    'pvp':       ('WorldStateFrame/CombatSwords.blp', None),
    'ta':        ('WorldStateFrame/NeutralTower.blp', None),
    'fa':        ('TARGETINGFRAME/UI-PVP-Alliance.blp', (0, 0, 40, 40)),
    'fh':        ('TARGETINGFRAME/UI-PVP-Horde.blp', (0, 0, 40, 40)),
}

GOLD, DARK = (255, 209, 0, 255), (20, 20, 20, 235)
SIDES = {'a': (40, 110, 230, 255), 'h': (200, 40, 40, 255), 'n': (230, 180, 40, 255)}


def find(root, rel):
    """the file under root, any case"""
    here = root
    for part in rel.split('/'):
        if not os.path.isdir(here):
            return None
        names = {n.lower(): n for n in os.listdir(here)}
        if part.lower() not in names:
            return None
        here = os.path.join(here, names[part.lower()])
    return here if os.path.isfile(here) else None


def badge(ring):
    im = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((1, 1, SIZE - 2, SIZE - 2), fill=DARK, outline=ring, width=2)
    return im, d


def anchor(color):
    im, d = badge(color)
    d.ellipse((13, 5, 19, 11), outline=GOLD, width=2)
    d.line((16, 11, 16, 26), fill=GOLD, width=2)
    d.line((10, 14, 22, 14), fill=GOLD, width=2)
    d.arc((7, 13, 25, 27), 20, 160, fill=GOLD, width=2)
    return im


def zeppelin(color):
    im, d = badge(color)
    d.ellipse((5, 8, 25, 18), fill=GOLD)
    d.polygon([(23, 13), (28, 8), (28, 18)], fill=GOLD)
    d.rectangle((12, 20, 18, 24), fill=GOLD)
    d.line((14, 18, 14, 20), fill=GOLD)
    return im


def drawn():
    out = {}
    for side, color in SIDES.items():
        out['boat-' + side] = anchor(color)
        out['zep-' + side] = zeppelin(color)

    im, d = badge(GOLD)                                        # barber: scissors
    d.ellipse((7, 18, 13, 24), outline=GOLD, width=2)
    d.ellipse((19, 18, 25, 24), outline=GOLD, width=2)
    d.line((12, 18, 21, 7), fill=GOLD, width=2)
    d.line((20, 18, 11, 7), fill=GOLD, width=2)
    out['barber'] = im

    im, d = badge((170, 110, 255, 255))                        # portal: swirl
    d.ellipse((8, 6, 24, 26), outline=(190, 140, 255, 255), width=3)
    d.ellipse((12, 10, 20, 22), fill=(120, 60, 220, 255))
    out['portal'] = im

    im, d = badge(GOLD)                                        # meeting stone
    d.polygon([(10, 25), (12, 9), (16, 6), (20, 9), (22, 25)], fill=(150, 150, 160, 255), outline=GOLD)
    out['stone'] = im

    im, d = badge((80, 200, 80, 255))                          # dungeon: door
    d.rectangle((10, 10, 22, 25), fill=(80, 200, 80, 255))
    d.pieslice((10, 4, 22, 16), 180, 360, fill=(80, 200, 80, 255))
    d.rectangle((13, 13, 19, 25), fill=DARK)
    out['dg'] = im

    im, d = badge((255, 128, 0, 255))                          # raid: skull-like
    d.ellipse((9, 7, 23, 21), fill=(255, 128, 0, 255))
    d.rectangle((12, 19, 20, 25), fill=(255, 128, 0, 255))
    d.ellipse((11, 11, 15, 15), fill=DARK)
    d.ellipse((17, 11, 21, 15), fill=DARK)
    out['rd'] = im
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    inter = root                                                # the folder itself, or its Interface folder
    for n in os.listdir(root):
        if n.lower() == 'interface' and os.path.isdir(os.path.join(root, n)):
            inter = os.path.join(root, n)
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'static', 'images', 'wow', 'maps', 'poi')
    os.makedirs(out, exist_ok=True)

    missing = []
    for kind, (rel, box) in FROM_CLIENT.items():
        src = find(inter, rel)
        if not src:
            missing.append(rel)
            continue
        im = Image.open(src)
        im.load()
        im = im.convert('RGBA')
        if box:
            im = im.crop(box)
        bb = im.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
        if bb and (bb[2] - bb[0]) < im.width * 0.7 and (bb[3] - bb[1]) < im.height * 0.7:
            side = max(bb[2] - bb[0], bb[3] - bb[1]) + 2   # small art in a big picture: cut to it, kept square
            cx, cy = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
            im = im.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))
        im.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, kind + '.png'))

    for kind, im in drawn().items():
        im.save(os.path.join(out, kind + '.png'))

    print(len(FROM_CLIENT) - len(missing), 'from the client,', len(drawn()), 'drawn, in', out)
    if missing:
        print('not found (extract them from the client first):', ', '.join(missing))


if __name__ == '__main__':
    main()
