import { readFileSync } from "fs";
import type { SSLConfig, CertificateType } from "../types/index.js";
import { Logger } from "./logger.js";

export class SSLConfigBuilder {
  /**
   * Build SSL configuration from environment variables
   */
  static build(): any {
    const caPath = process.env.PATH_TO_CA;
    const certPath = process.env.PATH_TO_CLIENT_CERTIFICATE;
    const keyPath = process.env.PATH_TO_CLIENT_KEY;

    // If no certificate paths are provided, use default SSL mode
    if (!caPath && !certPath && !keyPath) {
      return "require";
    }

    const sslConfig: SSLConfig = {};

    // Read CA certificate if provided
    if (caPath) {
      sslConfig.ca = this.readCertificateFile(caPath, "CA");
      Logger.info("Loaded CA certificate", { path: caPath });
    }

    // Read client certificate if provided
    if (certPath) {
      sslConfig.cert = this.readCertificateFile(certPath, "CERT");
      Logger.info("Loaded client certificate", { path: certPath });
    }

    // Read client key if provided
    if (keyPath) {
      sslConfig.key = this.readCertificateFile(keyPath, "KEY");
      Logger.info("Loaded client key", { path: keyPath });
    }

    // If certificates are provided, require SSL
    if (caPath || certPath || keyPath) {
      sslConfig.rejectUnauthorized =
        process.env.SSL_REJECT_UNAUTHORIZED !== "false";
    }

    return Object.keys(sslConfig).length > 0 ? sslConfig : "require";
  }

  /**
   * Read and validate a certificate file
   */
  private static readCertificateFile(
    path: string,
    type: CertificateType
  ): string {
    try {
      const content = readFileSync(path, "utf8");
      this.validatePEMFormat(content, type, path);
      return content.trim().replace(/\r\n/g, "\n");
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(
          `${type} certificate file not found at path: ${path}. Please check that the file exists and the path is correct.`
        );
      } else if (error.code === "EACCES") {
        throw new Error(
          `${type} certificate file is not readable at path: ${path}. Please check file permissions.`
        );
      } else if (
        error.message.includes("PEM format") ||
        error.message.includes("empty")
      ) {
        throw error;
      } else {
        throw new Error(
          `Failed to read ${type} certificate from ${path}: ${error.message}`
        );
      }
    }
  }

  /**
   * Validate PEM format
   */
  private static validatePEMFormat(
    content: string,
    type: CertificateType,
    path: string
  ): void {
    if (!content || content.trim().length === 0) {
      throw new Error(`${type} certificate file is empty: ${path}`);
    }

    if (this.isBinaryContent(content)) {
      throw new Error(
        `${type} certificate file (${path}) is in binary format, not PEM format. ` +
          `PostgreSQL requires PEM format. Please convert it to PEM.`
      );
    }

    const trimmed = content.trim();

    if (!trimmed.includes("-----BEGIN")) {
      throw new Error(
        `${type} certificate file (${path}) is not in PEM format. ` +
          `Expected to start with "-----BEGIN".`
      );
    }

    if (!trimmed.includes("-----END")) {
      throw new Error(
        `${type} certificate file (${path}) appears to be incomplete. Missing "-----END" marker.`
      );
    }
  }

  /**
   * Check if content is binary
   */
  private static isBinaryContent(content: string): boolean {
    const sample = content.substring(0, Math.min(100, content.length));
    let nonPrintableCount = 0;

    for (let i = 0; i < sample.length; i++) {
      const char = sample[i];
      if (!char) continue;
      const code = char.charCodeAt(0);

      if (
        code === 0 ||
        (code < 32 && code !== 9 && code !== 10 && code !== 13)
      ) {
        nonPrintableCount++;
      }
    }

    return nonPrintableCount > sample.length * 0.1;
  }
}
