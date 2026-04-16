import { SetMetadata } from '@nestjs/common';
import {
  APP_CREDENTIAL_SCOPES_KEY,
  AppCredentialScope,
} from '../app-credentials.constants';

export const AppCredentialScopes = (...scopes: AppCredentialScope[]) =>
  SetMetadata(APP_CREDENTIAL_SCOPES_KEY, scopes);
