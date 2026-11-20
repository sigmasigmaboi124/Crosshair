import React, { useEffect, useRef, useState } from 'react';
import { Activity, RotateCcw, Timer, Zap } from 'lucide-react';
import { AimSessionRecord } from '../types/crosshair';
import { aimAudio } from '../engine/audioSynth';

export type RecoilWeaponId = 'ak47' | 'vandal' | 'phantom';

export interface WeaponSpraySpec {
  id: RecoilWeaponId;
  name: string;
  game: string;
  rpm: number;
  magSize: number;
  // Per-bullet incremental camera recoil kick in radians: [pitchUp, yawRight]
  kicks: Array<[number, number]>;
}

export const WEAPON_PATTERNS: Record<RecoilWeaponId, WeaponSpraySpec> = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    game: 'CS2 Classic',
    rpm: 600,
    magSize: 30,
    kicks: [
      [0.014, 0.001], [0.018, 0.002], [0.022, -0.001], [0.023, -0.002], [0.021, 0.003],
      [0.018, 0.005], [0.014, 0.008], [0.009, 0.011], [0.005, 0.013], [0.003, 0.011],
      [0.002, 0.006], [0.001, -0.006], [0.001, -0.013], [0.002, -0.016], [0.001, -0.017],
      [0.001, -0.015], [0.001, -0.012], [0.002, -0.008], [0.001, -0.004], [0.001, 0.005],
      [0.001, 0.012], [0.001, 0.015], [0.001, 0.014], [0.001, 0.011], [0.001, 0.007],
      [0.001, 0.002], [0.001, -0.006], [0.001, -0.010], [0.001, -0.011], [0.001, -0.007],
    ],
  },
  vandal: {
    id: 'vandal',
    name: 'Vandal',
    game: 'Valorant',
    rpm: 585,
    magSize: 25,
    kicks: [
      [0.015, 0.000], [0.019, 0.001], [0.022, -0.001], [0.024, 0.002], [0.021, 0.004],
      [0.017, 0.007], [0.011, 0.009], [0.006, 0.011], [0.003, 0.009], [0.002, 0.004],
      [0.001, -0.008], [0.001, -0.013], [0.001, -0.014], [0.001, -0.012], [0.001, -0.008],
      [0.001, 0.004], [0.001, 0.011], [0.001, 0.013], [0.001, 0.011], [0.001, 0.006],
      [0.001, -0.005], [0.001, -0.010], [0.001, -0.011], [0.001, -0.007], [0.001, -0.003],
    ],
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    game: 'Valorant',
    rpm: 660,
    magSize: 30,
    kicks: [
      [0.011, 0.000], [0.014, 0.001], [0.017, -0.001], [0.018, 0.001], [0.017, 0.003],
      [0.014, 0.005], [0.010, 0.007], [0.006, 0.008], [0.003, 0.008], [0.002, 0.005],
      [0.001, -0.004], [0.001, -0.009], [0.001, -0.011], [0.001, -0.010], [0.001, -0.008],
      [0.001, -0.004], [0.001, 0.005], [0.001, 0.009], [0.001, 0.010], [0.001, 0.008],
      [0.001, 0.005], [0.001, -0.003], [0.001, -0.008], [0.001, -0.009], [0.001, -0.007],
      [0.001, -0.003], [0.001, 0.004], [0.001, 0.007], [0.001, 0.006], [0.001, 0.003],
    ],
  },
};

function rankFromReactionMs(avgMs: number): AimSessionRecord['rank'] {
  if (avgMs <= 155) return 'Grandmaster';
  if (avgMs <= 175) return 'Master';
  if (avgMs <= 195) return 'Diamond';
  if (avgMs <= 220) return 'Platinum';
  if (avgMs <= 250) return 'Gold';
  if (avgMs <= 290) return 'Silver';
  return 'Bronze';
}

interface ReactionBenchmarkViewProps {
  soundEnabled: boolean;
  soundVolume: number;
  crosshairName: string;
  onComplete: (record: AimSessionRecord) => void;
  onExit: () => void;
}

