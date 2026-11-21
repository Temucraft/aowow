/*
 * Temucraft mission success chance (used by ?missions and ?companion)
 *
 * A port of mod-temucraft-followers src/TemucraftMissionChance.h (and its Python twin tests/mission_chance.py), so the
 * site shows the same number the server rolls. If the module's formula changes, change this file too.
 *
 *   AoMissionChance.compute(traits, mission, units, settings)
 *     traits:   id => [name, effect, param, amount2, amount3] (TemucraftMissions::traits() on the PHP side)
 *     mission:  {level, ilvl, base, slots, duration, type, env, enemy, requiredTrait, threats: [ids], weights: [..]}
 *     units:    [{id, level, ilvl, race, abilities: [ids], traits: [ids]}]
 *     settings: {threatWeight, lucky, maxChance}
 *   returns {chance, shown, bonus, points, totalWeight, mentor, lucky, followers: [..], threats: [..], traits: [..]}
 */
var AoMissionChance = (function () {
    var M_EXPLORATION = 4;
    var EFF = { ALONE: 1, ALWAYS: 2, RACE_PAIR: 5, LONG: 6, SHORT: 7, TIME: 17, MENTOR: 18,
                GOLD: 100, XP: 101, ENVIRONMENT: 102, SLAYER: 103, MISSION_TYPE: 104, PROFESSION: 105, LUCKY: 106 };

    function raceBit(race) { return race ? 1 << (race - 1) : 0; }
    function calc(a, b, bias) { return bias >= 0 ? a + (b - a) * bias : a * (1 + bias); }
    function biasOf(level, ilvl, m) {
        var b = (level - m.level) / 3;
        if (m.ilvl > 0) b += (ilvl - m.ilvl) / 15;
        return Math.max(-1, Math.min(1, b));
    }
    function finish(ex, max) {
        ex.chance = Math.max(0, Math.min(max, ex.chance));
        ex.shown = Math.floor(ex.chance + 1e-6);
        ex.bonus = Math.max(0, ex.shown - 100);
        return ex;
    }

    function compute(traits, m, units, s) {
        s = s || {};
        var defW = s.threatWeight || 300, lucky = s.lucky == null ? 5 : s.lucky, max = s.maxChance || 200;
        var base = Math.max(0, Math.min(100, m.base == null ? 50 : m.base));
        var ex = { followers: [], threats: [], traits: [], totalWeight: 0, points: 0, lucky: 0, chance: 0, countered: 0, mentor: false };
        if (!units.length) { ex.chance = base; return finish(ex, max); }

        var bestLevel = 0, bestIlvl = 0;
        units.forEach(function (u) {
            bestLevel = Math.max(bestLevel, u.level); bestIlvl = Math.max(bestIlvl, u.ilvl || 0);
            (u.traits || []).forEach(function (t) { if (traits[t] && traits[t][1] == EFF.MENTOR) ex.mentor = true; });
        });

        var order = [], kinds = {}, total = Math.max(m.slots || 1, 1) * 100;
        (m.threats || []).forEach(function (t, i) {
            var w = (m.weights && m.weights[i]) ? m.weights[i] : defW;
            if (!kinds[t]) { order.push(t); kinds[t] = [0, 0]; }
            kinds[t][0]++; kinds[t][1] += w; total += w;
        });
        ex.totalWeight = total;
        var coeff = 100 / total, bias = [];

        units.forEach(function (u) {
            var level = ex.mentor ? bestLevel : u.level, ilvl = ex.mentor ? bestIlvl : (u.ilvl || 0);
            var b = biasOf(level, ilvl, m), pts = calc(100, 150, b) * coeff;
            bias.push(b);
            ex.followers.push({ id: u.id, level: level, ilvl: ilvl, bias: b, points: pts });
            ex.points += pts;
        });

        // best placed followers counter first (stable, like std::stable_sort)
        var byBias = units.map(function (u, i) { return i; }).sort(function (a, b) { return bias[b] - bias[a] || a - b; });
        var remaining = {}, hits = {}, parts = {};
        order.forEach(function (t) {
            remaining[t] = kinds[t][1]; hits[t] = 0;
            parts[t] = { threat: t, count: kinds[t][0], weight: kinds[t][1], removed: 0, points: 0, by: [] };
        });
        byBias.forEach(function (i) {
            (units[i].abilities || []).forEach(function (a) {
                if (!(a in remaining) || remaining[a] <= 0 || hits[a] >= kinds[a][0]) return;
                var unit = kinds[a][1] / kinds[a][0];
                var removed = Math.min(remaining[a], calc(unit, unit, bias[i]));
                remaining[a] -= removed; hits[a]++;
                parts[a].removed += removed; parts[a].points += removed * coeff; parts[a].by.push(units[i].id);
                ex.points += removed * coeff;
            });
        });
        order.forEach(function (t) { ex.countered += hits[t]; ex.threats.push(parts[t]); });

        units.forEach(function (u, i) {
            (u.traits || []).forEach(function (tid) {
                var t = traits[tid];
                if (!t) return;
                var eff = t[1], param = t[2], applies = false, scale = 1;
                switch (eff) {
                    case EFF.ALONE: applies = units.length == 1; break;
                    case EFF.ALWAYS: applies = true; break;
                    case EFF.RACE_PAIR:
                        applies = units.some(function (v, j) { return j != i && (raceBit(v.race || 0) & param); }); break;
                    case EFF.LONG: applies = m.duration >= param * 3600; break;
                    case EFF.SHORT: applies = m.duration < param * 3600; break;
                    case EFF.ENVIRONMENT:
                        applies = !!m.env && m.env == param;
                        if (m.type == M_EXPLORATION) scale = 2;
                        break;
                    case EFF.SLAYER: applies = !!m.enemy && m.enemy == param; break;
                    case EFF.MISSION_TYPE: applies = m.type <= 31 && !!((1 << m.type) & param); break;
                    case EFF.PROFESSION: applies = m.requiredTrait == tid; break;
                    case EFF.LUCKY: ex.lucky += lucky; break;
                }
                if (!applies) return;
                var pts = calc(t[3], t[4], bias[i]) * coeff * scale;
                ex.traits.push({ follower: u.id, trait: +tid, points: pts });
                ex.points += pts;
            });
        });

        ex.chance = base + (100 - base) * ex.points / 100 + ex.lucky;
        return finish(ex, max);
    }

    // what a trait does, in words (names: TemucraftMissions::names())
    function traitText(t, names) {
        var eff = t[1], p = t[2];
        switch (eff) {
            case EFF.TIME: return 'Missions take ' + (100 - t[3]) + '% less time.';
            case EFF.GOLD: return '+' + t[3] + '% gold from missions.';
            case EFF.XP: return '+' + t[3] + '% follower experience.';
            case EFF.LUCKY: return 'A flat bonus to the success chance.';
            case EFF.MENTOR: return 'The others on the mission count at the best level and item level of the group.';
            case EFF.ALONE: return 'Better chance when sent alone.';
            case EFF.ALWAYS: return 'Always raises the chance a little.';
            case EFF.LONG: return 'Better chance on missions of ' + p + ' hours or more.';
            case EFF.SHORT: return 'Better chance on missions under ' + p + ' hours.';
            case EFF.MISSION_TYPE:
                return 'Better chance on ' + names.types.filter(function (n, i) { return (1 << i) & p; }).join(' and ').toLowerCase() + ' missions.';
            case EFF.RACE_PAIR:
                var r = names.races.filter(function (n, i) { return n && (raceBit(i) & p); });
                return 'Better chance with a ' + r.join(' or ') + ' follower on the same mission.';
            case EFF.ENVIRONMENT: return 'Better chance in ' + names.envs[p] + ' (twice as much on exploration missions).';
            case EFF.SLAYER: return 'Better chance against ' + names.enemies[p] + ' enemies.';
            case EFF.PROFESSION: return 'Needed for ' + t[0] + ' profession missions.';
        }
        return '';
    }

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    function pts(p) { return '+' + p.toFixed(1); }

    // the result as a small box: chance, then where each point came from (like the in-game "explain chance")
    function explain(ex, names, unitName) {
        var cls = ex.shown >= 100 ? 'ms-good' : ex.shown < 50 ? 'ms-bad' : '';
        var h = '<div class="ms-chance"><span class="ms-big ' + cls + '">' + Math.min(100, ex.shown) + '%</span>' +
            (ex.bonus ? ' <span class="ms-good">+' + ex.bonus + '% bonus reward</span>' : '');
        if (!ex.followers.length) return h + '<p class="ms-dim">Pick followers to see their chance.</p></div>';
        h += '<table>';
        ex.followers.forEach(function (f) {
            h += '<tr><td>' + esc(unitName(f.id)) + (ex.mentor ? ' <span class="ms-dim">(mentored: ' + f.level + ')</span>' : '') +
                (f.bias < 0 ? ' <span class="ms-bad">too low</span>' : '') + '</td><td>' + pts(f.points) + '</td></tr>';
        });
        ex.threats.forEach(function (t) {
            var full = t.by.length >= t.count;
            h += '<tr><td>' + esc(names.threats[t.threat]) + (t.count > 1 ? ' x' + t.count : '') + ': ' +
                (t.by.length ? '<span class="' + (full ? 'ms-good' : '') + '">countered by ' + esc(t.by.map(unitName).join(', ')) + '</span>' : '<span class="ms-bad">not countered</span>') +
                '</td><td>' + (t.points ? pts(t.points) : '') + '</td></tr>';
        });
        ex.traits.forEach(function (t) {
            h += '<tr><td>' + esc(names.traits[t.trait][0]) + ' <span class="ms-dim">(' + esc(unitName(t.follower)) + ')</span></td><td>' + pts(t.points) + '</td></tr>';
        });
        if (ex.lucky) h += '<tr><td>Lucky</td><td>+' + ex.lucky + '%</td></tr>';
        return h + '</table></div>';
    }

    return { compute: compute, traitText: traitText, explain: explain, EFF: EFF };
})();
