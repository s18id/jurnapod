export = properLockfile;

declare function properLockfile(file: string, options?: LockOptions): Promise<ReleaseLock>;

declare namespace properLockfile {
  function lock(file: string, options?: LockOptions): Promise<ReleaseLock>;
  function unlock(file: string, options?: object): Promise<void>;
  function check(file: string, options?: { stale?: number }): Promise<boolean>;
}

interface LockOptions {
  retries?: {
    retries?: number;
    minTimeout?: number;
    maxTimeout?: number;
  };
  stale?: number;
  updateLockFile?: number;
  lockfilePath?: string;
}

interface ReleaseLock {
  (): Promise<void>;
}