export function DummyChunking(
    input: string,
    maxChunkLength = 1200,
): string[] {
    const normalized = input.replace(/\s+/g, ' ').trim();

    if (!normalized) {
        return [];
    }

    const semanticChunks = normalized
        .split(/\n{2,}|(?<=\.)\s+/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);

    return semanticChunks.flatMap((chunk) =>
        chunk.length <= maxChunkLength
            ? [chunk]
            : chunk.match(new RegExp(`.{1,${maxChunkLength}}(\\s|$)`, 'g')) ?? [
                chunk,
            ],
    );
}

export function DummyEmbedding(input: string): number[] {
    const normalized = input.trim().toLowerCase();
    const vector = Array.from({ length: 8 }, () => 0);

    for (let index = 0; index < normalized.length; index += 1) {
        vector[index % vector.length] += normalized.charCodeAt(index) / 255;
    }

    const magnitude = Math.hypot(...vector) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(6)));
}