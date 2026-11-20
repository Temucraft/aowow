-- Temucraft: expansion tags (setup/temucraft/expansions.json, made by setup/tools/temucraft-expansions.py)
-- 0 = stock 3.3.5 (no badge), 3 Cataclysm, 4 Mists of Pandaria, 5-10 later expansions, 20 Temucraft, 21 Lost Lands, 22 Forever
ALTER TABLE `aowow_items`    ADD COLUMN `expansion` tinyint unsigned NOT NULL DEFAULT 0, ADD INDEX `idx_expansion` (`expansion`);
ALTER TABLE `aowow_creature` ADD COLUMN `expansion` tinyint unsigned NOT NULL DEFAULT 0, ADD INDEX `idx_expansion` (`expansion`);
ALTER TABLE `aowow_objects`  ADD COLUMN `expansion` tinyint unsigned NOT NULL DEFAULT 0, ADD INDEX `idx_expansion` (`expansion`);
ALTER TABLE `aowow_quests`   ADD COLUMN `expansion` tinyint unsigned NOT NULL DEFAULT 0, ADD INDEX `idx_expansion` (`expansion`);
ALTER TABLE `aowow_spell`    ADD COLUMN `expansion` tinyint unsigned NOT NULL DEFAULT 0, ADD INDEX `idx_expansion` (`expansion`);
UPDATE `aowow_dbversion` SET `sql` = CONCAT(IFNULL(`sql`, ''), ' expansions');
