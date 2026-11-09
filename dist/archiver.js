import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";
import { logger } from "./logger.js";
const DEFAULT_EXCLUDES = [
    ".git",
    ".github",
    ".env",
    "node_modules",
];
function loadDeployIgnore(sourceDir) {
    const filePath = path.join(sourceDir, ".deployignore");
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
}
export async function createArchive(options) {
    const archiveName = path.basename(options.outputPath);
    const customExcludes = loadDeployIgnore(options.sourceDir);
    const excludes = new Set([
        ...DEFAULT_EXCLUDES,
        archiveName,
        ...(options.excludes || []),
        ...customExcludes,
    ]);
    if (customExcludes.length > 0) {
        logger.info(`Loaded ${customExcludes.length} rules from .deployignore`);
    }
    logger.info(`Creating compressed bundle from ${options.sourceDir}`);
    await tar.create({
        gzip: true,
        file: options.outputPath,
        cwd: options.sourceDir,
        filter: (filePath) => {
            for (const pattern of excludes) {
                if (filePath.includes(pattern)) {
                    return false;
                }
            }
            return true;
        },
    }, ["."]);
    logger.success(`Archive created at ${options.outputPath}`);
    return options.outputPath;
}
//# sourceMappingURL=archiver.js.map