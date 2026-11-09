import { logger } from "./logger.js";
import { SSHClient } from "./ssh.js";
export class Deployer {
    ssh;
    config;
    constructor(config) {
        this.config = {
            keepReleases: 5,
            sharedFiles: [".env"],
            sharedDirs: ["storage"],
            ...config,
        };
        this.ssh = new SSHClient();
    }
    get releasesPath() {
        return `${this.config.remotePath}/releases`;
    }
    get sharedPath() {
        return `${this.config.remotePath}/shared`;
    }
    get currentPath() {
        return `${this.config.remotePath}/current`;
    }
    createReleaseId() {
        const now = new Date();
        return now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    }
    async setup() {
        await this.ssh.execute(`mkdir -p ${this.releasesPath} ${this.sharedPath}`);
        if (this.config.sharedDirs.length > 0) {
            const dirs = this.config.sharedDirs
                .map((dir) => `${this.sharedPath}/${dir}`)
                .join(" ");
            await this.ssh.execute(`mkdir -p ${dirs}`);
        }
    }
    async linkShared(releasePath) {
        for (const file of this.config.sharedFiles) {
            const source = `${this.sharedPath}/${file}`;
            const target = `${releasePath}/${file}`;
            await this.ssh.execute(`if [ -f "${source}" ]; then ln -nfs "${source}" "${target}"; fi`);
        }
        for (const dir of this.config.sharedDirs) {
            const source = `${this.sharedPath}/${dir}`;
            const target = `${releasePath}/${dir}`;
            await this.ssh.execute(`rm -rf "${target}" && ln -nfs "${source}" "${target}"`);
        }
    }
    async getReleaseHistory() {
        const raw = await this.ssh.execute(`if [ -d "${this.releasesPath}" ]; then cd ${this.releasesPath} && ls -1dt * 2>/dev/null; fi`);
        if (!raw || !raw.trim()) {
            return [];
        }
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }
    async pruneReleases() {
        const keep = this.config.keepReleases;
        logger.info(`Pruning old releases (retaining last ${keep})`);
        const command = `releases_to_remove=$(cd ${this.releasesPath} && ls -1dt * 2>/dev/null | tail -n +${keep + 1}); if [ -n "$releases_to_remove" ]; then cd ${this.releasesPath} && echo "$releases_to_remove" | xargs rm -rf; fi`;
        await this.ssh.execute(command);
    }
    async deploy(localArchivePath) {
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
            }
            catch (deployError) {
                logger.error(`Deployment failed before switch. Cleaning up incomplete release: ${releaseId}`);
                await this.ssh.execute(`rm -rf ${releasePath} ${remoteArchivePath}`).catch(() => { });
                throw deployError;
            }
        }
        finally {
            this.ssh.disconnect();
        }
    }
    async rollback() {
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
                logger.warn("Rollback aborted: only one release exists in history (initial deployment). Nothing to roll back to");
                return;
            }
            const targetRelease = candidates[0];
            const targetPath = `${this.releasesPath}/${targetRelease}`;
            logger.info(`Switching active symlink from ${currentTarget || "none"} to ${targetRelease}`);
            await this.ssh.execute(`ln -nfs ${targetPath} ${this.currentPath}`);
            logger.success(`Rollback to ${targetRelease} completed successfully`);
        }
        finally {
            this.ssh.disconnect();
        }
    }
}
//# sourceMappingURL=deployer.js.map