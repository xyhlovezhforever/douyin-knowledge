import { mkdir, open, readFile, stat, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

export type ProcessLock = {
  release(): Promise<void>;
};

export async function acquireProcessLock(lockPath: string): Promise<ProcessLock | null> {
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle: FileHandle | undefined;
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      return {
        async release() {
          await handle?.close().catch(() => undefined);
          await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        },
      };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await lockOwnerIsAlive(lockPath)) return null;
      await unlink(lockPath).catch((unlinkError: NodeJS.ErrnoException) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
    }
  }

  return null;
}

export async function processLockIsActive(lockPath: string): Promise<boolean> {
  return lockOwnerIsAlive(lockPath);
}

async function lockOwnerIsAlive(lockPath: string): Promise<boolean> {
  try {
    const owner = JSON.parse(await readFile(lockPath, 'utf8')) as { pid?: unknown };
    if (typeof owner.pid !== 'number' || !Number.isInteger(owner.pid) || owner.pid <= 0) return false;
    try {
      process.kill(owner.pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false;
    try {
      return Date.now() - (await stat(lockPath)).mtimeMs < 30_000;
    } catch {
      return false;
    }
  }
}
