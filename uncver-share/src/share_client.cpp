#include "share_client.h"

#include <websocketpp/config/asio_client.hpp>
#include <websocketpp/client.hpp>

#include <nlohmann/json.hpp>

#include <iostream>
#include <thread>
#include <chrono>
#include <mutex>
#include <condition_variable>

using json = nlohmann::json;

typedef websocketpp::client<websocketpp::config::asio_tls_client> client;
typedef websocketpp::lib::shared_ptr<websocketpp::lib::asio::ssl::context> context_ptr;

namespace uncver {

// TLS initialization handler
context_ptr on_tls_init() {
    context_ptr ctx = websocketpp::lib::make_shared<websocketpp::lib::asio::ssl::context>(
        websocketpp::lib::asio::ssl::context::sslv23_client);
    
    try {
        ctx->set_options(websocketpp::lib::asio::ssl::context::default_workarounds |
                         websocketpp::lib::asio::ssl::context::no_sslv2 |
                         websocketpp::lib::asio::ssl::context::no_sslv3 |
                         websocketpp::lib::asio::ssl::context::single_dh_use);
    } catch (std::exception& e) {
        std::cerr << "[ERROR] TLS initialization failed: " << e.what() << std::endl;
    }
    
    return ctx;
}

class ShareClient::Impl {
public:
    explicit Impl(const std::string& username) 
        : username_(username)
        , connected_(false)
        , timeout_ms_(10000) {
    }

    ~Impl() {
        disconnect();
    }

    bool connect(const std::string& url) {
        try {
            // Initialize WebSocket++ client
            ws_client_.clear_access_channels(websocketpp::log::alevel::all);
            ws_client_.clear_error_channels(websocketpp::log::elevel::all);

            ws_client_.init_asio();
            ws_client_.set_tls_init_handler([](websocketpp::connection_hdl) {
                return on_tls_init();
            });

            // Set up handlers
            ws_client_.set_open_handler([this](websocketpp::connection_hdl hdl) {
                std::lock_guard<std::mutex> lock(mutex_);
                connection_hdl_ = hdl;
                connected_ = true;
                cv_.notify_all();
            });

            ws_client_.set_close_handler([this](websocketpp::connection_hdl) {
                std::lock_guard<std::mutex> lock(mutex_);
                connected_ = false;
            });

            ws_client_.set_fail_handler([this](websocketpp::connection_hdl) {
                std::lock_guard<std::mutex> lock(mutex_);
                connected_ = false;
                auto con = ws_client_.get_con_from_hdl(connection_hdl_);
                if (con) {
                    last_error_ = "Connection failed: " + con->get_ec().message();
                }
                cv_.notify_all();
            });

            ws_client_.set_message_handler([this](websocketpp::connection_hdl, client::message_ptr msg) {
                handle_message(msg->get_payload());
            });

            // Create connection
            websocketpp::lib::error_code ec;
            client::connection_ptr con = ws_client_.get_connection(url, ec);
            
            if (ec) {
                last_error_ = "Connection error: " + ec.message();
                return false;
            }

            // Connect
            ws_client_.connect(con);

            // Start ASIO thread
            asio_thread_ = std::thread([this]() {
                ws_client_.run();
            });

            // Wait for connection with timeout
            std::unique_lock<std::mutex> lock(mutex_);
            bool connected = cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms_), [this]() {
                return connected_ || !last_error_.empty();
            });

            if (!connected) {
                last_error_ = "Connection timeout";
                return false;
            }

