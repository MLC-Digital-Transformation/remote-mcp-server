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

		// Upload HTML dashboard to Google Cloud Storage
		this.server.tool("upload_dashboard", "Upload an HTML dashboard file to Google Cloud Storage and get a public URL", {
			html_content: z.string().describe("The complete HTML content of the dashboard. Should contain JavaScript code that fetches data from the FastAPI endpoint using fetch() to /bigquery/execute_query with POST method. Include proper error handling and loading states."),
			filename: z.string().describe("The base filename for the dashboard (without .html extension). Use simple, descriptive names WITHOUT timestamps or dates. Examples: 'sales-dashboard', 'vendor-performance', 'buybox-analysis'"),
			directory: z.string().optional().default("dashboards/uploads").describe("Directory in the bucket (default: dashboards/uploads)")
		}, async ({ html_content, filename, directory }) => {
			try {
				// Create a Blob from the HTML content
				const blob = new Blob([html_content], { type: 'text/html' });
				
				// Create FormData and append the file
				const formData = new FormData();
				formData.append('file', blob, `${filename}.html`);
				formData.append('directory', directory);
				
				// Call the FastAPI upload endpoint (no auth required)
				const response = await fetch(`${FASTAPI_BASE_URL}/storage/upload-html`, {
					method: 'POST',
					body: formData
				});
				
				if (!response.ok) {
					let errorMessage = `Upload failed with status ${response.status}`;
					try {
						const errorData = await response.json() as { detail?: string };
						if (errorData.detail) {
							errorMessage = errorData.detail;
						}
					} catch {
						// If JSON parsing fails, use the default error message
					}
					throw new Error(errorMessage);
				}
				
				const result = await response.json() as {
					status: string;
					message: string;
					filename: string;
					directory: string;
					url: string;
				};
				
				// Return the upload result
				return {
					content: [{
						type: "text",
						text: `Dashboard uploaded successfully!\n\nPublic URL: ${result.url}\n\nThe dashboard is now accessible at the URL above.`
					}],
				};
			} catch (error) {
				return {
					content: [{
						type: "text",
						text: `Failed to upload dashboard: ${error instanceof Error ? error.message : String(error)}`
					}],
				};
			}
		});

		// List existing dashboards
		this.server.tool("list_dashboards", "List all existing dashboard names from Google Cloud Storage", {
			directory: z.string().optional().default("dashboards/user_uploads").describe("Directory in the bucket to list dashboards from")
		}, async ({ directory }) => {
			try {
				const endpoint = `/storage/list-dashboards`;
				const params = new URLSearchParams();
				
				if (directory && directory !== "dashboards/user_uploads") {
					params.append("directory", directory);
				}
				
				const fullEndpoint = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
				
				const result = await this.callFastAPI(fullEndpoint);
				
				// Format the response nicely
				if (Array.isArray(result) && result.length > 0) {
					const dashboardList = result.map((name, index) => `${index + 1}. ${name}`).join('\n');
					return {
						content: [{
							type: "text",
							text: `Available dashboards:\n\n${dashboardList}\n\nTotal: ${result.length} dashboard(s)`
						}],
					};
				} else {
					return {
						content: [{
							type: "text",
							text: "No dashboards found in the specified directory."
						}],
					};
				}
			} catch (error) {
				return {
					content: [{
						type: "text",
						text: `Failed to list dashboards: ${error instanceof Error ? error.message : String(error)}`
					}],
				};
			}
		});

		// Get dashboard content and URL
		this.server.tool("get_dashboard", "Get dashboard content and URL by name", {
			dashboard_name: z.string().describe("The name of the dashboard (with or without .html extension)"),
			directory: z.string().optional().default("dashboards/user_uploads").describe("Directory in the bucket where the dashboard is stored")
		}, async ({ dashboard_name, directory }) => {
			try {
				const endpoint = `/storage/dashboard/${encodeURIComponent(dashboard_name)}`;
				const params = new URLSearchParams();
				
				if (directory && directory !== "dashboards/user_uploads") {
					params.append("directory", directory);
				}
				
				const fullEndpoint = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
				
				const result = await this.callFastAPI(fullEndpoint) as {
					name: string;
					url: string;
					content: string;
					directory: string;
				};
				
				// Format the response
				return {
					content: [{
						type: "text",
						text: `Dashboard: ${result.name}\n\nPublic URL: ${result.url}\n\nThe dashboard has been retrieved successfully. The HTML content is available for viewing or editing.`
					}],
				};
			} catch (error) {
				return {
					content: [{
						type: "text",
						text: `Failed to get dashboard: ${error instanceof Error ? error.message : String(error)}`
					}],
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

			// Get the Chart.js documentation
			const chartjsDocs = `# Chart.js v3.9.1 Quick Reference with MLC-direct Design System

**IMPORTANT**: The chart types shown below (Bar, Line, Doughnut) are just EXAMPLES. You should use ALL available Chart.js chart types based on what best visualizes the data:
- **Bar Chart**: For comparing categories
- **Line Chart**: For trends over time
- **Doughnut/Pie Chart**: For parts of a whole
- **Scatter Chart**: For correlations between variables
- **Bubble Chart**: For three-dimensional data
- **Radar Chart**: For multivariate comparisons
- **Polar Area Chart**: For cyclic data
- **Mixed Charts**: Combine multiple chart types

Choose the most appropriate visualization for the data and user needs!

## Essential Setup & Configuration

### Container Setup (IMPORTANT)
\`\`\`html
<!-- Always wrap canvas in a container with defined height -->
<div class="chart-container" style="position: relative; height: 400px;">
    <canvas id="myChart"></canvas>
</div>
\`\`\`

### Basic Chart Initialization
\`\`\`javascript
// Always get 2D context
const ctx = document.getElementById('myChart').getContext('2d');
const chart = new Chart(ctx, config);
\`\`\`

## Example Chart Types with MLC-direct Design System
Note: These are just examples - use any Chart.js chart type that best fits your data!

### Example 1: Bar Chart
\`\`\`javascript
// MLC-direct Design System colors
const chartColors = {
    primary: '#4ECDC4',
    secondary: '#6B46C1',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    gray: '#6B7280'
};

new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['January', 'February', 'March'],
        datasets: [{
            label: 'Sales',
            data: [12, 19, 3],
            backgroundColor: chartColors.primary,
            borderColor: chartColors.secondary,
            borderWidth: 2,
            borderRadius: 8
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { 
                    color: '#1F2937',
                    font: {
                        family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        size: 14
                    },
                    padding: 20
                }
            },
            title: { 
                display: true, 
                text: 'Sales Chart',
                color: '#1F2937',
                font: {
                    size: 18,
                    weight: '600'
                }
            }
        },
        scales: {
            y: { 
                beginAtZero: true,
                grid: { 
                    color: '#E5E7EB',
                    drawBorder: false
                },
                ticks: { 
                    color: '#6B7280',
                    font: {
                        size: 12
                    }
                }
            },
            x: {
                grid: { 
                    color: '#E5E7EB',
                    drawBorder: false
                },
                ticks: { 
                    color: '#6B7280',
                    font: {
                        size: 12
                    }
                }
            }
        }
    }
});
\`\`\`

### Example 2: Line Chart
\`\`\`javascript
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
            label: 'Trend',
            data: [65, 59, 80],
            borderColor: chartColors.secondary,
            backgroundColor: 'rgba(107, 70, 193, 0.1)',
            tension: 0.1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { 
                    color: '#1F2937',
                    font: {
                        family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        size: 14
                    },
                    padding: 20
                }
            }
        },
        scales: {
            y: {
                grid: { 
                    color: '#E5E7EB',
                    drawBorder: false
                },
                ticks: { 
                    color: '#6B7280',
                    font: {
                        size: 12
                    }
                }
            },
            x: {
                grid: { 
                    color: '#E5E7EB',
                    drawBorder: false
                },
                ticks: { 
                    color: '#6B7280',
                    font: {
                        size: 12
                    }
                }
            }
        }
    }
});
\`\`\`

### Example 3: Doughnut Chart (No scales needed)
\`\`\`javascript
new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: ['Category A', 'Category B', 'Category C'],
        datasets: [{
            data: [30, 50, 20],
            backgroundColor: ['#4ECDC4', '#6B46C1', '#FFE66D'],
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'right',
                labels: { 
                    color: '#1F2937',
                    font: {
                        family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        size: 14
                    },
                    padding: 20
                }
            },
            title: {
                display: true,
                text: 'Distribution',
                color: '#1F2937',
                font: {
                    size: 18,
                    weight: '600'
                }
            }
        }
        // Note: No scales for doughnut/pie charts
    }
});
\`\`\`

## Real-World Data Patterns

### Data Transformation from API with NULL Handling
\`\`\`javascript
// Transform BigQuery results for Chart.js - ALWAYS handle NULL values!
const transformData = (queryResults) => {
    // Validate data first
    if (!queryResults || !queryResults.rows || queryResults.rows.length === 0) {
        return {
            labels: ['No Data'],
            datasets: [{ data: [0], backgroundColor: '#ccc' }]
        };
    }
    
    // Map data safely with NULL checks and fallbacks
    return {
        labels: queryResults.rows.map(row => {
            // Handle NULL or missing values
            if (!row || row[0] === null || row[0] === undefined) {
                return 'Unknown';
            }
            return String(row[0]);
        }),
        datasets: [{
            label: 'Values',
            data: queryResults.rows.map(row => {
                // Ensure numeric values
                if (!row || row[1] === null || row[1] === undefined) {
                    return 0;
                }
                return Number(row[1]) || 0;
            }),
            backgroundColor: chartColors.primary
        }]
    };
};

// IMPORTANT: When using string methods, ALWAYS check for null first!
backgroundColor: queryResults.rows.map(row => {
    const value = row[0];
    // Guard against null/undefined
    if (!value || value === null) return chartColors.gray;
    
    // Only use string methods after null check
    if (typeof value === 'string') {
        if (value.includes('Amazon')) return chartColors.success;
        if (value.includes('MLC')) return chartColors.primary;
    }
    
    return chartColors.gray;
})
\`\`\`

## Common Error Prevention

### 1. Initialize with Empty Data
\`\`\`javascript
// Start with empty arrays to avoid undefined errors
const chart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [{
            label: 'Data',
            data: [],
            backgroundColor: '#4ECDC4'
        }]
    },
    options: { responsive: true, maintainAspectRatio: false }
});

// Update later with actual data
chart.data.labels = actualLabels;
chart.data.datasets[0].data = actualData;
chart.update();
\`\`\`

### 2. Destroy Previous Charts
\`\`\`javascript
// Prevent "Canvas is already in use" errors
let chartInstance = null;

function createChart(data) {
    // Destroy existing chart
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(ctx, {
        // ... configuration
    });
}
\`\`\`

### 3. Data Initialization Pattern
\`\`\`javascript
// Initialize chart with embedded BigQuery data
function initializeChart(chartId, embeddedData) {
    const ctx = document.getElementById(chartId).getContext('2d');
    
    // Validate embedded data
    if (!embeddedData || !embeddedData.rows || embeddedData.rows.length === 0) {
        // Show no data state
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Data Available'],
                datasets: [{
                    label: 'No results from query',
                    data: [0],
                    backgroundColor: '#ccc'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    // Transform embedded data for Chart.js
    const labels = embeddedData.rows.map(row => row[0]);
    const values = embeddedData.rows.map(row => row[1]);
    
    // Create chart with data
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: embeddedData.label || 'BigQuery Data',
                data: values,
                backgroundColor: '#4ECDC4',
                borderColor: '#6B46C1',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: embeddedData.title || 'Data Dashboard'
                },
                subtitle: {
                    display: true,
                    text: 'Data from: ' + (embeddedData.timestamp || new Date().toLocaleString()),
                    color: '#888'
                }
            }
        }
    });
}
\`\`\``;

const basePrompt = `You are an expert data analyst and dashboard builder specializing in BigQuery and business intelligence.${catalogData}

**IMPORTANT Chart.js Reference:**
${chartjsDocs} 
			
Your role is to help users understand and analyze their data effectively using the available BigQuery tools, and create or edit interactive dashboards when requested.

**Your Capabilities:**
- Use get_schema_table_view() to explore table structures
- Use execute_query() to run SELECT queries and retrieve data
- Access the bigquery_catalog resource to see available datasets and tables (if not already provided above)
- Create interactive HTML dashboards with charts and visualizations using the Chart.js patterns provided above
- Use upload_dashboard() to upload finished dashboards to Google Cloud Storage and get a public URL
- Use list_dashboards() to see what dashboards already exist (helps avoid duplicate names)
- Use get_dashboard() to retrieve existing dashboard content and URL by name
- IMPORTANT: The examples show Bar, Line, and Doughnut charts, but you should use ANY Chart.js chart type (Scatter, Bubble, Radar, Polar Area, Area, etc.) that best visualizes the data. Also use tables, users usually love them!

**Required Workflow:**
1. ALWAYS start by reading the bigquery_catalog resource to understand what datasets and tables are available
2. Use get_schema_table_view() to explore specific table structures before querying
3. Write and execute appropriate SELECT queries using execute_query()
4. Provide clear analysis and insights based on the results

**Dashboard Creation Workflow:**
When users request a dashboard:
1. Use the Chart.js patterns provided above to create error-free visualizations
2. Apply the MLC-direct Design System (see below)
3. Create complete, self-contained HTML files with embedded CSS and JavaScript
4. Include Chart.js from CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js
5. Ensure all code is production-ready with proper error handling
6. DO NOT include any filters in the initial dashboard - keep it simple and focused on data visualization
7. Use static data from BigQuery queries - dashboards will show a snapshot of current data
8. Provide the complete HTML file as a single code block for user review. Use static data for initial review, but ensure the final version fetches dynamic data from BigQuery using FastAPI endpoints. If the user tells you there is a "fetch" error, explain that this is because Claude does not support dynamic data fetching in the preview, but the final dashboard will work correctly when uploaded to the MLC-direct Dashboard Hub.
9. Ask the user: "Would you like me to upload this dashboard to the MLC-direct Dashboard Hub?"
10. If yes, ALWAYS ask: "What would you like to name this dashboard?" and wait for the user's response
    - Suggest a descriptive name based on the dashboard content (e.g., "vendor-buybox-analysis" or "sales-performance")
    - Use list_dashboards() to check if the name already exists
    - If it exists, inform the user and ask for a different name
11. Once you have a unique name, ask: "Which category should this dashboard belong to?" and wait for the user's response
    - Suggest appropriate categories based on the dashboard content (e.g., "sales", "vendor", "inventory", "performance", "finance")
    - Categories will be used to organize dashboards in folders
12. Once you have both name and category, use the upload_dashboard() tool to upload the HTML:
    - Use the user-provided name as the filename
    - Append the category to the directory path (e.g., "dashboards/uploads/sales" for sales category)
    - Replace static data with dynamic data fetching from BigQuery using FastAPI endpoints 
    - **IMPORTANT**: Use simple, descriptive filenames WITHOUT timestamps, dates, or random numbers
    - Good examples: "sales-dashboard", "vendor-buybox-analysis", "product-performance"
    - Bad examples: "dashboard-2024-01-15", "report_143523", "analysis-v2-final-updated"
13. AFTER uploading, inform the user: "Dashboard uploaded! The URL dynamically fetches data from BigQuery. The dashboard will always show current data when accessed."
14. Then ask if they would like to add interactive filters for a new version
15. If they want filters, suggest 2-3 relevant filter options based on the data (e.g., date range, categories, status). If the dashboard contains Data about products, suggest a Search Filter (by product name, Artikelnummer/SKU or ASIN if available).

**Dashboard Editing Workflow:**
When users want to edit an existing dashboard:
1. Ask the user for the dashboard name or URL
   - If they didnt provide a name, use list_dashboards() to show existing dashboards
   - If they provide a URL like 'https://storage.googleapis.com/.../vendor-buybox-analysis.html', extract the filename (i.e. 'vendor-buybox-analysis')
   - If they provide just a name, use it directly
2. Use list_dashboards() to check if the dashboard exists, if you havent already
3. Use get_dashboard() to retrieve the dashboard content
4. Analyze the existing dashboard structure:
   - Identify the queries being used
   - Note the chart types and visualizations
   - Understand the current data flow
5. Ask the user what changes they want to make:
   - Add new charts?
   - Modify existing visualizations?
   - Change queries or data sources?
   - Update styling or layout?
   - Add interactive filters?
6. Make the requested modifications while preserving:
   - The MLC-direct Design System
   - Existing functionality that should remain
   - Dynamic data fetching patterns
7. Ask the user: "Would you like to keep the dashboard in the same category or move it to a different one?"
   - If same category, use the existing category from the dashboard's directory path
   - If different, ask for the new category name
8. Upload the dashboard using upload_dashboard() with the appropriate category in the directory path. Dont show the user the HTML code again, since BigQuery queries and data fetching are now dynamic and not working unless in the Dashboard Hub.
9. Provide the URL and confirm the changes

**MLC-direct Design System:**
Apply this consistent design system to all dashboards:

\`\`\`css
/* CSS Variables - Always include these in your dashboards */
:root {
    --primary-color: #4ECDC4;      /* Teal - Primary brand color */
    --secondary-color: #6B46C1;    /* Purple - Secondary brand color */
    --success-color: #10B981;      /* Green - Success/positive states */
    --warning-color: #F59E0B;      /* Orange - Warning states */
    --danger-color: #EF4444;       /* Red - Error/danger states */
    --bg-color: #F8FAFC;          /* Light gray - Page background */
    --card-bg: #FFFFFF;           /* White - Card backgrounds */
    --text-primary: #1F2937;      /* Dark gray - Primary text */
    --text-secondary: #6B7280;    /* Medium gray - Secondary text */
    --border-color: #E5E7EB;      /* Light gray - Borders */
}

/* Typography - Use system font stack */
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
    padding: 0;
}

/* Container Layout */
.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem 1rem;
}

/* Header with Gradient */
.header {
    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
    color: white;
    padding: 2rem 1rem;
    text-align: center;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
}

.header p {
    font-size: 1.1rem;
    opacity: 0.9;
}

/* Card Component */
.card {
    background: var(--card-bg);
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.stat-card {
    background: var(--card-bg);
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    text-align: center;
    border-left: 4px solid var(--primary-color);
}

.stat-card h3 {
    font-size: 2rem;
    color: var(--primary-color);
    margin-bottom: 0.5rem;
}

.stat-card p {
    color: var(--text-secondary);
    font-weight: 500;
}

/* Chart Container */
.chart-container {
    position: relative;
    height: 400px;
    background: var(--card-bg);
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
}

/* Responsive Grid */
.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
    gap: 1.5rem;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
    .header h1 {
        font-size: 2rem;
    }
    
    .stats-grid {
        grid-template-columns: 1fr;
    }
    
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
    
    .chart-container {
        height: 300px;
    }
}
\`\`\`

**Chart.js Theme Configuration:**
\`\`\`javascript
// Standard chart colors matching the design system
const chartColors = {
    primary: '#4ECDC4',
    secondary: '#6B46C1',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    gray: '#6B7280'
};

// Standard chart options for consistent styling
const standardChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'top',
            labels: {
                color: '#1F2937',
                font: {
                    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    size: 14
                },
                padding: 20
            }
        },
        title: {
            display: true,
            color: '#1F2937',
            font: {
                size: 18,
                weight: '600'
            },
            padding: {
                bottom: 20
            }
        }
    },
    scales: {
        y: {
            beginAtZero: true,
            grid: {
                color: '#E5E7EB',
                drawBorder: false
            },
            ticks: {
                color: '#6B7280',
                font: {
                    size: 12
                }
            }
        },
        x: {
            grid: {
                display: false,
                drawBorder: false
            },
            ticks: {
                color: '#6B7280',
                font: {
                    size: 12
                }
            }
        }
    }
};

// Example chart with proper theming
new Chart(ctx, {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [{
            label: 'Sales Data',
            data: values,
            backgroundColor: chartColors.primary,
            borderColor: chartColors.secondary,
            borderWidth: 2,
            borderRadius: 8,
            hoverBackgroundColor: chartColors.secondary
        }]
    },
    options: {
        ...standardChartOptions,
        plugins: {
            ...standardChartOptions.plugins,
            title: {
                ...standardChartOptions.plugins.title,
                text: 'Monthly Sales Performance'
            }
        }
    }
});
\`\`\`

**Dashboard HTML Template:**
\`\`\`html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MLC-direct Dashboard</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        /* Include all CSS variables and styles from above */
    </style>
</head>
<body>
    <div class="header">
        <h1>Dashboard Title</h1>
        <p>Dashboard subtitle or description</p>
    </div>
    
    <div class="container">
        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <h3>€1.2M</h3>
                <p>Total Revenue</p>
            </div>
            <!-- More stat cards -->
        </div>
        
        <!-- Charts Grid -->
        <div class="dashboard-grid">
            <div class="chart-container">
                <canvas id="chart1"></canvas>
            </div>
            <!-- More charts -->
        </div>
    </div>
    
    <script>
        // Your chart initialization code here
    </script>
</body>
</html>
\`\`\`

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

**Dynamic Data Integration with FastAPI:**
For dashboards that fetch current BigQuery data dynamically:

\`\`\`javascript
// Example: Fetch data from FastAPI BigQuery endpoint
async function fetchBigQueryData(query) {
    try {
        const response = await fetch('https://fast-api-165560968031.europe-west3.run.app/bigquery/execute_query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                limit: 100  // Adjust limit as needed (max 1000)
            })
        });
        
        if (!response.ok) {
            throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

// Example: Create dashboard with dynamic data
async function createDashboard() {
    const ctx = document.getElementById('myChart').getContext('2d');
    
    // Initialize with loading state
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Loading...'],
            datasets: [{
                label: 'Fetching data...',
                data: [0],
                backgroundColor: '#ccc'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    try {
        // Example query - replace with your actual query
        const query = "SELECT product_name, SUM(sales) as total_sales FROM products.sales_data GROUP BY product_name ORDER BY total_sales DESC LIMIT 10";
        
        const result = await fetchBigQueryData(query);
        
        // Transform data for Chart.js - use PROPERTY NAMES from your SQL query!
        // Example: SELECT product_name, SUM(sales) as total_sales
        const labels = result.rows.map(row => row.product_name); // Use column alias
        const values = result.rows.map(row => row.total_sales); // Use column alias
        
        // Update chart with fetched data
        chart.data.labels = labels;
        chart.data.datasets[0] = {
            label: 'Total Sales',
            data: values,
            backgroundColor: '#4ECDC4', // Primary company color
            borderColor: '#6B46C1',     // Secondary company color
            borderWidth: 2
        };
        
        // Update chart options
        chart.options.plugins = {
            title: {
                display: true,
                text: 'Sales Dashboard'
            },
            subtitle: {
                display: true,
                text: 'Live data from BigQuery - Last updated: ' + new Date().toLocaleString()
            }
        };
        
        chart.update();
        
    } catch (error) {
        // Show error state
        chart.data.labels = ['Error loading data'];
        chart.data.datasets[0] = {
            label: 'Failed to fetch data',
            data: [0],
            backgroundColor: '#f44336'
        };
        chart.update();
    }
}

// Example: Complete HTML structure with dynamic data loading
const dashboardHTML = \`
<!DOCTYPE html>
<html>
<head>
    <title>Dynamic BigQuery Dashboard</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        /* Your styles here */
    </style>
</head>
<body>
    <div class="dashboard-container">
        <h1>Sales Analytics</h1>
        <div class="chart-container">
            <canvas id="salesChart"></canvas>
        </div>
    </div>
    <script>
        // Dynamic data fetching on page load
        window.onload = async function() {
            await createDashboard();
        };
    </script>
</body>
</html>
\`;
\`\`\`

**Multiple Charts Example with Dynamic Data:**
\`\`\`javascript
// Example: Dashboard with multiple charts fetching different queries
async function initializeDashboard() {
    // Helper function to create loading chart
    function createLoadingChart(ctx) {
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Loading...'],
                datasets: [{
                    label: 'Fetching data...',
                    data: [0],
                    backgroundColor: '#ccc'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    // Chart 1: Sales by Product
    const salesCtx = document.getElementById('salesChart').getContext('2d');
    const salesChart = createLoadingChart(salesCtx);
    
    // Chart 2: Monthly Trends
    const trendsCtx = document.getElementById('trendsChart').getContext('2d');
    const trendsChart = createLoadingChart(trendsCtx);
    
    // Fetch data for both charts in parallel
    try {
        const [salesData, trendsData] = await Promise.all([
            fetchBigQueryData("SELECT product_name, SUM(revenue) as total FROM sales.transactions GROUP BY product_name ORDER BY total DESC LIMIT 5"),
            fetchBigQueryData("SELECT DATE_TRUNC(order_date, MONTH) as month, SUM(revenue) as revenue FROM sales.transactions WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH) GROUP BY month ORDER BY month")
        ]);
        
        // Update Sales Chart
        salesChart.data.labels = salesData.rows.map(row => row[0]);
        salesChart.data.datasets[0] = {
            label: 'Revenue by Product',
            data: salesData.rows.map(row => row[1]),
            backgroundColor: '#4ECDC4',
            borderColor: '#6B46C1',
            borderWidth: 2
        };
        salesChart.options.plugins = {
            title: {
                display: true,
                text: 'Top 5 Products by Revenue'
            }
        };
        salesChart.update();
        
        // Update Trends Chart (as line chart)
        trendsChart.config.type = 'line';
        trendsChart.data.labels = trendsData.rows.map(row => new Date(row[0]).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
        trendsChart.data.datasets[0] = {
            label: 'Monthly Revenue Trend',
            data: trendsData.rows.map(row => row[1]),
            borderColor: '#6B46C1',
            backgroundColor: 'rgba(107, 70, 193, 0.1)',
            tension: 0.1
        };
        trendsChart.options.plugins = {
            title: {
                display: true,
                text: 'Revenue Trend - Last 6 Months'
            }
        };
        trendsChart.update();
        
        // Update last refresh time
        document.getElementById('lastRefresh').textContent = new Date().toLocaleString();
        
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        // Show error state in both charts
        [salesChart, trendsChart].forEach(chart => {
            chart.data.labels = ['Error'];
            chart.data.datasets[0] = {
                label: 'Failed to load data',
                data: [0],
                backgroundColor: '#f44336'
            };
            chart.update();
        });
    }
}

// Add refresh functionality
function addRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            await initializeDashboard();
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Data';
        });
    }
}
\`\`\`

**Dashboard Template Structure:**
- Use fetch() to dynamically retrieve data from the FastAPI endpoint
- Add timestamp indicators showing when data was last fetched
- Always initialize charts with loading states
- Include proper error handling for failed API requests
- Use try-catch blocks around all async operations
- Update timestamp in dashboard title/subtitle on each data refresh
- Consider adding a refresh button for manual data updates

**CRITICAL: BigQuery Data Validation & API Response Format**

**IMPORTANT**: The FastAPI BigQuery endpoint returns data with NAMED PROPERTIES, not arrays!

API Response Format:
\`\`\`javascript
{
  "rows": [
    {
      "column_name1": "value1",
      "column_name2": "value2",
      "column_name3": 123
    },
    // more rows...
  ],
  "columns": [
    {"name": "column_name1", "type": "String"},
    {"name": "column_name2", "type": "String"},
    {"name": "column_name3", "type": "Int64"}
  ]
}
\`\`\`

Access data using property names, NOT array indices:
\`\`\`javascript
// WRONG - Array access won't work!
const value = row[0];  // undefined!

// CORRECT - Use property names from your SQL query
const value = row.column_name;
const count = row.product_count;
\`\`\`

When processing BigQuery results, ALWAYS validate data before using string methods or accessing properties:

\`\`\`javascript
// WRONG - Will fail if row[0] is null/undefined
backgroundColor: data.rows.map(row => {
    if (row[0].includes('text')) return color; // ERROR if row[0] is null!
})

// CORRECT - Always check for null/undefined first
backgroundColor: data.rows.map(row => {
    const value = row[0];
    if (!value || value === null) return chartColors.gray;
    if (typeof value === 'string' && value.includes('text')) return color;
    return chartColors.gray;
})

// Safe data access patterns with PROPERTY NAMES:
// 1. For labels - always provide fallback
labels: data.rows.map(row => row.category_name || 'Unknown'),

// 2. For numeric data - ensure valid numbers
data: data.rows.map(row => {
    const value = row.total_count;
    return (value !== null && value !== undefined) ? Number(value) : 0;
}),

// 3. For conditional styling - guard all property access
backgroundColor: data.rows.map(row => {
    const label = row.status;
    if (!label) return chartColors.gray;
    
    // For string comparisons
    if (typeof label === 'string') {
        if (label.includes('A -')) return chartColors.success;
        if (label === 'Amazon') return chartColors.primary;
    }
    
    return chartColors.gray;
}),

// 4. For accessing properties safely
data: data.rows.map(row => {
    // Check if row exists and has the property
    if (!row || !row.hasOwnProperty('revenue')) return 0;
    return Number(row.revenue) || 0;
})
\`\`\`

**Remember**: BigQuery can return NULL values, empty strings, or missing data. Always validate before using!

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
