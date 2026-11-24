import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { ACHIEVEMENTS } from '../data/achievements';

interface AchievementsViewProps {
  store: AppStore;
}

const TIER_STYLES = {
  bronze: 'text-amber-500 border-amber-600/40 bg-amber-500/10',
  silver: 'text-[#ececf0] border-slate-400/40 bg-slate-400/10',
  gold: 'text-yellow-300 border-yellow-400/50 bg-yellow-500/15',
  platinum: 'text-[#e4e4e8] border-white/35 bg-cyan-500/20',
};

export const AchievementsView: React.FC<AchievementsViewProps> = ({ store }) => {
  const { achievements } = store;
  const [catFilter, setCatFilter] = useState<'All' | 'Designer' | 'Overlay' | 'Community' | 'Aim Trainer'>('All');

  const unlockedSet = useMemo(() => new Set(achievements.unlockedIds), [achievements.unlockedIds]);

  const totalXp = useMemo(
    () => ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).reduce((acc, a) => acc + a.xp, 0),
    [unlockedSet]
  );
  const maxXp = useMemo(() => ACHIEVEMENTS.reduce((acc, a) => acc + a.xp, 0), []);

  const operatorRank =
    totalXp >= 1800
      ? 'Grandmaster Optic'
      : totalXp >= 1200
      ? 'Vanguard Specialist'
      : totalXp >= 700
      ? 'Precision Operator'
      : totalXp >= 300
      ? 'Marksman'
      : 'Range Recruit';

  const visible = ACHIEVEMENTS.filter((a) => catFilter === 'All' || a.category === catFilter);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Rank & XP Hero Card */}
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#1c1c22] border border-[#2a2a33] flex items-center justify-center">
            <Award className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{operatorRank}</h2>
            <p className="text-xs text-[#8c8c9a]">
              {achievements.unlockedIds.length} of {ACHIEVEMENTS.length} achievements unlocked
            </p>
          </div>
        </div>

        <div className="md:w-72 space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[#9696a4]">TOTAL XP</span>
            <span className="text-[#f4f4f6] font-bold">
              {totalXp} / {maxXp} XP
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[#0e0e11] border border-[#23232a] overflow-hidden">
            <div
              className="h-full bg-[#f4f4f6] transition-all duration-500"
              style={{ width: `${Math.round((totalXp / Math.max(1, maxXp)) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['All', 'Designer', 'Overlay', 'Community', 'Aim Trainer'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCatFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
              catFilter === c
                ? 'bg-[#25252e] border-[#444452] text-white'
                : 'bg-[#141418] border-[#23232a] text-[#9696a4] hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
        {visible.map((def) => {
          const unlocked = unlockedSet.has(def.id);
          const current = Math.min(def.target, def.getCurrent(achievements.stats));
          const pct = Math.round((current / Math.max(1, def.target)) * 100);

          return (
            <div
              key={def.id}
              className={`rounded-lg p-4 border flex flex-col justify-between gap-3 transition ${
                unlocked
                  ? 'bg-[#17171d] border-emerald-500/35'
                  : 'bg-[#111115] border-[#222228] opacity-85'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      unlocked
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#18181e] border-[#23232a] text-slate-600'
                    }`}
                  >
                    {unlocked ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">{def.title}</h3>
                    <p className="text-[11px] text-[#9696a4] mt-0.5 leading-snug">{def.description}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${TIER_STYLES[def.tier]}`}>
                  +{def.xp} XP
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#9696a4]">
                  <span>{def.category}</span>
                  <span>
                    {current.toLocaleString()} / {def.target.toLocaleString()} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#0e0e11] overflow-hidden">
                  <div
                    className={`h-full transition-all ${unlocked ? 'bg-emerald-400' : 'bg-[#e4e4e8]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
