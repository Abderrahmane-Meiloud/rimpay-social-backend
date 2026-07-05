import { Prisma, ContactType } from '../../generated/prisma/client';
import {
  BeneficiaryDetailDto,
  BeneficiaryListItemDto,
} from './dto/beneficiary-response.dto';

// Shared include for list rows: locality hierarchy + primary contact only.
export const beneficiaryListInclude = {
  locality: {
    include: {
      commune: {
        include: {
          moughataa: {
            include: { region: true },
          },
        },
      },
    },
  },
  contacts: {
    where: { type: ContactType.PRIMARY },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} satisfies Prisma.BeneficiaryInclude;

export type BeneficiaryListRow = Prisma.BeneficiaryGetPayload<{
  include: typeof beneficiaryListInclude;
}>;

// Full include for detail view.
export const beneficiaryDetailInclude = {
  locality: {
    include: {
      commune: {
        include: {
          moughataa: {
            include: { region: true },
          },
        },
      },
    },
  },
  contacts: { orderBy: { createdAt: 'asc' } },
  documents: { orderBy: { createdAt: 'desc' } },
  histories: { orderBy: { createdAt: 'desc' }, take: 10 },
} satisfies Prisma.BeneficiaryInclude;

export type BeneficiaryDetailRow = Prisma.BeneficiaryGetPayload<{
  include: typeof beneficiaryDetailInclude;
}>;

export interface AnomaliesSummary {
  open: number;
  total: number;
}

export interface PaymentSummary {
  total: number;
  paid: number;
  pending: number;
  lastPaidAt: Date | null;
}

// deletedAt is intentionally never mapped into any response. `nni` is masked
// to null unless the caller holds beneficiaries.read_sensitive (see
// beneficiaries.service.ts) — only ADMIN_TAAZOUR does in the institutional
// role model.
export function toBeneficiaryListItem(
  row: BeneficiaryListRow,
  canViewSensitive: boolean,
): BeneficiaryListItemDto {
  const commune = row.locality.commune;
  const moughataa = commune.moughataa;
  const region = moughataa.region;
  const primary = row.contacts[0];

  return {
    id: row.id,
    registryCode: row.registryCode,
    fullName: row.fullName,
    nni: canViewSensitive ? row.nni : null,
    status: row.status,
    locality: { id: row.locality.id, name: row.locality.name, code: row.locality.code },
    commune: { id: commune.id, name: commune.name, code: commune.code },
    moughataa: { id: moughataa.id, name: moughataa.name, code: moughataa.code },
    region: { id: region.id, name: region.name, code: region.code },
    primaryContact: primary
      ? { phone: primary.phone, ownerName: primary.ownerName }
      : null,
    createdAt: row.createdAt,
  };
}

export function toBeneficiaryDetail(
  row: BeneficiaryDetailRow,
  anomaliesSummary: AnomaliesSummary,
  paymentSummary: PaymentSummary,
  canViewSensitive: boolean,
): BeneficiaryDetailDto {
  const commune = row.locality.commune;
  const moughataa = commune.moughataa;
  const region = moughataa.region;
  const primary =
    row.contacts.find((c) => c.type === ContactType.PRIMARY) ?? row.contacts[0];

  return {
    id: row.id,
    registryCode: row.registryCode,
    fullName: row.fullName,
    nni: canViewSensitive ? row.nni : null,
    status: row.status,
    locality: { id: row.locality.id, name: row.locality.name, code: row.locality.code },
    commune: { id: commune.id, name: commune.name, code: commune.code },
    moughataa: { id: moughataa.id, name: moughataa.name, code: moughataa.code },
    region: { id: region.id, name: region.name, code: region.code },
    primaryContact: primary
      ? { phone: primary.phone, ownerName: primary.ownerName }
      : null,
    createdAt: row.createdAt,
    gender: row.gender,
    birthDate: row.birthDate,
    source: row.source,
    notes: row.notes,
    updatedAt: row.updatedAt,
    contacts: row.contacts.map((c) => ({
      id: c.id,
      type: c.type,
      phone: c.phone,
      ownerName: c.ownerName,
      isVerified: c.isVerified,
    })),
    documents: row.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileReference: d.fileReference,
      notes: d.notes,
      createdAt: d.createdAt,
    })),
    recentHistories: row.histories.map((h) => ({
      id: h.id,
      reason: h.reason,
      changedById: h.changedById,
      createdAt: h.createdAt,
    })),
    anomaliesSummary,
    paymentSummary,
  };
}
