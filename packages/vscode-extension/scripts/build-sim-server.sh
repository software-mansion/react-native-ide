#!/bin/bash

# execute this from the vscode-extension package directory
cd "$(dirname "$0")/.."

# take output directory from first argument or default to out - relative to the vscode-extension package location
output_dir="${1:-out}"

# take configuration from second argument or default to Debug
configuration=${2:-Debug}

submodule_status=$(git submodule status ../simulator-server)

if [[ $submodule_status == -* ]]; then # submodule is not initialized

submodule_hash=$(git ls-tree HEAD ../simulator-server | awk '{print $3}')
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    product_path="$output_dir/sim-server-Release-${submodule_hash}.exe"
else
    product_path="$output_dir/sim-server-Release-${submodule_hash}"
fi

# if the binary is not present, print instructions to download it from releases page:
if [[ ! -f "$product_path" ]]; then
    echo "Simulator server binary not found: $product_path"
    echo ""
    echo "Make sure to follow development setup instructions: https://github.com/software-mansion/react-native-ide"
    echo "You can download the binary from the releases page on GitHub: https://github.com/software-mansion/react-native-ide/releases"
    exit 1
fi

else # submodule is initialized

# For release builds we always make sure that submodule is up to date
if [[ $configuration == "Release" ]]; then
    git submodule update --init -- ../simulator-server
fi

if [[ $submodule_status == +* ]]; then # submodule is not up-to-date
    echo "Submodule has changes. Continue? [y/n]"
    # read answer or abort if no input is provided in 5 seconds
    read -t 5 answer
    if [[ ! $answer =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# execute the build from the simulator-server package
# the build product location is printed by the build script as the very last line
product_path=$("../simulator-server/build.sh" "$configuration" | tail -n 1)

# Check if the build was successful
if [[ $? -ne 0 ]]; then
    echo "Build failed."
    exit 1
fi

fi # submodule check


# Create the target directory if it doesn't exist
mkdir -p "$output_dir"
target_location="$output_dir/sim-server"

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then # rename to *.exe on Windows
    mv "$product_path" "$target_location-executable.exe"
    exit 0
fi

# Check if a file was found and copy it
if [[ -n $product_path ]]; then
    # copy it using dd to avoid permission issues
    dd if="$product_path" of="$target_location" 2> /dev/null
    # add execution permissions
    chmod +x "$target_location"
else
    echo "No file found matching the pattern."
fi