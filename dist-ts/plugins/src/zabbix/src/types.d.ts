import { z } from 'zod';
import { ResponseFormatSchema, type ResponseFormat, type ToolResponse } from './shared';
export { ResponseFormatSchema };
export type { ResponseFormat, ToolResponse };
export interface ToolAnnotationHints {
    [key: string]: unknown;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
}
export declare const ZabbixReadAnnotations: ToolAnnotationHints;
export declare const ZabbixIdempotentReadAnnotations: ToolAnnotationHints;
export declare const CredentialsShape: {
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const HostDiscoverInputShape: {
    groupFilter: z.ZodOptional<z.ZodString>;
    templateFilter: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const MetricsInputShape: {
    hostName: z.ZodString;
    itemFilter: z.ZodOptional<z.ZodString>;
    timeFrom: z.ZodOptional<z.ZodString>;
    timeTill: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const AlertsInputShape: {
    hostFilter: z.ZodOptional<z.ZodString>;
    actionIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    eventIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const InventoryInputShape: {
    hostFilter: z.ZodOptional<z.ZodString>;
    inventoryMode: z.ZodOptional<z.ZodEnum<["automatic", "manual", "disabled"]>>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const ProblemsInputShape: {
    hostFilter: z.ZodOptional<z.ZodString>;
    severityFilter: z.ZodOptional<z.ZodEnum<["not_classified", "information", "warning", "average", "high", "disaster"]>>;
    acknowledged: z.ZodOptional<z.ZodBoolean>;
    recent: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const EventsInputShape: {
    hostFilter: z.ZodOptional<z.ZodString>;
    eventType: z.ZodOptional<z.ZodEnum<["trigger", "discovery", "autoregistration", "internal"]>>;
    timeFrom: z.ZodOptional<z.ZodString>;
    timeTill: z.ZodOptional<z.ZodString>;
    acknowledged: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export declare const TriggersInputShape: {
    hostFilter: z.ZodOptional<z.ZodString>;
    statusFilter: z.ZodOptional<z.ZodEnum<["enabled", "disabled"]>>;
    severityFilter: z.ZodOptional<z.ZodEnum<["not_classified", "information", "warning", "average", "high", "disaster"]>>;
    activeOnly: z.ZodOptional<z.ZodBoolean>;
    templated: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodEnum<["json", "markdown"]>>;
    baseUrl: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
};
export interface ZabbixClientConfig {
    baseUrl: string;
    username: string;
    password: string;
}
export interface JsonRpcRequest<T> {
    jsonrpc: '2.0';
    method: string;
    params: T;
    id: number;
    auth?: string;
}
export interface JsonRpcError {
    code: number;
    message: string;
}
export interface JsonRpcResponse<T> {
    result?: T;
    error?: JsonRpcError;
}
//# sourceMappingURL=types.d.ts.map