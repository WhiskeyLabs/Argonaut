#!/bin/bash

# Configuration
MODEL_URL="https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf"
MODEL_FILENAME="models/Phi-3-mini-4k-instruct-q4.gguf"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🤖 Argus Local AI Setup"
echo "========================="

# 1. Check for directory
if [ ! -d "models" ]; then
    echo "Creating models/ directory..."
    mkdir -p models
fi

# 2. Check for llama-server
if ! command -v llama-server &> /dev/null; then
    echo -e "${RED}[!] llama-server not found.${NC}"
    echo "Please install it using brew:"
    echo "  brew install llama.cpp"
    echo ""
    echo "Or build it from source: https://github.com/ggerganov/llama.cpp"
    exit 1
fi
echo -e "${GREEN}[✓] llama-server found.${NC}"

# 3. Download Model
if [ -f "$MODEL_FILENAME" ]; then
    echo -e "${GREEN}[✓] Model already exists: $MODEL_FILENAME${NC}"
else
    echo "Downloading Phi-3 Mini (Quantized)..."
    curl -L -o "$MODEL_FILENAME" "$MODEL_URL"
    if [ $? -eq 0 ]; then
         echo -e "${GREEN}[✓] Download complete.${NC}"
    else
         echo -e "${RED}[!] Download failed.${NC}"
         exit 1
    fi
fi

# 4. Success Message
echo ""
echo "Setup complete! You can now start the server with:"
echo -e "${GREEN}llama-server -m $MODEL_FILENAME --port 8080 --embedding --ctx-size 4096${NC}"
echo ""
