# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Remote MCP Server Overview

This is a simplified Remote MCP (Model Context Protocol) Server deployed on Cloudflare Workers that acts as a proxy to a FastAPI backend application. It enables Claude Desktop and other MCP clients to connect to FastAPI endpoints through the MCP protocol over HTTP/SSE using token-based authentication.

## Project Structure

```
remote-mcp-server/
├── src/
│   ├── index.ts              # Main entry point, MCP server initialization
│   ├── types.ts              # Shared TypeScript interfaces and types
│   ├── tools/                # MCP Tools (functions Claude can call)
│   │   ├── index.ts          # Tool exports
│   │   ├── get-role.ts       # Get current server role
│   │   ├── get-schema-table-view.ts  # BigQuery schema information
│   │   ├── execute-query.ts  # Execute BigQuery SELECT queries
│   │   ├── upload-dashboard.ts       # Upload HTML dashboards to GCS
│   │   ├── list-dashboards.ts        # List existing dashboards
│   │   └── get-dashboard.ts          # Retrieve dashboard content
│   ├── prompts/              # MCP Prompts (context for Claude)
│   │   ├── index.ts          # Prompt exports
│   │   ├── bi-analyst.ts     # BI Analyst & Dashboard Builder prompt
│   │   └── chartjs-docs.ts   # Chart.js documentation reference
│   └── resources/            # MCP Resources (data access)
│       ├── index.ts          # Resource exports
│       └── bigquery-catalog.ts  # BigQuery datasets/tables catalog
├── static/                   # Static assets
├── wrangler.jsonc           # Cloudflare Workers configuration
├── package.json             # Node.js dependencies
└── tsconfig.json            # TypeScript configuration
```

### Code Organization

**Tools (`src/tools/`)**: Each tool is a separate file that exports a tool object with:
- `name`: Tool identifier
- `description`: Human-readable description
- `schema`: Zod schema for input validation
- `handler`: Async function that processes the input and returns results

**Prompts (`src/prompts/`)**: Each prompt exports a prompt object with:
- `name`: Prompt identifier
- `description`: Human-readable description
- `schema`: Zod schema for arguments
- `handler`: Async function that returns messages array

**Resources (`src/resources/`)**: Each resource exports a resource object with:
- `name`: Resource identifier
- `uri`: Resource URI pattern
- `metadata`: Object with mimeType and description
- `handler`: Async function that fetches and returns resource data

**Main Server (`src/index.ts`)**: 
- Imports all tools, prompts, and resources
- Registers them with the MCP server
- Handles role configuration
- Provides the `callFastAPI` helper method

## Key Features

- **Token-Based Authentication** - Secure access using auth tokens
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

Authentication is required - provide an auth token to connect.

## Authentication Configuration

The MCP server requires authentication through an auth token. The server supports multiple methods to provide the token (in order of preference):

1. **Query Parameter**: `?auth_token=your_token_here`
2. **HTTP Header**: `Authorization: Bearer your_token_here`
3. **Environment Variable**: `MCP_AUTH_TOKEN` (configured in wrangler.jsonc)

When an auth token is provided, the server will:
1. Fetch user data from the FastAPI backend
2. Automatically assign the user's role based on their authentication
3. Enable role-specific tools and permissions

### Claude Desktop Configuration Example

```json
"mlcd-mcp-server": {
  "command": "npx",
  "args": [
    "mcp-remote",
    "https://remote-mcp-server.matthew-ludwig.workers.dev/sse?auth_token=your_auth_token_here"
  ]
}
```

**Testing**: 
- Use the `get_role` tool to verify the current role after authentication
- Use the `get_user_data` tool to see full user details
- Check server logs to confirm authentication status

## Adding New MCP Features

### Adding New Tools

Tools are functions that Claude can call. To add a new tool:

1. **Create a new file in `src/tools/`** (e.g., `multiply.ts`):

```typescript
import { z } from "zod";
import { ToolContext } from "../types.js";

export const multiplyTool = {
    name: "multiply",
    description: "Multiply two numbers together",
    schema: z.object({
        a: z.number().describe("First number"),
        b: z.number().describe("Second number")
    }),
    handler: async ({ a, b }: any, context: ToolContext) => {
        return {
            content: [{ type: "text" as const, text: `${a} × ${b} = ${a * b}` }],
        };
    }
};
```

2. **Export it from `src/tools/index.ts`**:

```typescript
export { multiplyTool } from "./multiply.js";
```

3. **Add it to the tools array in `src/index.ts`**:

```typescript
const tools = [
    getRoleTool,
    // ... other tools
    multiplyTool  // Add your new tool here
];
```

### Adding New Prompts

