import {
  Agent,
  Runner,
  webSearchTool,
  hostedMcpTool,
  InputGuardrail,
  InputGuardrailTripwireTriggered,
} from '@openai/agents';
import { z } from 'zod';
import { Product } from '@/lib/types';

interface AgentMessage {
  role: string;
  content?: string | Array<{ type: string; text?: string }>;
  name?: string;
}

interface AgentResponse {
  output?: AgentMessage[];
}

interface ContentBlock {
  type: string;
  text?: string;
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY not found in environment variables');
}

const SHOPIFY_MCP_SERVER_URL = 'https://testecomchatbot.myshopify.com/api/mcp';

const VagueQueryOutput = z.object({
  is_vague_or_nonsensical: z.boolean(),
  reasoning: z.string(),
});

const queryGuardrailAgent = new Agent({
  name: 'QueryGuardrailAgent',
  instructions:
    'Check if the user query is vague (e.g., "something cool") or nonsensical (e.g., "asdfgh").',
  outputType: VagueQueryOutput,
});

const queryGuardrail: InputGuardrail = {
  name: 'VagueQueryGuardrail',
  execute: async ({ input, context }) => {
    const result = await runner.run(queryGuardrailAgent, input, { context });
    return {
      outputInfo: result.finalOutput,
      tripwireTriggered: result.finalOutput?.is_vague_or_nonsensical ?? false,
    };
  },
};

const productAgent = new Agent({
  model: 'gpt-4.1-mini',
  name: 'E_commerce_Product_Agent',
  instructions: `You are a friendly and helpful e-commerce assistant.
- Your primary goal is to help users find products using the tools from 'Shopify_Storefront_Tools'. The main tool for this is 'search_shop_catalog'.
- IMPORTANT: When calling any tool from 'Shopify_Storefront_Tools' (like 'search_shop_catalog'), you MUST provide a 'context' argument. For now, always use this exact value for the context: { "country": "US", "language": "EN" }.
- If a query is ambiguous (e.g., "something cool"), you MUST ask clarifying questions.
- Use 'web_search' to find external product reviews or comparisons if asked.
- Always respond in the user's language.
- Keep responses brief and to the point (2-3 sentences max).
- Do not make up information; only use data from the provided tools.`,
  tools: [
    webSearchTool(),
    hostedMcpTool({
      serverLabel: 'Shopify_Storefront_Tools',
      serverUrl: SHOPIFY_MCP_SERVER_URL,
    }),
  ],
  inputGuardrails: [queryGuardrail],
});

const runner = new Runner();

function processAgentResponse(response: any): { answer: string; products: Product[] } {
  let answer = 'Sorry, I am unable to provide a response.';
  let products: Product[] = [];

  if (!response?.output) {
    return { answer, products };
  }

  const assistantMessages = response.output.filter(
    (item: any) => item?.role === 'assistant' && item?.content,
  );

  if (assistantMessages.length > 0) {
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    if (typeof lastMessage.content === 'string') {
      answer = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      const textBlock = lastMessage.content.find(
        (block: any) => block.type === 'output_text',
      );
      if (textBlock) {
        answer = textBlock.text;
      }
    }
  }

  const toolMessages = response.output.filter(
    (item: any) =>
      item?.role === 'tool' &&
      item.name?.startsWith('Shopify_Storefront_Tools'),
  );

  for (const toolMessage of toolMessages) {
    try {
      const toolResult = JSON.parse(toolMessage.content);
      if (Array.isArray(toolResult)) {
        products.push(...toolResult);
      }
    } catch (e) {
      console.error('Could not parse tool result content:', e);
    }
  }

  return { answer, products };
}

export async function runAgent(
  query: string,
): Promise<{ answer: string; products: Product[] }> {
  try {
    const response = await runner.run(productAgent, query);
    return processAgentResponse(response);
  } catch (e) {
    if (e instanceof InputGuardrailTripwireTriggered) {
      return {
        answer:
          'Your query is a bit too vague. Could you please provide more details about what you are looking for?',
        products: [],
      };
    }
    console.error('Error running agent:', e);
    return {
      answer: 'An unexpected error occurred. Please try again.',
      products: [],
    };
  }
}