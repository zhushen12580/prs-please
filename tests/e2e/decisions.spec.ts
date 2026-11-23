import { expect, test } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { nextReview, startReview, submitDecision } from './helpers/play';

test.describe('第一天裁决反馈 · 证据与三种裁决', () => {
  test('默认无裁决，两种非批准禁空证据，批准可无证据；反馈锁定且重复点击不计分', async ({ page }) => {
    await startReview(page);
    const submit = page.getByRole('button', { name: '提交裁决', exact: true });
    await expect(submit).toBeDisabled();
    for (const name of ['批准', '要求修改', '拒绝']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
    }
    for (const name of ['要求修改', '拒绝']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(submit).toBeDisabled();
      await page.locator('[data-evidence-id="disclosure"]').click();
      await expect(submit).toBeEnabled();
      await page.locator('[data-evidence-id="disclosure"]').click();
      await expect(submit).toBeDisabled();
    }
    await page.getByRole('button', { name: '批准', exact: true }).click();
    await expect(submit).toBeEnabled();
    // 真实 DOM 双击重放事件，不能绕过领域层的单次提交保护。
    await submit.evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
    await expect(feedback).toContainText('本题得分：10/10');
    await expect(feedback).toContainText('你的裁决：批准');
    await expect(feedback).toContainText('标准裁决：批准');
    await expect(feedback).toContainText('本题无生效违规');
    await expect(feedback).toContainText('生效规则');
    await expect(feedback).toContainText('R1 · CI 必须通过');
    await expect(feedback.getByRole('link', { name: '用有效测试验证贡献，而非仅依赖提交说明' })).toHaveAttribute('href', 'https://curl.se/dev/contribute.html');
    await expect(page.getByRole('heading', { name: /^PR d1-02/ })).toBeVisible();
    await expect(page.locator('time')).toHaveText('10:30');
    await expect(page.getByText('累计得分：10 分', { exact: true })).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('button', { name: '拒绝', exact: true })).toBeDisabled();
    await expect(page.locator('[data-evidence-id="disclosure"]')).toBeDisabled();
    await nextReview(page);
    await expect(page.getByRole('heading', { name: /^PR d1-05/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '批准', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('已选证据：0 项');
    await expect(page.locator('time')).toHaveText('10:30');
  });

  test('六次提交覆盖 10/5/0 分、反馈解释、时钟和日结复盘', async ({ page }) => {
    await startReview(page);
    const steps = [
      { id: 'd1-02', verdict: 'approve', evidence: [], points: 10, time: '10:30' },
      { id: 'd1-05', verdict: 'request_changes', evidence: ['disclosure'], points: 5, time: '12:00' },
      { id: 'd1-04', verdict: 'approve', evidence: [], points: 0, time: '13:30' },
      { id: 'd1-06', verdict: 'request_changes', evidence: ['ci-empty-failure'], points: 10, time: '15:00' },
      { id: 'd1-03', verdict: 'reject', evidence: ['disclosure'], points: 0, time: '16:30' },
      { id: 'd1-01', verdict: 'approve', evidence: [], points: 10, time: '18:00' },
    ] as const;
    for (const [index, step] of steps.entries()) {
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${step.id}`) })).toBeVisible();
      await expect(page.getByLabel(`待审进度：第 ${index + 1} 份，共 6 份`)).toHaveText(`${index + 1}/6`);
      await expect(page.getByRole('region', { name: '裁决反馈', exact: true })).toHaveCount(0);
      await submitDecision(page, step.verdict, step.evidence);
      const feedback = page.getByRole('region', { name: '裁决反馈', exact: true });
      await expect(feedback).toContainText(`本题得分：${step.points}/10`);
      await expect(page.locator('time')).toHaveText(step.time);
      await expect(page.getByRole('heading', { name: new RegExp(`^PR ${step.id}`) })).toBeVisible();
      if (step.points === 5) {
        await expect(feedback).toContainText('裁决正确，但证据不完整或含无关项');
        await expect(feedback).toContainText('正确证据');
        await expect(feedback).toContainText('ci-type-failure');
        await expect(feedback).toContainText('TS2322');
        await expect(feedback).toContainText('你的证据');
        await expect(feedback).toContainText('disclosure');
      }
      if (step.points === 0) await expect(feedback).toContainText('裁决错误');
      await expect(feedback.getByRole('heading', { name: '判题解释', exact: true })).toBeVisible();
      if (index < 5) await nextReview(page);
    }
    await expect(page.getByRole('heading', { name: '第 1 天日结', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下一份', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '查看日结', exact: true }).click();
    const summary = page.getByRole('region', { name: '第 1 天日结', exact: true });
    for (const text of ['当日得分：35/60', '裁决正确：4/6', '违规合入：1', '放入 bug／后门：1', '误伤好 PR：1']) {
      await expect(summary.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(page.locator('time')).toHaveText('18:00');
    const records = summary.getByRole('article');
    await expect(records).toHaveCount(6);
    for (const [index, step] of steps.entries()) {
      await expect(records.nth(index)).toContainText(step.id);
      await expect(records.nth(index)).toContainText(`本题得分：${step.points}/10`);
      await expect(records.nth(index).getByRole('heading', { name: '判题解释', exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: '下一天', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toHaveCount(0);
  });

  test('第一天全部正确为 60/60，全部批准为 30/60', async ({ page }) => {
    for (const perfect of [true, false]) {
      await startReview(page);
      for (const id of ['d1-02', 'd1-05', 'd1-04', 'd1-06', 'd1-03', 'd1-01']) {
        const answer = answerKey[id];
        await submitDecision(page, perfect ? answer.verdict : 'approve', perfect ? answer.evidenceSets[0] ?? [] : []);
        if (id !== 'd1-01') await nextReview(page);
      }
      await page.getByRole('button', { name: '查看日结', exact: true }).click();
      await expect(page.getByText(`当日得分：${perfect ? 60 : 30}/60`, { exact: true })).toBeVisible();
      await expect(page.getByText(`裁决正确：${perfect ? 6 : 3}/6`, { exact: true })).toBeVisible();
      await expect(page.getByText(`放入 bug／后门：${perfect ? 0 : 3}`, { exact: true })).toBeVisible();
      await expect(page.getByText(`违规合入：${perfect ? 0 : 3}`, { exact: true })).toBeVisible();
      await expect(page.getByText('误伤好 PR：0', { exact: true })).toBeVisible();
    }
  });
});
