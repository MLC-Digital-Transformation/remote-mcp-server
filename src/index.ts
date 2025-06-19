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
			filename: z.string().describe("The base filename for the dashboard (without .html extension)"),
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
			const chartjsDocs = `# Chart.js v3.9.1 Quick Reference

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

## Chart Types with Theme Support

### 1. Bar Chart with Dark/Light Theme
\`\`\`javascript
// Theme-aware colors
const isDarkTheme = true; // or detect from user selection
const colors = {
    grid: isDarkTheme ? '#333' : '#e0e0e0',
    text: isDarkTheme ? '#888' : '#666',
    primary: '#4ECDC4',
    secondary: '#6B46C1'
};

new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['January', 'February', 'March'],
        datasets: [{
            label: 'Sales',
            data: [12, 19, 3],
            backgroundColor: colors.primary,
            borderColor: colors.secondary,
            borderWidth: 1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { color: colors.text }
            },
            title: { 
                display: true, 
                text: 'Sales Chart',
                color: colors.text
            }
        },
        scales: {
            y: { 
                beginAtZero: true,
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            },
            x: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            }
        }
    }
});
\`\`\`

### 2. Line Chart with Theme Support
\`\`\`javascript
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
            label: 'Trend',
            data: [65, 59, 80],
            borderColor: colors.secondary,
            backgroundColor: isDarkTheme ? 'rgba(107, 70, 193, 0.1)' : 'rgba(107, 70, 193, 0.05)',
            tension: 0.1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { color: colors.text }
            }
        },
        scales: {
            y: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            },
            x: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            }
        }
    }
});
\`\`\`

### 3. Doughnut Chart (No scales needed)
\`\`\`javascript
new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: ['Category A', 'Category B', 'Category C'],
        datasets: [{
            data: [30, 50, 20],
            backgroundColor: ['#4ECDC4', '#6B46C1', '#FFE66D'],
            borderColor: isDarkTheme ? '#1a1a1a' : '#ffffff',
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'right',
                labels: { color: colors.text }
            },
            title: {
                display: true,
                text: 'Distribution',
                color: colors.text
            }
        }
        // Note: No scales for doughnut/pie charts
    }
});
\`\`\`

## Real-World Data Patterns

### Data Transformation from API
\`\`\`javascript
// Transform BigQuery results for Chart.js
const transformData = (queryResults) => {
    // Validate data first
    if (!queryResults.rows || queryResults.rows.length === 0) {
        return {
            labels: ['No Data'],
            datasets: [{ data: [0], backgroundColor: '#ccc' }]
        };
    }
    
    // Map data safely with fallbacks
    return {
        labels: queryResults.rows.map(row => row.label || 'Unknown'),
        datasets: [{
            label: 'Values',
            data: queryResults.rows.map(row => row.value || 0),
            backgroundColor: colors.primary
        }]
    };
};
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
			
Your role is to help users understand and analyze their data effectively using the available BigQuery tools, and create interactive dashboards when requested.

**Your Capabilities:**
- Use get_schema_table_view() to explore table structures
- Use execute_query() to run SELECT queries and retrieve data
- Access the bigquery_catalog resource to see available datasets and tables (if not already provided above)
- Create interactive HTML dashboards with charts and visualizations using the Chart.js patterns provided above
- Use upload_dashboard() to upload finished dashboards to Google Cloud Storage and get a public URL

**Required Workflow:**
1. ALWAYS start by reading the bigquery_catalog resource to understand what datasets and tables are available
2. Use get_schema_table_view() to explore specific table structures before querying
3. Write and execute appropriate SELECT queries using execute_query()
4. Provide clear analysis and insights based on the results

**Dashboard Creation Workflow:**
When users request a dashboard:
1. Ask the user to choose between light or dark theme. Dont continue without a theme selection.
2. Use the Chart.js patterns provided above to create error-free visualizations
3. Use the company color palette: Primary #4ECDC4 (teal), Secondary #6B46C1 (purple)
4. Create complete, self-contained HTML files with embedded CSS and JavaScript
5. Include Chart.js from CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js
6. Ensure all code is production-ready with proper error handling
7. DO NOT include any filters in the initial dashboard - keep it simple and focused on data visualization
8. Use static data from BigQuery queries - dashboards will show a snapshot of current data
9. Provide the complete HTML file as a single code block for user review
10. Ask the user: "Would you like me to upload this dashboard to the MLC-direct Dashboard Hub?"
11. If yes, use the upload_dashboard() tool to upload the HTML and provide the public URL. Replace static data with dynamic data fetching from BigQuery using FastAPI endpoints.
12. AFTER uploading, inform the user: "Dashboard uploaded! The URL dynamically fetches data from BigQuery. The dashboard will always show current data when accessed."
13. Then ask if they would like to add interactive filters for a new version
14. If they want filters, suggest 2-3 relevant filter options based on the data (e.g., date range, categories, status)

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
        
        // Transform data for Chart.js
        const labels = result.rows.map(row => row[0]); // First column
        const values = result.rows.map(row => row[1]); // Second column
        
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

		// Chart.js Documentation Resource
		this.server.resource("chartjs_docs", "docs://chartjs", {
			mimeType: "text/markdown",
			description: "Chart.js v3.9.1 documentation and examples for creating error-free charts"
		}, async () => {
			const chartjsDocs = `# Chart.js v3.9.1 Quick Reference

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

