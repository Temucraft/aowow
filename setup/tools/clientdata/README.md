# Client data tools

Fill `setup/mpqdata/enus` from the 3.3.5a client plus our patches, in client load order (later wins).

1. `extract-mpq.sh` then `extract-sound.sh`
2. `python3 merge-case.py setup/mpqdata/enus` (Linux keeps case-duplicate folders apart)
3. `rm setup/mpqdata.cache`, then `php aowow --setup`; `build-english.sh` finishes the rest
4. Model viewer: `link-clientdata.sh <dir>`, then `setup/tools/modelviewer/extract.py --data <dir>`

Paths: `WOW_FILES` (default `/var/www/wow-files`), `MPQEXTRACTOR`. `extract-locale.sh frFR` adds one language.
