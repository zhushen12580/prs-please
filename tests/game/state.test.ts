import { describe, expect, test } from 'vitest';
import { campaign, cases, rules } from '../../src/content/load';
import { canAdvanceDay, canSubmit, createGame, currentCase, transition, workTime } from '../../src/game/state';
import { summarize } from '../../src/game/score';
import type { GameState, Verdict } from '../../src/game/types';
import { answerKey } from '../fixtures/answer-key';

const content = { campaign, cases, rules };
const order = ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'];
const times = ['10:30', '12:00', '13:30', '15:00', '16:30', '18:00'];
const act = (state: GameState, action: Parameters<typeof transition>[1]) => transition(state, action, content);
const start = () => act(createGame('maintainer-001', content), { type: 'startReview' });

describe('第一天纯状态机', () => {
  test('初始化种子和简报；开始评审前、选证据和选裁决不推进时钟', () => {
    const initial = createGame(' maintainer-001 ', content);
    expect(initial).toMatchObject({ seed: 'maintainer-001', contentVersion: '1.0.0', phase: 'briefing', day: 1, position: 0, records: [], draft: { verdict: null, evidenceIds: [] } });
    expect(() => createGame('bad seed', content)).toThrow();
    expect(act(initial, { type: 'submit', caseId: 'd1-02' })).toBe(initial);
    const review = act(initial, { type: 'startReview' });
    expect(currentCase(review, content).id).toBe('d1-02');
    expect(workTime(review, content)).toBe('09:00');
    const selected = act(act(review, { type: 'selectVerdict', verdict: 'approve' }), { type: 'selectEvidence', evidenceIds: ['disclosure'] });
    expect(workTime(selected, content)).toBe('09:00');
    expect(review.draft).toEqual({ verdict: null, evidenceIds: [] });
    expect(selected.records).toEqual([]);
  });

  test('领域层拒绝无裁决、空证据的非批准、未知证据、错误案例和跳过', () => {
    const initial = start();
    expect(canSubmit(initial, content)).toBe(false);
    expect(act(initial, { type: 'submit', caseId: 'd1-02' })).toBe(initial);
    expect(act(initial, { type: 'next', caseId: 'd1-02' })).toBe(initial);
    expect(act(initial, { type: 'selectEvidence', evidenceIds: ['missing'] })).toBe(initial);
    for (const verdict of ['request_changes', 'reject'] as const) {
      const selected = act(initial, { type: 'selectVerdict', verdict });
      expect(canSubmit(selected, content)).toBe(false);
      expect(act(selected, { type: 'submit', caseId: 'd1-02' })).toBe(selected);
      const withEvidence = act(selected, { type: 'selectEvidence', evidenceIds: ['disclosure'] });
      expect(canSubmit(withEvidence, content)).toBe(true);
      expect(act(withEvidence, { type: 'submit', caseId: 'd1-05' })).toBe(withEvidence);
      expect(act(withEvidence, { type: 'selectEvidence', evidenceIds: [] }).draft.evidenceIds).toEqual([]);
    }
    // 即使来自不可信调用者，也不能提交非法裁决值。
    expect(act(initial, { type: 'selectVerdict', verdict: 'invalid' as Verdict })).toBe(initial);
    expect(canSubmit(act(initial, { type: 'selectVerdict', verdict: 'approve' }), content)).toBe(true);
  });

  test('提交快照去重并锁定反馈，重放提交和旧控件不能重复记分或推进', () => {
    const ids = ['disclosure', 'disclosure'];
    let state = act(start(), { type: 'selectEvidence', evidenceIds: ids });
    ids.push('tool-tests');
    expect(state.draft.evidenceIds).toEqual(['disclosure']);
    state = act(state, { type: 'selectVerdict', verdict: 'approve' });
    const feedback = act(state, { type: 'submit', caseId: 'd1-02' });
    expect(feedback.phase).toBe('feedback');
    expect(feedback.position).toBe(0);
    expect(currentCase(feedback, content).id).toBe('d1-02');
    expect(feedback.records).toEqual([{ caseId: 'd1-02', verdict: 'approve', evidenceIds: ['disclosure'] }]);
    expect(workTime(feedback, content)).toBe('10:30');
    for (const action of [{ type: 'submit', caseId: 'd1-02' }, { type: 'selectVerdict', verdict: 'reject' },
      { type: 'selectEvidence', evidenceIds: [] }, { type: 'startReview' }, { type: 'next', caseId: 'd1-05' }] as const) {
      expect(act(feedback, action)).toBe(feedback);
    }
    expect(summarize(feedback.records, content).points).toBe(10);
    const next = act(feedback, { type: 'next', caseId: 'd1-02' });
    expect(next.phase).toBe('review');
    expect(currentCase(next, content).id).toBe('d1-05');
    expect(next.draft).toEqual({ verdict: null, evidenceIds: [] });
    expect(act(next, { type: 'submit', caseId: 'd1-02' })).toBe(next);
    expect(act(next, { type: 'next', caseId: 'd1-02' })).toBe(next);
  });

  test('六题逐次提交，反馈不换题；第六题反馈后才进入 18:00 日结', () => {
    let state = start();
    for (const [index, id] of order.entries()) {
      expect(currentCase(state, content).id).toBe(id);
      expect(state.position).toBe(index);
      state = act(state, { type: 'selectVerdict', verdict: answerKey[id].verdict });
      state = act(state, { type: 'selectEvidence', evidenceIds: answerKey[id].evidenceSets[0] ?? [] });
      state = act(state, { type: 'submit', caseId: id });
      expect(state.phase).toBe('feedback');
      expect(currentCase(state, content).id).toBe(id);
      expect(workTime(state, content)).toBe(times[index]);
      expect(state.records).toHaveLength(index + 1);
      state = act(state, { type: 'next', caseId: id });
      expect(state.phase).toBe(index === 5 ? 'daySummary' : 'review');
    }
    expect(state.day).toBe(1);
    expect(workTime(state, content)).toBe('18:00');
    expect(summarize(state.records, content)).toMatchObject({ points: 60, correctVerdicts: 6 });
    expect(act(state, { type: 'next', caseId: 'd1-01' })).toBe(state);
    expect(act(state, { type: 'submit', caseId: 'd1-01' })).toBe(state);
    expect(act(state, { type: 'startReview' })).toBe(state);
  });
});

