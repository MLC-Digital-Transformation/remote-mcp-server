import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { FASTAPI_BASE_URL } from "./types.js";

// Import all tools
import {
	getRoleTool,
	getSchemaTableViewTool,
	executeQueryTool,
	uploadDashboardTool,
	listDashboardsTool,
	getDashboardTool
} from "./tools/index.js";

// Import all prompts
import { biAnalystPrompt } from "./prompts/index.js";

// Import all resources
import { bigqueryCatalogResource } from "./resources/index.js";

export class MyMCP extends McpAgent {
	protected role: string = "no_role_assigned";

	server = new McpServer({
		name: "mlcd-mcp-server",
		version: "1.0.0",
	});

	// Method to set role dynamically
	setRole(role: string) {
		this.role = role;
		console.log(`Role set to: ${this.role}`);
	}

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
			throw new Error(`Failed to call FastAPI: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async init() {
		// Initialize role - don't use environment variables
		this.role = "no_role_assigned";
		console.log(`MCP Server initialized with role: ${this.role}`);

		// Create context object for tools, prompts, and resources
		const context = {
			callFastAPI: this.callFastAPI.bind(this),
			role: this.role
		};

		// Special handling for getRoleTool to pass role in the context
		const roleContext = this;

		// Register all tools
		const tools = [
			getRoleTool,
			getSchemaTableViewTool,
			executeQueryTool,
			uploadDashboardTool,
			listDashboardsTool,
			getDashboardTool
		];

		for (const tool of tools) {
			this.server.tool(
				tool.name,
				tool.description as string,
				tool.schema.shape,
				async (params: any) => {
					// Pass the current role in the context for getRoleTool
					const currentContext = tool.name === 'get_role' 
						? { ...context, role: roleContext.role }
						: context;
					return tool.handler(params, currentContext);
				}
			);
		}

		// Register all prompts
		const prompts = [biAnalystPrompt];

		for (const prompt of prompts) {
			this.server.prompt(
				prompt.name,
				prompt.description,
				prompt.schema.shape,
				async (params: any) => prompt.handler(params, context)
			);
		}

		// Register all resources
		const resources = [bigqueryCatalogResource];

		for (const resource of resources) {
			this.server.resource(
				resource.name,
				resource.uri,
				resource.metadata,
				async () => resource.handler(context)
			);
		}
	}
}

// Create a handler that extracts role from request and passes it to MCP agent
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Extract role from query parameters, headers, or environment (in order of preference)
		const url = new URL(request.url);
		const roleFromQuery = url.searchParams.get('role');
		const roleFromHeader = request.headers.get('x-role');
		const roleFromEnv = (env as any).ROLE;
		
		const role = roleFromQuery || roleFromHeader || 'no_role_assigned';
		
		console.log(`Request received with role: ${role} (source: ${
			roleFromQuery ? 'query' : roleFromHeader ? 'header' : 'no_role_assigned'
		})`);
		
		// Create a custom MCP class instance with the extracted role
		class DynamicMCP extends MyMCP {
			async init() {
				// Override the role with the request-specific role
				this.setRole(role);
				await super.init();
			}
		}
		
		// Mount the dynamic MCP agent
		const mcpHandler = DynamicMCP.mount("/sse");
		return mcpHandler.fetch(request, env, ctx);
	}
};