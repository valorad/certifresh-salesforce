#!/usr/bin/env bash

set -euo pipefail

# Build paths relative to this script so it works from any current directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"
ARTIFACTS_DIR="${SCRIPT_DIR}/artifacts"

DATE_STAMP="$(date +%Y%m%d)"
ARCHIVE_NAME="certifresh-salesforce-${DATE_STAMP}.tar.gz"
ARCHIVE_PATH="${ARTIFACTS_DIR}/${ARCHIVE_NAME}"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

echo "Cleaning dist directory..."
if [ -d "${DIST_DIR}" ]; then
  DIST_BACKUP="/tmp/certifresh-salesforce-dist-${DATE_STAMP}-$$"
  echo "Moving existing dist to ${DIST_BACKUP}..."
  mv "${DIST_DIR}" "${DIST_BACKUP}"
fi
mkdir -p "${DIST_DIR}"

echo "Ensuring artifacts directory exists..."
mkdir -p "${ARTIFACTS_DIR}"

echo "Copying project files to dist..."
cp -R "${SCRIPT_DIR}/src" "${DIST_DIR}/src"
cp "${SCRIPT_DIR}/deno.json" "${DIST_DIR}/"
cp "${SCRIPT_DIR}/deno.lock" "${DIST_DIR}/"
cp "${SCRIPT_DIR}/README.md" "${DIST_DIR}/"

echo "Creating archive ${ARCHIVE_NAME}..."
tar -czf "${ARCHIVE_PATH}" -C "${SCRIPT_DIR}" dist

echo "Generating SHA-256 checksum..."
sha256sum "${ARCHIVE_PATH}" > "${CHECKSUM_PATH}"

echo "Build complete."
echo "Archive: ${ARCHIVE_PATH}"
echo "Checksum: ${CHECKSUM_PATH}"