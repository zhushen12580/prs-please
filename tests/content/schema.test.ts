import { describe, expect, test } from 'vitest';
import rawCampaign from '../../src/data/campaign.json';
import rawRules from '../../src/data/rules.json';
import rawDay from '../../src/data/cases/day-01.json';
import { parseCampaign, parseCase, parseRules, validateDay } from '../../src/content/validate';

const source = 'src/data/cases/day-01.json[3]';

// 只在内存里破坏 JSON；生产文件始终保留真实案例。
function changed(path: string, value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(rawDay[3]));
  const keys = path.split('.');
  let target = copy;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys[keys.length - 1]] = value;
  return copy;
}

describe('单案例内容类型契约', () => {
  test('正常/问题案例可解析；可选 API 参考被验证并保留，文本不被改写', () => {
    expect(parseCase(rawDay[0])).toEqual(rawDay[0]);
    expect(parseCase(rawDay[3])).toEqual(rawDay[3]);
    const withApi = { ...rawDay[3], apiReference: [
      { name: 'formatDay', signature: '(date: Date) => string', notes: '返回 UTC 日期。' },
    ] };
    expect(parseCase(withApi)).toEqual(withApi);
    const blankLine = changed('files.0.lines.0.text', '');
    expect(() => parseCase(blankLine)).not.toThrow();
    const blankDisclosure = changed('description.disclosure.text', '');
    expect(() => parseCase(blankDisclosure)).not.toThrow();
  });

  test.each([
    ['id', 123], ['title', undefined], ['description', null],
    ['description.summary', '   '], ['description.disclosure.id', ''],
    ['description.disclosure.text', false], ['contributor.name', undefined],
    ['contributor.handle', 4], ['contributor.toolRecords', []],
    ['contributor.toolRecords.0.text', null], ['ci.status', 'green'],
    ['ci.logs', []], ['ci.logs.0.id', ''], ['ci.logs.0.text', undefined],
    ['files', []], ['files', [rawDay[3].files[0], rawDay[3].files[0], rawDay[3].files[0]]],
    ['files.0.path', ''], ['files.0.lines', []],
    ['files.0.lines.0.kind', 'replace'], ['files.0.lines.0.text', null],
    ['finding', undefined], ['finding.ruleId', 1], ['finding.impact', 'security'],
    ['finding.explanation', ''], ['finding.evidenceSets', []],
    ['finding.evidenceSets', [[]]], ['finding.evidenceSets', [['ci-timezone-failure', 'ci-timezone-failure']]],
    ['finding.evidenceSets', [['ci-timezone-failure'], ['ci-timezone-failure']]],
    ['finding.evidenceSets', [['no-such-evidence']]],
    ['apiReference', null], ['apiReference', []],
    ['apiReference', [{ name: 'formatDay', signature: 1, notes: '说明' }]],
    ['sources', []], ['sources.0.url', 'http://example.com'],
    ['sources.0.url', 'javascript:alert(1)'], ['sources.0.url', '/relative'],
    ['sources.0.url', 'https://'], ['sources.0.theme', ''], ['sources.0.note', undefined],
  ])('拒绝非法字段 %s = %j 并报告文件与路径', (path, value) => {
    const check = () => parseCase(changed(path, value), source);
    expect(check).toThrow(source);
    // 内部下标使用标准 JSON 路径。
    expect(check).toThrow(path.replace(/\.(\d+)/g, '[$1]'));
  });

  test('正常案例必须有批准解释', () => {
    const { approvalExplanation: omitted, ...withoutExplanation } = rawDay[0];
    expect(() => parseCase(withoutExplanation, 'good.json')).toThrow('good.json.approvalExplanation');
    expect(() => parseCase({ ...rawDay[0], approvalExplanation: ' ' })).toThrow('approvalExplanation');
  });

  test('证据 ID 跨资料类型及跨文件唯一，API 说明不能充当证据', () => {
    for (const path of ['ci.logs.0.id', 'contributor.toolRecords.0.id', 'files.0.lines.0.id']) {
      expect(() => parseCase(changed(path, rawDay[3].description.disclosure.id), source))
        .toThrow(/重复/);
    }
    const duplicate = { ...rawDay[3], files: [rawDay[3].files[0],
      { ...rawDay[3].files[0], path: 'another.ts' }] };
    expect(() => parseCase(duplicate, source)).toThrow(/重复/);
    expect(() => parseCase({ ...rawDay[3], apiReference: [
      { name: 'reference-only', signature: '() => void', notes: '只读参考' },
    ], finding: { ...rawDay[3].finding, evidenceSets: [['reference-only']] } }, source))
      .toThrow('finding.evidenceSets[0][0]');
  });

  test.each([
    ['add', 1, 1, 'oldLine'], ['add', null, null, 'newLine'],
    ['delete', 1, 1, 'newLine'], ['delete', null, null, 'oldLine'],
    ['context', null, 1, 'oldLine'], ['context', 1, null, 'newLine'],
    ['context', 0, 1, 'oldLine'], ['context', 1, -1, 'newLine'],
    ['context', 1.5, 1, 'oldLine'], ['context', 1, '1', 'newLine'],
  ])('%s 行号 old=%j new=%j 不适用时拒绝', (kind, oldLine, newLine, field) => {
    const copy = { ...rawDay[3], files: rawDay[3].files.map((file) => ({ ...file, lines:
      file.lines.map((line, index) => index === 0 ? { ...line, kind, oldLine, newLine } : line),
    })) };
    expect(() => parseCase(copy, source)).toThrow(`${source}.files[0].lines[0].${field}`);
  });

  test('拒绝总 diff 行数少于 12 或大于 35，允许合法的增删上下文', () => {
    expect(() => parseCase(changed('files.0.lines', rawDay[3].files[0].lines.slice(0, 11)), source))
      .toThrow(`${source}.files`);
    const lines = Array.from({ length: 36 }, (_, i) => ({
      id: `extra-${i}`, kind: 'context', oldLine: i + 1, newLine: i + 1, text: '',
    }));
    expect(() => parseCase(changed('files.0.lines', lines), source)).toThrow(`${source}.files`);
    for (const [kind, oldLine, newLine] of [['add', null, 1], ['delete', 1, null], ['context', 1, 1]]) {
      const copy = { ...rawDay[3], files: rawDay[3].files.map((file) => ({ ...file, lines:
        file.lines.map((line, i) => i === 0 ? { ...line, kind, oldLine, newLine } : line),
      })) };
      expect(() => parseCase(copy)).not.toThrow();
    }
  });

  test('充分组合不依赖顺序，允许不同等价组，拒绝重排的重复组', () => {
    const first = rawDay[3].ci.logs[0].id;
    const second = rawDay[3].ci.logs[1].id;
    expect(() => parseCase(changed('finding.evidenceSets', [[first, second], [second, first]])))
      .toThrow(/重复/);
    expect(() => parseCase(changed('finding.evidenceSets', [[first], [second]]))).not.toThrow();
  });

  test.each([
    'unexpected', 'description.unexpected', 'description.disclosure.unexpected',
    'contributor.unexpected', 'contributor.toolRecords.0.unexpected', 'ci.unexpected',
    'ci.logs.0.unexpected', 'files.0.unexpected', 'files.0.lines.0.unexpected',
    'finding.unexpected', 'sources.0.unexpected',
  ])('未知字段不能被静默丢弃：%s', (path) => {
    expect(() => parseCase(changed(path, true), source))
      .toThrow(`${source}.${path.replace(/\.(\d+)/g, '[$1]')}`);
  });

  test('同一 diff 文件路径不能重复，每个文件的行号独立递增且允许片段跳号', () => {
    const copy = structuredClone(rawDay[1]);
    copy.files[1].path = copy.files[0].path;
    expect(() => parseCase(copy, 'src/data/cases/day-01.json[1]'))
      .toThrow('src/data/cases/day-01.json[1].files[1].path');
    for (const field of ['oldLine', 'newLine']) {
      expect(() => parseCase(changed(`files.0.lines.1.${field}`, 1), source))
        .toThrow(`${source}.files[0].lines[1].${field}`);
    }
    const gap = structuredClone(rawDay[3]);
    for (const line of gap.files[0].lines.slice(1)) {
      if (line.oldLine !== null) line.oldLine += 10;
      if (line.newLine !== null) line.newLine += 10;
    }
    expect(() => parseCase(gap, source)).not.toThrow();
  });
});

