import type { Campaign, DiffLine, EvidenceEntry, Finding, GameContent, Impact, ReviewCase, Rule } from '../game/types';

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(value: unknown, path: string, fields?: readonly string[]): Record<string, unknown> {
  if (!isObject(value)) fail(path, '必须为对象');
  if (fields) {
    for (const key of Object.keys(value)) {
      if (!fields.includes(key)) fail(`${path}.${key}`, '未知字段');
    }
  }
  return value;
}

function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string') fail(path, '必须为文本');
  if (!allowEmpty && !value.trim()) fail(path, '文本不能为空');
  return value;
}

function list(value: unknown, path: string, min = 1, max = Infinity): unknown[] {
  if (!Array.isArray(value)) fail(path, '必须为数组');
  if (value.length < min || value.length > max) fail(path, `数量必须在 ${min}–${max} 之间`);
  return value;
}

function integer(value: unknown, path: string, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(path, `必须为 ${min}–${max} 之间的整数`);
  }
  return value;
}

function oneOf<const T extends string>(value: unknown, choices: readonly T[], path: string): T {
  for (const choice of choices) if (value === choice) return choice;
  return fail(path, `必须为 ${choices.join(' / ')}`);
}

function unique(value: string | number, seen: Set<string | number>, path: string): void {
  if (seen.has(value)) fail(path, `重复值 ${value}`);
  seen.add(value);
}

export function parseCampaign(input: unknown, source = 'src/data/campaign.json'): Campaign {
  const value = object(input, source, ['contentVersion', 'days']);
  const contentVersion = text(value.contentVersion, `${source}.contentVersion`);
  const seenDays = new Set<string | number>();
  const seenCases = new Set<string | number>();
  const seenRules = new Set<string | number>();
  const days = list(value.days, `${source}.days`, 5, 5).map((item, index) => {
    const path = `${source}.days[${index}]`;
    const entry = object(item, path, ['day', 'newRuleId', 'caseIds']);
    const day = integer(entry.day, `${path}.day`, 1, 5);
    unique(day, seenDays, `${path}.day`);
    const newRuleId = text(entry.newRuleId, `${path}.newRuleId`);
    unique(newRuleId, seenRules, `${path}.newRuleId`);
    const caseIds = list(entry.caseIds, `${path}.caseIds`, 6, 6).map((id, i) => {
      const idPath = `${path}.caseIds[${i}]`;
      const parsed = text(id, idPath);
      unique(parsed, seenCases, idPath);
      return parsed;
    });
    return { day, newRuleId, caseIds };
  });
  return { contentVersion, days };
}

export function parseRules(input: unknown, source = 'src/data/rules.json'): Rule[] {
  const seenIds = new Set<string | number>();
  const seenDays = new Set<string | number>();
  return list(input, source, 5, 5).map((item, index) => {
    const path = `${source}[${index}]`;
    const value = object(item, path, ['id', 'unlockDay', 'title', 'body', 'examples', 'violationVerdict']);
    const id = text(value.id, `${path}.id`);
    unique(id, seenIds, `${path}.id`);
    const unlockDay = integer(value.unlockDay, `${path}.unlockDay`, 1, 5);
    unique(unlockDay, seenDays, `${path}.unlockDay`);
    const examples = object(value.examples, `${path}.examples`, ['approve', 'violation']);
    return {
      id, unlockDay,
      title: text(value.title, `${path}.title`),
      body: text(value.body, `${path}.body`),
      examples: {
        approve: text(examples.approve, `${path}.examples.approve`),
        violation: text(examples.violation, `${path}.examples.violation`),
      },
      violationVerdict: oneOf(value.violationVerdict, ['request_changes', 'reject'], `${path}.violationVerdict`),
    };
  });
}

