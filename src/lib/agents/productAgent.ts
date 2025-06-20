import {
  Agent,
  Runner,
  webSearchTool,
  hostedMcpTool,
} from '@openai/agents';
import { Product } from '@/lib/types';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY not found in environment variables');
}

const SHOPIFY_MCP_SERVER_URL = 'https://testecomchatbot.myshopify.com/api/mcp';

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
});

const runner = new Runner();

function processAgentResponse(response: any): { answer: string; products: Product[] } {
  let answer = 'Sorry, I could not generate a response.';
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
  console.log(`Running agent with query: "${query}"`);
  const response = await runner.run(productAgent, query);
  console.log('Agent run completed. Processing response.');
  return processAgentResponse(response);
}