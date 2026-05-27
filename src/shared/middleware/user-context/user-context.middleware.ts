import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { GlobalStorage } from './global-storage';

@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const userId = request.header('x-user-id');

    GlobalStorage.setUserContext({ userId });
    next();
  }
}
