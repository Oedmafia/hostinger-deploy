import { logger } from "./logger.js";
import { SSHClient } from "./ssh.js";
import { DeployConfig } from "./types.js";

export class Deployer {
  private ssh: SSHClient;
  private config: Required<DeployConfig>;

  constructor(config: DeployConfig) {
    this.config = {
      keepReleases: 5,
      sharedFiles: [".env"],
      sharedDirs: ["storage", "uploads"],
      ...config,
    };
    this.ssh = new SSHClient();
  }

  private get releasesPath(): string {
    return `${this.config.remotePath}/releases`;
  }

  private get sharedPath(): string {
    return `${this.config.remotePath}/shared`;
  }

  private get currentPath(): string {
    return `${this.config.remotePath}/current`;
  }

  private createReleaseId(): string {
    const now = new Date();
    return now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  }

  async setup(): Promise<void> {
    await this.ssh.execute(`mkdir -p ${this.releasesPath} ${this.sharedPath}`);

    if (this.config.sharedDirs.length > 0) {
      const dirs = this.config.sharedDirs
        .map((dir) => `"${this.sharedPath}/${dir}"`)
        .join(" ");
      await this.ssh.execute(`mkdir -p ${dirs}`);
    }
  }

  private async linkShared(releasePath: string): Promise<void> {
    for (const file of this.config.sharedFiles) {
      const source = `${this.sharedPath}/${file}`;
      const target = `${releasePath}/${file}`;
      await this.ssh.execute(
        `mkdir -p "$(dirname "${target}")" && if [ -f "${source}" ]; then ln -nfs "${source}" "${target}"; fi`
      );
    }

    for (const dir of this.config.sharedDirs) {
      const source = `${this.sharedPath}/${dir}`;
      const target = `${releasePath}/${dir}`;
      await this.ssh.execute(
        `mkdir -p "${source}" && mkdir -p "$(dirname "${target}")" && rm -rf "${target}" && ln -nfs "${source}" "${target}"`
      );
    }
  }

  private async getReleaseHistory(): Promise<string[]> {
    const raw = await this.ssh.execute(
      `if [ -d "${this.releasesPath}" ]; then cd ${this.releasesPath} && ls -1dt * 2>/dev/null; fi`
    );
    if (!raw || !raw.trim()) {
      return [];
    }
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private async pruneReleases(): Promise<void> {
    const keep = this.config.keepReleases;
    logger.info(`Pruning old releases (retaining last ${keep})`);

    const command = `releases_to_remove=$(cd ${this.releasesPath} && ls -1dt * 2>/dev/null | tail -n +${keep + 1}); if [ -n "$releases_to_remove" ]; then cd ${this.releasesPath} && echo "$releases_to_remove" | xargs rm -rf; fi`;
    await this.ssh.execute(command);
  }

  async deploy(localArchivePath: string): Promise<void> {
    const releaseId = this.createReleaseId();
    const releasePath = `${this.releasesPath}/${releaseId}`;
    const remoteArchivePath = `${this.config.remotePath}/bundle_${releaseId}.tar.gz`;

    try {
      await this.ssh.connect(this.config.ssh);
      await this.setup();

      logger.info(`Creating release directory: ${releaseId}`);
      await this.ssh.execute(`mkdir -p ${releasePath}`);

      try {
        await this.ssh.uploadFile(localArchivePath, remoteArchivePath);

        logger.info("Extracting bundle on remote server");
        await this.ssh.execute(`tar -xzf ${remoteArchivePath} -C ${releasePath}`);
        await this.ssh.execute(`rm -f ${remoteArchivePath}`);

        await this.linkShared(releasePath);

        logger.info("Switching active release symlink");
        await this.ssh.execute(`ln -nfs ${releasePath} ${this.currentPath}`);

        await this.pruneReleases();

        logger.success(`Release ${releaseId} deployed successfully`);
      } catch (deployError) {
        logger.error(`Deployment failed before switch. Cleaning up incomplete release: ${releaseId}`);
        await this.ssh.execute(`rm -rf ${releasePath} ${remoteArchivePath}`).catch(() => {});
        throw deployError;
      }
    } finally {
      this.ssh.disconnect();
    }
  }

  async rollback(): Promise<void> {
    try {
      await this.ssh.connect(this.config.ssh);

      logger.info("Inspecting release history for rollback target");
      const releases = await this.getReleaseHistory();

      if (releases.length === 0) {
        logger.warn("Rollback aborted: no releases found in history");
        return;
      }

      const currentTarget = await this.ssh
        .execute(`readlink ${this.currentPath} 2>/dev/null || true`)
        .then((out) => out.trim().split("/").pop());

      const candidates = releases.filter((rel) => rel !== currentTarget);

      if (candidates.length === 0) {
        logger.warn(
          "Rollback aborted: only one release exists in history (initial deployment). Nothing to roll back to"
        );
        return;
      }

      const targetRelease = candidates[0];
      const targetPath = `${this.releasesPath}/${targetRelease}`;

      logger.info(`Switching active symlink from ${currentTarget || "none"} to ${targetRelease}`);
      await this.ssh.execute(`ln -nfs ${targetPath} ${this.currentPath}`);

      logger.success(`Rollback to ${targetRelease} completed successfully`);
    } finally {
      this.ssh.disconnect();
    }
  }
}
