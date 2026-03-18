import type { ManagedTransports } from '../transports/core/transport-manager';

let managedTransports: ManagedTransports | null = null;

export function setManagedTransports(transports: ManagedTransports | null): void {
  managedTransports = transports;
}

export function getManagedTransports(): ManagedTransports | null {
  return managedTransports;
}

export function clearManagedTransports(): void {
  managedTransports = null;
}