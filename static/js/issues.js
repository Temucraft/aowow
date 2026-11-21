/*
 * Temucraft issues and feature requests (?issues)
 *
 * The list with filters (kind, status, words), the form to post (signed in users), and for staff a status box, a
 * reply box and a delete link under each issue. Every text is escaped before it goes on the page.
 */
var AoIssues = (function () {
    var el, cfg, issues = [], filter = { kind: 0, status: -1, words: '' }, open = {};
    var STATUS_COLORS = ['#ffd100', '#B48CE0', '#8FC24A', '#999999'];
    var KIND_COLORS = { 1: '#E06C5C', 2: '#5FB8D9' };

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function host() { return (cfg.host || '').replace(/\/+$/, '') + '/'; }
    function date(ts) {
        var d = new Date(ts * 1000);
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function badge(text, color) { return '<span class="is-badge" style="border-color:' + color + ';color:' + color + '">' + esc(text) + '</span>'; }
    function statusName(s) { return cfg.statuses[s] || '?'; }

    function post(what, fields) {
        var body = new FormData();
        body.append('t', cfg.token);
        Object.keys(fields).forEach(function (k) { body.append(k, fields[k]); });
        return fetch(host() + '?issues=' + what, { method: 'POST', body: body, credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .catch(function () { return { error: 'The site did not answer. Please try again.' }; });
    }
    function reload() {
        return fetch(host() + '?issues=data', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
            .then(function (d) { issues = d || []; list(); });
    }

    /* ---------- the form ---------- */

    function form() {
        if (!cfg.loggedIn)
            return '<p class="is-dim"><a href="?account=signin">Sign in</a> to post a bug or a feature request. Everyone can read them.</p>';
        if (!cfg.canPost)
            return '<p class="is-dim">Your account can not post right now.</p>';
        var L = cfg.limits, kinds = Object.keys(cfg.kinds).map(function (k) { return '<option value="' + esc(k) + '">' + esc(cfg.kinds[k]) + '</option>'; }).join('');
        return '<form class="is-form" id="is-form"><h3>Post a bug or a feature request</h3>' +
            '<div class="is-row"><select name="kind">' + kinds + '</select> <input type="text" name="title" maxlength="' + L.titleMax + '" placeholder="Title (' + L.titleMin + ' to ' + L.titleMax + ' characters)"></div>' +
            '<textarea name="text" rows="6" maxlength="' + L.textMax + '" placeholder="What happened, where, and how to make it happen again. For an idea: what it should do."></textarea>' +
            '<div class="is-row"><button type="submit">Post</button> <span class="is-msg"></span></div></form>';
    }

    function hookForm() {
        var f = document.getElementById('is-form');
        if (!f) return;
        f.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var msg = f.querySelector('.is-msg'), button = f.querySelector('button');
            button.disabled = true;
            msg.textContent = 'Posting...';
            post('post', { kind: f.kind.value, title: f.title.value, text: f.text.value }).then(function (r) {
                button.disabled = false;
                if (r.error) { msg.textContent = r.error; msg.className = 'is-msg is-err'; return; }
                msg.textContent = 'Thank you, it is posted.';
                msg.className = 'is-msg is-ok';
                f.title.value = ''; f.text.value = '';
                open[r.id] = true;
                reload();
            });
        });
    }

    /* ---------- the list ---------- */

    function matches(i) {
        if (filter.kind && i.kind != filter.kind) return false;
        if (filter.status >= 0 && i.status != filter.status) return false;
        if (!filter.words) return true;
        var text = (i.title + ' ' + i.body + ' ' + i.author + ' #' + i.id).toLowerCase();
        return filter.words.split(/\s+/).every(function (w) { return text.indexOf(w) != -1; });
    }

    function staffBox(i) {
        var opts = Object.keys(cfg.statuses).map(function (s) {
            return '<option value="' + esc(s) + '"' + (+s == i.status ? ' selected' : '') + '>' + esc(cfg.statuses[s]) + '</option>';
        }).join('');
        return '<div class="is-staff" data-id="' + i.id + '"><textarea rows="3" maxlength="' + cfg.limits.textMax + '" placeholder="Reply (shown to everyone)"></textarea>' +
            '<div class="is-row">Status: <select>' + opts + '</select> <button data-act="answer">Save</button> ' +
            '<a href="javascript:;" class="is-del" data-act="delete">Delete (spam)</a> <span class="is-msg"></span></div></div>';
    }

    function issue(i) {
        var h = '<div class="is-issue' + (open[i.id] ? ' is-open' : '') + '" data-id="' + i.id + '">' +
            '<div class="is-head" data-act="toggle"><span class="is-arrow">' + (open[i.id] ? '▾' : '▸') + '</span> ' +
            badge(cfg.kinds[i.kind] || '?', KIND_COLORS[i.kind] || '#999') + ' ' + badge(statusName(i.status), STATUS_COLORS[i.status] || '#999') +
            ' <b class="is-title">' + esc(i.title) + '</b><span class="is-meta">#' + i.id + ' by ' + esc(i.author || 'unknown') + ', ' + esc(date(i.created)) +
            (i.replies.length ? ', ' + i.replies.length + (i.replies.length == 1 ? ' reply' : ' replies') : '') + '</span></div>';
        if (open[i.id]) {
            h += '<div class="is-body">' + esc(i.body) + '</div>';
            i.replies.forEach(function (r) {
                h += '<div class="is-reply"><div class="is-meta">' + esc(r.author || 'staff') + ', ' + esc(date(r.created)) +
                    (r.newStatus != null ? ' ' + badge('Now: ' + statusName(r.newStatus), STATUS_COLORS[r.newStatus] || '#999') : '') + '</div>' +
                    (r.body ? '<div class="is-body">' + esc(r.body) + '</div>' : '') + '</div>';
            });
            if (cfg.staff) h += staffBox(i);
        }
        return h + '</div>';
    }

    function list() {
        var shown = issues.filter(matches), node = el.querySelector('.is-list');
        var counts = {};
        issues.forEach(function (i) { counts[i.status] = (counts[i.status] || 0) + 1; });
        el.querySelector('.is-count').textContent = shown.length + ' of ' + issues.length + ' shown' +
            Object.keys(cfg.statuses).map(function (s) { return ', ' + (counts[s] || 0) + ' ' + cfg.statuses[s].toLowerCase(); }).join('');
        node.innerHTML = shown.length ? shown.map(issue).join('') : '<p class="is-dim">Nothing here yet.</p>';
    }

    function filters() {
        var kinds = '<option value="0">All kinds</option>' + Object.keys(cfg.kinds).map(function (k) { return '<option value="' + esc(k) + '">' + esc(cfg.kinds[k]) + '</option>'; }).join('');
        var statuses = '<option value="-1">Any status</option>' + Object.keys(cfg.statuses).map(function (s) { return '<option value="' + esc(s) + '">' + esc(cfg.statuses[s]) + '</option>'; }).join('');
        return '<div class="is-filters is-row"><select class="is-f-kind">' + kinds + '</select> <select class="is-f-status">' + statuses + '</select> ' +
            '<input type="text" class="is-f-words" placeholder="Search"> <span class="is-count is-dim"></span></div>';
    }

    function onClick(ev) {
        var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
        if (!act && t.closest) { var head = t.closest('.is-head'); if (head) { t = head; act = 'toggle'; } }
        if (!act) return;
        var box = t.closest('[data-id]'), id = +box.getAttribute('data-id');
        if (act == 'toggle') { open[id] = !open[id]; list(); return; }
        ev.preventDefault();
        var staff = t.closest('.is-staff'), msg = staff.querySelector('.is-msg');
        if (act == 'delete' && !confirm('Delete issue #' + id + ' and its replies?')) return;
        msg.textContent = '...';
        var fields = act == 'delete' ? { id: id } : { id: id, text: staff.querySelector('textarea').value, status: staff.querySelector('select').value };
        post(act, fields).then(function (r) {
            if (r.error) { msg.textContent = r.error; msg.className = 'is-msg is-err'; return; }
            reload();
        });
    }

    return {
        init: function (node, config) {
            el = node; cfg = config; issues = cfg.issues || [];
            el.innerHTML = form() + '<h3>Posted</h3>' + filters() + '<div class="is-list"></div>';
            hookForm();
            el.querySelector('.is-f-kind').addEventListener('change', function () { filter.kind = +this.value; list(); });
            el.querySelector('.is-f-status').addEventListener('change', function () { filter.status = +this.value; list(); });
            el.querySelector('.is-f-words').addEventListener('input', function () { filter.words = this.value.trim().toLowerCase(); list(); });
            el.querySelector('.is-list').addEventListener('click', onClick);
            list();
        }
    };
})();
