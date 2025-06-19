import { Hono } from "hono";

const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

const app = new Hono();

// Einfache Startseite https://remote-mcp-server.matthew-ludwig.workers.dev
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
				<p class="status">✓ FastAPI Proxy MCP Server - Keine Authentifizierung erforderlich</p>
				
				<h2>Verbindungsinformationen</h2>
				<div class="endpoint">
					<strong>MCP-Endpunkt:</strong> <code>https://your-worker-url.workers.dev/sse</code><br>
					<em>Verbinden Sie Ihren Claude Desktop mit diesem Endpunkt</em>
				</div>
				
				<div class="endpoint">
					<strong>FastAPI-Backend:</strong> <code>${FASTAPI_BASE_URL}</code><br>
					<em>Ziel-API-Server, der als Proxy verwendet wird</em>
				</div>

				<h2>Verfügbare Werkzeuge</h2>
				<ul>
					<li><strong>get_role</strong> - Aktuelle MCP-Serverrolle anzeigen (Test)</li>
					<li><strong>get_schema</strong> - BigQuery Dataset-/Tabellenschema-Informationen abrufen</li>
				</ul>

				<h2>Verfügbare Ressourcen</h2>
				<ul>
					<li><strong>bigquery_catalog</strong> - Liste der verfügbaren BigQuery-Datasets und -Tabellen</li>
				</ul>

				<h2>Verwendung</h2>
				<p>Dieser MCP-Server fungiert als Proxy zu Ihrem FastAPI-Backend. Fügen Sie den oben genannten MCP-Endpunkt zu Ihrer Claude Desktop-Konfiguration hinzu, um über das MCP-Protokoll auf Ihre FastAPI-Endpunkte zuzugreifen.</p>
			</div>
		</body>
		</html>
	`);
});

export default app;