#include "artifact_stopper.h"
#include <iostream>
#include <array>
#include <memory>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <chrono>

namespace uncver {

ArtifactStopper::ArtifactStopper() {
}

std::string ArtifactStopper::runPodmanCommand(const std::string& args) {
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

bool ArtifactStopper::containerExists(const std::string& container_id) {
    // Check if container exists (running or stopped)
    std::string output = runPodmanCommand(
        "ps -a --filter id=" + container_id + " --format {{.ID}}");
    
    // Trim whitespace
    output.erase(0, output.find_first_not_of(" \n\r\t"));
    output.erase(output.find_last_not_of(" \n\r\t") + 1);
    
    return !output.empty();
}

bool ArtifactStopper::isRunning(const std::string& container_id) {
    // Check if container is running
    std::string output = runPodmanCommand(
        "ps --filter id=" + container_id + " --format {{.ID}}");
    
    // Trim whitespace
    output.erase(0, output.find_first_not_of(" \n\r\t"));
    output.erase(output.find_last_not_of(" \n\r\t") + 1);
    
    return !output.empty();
}

std::string ArtifactStopper::getContainerInfo(const std::string& container_id) {
    std::string output = runPodmanCommand(
        "ps -a --filter id=" + container_id + " --format \"{{.ID}}|{{.Image}}|{{.Status}}\"");
    
    // Trim whitespace
    output.erase(0, output.find_first_not_of(" \n\r\t"));
    output.erase(output.find_last_not_of(" \n\r\t") + 1);
    
    return output;
}

StopResponse ArtifactStopper::stopContainer(const StopRequest& request) {
    StopResponse response;
    response.request_id = request.request_id;
    response.container_id = request.container_id;
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
    
    // Validate container_id is not empty
    if (request.container_id.empty()) {
        response.error_code = "INVALID_REQUEST";
        response.message = "container_id is required";
        return response;
    }
    
    // Check if container exists
    if (!containerExists(request.container_id)) {
        response.error_code = "NOT_FOUND";
        response.message = "Container '" + request.container_id + "' not found";
        return response;
    }
    
    // Check if container is running
    if (!isRunning(request.container_id)) {
        response.success = true;
        response.message = "Container already stopped";
        return response;
    }
    
    // Stop the container
    std::string output = runPodmanCommand("stop " + request.container_id);
    
    // Check for errors in output
    if (output.find("Error") != std::string::npos || 
        output.find("error") != std::string::npos) {
        response.error_code = "PODMAN_ERROR";
        response.message = "Podman error: " + output;
        return response;
    }
    
    // Verify container was stopped
    if (isRunning(request.container_id)) {
        response.error_code = "STOP_FAILED";
        response.message = "Failed to stop container: still running after stop command";
        return response;
    }
    
    // Success
    response.success = true;
    response.message = "Container stopped successfully";
    
    return response;
}

} // namespace uncver
