import type { SnmpResponseItem, SnmpSessionOptions } from './types';
export declare function createSnmpSession(host: string, options?: Partial<SnmpSessionOptions>): {
    sessionId: string;
};
export declare function closeSnmpSession(sessionId: string): boolean;
export declare function snmpGet(sessionId: string, oids: string[]): Promise<SnmpResponseItem[]>;
export declare function snmpGetNext(sessionId: string, oids: string[]): Promise<SnmpResponseItem[]>;
export declare function snmpWalk(sessionId: string, oid: string): Promise<SnmpResponseItem[]>;
export declare function snmpTable(sessionId: string, oid: string): Promise<{
    table: string[];
}>;
export declare function snmpDiscover(targetRange: string, options?: Partial<SnmpSessionOptions>): Promise<Array<Record<string, string>>>;
export declare function snmpDeviceInventory(host: string, options?: Partial<SnmpSessionOptions>): Promise<Record<string, unknown>>;
export declare function snmpInterfaceDiscovery(host: string, options?: Partial<SnmpSessionOptions>): Promise<Record<string, unknown>>;
export declare function snmpSystemHealthCheck(host: string, options?: Partial<SnmpSessionOptions>): Promise<Record<string, unknown>>;
export declare function snmpServiceDiscovery(host: string, options?: Partial<SnmpSessionOptions>): Promise<Record<string, unknown>>;
export declare function snmpNetworkTopologyMapper(networkRange: string, options?: Partial<SnmpSessionOptions>): Promise<Record<string, unknown>>;
//# sourceMappingURL=tools.d.ts.map