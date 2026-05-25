import { OpenAITool } from "./openaiTools.js";

const MAX_CHARS = 8000;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Crude HTML -> readable text: drop scripts/styles, strip tags, collapse space. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export interface FetchPageResult {
  url: string;
  text: string;
  chars: number;
  truncated: boolean;
}

export interface FetchPageError {
  error: string;
}

export async function fetchPage(
  input: { url?: unknown },
  deps: { fetch?: typeof fetch } = {}
): Promise<FetchPageResult | FetchPageError> {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) {
    return { error: "A valid http(s) url is required" };
  }

  const fetchImpl = deps.fetch ?? fetch;
  try {
    const res = await fetchImpl(url, {
      headers: {
        // Some sites 403 without a browser-ish UA.
        "User-Agent":
          "Mozilla/5.0 (compatible; LaszyResearch/1.0; +https://ziphq.com)",
        Accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(20_000)
    });

    if (!res.ok) {
      return { error: `fetch failed: ${res.status} ${res.statusText}` };
    }

    const html = await res.text();
    const full = htmlToText(html);
    const text = full.slice(0, MAX_CHARS);
    return { url, text, chars: text.length, truncated: full.length > MAX_CHARS };
  } catch (error) {
    return {
      error: `fetch error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export const fetchPageTool = new OpenAITool({
  name: "fetch_page",
  description:
    "Fetch a web page (e.g. a job posting or press release) and return its readable text, up to ~8000 characters. Use AFTER web_search to read the full content of a promising result, rather than relying on the short search snippet. Returns an error string if the page cannot be retrieved.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The page URL to fetch." }
    },
    required: ["url"],
    additionalProperties: false
  },
  handler: (args) => fetchPage(args as { url?: unknown })
});
