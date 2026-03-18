import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

import type { CommandExecutionResult, InterfaceDetails, SnmpResponseItem, SnmpSessionOptions, SnmpSessionRecord } from './types';

const snmpSessions = new Map<string, SnmpSessionRecord>();

function isRunningInContainer(): boolean {
  try {
    return fs.existsSync('/.dockerenv') || (fs.existsSync('/proc/1/cgroup') && fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));
  } catch {
    return false;
  }
}

const IN_CONTAINER = isRunningInContainer();

function intToIp(value: number): string {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join('.');
}

function toSessionOptions(options: Partial<SnmpSessionOptions>): SnmpSessionOptions {
  const sessionOptions: SnmpSessionOptions = {
    host: options.host ?? '',
    community: options.community ?? 'public',
    version: options.version ?? '2c',
    port: options.port ?? 161,
    timeout: options.timeout ?? 5000,
    retries: options.retries ?? 1,
  };

  if (options.user) {
    sessionOptions.user = options.user;
  }
  if (options.authProtocol) {
    sessionOptions.authProtocol = options.authProtocol;
  }
  if (options.authKey) {
    sessionOptions.authKey = options.authKey;
  }
  if (options.privProtocol) {
    sessionOptions.privProtocol = options.privProtocol;
  }
  if (options.privKey) {
    sessionOptions.privKey = options.privKey;
  }

  return sessionOptions;
}

async function executeSnmpCommand(command: string, args: string[], timeout = 5000): Promise<CommandExecutionResult> {
  return new Promise((resolve, reject) => {
    const processCommand = IN_CONTAINER ? command : 'docker';
    const processArgs = IN_CONTAINER ? args : ['exec', 'mcp-open-discovery', command, ...args];
    const child = spawn(processCommand, processArgs, {
      stdio: 'pipe',
      timeout,
    }) as ChildProcessWithoutNullStreams;

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ output: stdout.trim() });
        return;
      }

      reject(new Error(`Command failed with code ${code ?? 'unknown'}: ${stderr || stdout}`));
    });
    child.on('error', (error: Error) => {
      reject(new Error(`Process error: ${error.message}`));
    });
  });
}

function parseSnmpResponse(output: string): SnmpResponseItem[] {
  const results: SnmpResponseItem[] = [];
  for (const line of output.split('\n').filter((value) => value.trim())) {
    const match = line.match(/^(.+?)\s*=\s*(.+?):\s*(.+)$/);
    if (match) {
      results.push({
        oid: match[1]?.trim() ?? '',
        type: match[2]?.trim() ?? 'STRING',
        value: match[3]?.trim() ?? '',
      });
      continue;
    }

    if (line.includes('=')) {
      const [oid, rest] = line.split('=', 2);
      if (!oid) {
        continue;
      }
      results.push({
        oid: oid.trim(),
        type: 'STRING',
        value: rest?.trim() ?? '',
      });
    }
  }
  return results;
}

function getSession(sessionId: string): SnmpSessionRecord {
  const session = snmpSessions.get(sessionId);
  if (!session) {
    throw new Error(`SNMP session ${sessionId} not found`);
  }
  session.lastUsed = Date.now();
  return session;
}

function buildSnmpArgs(session: SnmpSessionRecord): string[] {
  const args = [
    '-v',
    session.options.version,
    '-c',
    session.options.community,
    '-t',
    Math.floor(session.options.timeout / 1000).toString(),
    '-r',
    session.options.retries.toString(),
  ];

  if (session.options.version === '3') {
    if (session.options.user) {
      args.push('-u', session.options.user);
    }
    if (session.options.authProtocol) {
      args.push('-a', session.options.authProtocol.toUpperCase());
    }
    if (session.options.authKey) {
      args.push('-A', session.options.authKey);
    }
    if (session.options.privProtocol) {
      args.push('-x', session.options.privProtocol.toUpperCase());
    }
    if (session.options.privKey) {
      args.push('-X', session.options.privKey);
    }
  }

  args.push(`${session.options.host}:${session.options.port}`);
  return args;
}

