import { expect, test, type Page } from '@playwright/test';

async function startReview(page: Page, seed = 'maintainer-001') {
  await page.goto('./');
  await page.getByLabel('挑战种子').fill(seed);
  await page.getByRole('button', { name: '开始值班', exact: true }).click();
  await page.getByRole('button', { name: '开始评审', exact: true }).click();
}

test.describe('工作台材料与手册', () => {
  test('默认首题展示完整材料，HTML 保留为文本，鼠标和键盘可选择正常证据', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await startReview(page);
    const title = page.getByRole('heading', { name: 'PR d1-02 · 为标签转义合理增加测试覆盖', exact: true });
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    for (const text of ['第 1 天', '1/6', '09:00', '岑雨（虚构）', 'label-lantern-fictional',
      'CI 通过', 'src/escape-label.ts', 'tests/escape-label.test.ts']) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'PR 描述', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '投稿工具记录', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CI 日志', exact: true })).toBeVisible();
    const html = page.locator('[data-evidence-id="label-html-test"]');
    await expect(html).toContainText("'<strong>重点</strong>'");
    await expect(html.locator('strong')).toHaveCount(0);
    await expect(html).toHaveAttribute('aria-pressed', 'false');
    await html.click();
    await expect(html).toHaveAttribute('aria-pressed', 'true');
    await expect(html).toContainText('已选');
    const context = page.locator('[data-evidence-id="label-function"]');
    await context.focus();
    await context.press('Space');
    await expect(context).toHaveAttribute('aria-pressed', 'true');
    await context.press('Enter');
    await expect(context).toHaveAttribute('aria-pressed', 'false');
    const disclosure = page.locator('[data-evidence-id="disclosure"]');
    await disclosure.focus();
    await disclosure.press('Enter');
    const tool = page.locator('[data-evidence-id="tool-tests"]');
    await tool.click();
    const ci = page.locator('[data-evidence-id="ci-label-tests"]');
    await ci.focus();
    await ci.press('Space');
    await expect(page.getByRole('status')).toHaveText('已选证据：4 项');
    await expect(page.locator('time')).toHaveText('09:00');
    await expect(page.getByRole('button', { name: '提交裁决', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('手册只展示生效规则，打开聚焦且约束焦点，关闭和 Escape 恢复入口及证据', async ({ page }) => {
    await startReview(page);
    const selected = page.locator('[data-evidence-id="label-html-test"]');
    await selected.click();
    const trigger = page.getByRole('button', { name: '规则手册', exact: true });
    const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
    await trigger.click();
    await expect(manual).toBeVisible();
    await expect(manual).toBeFocused();
    await expect(manual.getByText('R1 · CI 必须通过', { exact: true })).toBeVisible();
    await expect(manual.getByText('生效中', { exact: true })).toBeVisible();
    await expect(manual.getByText('第 1 天解锁', { exact: true })).toBeVisible();
    await expect(manual.getByText('CI 必须通过；失败须修复后重审。', { exact: true })).toBeVisible();
    await expect(manual.getByText('待解锁', { exact: false })).toHaveCount(4);
    for (const [day, title, body, example] of [
      [2, '核对项目 API', '使用的项目 API 必须存在且符合随附说明。', '随附说明定义了异步游标 API'],
      [3, '披露 AI 辅助', '使用 AI 辅助必须在 PR 描述的披露栏说明。', '投稿工具记录明确表明使用了 AI 辅助'],
      [4, '保持相关测试的覆盖', '不得删除或削弱相关测试来制造 CI 通过。', '测试重构提取了重复的准备步骤'],
      [5, '拒绝隐藏后门', '不得引入隐藏执行、凭据外传或绕过验证的后门。', '所谓诊断修复暗中读取凭据'],
    ]) {
      await expect(manual.getByText(`第 ${day} 天解锁`, { exact: true })).toBeVisible();
      // textContent 包含隐藏节点，确保没有把未来规则藏进 DOM。
      for (const futureText of [title, body, example]) await expect(manual).not.toContainText(String(futureText));
    }
    await page.keyboard.press('Tab');
    await expect(manual.getByRole('button', { name: '关闭手册', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await manual.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(manual).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await trigger.press('Enter');
    await expect(manual).toBeFocused();
    await manual.getByRole('button', { name: '关闭手册', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('time')).toHaveText('09:00');
    await expect(page.getByRole('heading', { name: /^PR d1-02/ })).toBeVisible();
  });

  test('另一种子首题含删除行，保留新旧行号并能用键盘选择', async ({ page }) => {
    await startReview(page, 'maintainer-002');
    await expect(page.getByRole('heading', { name: /^PR d1-03/ })).toBeVisible();
    const deleted = page.locator('[data-evidence-id="key-old-condition"]');
    await expect(deleted.locator('.diff-old-line')).toHaveText('6');
    await expect(deleted.locator('.diff-new-line')).toHaveText('—');
    await expect(deleted.locator('.diff-marker')).toHaveText('−');
    await deleted.focus();
    await deleted.press('Enter');
    await expect(deleted).toHaveAttribute('aria-pressed', 'true');
    await deleted.press('Space');
    await expect(deleted).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('time')).toHaveText('09:00');
  });

  test('390×844 工作台与手册无页面横向溢出，长代码仅在代码区滚动', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startReview(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const code = page.getByRole('region', { name: 'tests/escape-label.test.ts 差异', exact: true });
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await code.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-evidence-id="label-html-test"]').click();
    await expect(page.getByRole('status')).toHaveText('已选证据：1 项');
    const trigger = page.getByRole('button', { name: '规则手册', exact: true });
    await trigger.click();
    const manual = page.getByRole('dialog', { name: '规则手册', exact: true });
    await expect(manual).toBeVisible();
    expect(await manual.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await manual.getByRole('button', { name: '关闭手册', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(page.locator('time')).toHaveText('09:00');
  });
});
