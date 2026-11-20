// What Settings › Sync and `krnl sync` see of the sync service (main only).

import type { SyncStatus } from './types';

export interface SyncInfo extends SyncStatus {
  configured: boolean;
  origin: string | null;
  fingerprint: string | null;
  deviceName: string | null;
}

export interface SyncDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: number;
  current: boolean;
}

export interface SyncPort {
  /** The devices paired with the server (the server's list). */
  devices(): Promise<SyncDevice[]>;
  info(): SyncInfo;
  begin(address: string): Promise<{ origin: string; fingerprint: string | null; serverVersion: string; encryption: string }>;
  finish(password: string, code?: string): Promise<SyncInfo>;
  disconnect(): Promise<SyncInfo>;
  retry(): Promise<SyncInfo>;
}
