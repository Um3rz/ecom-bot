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
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request.', message: error.message },
      { status: 500 },
    );
  }
}