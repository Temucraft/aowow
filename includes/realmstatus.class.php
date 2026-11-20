<?php

if (!defined('AOWOW_REVISION'))
    die('illegal access');


/*  Realm status and the live player map (?realm-status, ?player-map)
 *
 *  Reads realmlist and uptime (auth) and the online characters (characters db of each realm). Results are cached in
 *  files for CACHE seconds, so many visitors (and the launcher) cost one round of queries per half minute.
 *
 *  Privacy:
 *    - never sent: account names or ids, IPs, character guids, realm addresses
 *    - status and counts: only numbers (players, factions, classes, races, level spread)
 *    - the map: name, level, race, class, gender, guild (if playermap_guilds), zone; a position only in open world
 *      zones (no dungeons, raids, battlegrounds or arenas)
 *    - hidden from the map: characters in ?_playermap_hidden (players tick "Hide on the map" on the map page with
 *      their linked game account, or staff add rows by hand), GMs with .gm on or .gm visible off (characters.extra_flags),
 *      and every character of a staff account (auth account_access) while playermap_hide_staff is on.
 *      Hidden characters still count in the totals, but not in any per-character list.
 *    - config playermap_enable = 0 turns the map and its data off (the realm status stays)
 */
class RealmStatus
{
    public const CACHE        = 30;                         // seconds
    public const CONTINENTS   = [0, 1, 530, 571];           // Map.dbc ids drawn as continents
    private const EXTRA_GM    = 0x01 | 0x10;                // PLAYER_EXTRA_GM_ON | PLAYER_EXTRA_GM_INVISIBLE
    private const SOCKET_WAIT = 1.0;                        // seconds per connect try

    /* config with a default, so the pages work before the update file is applied */
    public static function cfg(string $key, int $default) : int
    {
        $v = DB::Aowow()->selectCell('SELECT `value` FROM ?_config WHERE `key` = ?', $key);
        return $v === null || $v === false || $v === '' ? $default : (int)$v;
    }

    public static function mapEnabled() : bool
    {
        return (bool)self::cfg('playermap_enable', 1);
    }

    /* realms of this game build with a characters db configured; GM only realms stay out */
    public static function realms() : array
    {
        if (!DB::isConnectable(DB_AUTH))
            return [];

        $out = [];
        foreach (DB::Auth()->select('SELECT `id` AS ARRAY_KEY, `name`, `address`, `localAddress`, `port`, `allowedSecurityLevel` FROM realmlist WHERE `gamebuild` = ?d ORDER BY `id`', WOW_BUILD) ?: [] as $id => $r)
            if ($r['allowedSecurityLevel'] <= SEC_PLAYER && DB::isConnectable(DB_CHARACTERS . $id))
                $out[$id] = $r;

        return $out;
    }

    private static function cacheFile(string $what) : string
    {
        $dir = Cfg::get('CACHE_DIR') ?: 'cache/template';
        return rtrim($dir, '/').'/realm-'.$what.'.json';
    }

    private static function cached(string $what, callable $make) : array
    {
        $file = self::cacheFile($what);
        if (is_file($file) && filemtime($file) > time() - self::CACHE)
            if (is_array($data = json_decode((string)file_get_contents($file), true)))
                return $data;

        $data = $make();
        @file_put_contents($file, json_encode($data), LOCK_EX);
        return $data;
    }

    public static function forget() : void
    {
        @unlink(self::cacheFile('map'));
    }

    /* the worldserver answers on its port: a short connect, nothing is sent */
    private static function isUp(array $realm) : bool
    {
        foreach (array_unique(array_filter([$realm['address'], $realm['localAddress']])) as $host)
        {
            $errNo = $errStr = null;
            if ($s = @fsockopen($host, (int)$realm['port'], $errNo, $errStr, self::SOCKET_WAIT))
            {
                fclose($s);
                return true;
            }
        }
        return false;
    }

    private static function staffAccounts(int $realmId) : array
    {
        if (!self::cfg('playermap_hide_staff', 1))
            return [];

        return DB::Auth()->selectCol('SELECT DISTINCT `id` FROM account_access WHERE `gmlevel` > 0 AND (`RealmID` = -1 OR `RealmID` = ?d)', $realmId) ?: [];
    }

    private static function hiddenGuids(int $realmId) : array
    {
        return DB::Aowow()->selectCol('SELECT `guid` FROM ?_playermap_hidden WHERE `realmId` = ?d', $realmId) ?: [];
    }

