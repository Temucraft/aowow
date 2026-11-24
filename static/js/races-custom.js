/* written by `php aowow --sql=races`: the server's own playable races */
var g_custom_races = {"9":{"file":"goblin","side":2,"names":{"0":"Goblin","2":"Gobelin","3":"Goblin","4":"地精","6":"Goblin","8":"Гоблин"}},"12":{"file":"worgen","side":1,"names":{"0":"Worgen","2":"Worgen","3":"Worgen","4":"狼人","6":"Huargen","8":"Ворген"}},"13":{"file":"alliancepandaren","side":1,"names":{"0":"Pandaren"}},"14":{"file":"hordepandaren","side":2,"names":{"0":"Pandaren"}},"15":{"file":"nightborne","side":2,"names":{"0":"Nightborne"}},"16":{"file":"highmountaintauren","side":2,"names":{"0":"Highmountain Tauren"}},"17":{"file":"voidelf","side":1,"names":{"0":"Void Elf"}},"18":{"file":"lightforgeddraenei","side":1,"names":{"0":"Lightforged Draenei"}},"19":{"file":"zandalaritroll","side":2,"names":{"0":"Zandalari Troll"}},"20":{"file":"kultiran","side":1,"names":{"0":"Kul Tiran"}}};
var g_listed_races = {"21":{"file":"vulpera","names":{"0":"Vulpera"}},"22":{"file":"darkirondwarf","names":{"0":"Dark Iron Dwarf","2":"Nain Sombrefer","3":"Dunkeleisenzwerg","4":"黑铁矮人","6":"Enano Hierro Negro","8":"Дворф Черного Железа"}},"23":{"file":"maghar","names":{"0":"Mag'har","2":"Orc Mag'har","3":"Mag'har-Orc","4":"玛格汉兽人","6":"Orco Mag'har","8":"Орк Маг'хар"}},"24":{"file":"mechagnome","names":{"0":"Mechagnome"}},"25":{"file":"alliancedracthyr","names":{"0":"Dracthyr"}},"26":{"file":"hordedracthyr","names":{"0":"Dracthyr"}},"27":{"file":"allianceearthen","names":{"0":"Earthen"}},"28":{"file":"hordeearthen","names":{"0":"Earthen"}},"29":{"file":"allianceharanir","names":{"0":"Haranir"}},"30":{"file":"hordeharanir","names":{"0":"Haranir"}}};
/* adds g_custom_races (id => {file, side, names{localeId => name}}) to the race lists of the site */
(function () {
    var localeId = (typeof Locale != 'undefined' && Locale.getId) ? Locale.getId() : 0;
    var sides = {};
    for (var id in g_custom_races) {
        var r = g_custom_races[id], name = r.names[localeId] || r.names[0] || ('Race ' + id);
        if (typeof g_chr_races != 'undefined') g_chr_races[id] = name;
        if (typeof g_file_races != 'undefined') g_file_races[id] = r.file;
        sides[id] = r.side;
        if (typeof mn_races != 'undefined') {
            // after the last race of its side in the Races menu (1 Alliance, 2 Horde, other: at the end)
            var at = mn_races.length;
            for (var i = 0; i < mn_races.length; i++)
                if (mn_races[i][0] === undefined && i > 0 && r.side == 1) { at = i; break; }
            mn_races.splice(at, 0, [parseInt(id), name, '?race=' + id, , { smallIcon: 'race_' + r.file + '_female' }]);
        }
    }
})();
/* g_listed_races: retail player races not playable here: name and icon for lists and pages only */
(function () {
    if (typeof g_listed_races == 'undefined') return;
    var localeId = (typeof Locale != 'undefined' && Locale.getId) ? Locale.getId() : 0;
    for (var id in g_listed_races) {
        var r = g_listed_races[id];
        if (typeof g_chr_races != 'undefined') g_chr_races[id] = r.names[localeId] || r.names[0] || ('Race ' + id);
        if (typeof g_file_races != 'undefined') g_file_races[id] = r.file;
    }
})();
/* g_disabled_races, g_disabled_classes: races and classes this server turned off (no character can be one, or an
   admin listed them in aowow_chr_disabled): taken out of the menus; their pages still open */
(function () {
    function drop(menu, ids) {
        if (typeof menu == 'undefined' || !ids || !ids.length) return;
        for (var i = menu.length - 1; i >= 0; i--)
            if (menu[i] && ids.indexOf(parseInt(menu[i][0])) != -1) menu.splice(i, 1);
    }
    if (typeof g_disabled_races != 'undefined' && typeof mn_races != 'undefined') drop(mn_races, g_disabled_races);
    if (typeof g_disabled_classes != 'undefined' && typeof mn_classes != 'undefined') drop(mn_classes, g_disabled_classes);
})();
