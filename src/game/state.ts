import { normalizeSeed, orderCases } from './random';
import type { GameContent, GameState, ReviewCase, Verdict } from './types';

export type GameAction =
  | { type: 'restart'; seed: string }
  | { type: 'startReview' }
  | { type: 'selectVerdict'; verdict: Verdict }
  | { type: 'selectEvidence'; evidenceIds: readonly string[] }
  | { type: 'submit'; caseId: string }
  | { type: 'next'; caseId: string }
  | { type: 'nextDay'; day: number }
  | { type: 'finishCampaign'; day: number };

function dayDefinition(state: GameState, content: GameContent) {
  const day = content.campaign.days.find((entry) => entry.day === state.day);
  if (!day) throw new Error(`缺少第 ${state.day} 天关卡`);
  return day;
}

export function createGame(inputSeed: string, content: GameContent): GameState {
  const seed = normalizeSeed(inputSeed);
  if (!seed) throw new Error('无效种子');
  return { seed, contentVersion: content.campaign.contentVersion, phase: 'briefing', day: 1,
    position: 0, records: [], draft: { verdict: null, evidenceIds: [] } };
}

export function currentCase(state: GameState, content: GameContent): ReviewCase {
  const day = dayDefinition(state, content);
  const id = orderCases(day.caseIds, state.contentVersion, state.seed, state.day)[state.position];
  const reviewCase = content.cases.find((entry) => entry.id === id);
  if (!reviewCase) throw new Error(`缺少案例 ${id}`);
  return reviewCase;
}

export function workTime(state: GameState, content: GameContent): string {
  const caseIds = new Set(dayDefinition(state, content).caseIds);
  const count = new Set(state.records.filter((record) => caseIds.has(record.caseId)).map((record) => record.caseId)).size;
  const minutes = 9 * 60 + count * 90;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function isVerdict(value: unknown): value is Verdict {
  return value === 'approve' || value === 'request_changes' || value === 'reject';
}

function validEvidence(ids: readonly string[], reviewCase: ReviewCase): boolean {
  const known = new Set([reviewCase.description.disclosure.id,
    ...reviewCase.contributor.toolRecords.map((entry) => entry.id),
    ...reviewCase.ci.logs.map((entry) => entry.id),
    ...reviewCase.files.flatMap((file) => file.lines.map((entry) => entry.id))]);
  return ids.every((id) => known.has(id));
}

export function canSubmit(state: GameState, content: GameContent): boolean {
  if (state.phase !== 'review' || !isVerdict(state.draft.verdict)) return false;
  const reviewCase = currentCase(state, content);
  return !state.records.some((record) => record.caseId === reviewCase.id)
    && validEvidence(state.draft.evidenceIds, reviewCase)
    && (state.draft.verdict === 'approve' || state.draft.evidenceIds.length > 0);
}

export function canAdvanceDay(state: GameState, content: GameContent): boolean {
  if (state.phase !== 'daySummary') return false;
  const completed = new Set(state.records.map((record) => record.caseId));
  if (!dayDefinition(state, content).caseIds.every((id) => completed.has(id))) return false;
  const nextDay = content.campaign.days.find((entry) => entry.day === state.day + 1);
  const available = new Set(content.cases.map((entry) => entry.id));
  return nextDay !== undefined && nextDay.caseIds.every((id) => available.has(id));
}

export function canFinishCampaign(state: GameState, content: GameContent): boolean {
  if (state.phase !== 'daySummary' || state.day !== Math.max(...content.campaign.days.map((day) => day.day))) return false;
  const completed = new Set(state.records.map((record) => record.caseId));
  return content.campaign.days.every((day) => day.caseIds.every((id) => completed.has(id)));
}

export function transition(state: GameState, action: GameAction, content: GameContent): GameState {
  if (action.type === 'restart') {
    return normalizeSeed(action.seed) === null ? state : createGame(action.seed, content);
  }
  if (action.type === 'finishCampaign') {
    return action.day === state.day && canFinishCampaign(state, content) ? { ...state, phase: 'final' } : state;
  }
  if (action.type === 'nextDay') {
    if (action.day !== state.day || !canAdvanceDay(state, content)) return state;
    return { ...state, day: state.day + 1, phase: 'briefing', position: 0,
      draft: { verdict: null, evidenceIds: [] } };
  }
  if (action.type === 'startReview') {
    return state.phase === 'briefing' ? { ...state, phase: 'review' } : state;
  }
  if (action.type === 'next') {
    if (state.phase !== 'feedback' || action.caseId !== currentCase(state, content).id) return state;
    const last = state.position === dayDefinition(state, content).caseIds.length - 1;
    return { ...state, phase: last ? 'daySummary' : 'review', position: last ? state.position : state.position + 1,
      draft: { verdict: null, evidenceIds: [] } };
  }
  if (state.phase !== 'review') return state;
  switch (action.type) {
    case 'selectVerdict':
      return isVerdict(action.verdict) ? { ...state, draft: { ...state.draft, verdict: action.verdict } } : state;
    case 'selectEvidence':
      return validEvidence(action.evidenceIds, currentCase(state, content))
        ? { ...state, draft: { ...state.draft, evidenceIds: [...new Set(action.evidenceIds)] } } : state;
    case 'submit': {
      const reviewCase = currentCase(state, content);
      const verdict = state.draft.verdict;
      if (action.caseId !== reviewCase.id || !canSubmit(state, content) || !verdict) return state;
      const record = { caseId: reviewCase.id, verdict, evidenceIds: [...new Set(state.draft.evidenceIds)] };
      return { ...state, phase: 'feedback', records: [...state.records, record] };
    }
  }
}
