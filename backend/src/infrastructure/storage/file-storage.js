import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

/**
 * Persistent files go through this interface.
 * local_dev writes under a gitignored path and is not the production store.
 */
export class FileStorage {
  async putObject(_input) {
    throw new Error('FileStorage.putObject must be implemented');
  }

  async getObject(_key) {
    throw new Error('FileStorage.getObject must be implemented');
  }
}

export class LocalDevFileStorage extends FileStorage {
  constructor({ rootPath, driver = 'local_dev' }) {
    super();
    this.rootPath = rootPath;
    this.driver = driver;
  }

  async putObject({ key, body, contentType }) {
    const fullPath = path.join(this.rootPath, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body);
    return { key, contentType, driver: this.driver };
  }

  async getObject(key) {
    const fullPath = path.join(this.rootPath, key);
    const body = await readFile(fullPath);
    return { key, body, driver: this.driver };
  }
}

export class UnconfiguredObjectStorage extends FileStorage {
  constructor(driver) {
    super();
    this.driver = driver;
  }

  async putObject() {
    throw new Error(`Object storage driver "${this.driver}" is not configured`);
  }

  async getObject() {
    throw new Error(`Object storage driver "${this.driver}" is not configured`);
  }
}

export function createFileStorage({ config, backendRoot }) {
  const driver = config.storage.driver;

  if (driver === 'local_dev') {
    return new LocalDevFileStorage({
      rootPath: path.resolve(backendRoot, config.storage.localPath),
    });
  }

  // local_disk: files on a persistent volume (e.g. a Render disk) mounted at FILE_STORAGE_LOCAL_PATH.
  // Single-instance only: the volume is attached to one service and is not shared with the worker.
  if (driver === 'local_disk') {
    return new LocalDevFileStorage({
      rootPath: path.resolve(backendRoot, config.storage.localPath),
      driver: 'local_disk',
    });
  }

  return new UnconfiguredObjectStorage(driver);
}
