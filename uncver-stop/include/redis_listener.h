#pragma once

#include <string>
#include <functional>
#include <memory>

struct redisContext;
struct redisReply;

namespace uncver {

struct StopRequest {
    std::string request_id;
    std::string container_id;
};

struct StopResponse {
    std::string request_id;
    std::string container_id;
    bool success;
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

    void onStopRequest(std::function<StopResponse(const StopRequest&)> callback);
    bool publishResponse(const StopResponse& response);

private:
    std::string host_;
    int port_;
    redisContext* context_;
    bool running_;
    std::function<StopResponse(const StopRequest&)> callback_;

    static constexpr const char* INPUT_STREAM = "uncver:artifacts:stop";
    static constexpr const char* OUTPUT_STREAM = "uncver:artifacts:stopped";
    static constexpr const char* ERROR_STREAM = "uncver:artifacts:errors";
    static constexpr const char* CONSUMER_GROUP = "stop-artifact-group";
    static constexpr const char* CONSUMER_NAME = "stop-artifact-consumer";

    bool setupStreams();
    StopRequest parseRequest(redisReply* reply);
    void processMessages();
    void sendError(const StopResponse& error);
    std::string getCurrentTimestamp();
};

} // namespace uncver
