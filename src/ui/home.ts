import { normalizeSeed } from '../game/random';

export function createHome(onStart: (seed: string) => void, options: { seed?: string; onContinue?: () => void } = {}): HTMLElement {
  const section = document.createElement('section');
  section.className = 'home';
  section.setAttribute('aria-labelledby', 'home-title');

  const title = document.createElement('h2');
  title.id = 'home-title';
  title.tabIndex = -1;
  title.textContent = '轮到你值班了。';

  const introduction = document.createElement('p');
  introduction.textContent = '翻规则、查证据、盖裁决章。保护好贡献，也拦住藏在改动里的问题。';

  const duration = document.createElement('p');
  duration.className = 'shift-details';
  duration.textContent = '5 个工作日 · 每天 6 份 PR · 一局约 15–25 分钟';

  const verdicts = document.createElement('dl');
  verdicts.className = 'verdicts';
  const definitions = [
    ['approve', '批准', '符合所有生效规则，允许合入。'],
    ['request_changes', '要求修改', '存在可修复的问题，标出证据后退回重审。'],
    ['reject', '拒绝', '引入隐藏后门等恶意行为，标出证据并拒绝合入。'],
  ];
  for (const [verdict, name, description] of definitions) {
    const item = document.createElement('div');
    item.className = `verdict-${verdict}`;
    const term = document.createElement('dt');
    term.textContent = name;
    const detail = document.createElement('dd');
    detail.textContent = description;
    item.append(term, detail);
    verdicts.append(item);
  }

  const form = document.createElement('form');
  form.className = 'seed-form';
  form.noValidate = true;

  const label = document.createElement('label');
  label.htmlFor = 'shift-seed';
  label.textContent = '挑战种子';

  const hint = document.createElement('p');
  hint.id = 'seed-hint';
  hint.className = 'field-hint';
  hint.textContent = '1–32 位英文字母、数字、下划线或连字符。相同种子和内容版本，题目顺序相同。';

  const input = document.createElement('input');
  input.id = 'shift-seed';
  input.name = 'seed';
  input.type = 'text';
  input.value = options.seed ?? 'maintainer-001';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'none');
  input.spellcheck = false;
  input.setAttribute('aria-describedby', 'seed-hint seed-error');

  const error = document.createElement('p');
  error.id = 'seed-error';
  error.className = 'field-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const start = document.createElement('button');
  start.type = 'submit';
  start.className = 'primary-button';
  start.textContent = options.onContinue ? '重新开始' : '开始值班';

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    error.hidden = true;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const seed = normalizeSeed(input.value);
    if (seed === null) {
      error.textContent = '请输入 1–32 位英文字母、数字、下划线（_）或连字符（-），不能包含空格或中文。';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    onStart(seed);
  });

  form.append(label, hint, input, error, start);
  section.append(title, introduction, duration, verdicts);
  if (options.onContinue) {
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'secondary-button';
    resume.textContent = '继续值班';
    resume.addEventListener('click', options.onContinue);
    const current = document.createElement('p');
    current.className = 'shift-details';
    current.textContent = `当前局种子：${input.value}。继续值班可回到离开时的位置。`;
    section.append(resume, current);
  }
  section.append(form);
  return section;
}
