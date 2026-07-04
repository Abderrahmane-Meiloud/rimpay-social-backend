import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import {
  ReportCatalogItemDto,
  ReportDetailDto,
  ReportListItemDto,
} from './dto/report-response.dto';

const listSelect = {
  id: true,
  reportType: true,
  format: true,
  status: true,
  generatedAt: true,
  createdAt: true,
  generator: {
    select: { id: true, fullName: true },
  },
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ReportQueryDto,
  ): Promise<PaginatedResponseDto<ReportListItemDto>> {
    const where: Prisma.ReportWhereInput = {};
    const and: Prisma.ReportWhereInput[] = [];

    if (query.reportType) and.push({ reportType: query.reportType });
    if (query.status) and.push({ status: query.status });
    if (and.length > 0) where.AND = and;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map((r) => ({
        id: r.id,
        reportType: r.reportType,
        format: r.format,
        status: r.status,
        generatedAt: r.generatedAt ?? null,
        generatedBy: r.generator
          ? { id: r.generator.id, fullName: r.generator.fullName }
          : null,
        createdAt: r.createdAt,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<ReportDetailDto> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      select: {
        ...listSelect,
        filters: true,
        filePath: true,
      },
    });
    if (!r) throw new NotFoundException('Report not found');

    return {
      id: r.id,
      reportType: r.reportType,
      format: r.format,
      status: r.status,
      generatedAt: r.generatedAt ?? null,
      generatedBy: r.generator
        ? { id: r.generator.id, fullName: r.generator.fullName }
        : null,
      createdAt: r.createdAt,
      filters: r.filters,
      filePath: r.filePath ?? null,
    };
  }

  getCatalog(): ReportCatalogItemDto[] {
    return [
      {
        code: 'BENEFICIARIES',
        title: 'Rapport des bénéficiaires',
        description: 'Liste consolidée des bénéficiaires, statuts et données de localisation.',
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
      {
        code: 'PAYMENT_OPERATION',
        title: "Rapport d'opération",
        description: "Synthèse d'une opération de paiement : exécution, agents, anomalies.",
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
      {
        code: 'PAYMENTS',
        title: 'Rapport des paiements',
        description: 'Détail des transactions validées, en attente ou rejetées.',
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
      {
        code: 'ANOMALIES',
        title: 'Rapport des anomalies',
        description: 'Synthèse des anomalies détectées par type et par sévérité.',
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
      {
        code: 'AGENTS',
        title: 'Rapport des agents',
        description: 'Performance et activité de synchronisation des agents terrain.',
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
      {
        code: 'AUDIT',
        title: "Rapport d'audit",
        description: 'Journal complet des actions de traçabilité sur la plateforme.',
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
      {
        code: 'SYNC',
        title: 'Rapport de synchronisation',
        description: 'Synthèse des lots de synchronisation hors ligne.',
        status: 'PLANNED',
        requiredPermission: 'reports.export',
      },
    ];
  }
}
