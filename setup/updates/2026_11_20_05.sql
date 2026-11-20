-- Temucraft: the site's default theme for visitors who have not picked one (the picker in the header keeps their own
-- choice in a cookie). Theme id, optionally followed by ".light" or ".dark".
INSERT IGNORE INTO `aowow_config` (`key`, `value`, `default`, `cat`, `flags`, `comment`) VALUES
('site_theme', 'wotlk', 'wotlk', 1, 136, 'default look for visitors: wotlk, vanilla, tbc, cata, mop, wod, legion, bfa, shadowlands, dragonflight, tww, midnight, diablo, starcraft, hearthstone, overwatch, aowow (the old AoWoW look), classic (2006 website), pandaria (2013 website) or draenor (2015 website); add .light or .dark for the mode, e.g. classic.light');
