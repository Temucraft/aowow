-- Temucraft: mission table guide (?missions) and the success chance on ?companion
-- Keep these the same as Temucraft.MissionTable.Chance.* in the server's mod-temucraft-followers config,
-- so the site shows the chance the server rolls.
DELETE FROM `aowow_config` WHERE `key` IN ('missions_threat_weight', 'missions_lucky', 'missions_max_chance');
INSERT INTO `aowow_config` (`key`, `value`, `default`, `cat`, `flags`, `comment`) VALUES
    ('missions_threat_weight', '300', '300', 1, 129, 'weight of a mission threat with no weight of its own (Temucraft.MissionTable.Chance.ThreatWeight)'),
    ('missions_lucky',         '5',   '5',   1, 129, 'flat chance from the Lucky trait (Temucraft.MissionTable.Chance.Lucky)'),
    ('missions_max_chance',    '200', '200', 1, 129, 'highest success chance, over 100 = bonus reward chance (Temucraft.MissionTable.Chance.Max)');
