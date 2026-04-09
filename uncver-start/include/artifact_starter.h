#pragma once

#include <string>
#include "redis_listener.h"

namespace uncver {

class ArtifactStarter {
public:
    ArtifactStarter();
    ~ArtifactStarter() = default;

    // Start an artifact by name using Podman
    StartResponse startArtifact(const StartRequest& request);

    // Check if artifact exists
    bool artifactExists(const std::string& name);

    // Check if artifact is already running
    bool isRunning(const std::string& name);

    // Get artifact config
    std::string getArtifactConfigPath(const std::string& name);

private:
    std::string getDataDir() const;
    std::string runPodmanCommand(const std::string& args);
    std::string getRunningContainerId(const std::string& name);
};

} // namespace uncver
