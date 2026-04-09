#pragma once

#include <string>
#include "redis_listener.h"

namespace uncver {

class ArtifactStopper {
public:
    ArtifactStopper();
    ~ArtifactStopper() = default;

    // Stop a container by its ID using Podman
    StopResponse stopContainer(const StopRequest& request);

    // Check if container exists
    bool containerExists(const std::string& container_id);

    // Check if container is running
    bool isRunning(const std::string& container_id);

    // Get container info
    std::string getContainerInfo(const std::string& container_id);

private:
    std::string runPodmanCommand(const std::string& args);
};

} // namespace uncver
