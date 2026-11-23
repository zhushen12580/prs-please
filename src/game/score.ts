import { standardVerdict } from './rules';
import type { DecisionRecord, GameContent, ReviewCase, Rule, Verdict } from './types';

export interface DecisionScore {
  standardVerdict: Verdict;
  verdictCorrect: boolean;
  evidenceCorrect: boolean;
  points: 0 | 5 | 10;
}

export interface Statistics {
  points: number;
  maxPoints: number;
  reviewed: number;
  correctVerdicts: number;
  violationsMerged: number;
  bugsMerged: number;
  goodPrsHarmed: number;
}

export function evidenceMatches(selected: readonly string[], sufficientSets: readonly (readonly string[])[]): boolean {
  const ids = new Set(selected);
  return sufficientSets.some((sufficient) => {
    const required = new Set(sufficient);
    return ids.size === required.size && [...required].every((id) => ids.has(id));
  });
}

export function scoreDecision(
  reviewCase: ReviewCase,
  rules: readonly Rule[],
  day: number,
  record: DecisionRecord,
): DecisionScore {
  const standard = standardVerdict(reviewCase, rules, day);
  const verdictCorrect = record.verdict === standard;
  const evidenceCorrect = standard === 'approve' || evidenceMatches(record.evidenceIds, reviewCase.finding?.evidenceSets ?? []);
  return { standardVerdict: standard, verdictCorrect, evidenceCorrect,
    points: verdictCorrect ? (evidenceCorrect ? 10 : 5) : 0 };
}

// 日结和总成绩均从去重记录即时推导；裁决正确数不受证据得分影响。
export function summarize(records: readonly DecisionRecord[], content: GameContent): Statistics {
  const totals: Statistics = { points: 0, maxPoints: 0, reviewed: 0, correctVerdicts: 0,
    violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 };
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.caseId)) continue;
    seen.add(record.caseId);
    const reviewCase = content.cases.find((entry) => entry.id === record.caseId);
    const day = content.campaign.days.find((entry) => entry.caseIds.includes(record.caseId));
    if (!reviewCase || !day) throw new Error(`找不到案例或关卡 ${record.caseId}`);
    const score = scoreDecision(reviewCase, content.rules, day.day, record);
    totals.reviewed++;
    totals.maxPoints += 10;
    totals.points += score.points;
    if (score.verdictCorrect) totals.correctVerdicts++;
    if (score.standardVerdict !== 'approve' && record.verdict === 'approve') {
      totals.violationsMerged++;
      if (reviewCase.finding?.impact === 'bug' || reviewCase.finding?.impact === 'backdoor') totals.bugsMerged++;
    }
    if (score.standardVerdict === 'approve' && record.verdict !== 'approve') totals.goodPrsHarmed++;
  }
  return totals;
}
