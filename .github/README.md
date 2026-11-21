![logo](../static/images/logos/home.png)

[🇬🇧 English](README.md) | [ 🇪🇸 Spanish](README_ES.md)

## Temucraft Database

This is the Temucraft fork: the database site for the Temucraft server (AzerothCore 3.3.5a with the Temucraft
modules). On top of AoWoW it has the 3D viewer, dressing room, map and transport work of the `combined` branch, and:

- **Temucraft branding**: the cat logo (`static/images/logos/`, `icon.png`, favicon) and the site name
  "Temucraft Database" (`setup/updates/2026_11_18_01.sql`; new installs get it from `setup/2_db_structure.sql`).
- **Custom races**: races 9 and 12-31 from the server's ChrRaces/CharBaseInfo DBCs (the custom-race modules) are
  first-class: `php aowow --sql=races` writes the server's race masks to `config/races.inc.php` and their names,
  files and sides to `static/js/races-custom.js`, so race filters, requirements, quest/item race masks and the
  Races menu include them. Every race/class combination the DBCs allow (mod-arac) shows on the race and class pages.
- **Companion page** (Tools → Companion, `?companion`): with the game account linked (same link as the quest
  tracker), each character's followers, offered and running missions, expeditions, key fragments and disguises; start
  a mission or collect finished ones from the browser. Orders go to the characters database
  (`mod_temucraft_web_order`) and mod-temucraft-followers carries them out (at once if online, else at login).
  While you pick followers it shows the success chance the server will roll, with where each point comes from.
- **Mission guide** (Tools → Missions, `?missions`, no account needed): every follower you can find and how, every
  mission (threats, where, enemies, rewards, cooldown), the threats and who counters them, all traits, and a success
  chance calculator. `static/js/missionchance.js` is a port of the module's formula (checked against its Python
  twin); names and the trait table are in `includes/missions.class.php`. Keep both the same as
  mod-temucraft-followers. The chance settings are `missions_*` in `aowow_config` (`setup/updates/2026_11_21_10.sql`).
- **Launcher news** (Tools → News, `?news`): the news and changelog the launcher shows, read from the same
  `news.json` and `changelog.json` on the server's file host. Set `news_source` in `aowow_config` to the address of
  the folder the launcher's `manifest.json` is in, or to that folder on this machine; the site keeps a copy for
  `news_cache` seconds and shows the last good copy when the host is down (`setup/updates/2026_11_21_11.sql`).
  Changelog tags ([New], [Changed], [Fixed], [Removed], [Planned], [Not live yet]) have the launcher's colours.
  `?news=data` gives the same as JSON.
- **Issues and feature requests** (Tools → Issues, `?issues`): signed in site users post a bug or a feature request
  (title, kind, text); everyone can read them. Site admins and moderators set the status (open, planned, fixed, won't
  fix), reply, and can delete spam. Posts need the session's key (no posting from other sites) and are limited per user
  (`issues_post_*` in `aowow_config`). Tables `aowow_issues` and `aowow_issue_replies` (`setup/updates/2026_11_21_12.sql`).
- **Expansion tags**: items, NPCs, objects, quests, spells and zones show where they come from: a small badge in the
  lists (CATA, MOP, TEMU for our own content, LOST for the Lost Lands, FOREVER for the Forever maps), "Added in" in
  the infobox and an "Expansion" filter. `setup/tools/temucraft-expansions.py` reads the module SQL and tags every new
  row by the rules in `setup/temucraft/expansion-sources.json` (module and file patterns, id ranges, maps; add new
  modules there); the result is `setup/temucraft/expansions.json`, which `php aowow --sql` applies (alone:
  `--sql=expansions`). The modules-ci "Addon data" workflow remakes it every day; by hand:

      python3 setup/tools/temucraft-expansions.py --modules <folder with the module repos> \
          --stock-db <world database without the modules> --mysql "mysql -uroot -p..." -o setup/temucraft/expansions.json
