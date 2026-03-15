import { execFile } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';
import { promisify } from 'node:util';

import { buildErrorResponse, buildTextResponse, type ToolResponse } from './shared';
import type {
  ArpInput,
  CommandExecutionResult,
  IfconfigInput,
  NetstatInput,
  NslookupInput,
  PingInput,
  ResponseFormat,
  RouteInput,
  TcpConnectInput,
  TcpConnectResult,
  WhoisInput,
  WgetInput,
  WgetResult,
} from './types';

const execFileAsync = promisify(execFile);

function sanitizeHost(host: string): string {
  const sanitized = host.replace(/[^\w.\-:]/g, '');
  if (!sanitized) {
    throw new Error('Invalid host');
  }
  return sanitized;
}

function sanitizeUrl(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }
  return url;
}

async function executeCommand(command: string, args: string[]): Promise<CommandExecutionResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 300_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? execError.message,
      exitCode: typeof execError.code === 'number' ? execError.code : 1,
    };
  }
}

function buildPingCommand(input: PingInput): { command: string; args: string[] } {
  const host = sanitizeHost(input.host);
  if (process.platform === 'win32') {
    const args = ['-n', String(input.count), '-w', String(input.timeout * 1000)];
    if (input.size) {
      args.push('-l', String(input.size));
    }
    args.push(host);
    return { command: 'ping', args };
  }

  const args = ['-c', String(input.count), '-W', String(input.timeout)];
  if (input.size) {
    args.push('-s', String(input.size));
  }
  args.push(host);
  return { command: 'ping', args };
}

function buildNetstatCommand(input: NetstatInput): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    const args = ['-a'];
    if (input.numeric) args.push('-n');
    if (input.protocol === 'tcp') args.push('-p', 'tcp');
    if (input.protocol === 'udp') args.push('-p', 'udp');
    return { command: 'netstat', args };
  }

  const args: string[] = [];
  if (input.listening) args.push('-l'); else args.push('-a');
  if (input.numeric) args.push('-n');
  if (input.programs) args.push('-p');
  if (input.protocol === 'tcp') args.push('-t');
  if (input.protocol === 'udp') args.push('-u');
  return { command: 'netstat', args };
}

function buildRouteCommand(input: RouteInput): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    if (input.destination) {
      return { command: 'tracert', args: ['-d', sanitizeHost(input.destination)] };
    }
    return { command: 'route', args: ['PRINT'] };
  }

  if (input.destination) {
    return { command: 'route', args: ['get', sanitizeHost(input.destination)] };
  }

  return { command: 'route', args: input.numeric ? ['-n'] : [] };
}

function buildIfconfigCommand(input: IfconfigInput): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'ipconfig', args: input.all ? ['/all'] : [] };
  }

  if (input.interface) {
    return { command: 'ifconfig', args: [input.interface] };
  }

  return { command: 'ifconfig', args: input.all ? ['-a'] : [] };
}

function buildArpCommand(input: ArpInput): { command: string; args: string[] } {
  const args: string[] = [];
  if (input.numeric && process.platform !== 'win32') {
    args.push('-n');
  }
  if (input.host) {
    args.push(process.platform === 'win32' ? '-a' : '-a', sanitizeHost(input.host));
  } else {
    args.push('-a');
  }
  return { command: 'arp', args };
}

function renderCodeBlock(title: string, output: string): string {
  return '## ' + title + '\n\n```text\n' + output + '\n```';
}

async function executePing(input: PingInput): Promise<ToolResponse> {
  const command = buildPingCommand(input);
  const result = await executeCommand(command.command, command.args);
  const output = (result.stdout || result.stderr).trim();
  if (result.exitCode !== 0) {
    return buildErrorResponse(output || `Ping failed for ${input.host}`);
  }
  return buildTextResponse({ host: input.host, raw_output: output }, renderCodeBlock(`Ping: ${input.host}`, output), input.response_format);
}

async function executeWget(input: WgetInput): Promise<ToolResponse> {
  const response = await fetch(sanitizeUrl(input.url), {
    redirect: 'follow',
    headers: input.user_agent ? { 'user-agent': input.user_agent } : undefined,
    signal: AbortSignal.timeout(input.timeout * 1000),
  });

  const body = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const data: WgetResult = {
    url: input.url,
    status: response.status,
    ok: response.ok,
    headers,
    body,
  };

  return buildTextResponse(data, renderCodeBlock(`HTTP Fetch: ${input.url}`, body), input.response_format);
}

