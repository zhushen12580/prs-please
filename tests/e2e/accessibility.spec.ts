import { expect, test, type Locator, type Page } from '@playwright/test';
import { answerKey } from '../fixtures/answer-key';
import { campaignOrders } from './helpers/campaign';
import { nextReview, readReviewId, showDaySummary, submitDecision } from './helpers/play';

async function noPageOverflow(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    x: window.scrollX,
  }));
  expect(width.page).toBeLessThanOrEqual(width.viewport);
  expect(width.x).toBe(0);
}

// 实际 Tab 导航，不使用 focus()、鼠标或注入状态来代替键盘操作。
async function tabTo(page: Page, target: Locator, backwards = false): Promise<void> {
  for (let count = 0; count < 80; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Tab 无法到达 ${await target.textContent()}`);
}

async function visibleFocus(target: Locator): Promise<void> {
  await expect(target).toBeFocused();
  expect(await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
  })).toBe(true);
}

async function unobscured(target: Locator): Promise<void> {
  await expect(target).toBeInViewport({ ratio: 1 });
  expect(await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test.describe(`响应式与键盘 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('全部阶段不横向溢出，长代码独立滚动，固定区域不遮挡证据和裁决', async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('./');
      await expect(page.getByRole('heading', { name: '轮到你值班了。', exact: true })).toBeFocused();
      await noPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
      await page.getByRole('button', { name: '开始值班', exact: true }).click();

      for (let day = 1; day <= 5; day++) {
        await expect(page.getByRole('heading', { name: `第 ${day} 天简报`, exact: true })).toBeFocused();
        await noPageOverflow(page);
        await page.getByRole('button', { name: '开始评审', exact: true }).click();
        for (const [position, id] of campaignOrders['maintainer-001'][day - 1].entries()) {
          expect(await readReviewId(page)).toBe(id);
          await expect(page.getByRole('heading', { name: new RegExp(`^PR ${id} ·`) })).toBeFocused();
          await noPageOverflow(page);
          const panel = page.getByRole('region', { name: '裁决区', exact: true });
          for (const name of ['批准', '要求修改', '拒绝', '提交裁决']) {
            await unobscured(panel.getByRole('button', { name, exact: true }));
          }

          if (day === 1 && position === 0) {
            for (const name of ['批准', '要求修改', '拒绝']) {
              const stamp = panel.getByRole('button', { name, exact: true });
              expect(await stamp.evaluate((element) => {
                const label = document.createRange();
                label.selectNodeContents(element);
                return label.getClientRects().length;
              })).toBe(1);
            }
            await page.screenshot({ path: testInfo.outputPath('desk-initial.png') });
            const code = page.getByRole('region', { name: 'tests/escape-label.test.ts 差异', exact: true });
            await expect(page.locator('[data-evidence-id="label-html-test"]')).toContainText("'<strong>重点</strong>'");
            expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
            await code.focus();
            await page.keyboard.press('End');
            await page.keyboard.press('ArrowRight');
            await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
            await noPageOverflow(page);
            // 最后一行获得焦点后应完整位于顶部工具条和底部裁决区之间。
            const last = page.locator('.diff-line').last();
            await last.focus();
            await visibleFocus(last);
            const line = await last.boundingBox();
            const toolbar = await page.locator('.review-toolbar').boundingBox();
            const decision = await panel.boundingBox();
            expect(line!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height + 3);
            expect(line!.y + line!.height).toBeLessThanOrEqual(decision!.y - 3);
            await page.keyboard.press('Space');
            await expect(last).toHaveAttribute('aria-pressed', 'true');
            await page.keyboard.press('Enter');
            await expect(last).toHaveAttribute('aria-pressed', 'false');
            for (const name of ['批准', '要求修改', '拒绝']) {
              await panel.getByRole('button', { name, exact: true }).click();
              await expect(panel.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
              await expect(panel).toContainText(`已选裁决：${name}`);
            }
            await page.getByRole('button', { name: '规则手册', exact: true }).click();
            const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
            await expect(manual).toBeFocused();
            expect(await manual.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
            await noPageOverflow(page);
            await page.keyboard.press('Escape');
            await expect(page.getByRole('button', { name: '规则手册', exact: true })).toBeFocused();
            await page.screenshot({ path: testInfo.outputPath('desk.png'), fullPage: true });
          }

          const answer = answerKey[id];
          await submitDecision(page, answer.verdict, answer.evidenceSets[0] ?? []);
          await expect(page.getByRole('heading', { name: '裁决反馈', exact: true })).toBeFocused();
          await noPageOverflow(page);
          if (day === 1 && position === 0) await page.screenshot({ path: testInfo.outputPath('feedback.png'), fullPage: true });
          if (position < 5) await nextReview(page);
        }
        await showDaySummary(page, day);
        await noPageOverflow(page);
        if (day === 1) await page.screenshot({ path: testInfo.outputPath('day-summary.png'), fullPage: true });
        await page.getByRole('button', { name: day === 5 ? '查看最终成绩' : '下一天', exact: true }).click();
      }
      await expect(page.getByRole('heading', { name: '最终成绩', exact: true })).toBeFocused();
      await noPageOverflow(page);
      await expect(page.getByText('总得分：300/300', { exact: true })).toBeVisible();
      await expect(page.locator('.summary-record')).toHaveCount(30);
      await page.screenshot({ path: testInfo.outputPath('final.png') });
      expect(errors).toEqual([]);
    });

    test('纯键盘完成非批准裁决，手册和覆盖确认约束并恢复焦点', async ({ page }) => {
      await page.goto('./');
      const seed = page.getByRole('textbox', { name: '挑战种子', exact: true });
      await tabTo(page, seed);
      await visibleFocus(seed);
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText('bad seed');
      await page.keyboard.press('Enter');
      await expect(seed).toHaveAttribute('aria-invalid', 'true');
      const error = page.getByRole('alert');
      expect((await seed.getAttribute('aria-describedby'))?.split(/\s+/)).toContain(await error.getAttribute('id'));
      await expect(error).toContainText('不能包含空格或中文');
      await expect(seed).toBeFocused();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText('maintainer-001');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await visibleFocus(page.getByRole('button', { name: '开始评审', exact: true }));
      await page.keyboard.press('Enter');
      const jump = page.getByRole('button', { name: '前往裁决区', exact: true });
      await page.keyboard.press('Tab');
      await visibleFocus(jump);
      await page.keyboard.press('Enter');
      const panel = page.getByRole('region', { name: '裁决区', exact: true });
      await expect(panel).toBeFocused();
      await page.keyboard.press('Tab');
      await visibleFocus(page.getByRole('button', { name: '批准', exact: true }));
      await page.keyboard.press('Space');
      const submit = page.getByRole('button', { name: '提交裁决', exact: true });
      await tabTo(page, submit);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: '裁决反馈', exact: true })).toBeFocused();
      await tabTo(page, page.getByRole('button', { name: '下一份', exact: true }));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: /^PR d1-05 ·/ })).toBeFocused();

      const evidence = page.locator('[data-evidence-id="ci-type-failure"]');
      await tabTo(page, evidence);
      await visibleFocus(evidence);
      await page.keyboard.press('Space');
      await expect(evidence).toHaveAttribute('aria-pressed', 'true');
      await expect(evidence).toContainText('已选');
      await expect(page.getByRole('status', { name: '证据选择状态' })).toHaveText('已选证据：1 项');
      const manualTrigger = page.getByRole('button', { name: '规则手册', exact: true });
      await tabTo(page, manualTrigger, true);
      await page.keyboard.press('Enter');
      const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
      await expect(manual).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await visibleFocus(manual.getByRole('button', { name: '关闭手册', exact: true }));
      await page.keyboard.press('Tab');
      await expect(manual.getByRole('button', { name: '关闭手册', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(manualTrigger).toBeFocused();
      await expect(evidence).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(manualTrigger).toBeFocused();
      await expect(page.locator('time')).toHaveText('10:30');

      await tabTo(page, jump);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await visibleFocus(page.getByRole('button', { name: '要求修改', exact: true }));
      await page.keyboard.press('Enter');
      await expect(panel).toContainText('已选裁决：要求修改');
      await tabTo(page, submit);
      await page.keyboard.press('Space');
      const feedback = page.getByRole('heading', { name: '裁决反馈', exact: true });
      await expect(feedback).toBeFocused();
      await expect(feedback).toHaveAccessibleDescription('裁决正确，获得满分');
      await expect(page.locator('.shift-score')).toHaveText('累计得分：20 分');

      await tabTo(page, page.getByRole('button', { name: '返回首页', exact: true }), true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: '轮到你值班了。', exact: true })).toBeFocused();
      const restart = page.getByRole('button', { name: '重新开始', exact: true });
      await tabTo(page, restart);
      await page.keyboard.press('Enter');
      const confirmation = page.getByRole('dialog', { name: '覆盖当前值班？', exact: true });
      const cancel = confirmation.getByRole('button', { name: '取消', exact: true });
      const confirm = confirmation.getByRole('button', { name: '确认覆盖', exact: true });
      await visibleFocus(cancel);
      await noPageOverflow(page);
      expect(await confirmation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      await visibleFocus(confirm);
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(confirm).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(restart).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await expect(restart).toBeFocused();
      await tabTo(page, page.getByRole('button', { name: '继续值班', exact: true }), true);
      await page.keyboard.press('Enter');
      await expect(feedback).toBeFocused();
      await expect(page.locator('.shift-score')).toHaveText('累计得分：20 分');
      await expect(submit).toBeDisabled();
      await tabTo(page, page.getByRole('button', { name: '返回首页', exact: true }), true);
      await page.keyboard.press('Enter');
      await tabTo(page, restart);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeFocused();
    });
  });
}

test('响应式与键盘：减少动态效果时长种子仍可阅读、继续和裁决', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.getByLabel('挑战种子').fill('W'.repeat(32));
  await page.getByRole('button', { name: '开始值班', exact: true }).click();
  await noPageOverflow(page);
  await page.getByRole('button', { name: '开始评审', exact: true }).click();
  await noPageOverflow(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const approve = page.getByRole('button', { name: '批准', exact: true });
  expect(await approve.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await submitDecision(page, 'approve');
  await expect(page.getByRole('heading', { name: '裁决反馈', exact: true })).toBeFocused();
  await noPageOverflow(page);
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await noPageOverflow(page);
  await page.getByRole('button', { name: '继续值班', exact: true }).click();
  await expect(page.getByRole('heading', { name: '裁决反馈', exact: true })).toBeFocused();
  await noPageOverflow(page);
});
