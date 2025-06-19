# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Remote MCP Server Overview

This is a simplified Remote MCP (Model Context Protocol) Server deployed on Cloudflare Workers that acts as a proxy to a FastAPI backend application. It enables Claude Desktop and other MCP clients to connect to FastAPI endpoints through the MCP protocol over HTTP/SSE without authentication.

## Key Features

- **No Authentication Required** - Direct connection without OAuth prompts
- **FastAPI Proxy** - Routes MCP calls to your FastAPI backend
- **Simple Setup** - Just connect to the `/sse` endpoint
- **Auto-Discovery** - Automatically discovers FastAPI endpoints via OpenAPI

## FastAPI Integration

**Base URL**: `https://fast-api-165560968031.europe-west3.run.app`

The MCP server provides the following proxy capabilities:
- Health checks to monitor FastAPI server status
- Generic API calls to any FastAPI endpoint
- Automatic OpenAPI documentation retrieval
- Resource access to API endpoints and server information

## Connection

**MCP Endpoint**: `https://your-worker-url.workers.dev/sse`

No authentication is required - just add this URL to your Claude Desktop configuration.

## Adding New MCP Features

### Adding New Tools

Tools are functions that Claude can call. To add a new tool:

1. **Define the tool in `src/index.ts`** inside the `init()` method:

```typescript
// Example: Add a multiply tool
this.server.tool("multiply", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: `${a} × ${b} = ${a * b}` }],
}));
```

2. **Tool Structure**:
   - First parameter: Tool name (string)
   - Second parameter: Input schema object using Zod
   - Third parameter: Handler function that processes the input and returns results

3. **Return Format**:
   - Always return an object with a `content` array
   - Content items must have a `type` (usually "text")
   - Include the actual result in the `text` field

### Adding New Prompts

Prompts provide context and instructions to Claude. To add prompts:

1. **Define prompts in `src/index.ts`** inside the `init()` method:

```typescript
// Example: Add a math tutor prompt
this.server.prompt("math_tutor", "Act as a helpful math tutor", {
  difficulty: z.string().optional()
}, async ({ difficulty = "medium" }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `You are a patient and encouraging math tutor. Adjust your explanations to ${difficulty} difficulty level. Break down problems step-by-step and use visual analogies when helpful.`,
    },
  }],
}));
```

2. **Prompt Structure**:
   - First parameter: Prompt name (string)
   - Second parameter: Description (string)
   - Third parameter: Arguments schema object using Zod
   - Fourth parameter: Handler function that returns messages array
   - Return format: `{ messages: [{ role: 'user', content: { type: 'text', text } }] }`

### Adding New Resources

Resources provide access to external data or APIs. To add resources:

1. **Define resources in `src/index.ts`** inside the `init()` method:

```typescript
// Example: Add a weather resource
this.server.resource("current_weather", "weather://current", {
  mimeType: "application/json",
  description: "Get current weather for a city"
}, async () => {
  // In real implementation, you'd call a weather API
  const mockWeather = {
    temperature: 22,
    condition: "Partly cloudy",
    humidity: 65,
  };
  
  return {
    contents: [{
      uri: "weather://current",
      mimeType: "application/json",
      text: JSON.stringify(mockWeather, null, 2),
    }],
  };
});
```

2. **Resource Structure**:
   - First parameter: Resource name (string)
   - Second parameter: URI pattern (string) 
   - Third parameter: Metadata object with mimeType and description
   - Fourth parameter: Handler function that fetches and returns the resource data
   - Return format: `{ contents: [{ uri, mimeType, text }] }`

## Current FastAPI Proxy Implementation

The current implementation provides these tools and resources:

### Available Tools

1. **get_schema** - Get BigQuery dataset/table schema information
   - Parameters: `dataset_id` (optional string), `table_name` (optional string)

### Available Resources

1. **bigquery_catalog** (`bigquery://catalog`) - List of available BigQuery datasets and tables
   - Endpoint: `/bigquery/list_datasets_tables`

### FastAPI Proxy Helper

```typescript
const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

private async callFastAPI(endpoint: string, method: string = "GET", body?: any) {
  const url = `${FASTAPI_BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(data)}`);
    }
    
    return data;
  } catch (error) {
    throw new Error(`Failed to call FastAPI: ${error.message}`);
  }
}
```

## Adding FastAPI-Specific Tools

To add new tools that call specific FastAPI endpoints:

```typescript
// Example: Add a specific endpoint tool
this.server.tool("get_users", {
  limit: z.number().optional().default(10),
  offset: z.number().optional().default(0)
}, async ({ limit, offset }) => {
  try {
    const result = await this.callFastAPI(`/users?limit=${limit}&offset=${offset}`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to get users: ${error.message}` }],
    };
  }
});
```

## Best Practices

1. **Tool Naming**: Use descriptive, action-oriented names (e.g., `calculate_tax`, `fetch_user_data`)

2. **Input Validation**: Always use Zod schemas to validate inputs with clear descriptions

3. **Error Handling**: Wrap handlers in try-catch blocks for production:
   ```typescript
   handler: async (input) => {
     try {
       // Your logic here
     } catch (error) {
       return {
         content: [{
           type: "text",
           text: `Error: ${error.message}`,
         }],
       };
     }
   }
   ```

4. **Resource URIs**: Follow a consistent pattern:
   - `config://` for configuration
   - `data://` for data resources
   - `api://` for external API wrappers

5. **Prompt Design**: Make prompts specific and actionable, with clear instructions

## Testing Your Changes

1. Run locally: `npm run dev`
2. Test with MCP Inspector: Visit `http://localhost:8787/`
3. Connect Claude Desktop to test real integration

## Deployment

After adding new features:
1. Format code: `npm run check`
2. Deploy: `npm run deploy`
3. Update Claude Desktop configuration with new server URL