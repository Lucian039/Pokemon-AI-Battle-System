import { AnimatePresence, motion } from "framer-motion";
import BattleLoadingPage from "./BattleLoadingPage";
import {
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
  Map,
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
import { getRoleDefinition, roleDefinitions, roleOrder } from "../data/role_definitions";
import { getAbilityDefinition, lowHpBoostAbilityTypes } from "../data/ability_definitions";
import typeChartData from "../data/type_chart.json";
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
  PokemonRole,
  PokemonStats,
  PokemonType,
  Skill,
} from "../types/battle";

type CurrentPage = "lobby" | "pokedex" | "ranked" | "normalBattle";
type NormalBattlePhase = "normalBattleRoom" | "draftSelection" | "battleLoading" | "battleArena" | "battleResult";
type PokedexRoleFilter = "all" | PokemonRole;
type PokedexDetailTab = "basic" | "types" | "stats" | "skills" | "evolution";
type TypeChart = Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>>;

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
    Bug: "蟲",
    Dark: "惡",
  };

  return labels[type] ?? type;
}

const pokemonTypeFilterOptions: PokemonType[] = [
  "Normal",
  "Electric",
  "Fire",
  "Water",
  "Grass",
  "Poison",
  "Ghost",
  "Fighting",
  "Steel",
  "Dragon",
  "Flying",
  "Psychic",
  "Fairy",
  "Rock",
  "Ground",
  "Ice",
  "Bug",
  "Dark",
];

const pokedexRoleFilterOptions: PokedexRoleFilter[] = ["all", ...roleOrder];
const typeChart = typeChartData as TypeChart;

const pokedexDetailTabs: Array<{ id: PokedexDetailTab; label: string }> = [
  { id: "basic", label: "基本" },
  { id: "types", label: "屬性" },
  { id: "stats", label: "能力" },
  { id: "skills", label: "技能" },
  { id: "evolution", label: "進化" },
];

function getPokemonRoleLabels(pokemon: PokemonStats) {
  return [pokemon.role, ...(pokemon.secondary_roles ?? [])].map((role) => getRoleDefinition(role));
}

function RoleChips({ pokemon, compact = false }: { pokemon: PokemonStats; compact?: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {getPokemonRoleLabels(pokemon).map((role, index) => (
        <span
          key={pokemon.id + "-" + role.id}
          className={[
            "rounded-full border font-black",
            compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
            role.chipClass,
          ].join(" ")}
        >
          {role.name}
        </span>
      ))}
    </div>
  );
}

function getTypeChipClass(type: PokemonType) {
  const classes: Record<PokemonType, string> = {
    Normal: "border-slate-300/50 bg-slate-300/80 text-slate-950",
    Electric: "border-yellow-200/70 bg-yellow-300/90 text-slate-950",
    Fire: "border-orange-200/70 bg-orange-400/90 text-white",
    Water: "border-sky-200/70 bg-sky-400/90 text-slate-950",
    Grass: "border-lime-200/70 bg-lime-500/90 text-white",
    Poison: "border-fuchsia-200/70 bg-fuchsia-500/80 text-white",
    Ghost: "border-violet-200/70 bg-violet-500/80 text-white",
    Fighting: "border-red-200/70 bg-red-500/85 text-white",
    Steel: "border-slate-200/70 bg-slate-400/90 text-slate-950",
    Dragon: "border-indigo-200/70 bg-indigo-500/85 text-white",
    Flying: "border-cyan-200/70 bg-cyan-300/85 text-slate-950",
    Psychic: "border-pink-200/70 bg-pink-400/85 text-white",
    Fairy: "border-rose-200/70 bg-rose-300/90 text-slate-950",
    Rock: "border-stone-200/70 bg-stone-500/90 text-white",
    Ground: "border-amber-200/70 bg-amber-600/90 text-white",
    Ice: "border-cyan-100/80 bg-cyan-200/90 text-slate-950",
    Bug: "border-green-200/70 bg-green-500/85 text-white",
    Dark: "border-zinc-300/70 bg-zinc-700/90 text-white",
  };

  return classes[type];
}

function getPokedexProfile(pokemon?: PokemonStats) {
  const profileById: Record<number, { height: string; weight: string; gender: string; ability: string }> = {
    1: { height: "0.7 m", weight: "6.9 kg", gender: "♂ / ♀", ability: "茂盛" },
    3: { height: "2.0 m", weight: "100.0 kg", gender: "♂ / ♀", ability: "茂盛" },
    4: { height: "0.6 m", weight: "8.5 kg", gender: "♂ / ♀", ability: "猛火" },
    6: { height: "1.7 m", weight: "90.5 kg", gender: "♂ / ♀", ability: "猛火" },
    7: { height: "0.5 m", weight: "9.0 kg", gender: "♂ / ♀", ability: "激流" },
    9: { height: "1.6 m", weight: "85.5 kg", gender: "♂ / ♀", ability: "激流" },
    25: { height: "0.4 m", weight: "6.0 kg", gender: "♂ / ♀", ability: "靜電" },
    59: { height: "1.9 m", weight: "155.0 kg", gender: "♂ / ♀", ability: "威嚇" },
    65: { height: "1.5 m", weight: "48.0 kg", gender: "♂ / ♀", ability: "同步" },
    94: { height: "1.5 m", weight: "40.5 kg", gender: "♂ / ♀", ability: "詛咒之軀" },
    130: { height: "6.5 m", weight: "235.0 kg", gender: "♂ / ♀", ability: "威嚇" },
    143: { height: "2.1 m", weight: "460.0 kg", gender: "♂ / ♀", ability: "厚脂肪" },
    149: { height: "2.2 m", weight: "210.0 kg", gender: "♂ / ♀", ability: "精神力" },
    150: { height: "2.0 m", weight: "122.0 kg", gender: "不明", ability: "壓迫感" },
    242: { height: "1.5 m", weight: "46.8 kg", gender: "♀", ability: "自然回復" },
    243: { height: "1.9 m", weight: "178.0 kg", gender: "不明", ability: "壓迫感" },
    244: { height: "2.1 m", weight: "198.0 kg", gender: "不明", ability: "壓迫感" },
    245: { height: "2.0 m", weight: "187.0 kg", gender: "不明", ability: "壓迫感" },
    248: { height: "2.0 m", weight: "202.0 kg", gender: "♂ / ♀", ability: "揚沙" },
    392: { height: "1.2 m", weight: "55.0 kg", gender: "♂ / ♀", ability: "猛火" },
    445: { height: "1.9 m", weight: "95.0 kg", gender: "♂ / ♀", ability: "沙隱" },
    448: { height: "1.2 m", weight: "54.0 kg", gender: "♂ / ♀", ability: "精神力" },
  };

  return pokemon ? profileById[pokemon.id] ?? { height: "-", weight: "-", gender: "-", ability: pokemon.role_zh } : { height: "-", weight: "-", gender: "-", ability: "-" };
}

