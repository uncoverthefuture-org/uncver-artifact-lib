FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    build-essential cmake nlohmann-json3-dev libhiredis-dev \
    podman \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY include/ ./include/
COPY src/ ./src/
COPY CMakeLists.txt .

RUN mkdir build && cd build && cmake .. && make -j$(nproc)

CMD ["./build/uncver-stop-artifact"]
