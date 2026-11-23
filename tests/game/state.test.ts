import { describe, expect, test } from 'vitest';
import { campaign, cases, rules } from '../../src/content/load';
import { canAdvanceDay, canFinishCampaign, canSubmit, createGame, currentCase, transition, workTime } from '../../src/game/state';
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

describe('第五天日结与最终阶段', () => {
  test('三十题逐日完成，最后反馈仍先进入日结，明确操作后才进入锁定的最终页', () => {
    const orders = [
      ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'],
      ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'],
      ['d3-05', 'd3-01', 'd3-02', 'd3-03', 'd3-06', 'd3-04'],
      ['d4-02', 'd4-06', 'd4-04', 'd4-05', 'd4-01', 'd4-03'],
      ['d5-04', 'd5-01', 'd5-03', 'd5-06', 'd5-05', 'd5-02'],
    ];
    let state = createGame('maintainer-001', content);
    for (const [dayIndex, ids] of orders.entries()) {
      expect(state).toMatchObject({ phase: 'briefing', day: dayIndex + 1, position: 0 });
      expect(workTime(state, content)).toBe('09:00');
      expect(act(state, { type: 'finishCampaign', day: state.day })).toBe(state);
      state = act(state, { type: 'startReview' });
      for (const [index, id] of ids.entries()) {
        expect(currentCase(state, content).id).toBe(id);
        expect(canFinishCampaign(state, content)).toBe(false);
        expect(act(state, { type: 'finishCampaign', day: state.day })).toBe(state);
        const answer = answerKey[id];
        state = act(state, { type: 'selectVerdict', verdict: answer.verdict });
        state = act(state, { type: 'selectEvidence', evidenceIds: answer.evidenceSets[0] ?? [] });
        state = act(state, { type: 'submit', caseId: id });
        expect(state.phase).toBe('feedback');
        expect(state.records).toHaveLength(dayIndex * 6 + index + 1);
        expect(workTime(state, content)).toBe(times[index]);
        expect(act(state, { type: 'finishCampaign', day: state.day })).toBe(state);
        expect(act(state, { type: 'submit', caseId: id })).toBe(state);
        state = act(state, { type: 'next', caseId: id });
      }
      expect(state.phase).toBe('daySummary');
      expect(canFinishCampaign(state, content)).toBe(dayIndex === 4);
      expect(canAdvanceDay(state, content)).toBe(dayIndex < 4);
      if (dayIndex < 4) {
        expect(act(state, { type: 'finishCampaign', day: state.day })).toBe(state);
        state = act(state, { type: 'nextDay', day: state.day });
      }
    }
    expect(new Set(state.records.map((record) => record.caseId)).size).toBe(30);
    expect(summarize(state.records, content).points).toBe(300);
    expect(act(state, { type: 'nextDay', day: 5 })).toBe(state);
    expect(act(state, { type: 'finishCampaign', day: 4 })).toBe(state);
    const incomplete = { ...state, records: state.records.filter((record) => record.caseId !== 'd1-02') };
    expect(canFinishCampaign(incomplete, content)).toBe(false);
    expect(act(incomplete, { type: 'finishCampaign', day: 5 })).toBe(incomplete);
    // 允许答错后通关，结束条件只检查已完成的案例。
    const mistaken = { ...state, records: state.records.map((record) => record.caseId === 'd5-04'
      ? { ...record, verdict: 'approve' as const } : record) };
    expect(act(mistaken, { type: 'finishCampaign', day: 5 }).phase).toBe('final');
    const final = act(state, { type: 'finishCampaign', day: 5 });
    expect(final).toMatchObject({ phase: 'final', day: 5, position: 5, draft: { verdict: null, evidenceIds: [] } });
    expect(final.records).toEqual(state.records);
    expect(canFinishCampaign(final, content)).toBe(false);
    expect(canAdvanceDay(final, content)).toBe(false);
    for (const action of [
      { type: 'finishCampaign', day: 5 }, { type: 'nextDay', day: 5 }, { type: 'startReview' },
      { type: 'submit', caseId: 'd5-02' }, { type: 'next', caseId: 'd5-02' },
      { type: 'selectVerdict', verdict: 'approve' }, { type: 'selectEvidence', evidenceIds: [] },
    ] as const) expect(act(final, action)).toBe(final);
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

  test('第二天集合独立、旧 R1 仍计分，十二次全对累计 120 分；缺题时不能跨日', () => {
    const first = finishDay(start(), order);
    const next = act(act(first, { type: 'nextDay', day: 1 }), { type: 'startReview' });
    const summary = finishDay(next, ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06']);
    expect(summary.day).toBe(2);
    expect(workTime(summary, content)).toBe('18:00');
    expect(new Set(summary.records.map((record) => record.caseId)).size).toBe(12);
    expect(summarize(summary.records, content)).toEqual({ points: 120, maxPoints: 120, reviewed: 12,
      correctVerdicts: 12, violationsMerged: 0, bugsMerged: 0, goodPrsHarmed: 0 });
    expect(canAdvanceDay(summary, content)).toBe(true);
    const thirdDay = act(summary, { type: 'nextDay', day: 2 });
    expect(thirdDay).toMatchObject({ day: 3, phase: 'briefing', position: 0, draft: { verdict: null, evidenceIds: [] } });
    expect(thirdDay.records).toEqual(summary.records);
    expect(workTime(thirdDay, content)).toBe('09:00');
    const twoDays = { ...content, cases: content.cases.filter((item) => !item.id.startsWith('d3-')) };
    expect(canAdvanceDay(summary, twoDays)).toBe(false);
    expect(transition(summary, { type: 'nextDay', day: 2 }, twoDays)).toBe(summary);
    expect(act(summary, { type: 'nextDay', day: 1 })).toBe(summary);
    const missing = { ...content, cases: content.cases.filter((item) => item.id !== 'd2-03') };
    expect(canAdvanceDay(first, missing)).toBe(false);
    expect(transition(first, { type: 'nextDay', day: 1 }, missing)).toBe(first);
  });
});
