#!/usr/bin/env bash
#
# Deploy Rate PAP to the VPS.
#
#   npm run deploy              # sync, migrate, build, restart, health check
#   npm run deploy -- --dry-run # show what rsync would change, do nothing else
#   npm run deploy -- --install # force npm ci even if the lockfile is unchanged
#   npm run deploy -- --no-health
#
# Override the target with env vars, e.g. SSH_HOST=root@1.2.3.4 npm run deploy.
set -euo pipefail

SSH_HOST="${SSH_HOST:-root@109.111.53.58}"
SSH_PORT="${SSH_PORT:-38954}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/retpap}"
PM2_APP="${PM2_APP:-retpap}"
APP_PORT="${APP_PORT:-3010}"
PUBLIC_URL="${PUBLIC_URL:-https://bot.linkviu.my.id/}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
FORCE_INSTALL=0
HEALTH_CHECK=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --install) FORCE_INSTALL=1 ;;
    --no-health) HEALTH_CHECK=0 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"
  CYAN="$(printf '\033[36m')"; GREEN="$(printf '\033[32m')"
  RED="$(printf '\033[31m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; DIM=""; CYAN=""; GREEN=""; RED=""; RESET=""
fi

step() { printf '\n%s▸ %s%s\n' "$CYAN$BOLD" "$*" "$RESET"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$(printf '\033[33m')" "$RESET" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$RESET" >&2; exit 1; }

SSH=(ssh -p "$SSH_PORT" -o ConnectTimeout=10 "$SSH_HOST")
RSYNC_SSH="ssh -p $SSH_PORT -o ConnectTimeout=10"

# --- preflight -------------------------------------------------------------

step "Preflight"
command -v rsync >/dev/null || die "rsync is not installed"
command -v ssh >/dev/null || die "ssh is not installed"

if [ -d .git ] && [ -n "$(git status --porcelain)" ]; then
  warn "working tree has uncommitted changes — deploying them as-is"
fi

"${SSH[@]}" true || die "cannot reach $SSH_HOST:$SSH_PORT"
"${SSH[@]}" "test -f '$REMOTE_DIR/.env.local'" \
  || die "$REMOTE_DIR/.env.local is missing on the server"
ok "server reachable, .env.local present"

# --- dependency install only when the lockfile actually changed ------------

LOCAL_LOCK="$(sha256sum package-lock.json | cut -d' ' -f1)"
REMOTE_LOCK="$("${SSH[@]}" "sha256sum '$REMOTE_DIR/package-lock.json' 2>/dev/null | cut -d' ' -f1" || true)"

NEED_INSTALL=0
if [ "$FORCE_INSTALL" = 1 ]; then
  NEED_INSTALL=1
elif [ "$LOCAL_LOCK" != "$REMOTE_LOCK" ]; then
  NEED_INSTALL=1
fi

# --- sync ------------------------------------------------------------------

step "Syncing source"
RSYNC_ARGS=(-az --delete --human-readable --info=stats1
  --exclude node_modules --exclude .next --exclude .git
  --exclude '.env.local' --exclude 'tsconfig.tsbuildinfo'
  --exclude 'Screenshot*.png')

if [ "$DRY_RUN" = 1 ]; then
  rsync "${RSYNC_ARGS[@]}" --dry-run -e "$RSYNC_SSH" ./ "$SSH_HOST:$REMOTE_DIR/"
  ok "dry run complete — nothing was changed"
  exit 0
fi

rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_SSH" ./ "$SSH_HOST:$REMOTE_DIR/"
ok "source synced"

# --- remote install, migrate, build, restart -------------------------------

if [ "$NEED_INSTALL" = 1 ]; then
  INSTALL_CMD="npm ci --no-audit --no-fund"
else
  INSTALL_CMD="echo 'package-lock.json unchanged — skipping npm ci'"
fi

step "Building and restarting on the server"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd '$REMOTE_DIR'

# Snapshot the database before migrations; keep the last five dumps.
if sudo -u postgres pg_dump -Fc retpap > /tmp/retpap-pre-deploy.dump 2>/dev/null; then
  mkdir -p /var/backups/retpap
  mv /tmp/retpap-pre-deploy.dump /var/backups/retpap/retpap-\$(date +%Y%m%d-%H%M%S).dump
  ls -1t /var/backups/retpap/*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
  echo "database snapshot saved"
else
  echo "warning: database snapshot failed, continuing" >&2
fi

mkdir -p /var/lib/retpap/uploads

$INSTALL_CMD
npx drizzle-kit migrate
npm run build
pm2 restart '$PM2_APP' --update-env >/dev/null
REMOTE
ok "build finished and $PM2_APP restarted"

# --- health ----------------------------------------------------------------

if [ "$HEALTH_CHECK" = 1 ]; then
  step "Health check"
  for attempt in $(seq 1 15); do
    if "${SSH[@]}" "curl -fsS -o /dev/null http://127.0.0.1:$APP_PORT/" 2>/dev/null; then
      ok "origin responds on :$APP_PORT"
      break
    fi
    [ "$attempt" = 15 ] && die "origin did not respond on :$APP_PORT after 15s (pm2 logs $PM2_APP)"
    sleep 1
  done

  if curl -fsS -o /dev/null --max-time 15 "$PUBLIC_URL"; then
    ok "$PUBLIC_URL responds"
  else
    warn "$PUBLIC_URL did not respond — check Cloudflare / nginx"
  fi
fi

printf '\n%sDeployed%s %s → %s:%s\n' "$GREEN$BOLD" "$RESET" "$(git rev-parse --short HEAD 2>/dev/null || echo 'no-git')" "$SSH_HOST" "$REMOTE_DIR"