function getWeaknessTypes(defenderTypes: PokemonType[]) {
  return pokemonTypeFilterOptions.filter((attackType) => {
    const multiplier = defenderTypes.reduce((total, defenderType) => total * (typeChart[attackType]?.[defenderType] ?? 1), 1);
    return multiplier > 1;
  });
}

function getStatPercent(value: number) {
  return `${Math.min(100, Math.max(8, Math.round((value / 180) * 100)))}%`;
}

function getAbilityLabel(pokemon: PokemonStats) {
  return pokemon.ability_zh || getAbilityDefinition(pokemon.ability_id)?.name || "特性";
}

function getAbilityDescription(pokemon: PokemonStats) {
  return pokemon.ability_description_zh || getAbilityDefinition(pokemon.ability_id)?.description || "";
}

function healBattleCard(card: BattleCardState, ratio: number) {
  if (card.currentHp <= 0 || card.currentHp >= card.pokemon.max_hp) return 0;
  const healAmount = Math.max(1, Math.round(card.pokemon.max_hp * ratio));
  const nextHp = Math.min(card.pokemon.max_hp, card.currentHp + healAmount);
  const actualHeal = nextHp - card.currentHp;
  card.currentHp = nextHp;
  return actualHeal;
}

function PokemonDisplayCard({
  pokemon,
  imageSrc,
  selected = false,
  defeated = false,
  active = false,
  compact = false,
}: {
  pokemon: PokemonStats;
  imageSrc: string;
  selected?: boolean;
  defeated?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  const cardPadding = compact ? "p-1.5" : "p-2";
  const nameSize = compact ? "text-xs" : "text-base";
  const numberSize = compact ? "text-[10px]" : "text-sm";
  const imageSize = compact ? "h-[68%] w-[68%]" : "h-[72%] w-[72%]";
  const chipSize = compact ? "min-w-10 px-2 py-0.5 text-[9px]" : "min-w-14 px-3 py-1 text-xs";
  const iconSize = compact ? "w-[82%]" : "w-[84%]";

  return (
    <div
      className={[
        "relative flex h-full w-full flex-col overflow-hidden rounded-[20px] border bg-[#061622] text-left shadow-[0_0_18px_rgba(125,190,255,0.18)]",
        selected || active ? "border-sky-300/85 shadow-[0_0_22px_rgba(125,190,255,0.36)]" : "border-sky-300/55",
        defeated ? "grayscale opacity-55" : "",
      ].join(" ")}
    >
      <div className={["relative grid min-h-0 flex-[1.25] place-items-center overflow-hidden", cardPadding].join(" ")}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(83,166,202,0.32),rgba(7,22,34,0.86)_56%,rgba(3,11,18,0.98)_78%)]" />
        <div className="absolute aspect-square w-[78%] rounded-full bg-[radial-gradient(circle_at_42%_34%,rgba(201,241,238,0.24),rgba(71,131,150,0.22)_48%,rgba(3,12,19,0.48)_76%)] shadow-[inset_0_18px_28px_rgba(255,255,255,0.06),inset_0_-24px_34px_rgba(0,0,0,0.52),0_0_26px_rgba(119,216,241,0.18)]" />
        <img
          src="/pokeball-icon-sm.png"
          alt=""
          aria-hidden="true"
          className={["absolute z-0 aspect-square object-contain opacity-30 mix-blend-screen [filter:invert(84%)_sepia(23%)_saturate(720%)_hue-rotate(158deg)_brightness(103%)_contrast(92%)]", iconSize].join(" ")}
          loading="lazy"
        />
        <div className="absolute aspect-square w-[64%] rounded-full bg-[radial-gradient(circle_at_center,rgba(137,221,239,0.10),rgba(137,221,239,0.02)_54%,transparent_70%)] blur-sm" />
        <img src={imageSrc} alt={getPokemonLabel(pokemon)} className={["relative z-10 object-contain object-center drop-shadow-[0_0_3px_rgba(255,255,255,0.95)] transition duration-200 group-hover:scale-[1.03]", imageSize].join(" ")} loading="lazy" />
      </div>

      <div className="relative flex flex-[0.85] flex-col border-t border-sky-100/70 bg-[linear-gradient(180deg,rgba(11,30,45,0.98),rgba(8,19,29,0.98))] px-4 pb-4 pt-3 shadow-[inset_0_14px_28px_rgba(93,169,215,0.12)]">
        <div className="absolute -top-px left-[34%] h-4 w-[32%] rounded-b-full border-b border-l border-r border-sky-100/70 bg-[#061622]" />
        <p className={["font-black leading-none text-sky-200", numberSize].join(" ")}>{pokemon.id.toString().padStart(4, "0")}</p>
        <h3 className={["mt-2 truncate font-black leading-tight text-white", nameSize].join(" ")}>{getPokemonLabel(pokemon)}</h3>
        <div className="mt-auto flex items-center justify-center gap-3">
          {pokemon.types.map((type) => (
            <span key={type} className={["rounded-full border text-center font-black shadow-[0_0_10px_rgba(255,255,255,0.22)]", chipSize, getTypeChipClass(type)].join(" ")}>
              {getTypeLabel(type)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">預覽已收錄的寶可夢圖鑑資料，進入圖鑑可查看定位與技能。</p>
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
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">隊伍資料會依照可對戰資料展示，職業定位只作為戰術參考。</p>
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

function RoleGuidePanel({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "grid gap-2" : "grid gap-3"}>
      <div className="rounded-[24px] border border-slate-700/75 bg-slate-950/55 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100">Role Position</p>
            <h2 className="mt-1 text-xl font-black text-white">職業定位</h2>
          </div>
          <span className="rounded-full border border-slate-600/80 bg-slate-900/80 px-3 py-1 text-[11px] font-black text-slate-300">不影響倍率</span>
        </div>
        {!compact && (
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
            職業只協助理解隊伍功能與選角策略；傷害仍由技能威力、攻防、屬性倍率與隨機係數計算。
          </p>
        )}
      </div>
      <div className={compact ? "grid gap-2" : "grid gap-2 md:grid-cols-5"}>
        {roleOrder.map((role) => {
          const definition = roleDefinitions[role];
          return (
            <article key={role} className={["rounded-2xl border p-3", definition.accentClass].join(" ")}>
              <p className="text-base font-black text-white">{definition.name}</p>
              <p className="mt-1 text-xs font-black opacity-85">{definition.subtitle}</p>
              {!compact && <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{definition.relation}</p>}
            </article>
          );
        })}
      </div>
    </section>
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
    { id: "ranked", label: "排位賽", description: "正式競技模式尚未開放，之後可加入積分與段位。", icon: Trophy, accent: "text-amber-200" },
    { id: "normalBattle", label: "一般模式", description: "進入 3v3 輪抽，與電腦隊伍進行 1v1 回合對戰。", icon: Swords, accent: "text-cyan-200" },
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
        <footer className="glass-panel relative col-span-full flex items-center justify-between rounded-[24px] px-4 py-3">
          <div className="flex items-center gap-3 xl:hidden">
            {mobileNav.map((item) => (
              <NavButton key={item.id} action={item} compact active={activePanel === item.id} onClick={handleSelectPanel} />
            ))}
          </div>
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3">
            <button type="button" aria-label="冒險" onClick={() => handleSelectPanel("adventure")} className="flex min-h-14 min-w-28 items-center justify-center gap-2 rounded-2xl border border-emerald-300/35 bg-emerald-300/10 px-5 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-200/65">
              <Map size={18} />
              <span className="text-sm">冒險</span>
            </button>
            <button type="button" aria-label="對戰" onClick={() => setIsBattleModeSheetOpen(true)} className="flex min-h-14 min-w-28 items-center justify-center gap-2 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-5 text-sm font-black text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-200/65">
              <Swords size={18} />
              <span className="text-sm">對戰</span>
            </button>
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
          <p className="mt-6 text-4xl font-black text-white">尚未開放</p>
          <p className="mt-4 text-base font-semibold leading-7 text-slate-400">排位賽將在之後加入積分、段位與配對規則。</p>
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
    <section className="relative z-20 h-full min-h-0 overflow-hidden p-3 pt-[92px]">
      <div className="mb-3 flex h-12 shrink-0 items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {filledCount}/{REQUIRED_TEAM_SIZE} {filledCount === pokemonList.length ? "已鎖定" : "暫選中"}
          </p>
        </div>
        <span className={["rounded-full border px-3 py-1 text-[11px] font-black", side === "player" ? "border-[#0000CE]/70 bg-[#0000CE]/20 text-blue-100" : "border-[#CE0000]/70 bg-[#CE0000]/20 text-red-100"].join(" ")}>
          {side === "player" ? "PLAYER" : "CPU"}
        </span>
      </div>
      <div className="h-[calc(100%-60px)] min-h-0 flex flex-col justify-start gap-3 overflow-hidden">
        {Array.from({ length: REQUIRED_TEAM_SIZE }).map((_, slotIndex) => {
          const lockedPokemon = pokemonList[slotIndex];
          const isPendingSlot = !lockedPokemon && pendingPokemon && slotIndex === pokemonList.length;
          const pokemon = lockedPokemon ?? (isPendingSlot ? pendingPokemon : undefined);
          return (
            <article
              key={pokemon?.id ?? `${side}-empty-${slotIndex}`}
              className={[
                "relative h-[150px] shrink-0 overflow-hidden rounded-2xl border p-2.5",
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
                <div className="grid h-full min-h-0 grid-cols-[78px_minmax(0,1fr)] items-center gap-3">
                  <span className={["absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-black", isPendingSlot ? "bg-cyan-300 text-slate-950" : "bg-slate-950/80 text-slate-300"].join(" ")}>
                    {isPendingSlot ? "暫選中" : "已鎖定"}
                  </span>
                  <div className="grid aspect-square h-full max-h-20 place-items-center rounded-[16px] border border-white/10 bg-slate-950/70 p-2">
                    <img src={getPokemonImage(pokemon)} alt={getPokemonLabel(pokemon)} className="h-full w-full scale-125 object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-white">{getPokemonLabel(pokemon)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">#{pokemon.id.toString().padStart(3, "0")}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pokemon.types.map((type) => (
                        <span key={type} className="rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-black text-slate-300">{getTypeLabel(type)}</span>
                      ))}
                    </div>
                    <div className="mt-2">
                      <RoleChips pokemon={pokemon} compact />
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-400">HP {pokemon.max_hp}</p>
                  </div>
                </div>
              ) : (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <p className="text-3xl font-black text-slate-500">0{slotIndex + 1}</p>
                    <p className="mt-1 text-xs font-black text-slate-400">等待選擇</p>
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
          <p className="mt-1 text-lg font-black text-white">{activeCard ? getPokemonLabel(activeCard.pokemon) : "尚未出戰"}</p>
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
          <div className="mt-2">
            <RoleChips pokemon={card.pokemon} compact />
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
    <div className="relative mx-auto flex h-full w-full max-w-full flex-col items-center justify-start text-center">
      <div className="flex flex-col items-center">
        <p className="text-5xl font-black leading-none text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.34)]">{turn.secondsLeft}</p>
        <p className="mt-2 text-base font-black text-slate-100">{getSideLabel(turn.attacker)}{battleUiText.turnSuffix}</p>
      </div>
      <p className="mt-6 text-5xl font-black leading-none text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.34)]">VS</p>
      {playerShielded && <span className="mt-4 text-sm font-black text-cyan-100">{battleUiText.playerShieldReady}</span>}
    </div>
  );
}

function BattleCenterStatus({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-[22%] text-center">
      <p className="max-w-4xl text-3xl font-black leading-[1.45] text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">{message}</p>
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

function BattleHealthHud({ label, participant, side }: { label: string; participant: BattleParticipant; side: BattleSide }) {
  const activeCard = participant.team[participant.activeIndex];
  const aliveCount = participant.team.filter((card) => card.currentHp > 0).length;
  const hpPercent = activeCard ? Math.max(0, (activeCard.currentHp / activeCard.pokemon.max_hp) * 100) : 0;
  const alignment = side === "player" ? "left-8 text-left" : "right-8 text-right";
  const glow = side === "player" ? "shadow-[0_0_22px_rgba(34,211,238,0.34)]" : "shadow-[0_0_22px_rgba(244,63,94,0.28)]";
  const barLine = side === "player" ? "from-cyan-300 via-emerald-300 to-cyan-100" : "from-rose-300 via-orange-200 to-rose-100";
  const name = activeCard ? getPokemonLabel(activeCard.pokemon) : "\u5c1a\u672a\u51fa\u6230";
  const hpText = activeCard ? `${activeCard.currentHp}/${activeCard.pokemon.max_hp}` : "--/--";

  return (
    <div className={["absolute top-[88px] z-30 w-[460px] max-w-[calc(50vw-80px)]", alignment].join(" ")}>
      <div className={["grid items-end gap-4", side === "player" ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[auto_auto_minmax(0,1fr)]"].join(" ")}>
        {side === "computer" && <span className="shrink-0 text-sm font-black text-slate-200">{hpText}</span>}
        {side === "computer" && <span className="shrink-0 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-black text-slate-200">{aliveCount}/{participant.team.length}</span>}
        <div className={["min-w-0", side === "computer" ? "text-right" : "text-left"].join(" ")}>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-black leading-none text-white">{name}</p>
        </div>
        {side === "player" && <span className="shrink-0 text-sm font-black text-slate-200">{hpText}</span>}
        {side === "player" && <span className="shrink-0 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-black text-slate-200">{aliveCount}/{participant.team.length}</span>}
      </div>
      {activeCard && (
        <div className="mt-3">
          <div className={["h-4 overflow-hidden rounded-full border border-white/10 bg-slate-950/80", glow].join(" ")}>
            <div className={["h-full rounded-full bg-gradient-to-r transition-all duration-300", barLine].join(" ")} style={{ width: String(hpPercent) + "%" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function CompactActiveBattleCard({ card, side, shielded = false }: { card: BattleCardState; side: BattleSide; shielded?: boolean }) {
  const defeated = card.currentHp <= 0;
  const imageSrc = getPokemonImage(card.pokemon);

  return (
    <motion.article
      layout
      whileHover={{ y: -3 }}
      style={{ aspectRatio: "1 / 1.45", width: 250, flex: "0 0 250px" }}
      className="relative max-h-full min-h-0 transition"
    >
      <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} active={side === "player"} defeated={defeated} />
      {shielded && <span className="absolute right-4 top-4 z-10 shrink-0 rounded-full border border-cyan-200/35 bg-cyan-300/15 px-3 py-1 text-xs font-black text-cyan-100">{battleUiText.shielded}</span>}
      {defeated && (
        <div className="absolute inset-0 grid place-items-center rounded-[20px] bg-slate-950/58">
          <span className="rounded-full border border-rose-300/35 bg-rose-400/18 px-4 py-2 text-sm font-black text-rose-100">{battleUiText.defeated}</span>
        </div>
      )}
    </motion.article>
  );
}

function BattleCardDeck({
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
    <aside className="flex h-full min-h-0 items-end justify-center gap-3 overflow-hidden">
      {participant.team.map((card, index) => {
        const active = index === activeIndex;
        const defeated = card.currentHp <= 0;
        const disabled = !canSwitch || active || defeated;
        const imageSrc = getPokemonImage(card.pokemon);
        return (
          <button
            key={card.pokemon.id}
            type="button"
            disabled={disabled}
            onClick={() => onSwitch?.(index)}
            style={{ aspectRatio: "1 / 1.45", width: 136, flex: "0 0 136px" }}
            className={[
              "relative min-h-0 text-left transition",
              !disabled ? "hover:-translate-y-1" : "cursor-not-allowed",
            ].join(" ")}
          >
            <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} selected={active} defeated={defeated} compact />
            {active && <span className="absolute right-2 top-2 z-20 rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] font-black text-cyan-100">{battleUiText.active}</span>}
          </button>
        );
      })}
    </aside>
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
    <div className="flex h-[220px] max-h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
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
  const [turn, setTurn] = useState<BattleTurnState>({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "請準備開始對戰。" });
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
    setTurn({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "請準備開始對戰。" });
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
      message: "隊伍準備完成，進入 1v1 回合對戰。",
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

  function updateAfterDamage(nextParticipants: BattleParticipants, defenderSide: BattleSide, attackerSide: BattleSide, message: string) {
    const defender = nextParticipants[defenderSide];
    const attacker = nextParticipants[attackerSide];
    const nextIndex = getLivingIndex(defender.team, defender.activeIndex);
    if (isTeamDefeated(defender.team)) {
      const battleWinner = defenderSide === "player" ? "computer" : "player";
      setParticipants(nextParticipants);
      setWinner(battleWinner);
      setTurn((current) => ({ ...current, locked: true, message: `${message} ${getSideLabel(battleWinner)}勝利。` }));
      setPhase("battleResult");
      return;
    }

    if (isTeamDefeated(attacker.team)) {
      const battleWinner = attackerSide === "player" ? "computer" : "player";
      setParticipants(nextParticipants);
      setWinner(battleWinner);
      setTurn((current) => ({ ...current, locked: true, message: `${message} ${getSideLabel(battleWinner)}勝利。` }));
      setPhase("battleResult");
      return;
    }

    if (nextIndex !== defender.activeIndex) {
      nextParticipants[defenderSide] = { ...defender, activeIndex: nextIndex };
    }

    const nextAttackerIndex = getLivingIndex(attacker.team, attacker.activeIndex);
    if (nextAttackerIndex !== attacker.activeIndex) {
      nextParticipants[attackerSide] = { ...attacker, activeIndex: nextAttackerIndex };
    }

    setParticipants(nextParticipants);
    setTurn({
      attacker: defenderSide,
      secondsLeft: TURN_SECONDS,
      locked: false,
      message: [
        message,
        nextIndex !== defender.activeIndex ? `${getSideLabel(defenderSide)}派出下一位夥伴。` : "",
        nextAttackerIndex !== attacker.activeIndex ? `${getSideLabel(attackerSide)}派出下一位夥伴。` : "",
      ].filter(Boolean).join(" "),
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
    const nextAttacker = nextParticipants[attackerSide].team[attackerParticipant.activeIndex];
    const nextDefender = nextParticipants[defenderSide].team[defenderParticipant.activeIndex];
    let damage = result.damage;
    const abilityMessages: string[] = [];

    if (result.isHit && damage > 0) {
      const lowHpBoostType = lowHpBoostAbilityTypes[attackerCard.pokemon.ability_id];
      if (lowHpBoostType && skill.type === lowHpBoostType && attackerCard.currentHp <= attackerCard.pokemon.max_hp / 3) {
        damage = Math.round(damage * 1.2);
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，${getTypeLabel(skill.type)}屬性傷害提升。`);
      }

      if (attackerCard.pokemon.ability_id === "adaptability" && attackerCard.pokemon.types.includes(skill.type)) {
        damage = Math.round(damage * 1.12);
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，同屬性招式傷害提升。`);
      }

      if (attackerCard.pokemon.ability_id === "technician" && skill.power <= 50) {
        damage = Math.round(damage * 1.2);
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，低威力招式傷害提升。`);
      }

      if (attackerCard.pokemon.ability_id === "guts" && attackerCard.currentHp <= attackerCard.pokemon.max_hp / 2) {
        damage = Math.round(damage * 1.12);
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，攻擊傷害提升。`);
      }

      if (attackerCard.pokemon.ability_id === "inner_focus" && attackerCard.currentHp >= attackerCard.pokemon.max_hp / 2) {
        damage = Math.round(damage * 1.08);
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，攻擊更加集中。`);
      }

      if (attackerCard.pokemon.ability_id === "sand_stream" && attackerCard.currentHp >= attackerCard.pokemon.max_hp / 2 && (skill.type === "Rock" || skill.type === "Dark")) {
        damage = Math.round(damage * 1.1);
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，砂暴之力提升傷害。`);
      }

      if (attackerCard.pokemon.ability_id === "static" && skill.type === "Electric" && attackerCard.pokemon.speed > defenderCard.pokemon.speed) {
        damage += 8;
        abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，追加 8 點傷害。`);
      }

      if (defenderCard.pokemon.ability_id === "cute_charm" && attackerCard.pokemon.attack > defenderCard.pokemon.defense) {
        damage = Math.max(1, Math.round(damage * 0.92));
        abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，受到傷害降低。`);
      }

      if (defenderCard.pokemon.ability_id === "intimidate" && attackerCard.pokemon.attack > defenderCard.pokemon.attack) {
        damage = Math.max(1, Math.round(damage * 0.9));
        abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，受到傷害降低。`);
      }

      if (defenderCard.pokemon.ability_id === "thick_fat" && (skill.type === "Fire" || skill.type === "Ice")) {
        damage = Math.max(1, Math.round(damage * 0.8));
        abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，火與冰屬性傷害降低。`);
      }

      if (defenderCard.pokemon.ability_id === "pressure" && attackerCard.currentHp > defenderCard.currentHp) {
        damage = Math.max(1, Math.round(damage * 0.92));
        abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，受到傷害降低。`);
      }

      if (defenderCard.pokemon.ability_id === "sand_veil" && defenderCard.currentHp <= defenderCard.pokemon.max_hp / 2) {
        damage = Math.max(1, Math.round(damage * 0.92));
        abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，受到傷害降低。`);
      }

      if (defenderCard.pokemon.ability_id === "cursed_body" && Math.random() < 0.2) {
        damage = Math.max(1, Math.round(damage * 0.75));
        abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，本次傷害降低。`);
      }
    }

    if (defenderSide === "player" && playerShielded && damage > 0) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      setPlayerShielded(false);
    }

    if (
      result.isHit &&
      damage > 0 &&
      defenderCard.pokemon.ability_id === "sturdy" &&
      !nextDefender.abilityUsed &&
      defenderCard.currentHp === defenderCard.pokemon.max_hp &&
      damage >= defenderCard.currentHp
    ) {
      damage = Math.max(0, defenderCard.currentHp - 1);
      nextDefender.abilityUsed = true;
      abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，保留 1 HP。`);
    }

    nextDefender.currentHp = Math.max(0, nextDefender.currentHp - damage);

    if (result.isHit && damage > 0 && defenderCard.pokemon.ability_id === "synchronize" && damage > defenderCard.pokemon.max_hp * 0.15 && nextAttacker.currentHp > 0) {
      const recoilDamage = Math.max(1, Math.round(damage * 0.08));
      nextAttacker.currentHp = Math.max(0, nextAttacker.currentHp - recoilDamage);
      abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，反彈 ${recoilDamage} 點傷害。`);
    }

    if (result.isHit && attackerCard.pokemon.ability_id === "natural_cure" && nextAttacker.currentHp > 0 && nextAttacker.currentHp <= nextAttacker.pokemon.max_hp / 2) {
      const healAmount = healBattleCard(nextAttacker, 0.06);
      if (healAmount > 0) abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，回復 ${healAmount} HP。`);
    }

    setTurn((current) => ({ ...current, locked: true }));
    const message = result.isHit
      ? `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，造成 ${damage} 傷害（${result.effectivenessText}）。${abilityMessages.length > 0 ? " " + abilityMessages.join(" ") : ""}`
      : `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，但沒有命中。`;

    window.setTimeout(() => updateAfterDamage(nextParticipants, defenderSide, attackerSide, message), 450);
  }

  function switchPlayerPokemon(index: number) {
    if (!participants || turn.attacker !== "player" || turn.locked) return;
    const selected = participants.player.team[index];
    if (!selected || selected.currentHp <= 0 || index === participants.player.activeIndex) return;
    const nextPlayerTeam = participants.player.team.map((card) => ({ ...card }));
    const previousActive = nextPlayerTeam[participants.player.activeIndex];
    const abilityMessages: string[] = [];

    if (previousActive.pokemon.ability_id === "regenerator") {
      const healAmount = healBattleCard(previousActive, 0.1);
      if (healAmount > 0) abilityMessages.push(`特性「${getAbilityLabel(previousActive.pokemon)}」發動，回復 ${healAmount} HP。`);
    }

    setParticipants({ ...participants, player: { ...participants.player, activeIndex: index, team: nextPlayerTeam } });
    setTurn({
      attacker: "computer",
      secondsLeft: TURN_SECONDS,
      locked: false,
      message: `你更換為 ${getPokemonLabel(selected.pokemon)}。${abilityMessages.length > 0 ? " " + abilityMessages.join(" ") : ""}`,
    });
  }

  function activatePlayerShield() {
    if (turn.attacker !== "player" || turn.locked || playerShielded) return;
    setPlayerShielded(true);
    setTurn({ attacker: "computer", secondsLeft: TURN_SECONDS, locked: false, message: "玩家啟動護盾，本回合可降低受到的傷害。" });
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
                  const disabled = picked || teamsReady || currentPicker !== "player";
                  return (
                    <button
                      key={pokemon.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (currentPicker !== "player" || picked || teamsReady) return;
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
                      <div className="mt-1 flex justify-center">
                        <RoleChips pokemon={pokemon} compact />
                      </div>
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
          <BattleHealthHud label={"\u6211\u65b9 HP"} participant={participants.player} side="player" />
          <BattleHealthHud label={"\u6575\u65b9 HP"} participant={participants.computer} side="computer" />
          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-slate-800/80 px-6">
              <h1 className="text-2xl font-black tracking-tight text-white">{battleUiText.title}</h1>
              <button type="button" onClick={resetBattle} className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
                <ArrowLeft size={18} />
                {battleUiText.back}
              </button>
            </header>

            <main className="h-[calc(100vh-64px)] min-h-0 overflow-hidden">
              <section className="relative h-[61%] shrink-0 overflow-hidden pt-[96px]">
                <BattleCenterStatus message={turn.message} />
                <div className="grid h-full grid-cols-[360px_minmax(0,1fr)_360px] items-end gap-8 overflow-hidden px-8 pb-6">
                  <div className="grid h-full min-h-0 place-items-end justify-self-start overflow-hidden">
                    <CompactActiveBattleCard card={playerActive} side="player" shielded={playerShielded} />
                  </div>
                  <BattleCenterHUD turn={turn} playerShielded={playerShielded} />
                  <div className="grid h-full min-h-0 place-items-end justify-self-end overflow-hidden">
                    <CompactActiveBattleCard card={computerActive} side="computer" />
                  </div>
                </div>
              </section>

              <section className="h-[39%] shrink-0 overflow-hidden px-6 pb-5">
                <div className="grid h-full min-h-0 w-full grid-cols-[minmax(440px,0.95fr)_minmax(560px,1.2fr)_minmax(440px,0.95fr)] items-end gap-4 overflow-hidden">
                  <BattleCardDeck
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
                  <BattleCardDeck
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
            <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-100">Battle Result</p>
            <p className="mt-4 text-5xl font-black text-white">{winner === "player" ? "你贏了" : "電腦勝利"}</p>
            <p className="mt-4 text-base font-semibold leading-7 text-slate-400">{turn.message}</p>
            <div className="mt-8 flex justify-center gap-3">
              <button type="button" onClick={enterDraftRoom} className="min-h-12 rounded-2xl border border-cyan-300/40 bg-cyan-300 px-5 text-sm font-black text-slate-950">重新對戰</button>
              <button type="button" onClick={resetBattle} className="min-h-12 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-5 text-sm font-black text-slate-200">返回一般模式</button>
            </div>
          </div>
        </div>
      </BattlePageShell>
    );
  }

  return (
    <BattlePageShell eyebrow="Normal Battle" title="一般模式" onBack={onBack}>
      <div className="grid flex-1 content-center gap-5 py-10">
        <RoleGuidePanel />
        <div className="rounded-[26px] border border-cyan-300/20 bg-cyan-300/10 px-5 py-4">
          <p className="text-sm font-black text-cyan-100">職業定位只作為組隊參考</p>
          <p className="mt-2 text-base font-semibold text-slate-300">新增電腦後將進入 3v3 輪抽，再進行 1v1 回合對戰。目前支援 {availablePokemon.length} 張可對戰卡片。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <button type="button" onClick={enterDraftRoom} className="group relative min-h-40 overflow-hidden rounded-[26px] border border-cyan-300/35 bg-cyan-300/10 p-6 text-left transition hover:border-cyan-200/70">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300 text-slate-950">
                <Cpu size={24} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">新增電腦</p>
                <p className="mt-1 text-sm font-semibold text-slate-400">進入 3v3 輪抽，完成後開始回合對戰。</p>
              </div>
            </div>
          </button>
          <button type="button" className="group relative min-h-40 overflow-hidden rounded-[26px] border border-slate-700/80 bg-slate-950/55 p-6 text-left opacity-60">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-slate-300">
                <UserPlus size={24} />
              </div>
              <div>
                <p className="text-2xl font-black text-white">邀請玩家</p>
                <p className="mt-1 text-sm font-semibold text-slate-400">多人配對功能尚未開放。</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </BattlePageShell>
  );
}

function PokedexPage({ onBack }: { onBack: () => void }) {
  const [selectedPokemon, setSelectedPokemon] = useState<(typeof pokedexPreviewCards)[number] | undefined>(pokedexPreviewCards[0]);
  const [selectedTypeFilters, setSelectedTypeFilters] = useState<PokemonType[]>([]);
  const [pendingTypeFilters, setPendingTypeFilters] = useState<PokemonType[]>([]);
  const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<PokedexRoleFilter>("all");
  const [selectedDetailTab, setSelectedDetailTab] = useState<PokedexDetailTab>("basic");
  const filteredPokedexCards = useMemo(() => {
    const hasActiveFilter = selectedTypeFilters.length > 0 || selectedRoleFilter !== "all";

    if (!hasActiveFilter) return pokedexPreviewCards;

    return pokedexPreviewCards.filter((pokemon) => {
      const battlePokemon = getPokemonById(pokemon.id);
      if (!battlePokemon) return false;

      const matchesType = selectedTypeFilters.length === 0 || selectedTypeFilters.every((type) => battlePokemon.types.includes(type));
      const roles = [battlePokemon.role, ...(battlePokemon.secondary_roles ?? [])];
      const matchesRole = selectedRoleFilter === "all" || roles.includes(selectedRoleFilter);

      return matchesType && matchesRole;
    });
  }, [selectedRoleFilter, selectedTypeFilters]);
  const selectedBattlePokemon = selectedPokemon ? getPokemonById(selectedPokemon.id) : undefined;
  const selectedSkills = selectedBattlePokemon ? getPokemonSkills(selectedBattlePokemon) : [];
  const selectedProfile = getPokedexProfile(selectedBattlePokemon);
  const selectedWeaknesses = selectedBattlePokemon ? getWeaknessTypes(selectedBattlePokemon.types) : [];
  const selectedStats = selectedBattlePokemon
    ? [
        { label: "HP", value: `${selectedBattlePokemon.hp}/${selectedBattlePokemon.max_hp}` },
        { label: "攻擊", value: selectedBattlePokemon.attack },
        { label: "防禦", value: selectedBattlePokemon.defense },
        { label: "速度", value: selectedBattlePokemon.speed },
      ]
    : [];

  useEffect(() => {
    if (filteredPokedexCards.length === 0) {
      setSelectedPokemon(undefined);
      return;
    }

    if (!selectedPokemon || !filteredPokedexCards.some((pokemon) => pokemon.id === selectedPokemon.id && pokemon.filename === selectedPokemon.filename)) {
      setSelectedPokemon(filteredPokedexCards[0]);
    }
  }, [filteredPokedexCards, selectedPokemon]);

  const openTypeFilterDialog = () => {
    setPendingTypeFilters(selectedTypeFilters);
    setIsTypeFilterOpen(true);
  };

  const togglePendingTypeFilter = (type: PokemonType) => {
    setPendingTypeFilters((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      if (current.length >= 2) return current;
      return [...current, type];
    });
  };

  const applyTypeFilter = () => {
    setSelectedTypeFilters(pendingTypeFilters);
    setIsTypeFilterOpen(false);
  };

  return (
    <div className="h-screen overflow-hidden px-3 py-3 text-slate-100">
      <motion.section initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} className="glass-panel relative min-h-full overflow-hidden rounded-[30px] p-5">
        <div className="arena-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative z-10 flex min-h-full flex-col">
          <header className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200">Pokemon Database</p>
              <h1 className="mt-1 text-5xl font-black tracking-tight text-white">圖鑑</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100">顯示 {filteredPokedexCards.length} / {pokedexTotalCount}</span>
              <button type="button" onClick={onBack} className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
                <ArrowLeft size={18} />
                返回大廳
              </button>
            </div>
          </header>

          <div className="mb-4 grid grid-cols-[minmax(760px,1.3fr)_minmax(360px,0.9fr)] gap-5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {pokedexRoleFilterOptions.map((role) => {
                  const isActive = selectedRoleFilter === role;
                  const label = role === "all" ? "全部" : roleDefinitions[role].name;

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRoleFilter(role)}
                      className={[
                        "min-h-10 rounded-full px-4 text-sm font-black transition",
                        isActive
                          ? "bg-cyan-300 text-slate-950 shadow-[0_0_16px_rgba(103,232,249,0.32)]"
                          : "bg-transparent text-slate-400 hover:text-cyan-100",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={openTypeFilterDialog}
                className="flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-transparent text-sm font-black text-slate-400 transition hover:text-cyan-100"
              >
                {selectedTypeFilters.length > 0 ? (
                  selectedTypeFilters.map((type) => (
                    <span
                      key={type}
                      className={["w-20 rounded-full border px-0 py-2 text-center text-sm font-black shadow-[0_0_12px_rgba(255,255,255,0.14)]", getTypeChipClass(type)].join(" ")}
                    >
                      {getTypeLabel(type)}
                    </span>
                  ))
                ) : (
                  <span className="w-20 rounded-full px-0 py-2 text-center">全部屬性</span>
                )}
                <ChevronRight size={15} className={["transition", isTypeFilterOpen ? "rotate-90" : ""].join(" ")} />
              </button>
            </div>
            <div />
          </div>

          <div className="grid h-[calc(100vh-190px)] min-h-[580px] grid-cols-[minmax(760px,1.3fr)_minmax(360px,0.9fr)] gap-5">
            <section className="relative min-h-0 overflow-hidden rounded-[28px] border border-slate-700/80 bg-slate-950/35 p-4">
              <AnimatePresence>
                {isTypeFilterOpen && (
                  <motion.div
                    role="dialog"
                    aria-label="選擇屬性"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.18 }}
                    className="absolute left-4 right-4 top-4 z-30 h-[calc(50%-1rem)] overflow-hidden rounded-[24px] border border-cyan-300/30 bg-[#06121f]/95 shadow-[0_18px_60px_rgba(0,0,0,0.48),0_0_30px_rgba(56,189,248,0.14)] backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-5 py-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Type Filter</p>
                        <p className="mt-1 text-sm font-bold text-slate-400">最多選擇兩個屬性</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingTypeFilters([])}
                          className="rounded-full px-4 py-2 text-xs font-black text-slate-300 transition hover:text-cyan-100"
                        >
                          全部屬性
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTypeFilterOpen(false)}
                          className="grid size-9 place-items-center rounded-full text-slate-300 transition hover:bg-slate-900/80 hover:text-white"
                          aria-label="關閉"
                        >
                          <X size={17} />
                        </button>
                      </div>
                    </div>

                    <div className="grid h-[calc(100%-72px)] content-between gap-4 overflow-y-auto px-5 py-4">
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                        {pokemonTypeFilterOptions.map((type) => {
                          const isActive = pendingTypeFilters.includes(type);
                          const isDisabled = !isActive && pendingTypeFilters.length >= 2;

                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => togglePendingTypeFilter(type)}
                              disabled={isDisabled}
                              className={[
                                "min-h-10 w-20 rounded-full border text-sm font-black transition",
                                isActive
                                  ? getTypeChipClass(type) + " shadow-[0_0_14px_rgba(255,255,255,0.18)]"
                                  : "border-slate-700/80 bg-slate-950/55 text-slate-300 hover:border-cyan-300/45 hover:text-cyan-100",
                                isDisabled ? "cursor-not-allowed opacity-35 hover:border-slate-700/80 hover:text-slate-300" : "",
                              ].join(" ")}
                            >
                              {getTypeLabel(type)}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setIsTypeFilterOpen(false)}
                          className="min-h-10 rounded-2xl px-5 text-sm font-black text-slate-300 transition hover:text-white"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={applyTypeFilter}
                          className="min-h-10 rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.26)] transition hover:bg-cyan-200"
                        >
                          確定
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-full overflow-y-auto pr-2">
                {filteredPokedexCards.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,190px)] justify-start gap-4">
                  {filteredPokedexCards.map((pokemon, index) => {
                      const battlePokemon = getPokemonById(pokemon.id);

                      return (
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
                          className="group relative h-[276px] w-[190px] cursor-pointer transition"
                        >
                          <PokemonDisplayCard
                            pokemon={battlePokemon ?? {
                              id: pokemon.id,
                              name: pokemon.name,
                              name_zh: pokemon.name,
                              types: ["Normal"],
                              role: "fighter",
                              role_zh: "鬥士",
                              role_description_zh: "",
                              ability_id: "inner_focus",
                              ability_zh: "精神力",
                              ability_description_zh: "攻擊傷害提高 8%。",
                              level: 1,
                              rarity: 1,
                              hp: 1,
                              max_hp: 1,
                              attack: 1,
                              defense: 1,
                              speed: 1,
                              power: 1,
                              enabled_battle: false,
                              card_image: "",
                              battle_image: "",
                              reference_image: pokemon.imagePath,
                              skill_ids: [],
                            }}
                            imageSrc={pokemon.imagePath}
                            selected={selectedPokemon?.id === pokemon.id && selectedPokemon.filename === pokemon.filename}
                          />
                        </motion.article>
                      );
                    })}
                </div>
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <p className="text-2xl font-black text-white">沒有符合條件的寶可夢</p>
                      <p className="mt-2 text-sm font-semibold text-slate-500">請調整屬性或職業篩選。</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <aside className="sticky top-3 h-[calc(100vh-190px)] min-h-0 overflow-hidden rounded-[28px] border border-slate-700/80 bg-slate-950/45 p-5 pt-8">
              {selectedPokemon ? (
              <>
              <div className="relative grid h-[42%] min-h-0 place-items-center rounded-[28px] border border-slate-700/80 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),rgba(15,23,42,0.25)_58%,rgba(2,6,23,0.55))] p-6">
                <div className="absolute left-6 top-5">
                  <h3 className="text-2xl font-black text-white">{selectedBattlePokemon?.name_zh ?? selectedPokemon.name}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">{selectedBattlePokemon?.name ?? selectedPokemon.filename}</p>
                </div>
                <span className="absolute right-6 top-5 rounded-full bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100">#{selectedPokemon.id.toString().padStart(3, "0")}</span>
                <img src={selectedPokemon.imagePath} alt={selectedPokemon.name} width={256} height={256} className="h-full max-h-72 w-full object-contain drop-shadow-[0_24px_42px_rgba(0,0,0,0.65)]" />
              </div>

              <div className="mt-4 flex h-[calc(58%-2rem)] min-h-0 flex-col rounded-[24px] border border-slate-700/80 bg-slate-900/70 p-4">
                <div className="grid grid-cols-5 gap-2">
                  {pokedexDetailTabs.map((tab) => {
                    const isActive = selectedDetailTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedDetailTab(tab.id)}
                        className={[
                          "min-h-10 rounded-2xl text-sm font-black transition",
                          isActive ? "bg-cyan-300 text-slate-950 shadow-[0_0_16px_rgba(103,232,249,0.28)]" : "bg-slate-950/45 text-slate-400 hover:text-cyan-100",
                        ].join(" ")}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {selectedBattlePokemon && (
                  <div className="mt-4 min-h-0 flex-1 overflow-hidden px-2 py-1">
                    {selectedDetailTab === "basic" && (
                      <div className="grid h-full grid-cols-2 content-start gap-3">
                        {[
                          { label: "身高", value: selectedProfile.height },
                          { label: "體重", value: selectedProfile.weight },
                          { label: "性別", value: selectedProfile.gender },
                          { label: "特性", value: getAbilityLabel(selectedBattlePokemon), description: getAbilityDescription(selectedBattlePokemon) },
                        ].map((item) => (
                          <div key={item.label} className="p-3">
                            <p className="text-xs font-black tracking-[0.2em] text-slate-500">{item.label}</p>
                            <p className="mt-2 text-lg font-black text-white">{item.value}</p>
                            {"description" in item && item.description ? <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{item.description}</p> : null}
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDetailTab === "types" && (
                      <div className="grid gap-5">
                        <div>
                          <p className="text-xs font-black tracking-[0.2em] text-slate-500">屬性</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedBattlePokemon.types.map((type) => (
                              <span key={type} className={["w-20 rounded-full border px-0 py-2 text-center text-sm font-black", getTypeChipClass(type)].join(" ")}>{getTypeLabel(type)}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.2em] text-slate-500">弱點</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedWeaknesses.length > 0 ? selectedWeaknesses.map((type) => (
                              <span key={type} className={["w-20 rounded-full border px-0 py-2 text-center text-sm font-black", getTypeChipClass(type)].join(" ")}>{getTypeLabel(type)}</span>
                            )) : <span className="text-sm font-bold text-slate-400">無明顯弱點</span>}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedDetailTab === "stats" && (
                      <div className="grid gap-3">
                        {selectedStats.map((stat) => (
                          <div key={stat.label} className="grid grid-cols-[72px_1fr_54px] items-center gap-3">
                            <p className="text-xs font-black tracking-[0.18em] text-slate-500">{stat.label}</p>
                            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.36)]" style={{ width: getStatPercent(Number(stat.value.toString().split("/")[0])) }} />
                            </div>
                            <p className="text-right text-sm font-black text-slate-200">{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDetailTab === "skills" && (
                      <div className="grid h-full auto-rows-fr grid-cols-2 gap-3">
                        {selectedSkills.map((skill) => (
                          <div key={skill.id} className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-black text-white">{skill.name_zh || skill.name}</p>
                              <span className={["rounded-full border px-2 py-0.5 text-[10px] font-black", getTypeChipClass(skill.type)].join(" ")}>{getTypeLabel(skill.type)}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-slate-400">{skill.description_zh}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedDetailTab === "evolution" && (
                      <div className="grid h-full place-items-center text-center">
                        <div>
                          <p className="text-xl font-black text-white">進化</p>
                          <p className="mt-2 text-sm font-semibold text-slate-500">進化資料保留，後續可接入完整圖鑑鏈。</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </>
              ) : (
                <div className="grid h-full min-h-[420px] place-items-center text-center">
                  <div>
                    <p className="text-2xl font-black text-white">尚未選取寶可夢</p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">目前篩選沒有可顯示的戰鬥資料。</p>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

