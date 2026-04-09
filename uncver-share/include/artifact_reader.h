#ifndef ARTIFACT_READER_H
#define ARTIFACT_READER_H

#include <string>
#include <optional>
#include <vector>

namespace uncver {

/**
 * @brief Represents artifact metadata
 */
struct Artifact {
    std::string name;
    std::string version;
    std::string description;
    std::string repository_url;
    std::string container_image;
    std::string author;
    std::string created_at;
    std::vector<std::string> tags;

    /**
     * @brief Convert to JSON string
     * @return JSON representation of the artifact
     */
    std::string to_json() const;

    /**
     * @brief Check if the artifact is valid (has required fields)
     */
    bool is_valid() const;
};

/**
 * @brief Reader for local artifact files
 * 
 * This class handles reading and parsing artifact.json files
 * from the local artifacts directory.
 */
class ArtifactReader {
public:
    /**
     * @brief Construct a new ArtifactReader
     * @param artifacts_dir Base directory containing artifacts
     */
    explicit ArtifactReader(const std::string& artifacts_dir);

    /**
     * @brief Default constructor - uses ~/.uncver/artifacts
     */
    ArtifactReader();

    /**
     * @brief Read an artifact by name
     * @param artifact_name Name of the artifact directory
     * @return Artifact if found and valid, nullopt otherwise
     */
    std::optional<Artifact> read_artifact(const std::string& artifact_name) const;

    /**
     * @brief List all available artifact names
     * @return Vector of artifact names
     */
    std::vector<std::string> list_artifacts() const;

    /**
     * @brief Check if an artifact exists
     */
    bool artifact_exists(const std::string& artifact_name) const;

    /**
     * @brief Get the full path to an artifact directory
     */
    std::string get_artifact_path(const std::string& artifact_name) const;

    /**
     * @brief Get the artifacts base directory
     */
    std::string get_base_directory() const;

    /**
     * @brief Get the last error message
     */
    std::string get_last_error() const;

private:
    std::string artifacts_dir_;
    mutable std::string last_error_;

    /**
     * @brief Get the default artifacts directory (~/.uncver/artifacts)
     */
    static std::string get_default_directory();

    /**
     * @brief Expand tilde to home directory
     */
    static std::string expand_path(const std::string& path);
};

} // namespace uncver

#endif // ARTIFACT_READER_H
