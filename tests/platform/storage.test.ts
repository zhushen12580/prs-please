import { beforeEach, describe, expect, test, vi } from 'vitest';
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
    expect(loadGame(localStorage, content).state).toBeUndefined();
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
    const restored = loadGame(localStorage, content).state;
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
    const restored = loadGame(localStorage, content).state;
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
    const restored = loadGame(localStorage, content).state;
    expect(restored).toEqual({ seed: 'maintainer-002', contentVersion: '1.0.0', phase: 'briefing',
      day: 1, position: 0, records: [], draft: { verdict: null, evidenceIds: [] } });
    if (!restored) throw new Error('没有恢复存档');
    expect(currentCase(restored, content).id).toBe('d1-03');
    expect(summarize(restored.records, content).points).toBe(0);
    expect(localStorage.length).toBe(1);
  });
});

describe('不可信存档校验与丢弃', () => {
  const feedbackSave = () => ({ saveVersion: 1, contentVersion: '1.0.0', seed: 'maintainer-001',
    phase: 'feedback', day: 1, position: 1,
    records: [
      { caseId: 'd1-02', verdict: 'approve', evidenceIds: [] as string[] },
      { caseId: 'd1-05', verdict: 'request_changes', evidenceIds: ['ci-type-failure'] },
    ],
    draft: { verdict: 'request_changes', evidenceIds: ['ci-type-failure'] },
  });

  test.each(['', '{', 'null', '[]', '42', '"save"', '{}'])('损坏 JSON 或非存档结构 %j 被提示并删除', (raw) => {
    localStorage.setItem(key, raw);
    localStorage.setItem('other-app', 'keep');
    expect(loadGame(localStorage, content)).toEqual({ state: undefined, invalidSave: true, unavailable: false });
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem('other-app')).toBe('keep');
    expect(loadGame(localStorage, content)).toEqual({ state: undefined, invalidSave: false, unavailable: false });
  });

  test.each([
    ['旧存档版本', { saveVersion: 0 }], ['未来存档版本', { saveVersion: 2 }],
    ['版本类型', { saveVersion: '1' }], ['旧内容版本', { contentVersion: '0.9.0' }],
    ['空种子', { seed: '' }], ['种子空白', { seed: ' maintainer-001 ' }],
    ['种子字符', { seed: '中文' }], ['种子长度', { seed: 'a'.repeat(33) }],
    ['非法阶段', { phase: 'home' }], ['日期下界', { day: 0 }], ['日期上界', { day: 6 }],
    ['日期小数', { day: 1.5 }], ['日期类型', { day: '1' }],
    ['位置下界', { position: -1 }], ['位置上界', { position: 6 }],
    ['位置小数', { position: 0.5 }], ['位置类型', { position: '1' }],
    ['记录类型', { records: {} }], ['空记录项', { records: [null] }],
    ['缺少记录字段', { records: [{ caseId: 'd1-02' }] }],
    ['草稿类型', { draft: [] }], ['缺少草稿字段', { draft: { evidenceIds: [] } }],
    ['非法草稿裁决', { draft: { verdict: 'merge', evidenceIds: [] } }],
    ['非法证据类型', { draft: { verdict: null, evidenceIds: [1] } }],
  ])('%s 不能恢复', (_name, overrides) => {
    const serialized = JSON.stringify({ ...feedbackSave(), ...overrides });
    expect(() => restoreGame(serialized, content)).toThrow('旧进度不可用');
    localStorage.setItem(key, serialized);
    expect(loadGame(localStorage, content)).toEqual({ state: undefined, invalidSave: true, unavailable: false });
    expect(localStorage.getItem(key)).toBeNull();
  });

  test.each<[string, (save: ReturnType<typeof feedbackSave>) => void]>([
    ['未知案例', (save) => { save.records[0]!.caseId = 'missing'; }],
    ['重复记录', (save) => { save.records[1] = { ...save.records[0]! }; }],
    ['提交乱序', (save) => { save.records.reverse(); }],
    ['跳过案例', (save) => { save.records[0]!.caseId = 'd1-04'; }],
    ['提前提交未来日案例', (save) => { save.records[0]!.caseId = 'd2-01'; }],
    ['非法记录裁决', (save) => { save.records[0]!.verdict = 'merge'; }],
    ['未知记录证据', (save) => { save.records[0]!.evidenceIds = ['missing']; }],
    ['其他案例证据', (save) => { save.records[0]!.evidenceIds = ['ci-type-failure']; }],
    ['重复记录证据', (save) => { save.records[1]!.evidenceIds.push('ci-type-failure'); }],
    ['非批准提交缺证据', (save) => { save.records[1]!.evidenceIds = []; }],
    ['未知草稿证据', (save) => { save.draft.evidenceIds = ['missing']; }],
    ['草稿证据属于其他案例', (save) => { save.draft.evidenceIds = ['ci-timezone-failure']; }],
    ['重复草稿证据', (save) => { save.draft.evidenceIds.push('ci-type-failure'); }],
    ['反馈草稿裁决与记录不同', (save) => { save.draft.verdict = 'approve'; }],
    ['反馈草稿证据与记录不同', (save) => { save.draft.evidenceIds = ['disclosure']; }],
    ['反馈少一条记录', (save) => { save.records.pop(); }],
    ['评审包含尚未提交的当前题', (save) => { save.phase = 'review'; }],
    ['提前进入日结', (save) => { save.phase = 'daySummary'; save.position = 5; }],
    ['简报位置不为零', (save) => { save.phase = 'briefing'; save.records = []; }],
    ['简报包含当日记录', (save) => { save.phase = 'briefing'; save.position = 0; }],
    ['跨日缺少前日记录', (save) => { save.day = 2; save.phase = 'review'; save.position = 2; }],
    ['空记录跳到最终页', (save) => { save.phase = 'final'; save.day = 5; save.position = 5; save.records = []; }],
  ])('%s 被完整丢弃而非部分恢复', (_name, mutate) => {
    const save = feedbackSave();
    mutate(save);
    const serialized = JSON.stringify(save);
    expect(() => restoreGame(serialized, content)).toThrow('旧进度不可用');
    localStorage.setItem(key, serialized);
    expect(loadGame(localStorage, content)).toEqual({ state: undefined, invalidSave: true, unavailable: false });
    expect(localStorage.getItem(key)).toBeNull();
  });

  test('终局和日结必须保留正确日期、末题位置及空草稿', () => {
    const final = transition(daySummary(30), { type: 'finishCampaign', day: 5 }, content);
    for (const state of [
      { ...final, day: 4 }, { ...final, position: 0 }, { ...daySummary(), position: 0 },
      { ...daySummary(), draft: { verdict: 'approve', evidenceIds: [] } },
      { ...final, draft: { verdict: null, evidenceIds: ['disclosure'] } },
      { ...createGame('maintainer-001', content), draft: { verdict: null, evidenceIds: ['disclosure'] } },
    ]) expect(() => restoreGame(JSON.stringify({ saveVersion: 1, ...state }), content)).toThrow('旧进度不可用');
  });

  test('未完成草稿、错误裁决和无关但合法证据仍然是合法进度', () => {
    const review = transition(reviewed(2), { type: 'next', caseId: 'd1-05' }, content);
    for (const draft of [
      { verdict: null, evidenceIds: ['disclosure'] },
      { verdict: 'reject', evidenceIds: [] },
      { verdict: 'approve', evidenceIds: ['disclosure'] },
    ] as const) {
      const state = { ...review, draft };
      expect(restoreGame(serializeGame(state), content)).toEqual(state);
    }
    const state = transition(transition(review, { type: 'selectVerdict', verdict: 'approve' }, content),
      { type: 'submit', caseId: 'd1-04' }, content);
    expect(restoreGame(serializeGame(state), content)).toEqual(state);
    expect(summarize(state.records, content).points).toBe(20);
    const otherSeed = transition(createGame('maintainer-002', content), { type: 'startReview' }, content);
    expect(restoreGame(serializeGame(otherSeed), content)).toEqual(otherSeed);
    expect(() => restoreGame(JSON.stringify({ ...feedbackSave(), seed: 'maintainer-002' }), content)).toThrow('旧进度不可用');
  });
});

