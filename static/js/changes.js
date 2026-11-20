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

    function notes(list, title) {
        if (!list || !list.length) return '';
        return '<h2>' + esc(title) + '</h2><ul class="chg-notes">' + list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
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
        h += '<p class="chg-intro">Everything Temucraft does differently from the original Wrath of the Lich King 3.3.5, made from the game files and the server database. Pick a class to see its spells and talents, with the old and new versions side by side.</p>';
        h += notes(d.notes, 'For every class');
        if (d.skills && d.skills.length) {
            h += '<h2>Weapon and armor skills</h2><table class="chg-skills"><tr><th>Skill</th><th>Before</th><th>Now</th></tr>';
            d.skills.forEach(function (s) {
                h += '<tr><td><a href="' + host() + '?skill=' + s.id + '">' + esc(s.name) + '</a> <small>(' + esc(s.kind) + ')</small></td>';
                h += '<td>' + esc(s.old.join(', ') || 'Nobody') + '</td><td class="chg-now">' + esc(s.new.join(', ') || 'Nobody') + '</td></tr>';
            });
            h += '</table>';
        }
        h += '<h2>Classes</h2><div class="chg-classes">';
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
        }
    };
})();
