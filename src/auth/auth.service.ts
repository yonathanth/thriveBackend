import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from '../entities/admin.entity';
import { AccountAudit } from '../entities/account-audit.entity';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, AdminProfileDto } from './dto/auth-response.dto';
import { normalizePhone } from '../accounts/phone';
import { assertValidNewPassword, hashPassword } from '../accounts/passwords';
import { isRole } from './roles';

/** Failed sign-ins in a row before the account is locked for a while. */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(AccountAudit)
    private auditRepository: Repository<AccountAudit>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, phone, password } = loginDto;
    if (!!email === !!phone) {
      throw new BadRequestException('Sign in with either an email or a phone number');
    }

    const identifier = email ? email.toLowerCase() : normalizePhone(phone);
    const admin = identifier
      ? await this.adminRepository.findOne({
          where: email ? { email: identifier } : { phone: identifier },
        })
      : null;

    // One message for every failure, so it does not reveal which accounts exist.
    const invalid = new UnauthorizedException('Invalid credentials');

    if (!admin || !admin.isActive || !isRole(admin.role)) {
      this.logger.warn(`Login attempt failed: no active account - ${email ?? phone}`);
      throw invalid;
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      this.logger.warn(`Login attempt on locked account ${admin.id}`);
      throw new UnauthorizedException(
        'Too many failed attempts. Try again later or ask staff to reset your password.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      admin.failedLoginAttempts += 1;
      if (admin.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        admin.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        admin.failedLoginAttempts = 0;
        await this.audit(null, 'login_locked', admin.id);
      }
      await this.adminRepository.save(admin);
      this.logger.warn(`Login attempt failed: invalid password - account ${admin.id}`);
      throw invalid;
    }

    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
    admin.lastLoginAt = new Date();
    await this.adminRepository.save(admin);

    this.logger.log(`Logged in: account ${admin.id} (${admin.role})`);

    return this.issueToken(admin);
  }

  async getProfile(userId: number): Promise<AdminProfileDto> {
    return this.toProfile(await this.findActive(userId));
  }

  async createAdmin(email: string, password: string, name: string): Promise<Admin> {
    const existingAdmin = await this.adminRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (existingAdmin) {
      throw new Error('Admin with this email already exists');
    }

    const hashedPassword = await hashPassword(password);

    const admin = this.adminRepository.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: 'admin',
      isActive: true,
    });

    return this.adminRepository.save(admin);
  }

  async seedDefaultAdmin(): Promise<void> {
    const adminCount = await this.adminRepository.count({ where: { role: 'admin' } });

    if (adminCount > 0) return;

    // The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD. Outside production a
    // throwaway default is fine; in production a guessable login is not, so none is made.
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await this.createAdmin(email, password, 'Admin');
      this.logger.log(`First admin created: ${email}`);
    } else if (process.env.NODE_ENV !== 'production') {
      await this.createAdmin('admin@gym.com', 'admin123', 'Default Admin');
      this.logger.log('Default admin created: admin@gym.com / admin123');
    } else {
      this.logger.warn(
        'No admins exist. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart, or run `npm run update:admin`.',
      );
    }
  }

  /**
   * Replaces the signed-in account's password. This is the only way out of a
   * temporary password; other sessions are signed out and a fresh token is returned.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResponseDto> {
    const admin = await this.findActive(userId);

    if (!(await bcrypt.compare(currentPassword, admin.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    assertValidNewPassword(newPassword);
    if (await bcrypt.compare(newPassword, admin.password)) {
      throw new BadRequestException('The new password must differ from the current one');
    }

    admin.password = await hashPassword(newPassword);
    admin.mustChangePassword = false;
    admin.passwordChangedAt = new Date();
    admin.tokenVersion += 1;
    await this.adminRepository.save(admin);
    await this.audit(admin.id, 'password_changed', admin.id);

    this.logger.log(`Password changed: account ${admin.id}`);
    return this.issueToken(admin);
  }

  async updateProfile(
    userId: number,
    updateDto: {
      email?: string;
      password?: string;
      currentPassword?: string;
      contactEmail?: string;
      telegramUsername?: string;
    },
  ): Promise<AdminProfileDto> {
    const admin = await this.findActive(userId);

    // Verify current password if changing password or email
    if (updateDto.password || updateDto.email) {
      if (!updateDto.currentPassword) {
        throw new UnauthorizedException('Current password is required');
      }

      const isPasswordValid = await bcrypt.compare(updateDto.currentPassword, admin.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    // Update email if provided. It is the admin sign-in email; other accounts sign in
    // by phone and keep a contact email instead.
    if (updateDto.email && admin.role !== 'admin') {
      throw new BadRequestException('Only admins sign in by email; set a contact email instead');
    }
    if (updateDto.email) {
      const emailLower = updateDto.email.toLowerCase();
      // Check if email is already taken by another admin
      const existingAdmin = await this.adminRepository.findOne({
        where: { email: emailLower },
      });
      if (existingAdmin && existingAdmin.id !== userId) {
        throw new Error('Email is already in use');
      }
      admin.email = emailLower;
    }

    // Update password if provided
    if (updateDto.password) {
      assertValidNewPassword(updateDto.password);
      admin.password = await hashPassword(updateDto.password);
      admin.mustChangePassword = false;
      admin.passwordChangedAt = new Date();
    }

    // Website-only contact details; an empty string clears them.
    if (updateDto.contactEmail !== undefined) {
      admin.contactEmail = updateDto.contactEmail.trim().toLowerCase() || null;
    }
    if (updateDto.telegramUsername !== undefined) {
      admin.telegramUsername = updateDto.telegramUsername.trim().replace(/^@/, '') || null;
    }

    await this.adminRepository.save(admin);

    this.logger.log(`Profile updated: account ${admin.id}`);

    return this.toProfile(admin);
  }

  private async findActive(userId: number): Promise<Admin> {
    const admin = await this.adminRepository.findOne({
      where: { id: userId, isActive: true },
    });
    if (!admin) {
      throw new UnauthorizedException('Account not found');
    }
    return admin;
  }

  private issueToken(admin: Admin): AuthResponseDto {
    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tv: admin.tokenVersion,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tokenType: 'Bearer',
      expiresIn: 86400, // 24 hours
      user: this.toProfile(admin),
    };
  }

  private toProfile(admin: Admin): AdminProfileDto {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      phone: admin.phone,
      mustChangePassword: admin.mustChangePassword,
      contactEmail: admin.contactEmail,
      telegramUsername: admin.telegramUsername,
    };
  }

  private async audit(actorId: number | null, action: string, targetId: number): Promise<void> {
    await this.auditRepository.insert({ actorId, action, targetId, detail: null });
  }
}
