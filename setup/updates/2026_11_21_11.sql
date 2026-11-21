-- Temucraft: launcher news page (?news)
--   news_source  where the launcher's news.json and changelog.json are: the address of the folder the launcher's
--                manifest.json is in (https://files.example.com/wow/), or that folder on this machine (/var/www/wow-files)
--   news_cache   how many seconds the site keeps its copy before it reads the files again
DELETE FROM `aowow_config` WHERE `key` IN ('news_source', 'news_cache');
INSERT INTO `aowow_config` (`key`, `value`, `default`, `cat`, `flags`, `comment`) VALUES
    ('news_source', '',    '',    1, 136, 'address or folder of the launcher\'s news.json and changelog.json (the folder of manifest.json)'),
    ('news_cache',  '300', '300', 1, 129, 'seconds the site keeps its copy of the launcher news before reading it again');
