import type { SafeParseResult } from '../../../../shared/validation/safe-parse';
import { validationError } from '../../../../shared/validation/safe-parse';

export interface FetchQueryInput {
  question: string;
  contextLimit?: number;
}

export const fetchQuerySchema = {
  safeParse(input: unknown): SafeParseResult<FetchQueryInput> {
    const body = input as Partial<FetchQueryInput>;
    const question =
      typeof body.question === 'string' ? body.question.trim() : '';
    const fieldErrors: Record<string, string[]> = {};

    if (!question) {
      fieldErrors.question = ['question is required'];
    }

    if (
      body.contextLimit !== undefined &&
      (!Number.isInteger(body.contextLimit) ||
        body.contextLimit < 1 ||
        body.contextLimit > 10)
    ) {
      fieldErrors.contextLimit = [
        'contextLimit must be an integer from 1 to 10',
      ];
    }

    if (Object.keys(fieldErrors).length > 0) {
      return validationError(fieldErrors);
    }

    return {
      success: true,
      data: { question, contextLimit: body.contextLimit },
    };
  },
};
