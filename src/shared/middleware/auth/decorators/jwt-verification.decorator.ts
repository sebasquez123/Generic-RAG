import { SetMetadata } from '@nestjs/common';

export const JWT_VERIFICATION_REQUIRED = 'JWT_VERIFICATION_REQUIRED';

export const JwtVerification = () =>
  SetMetadata(JWT_VERIFICATION_REQUIRED, true);
