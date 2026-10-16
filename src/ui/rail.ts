import { parseSvg } from './dom';

export interface RailItem {
  id: string;
  label: string;
  iconSvg: string;
  active?: boolean;
}

export function createRail(items: RailItem[], onSelect?: (id: string) => void): HTMLElement {
  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Quick Navigation');

  const topGroup = document.createElement('div');
  topGroup.className = 'rail-group';

  // Logo button
  const logoBtn = document.createElement('button');
  logoBtn.className = 'rail-btn rail-logo';
  logoBtn.setAttribute('aria-label', 'TerraLearn Home');
  logoBtn.appendChild(
    parseSvg(`
    <svg viewBox="0 0 100 100" width="28" height="28">
      <circle cx="50" cy="50" r="46" fill="#0b0e14" stroke="#38bdf8" stroke-width="4"/>
      <ellipse cx="50" cy="50" rx="46" ry="18" fill="none" stroke="#0ea5e9" stroke-width="2" opacity="0.6"/>
      <circle cx="50" cy="50" r="10" fill="#38bdf8"/>
    </svg>
  `),
  );
  topGroup.appendChild(logoBtn);

  // Nav buttons
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = `rail-btn${item.active ? ' active' : ''}`;
    btn.setAttribute('aria-label', item.label);
    btn.title = item.label;
    btn.appendChild(parseSvg(item.iconSvg));

    btn.addEventListener('click', () => {
      rail.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect?.(item.id);
    });

    topGroup.appendChild(btn);
  });

  rail.appendChild(topGroup);
  return rail;
}
