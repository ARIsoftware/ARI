import { getTaskContext, formatTaskContextForAI } from '@/lib/task-context'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

export async function POST(req: Request) {
  try {
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { messages } = await req.json();

    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling OpenAI with task context...');

    // Get user's task context
    let taskContext = ''
    try {
      const context = await getTaskContext()
      taskContext = formatTaskContextForAI(context)
      console.log('Task context loaded successfully')
    } catch (error) {
      console.warn('Failed to load task context:', error)
      // Continue without task context if it fails
    }

    // Create system message with task context
    const systemMessage = {
      role: 'system' as const,
      content: `You are a helpful AI assistant. The user has access to a task management system, and here is their current task data:

${taskContext}

You can answer questions about their tasks, provide insights about their productivity, help them prioritize work, and assist with task management. Be helpful and conversational.`
    }

    // Combine system message with user messages
    const messagesWithContext = [systemMessage, ...messages]

    console.log('Sending request to OpenAI with', messagesWithContext.length, 'messages');

    // Direct OpenAI API call
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messagesWithContext,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('OpenAI API Error:', errorData);
      return new Response(
        JSON.stringify({ error: errorData.error?.message || 'OpenAI API error' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return the streaming response
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
