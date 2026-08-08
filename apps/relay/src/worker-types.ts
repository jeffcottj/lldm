export interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

export interface HibernatingWebSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface DurableObjectStateLike {
  readonly storage: DurableObjectStorageLike;
  acceptWebSocket(socket: HibernatingWebSocket): void;
  getWebSockets(): HibernatingWebSocket[];
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface AssetsBindingLike {
  fetch(request: Request): Promise<Response>;
}

export interface RelayEnvironment {
  readonly ROOMS: DurableObjectNamespaceLike;
  readonly ASSETS: AssetsBindingLike;
  readonly RELAY_CREATE_SECRET: string;
  readonly TOKEN_SIGNING_SECRET: string;
  readonly ALLOWED_ORIGINS: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

declare global {
  var WebSocketPair: {
    new (): { 0: HibernatingWebSocket; 1: HibernatingWebSocket };
  };
}
