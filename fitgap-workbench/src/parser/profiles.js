// Template profiles: HOW blocks, headers and fields are detected in a capture
// sheet. Profile #1 = the current capture-sheet layout. A new client template
// is a new profile object (later created through a mapping UI), not new code.
// Everything is serialisable (regexes stored as source strings).

export const PROFILE_CAPTURE_SHEET_V1 = {
  id: 'capture-sheet-v1',
  name: 'Capture sheet (profile #1)',
  mainSheet: {
    include: '^fit-?gap',          // sheet name starts with Fit-Gap / Fit-gap (trailing spaces trimmed)
    exclude: '(old|vold|_v\\d+)\\s*$',
    ignore: ['cover', '>>', 'sheet1', 'process capture'],
    flows: '^process flows?[_ ]',
  },
  headerRow: {
    anchor: 'process level',      // fuzzy, searched in the first N columns
    searchColumns: 12,
    searchRows: 30,
    bandAbove: 6,                 // rows above the header that may carry titles / entity labels
    maxTitleLength: 80,           // longer cells are prose (sheet instructions), never block titles
  },
  core: {
    level: ['process level', 'level'],
    id: ['process id', 'id', 'process identifier'],
    name: ['process', 'process name', 'name'],
    description: ['activity description', 'description', 'activity'],
  },
  dataRow: {
    levelMin: 0,
    levelMax: 5,
    idPattern: '^(R2R|A2R|I2P|I2C|ICO)\\b',
    activityLevels: [4, 5],
  },
  blocks: {
    TOBE: {
      titles: ['^to.?be process'],
      perEntity: false,
      fields: {
        le: ['le', 'le y/n', 'le (y/n)', 'local entity', 'country'],
        gbs: ['gbs', 'gbs (y/n)'],
        system: ['system', 'systems', 'used systems', 'to-be system'],
        initiative: ['planned initiative', 'initiative', 'initiatives'],
      },
    },
    ASIS: {
      titles: ['^(pre.?filled )?as.?is process spec', '^pre.?filled as.?is'],
      subHeaders: ['^activity split as.?is'],   // R2R has no block title – detect by sub-header
      perEntity: true,
      fields: {
        le: ['le/country/other', 'le country other', 'le', 'country', 'other', 'le/country/other (y/n)'],
        gbs: ['gbs', 'gbs (y/n)'],
        systems: ['used systems', 'systems', 'system'],
        gap: ['gap', 'gap type', 'gap assessment'],
        info: ['additional information', 'additional info', 'comment', 'comments', 'remarks', 'information'],
      },
    },
    FITGAP: {
      titles: ['^fit.?gap as+e?s+ment'],       // also "ASSSSMENT"
      perEntity: true,
      fields: {
        local: ['local accounting', 'local accounting (y/n)', 'local', 'le'],
        other: ['other', 'other (y/n)', 'other party'],
        gbs: ['gbs', 'gbs (y/n)'],
        fte: ['fte', 'fte (#)', 'effort fte', 'fte effort'],
      },
    },
    DETAILED: {
      titles: ['^detailed gap'],
      perEntity: true,
      fields: {
        itSystems: ['it systems', 'it system', 'systems', 'system'],
        workflowTools: ['workflow tools', 'workflow tool', 'workflow', 'tools'],
        currentProcess: ['current process', 'country specifics', 'current process (country specifics)', 'process specifics'],
        externalParty: ['external party', 'external parties', 'external'],
        languageRequirements: ['language requirements', 'language requirement', 'language'],
        legalRegulatory: ['legal/regulatory', 'legal regulatory', 'legal', 'regulatory', 'legal / regulatory'],
        internalControls: ['internal controls', 'internal control', 'controls', 'icfr'],
      },
    },
    SPEC: { titles: ['^process \\(?specific\\)? information', '^process information'], perEntity: false, fields: {} },
    AUTOMATION: { titles: ['^automation analysis'], perEntity: false, fields: {} },
    CHANGE: { titles: ['^change impact'], perEntity: false, fields: {} },
    RACI: { titles: ['^raci'], perEntity: false, fields: {} },
  },
  entityLabel: {
    codePattern: '(?:^|[^\\d])(\\d{6})(?!\\d)',
    legalForms: ['sas', 'sa', 'sarl', 'sasu', 'gmbh', 'ag', 'ltd', 'limited', 'bv', 'nv', 'inc', 'llc', 'spa', 'srl', 'sl', 'plc', 'co', 'kg', 'oy', 'ab', 'as', 'sp z oo', 'kft', 'sro'],
  },
  values: {
    outOfScope: ['out of scope', 'oos', 'not in scope'],
  },
};

export const PROFILES = { [PROFILE_CAPTURE_SHEET_V1.id]: PROFILE_CAPTURE_SHEET_V1 };
export const DEFAULT_PROFILE_ID = PROFILE_CAPTURE_SHEET_V1.id;
