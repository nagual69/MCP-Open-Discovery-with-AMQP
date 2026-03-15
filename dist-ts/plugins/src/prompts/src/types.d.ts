import { z } from 'zod';
export type PromptMessage = {
    role: 'user';
    content: {
        type: 'text';
        text: string;
    };
};
export type PromptResult = {
    description: string;
    messages: PromptMessage[];
};
export type PromptRegistration = {
    name: string;
    description: string;
    inputSchema: z.ZodRawShape;
    handler: (args: Record<string, unknown>) => Promise<PromptResult>;
};
export declare const CmdbPromptInputShape: {
    deviceType: z.ZodOptional<z.ZodString>;
    discoveredData: z.ZodOptional<z.ZodString>;
};
export declare const NetworkTopologyPromptInputShape: {
    topologyData: z.ZodOptional<z.ZodString>;
    networkSegment: z.ZodOptional<z.ZodString>;
};
export declare const SecurityAssessmentPromptInputShape: {
    scanResults: z.ZodOptional<z.ZodString>;
    assetType: z.ZodOptional<z.ZodString>;
};
export declare const CapacityPlanningPromptInputShape: {
    utilizationData: z.ZodOptional<z.ZodString>;
    timeframe: z.ZodOptional<z.ZodString>;
};
export declare const IncidentResponsePromptInputShape: {
    alertData: z.ZodOptional<z.ZodString>;
    severity: z.ZodOptional<z.ZodString>;
};
export type CmdbPromptArgs = z.infer<z.ZodObject<typeof CmdbPromptInputShape>>;
export type NetworkTopologyPromptArgs = z.infer<z.ZodObject<typeof NetworkTopologyPromptInputShape>>;
export type SecurityAssessmentPromptArgs = z.infer<z.ZodObject<typeof SecurityAssessmentPromptInputShape>>;
export type CapacityPlanningPromptArgs = z.infer<z.ZodObject<typeof CapacityPlanningPromptInputShape>>;
export type IncidentResponsePromptArgs = z.infer<z.ZodObject<typeof IncidentResponsePromptInputShape>>;
//# sourceMappingURL=types.d.ts.map