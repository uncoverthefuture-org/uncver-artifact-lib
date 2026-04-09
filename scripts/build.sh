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
    echo "Reading artifact.json..."
    BUILD_TYPE=$(cat artifact.json | grep -o '"build_type": "[^"]*"' | cut -d'"' -f4)
    LANGUAGE=$(cat artifact.json | grep -o '"language": "[^"]*"' | cut -d'"' -f4)
    USE_DOCKER=$(cat artifact.json | grep '"docker": false' > /dev/null && echo "false" || echo "true")
else
    # Auto-detect based on files
    if [ -f "Cargo.toml" ]; then
        BUILD_TYPE="cargo"
        LANGUAGE="rust"
        USE_DOCKER="false"
    elif [ -f "CMakeLists.txt" ]; then
        BUILD_TYPE="cmake"
        LANGUAGE="cpp"
        USE_DOCKER="false"
    elif [ -f "go.mod" ]; then
        BUILD_TYPE="go"
        LANGUAGE="go"
        USE_DOCKER="false"
    elif [ -f "Dockerfile" ]; then
        BUILD_TYPE="docker"
        LANGUAGE="docker"
        USE_DOCKER="true"
    else
        echo "Error: Cannot determine build type for $ARTIFACT"
        exit 1
    fi
fi

echo "Build type: $BUILD_TYPE"
echo "Language: $LANGUAGE"
echo "Use Docker: $USE_DOCKER"

# Create dist directory
mkdir -p "$DIST_DIR/$ARTIFACT"

# Build based on type
case $BUILD_TYPE in
    cargo)
        echo "Building Rust project..."
        cargo build --release
        # Copy binary (handle different naming)
        if [ -f "target/release/uncver" ]; then
            cp target/release/uncver "$DIST_DIR/$ARTIFACT/"
        elif [ -f "target/release/uncver-artifacts" ]; then
            cp target/release/uncver-artifacts "$DIST_DIR/$ARTIFACT/uncver"
        else
            cp target/release/* "$DIST_DIR/$ARTIFACT/" 2>/dev/null || true
        fi
        ;;
    
    cmake)
        echo "Building C++ project..."
        mkdir -p build
        cd build
        cmake ..
        make -j$(nproc)
        # Find and copy the built binary
        if [ -f "uncver-$ARTIFACT" ]; then
            cp "uncver-$ARTIFACT" "$DIST_DIR/$ARTIFACT/"
        elif [ -f "uncver-create-artifact" ]; then
            cp "uncver-create-artifact" "$DIST_DIR/$ARTIFACT/uncver-create"
        elif ls *.exe 1> /dev/null 2>&1; then
            cp *.exe "$DIST_DIR/$ARTIFACT/" 2>/dev/null || true
        else
            # Try to find any executable
            find . -maxdepth 1 -type f -executable -exec cp {} "$DIST_DIR/$ARTIFACT/" \; 2>/dev/null || true
        fi
        ;;
    
    go|go-binary)
        echo "Building Go project..."
        OUTPUT_NAME=$(cat artifact.json 2>/dev/null | grep -o '"entrypoint": "[^"]*"' | cut -d'"' -f4 || echo "$ARTIFACT")
        # Initialize go module if not present
        if [ ! -f "go.mod" ]; then
            echo "Initializing Go module..."
            go mod init uncver-$ARTIFACT
        fi
        go mod tidy
        go build -o "$OUTPUT_NAME" ./cmd/server/
        cp "$OUTPUT_NAME" "$DIST_DIR/$ARTIFACT/"
        ;;
    
    docker)
        echo "Building Docker image..."
        # Only build docker image if USE_DOCKER is true
        if [ "$USE_DOCKER" = "true" ]; then
            IMAGE_NAME="uncver-$ARTIFACT:latest"
            docker build -t "$IMAGE_NAME" .
            docker save "$IMAGE_NAME" -o "$DIST_DIR/$ARTIFACT/docker-image.tar"
            echo "$IMAGE_NAME" > "$DIST_DIR/$ARTIFACT/image-name.txt"
        else
            echo "Skipping Docker build (docker: false in artifact.json)"
        fi
        ;;
    
    npm)
        echo "Building Node.js project..."
        npm install
        npm run build
        OUTPUT_NAME=$(cat artifact.json 2>/dev/null | grep -o '"entrypoint": "[^"]*"' | cut -d'"' -f4 || echo "$ARTIFACT")
        cp "$OUTPUT_NAME" "$DIST_DIR/$ARTIFACT/" 2>/dev/null || true
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
ls -la "$DIST_DIR/$ARTIFACT/"
