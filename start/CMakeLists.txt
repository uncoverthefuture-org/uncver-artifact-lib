cmake_minimum_required(VERSION 3.14)
project(uncver-start-artifact VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(nlohmann_json 3.2.0 REQUIRED)
find_path(HIREDIS_HEADER hiredis)
find_library(HIREDIS_LIB hiredis)

if(NOT HIREDIS_HEADER OR NOT HIREDIS_LIB)
    message(FATAL_ERROR "hiredis not found")
endif()

set(SOURCES
    src/main.cpp
    src/redis_listener.cpp
    src/artifact_starter.cpp
)

add_executable(uncver-start-artifact ${SOURCES})

target_include_directories(uncver-start-artifact PRIVATE include ${HIREDIS_HEADER})
target_link_libraries(uncver-start-artifact nlohmann_json::nlohmann_json ${HIREDIS_LIB} pthread)

install(TARGETS uncver-start-artifact DESTINATION bin)
