// Initial social program definitions. No payment operations are seeded.

export interface SocialProgramSeed {
  code: string;
  name: string;
  type?: string;
  institution?: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  startDate: string;
  endDate: string;
}

export const socialPrograms: SocialProgramSeed[] = [
  {
    code: 'TEKAVOUL',
    name: 'Tekavoul',
    type: 'CASH_TRANSFER',
    institution: 'Taazour',
    description: 'National social safety net cash transfer program',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    endDate: '2028-12-31',
  },
  {
    code: 'ASSIST_SINISTRES',
    name: 'Assistance aux sinistres',
    type: 'EMERGENCY_RELIEF',
    institution: 'Taazour',
    description: 'Emergency assistance for disaster-affected households',
    status: 'DRAFT',
    startDate: '2026-01-01',
    endDate: '2027-12-31',
  },
  {
    code: 'DIST_ALIMENTAIRE',
    name: 'Distribution alimentaire',
    type: 'IN_KIND',
    institution: 'Taazour',
    description: 'Food distribution program for vulnerable households',
    status: 'DRAFT',
    startDate: '2026-01-01',
    endDate: '2027-12-31',
  },
];
