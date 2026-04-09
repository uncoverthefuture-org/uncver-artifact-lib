cmake_minimum_required(VERSION 3.14)
project(uncver-delete-artifact VERSION 0.1.0 LANGUAGES CXX)

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
    src/artifact_deleter.cpp
)

add_executable(uncver-delete-artifact ${SOURCES})

target_include_directories(uncver-delete-artifact PRIVATE include ${HIREDIS_HEADER})
target_link_libraries(uncver-delete-artifact nlohmann_json::nlohmann_json ${HIREDIS_LIB} pthread)

install(TARGETS uncver-delete-artifact DESTINATION bin)
