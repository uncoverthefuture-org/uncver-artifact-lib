#!/bin/bash

# Test script for individual artifacts
# Usage: ./scripts/test.sh <artifact-name>

set -e

ARTIFACT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$ARTIFACT" ]; then
    echo "Usage: $0 <artifact-name>"
    exit 1
fi

ARTIFACT_DIR="$ROOT_DIR/$ARTIFACT"

if [ ! -d "$ARTIFACT_DIR" ]; then
    echo "Error: Artifact directory '$ARTIFACT' not found"
    exit 1
fi

cd "$ARTIFACT_DIR"

echo "=========================================="
echo "Testing artifact: $ARTIFACT"
echo "=========================================="

# Read artifact.json to determine test strategy
if [ -f "artifact.json" ]; then
    LANGUAGE=$(cat artifact.json | grep -o '"language": "[^"]*"' | cut -d'"' -f4)
else
    # Auto-detect
    if [ -f "Cargo.toml" ]; then
        LANGUAGE="rust"
    elif [ -f "CMakeLists.txt" ]; then
        LANGUAGE="cpp"
    elif [ -f "go.mod" ]; then
        LANGUAGE="go"
    elif [ -f "Dockerfile" ]; then
        LANGUAGE="docker"
    fi
fi

# Run tests based on language
case $LANGUAGE in
    rust)
        echo "Running Rust tests..."
        cargo test
        ;;
    
    cpp)
        echo "Running C++ tests (if available)..."
        if [ -d "build" ] && [ -f "build/CTestTestfile.cmake" ]; then
            cd build && ctest --output-on-failure
        else
            echo "No tests configured"
        fi
        ;;
    
    go)
        echo "Running Go tests..."
        go test ./...
        ;;
    
    docker)
        echo "Running Docker image validation..."
        if [ -f "Dockerfile" ]; then
            docker build -t "test-$ARTIFACT" .
            echo "✓ Docker image builds successfully"
        fi
        ;;
    
    *)
        echo "No tests configured for language: $LANGUAGE"
        ;;
esac

echo "✓ Tests complete: $ARTIFACT"
