import type { CommandExecutionResult } from './types';
export declare function runPingScan(target: string): Promise<CommandExecutionResult>;
export declare function runTcpSynScan(args: {
    target: string;
    ports?: string;
    fast_scan?: boolean;
    timing_template?: number;
    reason?: boolean;
    open_only?: boolean;
}): Promise<CommandExecutionResult>;
export declare function runTcpConnectScan(args: {
    target: string;
    ports?: string;
    timing_template?: number;
    reason?: boolean;
    open_only?: boolean;
}): Promise<CommandExecutionResult>;
export declare function runUdpScan(args: {
    target: string;
    ports?: string;
    top_ports?: number;
    timing_template?: number;
    reason?: boolean;
    open_only?: boolean;
}): Promise<CommandExecutionResult>;
export declare function runVersionScan(args: {
    target: string;
    ports?: string;
    intensity?: number;
    light_mode?: boolean;
    all_ports?: boolean;
    timing_template?: number;
    reason?: boolean;
    open_only?: boolean;
}): Promise<CommandExecutionResult>;
//# sourceMappingURL=tools.d.ts.map