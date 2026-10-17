export type SnapPoint = 'peek' | 'half' | 'full';

export interface BottomSheetOptions {
  panel: HTMLElement;
  handle: HTMLElement;
  minimizeBtn?: HTMLElement | null;
  fabBtn?: HTMLElement | null;
  initialSnap?: SnapPoint;
  onSnapChange?: (snap: SnapPoint) => void;
}

export class BottomSheetController {
  private readonly panel: HTMLElement;
  private readonly handle: HTMLElement;
  private readonly minimizeBtn?: HTMLElement | null;
  private readonly fabBtn?: HTMLElement | null;
  private readonly onSnapChange?: (snap: SnapPoint) => void;

  private currentSnap: SnapPoint;
  private isDragging = false;
  private startY = 0;
  private startHeight = 0;
  private startTime = 0;
  private currentY = 0;

  private readonly cleanupFns: (() => void)[] = [];

  constructor(options: BottomSheetOptions) {
    this.panel = options.panel;
    this.handle = options.handle;
    this.minimizeBtn = options.minimizeBtn;
    this.fabBtn = options.fabBtn;
    this.onSnapChange = options.onSnapChange;
    this.currentSnap = options.initialSnap ?? 'half';

    this.init();
  }

  private init(): void {
    this.setSnap(this.currentSnap);

    // 1. Touch & Pointer Drag Gestures
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      this.beginDrag(touch.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      this.dragMove(touch.clientY);
    };

    const onTouchEnd = () => {
      if (!this.isDragging) return;
      this.endDrag();
    };

    this.handle.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    this.cleanupFns.push(() => {
      this.handle.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    });

    // 2. Handle Click / Keyboard activation (toggle peek <-> half)
    const onHandleClick = () => {
      if (this.currentSnap === 'peek') {
        this.setSnap('half');
      } else {
        this.setSnap('peek');
      }
    };

    const onHandleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onHandleClick();
      }
    };

    this.handle.addEventListener('click', onHandleClick);
    this.handle.addEventListener('keydown', onHandleKeyDown);

    this.cleanupFns.push(() => {
      this.handle.removeEventListener('click', onHandleClick);
      this.handle.removeEventListener('keydown', onHandleKeyDown);
    });

    // 3. Header Minimize Button
    if (this.minimizeBtn) {
      const onMinimize = () => this.setSnap('peek');
      this.minimizeBtn.addEventListener('click', onMinimize);
      this.cleanupFns.push(() => this.minimizeBtn?.removeEventListener('click', onMinimize));
    }

    // 4. Floating Action Button
    if (this.fabBtn) {
      const onFabClick = () => {
        if (this.currentSnap === 'peek') {
          this.setSnap('half');
        } else {
          this.setSnap('peek');
        }
      };
      this.fabBtn.addEventListener('click', onFabClick);
      this.cleanupFns.push(() => this.fabBtn?.removeEventListener('click', onFabClick));
    }
  }

  private beginDrag(clientY: number): void {
    this.isDragging = true;
    this.startY = clientY;
    this.currentY = clientY;
    this.startTime = Date.now();
    this.startHeight = this.panel.getBoundingClientRect().height;
    this.panel.style.transition = 'none';
  }

  private dragMove(clientY: number): void {
    this.currentY = clientY;
    const deltaY = this.startY - clientY; // upward drag increases height
    const minHeight = 56;
    const maxHeight = window.innerHeight * 0.9;
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, this.startHeight + deltaY));
    this.panel.style.height = `${nextHeight}px`;
  }

  private endDrag(): void {
    this.isDragging = false;
    this.panel.style.transition = '';
    this.panel.style.height = '';

    const totalDelta = this.startY - this.currentY;
    const duration = Math.max(1, Date.now() - this.startTime);
    const velocity = totalDelta / duration; // positive = dragged up

    let targetSnap: SnapPoint = this.currentSnap;

    if (velocity > 0.4) {
      // Strong upward swipe
      targetSnap = this.currentSnap === 'peek' ? 'half' : 'full';
    } else if (velocity < -0.4) {
      // Strong downward swipe
      targetSnap = this.currentSnap === 'full' ? 'half' : 'peek';
    } else {
      // Position-based snap
      const currentHeight = this.startHeight + totalDelta;
      const ratio = currentHeight / Math.max(1, window.innerHeight);

      if (ratio < 0.25) {
        targetSnap = 'peek';
      } else if (ratio < 0.65) {
        targetSnap = 'half';
      } else {
        targetSnap = 'full';
      }
    }

    this.setSnap(targetSnap);
  }

  public getSnap(): SnapPoint {
    return this.currentSnap;
  }

  public setSnap(snap: SnapPoint): void {
    this.currentSnap = snap;
    this.panel.setAttribute('data-snap', snap);
    this.handle.setAttribute('aria-expanded', snap !== 'peek' ? 'true' : 'false');

    if (this.fabBtn) {
      this.fabBtn.classList.toggle('active', snap !== 'peek');
      this.fabBtn.setAttribute('aria-expanded', snap !== 'peek' ? 'true' : 'false');
    }

    this.onSnapChange?.(snap);
  }

  public destroy(): void {
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns.length = 0;
  }
}
