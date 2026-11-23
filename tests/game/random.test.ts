import { describe, expect, test } from 'vitest';
import { fnv1a, normalizeSeed, orderCases } from '../../src/game/random';

describe('有效种子', () => {
  test.each([
    ['a', 'a'],
    ['A_0-z', 'A_0-z'],
    ['a'.repeat(32), 'a'.repeat(32)],
    [' \tmaintainer-001\n ', 'maintainer-001'],
    ['　maintainer-002　', 'maintainer-002'],
  ])('接受并去除首尾空白：%j', (input, expected) => {
    expect(normalizeSeed(input)).toBe(expected);
  });

  test.each([
    '', '   ', '中文', 'hello world', 'hello\nworld', 'hello\tworld',
    'a'.repeat(33), 'seed!', 'seed/one', 'é', '🙂', 'a\0b',
  ])('拒绝无效种子：%j', (input) => {
    expect(normalizeSeed(input)).toBeNull();
  });
});

describe('UTF-8 FNV-1a 32 位散列', () => {
  test.each([
    ['', 2166136261],
    ['a', 3826002220],
    ['hello', 1335831723],
    ['维护者', 2309405810],
    ['🙂', 1470331467],
  ])('%j 对应无符号散列 %i', (input, expected) => {
    expect(fnv1a(input)).toBe(expected);
  });
});

// 期望来自计划中的独立参考结果，不能用生产算法计算。
const expectedOrders = [
  {
    seed: 'maintainer-001',
    days: [
      ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'],
      ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'],
      ['d3-05', 'd3-01', 'd3-02', 'd3-03', 'd3-06', 'd3-04'],
      ['d4-02', 'd4-06', 'd4-04', 'd4-05', 'd4-01', 'd4-03'],
      ['d5-04', 'd5-01', 'd5-03', 'd5-06', 'd5-05', 'd5-02'],
    ],
  },
  {
    seed: 'maintainer-002',
    days: [
      ['d1-03', 'd1-01', 'd1-05', 'd1-02', 'd1-04', 'd1-06'],
      ['d2-02', 'd2-01', 'd2-05', 'd2-04', 'd2-03', 'd2-06'],
      ['d3-01', 'd3-06', 'd3-02', 'd3-04', 'd3-05', 'd3-03'],
      ['d4-02', 'd4-05', 'd4-01', 'd4-03', 'd4-04', 'd4-06'],
      ['d5-01', 'd5-06', 'd5-05', 'd5-03', 'd5-02', 'd5-04'],
    ],
  },
];

describe.each(expectedOrders)('$seed 的每日固定顺序', ({ seed, days }) => {
  test.each([1, 2, 3, 4, 5])('第 %i 天只洗当日集合且不修改输入', (day) => {
    const caseIds = Object.freeze([
      `d${day}-06`, `d${day}-02`, `d${day}-04`,
      `d${day}-01`, `d${day}-05`, `d${day}-03`,
    ]);
    const original = [...caseIds];

    expect(orderCases(caseIds, '1.0.0', seed, day)).toEqual(days[day - 1]);
    expect(orderCases(caseIds, '1.0.0', seed, day)).toEqual(days[day - 1]);
    expect(orderCases([...caseIds].reverse(), '1.0.0', seed, day)).toEqual(days[day - 1]);
    expect(caseIds).toEqual(original);
  });
});
