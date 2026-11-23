export function confirmRestart(host: HTMLElement, currentSeed: string, nextSeed: string, onConfirm: () => void): void {
  if (host.querySelector('.restart-confirm[open]')) return;
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('dialog');
  dialog.className = 'restart-confirm';
  dialog.setAttribute('aria-labelledby', 'restart-confirm-title');
  dialog.setAttribute('aria-describedby', 'restart-confirm-description');
  const title = document.createElement('h2');
  title.id = 'restart-confirm-title';
  title.textContent = '覆盖当前值班？';
  const description = document.createElement('p');
  description.id = 'restart-confirm-description';
  description.textContent = `将覆盖种子「${currentSeed}」的当前局，清空所有裁决记录、成绩和草稿，以种子「${nextSeed}」从第 1 天重新开始。`;
  const actions = document.createElement('div');
  actions.className = 'shift-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary-button';
  cancel.textContent = '取消';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'primary-button';
  confirm.textContent = '确认覆盖';
  let settled = false;
  const finish = (confirmed: boolean) => {
    if (settled) return;
    settled = true;
    dialog.close();
    dialog.remove();
    if (confirmed) onConfirm();
    else if (trigger?.isConnected) trigger.focus();
  };
  cancel.addEventListener('click', () => finish(false));
  confirm.addEventListener('click', () => finish(true));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish(false);
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === cancel) {
      event.preventDefault();
      confirm.focus();
    } else if (!event.shiftKey && document.activeElement === confirm) {
      event.preventDefault();
      cancel.focus();
    }
  });
  dialog.addEventListener('close', () => finish(false));
  actions.append(cancel, confirm);
  dialog.append(title, description, actions);
  host.append(dialog);
  dialog.showModal();
  cancel.focus();
}
