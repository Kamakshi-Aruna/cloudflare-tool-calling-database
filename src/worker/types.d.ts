/**
 * TypeScript definitions for Cloudflare Workers AI
 */

export interface Env {
  AI: {
    run(model: string, options: AIRunOptions): Promise<AIResponse>;
  };
  DB?: D1Database;
}

export interface AIRunOptions {
  messages: Message[];
  tools?: ToolDefinition[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters?: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface AIResponse {
  response?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}
