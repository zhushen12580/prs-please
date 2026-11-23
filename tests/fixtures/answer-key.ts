import type { Verdict } from '../../src/game/types';

interface ExpectedAnswer {
  verdict: Verdict;
  evidenceSets: string[][];
}

// 人工审阅的独立答案；不从生产 finding 或判分函数生成。
export const answerKey: Record<string, ExpectedAnswer> = {
  'd1-01': { verdict: 'approve', evidenceSets: [] },
  'd1-02': { verdict: 'approve', evidenceSets: [] },
  'd1-03': { verdict: 'approve', evidenceSets: [] },
  'd1-04': { verdict: 'request_changes', evidenceSets: [['ci-timezone-failure']] },
  'd1-05': { verdict: 'request_changes', evidenceSets: [['ci-type-failure']] },
  'd1-06': { verdict: 'request_changes', evidenceSets: [['ci-empty-failure']] },
  'd2-01': { verdict: 'approve', evidenceSets: [] },
  'd2-02': { verdict: 'approve', evidenceSets: [] },
  'd2-03': { verdict: 'request_changes', evidenceSets: [['path-invented-call']] },
  'd2-04': { verdict: 'request_changes', evidenceSets: [['manifest-unawaited']] },
  'd2-05': { verdict: 'request_changes', evidenceSets: [['status-invalid-filter']] },
  'd2-06': { verdict: 'request_changes', evidenceSets: [['ci-retry-failure']] },
  'd3-01': { verdict: 'approve', evidenceSets: [] },
  'd3-02': { verdict: 'approve', evidenceSets: [] },
  'd3-03': { verdict: 'request_changes', evidenceSets: [['tool-parser-ai', 'disclosure']] },
  'd3-04': { verdict: 'request_changes', evidenceSets: [['tool-docs-ai', 'disclosure']] },
  'd3-05': { verdict: 'request_changes', evidenceSets: [
    ['tool-tests-ai', 'disclosure'], ['tool-tests-import', 'disclosure'],
  ] },
  'd3-06': { verdict: 'request_changes', evidenceSets: [['transaction-invented-call']] },
  'd4-01': { verdict: 'approve', evidenceSets: [] },
  'd4-02': { verdict: 'approve', evidenceSets: [] },
  'd4-03': { verdict: 'request_changes', evidenceSets: [['fee-free-assertion']] },
  'd4-04': { verdict: 'request_changes', evidenceSets: [['archive-skipped-test']] },
  'd4-05': { verdict: 'request_changes', evidenceSets: [['rows-exact-assertion', 'rows-vacuous-assertion']] },
  'd4-06': { verdict: 'request_changes', evidenceSets: [['ci-build-failure']] },
  'd5-01': { verdict: 'approve', evidenceSets: [] },
  'd5-02': { verdict: 'approve', evidenceSets: [] },
  'd5-03': { verdict: 'reject', evidenceSets: [['diagnostic-credential-upload']] },
  'd5-04': { verdict: 'reject', evidenceSets: [['signature-bypass']] },
  'd5-05': { verdict: 'request_changes', evidenceSets: [['tool-labels-ai', 'disclosure']] },
  'd5-06': { verdict: 'request_changes', evidenceSets: [['path-absolute-assertion']] },
};
