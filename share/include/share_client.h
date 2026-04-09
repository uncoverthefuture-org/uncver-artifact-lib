#ifndef SHARE_CLIENT_H
#define SHARE_CLIENT_H

#include <string>
#include <functional>
#include <memory>
#include <atomic>

// Forward declarations for WebSocket++
namespace websocketpp {
    template <typename T> class client;
    namespace config {
        struct asio_tls_client;
    }
}

typedef websocketpp::client<websocketpp::config::asio_tls_client> ws_client;

namespace uncver {

/**
 * @brief Response from the WebSocket server
 */
struct ShareResponse {
    bool success;
    std::string message;
    std::string received_at;
};

/**
 * @brief Callback for share completion
 */
using ShareCallback = std::function<void(const ShareResponse&)>;

/**
 * @brief WebSocket client for sharing artifacts P2P
 * 
 * This class handles the WebSocket connection to a friend's endpoint,
 * sending artifact metadata as JSON, and receiving acknowledgments.
 */
class ShareClient {
public:
    /**
     * @brief Construct a new ShareClient
     * @param username The local username (sent as "from" field)
     */
    explicit ShareClient(const std::string& username);
    
    /**
     * @brief Destructor - ensures clean disconnection
     */
    ~ShareClient();

    // Disable copy
    ShareClient(const ShareClient&) = delete;
    ShareClient& operator=(const ShareClient&) = delete;

    // Enable move
    ShareClient(ShareClient&&) noexcept;
    ShareClient& operator=(ShareClient&&) noexcept;

    /**
     * @brief Connect to a WebSocket endpoint
     * @param url The WebSocket URL (ws:// or wss://)
     * @return true if connection established
     */
    bool connect(const std::string& url);

    /**
     * @brief Disconnect from the current endpoint
     */
    void disconnect();

    /**
     * @brief Check if currently connected
     */
    bool is_connected() const;

    /**
     * @brief Send artifact data to the connected peer
     * @param artifact_json The artifact metadata as JSON string
     * @param message Optional custom message
     * @param callback Callback invoked when response received or timeout
     * @return true if send initiated successfully
     */
    bool send_artifact(const std::string& artifact_json, 
                       const std::string& message,
                       ShareCallback callback);

    /**
     * @brief Set timeout for operations (milliseconds)
     */
    void set_timeout(int milliseconds);

    /**
     * @brief Get the last error message
     */
    std::string get_last_error() const;

private:
    class Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace uncver

#endif // SHARE_CLIENT_H
