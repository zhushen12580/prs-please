import { mountApp } from './ui/app';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('缺少应用挂载节点 #app');
}

mountApp(root);
