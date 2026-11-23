import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { expect, test } from 'vitest';

test('环境示例只记录可选公共路径及默认值，不需要密钥', () => {
  const example = readFileSync('.env.example', 'utf8');
  expect(parseEnv(example)).toEqual({ PRS_PLEASE_BASE: '/prs-please/' });
  expect(example).toMatch(/optional/i);
  expect(example).toMatch(/public.*path/i);
  expect(example).toMatch(/default.*\/prs-please\//i);
  expect(example).toContain('export PRS_PLEASE_BASE');
});
