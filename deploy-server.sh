#!/usr/bin/env bash
# Пересборка и публикация на свой сервер: https://repeat.dm-kazanskiy.online
# (VPS REG.RU, nginx, сайт в /var/www/repeat). Старый адрес на GitHub Pages — deploy.sh.
set -euo pipefail
cd "$(dirname "$0")"
npm run build
# Сначала сервер синка (новый клиент зовёт его новые ручки), потом статика.
python3 -m unittest deploy/sync/test_server.py
rsync -az deploy/sync/server.py root@194.226.125.120:/opt/repeat-sync/server.py
ssh root@194.226.125.120 'systemctl restart repeat-sync && sleep 1 && systemctl is-active repeat-sync'
rsync -az --delete --exclude .DS_Store dist/ root@194.226.125.120:/var/www/repeat/
echo "Опубликовано: https://repeat.dm-kazanskiy.online/"
