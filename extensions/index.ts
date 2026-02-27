/**
 * MiniMax Tools Extension for pi
 * 
 * Provides web_search and understand_image tools using the MiniMax Coding Plan API.
 * 
 * This extension uses pi's provider system for authentication and connection.
 * Configure MiniMax in ~/.pi/agent/models.json:
 * {
 *   "providers": {
 *     "minimax": {
 *       "baseUrl": "https://api.minimax.io",
 *       "apiKey": "your-api-key",
 *       "api": "openai-completions",
 *       "models": [...]
 *     }
 *   }
 * }
 * 
 * Or use environment variable MINIMAX_API_KEY (baseUrl defaults to https://api.minimax.io)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as nodefs from "node:fs";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SearchResponse {
  organic: SearchResult[];
  related_searches: { query: string }[];
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface VLMResponse {
  content: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

function processImageUrl(imageSource: string): string {
  // Remove @ prefix if present
  if (imageSource.startsWith("@")) {
    imageSource = imageSource.substring(1);
  }
  
  // If already in base64 data URL format, pass through
  if (imageSource.startsWith("data:")) {
    return imageSource;
  }
  
  // Handle HTTP/HTTPS URLs
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    // We'll handle this in the tool by fetching and converting to base64
    return imageSource;
  }
  
  // Handle local file paths
  const fs = nodefs;
  if (!fs.existsSync(imageSource)) {
    throw new Error(`Local image file does not exist: ${imageSource}`);
  }
  
  const imageData = fs.readFileSync(imageSource);
  const base64Data = imageData.toString("base64");
  
  // Detect image format from file extension
  let imageFormat = "jpeg";
  if (imageSource.toLowerCase().endsWith(".png")) {
    imageFormat = "png";
  } else if (imageSource.toLowerCase().endsWith(".webp")) {
    imageFormat = "webp";
  } else if (imageSource.toLowerCase().endsWith(".jpg") || imageSource.toLowerCase().endsWith(".jpeg")) {
    imageFormat = "jpeg";
  }
  
  return `data:image/${imageFormat};base64,${base64Data}`;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString("base64");
  
  // Detect content type
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  let imageFormat = "jpeg";
  if (contentType.includes("png")) {
    imageFormat = "png";
  } else if (contentType.includes("webp")) {
    imageFormat = "webp";
  } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    imageFormat = "jpeg";
  }
  
  return `data:image/${imageFormat};base64,${base64Data}`;
}

export default function (pi: ExtensionAPI) {
  // MiniMax-specific tools - only active when using minimax provider
  const MINIMAX_TOOLS = ["web_search", "understand_image"];

  function updateToolAvailability(provider: string) {
    const isMinimaxProvider = provider === "minimax" || provider === "minimax-cn";
    const currentTools = pi.getActiveTools();
    if (isMinimaxProvider) {
      // Enable minimax tools if not already active
      const newTools = [...new Set([...currentTools, ...MINIMAX_TOOLS])];
      pi.setActiveTools(newTools);
      console.log(`[minimax-tools] Enabled minimax-specific tools: ${MINIMAX_TOOLS.join(", ")}`);
    } else {
      // Disable minimax tools
      const newTools = currentTools.filter(t => !MINIMAX_TOOLS.includes(t));
      pi.setActiveTools(newTools);
      console.log(`[minimax-tools] Disabled minimax-specific tools (using ${provider} provider)`);
    }
  }

  // Update tools on session start
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.model) {
      updateToolAvailability(ctx.model.provider);
    }
  });

  // Update tools when model changes
  pi.on("model_select", async (event) => {
    updateToolAvailability(event.model.provider);
  });

  // Helper to create API client from extension context
  function getApiClient(ctx: ExtensionContext) {
    const model = ctx.model;
    if (!model) {
      throw new Error("No model selected. Please select a MiniMax model.");
    }
    
    // Get API key from the model's provider configuration
    const apiKeyPromise = ctx.modelRegistry.getApiKey(model);
    
    // For synchronous access, we need to handle this differently in the tool
    // The tool execution is async so we can await the API key
    
    return {
      async getApiKey(): Promise<string> {
        const apiKey = await apiKeyPromise;
        if (!apiKey) {
          throw new Error(`No API key configured for ${model.provider}. Please add your MiniMax API key to ~/.pi/agent/models.json or set the MINIMAX_API_KEY environment variable.`);
        }
        return apiKey;
      },
      getBaseUrl(): string {
        // Use the model's baseUrl, with fallback to default MiniMax endpoint
        // The baseUrl from models.json typically includes /v1
        // If no custom model is defined, model.baseUrl might be undefined
        return model.baseUrl || process.env.MINIMAX_API_HOST || "https://api.minimax.io";
      },
      getProvider(): string {
        return model.provider;
      },
      
      async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
        const apiKey = await this.getApiKey();
        let baseUrl = this.getBaseUrl();
        
        // Remove trailing slash if present
        if (baseUrl.endsWith("/")) {
          baseUrl = baseUrl.slice(0, -1);
        }
        
        // The minimax provider may have different baseUrl formats:
        // - https://api.minimax.io/anthropic (Anthropic-compatible) -> use /v1
        // - https://api.minimax.io/v1 (standard OpenAI-compatible) -> use as-is
        // - https://api.minimaxi.com (China) -> use /v1
        // 
        // The coding_plan endpoints are at /v1/coding_plan/...
        // So we need to normalize: use /v1 prefix
        let normalizedBase: string;
        if (baseUrl.includes("/anthropic")) {
          // Replace /anthropic with /v1
          normalizedBase = baseUrl.replace("/anthropic", "/v1");
        } else if (baseUrl.includes("/v1")) {
          normalizedBase = baseUrl;
        } else {
          // Add /v1
          normalizedBase = `${baseUrl}/v1`;
        }
        
        const url = `${normalizedBase}${endpoint}`;
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "MM-API-Source": "pi-extension"
          },
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json() as T;
        
        // Check API-specific errors
        const baseResp = (data as Record<string, unknown>).base_resp as { status_code: number; status_msg: string } | undefined;
        if (baseResp && baseResp.status_code !== 0) {
          if (baseResp.status_code === 1004) {
            throw new Error(`API Error: ${baseResp.status_msg}. Please check your API key and API host.`);
          }
          throw new Error(`API Error: ${baseResp.status_code} - ${baseResp.status_msg}`);
        }
        
        return data;
      }
    };
  }
  
  // Register web_search tool
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: `Perform a web search and get organic search results with related search queries.
    
You MUST use this tool whenever you need to search for real-time or external information on the web.

**Cost Warning:** This tool makes an API call to MiniMax which may incur costs.

Arguments:
- query (string, required): The search query. Aim for 3-5 keywords for best results. For time-sensitive topics, include the current date (e.g., "latest iPhone 2025").

Returns:
A JSON object containing:
- organic: Array of search results with title, link, snippet, and date
- related_searches: Array of related search query suggestions
- base_resp: Response status information`,
    parameters: Type.Object({
      query: Type.String({ description: "The search query. Aim for 3-5 keywords for best results. For time-sensitive topics, include the current date." }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { query } = params;
      
      if (!query) {
        return {
          content: [{ type: "text", text: "Error: Query is required" }],
          isError: true
        };
      }
      
      try {
        const client = getApiClient(ctx);
        
        const response = await client.post<SearchResponse>("/coding_plan/search", {
          q: query
        });
        
        // Format the response as a readable string
        let resultText = `Search results for "${query}":\n\n`;
        
        if (response.organic && response.organic.length > 0) {
          resultText += "## Organic Results\n\n";
          response.organic.forEach((result, index) => {
            resultText += `${index + 1}. **${result.title}**\n`;
            resultText += `   ${result.snippet}\n`;
            resultText += `   URL: ${result.link}\n`;
            if (result.date) {
              resultText += `   Date: ${result.date}\n`;
            }
            resultText += "\n";
          });
        }
        
        if (response.related_searches && response.related_searches.length > 0) {
          resultText += "## Related Searches\n\n";
          response.related_searches.forEach((rs) => {
            resultText += `- ${rs.query}\n`;
          });
        }
        
        return {
          content: [{ type: "text", text: resultText }],
          details: { 
            query,
            resultCount: response.organic?.length ?? 0,
            rawResponse: response
          }
        };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Search failed: ${errorMessage}` }],
          isError: true,
          details: { error: errorMessage }
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("🌐 web_search "));
      text += theme.fg("accent", `"${args.query}"`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      // Handle streaming/partial results
      if (isPartial) {
        return new Text(theme.fg("warning", "Searching..."), 0, 0);
      }

      // Handle errors
      if (result.isError || result.details?.error) {
        const errorMsg = result.details?.error || "Search failed";
        return new Text(theme.fg("error", `Error: ${errorMsg}`), 0, 0);
      }

      // Build result display
      const details = result.details as { query: string; resultCount: number } | undefined;
      let text = theme.fg("success", "✓ Search complete");
      
      if (details?.resultCount !== undefined) {
        text += theme.fg("dim", ` (${details.resultCount} results)`);
      }

      // In expanded view, show all results
      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const lines = content.text.split("\n");
          for (const line of lines) {
            text += `\n${theme.fg("dim", line)}`;
          }
        }
      } else if (details?.resultCount !== undefined) {
        // In collapsed view, show hint for expanding
        text += ` ${theme.fg("muted", `(${keyHint("expandTools", "to expand")})`)}`;
      }

      return new Text(text, 0, 0);
    },
  });

  // Register understand_image tool
  pi.registerTool({
    name: "understand_image",
    label: "Understand Image",
    description: `Analyze, describe, or extract information from an image using AI vision.

You MUST use this tool whenever you need to analyze, describe, or extract information from an image.

**Cost Warning:** This tool makes an API call to MiniMax which may incur costs.

Arguments:
- prompt (string, required): A text prompt describing what you want to analyze or extract from the image.
- image_source (string, required): The location of the image to analyze.
  - HTTP/HTTPS URL: "https://example.com/image.jpg"
  - Local file path: "/Users/username/Documents/image.jpg" or "relative/path/image.png"
  - Note: If the file path starts with an @ symbol, strip the @ prefix before passing it.

Supported formats: JPEG, PNG, WebP (max 20MB)

Returns:
A text description of the image analysis result.`,
    parameters: Type.Object({
      prompt: Type.String({ description: "The question or analysis request for the image" }),
      image_source: Type.String({ description: "Image source - URL or local file path. Supports HTTP/HTTPS URLs and local file paths (relative or absolute)." }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { prompt, image_source } = params;
      
      if (!prompt) {
        return {
          content: [{ type: "text", text: "Error: Prompt is required" }],
          isError: true
        };
      }
      
      if (!image_source) {
        return {
          content: [{ type: "text", text: "Error: Image source is required" }],
          isError: true
        };
      }
      
      try {
        const client = getApiClient(ctx);
        
        // Process the image source
        let processedImageUrl: string;
        
        if (image_source.startsWith("http://") || image_source.startsWith("https://")) {
          // Fetch image and convert to base64
          processedImageUrl = await fetchImageAsBase64(image_source);
        } else {
          // Handle local file or data URL
          processedImageUrl = processImageUrl(image_source);
        }
        
        const response = await client.post<VLMResponse>("/coding_plan/vlm", {
          prompt: prompt,
          image_url: processedImageUrl
        });
        
        if (!response.content) {
          return {
            content: [{ type: "text", text: "Error: No content returned from image analysis" }],
            isError: true,
            details: { error: "Empty response from VLM API" }
          };
        }
        
        return {
          content: [{ type: "text", text: response.content }],
          details: { 
            prompt,
            image_source,
            rawResponse: response
          }
        };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Image analysis failed: ${errorMessage}` }],
          isError: true,
          details: { error: errorMessage }
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("🖼️ understand_image "));
      text += theme.fg("muted", `"${args.prompt.substring(0, 50)}"`);
      if (args.prompt.length > 50) {
        text += theme.fg("muted", "...");
      }
      text += " " + theme.fg("dim", args.image_source);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      // Handle streaming/partial results
      if (isPartial) {
        return new Text(theme.fg("warning", "Analyzing image..."), 0, 0);
      }

      // Handle errors
      if (result.isError || result.details?.error) {
        const errorMsg = result.details?.error || "Image analysis failed";
        return new Text(theme.fg("error", `Error: ${errorMsg}`), 0, 0);
      }

      // Build result display
      let text = theme.fg("success", "✓ Image analyzed");

      // In expanded view, show all analysis content
      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const lines = content.text.split("\n");
          for (const line of lines) {
            text += `\n${theme.fg("dim", line)}`;
          }
        }
      } else {
        // In collapsed view, show hint for expanding
        text += ` ${theme.fg("muted", `(${keyHint("expandTools", "to expand")})`)}`;
      }

      return new Text(text, 0, 0);
    },
  });
}
