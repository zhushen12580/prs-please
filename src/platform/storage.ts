import { normalizeSeed } from '../game/random';
import { hasConsistentProgress } from '../game/state';
import type { GameContent, GameSave, GameState, Verdict } from '../game/types';

const saveKey = 'prs-please.save.v1';

function gameState(state: GameState): GameState {
  return {
    contentVersion: state.contentVersion,
    seed: state.seed,
    phase: state.phase,
    day: state.day,
    position: state.position,
    records: state.records.map((record) => ({ caseId: record.caseId, verdict: record.verdict,
      evidenceIds: [...record.evidenceIds] })),
    draft: { verdict: state.draft.verdict, evidenceIds: [...state.draft.evidenceIds] },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVerdict(value: unknown): value is Verdict {
  return value === 'approve' || value === 'request_changes' || value === 'reject';
}

function isEvidenceIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id: unknown) => typeof id === 'string');
}

function isGameSave(value: unknown): value is GameSave {
  return isObject(value) && value.saveVersion === 1
    && typeof value.contentVersion === 'string'
    && typeof value.seed === 'string' && normalizeSeed(value.seed) === value.seed
    && (value.phase === 'briefing' || value.phase === 'review' || value.phase === 'feedback'
      || value.phase === 'daySummary' || value.phase === 'final')
    && typeof value.day === 'number' && Number.isInteger(value.day) && value.day >= 1 && value.day <= 5
    && typeof value.position === 'number' && Number.isInteger(value.position) && value.position >= 0 && value.position < 6
    && Array.isArray(value.records) && value.records.every((record: unknown) => isObject(record)
      && typeof record.caseId === 'string' && isVerdict(record.verdict) && isEvidenceIds(record.evidenceIds))
    && isObject(value.draft) && (value.draft.verdict === null || isVerdict(value.draft.verdict))
    && isEvidenceIds(value.draft.evidenceIds);
}

export function serializeGame(state: GameState): string {
  const save: GameSave = { saveVersion: 1, ...gameState(state) };
  return JSON.stringify(save);
}

export function restoreGame(serialized: string, content: GameContent): GameState {
  const save: unknown = JSON.parse(serialized);
  if (!isGameSave(save) || save.contentVersion !== content.campaign.contentVersion || !hasConsistentProgress(save, content)) {
    throw new Error('旧进度不可用');
  }
  // 明确复制持久化字段，存档夹带的累计分、队列等数据不会进入运行时状态。
  return gameState(save);
}

interface LoadResult {
  state: GameState | undefined;
  invalidSave: boolean;
  unavailable: boolean;
}

export function loadGame(storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined, content: GameContent): LoadResult {
  const result: LoadResult = { state: undefined, invalidSave: false, unavailable: false };
  if (!storage) return { ...result, unavailable: true };
  let serialized: string | null;
  try {
    serialized = storage.getItem(saveKey);
  } catch {
    return { ...result, unavailable: true };
  }
  if (serialized === null) return result;
  try {
    result.state = restoreGame(serialized, content);
  } catch {
    result.invalidSave = true;
    try {
      storage.removeItem(saveKey);
    } catch {
      result.unavailable = true;
    }
  }
  return result;
}

export function saveGame(storage: Pick<Storage, 'setItem'> | undefined, state: GameState): boolean {
  try {
    if (!storage) return false;
    storage.setItem(saveKey, serializeGame(state));
    return true;
  } catch {
    return false;
  }
}
