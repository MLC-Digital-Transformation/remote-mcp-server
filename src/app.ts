import { Hono } from "hono";
import { ROLE_PERMISSIONS, getRoleDescription, getAllowedTools } from "./rolePermissions.js";

const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

const app = new Hono();

// Homepage with role-based access information
app.get("/", (c) => {
	// Get role from query parameter or header
	const role = c.req.query('role') || c.req.header('x-role') || 'no_role_assigned';
	const roleDescription = getRoleDescription(role);
	const allowedTools = getAllowedTools(role);
	
	return c.html(`
		<!DOCTYPE html>
		<html>
		<head>
			<title>MLCD MCP Server</title>
			<style>
				body { font-family: Arial, sans-serif; margin: 40px; }
				.container { max-width: 800px; margin: 0 auto; }
				.endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
				.status { color: #28a745; font-weight: bold; }
				.role-info { background: #e3f2fd; padding: 15px; margin: 10px 0; border-radius: 5px; }
				.warning { color: #ff9800; }
				table { border-collapse: collapse; width: 100%; margin: 10px 0; }
				th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
				th { background-color: #f2f2f2; }
			</style>
		</head>
		<body>
			<div class="container">
				<h1>MLCD MCP Server</h1>
				<p class="status">✓ FastAPI Proxy MCP Server with Role-Based Access Control</p>
				
				<div class="role-info">
					<h3>Current Role: ${role}</h3>
					<p><strong>Description:</strong> ${roleDescription}</p>
					<p><strong>Available Tools:</strong> ${allowedTools.join(', ')}</p>
				</div>
				
				<h2>Connection Information</h2>
				<div class="endpoint">
					<strong>MCP Endpoint:</strong> <code>https://remote-mcp-server.matthew-ludwig.workers.dev/sse</code><br>
					<em>Connect your Claude Desktop to this endpoint</em>
				</div>
				
				<div class="endpoint">
					<strong>FastAPI Backend:</strong> <code>${FASTAPI_BASE_URL}</code><br>
					<em>Target API server used as proxy</em>
				</div>

				<h2>Role-Based Access Control</h2>
				<table>
					<tr>
						<th>Role</th>
						<th>Description</th>
						<th>Available Tools</th>
					</tr>
					<tr>
						<td><strong>admin</strong></td>
						<td>Full access to all tools and operations</td>
						<td>All tools</td>
					</tr>
					<tr>
						<td><strong>analyst</strong></td>
						<td>Can query data and manage dashboards</td>
						<td>get_role, get_schema_table_view, execute_query, upload_dashboard, list_dashboards, get_dashboard</td>
					</tr>
					<tr>
						<td><strong>viewer</strong></td>
						<td>Read-only access to view dashboards</td>
						<td>get_role, list_dashboards, get_dashboard</td>
					</tr>
					<tr>
						<td><strong>guest</strong></td>
						<td>Minimal access - can only check role status</td>
						<td>get_role</td>
					</tr>
				</table>

				<h2>Available Tools</h2>
				<ul>
					<li><strong>get_role</strong> - Check current role, permissions, and available tools</li>
					<li><strong>get_user_data</strong> - Retrieve user information (requires auth token, admin only)</li>
					<li><strong>get_schema_table_view</strong> - Get BigQuery table schema information</li>
					<li><strong>execute_query</strong> - Execute BigQuery SELECT queries</li>
					<li><strong>upload_dashboard</strong> - Upload dashboards to Google Cloud Storage</li>
					<li><strong>list_dashboards</strong> - List available dashboards</li>
					<li><strong>get_dashboard</strong> - Retrieve dashboard content</li>
				</ul>

				<h2>Available Resources</h2>
				<ul>
					<li><strong>bigquery_catalog</strong> - List of available BigQuery datasets and tables</li>
				</ul>

				<h2>Usage Examples</h2>
				<h3>Setting Role via URL:</h3>
				<div class="endpoint">
					<code>https://remote-mcp-server.matthew-ludwig.workers.dev/sse?role=analyst</code>
				</div>
				
				<h3>With Authentication:</h3>
				<div class="endpoint">
					<code>https://remote-mcp-server.matthew-ludwig.workers.dev/sse?role=admin&auth_token=YOUR_TOKEN</code>
				</div>

				<p class="warning">Note: Some tools require authentication. The get_user_data tool requires a valid auth token.</p>
			</div>
		</body>
		</html>
	`);
});

export default app;