import campaign from '../../src/data/campaign.json';
import rules from '../../src/data/rules.json';
import dayOne from '../../src/data/cases/day-01.json';
import dayTwo from '../../src/data/cases/day-02.json';
import dayThree from '../../src/data/cases/day-03.json';
import dayFour from '../../src/data/cases/day-04.json';
import dayFive from '../../src/data/cases/day-05.json';

// 每次深复制；非法内容只存在于测试内存，不写回生产 JSON。
export function rawContent() {
  return structuredClone({
    campaign,
    rules,
    caseFiles: [dayOne, dayTwo, dayThree, dayFour, dayFive].map((data, index) => ({
      source: `src/data/cases/day-0${index + 1}.json`, data,
    })),
  });
}

export function setField(input: unknown, path: readonly (string | number)[], value: unknown): void {
  let target = input;
  for (const key of path.slice(0, -1)) {
    if (typeof target !== 'object' || target === null) throw new Error(`测试路径不存在：${path}`);
    target = Reflect.get(target, key);
  }
  if (typeof target !== 'object' || target === null) throw new Error(`测试路径不存在：${path}`);
  Reflect.set(target, path[path.length - 1], value);
}
