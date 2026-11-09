import { NodeSSH } from "node-ssh";
import { logger } from "./logger.js";
import { SSHConfig } from "./types.js";

export class SSHClient {
  private client: NodeSSH;

  constructor() {
    this.client = new NodeSSH();
  }

  async connect(config: SSHConfig): Promise<void> {
    logger.info(`Connecting to ${config.username}@${config.host}:${config.port || 22}`);

    await this.client.connect({
      host: config.host,
      username: config.username,
      port: config.port || 22,
      password: config.password,
      privateKey: config.privateKey,
    });

    logger.success("SSH connection established");
  }

  async execute(command: string): Promise<string> {
    const result = await this.client.execCommand(command);

    if (result.code !== 0) {
      throw new Error(`Command failed with exit code ${result.code}: ${command}\n${result.stderr}`);
    }

    return result.stdout.trim();
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    logger.info(`Uploading archive to ${remotePath}`);
    await this.client.putFile(localPath, remotePath);
  }

  disconnect(): void {
    this.client.dispose();
  }
}
