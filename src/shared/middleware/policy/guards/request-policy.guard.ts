import { CanActivate, Injectable } from '@nestjs/common';

@Injectable()
export class RequestPolicyGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
