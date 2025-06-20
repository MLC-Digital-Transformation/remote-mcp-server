import { z } from "zod";
import { ToolContext } from "../types.js";

export const getDashboardTool = {
    name: "get_dashboard",
    description: "Get dashboard HTML content and URL by name",
    schema: z.object({
        dashboard_name: z.string().describe("The name of the dashboard (with or without .html extension)"),
        directory: z.string().optional().default("dashboards/user_uploads").describe("Directory in the bucket where the dashboard is stored")
    }),
    handler: async ({ dashboard_name, directory }: any, context: ToolContext) => {
        try {
            const endpoint = `/storage/dashboard/${encodeURIComponent(dashboard_name)}`;
            const params = new URLSearchParams();
            
            if (directory && directory !== "dashboards/user_uploads") {
                params.append("directory", directory);
            }
            
            const fullEndpoint = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
            
            const result = await context.callFastAPI(fullEndpoint) as {
                name: string;
                url: string;
                content: string;
                directory: string;
            };
            
            // Format the response with HTML content
            return {
                content: [{
                    type: "text" as const,
                    text: `Dashboard: ${result.name}\n\nPublic URL: ${result.url}\n\nDirectory: ${result.directory}\n\n--- HTML Content ---\n\n${result.content}`
                }],
            };
        } catch (error) {
            return {
                content: [{
                    type: "text" as const,
                    text: `Failed to get dashboard: ${error instanceof Error ? error.message : String(error)}`
                }],
            };
        }
    }
};