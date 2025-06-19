import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

export class MyMCP extends McpAgent {
	private role: string = "default";

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
		// Initialize role from environment or default
		this.role = (this.env as any).ROLE || "default";
		console.log(`MCP Server initialized with role: ${this.role}`);

		// Test role tool - prints the current role
		this.server.tool("get_role", {}, async () => {
			console.log(`Current role accessed: ${this.role}`);
			return {
				content: [{ type: "text", text: `Current MCP Server Role: ${this.role}` }],
			};
		});

		// Get BigQuery schema
		this.server.tool("get_schema", {
			dataset_id: z.string().optional().describe("BigQuery dataset ID (optional)"),
			table_name: z.string().optional().describe("BigQuery table name (optional)")
		}, async ({ dataset_id, table_name }) => {
			try {
				let endpoint = "/bigquery/get_schema";
				const params = new URLSearchParams();
				
				if (dataset_id) {
					params.append("dataset_id", dataset_id);
				}
				if (table_name) {
					params.append("table_name", table_name);
				}
				
				if (params.toString()) {
					endpoint += `?${params.toString()}`;
				}
				
				const result = await this.callFastAPI(endpoint);
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Failed to get schema: ${error instanceof Error ? error.message : String(error)}` }],
				};
			}
		});

		// BigQuery datasets and tables resource
		this.server.resource("bigquery_catalog", "bigquery://catalog", {
			mimeType: "application/json",
			description: "Available BigQuery datasets and tables"
		}, async () => {
			try {
				// Call your FastAPI endpoint that lists datasets/tables
				const result = await this.callFastAPI("/bigquery/list_datasets_tables");
				
				return {
					contents: [{
						uri: "bigquery://catalog",
						mimeType: "application/json",
						text: JSON.stringify(result, null, 2),
					}],
				};
			} catch (error) {
				return {
					contents: [{
						uri: "bigquery://catalog",
						mimeType: "application/json",
						text: JSON.stringify({
							error: "Could not fetch BigQuery catalog",
							message: error instanceof Error ? error.message : String(error),
						}, null, 2),
					}],
				};
			}
		});
	}
}

// Export the MCP agent directly mounted at /sse
export default MyMCP.mount("/sse");
