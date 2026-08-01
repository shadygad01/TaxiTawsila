import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@taxitawsila/shared-contracts';
import { ROLES_KEY } from './roles.decorator';

interface RequestWithAdminUser {
  adminUser?: { role: AdminRole };
}

/**
 * Central RBAC enforcement (Security Model §3). Reads `request.adminUser`,
 * populated upstream by an admin authentication guard (Identity Context,
 * Phase 3+) — this guard only ever checks the role claim against a route's
 * declared `@Roles(...)`, it never authenticates a token itself, keeping
 * authentication and authorization as two separate, single-purpose guards.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAdminUser>();
    const role = request.adminUser?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
