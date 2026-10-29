import './styles/index.css';
import { initLayout } from './ui/layout';
import { store } from './state';
import { createGlobe, type GlobeContext } from './globe';

import { SidebarController } from './ui/sidebar';
import { SearchOverlay } from './ui/search';
import { Toolbar } from './ui/toolbar';
import { LegendOverlay } from './ui/legend';
import { InfoCard } from './ui/info-card';
import { MoonCard } from './ui/moon-card';
import { HoverTooltip } from './ui/hover-tooltip';

import { QuizEngine } from './quiz/engine';
import { QuizHud } from './ui/quiz/quiz-hud';
import { QuizSummaryModal } from './ui/quiz/quiz-summary';
import { QuizConfigModal } from './ui/quiz/quiz-config-modal';
import { getDistanceColor } from './geo/spherical';

import { t, setLocale } from './i18n';
import { initPwa } from '@/pwa';
import { loadDevPanel } from '@/dev/load-dev-panel';

export let globeContext: GlobeContext | null = null;
export let sidebar: SidebarController | null = null;
import { RouteHud } from '@/ui/route-hud';
import { SizeComparisonHud } from '@/ui/size-comparison-hud';
import { AntipodesHud } from '@/ui/antipodes-hud';

export let searchOverlay: SearchOverlay | null = null;
export let toolbar: Toolbar | null = null;
export let legendOverlay: LegendOverlay | null = null;
export let infoCard: InfoCard | null = null;
export let hoverTooltip: HoverTooltip | null = null;
export let quizEngine: QuizEngine | null = null;
export let quizHud: QuizHud | null = null;
export let quizSummary: QuizSummaryModal | null = null;
export let quizConfigModal: QuizConfigModal | null = null;
export let routeHud: RouteHud | null = null;
export let sizeComparisonHud: SizeComparisonHud | null = null;
export let antipodesHud: AntipodesHud | null = null;
export let moonCard: MoonCard | null = null;

export function bootstrap(): void {
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('data-ready', 'true');
    const slots = initLayout(root);
    initPwa();

    // Sync theme to root data-theme attribute
    const syncTheme = (theme: string) => {
      document.documentElement.setAttribute('data-theme', theme);
    };
    syncTheme(store.get().theme);
    store.subscribe(s => s.theme, syncTheme);

    // Sync locale to i18n, HTML lang attribute, document title, and components
    const syncLocale = (locale: 'pl' | 'en') => {
      setLocale(locale);
      document.documentElement.setAttribute('lang', locale);
      document.title = t('app.title');
      slots.refreshRail();
      sidebar?.refresh();
      searchOverlay?.refresh();
      toolbar?.refresh();
      legendOverlay?.refresh();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tl-locale-updated', { detail: { locale } }));
      }
    };
    syncLocale(store.get().locale ?? 'en');
    store.subscribe(s => s.locale, syncLocale);

    // Initialize Quiz Engine & UI
    quizEngine = new QuizEngine(store, {
      onQuestion: (q, index, total, score, mode) => {
        globeContext?.setArcs([]);
        quizHud?.showQuestion(q, index, total, score, mode);
      },
      onCameraFlyTo: (lat, lng, alt) => {
        globeContext?.camera.flyTo(lat, lng, alt ?? 1.2, 1000);
      },
      onFeedback: answer => {
        quizHud?.showFeedback(answer);
        if (
          answer.mode === 'classic' &&
          answer.clickLat !== undefined &&
          answer.clickLng !== undefined
        ) {
          globeContext?.setArcs([
            {
              startLat: answer.clickLat,
              startLng: answer.clickLng,
              endLat: answer.question.targetLat,
              endLng: answer.question.targetLng,
              color: getDistanceColor(answer.distanceKm ?? 0),
            },
          ]);
        }
      },
      onFinish: summary => {
        globeContext?.setArcs([]);
        quizHud?.hide();
        quizSummary?.show(summary);
      },
      onStop: () => {
        globeContext?.setArcs([]);
        quizHud?.hide();
        quizSummary?.hide();
      },
    });

    quizHud = new QuizHud({
      container: root,
      engine: quizEngine,
    });

    quizConfigModal = new QuizConfigModal({
      container: root,
      onStart: config => {
        quizEngine?.startWithConfig(config);
      },
    });

    quizSummary = new QuizSummaryModal({
      container: root,
      engine: quizEngine,
      onChangeScope: () => {
        const currentConfig = quizEngine?.getConfig();
        quizConfigModal?.show(currentConfig ?? undefined);
      },
    });

    if (slots.sidebarContainer) {
      sidebar = new SidebarController({
        container: slots.sidebarContainer,
        store,
        onStartQuiz: (mode, configOverride) => {
          quizConfigModal?.show({ mode: mode ?? 'classic', ...configOverride });
        },
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('tl-start-quiz', (e: Event) => {
        const custom = e as CustomEvent<{
          mode?: 'classic' | 'reverse';
          srsFilter?: 'none' | 'due' | 'difficult';
        }>;
        quizConfigModal?.show({
          mode: custom.detail?.mode ?? 'classic',
          srsFilter: custom.detail?.srsFilter,
        });
      });
    }

    if (slots.searchContainer) {
      searchOverlay = new SearchOverlay({
        container: slots.searchContainer,
        store,
        onSelect: item => {
          globeContext?.camera.flyTo(item.lat, item.lng, 1.0);
        },
      });
    }

    if (slots.toolbarContainer) {
      toolbar = new Toolbar({
        container: slots.toolbarContainer,
      });
    }

    if (slots.legendContainer) {
      legendOverlay = new LegendOverlay({
        container: slots.legendContainer,
        store,
      });
    }

    if (slots.cardContainer) {
      infoCard = new InfoCard({
        container: slots.cardContainer,
        store,
        onFlyTo: () => {
          const sel = store.get().selection;
          if (sel?.lat !== undefined && sel?.lng !== undefined) {
            globeContext?.camera.flyTo(sel.lat, sel.lng, 1.0);
          }
        },
      });
    }

    hoverTooltip = new HoverTooltip({
      container: root,
      store,
    });

    routeHud = new RouteHud({
      container: root,
      store,
      onFlyTo: (lat, lng, alt) => {
        globeContext?.camera.flyTo(lat, lng, alt);
      },
    });

    sizeComparisonHud = new SizeComparisonHud({
      container: root,
      store,
      onFlyTo: (lat, lng, alt) => {
        globeContext?.camera.flyTo(lat, lng, alt);
      },
    });

    antipodesHud = new AntipodesHud({
      container: root,
      store,
      onFlyTo: (lat, lng, alt) => {
        globeContext?.camera.flyTo(lat, lng, alt);
      },
    });

    if (typeof window !== 'undefined' && slots.globeContainer) {
      try {
        globeContext = createGlobe(slots.globeContainer, store);
        if (toolbar && globeContext.camera) {
          toolbar.setCamera(globeContext.camera);
        }
        if (slots.cardContainer) {
          const skyClock = globeContext.skyClock;
          moonCard = new MoonCard({
            container: slots.cardContainer,
            store,
            getDate: () => skyClock.now(),
            onTick: listener => skyClock.onTick(listener),
          });
        }
        void loadDevPanel(window.location.search, root, globeContext);
      } catch (err) {
        console.warn('[TerraLearn] Globe initialization skipped (environment without WebGL):', err);
      }
    }
  }
}

if (typeof document !== 'undefined') {
  bootstrap();
}
