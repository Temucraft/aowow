#!/usr/bin/env python3
"""
Temucraft changes: what is different from stock 3.3.5, per class, for the AoWoW "Changes" page (?changes).

It compares the stock DBCs with ours (the patch-5 DBCs and every module's client patch, in load order: later patch
letters win) and writes one JSON file:

  {"generated": "...", "classes": {"1": {"name": "Warrior",
      "spells":  {"new": [Group], "updated": [Group], "removed": [Group]},
      "talents": {"new": [Talent], "updated": [Talent], "removed": [Talent]}}, ...},
   "skills": [{"id", "name", "kind", "old", "new"}]}

  Group  = {"name", "icon", "ranks": [{"id", "rank", "old": Side or null, "new": Side or null, "changed": [field]}]}
  Side   = {"id", "name", "rank", "desc", "tip", "cost", "cast", "cd", "range", "dur", "level", "fx": [str]}
  Talent = {"id", "name", "icon", "tree", "old": TPos or null, "new": TPos or null, "changed": [field]}
  TPos   = {"tree", "row", "col", "ranks": [spell ids], "desc", "req"}

Usage (from the AoWoW folder; the page reads setup/temucraft/changes.json):
  python3 setup/tools/temucraft-changes.py --stock <stock DBFilesClient> --layer <patch-5 DBFilesClient> \
      --modules <folder with the module repos> --db <world database> --notes setup/temucraft/changes-notes.json \
      -o setup/temucraft/changes.json

  --layer     a folder of our DBCs, in load order (repeat it; later folders win)
  --modules   adds every <module>/{client,data}/patch-?.MPQ/DBFilesClient, sorted by patch letter, after --layer
  --db        class trainer spells count as class spells (rows with VerifiedBuild -1811 are ours), and spells with a
              Temucraft spell script are listed as changed on the server
  --notes     hand-written changes the files can't show (server rules); see setup/temucraft/changes-notes.json

The stock DBCs are the ones AzerothCore ships (its data/dbc folder) or an untouched 3.3.5a client's.
"""
import argparse, glob, json, os, re, struct, sys, time

CLASSES = {1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest', 6: 'Death Knight', 7: 'Shaman',
           8: 'Mage', 9: 'Warlock', 11: 'Druid'}
POWER = {0: 'Mana', 1: 'Rage', 2: 'Focus', 3: 'Energy', 5: 'Runes', 6: 'Runic Power'}

# Spell.dbc (3.3.5a, 234 fields)
S_NAME, S_RANK, S_DESC, S_TIP = 136, 153, 170, 187
S_STR_FIRST, S_STR_END = 136, 204          # fields 136..203 are localized strings (+ flags)


class Dbc:
    """A DBC file: rows by ID as raw bytes, strings resolved on demand."""
    def __init__(self, path):
        b = open(path, 'rb').read()
        magic, self.n, self.f, self.size, ss = struct.unpack('<4s4I', b[:20])
        if magic != b'WDBC':
            raise ValueError(path + ': not a DBC')
        self.data = b
        self.strings = b[20 + self.n * self.size:]
        self.rows = {}
        for i in range(self.n):
            off = 20 + i * self.size
            rid = struct.unpack_from('<I', b, off)[0]
            self.rows[rid] = off

    def raw(self, rid):
        o = self.rows[rid]
        return self.data[o:o + self.size]

    def str_at(self, off):
        if off <= 0 or off >= len(self.strings):
            return ''
        e = self.strings.index(b'\0', off)
        return self.strings[off:e].decode('utf-8', 'replace')

    def row(self, rid):
        """Decoded row: list of ints, with the string fields (when known) replaced by their text."""
        raw = self.raw(rid)
        return list(struct.unpack('<%dI' % self.f, raw))

    def ids(self):
        return self.rows.keys()


def i32(v):
    return v - (1 << 32) if v & 0x80000000 else v


