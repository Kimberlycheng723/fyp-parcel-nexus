#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/.." && pwd)"
CERTIFICATE_DIRECTORY="${FRONTEND_DIRECTORY}/.cert"
CERTIFICATE_FILE="${CERTIFICATE_DIRECTORY}/parcel-nexus-local.pem"
KEY_FILE="${CERTIFICATE_DIRECTORY}/parcel-nexus-local-key.pem"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is required. Install it with: brew install mkcert"
  exit 1
fi

LOCAL_HOST_NAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
LOCAL_DOMAIN="${LOCAL_HOST_NAME}.local"
DEFAULT_INTERFACE="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)"
LAN_IP=""

if [[ -n "${DEFAULT_INTERFACE}" ]]; then
  LAN_IP="$(ipconfig getifaddr "${DEFAULT_INTERFACE}" 2>/dev/null || true)"
fi

mkdir -p "${CERTIFICATE_DIRECTORY}"
mkcert -install

CERTIFICATE_NAMES=("localhost" "127.0.0.1" "::1" "${LOCAL_DOMAIN}")
if [[ -n "${LAN_IP}" ]]; then
  CERTIFICATE_NAMES+=("${LAN_IP}")
fi

mkcert \
  -cert-file "${CERTIFICATE_FILE}" \
  -key-file "${KEY_FILE}" \
  "${CERTIFICATE_NAMES[@]}"

cp "$(mkcert -CAROOT)/rootCA.pem" "${CERTIFICATE_DIRECTORY}/rootCA.pem"

echo
echo "Local HTTPS certificate created."
echo "Mac URL: https://localhost:5173"
echo "LAN hostname URL: https://${LOCAL_DOMAIN}:5173"
if [[ -n "${LAN_IP}" ]]; then
  echo "LAN IP URL: https://${LAN_IP}:5173"
else
  echo "No active LAN IP was detected. Re-run this script after joining Wi-Fi."
fi
echo
echo "Install only ${CERTIFICATE_DIRECTORY}/rootCA.pem on the iPad."
echo "Never share the mkcert rootCA-key.pem stored on this Mac."
