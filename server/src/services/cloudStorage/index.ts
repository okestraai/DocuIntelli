import { CloudStorageProvider } from './types';
import { GoogleDriveProvider } from './googleDriveProvider';
import { DropboxProvider } from './dropboxProvider';

const providers: Record<string, CloudStorageProvider> = {
  google_drive: new GoogleDriveProvider(),
  dropbox: new DropboxProvider(),
};

export function getProvider(name: string): CloudStorageProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown cloud storage provider: ${name}`);
  return provider;
}

export function getSupportedProviders(): string[] {
  return Object.keys(providers);
}

export * from './types';
export * from './tokenManager';