    /* online characters of a realm, with a flag for those the map must not show */
    private static function online(int $realmId) : array
    {
        $rows = DB::Characters($realmId)->select(
           'SELECT c.`guid`, c.`account`, c.`name`, c.`race`, c.`class`, c.`gender`, c.`level`, c.`map`, c.`zone`, c.`position_x`, c.`position_y`, c.`extra_flags`, g.`name` AS "guild"
            FROM   characters c
            LEFT JOIN guild_member gm ON gm.`guid` = c.`guid`
            LEFT JOIN guild g ON g.`guildid` = gm.`guildid`
            WHERE  c.`online` = 1'
        ) ?: [];

        $staff  = array_flip(self::staffAccounts($realmId));
        $hidden = array_flip(self::hiddenGuids($realmId));
        foreach ($rows as &$r)
        {
            $r['staff'] = isset($staff[$r['account']]) || ($r['extra_flags'] & self::EXTRA_GM);
            $r['hide']  = $r['staff'] || isset($hidden[$r['guid']]);
        }

        return $rows;
    }

    private static function side(int $race) : int
    {
        $r = ChrRace::tryFrom($race);
        return $r ? $r->getSide() : SIDE_NONE;
    }

    /* ---------- realm status ---------- */

    public static function status() : array
    {
        $data = self::cached('status', function () {
            $out = ['generated' => time(), 'cacheSeconds' => self::CACHE, 'realms' => []];
            foreach (self::realms() as $id => $realm)
            {
                $up    = self::isUp($realm);
                $chars = $up ? array_filter(self::online($id), fn($c) => !$c['staff']) : [];
                $n     = count($chars);

                $uptime = DB::Auth()->selectRow('SELECT `starttime`, `uptime`, `maxplayers` FROM uptime WHERE `realmid` = ?d ORDER BY `starttime` DESC LIMIT 1', $id);
                $maxUp  = (int)DB::Auth()->selectCell('SELECT MAX(`maxplayers`) FROM uptime WHERE `realmid` = ?d', $id);

                // all-time peak: our own record, the worldserver's own max per run, and now
                $peak = DB::Aowow()->selectRow('SELECT `peak`, `peakTime` FROM ?_realm_peak WHERE `realmId` = ?d', $id) ?: ['peak' => 0, 'peakTime' => 0];
                if ($n > $peak['peak'] || $maxUp > $peak['peak'])
                {
                    $peak = $n >= $maxUp ? ['peak' => $n, 'peakTime' => time()] : ['peak' => $maxUp, 'peakTime' => (int)($uptime['starttime'] ?? time())];
                    DB::Aowow()->query('REPLACE INTO ?_realm_peak (`realmId`, `peak`, `peakTime`) VALUES (?d, ?d, ?d)', $id, $peak['peak'], $peak['peakTime']);
                }

                $sides = [SIDE_ALLIANCE => 0, SIDE_HORDE => 0];
                $classes = $races = [];
                $levels  = array_fill(0, 9, 0);              // 1-9, 10-19, .. 70-79, 80+
                foreach ($chars as $c)
                {
                    $s = self::side($c['race']);
                    if (isset($sides[$s]))
                        $sides[$s]++;
                    $classes[$c['class']] = ($classes[$c['class']] ?? 0) + 1;
                    $races[$c['race']]    = ($races[$c['race']] ?? 0) + 1;
                    $levels[min(8, intdiv($c['level'], 10))]++;
                }
                ksort($classes);
                ksort($races);

                $started = $up && $uptime ? (int)$uptime['starttime'] : 0;
                $out['realms'][] = array(
                    'id'        => (int)$id,
                    'name'      => $realm['name'],
                    'online'    => $up,
                    'players'   => $n,
                    'alliance'  => $sides[SIDE_ALLIANCE],
                    'horde'     => $sides[SIDE_HORDE],
                    'peak'      => (int)$peak['peak'],
                    'peakTime'  => (int)$peak['peakTime'],
                    'startedAt' => $started,
                    'uptime'    => $started ? max(0, time() - $started) : 0,
                    'classes'   => $classes,
                    'races'     => $races,
                    'levels'    => $levels
                );
            }
            return $out;
        });

        // id => count stays an object in JSON, also when empty
        foreach ($data['realms'] as &$r)
            [$r['classes'], $r['races']] = [(object)$r['classes'], (object)$r['races']];

        return $data;
    }

    /* ---------- player map ---------- */

    // zone id => [type, mapId] of open world zones; type 0 = MAP_TYPE_ZONE
    private static function zoneInfo() : array
    {
        static $z = null;
        if ($z === null)
            $z = DB::Aowow()->select('SELECT `id` AS ARRAY_KEY, `type`, `mapId` FROM ?_zones') ?: [];
        return $z;
    }

