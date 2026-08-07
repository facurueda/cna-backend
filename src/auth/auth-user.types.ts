import { AppCredentialPlatform, Role } from '@prisma/client';

export type AuthType = 'jwt' | 'app_credential';

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Rol efectivo dentro del proyecto activo, no el rol global. */
  role: Role;
  /** Proyecto activo de la sesion. null si el usuario no tiene membresias. */
  projectId: string | null;
  requiresPasswordChange: boolean;
  authType: AuthType;
  appCredentialId?: string;
  appCredentialPlatform?: AppCredentialPlatform;
  appCredentialScopes?: string[];
};
