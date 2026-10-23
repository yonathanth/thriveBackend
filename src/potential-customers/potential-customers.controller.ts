import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiSecurity,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PotentialCustomersService } from './potential-customers.service';
import { CreatePotentialCustomerDto } from './dto/create-potential-customer.dto';
import { PotentialCustomerResponseDto } from './dto/potential-customer-response.dto';
import { ApiKey } from '../auth/api-key.decorator';
import { Auth } from '../auth/auth.decorator';

@ApiTags('potential-customers')
@Controller('api')
export class PotentialCustomersController {
  constructor(
    private readonly potentialCustomersService: PotentialCustomersService,
  ) {}

  @Post('public/register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Public registration endpoint',
    description: 'Allows public users to register as potential customers',
  })
  @ApiBody({ type: CreatePotentialCustomerDto })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: PotentialCustomerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  async register(
    @Body() createDto: CreatePotentialCustomerDto,
  ): Promise<PotentialCustomerResponseDto> {
    return this.potentialCustomersService.create(createDto);
  }

  @Get('potential-customers')
  @ApiKey()
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({
    summary: 'Get potential customers',
    description: 'Fetches potential customers for desktop app (requires API key)',
  })
  @ApiSecurity('api-key')
  @ApiResponse({
    status: 200,
    description: 'List of potential customers',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/PotentialCustomerResponseDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing API key',
  })
  async getPotentialCustomers(
    @Query('status') status?: 'pending' | 'converted' | 'ignored',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ data: PotentialCustomerResponseDto[]; total: number }> {
    return this.potentialCustomersService.findAll(
      status,
      limit ? parseInt(limit.toString(), 10) : undefined,
      offset ? parseInt(offset.toString(), 10) : undefined,
    );
  }

  @Get('admin/potential-customers')
  @Auth('admin', 'manager')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({
    summary: 'Get potential customers (Admin)',
    description: 'Fetches potential customers for admin dashboard (requires JWT)',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'List of potential customers',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/PotentialCustomerResponseDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  async getPotentialCustomersAdmin(
    @Query('status') status?: 'pending' | 'converted' | 'ignored',
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ data: PotentialCustomerResponseDto[]; total: number }> {
    return this.potentialCustomersService.findAll(
      status,
      limit ? parseInt(limit.toString(), 10) : undefined,
      offset ? parseInt(offset.toString(), 10) : undefined,
    );
  }
}

