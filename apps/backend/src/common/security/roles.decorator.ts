import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@taxitawsila/shared-contracts';

export const ROLES_KEY = 'roles';

/**
 * Declarative RBAC (Security Model §3): `@Roles(AdminRole.SUPER_ADMIN)` on a
 * controller method, enforced centrally by RolesGuard — never duplicated
 * per-handler (Architecture §9).
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
