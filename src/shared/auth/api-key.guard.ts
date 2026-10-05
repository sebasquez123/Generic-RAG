import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RagConfig } from '~/config';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import { getTemporaryContext } from '~/shared/middleware/context/global-context';
import { SCOPES, hashApiKey, type Principal, type Scope } from './principal';

const PUBLIC = Symbol('genrag:public');
const REQUIRED_SCOPE = Symbol('genrag:scope');

/** Route reachable without an API key (health, UI shell). */
export const Public = () => SetMetadata(PUBLIC, true);

/** Scope the calling key must hold. Routes without it (and not @Public) are denied. */
export const RequireScope = (scope: Scope) =>
  SetMetadata(REQUIRED_SCOPE, scope);

type AuthenticatedRequest = Request & { principal?: Principal };

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new UnauthorizedException('Missing API key');
    return principal;
  },
);

const DISABLED_PRINCIPAL: Principal = {
  name: 'auth-disabled',
  namespaces: '*',
  scopes: new Set(SCOPES),
};

/**
 * Global API-key guard. Keys come from `x-api-key` or `Authorization: Bearer`;
 * only their SHA-256 is compared against configuration.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new LoggerService(ApiKeyGuard.name);
  private readonly keys = new Map<string, Principal>();
  private readonly disabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    @Inject(RAG_CONFIG) config: RagConfig,
  ) {
    this.disabled = config.auth.disabled;
    for (const key of config.auth.keys)
      this.keys.set(key.keySha256.toLowerCase(), {
        name: key.name,
        namespaces: key.namespaces,
        scopes: new Set(key.scopes),
      });

    // Fail closed: an API without keys would otherwise be open to everyone.
    if (!this.disabled && this.keys.size === 0)
      throw new Error(
        'No API keys configured. Set RAG_API_KEYS (see README) or RAG_AUTH_DISABLED=true for local development only.',
      );
    if (this.disabled)
      this.logger.warn(
        'Authentication is DISABLED (RAG_AUTH_DISABLED=true): every caller can access every namespace',
      );
  }

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = this.disabled
      ? DISABLED_PRINCIPAL
      : this.authenticate(request);
    request.principal = principal;
    const requestContext = getTemporaryContext();
    if (requestContext) requestContext.principal = principal.name;

    const scope = this.reflector.getAllAndOverride<Scope | undefined>(
      REQUIRED_SCOPE,
      targets,
    );
    if (!scope || !principal.scopes.has(scope))
      throw new ForbiddenException(
        scope
          ? `API key "${principal.name}" lacks the "${scope}" scope`
          : 'Route is not available to API keys',
      );
    return true;
  }

  private authenticate(request: Request): Principal {
    const header =
      request.header('x-api-key') ?? request.header('authorization');
    const key = header?.replace(/^Bearer\s+/i, '').trim();
    if (!key) throw new UnauthorizedException('Missing API key');

    const principal = this.keys.get(hashApiKey(key));
    if (!principal) throw new UnauthorizedException('Invalid API key');
    return principal;
  }
}
