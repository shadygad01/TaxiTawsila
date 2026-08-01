import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@taxitawsila/shared-contracts';
import { RolesGuard } from '../../../../src/common/security/roles.guard';

function mockContext(adminUserRole: AdminRole | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ adminUser: adminUserRole ? { role: adminUserRole } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function mockReflector(declaredRoles: AdminRole[] | undefined): Reflector {
  return { getAllAndOverride: () => declaredRoles } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows the request when no roles are declared on the route', () => {
    const guard = new RolesGuard(mockReflector(undefined));
    expect(guard.canActivate(mockContext(undefined))).toBe(true);
  });

  it('allows the request when the admin user has one of the required roles', () => {
    const guard = new RolesGuard(mockReflector([AdminRole.TRUST_REVIEWER, AdminRole.SUPER_ADMIN]));
    expect(guard.canActivate(mockContext(AdminRole.TRUST_REVIEWER))).toBe(true);
  });

  it('denies the request when the admin user lacks any required role', () => {
    const guard = new RolesGuard(mockReflector([AdminRole.SUPER_ADMIN]));
    expect(() => guard.canActivate(mockContext(AdminRole.SUPPORT_AGENT))).toThrow(ForbiddenException);
  });

  it('denies the request when there is no authenticated admin user at all', () => {
    const guard = new RolesGuard(mockReflector([AdminRole.SUPER_ADMIN]));
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });
});