describe('存储异常退为内存状态', () => {
  test('未获取到 localStorage 时不能持久化', () => {
    expect(loadGame(undefined, content)).toEqual({ state: undefined, invalidSave: false, unavailable: true });
    expect(saveGame(undefined, reviewed(2))).toBe(false);
  });

  test('读取拒绝不误报坏存档，也不尝试删除', () => {
    const storage = { getItem: vi.fn(() => { throw new DOMException('denied', 'SecurityError'); }),
      removeItem: vi.fn() };
    expect(loadGame(storage, content)).toEqual({ state: undefined, invalidSave: false, unavailable: true });
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  test('删除损坏存档失败同时报告坏存档与存储失效', () => {
    const storage = { getItem: vi.fn(() => '{'),
      removeItem: vi.fn(() => { throw new Error('remove denied'); }) };
    expect(loadGame(storage, content)).toEqual({ state: undefined, invalidSave: true, unavailable: true });
    expect(storage.removeItem).toHaveBeenCalledWith(key);
  });

  test.each(['QuotaExceededError', 'SecurityError'])('写入 %s 返回失败且当前进度未改变', (name) => {
    const state = reviewed(2);
    const snapshot = structuredClone(state);
    const storage = { setItem: vi.fn(() => { throw new DOMException('unavailable', name); }) };
    expect(saveGame(storage, state)).toBe(false);
    expect(state).toEqual(snapshot);
    expect(transition(state, { type: 'next', caseId: 'd1-05' }, content).position).toBe(2);
  });

  test('正常写入返回成功并可恢复', () => {
    const state = reviewed(2);
    expect(saveGame(localStorage, state)).toBe(true);
    expect(loadGame(localStorage, content)).toEqual({ state, invalidSave: false, unavailable: false });
  });
});
