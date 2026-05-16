import { AnimatePresence, motion } from "framer-motion";
import BattleLoadingPage from "./BattleLoadingPage";
import {
  bottomActions,
  currencyIcon as Coins,
  leftNav,
  lobbyContent,
  player,
  quickStats,
  rightNav,
  squadCards,
  topActions,
  type LobbyContentKey,
  type NavAction,
} from "../data/lobbyMock";
import {
  ArrowLeft,
  BatteryCharging,
  ChevronRight,
  Cpu,
  RadioTower,
  Shield,
  Swords,
  Trophy,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pokedexPreviewCards, pokedexTotalCount } from "../data/pokedexMock";
import {
  calculateDamage,
  getBattleEnabledPokemon,
  getPokemonById,
  getPokemonSkills,
} from "../utils/battleCalculator";
import type {
  BattleCardState,
  BattleParticipant,
  BattleSide,
  BattleTurnState,
  DraftPickSide,
  PokemonStats,
  Skill,
} from "../types/battle";

type CurrentPage = "lobby" | "pokedex" | "ranked" | "normalBattle";
type NormalBattlePhase = "normalBattleRoom" | "draftSelection" | "battleLoading" | "battleArena" | "battleResult";

interface BattleParticipants {
  player: BattleParticipant;
  computer: BattleParticipant;
}

const REQUIRED_TEAM_SIZE = 3;
const DRAFT_SECONDS = 60;
const CPU_PICK_PREVIEW_SECONDS = 58;
const CPU_PICK_LOCK_SECONDS = 56;
const BATTLE_READY_SECONDS = 10;
const BATTLE_LOADING_DELAY_MS = 2000;
const TURN_SECONDS = 20;

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

function isLobbyContentKey(value: string): value is LobbyContentKey {
  return value in lobbyContent;
}

function getPokemonLabel(pokemon: PokemonStats) {
  return pokemon.name_zh || pokemon.name;
}

function getPokemonImage(pokemon: PokemonStats) {
  return pokedexPreviewCards.find((card) => card.id === pokemon.id)?.imagePath ?? pokemon.reference_image;
}

function getTypeLabel(type: PokemonStats["types"][number]) {
  const labels: Record<PokemonStats["types"][number], string> = {
    Normal: "一般",
    Electric: "電",
    Fire: "火",
    Water: "水",
    Grass: "草",
    Poison: "毒",
    Ghost: "幽靈",
    Fighting: "格鬥",
    Steel: "鋼",
    Dragon: "龍",
    Flying: "飛行",
    Psychic: "超能力",
    Fairy: "妖精",
    Rock: "岩石",
    Ground: "地面",
    Ice: "冰",
  };

  return labels[type] ?? type;
}

function createBattleCard(pokemon: PokemonStats): BattleCardState {
  return { pokemon, currentHp: pokemon.max_hp };
}

