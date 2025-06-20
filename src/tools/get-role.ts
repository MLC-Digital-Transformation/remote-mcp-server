import { z } from "zod";
import { ToolContext } from "../types.js";

export const getRoleTool = {
    name: "get_role",
    description: "Get the current User Role and authentication status.",
    schema: z.object({}),
    handler: async (params: {}, context: any) => {
        console.log(`Current role accessed: ${context.role}`);
        const authStatus = context.authToken ? "Authenticated" : "Not authenticated";
        return {
            content: [{ 
                type: "text" as const, 
                text: `Current MCP Server Role: ${context.role}\nAuthentication Status: ${authStatus}` 
            }],
        };
    }
};