export const ReactionBenchmarkView: React.FC<ReactionBenchmarkViewProps> = ({
  soundEnabled,
  soundVolume,
  crosshairName,
  onComplete,
  onExit,
}) => {
  const TOTAL_ROUNDS = 5;
  const [stage, setStage] = useState<'ready' | 'waiting' | 'go' | 'too-early' | 'result'>('ready');
  const [times, setTimes] = useState<number[]>([]);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const goAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const clearWaitTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearWaitTimer(), []);

  const startNextRound = () => {
    clearWaitTimer();
    setStage('waiting');
    const delayMs = 1500 + Math.random() * 2700;
    timerRef.current = window.setTimeout(() => {
      goAtRef.current = performance.now();
      setStage('go');
      if (soundEnabled) aimAudio.playTrackTick(soundVolume);
    }, delayMs);
  };

  const handlePadMouseDown = () => {
    if (stage === 'ready' || stage === 'too-early' || stage === 'result') {
      startNextRound();
      return;
    }
    if (stage === 'waiting') {
      clearWaitTimer();
      setStage('too-early');
      if (soundEnabled) aimAudio.playMiss(soundVolume);
      return;
    }
    if (stage === 'go') {
      const elapsed = Math.max(70, Math.round(performance.now() - goAtRef.current));
      setLastMs(elapsed);
      if (soundEnabled) aimAudio.playHit(soundVolume, times.length + 1);
      const next = [...times, elapsed];
      setTimes(next);

      if (next.length >= TOTAL_ROUNDS) {
        const avg = Math.round(next.reduce((a, b) => a + b, 0) / next.length);
        const score = Math.max(1000, Math.round((450 - avg) * 160));
        onComplete({
          id: `aim-rx-${Date.now()}`,
          mode: 'reaction',
          date: new Date().toISOString().slice(0, 10),
          timestamp: Date.now(),
          score,
          accuracy: 100,
          hits: TOTAL_ROUNDS,
          misses: 0,
          avgReactionMs: avg,
          durationSec: TOTAL_ROUNDS * 3,
          bestStreak: TOTAL_ROUNDS,
          crosshairName,
          rank: rankFromReactionMs(avg),
        });
      } else {
        setStage('result');
      }
    }
  };

  const bgClass = {
    ready: 'bg-[#0b1220] border-cyan-500/40',
    waiting: 'bg-rose-950/80 border-rose-500/60',
    go: 'bg-emerald-500/90 border-emerald-200',
    'too-early': 'bg-amber-950/85 border-amber-400/60',
    result: 'bg-[#0c1626] border-cyan-400/50',
  }[stage];

  return (
    <div className="h-full w-full flex flex-col p-4 gap-3 select-none bg-[#060910]">
      <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#0c121e] border border-slate-800">
        <div className="flex items-center gap-3">
          <Timer className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-black tracking-wider text-white uppercase">
            Reaction Time Benchmark ({Math.min(TOTAL_ROUNDS, times.length + (stage === 'go' || stage === 'waiting' ? 1 : 0))}/{TOTAL_ROUNDS})
          </span>
          <div className="flex items-center gap-1.5">
            {times.map((ms, i) => (
              <span
                key={i}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/35"
              >
                {ms}ms
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              clearWaitTimer();
              setTimes([]);
              setLastMs(null);
              setStage('ready');
            }}
            className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-xs font-semibold text-rose-200 cursor-pointer"
          >
            Exit to Lobby
          </button>
        </div>
      </div>

      <button
        type="button"
        onMouseDown={handlePadMouseDown}
        className={`flex-1 rounded-3xl border-2 transition-colors duration-75 flex flex-col items-center justify-center gap-3 cursor-pointer ${bgClass}`}
      >
        <Zap className={`w-14 h-14 ${stage === 'go' ? 'text-slate-950' : 'text-cyan-300'}`} />
        {stage === 'ready' && (
          <>
            <div className="text-3xl font-black text-white tracking-wide">CLICK ANYWHERE TO BEGIN</div>
            <p className="text-sm text-slate-400">Wait for the screen to flash EMERALD GREEN, then click immediately.</p>
          </>
        )}
        {stage === 'waiting' && (
          <>
            <div className="text-3xl font-black text-rose-200 tracking-wider">HOLD STEADY — WAIT FOR GREEN...</div>
            <p className="text-xs font-mono text-rose-300/75">DO NOT CLICK EARLY</p>
          </>
        )}
        {stage === 'go' && (
          <div className="text-5xl font-black text-slate-950 tracking-widest">CLICK NOW!</div>
        )}
        {stage === 'too-early' && (
          <>
            <div className="text-3xl font-black text-amber-300">TOO EARLY!</div>
            <p className="text-sm text-amber-100/80">Click anywhere to retry this round.</p>
          </>
        )}
        {stage === 'result' && lastMs !== null && (
          <>
            <div className="text-5xl font-black font-mono text-cyan-300">{lastMs} ms</div>
            <p className="text-sm text-slate-300">Click anywhere for Round {times.length + 1} of {TOTAL_ROUNDS}</p>
          </>
        )}
      </button>
    </div>
  );
};

