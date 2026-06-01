import { GraphQLError, GraphQLErrorOptions } from 'graphql/error';

import { ErrorReasonEnum } from '~/shared/enums';

export class NotFoundError extends GraphQLError {
  constructor(entity: string, options?: GraphQLErrorOptions) {
    const message = `${entity} not found`;
    options = options ?? {};
    options.extensions = options.extensions ?? {};
    options.extensions['code'] = ErrorReasonEnum.NOT_FOUND;
    options.extensions['entity'] = entity;
    super(message, options);
  }
}

export class NotImplementedError extends GraphQLError {
  constructor(message: string, options?: GraphQLErrorOptions) {
    options = options ?? {};
    options.extensions = options.extensions ?? {};
    options.extensions['code'] = ErrorReasonEnum.NOT_IMPLEMENTED;
    super(message, options);
  }
}

export class InternalServerError extends GraphQLError {
  constructor(message: string, options?: GraphQLErrorOptions) {
    options = options ?? {};
    options.extensions = options.extensions ?? {};
    options.extensions['code'] = ErrorReasonEnum.INTERNAL_SERVER_ERROR;
    super(message, options);
  }
}

export class PreconditionFailedError extends GraphQLError {
  constructor(message: string, options?: GraphQLErrorOptions) {
    options = options ?? {};
    options.extensions = options.extensions ?? {};
    options.extensions['code'] = ErrorReasonEnum.PRECONDITION_FAILED;
    super(message, options);
  }
}
export class BadGatewayError extends GraphQLError {
  constructor(message: string, options?: GraphQLErrorOptions) {
    options = options ?? {};
    options.extensions = options.extensions ?? {};
    options.extensions['code'] = ErrorReasonEnum.GATEWAY_ERROR;
    super(message, options);
  }
}

export class BadRequestError extends GraphQLError {
  constructor(message: string, options?: GraphQLErrorOptions) {
    options = options ?? {};
    options.extensions = options.extensions ?? {};
    options.extensions['code'] = ErrorReasonEnum.BAD_REQUEST;
    super(message, options);
  }
}
