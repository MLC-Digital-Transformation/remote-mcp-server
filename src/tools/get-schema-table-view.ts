import { z } from "zod";
import { ToolContext } from "../types.js";

export const getSchemaTableViewTool = {
    name: "get_schema_table_view",
    description: "Get schema information for a specific BigQuery table or view including column names, types, and descriptions",
    schema: z.object({
        dataset_with_table: z.string().describe("Dataset and table/view name in format 'dataset.table' (e.g., 'products.Produkt')"),
        include_description: z.boolean().optional().default(true).describe("Include column descriptions in the schema")
    }),
    handler: async ({ dataset_with_table, include_description }: any, context: ToolContext) => {
        try {
            const endpoint = `/bigquery/schema/${dataset_with_table}`;
            const params = new URLSearchParams();
            
            if (include_description !== undefined) {
                params.append("include_description", include_description.toString());
            }
            
            const fullEndpoint = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
            
            const result = await context.callFastAPI(fullEndpoint);
            return {
                content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Failed to get schema: ${error instanceof Error ? error.message : String(error)}` }],
            };
        }
    }
};