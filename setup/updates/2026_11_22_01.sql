-- Temucraft: race masks as 32 bits; smallint only held races 1-16 (custom races go up to 31)
ALTER TABLE `aowow_spell` MODIFY `reqRaceMask` int unsigned NOT NULL DEFAULT 0;
ALTER TABLE `aowow_quests` MODIFY `reqRaceMask` int unsigned NOT NULL DEFAULT 0;
UPDATE `aowow_dbversion` SET `sql` = CONCAT(`sql`, ' spell quests');
