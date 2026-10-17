import type { CameraController } from '@/globe/camera';
import { parseSvg } from './dom';
import { t } from '@/i18n';

export interface ToolbarOptions {
  container: HTMLElement;
  camera?: CameraController;
}

export class Toolbar {
  public readonly element: HTMLElement;
  private camera?: CameraController;
  private isAutoRotating = false;

  constructor(options: ToolbarOptions) {
    this.camera = options.camera;

    this.element = document.createElement('div');
    this.element.className = 'tl-toolbar';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', t('toolbar.ariaLabel'));

    // 1. Zoom In
    this.zoomInBtn = this.createButton(
      t('toolbar.zoomIn'),
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>',
      () => {
        this.camera?.zoomIn();
      },
    );

    // 2. Zoom Out
    this.zoomOutBtn = this.createButton(
      t('toolbar.zoomOut'),
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>',
      () => {
        this.camera?.zoomOut();
      },
    );

    // 3. Reset View
    this.resetBtn = this.createButton(
      t('toolbar.resetView'),
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
      () => {
        this.camera?.resetView();
      },
    );

    // 4. Auto-rotation toggle
    this.rotateBtn = this.createButton(
      t('toolbar.autoRotate'),
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
      () => {
        const next = this.camera?.toggleAutoRotate();
        this.isAutoRotating = Boolean(next);
        this.rotateBtn.classList.toggle('active', this.isAutoRotating);
      },
    );

    // 5. Fullscreen toggle
    this.fullscreenBtn = this.createButton(
      t('toolbar.fullscreen'),
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
      () => {
        if (!document.fullscreenElement) {
          void document.documentElement.requestFullscreen?.();
        } else {
          void document.exitFullscreen?.();
        }
      },
    );

    this.element.appendChild(this.zoomInBtn);
    this.element.appendChild(this.zoomOutBtn);
    this.element.appendChild(this.resetBtn);
    this.element.appendChild(this.rotateBtn);
    this.element.appendChild(this.fullscreenBtn);

    options.container.appendChild(this.element);
  }

  private readonly zoomInBtn: HTMLButtonElement;
  private readonly zoomOutBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly rotateBtn: HTMLButtonElement;
  private readonly fullscreenBtn: HTMLButtonElement;

  public refresh(): void {
    this.element.setAttribute('aria-label', t('toolbar.ariaLabel'));
    this.zoomInBtn.setAttribute('aria-label', t('toolbar.zoomIn'));
    this.zoomOutBtn.setAttribute('aria-label', t('toolbar.zoomOut'));
    this.resetBtn.setAttribute('aria-label', t('toolbar.resetView'));
    this.rotateBtn.setAttribute('aria-label', t('toolbar.autoRotate'));
    this.fullscreenBtn.setAttribute('aria-label', t('toolbar.fullscreen'));
  }

  public setCamera(camera: CameraController): void {
    this.camera = camera;
  }

  private createButton(ariaLabel: string, iconSvg: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tl-toolbar-btn';
    btn.setAttribute('aria-label', ariaLabel);
    btn.appendChild(parseSvg(iconSvg));
    btn.addEventListener('click', onClick);
    return btn;
  }

  public destroy(): void {
    this.element.remove();
  }
}
