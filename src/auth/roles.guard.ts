import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY, ROLES_KEY, Role } from './roles';

export interface AuthUser {
  id: number;
  email: string | null;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  staffLocalId: number | null;
  memberLocalId: number | null;
}

/**
 * Runs after JwtAuthGuard. Denies by default: a route with no @Roles metadata is
 * refused, so a new endpoint that forgets its roles fails closed.
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

    return true;
  }
}
