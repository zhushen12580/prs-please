import { describe, expect, test } from 'vitest';
import { campaign, cases, getDayCases, rules } from '../../src/content/load';
import { evidenceMatches, scoreDecision, summarize } from '../../src/game/score';
import type { DecisionRecord, GameContent, ReviewCase } from '../../src/game/types';
import { answerKey } from '../fixtures/answer-key';

const content = { campaign, cases, rules };
function reviewCase(id: string): ReviewCase {
  const found = cases.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
}
const record = (caseId: string, verdict: DecisionRecord['verdict'], evidenceIds: string[] = []): DecisionRecord => ({ caseId, verdict, evidenceIds });

describe('精确证据集合与判分', () => {
  test.each([
    [[], false], [['tool'], false], [['disclosure'], false],
    [['tool', 'disclosure'], true], [['disclosure', 'tool', 'tool'], true],
    [['disclosure', 'alternative'], true], [['tool', 'disclosure', 'unrelated'], false],
    [['tool', 'disclosure', 'alternative'], false],
  ])('选择 %j 必须恰好满足一组充分证据', (selected, expected) => {
    expect(evidenceMatches(selected, [['tool', 'disclosure'], ['alternative', 'disclosure']])).toBe(expected);
  });

  test.each(cases.map((entry) => entry.id))('%s 正确裁决和人工证据得到 10 分', (id) => {
    const answer = answerKey[id];
    const day = campaign.days.find((entry) => entry.caseIds.includes(id))?.day;
    if (!day) throw new Error(`缺少案例归属 ${id}`);
    expect(scoreDecision(reviewCase(id), rules, day, record(id, answer.verdict, answer.evidenceSets[0] ?? [])))
      .toMatchObject({ points: 10, verdictCorrect: true, evidenceCorrect: true, standardVerdict: answer.verdict });
  });

  test('批准忽略证据，错误裁决即使证据正确也为零', () => {
    expect(scoreDecision(reviewCase('d1-02'), rules, 1, record('d1-02', 'approve', ['disclosure'])).points).toBe(10);
    for (const verdict of ['approve', 'reject'] as const) {
      expect(scoreDecision(reviewCase('d1-05'), rules, 1, record('d1-05', verdict, ['ci-type-failure'])))
        .toMatchObject({ points: 0, verdictCorrect: false });
    }
  });

  test.each([{ evidenceIds: [] }, { evidenceIds: ['disclosure'] }, { evidenceIds: ['ci-type-failure', 'disclosure'] }])('正确非批准但证据 $evidenceIds 不精确仅得 5 分', ({ evidenceIds }) => {
    expect(scoreDecision(reviewCase('d1-05'), rules, 1, record('d1-05', 'request_changes', evidenceIds)))
      .toMatchObject({ points: 5, verdictCorrect: true, evidenceCorrect: false });
  });

  test('复合证据的等价组、顺序、重复和额外项按集合判分', () => {
    const problem: ReviewCase = { ...reviewCase('d1-05'), approvalExplanation: undefined,
      finding: { ruleId: 'R3', impact: 'policy', evidenceSets: [['tool', 'disclosure'], ['alternative', 'disclosure']], explanation: '两项共同证明' } };
    for (const [ids, points] of [
      [['tool'], 5], [['disclosure', 'tool', 'tool'], 10], [['alternative', 'disclosure'], 10],
      [['tool', 'disclosure', 'unrelated'], 5],
    ] as const) {
      expect(scoreDecision(problem, rules, 3, record(problem.id, 'request_changes', [...ids])).points).toBe(points);
    }
  });
});

describe('统一统计口径', () => {
  test('空记录、第一天全对和全批准', () => {
    expect(summarize([], content)).toEqual({ points: 0, maxPoints: 0, reviewed: 0, correctVerdicts: 0, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 });
    const perfect = getDayCases(1).map(({ id }) => record(id, answerKey[id].verdict, answerKey[id].evidenceSets[0] ?? []));
    expect(summarize(perfect, content)).toEqual({ points: 60, maxPoints: 60, reviewed: 6, correctVerdicts: 6, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 });
    expect(summarize(getDayCases(1).map(({ id }) => record(id, 'approve')), content))
      .toEqual({ points: 30, maxPoints: 60, reviewed: 6, correctVerdicts: 3, violationsMerged: 3, bugsMerged: 3, goodPrsHarmed: 0 });
  });

  test('证据失分不影响裁决正确数；两种非批准均可能误伤好 PR', () => {
    const records = [record('d1-05', 'request_changes', ['disclosure']), record('d1-04', 'approve'),
      record('d1-01', 'reject', ['disclosure']), record('d1-02', 'request_changes', ['disclosure'])];
    expect(summarize(records, content)).toEqual({ points: 5, maxPoints: 40, reviewed: 4, correctVerdicts: 1, violationsMerged: 1, bugsMerged: 1, goodPrsHarmed: 2 });
    expect(summarize([...records, records[0]], content)).toEqual(summarize(records, content));
  });

  test('违规合入含 policy，放入 bug／后门仅统计 bug 和 backdoor', () => {
    const policy: ReviewCase = { ...reviewCase('d1-05'), id: 'policy', approvalExplanation: undefined,
      finding: { ruleId: 'R3', impact: 'policy', evidenceSets: [['disclosure']], explanation: '流程违规' } };
    const backdoor: ReviewCase = { ...policy, id: 'backdoor', finding: { ...policy.finding!, ruleId: 'R5', impact: 'backdoor' } };
    const fixture: GameContent = { rules, cases: [policy, backdoor],
      campaign: { contentVersion: 'test', days: [{ day: 5, newRuleId: 'R5', caseIds: ['policy', 'backdoor'] }] } };
    expect(summarize([record('policy', 'approve'), record('backdoor', 'approve')], fixture))
      .toEqual({ points: 0, maxPoints: 20, reviewed: 2, correctVerdicts: 0, violationsMerged: 2, bugsMerged: 1, goodPrsHarmed: 0 });
  });
});
