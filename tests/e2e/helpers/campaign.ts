import { expect, type Page } from '@playwright/test';
import { answerKey } from '../../fixtures/answer-key';
import { nextReview, startReview, submitDecision } from './play';

// 独立参考顺序，禁止从生产随机函数或 finding 生成期望。
export const campaignOrders: Record<string, string[][]> = {
  'maintainer-001': [
    ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'],
    ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'],
    ['d3-05', 'd3-01', 'd3-02', 'd3-03', 'd3-06', 'd3-04'],
    ['d4-02', 'd4-06', 'd4-04', 'd4-05', 'd4-01', 'd4-03'],
    ['d5-04', 'd5-01', 'd5-03', 'd5-06', 'd5-05', 'd5-02'],
  ],
  'maintainer-002': [
    ['d1-03', 'd1-01', 'd1-05', 'd1-02', 'd1-04', 'd1-06'],
    ['d2-02', 'd2-01', 'd2-05', 'd2-04', 'd2-03', 'd2-06'],
    ['d3-01', 'd3-06', 'd3-02', 'd3-04', 'd3-05', 'd3-03'],
    ['d4-02', 'd4-05', 'd4-01', 'd4-03', 'd4-04', 'd4-06'],
    ['d5-01', 'd5-06', 'd5-05', 'd5-03', 'd5-02', 'd5-04'],
  ],
};

export async function reachFifthDay(page: Page): Promise<void> {
  await startReview(page);
  for (const ids of campaignOrders['maintainer-001'].slice(0, 4)) {
    for (const [index, id] of ids.entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
      if (index < 5) await nextReview(page);
    }
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    await page.getByRole('button', { name: '下一天', exact: true }).click();
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
  }
}
