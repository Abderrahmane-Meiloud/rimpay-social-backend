// Minimal realistic Mauritanian geography sample (Nouakchott region).
// Codes are stable identifiers used for idempotent upserts.

export interface LocalitySeed {
  code: string;
  name: string;
}

export interface CommuneSeed {
  code: string;
  name: string;
  localities: LocalitySeed[];
}

export interface MoughataaSeed {
  code: string;
  name: string;
  communes: CommuneSeed[];
}

export interface RegionSeed {
  code: string;
  name: string;
  moughataas: MoughataaSeed[];
}

export const geography: RegionSeed[] = [
  {
    code: 'NKC',
    name: 'Nouakchott',
    moughataas: [
      {
        code: 'NKC-DN',
        name: 'Dar Naim',
        communes: [
          {
            code: 'NKC-DN-C1',
            name: 'Dar Naim Centre',
            localities: [
              { code: 'NKC-DN-C1-L1', name: 'Dar Naim Quartier 1' },
              { code: 'NKC-DN-C1-L2', name: 'Dar Naim Quartier 2' },
            ],
          },
        ],
      },
      {
        code: 'NKC-TVZ',
        name: 'Tevragh Zeina',
        communes: [
          {
            code: 'NKC-TVZ-C1',
            name: 'Tevragh Zeina Centre',
            localities: [
              { code: 'NKC-TVZ-C1-L1', name: 'Tevragh Zeina Quartier 1' },
              { code: 'NKC-TVZ-C1-L2', name: 'Tevragh Zeina Quartier 2' },
            ],
          },
        ],
      },
      {
        code: 'NKC-TY',
        name: 'Teyarett',
        communes: [
          {
            code: 'NKC-TY-C1',
            name: 'Teyarett Centre',
            localities: [
              { code: 'NKC-TY-C1-L1', name: 'Teyarett Quartier 1' },
              { code: 'NKC-TY-C1-L2', name: 'Teyarett Quartier 2' },
            ],
          },
        ],
      },
    ],
  },
];
