#!/bin/bash
set -e

# Configuration
WEB_NODE_IP="198.74.62.215"
HF_TOKEN="${HF_TOKEN:-}" # Optional; set if model requires gated HF access
# Single source of truth for deployed model. Keep aligned with app default:
# lib/ai/client.ts -> NEXT_PUBLIC_AI_MODEL
MODEL_NAME="${AI_MODEL:-Qwen/Qwen2.5-Coder-7B-Instruct}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-$MODEL_NAME}"

echo ">>> Starting GPU Node Setup..."
echo ">>> Model: $MODEL_NAME"
echo ">>> Served Model Name: $SERVED_MODEL_NAME"

# 1. Install Docker & Nvidia Container Toolkit
echo ">>> Installing Docker & Nvidia Toolkit..."
curl -fsSL https://get.docker.com | sh
# Clean up potential corrupted file from previous runs
sudo rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 2. Configure Firewall (UFW)
echo ">>> Configuring Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
# Allow vLLM port ONLY from Web Node
ufw allow from $WEB_NODE_IP to any port 8000
ufw --force enable

# 3. Deploy vLLM via Docker
echo ">>> Deploying vLLM Container..."
# Create a simple docker-compose
cat <<EOF > docker-compose.yml
version: '3.8'
services:
  inference-server:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    restart: always
    environment:
      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
    command: --model $MODEL_NAME --served-model-name $SERVED_MODEL_NAME --port 8000 --host 0.0.0.0 --gpu-memory-utilization 0.95
    ports:
      - "8000:8000"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
EOF

echo ">>> Starting Service..."
docker compose up -d

echo ">>> GPU Node Setup Complete! API is listening on port 8000 (restricted to $WEB_NODE_IP)"
