import { type ToolResponse } from './shared';
import type { ArpInput, IfconfigInput, NetstatInput, NslookupInput, PingInput, RouteInput, TcpConnectInput, WhoisInput, WgetInput } from './types';
declare function executePing(input: PingInput): Promise<ToolResponse>;
declare function executeWget(input: WgetInput): Promise<ToolResponse>;
declare function executeNslookup(input: NslookupInput): Promise<ToolResponse>;
declare function executeTcpConnect(input: TcpConnectInput): Promise<ToolResponse>;
declare function executeWhois(input: WhoisInput): Promise<ToolResponse>;
export declare const toolExecutors: {
    ping: typeof executePing;
    wget: typeof executeWget;
    nslookup: typeof executeNslookup;
    netstat: (input: NetstatInput) => Promise<ToolResponse<unknown>>;
    tcp_connect: typeof executeTcpConnect;
    route: (input: RouteInput) => Promise<ToolResponse<unknown>>;
    ifconfig: (input: IfconfigInput) => Promise<ToolResponse<unknown>>;
    arp: (input: ArpInput) => Promise<ToolResponse<unknown>>;
    whois: typeof executeWhois;
};
export {};
//# sourceMappingURL=tools.d.ts.map