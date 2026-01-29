import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as
      | { role?: string; groups?: string[]; [key: string]: unknown }
      | undefined;

    const roles = new Set<string>();
    if (user?.role) roles.add(String(user.role).toUpperCase());
    if (Array.isArray(user?.groups)) {
      user?.groups.forEach((group) => roles.add(String(group).toUpperCase()));
    }
    const cognitoGroups = user?.["cognito:groups"];
    if (Array.isArray(cognitoGroups)) {
      cognitoGroups.forEach((group) => roles.add(String(group).toUpperCase()));
    }

    if (roles.size === 0) return false;

    const normalizedRequired = requiredRoles.map((role) => String(role).toUpperCase());
    return normalizedRequired.some((role) => roles.has(role));
  }
}
