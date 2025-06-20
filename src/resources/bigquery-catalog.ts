import { ResourceContext } from "../types.js";

export const bigqueryCatalogResource = {
    name: "bigquery_catalog",
    uri: "bigquery://catalog",
    metadata: {
        mimeType: "application/json",
        description: "Available BigQuery datasets, tables, and views"
    },
    handler: async (context: ResourceContext) => {
        try {
            // Call your FastAPI endpoint that lists datasets/tables
            const result = await context.callFastAPI("/bigquery/list_datasets_tables");
            
            return {
                contents: [{
                    uri: "bigquery://catalog",
                    mimeType: "application/json",
                    text: JSON.stringify(result, null, 2),
                }],
            };
        } catch (error) {
            return {
                contents: [{
                    uri: "bigquery://catalog",
                    mimeType: "application/json",
                    text: JSON.stringify({
                        error: "Could not fetch BigQuery catalog",
                        message: error instanceof Error ? error.message : String(error),
                    }, null, 2),
                }],
            };
        }
    }
};