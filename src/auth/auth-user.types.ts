import { AppCredentialPlatform, Role } from '@prisma/client';

export type AuthType = 'jwt' | 'app_credential';

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  requiresPasswordChange: boolean;
  authType: AuthType;
  appCredentialId?: string;
  appCredentialPlatform?: AppCredentialPlatform;
  appCredentialScopes?: string[];
};
