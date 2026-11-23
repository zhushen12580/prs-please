import { describe, expect, test } from 'vitest';
import { campaign, cases, getDayCases, rules } from '../../src/content/load';
import { validateDay } from '../../src/content/validate';
import { standardVerdict } from '../../src/game/rules';
import { scoreDecision, summarize } from '../../src/game/score';
import { answerKey } from '../fixtures/answer-key';

const ids = ['d4-01', 'd4-02', 'd4-03', 'd4-04', 'd4-05', 'd4-06'];

describe('第四天测试完整性真实内容', () => {
  test('六题按 campaign 加载，三十题唯一，第五天已加载', () => {
    const day = getDayCases(4);
    expect(day.map((item) => item.id)).toEqual(ids);
    expect(campaign.days[3]).toEqual({ day: 4, newRuleId: 'R4', caseIds: ids });
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((item) => item.id)).size).toBe(30);
    expect(validateDay(day, 4, campaign, rules, 'src/data/cases/day-04.json')).toEqual(day);
    expect(getDayCases(5).map((item) => item.id)).toEqual(campaign.days[4].caseIds);
  });

  test('两份正常、三份 R4/bug、一份 R1/bug，只有构建失败题 CI 失败，独立答案均满分', () => {
    const day = getDayCases(4);
    expect(day.map((item) => item.finding?.ruleId ?? 'approve')).toEqual([
      'approve', 'approve', 'R4', 'R4', 'R4', 'R1',
    ]);
    expect(Object.keys(answerKey).filter((id) => id.startsWith('d4-'))).toEqual(ids);
    for (const item of day) {
      const answer = answerKey[item.id];
      expect(standardVerdict(item, rules, 4)).toBe(answer.verdict);
      expect(item.ci.status).toBe(item.id === 'd4-06' ? 'failed' : 'passed');
      if (item.finding) {
        expect(item.finding.impact).toBe('bug');
        expect(item.finding.evidenceSets).toEqual(answer.evidenceSets);
        expect(item.finding.explanation).toMatch(/[\u4e00-\u9fff]/);
      } else {
        expect(answer).toEqual({ verdict: 'approve', evidenceSets: [] });
        expect(item.approvalExplanation).toMatch(/[\u4e00-\u9fff]/);
      }
      expect(scoreDecision(item, rules, 4, { caseId: item.id, verdict: answer.verdict,
        evidenceIds: answer.evidenceSets[0] ?? [] })).toMatchObject({ points: 10, verdictCorrect: true });
    }
  });

  test('测试重构保留输入与精确期望；隔离修复创建独立目录并保留内容断言', () => {
    const [refactor, isolation] = getDayCases(4);
    const refactorLines = refactor.files.flatMap((file) => file.lines);
    const deleted = refactorLines.filter((line) => line.kind === 'delete').map((line) => line.text).join('\n');
    const added = refactorLines.filter((line) => line.kind === 'add').map((line) => line.text).join('\n');
    for (const literal of ["'hello'", "'docs%2Fintro'", "'docs/intro'"]) {
      expect(deleted).toContain(literal);
      expect(added).toContain(literal);
    }
    expect(added).toContain('test.each');
    expect(added).toContain('toBe(expected)');
    expect(refactor.finding).toBeNull();
    expect(refactor.approvalExplanation).toContain('覆盖');
    const isolationLines = isolation.files.flatMap((file) => file.lines);
    expect(isolationLines.find((line) => line.id === 'isolation-unique-root'))
      .toMatchObject({ kind: 'add', text: "  root = mkdtempSync(join(tmpdir(), 'report-'));" });
    expect(isolationLines.find((line) => line.id === 'isolation-content-assertion'))
      .toMatchObject({ kind: 'context', text: "  expect(readFileSync(file, 'utf8')).toBe('report: ready');" });
    expect(isolation.description.summary).toContain('并行');
    expect(isolation.finding).toBeNull();
  });

  test('删除关键断言、skip 和永真替换各有可见依据，绿色 CI 不是充分证据', () => {
    const day = getDayCases(4);
    const feeLines = day[2].files.flatMap((file) => file.lines);
    expect(feeLines.find((line) => line.id === 'fee-free-assertion')).toEqual({
      id: 'fee-free-assertion', kind: 'delete', oldLine: 6, newLine: null,
      text: '  expect(deliveryFee(50)).toBe(0);',
    });
    expect(day[2].finding?.evidenceSets.every((set) => set.includes('fee-free-assertion'))).toBe(true);
    expect(day[3].files.flatMap((file) => file.lines).find((line) => line.id === 'archive-skipped-test'))
      .toMatchObject({ kind: 'add', text: "test.skip('归档标题保留中文', () => {" });
    const rowLines = day[4].files.flatMap((file) => file.lines);
    expect(rowLines.find((line) => line.id === 'rows-exact-assertion'))
      .toMatchObject({ kind: 'delete', oldLine: 7, newLine: null, text: '  expect(rows).toHaveLength(0);' });
    expect(rowLines.find((line) => line.id === 'rows-vacuous-assertion'))
      .toMatchObject({ kind: 'add', oldLine: null, newLine: 7, text: '  expect(rows.length >= 0).toBe(true);' });
    for (const item of day.slice(2, 5)) {
      expect(item.finding?.explanation).toContain('CI 通过');
      expect(item.finding?.explanation).toContain('覆盖');
      const result = scoreDecision(item, rules, 4, { caseId: item.id, verdict: 'request_changes',
        evidenceIds: [item.ci.logs[0].id] });
      expect(result).toMatchObject({ points: 5, verdictCorrect: true, evidenceCorrect: false });
    }
  });

  test('删增组合缺一项或多选均为 5 分，反序和重复按集合计分；全批准会放入四个 bug', () => {
    const day = getDayCases(4);
    const item = day[4];
    for (const [evidenceIds, points] of [
      [['rows-exact-assertion'], 5], [['rows-vacuous-assertion'], 5],
      [['rows-exact-assertion', 'rows-vacuous-assertion'], 10],
      [['rows-vacuous-assertion', 'rows-exact-assertion', 'rows-exact-assertion'], 10],
      [['rows-exact-assertion', 'rows-vacuous-assertion', 'ci-rows'], 5],
    ] as const) {
      expect(scoreDecision(item, rules, 4, { caseId: item.id, verdict: 'request_changes', evidenceIds }).points).toBe(points);
    }
    expect(summarize(day.map(({ id }) => ({ caseId: id, verdict: 'approve', evidenceIds: [] })), { campaign, cases, rules }))
      .toEqual({ points: 20, maxPoints: 60, reviewed: 6, correctVerdicts: 2,
        violationsMerged: 4, bugsMerged: 4, goodPrsHarmed: 0 });
  });

  test('原创材料、行号及证据引用有效，curl 来源说明测试与文档行为相符的主题', () => {
    const day = getDayCases(4);
    expect(new Set(day.map((item) => item.title)).size).toBe(6);
    expect(new Set(day.map((item) => item.description.summary)).size).toBe(6);
    expect(new Set(day.map((item) => item.files.flatMap((file) => file.lines)
      .filter((line) => line.kind !== 'context').map((line) => line.text).join('\n'))).size).toBe(6);
    for (const item of day) {
      expect(item.contributor.name).toContain('虚构');
      expect(item.contributor.toolRecords.length).toBeGreaterThan(0);
      expect(item.ci.logs.length).toBeGreaterThan(0);
      expect(item.files.length).toBeGreaterThanOrEqual(1);
      expect(item.files.length).toBeLessThanOrEqual(2);
      const lines = item.files.flatMap((file) => file.lines);
      expect(lines.length).toBeGreaterThanOrEqual(12);
      expect(lines.length).toBeLessThanOrEqual(35);
      for (const file of item.files) {
        const oldNumbers = file.lines.flatMap((line) => line.oldLine === null ? [] : [line.oldLine]);
        const newNumbers = file.lines.flatMap((line) => line.newLine === null ? [] : [line.newLine]);
        expect(oldNumbers).toEqual([...new Set(oldNumbers)].sort((a, b) => a - b));
        expect(newNumbers).toEqual([...new Set(newNumbers)].sort((a, b) => a - b));
        for (const line of file.lines) {
          if (line.kind === 'delete') expect(line.newLine).toBeNull();
          if (line.kind === 'add') expect(line.oldLine).toBeNull();
        }
      }
      const selectable = [item.description.disclosure, ...item.contributor.toolRecords, ...item.ci.logs, ...lines];
      const evidenceIds = selectable.map((entry) => entry.id);
      expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
      for (const set of item.finding?.evidenceSets ?? []) {
        for (const id of set) expect(evidenceIds).toContain(id);
      }
      for (const source of item.sources) {
        expect(new URL(source.url).protocol).toBe('https:');
        expect(source.note).toContain('原创');
        expect(source.note).toContain('虚构');
      }
    }
    const source = day[0].sources.find((entry) => entry.url === 'https://curl.se/dev/contribute.html');
    expect(source?.theme).toContain('测试');
    expect(source?.note).toContain('文档');
    expect(source?.note).toContain('虚构项目规则');
    expect(source?.note).toContain('完整政策');
  });
});