## Chart Types with Theme Support

### 1. Bar Chart with Dark/Light Theme
\`\`\`javascript
// Theme-aware colors
const isDarkTheme = true; // or detect from user selection
const colors = {
    grid: isDarkTheme ? '#333' : '#e0e0e0',
    text: isDarkTheme ? '#888' : '#666',
    primary: '#4ECDC4',
    secondary: '#6B46C1'
};

new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['January', 'February', 'March'],
        datasets: [{
            label: 'Sales',
            data: [12, 19, 3],
            backgroundColor: colors.primary,
            borderColor: colors.secondary,
            borderWidth: 1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { color: colors.text }
            },
            title: { 
                display: true, 
                text: 'Sales Chart',
                color: colors.text
            }
        },
        scales: {
            y: { 
                beginAtZero: true,
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            },
            x: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            }
        }
    }
});
\`\`\`

### 2. Line Chart with Theme Support
\`\`\`javascript
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
            label: 'Trend',
            data: [65, 59, 80],
            borderColor: colors.secondary,
            backgroundColor: isDarkTheme ? 'rgba(107, 70, 193, 0.1)' : 'rgba(107, 70, 193, 0.05)',
            tension: 0.1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { color: colors.text }
            }
        },
        scales: {
            y: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            },
            x: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            }
        }
    }
});
\`\`\`

### 3. Doughnut Chart (No scales needed)
\`\`\`javascript
new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: ['Category A', 'Category B', 'Category C'],
        datasets: [{
            data: [30, 50, 20],
            backgroundColor: ['#4ECDC4', '#6B46C1', '#FFE66D'],
            borderColor: isDarkTheme ? '#1a1a1a' : '#ffffff',
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'right',
                labels: { color: colors.text }
            },
            title: {
                display: true,
                text: 'Distribution',
                color: colors.text
            }
        }
        // Note: No scales for doughnut/pie charts
    }
});
\`\`\`

### 4. Multiple Datasets Bar Chart
\`\`\`javascript
new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        datasets: [{
            label: 'Product A',
            data: [12, 19, 3, 5],
            backgroundColor: '#4ECDC4'
        }, {
            label: 'Product B',
            data: [7, 11, 5, 8],
            backgroundColor: '#6B46C1'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top',
                labels: { color: colors.text }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            },
            x: {
                grid: { color: colors.grid },
                ticks: { color: colors.text }
            }
        }
    }
});
\`\`\`

## Real-World Data Patterns

### Data Transformation from API
\`\`\`javascript
// Transform BigQuery results for Chart.js
const transformData = (queryResults) => {
    // Validate data first
    if (!queryResults.rows || queryResults.rows.length === 0) {
        return {
            labels: ['No Data'],
            datasets: [{ data: [0], backgroundColor: '#ccc' }]
        };
    }
    
    // Map data safely with fallbacks
    return {
        labels: queryResults.rows.map(row => row.label || 'Unknown'),
        datasets: [{
            label: 'Values',
            data: queryResults.rows.map(row => row.value || 0),
            backgroundColor: colors.primary
        }]
    };
};
\`\`\`

### Safe Context Access for Dynamic Styling
\`\`\`javascript
// For dynamic colors based on data values
backgroundColor: function(context) {
    // ALWAYS check if parsed exists
    if (!context.parsed) return colors.primary;
    
    const value = context.parsed.y || context.parsed;
    if (value > 100) return '#4CAF50';
    if (value > 50) return '#FFE66D';
    return '#f44336';
}
\`\`\`

### Safe Plugin Configuration
\`\`\`javascript
options: {
    plugins: {
        tooltip: {
            callbacks: {
                label: function(context) {
                    // Safe access pattern
                    let label = context.dataset?.label || '';
                    if (label) label += ': ';
                    
                    const value = context.parsed?.y ?? context.raw;
                    if (value !== null) {
                        label += new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                        }).format(value);
                    }
                    return label;
                }
            }
        }
    }
}
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
    options: { responsive: true }
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

### 3. Complete Async Data Loading Pattern
\`\`\`javascript
async function loadChartData(chartId, query) {
    const ctx = document.getElementById(chartId).getContext('2d');
    
    // Show loading state
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Loading...'],
            datasets: [{
                label: 'Loading data...',
                data: [0],
                backgroundColor: '#ccc'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    try {
        const response = await fetch('https://fast-api-165560968031.europe-west3.run.app/bigquery/execute_query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, limit: 100 })
        });
        
        if (!response.ok) throw new Error('API request failed');
        
        const data = await response.json();
        
        // Transform and update chart
        const transformed = transformData(data);
        chart.data = transformed;
        chart.options.plugins.legend.display = true;
        chart.update('active'); // Smooth animation
        
    } catch (error) {
        // Show error state
        chart.data.labels = ['Error Loading Data'];
        chart.data.datasets[0] = {
            label: error.message,
            data: [0],
            backgroundColor: '#f44336'
        };
        chart.update();
    }
}
\`\`\`

## Complete Dashboard Example

### Full HTML Structure with Dark Theme
\`\`\`html
<!DOCTYPE html>
<html>
<head>
    <title>BigQuery Dashboard</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #1a1a1a;
            color: #ffffff;
        }
        .dashboard-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .chart-container {
            position: relative;
            height: 400px;
            margin-bottom: 30px;
            background: #2a2a2a;
            border-radius: 8px;
            padding: 20px;
        }
        h1, h2 {
            color: #4ECDC4;
        }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <h1>Analytics Dashboard</h1>
        <div class="chart-container">
            <canvas id="mainChart"></canvas>
        </div>
    </div>
    <script>
        // Your chart code here
    </script>
</body>
</html>
\`\`\`

## Advanced Features

### Mixed Chart Types
\`\`\`javascript
new Chart(ctx, {
    data: {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
            type: 'bar',
            label: 'Sales',
            data: [10, 20, 30],
            backgroundColor: '#4ECDC4'
        }, {
            type: 'line',
            label: 'Target',
            data: [15, 25, 35],
            borderColor: '#6B46C1'
        }]
    }
});
\`\`\`

### Responsive Font Sizes
\`\`\`javascript
options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: {
                font: {
                    size: window.innerWidth < 768 ? 10 : 14
                }
            }
        }
    }
}
\`\`\`

### Custom Animations
\`\`\`javascript
options: {
    animation: {
        duration: 2000,
        easing: 'easeInOutQuart',
        onComplete: function() {
            console.log('Animation complete');
        }
    }
}
\`\`\``;

			return {
				contents: [{
					uri: "docs://chartjs",
					mimeType: "text/markdown",
					text: chartjsDocs,
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
