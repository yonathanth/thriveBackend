import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SiteService } from './site.service';
import { SiteCatalogDto } from './dto/site-catalog.dto';

/** Read-only data for the public website. No login. */
@ApiTags('site')
@Controller('api/site')
export class SiteController {
  constructor(private readonly siteService: SiteService) {}

  @Get('catalog')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Public catalog',
    description:
      'Active membership plans, add-ons with their variants, and the weekly class timetable, as synced from the desktop app',
  })
  @ApiResponse({ status: 200, type: SiteCatalogDto })
  getCatalog(): Promise<SiteCatalogDto> {
    return this.siteService.getCatalog();
  }
}
