export type Verdict = 'approve' | 'request_changes' | 'reject';

export interface Rule {
  id: string;
  unlockDay: number;
  title: string;
  body: string;
  examples: {
    approve: string;
    violation: string;
  };
  violationVerdict: Exclude<Verdict, 'approve'>;
}

// 简报只消费可展示的文案。
export type BriefingRule = Pick<Rule, 'id' | 'title' | 'body' | 'examples'>;

export interface CampaignDay {
  day: number;
  newRuleId: string;
  caseIds: string[];
}

export interface Campaign {
  contentVersion: string;
  days: CampaignDay[];
}

export interface EvidenceEntry {
  id: string;
  text: string;
}

export type DiffLine = EvidenceEntry & (
  | { kind: 'add'; oldLine: null; newLine: number }
  | { kind: 'delete'; oldLine: number; newLine: null }
  | { kind: 'context'; oldLine: number; newLine: number }
);

export interface DiffFile {
  path: string;
  lines: DiffLine[];
}

export interface ApiReference {
  name: string;
  signature: string;
  notes: string;
}

export type Impact = 'bug' | 'policy' | 'backdoor';

export interface Finding {
  ruleId: string;
  impact: Impact;
  evidenceSets: string[][];
  explanation: string;
}

export interface ContentSource {
  url: string;
  theme: string;
  note: string;
}

interface CaseMaterials {
  id: string;
  title: string;
  description: { summary: string; disclosure: EvidenceEntry };
  contributor: { name: string; handle: string; toolRecords: EvidenceEntry[] };
  ci: { status: 'passed' | 'failed'; logs: EvidenceEntry[] };
  apiReference?: ApiReference[];
  files: DiffFile[];
  sources: ContentSource[];
}

export type ReviewCase = CaseMaterials & (
  | { finding: null; approvalExplanation: string }
  | { finding: Finding; approvalExplanation?: never }
);
