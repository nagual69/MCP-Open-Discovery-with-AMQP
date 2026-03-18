"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPingScan = runPingScan;
exports.runTcpSynScan = runTcpSynScan;
exports.runTcpConnectScan = runTcpConnectScan;
exports.runUdpScan = runUdpScan;
exports.runVersionScan = runVersionScan;
const node_child_process_1 = require("node:child_process");
function sanitizeHost(host) {
    if (!host || typeof host !== 'string') {
        throw new Error('Invalid host: Must be a non-empty string');
    }
    const sanitized = host.replace(/[^\w.\-:/]/g, '');
    if (!sanitized) {
        throw new Error('Invalid host: Sanitization resulted in an empty string');
    }
    return sanitized;
}
async function executeCommand(commandArray) {
    return new Promise((resolve, reject) => {
        const [command, ...args] = commandArray;
        if (!command) {
            reject(new Error('No command provided'));
            return;
        }
        const child = (0, node_child_process_1.spawn)(command, args, { stdio: 'pipe' });
        let output = '';
        let errorOutput = '';
        const timeout = setTimeout(() => {
            try {
                child.kill();
            }
            catch {
            }
            reject(new Error('Nmap scan timed out after 600 seconds'));
        }, 600000);
        child.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            errorOutput += chunk.toString();
        });
        child.on('close', (code) => {
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
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`Nmap error: ${error.message}`));
        });
    });
}
async function runPingScan(target) {
    return executeCommand(['nmap', '-sn', sanitizeHost(target)]);
}
async function runTcpSynScan(args) {
    const command = ['nmap', '-sS', '--privileged'];
    if (args.ports)
        command.push('-p', args.ports);
    if (args.fast_scan)
        command.push('-F');
    if (args.timing_template !== undefined)
        command.push(`-T${args.timing_template}`);
    if (args.reason)
        command.push('--reason');
    if (args.open_only)
        command.push('--open');
    command.push(sanitizeHost(args.target));
    return executeCommand(command);
}
async function runTcpConnectScan(args) {
    const command = ['nmap', '-sT'];
    if (args.ports)
        command.push('-p', args.ports);
    if (args.timing_template !== undefined)
        command.push(`-T${args.timing_template}`);
    if (args.reason)
        command.push('--reason');
    if (args.open_only)
        command.push('--open');
    command.push(sanitizeHost(args.target));
    return executeCommand(command);
}
async function runUdpScan(args) {
    const command = ['nmap', '-sU', '--privileged'];
    if (args.ports)
        command.push('-p', args.ports);
    else if (args.top_ports)
        command.push('--top-ports', String(args.top_ports));
    if (args.timing_template !== undefined)
        command.push(`-T${args.timing_template}`);
    if (args.reason)
        command.push('--reason');
    if (args.open_only)
        command.push('--open');
    command.push(sanitizeHost(args.target));
    return executeCommand(command);
}
async function runVersionScan(args) {
    const command = ['nmap', '-sV'];
    if (args.ports)
        command.push('-p', args.ports);
    if (args.light_mode)
        command.push('--version-light');
    else if (args.all_ports)
        command.push('--version-all');
    else if (args.intensity !== undefined)
        command.push('--version-intensity', String(args.intensity));
    if (args.timing_template !== undefined)
        command.push(`-T${args.timing_template}`);
    if (args.reason)
        command.push('--reason');
    if (args.open_only)
        command.push('--open');
    command.push(sanitizeHost(args.target));
    return executeCommand(command);
}
//# sourceMappingURL=tools.js.map