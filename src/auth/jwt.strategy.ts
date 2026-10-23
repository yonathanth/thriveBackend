import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import { isRole } from './roles';
import type { AuthUser } from './roles.guard';

export interface JwtPayload {
  sub: number;
  email: string | null;
  role: string;
  /** Account tokenVersion when issued; tokens from before this field count as 0. */
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-jwt-secret-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub, isActive: true },
    });

    // A password change or reset bumps tokenVersion, which signs out older tokens.
    if (!admin || !isRole(admin.role) || (payload.tv ?? 0) !== admin.tokenVersion) {
      throw new UnauthorizedException('Invalid token or admin not found');
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
      staffLocalId: admin.staffLocalId,
      memberLocalId: admin.memberLocalId,
    };
  }
}















