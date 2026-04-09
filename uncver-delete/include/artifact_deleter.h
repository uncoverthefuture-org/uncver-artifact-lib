#pragma once

#include <string>
#include "redis_listener.h"

namespace uncver {

class ArtifactDeleter {
public:
    ArtifactDeleter();
    ~ArtifactDeleter() = default;

    // Delete an artifact by name
    DeleteResponse deleteArtifact(const DeleteRequest& request);

    // Check if artifact exists
    bool artifactExists(const std::string& name);

    // Check if artifact is running
    bool isRunning(const std::string& name);

    // Stop a running container
    bool stopContainer(const std::string& name);

    // Delete artifact data directory
    bool deleteArtifactDirectory(const std::string& name);

    // Delete code directory from /tmp
    bool deleteCodeDirectory(const std::string& name);

private:
    std::string getDataDir() const;
    std::string getArtifactConfigPath(const std::string& name);
    std::string runPodmanCommand(const std::string& args);
    std::string getRunningContainerId(const std::string& name);
};

} // namespace uncver
