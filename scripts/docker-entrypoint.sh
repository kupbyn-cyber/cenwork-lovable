#!/bin/sh
# CEN self-host: chạy migration trước, chỉ start server khi migration thành công.
set -e

if [ -n "$DATABASE_URL" ] && [ "$CEN_SKIP_MIGRATE" != "1" ]; then
  echo "[cen] Đồng bộ schema PostgreSQL trước khi khởi động..."
  node /app/scripts/migrate.mjs
else
  echo "[cen] Bỏ qua migration (thiếu DATABASE_URL hoặc CEN_SKIP_MIGRATE=1)."
fi

exec node /app/.output/server/index.mjs
