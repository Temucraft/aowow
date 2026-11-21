/*
 * Temucraft launcher news (?news)
 *
 * The news and changelog the launcher shows, from news.json and changelog.json on the server's file host
 * (see pages/news.php). Written the same way as the launcher: [New], [Changed], [Fixed]... tags in their colours,
 * {+better} values in green and {-worse} in red, and indented lines under a line fold open on a click.
 */
var AoNews = (function () {
    // the same tags and colours as the launcher (NewsItem.Tags in Launcher.Core)
    var TAGS = [['New', '#8FC24A'], ['Changed', '#F2C14E'], ['Fixed', '#5FB8D9'], ['Removed', '#E06C5C'], ['Planned', '#B48CE0'], ['Not live yet', '#E0894A']];
    var BETTER = '#6FD06F', WORSE = '#E06C5C';
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }

    /* text with the known [Tag]s and {+/-values} coloured; everything else stays as written (escaped) */
    function segments(text) {
        var out = '', at = 0, re = /\[([^\]\n]{2,20})\]|\{([+-])([^{}\n]+)\}/g, m;
        while ((m = re.exec(text))) {
            var shown, color, bold = false;
            if (m[1] !== undefined) {
                var name = m[1].trim().toLowerCase(), tag = null;
                for (var i = 0; i < TAGS.length; i++) if (TAGS[i][0].toLowerCase() == name) tag = TAGS[i];
                if (!tag) continue;
                shown = '[' + tag[0] + ']'; color = tag[1]; bold = true;
            }
            else {
                shown = m[3]; color = m[2] == '+' ? BETTER : WORSE;
            }
            out += esc(text.slice(at, m.index)) + '<span class="nw-' + (bold ? 'tag' : 'val') + '" style="color:' + color + '">' + esc(shown) + '</span>';
            at = m.index + m[0].length;
        }
        return out + esc(text.slice(at));
    }

    /* lines and their details: indented lines under a line belong to it (bullets dropped) */
    function lines(text) {
        var out = [];
        String(text).replace(/\r\n/g, '\n').split('\n').forEach(function (raw) {
            if (/^\s/.test(raw) && raw.trim().length && out.length) {
                var d = raw.trim();
                if (d.indexOf('- ') === 0 || d.indexOf('• ') === 0) d = d.slice(2);
                out[out.length - 1].details.push(d);
            }
            else if (raw.trim().length || out.length)
                out.push({ line: raw, details: [] });
        });
        return out;
    }

    /* "18th of November 2026 (18/11/2026)"; the date as written when it isn't YYYY-MM-DD */
    function formatDate(date) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
        if (!m) return String(date);
        var d = +m[3], s = (d % 100 >= 11 && d % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th');
        return d + s + ' of ' + MONTHS[+m[2] - 1] + ' ' + m[1] + ' (' + m[3] + '/' + m[2] + '/' + m[1] + ')';
    }

    function feed(items, empty) {
        if (!items || !items.length) return '<p class="nw-dim">' + esc(empty) + '</p>';
        // entries of a day with several get a number, #1 being the day's earliest (the lowest in the list)
        var perDay = {}, seen = {}, last = null, h = '';
        items.forEach(function (e) { var d = e.date.trim(); if (d) perDay[d] = (perDay[d] || 0) + 1; });
        items.forEach(function (e) {
            var day = e.date.trim();
            if (day && day != last) h += '<div class="nw-date">' + esc(formatDate(day)) + '</div>';
            if (day) last = day;
            var num = '';
            if (perDay[day] > 1) { seen[day] = (seen[day] || 0) + 1; num = '#' + (perDay[day] - seen[day] + 1) + ' '; }
            h += '<div class="nw-item"><div class="nw-title">' + (num ? '<span class="nw-num">' + esc(num) + '</span>' : '') + segments(e.title) + '</div>';
            lines(e.text).forEach(function (l) {
                if (l.details.length) {
                    h += '<div class="nw-line nw-more"><span class="nw-arrow">▸</span> ' + segments(l.line) + '</div><ul class="nw-details" style="display:none">' +
                        l.details.map(function (d) { return '<li>' + segments(d) + '</li>'; }).join('') + '</ul>';
                }
                else
                    h += '<div class="nw-line">' + (l.line.trim() ? segments(l.line) : '&nbsp;') + '</div>';
            });
            if (/^https?:\/\//i.test(e.link)) h += '<div class="nw-link"><a href="' + esc(e.link) + '" target="_blank" rel="noopener noreferrer">Read more</a></div>';
            h += '</div>';
        });
        return h;
    }

    return {
        init: function (node, data) {
            var h = '';
            if (!data.configured)
                h += '<p class="nw-dim">The news source is not set yet: put the address of the launcher\'s file folder (or a folder on this machine) in <b>news_source</b> in the site settings.</p>';
            else if (data.stale)
                h += '<p class="nw-dim">The file host could not be reached just now; this is the last copy the site kept.</p>';
            h += '<div class="nw-cols"><div class="nw-col"><h2>News</h2>' + feed(data.news, 'No news yet.') + '</div>' +
                 '<div class="nw-col"><h2>Changelog</h2>' + feed(data.changelog, 'No changes listed yet.') + '</div></div>';
            node.innerHTML = h;
            node.addEventListener('click', function (ev) {
                var line = ev.target.closest ? ev.target.closest('.nw-more') : null;
                if (!line) return;
                var list = line.nextElementSibling, open = list.style.display == 'none';
                list.style.display = open ? '' : 'none';
                line.querySelector('.nw-arrow').textContent = open ? '▾' : '▸';
            });
        }
    };
})();
