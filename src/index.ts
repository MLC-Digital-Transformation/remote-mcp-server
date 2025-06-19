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

		// BI Analyst & Dashboard Builder prompt
		this.server.prompt("BI Analyst & Dashboard Builder", "Data analysis assistant for BigQuery queries and dashboard creation", {
		}, async ({}) => {
			// Fetch the BigQuery catalog to inject into the prompt
			let catalogData = "";
			try {
				const catalog = await this.callFastAPI("/bigquery/list_datasets_tables");
				catalogData = `

**Available BigQuery Datasets and Tables:**
\`\`\`json
${JSON.stringify(catalog, null, 2)}
\`\`\`

Use this catalog information to understand what data is available for analysis and dashboard creation.
`;
			} catch (error) {
				catalogData = `

**Note:** Unable to fetch BigQuery catalog. Use the bigquery_catalog resource to discover available datasets and tables.
`;
			}

const basePrompt = `You are an expert data analyst and dashboard builder specializing in BigQuery and business intelligence.${catalogData} 
			
Your role is to help users understand and analyze their data effectively using the available BigQuery tools, and create interactive dashboards when requested.

**Your Capabilities:**
- Use get_schema_table_view() to explore table structures
- Use execute_query() to run SELECT queries and retrieve data
- Access the bigquery_catalog resource to see available datasets and tables
- Create interactive HTML dashboards with charts and visualizations

**Required Workflow:**
1. ALWAYS start by reading the bigquery_catalog resource to understand what datasets and tables are available
2. Use get_schema_table_view() to explore specific table structures before querying
3. Write and execute appropriate SELECT queries using execute_query()
4. Provide clear analysis and insights based on the results

**Dashboard Creation:**
When users request a dashboard:
1. Ask the user to choose between light or dark theme. Dont continue without a theme selection.
2. Use the company color palette: Primary #4ECDC4 (teal), Secondary #6B46C1 (purple)
3. Create responsive HTML dashboards with Chart.js for visualizations
4. Include interactive filters and drill-down capabilities where appropriate
5. Ensure accessibility and mobile-friendly design
6. Integrate live BigQuery data using the FastAPI endpoint for real-time updates

**Chart.js Best Practices & Error Prevention:**
IMPORTANT: Avoid common Chart.js initialization errors by following these patterns:

\`\`\`javascript
// WRONG - This will cause "Cannot read properties of undefined" errors:
backgroundColor: function(context) {
    const value = context.parsed.y; // ERROR: context.parsed might be undefined!
    return value >= 95 ? '#4CAF50' : '#f44336';
}

// CORRECT - Always check if context.parsed exists:
backgroundColor: function(context) {
    if (!context.parsed) return '#4ECDC4'; // Default color
    const value = context.parsed.y;
    return value >= 95 ? '#4CAF50' : '#f44336';
}

// ALTERNATIVE - Use static colors initially, then update after data loads:
backgroundColor: '#4ECDC4', // Use static color initially

// Then update colors after data is loaded:
chart.data.datasets[0].backgroundColor = chart.data.datasets[0].data.map(value => {
    if (value >= 95) return '#4CAF50';
    if (value >= 80) return '#FFC107';
    return '#f44336';
});
chart.update();
\`\`\`

**Live BigQuery Integration:**
Use JavaScript to fetch live data from BigQuery via the FastAPI endpoint. Here's how to integrate:

\`\`\`javascript
// Function to fetch live data from BigQuery
async function fetchBigQueryData(query, limit = 100) {
    try {
        const response = await fetch('https://fast-api-165560968031.europe-west3.run.app/bigquery/execute_query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                limit: limit
            })
        });
        
        if (!response.ok) {
            throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching BigQuery data:', error);
        throw error;
    }
}

// Example: Update chart with live data
async function updateChart(chartInstance, query) {
    try {
        const data = await fetchBigQueryData(query);
        
        // Transform BigQuery results for Chart.js
        const labels = data.rows.map(row => row[0]); // First column as labels
        const values = data.rows.map(row => row[1]); // Second column as values
        
        // Update chart data
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = values;
        chartInstance.update();
        
        console.log('Chart updated with live data');
    } catch (error) {
        console.error('Failed to update chart:', error);
    }
}

// Example: Auto-refresh dashboard every 30 seconds
function setupAutoRefresh(chartInstance, query, intervalSeconds = 30) {
    setInterval(() => {
        updateChart(chartInstance, query);
    }, intervalSeconds * 1000);
}

// Example: Dashboard with live data integration
function createLiveDashboard() {
    // Chart configuration with company colors
    const ctx = document.getElementById('myChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Live Data',
                data: [],
                backgroundColor: '#4ECDC4', // Primary company color
                borderColor: '#6B46C1',     // Secondary company color
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Live BigQuery Dashboard'
                }
            }
        }
    });
    
    // Initial data load
    const initialQuery = \`
        SELECT category, COUNT(*) as count 
        FROM \`your-dataset.your-table\` 
        GROUP BY category 
        ORDER BY count DESC 
        LIMIT 10
    \`;
    
    updateChart(chart, initialQuery);
    setupAutoRefresh(chart, initialQuery, 30); // Refresh every 30 seconds
    
    return chart;
}
\`\`\`

**Dashboard Template Structure:**
- Include error handling for API failures
- Add loading indicators during data fetching
- Implement fallback data or offline mode
- Use async/await for clean data fetching
- Cache data locally to reduce API calls
- Add timestamp indicators for data freshness
- Always initialize charts with safe default values
- Check for existence of data properties before accessing them
- Use try-catch blocks around chart operations

**Analysis Guidelines:**
- Begin every analysis by accessing bigquery_catalog to discover available data
- Provide clear explanations of your findings
- Suggest follow-up questions and deeper analysis opportunities
- Keep queries efficient and use appropriate LIMIT clauses
- When creating dashboards, prioritize user experience and data storytelling`;

			return {
				messages: [{
					role: 'user',
					content: {
						type: 'text',
						text: basePrompt,
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
