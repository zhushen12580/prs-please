import { expect, test } from '@playwright/test';

test.describe('首页与种子', () => {
  test('默认种子可用键盘进入第一天简报，只显示 R1', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'PRs, Please', exact: true })).toBeVisible();
    for (const verdict of ['批准', '要求修改', '拒绝']) {
      await expect(page.getByText(verdict, { exact: true })).toBeVisible();
    }
    await expect(page.getByLabel('挑战种子')).toHaveValue('maintainer-001');
    await page.getByLabel('挑战种子').focus();
    await page.getByLabel('挑战种子').press('Enter');

    const title = page.getByRole('heading', { name: '第 1 天简报', exact: true });
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    await expect(page.getByText('maintainer-001', { exact: true })).toBeVisible();
    await expect(page.getByText('CI 必须通过；失败须修复后重审。', { exact: true })).toBeVisible();
    await expect(page.getByText('可以批准', { exact: true })).toBeVisible();
    await expect(page.getByText('要求修改', { exact: true })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(/R[2-5]/);
    await expect(page.getByRole('main')).not.toContainText(/登录|API Key|密钥/);
    for (const futureText of [
      '使用的项目 API 必须存在且符合随附说明。',
      '使用 AI 辅助必须在 PR 描述的披露栏说明。',
      '不得删除或削弱相关测试来制造 CI 通过。',
      '不得引入隐藏执行、凭据外传或绕过验证的后门。',
    ]) {
      await expect(page.getByRole('main')).not.toContainText(futureText);
    }
  });

  for (const [label, seed] of [
    ['空值', ''], ['中文', '维护者'], ['内部空格', 'seed 001'],
    ['33 字符', 'a'.repeat(33)], ['不允许的符号', 'seed!'],
  ]) {
    test(`${label}不能开始，错误关联输入框，修正后可开始`, async ({ page }) => {
      await page.goto('./');
      const input = page.getByLabel('挑战种子');
      await input.fill(seed);
      await page.getByRole('button', { name: '开始值班', exact: true }).click();

      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('1–32');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toBeFocused();
      const errorId = await page.getByRole('alert').getAttribute('id');
      expect((await input.getAttribute('aria-describedby'))?.split(/\s+/)).toContain(errorId);
      await expect(page.getByRole('button', { name: '开始值班', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toHaveCount(0);

      await input.fill('maintainer-001');
      await expect(input).not.toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: '开始值班', exact: true }).click();
      await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeVisible();
    });
  }

  for (const [label, seed, expected] of [
    ['首尾空白', '  maintainer-002  ', 'maintainer-002'],
    ['1 字符边界', 'a', 'a'],
    ['32 字符边界', 'A_0-z'.repeat(6) + '_1', 'A_0-z'.repeat(6) + '_1'],
  ]) {
    test(`${label}的合法种子可以开始`, async ({ page }) => {
      await page.goto('./');
      await page.getByLabel('挑战种子').fill(seed);
      await page.getByRole('button', { name: '开始值班', exact: true }).click();
      await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeVisible();
      await expect(page.getByText(expected, { exact: true })).toBeVisible();
    });
  }

  test('390×844 手机首页和简报无页面横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await expect(page.getByRole('button', { name: '开始值班', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('挑战种子').fill('A'.repeat(32));
    await page.getByRole('button', { name: '开始值班', exact: true }).click();
    await expect(page.getByRole('heading', { name: '第 1 天简报', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
