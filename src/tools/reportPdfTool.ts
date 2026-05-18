import { PDFParse } from "pdf-parse";

import { config } from "../config.js";
import { OpenAITool } from "./openaiTools.js";

function pdfRequestHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "ZipBDR-Research/1.0 (albert@zip.co)",
    Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8"
  };

  try {
    const hostname = new URL(url).hostname;
    if (
      hostname === "document-api.company-information.service.gov.uk" &&
      (process.env.COMPANIES_HOUSE_API_KEY ?? config.companiesHouseApiKey)
    ) {
      const apiKey = process.env.COMPANIES_HOUSE_API_KEY ?? config.companiesHouseApiKey;
      const auth = Buffer.from(`${apiKey}:`).toString("base64");
      headers.Authorization = `Basic ${auth}`;
    }
  } catch {
    // Let fetch surface invalid URLs with its native error message.
  }

  return headers;
}

async function downloadPdfBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: pdfRequestHeaders(url),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000)
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const startsWithPdfHeader = buffer.subarray(0, 5).toString().startsWith("%PDF");

  if (!contentType.toLowerCase().includes("pdf") && !startsWithPdfHeader) {
    throw new Error(`URL did not return a PDF (content-type: ${contentType})`);
  }

  return buffer;
}

async function extractText(pdfBuffer: Buffer, maxChars?: number): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });

  try {
    const data = await parser.getText({ first: config.limits.maxPdfPages });
    const text = data.text ?? "";
    return maxChars && text.length > maxChars ? text.slice(0, maxChars) : text;
  } finally {
    await parser.destroy();
  }
}

export async function downloadAndExtractPdf(url: string): Promise<Record<string, unknown>> {
  try {
    const buffer = await downloadPdfBuffer(url);
    const text = await extractText(buffer, config.limits.maxTextChars);
    return { text };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      text: null
    };
  }
}

export async function getDocumentSample(url: string): Promise<Record<string, unknown>> {
  try {
    const buffer = await downloadPdfBuffer(url);
    const text = await extractText(buffer, config.limits.verificationSampleChars);
    return { text };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      text: null
    };
  }
}

export const downloadAndExtractTool = new OpenAITool({
  name: "download_and_extract",
  description: "Download a PDF from URL and extract its full text content.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The PDF URL to download." }
    },
    required: ["url"],
    additionalProperties: false
  },
  handler: (args) => downloadAndExtractPdf(String(args.url ?? ""))
});

export const getDocumentSampleTool = new OpenAITool({
  name: "get_document_sample",
  description: "Download a PDF and extract a short sample for quick verification.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The PDF URL to sample." }
    },
    required: ["url"],
    additionalProperties: false
  },
  handler: (args) => getDocumentSample(String(args.url ?? ""))
});
