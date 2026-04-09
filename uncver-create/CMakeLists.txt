cmake_minimum_required(VERSION 3.14)
project(uncver-create-artifact VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(CURL REQUIRED)
find_package(nlohmann_json 3.2.0 REQUIRED)

# Find hiredis (Redis C client)
find_path(HIREDIS_HEADER hiredis)
find_library(HIREDIS_LIB hiredis)

if(NOT HIREDIS_HEADER OR NOT HIREDIS_LIB)
    message(FATAL_ERROR "hiredis not found. Install with: brew install hiredis (macOS) or apt-get install libhiredis-dev (Linux)")
endif()

# Source files
set(SOURCES
    src/main.cpp
    src/artifact_creator.cpp
    src/git_clone.cpp
    src/redis_listener.cpp
)

# Header files
set(HEADERS
    include/artifact_creator.h
    include/git_clone.h
    include/redis_listener.h
)

# Executable
add_executable(uncver-create-artifact ${SOURCES} ${HEADERS})

target_include_directories(uncver-create-artifact PRIVATE 
    include
    ${HIREDIS_HEADER}
)

target_link_libraries(uncver-create-artifact
    CURL::libcurl
    nlohmann_json::nlohmann_json
    ${HIREDIS_LIB}
    pthread
)

# Install
install(TARGETS uncver-create-artifact DESTINATION bin)
