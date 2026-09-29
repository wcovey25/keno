import { lazy, Suspense, useEffect } from 'react';
import { BarChart3, Binary, Crosshair, Download, Grid3x3, Hourglass, List, ShieldCheck, Terminal } from 'lucide-react';
import { Header } from './components/Header';
import { Toasts } from './components/Toasts';
import { DataPanel, UploadZone } from './components/DataPanel';
import { ConfigPanel } from './components/ConfigPanel';
import { RangeBar } from './components/RangeBar';
import { Empty, Note } from './components/ui';
import { TABS, sourceCount, useStore, type TabId } from './state/store';
import { startAnalysisScheduler } from './state/actions';
import { OverviewTab } from './tabs/OverviewTab';
import { cx } from './lib/format';

const TilesTab = lazy(() => import('./tabs/TilesTab'));
const OverdueTab = lazy(() => import('./tabs/OverdueTab'));
const ScannerTab = lazy(() => import('./tabs/ScannerTab'));
const RtpTab = lazy(() => import('./tabs/RtpTab'));
const VerifyTab = lazy(() => import('./tabs/VerifyTab'));
const LogTab = lazy(() => import('./tabs/LogTab'));
const ExportTab = lazy(() => import('./tabs/ExportTab'));

const TAB_META: Record<TabId, { label: string; icon: React.ReactNode }> = {
  overview: { label: 'Overview', icon: <Terminal size={14} /> },
  tiles: { label: 'Tiles', icon: <Grid3x3 size={14} /> },
  overdue: { label: 'Tracker', icon: <Hourglass size={14} /> },
  scanner: { label: 'Scanner', icon: <Crosshair size={14} /> },
  rtp: { label: 'RTP', icon: <BarChart3 size={14} /> },
  verify: { label: 'Verify', icon: <ShieldCheck size={14} /> },
  log: { label: 'Log', icon: <List size={14} /> },
  export: { label: 'Export', icon: <Download size={14} /> },
};

/** Tabs that need a loaded dataset (Verify works standalone for single rounds). */
const NEEDS_DATA = new Set<TabId>(['overview', 'tiles', 'overdue', 'scanner', 'rtp', 'log', 'export']);

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'overview': return <OverviewTab />;
    case 'tiles': return <TilesTab />;
    case 'overdue': return <OverdueTab />;
    case 'scanner': return <ScannerTab />;
    case 'rtp': return <RtpTab />;
    case 'verify': return <VerifyTab />;
    case 'log': return <LogTab />;
    case 'export': return <ExportTab />;
  }
}

function Welcome() {
  return (
    <div className="panel">
      <Empty icon={<Binary size={40} />} title="No data loaded">
        <p>
          Import one or more <b className="text-ink">Stake bet archive</b> exports, or generate rounds from a revealed{' '}
          <b className="text-ink">server seed / client seed</b> pair in the Seeds tab. Everything is computed locally.
        </p>
      </Empty>
      <div className="mx-auto max-w-lg px-6 pb-10">
        <UploadZone />
      </div>
    </div>
  );
}

export function App() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const hasData = useStore((s) => sourceCount(s) > 0);
  const analysisError = useStore((s) => s.analysisError);

  useEffect(() => startAnalysisScheduler(), []);

  return (
    <div className="scanlines min-h-full">
      <Header />
      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <DataPanel />
          <ConfigPanel />
        </aside>
        <main className="min-w-0 space-y-4">
          <RangeBar />
          <nav className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Analysis views">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 whitespace-nowrap transition-colors',
                  tab === t ? 'border-neon text-neon glow' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {TAB_META[t].icon}
                {TAB_META[t].label}
              </button>
            ))}
          </nav>
          {analysisError && <Note tone="bad">Analysis failed: {analysisError}</Note>}
          <div role="tabpanel" className="fade-in" key={tab}>
            {!hasData && NEEDS_DATA.has(tab) ? (
              <Welcome />
            ) : (
              <Suspense fallback={<div className="panel p-6 text-ink-3">Loading view…</div>}>
                <TabContent tab={tab} />
              </Suspense>
            )}
          </div>
        </main>
      </div>
      <footer className="mx-auto max-w-[1600px] px-4 pb-6 text-[11px] text-ink-3">
        Statistical analysis only. Each Keno round is independent: past frequencies and “overdue” streaks do not change future odds. Gamble responsibly.
      </footer>
      <Toasts />
    </div>
  );
}
