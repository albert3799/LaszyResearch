import "dotenv/config";

import OpenAI from "openai";
import { setDefaultOpenAIClient, setOpenAIAPI } from "@openai/agents";

type AzureEnvAliases = {
  apiKeys: string[];
  endpoints: string[];
};

const AZURE_MODEL_ENV: Record<string, AzureEnvAliases> = {
  "gpt-5.4": {
    apiKeys: ["AZURE_OPENAIGPT5.4_API_KEY", "AZURE_OPENAIGPT_5_4_API_KEY"],
    endpoints: ["AZURE_OPENAIGPT5.4_ENDPOINT", "AZURE_OPENAIGPT_5_4_ENDPOINT"]
  },
  "gpt-5.4-nano": {
    apiKeys: [
      "AZURE_OPENAIGPT5.4NANO_API_KEY",
      "AZURE_OPENAIGPT_5_4_NANO_API_KEY",
      "AZURE_OPENAIGPT5.4_API_KEY",
      "AZURE_OPENAIGPT_5_4_API_KEY"
    ],
    endpoints: [
      "AZURE_OPENAIGPT5.4NANO_ENDPOINT",
      "AZURE_OPENAIGPT_5_4_NANO_ENDPOINT",
      "AZURE_OPENAIGPT5.4_ENDPOINT",
      "AZURE_OPENAIGPT_5_4_ENDPOINT"
    ]
  },
  "gpt-5.4-mini": {
    apiKeys: [
      "AZURE_OPENAIGPT5.4MINI_API_KEY",
      "AZURE_OPENAIGPT_5_4_MINI_API_KEY",
      "AZURE_OPENAIGPT5.4_API_KEY",
      "AZURE_OPENAIGPT_5_4_API_KEY"
    ],
    endpoints: [
      "AZURE_OPENAIGPT5.4MINI_ENDPOINT",
      "AZURE_OPENAIGPT_5_4_MINI_ENDPOINT",
      "AZURE_OPENAIGPT5.4_ENDPOINT",
      "AZURE_OPENAIGPT_5_4_ENDPOINT"
    ]
  }
};

function readEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function envAliasesForModel(model: string): AzureEnvAliases {
  const modelAliases = AZURE_MODEL_ENV[model] ?? { apiKeys: [], endpoints: [] };
  return {
    apiKeys: [...modelAliases.apiKeys, "AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY"],
    endpoints: [
      ...modelAliases.endpoints,
      "AZURE_OPENAI_ENDPOINT",
      "AZURE_FOUNDRY_ENDPOINT"
    ]
  };
}

function normalizeAzureBaseUrl(endpoint: string): string {
  const withoutTrailingSlash = endpoint.trim().replace(/\/+$/, "");
  const withoutResponses = withoutTrailingSlash.replace(/\/responses$/i, "");
  if (/\/openai\/v1$/i.test(withoutResponses)) return withoutResponses;
  if (/\/openai$/i.test(withoutResponses)) return `${withoutResponses}/v1`;
  return `${withoutResponses}/openai/v1`;
}

export function createAzureClient(model: string): OpenAI {
  const aliases = envAliasesForModel(model);
  const apiKey = readEnv(aliases.apiKeys);
  const endpoint = readEnv(aliases.endpoints);

  if (!apiKey || !endpoint) {
    throw new Error(
      `Azure credentials not configured for model ${model}. ` +
        `Set ${aliases.apiKeys[0]} and ${aliases.endpoints[0]} (or AZURE_OPENAI_API_KEY / AZURE_OPENAI_ENDPOINT).`
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: normalizeAzureBaseUrl(endpoint),
    defaultHeaders: { "api-key": apiKey }
  });
}

export function defaultStrongModel(): string {
  return process.env.OPENAI_STRONG_MODEL?.trim() || "gpt-5.4";
}

export function defaultFastModel(): string {
  return process.env.OPENAI_FAST_MODEL?.trim() || "gpt-5.4-nano";
}

let runtimeConfigured = false;

/**
 * One-time setup: register a default Azure client with the Agents SDK and
 * select the Responses API. Safe to call multiple times.
 */
export function configureAgentsRuntime(): void {
  if (runtimeConfigured) return;
  const client = createAzureClient(defaultStrongModel());
  // The Agents SDK pins its own copy of `openai`; the structural OpenAI types
  // collide on the private brand even though the runtime shape is identical.
  setDefaultOpenAIClient(client as never);
  setOpenAIAPI("responses");
  runtimeConfigured = true;
}
