#!/usr/bin/env python3
"""
Temucraft expansions: which expansion (or which part of our own content) each item, NPC, object, quest, spell and map
comes from, for the AoWoW expansion badges and the "Added in" line.

It reads the module SQL the server loads (<module>/data/sql/<anything with world in it>/*.sql, not optional/) and
tags every new row of creature_template, gameobject_template, item_template (and item_dbc), quest_template,
spell_dbc and map_dbc by the rules in setup/temucraft/expansion-sources.json (module folder and file patterns, id
ranges, maps). Rows that already exist in stock 3.3.5 keep what AoWoW decides today, so they are left out.

Output (setup/temucraft/expansions.json; no time stamp, so the daily run only commits real changes):

  {"names": {"3": "Cataclysm", ...},
   "item": {"52078": 3, ...}, "npc": {...}, "object": {...}, "quest": {...}, "spell": {...}, "map": {"644": 3, ...},
   "counts": {"item": {"3": 700, ...}, ...}, "rules": {"Cataclysm instances": {"files": 1, "rows": 1234}, ...}}

`php aowow --sql` applies it (setup/tools/sqlgen/expansions.ss.php; alone: php aowow --sql=expansions): the
expansion column of aowow_items, aowow_creature, aowow_objects, aowow_quests and aowow_spell, and
aowow_zones.expansion for the zones on our maps (Map.dbc says 2 for them so the server lets players in).

Usage (from the AoWoW folder):
  python3 setup/tools/temucraft-expansions.py --modules <folder with the module repos> \
      [--stock-db <stock world database> --mysql "mysql -uroot -p..."] [--stock-ids <folder>] \
      -o setup/temucraft/expansions.json

  --stock-db   a world database without the modules (AzerothCore's own SQL): ids found there count as stock
  --stock-ids  a folder of <table>.txt files with one stock id per line (creature_template, gameobject_template,
               item_template, quest_template, spell_dbc), for example dumped before the module SQL is loaded
  --rules      the rules file (default setup/temucraft/expansion-sources.json next to this script's setup folder)
"""
import argparse, fnmatch, glob, json, os, re, subprocess, sys, time
from collections import defaultdict

# table -> (output type, id column); item_dbc shares the item ids
TABLES = {
    'creature_template':   ('npc',    'entry'),
    'gameobject_template': ('object', 'entry'),
    'item_template':       ('item',   'entry'),
    'item_dbc':            ('item',   'ID'),
    'quest_template':      ('quest',  'ID'),
    'spell_dbc':           ('spell',  'ID'),
    'map_dbc':             ('map',    'ID'),
}
SPAWNS = {'creature': ('id1', 'id'), 'gameobject': ('id',)}
SPELL_REFS = {'creature_template_spell': 'spell', 'smart_scripts': 'action_param1'}   # smart_scripts: cast actions
CAST_ACTIONS = {11, 85, 86, 134}
LOOT = {'creature_loot_template', 'gameobject_loot_template', 'reference_loot_template', 'item_loot_template'}
STOCK_TABLES = {'npc': ('creature_template', 'entry'), 'object': ('gameobject_template', 'entry'),
                'item': ('item_template', 'entry'), 'quest': ('quest_template', 'ID'), 'spell': ('spell_dbc', 'ID')}
TYPES = ('item', 'npc', 'object', 'quest', 'spell', 'map')

TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<com>--[^\n]*|\#[^\n]*|/\*.*?\*/)
  | (?P<str>'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*")
  | (?P<bt>`[^`]*`)
  | (?P<num>\d+(?:\.\d*)?(?:[eE][-+]?\d+)?)
  | (?P<var>@@?[A-Za-z_][\w$]*)
  | (?P<word>[A-Za-z_][\w$]*)
  | (?P<op>:=|<=|>=|<>|!=|[-+*/(),;=.<>%&|!~^])
  | (?P<other>.)
""", re.S | re.X)


def tokens(text):
    """(kind, text) for every SQL token except blanks and comments."""
    for m in TOKEN.finditer(text):
        k = m.lastgroup
        if k not in ('ws', 'com'):
            yield k, m.group(k)


def statements(text):
    """Token lists, one per statement."""
    cur = []
    for t in tokens(text):
        if t == ('op', ';'):
            if cur:
                yield cur
            cur = []
        else:
            cur.append(t)
    if cur:
        yield cur


def name(tok):
    k, v = tok
    return v[1:-1].lower() if k == 'bt' else v.lower()


SAFE_EXPR = re.compile(r'^[\d\s+\-*/().]+$')


def value(toks, env):
    """A value tuple element: int, float, str, None (NULL or something we can't work out)."""
    if not toks:
        return None
    if len(toks) == 1:
        k, v = toks[0]
        if k == 'num':
            return float(v) if any(c in v for c in '.eE') else int(v)
        if k == 'str':
            return v[1:-1]
        if k == 'var':
            return env.get(v.lower())
        return None
    expr = []
    for k, v in toks:
        if k == 'var':
            x = env.get(v.lower())
            if not isinstance(x, (int, float)):
                return None
            expr.append(str(x))
        elif k in ('num', 'op'):
            expr.append(v)
        else:
            return None
    s = ' '.join(expr)
    if not SAFE_EXPR.match(s):
        return None
    try:
        r = eval(s, {'__builtins__': {}}, {})
    except Exception:
        return None
    return int(r) if isinstance(r, float) and r.is_integer() else r


def split_commas(toks):
    """Top level comma separated parts of a token list."""
    parts, cur, depth = [], [], 0
    for t in toks:
        if t[0] == 'op':
            if t[1] == '(':
                depth += 1
            elif t[1] == ')':
                depth -= 1
            elif t[1] == ',' and depth == 0:
                parts.append(cur)
                cur = []
                continue
        cur.append(t)
    parts.append(cur)
    return parts


def parse_insert(st, env):
    """(table, [column], [[value]]) for INSERT/REPLACE ... VALUES, else None."""
    i = 0
    verb = name(st[0])
    if verb not in ('insert', 'replace'):
        return None
    i = 1
    while i < len(st) and name(st[i]) in ('ignore', 'low_priority', 'delayed', 'high_priority'):
        i += 1
    if i < len(st) and name(st[i]) == 'into':
        i += 1
    if i >= len(st):
        return None
    table = name(st[i])
    i += 1
    if i < len(st) and st[i] == ('op', '.'):                # db.table
        table = name(st[i + 1])
        i += 2
    if table not in TABLES and table not in SPAWNS and table not in LOOT and table not in SPELL_REFS:
        return table, None, None
    cols = None
    if i < len(st) and st[i] == ('op', '('):
        j = i + 1
        cols = []
        while j < len(st) and st[j] != ('op', ')'):
            if st[j][0] in ('bt', 'word'):
                cols.append(name(st[j]))
            j += 1
        i = j + 1
    if i >= len(st) or name(st[i]) not in ('values', 'value'):
        return table, cols, None                            # INSERT ... SELECT
    i += 1
    rows, depth, cur = [], 0, []
    for t in st[i:]:
        if t == ('op', '('):
            depth += 1
            if depth == 1:
                cur = []
                continue
        elif t == ('op', ')'):
            depth -= 1
            if depth == 0:
                rows.append([value(p, env) for p in split_commas(cur)])
                continue
        if depth >= 1:
            cur.append(t)
        elif depth == 0 and name(t) == 'on':                 # ON DUPLICATE KEY UPDATE ...
            break
    return table, cols, rows


def parse_set(st, env):
    """SET @a := 1, @b = @a + 2"""
    for part in split_commas(st[1:]):
        if len(part) >= 3 and part[0][0] == 'var' and part[1] in (('op', ':='), ('op', '=')):
            env[part[0][1].lower()] = value(part[2:], env)


def module_files(modules):
    """(module, path) for the SQL AzerothCore loads from each module, in load order (like modules-ci)."""
    out = []
    for mod in sorted(os.listdir(modules)):
        base = os.path.join(modules, mod, 'data', 'sql')
        if not os.path.isdir(base):
            continue
        files = []
        for root, _, names in os.walk(base):
            rel = os.path.relpath(root, base).replace(os.sep, '/')
            if 'world' not in rel or 'optional' in rel:
                continue
            files += [os.path.join(root, n) for n in names if n.endswith('.sql')]
        out += [(mod, f) for f in sorted(files)]
    return out


def match_rule(rules, mod, path):
    fn = os.path.basename(path)
    for r in rules:
        if fnmatch.fnmatch(mod, r['module']) and fnmatch.fnmatch(fn, r.get('file', '*')):
            return r
    return None


def load_stock(a):
    stock = defaultdict(set)
    if a.stock_db:
        for t, (table, col) in STOCK_TABLES.items():
            cmd = a.mysql.split() + ['-N', '-B', a.stock_db, '-e', 'SELECT `%s` FROM `%s`' % (col, table)]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
            except (subprocess.CalledProcessError, FileNotFoundError) as e:
                sys.exit('stock database: ' + str(e))
            stock[t].update(int(x) for x in res.split())
    if a.stock_ids:
        for t, (table, _) in STOCK_TABLES.items():
            p = os.path.join(a.stock_ids, table + '.txt')
            if os.path.exists(p):
                stock[t].update(int(x) for x in open(p).read().split() if x.isdigit())
    return stock


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--modules', required=True, help='folder of module repos')
    ap.add_argument('--rules', default=os.path.join(here, '..', 'temucraft', 'expansion-sources.json'))
    ap.add_argument('--stock-db', help='world database without the modules: its ids count as stock')
    ap.add_argument('--stock-ids', help='folder of <table>.txt stock id lists')
    ap.add_argument('--mysql', default='mysql', help='mysql command line (default: mysql)')
    ap.add_argument('-o', '--out', required=True)
    a = ap.parse_args()

    cfg = json.load(open(a.rules))
    rules = cfg['rules']
    stock = load_stock(a)
    if not stock:
        print('no --stock-db or --stock-ids: rows that change stock ids get tagged too', file=sys.stderr)
    stock_maps = set(cfg['stock']['maps'])
    spell_max = cfg['stock']['spell_max']

    tags = {t: {} for t in TYPES}                           # type -> id -> expansion (first rule wins)
    from_loot = {}                                          # item id -> rule that wants its loot expansion
    loot_exp = {}                                           # item id -> expansion of the loot that drops it
    used = defaultdict(lambda: {'files': 0, 'rows': 0})
    rule_maps = defaultdict(set)                            # rule label -> spawn maps
    map_rows = {}                                           # map_dbc rows: map id -> rule
    spell_refs = {}                                         # spells the rule's creatures cast: id -> rule

    def tag(t, i, exp, r):
        if not isinstance(i, int) or i <= 0 or i in tags[t]:
            return
        if not r.get('override_stock'):
            if i in stock.get(t, ()) or (t == 'spell' and i <= spell_max) or (t == 'map' and i in stock_maps):
                return
        for lo, hi, e in r.get('id_ranges', []):
            if lo <= i <= hi:
                exp = e
                break
        tags[t][i] = exp
        used[r['label']]['rows'] += 1

    t0 = time.time()
    files = module_files(a.modules)
    for mod, path in files:
        r = match_rule(rules, mod, path)
        if not r or r.get('expansion') is None:
            continue
        used[r['label']]['files'] += 1
        exp = r['expansion']
        env = {}
        text = open(path, encoding='utf-8', errors='replace').read()
        for st in statements(text):
            head = name(st[0])
            if head == 'set':
                parse_set(st, env)
                continue
            if head not in ('insert', 'replace'):
                continue
            res = parse_insert(st, env)
            if not res or res[2] is None or not res[1]:
                continue
            table, cols, rows = res
            if table in TABLES:
                t, key = TABLES[table]
                if key.lower() not in cols:
                    continue
                k = cols.index(key.lower())
                for row in rows:
                    if k >= len(row):
                        continue
                    if r.get('from_loot') and t == 'item':
                        from_loot.setdefault(row[k], r)
                    elif t == 'map':                        # after the rules' own map lists
                        map_rows.setdefault(row[k], r)
                    else:
                        tag(t, row[k], exp, r)
            elif table in SPAWNS and r.get('spawn_maps') and 'map' in cols:
                m = cols.index('map')
                for row in rows:
                    if m < len(row) and isinstance(row[m], int) and row[m] not in stock_maps:
                        rule_maps[r['label']].add(row[m])
            elif table in SPELL_REFS and r.get('spell_refs') and SPELL_REFS[table] in cols:
                k = cols.index(SPELL_REFS[table])
                act = cols.index('action_type') if table == 'smart_scripts' and 'action_type' in cols else None
                for row in rows:
                    if k < len(row) and (act is None or (act < len(row) and row[act] in CAST_ACTIONS)):
                        spell_refs.setdefault(row[k], r)
            elif table in LOOT and 'item' in cols:
                k = cols.index('item')
                ref = cols.index('reference') if 'reference' in cols else None
                for row in rows:
                    if k < len(row) and (ref is None or ref >= len(row) or not row[ref]):
                        loot_exp.setdefault(row[k], exp)

    # items whose expansion comes from the loot that drops them, else from their rule (and its id ranges)
    for i, r in from_loot.items():
        tag('item', i, loot_exp.get(i, r['expansion']), r)

    # spells the converted creatures cast that are newer than 3.3.5 (only if no rule defines them)
    for i, r in spell_refs.items():
        tag('spell', i, r['expansion'], r)

    # maps: first the rules' own lists (when the rule matched a file), then the maps their spawns use, then map_dbc
    live = [r for r in rules if r.get('expansion') is not None and r['label'] in used]
    for r in live:
        for m in r.get('maps', []):
            tags['map'].setdefault(m, r['expansion'])
    for r in live:
        for m in sorted(rule_maps.get(r['label'], ())):
            tags['map'].setdefault(m, r['expansion'])
    for m, r in map_rows.items():
        tag('map', m, r['expansion'], r)

    counts = {t: {} for t in TYPES}
    for t in TYPES:
        for e in tags[t].values():
            counts[t][str(e)] = counts[t].get(str(e), 0) + 1
    out = {
        'names': cfg['expansions'],
        'counts': counts,
        'rules': dict(sorted(used.items())),
    }
    for t in TYPES:
        out[t] = {str(i): e for i, e in sorted(tags[t].items())}

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as f:
        f.write('{\n')
        keys = list(out.keys())
        for n, k in enumerate(keys):                        # one line per section: diffs stay readable
            f.write(' %s: %s%s\n' % (json.dumps(k), json.dumps(out[k], separators=(',', ':')), ',' if n < len(keys) - 1 else ''))
        f.write('}\n')

    print('%d files in %.1fs -> %s' % (len(files), time.time() - t0, a.out))
    for t in TYPES:
        print('  %-6s %s' % (t, ', '.join('%s: %d' % (cfg['expansions'].get(e, e), c)
                                           for e, c in sorted(counts[t].items(), key=lambda x: int(x[0])))))


if __name__ == '__main__':
    main()
