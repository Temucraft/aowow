<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');

if (!CLI)
    die('not in cli mode');


CLISetup::registerSetup("sql", new class extends SetupScript
{
    use TrCustomData;                                       // import custom data from DB

    protected $info = array(
        'races' => [[], CLISetup::ARGV_PARAM, 'Compiles data for type: PlayerRace from dbc.']
    );

    protected $dbcSourceFiles = ['chrraces', 'charbaseinfo'];

    public function generate(array $ids = []) : bool
    {
        DB::Aowow()->query('TRUNCATE ?_races');
        DB::Aowow()->query(
           'INSERT INTO ?_races
            SELECT      `id`, 0, `flags`, 0, `factionId`, 0, 0, `baseLanguage`, IF(`side` = 2, 0, `side` + 1), `fileString`, `name_loc0`, `name_loc1`, `name_loc2`, `name_loc3`, `name_loc4`, `name_loc5`, `name_loc6`, `name_loc7`, `name_loc8`, `expansion`
            FROM        dbc_chrraces'
        );

        // add classMask
        DB::Aowow()->query('UPDATE ?_races r JOIN (SELECT BIT_OR(1 << (`classId` - 1)) AS "classMask", `raceId` FROM dbc_charbaseinfo GROUP BY `raceId`) cbi ON cbi.`raceId` = r.id SET r.`classMask` = cbi.`classMask`');

        // add cuFlags
        DB::Aowow()->query('UPDATE ?_races SET `cuFlags` = ?d WHERE `flags` & ?d', CUSTOM_EXCLUDE_FOR_LISTVIEW, 0x1);

        $this->reapplyCCFlags('races', Type::CHR_RACE);

        $this->writeCustomRaces();

        return true;
    }

    // The server's own races: race masks for PHP (config/races.inc.php) and names, files and sides for the javascript
    // (static/js/races-custom.js). Stock 3.3.5a gives the stock masks and an empty script.
    private function writeCustomRaces() : void
    {
        $races = DB::Aowow()->select('SELECT `id` AS ARRAY_KEY, `side`, `fileString`, `classMask`, `flags`, `name_loc0`, `name_loc2`, `name_loc3`, `name_loc4`, `name_loc6`, `name_loc8` FROM ?_races WHERE `id` BETWEEN 1 AND 31');
        $all = $alliance = $horde = 0;
        $custom = [];
        foreach ($races as $id => $r)
        {
            if (!$r['classMask'] || ($r['flags'] & 0x1))    // no class can be it, or not playable
                continue;
            $bit = 1 << ($id - 1);
            $all |= $bit;
            if ($r['side'] == 1) $alliance |= $bit;
            if ($r['side'] == 2) $horde    |= $bit;
            if ($id == 9 || $id > 11)
                $custom[$id] = array(
                    'file'  => strtolower($r['fileString']),
                    'side'  => (int)$r['side'],
                    'names' => array_filter([0 => $r['name_loc0'], 2 => $r['name_loc2'], 3 => $r['name_loc3'], 4 => $r['name_loc4'], 6 => $r['name_loc6'], 8 => $r['name_loc8']])
                );
        }
        if (!$all)                                          // no data: keep stock values
            [$all, $alliance, $horde] = [0x6FF, 0x44D, 0x2B2];

        $php = "<?php\n// written by `php aowow --sql=races`: the playable races of this server\n".
               sprintf("define('AOWOW_RACE_MASK_ALLIANCE', 0x%X);\ndefine('AOWOW_RACE_MASK_HORDE', 0x%X);\ndefine('AOWOW_RACE_MASK_ALL', 0x%X);\n", $alliance, $horde, $all);
        if (!file_put_contents('config/races.inc.php', $php))
            CLI::write('[races] could not write config/races.inc.php', CLI::LOG_ERROR);

        $js = "/* written by `php aowow --sql=races`: the server's own playable races */\n".
              'var g_custom_races = '.json_encode($custom, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT).";\n".
              file_get_contents('setup/tools/filegen/templates/races-custom.js.in');
        if (!file_put_contents('static/js/races-custom.js', $js))
            CLI::write('[races] could not write static/js/races-custom.js', CLI::LOG_ERROR);
        else
            CLI::write('[races] '.count($custom).' custom race(s) written to config/races.inc.php and static/js/races-custom.js', CLI::LOG_OK);
    }
});

?>
