import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { Agent, Runner, webSearchTool, tool } from '@openai/agents';
import { z } from 'zod';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: ['http://localhost:4000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

//to display shorter message response
function truncateResponse(text, maxLength = 250) {
  if (!text || text.length <= maxLength) return text;
  
  const sentences = text.split(/[.!?]+/);
  let result = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    const potentialResult = result + (result ? '. ' : '') + trimmedSentence;
    if (potentialResult.length > maxLength) {
      if (result) {
        return result + '.';
      } else {
        return trimmedSentence.substring(0, maxLength - 3) + '...';
      }
    }
    
    result = potentialResult;
  }
  
  return result + (result && !result.endsWith('.') ? '.' : '');
}

const movieSearchTool = tool({
  name: 'movie_info',
  description: 'Get concise information about a movie using OMDB API',
  parameters: z.object({
    title: z.string().describe('The title of the movie to search for'),
    year: z.string().nullable().optional().describe('Optional: The year the movie was released')
  }),
  async execute({ title, year }) {
    try {
      const apiKey = process.env.OMDB_API_KEY;
      if (!apiKey) {
        return 'OMDB API key not configured. Please set OMDB_API_KEY in your environment variables.';
      }

      let url = `http://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(title)}&plot=short`;
      if (year) {
        url += `&y=${year}`;
      }

      console.log('Fetching movie data from:', url.replace(apiKey, 'API_KEY_HIDDEN'));
      const response = await axios.get(url);
      
      if (response.data.Response === 'False') {
        return `Movie "${title}" not found. ${response.data.Error || 'Please check the title and try again.'}`;
      }

      const movie = response.data;
      
      return `${movie.Title} (${movie.Year}) - ${movie.Genre}
      
Director: ${movie.Director}
Cast: ${movie.Actors}
Rating: ${movie.imdbRating}/10 (${movie.imdbVotes} votes)
Plot: ${movie.Plot}
Runtime: ${movie.Runtime}`;
      
    } catch (error) {
      console.error('Error fetching movie info:', error);
      return `Error fetching movie information: ${error.message}`;
    }
  }
});

let agent;
let runner;

try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in environment variables');
  }

  agent = new Agent({
    name: 'Concise QnA Agent',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4.1-mini',
    instructions: `You are a helpful assistant that provides concise, direct answers. Follow these guidelines:

1. Keep responses brief and to the point (ideally 2-3 sentences max)
2. Focus on the most important information
3. Avoid lengthy explanations unless specifically requested
4. For movie questions, use the movie_info tool and provide a summary
5. For other topics, use web_search but summarize findings briefly
6. Use bullet points sparingly and only when it improves clarity
7. Be conversational but concise

Examples of good responses:
- "Inception (2010) is a sci-fi thriller about dream manipulation, directed by Christopher Nolan and starring Leonardo DiCaprio. It has an 8.8/10 IMDb rating."
- "Python tip: Use list comprehensions for cleaner code. Instead of loops, try [x*2 for x in range(10)]."
- "Current AI trend: Large language models are becoming more efficient and specialized for specific tasks."`,
    tools: [
      webSearchTool(),
      movieSearchTool
    ]
  });

  runner = new Runner();
  console.log('Agent and Runner initialized successfully');
} catch (error) {
  console.error('Error initializing agent:', error);
}

function extractTextFromResponse(response) {
  console.log('Extracting text from response...');
  
  let answer = '';
  
  try {
    if (response && response.output && Array.isArray(response.output)) {
      const assistantMessages = response.output.filter(item => 
        item && item.role === 'assistant' && item.content
      );
      
      if (assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        
        if (Array.isArray(lastMessage.content)) {
          const textParts = lastMessage.content.map(contentItem => {
            if (contentItem && typeof contentItem === 'object') {
              if (contentItem.text) {
                return contentItem.text;
              } else if (contentItem.type === 'text' && contentItem.text) {
                return contentItem.text;
              } else {
                for (const key of Object.keys(contentItem)) {
                  if (typeof contentItem[key] === 'string' && contentItem[key].length > 0) {
                    return contentItem[key];
                  }
                }
              }
            } else if (typeof contentItem === 'string') {
              return contentItem;
            }
            return '';
          }).filter(text => text.length > 0);
          
          answer = textParts.join(' ');
        } else if (typeof lastMessage.content === 'string') {
          answer = lastMessage.content;
        }
      }
    }
    
    if (!answer) {
      if (typeof response === 'string') {
        answer = response;
      } else if (response && response.content) {
        if (Array.isArray(response.content)) {
          answer = response.content.map(item => 
            typeof item === 'string' ? item : (item.text || JSON.stringify(item))
          ).join(' ');
        } else {
          answer = response.content;
        }
      } else if (response && response.result) {
        answer = response.result;
      } else if (response && response.data) {
        answer = response.data;
      }
    }
    
  } catch (error) {
    console.error('Error extracting text from response:', error);
    answer = 'Error processing the response. Please try again.';
  }
  
  return answer.trim();
}

app.post('/api/ask', async (req, res) => {
  try {
    const { question, maxLength = 250 } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!agent || !runner) {
      return res.status(500).json({ 
        error: 'Agent not properly initialized. Check your API keys and configuration.' 
      });
    }

    console.log('Processing question:', question);
    console.log('Max length requested:', maxLength);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout - agent took too long to respond')), 30000);
    });

    const responsePromise = runner.run(agent, question);
    const response = await Promise.race([responsePromise, timeoutPromise]);
    
    console.log('Agent response received, processing...');
    
    let answer = extractTextFromResponse(response);
    
    // Apply truncation to ensure concise responses
    answer = truncateResponse(answer, maxLength);
    
    console.log('Final processed answer length:', answer.length);

    res.json({ 
      answer: answer,
      success: true,
      metadata: {
        originalLength: extractTextFromResponse(response).length,
        truncatedLength: answer.length,
        maxLength: maxLength
      }
    });

  } catch (error) {
    console.error('Error processing question:', error);
    
    const errorResponse = {
      error: 'An error occurred while processing your question',
      message: error.message,
      success: false
    };

    res.status(500).json(errorResponse);
  }
});

// app.get('/health', (req, res) => {
//   const healthStatus = {
//     status: 'OK',
//     message: 'Server is running',
//     timestamp: new Date().toISOString(),
//     environment: {
//       nodeEnv: process.env.NODE_ENV,
//       hasOpenAI: !!process.env.OPENAI_API_KEY,
//       hasOMDB: !!process.env.OMDB_API_KEY,
//       agentInitialized: !!agent,
//       runnerInitialized: !!runner
//     }
//   };
  
//   res.json(healthStatus);
// });

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
  console.log('Environment check:');
  console.log('- OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Present' : 'Missing');
  console.log('- OMDB API Key:', process.env.OMDB_API_KEY ? 'Present' : 'Missing');
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;