export function parseCase(input: unknown, source = 'case'): ReviewCase {
  const value = object(input, source, ['id', 'title', 'description', 'contributor', 'ci', 'files', 'sources',
    'apiReference', 'finding', 'approvalExplanation']);
  const evidenceIds = new Set<string | number>();
  const filePaths = new Set<string | number>();
  function evidence(input: unknown, path: string, allowEmpty = false,
    fields: readonly string[] = ['id', 'text']): EvidenceEntry {
    const entry = object(input, path, fields);
    const id = text(entry.id, `${path}.id`);
    unique(id, evidenceIds, `${path}.id`);
    return { id, text: text(entry.text, `${path}.text`, allowEmpty) };
  }

  function line(input: unknown, path: string): DiffLine {
    const value = object(input, path);
    const entry = evidence(value, path, true, ['id', 'text', 'kind', 'oldLine', 'newLine']);
    const kind = oneOf(value.kind, ['add', 'delete', 'context'], `${path}.kind`);
    if (kind === 'add') {
      if (value.oldLine !== null) fail(`${path}.oldLine`, '新增行的旧行号必须为 null');
      return { ...entry, kind, oldLine: null, newLine: integer(value.newLine, `${path}.newLine`) };
    }
    if (kind === 'delete') {
      if (value.newLine !== null) fail(`${path}.newLine`, '删除行的新行号必须为 null');
      return { ...entry, kind, oldLine: integer(value.oldLine, `${path}.oldLine`), newLine: null };
    }
    return { ...entry, kind, oldLine: integer(value.oldLine, `${path}.oldLine`),
      newLine: integer(value.newLine, `${path}.newLine`) };
  }

  const description = object(value.description, `${source}.description`, ['summary', 'disclosure']);
  const contributor = object(value.contributor, `${source}.contributor`, ['name', 'handle', 'toolRecords']);
  const ci = object(value.ci, `${source}.ci`, ['status', 'logs']);
  const materials = {
    id: text(value.id, `${source}.id`),
    title: text(value.title, `${source}.title`),
    description: {
      summary: text(description.summary, `${source}.description.summary`),
      disclosure: evidence(description.disclosure, `${source}.description.disclosure`, true),
    },
    contributor: {
      name: text(contributor.name, `${source}.contributor.name`),
      handle: text(contributor.handle, `${source}.contributor.handle`),
      toolRecords: list(contributor.toolRecords, `${source}.contributor.toolRecords`).map((entry, i) =>
        evidence(entry, `${source}.contributor.toolRecords[${i}]`)),
    },
    ci: {
      status: oneOf(ci.status, ['passed', 'failed'], `${source}.ci.status`),
      logs: list(ci.logs, `${source}.ci.logs`).map((entry, i) => evidence(entry, `${source}.ci.logs[${i}]`)),
    },
    files: list(value.files, `${source}.files`, 1, 2).map((input, i) => {
      const path = `${source}.files[${i}]`;
      const file = object(input, path, ['path', 'lines']);
      const filePath = text(file.path, `${path}.path`);
      unique(filePath, filePaths, `${path}.path`);
      let lastOld = 0;
      let lastNew = 0;
      const lines = list(file.lines, `${path}.lines`).map((entry, j) => {
        const linePath = `${path}.lines[${j}]`;
        const parsed = line(entry, linePath);
        if (parsed.oldLine !== null) {
          if (parsed.oldLine <= lastOld) fail(`${linePath}.oldLine`, '旧行号必须递增且不重复');
          lastOld = parsed.oldLine;
        }
        if (parsed.newLine !== null) {
          if (parsed.newLine <= lastNew) fail(`${linePath}.newLine`, '新行号必须递增且不重复');
          lastNew = parsed.newLine;
        }
        return parsed;
      });
      return { path: filePath, lines };
    }),
    sources: list(value.sources, `${source}.sources`).map((input, i) => {
      const path = `${source}.sources[${i}]`;
      const entry = object(input, path, ['url', 'theme', 'note']);
      const url = text(entry.url, `${path}.url`);
      try {
        if (new URL(url).protocol !== 'https:') fail(`${path}.url`, '来源 URL 必须使用 https:');
      } catch {
        fail(`${path}.url`, '来源必须是有效的 https: URL');
      }
      return { url, theme: text(entry.theme, `${path}.theme`), note: text(entry.note, `${path}.note`) };
    }),
  };

  const lineCount = materials.files.reduce((sum, file) => sum + file.lines.length, 0);
  if (lineCount < 12 || lineCount > 35) fail(`${source}.files`, 'diff 合计必须为 12–35 行');

  const api = 'apiReference' in value ? {
    apiReference: list(value.apiReference, `${source}.apiReference`).map((input, i) => {
      const path = `${source}.apiReference[${i}]`;
      const entry = object(input, path, ['name', 'signature', 'notes']);
      return { name: text(entry.name, `${path}.name`), signature: text(entry.signature, `${path}.signature`),
        notes: text(entry.notes, `${path}.notes`) };
    }),
  } : {};

  if (value.finding === null) {
    return { ...materials, ...api, finding: null,
      approvalExplanation: text(value.approvalExplanation, `${source}.approvalExplanation`) };
  }

  const path = `${source}.finding`;
  const finding = object(value.finding, path, ['ruleId', 'impact', 'evidenceSets', 'explanation']);
  if ('approvalExplanation' in value) fail(`${source}.approvalExplanation`, '仅正常案例可以包含批准解释');
  const seenSets = new Set<string | number>();
  const evidenceSets = list(finding.evidenceSets, `${path}.evidenceSets`).map((input, i) => {
    const setPath = `${path}.evidenceSets[${i}]`;
    const seenIds = new Set<string | number>();
    const ids = list(input, setPath).map((input, j) => {
      const idPath = `${setPath}[${j}]`;
      const id = text(input, idPath);
      unique(id, seenIds, idPath);
      if (!evidenceIds.has(id)) fail(idPath, `引用的证据不存在或不可选：${id}`);
      return id;
    });
    unique(JSON.stringify([...ids].sort()), seenSets, setPath);
    return ids;
  });
  const parsedFinding: Finding = {
    ruleId: text(finding.ruleId, `${path}.ruleId`),
    impact: oneOf(finding.impact, ['bug', 'policy', 'backdoor'], `${path}.impact`),
    evidenceSets,
    explanation: text(finding.explanation, `${path}.explanation`),
  };
  return { ...materials, ...api, finding: parsedFinding };
}

