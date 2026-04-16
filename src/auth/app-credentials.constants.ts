export const APP_CREDENTIAL_SCOPES = {
  EVENTS_READ: 'events:read',
  EVENTS_WRITE: 'events:write',
} as const;

export type AppCredentialScope =
  (typeof APP_CREDENTIAL_SCOPES)[keyof typeof APP_CREDENTIAL_SCOPES];

export const EVENTS_APP_CREDENTIAL_SCOPES: AppCredentialScope[] = [
  APP_CREDENTIAL_SCOPES.EVENTS_READ,
  APP_CREDENTIAL_SCOPES.EVENTS_WRITE,
];

export const APP_CREDENTIAL_TOKEN_PREFIX = 'vyroapp';
export const APP_CREDENTIAL_SCOPES_KEY = 'appCredentialScopes';
