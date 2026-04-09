#include <iostream>
#include <string>
#include <cstdlib>
#include <getopt.h>

#include "share_client.h"
#include "artifact_reader.h"

using namespace uncver;

namespace {

// Version info
constexpr const char* VERSION = "1.0.0";

// Default configuration
constexpr const char* DEFAULT_CONFIG_DIR = "~/.uncver";
constexpr const char* ENV_USERNAME = "UNCVER_USERNAME";
constexpr const char* ENV_ARTIFACTS_DIR = "UNCVER_ARTIFACTS_DIR";

void print_usage(const char* program_name) {
    std::cout << R"(uncver-share-artifact v)" << VERSION << R"(
Share artifacts P2P with friends via WebSocket

USAGE:
    )" << program_name << R"( [OPTIONS]

OPTIONS:
    -a, --artifact <name>     Name of the artifact to share (required)
    -t, --to <url>            Friend's WebSocket URL (required)
    -m, --message <text>      Optional message to include
    -c, --config <dir>        Config directory (default: ~/.uncver)
    -h, --help                Show this help message
    -v, --version             Show version information

ENVIRONMENT:
    UNCVER_USERNAME           Username to send as 'from' field
    UNCVER_ARTIFACTS_DIR      Override artifacts directory

EXAMPLES:
    # Share an artifact
    )" << program_name << R"( --artifact my-app --to wss://friend.ngrok.io/ws

    # Share with a custom message
    )" << program_name << R"( --artifact my-app --to wss://friend.ngrok.io/ws --message "Check out my new artifact!"

    # Use custom config directory
    )" << program_name << R"( --artifact my-app --to wss://friend.ngrok.io/ws --config /path/to/config
)";
}

void print_version() {
    std::cout << "uncver-share-artifact version " << VERSION << std::endl;
}

std::string get_username(const std::string& config_dir) {
    // First check environment
    const char* env_user = std::getenv(ENV_USERNAME);
    if (env_user && std::strlen(env_user) > 0) {
        return env_user;
    }

    // TODO: Read from config.json if exists
    // For now, use system username
    const char* user = std::getenv("USER");
    if (user) {
        return user;
    }

#ifdef _WIN32
    const char* username = std::getenv("USERNAME");
    if (username) {
        return username;
    }
#endif

    return "unknown";
}

std::string get_artifacts_dir(const std::string& config_dir) {
    // First check environment
    const char* env_dir = std::getenv(ENV_ARTIFACTS_DIR);
    if (env_dir && std::strlen(env_dir) > 0) {
        return env_dir;
    }

    return config_dir + "/artifacts";
}

struct Config {
    std::string artifact_name;
    std::string target_url;
    std::string message;
    std::string config_dir = DEFAULT_CONFIG_DIR;
    bool show_help = false;
    bool show_version = false;
};

Config parse_args(int argc, char* argv[]) {
    Config config;

    static struct option long_options[] = {
        {"artifact", required_argument, nullptr, 'a'},
        {"to", required_argument, nullptr, 't'},
        {"message", required_argument, nullptr, 'm'},
        {"config", required_argument, nullptr, 'c'},
        {"help", no_argument, nullptr, 'h'},
        {"version", no_argument, nullptr, 'v'},
        {nullptr, 0, nullptr, 0}
    };

    int opt;
    while ((opt = getopt_long(argc, argv, "a:t:m:c:hv", long_options, nullptr)) != -1) {
        switch (opt) {
            case 'a':
                config.artifact_name = optarg;
                break;
            case 't':
                config.target_url = optarg;
                break;
            case 'm':
                config.message = optarg;
                break;
            case 'c':
                config.config_dir = optarg;
                break;
            case 'h':
                config.show_help = true;
                break;
            case 'v':
                config.show_version = true;
                break;
            case '?':
                std::cerr << "Error: Invalid option" << std::endl;
                exit(1);
            default:
                break;
        }
    }

    return config;
}

} // anonymous namespace

int main(int argc, char* argv[]) {
    // Parse command line arguments
    Config config = parse_args(argc, argv);

    // Handle help/version
    if (config.show_help) {
        print_usage(argv[0]);
        return 0;
    }

    if (config.show_version) {
        print_version();
        return 0;
    }

    // Validate required arguments
    if (config.artifact_name.empty()) {
        std::cerr << "Error: --artifact is required" << std::endl;
        std::cerr << "Use --help for usage information" << std::endl;
        return 1;
    }

    if (config.target_url.empty()) {
        std::cerr << "Error: --to is required" << std::endl;
        std::cerr << "Use --help for usage information" << std::endl;
        return 1;
    }

    // Get configuration
    std::string username = get_username(config.config_dir);
    std::string artifacts_dir = get_artifacts_dir(config.config_dir);

    std::cout << "[INFO] Sharing artifact '" << config.artifact_name 
              << "' as user '" << username << "'" << std::endl;
    std::cout << "[INFO] Target: " << config.target_url << std::endl;

    // Read artifact
    ArtifactReader reader(artifacts_dir);
    
    if (!reader.artifact_exists(config.artifact_name)) {
        std::cerr << "Error: Artifact '" << config.artifact_name 
                  << "' not found in " << artifacts_dir << std::endl;
        return 1;
    }

    auto artifact_opt = reader.read_artifact(config.artifact_name);
    if (!artifact_opt) {
        std::cerr << "Error: Failed to read artifact: " 
                  << reader.get_last_error() << std::endl;
        return 1;
    }

    Artifact artifact = *artifact_opt;
    std::cout << "[INFO] Artifact: " << artifact.name 
              << " v" << artifact.version << std::endl;

    // Connect and share
    ShareClient client(username);
    client.set_timeout(10000); // 10 second timeout

    if (!client.connect(config.target_url)) {
        std::cerr << "Error: Failed to connect to " << config.target_url 
                  << ": " << client.get_last_error() << std::endl;
        return 1;
    }

    std::cout << "[INFO] Connected successfully" << std::endl;

    // Send artifact
    std::string artifact_json = artifact.to_json();
    bool send_complete = false;
    ShareResponse response;

    bool send_result = client.send_artifact(
        artifact_json,
        config.message,
        [&send_complete, &response](const ShareResponse& resp) {
            response = resp;
            send_complete = true;
        }
    );

    if (!send_result) {
        std::cerr << "Error: Failed to send artifact: " 
                  << client.get_last_error() << std::endl;
        return 1;
    }

    // Wait for response (with simple polling)
    int wait_ms = 0;
    const int max_wait_ms = 10000;
    const int poll_interval_ms = 100;
    
    while (!send_complete && wait_ms < max_wait_ms) {
        std::this_thread::sleep_for(std::chrono::milliseconds(poll_interval_ms));
        wait_ms += poll_interval_ms;
    }

    if (!send_complete) {
        std::cerr << "Error: Timeout waiting for response" << std::endl;
        return 1;
    }

    // Handle response
    if (response.success) {
        std::cout << "[SUCCESS] Artifact shared successfully!" << std::endl;
        if (!response.message.empty()) {
            std::cout << "[INFO] Friend responded: " << response.message << std::endl;
        }
        return 0;
    } else {
        std::cerr << "[FAILED] Share failed: " << response.message << std::endl;
        return 1;
    }
}
