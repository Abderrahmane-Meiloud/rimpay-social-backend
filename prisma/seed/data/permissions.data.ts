// Permission definitions, grouped by domain for readability and for use
// when assigning permissions to roles. The `group` field is seed-data-only
// metadata and is not persisted to the database.

export interface PermissionSeed {
  code: string;
  description: string;
  group: string;
}

export const permissions: PermissionSeed[] = [
  // Beneficiaries
  { code: 'beneficiaries.read', description: 'View beneficiaries', group: 'beneficiaries' },
  { code: 'beneficiaries.create', description: 'Create beneficiaries', group: 'beneficiaries' },
  { code: 'beneficiaries.update', description: 'Update beneficiaries', group: 'beneficiaries' },
  { code: 'beneficiaries.delete', description: 'Deactivate/remove beneficiaries', group: 'beneficiaries' },

  // Geography
  { code: 'geography.read', description: 'View geographic reference data', group: 'geography' },
  { code: 'geography.manage', description: 'Manage geographic reference data', group: 'geography' },

  // Social Programs
  { code: 'programs.read', description: 'View social programs', group: 'programs' },
  { code: 'programs.create', description: 'Create social programs', group: 'programs' },
  { code: 'programs.update', description: 'Update social programs', group: 'programs' },

  // Payment Operations
  { code: 'operations.read', description: 'View payment operations', group: 'operations' },
  { code: 'operations.create', description: 'Create payment operations', group: 'operations' },
  { code: 'operations.update', description: 'Update payment operations', group: 'operations' },
  { code: 'operations.open', description: 'Open a payment operation', group: 'operations' },
  { code: 'operations.close', description: 'Close a payment operation', group: 'operations' },

  // Agents / Devices
  { code: 'agents.read', description: 'View field agents', group: 'agents' },
  { code: 'agents.create', description: 'Create field agents', group: 'agents' },
  { code: 'agents.update', description: 'Update field agents', group: 'agents' },
  { code: 'agents.assign', description: 'Assign agents to operations or geographic areas', group: 'agents' },
  { code: 'devices.read', description: 'View devices', group: 'devices' },
  { code: 'devices.manage', description: 'Manage devices', group: 'devices' },

  // Payments
  { code: 'payments.read', description: 'View payments', group: 'payments' },
  { code: 'payments.validate', description: 'Validate payments in the field', group: 'payments' },
  { code: 'payments.cancel', description: 'Cancel payments', group: 'payments' },

  // Offline Sync
  { code: 'sync.read', description: 'View sync batches and items', group: 'sync' },
  { code: 'sync.process', description: 'Submit and process offline sync batches', group: 'sync' },

  // Anomalies
  { code: 'anomalies.read', description: 'View anomalies', group: 'anomalies' },
  { code: 'anomalies.resolve', description: 'Resolve or dismiss anomalies', group: 'anomalies' },

  // Reports
  { code: 'reports.read', description: 'View generated reports', group: 'reports' },
  { code: 'reports.export', description: 'Generate and export reports', group: 'reports' },

  // Audit
  { code: 'audit.read', description: 'View audit logs', group: 'audit' },

  // Users / RBAC
  { code: 'users.read', description: 'View users', group: 'users' },
  { code: 'users.create', description: 'Create users', group: 'users' },
  { code: 'users.update', description: 'Update users', group: 'users' },
  { code: 'users.manage_roles', description: 'Assign or revoke roles for users', group: 'users' },
];