describe('单日完整性与规则引用', () => {
  const campaign = () => parseCampaign(rawCampaign);
  const rules = () => parseRules(rawRules);
  const check = (value: unknown) => validateDay(value, 1, campaign(), rules(), 'day.json');

  test('单日工具可独立验证内容；输入顺序不决定归属，生产入口另做整库校验', () => {
    expect(check(rawDay)).toHaveLength(6);
    expect(check([...rawDay].reverse()).map((item) => item.id)).toEqual([...rawDay].reverse().map((item) => item.id));
  });

  test('缺题、重复 ID、未归属 ID 均有文件定位', () => {
    expect(() => check(rawDay.slice(0, 5))).toThrow('day.json');
    expect(() => check([rawDay[0], rawDay[0], ...rawDay.slice(2)])).toThrow('day.json[1].id');
    expect(() => check([{ ...rawDay[0], id: 'd2-01' }, ...rawDay.slice(1)])).toThrow('day.json[0].id');
  });

  test.each([
    [{ ruleId: 'R9' }, 'finding.ruleId'],
    [{ ruleId: 'R2' }, 'finding.ruleId'],
    [{ impact: 'policy' }, 'finding.impact'],
  ])('未知/未来规则和不一致影响被拒绝：%j', (patch, path) => {
    const copy = rawDay.map((item, i) => i === 3 ? { ...item, finding: { ...item.finding, ...patch } } : item);
    expect(() => check(copy)).toThrow(`day.json[3].${path}`);
  });

  test('CI 与 R1 一致，拒绝错误正常/问题分布', () => {
    expect(() => check(rawDay.map((item, i) => i === 3 ? { ...item, ci: { ...item.ci, status: 'passed' } } : item)))
      .toThrow('day.json[3].ci.status');
    expect(() => check(rawDay.map((item, i) => i === 0 ? { ...item, ci: { ...item.ci, status: 'failed' } } : item)))
      .toThrow('day.json[0].ci.status');
    const copy = rawDay.map((item, i) => i === 3 ? {
      ...item, finding: null, approvalExplanation: '假的正常解释', ci: { ...item.ci, status: 'passed' },
    } : item);
    expect(() => check(copy)).toThrow(/分布/);
  });
});

