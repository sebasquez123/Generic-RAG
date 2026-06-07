
import  { logger, PGLogger, DbLogLimits} from './config';
export class QueryLogger implements PGLogger {
  logQueryLimits(edgepoint: DbLogLimits, query: string, parameters?: unknown[]) {
    logger.trace({ query, parameters }, edgepoint);
  }

  logVectorSearch(query: string, vector: number[], limit: number, similarity: 'cosine' | 'euclidean' | 'inner') {
    logger.trace(
      { query, vectorDimension: vector.length, limit, similarity },
      'Vector similarity search'
    );
  }

  logVectorDimensionMismatch(expected: number, actual: number, embedding: string) {
    logger.error(
      { expected, actual, embedding },
      'Vector dimension mismatch - embedding cannot be stored'
    );
  }

  logBatchEmbeddingInsert(count: number, totalDimensions: number, query: string) {
    logger.debug(
      { count, totalDimensions, query },
      `Batch insert: ${count} embeddings`
    );
  }

  logSlowVectorOperation(time: number, query: string, operationType: 'search' | 'insert' | 'index') {
    logger.warn(
      { time, operationType, query },
      `Slow vector operation (${time}ms) - consider adding indices`
    );
  }


  logEmbeddingRetrieval(count: number, threshold?: number, query?: string) {
    logger.trace(
      { count, threshold, query },
      `Retrieved ${count} embeddings${threshold ? ` above similarity ${threshold}` : ''}`
    );
  }


  logUnexpectedQueryError (error: string | Error, query: string, parameters?: unknown[]) {
    if (error instanceof Error) {
      logger.warn({ error, query, parameters }, 'Errored DB query');
    } else {
      logger.warn({ errorMessage: error, query, parameters }, 'Errored DB query');
    }
  }

  logVectorOperationError(error: Error, operationType: 'search' | 'insert' | 'index', query: string, vector?: number[]) {
    logger.error(
      { 
        error: error.message, 
        operationType, 
        query,
        vectorDimension: vector?.length,
        stack: error.stack 
      },
      `Vector operation error: ${operationType}`
    );
  }
}
