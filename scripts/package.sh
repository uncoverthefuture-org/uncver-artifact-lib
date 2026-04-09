#!/bin/bash

# Package script for individual artifacts
# Usage: ./scripts/package.sh <artifact-name>

set -e

ARTIFACT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/$ARTIFACT"

echo "=========================================="
echo "Packaging artifact: $ARTIFACT"
echo "=========================================="

if [ -z "$ARTIFACT" ]; then
    echo "Usage: $0 <artifact-name>"
    exit 1
fi

if [ ! -d "$PACKAGE_DIR" ]; then
    echo "Error: Build output not found at $PACKAGE_DIR"
    echo "Run ./scripts/build.sh $ARTIFACT first"
    exit 1
fi

cd "$PACKAGE_DIR"

# Read version from artifact.json or VERSION file
if [ -f "$ROOT_DIR/$ARTIFACT/artifact.json" ]; then
    VERSION=$(cat "$ROOT_DIR/$ARTIFACT/artifact.json" | grep -o '"version": "[^"]*"' | head -1 | cut -d'"' -f4)
elif [ -f "$ROOT_DIR/$ARTIFACT/VERSION" ]; then
    VERSION=$(cat "$ROOT_DIR/$ARTIFACT/VERSION")
else
    VERSION="1.0.0"
fi

PACKAGE_NAME="${ARTIFACT}-${VERSION}"

echo "Version: $VERSION"
echo "Package: $PACKAGE_NAME"

# Create tarball
cd "$DIST_DIR"
tar -czf "${PACKAGE_NAME}.tar.gz" -C "$ARTIFACT" .

# Create checksum
shasum -a 256 "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"

echo "✓ Package created:"
echo "  Archive: $DIST_DIR/${PACKAGE_NAME}.tar.gz"
echo "  Checksum: $DIST_DIR/${PACKAGE_NAME}.tar.gz.sha256"