export function createSnmpSession(host: string, options: Partial<SnmpSessionOptions> = {}): { sessionId: string } {
  const sessionId = crypto.randomUUID();
  const sessionOptions = toSessionOptions(options);
  sessionOptions.host = host;
  snmpSessions.set(sessionId, {
    options: sessionOptions,
    lastUsed: Date.now(),
  });
  return { sessionId };
}

export function closeSnmpSession(sessionId: string): boolean {
  return snmpSessions.delete(sessionId);
}

export async function snmpGet(sessionId: string, oids: string[]): Promise<SnmpResponseItem[]> {
  const session = getSession(sessionId);
  const output = await executeSnmpCommand('snmpget', [...buildSnmpArgs(session), ...oids], session.options.timeout + 1000);
  return parseSnmpResponse(output.output);
}

export async function snmpGetNext(sessionId: string, oids: string[]): Promise<SnmpResponseItem[]> {
  const session = getSession(sessionId);
  const output = await executeSnmpCommand('snmpgetnext', [...buildSnmpArgs(session), ...oids], session.options.timeout + 1000);
  return parseSnmpResponse(output.output);
}

export async function snmpWalk(sessionId: string, oid: string): Promise<SnmpResponseItem[]> {
  const session = getSession(sessionId);
  const output = await executeSnmpCommand('snmpwalk', [...buildSnmpArgs(session), oid], session.options.timeout + 1000);
  return parseSnmpResponse(output.output);
}

export async function snmpTable(sessionId: string, oid: string): Promise<{ table: string[] }> {
  const session = getSession(sessionId);
  const output = await executeSnmpCommand('snmptable', [...buildSnmpArgs(session), oid], session.options.timeout + 1000);
  return { table: output.output.split('\n').filter((value) => value.trim()) };
}

export async function snmpDiscover(targetRange: string, options: Partial<SnmpSessionOptions> = {}): Promise<Array<Record<string, string>>> {
  const [baseIp, cidrValue] = targetRange.split('/');
  if (!baseIp || !cidrValue) {
    throw new Error('Invalid target range format. Expected: x.x.x.x/y');
  }

  const cidr = Number.parseInt(cidrValue, 10);
  if (Number.isNaN(cidr) || cidr < 0 || cidr > 32) {
    throw new Error('Invalid CIDR value');
  }

  const octets = baseIp.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    throw new Error('Invalid target range IP address');
  }

  const baseAddress = (((octets[0] ?? 0) << 24) | ((octets[1] ?? 0) << 16) | ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)) >>> 0;
  const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  const networkAddress = baseAddress & mask;
  const hostCount = cidr >= 31 ? 0 : (2 ** (32 - cidr)) - 2;
  const maxHosts = Math.min(hostCount, 254);
  const results: Array<Record<string, string>> = [];

  const tasks = Array.from({ length: maxHosts }, async (_, index) => {
    const ip = intToIp((networkAddress + index + 1) >>> 0);
    const { sessionId } = createSnmpSession(ip, {
      community: options.community ?? 'public',
      version: options.version ?? '2c',
      port: options.port ?? 161,
      timeout: Math.floor((options.timeout ?? 5000) / 3),
      retries: 0,
    });

    try {
      const result = await snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']);
      results.push({
        ip,
        sysName: result[1]?.value ?? 'Unknown',
        sysDesc: result[0]?.value ?? 'Unknown',
      });
    } catch {
    } finally {
      closeSnmpSession(sessionId);
    }
  });

  await Promise.all(tasks);
  return results;
}

