import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

import { getTemporaryContext } from '~/shared/middleware/context/global-context';
import { BotEntity } from '../types/context.types';

export const getBotIdentityFromContext = createParamDecorator( (_data: unknown, _context: ExecutionContext) => {
    const storage = getTemporaryContext();
    return storage?.botInfo as BotEntity;
  },
);
