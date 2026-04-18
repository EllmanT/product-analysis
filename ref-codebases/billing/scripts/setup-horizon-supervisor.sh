#!/usr/bin/env bash
# Install/update Supervisor config for Laravel Horizon and reload Supervisor.
#
# Usage:
#   sudo ./scripts/setup-horizon-supervisor.sh
#   sudo ./scripts/setup-horizon-supervisor.sh /var/www/billing
#
# Environment (optional):
#   SUPERVISOR_CONF_DIR  default: /etc/supervisor/conf.d
#   CONF_NAME            default: laravel-horizon.conf
#   PHP_BIN              default: $(command -v php)
#   RUN_USER             default: www-data
#
# Requires: supervisor, PHP, Redis (for Horizon), write access to storage/logs/
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE="${SCRIPT_DIR}/supervisor/laravel-horizon.conf.template"

APP_ROOT="${1:-${REPO_ROOT}}"
SUPERVISOR_CONF_DIR="${SUPERVISOR_CONF_DIR:-/etc/supervisor/conf.d}"
CONF_NAME="${CONF_NAME:-laravel-horizon.conf}"
PHP_BIN="${PHP_BIN:-$(command -v php || true)}"
RUN_USER="${RUN_USER:-www-data}"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "error: missing template ${TEMPLATE}" >&2
  exit 1
fi

if [[ -z "${PHP_BIN}" || ! -x "${PHP_BIN}" ]]; then
  echo "error: PHP CLI not found. Set PHP_BIN to your php binary." >&2
  exit 1
fi

if [[ ! -f "${APP_ROOT}/artisan" ]]; then
  echo "error: no artisan in APP_ROOT=${APP_ROOT}" >&2
  exit 1
fi

if ! command -v supervisorctl >/dev/null 2>&1; then
  echo "error: supervisorctl not found. Install Supervisor (e.g. apt install supervisor)." >&2
  exit 1
fi

LOG_DIR="${APP_ROOT}/storage/logs"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/horizon.log"
touch "${LOG_FILE}" 2>/dev/null || true

TMP_CONF="$(mktemp)"
trap 'rm -f "${TMP_CONF}"' EXIT

sed \
  -e "s|__APP_ROOT__|${APP_ROOT}|g" \
  -e "s|__PHP_BIN__|${PHP_BIN}|g" \
  -e "s|__RUN_USER__|${RUN_USER}|g" \
  -e "s|__LOG_FILE__|${LOG_FILE}|g" \
  "${TEMPLATE}" >"${TMP_CONF}"

DEST="${SUPERVISOR_CONF_DIR}/${CONF_NAME}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must be run as root (sudo) to write ${DEST}." >&2
  exit 1
fi

cp "${TMP_CONF}" "${DEST}"
chmod 644 "${DEST}"

echo "Installed ${DEST}"
supervisorctl reread
supervisorctl update

# Start or restart horizon program
if supervisorctl status horizon 2>/dev/null | grep -q RUNNING; then
  supervisorctl restart horizon
else
  supervisorctl start horizon || true
fi

echo "Done. Check: supervisorctl status horizon"
echo "Logs: tail -f ${LOG_FILE}"
