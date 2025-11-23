
declare module "pdf-parse" {
  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: Record<string, any>;
    metadata: any;
    text: string;
    version: string;
  }

  function pdf(dataBuffer: Buffer | Uint8Array, options?: any): Promise<PDFInfo>;
  export = pdf;
}
