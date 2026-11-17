#!/usr/bin/env bash
# Пересборка и публикация на свой сервер: https://repeat.dm-kazanskiy.online
# (VPS REG.RU, nginx, сайт в /var/www/repeat). GitHub Pages — deploy.sh.
set -euo pipefail
cd "$(dirname "$0")"
npm run build
rsync -az --delete --exclude .DS_Store dist/ root@194.226.125.120:/var/www/repeat/
echo "Опубликовано: https://repeat.dm-kazanskiy.online/"
