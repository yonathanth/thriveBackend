import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminProfileDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'admin@gym.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'John Admin' })
  name: string;

  @ApiProperty({ example: 'admin', enum: ['admin', 'manager', 'trainer', 'member'] })
  role: string;

  @ApiPropertyOptional({ example: '+251911223344', nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({
    example: false,
    description: 'The password is temporary; only change-password works until it is replaced',
  })
  mustChangePassword?: boolean;

  @ApiPropertyOptional({ nullable: true })
  contactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true })
  telegramUsername?: string | null;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 86400,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Signed-in user profile',
    type: AdminProfileDto,
  })
  user: AdminProfileDto;
}
