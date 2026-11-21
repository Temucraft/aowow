<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


/*  Temucraft mission table data for the site (?missions and ?companion)
 *
 *  Names and the trait table are copied from mod-temucraft-followers (src/TemucraftMissionChance.h). Keep them the
 *  same: the success chance in static/js/missionchance.js uses them and must give the same number as the server.
 *  Followers and missions come from the server's world database (mod_temucraft_follower_template,
 *  mod_temucraft_mission_template). Columns added by mission table part 2 are read only when they exist, so the pages
 *  also work against an older database.
 */
class TemucraftMissions
{
    public const TYPES    = ['Battle', 'Patrol', 'Treasure', 'Rare', 'Exploration', 'Training', 'Logistics', 'Profession'];
    public const THREATS  = ['', 'Hazardous Ground', 'Lethal Lackeys', 'Area Assault', 'Hexes', 'Crushing Blow', 'Hordes', 'Arcane Barrage', 'Race Against Time', 'Berserk Fury'];
    public const ENVS     = ['', 'Forest', 'Mountains', 'Plains', 'Snow', 'Desert', 'Underground', 'Swamp', 'Jungle', 'Town'];
    public const ENEMIES  = ['', 'Undead', 'Beast', 'Dragonkin', 'Elemental', 'Demon', 'Giant', 'Humanoid', 'Troll', 'Vrykul', 'Nerubian', 'Construct', 'Ogre', 'Orc', 'Harpy', 'Aberration'];
    public const RACES    = ['', 'Human', 'Orc', 'Dwarf', 'Night Elf', 'Undead', 'Tauren', 'Gnome', 'Troll', '', 'Blood Elf', 'Draenei'];
    public const QUALITY  = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

    // trait effects (same numbers as the module)
    public const EFF_ALONE = 1, EFF_ALWAYS = 2, EFF_RACE_PAIR = 5, EFF_LONG = 6, EFF_SHORT = 7, EFF_TIME = 17, EFF_MENTOR = 18;
    public const EFF_GOLD = 100, EFF_XP = 101, EFF_ENVIRONMENT = 102, EFF_SLAYER = 103, EFF_MISSION_TYPE = 104, EFF_PROFESSION = 105, EFF_LUCKY = 106;

    // defaults of Temucraft.MissionTable.Chance.* (the site can't read worldserver.conf; change them in aowow_config)
    private const SETTINGS = ['missions_threat_weight' => 300, 'missions_lucky' => 5, 'missions_max_chance' => 200];

    private static function raceBit(int $race) : int
    {
        return $race ? 1 << ($race - 1) : 0;
    }

    /* id => [name, effect, param, amount2, amount3] */
    public static function traits() : array
    {
        $t = array(
            1  => ['Swift Feet',   self::EFF_TIME,         0, 75, 75],
            2  => ['Gold Nose',    self::EFF_GOLD,         0, 50, 50],
            3  => ['Keen Mind',    self::EFF_XP,           0, 50, 50],
            4  => ['Lucky',        self::EFF_LUCKY,        0, 0, 0],
            5  => ['Watchful',     self::EFF_MISSION_TYPE, (1 << 1) | (1 << 4), 50, 75],
            6  => ['Lone Wolf',    self::EFF_ALONE,        0, 80, 120],
            7  => ['Mentor',       self::EFF_MENTOR,       0, 0, 0],
            8  => ['Long Haul',    self::EFF_LONG,         8, 50, 75],
            9  => ['Quick Strike', self::EFF_SHORT,        4, 50, 75],
            10 => ['Veteran',      self::EFF_ALWAYS,       0, 30, 45],
            11 => ['Friend of Humans',       self::EFF_RACE_PAIR, self::raceBit(1), 50, 75],
            12 => ['Friend of Orcs',         self::EFF_RACE_PAIR, self::raceBit(2), 50, 75],
            13 => ['Friend of Dwarves',      self::EFF_RACE_PAIR, self::raceBit(3), 50, 75],
            14 => ['Friend of Elves',        self::EFF_RACE_PAIR, self::raceBit(4) | self::raceBit(10), 50, 75],
            15 => ['Friend of Gnomes',       self::EFF_RACE_PAIR, self::raceBit(7), 50, 75],
            16 => ['Friend of Tauren',       self::EFF_RACE_PAIR, self::raceBit(6), 50, 75],
            17 => ['Friend of Trolls',       self::EFF_RACE_PAIR, self::raceBit(8), 50, 75],
            18 => ['Friend of the Forsaken', self::EFF_RACE_PAIR, self::raceBit(5), 50, 75],
            19 => ['Friend of Draenei',      self::EFF_RACE_PAIR, self::raceBit(11), 50, 75]
        );
        foreach (['Woodland Guide', 'Mountain Born', 'Plains Runner', 'Frost Hardened', 'Sand Walker', 'Tunnel Rat', 'Bog Wader', 'Jungle Stalker', 'Street Wise'] as $i => $n)
            $t[21 + $i] = [$n, self::EFF_ENVIRONMENT, $i + 1, 60, 90];
        foreach (['Undead', 'Beast', 'Dragon', 'Elemental', 'Demon', 'Giant', 'Bandit', 'Troll', 'Vrykul', 'Nerubian', 'Construct', 'Ogre', 'Orc', 'Harpy', 'Void'] as $i => $n)
            $t[31 + $i] = [$n.' Slayer', self::EFF_SLAYER, $i + 1, 60, 90];
        foreach (['Alchemist', 'Blacksmith', 'Enchanter', 'Engineer', 'Herbalist', 'Scribe', 'Jeweler', 'Leatherworker', 'Miner', 'Skinner', 'Tailor', 'Cook', 'Angler', 'Medic'] as $i => $n)
            $t[51 + $i] = [$n, self::EFF_PROFESSION, $i + 1, 60, 90];
        return $t;
    }

