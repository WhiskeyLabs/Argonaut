# Setting up Local Intelligence for Argus

Argus is designed to run with a "Local First" architecture. To enable the AI features (Fix Generation, Context Analysis) without sending data to the cloud, you need to run a local LLM server.

We recommend **llama.cpp** because it is lightweight, runs on CPU/GPU, and provides an OpenAI-compatible API that Argus can talk to out of the box.

## Prerequisites
- macOS (Apple Silicon recommended for performance) or Linux.
- 8GB RAM minimum (16GB+ recommended).

## Quick Setup (macOS)

### 1. Install llama.cpp
The easiest way is via Homebrew:

```bash
brew install llama.cpp
```

### 2. Download a Model
We recommend **Phi-3 Mini** (3.8B parameters) or **Llama 3 8B**. They are small enough to run fast but smart enough for triage.

Create a models directory:
```bash
mkdir -p models
```

Download a quantized model (GGUF format):

**Option A: Phi-3 Mini (Fastest, Low RAM)**
```bash
curl -L -o models/Phi-3-mini-4k-instruct-q4.gguf https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf
```

**Option B: Llama 3 8B (Better Reasoning)**
```bash
curl -L -o models/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf https://huggingface.co/library/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf
```

### 3. Run the Server
Argus expects an OpenAI-compatible API. Run the server with embedding support enabled.

```bash
llama-server -m models/Phi-3-mini-4k-instruct-q4.gguf --port 8080 --embedding --ctx-size 4096
```

You should see output indicating the server is listening on `http://127.0.0.1:8080`.

## Verifying Connectivity

You can test the server with a simple curl command:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello!" }
    ]
  }'
```

If you get a JSON response, you are ready to use Argus's AI features!

## Connecting Argus (Local or Remote)

Argus uses a built-in proxy at `/api/ai` to connect to your intelligence provider. This allows you to use Local LLMs (default) or switch to a Remote provider (OpenAI) without changing the frontend code.

### Configuration
Create a `.env.local` file in the root directory to configure your provider:

**For Local AI (Default):**
```bash
AI_ENDPOINT="http://127.0.0.1:8080/v1/chat/completions"
```

**For Remote AI (OpenAI):**
```bash
AI_ENDPOINT="https://api.openai.com/v1/chat/completions"
AI_API_KEY="sk-..."
```

**For Azure OpenAI:**
```bash
AI_ENDPOINT="https://your-resource.openai.azure.com/openai/deployments/deploy-name/chat/completions?api-version=2023-05-15"
AI_API_KEY="your-azure-key"
```
