import { permissions } from './permissions.data';

// Institutional role model (INSTITUTIONAL-RBAC-2): the web platform has
// exactly three login roles — ADMIN_TAAZOUR, PROGRAMME, OPERATOR. AGENT is
// NOT a web platform role: it exists only so field/tablet accounts can
// authenticate against the same API to submit field payment validations and
// offline sync batches (there is no separate device-auth mechanism yet).
// AGENT must never be offered as a role choice in any web user-management UI.

export interface RoleSeed {
  name: string;
  description: string;
  permissionCodes: string[];
  // Structural web/field role boundary. true = selectable/visible as an
  // institutional web platform role; false = internal field/device
  // technical role (must never appear in web role listings or
  // user-management assignment flows).
  isWebRole: boolean;
}

const allPermissionCodes = permissions.map((p) => p.code);

// ADMIN_TAAZOUR: full access — the only role that can create/update
// beneficiaries, view sensitive identity data (NNI), create/update
// programmes, assign operations to operators, and view all reports/audit.
const adminTaazourPermissionCodes = allPermissionCodes;

// PROGRAMME: scoped to one or more programmes (enforced via
// UserProgrammeScope, not via permission strings). Can view its own
// programme's operations/beneficiaries (identity fields masked), cannot
// manage global users, cannot manage operators.
const programmePermissionCodes = [
  'programs.read',
  'operations.read',
  'operations.update',
  'operations.open',
  'operations.close',
  'beneficiaries.read',
  'operators.read',
  'anomalies.read',
  'reports.read',
  'reports.export',
  'audit.read',
  'geography.read',
];

// OPERATOR: scoped to exactly one operator (User.operatorId). Can view only
// payment operations/beneficiaries/payments assigned to that operator;
// cannot browse the full citizen registry, cannot create beneficiaries,
// cannot manage other operators.
const operatorPermissionCodes = [
  'operations.read',
  'beneficiaries.read',
  'payments.read',
  'agents.read',
  'agents.assign',
  'devices.read',
  'anomalies.read',
  'reports.read',
];

// AGENT (field/tablet, NOT a web role): only the two write permissions
// needed to submit field payment validations and offline sync batches.
// Deliberately excludes operations.read/beneficiaries.read/payments.read:
// AGENT must never be able to browse the operations/beneficiaries/payments
// registries (that would leak "web dashboard"-style read access to a
// non-web technical role) — payments.validate and sync.process each
// resolve the specific record(s) they act on server-side, by id, and do
// not require list/browse permissions.
const agentPermissionCodes = ['payments.validate', 'sync.process'];

export const roles: RoleSeed[] = [
  {
    name: 'ADMIN_TAAZOUR',
    description: 'TAAZOUR / PNRSCS central administration — full platform access',
    permissionCodes: adminTaazourPermissionCodes,
    isWebRole: true,
  },
  {
    name: 'PROGRAMME',
    description: 'Scoped to one or more social programmes; manages that programme\'s operations',
    permissionCodes: programmePermissionCodes,
    isWebRole: true,
  },
  {
    name: 'OPERATOR',
    description: 'Scoped to one contracted payment/distribution operator',
    permissionCodes: operatorPermissionCodes,
    isWebRole: true,
  },
  {
    name: 'AGENT',
    description:
      'Field/tablet account for payment validation and offline sync only. Not a web platform login role — never exposed as a selectable role in user management UI.',
    permissionCodes: agentPermissionCodes,
    isWebRole: false,
  },
];

export const WEB_ROLE_NAMES = roles.filter((r) => r.isWebRole).map((r) => r.name);
