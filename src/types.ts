export interface SSHConfig {
  host: string;
  username: string;
  port?: number;
  password?: string;
  privateKey?: string;
}

export interface DeployConfig {
  ssh: SSHConfig;
  remotePath: string;
  keepReleases?: number;
  sharedFiles?: string[];
  sharedDirs?: string[];
}

export interface ArchiveOptions {
  sourceDir: string;
  outputPath: string;
  excludes?: string[];
}

