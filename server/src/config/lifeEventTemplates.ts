/**
 * Life Event Templates - Config-driven definitions for the Readiness Engine.
 *
 * To add a new event, add an entry to LIFE_EVENT_TEMPLATES below.
 * No code changes are needed anywhere else.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntakeQuestion {
  id: string;
  label: string;
  type: 'select' | 'boolean';
  options?: { value: string; label: string }[];
  /** If present, the answer to this question controls which requirements are applicable */
  controlsRequirements?: string[];
}

export interface RequirementValidation {
  /** If true, the doc must not be expired */
  notExpired?: boolean;
  /** If true, a warning is shown when doc expires within 90 days */
  warnExpiringSoon?: boolean;
  /** Metadata fields that must be present on the document */
  requiredMetadata?: string[];
}

export interface EventRequirement {
  id: string;
  title: string;
  description: string;
  section: EventSection;
  /** Document categories (from the documents table) that can satisfy this */
  docCategories: string[];
  /** Specific tags that help narrow down the match */
  suggestedTags: string[];
  /** Keywords to look for in filename or extracted text (heuristic pass) */
  keywords: string[];
  validation: RequirementValidation;
  /** Weight for scoring (default 1) */
  weight: number;
  /** Requirement IDs that must be completed first */
  dependencies?: string[];
  /**
   * Conditions under which this requirement is not applicable.
   * Keys are intake question IDs, values are the answer that makes it N/A.
   */
  notApplicableWhen?: Record<string, string>;
}

export type EventSection =
  | 'Identity'
  | 'Financial'
  | 'Insurance'
  | 'Property'
  | 'Legal'
  | 'Health'
  | 'Education'
  | 'Travel';