export async function snmpDeviceInventory(host: string, options: Partial<SnmpSessionOptions> = {}): Promise<Record<string, unknown>> {
  const { sessionId } = createSnmpSession(host, options);

  try {
    const systemInfo = await Promise.all([
      snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']),
      snmpGet(sessionId, ['1.3.6.1.2.1.1.2.0']),
      snmpGet(sessionId, ['1.3.6.1.2.1.1.3.0']),
      snmpGet(sessionId, ['1.3.6.1.2.1.1.4.0']),
      snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0']),
      snmpGet(sessionId, ['1.3.6.1.2.1.1.6.0']),
    ]);

    const inventory: Record<string, unknown> = {
      ip: host,
      system: {
        description: systemInfo[0]?.[0]?.value,
        objectID: systemInfo[1]?.[0]?.value,
        uptime: systemInfo[2]?.[0]?.value,
        contact: systemInfo[3]?.[0]?.value,
        name: systemInfo[4]?.[0]?.value,
        location: systemInfo[5]?.[0]?.value,
      },
      interfaces: {},
    };

    try {
      const interfaces = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1');
      const interfaceMap: Record<string, InterfaceDetails> = {};
      for (const item of interfaces) {
        const parts = item.oid.split('.');
        const interfaceIndex = parts[parts.length - 1];
        const interfaceMetric = parts[parts.length - 2];
        if (!interfaceIndex || !interfaceMetric) {
          continue;
        }

        const details = interfaceMap[interfaceIndex] ?? {};
        if (interfaceMetric === '2') {
          details.description = item.value;
        } else if (interfaceMetric === '3') {
          details.type = item.value;
        } else if (interfaceMetric === '5') {
          details.speed = item.value;
        } else if (interfaceMetric === '6') {
          details.physAddress = item.value;
        } else if (interfaceMetric === '7') {
          details.adminStatus = item.value;
        } else if (interfaceMetric === '8') {
          details.operStatus = item.value;
        }
        interfaceMap[interfaceIndex] = details;
      }
      inventory.interfaces = interfaceMap;
    } catch (error) {
      inventory.interfaces = { error: error instanceof Error ? error.message : 'Failed to query interfaces' };
    }

    return inventory;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to inventory device' };
  } finally {
    closeSnmpSession(sessionId);
  }
}

export async function snmpInterfaceDiscovery(host: string, options: Partial<SnmpSessionOptions> = {}): Promise<Record<string, unknown>> {
  const { sessionId } = createSnmpSession(host, options);

  try {
    const interfaceIndexes = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1.1');
    const interfaces: Array<Record<string, unknown>> = [];

    for (const interfaceIndex of interfaceIndexes) {
      const index = interfaceIndex.value;
      try {
        const [description, type, speed, mac, admin, oper] = await Promise.all([
          snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.2.${index}`]),
          snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.3.${index}`]),
          snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.5.${index}`]),
          snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.6.${index}`]),
          snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.7.${index}`]),
          snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.8.${index}`]),
        ]);
        interfaces.push({
          index,
          name: description[0]?.value,
          type: type[0]?.value,
          speed: speed[0]?.value,
          mac: mac[0]?.value,
          adminStatus: admin[0]?.value === '1' ? 'up' : 'down',
          operStatus: oper[0]?.value === '1' ? 'up' : 'down',
        });
      } catch {
      }
    }

    return { ip: host, interfaces };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to discover interfaces' };
  } finally {
    closeSnmpSession(sessionId);
  }
}

