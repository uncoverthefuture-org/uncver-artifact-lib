#include "git_clone.h"
#include <cstdlib>
#include <iostream>

namespace uncver {

bool GitClone::isGitAvailable() {
#ifdef _WIN32
    return std::system("git --version > nul 2>&1") == 0;
#else
    return std::system("git --version > /dev/null 2>&1") == 0;
#endif
}

bool GitClone::executeGitCommand(const std::string& args) {
    std::string command = "git " + args;
    int result = std::system(command.c_str());
    return result == 0;
}

bool GitClone::clone(const std::string& url, const std::filesystem::path& dest) {
    if (!isGitAvailable()) {
        std::cerr << "Git is not installed or not in PATH" << std::endl;
        return false;
    }
    
    // Remove destination if it exists
    if (std::filesystem::exists(dest)) {
        std::filesystem::remove_all(dest);
    }
    
    std::filesystem::create_directories(dest);
    
    std::string args = "clone " + url + " \"" + dest.string() + "\"";
    std::cout << "Executing: git " << args << std::endl;
    
    return executeGitCommand(args);
}

} // namespace uncver
