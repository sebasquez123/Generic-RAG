import { NestMiddleware, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { verify, VerifyOptions } from 'jsonwebtoken';

import config from '~/config';
import { LoggerService } from '~/shared/logging/main.logger';
import { setTemporaryContext } from '~/shared/middleware/context/global-context';
import { BotEntity, getBotInfoRepository } from 'dummy_auth_db_form';

const logger = new LoggerService('AuthMiddleware');
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  async use(request: Request, response: Response, next: (error?: Error) => void) {
    const context = setTemporaryContext(request);
    response.set('X-Request-Id', context.traceId);

    const agentTokenId = request.headers.authorization?.replace('Bearer ', '');

    if(!agentTokenId){
      logger.warn('No authorization token provided, continuing as public request'); 
      return next();
    }
    
    const parsedToken = this.verifyToken(agentTokenId ?? '');

    context.botInfo!.id = parsedToken.bot_id;

    const getBotInfo: BotEntity = await getBotInfoRepository(parsedToken.bot_id);
    if (!getBotInfo?.bot || !getBotInfo?.contract) throw new ForbiddenException('Bot not found for the provided token');

    if (getBotInfo.bot.suspended) throw new ForbiddenException('Bot is suspended');

    context.botInfo!.name = getBotInfo.bot?.name;
    const data = {
      id: getBotInfo.contract.id,
      permissions: getBotInfo.contract.permissions,
      role: getBotInfo.contract.role,
      scopes: getBotInfo.contract.scopes
    }
    context.contract = data;

    logger.log(`New request started`);
    next();
  }

  private verifyToken(token: string): { bot_id: string } {
    const decodedToken = decodeURIComponent(token);
    let VerifyOptions: VerifyOptions = {
      algorithms: ['HS256'],
      ignoreExpiration: false,
    }
    const decoded = verify(decodedToken, config.agent.artifact, VerifyOptions) as { bot_id: string };
    if (!decoded.bot_id) {
      logger.debug('Token does not contain bot_id or is invalid');
      throw new ForbiddenException('Invalid token');
    }
    return { bot_id: decoded.bot_id };
  }

}
