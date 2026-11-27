#!/usr/bin/env bash
# Пересборка и публикация на свой сервер: https://repeat.dm-kazanskiy.online
# (VPS REG.RU, nginx, сайт в /var/www/repeat). Старый адрес на GitHub Pages — deploy.sh.
set -euo pipefail
cd "$(dirname "$0")"
npm run build
# Сначала сервер синка (новый клиент зовёт его новые ручки), потом статика.
python3 -m unittest deploy/sync/test_server.py
rsync -az deploy/sync/server.py deploy/sync/agent.py deploy/sync/morning.py deploy/sync/details.py deploy/sync/fitparse.py deploy/sync/ai_format.md root@194.226.125.120:/opt/repeat-sync/
# Юнит systemd — только если поменялся.
if ! ssh root@194.226.125.120 'cat /etc/systemd/system/repeat-sync.service' | cmp -s - deploy/sync/repeat-sync.service; then
  rsync -az deploy/sync/repeat-sync.service root@194.226.125.120:/etc/systemd/system/repeat-sync.service
  ssh root@194.226.125.120 'systemctl daemon-reload'
fi
# nginx — только если конфиг в репозитории поменялся; без «nginx -t» не перезагружаем,
# при ошибке возвращаем прежний.
if ! ssh root@194.226.125.120 'cat /etc/nginx/sites-available/repeat' | cmp -s - deploy/nginx-repeat.conf; then
  rsync -az deploy/nginx-repeat.conf root@194.226.125.120:/etc/nginx/repeat.conf.new
  ssh root@194.226.125.120 'cp /etc/nginx/sites-available/repeat /etc/nginx/repeat.conf.bak && cp /etc/nginx/repeat.conf.new /etc/nginx/sites-available/repeat && if nginx -t; then systemctl reload nginx; else cp /etc/nginx/repeat.conf.bak /etc/nginx/sites-available/repeat; echo "nginx -t не прошёл — конфиг откатан" >&2; exit 1; fi'
fi
ssh root@194.226.125.120 'systemctl restart repeat-sync && sleep 1 && systemctl is-active repeat-sync'
rsync -az --delete --exclude .DS_Store dist/ root@194.226.125.120:/var/www/repeat/
echo "Опубликовано: https://repeat.dm-kazanskiy.online/"
