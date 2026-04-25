#!/usr/bin/env bash
# Scans images/ and writes images.json (newest-first by filename).
# Prefix files with a date (e.g. 2026-04-25-cat.jpg) to control order.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d images ]; then
  echo "[]" > images.json
  exit 0
fi

# List supported image files, sort reverse (newest-first when date-prefixed),
# emit JSON array of {file: "..."}.
{
  printf '['
  first=1
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ $first -eq 1 ]; then first=0; else printf ','; fi
    # JSON-escape: only quotes and backslashes need handling for filenames.
    esc=$(printf '%s' "$f" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
    printf '{"file":"%s"}' "$esc"
  done < <(cd images && ls -1 2>/dev/null | grep -iE '\.(jpe?g|png|webp|gif|avif)$' | sort -r)
  printf ']\n'
} > images.json

echo "Wrote images.json:"
cat images.json
