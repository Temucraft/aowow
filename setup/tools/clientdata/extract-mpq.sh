#!/usr/bin/env bash
# Extracts the client files AoWoW needs into setup/mpqdata/enus, in client load order (later wins).
set -euo pipefail
. "$(dirname "$0")/paths.sh"
OUT=$AOWOW/setup/mpqdata/enus
mkdir -p "$OUT"
W=$WOW_FILES; B=$W/base/Data; L=$B/enUS
order=( $B/common.MPQ $B/common-2.MPQ $B/expansion.MPQ $B/lichking.MPQ
        $L/locale-enUS.MPQ $L/expansion-locale-enUS.MPQ $L/lichking-locale-enUS.MPQ
        $B/patch.MPQ $L/patch-enUS.MPQ $B/patch-2.MPQ $L/patch-enUS-2.MPQ $B/patch-3.MPQ $L/patch-enUS-3.MPQ )
order+=( $(ls $W/patches/patch-?.MPQ | sort) $(ls $W/locales/enUS/patch-enUS-?.MPQ | sort -f) )
pats=( 'DBFilesClient\*' 'Interface\WorldMap\*' 'Interface\FrameXML\GlobalStrings.lua' 'Interface\TalentFrame\*'
       'Interface\Icons\*' 'Interface\Spellbook\*' 'Interface\PaperDoll\*' 'Interface\Glues\CharacterCreate\*'
       'Interface\Pictures\*' 'Interface\PvPRankBadges\*' 'Interface\FlavorImages\*' 'Interface\Calendar\Holidays\*' 'Interface\PVPFrame\*' 'Interface\Glues\Credits\*' )
args=(); for p in "${pats[@]}"; do args+=(-e "$p"); done
for m in "${order[@]}"; do
    [[ -f "$m" ]] || { echo "skip (missing) $m"; continue; }
    echo "== $(basename "$m")"
    "$X" -f -o "$OUT" "${args[@]}" "$m" > /dev/null 2>&1 || echo "   (errors in $(basename "$m"))"
done
du -sh "$OUT"; ls "$OUT"; ls "$OUT/DBFilesClient" | wc -l
