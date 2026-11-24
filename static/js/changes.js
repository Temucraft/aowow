/*
 * Temucraft Changes (?changes)
 *
 * What is different from stock 3.3.5, per class, in the style of Wowhead's Classic "Forever" changes pages.
 * The page gives cfg.view ('overview', 'spellbook', 'talents' or 'missing') and cfg.data (see pages/changes.php).
 */
var AoChanges = (function () {
    var el, cfg;
    var KINDS = [['new', 'New'], ['updated', 'Updated'], ['removed', 'Removed']];
    var LABELS = { name: 'Name', rank: 'Rank', desc: 'Description', tip: 'Buff text', cost: 'Cost', cast: 'Cast time',
                   cd: 'Cooldown', range: 'Range', dur: 'Duration', level: 'Level', fx: 'Effects', server: 'Server',
                   tree: 'Tree', row: 'Row', col: 'Column', ranks: 'Ranks', req: 'Requires' };

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function host() { return (cfg.host || '').replace(/\/?$/, '/'); }
    function slug(id) { return cfg.slugs[id]; }
    function classFile(id) { return (typeof g_file_classes != 'undefined' && g_file_classes[id]) || slug(id).replace('-', ''); }
    function icon(name, size, url) {
        var i = Icon.create(name || 'inv_misc_questionmark', size, null, url || null);
        return i.outerHTML;
    }
    function total(o) { return (o.new || 0) + (o.updated || 0) + (o.removed || 0); }
    function plural(n, w) { return n + ' ' + w + (n == 1 ? '' : 's'); }

    // word diff: words only in a are marked "gone", words only in b "added"
    function diff(a, b) {
        var x = String(a || '').split(/(\s+)/), y = String(b || '').split(/(\s+)/);
        var n = x.length, m = y.length, i, j;
        if (n * m > 250000) return [esc(a), esc(b)];
        var L = [];
        for (i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
        for (i = n - 1; i >= 0; i--)
            for (j = m - 1; j >= 0; j--)
                L[i][j] = x[i] == y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        var ra = '', rb = '';
        i = 0; j = 0;
        while (i < n && j < m) {
            if (x[i] == y[j]) { ra += esc(x[i]); rb += esc(y[j]); i++; j++; }
            else if (L[i + 1][j] >= L[i][j + 1]) { ra += /\S/.test(x[i]) ? '<del>' + esc(x[i]) + '</del>' : esc(x[i]); i++; }
            else { rb += /\S/.test(y[j]) ? '<ins>' + esc(y[j]) + '</ins>' : esc(y[j]); j++; }
        }
        for (; i < n; i++) ra += /\S/.test(x[i]) ? '<del>' + esc(x[i]) + '</del>' : esc(x[i]);
        for (; j < m; j++) rb += /\S/.test(y[j]) ? '<ins>' + esc(y[j]) + '</ins>' : esc(y[j]);
        return [ra, rb];
    }

    // one spell as a tooltip-like card; other = the side to compare with (to mark what changed)
    // the text with the words that changed marked: old side marks removed words, new side added ones
    function marked(old, now, isNow) { return diff(old, now)[isNow ? 1 : 0]; }
    function missing(isNow) { return '<div class="chg-card chg-none">' + (isNow ? 'Removed' : 'Not in the game before') + '</div>'; }

    function card(s, other, changed, isNow) {
        if (!s) return missing(isNow);
        var c = changed || [];
        function mark(f, text) {
            if (!text) return '';
            return c.indexOf(f) != -1 ? '<span class="chg-mark">' + esc(text) + '</span>' : esc(text);
        }
        var desc = esc(s.desc), tip = esc(s.tip);
        if (other && c.indexOf('desc') != -1) desc = isNow ? marked(other.desc, s.desc, true) : marked(s.desc, other.desc, false);
        if (other && c.indexOf('tip') != -1) tip = isNow ? marked(other.tip, s.tip, true) : marked(s.tip, other.tip, false);
        var h = '<div class="chg-card">';
        h += '<table class="chg-head"><tr><td><a href="' + host() + '?spell=' + s.id + '"><b>' + mark('name', s.name) + '</b></a></td>';
        h += '<td class="chg-r">' + mark('rank', s.rank) + '</td></tr>';
        if (s.cost || s.range) h += '<tr><td>' + mark('cost', s.cost) + '</td><td class="chg-r">' + mark('range', s.range) + '</td></tr>';
        if (s.cast || s.cd) h += '<tr><td>' + mark('cast', s.cast) + '</td><td class="chg-r">' + mark('cd', s.cd) + '</td></tr>';
        h += '</table>';
        if (s.desc) h += '<div class="chg-desc">' + desc + '</div>';
        if (s.tip) h += '<div class="chg-tip"><span>Buff:</span> ' + tip + '</div>';
        var foot = [];
        if (s.dur) foot.push('Duration: ' + mark('dur', s.dur));
        if (s.level) foot.push('Level ' + mark('level', s.level));
        foot.push('<a href="' + host() + '?spell=' + s.id + '">Spell ' + s.id + '</a>');
        h += '<div class="chg-foot">' + foot.join(' &middot; ') + '</div>';
        if (c.indexOf('fx') != -1 && s.fx && s.fx.length)
            h += '<div class="chg-fx">' + s.fx.map(esc).join('<br>') + '</div>';
        return h + '</div>';
    }

    // plain text with the spell names it mentions turned into links (cfg.data.links: name => spell id)
    var linkRe = null;
    function linked(t) {
        var links = cfg.data && cfg.data.links;
        if (!links) return esc(t);
        if (linkRe === null) {
            var names = Object.keys(links).sort(function (a, b) { return b.length - a.length; })
                .map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
            linkRe = names.length ? new RegExp('\\b(' + names.join('|') + ')\\b', 'g') : false;
        }
        var e = esc(t);
        // [spell=123], [item=123], [quest=123], [npc=123] written in a note
        e = e.replace(/\[(spell|item|quest|npc|achievement)=(\d+)\]/g, function (m, type, id) { return '<a href="' + host() + '?' + type + '=' + id + '">' + type + ' ' + id + '</a>'; });
        if (linkRe) e = e.replace(linkRe, function (m) { return links[m] ? '<a href="' + host() + '?spell=' + links[m] + '">' + m + '</a>' : m; });
        return e;
    }

    function notes(list, title) {
        if (!list || !list.length) return '';
        return '<h2>' + esc(title) + '</h2><ul class="chg-notes">' + list.map(function (t) { return '<li>' + linked(t) + '</li>'; }).join('') + '</ul>';
    }

    // ── the release change log: newest first, one block per date, filter by area and search ──
    var logFilter = { tag: '', q: '' };
    function logTags() {
        var tags = {};
        (cfg.data.log || []).forEach(function (e) { e.lines.forEach(function (l) { if (l.tag) tags[l.tag] = (tags[l.tag] || 0) + 1; }); });
        return Object.keys(tags).sort();
    }
    function logHtml() {
        var log = cfg.data.log || [], q = logFilter.q, h = '', shown = 0, byDate = {}, dates = [];
        log.forEach(function (e) { if (!byDate[e.date]) { byDate[e.date] = []; dates.push(e.date); } byDate[e.date].push(e); });
        dates.forEach(function (d) {
            var block = '';
            byDate[d].forEach(function (e) {
                var lines = e.lines.filter(function (l) {
                    if (logFilter.tag && l.tag != logFilter.tag) return false;
                    if (q && (e.title + ' ' + l.text + ' ' + l.sub.join(' ')).toLowerCase().indexOf(q) == -1) return false;
                    return true;
                });
                if (!lines.length) return;
                shown += lines.length;
                block += '<div class="chg-log-entry"><h4>' + esc(e.title) + '</h4><ul>' + lines.map(function (l) {
                    return '<li>' + (l.tag ? '<span class="chg-tag chg-tag-' + esc(l.tag.toLowerCase().replace(/\W+/g, '')) + '">' + esc(l.tag) + '</span> ' : '') + linked(l.text) +
                        (l.sub.length ? '<ul>' + l.sub.map(function (x) { return '<li>' + linked(x) + '</li>'; }).join('') + '</ul>' : '') + '</li>';
                }).join('') + '</ul></div>';
            });
            if (block) h += '<div class="chg-log-day"><div class="chg-log-date">' + esc(d) + '</div>' + block + '</div>';
        });
        return h || '<p class="chg-dim">Nothing matches.</p>';
    }
    function logSection() {
        if (!cfg.data.log || !cfg.data.log.length) return '';
        var h = '<h2>Release notes <small>newest first</small></h2><div class="chg-log-bar"><input type="search" class="chg-log-q" placeholder="Search the release notes" />' +
            ' <select class="chg-log-tag"><option value="">Every area</option>' + logTags().map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>';
        return h + '<div class="chg-log">' + logHtml() + '</div>';
    }

    // ── one search over every class change ──
    function searchSection() {
        if (!cfg.data.search || !cfg.data.search.length) return '';
        var classes = {};
        cfg.data.classes.forEach(function (c) { classes[c.id] = c.name; });
        return '<h2>Find a change</h2><div class="chg-find"><input type="search" class="chg-find-q" placeholder="Spell or talent name" />' +
            ' <select class="chg-find-c"><option value="0">Every class</option>' + cfg.data.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select>' +
            ' <select class="chg-find-k"><option value="">New, updated and removed</option>' + KINDS.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('') + '</select>' +
            '<div class="chg-find-r"></div></div>';
    }
    function runSearch() {
        var box = el.querySelector('.chg-find');
        if (!box) return;
        var q = box.querySelector('.chg-find-q').value.trim().toLowerCase(), c = +box.querySelector('.chg-find-c').value, k = box.querySelector('.chg-find-k').value;
        var out = box.querySelector('.chg-find-r');
        if (!q && !c && !k) { out.innerHTML = ''; return; }
        var names = {}; cfg.data.classes.forEach(function (x) { names[x.id] = x.name; });
        var hits = cfg.data.search.filter(function (s) { return (!q || s[0].toLowerCase().indexOf(q) != -1) && (!c || s[1] == c) && (!k || s[2] == k); });
        var kindName = {}; KINDS.forEach(function (x) { kindName[x[0]] = x[1]; });
        out.innerHTML = hits.length ? '<table class="chg-find-t"><tr><th>Change</th><th>Class</th><th>What</th><th></th></tr>' + hits.slice(0, 200).map(function (s) {
            return '<tr><td>' + (s[4] ? '<a href="' + host() + '?spell=' + s[4] + '">' + esc(s[0]) + '</a>' : esc(s[0])) + '</td><td class="c' + s[1] + '">' + esc(names[s[1]]) + '</td>' +
                '<td class="chg-k-' + s[2] + '">' + kindName[s[2]] + ' ' + (s[3] == 'talents' ? 'talent' : 'spell') + '</td>' +
                '<td><a href="' + host() + '?changes=' + s[3] + '.' + slug(s[1]) + '">see it</a></td></tr>';
        }).join('') + '</table>' + (hits.length > 200 ? '<p class="chg-dim">' + (hits.length - 200) + ' more: type more of the name.</p>' : '')
            : '<p class="chg-dim">Nothing matches.</p>';
    }
    function bindOverview() {
        var f = el.querySelector('.chg-find');
        if (f) f.addEventListener('input', runSearch);
        var lq = el.querySelector('.chg-log-q'), lt = el.querySelector('.chg-log-tag');
        function relog() { logFilter.q = lq.value.trim().toLowerCase(); logFilter.tag = lt.value; el.querySelector('.chg-log').innerHTML = logHtml(); }
        if (lq) { lq.addEventListener('input', relog); lt.addEventListener('change', relog); }
    }

    function backLinks(view) {
        var id = cfg['class'];
        var h = '<div class="chg-nav"><a href="' + host() + '?changes">All changes</a> &rsaquo; ' + esc(cfg.data.name) + ': ';
        h += view == 'spellbook' ? '<b>Spellbook</b>' : '<a href="' + host() + '?changes=spellbook.' + slug(id) + '">Spellbook</a>';
        h += ' | ';
        h += view == 'talents' ? '<b>Talents</b>' : '<a href="' + host() + '?changes=talents.' + slug(id) + '">Talents</a>';
        return h + '</div>';
    }

    function overview() {
        var d = cfg.data, h = '';
        h += '<p class="chg-intro">Everything Temucraft does differently from the original Wrath of the Lich King 3.3.5, made from the game files and the server database. Pick a class to see its spells and talents, with the old and new versions side by side, or search below.</p>';
        h += '<div class="chg-jump">Jump to: <a href="#chg-all">For every class</a> &middot; <a href="#chg-classes">Classes</a> &middot; <a href="#chg-find">Find a change</a>' + (d.log && d.log.length ? ' &middot; <a href="#chg-log">Release notes</a>' : '') + '</div>';
        h += '<a id="chg-all"></a>' + notes(d.notes, 'For every class');
        if (d.skills && d.skills.length) {
            h += '<h2>Weapon and armor skills</h2><table class="chg-skills"><tr><th>Skill</th><th>Before</th><th>Now</th></tr>';
            d.skills.forEach(function (s) {
                h += '<tr><td><a href="' + host() + '?skill=' + s.id + '">' + esc(s.name) + '</a> <small>(' + esc(s.kind) + ')</small></td>';
                h += '<td>' + esc(s.old.join(', ') || 'Nobody') + '</td><td class="chg-now">' + esc(s.new.join(', ') || 'Nobody') + '</td></tr>';
            });
            h += '</table>';
        }
        h += '<a id="chg-classes"></a><h2>Classes</h2><div class="chg-classes">';
        d.classes.forEach(function (c) {
            var url = host() + '?changes=';
            h += '<div class="chg-class c' + c.id + '">';
            h += '<div class="chg-class-head">' + icon('class_' + classFile(c.id), 1, host() + '?class=' + c.id) + '<span class="c' + c.id + '">' + esc(c.name) + '</span></div>';
            h += '<a href="' + url + 'spellbook.' + slug(c.id) + '">Spellbook changes</a> <small>' + summary(c.spells) + '</small><br>';
            h += '<a href="' + url + 'talents.' + slug(c.id) + '">Talent changes</a> <small>' + summary(c.talents) + '</small>';
            if (c.notes) h += '<br><small>' + plural(c.notes, 'class note') + '</small>';
            h += '</div>';
        });
        h += '</div>';
        h += '<a id="chg-find"></a>' + searchSection();
        h += '<a id="chg-log"></a>' + logSection();
        return h;
    }

    function summary(o) {
        var p = [];
        KINDS.forEach(function (k) { if (o[k[0]]) p.push(o[k[0]] + ' ' + k[1].toLowerCase()); });
        return p.length ? '(' + p.join(', ') + ')' : '(no changes)';
    }

    function spellbook() {
        var d = cfg.data, h = backLinks('spellbook');
        h += notes(d.notes, d.name + ' changes the game files do not show');
        var any = false;
        KINDS.forEach(function (k) {
            var list = d.spells[k[0]] || [];
            if (!list.length) return;
            any = true;
            h += '<h2>' + k[1] + ' spells <small>(' + list.length + ')</small></h2>';
            list.forEach(function (g) {
                h += '<div class="chg-group"><div class="chg-group-head">' + icon(g.icon, 1, host() + '?spell=' + g.ranks[0].id) + '<b>' + esc(g.name) + '</b>';
                if (g.ranks.length > 1) h += ' <small>' + plural(g.ranks.length, 'rank') + '</small>';
                h += '</div>';
                g.ranks.forEach(function (r) {
                    h += '<div class="chg-rank">';
                    if (r.changed && r.changed.length)
                        h += '<div class="chg-what">Changed: ' + r.changed.map(function (f) { return LABELS[f] || f; }).join(', ') + '</div>';
                    if (r.note) h += '<div class="chg-note">' + esc(r.note) + '</div>';
                    h += '<div class="chg-pair"><div><div class="chg-label">Before</div>' + card(r.old, r.new, r.changed, false) + '</div>';
                    h += '<div><div class="chg-label">Now</div>' + card(r.new, r.old, r.changed, true) + '</div></div>';
                    h += '</div>';
                });
                h += '</div>';
            });
        });
        if (!any) h += '<p>No spell changes for this class.</p>';
        return h;
    }

    function tree(t) {
        var rows = 0, cells = {};
        t.talents.forEach(function (x) { rows = Math.max(rows, x.row); cells[x.row + '.' + x.col] = x; });
        var h = '<div class="chg-tree"><div class="chg-tree-name">' + esc(t.name) + '</div><table>';
        for (var r = 1; r <= Math.max(rows, 11); r++) {
            h += '<tr>';
            for (var c = 1; c <= 4; c++) {
                var x = cells[r + '.' + c];
                if (!x) { h += '<td></td>'; continue; }
                var cls = x['new'] ? ' class="chg-t-new"' : (x.moved ? ' class="chg-t-moved"' : '');
                h += '<td' + cls + ' title="' + esc(x.name) + (x['new'] ? ' (new)' : (x.moved ? ' (moved)' : '')) + '">' + icon(x.icon, 1, host() + '?spell=' + x.spell) + '<span class="chg-t-ranks">' + x.ranks + '</span></td>';
            }
            h += '</tr>';
        }
        return h + '</table></div>';
    }

    function tpos(p, other, changed, isNow) {
        if (!p) return missing(isNow);
        var c = changed || [];
        function mark(f, text) { return c.indexOf(f) != -1 ? '<span class="chg-mark">' + esc(text) + '</span>' : esc(text); }
        var h = '<div class="chg-card"><table class="chg-head"><tr><td><a href="' + host() + '?spell=' + p.ranks[0] + '"><b>' + esc(p.name) + '</b></a></td>';
        h += '<td class="chg-r">' + mark('ranks', plural(p.ranks.length, 'rank')) + '</td></tr>';
        h += '<tr><td>' + mark('tree', p.tree) + '</td><td class="chg-r">' + mark('row', 'Row ' + p.row) + ', ' + mark('col', 'column ' + p.col) + '</td></tr></table>';
        if (p.req) h += '<div class="chg-req">Requires ' + mark('req', p.req) + '</div>';
        (p.desc || []).forEach(function (t, i) {
            if (i == 1 && t == p.desc[0]) return;
            var text = esc(t);
            if (other && c.indexOf('desc') != -1 && other.desc && other.desc[i] != null) text = isNow ? marked(other.desc[i], t, true) : marked(t, other.desc[i], false);
            h += '<div class="chg-desc">' + (p.desc.length > 1 && p.desc[1] != p.desc[0] ? '<span class="chg-rk">' + (i ? 'Rank ' + p.ranks.length : 'Rank 1') + ':</span> ' : '') + text + '</div>';
        });
        return h + '</div>';
    }

    function talents() {
        var d = cfg.data, h = backLinks('talents');
        h += notes(d.notes, d.name + ' changes the game files do not show');
        if (d.trees && d.trees.length) {
            h += '<h2>Talent trees</h2><p class="chg-legend"><span class="chg-t-new">New talent</span> <span class="chg-t-moved">Moved talent</span> The number is how many ranks it has.</p>';
            h += '<div class="chg-trees">' + d.trees.map(tree).join('') + '</div>';
        }
        var any = false;
        KINDS.forEach(function (k) {
            var list = d.talents[k[0]] || [];
            if (!list.length) return;
            any = true;
            h += '<h2>' + k[1] + ' talents <small>(' + list.length + ')</small></h2>';
            list.forEach(function (t) {
                h += '<div class="chg-group"><div class="chg-group-head">' + icon(t.icon, 1, host() + '?spell=' + (t.new || t.old).ranks[0]) + '<b>' + esc(t.name) + '</b> <small>' + esc(t.tree) + '</small></div>';
                if (t.changed && t.changed.length)
                    h += '<div class="chg-what">Changed: ' + t.changed.map(function (f) { return LABELS[f] || f; }).join(', ') + '</div>';
                h += '<div class="chg-pair"><div><div class="chg-label">Before</div>' + tpos(t.old, t.new, t.changed, false) + '</div>';
                h += '<div><div class="chg-label">Now</div>' + tpos(t.new, t.old, t.changed, true) + '</div></div></div>';
            });
        });
        if (!any) h += '<p>No talent changes for this class.</p>';
        return h;
    }

    return {
        init: function (node, config) {
            el = node; cfg = config;
            var h;
            if (cfg.view == 'missing')
                h = '<p>The change list has not been made yet. Run <code>setup/tools/temucraft-changes.py</code> (see the README).</p>';
            else if (cfg.view == 'spellbook')
                h = spellbook();
            else if (cfg.view == 'talents')
                h = talents();
            else
                h = overview();
            if (cfg.generated) h += '<p class="chg-gen">Made ' + esc(cfg.generated) + '.</p>';
            el.innerHTML = h;
            if (cfg.view == 'overview') bindOverview();
        }
    };
})();
