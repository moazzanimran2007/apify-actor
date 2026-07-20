import { GoogleGenAI } from '@google/genai';

export const DEFAULT_MODEL = 'gemini-2.5-pro';

/**
 * Research + write via Gemini with Google Search grounding and URL context
 * (so it can read prdikt.com and the news sources it finds).
 * Returns the model's full text output.
 */
export async function generatePost({ model, systemPrompt, userPrompt }) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('provider=gemini but GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} }, { urlContext: {} }],
        },
    });

    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
}
