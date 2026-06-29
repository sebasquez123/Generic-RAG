export interface ValidationErrorShape {
  flatten(): { fieldErrors: Record<string, string[]> };
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationErrorShape };

export function validationError(
  fieldErrors: Record<string, string[]>,
): SafeParseResult<never> {
  return {
    success: false,
    error: {
      flatten: () => ({ fieldErrors }),
    },
  };
}
