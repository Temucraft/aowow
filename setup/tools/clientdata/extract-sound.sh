#!/usr/bin/env bash
# Extracts Sound\ from the client (load order, later wins) into AoWoW's mpqdata/enus.
set -euo pipefail
. "$(dirname "$0")/paths.sh"
W=$WOW_FILES; B=$W/base/Data; L=$B/enUS
OUT=$AOWOW/setup/mpqdata/enus
order=( $B/common.MPQ $B/common-2.MPQ $B/expansion.MPQ $B/lichking.MPQ
        $L/locale-enUS.MPQ $L/speech-enUS.MPQ $L/expansion-locale-enUS.MPQ $L/expansion-speech-enUS.MPQ
        $L/lichking-locale-enUS.MPQ $L/lichking-speech-enUS.MPQ
        $B/patch.MPQ $L/patch-enUS.MPQ $B/patch-2.MPQ $L/patch-enUS-2.MPQ $B/patch-3.MPQ $L/patch-enUS-3.MPQ )
order+=( $(ls $W/patches/patch-?.MPQ | sort) $(ls $W/locales/enUS/patch-enUS-?.MPQ | sort -f) )
for m in "${order[@]}"; do
    [[ -f "$m" ]] || { echo "skip (missing) $(basename "$m")"; continue; }
    echo "== $(basename "$m")"; "$X" -f -o "$OUT" -e 'Sound\*' "$m" > /dev/null 2>&1 || echo "   (errors)"
done
du -sh "$OUT/Sound" "$OUT/sound" 2>/dev/null; find "$OUT" -ipath '*/sound/*' -type f | wc -l
