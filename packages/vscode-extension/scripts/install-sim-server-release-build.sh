#!/bin/bash

# This script uses the GitHub CLI to download pre-built signed release versions
# of the simulator-server binaries and places them in the build location for packaging.
# In order to use this script you need to have GitHub CLI installed and authenticated
# with the access to the simulator-server repo.

set -e

# execute this from the vscode-extension package directory
cd "$(dirname "$0")/.."

# take output directory from first argument or default to out - relative to the vscode-extension package location
output_dir="${1:-out}"

submodule_status=$(git submodule status ../simulator-server)
if [[ $submodule_status == -* ]]; then # submodule is not initialized
    echo "Submodule is not initialized"
    exit 1
fi

# For release builds we always make sure that submodule is up to date
git submodule update --init -- ../simulator-server

submodule_status=$(git submodule status ../simulator-server)
if [[ $submodule_status == +* ]]; then # submodule is not up-to-date
    echo "Submodule is not up to date"
    exit 1
fi

# Create the target directory if it doesn't exist
mkdir -p "$output_dir"

# Get tag of simulator-server submodule
sim_server_tag=$(git -C ../simulator-server describe --tags)

echo "Downloading sim-server binaries for tag $sim_server_tag"

# Download Mac and Windows binaries using gh CLI and place them in the correcto location
mac_binary_path="$output_dir/sim-server"
gh release download $sim_server_tag -R software-mansion-labs/simulator-server -p simulator-server -O "$mac_binary_path"
chmod +x "$mac_binary_path"

win_binary_path="$output_dir/sim-server-executable.exe"
gh release download $sim_server_tag -R software-mansion-labs/simulator-server -p simulator-server.exe -O "$win_binary_path"
chmod +x "$win_binary_path"
