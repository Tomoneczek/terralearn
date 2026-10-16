import './styles/index.css';
import { initLayout } from './ui/layout';

export function bootstrap(): void {
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('data-ready', 'true');
    initLayout(root);
  }
}

if (typeof document !== 'undefined') {
  bootstrap();
}
