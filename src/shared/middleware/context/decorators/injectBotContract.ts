import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

import { getTemporaryContext } from '~/shared/middleware/context/global-context';
import { BotContract, BotEntity } from '../types/context.types';

export const getContractFromContext = createParamDecorator((_data: unknown, _context: ExecutionContext) => {
    const storage = getTemporaryContext();
    return storage?.contract as BotContract;
  },
);

export const getBotIdentityFromContext = createParamDecorator((_data: unknown, _context: ExecutionContext) => {
    const storage = getTemporaryContext();
    return storage?.botInfo as BotEntity;
  },
);
