/*
 * Temucraft realm status (?realm-status) and live player map (?player-map)
 *
 * ?realm-status=data : {generated, cacheSeconds, realms: [{id, name, online, players, alliance, horde, peak, peakTime,
 *                       startedAt, uptime, classes{id: n}, races{id: n}, levels[9]}], names{classes, races}, mapEnabled, mapUrl}
 * ?player-map=data   : {generated, realms: [{id, name}], players: [{realm, name, level, race, class, gender, side, zone,
 *                       guild?, x?, y?}], zones{id: name}}  x/y: % of the zone map, only in the open world
 * Zone map coords go onto the continent maps through each zone's rect on its continent (g_zone_shapes, ?data=zone-shapes),
 * the same data the maps page uses for .go zonexy.
 */
var AoRealm = (function () {
    var CLASS_COLORS = { 1: '#c79c6e', 2: '#f58cba', 3: '#abd473', 4: '#fff569', 5: '#ffffff', 6: '#c41f3b', 7: '#0070de', 8: '#69ccf0', 9: '#9482c9', 11: '#ff7d0a' };
    var SIDES = { 1: ['Alliance', 'rs-a'], 2: ['Horde', 'rs-h'] };

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function host(cfg) { return (cfg.host || '').replace(/\/?$/, '/'); }
    function duration(s) {
        s = Math.max(0, Math.floor(s));
        var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
        if (d) return d + 'd ' + h + 'h';
        if (h) return h + 'h ' + m + 'm';
        return m + 'm';
    }
    function date(ts) {
        if (!ts) return '';
        var d = new Date(ts * 1000);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function getJSON(url) {
        return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    }

    // 0 player, 1 random bot, 2 a player's own bot (see RealmStatus::kinds)
    var KINDS = { 0: ['Player', 'rs-k0'], 1: ['Random bot', 'rs-k1'], 2: ['Own bot', 'rs-k2'] };

    function iconUrl(name) { return g_staticUrl + '/images/wow/icons/small/' + name + '.jpg'; }
    // race icon by gender (0 male, 1 female); a missing female icon falls back to the male one
    function raceIcon(race, gender, title) {
        var file = typeof g_file_races != 'undefined' ? g_file_races[race] : null;
        if (!file) return '<img class="rs-ico" src="' + iconUrl('inv_misc_questionmark') + '" alt="" />';
        var male = iconUrl('race_' + file + '_male'), want = gender == 1 ? iconUrl('race_' + file + '_female') : male;
        return '<img class="rs-ico" src="' + want + '" alt="" title="' + esc(title || '') + '"' +
            (want != male ? ' onerror="this.onerror=null;this.src=\'' + male + '\'"' : '') + ' />';
    }
    function classIcon(cls, title) {
        var file = typeof g_file_classes != 'undefined' ? g_file_classes[cls] : null;
        return '<img class="rs-ico" src="' + iconUrl(file ? 'class_' + file : 'inv_misc_questionmark') + '" alt="" title="' + esc(title || '') + '" />';
    }
    function kindTag(k) {
        k = k || 0;
        return k ? '<span class="rs-kind ' + KINDS[k][1] + '">' + KINDS[k][0] + '</span>' : '';
    }

    return { CLASS_COLORS: CLASS_COLORS, SIDES: SIDES, KINDS: KINDS, esc: esc, host: host, duration: duration, date: date, getJSON: getJSON,
             raceIcon: raceIcon, classIcon: classIcon, kindTag: kindTag };
})();

var AoRealmStatus = (function () {
    var el, cfg, timer, last = null, view = {};          // view: realm id => 'all' | 'players' | 'rndbots' | 'ownbots'
    var R = AoRealm, esc = AoRealm.esc;
    var LEVELS = ['1-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80'];
    var VIEWS = [['players', 'Players'], ['ownbots', 'Their bots'], ['rndbots', 'Random bots'], ['all', 'Everyone']];

    // label: icon + name for classes and races
    function bars(counts, label, colors) {
        var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }), max = 0, h = '';
        ids.forEach(function (i) { max = Math.max(max, counts[i]); });
        if (!ids.length) return '<p class="rs-dim">Nobody online.</p>';
        ids.forEach(function (i) {
            h += '<div class="rs-bar"><span class="rs-bar-l">' + label(i) + '</span>' +
                '<span class="rs-bar-t"><i style="width:' + (counts[i] * 100 / max).toFixed(1) + '%' + (colors && colors[i] ? ';background:' + colors[i] : '') + '"></i></span>' +
                '<span class="rs-bar-n">' + counts[i] + '</span></div>';
        });
        return h;
    }

    function levels(l) {
        var max = Math.max.apply(null, l.concat([1])), h = '<div class="rs-levels">';
        l.forEach(function (n, i) {
            h += '<div class="rs-lv" title="' + LEVELS[i] + ': ' + n + '"><span class="rs-lv-n">' + (n || '') + '</span>' +
                '<i style="height:' + (n * 100 / max).toFixed(1) + '%"></i><span class="rs-lv-l">' + LEVELS[i] + '</span></div>';
        });
        return h + '</div>';
    }

    function pick(r) {
        var v = view[r.id];
        if (!r.kinds) return ['all', r];                    // older data without kinds
        if (!v) v = r.real ? 'players' : 'all';
        return [v, v == 'all' ? { n: r.players, alliance: r.alliance, horde: r.horde, classes: r.classes, races: r.races, levels: r.levels } : r.kinds[v]];
    }

    function realm(r, names) {
        var h = '<div class="rs-realm' + (r.online ? '' : ' rs-off') + '">' +
            '<div class="rs-head"><span class="rs-dot"></span><b>' + esc(r.name) + '</b><span class="rs-state">' + (r.online ? 'Online' : 'Offline') + '</span></div>' +
            '<div class="rs-tiles">';
        if (r.kinds)
            h += '<div class="rs-tile"><span>Players</span><b>' + (r.online ? r.real : '-') + '</b></div>' +
                 '<div class="rs-tile"><span>Their bots</span><b class="rs-k2">' + (r.online ? r.ownbots : '-') + '</b><small>alts players brought along</small></div>' +
                 '<div class="rs-tile"><span>Random bots</span><b class="rs-k1">' + (r.online ? r.rndbots : '-') + '</b></div>';
        else
            h += '<div class="rs-tile"><span>Online</span><b>' + (r.online ? r.players : '-') + '</b></div>';
        h += '<div class="rs-tile"><span>All-time peak</span><b>' + r.peak + '</b><small>' + R.date(r.peakTime) + '</small></div>' +
            '<div class="rs-tile"><span>Uptime</span><b>' + (r.online && r.uptime ? R.duration(r.uptime) : '-') + '</b><small>' + (r.startedAt ? 'since ' + R.date(r.startedAt) : '') + '</small></div>' +
            '</div>';
        if (!r.online) return h + '<p class="rs-dim">The world server does not answer right now.</p></div>';

        var p = pick(r), v = p[0], b = p[1], total = b.alliance + b.horde, aPct = total ? b.alliance * 100 / total : 50;
        if (r.kinds) {
            h += '<div class="rs-views">Show:';
            VIEWS.forEach(function (w) {
                var n = w[0] == 'all' ? r.players : r.kinds[w[0]].n;
                h += '<a href="javascript:;" data-realm="' + r.id + '" data-view="' + w[0] + '"' + (v == w[0] ? ' class="on"' : '') + '>' + w[1] + ' <small>' + n + '</small></a>';
            });
            h += '</div>';
        }
        h += '<div class="rs-faction"><span class="rs-a" style="width:' + aPct.toFixed(1) + '%">Alliance ' + b.alliance + '</span>' +
            '<span class="rs-h" style="width:' + (100 - aPct).toFixed(1) + '%">Horde ' + b.horde + '</span></div>';
        h += '<div class="rs-cols"><div class="rs-col"><h3>Classes</h3>' + bars(b.classes, function (i) { return R.classIcon(i, names.classes[i]) + esc(names.classes[i] || ('#' + i)); }, R.CLASS_COLORS) + '</div>' +
            '<div class="rs-col"><h3>Races</h3>' + bars(b.races, function (i) { return R.raceIcon(i, 0, names.races[i]) + esc(names.races[i] || (typeof g_chr_races != 'undefined' && g_chr_races[i]) || ('#' + i)); }) + '</div>' +
            '<div class="rs-col"><h3>Levels</h3>' + levels(b.levels) + '</div></div>';
        return h + '</div>';
    }

    function render(d) {
        last = d;
        var h = '';
        if (!d.realms || !d.realms.length) h = '<p class="rs-dim">No realm to show.</p>';
        (d.realms || []).forEach(function (r) { h += realm(r, d.names || { classes: {}, races: {} }); });
        h += '<p class="rs-foot rs-dim">Updated every ' + (d.cacheSeconds || 30) + ' seconds. Random bots are the server\'s own bot accounts; ' +
            '"their bots" are players\' own characters they run as bots. ' +
            (d.mapEnabled ? '<a href="' + R.host(cfg) + '?player-map">See who is where on the player map</a>. ' : '') +
            'JSON: <a href="' + R.host(cfg) + '?realm-status=data">?realm-status=data</a></p>';
        el.innerHTML = h;
    }

    function load() {
        return R.getJSON(R.host(cfg) + '?realm-status=data').then(render).catch(function () {
            el.innerHTML = '<p class="rs-dim">Could not load the realm status.</p>';
        });
    }

    return {
        init: function (node, config) {
            el = node; cfg = config || {};
            el.innerHTML = '<p class="rs-dim">Loading...</p>';
            el.addEventListener('click', function (e) {
                var a = e.target.closest('[data-view]');
                if (!a || !last) return;
                view[a.getAttribute('data-realm')] = a.getAttribute('data-view');
                render(last);
            });
            load();
            timer = setInterval(load, 30000);
        }
    };
})();

