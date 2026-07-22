#!/usr/bin/env bash
# Пересборка и публикация на GitHub Pages.
# Ветка main — исходники, ветка gh-pages — собранный dist.
set -euo pipefail
cd "$(dirname "$0")"
npm run build
cp dist/index.html dist/404.html
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q
git checkout -qb gh-pages
git add -A
git commit -qm "deploy $(date +%F' '%T)"
git remote add origin https://github.com/dmkazanskiy-ui/Repeat.git
git push -qf origin gh-pages
echo "Опубликовано: https://dmkazanskiy-ui.github.io/Repeat/"