/**
 * Sleek dual-line SVG Trend Graph for Session Score & Accuracy % progression
 */
export const SessionTrendGraph: React.FC<{ records: AimSessionRecord[]; modeName: string }> = ({
  records,
  modeName,
}) => {
  const series = [...records].slice(0, 15).reverse();

  return (
    <div className="rounded-2xl bg-[#0d131f] border border-slate-800/90 p-4 space-y-2.5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>{modeName} Trend (Score & Accuracy)</span>
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-cyan-300">● SCORE</span>
          <span className="text-emerald-300">● ACC %</span>
        </div>
      </div>

      {series.length < 2 ? (
        <div className="h-32 flex items-center justify-center text-xs text-slate-500 text-center px-4">
          Complete at least 2 runs in {modeName} to unlock your live Score & Accuracy progression chart.
        </div>
      ) : (
        <TrendSvg series={series} />
      )}
    </div>
  );
};

const TrendSvg: React.FC<{ series: AimSessionRecord[] }> = ({ series }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 420;
  const H = 128;
  const padX = 14;
  const padY = 14;
  const maxScore = Math.max(1000, ...series.map((s) => s.score));
  const minScore = Math.min(...series.map((s) => s.score));
  const scoreSpan = Math.max(1, maxScore - minScore);

  const xAt = (i: number) => padX + (i / Math.max(1, series.length - 1)) * (W - padX * 2);
  const yScore = (v: number) => H - padY - ((v - minScore) / scoreSpan) * (H - padY * 2);
  const yAcc = (v: number) => H - padY - (Math.max(0, Math.min(100, v)) / 100) * (H - padY * 2);

  const scorePoints = series.map((r, i) => `${xAt(i).toFixed(1)},${yScore(r.score).toFixed(1)}`).join(' ');
  const accPoints = series.map((r, i) => `${xAt(i).toFixed(1)},${yAcc(r.accuracy).toFixed(1)}`).join(' ');
  const areaPath = `M ${xAt(0)},${H - padY} L ${scorePoints.replace(/ /g, ' L ')} L ${xAt(series.length - 1)},${H - padY} Z`;

  const active = hoverIdx !== null ? series[hoverIdx] : series[series.length - 1];

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 overflow-visible">
        <defs>
          <linearGradient id="zpScoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={padX}
            y1={padY + r * (H - padY * 2)}
            x2={W - padX}
            y2={padY + r * (H - padY * 2)}
            stroke="rgba(148,163,184,0.12)"
            strokeDasharray="3 3"
          />
        ))}
        <path d={areaPath} fill="url(#zpScoreFill)" />
        <polyline fill="none" stroke="#10f59b" strokeWidth="1.8" strokeDasharray="4 3" points={accPoints} />
        <polyline fill="none" stroke="#00f0ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" points={scorePoints} />

        {series.map((r, i) => (
          <g
            key={r.id}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            className="cursor-pointer"
          >
            <circle cx={xAt(i)} cy={yScore(r.score)} r={hoverIdx === i ? 5 : 3.2} fill="#00f0ff" stroke="#070a11" strokeWidth="1.5" />
            <circle cx={xAt(i)} cy={yAcc(r.accuracy)} r={hoverIdx === i ? 4 : 2.4} fill="#10f59b" />
          </g>
        ))}
      </svg>

      {active && (
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
          <span>{hoverIdx !== null ? `Run #${hoverIdx + 1}` : 'Latest'} ({active.date})</span>
          <span>
            Score: <strong className="text-cyan-300">{active.score.toLocaleString()}</strong> • Acc:{' '}
            <strong className="text-emerald-300">{active.accuracy}%</strong> • Avg:{' '}
            <strong className="text-white">{active.avgReactionMs}ms</strong>
          </span>
        </div>
      )}
    </div>
  );
};
