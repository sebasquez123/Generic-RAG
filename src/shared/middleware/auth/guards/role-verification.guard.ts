import { CanActivate, Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPublicSymbol } from '../decorators/public.decorator';
import { LoggerService } from '~/shared/logging/main.logger';
import { getTemporaryContext } from '../../context/global-context';
import { roleSymbol } from '../decorators/role.decorator';
import { Role } from '../../context/types/context.types';
import { InternalServerError } from '~/shared/errors';

const logger = new LoggerService('AuthMiddleware');
@Injectable()
export class RoleVerificationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();

    const globalContext = getTemporaryContext();

    const isPublic = this.reflector.getAllAndOverride<boolean>(isPublicSymbol, [controller, handler]);

    if (isPublic) {
      logger.warn(`Public route accessed by bot: ${globalContext?.botInfo?.id} on quality of ${globalContext?.contract?.role}, skipping role verification`);
      return true;
    }

    const roleBenchmark = this.reflector.getAllAndOverride<Role>(roleSymbol, [controller, handler]);
    if(roleBenchmark === undefined) {
      logger.warn(`No role metadata found for route ${globalContext?.route}, skipping role verification`);
      return false;
    }
    const botRole = globalContext?.contract?.role;
    const requiredRole = roleBenchmark.valueOf();

    if (!requiredRole || botRole !== requiredRole) {
      logger.warn(`Bot ${globalContext?.botInfo?.id} with role ${botRole} tried to access a route requiring role ${requiredRole}`);
      return false;
    }

    logger.log(`Bot ${globalContext?.botInfo?.id} with role ${botRole} successfully accessed a route requiring role ${requiredRole}`);

    return true;
  }
}