describe('映射与规则的类型入口', () => {
  test('真实五天映射与规则能校验，无类型断言', () => {
    expect(parseCampaign(rawCampaign)).toEqual(rawCampaign);
    expect(parseRules(rawRules)).toEqual(rawRules);
  });

  test('拒绝非法映射类型、版本、天数和重复案例归属', () => {
    expect(() => parseCampaign(null, 'campaign.json')).toThrow('campaign.json');
    expect(() => parseCampaign({ ...rawCampaign, contentVersion: '' })).toThrow('contentVersion');
    expect(() => parseCampaign({ ...rawCampaign, days: [] })).toThrow('days');
    expect(() => parseCampaign({ ...rawCampaign, days: rawCampaign.days.map((day, i) =>
      i === 1 ? { ...day, caseIds: ['d1-01', ...day.caseIds.slice(1)] } : day) }))
      .toThrow('days[1].caseIds[0]');
    expect(() => parseCampaign({ ...rawCampaign, days: rawCampaign.days.map((day, i) =>
      i === 1 ? { ...day, day: 1 } : day) })).toThrow('days[1].day');
  });

  test('拒绝非法规则类型、重复规则和批准作为违规裁决', () => {
    expect(() => parseRules([rawRules[0], rawRules[0], ...rawRules.slice(2)], 'rules.json'))
      .toThrow('rules.json[1].id');
    expect(() => parseRules(rawRules.map((rule, i) => i === 0 ? { ...rule, unlockDay: '1' } : rule)))
      .toThrow('[0].unlockDay');
    expect(() => parseRules(rawRules.map((rule, i) => i === 0 ? { ...rule, violationVerdict: 'approve' } : rule)))
      .toThrow('[0].violationVerdict');
    expect(() => parseRules(rawRules.map((rule, i) => i === 0 ? { ...rule, examples: { approve: '' } } : rule)))
      .toThrow('[0].examples.approve');
  });

  test('映射、规则、简报例子及 API 参考的未知字段也有精确定位', () => {
    expect(() => parseCampaign({ ...rawCampaign, unexpected: true })).toThrow('src/data/campaign.json.unexpected');
    const campaign = structuredClone(rawCampaign);
    Object.assign(campaign.days[0], { unexpected: true });
    expect(() => parseCampaign(campaign)).toThrow('src/data/campaign.json.days[0].unexpected');
    expect(() => parseRules(rawRules.map((rule, index) => index === 0 ? { ...rule, unexpected: true } : rule)))
      .toThrow('src/data/rules.json[0].unexpected');
    expect(() => parseRules(rawRules.map((rule, index) => index === 0 ? {
      ...rule, examples: { ...rule.examples, unexpected: true },
    } : rule))).toThrow('src/data/rules.json[0].examples.unexpected');
    expect(() => parseCase({ ...rawDay[3], apiReference: [
      { name: 'api', signature: '() => void', notes: '说明', unexpected: true },
    ] }, source)).toThrow(`${source}.apiReference[0].unexpected`);
  });
});
