import { Hono } from "hono";

const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

const app = new Hono();

// Simple home page
app.get("/", (c) => {
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
			</style>
		</head>
		<body>
			<div class="container">
				<h1>MLCD MCP Server</h1>
				<p class="status">✓ FastAPI Proxy MCP Server - No Authentication Required</p>
				
				<h2>Connection Information</h2>
				<div class="endpoint">
					<strong>MCP Endpoint:</strong> <code>https://your-worker-url.workers.dev/sse</code><br>
					<em>Connect your Claude Desktop to this endpoint</em>
				</div>
				
				<div class="endpoint">
					<strong>FastAPI Backend:</strong> <code>${FASTAPI_BASE_URL}</code><br>
					<em>Target API server being proxied</em>
				</div>

				<h2>Available Tools</h2>
				<ul>
					<li><strong>get_role</strong> - Display current MCP server role (testing)</li>
					<li><strong>get_schema</strong> - Get BigQuery dataset/table schema information</li>
				</ul>

				<h2>Available Resources</h2>
				<ul>
					<li><strong>bigquery_catalog</strong> - List of available BigQuery datasets and tables</li>
				</ul>

				<h2>Usage</h2>
				<p>This MCP server acts as a proxy to your FastAPI backend. Add the MCP endpoint above to your Claude Desktop configuration to access your FastAPI endpoints through the MCP protocol.</p>
			</div>
		</body>
		</html>
	`);
});

export default app;