- **Changes page** (Tools → Temucraft Changes, `?changes`): what Temucraft does differently from 3.3.5, like
  Wowhead's Classic changes pages. An overview (changes for every class, who can use each weapon and armor skill,
  one box per class), then per class a **Spellbook** page (`?changes=spellbook.druid`: new, updated and removed
  spells, before and now side by side per rank, changed words marked) and a **Talents** page
  (`?changes=talents.druid`: the trees with new and moved talents marked, then each talent change). The page reads
  `setup/temucraft/changes.json`, made by `setup/tools/temucraft-changes.py` from the stock DBCs against ours (patch-5
  plus every module's client patch, in load order) and the world database (class trainer spells, Temucraft spell
  scripts). Server rules the files can't show go in `setup/temucraft/changes-notes.json`. The modules-ci "Addon data"
  workflow remakes it every day; by hand:

      python3 setup/tools/temucraft-changes.py --stock <stock DBFilesClient> --layer <patch-5 DBFilesClient> \
          --modules <folder with the module repos> --db acore_world --mysql "mysql -uroot -p..." \
          --notes setup/temucraft/changes-notes.json -o setup/temucraft/changes.json
- **Realm status and player map** (Tools → Realm Status `?realm-status`, Tools → Player Map `?player-map`): per realm
  up or down (a short connect to the worldserver port from `realmlist`), players online, all-time peak
  (`aowow_realm_peak`, also fed by `uptime.maxplayers`), uptime, factions, classes, races and levels; and the online
  characters as dots on the continent maps (zone maps for our extra open world zones), refreshed every 30 s, with
  faction, level, realm and name filters. JSON for the launcher: `?realm-status=data` (counts only) and
  `?player-map=data`; both are cached 30 s. Never shown: accounts, IPs, guids; positions only in the open world.
  Players hide a character with "Hide" on the map page (linked game account, stored in `aowow_playermap_hidden`);
  GMs with .gm on or invisible and, with `playermap_hide_staff`, all staff accounts stay off. `playermap_enable = 0`
  turns the map off, `playermap_guilds = 0` drops guild names (`setup/updates/2026_11_20_10.sql`).
- **Our data**: everything comes from the server's own world database and from the DBCs and images *as the client
  sees them*. Extract the client **with the Temucraft patches** (see below), so new maps (Darkspear Islands, the
  Cataclysm / Mists dungeons, the lost lands), items, creatures, spells and races are all there.

### Extracting the Temucraft client for the setup

AoWoW reads `setup/mpqdata/<locale>/` (DBFilesClient, Interface, ...). Extract in the client's load order, later
archives overwriting earlier ones: `common.MPQ`, `common-2.MPQ`, `expansion.MPQ`, `lichking.MPQ`, `patch.MPQ`,
`patch-2.MPQ`, `patch-3.MPQ`, then the server's patches (`patch-4.MPQ` ... `patch-Z.MPQ`, digits before letters),
then `<locale>/locale-<locale>.MPQ` ... `patch-<locale>-3.MPQ` and the locale patches with letters
(`patch-<locale>-C.MPQ`, `patch-<locale>-T.MPQ`). The AzerothCore map extractor in the Temucraft core also exports
the DBCs exactly as the client uses them; those can replace `DBFilesClient`. Then run the usual setup
(`php aowow --setup`, or `--sql=races,...` / `--build=...` for single parts) against the Temucraft world database.

## Introduction

AoWoW is a Database tool for World of Warcraft v3.3.5 (build 12340)

It is based upon the other famous Database tool for WoW, featuring the red smiling rocket.

While the first releases can be found as early as 2008, today it is impossible to say who created this project.

This is a complete rewrite of the serverside php code and update to the clientside javascripts from 2008 to something 2013ish.

I myself take no credit for the clientside scripting, design and layout that these php-scripts cater to.

Also, this project is not meant to be used for commercial puposes of any kind!

## Requirements

- Webserver running PHP ≥ 8.2 including extensions:
  - SimpleXML
  - GD
  - Mysqli
  - mbString
