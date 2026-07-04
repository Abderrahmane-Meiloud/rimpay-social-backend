import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalyticsDto,
  DashboardSummaryResponseDto,
  MonthPaymentDto,
  RegionBeneficiaryDto,
  RegionPaymentDto,
} from './dto/dashboard-summary-response.dto';
import { computeExecutionRatePercent, MINISTERIAL_DEMO_CODE_PREFIX } from './execution-rate';

export { computeExecutionRatePercent, MINISTERIAL_DEMO_CODE_PREFIX };

export type DashboardPeriod =
  | 'LAST_3_MONTHS'
  | 'LAST_6_MONTHS'
  | 'LAST_12_MONTHS'
  | 'CURRENT_YEAR';

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  LAST_3_MONTHS: '3 derniers mois',
  LAST_6_MONTHS: '6 derniers mois',
  LAST_12_MONTHS: '12 derniers mois',
  CURRENT_YEAR: 'Année en cours',
};

/**
 * Period semantics (UTC-based):
 * - LAST_3_MONTHS:  current month + 2 preceding calendar months, from day 1 of earliest month to now.
 * - LAST_6_MONTHS:  current month + 5 preceding calendar months.
 * - LAST_12_MONTHS: current month + 11 preceding calendar months.
 * - CURRENT_YEAR:   January 1 of current year through now.
 *
 * All dates use UTC to stay consistent with PostgreSQL's default timestamp handling.
 */
function computePeriodRange(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  let start: Date;

  switch (period) {
    case 'LAST_3_MONTHS':
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
      break;
    case 'LAST_6_MONTHS':
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
      break;
    case 'LAST_12_MONTHS':
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
      break;
    case 'CURRENT_YEAR':
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      break;
  }

  return { start, end };
}

