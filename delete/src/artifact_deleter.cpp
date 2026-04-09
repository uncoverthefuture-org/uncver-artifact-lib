#include "artifact_deleter.h"
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

ArtifactDeleter::ArtifactDeleter() {
}

std::string ArtifactDeleter::getDataDir() const {
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

std::string ArtifactDeleter::getArtifactConfigPath(const std::string& name) {
    return getDataDir() + "/artifacts/" + name + "/artifact.json";
}

bool ArtifactDeleter::artifactExists(const std::string& name) {
    std::string path = getArtifactConfigPath(name);
    std::ifstream file(path);
    return file.good();
}

std::string ArtifactDeleter::runPodmanCommand(const std::string& args) {
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

std::string ArtifactDeleter::getRunningContainerId(const std::string& name) {
    // Get running containers with the artifact label
    std::string output = runPodmanCommand(
        "ps --filter label=artifact=" + name + " --format {{.ID}}");
    
    // Trim whitespace
    output.erase(0, output.find_first_not_of(" \n\r\t"));
    output.erase(output.find_last_not_of(" \n\r\t") + 1);
    
    return output;
}

bool ArtifactDeleter::isRunning(const std::string& name) {
    return !getRunningContainerId(name).empty();
}

bool ArtifactDeleter::stopContainer(const std::string& name) {
    std::string containerId = getRunningContainerId(name);
    if (containerId.empty()) {
        return true; // Not running, consider it stopped
    }
    
    std::string output = runPodmanCommand("stop " + containerId);
    
    // Check for success (podman stop returns container ID on success)
    if (output.find(containerId) != std::string::npos ||
        output.find("stopped") != std::string::npos ||
        output.empty()) {
        return true;
    }
    
    return false;
}

bool ArtifactDeleter::deleteArtifactDirectory(const std::string& name) {
    std::string artifactDir = getDataDir() + "/artifacts/" + name;
    
    // Use rm -rf to delete the directory
    std::string cmd = "rm -rf \"" + artifactDir + "\"";
    int result = system(cmd.c_str());
    
    return result == 0;
}

bool ArtifactDeleter::deleteCodeDirectory(const std::string& name) {
    std::string codeDir = "/tmp/" + name;
    
    // Check if directory exists first
    std::string checkCmd = "test -d \"" + codeDir + "\"";
    int exists = system(checkCmd.c_str());
    
    if (exists != 0) {
        // Directory doesn't exist, that's fine
        return true;
    }
    
    // Delete the code directory
    std::string cmd = "rm -rf \"" + codeDir + "\"";
    int result = system(cmd.c_str());
    
    return result == 0;
}

DeleteResponse ArtifactDeleter::deleteArtifact(const DeleteRequest& request) {
    DeleteResponse response;
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
    
    // Stop running container if any
    if (isRunning(request.artifact_name)) {
        if (!stopContainer(request.artifact_name)) {
            response.error_code = "STOP_FAILED";
            response.message = "Failed to stop running container for artifact '" + 
                              request.artifact_name + "'";
            return response;
        }
    }
    
    // Delete code directory from /tmp if exists
    if (!deleteCodeDirectory(request.artifact_name)) {
        std::cerr << "Warning: Failed to delete code directory for " << request.artifact_name << std::endl;
        // Continue anyway, not a critical error
    }
    
    // Delete artifact directory
    if (!deleteArtifactDirectory(request.artifact_name)) {
        response.error_code = "DELETE_FAILED";
        response.message = "Failed to delete artifact directory for '" + 
                          request.artifact_name + "'";
        return response;
    }
    
    // Success
    response.success = true;
    response.message = "Artifact '" + request.artifact_name + "' deleted successfully";
    
    return response;
}

} // namespace uncver
