<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


// tabId 1: Tools g_initHeader()
// Temucraft companion: your characters' followers, missions, expeditions and disguises on the web, and missions to
// start or collect from here. Needs a site account linked to the game account (same link as the quest tracker).
//   ?companion=data              everything for the linked account (JSON)
//   ?companion=start / claim     POST realm, guid (+ slot, followers): queued orders, carried out by the server
//                                (mod-temucraft-mission-table) right away when the character is online, else at login
class CompanionPage extends GenericPage
{
    protected $tpl      = 'tool';
    protected $tabId    = 1;
    protected $path     = [1, 16];
    protected $mode     = CACHE_TYPE_NONE;
    protected $scripts  = array(
        [SC_JS_FILE,  'js/companion.js'],
        [SC_CSS_FILE, 'css/tools.css'],
        [SC_CSS_FILE, 'css/companion.css']
    );

    protected $toolId   = 'companion';
    protected $toolInit = 'AoCompanion.init';
    protected $config   = [];

    private const THREATS = ['', 'Hazardous Ground', 'Lethal Lackeys', 'Area Assault', 'Hexes', 'Crushing Blow', 'Hordes', 'Arcane Barrage', 'Race Against Time', 'Berserk Fury'];
    private const TRAITS  = ['', 'Swift Feet', 'Gold Nose', 'Keen Mind', 'Lucky', 'Watchful'];

    public function __construct($pageCall, $pageParam)
    {
        parent::__construct($pageCall, $pageParam);

        $param = (string)$pageParam;
        if ($param == 'data')
        {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: private, no-store');
            exit(Util::toJSON(self::data()));
        }

        if ($param == 'start' || $param == 'claim')
        {
            header('Content-Type: application/json; charset=utf-8');
            if ($_SERVER['REQUEST_METHOD'] != 'POST')
                exit(Util::toJSON(['error' => 'POST only']));
            exit(Util::toJSON(['error' => self::order($param, (int)($_POST['realm'] ?? 0), (int)($_POST['guid'] ?? 0), (int)($_POST['slot'] ?? 0), (string)($_POST['followers'] ?? ''))]));
        }

        $this->name   = Lang::main('companion');
        $this->config = array(
            'host'     => Cfg::get('HOST_URL'),
            'loggedIn' => (bool)User::$id,
            'canLink'  => QuestCompletion::canLink(),
            'linked'   => (bool)QuestCompletion::account()
        );
    }

    private static function hasTable($db, string $table) : bool
    {
        return (bool)$db->selectCell('SELECT 1 FROM information_schema.TABLES WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ?', $table);
    }

    // the character, if it belongs to the linked game account
    private static function ownChar(int $realm, int $guid) : ?array
    {
        foreach (QuestCompletion::characters() as $c)
            if ($c[0] == $realm && $c[1] == $guid)
                return $c;
        return null;
    }