    public static function mapData() : array
    {
        if (!self::mapEnabled())
            return ['disabled' => true, 'players' => []];

        $guilds = (bool)self::cfg('playermap_guilds', 1);
        return self::cached('map', function () use ($guilds) {
            $zones = self::zoneInfo();
            $out   = ['generated' => time(), 'cacheSeconds' => self::CACHE, 'realms' => [], 'players' => []];
            foreach (self::realms() as $id => $realm)
            {
                if (!self::isUp($realm))
                    continue;

                $out['realms'][] = ['id' => (int)$id, 'name' => $realm['name']];
                foreach (self::online($id) as $c)
                {
                    if ($c['hide'])
                        continue;

                    $p = array(
                        'realm'  => (int)$id,
                        'name'   => $c['name'],
                        'level'  => (int)$c['level'],
                        'race'   => (int)$c['race'],
                        'class'  => (int)$c['class'],
                        'gender' => (int)$c['gender'],
                        'side'   => self::side($c['race']),
                        'zone'   => (int)$c['zone']
                    );
                    if ($guilds && $c['guild'])
                        $p['guild'] = $c['guild'];

                    // position in % of the zone's own map; only out in the open world
                    $z = $zones[$c['zone']] ?? null;
                    if ($z && $z['type'] == MAP_TYPE_ZONE && $z['mapId'] == $c['map'])
                    {
                        $pt = Game::worldPosToZonePos((int)$c['map'], (float)$c['position_x'], (float)$c['position_y'], (int)$c['zone']);
                        if ($pt && $pt[0]['areaId'] == $c['zone'])
                            [$p['x'], $p['y']] = [$pt[0]['posX'], $pt[0]['posY']];
                    }

                    $out['players'][] = $p;
                }
            }

            usort($out['players'], fn($a, $b) => strcasecmp($a['name'], $b['name']));
            return $out;
        });
    }

    /* the linked game account's characters with their hide flag (map page) */
    public static function ownCharacters() : array
    {
        if (!class_exists('QuestCompletion') || !QuestCompletion::account())
            return [];

        $hidden = [];
        foreach (DB::Aowow()->select('SELECT `realmId`, `guid` FROM ?_playermap_hidden') ?: [] as $h)
            $hidden[$h['realmId'].':'.$h['guid']] = 1;

        $out = [];
        foreach (QuestCompletion::characters() as [$realm, $guid, $name, $race, $class, $level, $realmName])
            $out[] = ['realm' => $realm, 'guid' => $guid, 'name' => $name, 'level' => $level, 'race' => $race, 'class' => $class, 'realmName' => $realmName, 'hidden' => isset($hidden[$realm.':'.$guid])];

        return $out;
    }

    public static function setHidden(int $realm, int $guid, bool $hide) : string
    {
        if (!class_exists('QuestCompletion') || !QuestCompletion::account())
            return 'Link your game account first.';

        $own = false;
        foreach (QuestCompletion::characters() as $c)
            if ($c[0] == $realm && $c[1] == $guid)
                $own = true;
        if (!$own)
            return 'That is not one of your characters.';

        if ($hide)
            DB::Aowow()->query('REPLACE INTO ?_playermap_hidden (`realmId`, `guid`, `added`) VALUES (?d, ?d, ?d)', $realm, $guid, time());
        else
            DB::Aowow()->query('DELETE FROM ?_playermap_hidden WHERE `realmId` = ?d AND `guid` = ?d', $realm, $guid);

        self::forget();
        return '';
    }

    /* localized names the pages and the launcher need for the ids */
    public static function names() : array
    {
        $classes = $races = [];
        foreach ([1, 2, 3, 4, 5, 6, 7, 8, 9, 11] as $c)
            $classes[$c] = Lang::game('cl', $c);

        $loc = Lang::getLocale()->value;
        foreach (DB::Aowow()->select('SELECT `id` AS ARRAY_KEY, `name_loc0`, `name_loc'.$loc.'` AS "name" FROM ?_races') ?: [] as $id => $r)
            $races[$id] = $r['name'] ?: $r['name_loc0'];

        return ['classes' => $classes, 'races' => $races];
    }

    public static function zoneNames(array $ids) : array
    {
        if (!$ids)
            return [];

        $loc = Lang::getLocale()->value;
        $out = [];
        foreach (DB::Aowow()->select('SELECT `id` AS ARRAY_KEY, `name_loc0`, `name_loc'.$loc.'` AS "name" FROM ?_zones WHERE `id` IN (?a)', array_values(array_unique($ids))) ?: [] as $id => $z)
            $out[$id] = $z['name'] ?: $z['name_loc0'];
        return $out;
    }
}

?>
