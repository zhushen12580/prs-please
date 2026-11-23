import type { ReviewCase, Rule, Verdict } from './types';

export function activeRules(rules: readonly Rule[], day: number): readonly Rule[] {
  return rules.filter((rule) => rule.unlockDay <= day);
}

export function standardVerdict(reviewCase: ReviewCase, rules: readonly Rule[], day: number): Verdict {
  if (!reviewCase.finding) return 'approve';
  const rule = rules.find((rule) => rule.id === reviewCase.finding?.ruleId);
  if (!rule) throw new Error(`未知规则 ${reviewCase.finding.ruleId}`);
  return rule.unlockDay <= day ? rule.violationVerdict : 'approve';
}
