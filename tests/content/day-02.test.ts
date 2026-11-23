import { describe, expect, test } from 'vitest';
import { campaign, cases, getDayCases, rules } from '../../src/content/load';
import { validateDay } from '../../src/content/validate';
import { standardVerdict } from '../../src/game/rules';
import { answerKey } from '../fixtures/answer-key';

const ids = ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'];

describe('第二天真实 API 查证内容', () => {
  test('只加载已完成的两天十二题，按 campaign 归属且没有跨日案例', () => {
    const day = getDayCases(2);
    expect(day.map((item) => item.id)).toEqual(ids);
    expect(campaign.days[1]).toEqual({ day: 2, newRuleId: 'R2', caseIds: ids });
    expect(cases.map((item) => item.id)).toEqual([
      'd1-01', 'd1-02', 'd1-03', 'd1-04', 'd1-05', 'd1-06', ...ids,
    ]);
    expect(validateDay(day, 2, campaign, rules, 'src/data/cases/day-02.json')).toEqual(day);
    expect(() => getDayCases(3)).toThrow(/尚未加载/);
  });

  test('两份正常、三份 R2/bug、一份 R1/bug，人工答案锁定充分证据', () => {
    const day = getDayCases(2);
    expect(day.map((item) => item.finding?.ruleId ?? 'approve')).toEqual([
      'approve', 'approve', 'R2', 'R2', 'R2', 'R1',
    ]);
    expect(Object.keys(answerKey).filter((id) => id.startsWith('d2-'))).toEqual(ids);
    for (const [index, item] of day.entries()) {
      const answer = answerKey[item.id];
      expect(answer).toBeDefined();
      expect(standardVerdict(item, rules, 2)).toBe(answer.verdict);
      expect(item.ci.status).toBe(index === 5 ? 'failed' : 'passed');
      if (item.finding) {
        expect(item.finding.impact).toBe('bug');
        expect(item.finding.evidenceSets).toEqual(answer.evidenceSets);
        expect(item.finding.explanation).toMatch(/[\u4e00-\u9fff]/);
        const evidence = [...item.ci.logs, ...item.files.flatMap((file) => file.lines)];
        for (const set of answer.evidenceSets) {
          for (const id of set) expect(evidence.some((entry) => entry.id === id)).toBe(true);
        }
      } else {
        expect(answer).toEqual({ verdict: 'approve', evidenceSets: [] });
        expect(item.approvalExplanation).toMatch(/[\u4e00-\u9fff]/);
      }
    }
  });

  test('随附签名与语义足以查证游标、路径、异步值和状态参数', () => {
    const day = getDayCases(2);
    for (const item of day.slice(1, 5)) {
      expect(item.apiReference?.length).toBeGreaterThan(0);
      for (const reference of item.apiReference ?? []) {
        expect(reference.name.trim()).not.toBe('');
        expect(reference.signature).toContain('(');
        expect(reference.notes).toMatch(/[\u4e00-\u9fff]/);
      }
    }
    const api = (index: number) => day[index].apiReference?.map((entry) => `${entry.signature}\n${entry.notes}`).join('\n');
    const diff = (index: number) => day[index].files.flatMap((file) => file.lines);
    expect(day[0].title).toContain('缓存');
    expect(diff(0).some((line) => line.kind === 'add' && line.text.includes('cachedTitles.delete(id)'))).toBe(true);
    expect(api(1)).toContain('nextCursor');
    expect(api(1)).toContain('after');
    expect(diff(1).some((line) => line.kind === 'add' && line.text.includes('await catalog.scan({ after: cursor, limit: 2 })'))).toBe(true);
    expect(api(2)).toContain('不存在 canonicalize');
    expect(diff(2).some((line) => line.kind === 'add' && line.text.includes('workspace.paths.canonicalize(input)'))).toBe(true);
    expect(api(3)).toContain('Promise<Manifest>');
    expect(api(3)).toContain('await');
    expect(diff(3).find((line) => line.id === 'manifest-unawaited')?.text).toBe('  return registry.readManifest(id).title;');
    expect(api(4)).toContain("'queued' | 'running' | 'done'");
    expect(api(4)).toContain('pending');
    expect(diff(4).find((line) => line.id === 'status-invalid-filter')?.text).toBe("  const waiting = jobs.query({ status: 'pending' });");
    expect(day[5].ci.logs.find((log) => log.id === 'ci-retry-failure')?.text).toContain('期望 3 次，实际 4 次');
  });

  test('六题叙事和实质改动不同，材料齐全且所有证据都可选', () => {
    const day = getDayCases(2);
    expect(new Set(day.map((item) => item.title)).size).toBe(6);
    expect(new Set(day.map((item) => item.description.summary)).size).toBe(6);
    expect(new Set(day.map((item) => item.files.flatMap((file) => file.lines)
      .filter((line) => line.kind !== 'context').map((line) => line.text).join('\n'))).size).toBe(6);
    for (const item of day) {
      expect(item.description.disclosure.text.trim()).not.toBe('');
      expect(item.contributor.name).toContain('虚构');
      expect(item.contributor.toolRecords.length).toBeGreaterThan(0);
      expect(item.ci.logs.length).toBeGreaterThan(0);
      expect(item.files.length).toBeGreaterThanOrEqual(1);
      expect(item.files.length).toBeLessThanOrEqual(2);
      const lines = item.files.flatMap((file) => file.lines);
      expect(lines.length).toBeGreaterThanOrEqual(12);
      expect(lines.length).toBeLessThanOrEqual(35);
      const selectable = [item.description.disclosure, ...item.contributor.toolRecords, ...item.ci.logs, ...lines];
      expect(new Set(selectable.map((entry) => entry.id)).size).toBe(selectable.length);
      for (const set of item.finding?.evidenceSets ?? []) {
        for (const id of set) expect(selectable.map((entry) => entry.id)).toContain(id);
      }
      for (const source of item.sources) {
        expect(new URL(source.url).protocol).toBe('https:');
        expect(source.note).toContain('原创');
        expect(source.note).toContain('虚构');
      }
    }
  });
});