            return connected_;

        } catch (const std::exception& e) {
            last_error_ = std::string("Exception: ") + e.what();
            return false;
        }
    }

    void disconnect() {
        if (connected_) {
            websocketpp::lib::error_code ec;
            ws_client_.close(connection_hdl_, websocketpp::close::status::normal, "Closing", ec);
        }
        
        ws_client_.stop();
        
        if (asio_thread_.joinable()) {
            asio_thread_.join();
        }
        
        connected_ = false;
    }

    bool is_connected() const {
        return connected_;
    }

    bool send_artifact(const std::string& artifact_json, 
                       const std::string& message,
                       ShareCallback callback) {
        if (!connected_) {
            last_error_ = "Not connected";
            return false;
        }

        try {
            // Parse artifact JSON
            json artifact = json::parse(artifact_json);

            // Build share payload
            json payload = {
                {"type", "artifact_shared"},
                {"from", username_},
                {"artifact", artifact},
                {"message", message.empty() ? nullptr : message},
                {"timestamp", get_iso_timestamp()}
            };

            // Store callback for when response arrives
            {
                std::lock_guard<std::mutex> lock(callback_mutex_);
                pending_callback_ = callback;
            }

            // Send the message
            std::string payload_str = payload.dump();
            websocketpp::lib::error_code ec;
            
            ws_client_.send(connection_hdl_, payload_str, websocketpp::frame::opcode::text, ec);
            
            if (ec) {
                last_error_ = "Send error: " + ec.message();
                return false;
            }

            std::cout << "[INFO] Sent payload: " << payload_str << std::endl;
            
            return true;

        } catch (const json::exception& e) {
            last_error_ = std::string("JSON error: ") + e.what();
            return false;
        } catch (const std::exception& e) {
            last_error_ = std::string("Exception: ") + e.what();
            return false;
        }
    }

    void set_timeout(int milliseconds) {
        timeout_ms_ = milliseconds;
    }

    std::string get_last_error() const {
        return last_error_;
    }

private:
    void handle_message(const std::string& payload) {
        std::cout << "[INFO] Received: " << payload << std::endl;

        try {
            json response = json::parse(payload);
            
            ShareResponse share_resp;
            share_resp.success = response.value("success", false);
            share_resp.message = response.value("message", "");
            share_resp.received_at = response.value("received_at", "");

            // Invoke callback
            std::lock_guard<std::mutex> lock(callback_mutex_);
            if (pending_callback_) {
                pending_callback_(share_resp);
                pending_callback_ = nullptr;
            }

        } catch (const json::exception& e) {
            std::cerr << "[WARN] Failed to parse response: " << e.what() << std::endl;
            
            // Still invoke callback with failure
            std::lock_guard<std::mutex> lock(callback_mutex_);
            if (pending_callback_) {
                ShareResponse share_resp;
                share_resp.success = false;
                share_resp.message = "Invalid JSON response";
                pending_callback_(share_resp);
                pending_callback_ = nullptr;
            }
        }
    }

    static std::string get_iso_timestamp() {
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        
        std::stringstream ss;
        ss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
        return ss.str();
    }

    client ws_client_;
    websocketpp::connection_hdl connection_hdl_;
    std::thread asio_thread_;
    
    std::string username_;
    std::atomic<bool> connected_;
    int timeout_ms_;
    std::string last_error_;

    mutable std::mutex mutex_;
    std::condition_variable cv_;

    std::mutex callback_mutex_;
    ShareCallback pending_callback_;
};

// Public interface implementation
ShareClient::ShareClient(const std::string& username)
    : pImpl(std::make_unique<Impl>(username)) {
}

ShareClient::~ShareClient() = default;

ShareClient::ShareClient(ShareClient&&) noexcept = default;
ShareClient& ShareClient::operator=(ShareClient&&) noexcept = default;

bool ShareClient::connect(const std::string& url) {
    return pImpl->connect(url);
}

void ShareClient::disconnect() {
    pImpl->disconnect();
}

bool ShareClient::is_connected() const {
    return pImpl->is_connected();
}

bool ShareClient::send_artifact(const std::string& artifact_json, 
                                 const std::string& message,
                                 ShareCallback callback) {
    return pImpl->send_artifact(artifact_json, message, callback);
}

void ShareClient::set_timeout(int milliseconds) {
    pImpl->set_timeout(milliseconds);
}

std::string ShareClient::get_last_error() const {
    return pImpl->get_last_error();
}

} // namespace uncver
