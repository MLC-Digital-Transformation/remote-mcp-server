// Role-based access control configuration

export interface RolePermissions {
    tools: string[];
    resources: string[];
    schemas?: {
        allowed?: string[];  // Allowed datasets/tables
        denied?: string[];   // Explicitly denied datasets/tables
        fieldFilters?: {     // Field-level filtering
            [datasetTable: string]: {
                mode: 'include' | 'exclude';
                fields: string[];
            };
        };
    };
}

// Define role permissions
export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
    // Full admin access
    admin: {
        tools: [
            'get_role',
            'get_user_data',
            'get_schema_table_view',
            'execute_query',
            'upload_dashboard',
            'list_dashboards',
            'get_dashboard'
        ],
        resources: ['bigquery_catalog'],
        schemas: {
            // Admin has access to all schemas
        }
    },

    // Data analyst role - can query and create dashboards, but no user management
    analyst: {
        tools: [
            'get_role',
            'get_schema_table_view',
            'execute_query',
            'upload_dashboard',
            'list_dashboards',
            'get_dashboard'
        ],
        resources: ['bigquery_catalog'],
        schemas: {
            // Analysts cannot access Users dataset
            denied: ['Users.*']
        }
    },

    // Viewer role - read-only access
    viewer: {
        tools: [
            'get_role',
            'get_schema_table_view',
            'execute_query',  // Limited queries only
            'list_dashboards',
            'get_dashboard'
        ],
        resources: ['bigquery_catalog'],
        schemas: {
            // Viewers have limited access
            allowed: [
                'products.*',
                'Flowdata.daily_sku_performance_90d',
                'Flowdata.daily_orders_aggregation',
                'Vendor.availability_summary'
            ],
            fieldFilters: {
                // Hide sensitive fields from viewers
                'Vendor.Revenue': {
                    mode: 'exclude',
                    fields: ['Sourcing___Shipped_Revenue']
                }
            }
        }
    },

    // Guest/unauthenticated role - minimal access
    guest: {
        tools: [
            'get_role'
        ],
        resources: [],
        schemas: {
            // No schema access for guests
            denied: ['*']
        }
    },

    // Default role when no role is assigned
    no_role_assigned: {
        tools: [
            'get_role',
            'get_user_data',
            'get_schema_table_view',
            'execute_query',
            'upload_dashboard',
            'list_dashboards',
            'get_dashboard'
        ],
        resources: ['bigquery_catalog'],
        schemas: {
            // Admin has access to all schemas
        }
    },
};

// Helper functions for permission checking
export function hasToolPermission(role: string, toolName: string): boolean {
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['guest'];
    return permissions.tools.includes(toolName);
}

export function hasResourcePermission(role: string, resourceName: string): boolean {
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['guest'];
    return permissions.resources.includes(resourceName);
}

export function hasSchemaPermission(role: string, datasetTable: string): boolean {
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['guest'];
    const schemas = permissions.schemas;
    
    if (!schemas) return true; // No restrictions
    
    // Check denied patterns
    if (schemas.denied) {
        for (const pattern of schemas.denied) {
            if (matchPattern(datasetTable, pattern)) {
                return false;
            }
        }
    }
    
    // Check allowed patterns (if specified, only these are allowed)
    if (schemas.allowed) {
        for (const pattern of schemas.allowed) {
            if (matchPattern(datasetTable, pattern)) {
                return true;
            }
        }
        return false; // Not in allowed list
    }
    
    return true; // No restrictions
}

export function getFieldFilter(role: string, datasetTable: string): { mode: 'include' | 'exclude'; fields: string[] } | null {
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['guest'];
    return permissions.schemas?.fieldFilters?.[datasetTable] || null;
}

// Simple pattern matching function (supports * wildcard)
function matchPattern(text: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        return text.startsWith(prefix + '.');
    }
    return text === pattern;
}

// Get role description
export function getRoleDescription(role: string): string {
    const descriptions: Record<string, string> = {
        admin: "Full administrative access to all tools and data",
        analyst: "Can query data and manage dashboards, no user management",
        viewer: "Read-only access to dashboards and limited data",
        guest: "Minimal access, authentication required for more features",
        no_role_assigned: "No role assigned, minimal access"
    };
    return descriptions[role] || "Unknown role";
}

// Alias for hasToolPermission for backward compatibility
export const hasToolAccess = hasToolPermission;

// Get list of allowed tools for a role
export function getAllowedTools(role: string): string[] {
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['guest'];
    return permissions.tools;
}