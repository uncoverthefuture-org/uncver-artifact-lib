#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>
#include "artifact_creator.h"
#include "redis_listener.h"

std::atomic<bool> g_running(true);

void signalHandler(int signal) {
    std::cout << "\nReceived signal " << signal << ", shutting down..." << std::endl;
    g_running = false;
}

void printUsage(const char* programName) {
    std::cout << "Usage: " << programName << " [options]" << std::endl;
    std::cout << std::endl;
    std::cout << "Options:" << std::endl;
    std::cout << "  --redis-host <host>    Redis host (default: 127.0.0.1)" << std::endl;
    std::cout << "  --redis-port <port>    Redis port (default: 6379)" << std::endl;
    std::cout << "  --help                 Show this help message" << std::endl;
    std::cout << std::endl;
    std::cout << "Environment Variables:" << std::endl;
    std::cout << "  REDIS_HOST             Redis host" << std::endl;
    std::cout << "  REDIS_PORT             Redis port" << std::endl;
}

int main(int argc, char* argv[]) {
    // Parse arguments
    std::string redisHost = "127.0.0.1";
    int redisPort = 6379;
    
    // Check environment variables first
    const char* envHost = std::getenv("REDIS_HOST");
    if (envHost) redisHost = envHost;
    
    const char* envPort = std::getenv("REDIS_PORT");
    if (envPort) redisPort = std::stoi(envPort);
    
    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        
        if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return 0;
        } else if (arg == "--redis-host" && i + 1 < argc) {
            redisHost = argv[++i];
        } else if (arg == "--redis-port" && i + 1 < argc) {
            redisPort = std::stoi(argv[++i]);
        }
    }
    
    // Setup signal handlers
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);
    
    std::cout << "uncver-create-artifact service starting..." << std::endl;
    std::cout << "Connecting to Redis at " << redisHost << ":" << redisPort << std::endl;
    
    // Create artifact creator
    uncver::ArtifactCreator creator;
    
    // Create Redis listener
    uncver::RedisListener listener(redisHost, redisPort);
    
    // Set up create request handler
    listener.onCreateRequest([&creator](const uncver::CreateRequest& req) -> uncver::CreateResponse {
        uncver::CreateResponse resp;
        resp.request_id = req.id;
        
        std::cout << "Received create request: " << req.name << std::endl;
        
        // Build artifact config
        uncver::ArtifactConfig config;
        config.name = req.name;
        if (!req.description.empty()) config.description = req.description;
        if (!req.url.empty()) config.url = req.url;
        if (!req.local_path.empty()) config.local_path = req.local_path;
        if (!req.container_image.empty()) config.container_image = req.container_image;
        
        // Create the artifact
        if (creator.create(config)) {
            resp.success = true;
            resp.message = "Artifact created successfully";
            resp.artifact_path = (creator.getArtifactsDir() / config.name).string();
            std::cout << "Successfully created artifact: " << req.name << std::endl;
        } else {
            resp.success = false;
            resp.message = "Failed to create artifact";
            std::cerr << "Failed to create artifact: " << req.name << std::endl;
        }
        
        return resp;
    });
    
    // Connect to Redis
    if (!listener.connect()) {
        std::cerr << "Failed to connect to Redis" << std::endl;
        return 1;
    }
    
    std::cout << "Service started. Listening for create requests..." << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    // Start listening in a separate thread
    std::thread listenerThread([&listener]() {
        listener.startListening();
    });
    
    // Wait for shutdown signal
    while (g_running) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    
    // Stop the listener
    listener.stop();
    listenerThread.join();
    
    std::cout << "Service stopped" << std::endl;
    return 0;
}