def f32(v):
    return struct.unpack('<f', struct.pack('<I', v))[0]


def find_file(dirs, name):
    """The file from the last folder that has it (later folders win)."""
    found = None
    for d in dirs:
        p = os.path.join(d, name)
        if os.path.isfile(p):
            found = p
    return found


class Merged:
    """Stock table plus every layer's changed rows (later layers win). Rows are decoded lists; strings as text."""
    def __init__(self, name, stock_dir, layers, strings=()):
        self.name = name
        self.strings = list(strings)                       # field indexes that hold string offsets (enUS)
        sp = os.path.join(stock_dir, name + '.dbc')
        self.stock = Dbc(sp) if os.path.isfile(sp) else None
        self.old = {}
        self.new = {}
        if self.stock:
            for rid in self.stock.ids():
                self.old[rid] = self._decode(self.stock, rid)
        self.new = dict(self.old)
        self.changed = set()
        for d in layers:
            p = os.path.join(d, name + '.dbc')
            if not os.path.isfile(p):
                continue
            dbc = Dbc(p)
            seen = set()
            for rid in dbc.ids():
                seen.add(rid)
                if self.stock and rid in self.stock.rows and self._same(dbc, rid):
                    if rid not in self.new:                # put back a row an earlier layer dropped
                        self.new[rid] = self.old[rid]
                    continue
                self.new[rid] = self._decode(dbc, rid)
                self.changed.add(rid)
            # a full table that lost stock rows removed them (a layer is always a full copy of the table)
            for rid in list(self.old):
                if rid not in seen and rid in self.new and rid not in self.changed:
                    del self.new[rid]
                    self.changed.add(rid)

    def _decode(self, dbc, rid):
        r = dbc.row(rid)
        for i in self.strings:
            r[i] = dbc.str_at(r[i])
        return r

    def _same(self, dbc, rid):
        a, b = dbc.raw(rid), self.stock.raw(rid)
        if not self.strings:
            return a == b
        # compare everything but the string offsets, then the enUS strings by text
        if self.name == 'Spell':
            if a[:S_STR_FIRST * 4] != b[:S_STR_FIRST * 4] or a[S_STR_END * 4:] != b[S_STR_END * 4:]:
                return False
        else:
            sa = struct.unpack('<%dI' % dbc.f, a)
            sb = struct.unpack('<%dI' % self.stock.f, b)
            if len(sa) != len(sb):
                return False
            for i, (x, y) in enumerate(zip(sa, sb)):
                if i not in self.strings and not self._is_locale(i) and x != y:
                    return False
        for i in self.strings:
            x = struct.unpack_from('<I', a, i * 4)[0]
            y = struct.unpack_from('<I', b, i * 4)[0]
            if dbc.str_at(x) != self.stock.str_at(y):
                return False
        return True

    def _is_locale(self, i):
        # the other locales and the flags field after each enUS string
        return any(s < i <= s + 16 for s in self.strings)


# ---------------------------------------------------------------- tooltip text