export interface LifeEventTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  intakeQuestions: IntakeQuestion[];
  requirements: EventRequirement[];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const LIFE_EVENT_TEMPLATES: LifeEventTemplate[] = [
  // =========================================================================
  // 1) Moving
  // =========================================================================
  {
    id: 'moving',
    name: 'Moving',
    description: 'Prepare all documents you need when relocating within or out of state.',
    icon: 'Truck',
    intakeQuestions: [
      {
        id: 'move_type',
        label: 'Are you moving within or out of state?',
        type: 'select',
        options: [
          { value: 'within_state', label: 'Within state' },
          { value: 'out_of_state', label: 'Out of state' },
        ],
      },
      {
        id: 'housing_type',
        label: 'Will you be renting or owning?',
        type: 'select',
        options: [
          { value: 'renting', label: 'Renting' },
          { value: 'owning', label: 'Buying / Owning' },
        ],
      },
    ],
    requirements: [
      {
        id: 'moving-id',
        title: 'Government-Issued ID',
        description: 'Valid driver\'s license or state ID (will need updating for out-of-state moves).',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['id', 'driver-license', 'state-id', 'identity'],
        keywords: ['driver', 'license', 'state id', 'identification', 'id card'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 2,
      },
      {
        id: 'moving-lease',
        title: 'Current Lease or Mortgage',
        description: 'Your current lease agreement or mortgage statement for move-out reference.',
        section: 'Property',
        docCategories: ['lease', 'contract'],
        suggestedTags: ['lease', 'mortgage', 'rental-agreement'],
        keywords: ['lease', 'rental agreement', 'mortgage', 'deed'],
        validation: {},
        weight: 1,
      },
      {
        id: 'moving-new-lease',
        title: 'New Lease or Purchase Agreement',
        description: 'Signed lease or purchase contract for your new residence.',
        section: 'Property',
        docCategories: ['lease', 'contract'],
        suggestedTags: ['new-lease', 'purchase-agreement', 'new-home'],
        keywords: ['new lease', 'purchase agreement', 'closing', 'new rental'],
        validation: {},
        weight: 2,
        notApplicableWhen: { housing_type: 'renting' },
      },
      {
        id: 'moving-insurance-renters',
        title: 'Renters Insurance Policy',
        description: 'Proof of renters insurance for your new address.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['renters-insurance', 'insurance'],
        keywords: ['renters insurance', 'tenant insurance', 'renter'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 1,
        notApplicableWhen: { housing_type: 'owning' },
      },
      {
        id: 'moving-insurance-home',
        title: 'Homeowners Insurance Policy',
        description: 'Proof of homeowners insurance for your new property.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['homeowners-insurance', 'home-insurance'],
        keywords: ['homeowners insurance', 'home insurance', 'property insurance'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 1,
        notApplicableWhen: { housing_type: 'renting' },
      },
      {
        id: 'moving-utility',
        title: 'Utility Setup Confirmation',
        description: 'Confirmation of utility transfers or new account setup (electric, gas, water, internet).',
        section: 'Property',
        docCategories: ['other', 'contract'],
        suggestedTags: ['utility', 'electric', 'gas', 'water', 'internet'],
        keywords: ['utility', 'electric', 'gas', 'water', 'internet', 'cable'],
        validation: {},
        weight: 1,
      },
      {
        id: 'moving-employment',
        title: 'Employment Verification / Pay Stubs',
        description: 'Recent pay stubs or employment letter (often required by landlords).',
        section: 'Financial',
        docCategories: ['employment'],
        suggestedTags: ['pay-stub', 'employment-letter', 'income'],
        keywords: ['pay stub', 'employment', 'income', 'salary', 'verification'],
        validation: {},
        weight: 1,
      },
      {
        id: 'moving-vehicle-reg',
        title: 'Vehicle Registration',
        description: 'Current vehicle registration (will need updating for out-of-state moves).',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['vehicle', 'registration', 'car'],
        keywords: ['vehicle registration', 'car registration', 'auto registration'],
        validation: { notExpired: true },
        weight: 1,
        notApplicableWhen: { move_type: 'within_state' },
      },
    ],
  },

  // =========================================================================
  // 2) International Travel
  // =========================================================================
  {
    id: 'international-travel',
    name: 'International Travel',
    description: 'Ensure all travel documents are ready before your trip abroad.',
    icon: 'Plane',
    intakeQuestions: [
      {
        id: 'destination_region',
        label: 'What region are you traveling to?',
        type: 'select',
        options: [
          { value: 'schengen', label: 'Schengen Area (EU)' },
          { value: 'uk', label: 'United Kingdom' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'traveling_with_kids',
        label: 'Are you traveling with children?',
        type: 'boolean',
      },
    ],
    requirements: [
      {
        id: 'travel-passport',
        title: 'Valid Passport',
        description: 'Must be valid for at least 6 months beyond your travel dates.',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['passport', 'identity'],
        keywords: ['passport'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 3,
      },
      {
        id: 'travel-visa',
        title: 'Visa (if required)',
        description: 'Entry visa for your destination country, if applicable.',
        section: 'Travel',
        docCategories: ['other'],
        suggestedTags: ['visa', 'travel-visa'],
        keywords: ['visa', 'entry permit', 'travel authorization'],
        validation: { notExpired: true },
        weight: 2,
        notApplicableWhen: { destination_region: 'schengen' },
      },
      {
        id: 'travel-insurance',
        title: 'Travel Insurance Policy',
        description: 'Health and travel insurance covering your trip dates.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['travel-insurance', 'health-insurance'],
        keywords: ['travel insurance', 'trip insurance', 'travel health'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 2,
      },
      {
        id: 'travel-itinerary',
        title: 'Flight / Travel Itinerary',
        description: 'Booking confirmation for flights and accommodations.',
        section: 'Travel',
        docCategories: ['other', 'contract'],
        suggestedTags: ['itinerary', 'flight', 'booking'],
        keywords: ['itinerary', 'flight', 'booking', 'reservation', 'ticket'],
        validation: {},
        weight: 1,
      },
      {
        id: 'travel-vaccination',
        title: 'Vaccination Records',
        description: 'Proof of required vaccinations for your destination.',
        section: 'Health',
        docCategories: ['other'],
        suggestedTags: ['vaccination', 'health', 'immunization'],
        keywords: ['vaccination', 'vaccine', 'immunization', 'health record'],
        validation: {},
        weight: 1,
      },
      {
        id: 'travel-child-consent',
        title: 'Child Travel Consent Letter',
        description: 'Notarized consent for minor children traveling internationally.',
        section: 'Legal',
        docCategories: ['other', 'contract'],
        suggestedTags: ['child-travel', 'consent', 'minor'],
        keywords: ['child consent', 'minor travel', 'parental consent', 'notarized'],
        validation: {},
        weight: 2,
        notApplicableWhen: { traveling_with_kids: 'false' },
      },
      {
        id: 'travel-child-passport',
        title: 'Child Passport(s)',
        description: 'Valid passports for all children traveling.',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['passport', 'child-passport'],
        keywords: ['child passport', 'minor passport'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 2,
        notApplicableWhen: { traveling_with_kids: 'false' },
      },
    ],
  },

  // =========================================================================
  // 3) New Baby
  // =========================================================================
  {
    id: 'new-baby',
    name: 'New Baby',
    description: 'Collect and organize all documents needed when welcoming a new child.',
    icon: 'Baby',
    intakeQuestions: [
      {
        id: 'birth_type',
        label: 'Planned birth setting?',
        type: 'select',
        options: [
          { value: 'hospital', label: 'Hospital' },
          { value: 'home', label: 'Home birth' },
        ],
      },
      {
        id: 'add_to_insurance',
        label: 'Will you be adding the baby to your insurance?',
        type: 'boolean',
      },
    ],
    requirements: [
      {
        id: 'baby-birth-cert',
        title: 'Birth Certificate',
        description: 'Official birth certificate for your child.',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['birth-certificate', 'identity', 'child'],
        keywords: ['birth certificate', 'certificate of birth'],
        validation: {},
        weight: 3,
      },
      {
        id: 'baby-ssn',
        title: 'Social Security Card',
        description: 'Social Security number/card for the newborn.',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['ssn', 'social-security', 'child'],
        keywords: ['social security', 'ssn', 'ss card'],
        validation: {},
        weight: 2,
      },
      {
        id: 'baby-health-insurance',
        title: 'Health Insurance (Updated)',
        description: 'Health insurance policy updated to include the new dependent.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['health-insurance', 'dependent', 'baby'],
        keywords: ['health insurance', 'dependent', 'coverage', 'newborn'],
        validation: { notExpired: true },
        weight: 2,
        notApplicableWhen: { add_to_insurance: 'false' },
      },
      {
        id: 'baby-hospital-records',
        title: 'Hospital / Birth Records',
        description: 'Medical records from the birth including discharge papers.',
        section: 'Health',
        docCategories: ['other'],
        suggestedTags: ['hospital', 'medical', 'birth-records'],
        keywords: ['hospital', 'discharge', 'medical record', 'birth record'],
        validation: {},
        weight: 1,
        notApplicableWhen: { birth_type: 'home' },
      },
      {
        id: 'baby-pediatrician',
        title: 'Pediatrician Selection / Records',
        description: 'Documentation of selected pediatrician and initial visit records.',
        section: 'Health',
        docCategories: ['other'],
        suggestedTags: ['pediatrician', 'doctor', 'child-health'],
        keywords: ['pediatrician', 'doctor', 'well-baby', 'child health'],
        validation: {},
        weight: 1,
      },
      {
        id: 'baby-will-update',
        title: 'Will / Guardian Designation',
        description: 'Updated will or guardianship designation including the new child.',
        section: 'Legal',
        docCategories: ['contract', 'other'],
        suggestedTags: ['will', 'guardian', 'estate', 'legal'],
        keywords: ['will', 'guardian', 'guardianship', 'estate', 'trust'],
        validation: {},
        weight: 1,
      },
      {
        id: 'baby-life-insurance',
        title: 'Life Insurance Policy',
        description: 'Life insurance policy updated with new beneficiary.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['life-insurance', 'beneficiary'],
        keywords: ['life insurance', 'beneficiary', 'term life'],
        validation: { notExpired: true },
        weight: 1,
      },
    ],
  },

  // =========================================================================
  // 4) Buying a Home
  // =========================================================================
  {
    id: 'buying-home',
    name: 'Buying a Home',
    description: 'Organize all documents required for the home purchase process.',
    icon: 'Home',
    intakeQuestions: [
      {
        id: 'first_time_buyer',
        label: 'Is this your first home purchase?',
        type: 'boolean',
      },
      {
        id: 'financing_type',
        label: 'How are you financing?',
        type: 'select',
        options: [
          { value: 'mortgage', label: 'Mortgage' },
          { value: 'cash', label: 'Cash' },
        ],
      },
    ],
    requirements: [
      {
        id: 'home-id',
        title: 'Government-Issued ID',
        description: 'Valid photo ID for all signatories.',
        section: 'Identity',
        docCategories: ['other'],
        suggestedTags: ['id', 'driver-license', 'identity'],
        keywords: ['driver', 'license', 'id', 'identification', 'passport'],
        validation: { notExpired: true },
        weight: 2,
      },
      {
        id: 'home-preapproval',
        title: 'Mortgage Pre-Approval Letter',
        description: 'Pre-approval letter from your lender.',
        section: 'Financial',
        docCategories: ['contract', 'other'],
        suggestedTags: ['pre-approval', 'mortgage', 'lender'],
        keywords: ['pre-approval', 'preapproval', 'mortgage', 'lender', 'qualified'],
        validation: {},
        weight: 2,
        notApplicableWhen: { financing_type: 'cash' },
      },
      {
        id: 'home-income-proof',
        title: 'Proof of Income',
        description: 'Recent pay stubs, tax returns, or employment letter.',
        section: 'Financial',
        docCategories: ['employment'],
        suggestedTags: ['pay-stub', 'income', 'tax-return', 'w2'],
        keywords: ['pay stub', 'income', 'tax return', 'w2', 'w-2', 'employment'],
        validation: {},
        weight: 2,
      },
      {
        id: 'home-bank-statements',
        title: 'Bank Statements',
        description: 'Last 2-3 months of bank statements showing sufficient funds.',
        section: 'Financial',
        docCategories: ['other'],
        suggestedTags: ['bank-statement', 'financial', 'savings'],
        keywords: ['bank statement', 'account statement', 'savings', 'checking'],
        validation: {},
        weight: 1,
      },
      {
        id: 'home-purchase-agreement',
        title: 'Purchase Agreement',
        description: 'Signed purchase/sale agreement for the property.',
        section: 'Property',
        docCategories: ['contract'],
        suggestedTags: ['purchase-agreement', 'home-purchase', 'contract'],
        keywords: ['purchase agreement', 'sale agreement', 'contract', 'offer'],
        validation: {},
        weight: 2,
      },
      {
        id: 'home-inspection',
        title: 'Home Inspection Report',
        description: 'Professional inspection report for the property.',
        section: 'Property',
        docCategories: ['other'],
        suggestedTags: ['inspection', 'home-inspection'],
        keywords: ['inspection', 'home inspection', 'property inspection'],
        validation: {},
        weight: 1,
      },
      {
        id: 'home-insurance',
        title: 'Homeowners Insurance',
        description: 'Insurance policy for the new property (required before closing).',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['homeowners-insurance', 'home-insurance'],
        keywords: ['homeowners insurance', 'home insurance', 'property insurance'],
        validation: { notExpired: true },
        weight: 2,
      },
      {
        id: 'home-title',
        title: 'Title Report / Title Insurance',
        description: 'Title search report and title insurance binder.',
        section: 'Legal',
        docCategories: ['other', 'contract'],
        suggestedTags: ['title', 'title-insurance', 'deed'],
        keywords: ['title', 'title insurance', 'deed', 'lien'],
        validation: {},
        weight: 1,
      },
    ],
  },

  // =========================================================================
  // 5) Starting a Small Business
  // =========================================================================
  {
    id: 'starting-business',
    name: 'Starting a Small Business',
    description: 'Gather formation documents, licenses, and policies to launch your business.',
    icon: 'Briefcase',
    intakeQuestions: [
      {
        id: 'business_structure',
        label: 'What business structure?',
        type: 'select',
        options: [
          { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
          { value: 'llc', label: 'LLC' },
          { value: 'corporation', label: 'Corporation' },
        ],
      },
      {
        id: 'has_employees',
        label: 'Will you have employees?',
        type: 'boolean',
      },
    ],
    requirements: [
      {
        id: 'biz-formation',
        title: 'Business Formation Documents',
        description: 'Articles of incorporation, LLC operating agreement, or DBA registration.',
        section: 'Legal',
        docCategories: ['contract', 'other'],
        suggestedTags: ['business', 'formation', 'articles', 'llc', 'dba'],
        keywords: ['articles of incorporation', 'operating agreement', 'dba', 'formation', 'llc'],
        validation: {},
        weight: 3,
        notApplicableWhen: { business_structure: 'sole_proprietorship' },
      },
      {
        id: 'biz-ein',
        title: 'EIN (Employer Identification Number)',
        description: 'IRS-issued EIN for your business.',
        section: 'Financial',
        docCategories: ['other'],
        suggestedTags: ['ein', 'tax-id', 'irs'],
        keywords: ['ein', 'employer identification', 'tax id', 'irs'],
        validation: {},
        weight: 2,
      },
      {
        id: 'biz-license',
        title: 'Business License / Permits',
        description: 'Local, state, or federal business licenses and permits.',
        section: 'Legal',
        docCategories: ['other', 'contract'],
        suggestedTags: ['business-license', 'permit'],
        keywords: ['business license', 'permit', 'operating license'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 2,
      },
      {
        id: 'biz-insurance',
        title: 'Business Insurance',
        description: 'General liability, professional liability, or other business insurance.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['business-insurance', 'liability'],
        keywords: ['business insurance', 'liability', 'general liability', 'professional liability'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 2,
      },
      {
        id: 'biz-bank',
        title: 'Business Bank Account',
        description: 'Proof of business bank account opening.',
        section: 'Financial',
        docCategories: ['other'],
        suggestedTags: ['bank-account', 'business-bank'],
        keywords: ['business account', 'bank account', 'business banking'],
        validation: {},
        weight: 1,
      },
      {
        id: 'biz-tax-id-state',
        title: 'State Tax Registration',
        description: 'State sales tax or income tax registration.',
        section: 'Financial',
        docCategories: ['other'],
        suggestedTags: ['tax', 'state-tax', 'sales-tax'],
        keywords: ['state tax', 'sales tax', 'tax registration'],
        validation: {},
        weight: 1,
      },
      {
        id: 'biz-employment-docs',
        title: 'Employee Documentation',
        description: 'Employment agreements, W-4s, I-9s, or contractor agreements.',
        section: 'Legal',
        docCategories: ['employment', 'contract'],
        suggestedTags: ['employee', 'w4', 'i9', 'contractor'],
        keywords: ['w-4', 'w4', 'i-9', 'i9', 'employment agreement', 'contractor'],
        validation: {},
        weight: 1,
        notApplicableWhen: { has_employees: 'false' },
      },
    ],
  },

  // =========================================================================
  // 6) Estate Planning / Will Prep
  // =========================================================================
  {
    id: 'estate-planning',
    name: 'Estate Planning / Will Prep',
    description: 'Organize essential documents for will creation and estate planning.',
    icon: 'Scale',
    intakeQuestions: [
      {
        id: 'has_dependents',
        label: 'Do you have dependents (children, elderly parents)?',
        type: 'boolean',
      },
      {
        id: 'has_property',
        label: 'Do you own real estate?',
        type: 'boolean',
      },
    ],
    requirements: [
      {
        id: 'estate-will',
        title: 'Last Will and Testament',
        description: 'Your current or draft will.',
        section: 'Legal',
        docCategories: ['contract', 'other'],
        suggestedTags: ['will', 'testament', 'estate'],
        keywords: ['will', 'testament', 'last will'],
        validation: {},
        weight: 3,
      },
      {
        id: 'estate-poa',
        title: 'Power of Attorney',
        description: 'Durable power of attorney for finances and/or health care.',
        section: 'Legal',
        docCategories: ['contract', 'other'],
        suggestedTags: ['power-of-attorney', 'poa', 'legal'],
        keywords: ['power of attorney', 'poa', 'durable power'],
        validation: {},
        weight: 2,
      },
      {
        id: 'estate-health-directive',
        title: 'Advance Health Care Directive',
        description: 'Living will or health care proxy document.',
        section: 'Health',
        docCategories: ['other', 'contract'],
        suggestedTags: ['health-directive', 'living-will', 'healthcare-proxy'],
        keywords: ['health directive', 'living will', 'healthcare proxy', 'advance directive'],
        validation: {},
        weight: 2,
      },
      {
        id: 'estate-beneficiary',
        title: 'Beneficiary Designations',
        description: 'Documentation of beneficiaries on bank accounts, retirement accounts, and insurance.',
        section: 'Financial',
        docCategories: ['other', 'insurance'],
        suggestedTags: ['beneficiary', 'retirement', 'account'],
        keywords: ['beneficiary', 'designation', 'retirement', '401k', 'ira'],
        validation: {},
        weight: 1,
      },
      {
        id: 'estate-life-insurance',
        title: 'Life Insurance Policies',
        description: 'All current life insurance policies.',
        section: 'Insurance',
        docCategories: ['insurance'],
        suggestedTags: ['life-insurance'],
        keywords: ['life insurance', 'term life', 'whole life'],
        validation: { notExpired: true, warnExpiringSoon: true },
        weight: 2,
      },
      {
        id: 'estate-property-deeds',
        title: 'Property Deeds / Titles',
        description: 'Deeds and titles for all owned real estate.',
        section: 'Property',
        docCategories: ['other', 'contract'],
        suggestedTags: ['deed', 'title', 'property'],
        keywords: ['deed', 'title', 'property', 'real estate'],
        validation: {},
        weight: 2,
        notApplicableWhen: { has_property: 'false' },
      },
      {
        id: 'estate-guardian',
        title: 'Guardian Designation for Minors',
        description: 'Legal document naming guardian(s) for minor children.',
        section: 'Legal',
        docCategories: ['contract', 'other'],
        suggestedTags: ['guardian', 'minor', 'child'],
        keywords: ['guardian', 'guardianship', 'minor', 'custody'],
        validation: {},
        weight: 2,
        notApplicableWhen: { has_dependents: 'false' },
      },
      {
        id: 'estate-trust',
        title: 'Trust Documents',
        description: 'Revocable or irrevocable trust documents, if applicable.',
        section: 'Legal',
        docCategories: ['contract', 'other'],
        suggestedTags: ['trust', 'revocable-trust', 'estate'],
        keywords: ['trust', 'revocable trust', 'irrevocable', 'trust agreement'],
        validation: {},
        weight: 1,
      },
    ],
  },
];

/**
 * Look up a template by ID.
 */
export function getTemplateById(id: string): LifeEventTemplate | undefined {
  return LIFE_EVENT_TEMPLATES.find((t) => t.id === id);
}