    public static function settings() : array
    {
        $out = [];
        foreach (self::SETTINGS as $key => $default)
        {
            $v = DB::Aowow()->selectCell('SELECT `value` FROM ?_config WHERE `key` = ?', $key);
            $out[$key] = $v === null || $v === false || $v === '' ? $default : (int)$v;
        }
        return ['threatWeight' => $out['missions_threat_weight'], 'lucky' => $out['missions_lucky'], 'maxChance' => $out['missions_max_chance']];
    }

    /* everything the pages need to turn ids into words */
    public static function names() : array
    {
        $traits = [];
        foreach (self::traits() as $id => $t)
            $traits[$id] = $t;
        return array(
            'types'   => self::TYPES,
            'threats' => self::THREATS,
            'envs'    => self::ENVS,
            'enemies' => self::ENEMIES,
            'races'   => self::RACES,
            'quality' => self::QUALITY,
            'traits'  => (object)$traits
        );
    }

    public static function ids(string $csv) : array
    {
        return array_values(array_filter(array_map('intval', explode(',', $csv))));
    }

    private static function world()
    {
        return DB::isConnectable(DB_WORLD) ? DB::World() : null;
    }

    private static function columns($db, string $table) : array
    {
        return array_flip($db->selectCol('SELECT `COLUMN_NAME` FROM information_schema.COLUMNS WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ?', $table) ?: []);
    }

    /* id => follower template (ids as numbers, lists as arrays) */
    public static function followerTemplates() : array
    {
        static $cache = null;
        if ($cache !== null)
            return $cache;

        $cache = [];
        if (!($db = self::world()) || !($cols = self::columns($db, 'mod_temucraft_follower_template')))
            return $cache;

        $race = isset($cols['race']) ? '`race`' : '0';
        foreach ($db->select('SELECT `id` AS ARRAY_KEY, `creature_entry`, `name`, `roles`, `quality`, `abilities`, `traits`, `activity_mask`, `source`, `source_value`, `source_value2`, '.$race.' AS "race" FROM mod_temucraft_follower_template ORDER BY `id`') ?: [] as $id => $f)
            $cache[$id] = array(
                'id'        => (int)$id,
                'creature'  => (int)$f['creature_entry'],
                'name'      => $f['name'],
                'roles'     => (int)$f['roles'],
                'quality'   => (int)$f['quality'],
                'race'      => (int)$f['race'],
                'abilities' => self::ids($f['abilities']),
                'traits'    => self::ids($f['traits']),
                'mask'      => (int)$f['activity_mask'],
                'source'    => (int)$f['source'],
                'sourceValue'  => (int)$f['source_value'],
                'sourceValue2' => (int)$f['source_value2']
            );
        return $cache;
    }

