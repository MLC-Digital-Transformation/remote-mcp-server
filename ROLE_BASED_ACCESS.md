# Role-Based Access Control (RBAC) Documentation

## Overview

The MCP server now implements comprehensive role-based access control to restrict access to tools, resources, and data based on user roles. This ensures that users only have access to the functionality they need.

## Roles and Permissions

### Admin Role
- **Description**: Full administrative access to all tools and data
- **Available Tools**:
  - `get_role` - Check current role and permissions
  - `get_user_data` - Retrieve user information from database
  - `get_schema_table_view` - Get BigQuery table schemas
  - `execute_query` - Execute BigQuery queries
  - `upload_dashboard` - Create and upload dashboards
  - `list_dashboards` - List available dashboards
  - `get_dashboard` - Retrieve dashboard content
- **Data Access**: Full access to all BigQuery datasets and tables

### Analyst Role
- **Description**: Can query data and manage dashboards, no user management
- **Available Tools**:
  - `get_role` - Check current role and permissions
  - `get_schema_table_view` - Get BigQuery table schemas
  - `execute_query` - Execute BigQuery queries
  - `upload_dashboard` - Create and upload dashboards
  - `list_dashboards` - List available dashboards
  - `get_dashboard` - Retrieve dashboard content
- **Data Access**: All datasets except `Users.*` tables

### Viewer Role
- **Description**: Read-only access to dashboards and limited data
- **Available Tools**:
  - `get_role` - Check current role and permissions
  - `get_schema_table_view` - Get BigQuery table schemas (limited)
  - `execute_query` - Execute BigQuery queries (limited datasets)
  - `list_dashboards` - List available dashboards
  - `get_dashboard` - Retrieve dashboard content
- **Data Access**: 
  - Allowed: `products.*`, `Flowdata.daily_sku_performance_90d`, `Flowdata.daily_orders_aggregation`, `Vendor.availability_summary`
  - Restricted fields in `Vendor.Revenue` (revenue data hidden)

### Guest Role
- **Description**: Minimal access, authentication required for more features
- **Available Tools**:
  - `get_role` - Check current role and permissions only
- **Data Access**: No access to BigQuery data

## How It Works

### 1. Role Assignment

Roles can be assigned in three ways (in order of preference):

1. **Automatic from Auth Token** (Recommended):
   ```json
   {
     "mcpServers": {
       "mlcd-mcp-server": {
         "command": "npx",
         "args": [
           "mcp-remote",
           "https://remote-mcp-server.matthew-ludwig.workers.dev/sse?auth_token=YOUR_TOKEN"
         ]
       }
     }
   }
   ```
   The server will fetch user data and assign the role from the database.

2. **Manual via Query Parameter**:
   ```
   https://remote-mcp-server.matthew-ludwig.workers.dev/sse?role=analyst
   ```

3. **Manual via Header**:
   ```
   X-Role: analyst
   ```

### 2. Tool Filtering

- Tools are filtered during server initialization based on the user's role
- Only tools allowed for the role are registered with the MCP server
- Runtime checks provide additional security

### 3. Data Access Control

- Schema permissions control which datasets and tables users can access
- Field-level filtering can hide sensitive columns
- Query execution is restricted based on role permissions

## Configuration Examples

### Admin with Full Access
```json
{
  "mcpServers": {
    "mlcd-mcp-server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote-mcp-server.matthew-ludwig.workers.dev/sse?role=admin&auth_token=YOUR_ADMIN_TOKEN"
      ]
    }
  }
}
```

### Analyst Without User Data Access
```json
{
  "mcpServers": {
    "mlcd-mcp-server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote-mcp-server.matthew-ludwig.workers.dev/sse?role=analyst"
      ]
    }
  }
}
```

### Read-Only Viewer
```json
{
  "mcpServers": {
    "mlcd-mcp-server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote-mcp-server.matthew-ludwig.workers.dev/sse?role=viewer"
      ]
    }
  }
}
```

## Testing Your Access

1. After configuring Claude Desktop, ask Claude: "What role do I have?"
2. The `get_role` tool will show:
   - Your current role
   - Role description
   - Authentication status
   - List of available tools

## Security Features

1. **Double Authorization**: Tools check permissions both at registration and execution
2. **Fail-Safe Default**: Unknown roles default to minimal guest access
3. **Clear Error Messages**: Users receive informative messages when access is denied
4. **Audit Logging**: All role assignments and permission checks are logged

## Extending the System

To add new roles or modify permissions:

1. Edit `src/rolePermissions.ts`
2. Add new role to `ROLE_PERMISSIONS` object
3. Define allowed tools, resources, and schema access
4. Update role descriptions

Example:
```typescript
export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
    // ... existing roles ...
    
    developer: {
        tools: [
            'get_role',
            'get_schema_table_view',
            'execute_query',
            'list_dashboards'
        ],
        resources: ['bigquery_catalog'],
        schemas: {
            allowed: ['products.*', 'Flowdata.*'],
            denied: ['Users.*']
        }
    }
};
```

## Troubleshooting

### "Access denied" errors
- Check your role using the `get_role` tool
- Verify the tool is allowed for your role
- Ensure your auth token is valid if using authentication

### Role not updating
- Restart Claude Desktop after configuration changes
- Check that your auth token is being passed correctly
- Verify the token exists in the Users.User table

### Tools not appearing
- The MCP server only registers tools your role can access
- Use `get_role` to see your available tools
- Contact an admin if you need additional permissions