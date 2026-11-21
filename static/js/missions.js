/*
 * Temucraft mission table guide (?missions)
 *
 * Tabs: Followers, Missions, Threats, Traits, Calculator. Data from ?missions=data (see pages/missions.php).
 * The calculator uses AoMissionChance (missionchance.js), the same formula as the server.
 */
var AoMissions = (function () {
    var el, cfg, data, tab = 'followers', filter = '', sort = {}, calc = { mission: 0, units: [] };
    var ROLES = [[1, 'Tank'], [2, 'Healer'], [4, 'Damage']];
    var ACTIVITY = [[1, 'Missions'], [2, 'Dungeons'], [4, 'Expeditions'], [8, 'Raids'], [16, 'Follower dungeons'], [32, 'World quests']];
    var QCOLOR = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function bits(mask, list) { return list.filter(function (r) { return mask & r[0]; }).map(function (r) { return r[1]; }).join(', ') || '-'; }
    function time(s) {
        var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
        return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
    }
    function gold(c) { return c ? (c / 10000).toFixed(c % 10000 ? 2 : 0) + 'g' : 'free'; }
    function N() { return data.names; }
    function traitName(id) { var t = N().traits[id]; return t ? t[0] : '#' + id; }
    function tags(ids, list, hit) {
        return ids.map(function (i) { return '<span class="ms-tag' + (hit && hit.indexOf(i) != -1 ? ' hit' : '') + '">' + esc(list(i)) + '</span>'; }).join('');
    }
    function item(id, count) {
        var it = data.items[id];
        if (!id) return '';
        var icon = it && it[2] ? '<img class="ms-icon" src="' + cfg.staticUrl + '/images/wow/icons/small/' + esc(it[2].toLowerCase()) + '.jpg">' : '';
        return '<a href="?item=' + id + '" class="q' + (it ? it[1] : 1) + '">' + icon + esc(it ? it[0] : 'Item #' + id) + '</a>' + (count > 1 ? ' x' + count : '');
    }
    function cooldown(s) { return !s ? '' : s >= 2147483647 ? 'once only' : 'again after ' + time(s); }
    function match(text) { return !filter || String(text).toLowerCase().indexOf(filter) != -1; }
    function sorted(list, key, keys) {
        var k = sort[key];
        if (!k) return list;
        return list.slice().sort(function (a, b) {
            var x = keys[k.col](a), y = keys[k.col](b);
            return (x < y ? -1 : x > y ? 1 : 0) * k.dir;
        });
    }
    function head(key, cols) {
        return '<tr>' + cols.map(function (c, i) {
            var on = sort[key] && sort[key].col == i;
            return '<th data-sort="' + key + ':' + i + '">' + c + (on ? (sort[key].dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
        }).join('') + '</tr>';
    }

    /* ---------- tabs ---------- */

    function followers() {
        var keys = [function (f) { return f.name; }, function (f) { return f.quality; }, function (f) { return f.roles; }, function (f) { return f.race; }];
        var list = sorted(data.followers, 'f', keys).filter(function (f) {
            return match(f.name + ' ' + f.how + ' ' + f.abilities.map(function (a) { return N().threats[a]; }).join(' ') + ' ' + f.traits.map(traitName).join(' '));
        });
        var h = '<table class="ms-table">' + head('f', ['Follower', 'Quality', 'Roles', 'Race', 'Counters', 'Traits', 'How to get', 'Can do']);
        list.forEach(function (f) {
            h += '<tr><td>' + (f.creature ? '<a href="?npc=' + f.creature + '" style="color:' + QCOLOR[f.quality] + '">' + esc(f.name) + '</a>' : '<b style="color:' + QCOLOR[f.quality] + '">' + esc(f.name) + '</b>') +
                '</td><td>' + esc(N().quality[f.quality] || '') + '</td><td>' + bits(f.roles, ROLES) + '</td><td>' + esc(N().races[f.race] || '-') +
                '</td><td>' + tags(f.abilities, function (a) { return N().threats[a]; }) + '</td><td>' + tags(f.traits, traitName) +
                '</td><td>' + esc(f.how) + '</td><td class="ms-dim">' + bits(f.mask, ACTIVITY) + '</td></tr>';
        });
        if (!list.length) h += '<tr><td colspan="8" class="ms-dim">No followers found.</td></tr>';
        return h + '</table>';
    }

    function missions() {
        var keys = [function (m) { return m.name; }, function (m) { return m.level; }, function (m) { return m.type; }, function (m) { return m.duration; }, function (m) { return m.slots; }];
        var list = sorted(data.missions, 'm', keys).filter(function (m) {
            return match(m.name + ' ' + m.location + ' ' + N().types[m.type] + ' ' + m.threats.map(function (t) { return N().threats[t]; }).join(' '));
        });
        var h = '<table class="ms-table">' + head('m', ['Mission', 'Level', 'Type', 'Time', 'Followers', 'Threats', 'Where', 'Rewards', '']);
        list.forEach(function (m) {
            var where = [m.location, N().envs[m.env], m.enemy ? N().enemies[m.enemy] + ' enemies' : ''].filter(Boolean).join(' · ');
            var rew = [m.gold ? gold(m.gold) : '', m.xp ? m.xp + ' xp' : '', item(m.item, m.itemCount), m.bonus ? 'bonus: ' + item(m.bonus, m.bonusCount) : ''].filter(Boolean).join('<br>');
            h += '<tr><td><b>' + esc(m.name) + '</b>' + (m.requiredTrait ? '<br><span class="ms-dim">needs ' + esc(traitName(m.requiredTrait)) + '</span>' : '') +
                (m.cooldown ? '<br><span class="ms-dim">' + cooldown(m.cooldown) + '</span>' : '') +
                '</td><td>' + m.level + (m.ilvl ? '<br><span class="ms-dim">ilvl ' + m.ilvl + '</span>' : '') + '</td><td>' + esc(N().types[m.type] || '') +
                '</td><td>' + time(m.duration) + '<br><span class="ms-dim">' + gold(m.cost) + '</span></td><td>' + m.slots +
                '</td><td>' + tags(m.threats, function (t) { return N().threats[t]; }) + '</td><td>' + esc(where) + '</td><td>' + rew +
                '</td><td><a href="javascript:;" data-calc="' + m.id + '">Try it</a></td></tr>';
        });
        if (!list.length) h += '<tr><td colspan="9" class="ms-dim">No missions found.</td></tr>';
        return h + '</table>';
    }

    function threats() {
        var h = '<p>Each mission lists enemy threats. A follower with the matching ability counters one threat of that kind, ' +
            'which raises the success chance. Followers far below the mission level counter less.</p><table class="ms-table"><tr><th>Threat</th><th>Followers who counter it</th><th>Missions with it</th></tr>';
        N().threats.forEach(function (name, id) {
            if (!id) return;
            var who = data.followers.filter(function (f) { return f.abilities.indexOf(id) != -1; });
            var on = data.missions.filter(function (m) { return m.threats.indexOf(id) != -1; }).length;
            h += '<tr><td><b>' + esc(name) + '</b></td><td>' + (who.map(function (f) { return '<span style="color:' + QCOLOR[f.quality] + '">' + esc(f.name) + '</span>'; }).join(', ') || '<span class="ms-dim">none yet</span>') +
                '</td><td>' + on + '</td></tr>';
        });
        return h + '</table>';
    }

    function traits() {
        var h = '<table class="ms-table"><tr><th>Trait</th><th>What it does</th><th>Followers</th></tr>';
        Object.keys(N().traits).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
            var t = N().traits[id];
            if (!match(t[0])) return;
            var who = data.followers.filter(function (f) { return f.traits.indexOf(id) != -1; });
            h += '<tr><td><b>' + esc(t[0]) + '</b></td><td>' + esc(AoMissionChance.traitText(t, N())) + '</td><td>' +
                (who.map(function (f) { return esc(f.name); }).join(', ') || '<span class="ms-dim">-</span>') + '</td></tr>';
        });
        return h + '</table>';
    }

    /* ---------- calculator ---------- */

    function mission() { for (var i = 0; i < data.missions.length; i++) if (data.missions[i].id == calc.mission) return data.missions[i]; return data.missions[0]; }
    function tpl(id) { for (var i = 0; i < data.followers.length; i++) if (data.followers[i].id == id) return data.followers[i]; return null; }
    function fitUnits(m) {
        while (calc.units.length < m.slots) calc.units.push({ tpl: 0, level: m.level, ilvl: m.ilvl });
        calc.units.length = m.slots;
    }

    function calculator() {
        if (!data.missions.length) return '<p class="ms-dim">No missions on this server yet.</p>';
        var m = mission();
        calc.mission = m.id;
        fitUnits(m);
        var h = '<div class="ms-cols"><div class="ms-col"><p><select data-c="mission">';
        data.missions.forEach(function (x) { h += '<option value="' + x.id + '"' + (x.id == m.id ? ' selected' : '') + '>' + esc(x.name) + ' (level ' + x.level + ')</option>'; });
        h += '</select></p><p>' + esc(N().types[m.type]) + ' · ' + time(m.duration) + ' · base chance ' + m.base + '%' + (m.ilvl ? ' · item level ' + m.ilvl : '') +
            '<br>Threats: ' + (tags(m.threats, function (t) { return N().threats[t]; }) || 'none') +
            (m.env ? '<br>Where: ' + esc(N().envs[m.env]) : '') + (m.enemy ? '<br>Enemies: ' + esc(N().enemies[m.enemy]) : '') +
            (m.requiredTrait ? '<br>Needs: ' + esc(traitName(m.requiredTrait)) : '') + '</p>';
        calc.units.forEach(function (u, i) {
            var t = tpl(u.tpl);
            h += '<div class="ms-unit"><select data-u="' + i + '" data-k="tpl"><option value="0">- pick a follower -</option>';
            data.followers.forEach(function (f) { h += '<option value="' + f.id + '"' + (f.id == u.tpl ? ' selected' : '') + '>' + esc(f.name) + '</option>'; });
            h += '</select> level <input type="number" min="1" max="80" data-u="' + i + '" data-k="level" value="' + u.level + '"> item level <input type="number" min="0" max="999" data-u="' + i + '" data-k="ilvl" value="' + u.ilvl + '">';
            if (t) h += '<br>' + tags(t.abilities, function (a) { return N().threats[a]; }, m.threats) + tags(t.traits, traitName);
            h += '</div>';
        });
        h += '</div><div class="ms-col">' + chanceBox(m) + '</div></div>';
        return h;
    }

    function chanceBox(m) {
        var units = [], names = {};
        calc.units.forEach(function (u, i) {
            var t = tpl(u.tpl);
            if (!t) return;
            units.push({ id: i + 1, level: +u.level, ilvl: +u.ilvl, race: t.race, abilities: t.abilities, traits: t.traits });
            names[i + 1] = t.name;
        });
        var ex = AoMissionChance.compute(N().traits, m, units, data.settings);
        return AoMissionChance.explain(ex, N(), function (id) { return names[id] || '?'; }) +
            '<p class="ms-dim">Pick the same followers, levels and item levels as in game to see the chance the server will roll. ' +
            'Over 100% is the chance of the bonus reward.</p>';
    }

    /* ---------- page ---------- */

    function render() {
        var h = '<div class="ms-tabs">';
        [['followers', 'Followers (' + data.followers.length + ')'], ['missions', 'Missions (' + data.missions.length + ')'], ['threats', 'Threats'], ['traits', 'Traits'], ['calc', 'Calculator']].forEach(function (t) {
            h += '<a href="javascript:;" data-tab="' + t[0] + '"' + (tab == t[0] ? ' class="on"' : '') + '>' + t[1] + '</a>';
        });
        h += '</div>';
        if (tab != 'calc' && tab != 'threats') h += '<div class="ms-filter"><input type="search" placeholder="Filter" value="' + esc(filter) + '"></div>';
        h += '<div class="ms-body">' + (tab == 'followers' ? followers() : tab == 'missions' ? missions() : tab == 'threats' ? threats() : tab == 'traits' ? traits() : calculator()) + '</div>';
        el.innerHTML = h;
        bind();
    }

    function bind() {
        el.querySelectorAll('[data-tab]').forEach(function (a) { a.onclick = function () { tab = a.getAttribute('data-tab'); location.hash = tab; render(); }; });
        var f = el.querySelector('.ms-filter input');
        if (f) f.oninput = function () {
            filter = f.value.toLowerCase();
            el.querySelector('.ms-body').innerHTML = tab == 'followers' ? followers() : tab == 'missions' ? missions() : traits();
            bindBody();
        };
        bindBody();
    }

    function bindBody() {
        el.querySelectorAll('[data-sort]').forEach(function (th) {
            th.onclick = function () {
                var p = th.getAttribute('data-sort').split(':'), k = sort[p[0]];
                sort[p[0]] = { col: +p[1], dir: k && k.col == +p[1] ? -k.dir : 1 };
                render();
            };
        });
        el.querySelectorAll('[data-calc]').forEach(function (a) {
            a.onclick = function () { calc.mission = +a.getAttribute('data-calc'); calc.units = []; tab = 'calc'; location.hash = 'calc'; render(); };
        });
        var ms = el.querySelector('[data-c="mission"]');
        if (ms) ms.onchange = function () { calc.mission = +ms.value; calc.units = []; render(); };
        el.querySelectorAll('[data-u]').forEach(function (inp) {
            inp.onchange = function () {
                var u = calc.units[+inp.getAttribute('data-u')], k = inp.getAttribute('data-k');
                u[k] = +inp.value;
                render();
            };
        });
    }

    return {
        init: function (node, config) {
            el = node; cfg = config;
            var h = (location.hash || '').slice(1);
            if (['followers', 'missions', 'threats', 'traits', 'calc'].indexOf(h) != -1) tab = h;
            el.innerHTML = '<p class="ms-dim">Loading…</p>';
            fetch(cfg.host.replace(/\/?$/, '/') + '?missions=data').then(function (r) { return r.json(); }).then(function (d) {
                data = d;
                if (!data.missions.length && !data.followers.length) { el.innerHTML = '<p>This server has no mission table data yet.</p>'; return; }
                render();
            }).catch(function () { el.innerHTML = '<p>Could not load the mission data.</p>'; });
        }
    };
})();
