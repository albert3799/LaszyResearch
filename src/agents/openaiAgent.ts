import "dotenv/config";

import OpenAI from "openai";

import { OpenAITool } from "../tools/openaiTools.js";

export const STRONG_MODEL = process.env.OPENAI_STRONG_MODEL ?? "gpt-5.5";
export const FAST_MODEL = process.env.OPENAI_FAST_MODEL ?? "gpt-5.4-mini";

type ResponsesClient = {
  responses: {
    create: (request: Record<string, unknown>) => Promise<{
      status?: string | null;
      error?: { message?: string | null } | null;
      output: unknown[];
      output_text?: string | null;
      incomplete_details?: { reason?: string | null } | null;
    }>;
  };
};

interface AgentOptions {
  name: string;
  model: string;
  system: string;
  tools?: OpenAITool[];
  builtinTools?: Record<string, unknown>[];
  maxTurns?: number;
  jsonMode?: boolean;
  reasoningEffort?: string;
  forceToolName?: string;
  client?: ResponsesClient;
}

export class Agent {
  readonly name: string;
  readonly model: string;
  readonly system: string;
  readonly tools: OpenAITool[];
  readonly builtinTools: Record<string, unknown>[];
  readonly maxTurns: number;
  readonly jsonMode: boolean;
  readonly reasoningEffort?: string;
  readonly forceToolName?: string;

  private readonly client?: ResponsesClient;

  constructor(options: AgentOptions) {
    this.name = options.name;
    this.model = options.model;
    this.system = options.system;
    this.tools = options.tools ?? [];
    this.builtinTools = options.builtinTools ?? [];
    this.maxTurns = options.maxTurns ?? 5;
    this.jsonMode = options.jsonMode ?? true;
    this.reasoningEffort = options.reasoningEffort;
    this.forceToolName = options.forceToolName;
    this.client = options.client;
  }

  async run(prompt: string): Promise<string> {
    const client = (this.client ?? new OpenAI()) as unknown as ResponsesClient;
    const toolMap = new Map(this.tools.map((tool) => [tool.name, tool]));
    const toolDefinitions = [
      ...this.builtinTools,
      ...this.tools.map((tool) => tool.definition())
    ];
    const inputItems: unknown[] = [{ role: "user", content: prompt }];

    const request: Record<string, unknown> = {
      model: this.model,
      instructions: this.system,
      input: inputItems,
      store: false
    };

    if (toolDefinitions.length > 0) {
      request.tools = toolDefinitions;
      request.tool_choice = this.forceToolName
        ? { type: "function", name: this.forceToolName }
        : "auto";
    }
    if (this.jsonMode) {
      request.text = { format: { type: "json_object" } };
    }
    if (this.reasoningEffort) {
      request.reasoning = { effort: this.reasoningEffort };
    }

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const response = await client.responses.create({
        ...request,
        input: [...inputItems]
      });

      if (response.status === "failed") {
        const message = response.error?.message ?? "unknown error";
        throw new Error(`${this.name} failed: ${message}`);
      }

      const outputItems = response.output as unknown as Array<Record<string, unknown>>;
      const functionCalls = outputItems.filter((item) => item.type === "function_call");

      if (functionCalls.length === 0) {
        if (response.output_text) {
          return response.output_text.trim();
        }
        if (response.status === "incomplete" && response.incomplete_details) {
          throw new Error(`${this.name} incomplete: ${response.incomplete_details.reason}`);
        }
        throw new Error(`${this.name} did not return text output`);
      }

      inputItems.push(...outputItems);

      for (const call of functionCalls) {
        const name = String(call.name ?? "");
        const callId = String(call.call_id ?? "");
        const tool = toolMap.get(name);
        let output: string;

        if (!tool) {
          output = JSON.stringify({ error: `Unknown tool: ${name}` });
        } else {
          try {
            const args = JSON.parse(String(call.arguments ?? "{}")) as Record<string, unknown>;
            output = await tool.run(args);
          } catch (error) {
            output = JSON.stringify({
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        inputItems.push({
          type: "function_call_output",
          call_id: callId,
          output
        });

        if (name === this.forceToolName) {
          request.tool_choice = "auto";
        }
      }
    }

    throw new Error(`${this.name} exceeded maxTurns=${this.maxTurns}`);
  }
}
