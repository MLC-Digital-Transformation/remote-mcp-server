import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";

const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "mlcd-mcp-server",
		version: "1.0.0",
	});

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
		// Health check tool
		this.server.tool("health_check", {}, async () => {
			try {
				const result = await this.callFastAPI("/health");
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Health check failed: ${error instanceof Error ? error.message : String(error)}` }],
				};
			}
		});

		// Generic API call tool
		this.server.tool("api_call", {
			endpoint: z.string().describe("API endpoint path (e.g., /users, /data)"),
			method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("GET"),
			body: z.any().optional().describe("Request body for POST/PUT requests")
		}, async ({ endpoint, method, body }) => {
			try {
				const result = await this.callFastAPI(endpoint, method, body);
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `API call failed: ${error instanceof Error ? error.message : String(error)}` }],
				};
			}
		});

		// Get API documentation
		this.server.tool("get_api_docs", {}, async () => {
			try {
				const result = await this.callFastAPI("/docs");
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				// Try OpenAPI spec endpoint
				try {
					const openapi = await this.callFastAPI("/openapi.json");
					return {
						content: [{ type: "text", text: JSON.stringify(openapi, null, 2) }],
					};
				} catch (openApiError) {
					return {
						content: [{ type: "text", text: `Documentation not available: ${error instanceof Error ? error.message : String(error)}` }],
					};
				}
			}
		});

		// FastAPI info resource
		this.server.resource("fastapi_info", "fastapi://info", {
			mimeType: "application/json",
			description: "FastAPI server information and configuration"
		}, async () => ({
			contents: [{
				uri: "fastapi://info",
				mimeType: "application/json",
				text: JSON.stringify({
					baseUrl: FASTAPI_BASE_URL,
					description: "FastAPI proxy server",
					endpoints: {
						health: "/health",
						docs: "/docs", 
						openapi: "/openapi.json"
					}
				}, null, 2),
			}],
		}));

		// API endpoints resource
		this.server.resource("api_endpoints", "fastapi://endpoints", {
			mimeType: "application/json",
			description: "Available API endpoints from FastAPI server"
		}, async () => {
			try {
				const openapi = await this.callFastAPI("/openapi.json");
				const paths = Object.keys((openapi as any)?.paths || {});
				
				return {
					contents: [{
						uri: "fastapi://endpoints",
						mimeType: "application/json",
						text: JSON.stringify({
							baseUrl: FASTAPI_BASE_URL,
							endpoints: paths,
							fullSpec: openapi
						}, null, 2),
					}],
				};
			} catch (error) {
				return {
					contents: [{
						uri: "fastapi://endpoints",
						mimeType: "application/json",
						text: JSON.stringify({
							error: "Could not fetch API endpoints",
							message: error instanceof Error ? error.message : String(error),
							baseUrl: FASTAPI_BASE_URL
						}, null, 2),
					}],
				};
			}
		});
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	// @ts-expect-error
	apiHandler: MyMCP.mount("/sse"),
	// @ts-expect-error
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
