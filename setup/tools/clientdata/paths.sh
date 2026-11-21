# Shared paths: the client files (base/Data, patches, locales) and the MPQExtractor binary; override with env.
AOWOW="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WOW_FILES="${WOW_FILES:-/var/www/wow-files}"
X="${MPQEXTRACTOR:-/root/Temucraft/MPQExtractor/build/bin/MPQExtractor}"
