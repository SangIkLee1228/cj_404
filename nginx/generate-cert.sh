#!/bin/sh
# Runs automatically on container start (official nginx image executes every
# script under /docker-entrypoint.d/ before starting nginx). Generates a
# self-signed localhost cert on first run per machine; every teammate ends up
# with their own cert/key, persisted in the `nginx_certs` volume so it
# survives container recreation (but not `docker compose down -v`).
set -e

CERT_DIR=/etc/nginx/certs
CERT_FILE="$CERT_DIR/localhost.crt"
KEY_FILE="$CERT_DIR/localhost.key"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "[cert] Existing self-signed certificate found, skipping generation."
    exit 0
fi

echo "[cert] Generating self-signed TLS certificate for localhost..."
openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "[cert] Done: $CERT_FILE"