const impacts = new Map<string, Impact>([
  ['R1', 'bug'], ['R2', 'bug'], ['R3', 'policy'], ['R4', 'bug'], ['R5', 'backdoor'],
]);

const distributions: Record<number, Record<string, number>> = {
  1: { approve: 3, R1: 3 },
  2: { approve: 2, R2: 3, R1: 1 },
  3: { approve: 2, R3: 3, R2: 1 },
  4: { approve: 2, R4: 3, R1: 1 },
  5: { approve: 2, R5: 2, R3: 1, R4: 1 },
};

function validateCaseRules(item: ReviewCase, day: number, rules: readonly Rule[], path: string): void {
  const finding = item.finding;
  if (finding) {
    const rule = rules.find((rule) => rule.id === finding.ruleId);
    if (!rule || rule.unlockDay > day) fail(`${path}.finding.ruleId`, '规则未知或尚未解锁');
    if (finding.impact !== impacts.get(finding.ruleId)) fail(`${path}.finding.impact`, '影响标签与规则不一致');
  }
  const expectedCI = finding?.ruleId === 'R1' ? 'failed' : 'passed';
  if (item.ci.status !== expectedCI) fail(`${path}.ci.status`, 'CI 状态与 R1 违规不一致');
}

function validateDistribution(cases: readonly ReviewCase[], day: number, path: string): void {
  const expected = distributions[day];
  const actual: Record<string, number> = {};
  for (const item of cases) {
    const key = item.finding?.ruleId ?? 'approve';
    actual[key] = (actual[key] ?? 0) + 1;
  }
  if (Object.keys(actual).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, count]) => actual[key] !== count)) {
    fail(path, `第 ${day} 天的正常/问题分布不符合约定`);
  }
}

