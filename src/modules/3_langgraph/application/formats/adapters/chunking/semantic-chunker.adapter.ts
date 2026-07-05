import { Injectable } from '@nestjs/common';
import type { ChunkingLangChainPort } from '../../../ports/semantic_chunk.port';
import type { RetrievedContext } from '../../../../../../shared/types/semantic-pipeline.type';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

@Injectable()
export class SemanticChunkerAdapter implements ChunkingLangChainPort {
    /**At some future, it could call different kind of algorithms to chunk by source */
    async chunkPdf(document: string): Promise<string[]> {
        const docs = [
            new Document({
                pageContent: document,
                metadata: {
                    source: "manual.pdf",
                },
            }),
        ];
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const chunks = await splitter.splitDocuments(docs);
        return chunks.map((chunk) => chunk.pageContent);
    }

    async chunkText(question: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }

    async chunkCustom(question: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
}
