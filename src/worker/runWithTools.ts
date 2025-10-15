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
  ai: any, // Cloudflare AI binding
  model: string,
  config: RunWithToolsConfig
): Promise<ToolUsageResult> {
  const { messages, tools, maxIterations = 5 } = config;
  const conversationHistory: Message[] = [...messages];
  const toolsUsed = new Set<string>();

  // Convert tools to OpenAI function calling format
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

  let iteration = 0;
  let lastResponse = "";

  while (iteration < maxIterations) {
    iteration++;

    try {
      // Make AI request
      const response = await ai.run(model, {
        messages: conversationHistory,
        tools: toolDefinitions,
      }) as AIResponse;

      // Store response for fallback
      if (response.response) {
        lastResponse = response.response;
      }

      // Check if AI wants to call tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Add assistant's tool call request to history
        conversationHistory.push({
          role: "assistant",
          content: response.response || "Calling tools...",
        });

        // Execute all tool calls
        for (const toolCall of response.tool_calls) {
          toolsUsed.add(toolCall.name); // Track which tool was used

          const tool = tools.find(t => t.name === toolCall.name);

          if (!tool) {
            // Tool not found - send error back to AI
            const errorMsg = `Tool '${toolCall.name}' not found`;
            console.error(`[runWithTools] ${errorMsg}`);

            conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: JSON.stringify({ error: errorMsg }),
            });
            continue;
          }

          try {
            // Execute the tool function
            const result = await tool.function(toolCall.arguments);

            // Check if result is an error
            if (result && result.error) {
              return {
                response: result.message || "An error occurred while fetching the data.",
                toolsUsed: Array.from(toolsUsed)
              };
            }

            // Format weather result into human-readable response
            if (toolCall.name === "getCurrentWeather" && result && result.location && result.current) {
              const loc = result.location;
              const curr = result.current;
              const humanResponse = `The current weather in ${loc.name}, ${loc.country} is ${curr.description} with a temperature of ${curr.temperature}${curr.temperature_unit}. It feels like ${curr.feels_like}${curr.temperature_unit}. The humidity is ${curr.humidity}${curr.humidity_unit}, wind speed is ${curr.wind_speed} ${curr.wind_speed_unit}, and visibility is ${curr.visibility} ${curr.visibility_unit}.`;

              // Return immediately with the formatted response
              return {
                response: humanResponse,
                toolsUsed: Array.from(toolsUsed)
              };
            }

            const resultString = typeof result === "string" ? result : JSON.stringify(result);

            // Add tool result to conversation history
            conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: resultString,
            });
          } catch (error) {
            // Tool execution error - send error back to AI
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            console.error(`[runWithTools] Tool execution error:`, errorMsg);

            conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.name,
              content: JSON.stringify({ error: errorMsg }),
            });
          }
        }

        // Continue loop to get AI's next response
        continue;
      }

      // No more tool calls - return final response
      return {
        response: response.response || lastResponse || "No response generated",
        toolsUsed: Array.from(toolsUsed)
      };

    } catch (error) {
      console.error(`[runWithTools] Error in iteration ${iteration}:`, error);

      // If we have a last response, return it
      if (lastResponse) {
        return {
          response: lastResponse,
          toolsUsed: Array.from(toolsUsed)
        };
      }

      throw error;
    }
  }

  // If we hit max iterations but have tool results, generate a summary
  console.warn(`[runWithTools] Max iterations reached. Generating summary from available data.`);

  return {
    response: lastResponse || "I apologize, but I encountered an issue processing your request. Please try rephrasing your question or contact support if the issue persists.",
    toolsUsed: Array.from(toolsUsed)
  };
}