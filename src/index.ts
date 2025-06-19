import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

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

		// Test role tool - prints the current role
		this.server.tool("get_role", "Get the current User Role. This is currently NOT used anywhere, so dont use it.", {}, async () => {
			console.log(`Current role accessed: ${this.role}`);
			return {
				content: [{ type: "text", text: `Current MCP Server Role: ${this.role}` }],
			};
		});

		// Get BigQuery schema
		this.server.tool("get_schema_table_view", "Get schema information for a specific BigQuery table or view including column names, types, and descriptions", {
			dataset_with_table: z.string().describe("Dataset and table/view name in format 'dataset.table' (e.g., 'products.Produkt')"),
			include_description: z.boolean().optional().default(true).describe("Include column descriptions in the schema")
		}, async ({ dataset_with_table, include_description }) => {
			try {
				const endpoint = `/bigquery/schema/${dataset_with_table}`;
				const params = new URLSearchParams();
				
				if (include_description !== undefined) {
					params.append("include_description", include_description.toString());
				}
				
				const fullEndpoint = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
				
				const result = await this.callFastAPI(fullEndpoint);
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Failed to get schema: ${error instanceof Error ? error.message : String(error)}` }],
				};
			}
		});


		// Execute BigQuery query (SELECT only)
		this.server.tool("execute_query", "Execute a SELECT query against BigQuery and return the results. Use this when you need to query data from BigQuery tables or views. Make sure to use get_schema_table_view() to check how to construct the query.", {
			query: z.string().describe("BigQuery SQL query to execute (SELECT only). "),
			limit: z.number().optional().default(100).describe("Maximum number of rows to return (1-1000)")
		}, async ({ query, limit }) => {
			try {
				const endpoint = `/bigquery/execute_query`;
				
				const result = await this.callFastAPI(endpoint, "POST", {
					query: query,
					limit: limit
				});
				
				return {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Failed to execute query: ${error instanceof Error ? error.message : String(error)}` }],
				};
			}
		});

		// Example prompt: Data Analyst Assistant
		this.server.prompt("data_analyst", "Data analysis assistant for BigQuery queries and data exploration", {
			analysis_type: z.string().optional().describe("Type of analysis to perform (e.g., 'overview', 'trends', 'comparison')"),
			complexity: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Level of technical complexity for the analysis")
		}, async ({ analysis_type = "general", complexity = "intermediate" }) => {
			const basePrompt = `You are an expert data analyst specializing in BigQuery and business intelligence. 
			
Your role is to help users understand and analyze their data effectively using the available BigQuery tools.

**Your Capabilities:**
- Use get_schema_table_view() to explore table structures
- Use execute_query() to run SELECT queries and retrieve data
- Access the bigquery_catalog resource to see available datasets and tables

**Required Workflow:**
1. ALWAYS start by reading the bigquery_catalog resource to understand what datasets and tables are available
2. Use get_schema_table_view() to explore specific table structures before querying
3. Write and execute appropriate SELECT queries using execute_query()
4. Provide clear analysis and insights based on the results

**Analysis Guidelines:**
- Begin every analysis by accessing bigquery_catalog to discover available data
- Provide clear explanations of your findings
- Suggest follow-up questions and deeper analysis opportunities
- Keep queries efficient and use appropriate LIMIT clauses`;

			let roleSpecificGuidance = "";
			
			switch (complexity) {
				case "beginner":
					roleSpecificGuidance = `
**Beginner Mode:**
- Explain SQL concepts as you use them
- Break down complex queries into simple steps  
- Provide context for business metrics and KPIs
- Suggest basic visualizations for the data`;
					break;
				case "intermediate":
					roleSpecificGuidance = `
**Intermediate Mode:**
- Use standard SQL functions and window functions when appropriate
- Provide statistical insights and trends
- Suggest data quality checks and validation queries
- Recommend optimization opportunities`;
					break;
				case "advanced":
					roleSpecificGuidance = `
**Advanced Mode:**
- Utilize complex analytical functions and CTEs
- Provide statistical analysis and correlations
- Suggest advanced BigQuery features (partitioning, clustering)
- Recommend data modeling improvements`;
					break;
			}

			const analysisContext = analysis_type !== "general" ? 
				`\n**Current Analysis Focus:** ${analysis_type}\nTailor your responses to this specific type of analysis.` : "";

			return {
				messages: [{
					role: 'user',
					content: {
						type: 'text',
						text: basePrompt + roleSpecificGuidance + analysisContext,
					},
				}],
			};
		});

		// BigQuery datasets, tables, and views resource
		this.server.resource("bigquery_catalog", "bigquery://catalog", {
			mimeType: "application/json",
			description: "Available BigQuery datasets, tables, and views"
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
