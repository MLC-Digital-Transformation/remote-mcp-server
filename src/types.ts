import { z } from "zod";

export const FASTAPI_BASE_URL = "https://fast-api-165560968031.europe-west3.run.app";

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