    /* id => mission template */
    public static function missionTemplates() : array
    {
        static $cache = null;
        if ($cache !== null)
            return $cache;

        $cache = [];
        if (!($db = self::world()) || !($cols = self::columns($db, 'mod_temucraft_mission_template')))
            return $cache;

        $extra = '';
        foreach (['base_chance' => 50, 'threat_weights' => "''", 'environment' => 0, 'enemy_race' => 0, 'cooldown' => 0, 'location' => "''", 'required_trait' => 0] as $c => $default)
            $extra .= ', '.(isset($cols[$c]) ? '`'.$c.'`' : $default.' AS "'.$c.'"');

        foreach ($db->select('SELECT `id` AS ARRAY_KEY, `name`, `type`, `level`, `item_level`, `duration`, `slots`, `threats`, `cost`, `xp`, `gold`, `reward_item`, `reward_count`, `bonus_item`, `bonus_count`, `weight`'.$extra.' FROM mod_temucraft_mission_template ORDER BY `level`, `id`') ?: [] as $id => $m)
            $cache[$id] = array(
                'id'        => (int)$id,
                'name'      => $m['name'],
                'type'      => (int)$m['type'],
                'level'     => (int)$m['level'],
                'ilvl'      => (int)$m['item_level'],
                'duration'  => (int)$m['duration'],
                'slots'     => max(1, (int)$m['slots']),
                'threats'   => self::ids($m['threats']),
                'weights'   => array_map('intval', $m['threat_weights'] === '' ? [] : explode(',', $m['threat_weights'])),
                'cost'      => (int)$m['cost'],
                'xp'        => (int)$m['xp'],
                'gold'      => (int)$m['gold'],
                'item'      => (int)$m['reward_item'],
                'itemCount' => (int)$m['reward_count'],
                'bonus'     => (int)$m['bonus_item'],
                'bonusCount'=> (int)$m['bonus_count'],
                'weight'    => (int)$m['weight'],
                'base'      => (int)$m['base_chance'],
                'env'       => (int)$m['environment'],
                'enemy'     => (int)$m['enemy_race'],
                'cooldown'  => (int)$m['cooldown'],
                'location'  => $m['location'],
                'requiredTrait' => (int)$m['required_trait']
            );
        return $cache;
    }

    /* id => [name, quality, icon] of the reward items, from our own item table */
    public static function items(array $ids) : array
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if (!$ids)
            return [];

        $loc = Lang::getLocale()->value;
        $out = [];
        foreach (DB::Aowow()->select('SELECT i.`id` AS ARRAY_KEY, i.`name_loc0`, i.`name_loc'.$loc.'` AS "name", i.`quality`, ic.`name` AS "icon" FROM ?_items i LEFT JOIN ?_icons ic ON ic.`id` = i.`iconId` WHERE i.`id` IN (?a)', $ids) ?: [] as $id => $i)
            $out[$id] = [$i['name'] ?: $i['name_loc0'], (int)$i['quality'], (string)$i['icon']];
        return $out;
    }

    /* how a follower is found, in words */
    public static function sourceText(array $f) : string
    {
        $loc = Lang::getLocale()->value;
        switch ($f['source'])
        {
            case 0:
                return 'Everyone gets this follower at the start.';
            case 1:
                $q = DB::Aowow()->selectRow('SELECT `name_loc0`, `name_loc'.$loc.'` AS "name" FROM ?_quests WHERE `id` = ?d', $f['sourceValue']);
                return 'Quest: '.($q ? ($q['name'] ?: $q['name_loc0']) : '#'.$f['sourceValue']);
            case 2:
                $fa = DB::Aowow()->selectRow('SELECT `name_loc0`, `name_loc'.$loc.'` AS "name" FROM ?_factions WHERE `id` = ?d', $f['sourceValue']);
                $ranks = [4 => 'Friendly', 5 => 'Honored', 6 => 'Revered', 7 => 'Exalted'];
                return 'Reputation: '.($ranks[$f['sourceValue2']] ?? 'rank '.$f['sourceValue2']).' with '.($fa ? ($fa['name'] ?: $fa['name_loc0']) : '#'.$f['sourceValue']);
            case 3:
                $i = self::items([$f['sourceValue']]);
                return 'Item: '.($i[$f['sourceValue']][0] ?? '#'.$f['sourceValue']);
            default:
                return 'Not given out yet.';
        }
    }

    /* the public lists: followers that can be found (not GM only), all missions, reward item names */
    public static function publicData() : array
    {
        $followers = [];
        foreach (self::followerTemplates() as $f)
        {
            if ($f['source'] >= 4)
                continue;
            $f['how'] = self::sourceText($f);
            unset($f['sourceValue'], $f['sourceValue2']);
            $followers[] = $f;
        }

        $missions = array_values(self::missionTemplates());
        $itemIds  = [];
        foreach ($missions as $m)
            array_push($itemIds, $m['item'], $m['bonus']);

        return array(
            'names'     => self::names(),
            'settings'  => self::settings(),
            'followers' => $followers,
            'missions'  => $missions,
            'items'     => (object)self::items($itemIds)
        );
    }
}

?>
