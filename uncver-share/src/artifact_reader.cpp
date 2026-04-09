#include "artifact_reader.h"

#include <nlohmann/json.hpp>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#endif

using json = nlohmann::json;

namespace uncver {

// Artifact implementation
std::string Artifact::to_json() const {
    json j = {
        {"name", name},
        {"version", version},
        {"description", description},
        {"repository_url", repository_url},
        {"container_image", container_image},
        {"author", author}
    };
    
    if (!created_at.empty()) {
        j["created_at"] = created_at;
    }
    
    if (!tags.empty()) {
        j["tags"] = tags;
    }
    
    return j.dump(2);
}

bool Artifact::is_valid() const {
    return !name.empty() && 
           !version.empty() && 
           !author.empty();
}

// ArtifactReader implementation
ArtifactReader::ArtifactReader(const std::string& artifacts_dir)
    : artifacts_dir_(expand_path(artifacts_dir)) {
}

ArtifactReader::ArtifactReader()
    : artifacts_dir_(get_default_directory()) {
}

std::optional<Artifact> ArtifactReader::read_artifact(const std::string& artifact_name) const {
    std::string artifact_path = get_artifact_path(artifact_name);
    std::string json_path = artifact_path + "/artifact.json";

    if (!std::filesystem::exists(json_path)) {
        last_error_ = "artifact.json not found at " + json_path;
        return std::nullopt;
    }

    try {
        std::ifstream file(json_path);
        if (!file.is_open()) {
            last_error_ = "Cannot open file: " + json_path;
            return std::nullopt;
        }

        json j;
        file >> j;

        Artifact artifact;
        artifact.name = j.value("name", artifact_name);
        artifact.version = j.value("version", "");
        artifact.description = j.value("description", "");
        artifact.repository_url = j.value("repository_url", "");
        artifact.container_image = j.value("container_image", "");
        artifact.author = j.value("author", "");
        artifact.created_at = j.value("created_at", "");

        if (j.contains("tags") && j["tags"].is_array()) {
            for (const auto& tag : j["tags"]) {
                if (tag.is_string()) {
                    artifact.tags.push_back(tag.get<std::string>());
                }
            }
        }

        if (!artifact.is_valid()) {
            last_error_ = "Invalid artifact: missing required fields (name, version, or author)";
            return std::nullopt;
        }

        return artifact;

    } catch (const json::exception& e) {
        last_error_ = std::string("JSON parsing error: ") + e.what();
        return std::nullopt;
    } catch (const std::exception& e) {
        last_error_ = std::string("Error reading artifact: ") + e.what();
        return std::nullopt;
    }
}

std::vector<std::string> ArtifactReader::list_artifacts() const {
    std::vector<std::string> artifacts;

    if (!std::filesystem::exists(artifacts_dir_)) {
        return artifacts;
    }

    for (const auto& entry : std::filesystem::directory_iterator(artifacts_dir_)) {
        if (entry.is_directory()) {
            std::string artifact_name = entry.path().filename().string();
            std::string json_path = entry.path().string() + "/artifact.json";
            
            if (std::filesystem::exists(json_path)) {
                artifacts.push_back(artifact_name);
            }
        }
    }

    return artifacts;
}

bool ArtifactReader::artifact_exists(const std::string& artifact_name) const {
    std::string artifact_path = get_artifact_path(artifact_name);
    std::string json_path = artifact_path + "/artifact.json";
    return std::filesystem::exists(json_path);
}

std::string ArtifactReader::get_artifact_path(const std::string& artifact_name) const {
    return artifacts_dir_ + "/" + artifact_name;
}

std::string ArtifactReader::get_base_directory() const {
    return artifacts_dir_;
}

std::string ArtifactReader::get_last_error() const {
    return last_error_;
}

std::string ArtifactReader::get_default_directory() {
#ifdef _WIN32
    const char* appdata = std::getenv("APPDATA");
    if (appdata) {
        return std::string(appdata) + "/uncver/artifacts";
    }
    return "C:/uncver/artifacts";
#else
    const char* home = std::getenv("HOME");
    if (home) {
        return std::string(home) + "/.uncver/artifacts";
    }
    return "~/.uncver/artifacts";
#endif
}

std::string ArtifactReader::expand_path(const std::string& path) {
    if (path.empty() || path[0] != '~') {
        return path;
    }

#ifdef _WIN32
    const char* home = std::getenv("USERPROFILE");
    if (!home) {
        home = std::getenv("HOME");
    }
#else
    const char* home = std::getenv("HOME");
#endif

    if (!home) {
        return path;
    }

    return std::string(home) + path.substr(1);
}

} // namespace uncver
