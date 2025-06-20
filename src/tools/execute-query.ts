import { z } from "zod";
import { ToolContext } from "../types.js";

export const executeQueryTool = {
    name: "execute_query",
    description: "Execute a SELECT query against BigQuery and return the results. Use this when you need to query data from BigQuery tables or views. Make sure to use get_schema_table_view() to check how to construct the query.",
    schema: z.object({
        query: z.string().describe("BigQuery SQL query to execute. IMPORTANT: Only SELECT queries are allowed - no INSERT, UPDATE, DELETE, CREATE, or DDL statements. CTEs (WITH clauses) are allowed but the final statement must be a SELECT. The query validation checks if the trimmed query starts with either 'SELECT' or 'WITH' (case-insensitive)."),
        limit: z.number().optional().default(100).describe("Maximum number of rows to return (1-1000)")
    }),
    handler: async ({ query, limit }: any, context: ToolContext) => {
        try {
            const endpoint = `/bigquery/execute_query`;
            
            const result = await context.callFastAPI(endpoint, "POST", {
                query: query,
                limit: limit
            });
            
            return {
                content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Failed to execute query: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    }
};