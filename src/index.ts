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

**Required Workflow:**
1. ALWAYS start by reading the bigquery_catalog resource to understand what datasets and tables are available
2. Use get_schema_table_view() to explore specific table structures before querying
3. Write and execute appropriate SELECT queries using execute_query()
4. Provide clear analysis and insights based on the results

**Dashboard Creation:**
When users request a dashboard:
1. Ask the user to choose between light or dark theme. Dont continue without a theme selection.
2. Use the Chart.js patterns provided above to create error-free visualizations
3. Use the company color palette: Primary #4ECDC4 (teal), Secondary #6B46C1 (purple)
4. Create complete, self-contained HTML files with embedded CSS and JavaScript
5. Include Chart.js from CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js
6. Ensure all code is production-ready with proper error handling
7. Include interactive filters and drill-down capabilities where appropriate
8. Integrate live BigQuery data using the FastAPI endpoint for real-time updates
9. Provide the complete HTML file as a single code block that users can save and open directly

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
