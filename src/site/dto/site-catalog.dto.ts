import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SitePlanDto {
  @ApiProperty({ example: 1, description: 'Desktop service id; send as serviceId when registering' })
  id: number;

  @ApiProperty({ example: 'Full time - 1 month' })
  name: string;

  @ApiProperty({ example: 'Gym' })
  category: string;

  @ApiPropertyOptional({ example: 'Gym floor any time, steam and sauna', nullable: true })
  description: string | null;

  @ApiProperty({ example: ['Full access', 'Shower', 'Locker'], description: "What's included, from the plan's description" })
  benefits: string[];

  @ApiProperty({ example: 3000 })
  price: number;

  @ApiProperty({ example: 30 })
  periodDays: number;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Members sharing one group plan' })
  groupSize: number | null;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Visits included, for limited plans' })
  maxUsageCount: number | null;
}

export class SiteAddonVariantDto {
  @ApiProperty({ example: 'Monthly' })
  name: string;

  @ApiProperty({ example: 30 })
  periodDays: number;

  @ApiProperty({ example: 1500 })
  price: number;
}

export class SiteAddonDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'Steam & sauna' })
  name: string;

  @ApiPropertyOptional({ example: 'Wellness', nullable: true })
  category: string | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ example: false })
  isFree: boolean;

  @ApiProperty({ example: 1500, description: 'Base price, for add-ons without variants' })
  price: number;

  @ApiProperty({ type: [SiteAddonVariantDto] })
  variants: SiteAddonVariantDto[];
}

export class SiteClassDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 1, description: '1 = Monday ... 7 = Sunday' })
  dayOfWeek: number;

  @ApiProperty({ example: 'Aerobics' })
  title: string;

  @ApiProperty({ example: '06:00' })
  startTime: string;

  @ApiProperty({ example: '07:00' })
  endTime: string;

  @ApiPropertyOptional({ example: 'Abel', nullable: true })
  trainer: string | null;

  @ApiPropertyOptional({ example: 'Studio', nullable: true })
  room: string | null;

  @ApiPropertyOptional({ example: '#9DA902', nullable: true })
  color: string | null;
}

export class SiteCatalogDto {
  @ApiProperty({ type: [SitePlanDto] })
  plans: SitePlanDto[];

  @ApiProperty({ type: [SiteAddonDto] })
  addons: SiteAddonDto[];

  @ApiProperty({ type: [SiteClassDto], description: "The main schedule's weekly classes" })
  classes: SiteClassDto[];
}
