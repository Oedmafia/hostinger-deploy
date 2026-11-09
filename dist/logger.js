const isColorSupported = Boolean(process.stdout.isTTY);
const colors = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
};
function format(tag, color, message) {
    if (!isColorSupported) {
        return `${tag} ${message}`;
    }
    return `${color}${tag}${colors.reset} ${message}`;
}
export const logger = {
    info: (msg) => console.log(format("[info]", colors.cyan, msg)),
    success: (msg) => console.log(format("[success]", colors.green, msg)),
    warn: (msg) => console.warn(format("[warn]", colors.yellow, msg)),
    error: (msg) => console.error(format("[error]", colors.red, msg)),
};
//# sourceMappingURL=logger.js.map