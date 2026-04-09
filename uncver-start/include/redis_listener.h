#pragma once

#include <string>
#include <functional>
#include <memory>

struct redisContext;
struct redisReply;

namespace uncver {

struct StartRequest {
    std::string request_id;
    std::string artifact_name;
};

struct StartResponse {
    std::string request_id;
    std::string artifact_name;
    bool success;
    std::string container_id;
    std::string message;
    std::string timestamp;
    std::string error_code;
};

class RedisListener {
public:
    RedisListener(const std::string& host = "127.0.0.1", int port = 6379);
    ~RedisListener();

    RedisListener(const RedisListener&) = delete;
    RedisListener& operator=(const RedisListener&) = delete;
    RedisListener(RedisListener&&) = default;
    RedisListener& operator=(RedisListener&&) = default;

    bool connect();
    void disconnect();
    bool isConnected() const;

    void startListening();
    void stop();

    void onStartRequest(std::function<StartResponse(const StartRequest&)> callback);
    bool publishResponse(const StartResponse& response);

private:
    std::string host_;
    int port_;
    redisContext* context_;
    bool running_;
    std::function<StartResponse(const StartRequest&)> callback_;

    static constexpr const char* INPUT_STREAM = "uncver:artifacts:start";
    static constexpr const char* OUTPUT_STREAM = "uncver:artifacts:started";
    static constexpr const char* ERROR_STREAM = "uncver:artifacts:errors";
    static constexpr const char* CONSUMER_GROUP = "start-artifact-group";
    static constexpr const char* CONSUMER_NAME = "start-artifact-consumer";

    bool setupStreams();
    StartRequest parseRequest(redisReply* reply);
    void processMessages();
    void sendError(const StartResponse& error);
    std::string getCurrentTimestamp();
};

} // namespace uncver
