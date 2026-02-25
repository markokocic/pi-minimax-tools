# MiniMax Tools for pi

A [pi coding agent](https://github.com/badlogic/pi-mono) extension that provides `web_search` and `understand_image` tools using the MiniMax Coding Plan API.


## Installation

### Using pi install (recommended)

**From npm:**
```bash
pi install npm:pi-minimax-tools
```

**From GitHub:**
```bash
pi install git:github.com/markokocic/pi-minimax-tools
```

### Manual Installation

Copy the files to your extensions directory:

```
~/.pi/agent/extensions/pi-minimax-tools/
```

- `index.ts` - Main extension code

pi will automatically load extensions from `~/.pi/agent/extensions/`.

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

## License

Copyright (c) 2026-present Marko Kocic

This program and the accompanying materials are made available under the
terms of the Eclipse Public License 2.0 which is available at:
https://www.eclipse.org/legal/epl-2.0/

SPDX-License-Identifier: EPL-2.0
