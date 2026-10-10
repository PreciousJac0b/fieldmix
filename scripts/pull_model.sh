#!/usr/bin/env bash
# Pull the Gemma model named in .env (default gemma4:e4b, about 9.6 GB per the spec) and list local models.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="$(grep -E '^OLLAMA_MODEL=' "$ROOT/.env" 2>/dev/null | cut -d= -f2 | awk '{print $1}')"
MODEL="${MODEL:-gemma4:e4b}"
command -v ollama >/dev/null || { echo "ollama not found. Install it first (brew install ollama)." >&2; exit 1; }
ollama pull "$MODEL"
ollama list
