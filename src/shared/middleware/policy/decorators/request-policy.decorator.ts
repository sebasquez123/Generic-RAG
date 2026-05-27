import { SetMetadata } from '@nestjs/common';

export const REQUEST_POLICY_REQUIRED = 'REQUEST_POLICY_REQUIRED';

export const RequestPolicy = () => SetMetadata(REQUEST_POLICY_REQUIRED, true);
