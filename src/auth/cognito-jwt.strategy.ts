import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import * as jwksRsa from "jwks-rsa";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
type CognitoPayload = {
  sub: string;
  email?: string;
  username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  "cognito:username"?: string;
  "cognito:groups"?: string[];
};

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(Strategy, "cognito") {
  constructor(private readonly prisma: PrismaService) {
    const region = process.env.COGNITO_REGION;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;

    if (!region) throw new Error("Missing COGNITO_REGION");
    if (!userPoolId) throw new Error("Missing COGNITO_USER_POOL_ID");
    if (!clientId) throw new Error("Missing COGNITO_CLIENT_ID");

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: clientId,
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ["RS256"],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: CognitoPayload) {
    const email = payload.email?.toLowerCase().trim();
    if (!email) {
      throw new UnauthorizedException("Token missing email claim");
    }

    const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [];
    const normalizedGroups = groups.map((group) => group.toUpperCase());
    const roleFromGroups = normalizedGroups.includes(Role.ADMIN)
      ? Role.ADMIN
      : Role.GENERAL;
    const shouldSyncRole = Array.isArray(payload["cognito:groups"]);

    const fullName = payload.name?.trim() ?? "";
    const givenName = payload.given_name?.trim() || fullName.split(" ")[0] || "Cognito";
    const familyName =
      payload.family_name?.trim() || fullName.split(" ").slice(1).join(" ").trim() || "User";

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    const user = existingUser
      ? shouldSyncRole && existingUser.role !== roleFromGroups
        ? await this.prisma.user.update({
            where: { email },
            data: { role: roleFromGroups },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          })
        : existingUser
      : await this.prisma.user.create({
          data: {
            email,
            password: await bcrypt.hash(randomUUID(), 10),
            firstName: givenName,
            lastName: familyName,
            role: roleFromGroups,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      sub: payload.sub,
      groups,
      username: payload["cognito:username"] ?? payload.username,
    };
  }
}
