import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
export declare class UserContextMiddleware implements NestMiddleware {
    use(request: Request, _response: Response, next: NextFunction): void;
}
