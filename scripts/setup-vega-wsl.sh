#!/usr/bin/env bash
# Vega SDK + Vega Virtual Device on WSL2 Ubuntu 24.04.
# Unofficial: Amazon only supports native Ubuntu/macOS, but WSL2 exposes /dev/kvm and WSLg gives the simulator a window.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y curl lz4 watchman software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update
sudo apt-get install -y libpython3.8-dev

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo corepack enable

# Vega Virtual Device needs /dev/kvm (group kvm).
sudo usermod -aG kvm "$USER"

# Official installer from the Vega SDK docs (press Enter on every prompt).
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash

echo
echo "Done. Now, in PowerShell on Windows: wsl --shutdown"
echo "Then reopen Ubuntu and check: vega --version"
