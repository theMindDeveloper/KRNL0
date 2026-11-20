// What Settings › Sync and `krnl sync` see of the sync service (main only).

import type { SyncStatus } from './types';
import type { ServerUpdate, ServerUpdateResult } from './serverUpdate';

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
  /** The server's update state (server-updates F1); null when not connected or unknown. */
  serverUpdate(check?: boolean): Promise<ServerUpdate | null>;
  /** One click: the owner's password every time (F2, F7). */
  startServerUpdate(password: string, code?: string): Promise<ServerUpdateResult>;
  /** Update by itself at night (F6). */
  setServerAuto(on: boolean, password: string, code?: string): Promise<ServerUpdateResult>;
}