describe('第二天跨日状态机', () => {
  function finishDay(initial: GameState, ids: readonly string[]): GameState {
    let state = initial;
    for (const id of ids) {
      expect(currentCase(state, content).id).toBe(id);
      state = act(state, { type: 'selectVerdict', verdict: answerKey[id].verdict });
      state = act(state, { type: 'selectEvidence', evidenceIds: answerKey[id].evidenceSets[0] ?? [] });
      state = act(state, { type: 'submit', caseId: id });
      state = act(state, { type: 'next', caseId: id });
    }
    expect(state.phase).toBe('daySummary');
    return state;
  }

  test('日结才能跨日，重置时钟和草稿，保留第一天的六条记录与 60 分', () => {
    const initial = createGame('maintainer-001', content);
    expect(canAdvanceDay(initial, content)).toBe(false);
    expect(act(initial, { type: 'nextDay', day: 1 })).toBe(initial);
    const review = start();
    expect(act(review, { type: 'nextDay', day: 1 })).toBe(review);
    const feedback = act(act(review, { type: 'selectVerdict', verdict: 'approve' }), { type: 'submit', caseId: 'd1-02' });
    expect(act(feedback, { type: 'nextDay', day: 1 })).toBe(feedback);

    const summary = finishDay(start(), order);
    expect(canAdvanceDay(summary, content)).toBe(true);
    expect(act(summary, { type: 'nextDay', day: 2 })).toBe(summary);
    expect(act({ ...summary, records: [] }, { type: 'nextDay', day: 1 }).day).toBe(1);
    const next = act(summary, { type: 'nextDay', day: 1 });
    expect(next).toMatchObject({ phase: 'briefing', day: 2, position: 0, seed: 'maintainer-001',
      contentVersion: '1.0.0', draft: { verdict: null, evidenceIds: [] } });
    expect(next.records).toEqual(summary.records);
    expect(workTime(next, content)).toBe('09:00');
    expect(summarize(next.records, content)).toMatchObject({ points: 60, reviewed: 6 });
    expect(act(next, { type: 'nextDay', day: 1 })).toBe(next);
    expect(act(next, { type: 'submit', caseId: 'd2-01' })).toBe(next);
    const nextReview = act(next, { type: 'startReview' });
    expect(currentCase(nextReview, content).id).toBe('d2-01');
    expect(act(nextReview, { type: 'submit', caseId: 'd1-01' })).toBe(nextReview);
  });

  test('第二天集合独立、旧 R1 仍计分，十二次全对累计 120 分且未加载第三天不可进入', () => {
    const first = finishDay(start(), order);
    const next = act(act(first, { type: 'nextDay', day: 1 }), { type: 'startReview' });
    const summary = finishDay(next, ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06']);
    expect(summary.day).toBe(2);
    expect(workTime(summary, content)).toBe('18:00');
    expect(new Set(summary.records.map((record) => record.caseId)).size).toBe(12);
    expect(summarize(summary.records, content)).toEqual({ points: 120, maxPoints: 120, reviewed: 12,
      correctVerdicts: 12, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 });
    expect(canAdvanceDay(summary, content)).toBe(false);
    expect(act(summary, { type: 'nextDay', day: 2 })).toBe(summary);
    expect(act(summary, { type: 'nextDay', day: 1 })).toBe(summary);
    const missing = { ...content, cases: content.cases.filter((item) => item.id !== 'd2-03') };
    expect(canAdvanceDay(first, missing)).toBe(false);
    expect(transition(first, { type: 'nextDay', day: 1 }, missing)).toBe(first);
  });
});
