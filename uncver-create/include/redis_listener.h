#pragma once

#include <string>
#include <functional>
#include <memory>

struct redisContext;
struct redisReply;

namespace uncver {

struct CreateRequest {
    std::string id;
    std::string name;
    std::string description;
    std::string url;
    std::string local_path;
    std::string container_image;
};

struct CreateResponse {
    std::string request_id;
    bool success;
    std::string message;
    std::string artifact_path;
};

class RedisListener {
public:
    RedisListener(const std::string& host = "127.0.0.1", int port = 6379);
    ~RedisListener();

    // Disable copy
    RedisListener(const RedisListener&) = delete;
    RedisListener& operator=(const RedisListener&) = delete;

    // Connect to Redis
    bool connect();
    void disconnect();
    bool isConnected() const;

    // Start listening for create requests
    void startListening();
    void stop();

    // Set callback for create requests
    void onCreateRequest(std::function<CreateResponse(const CreateRequest&)> callback);

    // Publish response
    bool publishResponse(const CreateResponse& response);

private:
    std::string host_;
    int port_;
    redisContext* context_;
    bool running_;
    std::function<CreateResponse(const CreateRequest&)> createCallback_;

    // Stream names
    static constexpr const char* INPUT_STREAM = "uncver:artifacts:create";
    static constexpr const char* OUTPUT_STREAM = "uncver:artifacts:created";
    static constexpr const char* ERROR_STREAM = "uncver:artifacts:errors";
    static constexpr const char* CONSUMER_GROUP = "create-artifact-group";
    static constexpr const char* CONSUMER_NAME = "create-artifact-consumer";

    bool setupStreams();
    CreateRequest parseRequest(redisReply* reply);
    void processMessages();
    void sendError(const std::string& request_id, const std::string& error);
};

} // namespace uncver
