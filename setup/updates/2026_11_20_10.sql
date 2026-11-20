-- Temucraft: realm status and player map (?realm-status, ?player-map)
--   aowow_realm_peak       all-time peak of players online per realm
--   aowow_playermap_hidden characters that are not shown on the player map (players tick it on the map page; staff can add rows)
CREATE TABLE IF NOT EXISTS `aowow_realm_peak` (
  `realmId`  int unsigned NOT NULL,
  `peak`     int unsigned NOT NULL DEFAULT 0,
  `peakTime` int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`realmId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `aowow_playermap_hidden` (
  `realmId` int unsigned NOT NULL,
  `guid`    int unsigned NOT NULL COMMENT 'characters.guid',
  `added`   int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`realmId`, `guid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELETE FROM `aowow_config` WHERE `key` IN ('playermap_enable', 'playermap_guilds', 'playermap_hide_staff');
INSERT INTO `aowow_config` (`key`, `value`, `default`, `cat`, `flags`, `comment`) VALUES
    ('playermap_enable',     '1', '1', 1, 132, 'show the live player map (?player-map) and its data (default: enabled)'),
    ('playermap_guilds',     '1', '1', 1, 132, 'show guild names on the player map (default: enabled)'),
    ('playermap_hide_staff', '1', '1', 1, 132, 'keep characters of staff accounts (auth account_access) off the player map and out of the counts (default: enabled)');