Prompts provide context and instructions to Claude. To add a new prompt:

1. **Create a new file in `src/prompts/`** (e.g., `math-tutor.ts`):

```typescript
import { z } from "zod";
import { PromptContext } from "../types.js";

export const mathTutorPrompt = {
    name: "Math Tutor",
    description: "Act as a helpful math tutor",
    schema: z.object({
        difficulty: z.string().optional().default("medium").describe("Difficulty level")
    }),
    handler: async ({ difficulty }: any, context: PromptContext) => {
        return {
            messages: [{
                role: 'user' as const,
                content: {
                    type: 'text' as const,
                    text: `You are a patient and encouraging math tutor. Adjust your explanations to ${difficulty} difficulty level. Break down problems step-by-step and use visual analogies when helpful.`,
                },
            }],
        };
    }
};
```

2. **Export it from `src/prompts/index.ts`**:

```typescript
export { mathTutorPrompt } from "./math-tutor.js";
```

3. **Add it to the prompts array in `src/index.ts`**:

```typescript
const prompts = [biAnalystPrompt, mathTutorPrompt];
```

### Adding New Resources

Resources provide access to external data or APIs. To add a new resource:

1. **Create a new file in `src/resources/`** (e.g., `weather.ts`):

```typescript
import { ResourceContext } from "../types.js";

export const weatherResource = {
    name: "current_weather",
    uri: "weather://current",
    metadata: {
        mimeType: "application/json",
        description: "Get current weather for a city"
    },
    handler: async (context: ResourceContext) => {
        try {
            // Example: Call a weather API
            const result = await context.callFastAPI("/weather/current");
            
            return {
                contents: [{
                    uri: "weather://current",
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                }],
            };
        } catch (error) {
            return {
                contents: [{
                    uri: "weather://current",
                    mimeType: "application/json",
                    text: JSON.stringify({
                        error: "Could not fetch weather",
                        message: error instanceof Error ? error.message : String(error)
                    }, null, 2),
                }],
            };
        }
    }
};
```

2. **Export it from `src/resources/index.ts`**:

```typescript
export { weatherResource } from "./weather.js";
```

3. **Add it to the resources array in `src/index.ts`**:

```typescript
const resources = [bigqueryCatalogResource, weatherResource];
```

### Best Practices

1. **Tool Naming**: Use descriptive, action-oriented names (e.g., `calculate_tax`, `fetch_user_data`)

2. **Input Validation**: Always use Zod schemas to validate inputs with clear descriptions

3. **Error Handling**: Wrap handlers in try-catch blocks for production:
   ```typescript
   handler: async (input, context) => {
     try {
       // Your logic here
     } catch (error) {
       return {
         content: [{
           type: "text" as const,
           text: `Error: ${error.message}`,
         }],
       };
     }
   }
   ```

4. **Type Safety**: Always use `as const` for literal types in return values

5. **Resource URIs**: Follow a consistent pattern:
   - `config://` for configuration
   - `data://` for data resources
   - `api://` for external API wrappers

6. **Prompt Design**: Make prompts specific and actionable, with clear instructions

## Current FastAPI Proxy Implementation

The current implementation provides these tools and resources:

### Available Tools

1. **get_role** - Display current MCP server role (for testing role configuration)
   - Parameters: None
2. **get_schema_table_view** - Get BigQuery dataset/table schema information
   - Parameters: `dataset_with_table` (string in format 'dataset.table'), `include_description` (optional boolean)
3. **execute_query** - Execute BigQuery SELECT queries
   - Parameters: `query` (string), `limit` (optional number 1-1000)
   
   **CRITICAL: API Response Format**
   The execute_query tool returns data with NAMED PROPERTIES, NOT arrays!
   
   ```json
   {
     "rows": [
       {
         "column_name1": "value1",
         "column_name2": "value2",
         "column_name3": 123
       }
     ],
     "columns": [
       {"name": "column_name1", "type": "String"},
       {"name": "column_name2", "type": "String"},
       {"name": "column_name3", "type": "Int64"}
     ]
   }
   ```
   
   **Wrong**: `row[0]` (undefined!)
   **Correct**: `row.column_name` or `row.product_count`
4. **upload_dashboard** - Upload HTML dashboard to Google Cloud Storage
   - Parameters: `html_content` (string), `filename` (string), `directory` (optional string)
5. **list_dashboards** - List existing dashboard names
   - Parameters: `directory` (optional string)
6. **get_dashboard** - Get dashboard content and URL by name
   - Parameters: `dashboard_name` (string), `directory` (optional string)
7. **get_user_data** - Get authenticated user information
   - Parameters: None
   - Returns: User email, role, and other authentication details

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