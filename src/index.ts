#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createArchive } from "./archiver.js";
import { Deployer } from "./deployer.js";
import { logger } from "./logger.js";
import { DeployConfig } from "./types.js";

dotenv.config();

const program = new Command();

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveKey(keyOrPath?: string): string | undefined {
  if (!keyOrPath) return undefined;
  if (fs.existsSync(keyOrPath)) {
    return fs.readFileSync(keyOrPath, "utf-8");
  }
  return keyOrPath;
}

function parseList(value?: string, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  const items = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : defaultValue;
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
    } catch (error: unknown) {
      logger.error(`Packaging failed: ${formatError(error)}`);
      process.exit(1);
    }
  });

program
  .command("deploy", { isDefault: true })
  .description("Execute atomic deployment pipeline")
  .option(
    "-h, --host <host>",
    "SSH host",
    process.env.INPUT_HOST || process.env.HOSTINGER_HOST
  )
  .option(
    "-u, --username <username>",
    "SSH username",
    process.env.INPUT_USERNAME || process.env.HOSTINGER_USER
  )
  .option(
    "-p, --port <port>",
    "SSH port",
    process.env.INPUT_PORT || process.env.HOSTINGER_PORT || "65002"
  )
  .option(
    "-k, --key <keyOrPath>",
    "SSH private key string or path",
    process.env.INPUT_KEY || process.env.HOSTINGER_KEY
  )
  .option(
    "--password <password>",
    "SSH password",
    process.env.INPUT_PASSWORD || process.env.HOSTINGER_PASSWORD
  )
  .option(
    "-r, --remote-path <path>",
    "Root directory on server",
    process.env.INPUT_REMOTE_PATH || process.env.HOSTINGER_REMOTE_PATH
  )
  .option(
    "--keep <number>",
    "Releases to retain",
    process.env.INPUT_KEEP_RELEASES || "5"
  )
  .option(
    "--shared-files <files>",
    "Comma-separated list of persistent files to link",
    process.env.INPUT_SHARED_FILES
  )
  .option(
    "--shared-dirs <dirs>",
    "Comma-separated list of persistent directories to link",
    process.env.INPUT_SHARED_DIRS
  )
  .option("--dry-run", "Simulate packaging and parameter validation without SSH execution")
  .action(async (options) => {
    const tempArchive = path.resolve(process.cwd(), `bundle_${Date.now()}.tar.gz`);

    try {
      await createArchive({
        sourceDir: process.cwd(),
        outputPath: tempArchive,
      });

      const sharedFiles = parseList(options.sharedFiles, [".env"]);
      const sharedDirs = parseList(options.sharedDirs, ["storage", "uploads"]);

      if (options.dryRun) {
        logger.info("Dry-run mode enabled: skipping remote transport");
        logger.info(`Target host: ${options.host || "unspecified"}`);
        logger.info(`Target path: ${options.remotePath || "unspecified"}`);
        logger.info(`Shared files: ${sharedFiles.join(", ")}`);
        logger.info(`Shared directories: ${sharedDirs.join(", ")}`);
        logger.success("Dry-run validation completed successfully");
        return;
      }

      if (!options.host || !options.username || !options.remotePath) {
        throw new Error(
          "Missing required configuration: host, username, and remotePath must be provided."
        );
      }

      const config: DeployConfig = {
        ssh: {
          host: options.host,
          username: options.username,
          port: parseInt(options.port, 10),
          privateKey: resolveKey(options.key),
          password: options.password,
        },
        remotePath: options.remotePath,
        keepReleases: parseInt(options.keep, 10),
        sharedFiles,
        sharedDirs,
      };

      const deployer = new Deployer(config);
      await deployer.deploy(tempArchive);
    } catch (error: unknown) {
      logger.error(`Deployment failed: ${formatError(error)}`);
      process.exit(1);
    } finally {
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

      const config: DeployConfig = {
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
    } catch (error: unknown) {
      logger.error(`Rollback failed: ${formatError(error)}`);
      process.exit(1);
    }
  });

if (
  process.env.INPUT_COMMAND === "rollback" &&
  !process.argv.includes("rollback")
) {
  process.argv.push("rollback");
}

program.parse(process.argv);
