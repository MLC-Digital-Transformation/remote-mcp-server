import { z } from "zod";
import { FASTAPI_BASE_URL } from "../types.js";

export const uploadDashboardTool = {
    name: "upload_dashboard",
    description: "Upload an HTML dashboard file to Google Cloud Storage and get a public URL",
    schema: z.object({
        html_content: z.string().describe("The complete HTML content of the dashboard. Should contain JavaScript code that fetches data from the FastAPI endpoint using fetch() to /bigquery/execute_query with POST method. Include proper error handling and loading states."),
        filename: z.string().describe("The base filename for the dashboard (without .html extension). Use simple, descriptive names WITHOUT timestamps or dates. Examples: 'sales-dashboard', 'vendor-performance', 'buybox-analysis'"),
        directory: z.string().optional().default("dashboards/uploads").describe("Directory in the bucket (default: dashboards/uploads)")
    }),
    handler: async ({ html_content, filename, directory }: any) => {
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
                    type: "text" as const,
                    text: `Dashboard uploaded successfully!\n\nPublic URL: ${result.url}\n\nThe dashboard is now accessible at the URL above.`
                }],
            };
        } catch (error) {
            return {
                content: [{
                    type: "text" as const,
                    text: `Failed to upload dashboard: ${error instanceof Error ? error.message : String(error)}`
                }],
            };
        }
    }
};