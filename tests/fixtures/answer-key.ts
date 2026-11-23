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
};
