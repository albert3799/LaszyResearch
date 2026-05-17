export type JsonSchema = Record<string, unknown>;
export type ToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export interface OpenAIToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
}

export class OpenAITool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly strict: boolean;
  readonly handler: ToolHandler;

  constructor(options: {
    name: string;
    description: string;
    parameters: JsonSchema;
    handler: ToolHandler;
    strict?: boolean;
  }) {
    this.name = options.name;
    this.description = options.description;
    this.parameters = options.parameters;
    this.handler = options.handler;
    this.strict = options.strict ?? false;
  }

  definition(): OpenAIToolDefinition {
    return {
      type: "function",
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      strict: this.strict
    };
  }

  async run(args: Record<string, unknown>): Promise<string> {
    const result = await this.handler(args);
    return JSON.stringify(result);
  }
}
