import { NodeSSH } from "node-ssh";
import { logger } from "./logger.js";
export class SSHClient {
    client;
    constructor() {
        this.client = new NodeSSH();
    }
    async connect(config) {
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
    async execute(command) {
        const result = await this.client.execCommand(command);
        if (result.code !== 0) {
            throw new Error(`Command failed with exit code ${result.code}: ${command}\n${result.stderr}`);
        }
        return result.stdout.trim();
    }
    async uploadFile(localPath, remotePath) {
        logger.info(`Uploading archive to ${remotePath}`);
        await this.client.putFile(localPath, remotePath);
    }
    disconnect() {
        this.client.dispose();
    }
}
//# sourceMappingURL=ssh.js.map