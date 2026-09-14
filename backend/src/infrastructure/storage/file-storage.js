import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

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
  constructor({ rootPath }) {
    super();
    this.rootPath = rootPath;
  }

  async putObject({ key, body, contentType }) {
    const fullPath = path.join(this.rootPath, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body);
    return { key, contentType, driver: 'local_dev' };
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
}

export function createFileStorage({ config, backendRoot }) {
  const driver = config.storage.driver;

  if (driver === 'local_dev') {
    return new LocalDevFileStorage({
      rootPath: path.resolve(backendRoot, config.storage.localPath),
    });
  }

  return new UnconfiguredObjectStorage(driver);
}
