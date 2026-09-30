export class Logger {
  private static formatMessage(
    level: string,
    message: string,
    data?: any
  ): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  static info(message: string, data?: any): void {
    console.error(this.formatMessage("INFO", message, data));
  }

  static error(message: string, error?: any): void {
    console.error(this.formatMessage("ERROR", message, error));
  }

  static warn(message: string, data?: any): void {
    console.error(this.formatMessage("WARN", message, data));
  }

  static debug(message: string, data?: any): void {
    if (process.env.DEBUG === "true") {
      console.error(this.formatMessage("DEBUG", message, data));
    }
  }
}