var AoPlayerMap = (function () {
    // one map view: "All" shows the four continents side by side, or pick one continent or zone from the list.
    // tab: 0 = all continents, -3/-6/-2/-5 = a continent map, > 0 = the zone map of one of our extra zones
    var el, cfg, data = null, tab = 0, timer;
    var R = AoRealm, esc = AoRealm.esc;
    var CONTINENTS = [[-3, 'Eastern Kingdoms'], [-6, 'Kalimdor'], [-2, 'Outland'], [-5, 'Northrend']];
    var filter = { a: true, h: true, min: 1, max: 80, realm: 0, q: '', k0: true, k2: true, k1: true };

    function continentOf(zone) {
        if (typeof g_zone_shapes == 'undefined') return null;
        for (var i = 0; i < CONTINENTS.length; i++) {
            var c = g_zone_shapes[CONTINENTS[i][0]];
            if (c && c[zone] && c[zone].r) return CONTINENTS[i][0];
        }
        return null;
    }

    // where a player goes: [mapId, x%, y%] or null (no position: dungeon, raid, battleground, ..)
    function place(p) {
        if (p.x == null) return null;
        var c = continentOf(p.zone);
        if (c === null) return [p.zone, p.x, p.y];          // our extra zones: on their own zone map
        var r = g_zone_shapes[c][p.zone].r;
        return [c, r[0] + p.x / 100 * (r[2] - r[0]), r[1] + p.y / 100 * (r[3] - r[1])];
    }

    function visible(p) {
        if (p.side == 1 && !filter.a) return false;
        if (p.side == 2 && !filter.h) return false;
        if (!filter['k' + (p.kind || 0)]) return false;
        if (p.level < filter.min || p.level > filter.max) return false;
        if (filter.realm && p.realm != filter.realm) return false;
        if (filter.q && p.name.toLowerCase().indexOf(filter.q) == -1 && (!p.guild || p.guild.toLowerCase().indexOf(filter.q) == -1)) return false;
        return true;
    }

    function names() { return cfg.names || { classes: {}, races: {} }; }
    function zoneName(z) { return (data && data.zones && data.zones[z]) || ('Zone ' + z); }
    function locale() { return (typeof Locale != 'undefined' && Locale.getName) ? Locale.getName() : 'enus'; }
    function tabName(t) {
        for (var i = 0; i < CONTINENTS.length; i++) if (CONTINENTS[i][0] == t) return CONTINENTS[i][1];
        return zoneName(t);
    }

    function card(p) {
        var n = names();
        return '<div class="pm-card-h">' + R.raceIcon(p.race, p.gender, n.races[p.race]) + R.classIcon(p['class'], n.classes[p['class']]) +
            '<b class="pm-c' + p['class'] + '">' + esc(p.name) + '</b>' + R.kindTag(p.kind) + '</div>' +
            (p.guild ? '<span class="pm-guild">&lt;' + esc(p.guild) + '&gt;</span><br>' : '') +
            'Level ' + p.level + ' ' + esc(n.races[p.race] || '') + ' ' + esc(n.classes[p['class']] || '') +
            '<br><span class="rs-dim">' + esc(zoneName(p.zone)) + '</span>';
    }

    function dots(list, mapId) {
        var h = '';
        list.forEach(function (p) {
            if (p._at && p._at[0] == mapId)
                h += '<span class="pm-dot pm-s' + p.side + ' pm-k' + (p.kind || 0) + '" data-i="' + p._i + '" style="left:' + p._at[1].toFixed(2) + '%;top:' + p._at[2].toFixed(2) + '%"></span>';
        });
        return h;
    }

    function mapBox(mapId, cls, label) {
        return '<div class="pm-map ' + (cls || '') + '" data-map="' + mapId + '" style="background-image:url(' + g_staticUrl + '/images/wow/maps/' + locale() + '/original/' + mapId + '.jpg)">' +
            (label || '') + '%DOTS%<div class="pm-tip"></div></div>';
    }

    function render() {
        if (!data) return;
        data.players.forEach(function (p, i) { p._i = i; p._at = place(p); });
        var shown = data.players.filter(visible), perMap = {}, kinds = [0, 0, 0];
        data.players.forEach(function (p) { kinds[p.kind || 0]++; });
        shown.forEach(function (p) { if (p._at) perMap[p._at[0]] = (perMap[p._at[0]] || 0) + 1; });

        // where: all continents, one continent, or a zone with players
        var h = '<div class="pm-top"><label>Map <select data-f="tab"><option value="0"' + (tab == 0 ? ' selected' : '') + '>All continents (' + shown.filter(function (p) { return p._at && p._at[0] < 0; }).length + ')</option>';
        CONTINENTS.forEach(function (c) { h += '<option value="' + c[0] + '"' + (tab == c[0] ? ' selected' : '') + '>' + c[1] + ' (' + (perMap[c[0]] || 0) + ')</option>'; });
        var extra = Object.keys(perMap).filter(function (z) { return z > 0; });
        if (tab > 0 && extra.indexOf(String(tab)) == -1) extra.push(String(tab));
        if (extra.length) {
            h += '<optgroup label="Other zones">';
            extra.sort(function (a, b) { return zoneName(a).localeCompare(zoneName(b)); }).forEach(function (z) {
                h += '<option value="' + z + '"' + (tab == z ? ' selected' : '') + '>' + esc(zoneName(z)) + ' (' + (perMap[z] || 0) + ')</option>';
            });
            h += '</optgroup>';
        }
        h += '</select></label>';
        if (tab != 0) h += '<a href="javascript:;" data-tab="0" class="tc-nav-btn">Back to all continents</a>';
        h += '</div>';

        h += '<div class="pm-filters">' +
            '<label class="rs-a-t"><input type="checkbox" data-f="a"' + (filter.a ? ' checked' : '') + '> Alliance</label>' +
            '<label class="rs-h-t"><input type="checkbox" data-f="h"' + (filter.h ? ' checked' : '') + '> Horde</label>' +
            '<span class="pm-sep"></span>' +
            '<label><input type="checkbox" data-f="k0"' + (filter.k0 ? ' checked' : '') + '><span class="pm-key pm-k0"></span> Players ' + kinds[0] + '</label>' +
            '<label class="rs-k2"><input type="checkbox" data-f="k2"' + (filter.k2 ? ' checked' : '') + '><span class="pm-key pm-k2"></span> Their bots ' + kinds[2] + '</label>' +
            '<label class="rs-k1"><input type="checkbox" data-f="k1"' + (filter.k1 ? ' checked' : '') + '><span class="pm-key pm-k1"></span> Random bots ' + kinds[1] + '</label>' +
            '<span class="pm-sep"></span>' +
            '<label>Level <input type="number" min="1" max="80" data-f="min" value="' + filter.min + '"> to <input type="number" min="1" max="80" data-f="max" value="' + filter.max + '"></label>';
        if (data.realms.length > 1) {
            h += '<label>Realm <select data-f="realm"><option value="0">All</option>';
            data.realms.forEach(function (r) { h += '<option value="' + r.id + '"' + (filter.realm == r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; });
            h += '</select></label>';
        }
        h += '<label><input type="search" placeholder="Name or guild" data-f="q" value="' + esc(filter.q) + '"></label>' +
            '<span class="rs-dim">' + shown.length + ' of ' + data.players.length + ' shown</span></div>';

        if (tab == 0) {
            h += '<div class="pm-grid">';
            CONTINENTS.forEach(function (c) {
                h += mapBox(c[0], 'pm-mini', '<a href="javascript:;" class="pm-label" data-tab="' + c[0] + '">' + c[1] + ' <small>' + (perMap[c[0]] || 0) + '</small></a>').replace('%DOTS%', dots(shown, c[0]));
            });
            h += '</div>';
        }
        else
            h += mapBox(tab, '', '<span class="pm-label">' + esc(tabName(tab)) + '</span>').replace('%DOTS%', dots(shown, tab));

        h += '<p class="rs-dim pm-note">Updates every ' + (data.cacheSeconds || 30) + ' seconds. Dots: blue Alliance, red Horde; a ring is a player\'s own bot, a small faded dot a random bot. ' +
             'Characters in dungeons, raids and battlegrounds are listed below but not drawn.</p>';

        // the list (on a single map: only who is on that map or has no position)
        var n = names(), list = tab == 0 ? shown : shown.filter(function (p) { return !p._at || p._at[0] == tab; });
        h += '<table class="pm-list"><tr><th>Name</th><th>Level</th><th>Race</th><th>Class</th><th>Zone</th></tr>';
        list.slice(0, 500).forEach(function (p) {
            h += '<tr class="pm-row-k' + (p.kind || 0) + '"><td><span class="pm-c' + p['class'] + '">' + esc(p.name) + '</span>' + R.kindTag(p.kind) + (p.guild ? ' <span class="pm-guild">&lt;' + esc(p.guild) + '&gt;</span>' : '') + '</td><td>' + p.level + '</td>' +
                '<td class="' + (R.SIDES[p.side] ? R.SIDES[p.side][1] + '-t' : '') + '">' + R.raceIcon(p.race, p.gender, n.races[p.race]) + esc(n.races[p.race] || '') + '</td>' +
                '<td>' + R.classIcon(p['class'], n.classes[p['class']]) + esc(n.classes[p['class']] || '') + '</td>' +
                '<td>' + esc(zoneName(p.zone)) + (p._at ? '' : ' <span class="rs-dim">(not on the map)</span>') + '</td></tr>';
        });
        if (list.length > 500) h += '<tr><td colspan="5" class="rs-dim">and ' + (list.length - 500) + ' more: narrow it down with the filters.</td></tr>';
        if (!list.length) h += '<tr><td colspan="5" class="rs-dim">Nobody to show.</td></tr>';
        h += '</table>';

        h += ownPanel();

        var focus = document.activeElement && document.activeElement.getAttribute('data-f');
        el.innerHTML = h;
        if (focus) {
            var f = el.querySelector('[data-f="' + focus + '"]');
            if (f) { f.focus(); if (f.type == 'search') f.setSelectionRange(f.value.length, f.value.length); }
        }
    }

    function ownPanel() {
        if (!cfg.own || !cfg.own.length) {
            return '<p class="rs-dim pm-note">Don\'t want to be on the map? ' + (cfg.loggedIn ? 'Link your game account on the <a href="' + R.host(cfg) + '?quest-tracker">quest tracker</a>, then' : 'Sign in, link your game account, then') + ' hide your characters here.</p>';
        }
        var h = '<div class="pm-own"><h3>Your characters</h3><p class="rs-dim">Ticked characters are not shown on the map or in the list (they still count in the realm totals).</p>';
        cfg.own.forEach(function (c, i) {
            h += '<label><input type="checkbox" data-own="' + i + '"' + (c.hidden ? ' checked' : '') + '> Hide ' + esc(c.name) + ' <span class="rs-dim">(' + c.level + ', ' + esc(c.realmName) + ')</span></label>';
        });
        return h + '<span class="pm-msg"></span></div>';
    }

    function load() {
        return R.getJSON(R.host(cfg) + '?player-map=data').then(function (d) {
            if (d.disabled) { el.innerHTML = '<p class="rs-dim">The player map is turned off.</p>'; clearInterval(timer); return; }
            data = d; render();
        }).catch(function () { if (!data) el.innerHTML = '<p class="rs-dim">Could not load the player map.</p>'; });
    }

    function setTab(t) {
        tab = t;
        try { history.replaceState(null, '', t ? '#' + t : location.pathname + location.search); } catch (e) {}
        render();
    }

    function events() {
        el.addEventListener('click', function (e) {
            var t = e.target.closest('[data-tab]');
            if (t) { setTab(parseInt(t.getAttribute('data-tab'))); return; }
            var m = e.target.closest('.pm-mini');               // a click on a small continent opens it
            if (m && !e.target.closest('.pm-dot')) setTab(parseInt(m.getAttribute('data-map')));
        });
        el.addEventListener('input', function (e) {
            var f = e.target.getAttribute('data-f');
            if (!f) return;
            if (f == 'tab') { setTab(parseInt(e.target.value) || 0); return; }
            if (f == 'a' || f == 'h' || f.charAt(0) == 'k') filter[f] = e.target.checked;
            else if (f == 'q') filter.q = e.target.value.toLowerCase().trim();
            else filter[f] = parseInt(e.target.value) || (f == 'max' ? 80 : f == 'min' ? 1 : 0);
            render();
        });
        el.addEventListener('change', function (e) {
            var i = e.target.getAttribute('data-own');
            if (i === null) return;
            var c = cfg.own[i], body = new URLSearchParams();
            body.append('realm', c.realm); body.append('guid', c.guid); body.append('hide', e.target.checked ? 1 : 0);
            fetch(R.host(cfg) + '?player-map=hide', { method: 'POST', body: body, credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (res) {
                if (res.error) { e.target.checked = !e.target.checked; el.querySelector('.pm-msg').textContent = res.error; return; }
                c.hidden = e.target.checked; load();
            });
        });
        el.addEventListener('mouseover', function (e) {
            var d = e.target.closest('.pm-dot'), box = e.target.closest('.pm-map');
            el.querySelectorAll('.pm-tip').forEach(function (t) { if (!d || !box || t.parentNode != box) t.style.display = 'none'; });
            if (!d || !box) return;
            var tipEl = box.querySelector('.pm-tip'), p = data.players[d.getAttribute('data-i')];
            tipEl.innerHTML = card(p);
            tipEl.style.display = 'block';
            tipEl.style.left = d.style.left; tipEl.style.top = d.style.top;
            tipEl.classList.toggle('pm-left', parseFloat(d.style.left) > 65);
            tipEl.classList.toggle('pm-up', parseFloat(d.style.top) > 70);
        });
    }

    return {
        init: function (node, config) {
            el = node; cfg = config || {};
            if (!cfg.enabled) { el.innerHTML = '<p class="rs-dim">The player map is turned off on this site.</p>'; return; }
            var h = (location.hash || '').replace('#', '');
            if (h && !isNaN(parseInt(h))) tab = parseInt(h);
            el.innerHTML = '<p class="rs-dim">Loading...</p>';
            events();
            load();
            timer = setInterval(load, 30000);
        }
    };
})();
