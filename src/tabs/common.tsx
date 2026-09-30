import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import type { TileStat } from '../core/stats';
import { Board, HeatLegend } from '../components/Board';
import { Seg } from '../components/ui';
import { fmtInt, fmtNum } from '../lib/format';

export type HeatMetric = 'freq' | 'recent' | 'drought';

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function heatValues(tiles: TileStat[], metric: HeatMetric): { heat: number[]; sub: string[]; titles: string[] } {
  const heat: number[] = [];
  const sub: string[] = [];
  const titles: string[] = [];
  for (const t of tiles) {
    if (metric === 'freq') {
      heat.push(clamp1(t.z / 3));
      sub.push(fmtInt(t.count));
    } else if (metric === 'recent') {
      heat.push(clamp1(t.recentZ / 3));
      sub.push(fmtInt(t.recent));
    } else {
      // overdue ratio 1 = expected drought; log scale so 4× overdue saturates
      heat.push(clamp1(Math.log2(Math.max(0.25, t.overdueRatio)) / 2));
      sub.push(fmtInt(t.currentDrought));
    }
    titles.push(
      `count ${fmtInt(t.count)} (z ${fmtNum(t.z, 2)}) · recent ${fmtInt(t.recent)} · drought ${fmtInt(t.currentDrought)} (longest ${fmtInt(t.longestDrought)})`,
    );
  }
  return { heat, sub, titles };
}

export function HeatBoard({ size = 'md', initial = 'freq', interactive = true }: { size?: 'sm' | 'md'; initial?: HeatMetric; interactive?: boolean }) {
  const tiles = useStore((s) => s.analysis?.tiles.tiles);
  const recentWindow = useStore((s) => s.analysis?.tiles.recentWindow);
  const selectedTiles = useStore((s) => s.config.tiles);
  const toggleTile = useStore((s) => s.toggleTile);
  const [metric, setMetric] = useState<HeatMetric>(initial);
  const selected = useMemo(() => new Set(selectedTiles), [selectedTiles]);
  const hv = useMemo(() => (tiles ? heatValues(tiles, metric) : null), [tiles, metric]);
  if (!hv) return null;
  return (
    <div className="mx-auto max-w-[36rem] space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Seg
          label="Heat metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'freq', label: interactive ? 'Frequency' : 'All-time', title: 'All draws in window (z-score)' },
            { value: 'recent', label: `Recent ${recentWindow ?? ''}`, title: 'Last N draws of the window' },
            { value: 'drought', label: interactive ? 'Drought' : 'Due', title: 'Draws since last seen' },
          ]}
        />
        {metric === 'drought' ? <HeatLegend lowLabel="fresh" highLabel="overdue" /> : <HeatLegend lowLabel="cold" highLabel="hot" />}
      </div>
      <Board
        size={size}
        heat={hv.heat}
        sub={hv.sub}
        titles={hv.titles}
        selected={interactive ? selected : undefined}
        onToggle={interactive ? toggleTile : undefined}
        label={`Tile heatmap by ${metric}`}
      />
      {interactive && <p className="text-[0.6875rem] text-ink-3">Click squares to add/remove them from the tracked set.</p>}
    </div>
  );
}

export function useAnalysis() {
  return useStore((s) => s.analysis);
}

export function Loading() {
  return <div className="panel p-6 text-ink-3">Computing…</div>;
}