async function executeNslookup(input: NslookupInput): Promise<ToolResponse> {
  const host = sanitizeHost(input.host);
  const resolver = input.server ? new dns.Resolver() : null;
  if (resolver && input.server) {
    resolver.setServers([sanitizeHost(input.server)]);
  }

  let answers: string[];
  switch (input.type) {
    case 'AAAA':
      answers = (resolver ? await resolver.resolve6(host) : await dns.resolve6(host)).map(String);
      break;
    case 'MX':
      answers = (resolver ? await resolver.resolveMx(host) : await dns.resolveMx(host)).map((entry) => `${entry.exchange} ${entry.priority}`);
      break;
    case 'NS':
      answers = (resolver ? await resolver.resolveNs(host) : await dns.resolveNs(host)).map(String);
      break;
    case 'TXT':
      answers = (resolver ? await resolver.resolveTxt(host) : await dns.resolveTxt(host)).map((entry) => entry.join(''));
      break;
    case 'CNAME':
      answers = (resolver ? await resolver.resolveCname(host) : await dns.resolveCname(host)).map(String);
      break;
    case 'PTR':
      answers = (resolver ? await resolver.reverse(host) : await dns.reverse(host)).map(String);
      break;
    case 'SOA': {
      const soa = resolver ? await resolver.resolveSoa(host) : await dns.resolveSoa(host);
      answers = [JSON.stringify(soa, null, 2)];
      break;
    }
    case 'A':
    default:
      answers = (resolver ? await resolver.resolve4(host) : await dns.resolve4(host)).map(String);
      break;
  }

  const data = { host, type: input.type, answers, server: input.server };
  return buildTextResponse(data, `## DNS Lookup: ${host} (${input.type})\n${answers.map((answer) => `- ${answer}`).join('\n')}`, input.response_format);
}

async function executeTcpConnect(input: TcpConnectInput): Promise<ToolResponse> {
  const host = sanitizeHost(input.host);
  const result = await new Promise<TcpConnectResult>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ host, port: input.port, timeout: input.timeout, reachable, message });
    };

    socket.setTimeout(input.timeout * 1000);
    socket.once('connect', () => finish(true, 'Connection established'));
    socket.once('timeout', () => finish(false, 'Connection timed out'));
    socket.once('error', (error) => finish(false, error.message));
    socket.connect(input.port, host);
  });

  return buildTextResponse(result, `## TCP Test: ${host}:${input.port}\n- Reachable: ${result.reachable}\n- Message: ${result.message}`, input.response_format);
}

async function executeCommandTool(
  title: string,
  format: ResponseFormat,
  command: string,
  args: string[],
  structuredData: Record<string, unknown>,
): Promise<ToolResponse> {
  const result = await executeCommand(command, args);
  const output = (result.stdout || result.stderr).trim();
  if (result.exitCode !== 0) {
    return buildErrorResponse(output || `${title} failed`);
  }
  return buildTextResponse({ ...structuredData, raw_output: output }, renderCodeBlock(title, output), format);
}

async function executeWhois(input: WhoisInput): Promise<ToolResponse> {
  const query = sanitizeHost(input.query);
  if (input.server) {
    return executeCommandTool('WHOIS Lookup', input.response_format, 'whois', ['-h', sanitizeHost(input.server), query], { query });
  }

  if (process.platform !== 'win32') {
    return executeCommandTool('WHOIS Lookup', input.response_format, 'whois', [query], { query });
  }

  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(query);
  const rdapUrl = isIp ? `https://rdap.org/ip/${query}` : `https://rdap.org/domain/${query}`;
  const response = await fetch(rdapUrl, { signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  return buildTextResponse({ query, raw_output: body }, renderCodeBlock(`WHOIS: ${query}`, body), input.response_format);
}

export const toolExecutors = {
  ping: executePing,
  wget: executeWget,
  nslookup: executeNslookup,
  netstat: (input: NetstatInput) => {
    const command = buildNetstatCommand(input);
    return executeCommandTool('Network Connections', input.response_format, command.command, command.args, { protocol: input.protocol });
  },
  tcp_connect: executeTcpConnect,
  route: (input: RouteInput) => {
    const command = buildRouteCommand(input);
    return executeCommandTool('Routing Table', input.response_format, command.command, command.args, { destination: input.destination });
  },
  ifconfig: (input: IfconfigInput) => {
    const command = buildIfconfigCommand(input);
    return executeCommandTool('Network Interfaces', input.response_format, command.command, command.args, { interface: input.interface });
  },
  arp: (input: ArpInput) => {
    const command = buildArpCommand(input);
    return executeCommandTool('ARP Table', input.response_format, command.command, command.args, { host: input.host });
  },
  whois: executeWhois,
};