function generateMonthBuckets(start: Date, end: Date): string[] {
  const buckets: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = end.getUTCFullYear() * 12 + end.getUTCMonth();
  while (cursor.getUTCFullYear() * 12 + cursor.getUTCMonth() <= endMonth) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    buckets.push(`${y}-${m}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

/**
 * Exact decimal string addition using BigInt-based fixed-point arithmetic.
 * Avoids IEEE 754 floating-point precision loss for financial totals.
 *
 * Reconciliation method: all monetary values are kept as exact decimal strings
 * from PostgreSQL (COALESCE(SUM(amount), 0)::text). Aggregation in JS uses
 * this addDecimalStrings function which parses each string into a BigInt
 * scaled to the maximum decimal precision seen, adds, then converts back
 * to a decimal string. This guarantees sum(monthly) = sum(regional) = periodTotal
 * with zero precision loss.
 */
function addDecimalStrings(a: string, b: string): string {
  const parse = (s: string): { int: string; frac: string } => {
    const [int, frac = ''] = s.replace(/^\+/, '').split('.');
    return { int, frac };
  };
  const pa = parse(a);
  const pb = parse(b);
  const maxFrac = Math.max(pa.frac.length, pb.frac.length);
  const scaleA = BigInt(pa.int + pa.frac.padEnd(maxFrac, '0'));
  const scaleB = BigInt(pb.int + pb.frac.padEnd(maxFrac, '0'));
  const sum = scaleA + scaleB;
  if (maxFrac === 0) return sum.toString();
  const sumStr = sum.toString().padStart(maxFrac + 1, '0');
  const intPart = sumStr.slice(0, sumStr.length - maxFrac);
  const fracPart = sumStr.slice(sumStr.length - maxFrac).replace(/0+$/, '');
  return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
}

function sumDecimalStrings(values: string[]): string {
  return values.reduce((acc, v) => addDecimalStrings(acc, v), '0');
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    period?: DashboardPeriod,
    demoOnly = false,
  ): Promise<DashboardSummaryResponseDto> {
    const programWhere = demoOnly
      ? { deletedAt: null, code: { startsWith: MINISTERIAL_DEMO_CODE_PREFIX } }
      : { deletedAt: null };
    const operationWhere = demoOnly
      ? { deletedAt: null, code: { startsWith: MINISTERIAL_DEMO_CODE_PREFIX } }
      : { deletedAt: null };
    const paymentWhere = demoOnly
      ? { paymentOperation: { code: { startsWith: MINISTERIAL_DEMO_CODE_PREFIX } } }
      : {};

    const [
      beneficiariesTotal,
      activeBeneficiaries,
      programsTotal,
      operationsTotal,
      openOperations,
      paymentsTotal,
      paidPayments,
      pendingPayments,
      anomaliesTotal,
      openAnomalies,
      agentsTotal,
      activeAgents,
      paymentsByStatusRaw,
      operationsByStatusRaw,
      anomaliesBySeverityRaw,
      amountPaidRaw,
      plannedAmountRaw,
      operationsRecent,
    ] = await Promise.all([
      this.prisma.beneficiary.count({ where: { deletedAt: null } }),
      this.prisma.beneficiary.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.socialProgram.count({ where: programWhere }),
      this.prisma.paymentOperation.count({ where: operationWhere }),
      this.prisma.paymentOperation.count({
        where: { ...operationWhere, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.payment.count({ where: paymentWhere }),
      this.prisma.payment.count({ where: { ...paymentWhere, status: 'PAID' } }),
      this.prisma.payment.count({ where: { ...paymentWhere, status: 'PENDING' } }),
      this.prisma.anomaly.count(),
      this.prisma.anomaly.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      this.prisma.agent.count({ where: { deletedAt: null } }),
      this.prisma.agent.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.payment.groupBy({ by: ['status'], where: paymentWhere, _count: { id: true } }),
      this.prisma.paymentOperation.groupBy({
        by: ['status'],
        where: operationWhere,
        _count: { id: true },
      }),
      this.prisma.anomaly.groupBy({ by: ['severity'], _count: { id: true } }),
      this.prisma.payment.aggregate({
        where: { ...paymentWhere, status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.paymentOperation.aggregate({
        where: operationWhere,
        _sum: { plannedAmount: true },
      }),
      this.prisma.paymentOperation.findMany({
        where: operationWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          executionRate: true,
          createdAt: true,
          socialProgram: { select: { name: true } },
          region: { select: { name: true } },
        },
      }),
    ]);

    const effectivePeriod = period ?? 'LAST_12_MONTHS';
    const analytics = await this.computeAnalytics(effectivePeriod, demoOnly);

    const totalAmountPaid = amountPaidRaw._sum.amount?.toString() ?? '0';
    const totalAmountPlanned = plannedAmountRaw._sum.plannedAmount?.toString() ?? '0';
    const executionRate = computeExecutionRatePercent(
      Number(totalAmountPaid),
      Number(totalAmountPlanned),
    );

    return {
      beneficiariesTotal,
      activeBeneficiaries,
      programsTotal,
      operationsTotal,
      openOperations,
      paymentsTotal,
      paidPayments,
      pendingPayments,
      totalAmountPaid,
      totalAmountPlanned,
      executionRate,
      anomaliesTotal,
      openAnomalies,
      agentsTotal,
      activeAgents,
      paymentsByStatus: paymentsByStatusRaw.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      operationsByStatus: operationsByStatusRaw.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      anomaliesBySeverity: anomaliesBySeverityRaw.map((r) => ({
        severity: r.severity,
        count: r._count.id,
      })),
      operationsRecent: operationsRecent.map((op) => ({
        id: op.id,
        name: op.name,
        code: op.code,
        status: op.status,
        executionRate: op.executionRate.toString(),
        programName: op.socialProgram?.name ?? null,
        regionName: op.region?.name ?? null,
        createdAt: op.createdAt,
      })),
      analytics,
    };
  }

  async computeAnalytics(period: DashboardPeriod, demoOnly = false): Promise<AnalyticsDto> {
    const { start, end } = computePeriodRange(period);

    const [beneficiariesByRegion, paymentsByRegion, paymentsByMonthRaw] =
      await Promise.all([
        this.getBeneficiariesByRegion(),
        this.getPaymentsByRegion(start, end, demoOnly),
        this.getPaymentsByMonth(start, end, demoOnly),
      ]);

    const allMonths = generateMonthBuckets(start, end);
    const monthMap = new Map(paymentsByMonthRaw.map((m) => [m.month, m]));
    const paymentsByMonth: MonthPaymentDto[] = allMonths.map((month) => {
      const existing = monthMap.get(month);
      return existing ?? { month, paidPayments: 0, totalAmountPaid: '0' };
    });

    const monthPaidCount = paymentsByMonth.reduce((s, m) => s + m.paidPayments, 0);
    const monthPaidAmount = sumDecimalStrings(paymentsByMonth.map((m) => m.totalAmountPaid));

    const regionPaidCount = paymentsByRegion.reduce((s, r) => s + r.paidPayments, 0);
    const regionPaidAmount = sumDecimalStrings(paymentsByRegion.map((r) => r.totalAmountPaid));

    if (monthPaidCount !== regionPaidCount) {
      throw new InternalServerErrorException(
        `Reconciliation failure: monthly paid count (${monthPaidCount}) ≠ regional paid count (${regionPaidCount}) for period ${period}`,
      );
    }
    if (monthPaidAmount !== regionPaidAmount) {
      throw new InternalServerErrorException(
        `Reconciliation failure: monthly paid amount (${monthPaidAmount}) ≠ regional paid amount (${regionPaidAmount}) for period ${period}`,
      );
    }

    return {
      period: {
        key: period,
        label: PERIOD_LABELS[period],
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
      periodTotals: {
        paidPayments: monthPaidCount,
        totalAmountPaid: monthPaidAmount,
      },
      beneficiariesByRegion,
      paymentsByRegion,
      paymentsByMonth,
    };
  }

  // Prisma cannot groupBy through nested locality→commune→moughataa→region,
  // so we use parameterized raw SQL for geographic aggregations.

  private async getBeneficiariesByRegion(): Promise<RegionBeneficiaryDto[]> {
    const rows = await this.prisma.$queryRaw<
      { region_code: string | null; region_name: string | null; cnt: bigint }[]
    >(Prisma.sql`
      SELECT
        r.code   AS region_code,
        r.name   AS region_name,
        COUNT(b.id) AS cnt
      FROM beneficiaries b
      LEFT JOIN localities l   ON l.id = b.locality_id
      LEFT JOIN communes c     ON c.id = l.commune_id
      LEFT JOIN moughataas m   ON m.id = c.moughataa_id
      LEFT JOIN regions r      ON r.id = m.region_id
      WHERE b.deleted_at IS NULL
        AND b.status = 'ACTIVE'
      GROUP BY r.code, r.name
      ORDER BY cnt DESC
    `);

    return rows.map((r) => ({
      regionCode: r.region_code ?? 'UNKNOWN',
      regionName: r.region_name ?? 'Sans région renseignée',
      activeBeneficiaries: Number(r.cnt),
    }));
  }

  private async getPaymentsByRegion(
    start: Date,
    end: Date,
    demoOnly = false,
  ): Promise<RegionPaymentDto[]> {
    const demoFilter = demoOnly
      ? Prisma.sql`AND po.code LIKE ${MINISTERIAL_DEMO_CODE_PREFIX + '%'}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        region_code: string | null;
        region_name: string | null;
        cnt: bigint;
        total: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        r.code   AS region_code,
        r.name   AS region_name,
        COUNT(p.id) AS cnt,
        COALESCE(SUM(p.amount), 0)::text AS total
      FROM payments p
      JOIN beneficiaries b        ON b.id = p.beneficiary_id
      JOIN payment_operations po  ON po.id = p.payment_operation_id
      LEFT JOIN localities l   ON l.id = b.locality_id
      LEFT JOIN communes c     ON c.id = l.commune_id
      LEFT JOIN moughataas m   ON m.id = c.moughataa_id
      LEFT JOIN regions r      ON r.id = m.region_id
      WHERE p.status = 'PAID'
        AND p.paid_at >= ${start}
        AND p.paid_at <= ${end}
        ${demoFilter}
      GROUP BY r.code, r.name
      ORDER BY cnt DESC
    `);

    return rows.map((r) => ({
      regionCode: r.region_code ?? 'UNKNOWN',
      regionName: r.region_name ?? 'Sans région renseignée',
      paidPayments: Number(r.cnt),
      totalAmountPaid: r.total ?? '0',
    }));
  }

  private async getPaymentsByMonth(
    start: Date,
    end: Date,
    demoOnly = false,
  ): Promise<MonthPaymentDto[]> {
    const demoFilter = demoOnly
      ? Prisma.sql`AND po.code LIKE ${MINISTERIAL_DEMO_CODE_PREFIX + '%'}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { month: string; cnt: bigint; total: string | null }[]
    >(Prisma.sql`
      SELECT
        TO_CHAR(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
        COUNT(p.id) AS cnt,
        COALESCE(SUM(p.amount), 0)::text AS total
      FROM payments p
      JOIN payment_operations po ON po.id = p.payment_operation_id
      WHERE p.status = 'PAID'
        AND p.paid_at IS NOT NULL
        AND p.paid_at >= ${start}
        AND p.paid_at <= ${end}
        ${demoFilter}
      GROUP BY TO_CHAR(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM')
      ORDER BY month
    `);

    return rows.map((r) => ({
      month: r.month,
      paidPayments: Number(r.cnt),
      totalAmountPaid: r.total ?? '0',
    }));
  }
}
