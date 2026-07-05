// ============================================================================
// Ministerial demo dataset — "Programme National de Soutien Familial —
// Démonstration".
//
// EVERY value in this file is entirely fictional. Names, phone numbers,
// national ID numbers (NNI), addresses, and payment references are
// deliberately invented for presentation purposes only and do not
// correspond to any real person, beneficiary, government account, or
// payment record. All demo-owned rows are namespaced under the
// "MDEMO-" code prefix so they can never collide with real production
// data and can be identified unambiguously as fictional.
// ============================================================================

export const DEMO_CODE_PREFIX = 'MDEMO';

// ----------------------------------------------------------------------------
// Geography — fictional-but-plausible Mauritanian administrative structure.
// Real region/moughataa/commune/locality names are used (these are public
// administrative divisions, not personal data), but all demo entities
// referencing them (beneficiaries, operations, agents) are fictional.
// ----------------------------------------------------------------------------

export interface DemoLocality {
  code: string;
  name: string;
}

export interface DemoCommune {
  code: string;
  name: string;
  localities: DemoLocality[];
}

export interface DemoMoughataa {
  code: string;
  name: string;
  communes: DemoCommune[];
}

export interface DemoRegion {
  code: string;
  name: string;
  moughataas: DemoMoughataa[];
}

export const demoGeography: DemoRegion[] = [
  {
    code: 'MDEMO-NKC',
    name: 'Nouakchott',
    moughataas: [
      {
        code: 'MDEMO-NKC-TVZ',
        name: 'Teyarett',
        communes: [
          {
            code: 'MDEMO-NKC-TVZ-C1',
            name: 'Teyarett Centre',
            localities: [
              { code: 'MDEMO-NKC-TVZ-L1', name: 'Teyarett Quartier 1' },
              { code: 'MDEMO-NKC-TVZ-L2', name: 'Teyarett Quartier 2' },
            ],
          },
        ],
      },
      {
        code: 'MDEMO-NKC-KSR',
        name: 'Ksar',
        communes: [
          {
            code: 'MDEMO-NKC-KSR-C1',
            name: 'Ksar Centre',
            localities: [
              { code: 'MDEMO-NKC-KSR-L1', name: 'Ksar Quartier 1' },
              { code: 'MDEMO-NKC-KSR-L2', name: 'Ksar Quartier 2' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'MDEMO-TRZ',
    name: 'Trarza',
    moughataas: [
      {
        code: 'MDEMO-TRZ-RSS',
        name: 'Rosso',
        communes: [
          {
            code: 'MDEMO-TRZ-RSS-C1',
            name: 'Rosso Ville',
            localities: [
              { code: 'MDEMO-TRZ-RSS-L1', name: 'Rosso Ville Nord' },
              { code: 'MDEMO-TRZ-RSS-L2', name: 'Rosso Ville Sud' },
            ],
          },
        ],
      },
      {
        code: 'MDEMO-TRZ-BOG',
        name: 'Boghé',
        communes: [
          {
            code: 'MDEMO-TRZ-BOG-C1',
            name: 'Boghé Centre',
            localities: [
              { code: 'MDEMO-TRZ-BOG-L1', name: 'Boghé Ville' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'MDEMO-ASB',
    name: 'Assaba',
    moughataas: [
      {
        code: 'MDEMO-ASB-KFA',
        name: 'Kiffa',
        communes: [
          {
            code: 'MDEMO-ASB-KFA-C1',
            name: 'Kiffa Centre',
            localities: [
              { code: 'MDEMO-ASB-KFA-L1', name: 'Kiffa Ville' },
              { code: 'MDEMO-ASB-KFA-L2', name: 'Kiffa Périphérie' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'MDEMO-BRK',
    name: 'Brakna',
    moughataas: [
      {
        code: 'MDEMO-BRK-ALG',
        name: 'Aleg',
        communes: [
          {
            code: 'MDEMO-BRK-ALG-C1',
            name: 'Aleg Centre',
            localities: [
              { code: 'MDEMO-BRK-ALG-L1', name: 'Aleg Ville' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'MDEMO-HEC',
    name: 'Hodh Ech Chargui',
    moughataas: [
      {
        code: 'MDEMO-HEC-NEM',
        name: 'Néma',
        communes: [
          {
            code: 'MDEMO-HEC-NEM-C1',
            name: 'Néma Centre',
            localities: [
              { code: 'MDEMO-HEC-NEM-L1', name: 'Néma Ville' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'MDEMO-DKN',
    name: 'Dakhlet Nouadhibou',
    moughataas: [
      {
        code: 'MDEMO-DKN-NDB',
        name: 'Nouadhibou',
        communes: [
          {
            code: 'MDEMO-DKN-NDB-C1',
            name: 'Nouadhibou Centre',
            localities: [
              { code: 'MDEMO-DKN-NDB-L1', name: 'Nouadhibou Ville' },
            ],
          },
        ],
      },
    ],
  },
];

// ----------------------------------------------------------------------------
// Social programme (single active programme, as required by the demo
// scenario).
// ----------------------------------------------------------------------------

export const demoProgram = {
  code: 'MDEMO-PNSF',
  name: 'Programme National de Soutien Familial — Démonstration',
  type: 'CASH_TRANSFER',
  institution: 'Ministère (Démonstration)',
  description:
    'Programme fictif de démonstration ministérielle — transferts monétaires réguliers aux ménages vulnérables. Toutes les données associées sont fictives.',
  status: 'ACTIVE' as const,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

// ----------------------------------------------------------------------------
// Payment operations — exactly one OPEN, one CLOSED (minimum required by the
// scenario). A third IN_PROGRESS operation is included to make the dashboard
// and reporting screens more representative of a real ministerial review.
// ----------------------------------------------------------------------------

export interface DemoOperation {
  code: string;
  name: string;
  period: string;
  status: 'OPEN' | 'CLOSED' | 'IN_PROGRESS';
  plannedAmount: number;
  regionCode: string;
}

export const demoOperations: DemoOperation[] = [
  {
    code: 'MDEMO-OP-T1-2026',
    name: 'Transfert Trimestre 1 2026 — Démonstration',
    period: 'T1 2026',
    status: 'CLOSED',
    plannedAmount: 4_500_000,
    regionCode: 'MDEMO-NKC',
  },
  {
    code: 'MDEMO-OP-T2-2026',
    name: 'Transfert Trimestre 2 2026 — Démonstration',
    period: 'T2 2026',
    status: 'OPEN',
    plannedAmount: 5_200_000,
    regionCode: 'MDEMO-TRZ',
  },
  {
    code: 'MDEMO-OP-URG-2026',
    name: 'Assistance Urgence 2026 — Démonstration',
    period: 'Mai 2026',
    status: 'IN_PROGRESS',
    plannedAmount: 2_100_000,
    regionCode: 'MDEMO-ASB',
  },
];

// ----------------------------------------------------------------------------
// Agents and devices (minimum 3 agents, 3 devices).
// ----------------------------------------------------------------------------

export interface DemoAgent {
  code: string;
  name: string;
  email: string;
  phone: string;
  deviceUid: string;
}

export const demoAgents: DemoAgent[] = [
  {
    code: 'MDEMO-AGT-001',
    name: 'Agent Démonstration Nouakchott',
    email: 'agent.demo.nkc@demo.rimpay.local',
    phone: '+222 00 00 00 01',
    deviceUid: 'MDEMO-DEV-001',
  },
  {
    code: 'MDEMO-AGT-002',
    name: 'Agent Démonstration Trarza',
    email: 'agent.demo.trz@demo.rimpay.local',
    phone: '+222 00 00 00 02',
    deviceUid: 'MDEMO-DEV-002',
  },
  {
    code: 'MDEMO-AGT-003',
    name: 'Agent Démonstration Assaba',
    email: 'agent.demo.asb@demo.rimpay.local',
    phone: '+222 00 00 00 03',
    deviceUid: 'MDEMO-DEV-003',
  },
];

// An unregistered device UID used only to construct the UNKNOWN_DEVICE
// anomaly narrative. No Device row is ever created for this UID.
export const DEMO_UNKNOWN_DEVICE_UID = 'MDEMO-DEV-UNKNOWN-999';

// ----------------------------------------------------------------------------
// Beneficiaries (minimum 60, fully fictional names and fictional NNI/phone
// values reserved in an obviously non-real numeric range).
// ----------------------------------------------------------------------------

export const DEMO_BENEFICIARY_COUNT = 62;

const demoFirstNames = [
  'Mohamed', 'Ahmed', 'Sidi', 'Oumar', 'Moussa', 'Abdallahi', 'Cheikh', 'Brahim',
  'Aicha', 'Fatimetou', 'Mariem', 'Khadijetou', 'Aminetou', 'Zeinabou', 'Salka', 'Mbarka',
];

const demoLastNames = [
  'Ould Démonstration', 'Mint Démonstration', 'Démo Fictif', 'Ould Présentation',
  'Mint Présentation', 'Démo Ministériel',
];

export interface DemoBeneficiarySeed {
  registryCode: string;
  fullName: string;
  nni: string;
  gender: 'M' | 'F';
  phone: string;
}

export function buildDemoBeneficiaries(): DemoBeneficiarySeed[] {
  const result: DemoBeneficiarySeed[] = [];
  for (let i = 0; i < DEMO_BENEFICIARY_COUNT; i++) {
    const first = demoFirstNames[i % demoFirstNames.length];
    const last = demoLastNames[i % demoLastNames.length];
    const gender: 'M' | 'F' = i % 2 === 0 ? 'M' : 'F';
    result.push({
      registryCode: `${DEMO_CODE_PREFIX}-BEN-${String(i + 1).padStart(4, '0')}`,
      fullName: `${first} ${last} ${i + 1}`,
      // Fictional NNI reserved in the 000... range, clearly not a real
      // Mauritanian national ID.
      nni: `0000${String(i + 1).padStart(7, '0')}`,
      gender,
      // Fictional phone number using the reserved "00 00" prefix — never a
      // real subscriber range.
      phone: `+222 00 ${String(10 + (i % 90)).padStart(2, '0')} ${String(10 + i).padStart(2, '0')}`,
    });
  }
  return result;
}

// ----------------------------------------------------------------------------
// Anomalies — exactly the 5 required narrative types, plus a couple of
// extras for a richer dashboard. Linked lazily to seeded entities at
// generation time (see seed-ministerial-demo.ts).
// ----------------------------------------------------------------------------

export type DemoAnomalyType =
  | 'MULTIPLE_PAYMENT'
  | 'MISSING_GPS'
  | 'GPS_OUT_OF_ZONE'
  | 'UNKNOWN_DEVICE'
  | 'AGENT_NOT_ASSIGNED';

export interface DemoAnomalyTemplate {
  type: DemoAnomalyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
  description: string;
}

export const demoAnomalyTemplates: DemoAnomalyTemplate[] = [
  {
    type: 'MULTIPLE_PAYMENT',
    severity: 'CRITICAL',
    status: 'OPEN',
    description:
      '[Démonstration] Paiement en double détecté pour le même bénéficiaire sur la même opération.',
  },
  {
    type: 'MISSING_GPS',
    severity: 'LOW',
    status: 'OPEN',
    description:
      '[Démonstration] Validation de paiement effectuée sans coordonnées GPS disponibles sur le terminal.',
  },
  {
    type: 'GPS_OUT_OF_ZONE',
    severity: 'MEDIUM',
    status: 'IN_REVIEW',
    description:
      "[Démonstration] Coordonnées GPS relevées en dehors de la zone géographique attendue pour l'opération.",
  },
  {
    type: 'UNKNOWN_DEVICE',
    severity: 'HIGH',
    status: 'OPEN',
    description:
      "[Démonstration] Terminal non enregistré a tenté une synchronisation avec un identifiant d'appareil inconnu.",
  },
  {
    type: 'AGENT_NOT_ASSIGNED',
    severity: 'CRITICAL',
    status: 'OPEN',
    description:
      "[Démonstration] Un agent a tenté de valider un paiement sur une opération à laquelle il n'est pas affecté.",
  },
  {
    type: 'MISSING_GPS',
    severity: 'LOW',
    status: 'RESOLVED',
    description:
      '[Démonstration] Coordonnées GPS manquantes — anomalie résolue après vérification terrain fictive.',
  },
];

// ----------------------------------------------------------------------------
// Demo accounts (one per required role). Passwords are never hardcoded here
// — they are generated at seed time and reported once via safe stdout only
// (see seed-ministerial-demo.ts), never logged in a retrievable/persistent
// way beyond the operator's own terminal.
// ----------------------------------------------------------------------------

export interface DemoAccountSeed {
  email: string;
  fullName: string;
  roleName: 'ADMIN_TAAZOUR' | 'PROGRAMME' | 'OPERATOR' | 'AGENT';
}

export const demoAccounts: DemoAccountSeed[] = [
  {
    email: 'demo.admin@demo.rimpay.local',
    fullName: 'Administrateur Démonstration',
    roleName: 'ADMIN_TAAZOUR',
  },
  {
    email: 'demo.programme@demo.rimpay.local',
    fullName: 'Responsable Programme Démonstration',
    roleName: 'PROGRAMME',
  },
  {
    email: 'demo.agent@demo.rimpay.local',
    fullName: 'Agent Terrain Démonstration',
    roleName: 'AGENT',
  },
  {
    email: 'demo.operateur@demo.rimpay.local',
    fullName: 'Opérateur Démonstration',
    roleName: 'OPERATOR',
  },
];
