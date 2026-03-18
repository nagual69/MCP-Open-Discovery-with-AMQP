import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type { CommandExecutionResult } from './types';

function sanitizeHost(host: string): string {
  if (!host || typeof host !== 'string') {
    throw new Error('Invalid host: Must be a non-empty string');
  }

  const sanitized = host.replace(/[^\w.\-:/]/g, '');
  if (!sanitized) {
    throw new Error('Invalid host: Sanitization resulted in an empty string');
  }

  return sanitized;
}

async function executeCommand(commandArray: string[]): Promise<CommandExecutionResult> {
  return new Promise((resolve, reject) => {
    const [command, ...args] = commandArray;
    if (!command) {
      reject(new Error('No command provided'));
      return;
    }

    const child = spawn(command, args, { stdio: 'pipe' }) as ChildProcessWithoutNullStreams;
    let output = '';
    let errorOutput = '';

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
      reject(new Error('Nmap scan timed out after 600 seconds'));
    }, 600000);

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Nmap scan failed with code ${code}${errorOutput ? `: ${errorOutput}` : ''}`));
        return;
      }

      resolve({
        command: commandArray,
        output: output || 'Nmap scan completed (no output)',
      });
    });

    child.on('error', (error: Error) => {
      clearTimeout(timeout);
      reject(new Error(`Nmap error: ${error.message}`));
    });
  });
}

export async function runPingScan(target: string): Promise<CommandExecutionResult> {
  return executeCommand(['nmap', '-sn', sanitizeHost(target)]);
}

export async function runTcpSynScan(args: {
  target: string;
  ports?: string;
  fast_scan?: boolean;
  timing_template?: number;
  reason?: boolean;
  open_only?: boolean;
}): Promise<CommandExecutionResult> {
  const command = ['nmap', '-sS', '--privileged'];
  if (args.ports) command.push('-p', args.ports);
  if (args.fast_scan) command.push('-F');
  if (args.timing_template !== undefined) command.push(`-T${args.timing_template}`);
  if (args.reason) command.push('--reason');
  if (args.open_only) command.push('--open');
  command.push(sanitizeHost(args.target));
  return executeCommand(command);
}

export async function runTcpConnectScan(args: {
  target: string;
  ports?: string;
  timing_template?: number;
  reason?: boolean;
  open_only?: boolean;
}): Promise<CommandExecutionResult> {
  const command = ['nmap', '-sT'];
  if (args.ports) command.push('-p', args.ports);
  if (args.timing_template !== undefined) command.push(`-T${args.timing_template}`);
  if (args.reason) command.push('--reason');
  if (args.open_only) command.push('--open');
  command.push(sanitizeHost(args.target));
  return executeCommand(command);
}

export async function runUdpScan(args: {
  target: string;
  ports?: string;
  top_ports?: number;
  timing_template?: number;
  reason?: boolean;
  open_only?: boolean;
}): Promise<CommandExecutionResult> {
  const command = ['nmap', '-sU', '--privileged'];
  if (args.ports) command.push('-p', args.ports);
  else if (args.top_ports) command.push('--top-ports', String(args.top_ports));
  if (args.timing_template !== undefined) command.push(`-T${args.timing_template}`);
  if (args.reason) command.push('--reason');
  if (args.open_only) command.push('--open');
  command.push(sanitizeHost(args.target));
  return executeCommand(command);
}

export async function runVersionScan(args: {
  target: string;
  ports?: string;
  intensity?: number;
  light_mode?: boolean;
  all_ports?: boolean;
  timing_template?: number;
  reason?: boolean;
  open_only?: boolean;
}): Promise<CommandExecutionResult> {
  const command = ['nmap', '-sV'];
  if (args.ports) command.push('-p', args.ports);
  if (args.light_mode) command.push('--version-light');
  else if (args.all_ports) command.push('--version-all');
  else if (args.intensity !== undefined) command.push('--version-intensity', String(args.intensity));
  if (args.timing_template !== undefined) command.push(`-T${args.timing_template}`);
  if (args.reason) command.push('--reason');
  if (args.open_only) command.push('--open');
  command.push(sanitizeHost(args.target));
  return executeCommand(command);
}