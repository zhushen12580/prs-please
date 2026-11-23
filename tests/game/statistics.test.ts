import { describe, expect, test } from 'vitest';
import { campaign, cases, rules } from '../../src/content/load';
import { summarize } from '../../src/game/score';
import type { DecisionRecord } from '../../src/game/types';
import { answerKey } from '../fixtures/answer-key';

const content = { campaign, cases, rules };
const record = (caseId: string, verdict: DecisionRecord['verdict'], evidenceIds: string[] = []): DecisionRecord =>
  ({ caseId, verdict, evidenceIds });

describe('固定统计口径', () => {
  test.each([
    { name: '正确裁决但错证据仍算正确', record: record('d1-05', 'request_changes', ['disclosure']),
      expected: { points: 5, correctVerdicts: 1, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 } },
    { name: '完整复合证据得满分', record: record('d3-03', 'request_changes', ['disclosure', 'tool-parser-ai']),
      expected: { points: 10, correctVerdicts: 1, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 } },
    { name: '复合证据缺一项仅影响分数', record: record('d3-03', 'request_changes', ['disclosure']),
      expected: { points: 5, correctVerdicts: 1, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 } },
    { name: '批准忽略所选证据', record: record('d3-02', 'approve', ['disclosure']),
      expected: { points: 10, correctVerdicts: 1, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 } },
    { name: '漏放 policy 只计违规合入', record: record('d3-03', 'approve'),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 1, bugsMerged: 0, goodPrsHarmed: 0 } },
    { name: '漏放 bug 同时计两种合入', record: record('d2-03', 'approve'),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 1, bugsMerged: 1, goodPrsHarmed: 0 } },
    { name: '漏放 backdoor 同时计两种合入', record: record('d5-03', 'approve'),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 1, bugsMerged: 1, goodPrsHarmed: 0 } },
    { name: '错拒正常题计误伤', record: record('d1-01', 'reject', ['disclosure']),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 1 } },
    { name: '正常题要求修改也计误伤', record: record('d3-02', 'request_changes', ['disclosure']),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 1 } },
    { name: '把普通问题拒绝不算合入或误伤', record: record('d2-03', 'reject', ['path-invented-call']),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 } },
    { name: '把后门要求修改不算合入或误伤', record: record('d5-03', 'request_changes', ['diagnostic-credential-upload']),
      expected: { points: 0, correctVerdicts: 0, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 } },
  ])('$name', ({ record: decision, expected }) => {
    expect(summarize([decision], content)).toEqual({ ...expected, reviewed: 1, maxPoints: 10 });
  });

  test('全正确的人工记录集为 300/300、30/30 且三项错误统计全零', () => {
    const records = Object.entries(answerKey).map(([id, answer]) => record(id, answer.verdict, answer.evidenceSets[0] ?? []));
    expect(summarize(records, content)).toEqual({ points: 300, maxPoints: 300, reviewed: 30,
      correctVerdicts: 30, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 });
  });

  test('全批准的独立记录集为 110/300、11/30、15、19、0', () => {
    const records = Object.keys(answerKey).map((id) => record(id, 'approve'));
    expect(summarize(records, content)).toEqual({ points: 110, maxPoints: 300, reviewed: 30,
      correctVerdicts: 11, bugsMerged: 15, violationsMerged: 19, goodPrsHarmed: 0 });
  });

  test('每次从记录重算、按案例去重，不复用或修改上次的汇总', () => {
    const records = [record('d3-03', 'approve')];
    const first = summarize(records, content);
    first.points = 999;
    records.push(record('d5-03', 'approve'), record('d3-03', 'approve'));
    expect(summarize(records, content)).toEqual({ points: 0, maxPoints: 20, reviewed: 2,
      correctVerdicts: 0, violationsMerged: 2, bugsMerged: 1, goodPrsHarmed: 0 });
    expect(summarize([], content)).toEqual({ points: 0, maxPoints: 0, reviewed: 0,
      correctVerdicts: 0, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 });
  });
});
