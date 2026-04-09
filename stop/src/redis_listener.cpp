#include "redis_listener.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <chrono>
#include <hiredis/hiredis.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace uncver {

RedisListener::RedisListener(const std::string& host, int port)
    : host_(host)
    , port_(port)
    , context_(nullptr)
    , running_(false) {
}

RedisListener::~RedisListener() {
    disconnect();
}

bool RedisListener::connect() {
    if (isConnected()) {
        disconnect();
    }

    struct timeval timeout = { 5, 0 }; // 5 second timeout
    context_ = redisConnectWithTimeout(host_.c_str(), port_, timeout);

    if (context_ == nullptr || context_->err) {
        if (context_) {
            std::cerr << "Redis connection error: " << context_->errstr << std::endl;
            redisFree(context_);
            context_ = nullptr;
        } else {
            std::cerr << "Redis connection error: cannot allocate context" << std::endl;
        }
        return false;
    }

    // Set up consumer group and streams
    if (!setupStreams()) {
        disconnect();
        return false;
    }

    return true;
}

void RedisListener::disconnect() {
    if (context_) {
        redisFree(context_);
        context_ = nullptr;
    }
    running_ = false;
}

bool RedisListener::isConnected() const {
    return context_ != nullptr && context_->err == 0;
}

bool RedisListener::setupStreams() {
    // Create input stream if not exists
    redisReply* reply = (redisReply*)redisCommand(context_,
        "XGROUP CREATE %s %s $ MKSTREAM", INPUT_STREAM, CONSUMER_GROUP);
    
    if (reply) {
        if (reply->type == REDIS_REPLY_ERROR && 
            std::string(reply->str).find("BUSYGROUP") == std::string::npos) {
            std::cerr << "XGROUP CREATE error: " << reply->str << std::endl;
            freeReplyObject(reply);
            return false;
        }
        freeReplyObject(reply);
    }

    // Create output streams
    reply = (redisReply*)redisCommand(context_, "XLEN %s", OUTPUT_STREAM);
    if (reply) {
        freeReplyObject(reply);
    }

    reply = (redisReply*)redisCommand(context_, "XLEN %s", ERROR_STREAM);
    if (reply) {
        freeReplyObject(reply);
    }

    return true;
}

void RedisListener::startListening() {
    if (!isConnected()) {
        throw std::runtime_error("Not connected to Redis");
    }

    running_ = true;

    while (running_ && isConnected()) {
        processMessages();
    }
}

void RedisListener::stop() {
    running_ = false;
}

void RedisListener::processMessages() {
    // Read from stream with consumer group
    redisReply* reply = (redisReply*)redisCommand(context_,
        "XREADGROUP GROUP %s %s COUNT 1 BLOCK 1000 STREAMS %s >",
        CONSUMER_GROUP, CONSUMER_NAME, INPUT_STREAM);

    if (!reply) {
        if (context_->err) {
            std::cerr << "Redis error: " << context_->errstr << std::endl;
            return;
        }
        return;
    }

    if (reply->type == REDIS_REPLY_ARRAY && reply->elements > 0) {
        for (size_t i = 0; i < reply->elements; ++i) {
            redisReply* stream = reply->element[i];
            if (stream->type == REDIS_REPLY_ARRAY && stream->elements >= 2) {
                redisReply* messages = stream->element[1];
                if (messages->type == REDIS_REPLY_ARRAY) {
                    for (size_t j = 0; j < messages->elements; ++j) {
                        redisReply* msg = messages->element[j];
                        if (msg->type == REDIS_REPLY_ARRAY && msg->elements >= 2) {
                            StopRequest request = parseRequest(msg->element[1]);
                            
                            if (callback_) {
                                StopResponse response = callback_(request);
                                
                                if (response.success) {
                                    if (!publishResponse(response)) {
                                        std::cerr << "Failed to publish response for request " 
                                                  << request.request_id << std::endl;
                                    }
                                } else {
                                    sendError(response);
                                }
                            }

                            // Acknowledge the message
                            redisReply* idReply = msg->element[0];
                            if (idReply->type == REDIS_REPLY_STRING) {
                                redisReply* ackReply = (redisReply*)redisCommand(context_,
                                    "XACK %s %s %s", INPUT_STREAM, CONSUMER_GROUP, idReply->str);
                                if (ackReply) {
                                    freeReplyObject(ackReply);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    freeReplyObject(reply);
}

StopRequest RedisListener::parseRequest(redisReply* reply) {
    StopRequest request;
    
    if (reply->type != REDIS_REPLY_ARRAY) {
        return request;
    }

    // Look for the "data" field which contains JSON
    for (size_t i = 0; i < reply->elements - 1; i += 2) {
        redisReply* key = reply->element[i];
        redisReply* value = reply->element[i + 1];

        if (key->type == REDIS_REPLY_STRING && 
            strcmp(key->str, "data") == 0 &&
            value->type == REDIS_REPLY_STRING) {
            
            try {
                json j = json::parse(value->str);
                
                if (j.contains("request_id")) {
                    request.request_id = j["request_id"].get<std::string>();
                }
                if (j.contains("container_id")) {
                    request.container_id = j["container_id"].get<std::string>();
                }
            } catch (const json::exception& e) {
                std::cerr << "JSON parse error: " << e.what() << std::endl;
            }
            break;
        }
    }

    return request;
}

bool RedisListener::publishResponse(const StopResponse& response) {
    json j;
    j["request_id"] = response.request_id;
    j["container_id"] = response.container_id;
    j["success"] = response.success;
    j["message"] = response.message;
    j["timestamp"] = response.timestamp;

    std::string jsonStr = j.dump();

    redisReply* reply = (redisReply*)redisCommand(context_,
        "XADD %s * data %s", OUTPUT_STREAM, jsonStr.c_str());

    if (!reply) {
        return false;
    }

    bool success = (reply->type != REDIS_REPLY_ERROR);
    freeReplyObject(reply);
    
    return success;
}

void RedisListener::sendError(const StopResponse& error) {
    json j;
    j["request_id"] = error.request_id;
    j["container_id"] = error.container_id;
    j["success"] = false;
    j["error_code"] = error.error_code;
    j["message"] = error.message;
    j["timestamp"] = error.timestamp;

    std::string jsonStr = j.dump();

    redisReply* reply = (redisReply*)redisCommand(context_,
        "XADD %s * data %s", ERROR_STREAM, jsonStr.c_str());

    if (reply) {
        freeReplyObject(reply);
    }
}

void RedisListener::onStopRequest(std::function<StopResponse(const StopRequest&)> callback) {
    callback_ = callback;
}

std::string RedisListener::getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;

    std::stringstream ss;
    ss << std::put_time(std::gmtime(&time), "%Y-%m-%dT%H:%M:%S");
    ss << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
    
    return ss.str();
}

} // namespace uncver