// 独立单日工具复用相同的规则与分布检查；生产加载使用下面的整库入口。
export function validateDay(input: unknown, day: number, campaign: Campaign,
  rules: readonly Rule[], source: string): ReviewCase[] {
  const definition = campaign.days.find((entry) => entry.day === day);
  if (!definition) fail(source, `第 ${day} 天不存在`);
  const newRule = rules.find((rule) => rule.id === definition.newRuleId);
  if (!newRule || newRule.unlockDay !== day) fail(source, `第 ${day} 天的新规则与解锁日不一致`);
  const seen = new Set<string | number>();
  const cases = list(input, source, 6, 6).map((item, i) => {
    const path = `${source}[${i}]`;
    const parsed = parseCase(item, path);
    unique(parsed.id, seen, `${path}.id`);
    if (!definition.caseIds.includes(parsed.id)) fail(`${path}.id`, '案例未归属当天的 campaign 映射');
    validateCaseRules(parsed, day, rules, path);
    return parsed;
  });
  validateDistribution(cases, day, source);
  return cases;
}

export interface CaseFile {
  source: string;
  data: unknown;
}

export function validateContent(rawCampaign: unknown, rawRules: unknown, caseFiles: readonly CaseFile[]): GameContent {
  const campaignSource = 'src/data/campaign.json';
  const rulesSource = 'src/data/rules.json';
  const campaign = parseCampaign(rawCampaign, campaignSource);
  const rules = parseRules(rawRules, rulesSource);
  for (const [index, rule] of rules.entries()) {
    const path = `${rulesSource}[${index}]`;
    const unlockDay = ['R1', 'R2', 'R3', 'R4', 'R5'].indexOf(rule.id) + 1;
    if (!unlockDay) fail(`${path}.id`, '规则必须为 R1–R5');
    if (rule.unlockDay !== unlockDay) fail(`${path}.unlockDay`, '规则的解锁日不符合约定');
    const expectedVerdict = rule.id === 'R5' ? 'reject' : 'request_changes';
    if (rule.violationVerdict !== expectedVerdict) fail(`${path}.violationVerdict`, '违规裁决不符合规则约定');
  }

  const mappedIds = new Set(campaign.days.flatMap((day) => day.caseIds));
  const byId = new Map<string, { item: ReviewCase; path: string }>();
  const mappingErrors: string[] = [];
  const cases = caseFiles.flatMap(({ source, data }) => list(data, source, 0).map((rawCase, index) => {
    const path = `${source}[${index}]`;
    const item = parseCase(rawCase, path);
    const previous = byId.get(item.id);
    if (previous) fail(`${path}.id`, `重复案例 ID ${item.id}；首次位于 ${previous.path}.id`);
    byId.set(item.id, { item, path });
    if (!mappedIds.has(item.id)) mappingErrors.push(`${path}.id: 案例未归属 campaign 映射：${item.id}`);
    return item;
  }));

  for (const [index, day] of campaign.days.entries()) {
    const path = `${campaignSource}.days[${index}]`;
    const newRule = rules.find((rule) => rule.id === day.newRuleId);
    if (!newRule || newRule.unlockDay !== day.day) fail(`${path}.newRuleId`, '新规则与当日解锁规则不一致');
    for (const [caseIndex, id] of day.caseIds.entries()) {
      if (!byId.has(id)) mappingErrors.push(`${path}.caseIds[${caseIndex}]: 映射的案例不存在：${id}`);
    }
  }
  // 同时指出缺失的映射和未归属的案例，避免贡献者只能看到其中一端。
  if (mappingErrors.length) throw new Error(mappingErrors.join('\n'));

  for (const [index, day] of campaign.days.entries()) {
    const dayCases = day.caseIds.map((id) => {
      const entry = byId.get(id);
      if (!entry) return fail(`${campaignSource}.days[${index}].caseIds`, `映射的案例不存在：${id}`);
      validateCaseRules(entry.item, day.day, rules, entry.path);
      return entry.item;
    });
    validateDistribution(dayCases, day.day, `${campaignSource}.days[${index}].caseIds`);
  }
  return { campaign, rules, cases };
}
