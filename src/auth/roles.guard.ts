import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY, ROLES_KEY, Role } from './roles';
import { PERMISSIONS_KEY } from './permissions';

export interface AuthUser {
  id: number;
  email: string | null;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  staffLocalId: number | null;
  memberLocalId: number | null;
  /** Effective website permissions: role defaults plus this account's overrides. */
  permissions: string[];
}

/**
 * Runs after JwtAuthGuard. Denies by default: a route with no @Roles metadata is
 * refused, so a new endpoint that forgets its roles fails closed. A route may also
 * require permissions (@RequirePermission), checked after the role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (!user || !roles?.length || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have access to this resource');
    }

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        targets,
      )
    ) {
      throw new ForbiddenException('Password change required');
    }

    // Within the role fence, @RequirePermission narrows further: any one listed
    // permission is enough.
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (
      required?.length &&
      !required.some((key) => user.permissions?.includes(key))
    ) {
      throw new ForbiddenException('You do not have access to this resource');
    }

    return true;
  }
}
