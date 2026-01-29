import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetUserCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ConfirmDto } from "./dto/confirm.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { createHmac } from "crypto";

type CognitoAuthResult = {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  user?: {
    id?: string;
    email?: string;
    emailVerified?: boolean;
    firstName?: string;
    lastName?: string;
    name?: string;
    role?: "ADMIN" | "USER";
  } | null;
  challengeName?: string;
  session?: string;
  challengeParameters?: Record<string, string>;
};

@Injectable()
export class AuthService {
  private readonly client: CognitoIdentityProviderClient;
  private readonly clientId: string;
  private readonly clientSecret?: string;
  private readonly userPoolId: string;

  constructor() {
    const region = process.env.COGNITO_REGION;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!region) throw new Error("Missing COGNITO_REGION");
    if (!userPoolId) throw new Error("Missing COGNITO_USER_POOL_ID");
    if (!clientId) throw new Error("Missing COGNITO_CLIENT_ID");

    this.clientId = clientId;
    this.userPoolId = userPoolId;
    this.clientSecret = process.env.COGNITO_CLIENT_SECRET;
    this.client = new CognitoIdentityProviderClient({ region });
  }

  private getSecretHash(username: string): string | undefined {
    if (!this.clientSecret) return undefined;
    return createHmac("sha256", this.clientSecret)
      .update(`${username}${this.clientId}`)
      .digest("base64");
  }

  private mapCognitoUser(
    attributes?: { Name?: string; Value?: string }[],
    role?: "ADMIN" | "USER"
  ) {
    if (!attributes) return undefined;
    const attrs = new Map<string, string>();
    attributes.forEach((attr) => {
      if (attr.Name && attr.Value) attrs.set(attr.Name, attr.Value);
    });

    return {
      id: attrs.get("sub"),
      email: attrs.get("email"),
      emailVerified: attrs.get("email_verified") === "true",
      firstName: attrs.get("given_name"),
      lastName: attrs.get("family_name"),
      name: attrs.get("name"),
      role,
    };
  }

  private mapIdTokenUser(payload?: Record<string, unknown>, role?: "ADMIN" | "USER") {
    if (!payload) return undefined;
    const getString = (key: string) =>
      typeof payload[key] === "string" ? (payload[key] as string) : undefined;

    return {
      id: getString("sub"),
      email: getString("email"),
      emailVerified:
        payload["email_verified"] === true || payload["email_verified"] === "true",
      firstName: getString("given_name"),
      lastName: getString("family_name"),
      name: getString("name"),
      role,
    };
  }

  private parseJwtPayload(token?: string): Record<string, unknown> | undefined {
    if (!token) return undefined;
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    try {
      const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private resolveRole(
    attributes?: { Name?: string; Value?: string }[],
    payload?: Record<string, unknown>
  ): "ADMIN" | "USER" {
    const attrs = new Map<string, string>();
    attributes?.forEach((attr) => {
      if (attr.Name && attr.Value) attrs.set(attr.Name, attr.Value);
    });

    const customRole = attrs.get("custom:role") ?? attrs.get("role");
    if (customRole && customRole.toUpperCase() === "ADMIN") return "ADMIN";

    const groupsRaw = payload?.["cognito:groups"];
    const groups = Array.isArray(groupsRaw) ? groupsRaw.map(String) : [];
    const hasAdminGroup = groups.some((group) => group.toUpperCase() === "ADMIN");
    return hasAdminGroup ? "ADMIN" : "USER";
  }

  private normalizeRole(role: UpdateRoleDto["role"]): "ADMIN" | "USER" {
    if (role === "ADMIN") return "ADMIN";
    return "USER";
  }

  private async ensureUserGroup(email: string) {
    await this.client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: "USER",
      })
    );
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const secretHash = this.getSecretHash(email);

    try {
      const response = await this.client.send(
        new SignUpCommand({
          ClientId: this.clientId,
          Username: email,
          Password: dto.password,
          SecretHash: secretHash,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "given_name", Value: dto.firstName.trim() },
            { Name: "family_name", Value: dto.lastName.trim() },
            {
              Name: "name",
              Value: `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim(),
            },
          ],
        })
      );

      return {
        userSub: response.UserSub,
        userConfirmed: response.UserConfirmed,
        codeDeliveryDetails: response.CodeDeliveryDetails,
      };
    } catch (error: any) {
      const code = error?.name ?? error?.Code;
      if (code === "UsernameExistsException") {
        throw new BadRequestException("Email already registered");
      }
      if (code === "InvalidPasswordException") {
        throw new BadRequestException("Password does not meet policy");
      }
      if (code === "InvalidParameterException") {
        throw new BadRequestException("Invalid sign up parameters");
      }
      throw new InternalServerErrorException("Cognito sign up failed");
    }
  }

  async confirm(dto: ConfirmDto) {
    const email = dto.email.toLowerCase().trim();
    const secretHash = this.getSecretHash(email);

    try {
      await this.client.send(
        new ConfirmSignUpCommand({
          ClientId: this.clientId,
          Username: email,
          ConfirmationCode: dto.code,
          SecretHash: secretHash,
        })
      );
      return { ok: true };
    } catch (error: any) {
      const code = error?.name ?? error?.Code;
      if (code === "CodeMismatchException") {
        throw new BadRequestException("Invalid confirmation code");
      }
      if (code === "ExpiredCodeException") {
        throw new BadRequestException("Confirmation code expired");
      }
      throw new InternalServerErrorException("Cognito confirmation failed");
    }
  }

  async login(dto: LoginDto): Promise<CognitoAuthResult> {
    const email = dto.email.toLowerCase().trim();
    const secretHash = this.getSecretHash(email);

    try {
      const response = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: this.clientId,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: dto.password,
            ...(secretHash ? { SECRET_HASH: secretHash } : {}),
          },
        })
      );

      if (response.ChallengeName) {
        return {
          user: null,
          challengeName: response.ChallengeName,
          session: response.Session,
          challengeParameters: response.ChallengeParameters,
        };
      }

      const result = response.AuthenticationResult;
      if (!result) throw new UnauthorizedException("Invalid credentials");

      const idPayload = this.parseJwtPayload(result.IdToken);
      let userAttributes: { Name?: string; Value?: string }[] | undefined;
      if (result.AccessToken) {
        try {
          const userResponse = await this.client.send(
            new GetUserCommand({ AccessToken: result.AccessToken })
          );
          userAttributes = userResponse.UserAttributes;
        } catch {
          userAttributes = undefined;
        }
      }

      const groupsRaw = idPayload?.["cognito:groups"];
      const groups = Array.isArray(groupsRaw) ? groupsRaw.map(String) : [];
      if (groups.length === 0) {
        try {
          await this.ensureUserGroup(email);
        } catch (error: any) {
          const code = error?.name ?? error?.Code;
          if (code === "ResourceNotFoundException") {
            throw new BadRequestException("Group USER not found");
          }
          throw new InternalServerErrorException("Failed to assign USER group");
        }
      }

      const role = this.resolveRole(userAttributes, idPayload);
      let user = this.mapCognitoUser(userAttributes, role);
      if (!user) {
        user = this.mapIdTokenUser(idPayload, role);
      }

      return {
        accessToken: result.AccessToken,
        idToken: result.IdToken,
        refreshToken: result.RefreshToken,
        expiresIn: result.ExpiresIn,
        tokenType: result.TokenType,
        user,
      };
    } catch (error: any) {
      const code = error?.name ?? error?.Code;
      if (code === "NotAuthorizedException" || code === "UserNotFoundException") {
        throw new UnauthorizedException("Invalid credentials");
      }
      if (code === "UserNotConfirmedException") {
        throw new BadRequestException("User not confirmed");
      }
      throw new InternalServerErrorException("Cognito login failed");
    }
  }

  async setUserRole(dto: UpdateRoleDto) {
    const email = dto.email.toLowerCase().trim();
    const role = this.normalizeRole(dto.role);
    const targetGroup = role === "ADMIN" ? "ADMIN" : "USER";
    const otherGroup = role === "ADMIN" ? "USER" : "ADMIN";

    try {
      await this.client.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          GroupName: otherGroup,
        })
      );
    } catch {
      // ignore if user was not in the other group
    }

    try {
      await this.client.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          GroupName: targetGroup,
        })
      );
    } catch (error: any) {
      const code = error?.name ?? error?.Code;
      if (code === "ResourceNotFoundException") {
        throw new BadRequestException("Group not found");
      }
      throw new InternalServerErrorException("Cognito group update failed");
    }

    return { ok: true, email, role, group: targetGroup };
  }
}