function shufflePokemon(items: PokemonStats[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function getLivingIndex(team: BattleCardState[], preferredIndex = 0) {
  if (team[preferredIndex]?.currentHp > 0) return preferredIndex;
  return team.findIndex((card) => card.currentHp > 0);
}

function isTeamDefeated(team: BattleCardState[]) {
  return team.every((card) => card.currentHp <= 0);
}

function getSideLabel(side: BattleSide) {
  return side === "player" ? "玩家" : "電腦";
}

function getHpBarClass(hpPercent: number) {
  if (hpPercent < 30) return "bg-gradient-to-r from-red-500 to-rose-500";
  if (hpPercent <= 50) return "bg-gradient-to-r from-yellow-300 to-amber-400";
  return "bg-gradient-to-r from-emerald-300 to-cyan-300";
}

const battleUiText = {
  active: "\u51fa\u6230\u4e2d",
  shielded: "\u8b77\u76fe\u4e2d",
  defeated: "\u5df2\u5012\u4e0b",
  attack: "\u653b\u64ca",
  defense: "\u9632\u79a6",
  speed: "\u901f\u5ea6",
  turnSuffix: "\u56de\u5408",
  playerShieldReady: "\u73a9\u5bb6\u8b77\u76fe\u5f85\u547d",
  standby: "\u5f85\u547d",
  replaceable: "\u53ef\u66ff\u63db",
  computerActing: "\u96fb\u8166\u884c\u52d5\u4e2d",
  processing: "\u8655\u7406\u4e2d",
  waitingPlayer: "\u7b49\u5f85\u73a9\u5bb6\u64cd\u4f5c",
  statusSkill: "\u72c0\u614b\u6280\u80fd",
  power: "\u5a01\u529b",
  accuracy: "\u547d\u4e2d",
  skillFallback: "\u4f9d\u76ee\u524d\u89d2\u8272\u8cc7\u6599\u52d5\u614b\u7522\u751f\u7684\u6280\u80fd\u3002",
  shield: "\u8b77\u76fe",
  shieldReduction: "\u672c\u56de\u5408\u6e1b\u50b7 50%",
  switchCard: "\u66f4\u63db\u5361\u7247",
  switchHint: "\u5f9e\u5de6\u5074\u5099\u9078\u66ff\u63db",
  title: "1v1 \u56de\u5408\u5c0d\u6230",
  back: "\u8fd4\u56de\u5927\u5ef3",
  playerBench: "\u6211\u65b9\u5099\u9078",
  enemyBench: "\u6575\u65b9\u5099\u9078",
  switchPrompt: "\u8acb\u5f9e\u5de6\u5074\u6211\u65b9\u5099\u9078\u9078\u64c7\u53ef\u66ff\u63db\u7684\u5361\u7247\u3002",
};

function NavButton({
  action,
  active,
  onClick,
  compact = false,
}: {
  action: NavAction;
  active: boolean;
  onClick: (id: LobbyContentKey) => void;
  compact?: boolean;
}) {
  const Icon = action.icon;

  return (
    <motion.button
      type="button"
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => isLobbyContentKey(action.id) && onClick(action.id)}
      className={[
        "group relative flex items-center gap-3 rounded-2xl border px-3 text-left transition",
        compact ? "min-h-12 justify-center" : "min-h-[72px]",
        active
          ? "border-cyan-300/50 bg-cyan-300/10 shadow-glow"
          : "border-slate-700/70 bg-slate-950/45 hover:border-slate-500/80 hover:bg-slate-900/80",
      ].join(" ")}
    >
      <span className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 ring-1 ring-white/10", action.accent].join(" ")}>
        <Icon size={19} strokeWidth={2.4} />
      </span>
      <span className={compact ? "text-base font-black" : "text-sm font-black"}>{action.label}</span>
      {active && <span className="absolute inset-y-3 right-2 w-1 rounded-full bg-cyan-300" />}
    </motion.button>
  );
}

function SideRail({
  items,
  activePanel,
  onSelect,
  side,
}: {
  items: NavAction[];
  activePanel: LobbyContentKey;
  onSelect: (id: LobbyContentKey) => void;
  side: "left" | "right";
}) {
  return (
    <aside className={["glass-panel hidden min-h-0 flex-col gap-3 rounded-[28px] p-3 xl:row-start-2 xl:flex", side === "left" ? "xl:col-start-1" : "xl:col-start-3"].join(" ")}>
      {items.map((item) => (
        <NavButton key={item.id} action={item} active={activePanel === item.id} onClick={onSelect} />
      ))}
    </aside>
  );
}

function TopBar({ activePanel, onSelect }: { activePanel: LobbyContentKey; onSelect: (id: LobbyContentKey) => void }) {
  return (
    <header className="glass-panel col-span-full flex h-[76px] items-center gap-3 rounded-[24px] px-4 py-2">
      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        onClick={() => onSelect("dex")}
        className="flex min-w-60 items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-2.5 text-left"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-600 text-lg font-black text-slate-950">
          {player.avatarInitial}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-400">Trainer</p>
          <p className="text-base font-black text-white">{player.name}</p>
          <p className="text-xs font-semibold text-cyan-200">{player.rank}</p>
        </div>
      </motion.button>

      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/45 px-4">
          <BatteryCharging className="text-emerald-300" size={20} />
          <span className="text-sm font-bold text-slate-400">體力</span>
          <strong className="text-base text-white">
            {player.stamina}/{player.maxStamina}
          </strong>
        </div>
        <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/45 px-4">
          <Coins className="text-amber-300" size={20} />
          <span className="text-sm font-bold text-slate-400">金幣</span>
          <strong className="text-base text-white">{formatNumber(player.coins)}</strong>
        </div>
      </div>

      <div className="ml-auto flex gap-3">
        {topActions.map((item) => (
          <NavButton key={item.id} action={item} compact active={activePanel === item.id} onClick={onSelect} />
        ))}
      </div>
    </header>
  );
}

function HeroPanel({ activePanel }: { activePanel: LobbyContentKey }) {
  const content = lobbyContent[activePanel];
  const Icon = content.icon;

  return (
    <main className="min-h-0 min-w-0 xl:col-start-2 xl:row-start-2">
      <section className="glass-panel relative h-full min-h-0 overflow-hidden rounded-[30px] p-5">
        <div className="arena-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-rose-500/16 blur-3xl" />
        <div className="relative z-10 grid h-full min-h-0 gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-h-0 flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div key={activePanel} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.28 }} className="max-w-3xl">
                <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100">
                  <RadioTower size={16} />
                  LOBBY ONLINE
                </div>
                <h1 className="mt-4 max-w-[9em] text-balance text-5xl font-black leading-[0.95] tracking-tight text-white 2xl:text-6xl">{content.title}</h1>
                <p className="mt-4 max-w-2xl text-lg font-semibold leading-7 text-slate-300 2xl:text-xl">{content.subtitle}</p>
                <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-slate-600/70 bg-slate-950/50 px-3 py-2.5">
                  <Icon className="text-cyan-300" size={22} />
                  <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{content.status}</span>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="grid gap-3 md:grid-cols-3">
              {quickStats.map((stat) => {
                const StatIcon = stat.icon;
                return (
                  <motion.div key={stat.label} whileHover={{ y: -3 }} className="rounded-3xl border border-slate-700/70 bg-slate-950/50 p-4">
                    <div className={["mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800", stat.accent].join(" ")}>
                      <StatIcon size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-400">{stat.label}</p>
                    <p className="mt-1 text-2xl font-black text-white">{stat.value}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
          {activePanel === "dex" ? <PokedexPreview /> : <SquadPreview />}
        </div>
      </section>
    </main>
  );
}

function PokedexPreview() {
  return (
    <aside className="flex min-h-0 flex-col gap-3">
      <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-glow">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100">Pokedex Cards</p>
          <span className="rounded-full border border-cyan-300/20 bg-slate-950/50 px-3 py-1 text-[11px] font-black text-cyan-100">
            16 / {pokedexTotalCount}
          </span>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">展示目前可用的寶可夢圖鑑資料。</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        {pokedexPreviewCards.slice(0, 6).map((pokemon, index) => (
          <motion.article
            key={`${pokemon.id}-${pokemon.filename}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.025 }}
            whileHover={{ y: -2, scale: 1.015 }}
            className="group relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/55 p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]"
          >
            <div className="relative grid h-full grid-rows-[minmax(0,1fr)_auto] gap-1 rounded-xl border border-slate-700/70 bg-slate-900/80 p-2">
              <div className="grid min-h-0 place-items-center rounded-lg bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.20),rgba(15,23,42,0.15)_58%,rgba(2,6,23,0.32))]">
                <img src={pokemon.imagePath} alt={pokemon.name} className="max-h-14 max-w-full object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]" loading="lazy" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-black text-white">{pokemon.name}</span>
                <span className="shrink-0 rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">#{pokemon.id.toString().padStart(3, "0")}</span>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </aside>
  );
}

function SquadPreview() {
  return (
    <aside className="flex min-h-0 flex-col gap-3">
      <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-glow">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100">Active Squad</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">Mock data 隊伍展示，實戰隊伍由一般模式輪抽產生。</p>
      </div>
      {squadCards.map((card, index) => (
        <motion.article key={card.name} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }} className={["rounded-3xl border border-slate-700/70 bg-gradient-to-br p-4", card.accent].join(" ")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-white">{card.name}</h2>
              <p className="mt-1 text-xs font-bold text-slate-300">{card.role}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs font-black text-slate-200">{card.type}</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-900">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${card.power}%` }} />
          </div>
        </motion.article>
      ))}
    </aside>
  );
}

function BattleModeSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (page: Extract<CurrentPage, "ranked" | "normalBattle">) => void;
}) {
  const modes: Array<{ id: Extract<CurrentPage, "ranked" | "normalBattle">; label: string; description: string; icon: LucideIcon; accent: string }> = [
    { id: "ranked", label: "天梯賽", description: "進入排名競技入口，目前顯示敬請期待。", icon: Trophy, accent: "text-amber-200" },
    { id: "normalBattle", label: "一般模式", description: "建立輕量對戰房間入口，可新增電腦或邀請好友。", icon: Swords, accent: "text-cyan-200" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/72 px-3 pb-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.section
            role="dialog"
            aria-modal="true"
            initial={{ y: 80, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="glass-panel relative w-full max-w-3xl overflow-hidden rounded-[28px] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="arena-grid pointer-events-none absolute inset-0 opacity-35" />
            <div className="relative z-10">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Battle Mode</p>
                  <h2 className="mt-1 text-3xl font-black text-white">選擇對戰模式</h2>
                </div>
                <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-700/80 bg-slate-950/60 text-slate-200 transition hover:border-cyan-300/45">
                  <X size={20} />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {modes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <motion.button key={mode.id} type="button" whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => onSelect(mode.id)} className="group relative min-h-36 overflow-hidden rounded-[24px] border border-slate-700/80 bg-slate-950/60 p-5 text-left transition hover:border-cyan-300/45">
                      <div className="flex items-start justify-between gap-4">
                        <span className={["grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-slate-800/80", mode.accent].join(" ")}>
                          <Icon size={24} />
                        </span>
                        <ChevronRight className="mt-2 text-slate-500 transition group-hover:text-cyan-200" size={24} />
                      </div>
                      <h3 className="mt-5 text-2xl font-black text-white">{mode.label}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{mode.description}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function LobbyPage() {
  const [activePanel, setActivePanel] = useState<LobbyContentKey>("dex");
  const [currentPage, setCurrentPage] = useState<CurrentPage>("lobby");
  const [isBattleModeSheetOpen, setIsBattleModeSheetOpen] = useState(false);
  const mobileNav = useMemo(() => [...leftNav, ...rightNav], []);

  const handleSelectPanel = (panel: LobbyContentKey) => {
    setIsBattleModeSheetOpen(false);
    setActivePanel(panel);
    if (panel === "dex") setCurrentPage("pokedex");
  };

  const handleBackToLobby = () => {
    setCurrentPage("lobby");
    setIsBattleModeSheetOpen(false);
  };

  if (currentPage === "pokedex") return <PokedexPage onBack={handleBackToLobby} />;
  if (currentPage === "ranked") return <RankedBattlePage onBack={handleBackToLobby} />;
  if (currentPage === "normalBattle") return <NormalBattlePage onBack={handleBackToLobby} />;

  return (
    <div className="h-screen overflow-hidden px-3 py-3 text-slate-100">
      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[210px_minmax(0,1fr)_210px] xl:grid-rows-[76px_minmax(0,1fr)_86px]">
        <TopBar activePanel={activePanel} onSelect={handleSelectPanel} />
        <SideRail items={leftNav} activePanel={activePanel} onSelect={handleSelectPanel} side="left" />
        <HeroPanel activePanel={activePanel} />
        <SideRail items={rightNav} activePanel={activePanel} onSelect={handleSelectPanel} side="right" />
        <footer className="glass-panel col-span-full flex items-center justify-between rounded-[24px] px-4 py-3">
          <div className="flex items-center gap-3 xl:hidden">
            {mobileNav.map((item) => (
              <NavButton key={item.id} action={item} compact active={activePanel === item.id} onClick={handleSelectPanel} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => setIsBattleModeSheetOpen(true)} className="flex min-h-14 items-center gap-2 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100">
              <Swords size={18} />
              對戰模式
            </button>
            <button type="button" onClick={() => setCurrentPage("ranked")} className="flex min-h-14 items-center gap-2 rounded-2xl border border-amber-300/35 bg-amber-300/10 px-5 text-sm font-black text-amber-100">
              <UserPlus size={18} />
              排位賽
            </button>
            <Cpu className="text-slate-500" size={22} />
          </div>
        </footer>
      </div>
      <BattleModeSheet open={isBattleModeSheetOpen} onClose={() => setIsBattleModeSheetOpen(false)} onSelect={(page) => setCurrentPage(page)} />
    </div>
  );
}

function BattlePageShell({
  eyebrow,
  title,
  subtitle,
  onBack,
  children,
  fixedViewport = false,
  frameless = false,
  prominentEyebrow = false,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  children: ReactNode;
  fixedViewport?: boolean;
  frameless?: boolean;
  prominentEyebrow?: boolean;
}) {
  return (
    <div className={frameless ? "h-screen overflow-hidden bg-slate-950 text-slate-100" : "h-screen overflow-hidden px-3 py-3 text-slate-100"}>
      <section className={frameless ? "relative flex h-full min-h-0 flex-col overflow-hidden p-4" : "glass-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] p-4"}>
        <div className="arena-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <header className={prominentEyebrow ? "mb-0 flex h-[84px] shrink-0 items-start justify-between gap-4 pt-4" : "mb-0 flex h-[112px] shrink-0 items-end justify-between gap-4 pb-2"}>
            <button type="button" onClick={onBack} className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
              <ArrowLeft size={18} />
              返回
            </button>
            <div className="text-center">
              <p className={prominentEyebrow ? "text-lg font-black uppercase tracking-[0.36em] text-cyan-100 drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]" : "text-xs font-black uppercase tracking-[0.32em] text-cyan-200"}>{eyebrow}</p>
              {title && <h1 className="mt-1 text-3xl font-black text-white">{title}</h1>}
              {subtitle && <p className="mt-2 text-3xl font-black text-white">{subtitle}</p>}
            </div>
            <div className="w-24" />
          </header>
          <div className={fixedViewport ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto"}>{children}</div>
        </div>
      </section>
    </div>
  );
}

function RankedBattlePage({ onBack }: { onBack: () => void }) {
  return (
    <BattlePageShell eyebrow="Ranked Battle" title="排位賽" onBack={onBack}>
      <div className="grid h-full place-items-center">
        <div className="w-full max-w-2xl rounded-[28px] border border-amber-300/25 bg-slate-950/55 p-10 text-center shadow-glow">
          <Trophy className="mx-auto text-amber-300" size={52} />
          <p className="mt-6 text-4xl font-black text-white">敬請期待</p>
          <p className="mt-4 text-base font-semibold leading-7 text-slate-400">排位賽目前尚未開放。</p>
        </div>
      </div>
    </BattlePageShell>
  );
}

function DraftRosterColumn({
  title,
  side,
  pokemonList,
  pendingPokemon,
}: {
  title: string;
  side: DraftPickSide;
  pokemonList: PokemonStats[];
  pendingPokemon?: PokemonStats;
}) {
  const filledCount = pokemonList.length + (pendingPokemon ? 1 : 0);

  return (
    <section className="relative z-20 h-full min-h-0 overflow-hidden rounded-[26px] border border-slate-600/80 bg-slate-950/85 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="mb-3 flex h-12 shrink-0 items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {filledCount}/{REQUIRED_TEAM_SIZE} {filledCount === pokemonList.length ? "已鎖定" : "已選定"}
          </p>
        </div>
        <span className={["rounded-full border px-3 py-1 text-[11px] font-black", side === "player" ? "border-[#0000CE]/70 bg-[#0000CE]/20 text-blue-100" : "border-[#CE0000]/70 bg-[#CE0000]/20 text-red-100"].join(" ")}>
          {side === "player" ? "PLAYER" : "CPU"}
        </span>
      </div>
      <div className="h-[calc(100%-60px)] min-h-0 flex flex-col gap-3 overflow-hidden">
        {Array.from({ length: REQUIRED_TEAM_SIZE }).map((_, slotIndex) => {
          const lockedPokemon = pokemonList[slotIndex];
          const isPendingSlot = !lockedPokemon && pendingPokemon && slotIndex === pokemonList.length;
          const pokemon = lockedPokemon ?? (isPendingSlot ? pendingPokemon : undefined);
          return (
            <article
              key={pokemon?.id ?? `${side}-empty-${slotIndex}`}
              className={[
                "relative flex-1 min-h-0 overflow-hidden rounded-2xl border p-2.5",
                pokemon
                  ? side === "player"
                    ? "border-cyan-300/55 bg-slate-950/80"
                    : "border-rose-400/55 bg-slate-950/80"
                  : side === "player"
                    ? "border-dashed border-cyan-300/30 bg-slate-950/72"
                    : "border-dashed border-rose-500/35 bg-slate-950/72",
              ].join(" ")}
            >
              {pokemon ? (
                <div className="grid h-full min-h-0 grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
                  <span className={["absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-black", isPendingSlot ? "bg-cyan-300 text-slate-950" : "bg-slate-950/80 text-slate-300"].join(" ")}>
                    {isPendingSlot ? "已選定" : "已鎖定"}
                  </span>
                  <div className="grid aspect-square h-full max-h-28 place-items-center rounded-[18px] border border-white/10 bg-slate-950/70 p-2">
                    <img src={getPokemonImage(pokemon)} alt={getPokemonLabel(pokemon)} className="h-full w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-white">{getPokemonLabel(pokemon)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">#{pokemon.id.toString().padStart(3, "0")}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pokemon.types.map((type) => (
                        <span key={type} className="rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-black text-slate-300">{getTypeLabel(type)}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-400">HP {pokemon.max_hp}</p>
                  </div>
                </div>
              ) : (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <p className="text-3xl font-black text-slate-500">0{slotIndex + 1}</p>
                    <p className="mt-1 text-xs font-black text-slate-400">等待鎖定</p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TeamStatusBar({ label, participant }: { label: string; participant: BattleParticipant }) {
  const activeCard = participant.team[participant.activeIndex];
  const aliveCount = participant.team.filter((card) => card.currentHp > 0).length;
  const hpPercent = activeCard ? Math.max(0, (activeCard.currentHp / activeCard.pokemon.max_hp) * 100) : 0;

  return (
    <div className="rounded-[24px] border border-slate-700/80 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-white">{activeCard ? getPokemonLabel(activeCard.pokemon) : "無出戰卡"}</p>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">{aliveCount}/{participant.team.length}</span>
      </div>
      {activeCard && (
        <>
          <div className="mt-4 flex items-center justify-between text-xs font-black text-slate-400">
            <span>HP</span>
            <span>{activeCard.currentHp}/{activeCard.pokemon.max_hp}</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-300" style={{ width: `${hpPercent}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

function ActiveBattleCard({
  card,
  side,
  shielded = false,
}: {
  card: BattleCardState;
  side: BattleSide;
  shielded?: boolean;
}) {
  const defeated = card.currentHp <= 0;
  const hpPercent = Math.max(0, (card.currentHp / card.pokemon.max_hp) * 100);
  const imageSrc = getPokemonImage(card.pokemon);
  const sideLabel = side === "player" ? getSideLabel("player") : getSideLabel("computer");
  const accentClass =
    side === "player"
      ? "border-cyan-300/80 bg-cyan-300/10 shadow-[0_0_34px_rgba(34,211,238,0.28)]"
      : "border-fuchsia-400/70 bg-rose-500/10 shadow-[0_0_34px_rgba(217,70,239,0.22)]";
  const imageTone =
    side === "player"
      ? "bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.22),rgba(15,23,42,0.34)_56%,rgba(2,6,23,0.72))]"
      : "bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.20),rgba(30,41,59,0.34)_56%,rgba(2,6,23,0.74))]";

  return (
    <motion.article
      layout
      whileHover={{ y: -3 }}
      className={[
        "relative flex h-[min(430px,100%)] w-[340px] max-w-full min-h-0 flex-col overflow-hidden rounded-[26px] border bg-slate-950/78 p-4 transition",
        accentClass,
        defeated ? "grayscale opacity-60" : "",
      ].join(" ")}
    >
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{sideLabel}</p>
          <h2 className="mt-1 truncate text-2xl font-black text-white">{getPokemonLabel(card.pokemon)}</h2>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] font-black text-slate-300">#{card.pokemon.id.toString().padStart(3, "0")}</span>
            {card.pokemon.types.map((type) => (
              <span key={type} className="rounded-full bg-slate-800/80 px-2.5 py-1 text-[11px] font-black text-slate-200">{getTypeLabel(type)}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-black text-slate-200">Lv.{card.pokemon.level}</span>
          <span className="rounded-full border border-cyan-300/35 bg-cyan-300/12 px-3 py-1 text-[11px] font-black text-cyan-100">{battleUiText.active}</span>
          {shielded && <span className="rounded-full border border-cyan-200/35 bg-cyan-300/15 px-3 py-1 text-xs font-black text-cyan-100">{battleUiText.shielded}</span>}
        </div>
      </div>
      <div className={["relative my-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[22px] border border-slate-700/80 p-3", imageTone].join(" ")}>
        {imageSrc ? (
          <img src={imageSrc} alt={getPokemonLabel(card.pokemon)} className="max-h-full max-w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.58)]" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center rounded-2xl border border-dashed border-slate-600 text-xs font-black text-slate-500">NO IMAGE</div>
        )}
      </div>
      <div className="relative">
        <div className="flex items-center justify-between text-xs font-black text-slate-400">
          <span>HP</span>
          <span>{card.currentHp}/{card.pokemon.max_hp}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div className={["h-full rounded-full transition-all duration-300", getHpBarClass(hpPercent)].join(" ")} style={{ width: String(hpPercent) + "%" }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-2">
            <p className="text-[10px] font-black text-slate-500">{battleUiText.attack}</p>
            <p className="mt-1 text-sm font-black text-slate-200">{card.pokemon.attack}</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-2">
            <p className="text-[10px] font-black text-slate-500">{battleUiText.defense}</p>
            <p className="mt-1 text-sm font-black text-slate-200">{card.pokemon.defense}</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-2">
            <p className="text-[10px] font-black text-slate-500">{battleUiText.speed}</p>
            <p className="mt-1 text-sm font-black text-slate-200">{card.pokemon.speed}</p>
          </div>
        </div>
      </div>
      {defeated && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/58">
          <span className="rounded-full border border-rose-300/35 bg-rose-400/18 px-4 py-2 text-sm font-black text-rose-100">{battleUiText.defeated}</span>
        </div>
      )}
    </motion.article>
  );
}

function BattleCenterHUD({ turn, playerShielded }: { turn: BattleTurnState; playerShielded: boolean }) {
  return (
    <div className="mx-auto flex w-[210px] max-w-full flex-col items-center gap-3 text-center">
      <div className="rounded-full border border-cyan-300/35 bg-slate-950/62 px-5 py-3 shadow-[0_0_24px_rgba(34,211,238,0.20)] backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100">TURN TIMER</p>
        <p className="mt-1 text-4xl font-black leading-none text-white">{turn.secondsLeft}s</p>
      </div>
      <p className="text-5xl font-black leading-none text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.34)]">VS</p>
      <div className="rounded-full border border-slate-700/70 bg-slate-950/58 px-4 py-2 shadow-[0_0_18px_rgba(34,211,238,0.12)] backdrop-blur">
        <p className="text-sm font-black text-slate-100">{getSideLabel(turn.attacker)}{battleUiText.turnSuffix}</p>
      </div>
      <p className="line-clamp-2 max-w-[220px] rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-bold leading-5 text-cyan-50 backdrop-blur">{turn.message}</p>
      {playerShielded && <span className="rounded-full border border-cyan-200/35 bg-cyan-300/15 px-3 py-1 text-[11px] font-black text-cyan-100">{battleUiText.playerShieldReady}</span>}
    </div>
  );
}

function TeamBenchPanel({
  title,
  participant,
  activeIndex,
  side,
  canSwitch = false,
  onSwitch,
}: {
  title: string;
  participant: BattleParticipant;
  activeIndex: number;
  side: BattleSide;
  canSwitch?: boolean;
  onSwitch?: (index: number) => void;
}) {
  const badgeClass = side === "player" ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-rose-400/50 bg-rose-400/10 text-rose-100";

  return (
    <aside className="grid h-full min-h-0 w-[260px] min-w-[260px] max-w-[260px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-black text-white">{title}</p>
        <span className={["rounded-full border px-2.5 py-1 text-[10px] font-black", badgeClass].join(" ")}>{side === "player" ? "PLAYER" : "CPU"}</span>
      </div>
      <TeamBenchList participant={participant} activeIndex={activeIndex} side={side} canSwitch={canSwitch} onSwitch={onSwitch} />
    </aside>
  );
}

function TeamBenchList({
  participant,
  activeIndex,
  side,
  canSwitch = false,
  onSwitch,
}: {
  participant: BattleParticipant;
  activeIndex: number;
  side: BattleSide;
  canSwitch?: boolean;
  onSwitch?: (index: number) => void;
}) {
  return (
    <div className="grid h-full min-h-0 grid-rows-3 gap-2 overflow-hidden">
      {participant.team.map((card, index) => {
        const active = index === activeIndex;
        const defeated = card.currentHp <= 0;
        const disabled = !canSwitch || active || defeated;
        const hpPercent = Math.max(0, (card.currentHp / card.pokemon.max_hp) * 100);
        const imageSrc = getPokemonImage(card.pokemon);
        const status = active ? battleUiText.active : defeated ? battleUiText.defeated : canSwitch ? battleUiText.replaceable : battleUiText.standby;
        return (
          <button
            key={card.pokemon.id}
            type="button"
            disabled={disabled}
            onClick={() => onSwitch?.(index)}
            className={[
              "grid min-h-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-2xl border px-2 py-2 text-left transition",
              active ? (side === "player" ? "border-cyan-300/70 bg-cyan-300/12" : "border-rose-400/70 bg-rose-400/12") : "border-slate-700/80 bg-slate-900/70",
              !disabled ? "hover:border-cyan-300/45 hover:bg-slate-900" : "cursor-not-allowed opacity-70",
            ].join(" ")}
          >
            <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 p-1.5">
              {imageSrc ? <img src={imageSrc} alt={getPokemonLabel(card.pokemon)} className="h-full w-full object-contain" loading="lazy" /> : <span className="text-[9px] font-black text-slate-600">NO</span>}
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs font-black text-white">{getPokemonLabel(card.pokemon)}</span>
                <span className="shrink-0 rounded-full bg-slate-950 px-2 py-0.5 text-[9px] font-black text-slate-300">{status}</span>
              </span>
              <span className="mt-1 block text-[10px] font-bold text-slate-500">HP {card.currentHp}/{card.pokemon.max_hp}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-800">
                <span className={["block h-full rounded-full", getHpBarClass(hpPercent)].join(" ")} style={{ width: String(hpPercent) + "%" }} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CenterActionPanel({
  turn,
  playerSkills,
  playerCanAct,
  playerShielded,
  onSkill,
  onShield,
  onSwitchPrompt,
}: {
  turn: BattleTurnState;
  playerSkills: Skill[];
  playerCanAct: boolean;
  playerShielded: boolean;
  onSkill: (skill: Skill) => void;
  onShield: () => void;
  onSwitchPrompt: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">BattleLog</p>
          <p className="truncate text-sm font-black text-cyan-100">{turn.message}</p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-600/70 bg-slate-900/80 px-3 py-1 text-xs font-black text-slate-300">
          {turn.attacker === "computer" ? battleUiText.computerActing : turn.locked ? battleUiText.processing : battleUiText.waitingPlayer}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_180px] gap-3 overflow-hidden">
        <div className="grid min-h-0 min-w-0 grid-cols-2 grid-rows-2 gap-3">
          {playerSkills.slice(0, 4).map((skill) => (
            <motion.button
              key={skill.id}
              type="button"
              whileHover={playerCanAct ? { y: -2 } : undefined}
              whileTap={playerCanAct ? { scale: 0.98 } : undefined}
              disabled={!playerCanAct}
              onClick={() => onSkill(skill)}
              className="h-full min-h-[78px] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/75 p-3 text-left transition hover:border-cyan-300/45 hover:shadow-[0_0_18px_rgba(34,211,238,0.16)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-black text-white">{skill.name_zh || skill.name}</p>
                <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-black text-slate-300">{getTypeLabel(skill.type)}</span>
              </div>
              <p className="mt-2 truncate text-xs font-bold text-slate-500">{skill.category === "attack" ? battleUiText.power + " " + skill.power : battleUiText.statusSkill} / {battleUiText.accuracy} {skill.accuracy}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold leading-4 text-slate-400">{skill.description_zh || battleUiText.skillFallback}</p>
            </motion.button>
          ))}
        </div>

        <div className="grid h-full w-[180px] min-w-[180px] grid-rows-2 gap-3">
          <motion.button
            type="button"
            whileHover={playerCanAct && !playerShielded ? { y: -2 } : undefined}
            whileTap={playerCanAct && !playerShielded ? { scale: 0.98 } : undefined}
            disabled={!playerCanAct || playerShielded}
            onClick={onShield}
            className="h-full rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-3 text-left transition hover:border-cyan-200/60 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-white">{battleUiText.shield}</p>
              <Shield className="text-cyan-100" size={18} />
            </div>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-400">{battleUiText.shieldReduction}</p>
          </motion.button>
          <motion.button
            type="button"
            whileHover={playerCanAct ? { y: -2 } : undefined}
            whileTap={playerCanAct ? { scale: 0.98 } : undefined}
            disabled={!playerCanAct}
            onClick={onSwitchPrompt}
            className="h-full rounded-2xl border border-slate-600/80 bg-slate-900/75 px-3 text-left transition hover:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-white">{battleUiText.switchCard}</p>
              <ChevronRight className="text-cyan-100" size={18} />
            </div>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-400">{battleUiText.switchHint}</p>
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function NormalBattlePage({ onBack }: { onBack: () => void }) {
  const availablePokemon = useMemo(() => getBattleEnabledPokemon(), []);
  const [phase, setPhase] = useState<NormalBattlePhase>("normalBattleRoom");
  const [currentPicker, setCurrentPicker] = useState<DraftPickSide>("player");
  const [playerDraftIds, setPlayerDraftIds] = useState<number[]>([]);
  const [computerDraftIds, setComputerDraftIds] = useState<number[]>([]);
  const [globalPickedIds, setGlobalPickedIds] = useState<number[]>([]);
  const [pendingPlayerPickId, setPendingPlayerPickId] = useState<number | null>(null);
  const [pendingComputerPickId, setPendingComputerPickId] = useState<number | null>(null);
  const [draftSecondsLeft, setDraftSecondsLeft] = useState(DRAFT_SECONDS);
  const [battleReadySecondsLeft, setBattleReadySecondsLeft] = useState(BATTLE_READY_SECONDS);
  const [participants, setParticipants] = useState<BattleParticipants | null>(null);
  const [turn, setTurn] = useState<BattleTurnState>({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "等待建立對戰。" });
  const [winner, setWinner] = useState<BattleSide | null>(null);
  const [playerShielded, setPlayerShielded] = useState(false);
  const cpuPickPreviewTimerRef = useRef<number | null>(null);
  const cpuDraftTimerRef = useRef<number | null>(null);
  const battleStartTimerRef = useRef<number | null>(null);

  const draftPool = useMemo(() => shufflePokemon(availablePokemon).slice(0, 20), [availablePokemon]);
  const playerDraft = playerDraftIds.flatMap((id) => (getPokemonById(id) ? [getPokemonById(id)!] : []));
  const computerDraft = computerDraftIds.flatMap((id) => (getPokemonById(id) ? [getPokemonById(id)!] : []));
  const teamsReady = playerDraftIds.length >= REQUIRED_TEAM_SIZE && computerDraftIds.length >= REQUIRED_TEAM_SIZE;
  const pendingPlayerPick = pendingPlayerPickId ? getPokemonById(pendingPlayerPickId) : undefined;
  const pendingComputerPick = pendingComputerPickId ? getPokemonById(pendingComputerPickId) : undefined;

  const resetBattle = useCallback(() => {
    if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
    if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);
    if (battleStartTimerRef.current) window.clearTimeout(battleStartTimerRef.current);
    cpuPickPreviewTimerRef.current = null;
    cpuDraftTimerRef.current = null;
    battleStartTimerRef.current = null;
    setPhase("normalBattleRoom");
    setCurrentPicker("player");
    setPlayerDraftIds([]);
    setComputerDraftIds([]);
    setGlobalPickedIds([]);
    setPendingPlayerPickId(null);
    setPendingComputerPickId(null);
    setDraftSecondsLeft(DRAFT_SECONDS);
    setBattleReadySecondsLeft(BATTLE_READY_SECONDS);
    setParticipants(null);
    setWinner(null);
    setPlayerShielded(false);
    setTurn({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "等待建立對戰。" });
  }, []);

  function enterDraftRoom() {
    if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
    if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);
    if (battleStartTimerRef.current) window.clearTimeout(battleStartTimerRef.current);
    cpuPickPreviewTimerRef.current = null;
    cpuDraftTimerRef.current = null;
    battleStartTimerRef.current = null;
    setPhase("draftSelection");
    setCurrentPicker("player");
    setPlayerDraftIds([]);
    setComputerDraftIds([]);
    setGlobalPickedIds([]);
    setPendingPlayerPickId(null);
    setPendingComputerPickId(null);
    setDraftSecondsLeft(DRAFT_SECONDS);
    setBattleReadySecondsLeft(BATTLE_READY_SECONDS);
  }

  function startBattle(playerIds: number[], computerIds: number[]) {
    const nextParticipants: BattleParticipants = {
      player: { activeIndex: 0, team: playerIds.flatMap((id) => (getPokemonById(id) ? [createBattleCard(getPokemonById(id)!)] : [])) },
      computer: { activeIndex: 0, team: computerIds.flatMap((id) => (getPokemonById(id) ? [createBattleCard(getPokemonById(id)!)] : [])) },
    };
    setParticipants(nextParticipants);
    setWinner(null);
    setPlayerShielded(false);
    setTurn({
      attacker: Math.random() > 0.5 ? "player" : "computer",
      secondsLeft: TURN_SECONDS,
      locked: false,
      message: "輪抽完成，進入 1v1 回合對戰。",
    });
    setPhase("battleLoading");
  }

  const lockDraftPick = useCallback(
    (source: "manual" | "timeout", forcedId?: number) => {
      const pendingId = forcedId ?? pendingPlayerPickId;
      if (currentPicker !== "player" || !pendingId || globalPickedIds.includes(pendingId) || playerDraftIds.length >= REQUIRED_TEAM_SIZE) return;
      if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
      if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);

      const nextPlayerIds = [...playerDraftIds, pendingId];
      const nextPickedIds = [...globalPickedIds, pendingId];
      const availableForCpu = draftPool.filter((pokemon) => !nextPickedIds.includes(pokemon.id));
      const selectedCpuPokemon = availableForCpu[Math.floor(Math.random() * availableForCpu.length)];

      setPlayerDraftIds(nextPlayerIds);
      setGlobalPickedIds(nextPickedIds);
      setPendingPlayerPickId(null);
      setPendingComputerPickId(null);
      setCurrentPicker("computer");
      setDraftSecondsLeft(DRAFT_SECONDS);

      cpuPickPreviewTimerRef.current = window.setTimeout(() => {
        if (selectedCpuPokemon) setPendingComputerPickId(selectedCpuPokemon.id);
      }, (DRAFT_SECONDS - CPU_PICK_PREVIEW_SECONDS) * 1000);

      cpuDraftTimerRef.current = window.setTimeout(() => {
        let nextComputerIds = [...computerDraftIds];
        let finalPickedIds = [...nextPickedIds];

        if (nextComputerIds.length < REQUIRED_TEAM_SIZE && selectedCpuPokemon) {
          nextComputerIds = [...nextComputerIds, selectedCpuPokemon.id];
          finalPickedIds = [...finalPickedIds, selectedCpuPokemon.id];
        }

        setComputerDraftIds(nextComputerIds);
        setGlobalPickedIds(finalPickedIds);
        setPendingComputerPickId(null);
        setCurrentPicker("player");
        setDraftSecondsLeft(DRAFT_SECONDS);
        if (nextPlayerIds.length >= REQUIRED_TEAM_SIZE && nextComputerIds.length >= REQUIRED_TEAM_SIZE) {
          setBattleReadySecondsLeft(BATTLE_READY_SECONDS);
          return;
        }
      }, (DRAFT_SECONDS - CPU_PICK_LOCK_SECONDS) * 1000);
    },
    [computerDraftIds, currentPicker, draftPool, globalPickedIds, pendingPlayerPickId, playerDraftIds],
  );

  useEffect(() => {
    if (phase !== "draftSelection" || teamsReady) return;
    const timer = window.setInterval(() => setDraftSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phase, teamsReady]);

  useEffect(() => {
    return () => {
      if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
      if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);
      if (battleStartTimerRef.current) window.clearTimeout(battleStartTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "draftSelection" || !teamsReady) return;
    if (battleReadySecondsLeft > 0) {
      const timer = window.setTimeout(() => setBattleReadySecondsLeft((current) => Math.max(0, current - 1)), 1000);
      return () => window.clearTimeout(timer);
    }

    battleStartTimerRef.current = window.setTimeout(() => {
      startBattle(playerDraftIds, computerDraftIds);
    }, BATTLE_LOADING_DELAY_MS);

    return () => {
      if (battleStartTimerRef.current) window.clearTimeout(battleStartTimerRef.current);
      battleStartTimerRef.current = null;
    };
  }, [battleReadySecondsLeft, computerDraftIds, phase, playerDraftIds, teamsReady]);

  useEffect(() => {
    if (phase !== "draftSelection" || currentPicker !== "player" || draftSecondsLeft > 0) return;
    const fallbackId = pendingPlayerPickId ?? draftPool.find((pokemon) => !globalPickedIds.includes(pokemon.id))?.id;
    if (fallbackId) lockDraftPick("timeout", fallbackId);
  }, [currentPicker, draftPool, draftSecondsLeft, globalPickedIds, lockDraftPick, pendingPlayerPickId, phase]);

  useEffect(() => {
    if (phase !== "battleArena" || winner || turn.locked || turn.secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setTurn((current) => ({ ...current, secondsLeft: Math.max(0, current.secondsLeft - 1) })), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, turn.locked, turn.secondsLeft, winner]);

  useEffect(() => {
    if (phase !== "battleArena" || winner || turn.locked || turn.attacker !== "computer" || !participants) return;
    const timer = window.setTimeout(() => {
      const active = participants.computer.team[participants.computer.activeIndex];
      const skill = getPokemonSkills(active.pokemon).find((item) => item.category === "attack") ?? getPokemonSkills(active.pokemon)[0];
      if (skill) resolveSkill(skill, "computer");
    }, 900);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    if (phase !== "battleArena" || winner || turn.locked || turn.attacker !== "player" || turn.secondsLeft > 0 || !participants) return;
    const active = participants.player.team[participants.player.activeIndex];
    const skill = getPokemonSkills(active.pokemon).find((item) => item.category === "attack") ?? getPokemonSkills(active.pokemon)[0];
    if (skill) resolveSkill(skill, "manual");
  });

  function updateAfterDamage(nextParticipants: BattleParticipants, defenderSide: BattleSide, message: string) {
    const defender = nextParticipants[defenderSide];
    const nextIndex = getLivingIndex(defender.team, defender.activeIndex);
    if (isTeamDefeated(defender.team)) {
      const battleWinner = defenderSide === "player" ? "computer" : "player";
      setParticipants(nextParticipants);
      setWinner(battleWinner);
      setTurn((current) => ({ ...current, locked: true, message: `${message} ${getSideLabel(battleWinner)}勝利。` }));
      setPhase("battleResult");
      return;
    }

    if (nextIndex !== defender.activeIndex) {
      nextParticipants[defenderSide] = { ...defender, activeIndex: nextIndex };
    }

    setParticipants(nextParticipants);
    setTurn({
      attacker: defenderSide,
      secondsLeft: TURN_SECONDS,
      locked: false,
      message: nextIndex !== defender.activeIndex ? `${message} ${getSideLabel(defenderSide)}自動派出下一張卡。` : message,
    });
  }

  function resolveSkill(skill: Skill, source: "manual" | "computer") {
    if (!participants || turn.locked || winner) return;
    const attackerSide = source === "computer" ? "computer" : turn.attacker;
    const defenderSide: BattleSide = attackerSide === "player" ? "computer" : "player";
    const attackerParticipant = participants[attackerSide];
    const defenderParticipant = participants[defenderSide];
    const attackerCard = attackerParticipant.team[attackerParticipant.activeIndex];
    const defenderCard = defenderParticipant.team[defenderParticipant.activeIndex];
    const result = calculateDamage(attackerCard.pokemon, defenderCard.pokemon, skill);
    const nextParticipants: BattleParticipants = {
      player: { ...participants.player, team: participants.player.team.map((card) => ({ ...card })) },
      computer: { ...participants.computer, team: participants.computer.team.map((card) => ({ ...card })) },
    };
    const nextDefender = nextParticipants[defenderSide].team[defenderParticipant.activeIndex];
    let damage = result.damage;

    if (defenderSide === "player" && playerShielded && damage > 0) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      setPlayerShielded(false);
    }

    nextDefender.currentHp = Math.max(0, nextDefender.currentHp - damage);
    setTurn((current) => ({ ...current, locked: true }));
    const message = result.isHit
      ? `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，造成 ${damage} 傷害（${result.effectivenessText}）。`
      : `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，但是落空。`;

    window.setTimeout(() => updateAfterDamage(nextParticipants, defenderSide, message), 450);
  }

  function switchPlayerPokemon(index: number) {
    if (!participants || turn.attacker !== "player" || turn.locked) return;
    const selected = participants.player.team[index];
    if (!selected || selected.currentHp <= 0 || index === participants.player.activeIndex) return;
    setParticipants({ ...participants, player: { ...participants.player, activeIndex: index } });
    setTurn({ attacker: "computer", secondsLeft: TURN_SECONDS, locked: false, message: `已更換為 ${getPokemonLabel(selected.pokemon)}！` });
  }

  function activatePlayerShield() {
    if (turn.attacker !== "player" || turn.locked || playerShielded) return;
    setPlayerShielded(true);
    setTurn({ attacker: "computer", secondsLeft: TURN_SECONDS, locked: false, message: "玩家啟動護盾，下一次受傷減半。" });
  }

  if (phase === "battleLoading") {
    return <BattleLoadingPage playerTeam={participants?.player.team} enemyTeam={participants?.computer.team} onComplete={() => setPhase("battleArena")} />;
  }

  if (phase === "draftSelection") {
    const canLockSelection = currentPicker === "player" && Boolean(pendingPlayerPickId) && !teamsReady;
    const actionLabel = "鎖定";
    const draftHeaderText = teamsReady ? "準備戰鬥" : currentPicker === "computer" ? "對手正在選擇夥伴" : "請選擇你的夥伴";
    const draftHeaderSeconds = teamsReady ? battleReadySecondsLeft : draftSecondsLeft;
    const draftSelectionAura = teamsReady
      ? "bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.18)_50%,transparent)]"
      : currentPicker === "computer"
        ? "bg-[linear-gradient(90deg,transparent_0%,rgba(206,0,0,0.06)_34%,rgba(206,0,0,0.18)_72%,rgba(206,0,0,0.30)_100%)]"
        : "bg-[linear-gradient(90deg,rgba(0,0,206,0.30)_0%,rgba(0,0,206,0.18)_28%,rgba(0,0,206,0.06)_66%,transparent_100%)]";

    return (
      <BattlePageShell eyebrow="一般模式" title="" onBack={resetBattle} fixedViewport frameless prominentEyebrow>
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <section className="relative z-10 grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)_360px] gap-4 overflow-hidden px-2">
            <DraftRosterColumn title="我方陣容" side="player" pokemonList={playerDraft} pendingPokemon={pendingPlayerPick} />
            <section className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-visible px-4 pb-1">
              <div className={["pointer-events-none fixed inset-y-0 left-0 right-0 z-0 blur-2xl", draftSelectionAura].join(" ")} />
              <div className="relative mb-3 grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
                <div />
                <div className="min-w-[340px] px-8 py-4 text-center">
                  <p className="text-3xl font-black text-white">{draftHeaderText}</p>
                  <p className="mt-2 text-3xl font-black text-white">{draftHeaderSeconds}</p>
                </div>
                <div />
              </div>
              <div className="no-scrollbar relative z-10 mx-auto mb-2 grid h-[486px] max-h-full min-h-0 w-fit self-end auto-rows-max grid-cols-[repeat(4,minmax(0,116px))] justify-items-center gap-x-2 gap-y-2.5 overflow-y-auto overscroll-contain xl:grid-cols-[repeat(5,minmax(0,116px))] 2xl:grid-cols-[repeat(5,minmax(0,128px))]">
                {draftPool.map((pokemon) => {
                  const picked = globalPickedIds.includes(pokemon.id);
                  const pending = pendingPlayerPickId === pokemon.id;
                  const disabled = picked || teamsReady;
                  return (
                    <button
                      key={pokemon.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setPendingPlayerPickId(pokemon.id);
                      }}
                      className={[
                        "group relative grid w-full max-w-[116px] min-h-0 grid-rows-[auto_auto] text-center transition 2xl:max-w-[128px]",
                        picked ? "cursor-not-allowed opacity-45" : "",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "grid aspect-square w-full place-items-center overflow-hidden rounded-[18px] border p-2 transition",
                          picked ? "border-slate-800 bg-slate-900/35" : pending ? "border-cyan-300/70 bg-cyan-300/10 shadow-glow" : "border-slate-700/80 bg-slate-900/60 group-hover:border-cyan-300/50",
                        ].join(" ")}
                      >
                        <img src={getPokemonImage(pokemon)} alt={getPokemonLabel(pokemon)} className="h-full w-full object-contain object-center drop-shadow-[0_14px_20px_rgba(0,0,0,0.5)]" loading="lazy" />
                      </div>
                      <p className="mt-1.5 min-w-0 truncate text-sm font-black text-white">{getPokemonLabel(pokemon)}</p>
                    </button>
                  );
                })}
              </div>
            </section>
            <DraftRosterColumn title="敵方陣容" side="computer" pokemonList={computerDraft} pendingPokemon={pendingComputerPick} />
          </section>
          <footer className="relative z-10 flex h-[84px] shrink-0 items-center justify-center">
            <button
              type="button"
              disabled={teamsReady || !canLockSelection}
              onClick={() => lockDraftPick("manual")}
              className="min-h-12 min-w-[220px] rounded-2xl border border-cyan-300/40 bg-cyan-300 px-8 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {actionLabel}
            </button>
          </footer>
        </div>
      </BattlePageShell>
    );
  }

  if (phase === "battleArena" && participants) {
    const playerActive = participants.player.team[participants.player.activeIndex];
    const computerActive = participants.computer.team[participants.computer.activeIndex];
    const playerSkills = getPokemonSkills(playerActive.pokemon);
    const playerCanAct = turn.attacker === "player" && !turn.locked && playerActive.currentHp > 0;

    return (
      <div className="h-screen overflow-hidden bg-slate-950 px-3 py-3 text-white">
        <section className="glass-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] p-0">
          <div className="arena-grid pointer-events-none absolute inset-0 opacity-35" />
          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-slate-800/80 px-6">
              <h1 className="text-2xl font-black tracking-tight text-white">{battleUiText.title}</h1>
              <button type="button" onClick={resetBattle} className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
                <ArrowLeft size={18} />
                {battleUiText.back}
              </button>
            </header>

            <main className="h-[calc(100vh-64px)] min-h-0 overflow-hidden">
              <section className="h-[60%] shrink-0 overflow-hidden">
                <div className="grid h-full grid-cols-[360px_minmax(0,1fr)_360px] items-center gap-8 overflow-hidden px-8">
                  <div className="grid h-full min-h-0 place-items-center justify-self-start overflow-hidden">
                    <ActiveBattleCard card={playerActive} side="player" shielded={playerShielded} />
                  </div>
                  <BattleCenterHUD turn={turn} playerShielded={playerShielded} />
                  <div className="grid h-full min-h-0 place-items-center justify-self-end overflow-hidden">
                    <ActiveBattleCard card={computerActive} side="computer" />
                  </div>
                </div>
              </section>

              <section className="h-[40%] shrink-0 overflow-hidden px-6 pb-5">
                <div className="grid h-full min-h-0 w-full grid-cols-[260px_minmax(0,1fr)_260px] gap-4 overflow-hidden">
                  <TeamBenchPanel
                    title={battleUiText.playerBench}
                    participant={participants.player}
                    activeIndex={participants.player.activeIndex}
                    side="player"
                    canSwitch={playerCanAct}
                    onSwitch={switchPlayerPokemon}
                  />
                  <CenterActionPanel
                    turn={turn}
                    playerSkills={playerSkills}
                    playerCanAct={playerCanAct}
                    playerShielded={playerShielded}
                    onSkill={(skill) => resolveSkill(skill, "manual")}
                    onShield={activatePlayerShield}
                    onSwitchPrompt={() => setTurn((current) => ({ ...current, message: battleUiText.switchPrompt }))}
                  />
                  <TeamBenchPanel
                    title={battleUiText.enemyBench}
                    participant={participants.computer}
                    activeIndex={participants.computer.activeIndex}
                    side="computer"
                  />
                </div>
              </section>
            </main>
          </div>
        </section>
      </div>
    );
  }

  if (phase === "battleResult") {
    return (
      <BattlePageShell eyebrow="對戰結果" title={winner === "player" ? "玩家勝利" : "電腦勝利"} onBack={resetBattle}>
        <div className="grid flex-1 place-items-center py-16">
          <div className="w-full max-w-xl rounded-[28px] border border-cyan-300/25 bg-slate-950/65 p-8 text-center shadow-glow">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-100">對戰結果</p>
            <p className="mt-4 text-5xl font-black text-white">{winner === "player" ? "你獲勝了" : "電腦獲勝"}</p>
            <p className="mt-4 text-base font-semibold leading-7 text-slate-400">{turn.message}</p>
            <div className="mt-8 flex justify-center gap-3">
              <button type="button" onClick={enterDraftRoom} className="min-h-12 rounded-2xl border border-cyan-300/40 bg-cyan-300 px-5 text-sm font-black text-slate-950">重新輪抽</button>
              <button type="button" onClick={resetBattle} className="min-h-12 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-5 text-sm font-black text-slate-200">返回一般模式</button>
            </div>
          </div>
        </div>
      </BattlePageShell>
    );
  }

  return (
    <BattlePageShell eyebrow="一般模式" title="一般模式" onBack={onBack}>
      <div className="grid flex-1 content-center gap-5 py-10">
        <div className="rounded-[26px] border border-cyan-300/20 bg-cyan-300/10 px-5 py-4">
          <p className="text-sm font-black text-cyan-100">房間狀態</p>
          <p className="mt-2 text-base font-semibold text-slate-300">新增電腦後將直接匹配並進入 1v1 隨機輪抽，目前支援 {availablePokemon.length} 張可對戰卡片。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <button type="button" onClick={enterDraftRoom} className="group relative min-h-40 overflow-hidden rounded-[26px] border border-cyan-300/35 bg-cyan-300/10 p-6 text-left transition hover:border-cyan-200/70">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300 text-slate-950">
                <Cpu size={24} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">新增電腦</p>
                <p className="mt-1 text-sm font-semibold text-slate-400">進入 3v3 輪抽後開始卡牌式對戰。</p>
              </div>
            </div>
          </button>
          <button type="button" className="group relative min-h-40 overflow-hidden rounded-[26px] border border-slate-700/80 bg-slate-950/55 p-6 text-left opacity-60">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-slate-300">
                <UserPlus size={24} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">邀請好友</p>
                <p className="mt-1 text-sm font-semibold text-slate-400">尚未開放。</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </BattlePageShell>
  );
}

function PokedexPage({ onBack }: { onBack: () => void }) {
  const [selectedPokemon, setSelectedPokemon] = useState(pokedexPreviewCards[0]);
  const selectedBattlePokemon = getPokemonById(selectedPokemon.id);
  const selectedSkills = selectedBattlePokemon ? getPokemonSkills(selectedBattlePokemon) : [];
  const selectedStats = selectedBattlePokemon
    ? [
        { label: "HP", value: `${selectedBattlePokemon.hp}/${selectedBattlePokemon.max_hp}` },
        { label: "攻擊", value: selectedBattlePokemon.attack },
        { label: "防禦", value: selectedBattlePokemon.defense },
        { label: "速度", value: selectedBattlePokemon.speed },
      ]
    : [];

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden px-3 py-3 text-slate-100">
      <motion.section initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} className="glass-panel relative min-h-full overflow-hidden rounded-[30px] p-5">
        <div className="arena-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative z-10 flex min-h-full flex-col">
          <header className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200">Pokemon Database</p>
              <h1 className="mt-1 text-5xl font-black tracking-tight text-white">圖鑑</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100">收錄 {pokedexPreviewCards.length} / {pokedexTotalCount}</span>
              <button type="button" onClick={onBack} className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
                <ArrowLeft size={18} />
                返回大廳
              </button>
            </div>
          </header>

          <div className="grid h-[calc(100vh-150px)] min-h-0 grid-cols-[minmax(0,1fr)_minmax(380px,1fr)] gap-5">
            <section className="min-h-0 overflow-hidden rounded-[28px] border border-slate-700/80 bg-slate-950/35 p-4">
              <div className="h-full overflow-y-auto pr-2">
                <div className="grid grid-cols-5 gap-3">
                  {pokedexPreviewCards.map((pokemon, index) => (
                    <motion.article
                      key={`${pokemon.id}-${pokemon.filename}`}
                      role="button"
                      tabIndex={0}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.004, 0.25) }}
                      whileHover={{ y: -3, scale: 1.015 }}
                      onClick={() => setSelectedPokemon(pokemon)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedPokemon(pokemon);
                      }}
                      className={["group relative cursor-pointer rounded-[22px] border p-2 transition", selectedPokemon.id === pokemon.id && selectedPokemon.filename === pokemon.filename ? "border-cyan-300/70 bg-cyan-300/10 shadow-glow" : "border-slate-700/80 bg-slate-950/60 hover:border-cyan-300/40"].join(" ")}
                    >
                      <div className="rounded-[18px] border border-slate-700/80 bg-slate-900/80 p-2">
                        <div className="grid aspect-square place-items-center rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.22),rgba(15,23,42,0.22)_58%,rgba(2,6,23,0.45))] p-2">
                          <img src={pokemon.imagePath} alt={pokemon.name} width={256} height={256} className="block h-full w-full object-contain object-center drop-shadow-[0_14px_22px_rgba(0,0,0,0.55)] transition duration-200 group-hover:scale-[1.03]" loading="lazy" />
                        </div>
                        <h3 className="mt-2 truncate text-sm font-black text-white">{pokemon.name}</h3>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">#{pokemon.id.toString().padStart(3, "0")}</p>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </div>
            </section>

            <aside className="sticky top-3 h-[calc(100vh-150px)] min-h-0 overflow-y-auto rounded-[28px] border border-slate-700/80 bg-slate-950/45 p-5">
              <div className="grid place-items-center rounded-[28px] border border-slate-700/80 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),rgba(15,23,42,0.25)_58%,rgba(2,6,23,0.55))] p-8">
                <img src={selectedPokemon.imagePath} alt={selectedPokemon.name} width={256} height={256} className="h-64 w-64 object-contain drop-shadow-[0_24px_42px_rgba(0,0,0,0.65)]" />
              </div>
              <div className="mt-6 rounded-[24px] border border-slate-700/80 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black text-white">{selectedBattlePokemon?.name_zh ?? selectedPokemon.name}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">{selectedBattlePokemon?.name ?? selectedPokemon.filename}</p>
                  </div>
                  <span className="rounded-full bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100">#{selectedPokemon.id.toString().padStart(3, "0")}</span>
                </div>
                {selectedBattlePokemon && (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedBattlePokemon.types.map((type) => (
                        <span key={type} className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">{getTypeLabel(type)}</span>
                      ))}
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {selectedStats.map((stat) => (
                        <div key={stat.label} className="rounded-2xl border border-slate-700/70 bg-slate-950/55 p-4">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                          <p className="mt-2 text-2xl font-black text-slate-300">{stat.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-2">
                      {selectedSkills.map((skill) => (
                        <div key={skill.id} className="rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-white">{skill.name_zh || skill.name}</p>
                              <p className="mt-1 text-xs font-bold text-slate-500">{getTypeLabel(skill.type)} / {skill.category}</p>
                            </div>
                            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-200">威力 {skill.power}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
