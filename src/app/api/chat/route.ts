import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/lib/agents/productAgent';

export const maxDuration = 30; 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 },
      );
    }

    const agentResponse = await runAgent(message);

    return NextResponse.json(agentResponse);
  } catch (error: unknown) {
    console.error('Chat API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'An error occurred while processing your request.', message: errorMessage },
      { status: 500 },
    );
  }
}