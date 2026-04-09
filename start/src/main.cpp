#include <iostream>
#include <cstring>
#include <csignal>
#include <memory>
#include "redis_listener.h"
#include "artifact_starter.h"

using namespace uncver;

// Global pointer for signal handler
std::unique_ptr<RedisListener> g_listener;

// Signal handler
void signalHandler(int sig) {
    std::cout << "\nReceived signal " << sig << ", shutting down gracefully..." << std::endl;
    if (g_listener) {
        g_listener->stop();
    }
}

// Print usage
void printUsage(const char* program) {
    std::cout << "Usage: " << program << " [OPTIONS]\n"
              << "\nOptions:\n"
              << "  --redis-host HOST    Redis server hostname (default: 127.0.0.1)\n"
              << "  --redis-port PORT    Redis server port (default: 6379)\n"
              << "  --help               Show this help message\n"
              << std::endl;
}

int main(int argc, char* argv[]) {
    // Default values
    std::string redisHost = "127.0.0.1";
    int redisPort = 6379;

    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--redis-host") == 0) {
            if (i + 1 < argc) {
                redisHost = argv[++i];
            } else {
                std::cerr << "Error: --redis-host requires an argument" << std::endl;
                return 1;
            }
        } else if (strcmp(argv[i], "--redis-port") == 0) {
            if (i + 1 < argc) {
                try {
                    redisPort = std::stoi(argv[++i]);
                    if (redisPort < 1 || redisPort > 65535) {
                        std::cerr << "Error: Invalid port number" << std::endl;
                        return 1;
                    }
                } catch (const std::exception& e) {
                    std::cerr << "Error: Invalid port number: " << argv[i] << std::endl;
                    return 1;
                }
            } else {
                std::cerr << "Error: --redis-port requires an argument" << std::endl;
                return 1;
            }
        } else if (strcmp(argv[i], "--help") == 0) {
            printUsage(argv[0]);
            return 0;
        } else {
            std::cerr << "Error: Unknown option: " << argv[i] << std::endl;
            printUsage(argv[0]);
            return 1;
        }
    }

    std::cout << "Uncver Start Artifact Service" << std::endl;
    std::cout << "Redis: " << redisHost << ":" << redisPort << std::endl;

    // Set up signal handlers
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    signal(SIGQUIT, signalHandler);

    // Create Redis listener
    g_listener = std::make_unique<RedisListener>(redisHost, redisPort);
    RedisListener* listener = g_listener.get();

    // Connect to Redis
    if (!listener->connect()) {
        std::cerr << "Failed to connect to Redis at " << redisHost << ":" << redisPort << std::endl;
        return 1;
    }

    std::cout << "Connected to Redis" << std::endl;

    // Create artifact starter
    auto starter = std::make_unique<ArtifactStarter>();

    // Set up callback for start requests
    listener->onStartRequest([&starter](const StartRequest& request) -> StartResponse {
        return starter->startArtifact(request);
    });

    std::cout << "Listening for start requests..." << std::endl;

    // Start listening (blocks until stop is called)
    listener->startListening();

    std::cout << "Shutdown complete" << std::endl;

    return 0;
}
