#!/usr/bin/env bash
set -euo pipefail

if [ ! -d private/atlas-analytics/client ]; then
  echo "No private AtlasAnalytics client bundle; skipping server analytics deps."
  exit 0
fi

cd server
bun add '@openpanel/sdk@^1.3.1' '@swetrix/node@^3.2.0' 'swetrix@^4.2.0'
echo "Installed AtlasAnalytics server dependencies."
