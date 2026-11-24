-- Temucraft: which races and classes the server lets players be, read by the site instead of a fixed list.
--   aowow_chr_pairs     race and class pairs from world.playercreateinfo (refilled by `php aowow --sql=races`)
--   aowow_chr_disabled  races (type 1) or classes (type 2) an admin turns off by hand, whatever the server has
-- After a change run `php aowow --sql=races` (writes config/races.inc.php and static/js/races-custom.js).
CREATE TABLE IF NOT EXISTS `aowow_chr_pairs` (
  `raceId`  tinyint unsigned NOT NULL,
  `classId` tinyint unsigned NOT NULL,
  PRIMARY KEY (`raceId`, `classId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `aowow_chr_disabled` (
  `type`    tinyint unsigned NOT NULL COMMENT '1 race, 2 class',
  `id`      tinyint unsigned NOT NULL,
  `comment` varchar(255)     NOT NULL DEFAULT '',
  PRIMARY KEY (`type`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
