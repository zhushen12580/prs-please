import type { Verdict } from '../game/types';

export const verdictLabels: Record<Verdict, string> = {
  approve: '批准', request_changes: '要求修改', reject: '拒绝',
};

interface DecisionStatus {
  verdict: Verdict | null;
  canSubmit: boolean;
  locked: boolean;
}

export function createDecision(
  initial: DecisionStatus,
  onVerdict: (verdict: Verdict) => void,
  onSubmit: () => void,
): { element: HTMLElement; update: (status: DecisionStatus) => void } {
  const element = document.createElement('section');
  element.className = 'decision-panel';
  element.setAttribute('aria-label', '裁决区');
  const choices = document.createElement('div');
  choices.className = 'decision-choices';
  const buttons = (Object.entries(verdictLabels) as [Verdict, string][]).map(([verdict, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `secondary-button verdict-${verdict}`;
    button.textContent = label;
    button.addEventListener('click', () => onVerdict(verdict));
    choices.append(button);
    return { button, verdict };
  });
  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.id = 'decision-hint';
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'primary-button';
  submit.textContent = '提交裁决';
  submit.setAttribute('aria-describedby', hint.id);
  submit.addEventListener('click', onSubmit);
  const update = ({ verdict, canSubmit, locked }: DecisionStatus) => {
    for (const choice of buttons) {
      choice.button.disabled = locked;
      choice.button.setAttribute('aria-pressed', String(verdict === choice.verdict));
    }
    submit.disabled = locked || !canSubmit;
    hint.textContent = locked ? '本份裁决已锁定，请查看反馈后继续。'
      : !verdict ? '先选择一种裁决，再提交。'
        : verdict !== 'approve' && !canSubmit ? '要求修改或拒绝，至少选择一项证据才能提交。'
          : '提交后推进 90 分钟，裁决将锁定。';
  };
  element.append(choices, hint, submit);
  update(initial);
  return { element, update };
}
