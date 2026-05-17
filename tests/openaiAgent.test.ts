import { describe, expect, it } from "vitest";

import { Agent } from "../src/agents/openaiAgent.js";
import { OpenAITool } from "../src/tools/openaiTools.js";

describe("OpenAI Responses agent wrapper", () => {
  it("runs a function tool loop", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const responses = [
      {
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "echo_value",
            arguments: '{"value":"ok"}',
            call_id: "call_123"
          }
        ],
        output_text: "",
        error: null,
        incomplete_details: null
      },
      {
        status: "completed",
        output: [],
        output_text: '{"ok":true}',
        error: null,
        incomplete_details: null
      }
    ];

    const client = {
      responses: {
        create: async (request: unknown) => {
          requests.push(request as Record<string, unknown>);
          const response = responses.shift();
          if (!response) {
            throw new Error("Unexpected extra request");
          }
          return response;
        }
      }
    };

    const tool = new OpenAITool({
      name: "echo_value",
      description: "Echo a test value.",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"]
      },
      handler: (args) => ({ echo: args.value })
    });

    const agent = new Agent({
      name: "test",
      model: "gpt-test",
      system: "Return JSON.",
      tools: [tool],
      maxTurns: 2,
      client
    });

    const result = await agent.run("hello");

    expect(JSON.parse(result)).toEqual({ ok: true });
    expect((requests[0].tools as Array<Record<string, unknown>>)[0].name).toBe(
      "echo_value"
    );
    const secondInput = requests[1].input as Array<Record<string, unknown>>;
    const toolOutput = secondInput.at(-1);
    expect(toolOutput).toMatchObject({
      type: "function_call_output",
      call_id: "call_123"
    });
    expect(JSON.parse(String(toolOutput?.output))).toEqual({ echo: "ok" });
  });

  it("can force a tool on the first turn only", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const responses = [
      {
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "persist_to_db",
            arguments: '{"account_data":{"company":"Test"}}',
            call_id: "call_456"
          }
        ],
        output_text: "",
        error: null,
        incomplete_details: null
      },
      {
        status: "completed",
        output: [],
        output_text: "persisted",
        error: null,
        incomplete_details: null
      }
    ];

    const client = {
      responses: {
        create: async (request: unknown) => {
          requests.push(request as Record<string, unknown>);
          const response = responses.shift();
          if (!response) {
            throw new Error("Unexpected extra request");
          }
          return response;
        }
      }
    };
    const tool = new OpenAITool({
      name: "persist_to_db",
      description: "Persist.",
      parameters: { type: "object", properties: {} },
      handler: () => ({ status: "persisted" })
    });
    const agent = new Agent({
      name: "output",
      model: "gpt-test",
      system: "Persist.",
      tools: [tool],
      maxTurns: 2,
      jsonMode: false,
      forceToolName: "persist_to_db",
      client
    });

    await expect(agent.run("persist this")).resolves.toBe("persisted");
    expect(requests[0].tool_choice).toEqual({
      type: "function",
      name: "persist_to_db"
    });
    expect(requests[1].tool_choice).toBe("auto");
  });
});