class Text:
    """Turns spell description variables ($s1, $d, $o2, ${...}) into numbers, close to what the client shows."""
    def __init__(self, spells, dur, rad, rng, cast):
        self.spells, self.dur, self.rad, self.rng, self.cast = spells, dur, rad, rng, cast

    def duration_ms(self, s):
        d = self.dur.get(s[40])
        return i32(d[1]) if d else 0

    def points(self, s, e, high=False):
        base, die = i32(s[80 + e]), i32(s[74 + e])
        v = base + (die if high else (1 if die else 1))
        if high and die <= 1:
            v = base + 1
        return v

    def var(self, s, ch, n):
        e = max(0, min(2, (n or 1) - 1))
        if ch in 's':
            lo, hi = abs(self.points(s, e)), abs(self.points(s, e, True))
            return lo if lo == hi else (lo, hi)
        if ch == 'm':
            return abs(self.points(s, e))
        if ch == 'M':
            return abs(self.points(s, e, True))
        if ch in 'oO':
            amp = s[98 + e]
            ticks = (self.duration_ms(s) // amp) if amp else 1
            return abs(self.points(s, e)) * max(1, ticks)
        if ch in 'tT':
            return fmt_num(s[98 + e] / 1000.0)
        if ch in 'aA':
            r = self.rad.get(s[92 + e])
            return fmt_num(f32(r[1])) if r else 0
        if ch in 'xX':
            return s[104 + e]
        if ch in 'qQ':
            return i32(s[110 + e])
        if ch in 'eE':
            return fmt_num(f32(s[101 + e]))
        if ch in 'bB':
            return fmt_num(f32(s[119 + e]))
        if ch in 'hH':
            return s[35]
        if ch in 'nN':
            return s[36]
        if ch in 'uU':
            return s[49]
        if ch in 'iI':
            return s[212]
        if ch in 'rR':
            r = self.rng.get(s[46])
            return fmt_num(f32(r[3])) if r else 0
        if ch in 'vV':
            return s[207]
        if ch in 'fF':
            return fmt_num(f32(s[216 + e]))
        if ch in 'dD':
            return fmt_dur(self.duration_ms(s))
        return None

    TOKEN = re.compile(r'\$(?:(\d+)?([smMoOtTaAxXqQeEbBhHnNuUiIrRvVfFdD])(\d)?)')

    def render(self, s, text, depth=0):
        if not text:
            return ''
        if depth > 3:
            return text

        def value(sid, ch, n):
            sp = self.spells.get(int(sid)) if sid else s
            if sp is None:                                 # a spell that is not in our files (ported text)
                return '?'
            return self.var(sp, ch, int(n) if n else None)

        def show(v):
            if isinstance(v, tuple):
                return '%s to %s' % v
            return str(v)

        def num(v):
            return v[0] if isinstance(v, tuple) else (float(v) if not isinstance(v, (int, float)) else v)

        # $/1000;S1 and $*2;s1
        def divmul(m):
            op, k, sid, ch, n = m.group(1), float(m.group(2)), m.group(3), m.group(4), m.group(5)
            v = value(sid, ch, n)
            if v is None:
                return m.group(0)
            if v == '?':
                return v
            if isinstance(v, tuple):
                return show(tuple(fmt_num(x / k if op == '/' else x * k) for x in v))
            try:
                v = float(v)
            except ValueError:
                return m.group(0)
            return show(fmt_num(v / k if op == '/' else v * k))
        text = re.sub(r'\$([/*])(\d+(?:\.\d+)?);(\d+)?([a-zA-Z])(\d)?', divmul, text)

        # $@spelldesc123 / $@spelltooltip123
        def ref(m):
            sp = self.spells.get(int(m.group(2)))
            if not sp:
                return ''
            return self.render(sp, sp[S_DESC] if m.group(1) == 'desc' else sp[S_TIP], depth + 1)
        text = re.sub(r'\$@spell(desc|tooltip|aura)(\d+)', ref, text)

        # ${...} expressions: put the numbers in, then work them out when it is plain arithmetic
        def expr(m):
            inner, dec = m.group(1), m.group(2)
            def sub(t):
                v = value(t.group(1), t.group(2), t.group(3))
                if v is None or isinstance(v, str):
                    return '0'
                return str(num(v))
            e = self.TOKEN.sub(sub, inner)
            e = re.sub(r'\$\w+', '0', e)
            if re.fullmatch(r'[\d\s.+\-*/()]+', e):
                try:
                    r = eval(e, {'__builtins__': {}})
                    return str(round(r, int(dec)) if dec else fmt_num(r))
                except Exception:
                    pass
            return inner
        text = re.sub(r'\$\{([^}]*)\}(?:\.(\d))?', expr, text)

        # $l singular:plural; and $g male:female;
        text = re.sub(r'\$[lL]([^:;]*):([^;]*);', lambda m: m.group(2), text)
        text = re.sub(r'\$[gG]([^:;]*):([^;]*);', lambda m: m.group(1), text)
        # $?s123[yes][no] conditions: keep the first part
        text = re.sub(r'\$\?[!]?[a-z]?\d+\[([^\]]*)\](?:\[([^\]]*)\])?', lambda m: m.group(1), text)

        def tok(m):
            v = value(m.group(1), m.group(2), m.group(3))
            return m.group(0) if v is None else show(v)
        text = self.TOKEN.sub(tok, text)
        # stat names ($AP, $SP, $MWS...) stay as words
        text = re.sub(r'\$(RAP|AP|SPH|SPS|SPFI|SPFR|SPA|SPN|SPS|SP|MWS|mws|MWb|mwb|MW|mw|PL|pl|STA|INT|AGI|STR|SPI|HND|PS|ap|sp)\b',
                      lambda m: {'AP': 'attack power', 'RAP': 'ranged attack power'}.get(m.group(1), m.group(1)), text)
        text = re.sub(r'\$\{[^}]*\}(\.\d)?|\$<\w+>', '?', text)           # what is left: description variables
        text = text.replace('$z', 'your home').replace('$$', '$')
        return text.replace('\r', '').strip()


def fmt_num(v):
    if isinstance(v, float):
        if abs(v - round(v)) < 1e-6:
            return int(round(v))
        return round(v, 2)
    return v


def fmt_dur(ms):
    if ms <= 0:
        return 'until cancelled'
    s = ms / 1000.0
    if s >= 3600 and s % 3600 == 0:
        h = int(s // 3600)
        return '%d hr%s' % (h, '' if h == 1 else 's')
    if s >= 60 and s % 60 == 0:
        return '%d min' % (s // 60)
    return '%s sec' % fmt_num(s)


# ---------------------------------------------------------------- spell sides


def side(s, text, tables):
    rng, cast, rune = tables
    out = {'id': s[0], 'name': s[S_NAME], 'rank': s[S_RANK]}
    out['desc'] = text.render(s, s[S_DESC])
    out['tip'] = text.render(s, s[S_TIP])
    # cost
    cost = ''
    pt = i32(s[41])
    if s[204]:
        cost = '%d%% of base %s' % (s[204], POWER.get(pt, 'mana').lower())
    elif s[42]:
        v = s[42] // 10 if pt in (1, 6) else s[42]
        cost = '%d %s' % (v, POWER.get(pt, 'power'))
    if s[226] and s[226] in rune:
        r = rune[s[226]]
        parts = [('%d %s' % (n, k)) for n, k in zip(r[1:4], ('Blood', 'Unholy', 'Frost')) if n]
        if parts:
            cost = (cost + ', ' if cost else '') + ' '.join(parts)
    if s[44]:
        cost += (', ' if cost else '') + 'plus %d per sec' % s[44]
    out['cost'] = cost
    c = cast.get(s[28])
    ms = i32(c[1]) if c else 0
    out['cast'] = 'Channeled' if (s[5] & 0x44) else ('Instant' if ms <= 0 else '%s sec cast' % fmt_num(ms / 1000.0))
    cd = max(s[29], s[30])
    out['cd'] = fmt_dur(cd) + ' cooldown' if cd else ''
    r = rng.get(s[46])
    if r:
        mx = fmt_num(f32(r[3]))
        mn = fmt_num(f32(r[1]))
        out['range'] = 'Melee range' if s[46] == 2 else ('Self' if s[46] == 1 else ('%s-%s yd range' % (mn, mx) if mn else '%s yd range' % mx))
    else:
        out['range'] = ''
    d = text.duration_ms(s)
    out['dur'] = fmt_dur(d) if s[40] and d > 0 else ''
    out['level'] = s[39] or s[38]
    fx = []
    for e in range(3):
        if s[71 + e]:
            v = abs(text.points(s, e))
            t = 'Effect %d: type %d' % (e + 1, s[71 + e])
            if s[95 + e]:
                t += ', aura %d' % s[95 + e]
            t += ', value %d' % v
            if s[110 + e]:
                t += ', misc %d' % i32(s[110 + e])
            if s[116 + e]:
                t += ', triggers %d' % s[116 + e]
            if s[98 + e]:
                t += ', every %s sec' % fmt_num(s[98 + e] / 1000.0)
            fx.append(t)
    out['fx'] = fx
    return out


FIELDS = ['name', 'rank', 'desc', 'tip', 'cost', 'cast', 'cd', 'range', 'dur', 'level', 'fx']


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--stock', required=True, help='stock 3.3.5a DBFilesClient folder')
    ap.add_argument('--layer', action='append', default=[], help='a DBFilesClient folder with our DBCs (in load order)')
    ap.add_argument('--modules', help='folder of module repos: adds their client patch folders by patch letter')
    ap.add_argument('--db', help='world database: class trainer spells count as class spells (rows with '
                    'VerifiedBuild -1811 are ours, the rest stock)')
    ap.add_argument('--mysql', default='mysql', help='mysql command line (default: mysql)')
    ap.add_argument('--notes', help='hand-written notes (JSON): {"all": [text], "classes": {"9": [text]}, '
                    '"spells": {"8936": text}} for changes the DBCs do not show (server rules and scripts)')
    ap.add_argument('-o', '--out', required=True)
    a = ap.parse_args()

    layers = list(a.layer)
    if a.modules:
        found = []
        for p in glob.glob(os.path.join(a.modules, '*', '*', 'patch-*.MPQ', 'DBFilesClient')):
            parts = p.replace('\\', '/').split('/')
            if parts[-3] not in ('client', 'data'):
                continue
            letter = re.match(r'patch-(\w)', parts[-2], re.I).group(1).upper()
            found.append((letter, parts[-4], p))
        for letter, mod, p in sorted(found):
            layers.append(p)
    for p in layers:
        print('layer:', p, file=sys.stderr)

    spell = Merged('Spell', a.stock, layers, [S_NAME, S_RANK, S_DESC, S_TIP])
    talent = Merged('Talent', a.stock, layers)
    tab = Merged('TalentTab', a.stock, layers, [1])
    sla = Merged('SkillLineAbility', a.stock, layers)
    srci = Merged('SkillRaceClassInfo', a.stock, layers)
    skill = Merged('SkillLine', a.stock, layers, [3])
    icon = Merged('SpellIcon', a.stock, layers, [1])
    dur = Merged('SpellDuration', a.stock, layers).new
    rad = Merged('SpellRadius', a.stock, layers).new
    rng = Merged('SpellRange', a.stock, layers).new
    cast = Merged('SpellCastTimes', a.stock, layers).new
    rune = Merged('SpellRuneCost', a.stock, layers).new
    print('changed rows: Spell %d, Talent %d, SkillLineAbility %d, SkillRaceClassInfo %d' % (
        len(spell.changed), len(talent.changed), len(sla.changed), len(srci.changed)), file=sys.stderr)

    text_old = Text(spell.old, dur, rad, rng, cast)
    text_new = Text(spell.new, dur, rad, rng, cast)
    tables = (rng, cast, rune)

    def icon_name(s, icons):
        r = icons.get(s[133]) if s else None
        return os.path.basename(r[1].replace('\\', '/')).lower() if r and r[1] else 'inv_misc_questionmark'

    # which classes a skill line belongs to (class skill lines, category 7)
    def class_lines(skills, srcis):
        out = {}
        for r in srcis.values():
            sk = skills.get(r[1])
            if not sk or sk[1] != 7 or not r[3]:
                continue
            out.setdefault(r[1], 0)
            out[r[1]] |= r[3]
        return out

    def class_spells(slas, lines, talents, tabs):
        out = {}                                           # spell -> class mask
        for r in slas.values():
            if r[1] not in lines:
                continue
            mask = r[4] or lines[r[1]]
            mask &= lines[r[1]] if r[4] else ~0
            if r[6]:
                mask &= ~r[6]
            if mask:
                out[r[2]] = out.get(r[2], 0) | mask
        for t in talents.values():
            tb = tabs.get(t[1])
            if not tb or not tb[20]:
                continue
            for sid in t[4:9]:
                if sid:
                    out[sid] = out.get(sid, 0) | tb[20]
        return out

    lines_old = class_lines(skill.old, srci.old)
    lines_new = class_lines(skill.new, srci.new)
    cs_old = class_spells(sla.old, lines_old, talent.old, tab.old)
    cs_new = class_spells(sla.new, lines_new, talent.new, tab.new)
    if a.db:
        for sid, cid, ours in trainer_spells(a.mysql, a.db):
            bit = 1 << (cid - 1)
            for sp_set, table, use in ((cs_new, spell.new, True), (cs_old, spell.old, not ours)):
                if not use:
                    continue
                s = table.get(sid)
                if s is None:
                    continue
                # an old style "teach" spell (effect 36) stands for the spell it teaches
                for e in range(3):
                    if s[71 + e] == 36 and s[116 + e]:
                        sid2 = s[116 + e]
                        break
                else:
                    sid2 = sid
                sp_set[sid2] = sp_set.get(sid2, 0) | bit

    talent_spells_new = {sid for t in talent.new.values() for sid in t[4:13] if sid}
    talent_spells_old = {sid for t in talent.old.values() for sid in t[4:13] if sid}

    notes = {}
    if a.notes:
        with open(a.notes, encoding='utf-8') as fh:
            notes = json.load(fh)
    spell_notes = {int(k): v for k, v in notes.get('spells', {}).items() if k.isdigit()}
    name_notes = {k.lower(): v for k, v in notes.get('spells', {}).items() if not k.isdigit()}
    scripted = server_scripts(a.mysql, a.db) if a.db else {}

    tal_names = {}
    for t in talent.new.values():
        sp0 = spell.new.get(t[4])
        if sp0:
            tal_names[sp0[S_NAME].lower()] = sp0[S_NAME]

    def script_note(words):
        w = words.split()
        for k in range(len(w), 0, -1):
            name = tal_names.get(' '.join(w[:k]))
            if name:
                return 'Works with the new %s talent.' % name
        return 'Works differently on Temucraft (%s).' % words

    result = {'generated': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()), 'classes': {}, 'skills': [],
              'notes': notes.get('all', [])}
    for cid, cname in CLASSES.items():
        bit = 1 << (cid - 1)
        groups = {}
        ids = {s for s, m in cs_old.items() if m & bit} | {s for s, m in cs_new.items() if m & bit}
        for sid in ids:
            if sid in talent_spells_new or sid in talent_spells_old:
                continue                                   # talents have their own page
            o = spell.old.get(sid) if cs_old.get(sid, 0) & bit else None
            n = spell.new.get(sid) if cs_new.get(sid, 0) & bit else None
            if o is None and n is None:
                continue
            ref0 = n or o
            note = spell_notes.get(sid) or name_notes.get(ref0[S_NAME].lower()) or (scripted.get(sid) and script_note(scripted[sid]))
            if o is not None and n is not None and sid not in spell.changed and not note:
                continue
            so = side(o, text_old, tables) if o else None
            sn = side(n, text_new, tables) if n else None
            changed = [f for f in FIELDS if so and sn and so[f] != sn[f]]
            if note and so and sn:
                changed.append('server')
            if so and sn and not changed:
                continue
            kind = 'new' if not so else ('removed' if not sn else 'updated')
            ref = n or o
            name = ref[S_NAME]
            g = groups.setdefault((kind, name), {'name': name, 'icon': icon_name(ref, icon.new if n else icon.old), 'ranks': []})
            r = {'id': sid, 'rank': ref[S_RANK], 'old': so, 'new': sn, 'changed': changed}
            if note:
                r['note'] = note
            g['ranks'].append(r)
        spells = {'new': [], 'updated': [], 'removed': []}
        for (kind, name), g in sorted(groups.items(), key=lambda x: x[0][1].lower()):
            g['ranks'].sort(key=lambda r: (rank_no(r['rank']), r['id']))
            spells[kind].append(g)

        # talents
        tals = {'new': [], 'updated': [], 'removed': []}
        tids = set(talent.old) | set(talent.new)
        for tid in sorted(tids):
            o, n = talent.old.get(tid), talent.new.get(tid)
            to = tab.old.get(o[1]) if o else None
            tn = tab.new.get(n[1]) if n else None
            if not ((to and to[20] & bit) or (tn and tn[20] & bit)):
                continue
            po = tpos(o, to, spell.old, text_old, talent.old) if o and to and to[20] & bit else None
            pn = tpos(n, tn, spell.new, text_new, talent.new) if n and tn and tn[20] & bit else None
            if po is None and pn is None:
                continue
            changed = [f for f in ('tree', 'row', 'col', 'ranks', 'desc', 'req', 'name') if po and pn and po[f] != pn[f]]
            if po and pn and not changed:
                continue
            kind = 'new' if not po else ('removed' if not pn else 'updated')
            first = (pn or po)['ranks'][0] if (pn or po)['ranks'] else 0
            sp = (spell.new if pn else spell.old).get(first)
            tals[kind].append({'id': tid, 'name': (pn or po)['name'], 'icon': icon_name(sp, icon.new if pn else icon.old),
                               'tree': (pn or po)['tree'], 'old': po, 'new': pn, 'changed': changed})
        order = {tb[1]: tb[22] for tb in list(tab.old.values()) + list(tab.new.values())}
        for k in tals:
            tals[k].sort(key=lambda t: (order.get(t['tree'], 99), (t['new'] or t['old'])['row'], (t['new'] or t['old'])['col']))
        # the whole trees as they are now, new talents marked, for the tree view
        trees = []
        for tid_, tb in sorted(tab.new.items(), key=lambda x: x[1][22]):
            if not (tb[20] & bit) or tb[21]:
                continue
            cells = []
            for t in talent.new.values():
                if t[1] != tid_:
                    continue
                ranks = [x for x in t[4:13] if x]
                sp0 = spell.new.get(ranks[0]) if ranks else None
                cells.append({'id': t[0], 'row': t[2] + 1, 'col': t[3] + 1, 'name': sp0[S_NAME] if sp0 else '?',
                              'icon': icon_name(sp0, icon.new), 'ranks': len(ranks), 'spell': ranks[0] if ranks else 0,
                              'new': t[0] not in talent.old,
                              'moved': t[0] in talent.old and (talent.old[t[0]][1:4] != t[1:4])})
            cells.sort(key=lambda c: (c['row'], c['col']))
            trees.append({'name': tb[1], 'talents': cells})
        result['classes'][str(cid)] = {'name': cname, 'spells': spells, 'talents': tals, 'trees': trees,
                                       'notes': notes.get('classes', {}).get(str(cid), [])}

    # weapon and armor skills: who may learn them
    for sid in sorted(set(skill.new) | set(skill.old)):
        sk = skill.new.get(sid) or skill.old.get(sid)
        if sk[1] not in (6, 8):
            continue
        def classes_of(srcis):
            m = 0
            any_row = False
            for r in srcis.values():
                if r[1] == sid:
                    any_row = True
                    m |= r[3] or 0x5FF
            return m if any_row else 0
        o, n = classes_of(srci.old), classes_of(srci.new)
        if o != n:
            result['skills'].append({'id': sid, 'name': sk[3], 'kind': 'Weapon' if sk[1] == 6 else 'Armor',
                                     'old': names_of(o), 'new': names_of(n)})

    # keep the old date when nothing else changed, so a daily run doesn't make a commit for nothing
    try:
        with open(a.out, encoding='utf-8') as fh:
            prev = json.load(fh)
        if {k: v for k, v in prev.items() if k != 'generated'} == {k: v for k, v in result.items() if k != 'generated'}:
            result['generated'] = prev.get('generated', result['generated'])
    except (OSError, ValueError):
        pass
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, separators=(',', ':'))
    for cid, c in result['classes'].items():
        print('%-13s spells new %3d updated %3d removed %3d | talents new %3d updated %3d removed %3d' % (
            c['name'], len(c['spells']['new']), len(c['spells']['updated']), len(c['spells']['removed']),
            len(c['talents']['new']), len(c['talents']['updated']), len(c['talents']['removed'])), file=sys.stderr)
    print('skills changed:', len(result['skills']), file=sys.stderr)


def server_scripts(mysql, db):
    """Spells with a Temucraft spell script: id -> readable script name. A negative id means every rank."""
    import shlex, subprocess
    run = lambda q: subprocess.run(shlex.split(mysql) + ['-N', '-B', db, '-e', q], check=True, capture_output=True,
                                   text=True).stdout.splitlines()
    ranks = {}
    try:
        for line in run('SELECT first_spell_id, spell_id FROM spell_ranks'):
            f, sid = map(int, line.split('\t'))
            ranks.setdefault(f, []).append(sid)
    except Exception:
        pass
    out = {}
    for line in run("SELECT spell_id, ScriptName FROM spell_script_names WHERE ScriptName LIKE 'spell_temucraft%'"):
        sid, name = line.split('\t')
        sid = int(sid)
        words = name.replace('spell_temucraft_', '').replace('_', ' ')
        for x in (ranks.get(-sid, [-sid]) if sid < 0 else [sid]):
            out[x] = words
    return out


def trainer_spells(mysql, db):
    import shlex, subprocess
    q = ('SELECT ts.SpellId, t.Requirement, ts.VerifiedBuild = -1811 FROM trainer t JOIN trainer_spell ts '
         'ON ts.TrainerId = t.Id WHERE t.Type = 0 AND t.Requirement BETWEEN 1 AND 11')
    out = subprocess.run(shlex.split(mysql) + ['-N', '-B', db, '-e', q], check=True, capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        p = line.split('\t')
        if len(p) == 3 and int(p[1]) in CLASSES:
            rows.append((int(p[0]), int(p[1]), p[2] == '1'))
    return rows


def names_of(mask):
    if (mask & 0x5FF) == 0x5FF:
        return ['All classes']
    return [n for c, n in CLASSES.items() if mask & (1 << (c - 1))]


def rank_no(r):
    m = re.search(r'(\d+)', r or '')
    return int(m.group(1)) if m else 0


def tpos(t, tb, spells, text, talents):
    ranks = [sid for sid in t[4:13] if sid]
    first = spells.get(ranks[0]) if ranks else None
    last = spells.get(ranks[-1]) if ranks else None
    req = ''
    if t[13] and t[13] in talents:
        rt = talents[t[13]]
        rs = spells.get(rt[4])
        if rs:
            req = '%s (%d point%s)' % (rs[S_NAME], t[16] + 1, '' if t[16] == 0 else 's')
    return {'tree': tb[1], 'row': t[2] + 1, 'col': t[3] + 1, 'ranks': ranks,
            'name': first[S_NAME] if first else 'Talent %d' % t[0],
            'desc': [text.render(spells[s], spells[s][S_DESC]) for s in (ranks[0], ranks[-1]) if s in spells] if ranks else [],
            'req': req}


if __name__ == '__main__':
    main()
