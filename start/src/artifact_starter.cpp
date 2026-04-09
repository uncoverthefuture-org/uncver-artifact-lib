#include "artifact_starter.h"
#include <iostream>
#include <fstream>
#include <cstdlib>
#include <array>
#include <memory>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <chrono>
#include <unistd.h>
#include <sys/types.h>
#include <pwd.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace uncver {

ArtifactStarter::ArtifactStarter() {
}

std::string ArtifactStarter::getDataDir() const {
    const char* home = getenv("HOME");
    if (home == nullptr) {
        struct passwd* pw = getpwuid(getuid());
        if (pw) {
            home = pw->pw_dir;
        }
    }
    
    if (home) {
        return std::string(home) + "/.local/share/uncver-artifacts";
    }
    
    return ".";
}

std::string ArtifactStarter::getArtifactConfigPath(const std::string& name) {
    return getDataDir() + "/artifacts/" + name + "/artifact.json";
}

bool ArtifactStarter::artifactExists(const std::string& name) {
    std::string path = getArtifactConfigPath(name);
    std::ifstream file(path);
    return file.good();
}

std::string ArtifactStarter::runPodmanCommand(const std::string& args) {
    std::array<char, 128> buffer;
    std::string result;
    
    std::string cmd = "podman " + args + " 2>&1";
    
    std::unique_ptr<FILE, decltype(&pclose)> pipe(
        popen(cmd.c_str(), "r"), 
        pclose
    );
    
    if (!pipe) {
        return "";
    }
    
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
        result += buffer.data();
    }
    
    return result;
}

std::string ArtifactStarter::getRunningContainerId(const std::string& name) {
    // Get running containers with the artifact label
    std::string output = runPodmanCommand(
        "ps --filter label=artifact=" + name + " --format {{.ID}}");
    
    // Trim whitespace
    output.erase(0, output.find_first_not_of(" \n\r\t"));
    output.erase(output.find_last_not_of(" \n\r\t") + 1);
    
    return output;
}

bool ArtifactStarter::isRunning(const std::string& name) {
    return !getRunningContainerId(name).empty();
}

StartResponse ArtifactStarter::startArtifact(const StartRequest& request) {
    StartResponse response;
    response.request_id = request.request_id;
    response.artifact_name = request.artifact_name;
    response.success = false;
    
    // Generate timestamp
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    std::stringstream ss;
    ss << std::put_time(std::gmtime(&time), "%Y-%m-%dT%H:%M:%S");
    ss << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
    response.timestamp = ss.str();
    
    // Check if artifact exists
    if (!artifactExists(request.artifact_name)) {
        response.error_code = "ARTIFACT_NOT_FOUND";
        response.message = "Artifact '" + request.artifact_name + "' not found";
        return response;
    }
    
    // Check if already running
    std::string existingId = getRunningContainerId(request.artifact_name);
    if (!existingId.empty()) {
        response.success = true;
        response.container_id = existingId;
        response.message = "Artifact already running";
        return response;
    }
    
    // Load artifact config
    std::string configPath = getArtifactConfigPath(request.artifact_name);
    std::ifstream configFile(configPath);
    json config;
    
    try {
        configFile >> config;
    } catch (const json::exception& e) {
        response.error_code = "CONFIG_PARSE_ERROR";
        response.message = std::string("Failed to parse artifact config: ") + e.what();
        return response;
    }
    
    // Build podman run command
    std::string cmd = "run -d --rm";
    
    // Add label
    cmd += " --label artifact=" + request.artifact_name;
    
    // Add name
    cmd += " --name uncver-artifact-" + request.artifact_name;
    
    // Add port mappings if specified
    if (config.contains("ports") && config["ports"].is_array()) {
        for (const auto& port : config["ports"]) {
            if (port.contains("host") && port.contains("container")) {
                cmd += " -p " + port["host"].get<std::string>() + ":" + 
                       port["container"].get<std::string>();
            }
        }
    }
    
    // Add environment variables if specified
    if (config.contains("env") && config["env"].is_object()) {
        for (auto& [key, value] : config["env"].items()) {
            cmd += " -e " + key + "=" + value.get<std::string>();
        }
    }
    
    // Add volumes if specified
    if (config.contains("volumes") && config["volumes"].is_array()) {
        for (const auto& vol : config["volumes"]) {
            if (vol.contains("host") && vol.contains("container")) {
                cmd += " -v " + vol["host"].get<std::string>() + ":" + 
                       vol["container"].get<std::string>();
            }
        }
    }
    
    // Add the image
    std::string image;
    if (config.contains("image")) {
        image = config["image"].get<std::string>();
    } else {
        // Default to ghcr.io/uncver/artifacts namespace
        image = "ghcr.io/uncver/artifacts/" + request.artifact_name + ":latest";
    }
    cmd += " " + image;
    
    // Add command if specified
    if (config.contains("command")) {
        cmd += " " + config["command"].get<std::string>();
    }
    
    // Execute podman command
    std::string output = runPodmanCommand(cmd);
    
    // Check if container was created successfully
    if (output.empty()) {
        response.error_code = "START_FAILED";
        response.message = "Failed to start artifact: empty response from podman";
        return response;
    }
    
    // Check for errors in output
    if (output.find("Error") != std::string::npos || 
        output.find("error") != std::string::npos) {
        response.error_code = "PODMAN_ERROR";
        response.message = "Podman error: " + output;
        return response;
    }
    
    // Get container ID (first non-whitespace line)
    std::string containerId = output;
    containerId.erase(0, containerId.find_first_not_of(" \n\r\t"));
    containerId.erase(containerId.find_last_not_of(" \n\r\t") + 1);
    
    // Take just the first line if multiple
    size_t newline = containerId.find('\n');
    if (newline != std::string::npos) {
        containerId = containerId.substr(0, newline);
    }
    
    if (containerId.length() < 12) {
        response.error_code = "INVALID_CONTAINER_ID";
        response.message = "Invalid container ID returned: " + containerId;
        return response;
    }
    
    // Success
    response.success = true;
    response.container_id = containerId.substr(0, 12); // Use short ID
    response.message = "Artifact started successfully";
    
    return response;
}

} // namespace uncver
