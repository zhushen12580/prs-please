import { beforeEach, describe, expect, test } from 'vitest';
import { campaign, cases, rules } from '../../src/content/load';
import { summarize } from '../../src/game/score';
import { canSubmit, createGame, currentCase, transition, workTime } from '../../src/game/state';
import type { GameState } from '../../src/game/types';
import { loadGame, restoreGame, saveGame, serializeGame } from '../../src/platform/storage';
import { answerKey } from '../fixtures/answer-key';

const content = { campaign, cases, rules };
const key = 'prs-please.save.v1';

beforeEach(() => localStorage.clear());

// 仅使用人工答案驱动真实状态转换，不保存派生分数或题目队列。
function reviewed(count: number): GameState {
  let state = transition(createGame('maintainer-001', content), { type: 'startReview' }, content);
  for (let index = 0; index < count; index++) {
    const id = currentCase(state, content).id;
    const answer = answerKey[id];
    state = transition(state, { type: 'selectEvidence', evidenceIds: answer.evidenceSets[0] ?? [] }, content);
    state = transition(state, { type: 'selectVerdict', verdict: answer.verdict }, content);
    state = transition(state, { type: 'submit', caseId: id }, content);
    if (index === count - 1) break;
    state = transition(state, { type: 'next', caseId: id }, content);
    if (state.phase === 'daySummary') {
      state = transition(state, { type: 'nextDay', day: state.day }, content);
      state = transition(state, { type: 'startReview' }, content);
    }
  }
  return state;
}

function daySummary(count = 6): GameState {
  const state = reviewed(count);
  return transition(state, { type: 'next', caseId: currentCase(state, content).id }, content);
}

describe('单局存档序列化与恢复', () => {
  test('没有存档时没有可继续的游戏，也不创建空存档', () => {
    expect(loadGame(localStorage, content)).toBeUndefined();
    expect(localStorage.getItem(key)).toBeNull();
  });

  test('只序列化版本、种子、位置、记录和草稿，忽略夹带的派生数据', () => {
    const feedback = reviewed(2);
    let state = transition(feedback, { type: 'next', caseId: 'd1-05' }, content);
    state = transition(state, { type: 'selectEvidence', evidenceIds: ['disclosure'] }, content);
    state = transition(state, { type: 'selectVerdict', verdict: 'request_changes' }, content);
    const serialized = serializeGame(Object.assign({}, state, { points: 9999, time: '18:00', queue: ['d5-04'] }));
    expect(JSON.parse(serialized)).toEqual({
      saveVersion: 1, contentVersion: '1.0.0', seed: 'maintainer-001', phase: 'review', day: 1, position: 2,
      records: [
        { caseId: 'd1-02', verdict: 'approve', evidenceIds: [] },
        { caseId: 'd1-05', verdict: 'request_changes', evidenceIds: ['ci-type-failure'] },
      ],
      draft: { verdict: 'request_changes', evidenceIds: ['disclosure'] },
    });
    expect(restoreGame(serialized, content)).toEqual(state);
  });

  test.each([
    ['briefing', () => createGame('maintainer-001', content), 0, '09:00'],
    ['review', () => transition(reviewed(2), { type: 'next', caseId: 'd1-05' }, content), 20, '12:00'],
    ['feedback', () => reviewed(2), 20, '12:00'],
    ['daySummary', () => daySummary(), 60, '18:00'],
    ['final', () => transition(daySummary(30), { type: 'finishCampaign', day: 5 }, content), 300, '18:00'],
  ] as const)('%s 阶段恢复位置、记录、草稿及真实得分和时钟', (phase, makeState, points, time) => {
    const state = makeState();
    saveGame(localStorage, state);
    expect(localStorage.length).toBe(1);
    const restored = loadGame(localStorage, content);
    expect(restored).toEqual(state);
    if (!restored) throw new Error('没有恢复存档');
    expect(restored.phase).toBe(phase);
    expect(summarize(restored.records, content).points).toBe(points);
    expect(workTime(restored, content)).toBe(time);
  });

  test('恢复第三题的裁决和多项证据草稿，数据与解析对象相互独立', () => {
    let state = transition(reviewed(2), { type: 'next', caseId: 'd1-05' }, content);
    state = transition(state, { type: 'selectEvidence', evidenceIds: ['ci-timezone-failure', 'disclosure'] }, content);
    state = transition(state, { type: 'selectVerdict', verdict: 'reject' }, content);
    saveGame(localStorage, state);
    const restored = loadGame(localStorage, content);
    expect(restored).toEqual(state);
    expect(restored).not.toBe(state);
    expect(restored?.records).not.toBe(state.records);
    expect(restored?.draft.evidenceIds).not.toBe(state.draft.evidenceIds);
    if (!restored) throw new Error('没有恢复存档');
    expect(currentCase(restored, content).id).toBe('d1-04');
    expect(canSubmit(restored, content)).toBe(true);
  });

  test('恢复时丢弃假总分、假时钟及假队列，使用实际内容和裁决重新推导', () => {
    const serialized = JSON.stringify({ ...JSON.parse(serializeGame(reviewed(2))),
      points: 9999, statistics: { points: 9999 }, time: '18:00', queue: ['d5-04'] });
    const restored = restoreGame(serialized, content);
    expect(restored).toEqual(reviewed(2));
    expect(summarize(restored.records, content).points).toBe(20);
    expect(workTime(restored, content)).toBe('12:00');
    expect(currentCase(restored, content).id).toBe('d1-05');
  });

  test('反馈恢复始终锁定；重复提交或修改草稿不会追加记录或推进时钟', () => {
    const restored = restoreGame(serializeGame(reviewed(2)), content);
    expect(canSubmit(restored, content)).toBe(false);
    for (const action of [
      { type: 'submit', caseId: 'd1-05' },
      { type: 'selectVerdict', verdict: 'approve' },
      { type: 'selectEvidence', evidenceIds: ['disclosure'] },
    ] as const) {
      expect(transition(restored, action, content)).toBe(restored);
    }
    expect(restored.records).toHaveLength(2);
    expect(new Set(restored.records.map((record) => record.caseId)).size).toBe(2);
    expect(summarize(restored.records, content).points).toBe(20);
    expect(workTime(restored, content)).toBe('12:00');
  });

  test('确认重开后只覆盖同一个存档槽，另一合法种子从空白第一天恢复', () => {
    saveGame(localStorage, reviewed(2));
    const restarted = transition(reviewed(2), { type: 'restart', seed: '  maintainer-002  ' }, content);
    saveGame(localStorage, restarted);
    const restored = loadGame(localStorage, content);
    expect(restored).toEqual({ seed: 'maintainer-002', contentVersion: '1.0.0', phase: 'briefing',
      day: 1, position: 0, records: [], draft: { verdict: null, evidenceIds: [] } });
    if (!restored) throw new Error('没有恢复存档');
    expect(currentCase(restored, content).id).toBe('d1-03');
    expect(summarize(restored.records, content).points).toBe(0);
    expect(localStorage.length).toBe(1);
  });
});
