import { OpenAITool } from "./openaiTools.js";

export async function scrapeLinkedInProfile(profileUrl: string): Promise<Record<string, unknown>> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return { error: "APIFY_TOKEN not set in environment variables" };
  }

  try {
    const runUrl = new URL(
      "https://api.apify.com/v2/acts/apimaestro~linkedin-profile-detail/runs"
    );
    runUrl.searchParams.set("waitForFinish", "120");

    const runResponse = await fetch(runUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ startUrls: [{ url: profileUrl }] }),
      signal: AbortSignal.timeout(180_000)
    });

    if (!runResponse.ok) {
      return {
        error: `Apify request failed: ${runResponse.status} ${runResponse.statusText}`
      };
    }

    const runData = (await runResponse.json()) as {
      data?: { defaultDatasetId?: string };
    };
    const datasetId = runData.data?.defaultDatasetId;
    if (!datasetId) {
      return { error: "Apify run did not return a defaultDatasetId" };
    }

    const itemsResponse = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000)
      }
    );

    if (!itemsResponse.ok) {
      return {
        error: `Apify dataset request failed: ${itemsResponse.status} ${itemsResponse.statusText}`
      };
    }

    const items = (await itemsResponse.json()) as Record<string, unknown>[];
    if (items.length === 0) {
      return { error: `No profile data returned for ${profileUrl}` };
    }

    return items[0];
  } catch (error) {
    return {
      error: `Apify request failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export const scrapeLinkedInProfileTool = new OpenAITool({
  name: "scrape_linkedin_profile",
  description: "Scrape a LinkedIn profile URL through the configured Apify actor.",
  parameters: {
    type: "object",
    properties: {
      profile_url: {
        type: "string",
        description: "The full LinkedIn profile URL."
      }
    },
    required: ["profile_url"],
    additionalProperties: false
  },
  handler: (args) => scrapeLinkedInProfile(String(args.profile_url ?? ""))
});
