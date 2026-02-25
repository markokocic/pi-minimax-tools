# MiniMax Tools for pi

A pi extension that provides `web_search` and `understand_image` tools using the MiniMax Coding Plan API.

## Installation

The extension is auto-discovered from `~/.pi/agent/extensions/minimax-tools/`.

## Configuration

The extension automatically reads your MiniMax API key from `~/.pi/agent/auth.json` (the standard pi auth file). Ensure you have the minimax provider configured there.

### API Host

The API host is determined in this order:
1. `MINIMAX_API_HOST` environment variable (if set)
2. Default: `https://api.minimax.io` (global)

For China mainland, set:
```bash
export MINIMAX_API_HOST="https://api.minimaxi.com"
```

**Important:** If your API key is from MiniMax China, you must set the host to `https://api.minimaxi.com`.

## Tools

### web_search

Performs web searches and returns organic search results with related search queries.

**Parameters:**
- `query` (string, required): Search query

**Example:**
```
Search the web for "latest javascript frameworks 2025"
```

### understand_image

Analyzes images using AI vision. Supports JPEG, PNG, and WebP formats.

**Parameters:**
- `prompt` (string, required): Question or analysis request
- `image_source` (string, required): URL or local file path

**Example:**
```
Analyze this image and describe what's in it: https://example.com/image.jpg
```

Or with a local file:
```
What's in this image? /path/to/photo.png
```

## Cost Warning

These tools make API calls to MiniMax which may incur costs. Use only when needed.

## Files

- `index.ts` - Main extension code
- `package.json` - Package configuration
