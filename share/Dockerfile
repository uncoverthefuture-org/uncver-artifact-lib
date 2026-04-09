# Multi-stage build for uncver-share-artifact
FROM ubuntu:22.04 AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libssl-dev \
    libboost-all-dev \
    nlohmann-json3-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Copy source code
COPY . .

# Create build directory and compile
RUN mkdir -p build && cd build && \
    cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_TESTS=OFF \
        -DCMAKE_INSTALL_PREFIX=/usr/local && \
    make -j$(nproc)

# Runtime stage
FROM ubuntu:22.04 AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    libboost-system1.74.0 \
    libboost-thread1.74.0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /build/build/uncver-share-artifact /usr/local/bin/

# Create directory for artifacts
RUN mkdir -p /root/.uncver/artifacts

# Set entrypoint
ENTRYPOINT ["uncver-share-artifact"]

# Default command shows help
CMD ["--help"]

# Build instructions:
# docker build -t uncver-share-artifact:latest .
#
# Run examples:
# docker run --rm uncver-share-artifact --help
# docker run --rm -v ~/.uncver:/root/.uncver uncver-share-artifact --artifact my-app --to wss://friend.ngrok.io/ws
# docker run --rm -v ~/.uncver:/root/.uncver uncver-share-artifact --artifact my-app --to wss://friend.ngrok.io/ws --message "Check this out!"
