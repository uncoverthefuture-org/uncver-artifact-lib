#pragma once

#include <string>
#include <optional>
#include <filesystem>

namespace uncver {

struct ArtifactConfig {
    std::string name;
    std::optional<std::string> description;
    std::optional<std::string> url;
    std::optional<std::string> local_path;
    std::optional<std::string> container_image;
};

class ArtifactCreator {
public:
    ArtifactCreator();
    ~ArtifactCreator() = default;

    // Disable copy
    ArtifactCreator(const ArtifactCreator&) = delete;
    ArtifactCreator& operator=(const ArtifactCreator&) = delete;

    // Enable move
    ArtifactCreator(ArtifactCreator&&) = default;
    ArtifactCreator& operator=(ArtifactCreator&&) = default;

    // Create a new artifact
    bool create(const ArtifactConfig& config);

    // Get the artifacts directory path
    std::filesystem::path getArtifactsDir() const;

    // Get the temp directory path for cloning
    std::filesystem::path getTempDir(const std::string& name) const;

private:
    std::filesystem::path artifactsDir_;

    bool cloneRepository(const std::string& url, const std::filesystem::path& dest);
    bool writeArtifactJson(const ArtifactConfig& config, const std::filesystem::path& dest);
    std::filesystem::path getDataDir() const;
};

} // namespace uncver
