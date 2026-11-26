import React, { useMemo, useState } from 'react';
import { Play, Plus, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { SectionCard, SliderRow, ToggleRow } from './ui/Controls';
import { AudioGameProfile, AudioPresetId } from '../types/crosshair';
import { aimAudio } from '../engine/audioSynth';

interface AudioLimiterViewProps {
  store: AppStore;
}

const PRESET_DEFS: Array<{
  id: Exclude<AudioPresetId, 'custom'>;
  label: string;
  summary: string;
  values: Pick<
    AudioGameProfile,
    | 'ceilingDb'
    | 'thresholdDb'
    | 'ratio'
    | 'footstepLiftDb'
    | 'releaseMs'
    | 'subBassCutDb'
    | 'lowMidGainDb'
    | 'footstepMidGainDb'
    | 'presenceGainDb'
    | 'trebleTameDb'
  >;
}> = [
  {
    id: 'balanced',
    label: 'Balanced',
    summary: '-12 dB cap · +6.5 dB footsteps',
    values: {
      ceilingDb: -12,
      thresholdDb: -20,
      ratio: 8,
      footstepLiftDb: 6.5,
      releaseMs: 80,
      subBassCutDb: -6.5,
      lowMidGainDb: -2.5,
      footstepMidGainDb: 6.5,
      presenceGainDb: 4,
      trebleTameDb: -3.5,
    },
  },
  {
    id: 'max-footsteps',
    label: 'Max footsteps',
    summary: '-13 dB cap · +9.5 dB step crunch',
    values: {
      ceilingDb: -13,
      thresholdDb: -22,
      ratio: 10,
      footstepLiftDb: 9.5,
      releaseMs: 65,
      subBassCutDb: -8.5,
      lowMidGainDb: -3.5,
      footstepMidGainDb: 9,
      presenceGainDb: 5.5,
      trebleTameDb: -4,
    },
  },
  {
    id: 'hearing-shield',
    label: 'Hearing shield',
    summary: '-16 dB strict cap · safe explosions',
    values: {
      ceilingDb: -16,
      thresholdDb: -25,
      ratio: 14,
      footstepLiftDb: 6,
      releaseMs: 95,
      subBassCutDb: -9,
      lowMidGainDb: -2.5,
      footstepMidGainDb: 6,
      presenceGainDb: 3,
      trebleTameDb: -5.5,
    },
  },
  {
    id: 'night',
    label: 'Night mode',
    summary: '-18 dB soft ceiling · smooth release',
    values: {
      ceilingDb: -18,
      thresholdDb: -26,
      ratio: 12,
      footstepLiftDb: 7.5,
      releaseMs: 130,
      subBassCutDb: -10,
      lowMidGainDb: -3,
      footstepMidGainDb: 5.5,
      presenceGainDb: 3,
      trebleTameDb: -6,
    },
  },
];

function dbToPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export const AudioLimiterView: React.FC<AudioLimiterViewProps> = ({ store }) => {
  const {
    audioLimiter,
    setAudioLimiter,
    audioEndpoints,
    runningProcesses,
    audioTelemetry,
    refreshAudioDevices,
    pushToast,
  } = store;

  const [newGameName, setNewGameName] = useState('');
  const [newGameExe, setNewGameExe] = useState('');
  const [previewPlaying, setPreviewPlaying] = useState<'none' | 'protected' | 'raw'>('none');

  const activeProfile = useMemo<AudioGameProfile>(() => {
    return (
      audioLimiter.profiles.find((p) => p.id === audioLimiter.selectedProfileId) ??
      audioLimiter.profiles[0]
    );
  }, [audioLimiter.profiles, audioLimiter.selectedProfileId]);

  const updateProfile = (patch: Partial<AudioGameProfile>, markCustom = false) => {
    setAudioLimiter((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === activeProfile.id
          ? {
              ...p,
              ...patch,
              preset: markCustom ? 'custom' : patch.preset ?? p.preset,
            }
          : p
      ),
    }));
  };

  const applyPreset = (presetId: Exclude<AudioPresetId, 'custom'>) => {
    const def = PRESET_DEFS.find((d) => d.id === presetId);
    if (!def) return;
    updateProfile({ ...def.values, preset: presetId }, false);
    pushToast('Audio preset applied', `${def.label} loaded for ${activeProfile.name}.`, 'emerald');
  };

  const handleAddGameProfile = () => {
    const exeClean = newGameExe.trim() || 'Game.exe';
    const exeWithExt = exeClean.toLowerCase().endsWith('.exe') ? exeClean : `${exeClean}.exe`;
    const titleClean = newGameName.trim() || exeWithExt.replace(/\.exe$/i, '');
    const id = `game-${Date.now()}`;
    const nextProfile: AudioGameProfile = {
      ...PRESET_DEFS[0].values,
      id,
      name: titleClean,
      processNames: [exeWithExt],
      enabled: true,
      preset: 'balanced',
    };
    setAudioLimiter((prev) => ({
      ...prev,
      selectedProfileId: id,
      profiles: [nextProfile, ...prev.profiles],
    }));
    setNewGameName('');
    setNewGameExe('');
    pushToast('Game profile added', `Locked to ${exeWithExt}.`, 'emerald');
  };

  const handleDeleteProfile = (id: string) => {
    if (audioLimiter.profiles.length <= 1) return;
    setAudioLimiter((prev) => {
      const remaining = prev.profiles.filter((p) => p.id !== id);
      return {
        ...prev,
        selectedProfileId: prev.selectedProfileId === id ? remaining[0].id : prev.selectedProfileId,
        profiles: remaining,
      };
    });
  };

  const eqCurvePath = useMemo(() => {
    const width = 460;
    const height = 88;
    const midY = height / 2;
    const points: string[] = [];
    const freqs = [60, 110, 220, 350, 750, 1800, 3400, 5500, 7500, 12000];

    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const logF = Math.log10(60) + t * (Math.log10(12000) - Math.log10(60));
      const f = Math.pow(10, logF);

      const gSub = activeProfile.subBassCutDb * (1 / (1 + Math.pow(f / 135, 2.4)));
      const gMud = activeProfile.lowMidGainDb * Math.exp(-Math.pow(Math.log2(f / 350) / 0.85, 2));
      const gStep = activeProfile.footstepMidGainDb * Math.exp(-Math.pow(Math.log2(f / 1800) / 0.9, 2));
      const gPres = activeProfile.presenceGainDb * Math.exp(-Math.pow(Math.log2(f / 3400) / 0.85, 2));
      const gHigh = activeProfile.trebleTameDb * (1 / (1 + Math.pow(6200 / f, 2.6)));

      const totalDb = Math.max(-14, Math.min(14, gSub + gMud + gStep + gPres + gHigh));
      const x = (t * width).toFixed(1);
      const y = (midY - (totalDb / 14) * (midY - 8)).toFixed(1);
      points.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
    }
    void freqs;
    return points.join(' ');
  }, [activeProfile]);

  const targetExeLabel = activeProfile.processNames[0] || 'ROB RUN.exe';
  const isActivelyProtecting =
    audioLimiter.masterEnabled &&
    (audioTelemetry.status === 'active' || audioTelemetry.status === 'active-silent');

  const statusText = !audioLimiter.masterEnabled
    ? 'Limiter paused'
    : isActivelyProtecting
    ? `Protecting ${audioTelemetry.processName} · PID ${audioTelemetry.pid}`
    : `Waiting for ${targetExeLabel}`;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Top Status & Master Switch */}
      <div className="rounded-lg bg-[#141418] border border-[#222229] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1c1c22] border border-[#2b2b34] flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4 text-[#f4f4f6]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Gunshot limiter & footstep EQ</h2>
            <p className="text-xs text-[#8c8c9a] mt-0.5 max-w-2xl leading-relaxed">
              Caps loud gunshots and explosions while lifting quiet footsteps for <span className="font-mono text-[#e4e4e8]">{targetExeLabel}</span> only. Discord, music, and browser audio stay untouched.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap self-start lg:self-center shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#b4b4c0]">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                !audioLimiter.masterEnabled
                  ? 'bg-[#5c5c68]'
                  : isActivelyProtecting
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
              }`}
            />
            <span>{statusText}</span>
          </div>

          <button
            type="button"
            onClick={() =>
              setAudioLimiter((s) => ({ ...s, masterEnabled: !s.masterEnabled }))
            }
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              audioLimiter.masterEnabled
                ? 'bg-[#f4f4f6] hover:bg-white text-[#0c0c0e]'
                : 'bg-[#1c1c22] hover:bg-[#25252d] border border-[#2f2f39] text-[#d0d0d8]'
            }`}
          >
            {audioLimiter.masterEnabled ? 'Limiter on' : 'Turn on limiter'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Process Selection + Live Meters & Sound Check */}
        <div className="lg:col-span-5 space-y-4">
          <SectionCard
            title="Target game process"
            subtitle="Applies only to the selected executable"
            rightSlot={
              <button
                type="button"
                onClick={() => refreshAudioDevices()}
                className="p-1.5 rounded-md bg-[#18181e] hover:bg-[#222229] border border-[#2a2a33] text-[#a1a1ad] hover:text-white cursor-pointer"
                title="Refresh running processes"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            }
          >
            <ToggleRow
              label="Strict single-process lock"
              description={`Only engage when ${targetExeLabel} is running. Uncheck to auto-switch across all games below.`}
              checked={audioLimiter.lockToSelectedProcess}
              accent="emerald"
              onChange={(v) => setAudioLimiter((s) => ({ ...s, lockToSelectedProcess: v }))}
            />

            <div className="pt-2 border-t border-[#1f1f26] space-y-1.5">
              {audioLimiter.profiles.map((prof) => {
                const selected = prof.id === activeProfile.id;
                const procLabel = prof.processNames[0] || '';
                return (
                  <div
                    key={prof.id}
                    onClick={() => setAudioLimiter((s) => ({ ...s, selectedProfileId: prof.id }))}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition cursor-pointer ${
                      selected
                        ? 'bg-[#1d1d24] border-[#3d3d4a] text-white'
                        : 'bg-[#101013] border-[#202027] text-[#a1a1ad] hover:border-[#2e2e38]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{prof.name}</div>
                      <div className="text-[11px] font-mono text-[#787886] truncate">{procLabel}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums text-[#b4b4c0]">
                        {prof.ceilingDb} dB
                      </span>
                      {audioLimiter.profiles.length > 1 && prof.id !== 'robrun' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProfile(prof.id);
                          }}
                          className="p-1 rounded text-[#6f6f7d] hover:text-rose-300 cursor-pointer"
                          title="Remove game profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Edit active process exe + Add new game */}
            <div className="pt-2.5 border-t border-[#1f1f26] space-y-2.5">
              <div className="space-y-1">
                <label className="text-[11px] text-[#8c8c9a] block">
                  Executable name for {activeProfile.name}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={activeProfile.processNames.join(', ')}
                    onChange={(e) =>
                      updateProfile({
                        processNames: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="ROB RUN.exe"
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono text-[#f4f4f6] focus:outline-none focus:border-[#4b4b59]"
                  />
                  {runningProcesses.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          updateProfile({ processNames: [e.target.value] });
                        }
                      }}
                      className="w-32 px-2 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-[11px] text-[#b4b4c0]"
                    >
                      <option value="">Pick running...</option>
                      {runningProcesses.map((proc) => (
                        <option key={proc} value={proc}>
                          {proc}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  placeholder="Game title"
                  className="w-full sm:w-28 min-w-0 px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-white focus:outline-none focus:border-[#4b4b59]"
                />
                <input
                  type="text"
                  value={newGameExe}
                  onChange={(e) => setNewGameExe(e.target.value)}
                  placeholder="Process.exe"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs font-mono text-white focus:outline-none focus:border-[#4b4b59]"
                />
                <button
                  type="button"
                  onClick={handleAddGameProfile}
                  className="px-2.5 py-1.5 rounded-md bg-[#1c1c22] hover:bg-[#26262f] border border-[#2e2e38] text-xs font-medium text-[#f4f4f6] flex items-center gap-1 whitespace-nowrap cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Sound check & live meters"
            subtitle="Preview footsteps and gunshots"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewPlaying('protected');
                  aimAudio.playLimiterSoundCheck(activeProfile, false, () => setPreviewPlaying('none'));
                }}
                className="px-3 py-2 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] text-xs font-semibold whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span>{previewPlaying === 'protected' ? 'Playing protected...' : 'Test limiter & EQ'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreviewPlaying('raw');
                  aimAudio.playLimiterSoundCheck(activeProfile, true, () => setPreviewPlaying('none'));
                }}
                className="px-3 py-2 rounded-lg bg-[#18181e] hover:bg-[#22222a] border border-[#2c2c35] text-[#e4e4e8] text-xs font-medium whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[#9898a6] shrink-0" />
                <span>{previewPlaying === 'raw' ? 'Playing raw...' : 'Compare raw audio'}</span>
              </button>
            </div>

            <div className="pt-3 border-t border-[#1f1f26] space-y-2.5">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#8c8c9a]">Game input peak</span>
                  <span className="font-mono tabular-nums text-[#d0d0d8]">
                    {audioTelemetry.inputDb.toFixed(1)} dB
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0e0e11] overflow-hidden">
                  <div
                    className="h-full bg-[#a1a1ad] transition-all duration-75"
                    style={{ width: `${dbToPercent(audioTelemetry.inputDb)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#8c8c9a]">Protected output (ceiling {activeProfile.ceilingDb} dB)</span>
                  <span className="font-mono tabular-nums text-[#f4f4f6]">
                    {audioTelemetry.outputDb.toFixed(1)} dB
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0e0e11] overflow-hidden relative">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-75"
                    style={{ width: `${dbToPercent(audioTelemetry.outputDb)}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-[#ff5526]"
                    style={{ left: `${dbToPercent(activeProfile.ceilingDb)}%` }}
                    title={`Ceiling ${activeProfile.ceilingDb} dB`}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#8c8c9a]">Gunshot blast absorbed</span>
                  <span className="font-mono tabular-nums text-[#ff8e6e]">
                    -{audioTelemetry.gainReductionDb.toFixed(1)} dB
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0e0e11] overflow-hidden">
                  <div
                    className="h-full bg-[#ff5526] transition-all duration-75"
                    style={{ width: `${Math.min(100, (audioTelemetry.gainReductionDb / 24) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-[#787886]">
                <span>Loud blasts capped this session</span>
                <span className="font-mono tabular-nums text-[#e4e4e8]">
                  {audioTelemetry.peakProtectedCount}
                </span>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right Column: One-Click Presets, Limiter Sliders & Footstep EQ */}
        <div className="lg:col-span-7 space-y-4">
          <SectionCard
            title={`Quick presets · ${activeProfile.name}`}
            subtitle="Ready-made hearing cap and footstep curves"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_DEFS.map((p) => {
                const selected = activeProfile.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      selected
                        ? 'bg-[#202028] border-[#484857] text-white'
                        : 'bg-[#101013] border-[#222229] text-[#b4b4c0] hover:border-[#343440]'
                    }`}
                  >
                    <div className="text-xs font-semibold">{p.label}</div>
                    <div className="text-[10px] font-mono tabular-nums text-[#7c7c8a] mt-0.5 leading-snug">
                      {p.summary}
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Hearing protection & footstep boost"
            subtitle="Caps loud gunfire and lifts quiet movement"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <SliderRow
                  label="Gunshot ceiling"
                  value={activeProfile.ceilingDb}
                  min={-28}
                  max={-3}
                  step={0.5}
                  unit=" dB"
                  onChange={(v) => updateProfile({ ceilingDb: v }, true)}
                />
                <p className="text-[11px] text-[#727280]">
                  Hard safety cap. Gunshots and grenades never exceed this level.
                </p>
              </div>

              <div className="space-y-1">
                <SliderRow
                  label="Footstep & reload lift"
                  value={activeProfile.footstepLiftDb}
                  min={0}
                  max={12}
                  step={0.5}
                  unit=" dB"
                  onChange={(v) => updateProfile({ footstepLiftDb: v }, true)}
                />
                <p className="text-[11px] text-[#727280]">
                  Brings up quiet movement cues without amplifying empty silence.
                </p>
              </div>

              <SliderRow
                label="Compression threshold"
                value={activeProfile.thresholdDb}
                min={-36}
                max={-8}
                step={0.5}
                unit=" dB"
                onChange={(v) => updateProfile({ thresholdDb: v }, true)}
              />

              <SliderRow
                label="Recovery after gunshot"
                value={activeProfile.releaseMs}
                min={30}
                max={250}
                step={5}
                unit=" ms"
                onChange={(v) => updateProfile({ releaseMs: v }, true)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="5-band footstep equalizer"
            subtitle="Trims low rumble and boosts midrange step clarity"
          >
            {/* Clean Neutral Frequency Curve */}
            <div className="rounded-lg bg-[#0e0e11] border border-[#222229] px-3 pt-2.5 pb-2">
              <svg viewBox="0 0 460 88" className="w-full h-20 overflow-visible">
                <line x1="0" y1="44" x2="460" y2="44" stroke="#26262f" strokeDasharray="3 3" strokeWidth="1" />
                <path d={eqCurvePath} fill="none" stroke="#f4f4f6" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="flex justify-between gap-1 text-[10px] font-mono tabular-nums text-[#6e6e7c] pt-1">
                <span className="whitespace-nowrap">110 Hz</span>
                <span className="whitespace-nowrap">350 Hz</span>
                <span className="whitespace-nowrap">1.8 kHz</span>
                <span className="whitespace-nowrap">3.4 kHz</span>
                <span className="whitespace-nowrap">7.5 kHz</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5 pt-1">
              <SliderRow
                label="Explosion rumble (110 Hz)"
                value={activeProfile.subBassCutDb}
                min={-12}
                max={6}
                step={0.5}
                unit=" dB"
                onChange={(v) => updateProfile({ subBassCutDb: v }, true)}
              />
              <SliderRow
                label="Boxy mud cut (350 Hz)"
                value={activeProfile.lowMidGainDb}
                min={-12}
                max={6}
                step={0.5}
                unit=" dB"
                onChange={(v) => updateProfile({ lowMidGainDb: v }, true)}
              />
              <SliderRow
                label="Footstep crunch (1.8 kHz)"
                value={activeProfile.footstepMidGainDb}
                min={0}
                max={12}
                step={0.5}
                unit=" dB"
                onChange={(v) => updateProfile({ footstepMidGainDb: v }, true)}
              />
              <SliderRow
                label="Cloth & reload (3.4 kHz)"
                value={activeProfile.presenceGainDb}
                min={-6}
                max={12}
                step={0.5}
                unit=" dB"
                onChange={(v) => updateProfile({ presenceGainDb: v }, true)}
              />
              <SliderRow
                label="Crack tamer (7.5 kHz)"
                value={activeProfile.trebleTameDb}
                min={-12}
                max={6}
                step={0.5}
                unit=" dB"
                onChange={(v) => updateProfile({ trebleTameDb: v }, true)}
              />
            </div>

            <div className="pt-3 border-t border-[#1f1f26] space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[#e4e4e8]">Audio processing mode</div>
                  <div className="text-[11px] text-[#787886]">
                    Direct session mode works immediately with zero routing. EQ router runs full 5-band biquad filtering into a separate headphone output.
                  </div>
                </div>
                <div className="flex rounded-lg bg-[#0e0e11] border border-[#25252e] p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAudioLimiter((s) => ({ ...s, routingMode: 'direct-session' }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      audioLimiter.routingMode === 'direct-session'
                        ? 'bg-[#25252f] text-white'
                        : 'text-[#8c8c9a] hover:text-white'
                    }`}
                  >
                    Direct session
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioLimiter((s) => ({ ...s, routingMode: 'loopback-eq' }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      audioLimiter.routingMode === 'loopback-eq'
                        ? 'bg-[#25252f] text-white'
                        : 'text-[#8c8c9a] hover:text-white'
                    }`}
                  >
                    Full EQ router
                  </button>
                </div>
              </div>

              {audioLimiter.routingMode === 'loopback-eq' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-[#a1a1ad]">Headphone output device</span>
                  <select
                    value={audioLimiter.outputDeviceId}
                    onChange={(e) => setAudioLimiter((s) => ({ ...s, outputDeviceId: e.target.value }))}
                    className="px-2.5 py-1.5 rounded-md bg-[#0e0e11] border border-[#27272f] text-xs text-[#f4f4f6] max-w-xs"
                  >
                    <option value="">Select output headphones...</option>
                    {audioEndpoints.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} {dev.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
