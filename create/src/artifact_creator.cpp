#include "artifact_creator.h"
#include "git_clone.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#include <sys/types.h>
#include <pwd.h>
#endif

namespace uncver {

ArtifactCreator::ArtifactCreator() {
    artifactsDir_ = getDataDir() / "uncver-artifacts" / "artifacts";
    std::filesystem::create_directories(artifactsDir_);
}

std::filesystem::path ArtifactCreator::getDataDir() const {
#ifdef _WIN32
    const char* appdata = std::getenv("APPDATA");
    if (appdata) {
        return std::filesystem::path(appdata);
    }
    return std::filesystem::path("C:/ProgramData");
#elif __APPLE__
    const char* home = std::getenv("HOME");
    if (home) {
        return std::filesystem::path(home) / "Library/Application Support";
    }
    return std::filesystem::path("/tmp");
#else
    // Linux and Unix
    const char* xdgData = std::getenv("XDG_DATA_HOME");
    if (xdgData) {
        return std::filesystem::path(xdgData);
    }
    
    const char* home = std::getenv("HOME");
    if (home) {
        return std::filesystem::path(home) / ".local/share";
    }
    
    // Fallback
    struct passwd* pw = getpwuid(getuid());
    if (pw) {
        return std::filesystem::path(pw->pw_dir) / ".local/share";
    }
    
    return std::filesystem::path("/tmp");
#endif
}

std::filesystem::path ArtifactCreator::getArtifactsDir() const {
    return artifactsDir_;
}

std::filesystem::path ArtifactCreator::getTempDir(const std::string& name) const {
#ifdef _WIN32
    const char* tmp = std::getenv("TEMP");
    if (!tmp) tmp = "C:/tmp";
    return std::filesystem::path(tmp) / name;
#else
    return std::filesystem::path("/tmp") / name;
#endif
}

bool ArtifactCreator::create(const ArtifactConfig& config) {
    // Create artifact folder name (lowercase, spaces to hyphens)
    std::string folderName = config.name;
    std::transform(folderName.begin(), folderName.end(), folderName.begin(), ::tolower);
    std::replace(folderName.begin(), folderName.end(), ' ', '-');
    
    // Create artifact directory
    std::filesystem::path artifactDir = artifactsDir_ / folderName;
    std::filesystem::create_directories(artifactDir);
    
    // Clone repository if URL is provided
    if (config.url.has_value() && !config.url->empty()) {
        std::filesystem::path tempDir = getTempDir(folderName);
        std::cout << "Cloning repository to: " << tempDir << std::endl;
        
        if (!GitClone::clone(config.url.value(), tempDir)) {
            std::cerr << "Failed to clone repository" << std::endl;
            return false;
        }
    }
    
    // Write artifact.json
    if (!writeArtifactJson(config, artifactDir)) {
        std::cerr << "Failed to write artifact.json" << std::endl;
        return false;
    }
    
    std::cout << "Artifact created successfully at: " << artifactDir << std::endl;
    std::cout << "  Code location: " << getTempDir(folderName) << std::endl;
    
    return true;
}

bool ArtifactCreator::writeArtifactJson(const ArtifactConfig& config, const std::filesystem::path& dest) {
    nlohmann::json j;
    j["name"] = config.name;
    
    if (config.description.has_value()) {
        j["description"] = config.description.value();
    }
    
    if (config.url.has_value()) {
        j["url"] = config.url.value();
    }
    
    if (config.local_path.has_value()) {
        j["local_path"] = config.local_path.value();
    } else {
        // Default local_path to temp dir
        std::string folderName = config.name;
        std::transform(folderName.begin(), folderName.end(), folderName.begin(), ::tolower);
        std::replace(folderName.begin(), folderName.end(), ' ', '-');
        j["local_path"] = getTempDir(folderName).string();
    }
    
    if (config.container_image.has_value()) {
        j["container_image"] = config.container_image.value();
    }
    
    std::filesystem::path jsonPath = dest / "artifact.json";
    std::ofstream file(jsonPath);
    if (!file.is_open()) {
        return false;
    }
    
    file << j.dump(2);
    file.close();
    
    return true;
}

} // namespace uncver