- MySQL ≥ 5.7.0 OR MariaDB ≥ 10.6.4 OR similar
- Tools require cmake: Please refer to the individual repositories for detailed information
  - [MPQExtractor](https://github.com/Sarjuuk/MPQExtractor) / [FFmpeg](https://ffmpeg.org/download.html) / [BLPConverter](https://github.com/Sarjuuk/BLPConverter) (optional)
  - WIN users may find it easier to use these alternatives
    - [MPQEditor](http://www.zezula.net/en/mpq/download.html) / [FFmpeg](http://ffmpeg.zeranoe.com/builds/) / [BLPConverter](https://github.com/PatrickCyr/BLPConverter) (optional)

Audio processing may require [lame](https://sourceforge.net/projects/lame/files/lame/3.99/) or [vorbis-tools](https://www.xiph.org/downloads/) (which may require libvorbis (which may require libogg))

On Linux (debian-based) you can install the requirements with the following command:

```bash
apt install php-gd php-xml php-mbstring -y
```

#### Highly Recommended

- setting the following configuration values on your AzerothCore server will greatly increase the accuracy of spawn points
  > Calculate.Creature.Zone.Area.Data = 1
  > Calculate.Gameoject.Zone.Area.Data = 1

## Install

#### 1. Acquire the required repositories

- `git clone https://github.com/azerothcore/aowow.git aowow`
- `git clone https://github.com/Sarjuuk/MPQExtractor.git MPQExtractor`

#### 2. Prepare the database

Ensure that the account you are going to use has **full** access on the database AoWoW is going to occupy and ideally only **read** access on the world database you are going to reference.

Import `setup/db_structure.sql` into the AoWoW database `mysql -p {your-db-here} < setup/db_structure.sql`

Import to your AzerothCore database the table `spell_learn_spell`, import it from `www-aowow/setup/spell_learn_spell.sql`.

#### 3. Server created files

See to it, that the web server is able to write the following directories and their children. If they are missing, the setup will create them with appropriate permissions

- `cache/`
- `config/`
- `static/download/`
- `static/widgets/`
- `static/js/`
- `static/uploads/`
- `static/images/wow/`
- `datasets/`

#### 4. Extract the client archives (MPQs)

Extract the following directories from the client archives into `setup/mpqdata/`, while maintaining patch order (base mpq -> patch-mpq: 1 -> 9 -> A -> Z). The required paths are scattered across the archives. Overwrite older files if asked to.

.. for every locale you are going to use:

> \<localeCode>/DBFilesClient/
> \<localeCode>/Interface/WorldMap/
> \<localeCode>/Interface/FrameXML/GlobalStrings.lua

.. once is enough (still apply the localeCode though):

> \<localeCode>/Interface/TalentFrame/
> \<localeCode>/Interface/Icons/
> \<localeCode>/Interface/Spellbook/
> \<localeCode>/Interface/PaperDoll/
> \<localeCode>/Interface/Glues/CharacterCreate/
> \<localeCode>/Interface/Pictures
> \<localeCode>/Interface/PvPRankBadges
> \<localeCode>/Interface/FlavorImages
> \<localeCode>/Interface/Calendar/Holidays/
> \<localeCode>/Sound/

.. optionaly (not used in AoWoW):

> \<localeCode>/Interface/Glues/Loadingscreens/
> \<localeCode>/Interface/Glues/Credits/

**PAY ATTENTION:** you have to create a directory in `setup/mpqdata/` like `enus` (LOWERCASE) containing the data listed above.

For example, you can just copy `Interface` and `DBFilesClient` directory into `setup/mpqdata/enus/` and move `Sound` into `setup/mpqdata/enus`.

You can use MPQExtractor to extract the data, once you installed it succesfully you can use this bash script to make extract the data in the right order.

- [extract.sh](https://gist.github.com/Helias/d9bd7708e28e9e8dcd5274bd2f3b68bc)

#### 5. Reencode the audio files

WAV-files need to be reencoded as `ogg/vorbis` and some MP3s may identify themselves as `application/octet-stream` instead of `audio/mpeg`.

- [example for WIN](https://gist.github.com/Sarjuuk/d77b203f7b71d191509afddabad5fc9f)
- [example for \*nix](https://gist.github.com/Sarjuuk/1f05ef2affe49a7e7ca0fad7b01c081d)

Note: it will take a long time.

#### 6. Run the initial setup from the CLI

`php aowow --setup`.

This should guide you through with minimal input required from your end, but will take some time though, especially compiling the zone-images. Use it to familiarize yourself with the other functions this setup has. Yes, I'm dead serious: _Go read the code!_ It will help you understand how to configure AoWoW and keep it in sync with your world database.

When you've created your admin account you are done.

## Troubleshooting

**Q: The Page appears white, without any styles.**

- A: The static content is not being displayed. You are either using SSL and AoWoW is unable to detect it or STATIC_HOST is not defined poperly. Either way this can be fixed via config `php aowow --siteconfig`
- Probably you need to modify [10] and [15].
- For example, if your project is in `htdocs/aowow/` (or `/var/www/html/aowow`), hence you visit it with `http://localhost/aowow/`, you should put:

- [10] localhost/aowow
- [15] localhost/aowow/static

**Q: Fatal error: Can't inherit abstract function \<functionName> (previously declared abstract in \<className>) in \<path>**

- A: You are using cache optimization modules for php, that are in confict with each other. (Zend OPcache, XCache, ..) Disable all but one.

**Q: Some generated images appear distorted or have alpha-channel issues.**

- A: Image compression is beyond my understanding, so i am unable to fix these issues within the blpReader.
- BUT you can convert the affected blp file into a png file in the same directory, using the provided BLPConverter.
- AoWoW will priorize png files over blp files.

**Q: How can i get the modelviewer to work?**

- A: You can't anymore. Wowhead switched from Flash to WebGL (as they should) and moved or deleted the old files in the process.

**Q: I'm getting random javascript errors!**

- A: Some server configurations or external services (like Cloudflare) come with modules, that automaticly minify js and css files. Sometimes they break in the process. Disable the module in this case.

**Q: Some search results within the profiler act rather strange. How does it work?**

- A: Whenever you try to view a new character, AoWoW needs to fetch it first. Since the data is structured for the needs of TrinityCore and not for easy viewing, AoWoW needs to save and restructure it locally. To this end, every char request is placed in a queue. While the queue is not empty, a single instance of `prQueue` is run in the background as not to overwhelm the characters database with requests. This also means, some more exotic search queries can't be run agains the characters database and have to use the incomplete/outdated cached profiles of AoWoW.

**Q: Screenshot upload fails, because the file size is too large and/or the subdirectories are visible from the web!**

- A: That's a web server configuration issue. If you are using Apache you may need to [enable the use of .htaccess](http://httpd.apache.org/docs/2.4/de/mod/core.html#allowoverride). Other servers require individual configuration.

**Q: An Item, Quest or NPC i added or edited can't be searched. Why?**

- A: A search is only conducted against the currently used locale. You may have only edited the name field in the base table instead of adding multiple strings into the appropriate \*_locale tables. In this case searches in a non-english locale are run against an empty name field_.

**Q: Failed to connect to database.**

- A: check your file config in `aowow/config/config.php`, if everything is correct, check if your password has **"#"** character contained in the password and replace it with the _encoded (URL) character_ correspondent **"%23"**, do the same for special characters if you still get this error.
- If you do not resolve, try to don't use **"#"** in your password.

**Q: I cannot see the Quick Facts, Console error "Markup.js" not found**

- A: unfortunately sometimes the setup can fail into copy `tools/filegen/templates/Markup.js.in` into `static/js/Markup.js` for permissions reason, as this also other js files can miss, check the permissions issue or copy them manually.

## Thanks

- @mix: for providing the php-script to parse .blp and .dbc into usable images and tables.
- @LordJZ: the wrapper-class for DBSimple; the basic idea for the user-class.
- @kliver: basic implementation of screenshot uploads.
- @Sarjuuk: maintainer of the project.

## Special Thanks

Said website with the red smiling rocket, for providing this beautifull website!

Please do not regard this project as blatant rip-off, rather as "We do really liked your presentation, but since time and content progresses, you are sadly no longer supplying the data we need".

![uses badges](http://forthebadge.com/images/badges/uses-badges.svg)
