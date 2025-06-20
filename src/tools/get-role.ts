import { z } from "zod";
import { ToolContext } from "../types.js";
import { getAllowedTools, getRoleDescription } from "../rolePermissions.js";

export const getRoleTool = {
    name: "get_role",
    description: "Get the current User Role, authentication status, and available tools.",
    schema: z.object({}),
    handler: async (params: {}, context: ToolContext) => {
        console.log(`Current role accessed: ${context.role}`);
        const authStatus = context.authToken ? "Authenticated" : "Not authenticated";
        const allowedTools = getAllowedTools(context.role);
        const roleDescription = getRoleDescription(context.role);
        
        return {
            content: [{ 
                type: "text" as const, 
                text: `Current MCP Server Role: ${context.role}
Authentication Status: ${authStatus}
Role Description: ${roleDescription}

Available Tools:
${allowedTools.map(tool => `- ${tool}`).join('\n')}` 
            }],
        };
    }
};