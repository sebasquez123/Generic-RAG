import { CanActivate, Injectable } from '@nestjs/common';

@Injectable()
export class JwtVerificationGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
