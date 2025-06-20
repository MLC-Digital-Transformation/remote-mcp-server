import { z } from "zod";
import { ToolContext } from "../types.js";

export const getUserDataTool = {
    name: "get_user_data",
    description: "Get user data (name, email, role) using the authentication token",
    schema: z.object({}),
    handler: async (params: {}, context: ToolContext) => {
        // Check if auth token is available
        if (!context.authToken) {
            return {
                content: [{
                    type: "text" as const,
                    text: "Error: No authentication token provided. Please configure MCP with an auth token."
                }],
            };
        }

        try {
            // Call the FastAPI endpoint to get user data
            const userData = await context.callFastAPI("/bigquery/user", "GET");
            
            // Format the response
            const userInfo = `User Information:
- Name: ${userData.FirstName} ${userData.LastName}
- Email: ${userData.Email}
- Role: ${userData.Role}`;
            
            return {
                content: [{
                    type: "text" as const,
                    text: userInfo
                }],
            };
        } catch (error: any) {
            // Handle specific error cases
            if (error.message?.includes("404")) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "Error: User not found. The provided token may be invalid."
                    }],
                };
            } else if (error.message?.includes("401")) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "Error: Authentication failed. Please check your token configuration."
                    }],
                };
            }
            
            return {
                content: [{
                    type: "text" as const,
                    text: `Error retrieving user data: ${error.message || 'Unknown error'}`
                }],
            };
        }
    }
};