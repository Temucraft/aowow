/* written by `php aowow --sql=races`: the server's own playable races */
var g_custom_races = {"9":{"file":"goblin","side":2,"names":{"0":"Goblin","2":"Gobelin","3":"Goblin","4":"地精","6":"Goblin","8":"Гоблин"}},"12":{"file":"worgen","side":1,"names":{"0":"Worgen","2":"Worgen","3":"Worgen","4":"狼人","6":"Huargen","8":"Ворген"}},"13":{"file":"alliancepandaren","side":1,"names":{"0":"Pandaren"}},"14":{"file":"hordepandaren","side":2,"names":{"0":"Pandaren"}},"15":{"file":"nightborne","side":2,"names":{"0":"Nightborne"}},"16":{"file":"highmountaintauren","side":2,"names":{"0":"Highmountain Tauren"}},"17":{"file":"voidelf","side":1,"names":{"0":"Void Elf"}},"18":{"file":"lightforgeddraenei","side":1,"names":{"0":"Lightforged Draenei"}},"19":{"file":"zandalaritroll","side":2,"names":{"0":"Zandalari Troll"}},"20":{"file":"kultiran","side":1,"names":{"0":"Kul Tiran"}}};
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
