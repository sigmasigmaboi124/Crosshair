import React, { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Heart,
  Plus,
  Search,
  Sliders,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { AppStore } from '../store/useAppStore';
import { COMMUNITY_PRESETS, CommunityPresetItem } from '../data/presets';
import { MiniCrosshairCanvas } from './CrosshairPreview';
import { CrosshairConfig } from '../types/crosshair';
import { decodeAnyShareCode, encodeShareCode } from '../engine/shareCodec';

interface CommunityViewProps {
  store: AppStore;
}

type CategoryFilter = 'All' | 'Featured' | 'Favorites' | CrosshairConfig['category'];

export const CommunityView: React.FC<CommunityViewProps> = ({ store }) => {
  const {
    activeConfig,
    favoritePresetIds,
    toggleFavoritePreset,
    userPublishedPresets,
    publishToCommunity,
    applyCommunityPreset,
    setActiveConfig,
    pushToast,
    bumpStat,
  } = store;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [sortBy, setSortBy] = useState<'popular' | 'likes' | 'animated'>('popular');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Publish modal state
  const [pubTitle, setPubTitle] = useState(activeConfig.name);
  const [pubAuthor, setPubAuthor] = useState('Operator');
  const [pubCat, setPubCat] = useState<CrosshairConfig['category']>('Custom');
  const [pubTags, setPubTags] = useState('custom, pro, tactical');
  const [pubDesc, setPubDesc] = useState('Custom reticle crafted in ZeroPoint.');

  // Import modal state
  const [importCode, setImportCode] = useState('');

  const allItems = useMemo<CommunityPresetItem[]>(
    () => [...userPublishedPresets, ...COMMUNITY_PRESETS],
    [userPublishedPresets]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allItems.filter((item) => {
      if (category === 'Featured' && !item.featured && !item.isUserPublished) return false;
      if (category === 'Favorites' && !favoritePresetIds.includes(item.config.id)) return false;
      if (
        category !== 'All' &&
        category !== 'Featured' &&
        category !== 'Favorites' &&
        item.config.category !== category
      ) {
        return false;
      }
      if (!q) return true;
      const hay = `${item.config.name} ${item.config.author} ${item.config.category} ${item.config.tags.join(' ')} ${item.config.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'likes') return b.likes - a.likes;
      if (sortBy === 'animated') {
        const aScore = (a.config.animation.idleType !== 'none' ? 2 : 0) + (a.config.animation.firingEnabled ? 1 : 0);
        const bScore = (b.config.animation.idleType !== 'none' ? 2 : 0) + (b.config.animation.firingEnabled ? 1 : 0);
        return bScore - aScore || b.downloads - a.downloads;
      }
      return b.downloads - a.downloads;
    });
  }, [allItems, search, category, sortBy, favoritePresetIds]);

  const categories: CategoryFilter[] = [
    'All',
    'Featured',
    'Favorites',
    'Tactical',
    'Battle Royale',
    'Sci-Fi',
    'Minimal',
    'Reactive',
    'Accessibility',
    'Custom',
  ];

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    publishToCommunity(
      pubTitle,
      pubAuthor,
      pubCat,
      pubTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      pubDesc
    );
    setShowPublishModal(false);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cfg = decodeAnyShareCode(importCode);
      setActiveConfig(cfg);
      setImportCode('');
      setShowImportModal(false);
      pushToast('Crosshair Imported Live', cfg.name, 'emerald');
    } catch (err) {
      pushToast('Invalid Share Code', err instanceof Error ? err.message : 'Check code format.', 'rose');
    }
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden gap-3.5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#141418] border border-[#23232a] rounded-2xl p-3.5">
        <div>
          <h2 className="text-base font-black text-white tracking-wide flex items-center gap-2">
            <span>Community Workshop & Pro Vault</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#1e1e25] text-[#c4c4cf] border border-[#2f2f39]">
              {allItems.length} DESIGNS
            </span>
          </h2>
          <p className="text-xs text-[#9696a4] mt-0.5">
            Hover any card to preview reactive animations. 1-click apply live to your overlay or clone to customize.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-3 py-2 rounded-xl bg-[#18181e] hover:bg-[#222229] border border-[#2c2c35] text-xs font-semibold text-[#ececf0] flex items-center gap-1.5 cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-[#a1a1ad]" />
            <span>Import Code / Valorant</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPubTitle(activeConfig.name);
              setShowPublishModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Publish Current Design</span>
          </button>
        </div>
      </div>

      {/* Search + Category Pills + Sort */}
      <div className="flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#727280] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by game (Valorant, CS2, Apex, Rust), style (T-shape, dot, hitmarker, RGB)..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#141418] border border-[#23232a] text-xs text-slate-100 placeholder:text-[#727280] focus:outline-none focus:border-white/35"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'popular' | 'likes' | 'animated')}
            className="px-3 py-2 rounded-xl bg-[#141418] border border-[#23232a] text-xs text-[#ececf0] focus:outline-none focus:border-[#525260]"
          >
            <option value="popular">Sort: Most Downloaded</option>
            <option value="likes">Sort: Most Liked</option>
            <option value="animated">Sort: Reactive & Animated First</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition cursor-pointer ${
                category === cat
                  ? 'bg-[#25252e] border-[#444452] text-white'
                  : 'bg-[#141418] border-[#23232a] text-[#9696a4] hover:text-[#ececf0]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="h-56 rounded-2xl border border-dashed border-[#23232a] flex flex-col items-center justify-center text-[#727280] text-xs gap-2">
            <span>No crosshairs matched your current filter.</span>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('All');
              }}
              className="text-[#a1a1ad] hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 pb-4">
            {filtered.map((item) => {
              const cfg = item.config;
              const isFav = favoritePresetIds.includes(cfg.id);
              const isActive = activeConfig.name === cfg.name && activeConfig.lines.color === cfg.lines.color;
              const isAnimated = cfg.animation.idleType !== 'none' || cfg.animation.firingEnabled;

              return (
                <div
                  key={cfg.id}
                  onMouseEnter={() => setHoveredId(cfg.id)}
                  onMouseLeave={() => setHoveredId((prev) => (prev === cfg.id ? null : prev))}
                  className={`rounded-2xl bg-[#141418] border transition-all flex flex-col overflow-hidden group ${
                    isActive
                      ? 'border-white/35'
                      : 'border-[#23232a] hover:border-[#3b3b47]'
                  }`}
                >
                  {/* Visual Preview Stage */}
                  <div className="relative h-32 bg-[#101014] flex items-center justify-center border-b border-[#222228]">
                    <MiniCrosshairCanvas config={cfg} size={112} zoom={1.5} animate={hoveredId === cfg.id} />

                    {/* Top badges */}
                    <div className="absolute top-2 left-2.5 flex items-center gap-1">
                      {item.featured && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-300" /> PRO
                        </span>
                      )}
                      {item.isUserPublished && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                          YOURS
                        </span>
                      )}
                      {isAnimated && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1e1e25] text-[#c4c4cf] border border-[#2f2f39] flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> REACTIVE
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleFavoritePreset(cfg.id)}
                      className="absolute top-2 right-2.5 w-7 h-7 rounded-lg bg-black/45 hover:bg-black/70 border border-white/10 flex items-center justify-center transition cursor-pointer"
                      title="Favorite"
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'text-rose-400 fill-rose-400' : 'text-[#9696a4]'}`} />
                    </button>

                    <span className="absolute bottom-2 right-2.5 text-[10px] font-mono text-[#9696a4] bg-black/45 px-1.5 py-0.5 rounded">
                      {cfg.category}
                    </span>
                  </div>

                  {/* Card Meta */}
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-white truncate">{cfg.name}</h3>
                        <span className="text-[10px] font-mono text-[#727280] shrink-0">by {cfg.author}</span>
                      </div>
                      <p className="text-[11px] text-[#9696a4] mt-1 line-clamp-2 leading-relaxed">
                        {cfg.description}
                      </p>
                      <div className="flex items-center gap-1 flex-wrap mt-2">
                        {cfg.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#18181e] text-[#9696a4] border border-[#23232a]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Stats + Action buttons */}
                    <div className="space-y-2 pt-2 border-t border-[#222228]">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#727280]">
                        <span className="flex items-center gap-1">
                          <Download className="w-3 h-3" /> {(item.downloads / 1000).toFixed(1)}k uses
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" /> {(item.likes / 1000).toFixed(1)}k
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyCommunityPreset(cfg, false)}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            isActive
                              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                              : 'bg-[#f4f4f6] hover:bg-white text-[#0c0c0e]'
                          }`}
                        >
                          {isActive ? <Check className="w-3 h-3" /> : null}
                          <span>{isActive ? 'Active Live' : 'Apply Live'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyCommunityPreset(cfg, true)}
                          className="p-1.5 rounded-lg bg-[#18181e] hover:bg-[#222229] border border-[#2a2a33] text-[#d0d0d8] hover:text-white cursor-pointer"
                          title="Clone & Edit in Designer"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(encodeShareCode(cfg)).catch(() => {});
                            bumpStat((s) => ({ ...s, codesExported: s.codesExported + 1 }));
                            pushToast('Share Code Copied', cfg.name, 'cyan');
                          }}
                          className="p-1.5 rounded-lg bg-[#18181e] hover:bg-[#222229] border border-[#2a2a33] text-[#d0d0d8] hover:text-white cursor-pointer"
                          title="Copy CX1 Share Code"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handlePublish}
            className="w-full max-w-md rounded-2xl bg-[#141418] border border-[#2d2d36] p-5 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#23232a] pb-2.5">
              <h3 className="text-sm font-bold text-white">Publish to Workshop Hub</h3>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="text-[#9696a4] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center py-2 bg-[#0e0e11] rounded-xl border border-[#23232a]">
              <MiniCrosshairCanvas config={activeConfig} size={90} zoom={1.5} animate />
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-[#9696a4]">Title</label>
                <input
                  required
                  value={pubTitle}
                  onChange={(e) => setPubTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#9696a4]">Creator Alias</label>
                  <input
                    required
                    value={pubAuthor}
                    onChange={(e) => setPubAuthor(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#9696a4]">Category</label>
                  <select
                    value={pubCat}
                    onChange={(e) => setPubCat(e.target.value as CrosshairConfig['category'])}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
                  >
                    <option value="Tactical">Tactical</option>
                    <option value="Battle Royale">Battle Royale</option>
                    <option value="Sci-Fi">Sci-Fi</option>
                    <option value="Minimal">Minimal</option>
                    <option value="Reactive">Reactive</option>
                    <option value="Accessibility">Accessibility</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#9696a4]">Tags (comma separated)</label>
                <input
                  value={pubTags}
                  onChange={(e) => setPubTags(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9696a4]">Description</label>
                <textarea
                  rows={2}
                  value={pubDesc}
                  onChange={(e) => setPubDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-[#0e0e11] border border-[#2c2c35] text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-[#202027] text-xs text-[#d0d0d8] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-bold text-xs cursor-pointer"
              >
                Publish Design
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleImportSubmit}
            className="w-full max-w-md rounded-2xl bg-[#141418] border border-[#2d2d36] p-5 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#23232a] pb-2.5">
              <h3 className="text-sm font-bold text-white">Import Share Code or Valorant Profile</h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-[#9696a4] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#9696a4]">
              Supports <span className="font-mono text-[#f4f4f6]">CX1-...</span> share codes AND native Valorant crosshair codes (e.g.{' '}
              <span className="font-mono text-emerald-300">0;P;c;5;h;0;0l;4;0o;2;0a;1;1b;0</span>).
            </p>
            <textarea
              required
              rows={3}
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              placeholder="Paste crosshair code here..."
              className="w-full px-3 py-2 rounded-xl bg-[#0e0e11] border border-[#2c2c35] text-xs font-mono text-[#e4e4e8] focus:outline-none focus:border-[#525260]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-[#202027] text-xs text-[#d0d0d8] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#f4f4f6] hover:bg-white text-[#0c0c0e] font-bold text-xs cursor-pointer"
              >
                Import & Activate
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
