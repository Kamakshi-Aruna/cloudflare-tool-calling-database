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

/**
 * Runs an AI model with tool calling support
 * Automatically handles the tool calling loop until the AI returns a final response
 */
export async function runWithTools(
  ai: any, // Cloudflare AI binding
  model: string,
  config: RunWithToolsConfig
): Promise<string> {
  const { messages, tools, maxIterations = 5 } = config;
  const conversationHistory: Message[] = [...messages];

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

    console.log(`[runWithTools] Iteration ${iteration}/${maxIterations}`);

    try {
      // Make AI request
      const response = await ai.run(model, {
        messages: conversationHistory,
        tools: toolDefinitions,
      }) as AIResponse;

      console.log(`[runWithTools] Response:`, JSON.stringify(response, null, 2));

      // Store response for fallback
      if (response.response) {
        lastResponse = response.response;
      }

      // Check if AI wants to call tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log(`[runWithTools] AI wants to call ${response.tool_calls.length} tool(s)`);

        // Add assistant's tool call request to history
        conversationHistory.push({
          role: "assistant",
          content: response.response || "Calling tools...",
        });

        // Execute all tool calls
        for (const toolCall of response.tool_calls) {
          console.log(`[runWithTools] Executing tool: ${toolCall.name}`);

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
            const resultString = typeof result === "string" ? result : JSON.stringify(result);

            console.log(`[runWithTools] Tool result:`, resultString.substring(0, 200));

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
      console.log(`[runWithTools] Final response received`);
      return response.response || lastResponse || "No response generated";

    } catch (error) {
      console.error(`[runWithTools] Error in iteration ${iteration}:`, error);

      // If we have a last response, return it
      if (lastResponse) {
        return lastResponse;
      }

      throw error;
    }
  }

  // If we hit max iterations but have tool results, generate a summary
  console.warn(`[runWithTools] Max iterations reached. Generating summary from available data.`);

  if (lastResponse) {
    return lastResponse;
  }

  // Return a helpful error with context
  return "I apologize, but I encountered an issue processing your request. Please try rephrasing your question or contact support if the issue persists.";
}