import { OperationStatus, PaymentStatus } from '../../generated/prisma/client';

// Operation statuses from which planned payments may be generated. Generation
// is a read-mostly action on the operation: it materialises Payment rows but
// MUST NOT change the operation's own status (see PaymentsService.generate).
export const GENERATABLE_OPERATION_STATUSES: ReadonlySet<OperationStatus> =
  new Set([
    OperationStatus.DRAFT,
    OperationStatus.VALIDATED,
    OperationStatus.OPEN,
  ]);

// Payment statuses from which a payment may be cancelled in this phase. PAID is
// excluded (money disbursed, irreversible here) and CANCELLED is excluded
// (already terminal).
export const CANCELLABLE_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  PaymentStatus.PENDING,
  PaymentStatus.VALIDATED,
  PaymentStatus.REJECTED,
  PaymentStatus.CONFLICT,
]);

// Payment statuses that allow field validation. PAID and CANCELLED are terminal
// and must never be re-validated.
export const VALIDATABLE_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  PaymentStatus.PENDING,
  PaymentStatus.VALIDATED,
  PaymentStatus.REJECTED,
  PaymentStatus.CONFLICT,
]);

// Operation statuses that allow field agents to validate payments.
export const VALIDATABLE_OPERATION_STATUSES: ReadonlySet<OperationStatus> = new Set([
  OperationStatus.OPEN,
  OperationStatus.IN_PROGRESS,
]);

export function canGeneratePayments(status: OperationStatus): boolean {
  return GENERATABLE_OPERATION_STATUSES.has(status);
}

export function canCancelPayment(status: PaymentStatus): boolean {
  return CANCELLABLE_PAYMENT_STATUSES.has(status);
}

export function canValidatePayment(status: PaymentStatus): boolean {
  return VALIDATABLE_PAYMENT_STATUSES.has(status);
}

export function canValidateOnOperation(status: OperationStatus): boolean {
  return VALIDATABLE_OPERATION_STATUSES.has(status);
}
