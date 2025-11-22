
declare module "pdf-parse" {
  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }

  function pdf(dataBuffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PDFInfo>;
  export = pdf;
}
