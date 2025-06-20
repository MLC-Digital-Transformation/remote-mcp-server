import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { FASTAPI_BASE_URL, UserData } from "./types.js";
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


	// Method to set auth token
	setAuthToken(token?: string) {
		this.authToken = token;
		if (token) {
			console.log(`✅ Auth token set successfully (length: ${token.length})`);
		} else {
			console.log(`⚠️ setAuthToken called with empty/undefined token`);
		}
	}

	private async callFastAPI(endpoint: string, method: string = "GET", body?: any) {
		const url = `${FASTAPI_BASE_URL}${endpoint}`;
		console.log(`callFastAPI: ${method} ${url}`);
		
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		// Add auth token to headers if available
		if (this.authToken) {
			headers["Authorization"] = `Bearer ${this.authToken}`;
			console.log('callFastAPI: Auth token added to headers');
		}

		const options: RequestInit = {
			method,
			headers,
		};

		if (body && method !== "GET") {
			options.body = JSON.stringify(body);
		}

		try {
			console.log('callFastAPI: Making fetch request...');
			const response = await fetch(url, options);
			console.log(`callFastAPI: Response status: ${response.status}`);
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
		console.log('\n🔐 Role Assignment Process:');
		console.log('----------------------------------------');
		
		// Log authentication status
		if (!this.authToken) {
			console.log('⚠️  No authentication token provided');
			console.log('📝 Assigning default role: no_role_assigned');
			this.role = "no_role_assigned";
		} else {
			console.log('✅ Authentication token detected');
			console.log('🔄 Fetching user data from database...');
			
			// Try to fetch user data if auth token is available
			try {
				console.log(`📡 Calling API: GET ${FASTAPI_BASE_URL}/bigquery/user`);
				const startTime = Date.now();
				
				const userData = await this.callFastAPI("/bigquery/user", "GET") as UserData;
				
				const elapsed = Date.now() - startTime;
				console.log(`⏱️  API response received in ${elapsed}ms`);
				console.log(`📧 User Email: ${userData.Email}`);
				console.log(`👤 User Name: ${userData.FirstName} ${userData.LastName}`);
				console.log(`🎭 Database Role: ${userData.Role}`);
				
				if (userData && userData.Role) {
					this.role = userData.Role.toLowerCase();
					console.log(`✅ Role assigned from database: ${this.role}`);
				} else {
					console.log('⚠️  User data fetched but no role found in database');
					this.role = "no_role_assigned";
				}
			} catch (error) {
				console.log(`❌ Failed to fetch user data from API`);
				console.log(`📛 Error: ${error instanceof Error ? error.message : String(error)}`);
				console.log('📝 Falling back to default role: no_role_assigned');
				this.role = "no_role_assigned";
			}
		}
		
		console.log('\n🎯 Role Assignment Complete:');
		console.log(`   Final Role: ${this.role}`);
		console.log(`   Description: ${getRoleDescription(this.role)}`);

		// Create context object for tools, prompts, and resources
		const context = {
			callFastAPI: this.callFastAPI.bind(this),
			role: this.role,
			authToken: this.authToken
		};

		// Special handling for getRoleTool to pass role in the context
		const roleContext = this;

		// Register all tools with role-based access control
		console.log('\n🛠️  Tool Registration:');
		console.log('----------------------------------------');
		
		const tools = [
			getRoleTool,
			getSchemaTableViewTool,
			executeQueryTool,
			uploadDashboardTool,
			listDashboardsTool,
			getDashboardTool,
			getUserDataTool
		];

		let registeredCount = 0;
		let deniedCount = 0;

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
						
						// Pass the current role and authToken in the context
						const currentContext = { ...context, role: roleContext.role, authToken: roleContext.authToken };
						return tool.handler(params, currentContext);
					}
				);
				console.log(`   ✅ ${tool.name} - Registered`);
				registeredCount++;
			} else {
				console.log(`   ❌ ${tool.name} - Access Denied`);
				deniedCount++;
			}
		}
		
		console.log('\n📊 Tool Registration Summary:');
		console.log(`   Total tools: ${tools.length}`);
		console.log(`   Registered: ${registeredCount}`);
		console.log(`   Denied: ${deniedCount}`);
		
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

// Create a handler that extracts auth token from request and passes it to MCP agent
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log('\n========================================');
		console.log('🚀 MCP SERVER STARTING');
		console.log('========================================');
		console.log(`Timestamp: ${new Date().toISOString()}`);
		console.log(`Request URL: ${request.url}`);
		console.log(`Request Method: ${request.method}`);
		
		const url = new URL(request.url);
		console.log(`Endpoint: ${url.pathname}`);
		
		// Extract auth token from query parameters, headers, or environment (in order of preference)
		const authTokenFromQuery = url.searchParams.get('auth_token');
		const authTokenFromHeader = request.headers.get('Authorization')?.replace('Bearer ', '');
		const authTokenFromEnv = (env as any).MCP_AUTH_TOKEN;
		
		const authToken = authTokenFromQuery || authTokenFromHeader || authTokenFromEnv;
		
		console.log('\n📋 Authentication Status:');
		if (authToken) {
			console.log(`✅ Auth token found (source: ${
				authTokenFromQuery ? 'query parameter' : authTokenFromHeader ? 'authorization header' : authTokenFromEnv ? 'environment variable' : 'none'
			})`);
			console.log(`   Token length: ${authToken.length} characters`);
		} else {
			console.log('❌ No auth token provided - starting in unauthenticated mode');
		}
		
		// Create a custom MCP class instance with the auth token
		class DynamicMCP extends MyMCP {
			async init() {
				console.log('\n📦 Initializing MCP Instance...');
				console.log('----------------------------------------');
				console.log(`   Auth token in closure: ${authToken ? 'YES' : 'NO'}`);
				console.log(`   this.authToken before set: ${this.authToken ? 'YES' : 'NO'}`);
				
				// Set the auth token if available
				if (authToken) {
					this.setAuthToken(authToken);
					console.log('✅ Auth token configured in MCP instance');
					console.log(`   this.authToken after set: ${this.authToken ? 'YES' : 'NO'}`);
				} else {
					console.log('❌ No auth token to set in init()');
				}
				
				console.log('🔄 Starting MCP initialization sequence...');
				await super.init();
				
				console.log('\n✅ MCP INITIALIZATION COMPLETE');
				console.log(`📌 Final role: ${this.role}`);
				console.log(`🔧 Tools available: ${getAllowedTools(this.role).length}`);
				console.log('========================================\n');
			}
		}
		
		// Mount the dynamic MCP agent
		console.log('\n🔌 Mounting MCP handler on /sse endpoint...');
		const mcpHandler = DynamicMCP.mount("/sse");
		return mcpHandler.fetch(request, env, ctx);
	}
};