export async function snmpSystemHealthCheck(host: string, options: Partial<SnmpSessionOptions> = {}): Promise<Record<string, unknown>> {
  const { sessionId } = createSnmpSession(host, options);

  try {
    const healthData: Record<string, unknown> = {
      ip: host,
      system: {},
      interfaces: {},
    };

    try {
      const systemInfo = await Promise.all([
        snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']),
        snmpGet(sessionId, ['1.3.6.1.2.1.1.3.0']),
        snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0']),
      ]);
      healthData.system = {
        description: systemInfo[0]?.[0]?.value,
        uptime: systemInfo[1]?.[0]?.value,
        name: systemInfo[2]?.[0]?.value,
      };
    } catch (error) {
      healthData.system = { error: error instanceof Error ? error.message : 'Failed to query system health' };
    }

    try {
      const interfaceIndexes = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1.1');
      const interfaceList: Array<Record<string, unknown>> = [];
      for (const interfaceIndex of interfaceIndexes) {
        const index = interfaceIndex.value;
        try {
          const [name, status, inbound, outbound] = await Promise.all([
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.2.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.8.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.10.${index}`]),
            snmpGet(sessionId, [`1.3.6.1.2.1.2.2.1.16.${index}`]),
          ]);

          interfaceList.push({
            index,
            name: name[0]?.value,
            status: status[0]?.value === '1' ? 'up' : 'down',
            inOctets: inbound[0]?.value,
            outOctets: outbound[0]?.value,
          });
        } catch {
        }
      }
      healthData.interfaces = { list: interfaceList };
    } catch (error) {
      healthData.interfaces = { error: error instanceof Error ? error.message : 'Failed to query interface health' };
    }

    return healthData;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to query system health' };
  } finally {
    closeSnmpSession(sessionId);
  }
}

export async function snmpServiceDiscovery(host: string, options: Partial<SnmpSessionOptions> = {}): Promise<Record<string, unknown>> {
  const { sessionId } = createSnmpSession(host, options);

  try {
    const servicesData: Record<string, unknown> = {
      ip: host,
      services: [],
      tcpPorts: [],
      udpPorts: [],
    };

    try {
      const processes = await snmpWalk(sessionId, '1.3.6.1.2.1.25.4.2.1');
      const processEntries: Record<string, Record<string, string>> = {};
      for (const entry of processes) {
        const parts = entry.oid.split('.');
        const index = parts.pop();
        const type = parts.pop();
        if (!index || !type) {
          continue;
        }

        const processEntry = processEntries[index] ?? { index };
        if (type === '2') {
          processEntry.name = entry.value;
        } else if (type === '4') {
          processEntry.path = entry.value;
        } else if (type === '5') {
          processEntry.parameters = entry.value;
        } else if (type === '7') {
          processEntry.status = entry.value;
        }
        processEntries[index] = processEntry;
      }

      const statusMap: Record<string, string> = {
        '1': 'running',
        '2': 'runnable',
        '3': 'not runnable',
        '4': 'invalid',
      };

      servicesData.services = Object.values(processEntries)
        .filter((entry) => entry.name)
        .map((entry) => ({
          ...entry,
          statusText: statusMap[entry.status ?? ''] ?? 'unknown',
        }));
    } catch (error) {
      servicesData.processError = error instanceof Error ? error.message : 'Failed to discover services';
    }

    return servicesData;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to discover services' };
  } finally {
    closeSnmpSession(sessionId);
  }
}

export async function snmpNetworkTopologyMapper(networkRange: string, options: Partial<SnmpSessionOptions> = {}): Promise<Record<string, unknown>> {
  const devices = await snmpDiscover(networkRange, options);
  if (!devices.length) {
    return { error: 'No SNMP-enabled devices found in network range' };
  }

  const topology: Record<string, unknown> = {
    networkRange,
    nodes: [],
    links: [],
  };
  const nodes: Array<Record<string, unknown>> = [];

  for (const device of devices) {
    const deviceIp = device.ip;
    if (!deviceIp) {
      continue;
    }

    const { sessionId } = createSnmpSession(deviceIp, options);
    try {
      const [systemName, systemDescription, systemLocation] = await Promise.all([
        snmpGet(sessionId, ['1.3.6.1.2.1.1.5.0']),
        snmpGet(sessionId, ['1.3.6.1.2.1.1.1.0']),
        snmpGet(sessionId, ['1.3.6.1.2.1.1.6.0']),
      ]);
      const interfaceTable = await snmpWalk(sessionId, '1.3.6.1.2.1.2.2.1');
      const interfaces: Record<string, InterfaceDetails> = {};
      for (const entry of interfaceTable) {
        const parts = entry.oid.split('.');
        const interfaceIndex = parts[parts.length - 1];
        const interfaceProperty = parts[parts.length - 2];
        if (!interfaceIndex || !interfaceProperty) {
          continue;
        }

        const details = interfaces[interfaceIndex] ?? { index: interfaceIndex };
        if (interfaceProperty === '2') {
          details.name = entry.value;
        }
        if (interfaceProperty === '6') {
          details.mac = entry.value;
        }
        interfaces[interfaceIndex] = details;
      }

      nodes.push({
        ip: deviceIp,
        name: systemName[0]?.value,
        description: systemDescription[0]?.value,
        location: systemLocation[0]?.value,
        interfaces: Object.values(interfaces).filter((entry) => entry.name),
      });
    } catch {
    } finally {
      closeSnmpSession(sessionId);
    }
  }

  topology.nodes = nodes;
  return topology;
}

const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  const expiryMs = 10 * 60 * 1000;
  for (const [sessionId, session] of snmpSessions.entries()) {
    if (now - session.lastUsed > expiryMs) {
      snmpSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

sessionCleanupTimer.unref();