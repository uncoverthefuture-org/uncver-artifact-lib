#pragma once

#include <string>
#include <filesystem>

namespace uncver {

class GitClone {
public:
    // Clone a git repository to the specified destination
    static bool clone(const std::string& url, const std::filesystem::path& dest);

    // Check if git is installed
    static bool isGitAvailable();

private:
    static bool executeGitCommand(const std::string& args);
};

} // namespace uncver
