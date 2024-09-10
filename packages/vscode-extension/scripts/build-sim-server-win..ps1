# Assumes to be executed from the vscode-extension package directory
cd "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\.."

# Take output directory from first argument or default to "out" - relative to the vscode-extension package location
$output_dir = if ($args.Length -ge 1) { $args[0] } else { "out" }

# Use Get-ChildItem to find the product file that matches the pattern "sim-server-Release*.exe" in the output directory
$product_files = Get-ChildItem -Path $output_dir -Filter "sim-server-Release*.exe"

# Check if any matching file exists
if ($product_files.Count -eq 0) {
    Write-Host "Simulator server binary not found in $output_dir"
    Write-Host "Make sure to follow development setup instructions: https://github.com/software-mansion/react-native-ide"
    Write-Host "You can download the binary from the releases page on GitHub: https://github.com/software-mansion/react-native-ide/releases"
    exit 1
} elseif ($product_files.Count -gt 1) {
    Write-Host "Multiple matching executables found. Please specify which one to use."
    exit 1
} else {
    $product_path = $product_files.FullName
}

# Check if the executable exists; if not, provide instructions to obtain it
if (-Not (Test-Path $product_path)) {
    Write-Host "Simulator server binary not found: $product_path"
    Write-Host "Please ensure that the build process has been completed successfully."
    exit 1
}

# Create the target directory if it doesn't exist
New-Item -ItemType Directory -Force -Path $output_dir | Out-Null
$target_location = "$output_dir\sim-server"

# Move the executable to the target directory and rename if necessary, adding the '-executable' suffix for clarity
Move-Item $product_path -Destination "$target_location-executable.exe"

# Output success message
Write-Host "Executable moved to target location: $target_location-executable.exe"