    private static function data() : array
    {
        if (!QuestCompletion::account())
            return ['error' => 'Link your game account first.', 'chars' => []];

        $world = DB::isConnectable(DB_WORLD) ? DB::World() : null;
        $followerTpl = $missionTpl = $disguises = [];
        if ($world && self::hasTable($world, 'mod_temucraft_follower_template'))
            $followerTpl = $world->select('SELECT `id` AS ARRAY_KEY, `name`, `roles`, `abilities`, `traits` FROM mod_temucraft_follower_template') ?: [];
        if ($world && self::hasTable($world, 'mod_temucraft_mission_template'))
            $missionTpl = $world->select('SELECT `id` AS ARRAY_KEY, `name`, `type`, `level`, `item_level`, `duration`, `slots`, `threats`, `cost` FROM mod_temucraft_mission_template') ?: [];
        if ($world && self::hasTable($world, 'mod_temucraft_disguise'))
            $disguises = $world->select('SELECT `id` AS ARRAY_KEY, `name`, `required_level` FROM mod_temucraft_disguise') ?: [];
        $mapNames = DB::Aowow()->selectCol('SELECT `mapId` AS ARRAY_KEY, MIN(`name_loc0`) FROM ?_zones WHERE `mapId` > 1 AND `parentArea` = 0 GROUP BY `mapId`') ?: [];

        $names = fn(string $csv, array $list) => array_values(array_filter(array_map(fn($i) => $list[(int)$i] ?? '', explode(',', $csv))));
        $now   = time();
        $out   = ['now' => $now, 'chars' => []];
        foreach (QuestCompletion::characters() as [$realm, $guid, $name, $race, $class, $level, $realmName])
        {
            $db   = DB::Characters($realm);
            $char = ['realm' => $realm, 'guid' => $guid, 'name' => $name, 'race' => $race, 'class' => $class, 'level' => $level, 'realmName' => $realmName,
                     'online' => (bool)$db->selectCell('SELECT `online` FROM characters WHERE `guid` = ?d', $guid),
                     'followers' => [], 'offers' => [], 'running' => [], 'expeditions' => [], 'wallet' => null, 'disguises' => [], 'orders' => 0];

            if (self::hasTable($db, 'mod_temucraft_follower'))
                foreach ($db->select('SELECT `id`, `template_id`, `level`, `xp`, `item_level`, `quality`, `activity_mask`, `state` FROM mod_temucraft_follower WHERE `owner` = ?d ORDER BY `id`', $guid) ?: [] as $f)
                {
                    $t = $followerTpl[$f['template_id']] ?? null;
                    $char['followers'][] = array(
                        'id' => (int)$f['id'], 'name' => $t['name'] ?? '?', 'roles' => (int)($t['roles'] ?? 4), 'level' => (int)$f['level'],
                        'ilvl' => (int)$f['item_level'], 'quality' => (int)$f['quality'], 'state' => (int)$f['state'], 'mask' => (int)$f['activity_mask'],
                        'counters' => $t ? $names($t['abilities'], self::THREATS) : [], 'traits' => $t ? $names($t['traits'], self::TRAITS) : []
                    );
                }

            if (self::hasTable($db, 'mod_temucraft_mission'))
                foreach ($db->select('SELECT `slot`, `mission_id`, `start_time`, `end_time`, `chance`, `followers` FROM mod_temucraft_mission WHERE `owner` = ?d ORDER BY `slot`', $guid) ?: [] as $m)
                {
                    $t = $missionTpl[$m['mission_id']] ?? null;
                    if (!$t)
                        continue;
                    if (!$m['start_time'])
                        $char['offers'][] = array('slot' => (int)$m['slot'], 'name' => $t['name'], 'type' => (int)$t['type'], 'level' => (int)$t['level'],
                            'ilvl' => (int)$t['item_level'], 'duration' => (int)$t['duration'], 'slots' => (int)$t['slots'], 'cost' => (int)$t['cost'],
                            'threats' => $names($t['threats'], self::THREATS));
                    else
                        $char['running'][] = array('slot' => (int)$m['slot'], 'name' => $t['name'], 'chance' => (int)$m['chance'],
                            'left' => max(0, (int)$m['end_time'] - $now), 'followers' => array_map('intval', array_filter(explode(',', $m['followers']))));
                }

            if (self::hasTable($db, 'mod_temucraft_expedition_progress'))
                foreach ($db->select('SELECT `map`, `best_tier`, `completions` FROM mod_temucraft_expedition_progress WHERE `owner` = ?d AND `completions` > 0 ORDER BY `best_tier` DESC', $guid) ?: [] as $e)
                    $char['expeditions'][] = ['map' => (int)$e['map'], 'name' => $mapNames[$e['map']] ?? ('Map '.$e['map']), 'tier' => (int)$e['best_tier'], 'runs' => (int)$e['completions']];
            if (self::hasTable($db, 'mod_temucraft_expedition_wallet'))
                if ($w = $db->selectRow('SELECT `shards`, `keys` FROM mod_temucraft_expedition_wallet WHERE `owner` = ?d', $guid))
                    $char['wallet'] = ['fragments' => (int)$w['shards'], 'keys' => (int)$w['keys']];

            if ($class == 4 && self::hasTable($db, 'mod_temucraft_disguise_known'))
                foreach ($db->selectCol('SELECT `disguise` FROM mod_temucraft_disguise_known WHERE `owner` = ?d', $guid) ?: [] as $d)
                    if (isset($disguises[$d]))
                        $char['disguises'][] = $disguises[$d]['name'];

            if (self::hasTable($db, 'mod_temucraft_web_order'))
                $char['orders'] = (int)$db->selectCell('SELECT COUNT(*) FROM mod_temucraft_web_order WHERE `owner` = ?d AND `done_at` = 0', $guid);

            $out['chars'][] = $char;
        }
        return $out;
    }

    private static function order(string $kind, int $realm, int $guid, int $slot, string $followers) : string
    {
        if (!QuestCompletion::account())
            return 'Link your game account first.';
        if (!self::ownChar($realm, $guid))
            return 'That is not one of your characters.';
        $db = DB::Characters($realm);
        if (!self::hasTable($db, 'mod_temucraft_web_order'))
            return 'The server does not take orders from the web yet.';
        if ($db->selectCell('SELECT COUNT(*) FROM mod_temucraft_web_order WHERE `owner` = ?d AND `done_at` = 0', $guid) >= 10)
            return 'Too many orders are waiting already.';

        $ids = implode(',', array_slice(array_unique(array_filter(array_map('intval', explode(',', $followers)))), 0, 3));
        if ($kind == 'start' && (!$slot || $ids === ''))
            return 'Pick a mission and its followers.';

        $db->query('INSERT INTO mod_temucraft_web_order (`owner`, `action`, `slot`, `followers`, `created_at`) VALUES (?d, ?, ?d, ?, ?d)',
            $guid, $kind, $kind == 'start' ? $slot : 0, $kind == 'start' ? $ids : '', time());
        return '';
    }

    protected function generateContent() { }

    protected function generateTitle()
    {
        array_unshift($this->title, $this->name);
    }

    protected function generatePath() { }
}

?>
