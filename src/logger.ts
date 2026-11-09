const isColorSupported = Boolean(process.stdout.isTTY);

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function format(tag: string, color: string, message: string): string {
  if (!isColorSupported) {
    return `${tag} ${message}`;
  }
  return `${color}${tag}${colors.reset} ${message}`;
}

export const logger = {
  info: (msg: string) => console.log(format("[info]", colors.cyan, msg)),
  success: (msg: string) => console.log(format("[success]", colors.green, msg)),
  warn: (msg: string) => console.warn(format("[warn]", colors.yellow, msg)),
  error: (msg: string) => console.error(format("[error]", colors.red, msg)),
};

