#!/usr/bin/env bash
# English-only AoWoW build after the base --setup: remaining sql steps, the file build, the icons. Answers the prompts itself.
. "$(dirname "$0")/paths.sh"; cd "$AOWOW" && rm -f setup/mpqdata.cache
L=${LOGS:-/var/log/aowow}/build; mkdir -p "$(dirname "$L")"
{ printf 'Y\n'; yes c; } | php aowow --sql=spell,spellvariables,itemset,stats,summonproperties,talents,taxi,titles,totemcategory,worldmaparea,zones,spawns,source,races --log=$L-sql.log > $L-sql.out 2>&1
echo "sql done $(date +%T)" >> $L.status
{ printf 'Y\n'; yes c; } | php aowow --build --skip=simpleimg,talenticons,img-artwork,soundfiles --log=$L-build.log > $L-build.out 2>&1
echo "build done $(date +%T)" >> $L.status
{ yes c; } | php aowow --build=simpleimg --force --log=$L-icons.log > $L-icons.out 2>&1
find cache/template -type f ! -name index.html -delete
echo "icons done $(date +%T)" >> $L.status
