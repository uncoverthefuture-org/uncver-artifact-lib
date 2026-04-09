#!/bin/bash

# Build script for individual artifacts
# Usage: ./scripts/build.sh <artifact-name>

set -e

ARTIFACT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist"

echo "=========================================="
echo "Building artifact: $ARTIFACT"
echo "=========================================="

if [ -z "$ARTIFACT" ]; then
    echo "Usage: $0 <artifact-name>"
    echo "Available artifacts:"
    ls -d "$ROOT_DIR"/*/ | xargs -n1 basename | grep -v "^\."
    exit 1
fi

ARTIFACT_DIR="$ROOT_DIR/$ARTIFACT"

if [ ! -d "$ARTIFACT_DIR" ]; then
    echo "Error: Artifact directory '$ARTIFACT' not found"
    exit 1
fi

cd "$ARTIFACT_DIR"

# Read artifact.json to determine build strategy
if [ -f "artifact.json" ]; then
    BUILD_TYPE=$(cat artifact.json | grep -o '"build_type": "[^"]*"' | cut -d'"' -f4)
    LANGUAGE=$(cat artifact.json | grep -o '"language": "[^"]*"' | cut -d'"' -f4)
else
    # Auto-detect based on files
    if [ -f "Cargo.toml" ]; then
        BUILD_TYPE="cargo"
        LANGUAGE="rust"
    elif [ -f "CMakeLists.txt" ]; then
        BUILD_TYPE="cmake"
        LANGUAGE="cpp"
    elif [ -f "go.mod" ]; then
        BUILD_TYPE="go"
        LANGUAGE="go"
    elif [ -f "Dockerfile" ]; then
        BUILD_TYPE="docker"
        LANGUAGE="docker"
    else
        echo "Error: Cannot determine build type for $ARTIFACT"
        exit 1
    fi
fi

echo "Build type: $BUILD_TYPE"
echo "Language: $LANGUAGE"

# Create dist directory
mkdir -p "$DIST_DIR/$ARTIFACT"

# Build based on type
case $BUILD_TYPE in
    cargo)
        echo "Building Rust project..."
        cargo build --release
        cp target/release/* "$DIST_DIR/$ARTIFACT/" 2>/dev/null || true
        ;;
    
    cmake)
        echo "Building C++ project..."
        mkdir -p build
        cd build
        cmake ..
        make -j$(nproc)
        cp uncver-* "$DIST_DIR/$ARTIFACT/" 2>/dev/null || cp *.exe "$DIST_DIR/$ARTIFACT/" 2>/dev/null || true
        ;;
    
    go)
        echo "Building Go project..."
        go build -o "$DIST_DIR/$ARTIFACT/$ARTIFACT" ./cmd/server/
        ;;
    
    docker)
        echo "Building Docker image..."
        IMAGE_NAME="ghcr.io/uncver/$ARTIFACT:$(cat VERSION 2>/dev/null || echo 'latest')"
        docker build -t "$IMAGE_NAME" .
        docker save "$IMAGE_NAME" -o "$DIST_DIR/$ARTIFACT/docker-image.tar"
        echo "$IMAGE_NAME" > "$DIST_DIR/$ARTIFACT/image-name.txt"
        ;;
    
    *)
        echo "Error: Unknown build type '$BUILD_TYPE'"
        exit 1
        ;;
esac

# Copy artifact.json to dist
cp artifact.json "$DIST_DIR/$ARTIFACT/" 2>/dev/null || true

echo "✓ Build complete: $ARTIFACT"
echo "Output: $DIST_DIR/$ARTIFACT/"
