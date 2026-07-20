import OpenAI from 'openai';

export const DEFAULT_MODEL = 'gpt-5';

/**
 * Research + write via the OpenAI Responses API with the built-in web_search tool.
 * Returns the model's full text output.
 */
export async function generatePost({ model, systemPrompt, userPrompt }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('provider=openai but OPENAI_API_KEY is not set.');

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        tools: [{ type: 'web_search' }],
    });

    const text = response.output_text;
    if (!text) throw new Error('OpenAI returned an empty response.');
    return text;
}
