import { permissions } from './permissions.data';

// Role definitions and the permission codes assigned to each role.
// Kept conservative: only ADMIN receives every permission. Other roles
// receive the minimum set required for their responsibilities.

export interface RoleSeed {
  name: string;
  description: string;
  permissionCodes: string[];
}

const allPermissionCodes = permissions.map((p) => p.code);

const auditorPermissionCodes = [
  'audit.read',
  'reports.read',
  'anomalies.read',
  'beneficiaries.read',
  'payments.read',
  'operations.read',
  'geography.read',
];

const agentPermissionCodes = [
  'operations.read',
  'beneficiaries.read',
  'payments.read',
  'payments.validate',
  'sync.process',
];

const supervisorPermissionCodes = [
  'operations.read',
  'operations.update',
  'agents.read',
  'agents.assign',
  'beneficiaries.read',
  'payments.read',
  'anomalies.read',
  'anomalies.resolve',
  'reports.read',
  'sync.read',
  'geography.read',
];

const programManagerPermissionCodes = [
  'programs.read',
  'programs.create',
  'programs.update',
  'operations.read',
  'operations.create',
  'operations.update',
  'operations.open',
  'operations.close',
  'beneficiaries.read',
  'reports.read',
  'reports.export',
  'geography.read',
];

export const roles: RoleSeed[] = [
  {
    name: 'ADMIN',
    description: 'Full system access',
    permissionCodes: allPermissionCodes,
  },
  {
    name: 'PROGRAM_MANAGER',
    description: 'Manages social programs and payment operations',
    permissionCodes: programManagerPermissionCodes,
  },
  {
    name: 'SUPERVISOR',
    description: 'Operational oversight, agent assignment, anomaly resolution',
    permissionCodes: supervisorPermissionCodes,
  },
  {
    name: 'AGENT',
    description: 'Field agent with mobile/field-facing permissions',
    permissionCodes: agentPermissionCodes,
  },
  {
    name: 'AUDITOR',
    description: 'Read-only access to audit logs, reports, and anomalies',
    permissionCodes: auditorPermissionCodes,
  },
];
