#include "redis_listener.h"
#include <hiredis/hiredis.h>
#include <iostream>
#include <chrono>
#include <thread>

namespace uncver {

RedisListener::RedisListener(const std::string& host, int port)
    : host_(host), port_(port), context_(nullptr), running_(false) {
}

RedisListener::~RedisListener() {
    disconnect();
}

bool RedisListener::connect() {
    struct timeval timeout = { 1, 500000 }; // 1.5 seconds
    context_ = redisConnectWithTimeout(host_.c_str(), port_, timeout);
    
    if (context_ == nullptr || context_->err) {
        if (context_) {
            std::cerr << "Redis connection error: " << context_->errstr << std::endl;
            redisFree(context_);
            context_ = nullptr;
        } else {
            std::cerr << "Redis connection error: can't allocate redis context" << std::endl;
        }
        return false;
    }
    
    std::cout << "Connected to Redis at " << host_ << ":" << port_ << std::endl;
    
    // Setup streams
    return setupStreams();
}

void RedisListener::disconnect() {
    stop();
    if (context_) {
        redisFree(context_);
        context_ = nullptr;
    }
}

bool RedisListener::isConnected() const {
    return context_ != nullptr && context_->err == 0;
}

bool RedisListener::setupStreams() {
    // Create consumer group for the input stream (ignore if already exists)
    redisReply* reply = (redisReply*)redisCommand(context_, 
        "XGROUP CREATE %s %s $ MKSTREAM", 
        INPUT_STREAM, CONSUMER_GROUP);
    
    if (reply) {
        freeReplyObject(reply);
    }
    // Ignore errors - group might already exist
    
    return true;
}

void RedisListener::startListening() {
    if (!isConnected()) {
        std::cerr << "Not connected to Redis" << std::endl;
        return;
    }
    
    running_ = true;
    std::cout << "Started listening on stream: " << INPUT_STREAM << std::endl;
    
    while (running_) {
        processMessages();
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

void RedisListener::stop() {
    running_ = false;
}

void RedisListener::onCreateRequest(std::function<CreateResponse(const CreateRequest&)> callback) {
    createCallback_ = callback;
}

CreateRequest RedisListener::parseRequest(redisReply* reply) {
    CreateRequest req;
    
    // Parse the Redis stream message
    // Format: [[stream_name, [[id, [key, value, ...]]]]]
    if (reply->type == REDIS_REPLY_ARRAY && reply->elements >= 1) {
        redisReply* stream = reply->element[0];
        if (stream->type == REDIS_REPLY_ARRAY && stream->elements >= 2) {
            redisReply* messages = stream->element[1];
            if (messages->type == REDIS_REPLY_ARRAY && messages->elements >= 1) {
                redisReply* message = messages->element[0];
                if (message->type == REDIS_REPLY_ARRAY && message->elements >= 2) {
                    // message[0] = id, message[1] = key-value pairs
                    req.id = message->element[0]->str;
                    
                    redisReply* kvs = message->element[1];
                    if (kvs->type == REDIS_REPLY_ARRAY) {
                        for (size_t i = 0; i < kvs->elements; i += 2) {
                            if (i + 1 < kvs->elements) {
                                std::string key = kvs->element[i]->str;
                                std::string value = kvs->element[i+1]->str;
                                
                                if (key == "name") req.name = value;
                                else if (key == "description") req.description = value;
                                else if (key == "url") req.url = value;
                                else if (key == "local_path") req.local_path = value;
                                else if (key == "container_image") req.container_image = value;
                            }
                        }
                    }
                }
            }
        }
    }
    
    return req;
}

void RedisListener::processMessages() {
    if (!isConnected()) return;
    
    // Read from stream using consumer group
    redisReply* reply = (redisReply*)redisCommand(context_,
        "XREADGROUP GROUP %s %s COUNT 1 BLOCK 5000 STREAMS %s >",
        CONSUMER_GROUP, CONSUMER_NAME, INPUT_STREAM);
    
    if (!reply) return;
    
    if (reply->type == REDIS_REPLY_ARRAY && reply->elements > 0) {
        CreateRequest req = parseRequest(reply);
        
        if (!req.name.empty() && createCallback_) {
            std::cout << "Processing create request: " << req.name << std::endl;
            
            CreateResponse resp = createCallback_(req);
            
            if (resp.success) {
                publishResponse(resp);
            } else {
                sendError(resp.request_id, resp.message);
            }
        }
        
        // Acknowledge the message
        if (!req.id.empty()) {
            redisReply* ack = (redisReply*)redisCommand(context_,
                "XACK %s %s %s", INPUT_STREAM, CONSUMER_GROUP, req.id.c_str());
            if (ack) freeReplyObject(ack);
        }
    }
    
    freeReplyObject(reply);
}

bool RedisListener::publishResponse(const CreateResponse& response) {
    if (!isConnected()) return false;
    
    redisReply* reply = (redisReply*)redisCommand(context_,
        "XADD %s * request_id %s success %d message %s artifact_path %s",
        OUTPUT_STREAM,
        response.request_id.c_str(),
        response.success ? 1 : 0,
        response.message.c_str(),
        response.artifact_path.c_str());
    
    if (reply) {
        freeReplyObject(reply);
        std::cout << "Published success response for: " << response.request_id << std::endl;
        return true;
    }
    
    return false;
}

void RedisListener::sendError(const std::string& request_id, const std::string& error) {
    if (!isConnected()) return;
    
    redisReply* reply = (redisReply*)redisCommand(context_,
        "XADD %s * request_id %s error %s",
        ERROR_STREAM,
        request_id.c_str(),
        error.c_str());
    
    if (reply) {
        freeReplyObject(reply);
    }
    
    std::cerr << "Published error for: " << request_id << " - " << error << std::endl;
}

} // namespace uncver
