export const chartjsDocs = `# Chart.js v3.9.1 Quick Reference with MLC-direct Design System

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