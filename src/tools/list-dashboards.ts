import { z } from "zod";
import { ToolContext } from "../types.js";

export const listDashboardsTool = {
    name: "list_dashboards",
    description: "List all existing dashboard names from Google Cloud Storage",
    schema: z.object({
        directory: z.string().optional().default("dashboards/user_uploads").describe("Directory in the bucket to list dashboards from")
    }),
    handler: async ({ directory }: any, context: ToolContext) => {
        try {
            const endpoint = `/storage/list-dashboards`;
            const params = new URLSearchParams();
            
            if (directory && directory !== "dashboards/user_uploads") {
                params.append("directory", directory);
            }
            
            const fullEndpoint = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
            
            const result = await context.callFastAPI(fullEndpoint);
            
            // Format the response nicely
            if (Array.isArray(result) && result.length > 0) {
                const dashboardList = result.map((name: string, index: number) => `${index + 1}. ${name}`).join('\n');
                return {
                    content: [{
                        type: "text" as const,
                        text: `Available dashboards:\n\n${dashboardList}\n\nTotal: ${result.length} dashboard(s)`
                    }],
                };
            } else {
                return {
                    content: [{
                        type: "text" as const,
                        text: "No dashboards found in the specified directory."
                    }],
                };
            }
        } catch (error) {
            return {
                content: [{
                    type: "text" as const,
                    text: `Failed to list dashboards: ${error instanceof Error ? error.message : String(error)}`
                }],
            };
        }
    }
};