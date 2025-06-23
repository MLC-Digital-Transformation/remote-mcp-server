import { z } from "zod";

export const FASTAPI_BASE_URL = "https://ai.mlcd-dashboard-hub.de";

export interface UserData {
    FirstName: string;
    LastName: string;
    Email: string;
    Role: string;
}

export interface ToolContext {
    callFastAPI: (endpoint: string, method?: string, body?: any) => Promise<any>;
    authToken?: string;
    role: string;
}

export interface PromptContext {
    callFastAPI: (endpoint: string, method?: string, body?: any) => Promise<any>;
    authToken?: string;
    role: string;
}

export interface ResourceContext {
    callFastAPI: (endpoint: string, method?: string, body?: any) => Promise<any>;
    authToken?: string;
    role: string;
}