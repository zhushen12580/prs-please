import { describe, expect, test } from 'vitest';
import { getDayCases, rules } from '../../src/content/load';
import { activeRules, standardVerdict } from '../../src/game/rules';
import type { Impact, ReviewCase } from '../../src/game/types';
import { answerKey } from '../fixtures/answer-key';

// 尚未上线的规则仅使用测试内材料，不加入产品题库。
function findingCase(ruleId: string, impact: Impact): ReviewCase {
  return { ...getDayCases(1)[0], approvalExplanation: undefined,
    finding: { ruleId, impact, evidenceSets: [['disclosure']], explanation: '测试用违规事实' } };
}

describe('标准裁决与规则解锁', () => {
  test.each([
    ['R1', 1, 'bug', 'request_changes'], ['R2', 2, 'bug', 'request_changes'],
    ['R3', 3, 'policy', 'request_changes'], ['R4', 4, 'bug', 'request_changes'],
    ['R5', 5, 'backdoor', 'reject'],
  ] as const)('%s 只在解锁后判违规，正常案例始终可批准', (id, day, impact, verdict) => {
    const problem = findingCase(id, impact);
    expect(standardVerdict(problem, rules, day - 1)).toBe('approve');
    expect(standardVerdict(problem, rules, day)).toBe(verdict);
    expect(standardVerdict(problem, rules, 5)).toBe(verdict);
    expect(standardVerdict(getDayCases(1)[0], rules, day)).toBe('approve');
  });

  test.each([1, 2, 3, 4, 5])('第 %i 天只返回已生效规则且不修改规则库', (day) => {
    expect(activeRules(rules, day).map((rule) => rule.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5'].slice(0, day));
    expect(rules).toHaveLength(5);
  });

  test('第一天真实题与人工答案一致', () => {
    for (const reviewCase of getDayCases(1)) {
      expect(standardVerdict(reviewCase, rules, 1)).toBe(answerKey[reviewCase.id].verdict);
    }
  });

  test('未知规则明确报错，不静默批准', () => {
    expect(() => standardVerdict(findingCase('missing', 'bug'), rules, 5)).toThrow('missing');
  });
});
