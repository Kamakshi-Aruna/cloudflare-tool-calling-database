/**
 * Cloudflare Workers AI Tool Calling Utility
 * Handles function calling flow with any AI model that supports tools
 */

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

interface AIResponse {
  response?: string;
  tool_calls?: ToolCall[];
}

interface Tool {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  function: (args: any) => Promise<any>;
}

interface RunWithToolsConfig {
  messages: Message[];
  tools: Tool[];
  maxIterations?: number;
}

export interface ToolUsageResult {
  response: string;
  toolsUsed: string[];
}

/**
 * Runs an AI model with tool calling support
 * Automatically handles the tool calling loop until the AI returns a final response
 */
export async function runWithTools(
  ai: any,
  model: string,
  config: RunWithToolsConfig
): Promise<ToolUsageResult> {
  const { messages, tools } = config;
  const toolsUsed = new Set<string>();

  const toolDefinitions = tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {
        type: "object",
        properties: {},
      }
    }
  }));

  try {
    const response = await ai.run(model, {
      messages,
      tools: toolDefinitions,
    }) as AIResponse;

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        toolsUsed.add(toolCall.name);
        const tool = tools.find(t => t.name === toolCall.name);

        if (!tool) {
          console.error(`Tool '${toolCall.name}' not found`);
          continue;
        }

        const result = await tool.function(toolCall.arguments);

        if (result && result.error) {
          return {
            response: result.message || "An error occurred while fetching the data.",
            toolsUsed: Array.from(toolsUsed)
          };
        }

        if (toolCall.name === "getCurrentWeather" && result && result.location && result.current) {
          const loc = result.location;
          const curr = result.current;
          return {
            response: `The current weather in ${loc.name}, ${loc.country} is ${curr.description} with a temperature of ${curr.temperature}${curr.temperature_unit}. It feels like ${curr.feels_like}${curr.temperature_unit}. The humidity is ${curr.humidity}${curr.humidity_unit}, wind speed is ${curr.wind_speed} ${curr.wind_speed_unit}, and visibility is ${curr.visibility} ${curr.visibility_unit}.`,
            toolsUsed: Array.from(toolsUsed)
          };
        }
      }
    }

    return {
      response: response.response || "No response generated",
      toolsUsed: Array.from(toolsUsed)
    };

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}