import './styles/index.css';
import { initLayout } from './ui/layout';
import { store } from './state';
import { createGlobe, type GlobeContext } from './globe';

import { SidebarController } from './ui/sidebar';
import { SearchOverlay } from './ui/search';
import { Toolbar } from './ui/toolbar';
import { LegendOverlay } from './ui/legend';
import { InfoCard } from './ui/info-card';
import { HoverTooltip } from './ui/hover-tooltip';

import { QuizEngine } from './quiz/engine';
import { QuizHud } from './ui/quiz/quiz-hud';
import { QuizSummaryModal } from './ui/quiz/quiz-summary';
import { getDistanceColor } from './geo/spherical';

export let globeContext: GlobeContext | null = null;
export let sidebar: SidebarController | null = null;
import { RouteHud } from '@/ui/route-hud';
import { SizeComparisonHud } from '@/ui/size-comparison-hud';

export let searchOverlay: SearchOverlay | null = null;
export let toolbar: Toolbar | null = null;
export let legendOverlay: LegendOverlay | null = null;
export let infoCard: InfoCard | null = null;
export let hoverTooltip: HoverTooltip | null = null;
export let quizEngine: QuizEngine | null = null;
export let quizHud: QuizHud | null = null;
export let quizSummary: QuizSummaryModal | null = null;
export let routeHud: RouteHud | null = null;
export let sizeComparisonHud: SizeComparisonHud | null = null;

export function bootstrap(): void {
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('data-ready', 'true');
    const slots = initLayout(root);

    // Initialize Quiz Engine & UI
    quizEngine = new QuizEngine(store, {
      onQuestion: (q, index, total, score) => {
        globeContext?.setArcs([]);
        quizHud?.showQuestion(q, index, total, score);
      },
      onFeedback: answer => {
        quizHud?.showFeedback(answer);
        globeContext?.setArcs([
          {
            startLat: answer.clickLat,
            startLng: answer.clickLng,
            endLat: answer.question.targetLat,
            endLng: answer.question.targetLng,
            color: getDistanceColor(answer.distanceKm),
          },
        ]);
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

    quizSummary = new QuizSummaryModal({
      container: root,
      engine: quizEngine,
    });

    if (slots.sidebarContainer) {
      sidebar = new SidebarController({
        container: slots.sidebarContainer,
        store,
        onStartQuiz: () => {
          quizEngine?.start();
        },
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

    if (typeof window !== 'undefined' && slots.globeContainer) {
      try {
        globeContext = createGlobe(slots.globeContainer, store);
        if (toolbar && globeContext.camera) {
          toolbar.setCamera(globeContext.camera);
        }
      } catch (err) {
        console.warn('[TerraLearn] Globe initialization skipped (environment without WebGL):', err);
      }
    }
  }
}

if (typeof document !== 'undefined') {
  bootstrap();
}
