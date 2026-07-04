import { OperationStatus } from '../../generated/prisma/client';

// Statuses in which an operation's fields may be edited via PATCH.
export const EDITABLE_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.DRAFT,
  OperationStatus.SUSPENDED,
]);

// Statuses from which an operation may be opened.
export const OPENABLE_FROM: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.VALIDATED,
  OperationStatus.SUSPENDED,
]);

// Statuses from which an operation may be closed.
export const CLOSABLE_FROM: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.IN_PROGRESS,
]);

// Statuses in which beneficiaries may be assigned to / excluded from an
// operation.
export const ASSIGNABLE_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.DRAFT,
  OperationStatus.VALIDATED,
]);

export const ALLOWED_TRANSITIONS: Readonly<
  Record<OperationStatus, readonly OperationStatus[]>
> = {
  DRAFT: [OperationStatus.VALIDATED, OperationStatus.ARCHIVED],
  VALIDATED: [OperationStatus.OPEN, OperationStatus.ARCHIVED],
  OPEN: [OperationStatus.IN_PROGRESS, OperationStatus.SUSPENDED],
  IN_PROGRESS: [OperationStatus.SUSPENDED, OperationStatus.CLOSED],
  SUSPENDED: [OperationStatus.OPEN, OperationStatus.IN_PROGRESS],
  CLOSED: [OperationStatus.ARCHIVED],
  ARCHIVED: [],
};

export function canEdit(status: OperationStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

export function canOpen(status: OperationStatus): boolean {
  return OPENABLE_FROM.has(status);
}

export function canClose(status: OperationStatus): boolean {
  return CLOSABLE_FROM.has(status);
}

export function canAssign(status: OperationStatus): boolean {
  return ASSIGNABLE_STATUSES.has(status);
}
