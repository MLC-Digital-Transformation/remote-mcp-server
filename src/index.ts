import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { FASTAPI_BASE_URL } from "./types.js";
import { hasToolAccess, getAllowedTools, getRoleDescription, hasResourcePermission } from "./rolePermissions.js";

// Import all tools
import {
	getRoleTool,
	getSchemaTableViewTool,
	executeQueryTool,
	uploadDashboardTool,
	listDashboardsTool,
	getDashboardTool,
	getUserDataTool
} from "./tools/index.js";

// Import all prompts
import { biAnalystPrompt } from "./prompts/index.js";

// Import all resources
import { bigqueryCatalogResource } from "./resources/index.js";

export class MyMCP extends McpAgent {
	protected role: string = "no_role_assigned";
	protected authToken?: string;

	server = new McpServer({
		name: "mlcd-mcp-server",
		version: "1.0.0",
	});

	// Method to set role dynamically
	setRole(role: string) {
		this.role = role;
		console.log(`Role set to: ${this.role}`);
	}

	// Method to set auth token
	setAuthToken(token?: string) {
		this.authToken = token;
		if (token) {
			console.log(`Auth token set`);
		}
	}

	private async callFastAPI(endpoint: string, method: string = "GET", body?: any) {
		const url = `${FASTAPI_BASE_URL}${endpoint}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		// Add auth token to headers if available
		if (this.authToken) {
			headers["Authorization"] = `Bearer ${this.authToken}`;
		}

		const options: RequestInit = {
			method,
			headers,
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
		// Try to fetch user data if auth token is available
		if (this.authToken && this.role === "no_role_assigned") {
			try {
				const userData = await this.callFastAPI("/bigquery/user", "GET");
				if (userData && userData.Role) {
					this.role = userData.Role.toLowerCase();
					console.log(`User role fetched from API: ${this.role} (${userData.Email})`);
				}
			} catch (error) {
				console.log(`Failed to fetch user data, using default role: ${error}`);
			}
		}
		
		console.log(`MCP Server initialized with role: ${this.role}`);

		// Create context object for tools, prompts, and resources
		const context = {
			callFastAPI: this.callFastAPI.bind(this),
			role: this.role,
			authToken: this.authToken
		};

		// Special handling for getRoleTool to pass role in the context
		const roleContext = this;

		// Register all tools with role-based access control
		const tools = [
			getRoleTool,
			getSchemaTableViewTool,
			executeQueryTool,
			uploadDashboardTool,
			listDashboardsTool,
			getDashboardTool,
			getUserDataTool
		];

		for (const tool of tools) {
			// Check if the current role has access to this tool
			if (hasToolAccess(roleContext.role, tool.name)) {
				this.server.tool(
					tool.name,
					tool.description as string,
					tool.schema.shape,
					async (params: any) => {
						// Double-check access at execution time (in case role changed)
						if (!hasToolAccess(roleContext.role, tool.name)) {
							return {
								content: [{
									type: "text" as const,
									text: `Access denied: Your role '${roleContext.role}' does not have permission to use the '${tool.name}' tool.`
								}]
							};
						}
						
						// Pass the current role in the context for getRoleTool
						const currentContext = tool.name === 'get_role' 
							? { ...context, role: roleContext.role, authToken: roleContext.authToken }
							: context;
						return tool.handler(params, currentContext);
					}
				);
				console.log(`Tool '${tool.name}' registered for role '${roleContext.role}'`);
			} else {
				console.log(`Tool '${tool.name}' not available for role '${roleContext.role}'`);
			}
		}
		
		// Log role permissions summary
		console.log(`Role '${roleContext.role}' permissions: ${getRoleDescription(roleContext.role)}`);
		console.log(`Allowed tools: ${getAllowedTools(roleContext.role).join(', ')}`);
		console.log(`Authentication status: ${roleContext.authToken ? 'Authenticated' : 'Not authenticated'}`);

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

// Create a handler that extracts role and auth token from request and passes it to MCP agent
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Extract role from query parameters, headers, or environment (in order of preference)
		const url = new URL(request.url);
		const roleFromQuery = url.searchParams.get('role');
		const roleFromHeader = request.headers.get('x-role');
		const roleFromEnv = (env as any).ROLE;
		
		const role = roleFromQuery || roleFromHeader || 'no_role_assigned';
		
		// Extract auth token from query parameters, headers, or environment (in order of preference)
		const authTokenFromQuery = url.searchParams.get('auth_token');
		const authTokenFromHeader = request.headers.get('Authorization')?.replace('Bearer ', '');
		const authTokenFromEnv = (env as any).MCP_AUTH_TOKEN;
		
		const authToken = authTokenFromQuery || authTokenFromHeader || authTokenFromEnv;
		
		console.log(`Request received with role: ${role} (source: ${
			roleFromQuery ? 'query' : roleFromHeader ? 'header' : 'no_role_assigned'
		})`);
		
		if (authToken) {
			console.log(`Auth token found (source: ${
				authTokenFromQuery ? 'query' : authTokenFromHeader ? 'header' : authTokenFromEnv ? 'environment' : 'none'
			})`);
		}
		
		// Create a custom MCP class instance with the extracted role and auth token
		class DynamicMCP extends MyMCP {
			async init() {
				// Override the role with the request-specific role
				this.setRole(role);
				// Set the auth token if available
				this.setAuthToken(authToken);
				await super.init();
			}
		}
		
		// Mount the dynamic MCP agent
		const mcpHandler = DynamicMCP.mount("/sse");
		return mcpHandler.fetch(request, env, ctx);
	}
};