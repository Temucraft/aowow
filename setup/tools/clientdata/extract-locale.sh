#!/usr/bin/env bash
# Extracts one client language's tables, maps and strings into AoWoW's mpqdata/<locale>. Usage: extract-locale.sh frFR
set -euo pipefail
LOC=$1; . "$(dirname "$0")/paths.sh"
W=$WOW_FILES; B=$W/base/Data; L=$W/locales/$LOC
OUT=$AOWOW/setup/mpqdata/${LOC,,}; mkdir -p "$OUT"
order=( $B/common.MPQ $B/common-2.MPQ $B/expansion.MPQ $B/lichking.MPQ
        $L/locale-$LOC.MPQ $L/expansion-locale-$LOC.MPQ $L/lichking-locale-$LOC.MPQ
        $B/patch.MPQ $L/patch-$LOC.MPQ $B/patch-2.MPQ $L/patch-$LOC-2.MPQ $B/patch-3.MPQ $L/patch-$LOC-3.MPQ )
order+=( $(ls $W/patches/patch-?.MPQ | sort) $(ls $L/patch-$LOC-?.MPQ 2>/dev/null | sort -f) )
for m in "${order[@]}"; do
    [[ -f "$m" ]] || continue
    "$X" -f -o "$OUT" -e 'DBFilesClient\*' -e 'Interface\WorldMap\*' -e 'Interface\FrameXML\GlobalStrings.lua' "$m" > /dev/null 2>&1 || echo "$LOC: errors in $(basename "$m")"
done
echo "$LOC: $(du -sh "$OUT" | cut -f1), $(ls "$OUT/DBFilesClient" 2>/dev/null | wc -l) dbc"
