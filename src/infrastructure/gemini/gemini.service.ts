import { Injectable } from '@nestjs/common';

@Injectable()
export class GeminiInfrastructureService {
  private readonly apiKey = process.env['GEMINI_API_KEY'];
  private readonly generationModel =
    process.env['GEMINI_CHUNK_MODEL'] ?? 'gemini-1.5-flash';
  private readonly embeddingModel =
    process.env['GEMINI_EMBEDDING_MODEL'] ?? 'text-embedding-004';

  async chunkText(input: string): Promise<string[]> {
    if (!this.apiKey) {
      return this.fallbackChunk(input);
    }

    try {
      const prompt = [
        'Split the following input into concise retrieval chunks.',
        'Return only JSON in this shape: {"chunks":["..."]}.',
        'Keep semantic meaning intact and remove empty chunks.',
        '',
        input,
      ].join('\n');
      const text = await this.generateContent(prompt);
      const parsed = JSON.parse(text) as { chunks?: unknown };

      if (!Array.isArray(parsed.chunks)) {
        return this.fallbackChunk(input);
      }

      return parsed.chunks
        .filter((chunk): chunk is string => typeof chunk === 'string')
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);
    } catch {
      return this.fallbackChunk(input);
    }
  }

  async embedText(input: string): Promise<number[]> {
    if (!this.apiKey) {
      return this.fallbackEmbedding(input);
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: `models/${this.embeddingModel}`,
            content: { parts: [{ text: input }] },
          }),
        },
      );

      if (!response.ok) {
        return this.fallbackEmbedding(input);
      }

      const body = (await response.json()) as {
        embedding?: { values?: number[] };
      };

      return body.embedding?.values?.length
        ? body.embedding.values
        : this.fallbackEmbedding(input);
    } catch {
      return this.fallbackEmbedding(input);
    }
  }

  private async generateContent(prompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.generationModel}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Gemini chunking request failed.');
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini chunking response was empty.');
    }

    return text;
  }

  private fallbackChunk(input: string): string[] {
    return input
      .split(/\n{2,}|(?<=\.)\s+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
  }

  private fallbackEmbedding(input: string): number[] {
    const normalized = input.trim().toLowerCase();
    const vector = Array.from({ length: 8 }, () => 0);

    for (let index = 0; index < normalized.length; index += 1) {
      vector[index % vector.length] += normalized.charCodeAt(index) / 255;
    }

    const magnitude = Math.hypot(...vector) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(6)));
  }
}
