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

        // custom DBCs may hold names saved twice as UTF-8 ('åœ°ç²¾' for '地精'): undo that
        foreach (DB::Aowow()->select('SELECT `id` AS ARRAY_KEY, `name_loc0`, `name_loc2`, `name_loc3`, `name_loc4`, `name_loc6`, `name_loc8` FROM ?_races') as $id => $names)
            foreach ($names as $col => $name)
                if ($name !== null && ($fixed = $this->undoDoubleUtf8($name)) !== $name)
                    DB::Aowow()->query('UPDATE ?_races SET ?# = ? WHERE `id` = ?d', $col, $fixed, $id);

        // add classMask
        DB::Aowow()->query('UPDATE ?_races r JOIN (SELECT BIT_OR(1 << (`classId` - 1)) AS "classMask", `raceId` FROM dbc_charbaseinfo GROUP BY `raceId`) cbi ON cbi.`raceId` = r.id SET r.`classMask` = cbi.`classMask`');

        // add cuFlags
        // listed: player races (ids 1-30) that at least one class can be; NPC races and classless ones are hidden
        DB::Aowow()->query('UPDATE ?_races SET `cuFlags` = `cuFlags` | ?d WHERE `id` NOT BETWEEN 1 AND 30 OR `classMask` = 0 OR `flags` & 0x1', CUSTOM_EXCLUDE_FOR_LISTVIEW);

        $this->reapplyCCFlags('races', Type::CHR_RACE);

        $this->syncPlayable();
        $this->writeCustomRaces();

        return true;
    }

    private function undoDoubleUtf8(string $s) : string
    {
        if (!preg_match('/[\x80-\xFF]/', $s))
            return $s;
        $raw = mb_convert_encoding($s, 'Windows-1252', 'UTF-8');   // only when the way back is lossless and gives real UTF-8
        return $raw !== $s && mb_check_encoding($raw, 'UTF-8') && mb_convert_encoding($raw, 'UTF-8', 'Windows-1252') === $s ? $raw : $s;
    }

    // Which races and classes the server lets players make: world.playercreateinfo has one row per race and class
    // pair a new character can be. The pairs are kept in ?_chr_pairs; ?_chr_disabled holds what an admin turned off
    // by hand (type 1 race, 2 class). A race or class with no pair left, or turned off, is not playable here.
    private function syncPlayable() : void
    {
        $pairs = DB::World()->select('SELECT DISTINCT `race`, `class` FROM playercreateinfo') ?: [];
        if (!$pairs)
        {
            CLI::write('[races] world.playercreateinfo is empty or missing: kept the last known race and class pairs', CLI::LOG_WARN);
            return;
        }

        DB::Aowow()->query('DELETE FROM ?_chr_pairs');
        foreach (array_chunk($pairs, 200) as $chunk)
            DB::Aowow()->query('INSERT IGNORE INTO ?_chr_pairs (`raceId`, `classId`) VALUES '.implode(', ', array_map(fn($p) => sprintf('(%d, %d)', $p['race'], $p['class']), $chunk)));
    }

    // [races => [id => 1], classes => [id => 1]] that can be made on this server (empty: no pair data, keep all)
    private function chrPlayable() : array
    {
        $out = ['races' => [], 'classes' => []];
        $off = ['races' => [], 'classes' => []];
        foreach (DB::Aowow()->select('SELECT `type`, `id` FROM ?_chr_disabled') ?: [] as $d)
            $off[$d['type'] == 1 ? 'races' : 'classes'][(int)$d['id']] = 1;

        foreach (DB::Aowow()->select('SELECT `raceId`, `classId` FROM ?_chr_pairs') ?: [] as $p)
            if (empty($off['races'][$p['raceId']]) && empty($off['classes'][$p['classId']]))
            {
                $out['races'][(int)$p['raceId']]    = 1;
                $out['classes'][(int)$p['classId']] = 1;
            }

        $out['off'] = $off;
        return $out;
    }

    // The server's own races: race masks for PHP (config/races.inc.php) and names, files and sides for the javascript
    // (static/js/races-custom.js). Stock 3.3.5a gives the stock masks and an empty script.
    private function writeCustomRaces() : void
    {
        $races = DB::Aowow()->select('SELECT `id` AS ARRAY_KEY, `side`, `fileString`, `classMask`, `flags`, `name_loc0`, `name_loc2`, `name_loc3`, `name_loc4`, `name_loc6`, `name_loc8` FROM ?_races WHERE `id` BETWEEN 1 AND 31');
        $play = $this->chrPlayable();
        $all = $alliance = $horde = 0;
        $custom = $listed = [];
        foreach ($races as $id => $r)
        {
            // no class can be it, not playable in the DBC, or the server has no character for it (or an admin turned it off)
            $off = !$r['classMask'] || ($r['flags'] & 0x1) || ($play['races'] && empty($play['races'][$id])) || !empty($play['off']['races'][$id]);
            if ($off)
            {
                if ($r['classMask'] && !($r['flags'] & 0x1))   // a real player race the server turned off: off the list pages too
                    DB::Aowow()->query('UPDATE ?_races SET `cuFlags` = `cuFlags` | ?d WHERE `id` = ?d', CUSTOM_EXCLUDE_FOR_LISTVIEW, $id);
                if ($id <= 30)                              // retail player race: listed with name and icon, not in menus or masks
                    $listed[$id] = array(
                        'file'  => strtolower($r['fileString']),
                        'names' => array_filter([0 => $r['name_loc0'], 2 => $r['name_loc2'], 3 => $r['name_loc3'], 4 => $r['name_loc4'], 6 => $r['name_loc6'], 8 => $r['name_loc8']])
                    );
                continue;
            }
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

        // classes: every stock class the server lets someone be (no pair data: all of them)
        $classAll = 0;
        foreach (ChrClass::cases() as $cl)
            if ((!$play['classes'] || !empty($play['classes'][$cl->value])) && empty($play['off']['classes'][$cl->value]))
                $classAll |= $cl->toMask();
        $classAll = $classAll ?: 0x5FF;
        // turned off classes leave the class lists (turning one on again: run --sql=classes, then --sql=races)
        DB::Aowow()->query('UPDATE ?_classes SET `cuFlags` = `cuFlags` | ?d WHERE (1 << (`id` - 1)) & ?d = 0', CUSTOM_EXCLUDE_FOR_LISTVIEW, $classAll);
        $offClasses = [];
        foreach (ChrClass::cases() as $cl)
            if (!($classAll & $cl->toMask()))
                $offClasses[] = $cl->value;
        $offRaces = [];
        foreach ($races as $id => $r)
            if (!((1 << ($id - 1)) & $all) && $r['classMask'] && !($r['flags'] & 0x1))
                $offRaces[] = $id;

        $php = "<?php\n// written by `php aowow --sql=races`: the playable races and classes of this server\n".
               sprintf("define('AOWOW_RACE_MASK_ALLIANCE', 0x%X);\ndefine('AOWOW_RACE_MASK_HORDE', 0x%X);\ndefine('AOWOW_RACE_MASK_ALL', 0x%X);\ndefine('AOWOW_CLASS_MASK_ALL', 0x%X);\n", $alliance, $horde, $all, $classAll);
        if (!file_put_contents('config/races.inc.php', $php))
            CLI::write('[races] could not write config/races.inc.php', CLI::LOG_ERROR);

        $js = "/* written by `php aowow --sql=races`: the server's own playable races */\n".
              'var g_custom_races = '.json_encode($custom, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT).";\n".
              'var g_listed_races = '.json_encode($listed, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT).";\n".
              'var g_disabled_races = '.json_encode($offRaces).";\n".
              'var g_disabled_classes = '.json_encode($offClasses).";\n".
              file_get_contents('setup/tools/filegen/templates/races-custom.js.in');
        if (!file_put_contents('static/js/races-custom.js', $js))
            CLI::write('[races] could not write static/js/races-custom.js', CLI::LOG_ERROR);
        else
            CLI::write('[races] '.count($custom).' custom race(s) written to config/races.inc.php and static/js/races-custom.js', CLI::LOG_OK);
    }
});

?>
