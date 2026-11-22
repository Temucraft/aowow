/* Temucraft: the Races page as Alliance | Classes | Horde | Classes (pages/races.php). Races come from the page's own
   list data (with their expansion badge); icons and names from the site's tables (g_file_races, g_chr_classes...). */
function Temucraft_RaceGrid(races) {
    var box = $WH.ge('race-grid');
    if (!box || !races) return;
    var sides = { 1: [], 2: [] };
    for (var i = 0; i < races.length; i++)
        if (sides[races[i].side]) sides[races[i].side].push(races[i]);
    for (var s in sides)
        sides[s].sort(function (a, b) { return a.id - b.id; });

    var table = $WH.ce('table'), head = $WH.ce('tr');
    table.className = 'temucraft-race-grid';
    var titles = [[g_sides[1], 'alliance'], [LANG.classes, ''], [g_sides[2], 'horde'], [LANG.classes, '']];
    for (var t = 0; t < titles.length; t++) {
        var th = $WH.ce('th');
        if (titles[t][1]) {
            var sp = $WH.ce('span');
            sp.className = 'icon-' + titles[t][1];
            $WH.ae(sp, $WH.ct(titles[t][0]));
            $WH.ae(th, sp);
        }
        else $WH.ae(th, $WH.ct(titles[t][0]));
        if (t == 2) th.className = 'side-start';
        $WH.ae(head, th);
    }
    $WH.ae(table, head);

    function raceCell(race) {
        var td = $WH.ce('td');
        td.className = 'race';
        if (!race) return td;
        var link = '?race=' + race.id, file = g_file_races[race.id] || ('race' + race.id);
        var icons = $WH.ce('div');
        icons.className = 'icons';
        for (var g = 0; g < 2; g++)
            $WH.ae(icons, Icon.create('race_' + file + '_' + g_file_genders[g], 1, null, link));
        $WH.ae(td, icons);
        var a = $WH.ce('a');
        a.href = link;
        $WH.ae(a, $WH.ct(race.name));
        if (race.expansion && typeof g_GetExpansionClassName == 'function' && g_GetExpansionClassName(race.expansion)) {
            var sp = $WH.ce('span');
            sp.className = g_GetExpansionClassName(race.expansion);
            $WH.ae(sp, a);
            $WH.ae(td, sp);
        }
        else $WH.ae(td, a);
        return td;
    }

    function classCell(race, first) {
        var td = $WH.ce('td');
        td.className = 'classes';
        if (!race || !race.classes) return td;
        for (var id in g_chr_classes) {
            if (!(race.classes & (1 << (id - 1))) || !g_file_classes[id]) continue;
            var icon = Icon.create('class_' + g_file_classes[id], 0, null, '?class=' + id);
            g_addTooltip(icon, g_chr_classes[id]);
            $WH.ae(td, icon);
        }
        return td;
    }

    var rows = Math.max(sides[1].length, sides[2].length);
    for (var r = 0; r < rows; r++) {
        var tr = $WH.ce('tr');
        $WH.ae(tr, raceCell(sides[1][r]));
        $WH.ae(tr, classCell(sides[1][r]));
        var h = raceCell(sides[2][r]);
        h.className += ' side-start';
        $WH.ae(tr, h);
        $WH.ae(tr, classCell(sides[2][r]));
        $WH.ae(table, tr);
    }
    $WH.ae(box, table);
}
