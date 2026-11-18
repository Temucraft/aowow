/*
 * Temucraft Companion (?companion)
 *
 * Your characters' followers, missions, expeditions and disguises, and missions to start or collect from the web.
 * Needs the game account linked to the site account (the same link as the quest tracker).
 * ?companion=data gives {now, chars: [{realm, guid, name, class, level, online, followers, offers, running,
 *   expeditions, wallet, disguises, orders}]}; ?companion=start / claim (POST) queue orders the server carries out.
 */
var AoCompanion = (function () {
    var el, cfg, data = null, idx = 0, tab = 'missions', picked = {}, offer = null, timer = null;
    var ROLES = [[1, 'Tank'], [2, 'Healer'], [4, 'Damage']];
    var STATE = ['', 'on a mission', 'out as a companion'];
    var QUALITY = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000'];
    var TYPES = ['', ' (patrol)', ' (treasure)', ' (rare)'];

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function host() { return cfg.host.replace(/\/?$/, '/'); }
    function roles(mask) { return ROLES.filter(function (r) { return mask & r[0]; }).map(function (r) { return r[1]; }).join('/') || '-'; }
    function time(s) {
        s = Math.max(0, Math.floor(s));
        if (s >= 3600) return Math.floor(s / 3600) + 'h ' + ('0' + Math.floor(s % 3600 / 60)).slice(-2) + 'm';
        if (s >= 60) return Math.floor(s / 60) + 'm ' + ('0' + s % 60).slice(-2) + 's';
        return s + 's';
    }
    function gold(c) { return c ? (c / 10000).toFixed(c % 10000 ? 2 : 0) + ' g' : 'free'; }

    function post(what, fields, url) {
        var body = new URLSearchParams();
        Object.keys(fields).forEach(function (k) { body.append(k, fields[k]); });
        return fetch(host() + (url || '?companion=') + what, { method: 'POST', body: body, credentials: 'same-origin' }).then(function (r) { return r.json(); });
    }
    function load() {
        return fetch(host() + '?companion=data', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
            data = d; data.loadedAt = Date.now() / 1000;
            if (idx >= (data.chars || []).length) idx = 0;
            render();
        });
    }

    function linkForm() {
        if (!cfg.loggedIn) return '<p>Sign in to see your characters here.</p>';
        if (!cfg.canLink) return '<p>Linking a game account is not available on this site.</p>';
        return '<p>Link your game account to see your characters\' followers, missions and expeditions.</p>' +
            '<form class="cp-link"><input name="name" placeholder="Game account" autocomplete="username"> ' +
            '<input name="pass" type="password" placeholder="Password" autocomplete="current-password"> ' +
            '<button type="submit">Link</button> <span class="cp-msg"></span></form>';
    }

    function char() { return data.chars[idx]; }
    function follower(c, id) { for (var i = 0; i < c.followers.length; i++) if (c.followers[i].id == id) return c.followers[i]; return null; }

    function renderMissions(c) {
        var h = '<div class="cp-cols"><div class="cp-col"><h3>Available missions</h3>';
        if (!c.offers.length) h += '<p class="cp-dim">No missions offered right now (visit a mission table in game to refresh the list).</p>';
        c.offers.forEach(function (o) {
            h += '<a href="javascript:;" class="cp-row' + (offer == o.slot ? ' on' : '') + '" data-offer="' + o.slot + '"><b>' + esc(o.name) + TYPES[o.type] + '</b>' +
                '<span>Level ' + o.level + (o.ilvl ? ', item level ' + o.ilvl : '') + ' · ' + o.slots + ' follower(s) · ' + time(o.duration) + ' · ' + gold(o.cost) + '</span>' +
                '<span class="cp-dim">Threats: ' + (esc(o.threats.join(', ')) || 'none') + '</span></a>';
        });
        h += '</div><div class="cp-col">';
        var o = c.offers.filter(function (x) { return x.slot == offer; })[0];
        if (!o) h += '<p class="cp-dim">Pick a mission to send followers.</p>';
        else {
            var n = Object.keys(picked).length;
            h += '<h3>' + esc(o.name) + '</h3><p>Send ' + o.slots + ' follower(s). Followers who counter its threats raise the success chance.</p>';
            c.followers.forEach(function (f) {
                if (f.state != 0 || !(f.mask & 1)) return;
                var hit = f.counters.filter(function (x) { return o.threats.indexOf(x) != -1; });
                h += '<label class="cp-pick"><input type="checkbox" data-f="' + f.id + '"' + (picked[f.id] ? ' checked' : '') + (!picked[f.id] && n >= o.slots ? ' disabled' : '') + '> ' +
                    '<b style="color:' + QUALITY[f.quality] + '">' + esc(f.name) + '</b> level ' + f.level + ', ilvl ' + f.ilvl +
                    (hit.length ? ' <span class="cp-good">counters ' + esc(hit.join(', ')) + '</span>' : '') + '</label>';
            });
            h += '<p><button class="cp-start"' + (n == o.slots ? '' : ' disabled') + '>Start mission</button> <span class="cp-msg"></span></p>';
        }
        h += '</div></div>';
        return h;
    }

    function renderRunning(c) {
        var elapsed = Date.now() / 1000 - data.loadedAt, ready = 0, h = '<h3>Missions in progress</h3>';
        if (!c.running.length) h += '<p class="cp-dim">None.</p>';
        h += '<table class="cp-table">';
        c.running.forEach(function (m) {
            var left = m.left - elapsed; if (left <= 0) ready++;
            var names = m.followers.map(function (id) { var f = follower(c, id); return f ? esc(f.name) : '?'; }).join(', ');
            h += '<tr><td><b>' + esc(m.name) + '</b><br><span class="cp-dim">' + names + '</span></td><td>' + m.chance + '%</td><td>' +
                (left > 0 ? time(left) : '<span class="cp-good">done</span>') + '</td></tr>';
        });
        h += '</table>';
        if (ready) h += '<p><button class="cp-claim">Collect ' + ready + ' finished mission(s)</button> <span class="cp-msg"></span></p>';
        return h;
    }

    function renderFollowers(c) {
        var h = '<h3>Followers</h3><table class="cp-table"><tr><th>Name</th><th>Roles</th><th>Level</th><th>Item level</th><th>Counters</th><th>Traits</th><th></th></tr>';
        c.followers.forEach(function (f) {
            h += '<tr><td style="color:' + QUALITY[f.quality] + '">' + esc(f.name) + '</td><td>' + roles(f.roles) + '</td><td>' + f.level + '</td><td>' + f.ilvl +
                '</td><td>' + esc(f.counters.join(', ')) + '</td><td>' + esc(f.traits.join(', ')) + '</td><td class="cp-dim">' + STATE[f.state] + '</td></tr>';
        });
        if (!c.followers.length) h += '<tr><td colspan="7" class="cp-dim">No followers yet: talk to a mission table in game.</td></tr>';
        return h + '</table>';
    }

    function renderExpeditions(c) {
        var h = '<h3>Expeditions</h3>';
        if (c.wallet) h += '<p>Expedition Keys: <b>' + c.wallet.keys + '</b> · Cache Key Fragments: <b>' + c.wallet.fragments + '</b></p>';
        if (!c.expeditions.length) return h + '<p class="cp-dim">No expedition finished yet.</p>';
        h += '<table class="cp-table"><tr><th>Dungeon</th><th>Best tier</th><th>Runs</th></tr>';
        c.expeditions.forEach(function (e) { h += '<tr><td>' + esc(e.name) + '</td><td>' + e.tier + '</td><td>' + e.runs + '</td></tr>'; });
        h += '</table>';
        if (c.disguises.length) h += '<h3>Disguises</h3><p>' + esc(c.disguises.join(', ')) + '</p>';
        return h;
    }

    function render() {
        if (!data || !data.chars || !data.chars.length) {
            el.innerHTML = (data && data.error && cfg.linked) ? '<p>' + esc(data.error) + '</p>' : (cfg.linked ? '<p>No characters on this account yet.</p>' : linkForm());
            bindLink();
            return;
        }
        var c = char(), h = '<div class="cp-chars">';
        data.chars.forEach(function (x, i) {
            h += '<a href="javascript:;" class="cp-char c' + x.class + (i == idx ? ' on' : '') + '" data-char="' + i + '">' + esc(x.name) + ' <small>' + x.level + ' · ' + esc(x.realmName) +
                (x.online ? ' · <span class="cp-good">online</span>' : '') + '</small></a>';
        });
        h += '</div><div class="cp-tabs">';
        [['missions', 'Missions'], ['running', 'In progress (' + c.running.length + ')'], ['followers', 'Followers (' + c.followers.length + ')'], ['expeditions', 'Expeditions']].forEach(function (t) {
            h += '<a href="javascript:;" data-tab="' + t[0] + '"' + (tab == t[0] ? ' class="on"' : '') + '>' + t[1] + '</a>';
        });
        h += '</div>';
        if (c.orders) h += '<p class="cp-note">' + c.orders + ' order(s) waiting: ' + (c.online ? 'the server carries them out in a moment.' : 'they are carried out when ' + esc(c.name) + ' logs in.') + '</p>';
        h += '<div class="cp-body">' + (tab == 'missions' ? renderMissions(c) : tab == 'running' ? renderRunning(c) : tab == 'followers' ? renderFollowers(c) : renderExpeditions(c)) + '</div>';
        el.innerHTML = h;
        bind();
    }

    function bindLink() {
        var f = el.querySelector('.cp-link');
        if (!f) return;
        f.onsubmit = function (e) {
            e.preventDefault();
            post('link', { name: f.name.value, pass: f.pass.value }, '?quest-tracker=').then(function (r) {
                if (r.error) { f.querySelector('.cp-msg').textContent = r.error; return; }
                cfg.linked = true; load();
            });
        };
    }

    function bind() {
        var c = char();
        el.querySelectorAll('[data-char]').forEach(function (a) { a.onclick = function () { idx = +a.getAttribute('data-char'); picked = {}; offer = null; render(); }; });
        el.querySelectorAll('[data-tab]').forEach(function (a) { a.onclick = function () { tab = a.getAttribute('data-tab'); render(); }; });
        el.querySelectorAll('[data-offer]').forEach(function (a) { a.onclick = function () { offer = +a.getAttribute('data-offer'); picked = {}; render(); }; });
        el.querySelectorAll('[data-f]').forEach(function (b) { b.onchange = function () { var id = b.getAttribute('data-f'); if (b.checked) picked[id] = 1; else delete picked[id]; render(); }; });
        var start = el.querySelector('.cp-start');
        if (start) start.onclick = function () {
            start.disabled = true;
            post('start', { realm: c.realm, guid: c.guid, slot: offer, followers: Object.keys(picked).join(',') }).then(function (r) {
                if (r.error) { el.querySelector('.cp-msg').textContent = r.error; start.disabled = false; return; }
                picked = {}; offer = null; load();
            });
        };
        var claim = el.querySelector('.cp-claim');
        if (claim) claim.onclick = function () {
            claim.disabled = true;
            post('claim', { realm: c.realm, guid: c.guid }).then(function (r) {
                if (r.error) { el.querySelector('.cp-msg').textContent = r.error; claim.disabled = false; return; }
                load();
            });
        };
    }

    return {
        init: function (node, config) {
            el = node; cfg = config;
            if (!cfg.linked) { render(); return; }
            el.innerHTML = '<p class="cp-dim">Loading…</p>';
            load();
            // refresh now and then so orders and timers catch up
            timer = setInterval(function () { if (document.visibilityState != 'hidden') load(); }, 30000);
            setInterval(function () { if (data && tab == 'running') render(); }, 1000);
        }
    };
})();
