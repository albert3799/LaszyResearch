import { OpenAITool } from "./openaiTools.js";

export async function searchTheirStack(companyDomain: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.THEIRSTACK_API_KEY;
  if (!apiKey) {
    return { error: "THEIRSTACK_API_KEY not set in environment variables" };
  }

  const url = new URL("https://api.theirstack.com/v1/jobs");
  url.searchParams.set("company_domain", companyDomain);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      return {
        error: `TheirStack request failed: ${response.status} ${response.statusText}`
      };
    }

    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    return {
      error: `TheirStack request failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export const searchTheirStackTool = new OpenAITool({
  name: "search_theirstack",
  description: "Pull open job listings from TheirStack for a company domain.",
  parameters: {
    type: "object",
    properties: {
      company_domain: {
        type: "string",
        description: "The company's domain, e.g. acmecorp.com."
      }
    },
    required: ["company_domain"],
    additionalProperties: false
  },
  handler: (args) => searchTheirStack(String(args.company_domain ?? ""))
});
