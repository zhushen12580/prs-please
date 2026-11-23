import { expect, test, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { nextReview, startReview, submitDecision } from './helpers/play';

const orders: Record<string, string[][]> = {
  'maintainer-001': [
    ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01'],
    ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'],
    ['d3-05', 'd3-01', 'd3-02', 'd3-03', 'd3-06', 'd3-04'],
  ],
  'maintainer-002': [
    ['d1-03', 'd1-01', 'd1-05', 'd1-02', 'd1-04', 'd1-06'],
    ['d2-02', 'd2-01', 'd2-05', 'd2-04', 'd2-03', 'd2-06'],
    ['d3-01', 'd3-06', 'd3-02', 'd3-04', 'd3-05', 'd3-03'],
  ],
};

async function reachThirdDay(page: Page, seed = 'maintainer-001'): Promise<void> {
  await startReview(page, seed);
  for (const dayIndex of [0, 1]) {
    for (const [index, id] of orders[seed][dayIndex].entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
      if (index < 5) await nextReview(page);
    }
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    await expect(page.getByText('当日得分：60/60', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '下一天', exact: true }).click();
    await expect(page.getByRole('heading', { name: `第 ${dayIndex + 2} 天简报`, exact: true })).toBeFocused();
    if (dayIndex === 0) await page.getByRole('button', { name: '开始评审', exact: true }).click();
  }
}

test.describe('第三天披露与复合证据 · 逐日规则', () => {
  for (const [seed, mobile, alternative] of [
    ['maintainer-001', false, false], ['maintainer-002', true, true],
  ] as const) {
    test(`${seed} ${mobile ? '手机' : '桌面'}：R3 累积解锁、${alternative ? '第二组' : '第一组'}等价证据满分，十八题累计 180 分`, async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await reachThirdDay(page, seed);
      const briefing = page.getByRole('region', { name: '第 3 天简报', exact: true });
      await expect(briefing.getByRole('heading', { name: 'R3 · 披露 AI 辅助', exact: true })).toBeVisible();
      for (const text of ['今日新规则', 'R1、R2', '可以批准', '两项证据共同证明', '不能凭文风或身份推断']) {
        await expect(briefing).toContainText(text);
      }
      await page.getByRole('button', { name: '开始评审', exact: true }).click();
      await expect(page.locator('time')).toHaveText('09:00');
      await expect(page.getByText('累计得分：120 分', { exact: true })).toBeVisible();

      for (const [index, id] of orders[seed][2].entries()) {
        await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
        await expect(page.getByText('第 3 天', { exact: true })).toBeVisible();
        await expect(page.getByLabel(`待审进度：第 ${index + 1} 份，共 6 份`)).toHaveText(`${index + 1}/6`);
        await expect(page.getByText('CI 通过', { exact: true })).toBeVisible();
        await expect(page.getByRole('link')).toHaveCount(0);
        const answer = answerKey[id];
        const evidenceIds = id === 'd3-05' ? answer.evidenceSets[alternative ? 1 : 0] : answer.evidenceSets[0] ?? [];

        if (id === 'd3-05') {
          const disclosure = page.locator('[data-evidence-id="disclosure"]');
          await expect(disclosure).toContainText('（未填写）');
          await disclosure.focus();
          await page.keyboard.press('Space');
          await page.getByRole('button', { name: '规则手册', exact: true }).click();
          const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
          await expect(manual.getByText('生效中', { exact: true })).toHaveCount(3);
          for (const text of ['R1 · CI 必须通过', 'R2 · 核对项目 API', 'R3 · 披露 AI 辅助', 'R4 · 待解锁', 'R5 · 待解锁']) {
            await expect(manual).toContainText(text);
          }
          for (const body of ['不得删除或削弱相关测试来制造 CI 通过。', '不得引入隐藏执行、凭据外传或绕过验证的后门。']) {
            await expect(page.getByText(body, { exact: true })).toHaveCount(0);
          }
          await page.keyboard.press('Escape');
          await expect(page.getByRole('button', { name: '规则手册', exact: true })).toBeFocused();
          await expect(disclosure).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('time')).toHaveText(mobile ? '15:00' : '09:00');
          // 先选空栏，再选任一工具记录；顺序与内容中证据组的顺序相反。
          await submitDecision(page, answer.verdict, evidenceIds.filter((entry) => entry !== 'disclosure'));
        } else {
          if (id === 'd3-01') await expect(page.locator('[data-evidence-id="disclosure"]')).toContainText('（未填写）');
          if (id === 'd3-02') await expect(page.getByRole('region', { name: 'PR 描述', exact: true })).toContainText('AI');
          if (id === 'd3-06') await expect(page.getByRole('region', { name: 'API 参考', exact: true })).toContainText('不存在 atomic');
          await submitDecision(page, answer.verdict, evidenceIds);
        }
        const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
        await expect(feedback).toContainText('本题得分：10/10');
        if (['d3-03', 'd3-04', 'd3-05'].includes(id)) {
          await expect(feedback).toContainText('适用规则：R3');
          await expect(feedback).toContainText('本组各项需同时选中');
          await expect(feedback).toContainText('AI 辅助披露：（未填写）');
          await expect(feedback).toContainText('虚构项目规则');
          await expect(feedback.getByRole('link', { name: /披露/ })).toHaveAttribute('href', 'https://godotengine.org/article/contribution-policy-2026/');
        }
        if (id === 'd3-05') {
          await expect(feedback).toContainText('或满足以下一组：');
          await expect(feedback.getByText(/充分证据组 \d/)).toHaveCount(2);
          await expect(feedback).toContainText('tool-tests-ai');
          await expect(feedback).toContainText('tool-tests-import');
        }
        if (id === 'd3-06') await expect(feedback).toContainText('适用规则：R2');
        await expect(page.getByText(`累计得分：${130 + index * 10} 分`, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (index < 5) await nextReview(page);
      }
      await page.getByRole('button', { name: '查看日结', exact: true }).click();
      const summary = page.getByRole('region', { name: '第 3 天日结', exact: true });
      await expect(summary.getByRole('heading', { name: '第 3 天日结', exact: true })).toBeFocused();
      await expect(summary.getByRole('article')).toHaveCount(6);
      for (const [index, id] of orders[seed][2].entries()) await expect(summary.getByRole('article').nth(index)).toContainText(id);
      for (const text of ['当日得分：60/60', '裁决正确：6/6', '违规合入：0', '放入 bug／后门：0', '误伤好 PR：0']) {
        await expect(summary.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(summary).not.toContainText('d1-');
      await expect(summary).not.toContainText('d2-');
      await expect(summary).toContainText('或满足以下一组：');
      await expect(page.locator('time')).toHaveText('18:00');
      await expect(page.getByRole('button', { name: '下一天', exact: true })).toHaveCount(0);
    });
  }

  test('只选工具、只选空栏或多选无关项均为 5 分，反馈保留完整证据组', async ({ page }) => {
    await reachThirdDay(page);
    await page.getByRole('button', { name: '开始评审', exact: true }).click();
    const partial: Record<string, string[]> = {
      'd3-05': ['tool-tests-ai'],
      'd3-03': ['disclosure'],
      'd3-04': ['tool-docs-ai', 'disclosure', 'ci-docs'],
    };
    for (const [index, id] of orders['maintainer-001'][2].entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id}`) })).toBeVisible();
      const answer = answerKey[id];
      await submitDecision(page, answer.verdict, partial[id] ?? answer.evidenceSets[0] ?? []);
      const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
      await expect(feedback).toContainText(`本题得分：${partial[id] ? 5 : 10}/10`);
      if (partial[id]) {
        await expect(feedback).toContainText('裁决正确，但证据不完整或含无关项');
        await expect(feedback).toContainText('本组各项需同时选中');
      }
      if (index < 5) await nextReview(page);
    }
    await expect(page.getByText('累计得分：165 分', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    for (const text of ['当日得分：45/60', '裁决正确：6/6', '违规合入：0', '放入 bug／后门：0', '误伤好 PR：0']) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
  });
});
