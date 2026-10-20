/* ---------------------------------------------------------------------------
 * 10-profile.js – template profiles. A profile describes HOW a capture-sheet
 * layout is detected: main-sheet rules, header row, block titles, field
 * synonyms, value normalisation. Profile #1 = the pilot capture sheet.
 * A new client template = a new profile object, not new parser code.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});

  const PROFILE_1 = {
    id: 'profile-1',
    name: 'Capture sheet – pilot layout (profile #1)',
    version: 1,

    sheets: {
      /** main sheet = name starts with Fit-Gap / Fit-gap (trailing spaces exist) */
      mainPrefix: /^\s*fit-?\s?gap/i,
      /** ignore old copies */
      ignoreSuffix: /(old|vold|_v\d+)\s*$/i,
      flowPrefix: /^\s*process\s*flows?[_\s-]/i,
      ignoreNames: /^(cover|>>|sheet\d*|process capture)\s*$/i,
    },

    header: {
      /** the header row is the row whose "id column" cell equals this */
      levelHeader: 'Process Level',
      /** preferred id column (0-based B); scanned across columns as fallback */
      preferredCol: 1,
      /** max rows to scan for the header */
      scanRows: 40,
      /** rows above the header that carry block titles / entity labels / sub-headers */
      titleRows: 3,
      idColumns: {
        level: ['Process Level', 'Level'],
        id: ['Process ID', 'ID'],
        name: ['Process', 'Process name', 'Activity'],
        description: ['Activity description', 'Description'],
      },
    },

    rows: {
      /** data row = level numeric 0–5 AND id matches this */
      idPattern: /^(R2R|A2R|I2P|I2C|ICO)\b/i,
      activityLevel: 4, // levels >= this are activities, below are hierarchy nodes
      maxLevel: 5,
    },

    /** Stream from id prefix; sub-streams from L1/L2 names */
    streams: {
      fromId: /^([A-Z0-9]{3})/i,
      subStreams: {
        A2R: [
          { key: 'A2R-FAA', label: 'A2R – Fixed Asset Accounting', match: /fixed\s*asset|asset\s*account|\bFAA\b/i },
          { key: 'A2R-IA', label: 'A2R – Inventory Accounting', match: /inventor|\bIA\b/i },
        ],
      },
      masterData: /master\s*data/i,
    },

    /**
     * Blocks. `titles` are matched fuzzily against cells in the title rows.
     * perEntity blocks repeat per entity; shared blocks exist once.
     * `fields` map model keys to sub-header synonyms (fuzzy contains / similarity).
     * `markers`: sub-header texts that identify an untitled column run as this
     * block (R2R has no AS-IS title – it starts with "Activity Split As-is").
     */
    blocks: [
      {
        key: 'toBe', label: 'To-Be', perEntity: false,
        titles: ['TO BE PROCESS SPECIFIC INFORMATION', 'TO-BE PROCESS SPECIFIC INFORMATION', 'TO BE PROCESS INFORMATION'],
        markers: ['Activity Split To-be', 'To-be'],
        fields: {
          le: ['LE', 'LE/Country', 'Legal Entity', 'Country', 'Local'],
          gbs: ['GBS'],
          system: ['System', 'Used System', 'Systems', 'Tool'],
          initiative: ['Planned initiative', 'Initiative'],
        },
      },
      {
        key: 'asIs', label: 'Ops as-is pre-assessment', perEntity: true,
        titles: ['PRE-FILLED AS-IS PROCESS SPECIFICATION', 'PRE-FILLED AS IS PROCESS SPECIFICATION', 'AS-IS PROCESS SPECIFICATION'],
        markers: ['Activity Split As-is', 'As-is'],
        fields: {
          le: ['LE/Country/Other', 'LE / Country / Other', 'LE', 'Country', 'Local'],
          gbs: ['GBS'],
          systems: ['Used Systems', 'Systems', 'System'],
          gap: ['GAP', 'Gap type'],
          info: ['Additional Information', 'Additional Info', 'Comment', 'Comments', 'Remarks'],
        },
      },
      {
        key: 'fitGap', label: 'Fit-Gap Assessment', perEntity: true,
        titles: ['FIT-GAP ASSESSMENT', 'FIT-GAP ASSSSMENT', 'FIT GAP ASSESSMENT', 'FITGAP ASSESSMENT'],
        markers: ['Fit-Gap'],
        fields: {
          local: ['Local Accounting', 'Local Accounting (Y/N)', 'Local'],
          other: ['Other', 'Other (Y/N)'],
          gbs: ['GBS', 'GBS (Y/N)'],
          fte: ['FTE', 'FTE (Y/N)', 'FTEs'],
        },
      },
      {
        key: 'detailedGap', label: 'Detailed Gap Assessment', perEntity: true,
        titles: ['DETAILED GAP ASSESSMENT', 'DETAILED GAP ASSSSMENT', 'DETAILED GAP'],
        markers: ['Detailed Gap'],
        fields: {
          itSystems: ['IT Systems', 'IT System', 'Systems'],
          workflowTools: ['Workflow Tools', 'Workflow Tool', 'Workflow'],
          currentProcess: ['Current Process', 'Current Process (country specifics)', 'Country specifics', 'Process specifics'],
          externalParty: ['External Party', 'External Parties', 'Third party'],
          language: ['Language requirements', 'Language requirement', 'Language'],
          legal: ['Legal/Regulatory', 'Legal / Regulatory', 'Legal', 'Regulatory'],
          controls: ['Internal Controls', 'Internal Control', 'Controls', 'ICS'],
        },
      },
      { key: 'processSpec', label: 'Process specific information', perEntity: false, free: true,
        titles: ['PROCESS (SPECIFIC) INFORMATION (IF NEEDED)', 'PROCESS SPECIFIC INFORMATION', 'PROCESS INFORMATION (IF NEEDED)'] },
      { key: 'automation', label: 'Automation analysis', perEntity: false, free: true,
        titles: ['AUTOMATION ANALYSIS'] },
      { key: 'changeImpact', label: 'Change impact analysis', perEntity: false, free: true,
        titles: ['CHANGE IMPACT ANALYSIS'] },
      { key: 'raci', label: 'RACI', perEntity: false, free: true,
        titles: ['RACI Matrix', 'RACI'] },
    ],

    /** Entity label = 6-digit code + name; suffixes in parentheses stripped. */
    entity: {
      pattern: /(\d{6})\s*[-–:]?\s*(.+)/,
      stripParens: /\s*\([^)]*\)\s*/g,
      /** text in title rows that is NOT an entity even though it is not a block title */
      ignore: /^(entity|legal entity|le|country|all entities)$/i,
    },

    values: {
      yes: /^(y|yes|x|✓|true|1)$/i,
      no: /^(n|no|false|0|-)$/i,
      na: /^(n\/?a|not applicable|none)$/i,
      outOfScope: /^out\s*of\s*scope\b/i,
      /** cell content that is an instruction, not a value → note + flag */
      instruction: [/to be copied/i, /to be filled/i, /^please\b/i, /fill in\b/i, /copy (this|the)\b/i, /see (sheet|tab)\b/i],
      gap: [
        { code: 'OUT_OF_SCOPE', test: /outofscope/ },
        { code: 'BOTH', test: /both/ },
        { code: 'NO_GAP', test: /^(nogap|nogaps|no|fit|none)$/ },
        { code: 'HARMONIZATION', test: /^harm/ },     // HARMONIZATION, HARMINIZATION, harmonisation gap
        { code: 'STANDARDIZATION', test: /^stand/ },
        { code: 'NA', test: /^(na|notapplicable)$/ },
        { code: 'UNCLEAR', test: /^(unclear|tbd|tbc|open|\?)$/ },
      ],
    },
  };

  FG.profiles = { 'profile-1': PROFILE_1 };
  FG.defaultProfile = PROFILE_1;

  FG.GAP_TYPES = {
    NO_GAP: { label: 'NO GAP', short: 'NO GAP', color: 'var(--gap-none)', order: 0 },
    HARMONIZATION: { label: 'HARMONIZATION GAP', short: 'HARMON.', color: 'var(--gap-harm)', order: 1 },
    STANDARDIZATION: { label: 'STANDARDIZATION GAP', short: 'STANDARD.', color: 'var(--gap-stand)', order: 2 },
    BOTH: { label: 'BOTH GAPS', short: 'BOTH', color: 'var(--gap-both)', order: 3 },
    NA: { label: 'N/A', short: 'N/A', color: 'var(--gap-na)', order: 4 },
    OUT_OF_SCOPE: { label: 'OUT OF SCOPE', short: 'OOS', color: 'var(--gap-oos)', order: 5 },
    UNCLEAR: { label: 'UNCLEAR', short: '?', color: 'var(--gap-unclear)', order: 6 },
    EMPTY: { label: 'NOT PRE-ASSESSED', short: '–', color: 'var(--none)', order: 7 },
  };

  FG.GAP_DEFINITIONS_DEFAULT = {
    NO_GAP: 'Entity already operates according to the global standard process.',
    HARMONIZATION: 'The activity split between country and GBS deviates from the global standard (who performs the activity). Dominant topic in transitions.',
    STANDARDIZATION: 'The way the activity is executed deviates from the global standard (how – process steps, systems, tools); mainly sits inside GBS. Candidate for PE / WP3 initiatives.',
    BOTH: 'Harmonization and standardization gap apply.',
    NA: 'Not applicable for this entity.',
    OUT_OF_SCOPE: 'Activity is out of scope for this entity – excluded from progress, time budget and analysis.',
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
