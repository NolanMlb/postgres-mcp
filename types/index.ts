export interface QueryValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ChartConfig {
  data: any[];
  chartType: "line" | "bar" | "pie" | "doughnut" | "area" | "scatter";
  xColumn: string;
  yColumn: string;
  title: string;
}

export interface ColorPalette {
  backgrounds: string[];
  borders: string[];
}

export interface SSLConfig {
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized?: boolean;
}

export type CertificateType = "CA" | "CERT" | "KEY";
