// Domain constants. Pure data – no client-specific values anywhere in here.

export const STREAMS = ['R2R', 'A2R', 'I2P', 'I2C', 'ICO'];

// Sub-streams that can be toggled in scope separately. MD is a cross-stream
// session filter (master-data nodes of every stream), not a stream of its own.
export const SUB_STREAMS = ['R2R', 'A2R-FAA', 'A2R-IA', 'I2P', 'I2C', 'ICO', 'MD'];

export const GAP = {
  NO_GAP: 'NO_GAP',
  HARMONIZATION: 'HARMONIZATION',
  STANDARDIZATION: 'STANDARDIZATION',
  BOTH: 'BOTH',
  NA: 'NA',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  UNCLEAR: 'UNCLEAR',
};

export const GAP_LABEL = {
  NO_GAP: 'NO GAP',
  HARMONIZATION: 'HARMONIZATION',
  STANDARDIZATION: 'STANDARDIZATION',
  BOTH: 'BOTH GAPS',
  NA: 'N/A',
  OUT_OF_SCOPE: 'OUT OF SCOPE',
  UNCLEAR: 'UNCLEAR',
};

// Placeholder definitions – editable in settings, stored in the session.
export const GAP_DEFINITIONS = {
  NO_GAP: 'Entity already operates according to the global standard process.',
  HARMONIZATION: 'The activity split between country and GBS deviates from the global standard (who performs the activity).',
  STANDARDIZATION: 'The way the activity is executed deviates from the global standard (how – process steps, systems, tools). Candidate for PE / WP3 initiatives.',
  BOTH: 'Harmonization and standardization gap apply.',
  NA: 'Not applicable for this entity.',
  OUT_OF_SCOPE: 'Activity is out of scope for this entity (excluded from progress and analysis).',
  UNCLEAR: 'Pre-assessment value could not be mapped – to be clarified in the workshop.',
};

export const WORKSHOP_STATUS = {
  NOT_ASSESSED: 'NOT_ASSESSED',
  CONFIRMED_FIT: 'CONFIRMED_FIT',
  CHANGED_VS_OPS: 'CHANGED_VS_OPS',
  GAP_CONFIRMED: 'GAP_CONFIRMED',
  OPEN_QUESTION: 'OPEN_QUESTION',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
};

export const WORKSHOP_STATUS_LABEL = {
  NOT_ASSESSED: 'Not assessed',
  CONFIRMED_FIT: 'Confirmed fit',
  CHANGED_VS_OPS: 'Changed vs. Ops',
  GAP_CONFIRMED: 'Gap confirmed',
  OPEN_QUESTION: 'Open question',
  OUT_OF_SCOPE: 'Out of scope',
};

export const DIMENSION = { BUSINESS: 'BUSINESS', IT_SYSTEMS: 'IT_SYSTEMS', LEGAL: 'LEGAL' };
export const DIMENSION_LABEL = { BUSINESS: 'Business', IT_SYSTEMS: 'IT Systems', LEGAL: 'Legal' };

export const RESOLUTION = {
  SEPARATE_VARIANT: 'SEPARATE_VARIANT',
  CLOSE_BEFORE_GO_LIVE: 'CLOSE_BEFORE_GO_LIVE',
  LIFT_AND_SHIFT: 'LIFT_AND_SHIFT',
};
export const RESOLUTION_LABEL = {
  SEPARATE_VARIANT: 'Separate variant',
  CLOSE_BEFORE_GO_LIVE: 'Close before go-live',
  LIFT_AND_SHIFT: 'Lift & shift',
};

export const ESCALATION = ['L1', 'L2', 'L3', 'STEERCO'];
export const ESCALATION_LABEL = {
  L1: 'L1 Transition Manager',
  L2: 'L2 Quality Gate Committee / Transition Lead',
  L3: 'L3 Project Leadership',
  STEERCO: 'SteerCo',
};

export const APPROVAL = ['PROPOSED', 'ALIGNED', 'APPROVED', 'REJECTED'];

export const PARTICIPANT_ORG = ['Local', 'GBS Ops', 'Transition', 'Process Expert'];

// Detailed Gap field keys, in capture-sheet order.
export const DETAILED_GAP_FIELDS = [
  'itSystems', 'workflowTools', 'currentProcess', 'externalParty',
  'languageRequirements', 'legalRegulatory', 'internalControls',
];
export const DETAILED_GAP_LABEL = {
  itSystems: 'IT Systems',
  workflowTools: 'Workflow Tools',
  currentProcess: 'Current Process (country specifics)',
  externalParty: 'External Party',
  languageRequirements: 'Language requirements',
  legalRegulatory: 'Legal / Regulatory',
  internalControls: 'Internal Controls',
};

export const SESSION_FILE_VERSION = 1;
