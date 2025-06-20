import { z } from "zod";
import { ToolContext } from "../types.js";

export const getRoleTool = {
    name: "get_role",
    description: "Get the current User Role. This is currently NOT used anywhere, so dont use it.",
    schema: z.object({}),
    handler: async (params: {}, context: any) => {
        console.log(`Current role accessed: ${context.role}`);
        return {
            content: [{ type: "text" as const, text: `Current MCP Server Role: ${context.role}` }],
        };
    }
};