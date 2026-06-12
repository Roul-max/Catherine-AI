import { GoogleGenAI } from '@google/genai';

export async function sendMessage(message: string, history: any[] = []) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Format history for the model
  const formattedHistory = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: "user",
        parts: [{ text: `You are Catherine, a highly intelligent, sleek, and futuristic AI assistant. Your responses should be very concise, confident, and conversational. The user says: "${message}"` }]
      }
    ]
  });
  
  return {
    response: response.text
  };
}

export async function* streamCatherineResponse(message: string, history: any[] = []): AsyncGenerator<string, void, unknown> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing');
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const formattedHistory = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: "user",
        parts: [{ text: `You are Catherine, a highly intelligent, sleek, and futuristic AI assistant. Your responses should be very concise, confident, and conversational. The user says: "${message}"` }]
      }
    ]
  });
  
  for await (const chunk of responseStream) {
    yield chunk.text;
  }
}
