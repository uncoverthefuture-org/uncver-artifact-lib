cmake_minimum_required(VERSION 3.14)
project(uncver-share-artifact VERSION 1.0.0 LANGUAGES CXX)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build options
option(BUILD_TESTS "Build tests" ON)
option(BUILD_SHARED_LIBS "Build shared libraries" OFF)

# Find packages
find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)

# Boost (required for WebSocket++)
find_package(Boost 1.70.0 REQUIRED COMPONENTS system thread)

# WebSocket++ (header-only)
find_path(WEBSOCKETPP_INCLUDE_DIR websocketpp/client.hpp
    PATHS
        /usr/include
        /usr/local/include
        ${CMAKE_PREFIX_PATH}/include
    PATH_SUFFIXES websocketpp
)

if(NOT WEBSOCKETPP_INCLUDE_DIR)
    message(STATUS "WebSocket++ not found, will use bundled version")
    include(FetchContent)
    FetchContent_Declare(
        websocketpp
        GIT_REPOSITORY https://github.com/zaphoyd/websocketpp.git
        GIT_TAG 0.8.2
    )
    FetchContent_MakeAvailable(websocketpp)
    set(WEBSOCKETPP_INCLUDE_DIR ${websocketpp_SOURCE_DIR})
endif()

# nlohmann/json (header-only)
find_package(nlohmann_json 3.9.0 QUIET)
if(NOT nlohmann_json_FOUND)
    message(STATUS "nlohmann/json not found, will use bundled version")
    include(FetchContent)
    FetchContent_Declare(
        json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.2
    )
    FetchContent_MakeAvailable(json)
endif()

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Boost_INCLUDE_DIRS}
    ${WEBSOCKETPP_INCLUDE_DIR}
    ${OPENSSL_INCLUDE_DIR}
)

# Source files
set(SOURCES
    src/main.cpp
    src/share_client.cpp
    src/artifact_reader.cpp
)

# Header files
set(HEADERS
    include/share_client.h
    include/artifact_reader.h
)

# Executable
add_executable(${PROJECT_NAME} ${SOURCES} ${HEADERS})

# Link libraries
target_link_libraries(${PROJECT_NAME}
    PRIVATE
        Threads::Threads
        OpenSSL::SSL
        OpenSSL::Crypto
        ${Boost_LIBRARIES}
        nlohmann_json::nlohmann_json
)

# Compiler warnings
if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE /W4 /WX-)
else()
    target_compile_options(${PROJECT_NAME} PRIVATE
        -Wall
        -Wextra
        -Wpedantic
        -Wshadow
        -Wnon-virtual-dtor
        -Wold-style-cast
        -Wcast-align
        -Wunused
        -Woverloaded-virtual
        -Wconversion
        -Wsign-conversion
        -Wnull-dereference
        -Wdouble-promotion
        -Wformat=2
    )
endif()

# Platform-specific settings
if(APPLE)
    target_compile_definitions(${PROJECT_NAME} PRIVATE _WEBSOCKETPP_CPP11_STRICT_)
endif()

if(WIN32)
    target_compile_definitions(${PROJECT_NAME} PRIVATE _WEBSOCKETPP_CPP11_THREAD_)
    target_link_libraries(${PROJECT_NAME} PRIVATE ws2_32)
endif()

# Install
install(TARGETS ${PROJECT_NAME}
    RUNTIME DESTINATION bin
)

install(FILES ${HEADERS} DESTINATION include/uncver)

# Tests
if(BUILD_TESTS)
    enable_testing()
    find_package(GTest QUIET)
    if(GTest_FOUND)
        add_subdirectory(tests)
    endif()
endif()

# CPack configuration
set(CPACK_PROJECT_NAME ${PROJECT_NAME})
set(CPACK_PROJECT_VERSION ${PROJECT_VERSION})
include(CPack)

# Print configuration summary
message(STATUS "")
message(STATUS "Configuration Summary:")
message(STATUS "  Project: ${PROJECT_NAME} v${PROJECT_VERSION}")
message(STATUS "  C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  Install prefix: ${CMAKE_INSTALL_PREFIX}")
message(STATUS "  Boost include: ${Boost_INCLUDE_DIRS}")
message(STATUS "  WebSocket++ include: ${WEBSOCKETPP_INCLUDE_DIR}")
message(STATUS "  OpenSSL include: ${OPENSSL_INCLUDE_DIR}")
message(STATUS "  Tests: ${BUILD_TESTS}")
message(STATUS "")
