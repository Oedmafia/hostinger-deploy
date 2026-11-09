#!/usr/bin/env node
import { Command } from "commander";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createArchive } from "./archiver.js";
import { Deployer } from "./deployer.js";
import { logger } from "./logger.js";
dotenv.config();
const program = new Command();
function formatError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function resolveKey(keyOrPath) {
    if (!keyOrPath)
        return undefined;
    if (fs.existsSync(keyOrPath)) {
        return fs.readFileSync(keyOrPath, "utf-8");
    }
    return keyOrPath;
}
program
    .name("hostinger-deploy")
    .description("Zero-downtime atomic deployment engine for Hostinger")
    .version("0.1.0");
program
    .command("pack")
    .description("Create compressed bundle without deploying")
    .option("-o, --output <path>", "Output path", "release.tar.gz")
    .action(async (options) => {
    try {
        const outputPath = path.resolve(process.cwd(), options.output);
        await createArchive({
            sourceDir: process.cwd(),
            outputPath,
        });
        const stats = fs.statSync(outputPath);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
        logger.success(`Bundle generated: ${outputPath} (${sizeMb} MB)`);
    }
    catch (error) {
        logger.error(`Packaging failed: ${formatError(error)}`);
        process.exit(1);
    }
});
program
    .command("deploy", { isDefault: true })
    .description("Execute atomic deployment pipeline")
    .option("-h, --host <host>", "SSH host", process.env.INPUT_HOST || process.env.HOSTINGER_HOST)
    .option("-u, --username <username>", "SSH username", process.env.INPUT_USERNAME || process.env.HOSTINGER_USER)
    .option("-p, --port <port>", "SSH port", process.env.INPUT_PORT || process.env.HOSTINGER_PORT || "65002")
    .option("-k, --key <keyOrPath>", "SSH private key string or path", process.env.INPUT_KEY || process.env.HOSTINGER_KEY)
    .option("--password <password>", "SSH password", process.env.INPUT_PASSWORD || process.env.HOSTINGER_PASSWORD)
    .option("-r, --remote-path <path>", "Root directory on server", process.env.INPUT_REMOTE_PATH || process.env.HOSTINGER_REMOTE_PATH)
    .option("--keep <number>", "Releases to retain", process.env.INPUT_KEEP_RELEASES || "5")
    .option("--dry-run", "Simulate packaging and parameter validation without SSH execution")
    .action(async (options) => {
    const tempArchive = path.resolve(process.cwd(), `bundle_${Date.now()}.tar.gz`);
    try {
        await createArchive({
            sourceDir: process.cwd(),
            outputPath: tempArchive,
        });
        if (options.dryRun) {
            logger.info("Dry-run mode enabled: skipping remote transport");
            logger.info(`Target host: ${options.host || "unspecified"}`);
            logger.info(`Target path: ${options.remotePath || "unspecified"}`);
            logger.success("Dry-run validation completed successfully");
            return;
        }
        if (!options.host || !options.username || !options.remotePath) {
            throw new Error("Missing required configuration: host, username, and remotePath must be provided.");
        }
        const config = {
            ssh: {
                host: options.host,
                username: options.username,
                port: parseInt(options.port, 10),
                privateKey: resolveKey(options.key),
                password: options.password,
            },
            remotePath: options.remotePath,
            keepReleases: parseInt(options.keep, 10),
            sharedFiles: [".env"],
            sharedDirs: ["storage", "uploads"],
        };
        const deployer = new Deployer(config);
        await deployer.deploy(tempArchive);
    }
    catch (error) {
        logger.error(`Deployment failed: ${formatError(error)}`);
        process.exit(1);
    }
    finally {
        if (fs.existsSync(tempArchive)) {
            fs.unlinkSync(tempArchive);
        }
    }
});
program
    .command("rollback")
    .description("Rollback active release to previous deployment")
    .option("-h, --host <host>", "SSH host", process.env.INPUT_HOST || process.env.HOSTINGER_HOST)
    .option("-u, --username <username>", "SSH username", process.env.INPUT_USERNAME || process.env.HOSTINGER_USER)
    .option("-p, --port <port>", "SSH port", process.env.INPUT_PORT || process.env.HOSTINGER_PORT || "65002")
    .option("-k, --key <keyOrPath>", "SSH private key string or path", process.env.INPUT_KEY || process.env.HOSTINGER_KEY)
    .option("--password <password>", "SSH password", process.env.INPUT_PASSWORD || process.env.HOSTINGER_PASSWORD)
    .option("-r, --remote-path <path>", "Root directory on server", process.env.INPUT_REMOTE_PATH || process.env.HOSTINGER_REMOTE_PATH)
    .action(async (options) => {
    try {
        if (!options.host || !options.username || !options.remotePath) {
            throw new Error("Missing required parameters for rollback execution.");
        }
        const config = {
            ssh: {
                host: options.host,
                username: options.username,
                port: parseInt(options.port, 10),
                privateKey: resolveKey(options.key),
                password: options.password,
            },
            remotePath: options.remotePath,
        };
        const deployer = new Deployer(config);
        await deployer.rollback();
    }
    catch (error) {
        logger.error(`Rollback failed: ${formatError(error)}`);
        process.exit(1);
    }
});
if (process.env.INPUT_COMMAND === "rollback" &&
    !process.argv.includes("rollback")) {
    process.argv.push("rollback");
}
program.parse(process.argv);
//# sourceMappingURL=index.js.map