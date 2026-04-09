#pragma once

#include <string>
#include <functional>
#include <memory>

struct redisContext;
struct redisReply;

namespace uncver {

struct DeleteRequest {
    std::string request_id;
    std::string artifact_name;
};

struct DeleteResponse {
    std::string request_id;
    std::string artifact_name;
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

    void onDeleteRequest(std::function<DeleteResponse(const DeleteRequest&)> callback);
    bool publishResponse(const DeleteResponse& response);

private:
    std::string host_;
    int port_;
    redisContext* context_;
    bool running_;
    std::function<DeleteResponse(const DeleteRequest&)> callback_;

    static constexpr const char* INPUT_STREAM = "uncver:artifacts:delete";
    static constexpr const char* OUTPUT_STREAM = "uncver:artifacts:deleted";
    static constexpr const char* ERROR_STREAM = "uncver:artifacts:errors";
    static constexpr const char* CONSUMER_GROUP = "delete-artifact-group";
    static constexpr const char* CONSUMER_NAME = "delete-artifact-consumer";

    bool setupStreams();
    DeleteRequest parseRequest(redisReply* reply);
    void processMessages();
    void sendError(const DeleteResponse& error);
    std::string getCurrentTimestamp();
};

} // namespace uncver
