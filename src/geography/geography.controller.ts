import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('geography')
@ApiBearerAuth()
@Controller('geography')
export class GeographyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('regions')
  @RequirePermissions('geography.read')
  @ApiOperation({ summary: 'List all regions' })
  @ApiResponse({ status: 200 })
  async listRegions() {
    const regions = await this.prisma.region.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    return regions.map((r) => ({
      ...r,
      label: `${r.name} (${r.code})`,
    }));
  }

  @Get('localities')
  @RequirePermissions('geography.read')
  @ApiOperation({ summary: 'List all localities with geographic hierarchy' })
  @ApiResponse({ status: 200 })
  async listLocalities() {
    const localities = await this.prisma.locality.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        commune: {
          select: {
            id: true,
            name: true,
            moughataa: {
              select: {
                id: true,
                name: true,
                region: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return localities.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
      commune: l.commune.name,
      moughataa: l.commune.moughataa.name,
      region: l.commune.moughataa.region.name,
      label: `${l.name} — ${l.commune.name}, ${l.commune.moughataa.region.name}`,
    }));
  }
}
