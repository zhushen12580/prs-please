import { describe, expect, test } from 'vitest';
import { rules } from '../../src/content/load';
import { createBriefing } from '../../src/ui/briefing';

describe('简报的裁决示例', () => {
  test.each([
    [1, '要求修改'], [2, '要求修改'], [3, '要求修改'], [4, '要求修改'], [5, '拒绝'],
  ])('第 %i 天的违规示例标题为「%s」', (day, expected) => {
    const rule = rules.find((entry) => entry.unlockDay === day)!;
    const briefing = createBriefing('maintainer-001', day, rule);
    const examples = briefing.querySelectorAll('.rule-example');
    expect(examples).toHaveLength(2);
    expect(examples[0].querySelector('h4')?.textContent).toBe('可以批准');
    expect(examples[0].querySelector('p')?.textContent).toBe(rule.examples.approve);
    expect(examples[1].querySelector('h4')?.textContent).toBe(expected);
    expect(examples[1].querySelector('p')?.textContent).toBe(rule.examples.violation);
  });

  test('违规标题随规则裁决变化，而不依赖日期或规则编号', () => {
    const rule = rules[0];
    const briefing = createBriefing('maintainer-001', 1, { ...rule, violationVerdict: 'reject' });
    expect(briefing.querySelectorAll('.rule-example h4')[1]?.textContent).toBe('拒绝');
  });
});
