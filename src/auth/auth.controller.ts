import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthResponseDto, AdminProfileDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Auth } from './auth.decorator';
import { AllowPasswordChangePending, ROLES } from './roles';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Sign in with email (admins) or phone number (any account) and receive a JWT. If user.mustChangePassword is true, only profile and change-password work until the password is replaced.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @Auth(...ROLES)
  @AllowPasswordChangePending()
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current admin profile',
    description: 'Returns the profile of the authenticated admin user',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin profile',
    type: AdminProfileDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing token',
  })
  async getProfile(@Request() req): Promise<AdminProfileDto> {
    return this.authService.getProfile(req.user.id);
  }

  @Put('profile')
  @Auth(...ROLES)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update admin profile',
    description: 'Updates the email and/or password of the authenticated admin user',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: AdminProfileDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing token, or incorrect current password',
  })
  async updateProfile(
    @Request() req,
    @Body() updateDto: UpdateProfileDto,
  ): Promise<AdminProfileDto> {
    return this.authService.updateProfile(req.user.id, updateDto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Auth(...ROLES)
  @AllowPasswordChangePending()
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Change own password',
    description:
      'Replaces the password (including a temporary one). Other sessions are signed out; the response carries a fresh token.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @Request() req,
    @Body() dto: ChangePasswordDto,
  ): Promise<AuthResponseDto> {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
