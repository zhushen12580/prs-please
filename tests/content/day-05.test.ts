import { describe, expect, test } from 'vitest';
import { campaign, cases, getDayCases, rules } from '../../src/content/load';
import { validateDay } from '../../src/content/validate';
import { standardVerdict } from '../../src/game/rules';
import { scoreDecision } from '../../src/game/score';
import { answerKey } from '../fixtures/answer-key';

const ids = ['d5-01', 'd5-02', 'd5-03', 'd5-04', 'd5-05', 'd5-06'];

describe('第五天后门裁决真实内容', () => {
  test('第五天六题按 campaign 加载，三十题及人工答案齐全，没有第六天', () => {
    const day = getDayCases(5);
    expect(day.map((item) => item.id)).toEqual(ids);
    expect(campaign.days[4]).toEqual({ day: 5, newRuleId: 'R5', caseIds: ids });
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((item) => item.id)).size).toBe(30);
    expect(Object.keys(answerKey).sort()).toEqual(cases.map((item) => item.id).sort());
    expect(validateDay(day, 5, campaign, rules, 'src/data/cases/day-05.json')).toEqual(day);
    expect(() => getDayCases(6)).toThrow(/不存在/);
  });

  test('两份正常、两份 R5/backdoor、R3/policy 和 R4/bug，全部 CI 通过，独立答案均满分', () => {
    const day = getDayCases(5);
    expect(day.map((item) => item.finding?.ruleId ?? 'approve')).toEqual([
      'approve', 'approve', 'R5', 'R5', 'R3', 'R4',
    ]);
    expect(day.map((item) => item.finding?.impact ?? null)).toEqual([
      null, null, 'backdoor', 'backdoor', 'policy', 'bug',
    ]);
    for (const item of day) {
      const answer = answerKey[item.id];
      expect(item.ci.status).toBe('passed');
      expect(standardVerdict(item, rules, 5)).toBe(answer.verdict);
      expect(item.finding?.evidenceSets ?? []).toEqual(answer.evidenceSets);
      expect(scoreDecision(item, rules, 5, { caseId: item.id, verdict: answer.verdict,
        evidenceIds: answer.evidenceSets[0] ?? [] })).toMatchObject({ points: 10, verdictCorrect: true });
    }
  });

  test('正常验证修复保留范围限制；本地配置明确用途且保持验证，没有网络发送', () => {
    const [validation, local] = getDayCases(5);
    const validationText = validation.files.flatMap((file) => file.lines).map((line) => line.text).join('\n');
    expect(validationText).toContain('Number.isInteger(count)');
    expect(validationText).toContain('count >= 1 && count <= 100');
    const localText = local.files.flatMap((file) => file.lines).map((line) => line.text).join('\n');
    expect(localText).toContain("['comfortable', 'compact']");
    expect(localText).toContain('verify: true');
    expect(localText).not.toMatch(/fetch|https:|credential/i);
    expect(local.description.summary).toContain('本地');
    for (const item of [validation, local]) {
      expect(item.finding).toBeNull();
      expect(item.approvalExplanation).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  test('凭据外传和验证绕过有直接可选证据，CI 通过不构成安全证明，普通返修为零分', () => {
    const day = getDayCases(5);
    const upload = day[2].files.flatMap((file) => file.lines).find((line) => line.id === 'diagnostic-credential-upload');
    expect(upload).toMatchObject({ kind: 'add', oldLine: null });
    expect(upload?.text).toContain('https://collector.invalid/report');
    expect(upload?.text).toContain('environment.DEPLOY_CREDENTIAL');
    const bypass = day[3].files.flatMap((file) => file.lines).find((line) => line.id === 'signature-bypass');
    expect(bypass).toMatchObject({ kind: 'add', oldLine: null });
    expect(bypass?.text).toContain("if (bundle.note === 'compat-repair') return true;");
    for (const item of day.slice(2, 4)) {
      const evidenceIds = answerKey[item.id].evidenceSets[0];
      for (const verdict of ['approve', 'request_changes'] as const) {
        expect(scoreDecision(item, rules, 5, { caseId: item.id, verdict, evidenceIds }).points).toBe(0);
      }
      expect(scoreDecision(item, rules, 5, { caseId: item.id, verdict: 'reject',
        evidenceIds: [item.ci.logs[0].id] })).toMatchObject({ points: 5, evidenceCorrect: false });
      expect(scoreDecision(item, rules, 5, { caseId: item.id, verdict: 'reject',
        evidenceIds: [...evidenceIds, item.ci.logs[0].id] }).points).toBe(5);
      expect(item.finding?.explanation).toContain('拒绝');
      expect(item.finding?.explanation).toContain('CI 通过');
    }
  });

  test('旧披露和测试规则仍生效，空栏须与 AI 使用事实共同证明，安全测试删除行可选', () => {
    const day = getDayCases(5);
    const disclosure = day[4];
    expect(disclosure.description.disclosure.text).toBe('');
    expect(disclosure.contributor.toolRecords.find((item) => item.id === 'tool-labels-ai')?.text).toMatch(/AI.*采纳/);
    for (const evidenceIds of [['tool-labels-ai'], ['disclosure']]) {
      expect(scoreDecision(disclosure, rules, 5, { caseId: disclosure.id, verdict: 'request_changes', evidenceIds }).points).toBe(5);
    }
    expect(day[5].files.flatMap((file) => file.lines).find((line) => line.id === 'path-absolute-assertion'))
      .toMatchObject({ kind: 'delete', newLine: null, text: "  expect(isSafeEntry('/private/data')).toBe(false);" });
    expect(day[5].finding?.explanation).toContain('覆盖');
  });

  test('六个独立原创改动有完整行号与证据，xz 来源仅借鉴信任及隐藏行为主题', () => {
    const day = getDayCases(5);
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
        for (const key of ['oldLine', 'newLine'] as const) {
          const numbers = file.lines.flatMap((line) => line[key] === null ? [] : [line[key]]);
          expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
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
    const source = day[3].sources.find((entry) => entry.url === 'https://www.openwall.com/lists/oss-security/2024/03/29/4');
    expect(source?.theme).toContain('信任');
    expect(source?.theme).toContain('隐藏');
    expect(source?.note).toContain('不复制真实补丁');
  });
});
