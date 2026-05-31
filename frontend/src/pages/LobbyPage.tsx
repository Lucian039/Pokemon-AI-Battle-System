import { AnimatePresence, motion } from "framer-motion";
import AITrainingPage, { type TrainingModelApplyPayload } from "./AITrainingPage";
import MatchStrategyTrainingPage from "./MatchStrategyTrainingPage";
import BattleLoadingPage from "./BattleLoadingPage";
import type { Transition } from "framer-motion";
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
import type * as tf from "@tensorflow/tfjs";
import { pokedexPreviewCards, pokedexTotalCount } from "../data/pokedexMock";
import { getRoleDefinition, roleDefinitions, roleOrder } from "../data/role_definitions";
import { getAbilityDefinition, lowHpBoostAbilityTypes } from "../data/ability_definitions";
import typeChartData from "../data/type_chart.json";
import { LearningAgent } from "../training/learningAgent";
import {
  calculateDamage,
  canUseSkill,
  DEFAULT_STAMINA,
  GENERIC_SHIELD_DAMAGE_REDUCTION,
  getBattleEnabledPokemon,
  getBurnDamage,
  getPokemonById,
  getPokemonSkills,
  getSkillById,
  getSkillStaminaCost,
  healBattleCard,
  recoverStamina,
  REST_STAMINA_RECOVERY,
  SHIELD_STAMINA_COST,
  SKILL_SHIELD_DAMAGE_REDUCTION,
  SWITCH_STAMINA_COST,
  TURN_STAMINA_RECOVERY,
} from "../utils/battleCalculator";
import { getLegalActions } from "../utils/battleEngine";
import type {
  BattleAction,
  BattleCardState,
  BattleEnvState,
  BattleParticipant,
  BattleSide,
  BattleTurnState,
  DraftPickSide,
  PokemonRole,
  PokemonStats,
  PokemonType,
  Skill,
} from "../types/battle";

type CurrentPage = "lobby" | "pokedex" | "ranked" | "normalBattle" | "aiTraining";
type NormalBattlePhase = "normalBattleRoom" | "draftSelection" | "battleLoading" | "leadSelection" | "battleArena" | "roundResult" | "battleResult";
type PokedexRoleFilter = "all" | PokemonRole;
type PokedexDetailTab = "basic" | "types" | "stats" | "skills" | "evolution";
type TypeChart = Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>>;
type ComputerDifficulty = "beginner" | "normal" | "hard" | "master" | "hell";
type ComputerBattleMode = ComputerDifficulty | "random";
type AppliedModelLoadStatus = "idle" | "loading" | "ready" | "error";

type AppliedTrainingModel = TrainingModelApplyPayload;

const APPLIED_TRAINING_MODEL_STORAGE_KEY = "pokemon-applied-training-model-v1";

function loadAppliedTrainingModel(): AppliedTrainingModel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(APPLIED_TRAINING_MODEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppliedTrainingModel>;
    if (!parsed.id || !parsed.name || !parsed.difficulty || !parsed.computerDifficulty) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      difficulty: parsed.difficulty,
      computerDifficulty: parsed.computerDifficulty,
    };
  } catch {
    return null;
  }
}

function saveAppliedTrainingModel(model: AppliedTrainingModel | null) {
  if (typeof window === "undefined") return;
  if (!model) {
    window.localStorage.removeItem(APPLIED_TRAINING_MODEL_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(APPLIED_TRAINING_MODEL_STORAGE_KEY, JSON.stringify(model));
}

interface TrainingModelArtifactsPayload {
  modelTopology: tf.io.ModelJSON["modelTopology"];
  weightSpecs: tf.io.WeightsManifestEntry[];
  weightDataBase64: string;
}

interface BattleParticipants {
  player: BattleParticipant;
  computer: BattleParticipant;
}

interface RoundWins {
  player: number;
  computer: number;
}

interface PendingAllySkill {
  skill: Skill;
  side: BattleSide;
}

interface PendingSwitchTarget {
  side: BattleSide;
  forced?: boolean;
  nextTurnSide?: BattleSide;
  message?: string;
}

interface LeadSelectionState {
  playerIndex: number | null;
  computerIndex: number | null;
  playerLocked: boolean;
  computerLocked: boolean;
  revealed: boolean;
}

type BattleAnimationPhase = "card" | "banner" | "impact" | "ability" | "handoff";
type BattleStartIntroPhase = "start" | "handoff";

interface BattleAnimationState {
  actionType?: "skill" | "switch" | "shield" | "rest";
  phase: BattleAnimationPhase;
  attackerSide: BattleSide;
  defenderSide: BattleSide;
  attackerName: string;
  defenderName: string;
  skill: Skill;
  damage: number;
  typeMultiplier: number;
  effectivenessText: string;
  isHit: boolean;
  message: string;
  finalMessage: string;
  abilityMessages: string[];
  nextParticipants: BattleParticipants;
  consumePlayerShield?: boolean;
  healTarget?: {
    side: BattleSide;
    index: number;
    amount: number;
  };
  skipHandoff?: boolean;
  actionTitle?: string;
  actionSubtitle?: string;
  effectLabel?: string;
  displayPokemon?: PokemonStats;
  switchEntryPokemonId?: number;
  nextTurnSide?: BattleSide;
}

const REQUIRED_TEAM_SIZE = 3;
const MATCH_WIN_TARGET = 2;
const DRAFT_SECONDS = 60;
const CPU_PICK_PREVIEW_SECONDS = 58;
const CPU_PICK_LOCK_SECONDS = 56;
const BATTLE_READY_SECONDS = 10;
const BATTLE_LOADING_DELAY_MS = 2000;
const LEAD_SELECTION_SECONDS = 30;
const CPU_LEAD_LOCK_DELAY_MS = 1500;
const LEAD_SELECTION_REVEAL_MS = 3600;
const COMPUTER_ACTION_DELAY_MS = 4000;
const TURN_SECONDS = 20;
const INTER_ROUND_SECONDS = 3;
const BATTLE_ANIMATION_CARD_MS = 1000;
const BATTLE_ANIMATION_IMPACT_MS = 2000;
const BATTLE_ANIMATION_HANDOFF_MS = 4500;
const BATTLE_ANIMATION_ABILITY_DURATION_MS = 1200;
const BATTLE_ANIMATION_HANDOFF_DURATION_MS = 1800;
const BATTLE_ANIMATION_CLEAR_DELAY_MS = 260;
const BATTLE_START_INTRO_START_MS = 1300;
const BATTLE_START_INTRO_HANDOFF_MS = 1200;
const BASIC_ATTACK_POWER = 30;
const BASIC_ATTACK_STAMINA_COST = 10;
const TRAINING_API_BASE = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TRAINING_API_BASE ?? "http://127.0.0.1:18053").replace(/\/$/, "");

const computerDifficultyOptions: Record<ComputerDifficulty, { label: string; description: string; className: string; selectedClassName: string }> = {
  beginner: {
    label: "入門",
    description: "電腦會保留較多隨機行動，適合測試隊伍。",
    className: "border-emerald-300/35 bg-emerald-300/8 text-emerald-100 hover:border-emerald-200/65 hover:bg-emerald-300/14",
    selectedClassName: "border-emerald-200 bg-emerald-300 text-slate-950 shadow-[0_0_26px_rgba(52,211,153,0.28)]",
  },
  normal: {
    label: "中等",
    description: "維持一般策略，會攻擊、治療與護盾。",
    className: "border-cyan-300/35 bg-cyan-300/8 text-cyan-100 hover:border-cyan-200/65 hover:bg-cyan-300/14",
    selectedClassName: "border-cyan-200 bg-cyan-300 text-slate-950 shadow-[0_0_26px_rgba(34,211,238,0.28)]",
  },
  hard: {
    label: "困難",
    description: "優先挑高戰力隊伍，並選擇更高傷害技能。",
    className: "border-rose-300/35 bg-rose-300/8 text-rose-100 hover:border-rose-200/65 hover:bg-rose-300/14",
    selectedClassName: "border-rose-200 bg-rose-300 text-slate-950 shadow-[0_0_26px_rgba(251,113,133,0.28)]",
  },
  master: {
    label: "大師",
    description: "穩定挑選頂端隊伍，更積極使用治療、護盾與高傷害技能。",
    className: "border-orange-300/35 bg-orange-300/8 text-orange-100 hover:border-orange-200/65 hover:bg-orange-300/14",
    selectedClassName: "border-orange-200 bg-orange-300 text-slate-950 shadow-[0_0_26px_rgba(251,146,60,0.30)]",
  },
  hell: {
    label: "地獄",
    description: "鎖定最高戰力隊伍，幾乎只選擇當下最有利的行動。",
    className: "border-red-300/35 bg-red-300/8 text-red-100 hover:border-red-200/65 hover:bg-red-300/14",
    selectedClassName: "border-red-200 bg-red-400 text-white shadow-[0_0_28px_rgba(248,113,113,0.34)]",
  },
};

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
function base64ToArrayBuffer(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
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
  return [getRoleDefinition(pokemon.role)];
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

function getAdvantageTypes(attackerTypes: PokemonType[]) {
  return pokemonTypeFilterOptions.filter((defenderType) =>
    attackerTypes.some((attackType) => (typeChart[attackType]?.[defenderType] ?? 1) > 1),
  );
}

function getSuperEffectiveCombos(attackerTypes: PokemonType[]) {
  const comboKeys = new Set<string>();
  const combos: Array<{ attackType: PokemonType; defenderTypes: [PokemonType, PokemonType] }> = [];

  attackerTypes.forEach((attackType) => {
    pokemonTypeFilterOptions.forEach((firstType, firstIndex) => {
      pokemonTypeFilterOptions.slice(firstIndex + 1).forEach((secondType) => {
        const multiplier = (typeChart[attackType]?.[firstType] ?? 1) * (typeChart[attackType]?.[secondType] ?? 1);
        const comboKey = `${attackType}-${firstType}-${secondType}`;

        if (multiplier >= 4 && !comboKeys.has(comboKey)) {
          comboKeys.add(comboKey);
          combos.push({
            attackType,
            defenderTypes: [firstType, secondType],
          });
        }
      });
    });
  });

  return combos;
}

function getTypeMultiplier(attackType: PokemonType, defenderTypes: PokemonType[]) {
  return defenderTypes.reduce((total, defenderType) => total * (typeChart[attackType]?.[defenderType] ?? 1), 1);
}

function getAttackAdvantages(attackType: PokemonType) {
  return pokemonTypeFilterOptions
    .map((defenderType) => ({ defenderType, multiplier: getTypeMultiplier(attackType, [defenderType]) }))
    .filter((item) => item.multiplier > 1);
}

function getBestAttackAdvantages(attackTypes: PokemonType[]) {
  return pokemonTypeFilterOptions
    .map((defenderType) => {
      const best = attackTypes
        .map((attackType) => ({ attackType, multiplier: getTypeMultiplier(attackType, [defenderType]) }))
        .sort((left, right) => right.multiplier - left.multiplier)[0];
      return { defenderType, attackType: best.attackType, multiplier: best.multiplier };
    })
    .filter((item) => item.multiplier > 1);
}

function getAttackSuperEffectiveCombos(attackType: PokemonType) {
  const combos: Array<{ defenderTypes: [PokemonType, PokemonType]; multiplier: number }> = [];

  pokemonTypeFilterOptions.forEach((firstType, firstIndex) => {
    pokemonTypeFilterOptions.slice(firstIndex + 1).forEach((secondType) => {
      const multiplier = getTypeMultiplier(attackType, [firstType, secondType]);
      if (multiplier >= 4) combos.push({ defenderTypes: [firstType, secondType], multiplier });
    });
  });

  return combos;
}

function getBestAttackSuperEffectiveCombos(attackTypes: PokemonType[]) {
  const combos: Array<{ attackType: PokemonType; defenderTypes: [PokemonType, PokemonType]; multiplier: number }> = [];

  pokemonTypeFilterOptions.forEach((firstType, firstIndex) => {
    pokemonTypeFilterOptions.slice(firstIndex + 1).forEach((secondType) => {
      const best = attackTypes
        .map((attackType) => ({ attackType, multiplier: getTypeMultiplier(attackType, [firstType, secondType]) }))
        .sort((left, right) => right.multiplier - left.multiplier)[0];
      if (best.multiplier >= 4) combos.push({ attackType: best.attackType, defenderTypes: [firstType, secondType], multiplier: best.multiplier });
    });
  });

  return combos;
}

function getDefensiveWeaknesses(defenderType: PokemonType) {
  return pokemonTypeFilterOptions
    .map((attackType) => ({ attackType, multiplier: getTypeMultiplier(attackType, [defenderType]) }))
    .filter((item) => item.multiplier > 1);
}

function getDefensiveWeaknessesForTypes(defenderTypes: PokemonType[]) {
  return pokemonTypeFilterOptions
    .map((attackType) => ({ attackType, multiplier: getTypeMultiplier(attackType, defenderTypes) }))
    .filter((item) => item.multiplier > 1);
}

function formatTypeMultiplier(multiplier: number) {
  return `x${Number.isInteger(multiplier) ? multiplier.toFixed(0) : multiplier.toFixed(2)}`;
}

function getMultiplierTone(multiplier: number) {
  if (multiplier >= 4) return "text-orange-100";
  if (multiplier > 1) return "text-emerald-100";
  if (multiplier === 0) return "text-slate-400";
  if (multiplier < 1) return "text-sky-100";
  return "text-white";
}

function getMultiplierLabel(multiplier: number) {
  if (multiplier >= 4) return "超級克制";
  if (multiplier > 1) return "克制";
  if (multiplier === 0) return "無效";
  if (multiplier < 1) return "效果不好";
  return "一般";
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

function PokemonDisplayCard({
  pokemon,
  imageSrc,
  selected = false,
  defeated = false,
  active = false,
  compact = false,
  hideTypeChips = false,
  tone,
}: {
  pokemon: PokemonStats;
  imageSrc: string;
  selected?: boolean;
  defeated?: boolean;
  active?: boolean;
  compact?: boolean;
  hideTypeChips?: boolean;
  tone?: BattleSide;
}) {
  const cardPadding = compact ? "p-1.5" : "p-2";
  const nameSize = compact ? "text-xs" : "text-base";
  const numberSize = compact ? "text-[10px]" : "text-sm";
  const imageSize = compact ? "h-[68%] w-[68%]" : "h-[72%] w-[72%]";
  const chipSize = compact ? "min-w-10 px-2 py-0.5 text-[9px]" : "min-w-14 px-3 py-1 text-xs";
  const iconSize = compact ? "w-[82%]" : "w-[84%]";
  const highlighted = selected || active;
  const selectionToneClass =
    tone === "computer"
      ? highlighted
        ? "border-rose-400/80 bg-rose-400/14 shadow-[0_0_38px_rgba(244,63,94,0.34)]"
        : "border-rose-400/55 bg-rose-400/10 shadow-[0_0_18px_rgba(244,63,94,0.14)]"
      : highlighted
        ? "border-cyan-300/80 bg-cyan-300/14 shadow-glow"
        : "border-cyan-300/55 bg-cyan-300/10 shadow-[0_0_18px_rgba(34,211,238,0.14)]";
  const defaultToneClass = highlighted ? "border-sky-300/85 shadow-[0_0_22px_rgba(125,190,255,0.36)]" : "border-sky-300/55";
  const battleImageGlow =
    tone === "computer"
      ? "bg-[radial-gradient(circle_at_50%_42%,rgba(244,63,94,0.22),rgba(15,23,42,0.76)_58%,rgba(2,6,23,0.96)_80%)]"
      : "bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.24),rgba(15,23,42,0.76)_58%,rgba(2,6,23,0.96)_80%)]";
  const battleCoreGlow =
    tone === "computer"
      ? "bg-[radial-gradient(circle_at_42%_34%,rgba(255,205,216,0.22),rgba(244,63,94,0.18)_48%,rgba(3,12,19,0.48)_76%)] shadow-[inset_0_18px_28px_rgba(255,255,255,0.05),inset_0_-24px_34px_rgba(0,0,0,0.52),0_0_28px_rgba(244,63,94,0.2)]"
      : "bg-[radial-gradient(circle_at_42%_34%,rgba(201,241,238,0.24),rgba(34,211,238,0.18)_48%,rgba(3,12,19,0.48)_76%)] shadow-[inset_0_18px_28px_rgba(255,255,255,0.06),inset_0_-24px_34px_rgba(0,0,0,0.52),0_0_28px_rgba(34,211,238,0.22)]";
  const numberToneClass = tone === "computer" ? "text-rose-100" : tone ? "text-cyan-100" : "text-sky-200";

  return (
    <div
      className={[
        "relative flex h-full w-full flex-col overflow-hidden rounded-[20px] border text-left transition",
        tone ? selectionToneClass : ["bg-[#061622] shadow-[0_0_18px_rgba(125,190,255,0.18)]", defaultToneClass].join(" "),
        defeated ? "grayscale opacity-55" : "",
      ].join(" ")}
    >
      <div className={["relative grid min-h-0 flex-[1.25] place-items-center overflow-hidden", cardPadding].join(" ")}>
        <div className={["absolute inset-0", tone ? battleImageGlow : "bg-[radial-gradient(circle_at_50%_42%,rgba(83,166,202,0.32),rgba(7,22,34,0.86)_56%,rgba(3,11,18,0.98)_78%)]"].join(" ")} />
        <div className={["absolute aspect-square w-[78%] rounded-full", tone ? battleCoreGlow : "bg-[radial-gradient(circle_at_42%_34%,rgba(201,241,238,0.24),rgba(71,131,150,0.22)_48%,rgba(3,12,19,0.48)_76%)] shadow-[inset_0_18px_28px_rgba(255,255,255,0.06),inset_0_-24px_34px_rgba(0,0,0,0.52),0_0_26px_rgba(119,216,241,0.18)]"].join(" ")} />
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

      <div className={["relative flex flex-[0.85] flex-col border-t px-4 pb-4 pt-3 shadow-[inset_0_14px_28px_rgba(93,169,215,0.12)]", tone ? "border-white/10 bg-slate-950/70" : "border-sky-100/70 bg-[linear-gradient(180deg,rgba(11,30,45,0.98),rgba(8,19,29,0.98))]"].join(" ")}>
        <div className={["absolute -top-px left-[34%] h-4 w-[32%] rounded-b-full border-b border-l border-r", tone ? "border-white/10 bg-slate-950/70" : "border-sky-100/70 bg-[#061622]"].join(" ")} />
        <p className={["font-black leading-none", numberToneClass, numberSize].join(" ")}>{pokemon.id.toString().padStart(4, "0")}</p>
        <h3 className={["mt-2 truncate font-black leading-tight text-white", nameSize].join(" ")}>{getPokemonLabel(pokemon)}</h3>
        {!hideTypeChips && (
          <div className="mt-auto flex items-center justify-center gap-3">
            {pokemon.types.map((type) => (
              <span key={type} className={["rounded-full border text-center font-black shadow-[0_0_10px_rgba(255,255,255,0.22)]", chipSize, getTypeChipClass(type)].join(" ")}>
                {getTypeLabel(type)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function createBattleCard(pokemon: PokemonStats): BattleCardState {
  return { pokemon, currentHp: pokemon.max_hp, currentStamina: DEFAULT_STAMINA, maxStamina: DEFAULT_STAMINA };
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

function cloneParticipants(participants: BattleParticipants): BattleParticipants {
  return {
    player: { ...participants.player, team: participants.player.team.map((card) => ({ ...card })) },
    computer: { ...participants.computer, team: participants.computer.team.map((card) => ({ ...card })) },
  };
}

function createSwitchSkill(target: BattleCardState): Skill {
  return {
    id: `switch-${target.pokemon.id}`,
    name: "Switch Pokemon",
    name_zh: "更換夥伴",
    type: target.pokemon.types[0] ?? "Normal",
    category: "buff",
    power: 0,
    accuracy: 100,
    effect: "none",
    target: "self",
    description_zh: "更換目前出戰夥伴。",
  };
}

function createRestSkill(card: BattleCardState): Skill {
  return {
    id: "rest_action",
    name: "Rest",
    name_zh: "休息",
    type: card.pokemon.types[0] ?? "Normal",
    category: "buff",
    power: 0,
    accuracy: 100,
    effect: "none",
    target: "self",
    description_zh: "回復 40 體力並交出回合。",
  };
}

function createBasicAttackSkill(card: BattleCardState): Skill {
  return {
    id: "basic_attack",
    name: "Basic Attack",
    name_zh: "普通攻擊",
    type: card.pokemon.types[0] ?? "Normal",
    category: "attack",
    power: BASIC_ATTACK_POWER,
    accuracy: 100,
    effect: "none",
    target: "enemy",
    description_zh: "以目前出戰寶可夢的主要屬性進行基礎攻擊。",
  };
}

function findMostInjuredLivingIndex(team: BattleCardState[]) {
  let bestIndex = -1;
  let bestMissingHp = 0;

  team.forEach((card, index) => {
    const missingHp = card.currentHp > 0 ? card.pokemon.max_hp - card.currentHp : 0;
    if (missingHp > bestMissingHp) {
      bestMissingHp = missingHp;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function consumeActionBlocker(card: BattleCardState) {
  if ((card.asleepTurns ?? 0) > 0) {
    card.asleepTurns = 0;
    return "睡眠中，這次行動失敗。";
  }

  if ((card.paralyzedTurns ?? 0) > 0) {
    card.paralyzedTurns = 0;
    if (Math.random() < 0.25) return "受到麻痺影響，這次行動失敗。";
  }

  return "";
}

function getCpuDraftScore(pokemon: PokemonStats) {
  return pokemon.power * 2 + pokemon.max_hp * 0.45 + pokemon.speed * 0.8 + pokemon.rarity * 18;
}

function chooseComputerDraftPokemon(availablePokemon: PokemonStats[], mode: ComputerBattleMode) {
  if (availablePokemon.length === 0) return undefined;
  const ranked = [...availablePokemon].sort((left, right) => getCpuDraftScore(right) - getCpuDraftScore(left));

  if (mode === "hell") return ranked[0];
  if (mode === "master") return ranked[Math.floor(Math.random() * Math.min(2, ranked.length))];
  if (mode === "hard") return ranked[Math.floor(Math.random() * Math.min(3, ranked.length))];
  if (mode === "beginner") {
    const lowerHalf = ranked.slice(Math.floor(ranked.length / 2));
    return lowerHalf[Math.floor(Math.random() * lowerHalf.length)] ?? ranked[ranked.length - 1];
  }

  return availablePokemon[Math.floor(Math.random() * availablePokemon.length)];
}

function getBestUsableAttackScore(attacker: BattleCardState, defender: BattleCardState) {
  return getPokemonSkills(attacker.pokemon)
    .filter((skill) => skill.category === "attack" && canUseSkill(attacker, skill))
    .map((skill) => {
      const result = calculateDamage(attacker.pokemon, defender.pokemon, skill);
      return result.isHit ? result.damage * result.typeMultiplier : 0;
    })
    .reduce((best, score) => Math.max(best, score), 0);
}

function getComputerSwitchMargin(mode: ComputerBattleMode) {
  if (mode === "hell") return 10;
  if (mode === "master") return 14;
  if (mode === "hard") return 20;
  if (mode === "normal") return 26;
  return 999;
}

function chooseComputerSwitchIndex(participant: BattleParticipant, opponentActive: BattleCardState, mode: ComputerBattleMode) {
  if (mode === "random" || mode === "beginner") return -1;

  const active = participant.team[participant.activeIndex];
  if (!active || active.currentHp <= 0) return -1;
  if (active.currentStamina < SWITCH_STAMINA_COST) return -1;

  const activeHpRatio = active.currentHp / active.pokemon.max_hp;
  const activeAttackScore = getBestUsableAttackScore(active, opponentActive);
  const activeThreatScore = getBestUsableAttackScore(opponentActive, active);
  const activeBattleScore = activeAttackScore - activeThreatScore * 0.55 + activeHpRatio * 28;

  const candidates = participant.team
    .map((card, index) => {
      const hpRatio = card.currentHp / card.pokemon.max_hp;
      const attackScore = getBestUsableAttackScore(card, opponentActive);
      const threatScore = getBestUsableAttackScore(opponentActive, card);
      return {
        index,
        attackScore,
        hpRatio,
        score: attackScore - threatScore * 0.55 + hpRatio * 28 + card.pokemon.speed * 0.04,
      };
    })
    .filter((candidate) => candidate.index !== participant.activeIndex && participant.team[candidate.index].currentHp > 0)
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best) return -1;

  const margin = getComputerSwitchMargin(mode);
  const noUsableAttack = activeAttackScore <= 0 && best.attackScore > 0;
  const lowHpEscape = activeHpRatio <= 0.32 && best.hpRatio >= activeHpRatio + 0.18 && best.score >= activeBattleScore + 8;
  const betterMatchup = best.attackScore >= activeAttackScore + margin && best.score >= activeBattleScore + margin;
  const badCurrentMatchup = activeAttackScore < 22 && best.attackScore >= activeAttackScore + 18;

  return noUsableAttack || lowHpEscape || betterMatchup || badCurrentMatchup ? best.index : -1;
}

function chooseComputerSkill(active: BattleCardState, team: BattleCardState[], opponentActive: BattleCardState, mode: ComputerBattleMode) {
  const skills = getPokemonSkills(active.pokemon).filter((skill) => canUseSkill(active, skill));
  if (skills.length === 0) return undefined;

  if (mode === "random") return skills[Math.floor(Math.random() * skills.length)];

  if (mode === "beginner") {
    if (Math.random() < 0.28) return undefined;
    return skills[Math.floor(Math.random() * skills.length)];
  }

  const healSkill = skills.find((skill) => skill.category === "heal" && skill.target === "ally");
  const mostInjuredIndex = findMostInjuredLivingIndex(team);
  const mostInjured = mostInjuredIndex >= 0 ? team[mostInjuredIndex] : undefined;

  const healThreshold = mode === "hell" ? 0.08 : mode === "master" ? 0.1 : mode === "hard" ? 0.12 : 0.18;
  if (healSkill && mostInjured && mostInjured.pokemon.max_hp - mostInjured.currentHp >= Math.round(mostInjured.pokemon.max_hp * healThreshold)) {
    return healSkill;
  }

  const shieldSkill = skills.find((skill) => skill.category === "shield");
  const shieldThreshold = mode === "hell" ? 0.72 : mode === "master" ? 0.68 : mode === "hard" ? 0.62 : 0.5;
  if (shieldSkill && active.currentHp <= active.pokemon.max_hp * shieldThreshold && (active.shieldTurns ?? 0) <= 0) {
    return shieldSkill;
  }

  if (mode === "hard" || mode === "master" || mode === "hell") {
    const attackSkills = skills.filter((skill) => skill.category === "attack");
    const bestAttack = attackSkills
      .map((skill) => ({ skill, result: calculateDamage(active.pokemon, opponentActive.pokemon, skill) }))
      .sort((left, right) => {
        const leftScore = left.result.isHit ? left.result.damage * left.result.typeMultiplier : 0;
        const rightScore = right.result.isHit ? right.result.damage * right.result.typeMultiplier : 0;
        return rightScore - leftScore;
      })[0]?.skill;

    if (bestAttack) return bestAttack;
  }

  return skills.find((item) => item.category === "attack") ?? skills[0];
}

function getSideLabel(side: BattleSide) {
  return side === "player" ? "玩家" : "電腦";
}

function getOppositeDraftPicker(side: DraftPickSide): DraftPickSide {
  return side === "player" ? "computer" : "player";
}

function getRoundFirstPicker(matchFirstPicker: DraftPickSide, round: number): DraftPickSide {
  return round % 2 === 1 ? matchFirstPicker : getOppositeDraftPicker(matchFirstPicker);
}

function getRoundLoadingLabel(round: number) {
  const labels = ["第一回合", "第二回合", "第三回合"];
  return labels[round - 1] ?? `第 ${round} 回合`;
}

function getHpBarClass(hpPercent: number) {
  if (hpPercent < 30) return "bg-gradient-to-r from-red-500 to-rose-500";
  if (hpPercent <= 50) return "bg-gradient-to-r from-yellow-300 to-amber-400";
  return "bg-gradient-to-r from-emerald-300 to-cyan-300";
}

function getStaminaPercent(card: BattleCardState) {
  return Math.max(0, Math.min(100, (card.currentStamina / card.maxStamina) * 100));
}

function getAttackBoostStack(card: BattleCardState) {
  return Math.max(0, Math.min(3, card.attackBoostTurns ?? 0));
}

function getAttackBoostMultiplier(stack: number) {
  if (stack >= 3) return 1.8;
  if (stack === 2) return 1.65;
  if (stack === 1) return 1.5;
  return 1;
}

function getDefenseBoostStack(card: BattleCardState) {
  return Math.max(0, Math.min(2, card.defenseBoostTurns ?? 0));
}

function getDefenseBoostMultiplier(stack: number) {
  if (stack >= 2) return 1.65;
  if (stack === 1) return 1.5;
  return 1;
}

function clearPositiveBattleBuffs(card: BattleCardState) {
  card.attackBoostTurns = 0;
  card.defenseBoostTurns = 0;
  card.speedBoostTurns = 0;
  card.shieldTurns = 0;
  card.shieldDamageReduction = undefined;
}

function getAttackBoostBadge(stack: number) {
  if (stack >= 3) {
    return {
      label: "攻擊提升",
      multiplierLabel: "x1.80",
      className: "attack-boost-shine-gold border-yellow-200/80 bg-[linear-gradient(135deg,rgba(254,240,138,0.95),rgba(234,179,8,0.82),rgba(113,63,18,0.9))] text-slate-950 shadow-[0_0_20px_rgba(250,204,21,0.42)]",
    };
  }

  if (stack === 2) {
    return {
      label: "攻擊提升",
      multiplierLabel: "x1.65",
      className: "attack-boost-shine-silver border-slate-100/85 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(203,213,225,0.82),rgba(71,85,105,0.9))] text-slate-950 shadow-[0_0_20px_rgba(226,232,240,0.32)]",
    };
  }

  if (stack === 1) {
    return {
      label: "攻擊提升",
      className: "border-amber-200/45 bg-amber-300/16 text-amber-100",
    };
  }

  return null;
}

function getDefenseBoostBadge(stack: number) {
  if (stack >= 2) {
    return {
      label: "防禦提升",
      multiplierLabel: "x1.65",
      className: "attack-boost-shine-silver border-slate-100/85 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(203,213,225,0.82),rgba(71,85,105,0.9))] text-slate-950 shadow-[0_0_20px_rgba(226,232,240,0.32)]",
    };
  }

  if (stack === 1) {
    return {
      label: "防禦提升",
      className: "border-emerald-200/45 bg-emerald-300/16 text-emerald-100",
    };
  }

  return null;
}

function getCardEffectBadges(card: BattleCardState) {
  const badges: Array<{ label: string; className: string; multiplierLabel?: string }> = [];
  const attackBoostBadge = getAttackBoostBadge(getAttackBoostStack(card));
  const defenseBoostBadge = getDefenseBoostBadge(getDefenseBoostStack(card));

  if ((card.shieldTurns ?? 0) > 0) badges.push({ label: "護盾", className: "border-cyan-200/45 bg-cyan-300/18 text-cyan-100" });
  if (attackBoostBadge) badges.push(attackBoostBadge);
  if (defenseBoostBadge) badges.push(defenseBoostBadge);
  if ((card.speedBoostTurns ?? 0) > 0) badges.push({ label: "速度提升", className: "border-sky-200/45 bg-sky-300/16 text-sky-100" });
  if ((card.attackDownTurns ?? 0) > 0) badges.push({ label: "攻擊降低", className: "border-rose-200/45 bg-rose-300/16 text-rose-100" });
  if ((card.defenseDownTurns ?? 0) > 0) badges.push({ label: "防禦降低", className: "border-orange-200/45 bg-orange-300/16 text-orange-100" });
  if ((card.speedDownTurns ?? 0) > 0) badges.push({ label: "速度降低", className: "border-violet-200/45 bg-violet-300/16 text-violet-100" });
  if ((card.asleepTurns ?? 0) > 0) badges.push({ label: "睡眠", className: "border-indigo-200/45 bg-indigo-300/16 text-indigo-100" });
  if ((card.paralyzedTurns ?? 0) > 0) badges.push({ label: "麻痺", className: "border-yellow-200/45 bg-yellow-300/16 text-yellow-100" });
  if (card.abilityUsed) badges.push({ label: "特性已發動", className: "border-amber-200/45 bg-amber-300/16 text-amber-100" });

  return badges;
}

function CardEffectBadges({ card, compact = false }: { card: BattleCardState; compact?: boolean }) {
  const badges = getCardEffectBadges(card);
  if (badges.length === 0) return null;

  return (
    <div className={["flex flex-wrap justify-center gap-2", compact ? "px-1" : ""].join(" ")}>
      {badges.map((badge) => (
        <span key={`${badge.label}-${badge.multiplierLabel ?? ""}`} className="inline-flex items-center gap-1.5">
          <span className={["rounded-full border font-black shadow-[0_0_12px_rgba(255,255,255,0.10)]", compact ? "px-2 py-1 text-[10px]" : "px-3.5 py-1.5 text-sm", badge.className].join(" ")}>
            {badge.label}
          </span>
          {badge.multiplierLabel && (
            <span className={["font-black drop-shadow-[0_0_10px_rgba(255,255,255,0.28)]", compact ? "text-[10px]" : "text-sm", badge.className.includes("gold") ? "text-yellow-100" : "text-slate-100"].join(" ")}>
              {badge.multiplierLabel}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

const battleUiText = {
  active: "\u51fa\u6230\u4e2d",
  shielded: "\u8b77\u76fe\u4e2d",
  defeated: "\u5df2\u5012\u4e0b",
  attack: "\u653b\u64ca",
  defense: "\u9632\u79a6",
  speed: "\u901f\u5ea6",
  stamina: "體力",
  rest: "休息",
  restHint: "回復 40 體力並交出回合",
  staminaInsufficient: "體力不足",
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
  switchHint: "開啟更換選擇介面",
  chooseAllyTarget: "選擇治療目標",
  chooseAllyHint: "從左側我方隊伍選擇一位存活夥伴。",
  chooseSwitchTarget: "選擇更換目標",
  chooseSwitchHint: "選擇一位存活的備戰夥伴替換上場。",
  chooseForcedSwitchTarget: "請選擇下一位出場夥伴。",
  cancelSwitch: "取消更換",
  cancelTarget: "取消選擇",
  title: "1v1 \u56de\u5408\u5c0d\u6230",
  back: "\u8fd4\u56de\u5927\u5ef3",
  playerBench: "\u6211\u65b9\u5099\u9078",
  enemyBench: "\u6575\u65b9\u5099\u9078",
  switchPrompt: "請選擇要更換上場的備戰夥伴。",
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
  const isTypeGuide = activePanel === "typeGuide";

  return (
    <main className="min-h-0 min-w-0 xl:col-start-2 xl:row-start-2">
      <section className="glass-panel relative h-full min-h-0 overflow-hidden rounded-[30px] p-5">
        <div className="arena-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-rose-500/16 blur-3xl" />
        {isTypeGuide ? (
          <TypeMatchupPanel />
        ) : (
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
        )}
      </section>
    </main>
  );
}

function TypeChip({ type }: { type: PokemonType }) {
  return (
    <span className={["inline-flex min-h-8 min-w-14 items-center justify-center rounded-full border px-3 text-xs font-black shadow-[0_0_10px_rgba(255,255,255,0.12)]", getTypeChipClass(type)].join(" ")}>
      {getTypeLabel(type)}
    </span>
  );
}

function TypeResultGroup({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-700/75 bg-slate-950/58">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-black text-white">{title}</h3>
        <span className={["h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor]", tone].join(" ")} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function TypeMatchupPanel() {
  const [attackTypes, setAttackTypes] = useState<PokemonType[]>(["Fire"]);
  const attackAdvantages = useMemo(() => getBestAttackAdvantages(attackTypes), [attackTypes]);
  const superCombos = useMemo(() => getBestAttackSuperEffectiveCombos(attackTypes), [attackTypes]);
  const defensiveWeaknesses = useMemo(() => getDefensiveWeaknessesForTypes(attackTypes), [attackTypes]);

  const toggleAttackType = (type: PokemonType) => {
    setAttackTypes((current) => {
      if (current.includes(type)) return current.length === 1 ? current : current.filter((item) => item !== type);
      return current.length >= 2 ? [current[1], type] : [...current, type];
    });
  };

  return (
    <div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4">
      <motion.div key="type-guide-heading" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-yellow-200/30 bg-yellow-300/10 px-3 py-1.5 text-xs font-black text-yellow-100">
            <RadioTower size={16} />
            TYPE CHART
          </div>
          <h1 className="mt-3 text-4xl font-black leading-none text-white 2xl:text-5xl">屬性克制</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-300">選擇 1 到 2 個攻擊端屬性，下方會列出可克制的防守屬性與雙屬性組合。</p>
        </div>
        <div className="rounded-[20px] border border-slate-700/75 bg-slate-950/62 p-3 text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Attack Types</p>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
            {attackTypes.map((type, index) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                {index > 0 && <span className="text-xs font-black text-slate-500">/</span>}
                <TypeChip type={type} />
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm font-black text-slate-400">下方顯示防守端結果</p>
        </div>
      </motion.div>

      <div className="grid min-h-0 gap-3">
        <section className="rounded-[22px] border border-slate-700/70 bg-slate-950/42 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">攻擊屬性（最多 2 個）</p>
            <div className="flex flex-wrap justify-end gap-1.5">
              {attackTypes.map((type) => <TypeChip key={type} type={type} />)}
            </div>
          </div>
          <div className="flex min-h-0 flex-wrap gap-2">
            {pokemonTypeFilterOptions.map((type) => {
              const selected = attackTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleAttackType(type)}
                  className={[
                    "min-h-10 rounded-full border px-3 text-xs font-black transition hover:-translate-y-0.5",
                    selected ? `${getTypeChipClass(type)} shadow-[0_0_20px_rgba(255,255,255,0.18)] ring-2 ring-white/45` : "border-slate-700 bg-slate-950/68 text-slate-300 hover:border-slate-500",
                  ].join(" ")}
                >
                  {getTypeLabel(type)}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid min-h-0 gap-3 lg:grid-cols-3">
        <TypeResultGroup title="超級克制" tone="bg-orange-300 text-orange-300">
          {superCombos.length > 0 ? (
            <div className="grid gap-2">
              {superCombos.map((combo) => (
                <div key={`${combo.attackType}-${combo.defenderTypes[0]}-${combo.defenderTypes[1]}`} className="flex items-center justify-between gap-3 rounded-2xl border border-orange-300/18 bg-orange-300/8 px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <TypeChip type={combo.attackType} />
                    <span className="text-xs font-black text-slate-500">→</span>
                    <TypeChip type={combo.defenderTypes[0]} />
                    <span className="text-xs font-black text-slate-500">/</span>
                    <TypeChip type={combo.defenderTypes[1]} />
                  </div>
                  <span className="shrink-0 text-sm font-black text-orange-100">{formatTypeMultiplier(combo.multiplier)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/62 px-3 py-4 text-center text-sm font-black text-slate-500">無</p>
          )}
        </TypeResultGroup>

        <TypeResultGroup title="克制" tone="bg-emerald-300 text-emerald-300">
          {attackAdvantages.length > 0 ? (
            <div className="grid gap-2">
              {attackAdvantages.map((item) => (
                <div key={`${item.attackType}-${item.defenderType}`} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/18 bg-emerald-300/8 px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <TypeChip type={item.attackType} />
                    <span className="text-xs font-black text-slate-500">→</span>
                    <TypeChip type={item.defenderType} />
                  </div>
                  <span className="text-sm font-black text-emerald-100">{formatTypeMultiplier(item.multiplier)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/62 px-3 py-4 text-center text-sm font-black text-slate-500">無</p>
          )}
        </TypeResultGroup>

        <TypeResultGroup title="被剋" tone="bg-rose-300 text-rose-300">
          {defensiveWeaknesses.length > 0 ? (
            <div className="grid gap-2">
              {defensiveWeaknesses.map((item) => (
                <div key={item.attackType} className="flex items-center justify-between gap-3 rounded-2xl border border-rose-300/18 bg-rose-300/8 px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <TypeChip type={item.attackType} />
                    <span className="text-xs font-black text-slate-500">→</span>
                    {attackTypes.map((type, index) => (
                      <span key={type} className="inline-flex items-center gap-1.5">
                        {index > 0 && <span className="text-xs font-black text-slate-500">/</span>}
                        <TypeChip type={type} />
                      </span>
                    ))}
                  </div>
                  <span className="text-sm font-black text-rose-100">{formatTypeMultiplier(item.multiplier)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/62 px-3 py-4 text-center text-sm font-black text-slate-500">無</p>
          )}
        </TypeResultGroup>
      </div>
    </div>
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
function TrainingChoiceSheet({
  open,
  onClose,
  onSelectTactics,
  onSelectStrategy,
}: {
  open: boolean;
  onClose: () => void;
  onSelectTactics: () => void;
  onSelectStrategy: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-slate-950/42 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: -18, opacity: 0, scale: 0.98 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -18, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="absolute left-4 top-1/2 grid w-[min(360px,calc(100vw-32px))] -translate-y-1/2 gap-3 xl:left-[226px]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onSelectTactics}
              className="group relative min-h-28 overflow-hidden rounded-[24px] border border-cyan-300/45 bg-slate-950/86 p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.36)] transition hover:border-cyan-200 hover:bg-cyan-300/12"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                  <Cpu size={23} />
                </span>
                <ChevronRight className="text-slate-500 transition group-hover:text-cyan-100" size={24} />
              </div>
              <h3 className="mt-4 text-2xl font-black text-white">單局戰術訓練</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-400">管理模型並進入 AI 對戰訓練。</p>
            </button>

            <button
              type="button"
              onClick={onSelectStrategy}
              className="group relative min-h-28 overflow-hidden rounded-[24px] border border-emerald-400/35 bg-slate-950/86 p-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.36)] transition hover:border-emerald-200 hover:bg-emerald-300/12"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10 text-emerald-100">
                  <Trophy size={23} />
                </span>
                <ChevronRight className="text-slate-500 transition group-hover:text-emerald-100" size={24} />
              </div>
              <h3 className="mt-4 text-2xl font-black text-slate-100">賽局策略訓練</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-400">單獨訓練 aggressive / balanced / defensive 策略層。</p>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getInitialPageFromUrl(): CurrentPage {
  if (typeof window === "undefined") return "lobby";
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page") ?? window.location.hash.replace(/^#\/?/, "");
  return page === "training" || page === "aiTraining" ? "aiTraining" : "lobby";
}

export default function LobbyPage() {
  const [activePanel, setActivePanel] = useState<LobbyContentKey>("dex");
  const [currentPage, setCurrentPage] = useState<CurrentPage>(() => getInitialPageFromUrl());
  const [isBattleModeSheetOpen, setIsBattleModeSheetOpen] = useState(false);
  const [isTrainingChoiceOpen, setIsTrainingChoiceOpen] = useState(false);
  const [initialTrainingScreen, setInitialTrainingScreen] = useState<"tacticsList" | "strategyList">("tacticsList");
  const [appliedTrainingModel, setAppliedTrainingModel] = useState<AppliedTrainingModel | null>(() => loadAppliedTrainingModel());
  const mobileNav = useMemo(() => [...leftNav, ...rightNav], []);

  const handleSelectPanel = (panel: LobbyContentKey) => {
    setIsBattleModeSheetOpen(false);
    setActivePanel(panel);
    if (panel === "dex") setCurrentPage("pokedex");
    if (panel === "training") setIsTrainingChoiceOpen(true);
  };

  const handleBackToLobby = () => {
    setCurrentPage("lobby");
    setIsBattleModeSheetOpen(false);
    setIsTrainingChoiceOpen(false);
  };

  const handleApplyTrainingModel = (payload: TrainingModelApplyPayload) => {
    saveAppliedTrainingModel(payload);
    setAppliedTrainingModel(payload);
  };

  const handleRemoveAppliedTrainingModel = () => {
    saveAppliedTrainingModel(null);
    setAppliedTrainingModel(null);
  };

  if (currentPage === "pokedex") return <PokedexPage onBack={handleBackToLobby} />;
  if (currentPage === "ranked") return <RankedBattlePage onBack={handleBackToLobby} />;
  if (currentPage === "normalBattle") {
    return <NormalBattlePage onBack={handleBackToLobby} appliedTrainingModel={appliedTrainingModel} />;
  }
  if (currentPage === "aiTraining") {
    if (initialTrainingScreen === "strategyList") {
      return <MatchStrategyTrainingPage onBack={handleBackToLobby} initialScreen="strategyList" />;
    }
    return <AITrainingPage onBack={handleBackToLobby} initialScreen={initialTrainingScreen} appliedModelId={appliedTrainingModel?.id} onApplyTrainingModel={handleApplyTrainingModel} onRemoveAppliedTrainingModel={handleRemoveAppliedTrainingModel} />;
  }

  return (
    <div className="h-screen overflow-hidden px-3 py-3 text-slate-100">
      <div className={["grid h-full min-h-0 gap-3 transition duration-200 xl:grid-cols-[210px_minmax(0,1fr)_210px] xl:grid-rows-[76px_minmax(0,1fr)_86px]", isTrainingChoiceOpen ? "blur-[2px]" : ""].join(" ")}>
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
      <TrainingChoiceSheet
        open={isTrainingChoiceOpen}
        onClose={() => setIsTrainingChoiceOpen(false)}
        onSelectTactics={() => {
          setIsTrainingChoiceOpen(false);
          setInitialTrainingScreen("tacticsList");
          setCurrentPage("aiTraining");
        }}
        onSelectStrategy={() => {
          setIsTrainingChoiceOpen(false);
          setInitialTrainingScreen("strategyList");
          setCurrentPage("aiTraining");
        }}
      />
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
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all duration-700" style={{ width: `${hpPercent}%` }} />
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
          <div className={["h-full rounded-full transition-all duration-700", getHpBarClass(hpPercent)].join(" ")} style={{ width: String(hpPercent) + "%" }} />
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
    <div className="pointer-events-none absolute left-1/2 top-[82px] z-40 flex -translate-x-1/2 flex-col items-center text-center">
      <p className="text-5xl font-black leading-none text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.34)]">{turn.secondsLeft}</p>
      <p className="mt-2 text-base font-black text-slate-100">{getSideLabel(turn.attacker)}{battleUiText.turnSuffix}</p>
      {playerShielded && <span className="mt-2 text-sm font-black text-cyan-100">{battleUiText.playerShieldReady}</span>}
    </div>
  );
}

function BattleStandbyBroadcast({ message, hidden = false }: { message: string; hidden?: boolean }) {
  if (hidden || !message) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-[26vw] text-center">
      <p className="line-clamp-4 max-w-4xl whitespace-normal break-words text-2xl font-black leading-9 text-cyan-100 drop-shadow-[0_0_18px_rgba(34,211,238,0.34)]">
        {message}
      </p>
    </div>
  );
}

function getEffectText(typeMultiplier: number, isHit: boolean) {
  if (!isHit) return "沒有命中！";
  if (typeMultiplier >= 4) return "超級克制！";
  if (typeMultiplier >= 2) return "效果絕佳！";
  if (typeMultiplier === 0) return "沒有效果";
  if (typeMultiplier < 1) return "效果不好...";
  return "效果普通";
}

function getTimelineEffectText(animation: BattleAnimationState) {
  if (animation.actionType === "switch") return animation.effectLabel ?? "";
  if (animation.effectLabel) return animation.effectLabel;
  return animation.effectivenessText || getEffectText(animation.typeMultiplier, animation.isHit);
}

function getTimelineEffectClass(animation: BattleAnimationState) {
  if (animation.actionType === "switch") return "text-cyan-100 drop-shadow-[0_0_18px_rgba(34,211,238,0.46)]";
  if (animation.actionType === "shield") return "text-cyan-100 drop-shadow-[0_0_20px_rgba(34,211,238,0.56)]";
  if (animation.actionType === "rest") return "text-sky-100 drop-shadow-[0_0_20px_rgba(125,211,252,0.56)]";
  if (!animation.isHit || animation.typeMultiplier === 0) return "text-slate-200 drop-shadow-[0_0_18px_rgba(148,163,184,0.45)]";
  if (animation.typeMultiplier >= 4) return "text-orange-200 drop-shadow-[0_0_26px_rgba(251,146,60,0.88)]";
  if (animation.typeMultiplier >= 2) return "text-amber-200 drop-shadow-[0_0_22px_rgba(251,191,36,0.72)]";
  if (animation.typeMultiplier < 1) return "text-sky-200 drop-shadow-[0_0_18px_rgba(125,211,252,0.46)]";
  return "text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.42)]";
}

function shouldShowAttackImpact(animation: BattleAnimationState | null, side: BattleSide) {
  return Boolean(
    animation &&
    animation.phase === "impact" &&
    animation.defenderSide === side &&
    animation.isHit &&
    animation.skill.category === "attack" &&
    animation.actionType !== "switch" &&
    animation.actionType !== "shield",
  );
}

function shouldShowSwitchEntry(animation: BattleAnimationState | null, side: BattleSide, card: BattleCardState) {
  return Boolean(
    animation &&
    animation.actionType === "switch" &&
    animation.attackerSide === side &&
    (animation.phase === "impact" || animation.phase === "ability" || animation.phase === "handoff") &&
    animation.switchEntryPokemonId === card.pokemon.id,
  );
}

function isHealingImpactTarget(animation: BattleAnimationState | null, side: BattleSide, index: number) {
  return Boolean(
    animation &&
    animation.phase === "impact" &&
    animation.healTarget?.side === side &&
    animation.healTarget.index === index &&
    animation.healTarget.amount > 0,
  );
}

function BattleDamageNumber({ animation, side }: { animation: BattleAnimationState | null; side: BattleSide }) {
  if (!animation || !shouldShowAttackImpact(animation, side)) return null;

  return (
    <motion.div
      key={`${animation.skill.id}-${animation.defenderSide}-${animation.damage}`}
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      initial={{ opacity: 0, y: 18, scale: 0.72 }}
      animate={{ opacity: [0, 1, 1, 0], y: [18, -22, -34, -44], scale: [0.72, 1.18, 1.06, 0.96] }}
      transition={{ duration: 0.78, ease: "easeOut" }}
    >
      <span className={["text-6xl font-black leading-none", animation.damage > 0 ? "text-rose-100 drop-shadow-[0_0_22px_rgba(251,113,133,0.78)]" : "text-slate-100 drop-shadow-[0_0_18px_rgba(148,163,184,0.54)]"].join(" ")}>
        {animation.damage > 0 ? `-${animation.damage}` : "0"}
      </span>
    </motion.div>
  );
}

function BattleHealEffect({ amount, compact = false }: { amount: number; compact?: boolean }) {
  if (amount <= 0) return null;

  return (
    <>
      <motion.div
        className="pointer-events-none absolute -inset-2 z-20 rounded-[24px] border border-emerald-200/70 bg-emerald-300/14 shadow-[0_0_34px_rgba(52,211,153,0.48),inset_0_0_24px_rgba(52,211,153,0.18)]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: [0, 1, 0.78, 0], scale: [0.92, 1.05, 1.02, 1.12] }}
        transition={{ duration: 0.95, ease: "easeOut" }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
        initial={{ opacity: 0, y: 18, scale: 0.78 }}
        animate={{ opacity: [0, 1, 1, 0], y: [18, -12, -26, -36], scale: [0.78, 1.1, 1.04, 0.96] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        <span className={[
          "rounded-full border border-emerald-100/70 bg-emerald-300 px-3 py-1 font-black text-slate-950 shadow-[0_0_24px_rgba(110,231,183,0.72)]",
          compact ? "text-[10px]" : "text-xl",
        ].join(" ")}>
          增加HP +{amount}
        </span>
      </motion.div>
    </>
  );
}

function BattleActionTimelineOverlay({ animation }: { animation: BattleAnimationState | null }) {
  if (!animation) return null;

  const skillName = animation.skill.name_zh || animation.skill.name;
  const isSwitchAction = animation.actionType === "switch";
  const isShieldAction = animation.actionType === "shield";
  const isRestAction = animation.actionType === "rest";
  const actionTitle = animation.actionTitle ?? `${animation.attackerName} 使用 ${skillName}！`;
  const actionSubtitle = animation.actionSubtitle ?? (isSwitchAction ? battleUiText.chooseSwitchTarget : "Skill Locked");
  const timelineEffectText = getTimelineEffectText(animation);
  const handoffLabel = animation.defenderSide === "computer" ? "對手回合" : "玩家回合";
  const handoffSubLabel = animation.defenderSide === "computer" ? "ENEMY TURN" : "PLAYER TURN";
  const abilityHeadline = animation.abilityMessages[0] ?? "";
  const extraAbilityMessages = animation.abilityMessages.slice(1);
  const switchToneClass = animation.attackerSide === "computer"
    ? "border-rose-300/65 shadow-[0_30px_100px_rgba(244,63,94,0.28)]"
    : "border-cyan-200/65 shadow-[0_30px_100px_rgba(34,211,238,0.28)]";
  const switchBeamClass = animation.attackerSide === "computer"
    ? "from-transparent via-rose-200/45 to-transparent"
    : "from-transparent via-cyan-100/50 to-transparent";

  return (
    <AnimatePresence>
      <motion.div
        key="battle-action-timeline"
        className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        {animation.phase !== "card" && <div className="absolute inset-0 bg-slate-950/18" />}

        <AnimatePresence mode="wait">
          {animation.phase === "card" && (
            <motion.div
              key="timeline-card"
              className={[
                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] border bg-slate-950/90 p-5",
                isSwitchAction ? ["w-[270px]", switchToneClass].join(" ") : "w-[300px] border-cyan-200/55 shadow-[0_28px_90px_rgba(34,211,238,0.24)]",
              ].join(" ")}
              initial={isSwitchAction ? { y: 420, x: "-50%", scale: 0.62, opacity: 0, rotate: -10, rotateY: -32 } : { y: 360, x: "-50%", scale: 0.68, opacity: 0, rotate: -5 }}
              animate={isSwitchAction ? { y: "-50%", x: "-50%", scale: [0.86, 1.12, 1.04], opacity: 1, rotate: 0, rotateY: 0 } : { y: "-50%", x: "-50%", scale: 1.08, opacity: 1, rotate: 0 }}
              exit={isSwitchAction ? { opacity: 0, scale: 1.24, y: "-54%", filter: "brightness(1.45)" } : { opacity: 0, scale: 1.18 }}
              transition={isSwitchAction ? { duration: 0.72, ease: [0.16, 0.92, 0.18, 1] } : { duration: 0.5, ease: [0.2, 0.85, 0.2, 1] }}
            >
              {isSwitchAction ? (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.18),transparent_42%)]" />
                  <motion.div
                    className={["pointer-events-none absolute -left-1/2 top-0 h-full w-1/2 skew-x-[-18deg] bg-gradient-to-r", switchBeamClass].join(" ")}
                    initial={{ x: "-40%", opacity: 0 }}
                    animate={{ x: "360%", opacity: [0, 1, 0] }}
                    transition={{ delay: 0.2, duration: 0.58, ease: "easeOut" }}
                  />
                  <div className="relative z-10">
                    <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-100">{actionSubtitle}</p>
                    <div className="mt-4" style={{ aspectRatio: "1 / 1.45" }}>
                      {animation.displayPokemon && (
                        <motion.div
                          className="h-full w-full"
                          initial={{ y: 34, opacity: 0, scale: 0.92 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1, duration: 0.42, ease: "easeOut" }}
                        >
                          <PokemonDisplayCard
                            pokemon={animation.displayPokemon}
                            imageSrc={getPokemonImage(animation.displayPokemon)}
                            selected
                            tone={animation.attackerSide}
                          />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </>
              ) : isShieldAction || isRestAction ? (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-100">{actionSubtitle}</p>
                  <h2 className="mt-3 text-3xl font-black text-white">{skillName}</h2>
                  <div className="mt-5 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">
                    {animation.effectLabel ?? (isShieldAction ? battleUiText.shieldReduction : battleUiText.restHint)}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-100">{actionSubtitle}</p>
                  <h2 className="mt-3 text-3xl font-black text-white">{skillName}</h2>
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3">
                    <span className="text-sm font-black text-slate-300">{getTypeLabel(animation.skill.type)}</span>
                    <span className="text-sm font-black text-cyan-100">{battleUiText.power} {animation.skill.power}</span>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {(animation.phase === "banner" || animation.phase === "impact") && (
            <motion.div
              key="timeline-banner"
              className="absolute inset-0 grid place-items-center px-6 text-center"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div>
                <p className="text-[clamp(2.2rem,5.6vw,5.8rem)] font-black leading-tight text-white drop-shadow-[0_0_26px_rgba(34,211,238,0.46)]">
                  {actionTitle}
                </p>
                {timelineEffectText && (
                  <motion.p
                    className={["mt-5 text-[clamp(1.4rem,3vw,3rem)] font-black", getTimelineEffectClass(animation)].join(" ")}
                    initial={{ opacity: 0, y: 18, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 1, duration: 0.3, ease: "easeOut" }}
                  >
                    {timelineEffectText}
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}

          {animation.phase === "ability" && (
            <motion.div
              key="timeline-ability"
              className="absolute inset-0 grid place-items-center px-6 text-center"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="max-w-5xl">
                <p className="text-xl font-black uppercase tracking-[0.34em] text-amber-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.5)]">Ability Trigger</p>
                <p className="mt-5 text-[clamp(2rem,4.6vw,4.8rem)] font-black leading-tight text-white drop-shadow-[0_0_26px_rgba(251,191,36,0.44)]">
                  {abilityHeadline}
                </p>
                {extraAbilityMessages.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {extraAbilityMessages.map((message) => (
                      <p key={message} className="text-xl font-black text-amber-100 drop-shadow-[0_0_16px_rgba(251,191,36,0.36)]">{message}</p>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {animation.phase === "handoff" && (
            <motion.div
              key="timeline-handoff"
              className="absolute inset-0 grid place-items-center px-6 text-center"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div>
                <p className="text-[clamp(2.4rem,6vw,6rem)] font-black leading-none text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.42)]">{handoffLabel}</p>
                <p className="mt-5 text-2xl font-black uppercase tracking-[0.34em] text-cyan-100 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">{handoffSubLabel}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function BattleStartIntroOverlay({ phase, attacker }: { phase: BattleStartIntroPhase | null; attacker: BattleSide }) {
  if (!phase) return null;

  const isHandoff = phase === "handoff";
  const title = isHandoff ? `${getSideLabel(attacker)}回合` : "開始戰鬥";
  const subtitle = isHandoff ? (attacker === "player" ? "PLAYER TURN" : "ENEMY TURN") : "BATTLE START";
  const toneClass = isHandoff && attacker === "computer"
    ? "text-rose-100 drop-shadow-[0_0_28px_rgba(244,63,94,0.48)]"
    : "text-white drop-shadow-[0_0_28px_rgba(34,211,238,0.48)]";

  return (
    <AnimatePresence>
      <motion.div
        key={`battle-start-${phase}-${attacker}`}
        className="pointer-events-none fixed inset-0 z-[85] grid place-items-center bg-slate-950/24 px-6 text-center"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.03 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <div>
          <p className={["text-[clamp(3rem,7vw,7rem)] font-black leading-none", toneClass].join(" ")}>{title}</p>
          <p className="mt-5 text-2xl font-black uppercase tracking-[0.34em] text-cyan-100 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">{subtitle}</p>
        </div>
      </motion.div>
    </AnimatePresence>
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
  const staminaPercent = activeCard ? getStaminaPercent(activeCard) : 0;
  const alignment = side === "player" ? "left-8 text-left" : "right-8 text-right";
  const glow = side === "player" ? "shadow-[0_0_22px_rgba(34,211,238,0.34)]" : "shadow-[0_0_22px_rgba(244,63,94,0.28)]";
  const barLine = side === "player" ? "from-cyan-300 via-emerald-300 to-cyan-100" : "from-rose-300 via-orange-200 to-rose-100";
  const name = activeCard ? getPokemonLabel(activeCard.pokemon) : "\u5c1a\u672a\u51fa\u6230";
  const hpText = activeCard ? `${activeCard.currentHp}/${activeCard.pokemon.max_hp}` : "--/--";
  const staminaText = activeCard ? `${activeCard.currentStamina}/${activeCard.maxStamina}` : "--/--";
  const typeChips = activeCard?.pokemon.types.map((type) => (
    <span key={type} className={["rounded-full border px-2.5 py-0.5 text-[10px] font-black shadow-[0_0_10px_rgba(255,255,255,0.16)]", getTypeChipClass(type)].join(" ")}>
      {getTypeLabel(type)}
    </span>
  ));

  return (
    <div className={["absolute top-[82px] z-30 w-[460px] max-w-[calc(50vw-80px)]", alignment].join(" ")}>
      <div className={["grid items-end gap-4", side === "player" ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[auto_auto_minmax(0,1fr)]"].join(" ")}>
        {side === "computer" && <span className="shrink-0 text-sm font-black text-slate-200">{hpText}</span>}
        {side === "computer" && <span className="shrink-0 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-black text-slate-200">{aliveCount}/{participant.team.length}</span>}
        <div className={["min-w-0", side === "computer" ? "text-right" : "text-left"].join(" ")}>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <div className={["mt-1 flex min-w-0 flex-wrap items-center gap-2", side === "computer" ? "justify-end" : "justify-start"].join(" ")}>
            {side === "computer" && typeChips}
            <p className="truncate text-2xl font-black leading-none text-white">{name}</p>
            {side === "player" && typeChips}
          </div>
        </div>
        {side === "player" && <span className="shrink-0 text-sm font-black text-slate-200">{hpText}</span>}
        {side === "player" && <span className="shrink-0 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-black text-slate-200">{aliveCount}/{participant.team.length}</span>}
      </div>
      {activeCard && (
        <div className="mt-3 space-y-2">
          <div className={["h-4 overflow-hidden rounded-full border border-white/10 bg-slate-950/80", glow].join(" ")}>
            <div className={["h-full rounded-full bg-gradient-to-r transition-all duration-700", side === "computer" ? "ml-auto" : "", barLine].join(" ")} style={{ width: String(hpPercent) + "%" }} />
          </div>
          <div className="flex items-center gap-2">
            {side === "computer" && <span className="shrink-0 text-[11px] font-black text-sky-100">{staminaText}</span>}
            <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-white/10 bg-slate-950/80">
              <div className={["h-full rounded-full bg-gradient-to-r from-sky-300 to-violet-300 transition-all duration-300", side === "computer" ? "ml-auto" : ""].join(" ")} style={{ width: String(staminaPercent) + "%" }} />
            </div>
            {side === "player" && <span className="shrink-0 text-[11px] font-black text-sky-100">{staminaText}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function CompactActiveBattleCard({
  card,
  side,
  shielded = false,
  isHitTarget = false,
  isHealTarget = false,
  healAmount = 0,
  battleAnimation = null,
}: {
  card: BattleCardState;
  side: BattleSide;
  shielded?: boolean;
  isHitTarget?: boolean;
  isHealTarget?: boolean;
  healAmount?: number;
  battleAnimation?: BattleAnimationState | null;
}) {
  const defeated = card.currentHp <= 0;
  const imageSrc = getPokemonImage(card.pokemon);
  const hasShield = shielded || (card.shieldTurns ?? 0) > 0;
  const isSwitchEntry = shouldShowSwitchEntry(battleAnimation, side, card);
  const switchEntryGlowClass =
    side === "computer"
      ? "border-rose-200/70 bg-rose-300/10 shadow-[0_0_42px_rgba(244,63,94,0.42),inset_0_0_30px_rgba(251,113,133,0.12)]"
      : "border-cyan-100/70 bg-cyan-300/10 shadow-[0_0_42px_rgba(34,211,238,0.46),inset_0_0_30px_rgba(103,232,249,0.12)]";
  const switchEntryBeamClass = side === "computer" ? "from-rose-200/0 via-rose-100/50 to-rose-200/0" : "from-cyan-200/0 via-cyan-100/55 to-cyan-200/0";
  const cardAnimation = isHitTarget
    ? { x: [0, -18, 18, -14, 14, -8, 8, 0], filter: ["blur(0px) brightness(1)", "blur(3px) brightness(1.75)", "blur(2px) brightness(1.2)", "blur(0px) brightness(1)"] }
    : isSwitchEntry
      ? { y: [26, -12, 0], scale: [0.84, 1.08, 1], rotateY: [-34, 8, 0], filter: ["brightness(1.55) saturate(1.35)", "brightness(1.2) saturate(1.15)", "brightness(1) saturate(1)"] }
      : { x: 0, y: 0, scale: 1, rotateY: 0, filter: "blur(0px) brightness(1)" };
  const cardTransition: Transition = isHitTarget
    ? { duration: 0.62, ease: [0.42, 0, 0.58, 1] }
    : isSwitchEntry
      ? { duration: 0.82, ease: [0.16, 0.92, 0.18, 1] }
      : { duration: 0.2 };

  return (
    <motion.div
      animate={cardAnimation}
      transition={cardTransition}
      className="relative h-auto w-[250px] min-w-[250px] max-w-[250px] shrink-0 transition"
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="relative" style={{ aspectRatio: "1 / 1.45" }}>
        {isSwitchEntry && (
          <>
            <motion.div
              className={["pointer-events-none absolute -inset-4 z-10 rounded-[32px] border", switchEntryGlowClass].join(" ")}
              initial={{ opacity: 0, scale: 0.78 }}
              animate={{ opacity: [0, 1, 0.45, 0], scale: [0.78, 1.12, 1.2, 1.3] }}
              transition={{ duration: 1.05, ease: "easeOut" }}
            />
            <motion.div
              className={["pointer-events-none absolute -left-12 top-0 z-20 h-full w-16 skew-x-[-18deg] bg-gradient-to-r", switchEntryBeamClass].join(" ")}
              initial={{ x: -70, opacity: 0 }}
              animate={{ x: 330, opacity: [0, 1, 0] }}
              transition={{ delay: 0.12, duration: 0.68, ease: "easeOut" }}
            />
          </>
        )}
        {hasShield && (
          <div className="pointer-events-none absolute -inset-3 z-10 rounded-[30px] border border-cyan-200/60 bg-cyan-300/8 shadow-[0_0_32px_rgba(103,232,249,0.34),inset_0_0_28px_rgba(103,232,249,0.14)]" />
        )}
        <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} active tone={side} defeated={defeated} hideTypeChips />
        <BattleDamageNumber animation={battleAnimation} side={side} />
        {isHealTarget && <BattleHealEffect amount={healAmount} />}
        {defeated && (
          <div className="absolute inset-0 grid place-items-center rounded-[20px] bg-slate-950/58">
            <span className="rounded-full border border-rose-300/35 bg-rose-400/18 px-4 py-2 text-sm font-black text-rose-100">{battleUiText.defeated}</span>
          </div>
        )}
      </div>
      <div className="mt-4 min-h-9">
        <div className="flex flex-wrap justify-center gap-2">
          <CardEffectBadges card={card} />
          {shielded && <span className="rounded-full border border-cyan-200/45 bg-cyan-300/18 px-3.5 py-1.5 text-sm font-black text-cyan-100 shadow-[0_0_12px_rgba(255,255,255,0.10)]">護盾</span>}
        </div>
      </div>
    </motion.div>
  );
}

function BattleCardDeck({
  participant,
  activeIndex,
  side,
  battleAnimation = null,
  canSwitch = false,
  canTargetAlly = false,
  activeShielded = false,
  onSwitch,
  onAllyTarget,
}: {
  participant: BattleParticipant;
  activeIndex: number;
  side: BattleSide;
  battleAnimation?: BattleAnimationState | null;
  canSwitch?: boolean;
  canTargetAlly?: boolean;
  activeShielded?: boolean;
  onSwitch?: (index: number) => void;
  onAllyTarget?: (index: number) => void;
}) {
  return (
    <aside className="grid h-[224px] max-h-full min-h-0 grid-cols-3 items-end gap-2 overflow-visible">
      {participant.team.map((card, index) => {
        const active = index === activeIndex;
        const defeated = card.currentHp <= 0;
        const selectableTarget = canTargetAlly && !defeated;
        const switchable = canSwitch && !active && !defeated;
        const disabled = !selectableTarget;
        const imageSrc = getPokemonImage(card.pokemon);
        const hasShield = (card.shieldTurns ?? 0) > 0 || (active && activeShielded);
        const hpPercent = Math.max(0, (card.currentHp / card.pokemon.max_hp) * 100);
        const staminaPercent = getStaminaPercent(card);
        const isHealTarget = isHealingImpactTarget(battleAnimation, side, index);
        const healAmount = isHealTarget ? battleAnimation?.healTarget?.amount ?? 0 : 0;
        return (
          <button
            key={card.pokemon.id}
            type="button"
            aria-disabled={disabled}
            onClick={() => {
              if (selectableTarget) onAllyTarget?.(index);
            }}
            className={[
              "group relative min-h-0 w-full text-left transition",
              active ? "-translate-y-3" : "",
              selectableTarget ? "hover:-translate-y-2" : "cursor-default",
            ].join(" ")}
          >
            <div className="relative" style={{ aspectRatio: "1 / 1.45" }}>
              {hasShield && (
                <div className="pointer-events-none absolute -inset-2 z-10 rounded-[24px] border border-cyan-200/55 bg-cyan-300/8 shadow-[0_0_24px_rgba(103,232,249,0.28),inset_0_0_18px_rgba(103,232,249,0.12)]" />
              )}
              <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} selected={active} tone={side} defeated={defeated} compact />
              {isHealTarget && <BattleHealEffect amount={healAmount} compact />}
              {active && <span className="absolute right-2 top-2 z-20 rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] font-black text-cyan-100">{battleUiText.active}</span>}
              {selectableTarget && <span className="absolute bottom-2 left-2 right-2 z-20 rounded-full bg-cyan-300 px-2 py-1 text-center text-[9px] font-black text-slate-950">{battleUiText.chooseAllyTarget}</span>}
              {switchable && <span className="absolute bottom-2 left-2 right-2 z-20 rounded-full bg-slate-950/80 px-2 py-1 text-center text-[9px] font-black text-cyan-100">{battleUiText.replaceable}</span>}
            </div>
            <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-50 w-[210px] -translate-x-1/2 rounded-xl border border-cyan-300/35 bg-slate-950/95 p-3 opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <p className="truncate text-sm font-black text-white">{getPokemonLabel(card.pokemon)}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] font-black text-slate-300">
                <span>HP</span>
                <span>{card.currentHp}/{card.pokemon.max_hp}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                <span className={["block h-full rounded-full", getHpBarClass(hpPercent)].join(" ")} style={{ width: `${hpPercent}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] font-black text-slate-300">
                <span>{battleUiText.stamina}</span>
                <span>{card.currentStamina}/{card.maxStamina}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                <span className="block h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-100" style={{ width: `${staminaPercent}%` }} />
              </div>
            </div>
          </button>
        );
      })}
    </aside>
  );
}

function LeadSelectionCard({
  card,
  index,
  side,
  selected,
  locked,
  revealed,
  disabled = false,
  onSelect,
}: {
  card: BattleCardState;
  index: number;
  side: BattleSide;
  selected: boolean;
  locked: boolean;
  revealed: boolean;
  disabled?: boolean;
  onSelect?: (index: number) => void;
}) {
  const imageSrc = getPokemonImage(card.pokemon);
  const shouldBlur = revealed && !selected;
  const shouldEmphasize = revealed && selected;
  const isEnemyHidden = side === "computer" && !revealed;

  if (isEnemyHidden) {
    return (
      <motion.button
        type="button"
        disabled
        style={{ aspectRatio: "1 / 1.45", width: 176, flex: "0 0 auto" }}
        className="relative cursor-default text-left transition"
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[20px] border border-rose-400/45 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_0_18px_rgba(244,63,94,0.14)]">
          <div className="relative grid min-h-0 flex-[1.25] place-items-center overflow-hidden p-2">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(244,63,94,0.18),rgba(15,23,42,0.74)_55%,rgba(2,6,23,0.98)_80%)]" />
            <div className="absolute aspect-square w-[68%] rounded-full bg-[radial-gradient(circle_at_center,rgba(244,114,182,0.14),rgba(244,114,182,0.04)_52%,transparent_72%)] shadow-[inset_0_18px_28px_rgba(255,255,255,0.04),inset_0_-24px_34px_rgba(0,0,0,0.48)]" />
            <span className="relative z-10 text-6xl font-black leading-none text-rose-100 drop-shadow-[0_0_22px_rgba(251,113,133,0.44)]">?</span>
          </div>
          <div className="relative flex flex-[0.85] flex-col border-t border-white/10 bg-slate-950/78 px-4 pb-4 pt-3 shadow-[inset_0_14px_28px_rgba(244,63,94,0.10)]">
            <p className="text-[10px] font-black text-slate-500">????</p>
            <p className="mt-1 truncate text-sm font-black uppercase tracking-[0.24em] text-slate-300">Hidden</p>
            <p className="mt-2 truncate text-xs font-bold text-slate-500">對手已遮蔽</p>
            <div className="mt-auto flex gap-2">
              <span className="min-w-12 rounded-full bg-slate-900 px-2 py-0.5 text-center text-[9px] font-black text-slate-500">???</span>
              <span className="min-w-12 rounded-full bg-slate-900 px-2 py-0.5 text-center text-[9px] font-black text-slate-500">???</span>
            </div>
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      disabled={disabled || locked || card.currentHp <= 0}
      onClick={() => onSelect?.(index)}
      style={{ aspectRatio: "1 / 1.45", width: shouldEmphasize ? 220 : 176, flex: "0 0 auto" }}
      className={[
        "group relative text-left transition",
        disabled || locked || card.currentHp <= 0 ? "cursor-default" : "hover:-translate-y-2",
        shouldBlur ? "scale-95 opacity-35 blur-[2px]" : "",
        shouldEmphasize ? "z-20 scale-110" : "",
      ].join(" ")}
      animate={selected && !revealed ? { y: -8, scale: 1.04 } : { y: 0, scale: shouldEmphasize ? 1.1 : 1 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} selected={selected || shouldEmphasize} tone={side} defeated={card.currentHp <= 0} compact={!shouldEmphasize} />
      {selected && !revealed && side === "player" && (
        <span className="absolute right-2 top-2 z-40 rounded-full bg-cyan-300 px-2 py-1 text-[10px] font-black text-slate-950">待鎖定</span>
      )}
      {revealed && selected && (
        <span className={["absolute right-2 top-2 z-40 rounded-full px-2 py-1 text-[10px] font-black", side === "player" ? "bg-cyan-300 text-slate-950" : "bg-rose-300 text-slate-950"].join(" ")}>
          出戰
        </span>
      )}
    </motion.button>
  );
}

function LeadSelectionPage({
  participants,
  selection,
  secondsLeft,
  roundText,
  scoreText,
  onSelect,
  onLock,
  onBack,
}: {
  participants: BattleParticipants;
  selection: LeadSelectionState;
  secondsLeft: number;
  roundText: string;
  scoreText: string;
  onSelect: (index: number) => void;
  onLock: () => void;
  onBack: () => void;
}) {
  const canLock = selection.playerIndex !== null && !selection.playerLocked;
  const statusText = selection.revealed
    ? "雙方出戰夥伴已鎖定"
    : selection.playerLocked
      ? "等待對手鎖定"
      : "選擇出戰夥伴";

  return (
    <motion.div
      className="relative h-screen overflow-hidden bg-slate-950 text-white"
      animate={selection.revealed ? { opacity: [1, 1, 0] } : { opacity: 1 }}
      transition={selection.revealed ? { duration: LEAD_SELECTION_REVEAL_MS / 1000, times: [0, 0.72, 1], ease: "easeInOut" } : { duration: 0.2 }}
    >
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-35 blur-[1px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.10),transparent_34%),linear-gradient(90deg,rgba(0,0,206,0.24),transparent_42%,rgba(206,0,0,0.18))] backdrop-blur-sm" />
      <header className="relative z-10 flex h-[64px] items-center justify-between border-b border-slate-800/75 px-6">
        <div>
          <p className="text-xs font-black text-cyan-100">{roundText}　{scoreText}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">選擇出戰夥伴</h1>
        </div>
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
          <ArrowLeft size={18} />
          返回大廳
        </button>
      </header>

      <main className="relative z-10 grid h-[calc(100vh-64px)] grid-cols-[minmax(0,1fr)_360px_minmax(0,1fr)] items-center gap-6 px-8">
        <section className="flex justify-center gap-5">
          {participants.player.team.map((card, index) => (
            <LeadSelectionCard
              key={card.pokemon.id}
              card={card}
              index={index}
              side="player"
              selected={selection.playerIndex === index}
              locked={selection.playerLocked}
              revealed={selection.revealed}
              onSelect={onSelect}
            />
          ))}
        </section>

        <section className="grid h-full place-items-center text-center">
          <div className="w-full">
            <p className="text-7xl font-black leading-none text-white drop-shadow-[0_0_22px_rgba(34,211,238,0.34)]">{secondsLeft}</p>
            <p className="mt-5 text-3xl font-black text-white">{statusText}</p>
            <p className="mt-4 min-h-6 text-sm font-bold text-slate-400">
              {selection.revealed ? "即將進入戰鬥" : "雙方都鎖定後才會揭示對手選牌"}
            </p>
            <button
              type="button"
              disabled={!canLock}
              onClick={onLock}
              className="mt-16 min-h-14 min-w-[220px] rounded-2xl border border-cyan-300/45 bg-cyan-300 px-8 text-base font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
            >
              {selection.playerLocked ? "已鎖定" : "鎖定"}
            </button>
          </div>
        </section>

        <section className="flex justify-center gap-5">
          {participants.computer.team.map((card, index) => (
            <LeadSelectionCard
              key={card.pokemon.id}
              card={card}
              index={index}
              side="computer"
              selected={selection.computerIndex === index}
              locked={selection.computerLocked}
              revealed={selection.revealed}
              disabled
            />
          ))}
        </section>
      </main>
    </motion.div>
  );
}

function getSkillCategoryLabel(skill: Skill) {
  if (skill.category === "attack") return "攻擊";
  if (skill.category === "buff") return "強化";
  if (skill.category === "debuff") return "弱化";
  if (skill.category === "heal") return "治療";
  return "護盾";
}

function getSkillTargetLabel(skill: Skill) {
  if (skill.target === "ally") return "己方隊友";
  if (skill.target === "self") return "自己";
  return "敵方";
}

function getSkillEffectLabel(skill: Skill) {
  const labels: Record<Skill["effect"], string> = {
    none: "無額外效果",
    lower_attack: "下次攻擊降低 20%",
    lower_defense: "下次受傷增加 15%",
    lower_speed: "下回合時間減少",
    raise_attack: "攻擊提升 50%，可疊加至 x1.80",
    raise_defense: "防禦提升，可疊加至 x1.65",
    raise_speed: "下回合時間增加",
    heal_self: "回復最大 HP 18%",
    shield_self: "下次受傷降低 50%",
    burn: "追加最大 HP 6% 灼傷傷害",
    paralyze: "下次行動 25% 機率失敗",
    sleep: "下次行動跳過",
  };

  return labels[skill.effect];
}

function CenterActionPanel({
  activeCard,
  playerSkills,
  playerCanAct,
  playerShielded,
  pendingAllySkill,
  pendingSwitchTarget,
  onSkill,
  onBasicAttack,
  onShield,
  onRest,
  onSwitchPrompt,
  onCancelAllyTarget,
}: {
  activeCard: BattleCardState;
  playerSkills: Skill[];
  playerCanAct: boolean;
  playerShielded: boolean;
  pendingAllySkill: PendingAllySkill | null;
  pendingSwitchTarget: PendingSwitchTarget | null;
  onSkill: (skill: Skill) => void;
  onBasicAttack: () => void;
  onShield: () => void;
  onRest: () => void;
  onSwitchPrompt: () => void;
  onCancelAllyTarget: () => void;
}) {
  const canUseBasicAttack = activeCard.currentHp > 0 && activeCard.currentStamina >= BASIC_ATTACK_STAMINA_COST;
  const canUseShield = activeCard.currentHp > 0 && activeCard.currentStamina >= SHIELD_STAMINA_COST;
  const canRest = activeCard.currentHp > 0 && activeCard.currentStamina < activeCard.maxStamina && (activeCard.asleepTurns ?? 0) <= 0;
  const canSwitch = activeCard.currentHp > 0 && activeCard.currentStamina >= SWITCH_STAMINA_COST;
  const actionBlocked = !playerCanAct || Boolean(pendingAllySkill) || Boolean(pendingSwitchTarget);

  return (
    <div className="relative grid h-[224px] max-h-full min-h-0 min-w-0 grid-cols-[190px_minmax(0,1fr)_190px] gap-3 overflow-visible">
      <div className="grid min-h-0 grid-rows-2 gap-3 overflow-visible">
        <motion.button
          type="button"
          disabled={actionBlocked || !canSwitch}
          onClick={onSwitchPrompt}
          className="h-full rounded-2xl border border-slate-600/80 bg-slate-900/75 px-3 text-left transition hover:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-white">{battleUiText.switchCard}</p>
            <ChevronRight className="text-cyan-100" size={18} />
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-400">{battleUiText.switchHint} / {battleUiText.stamina} {SWITCH_STAMINA_COST}</p>
          {!canSwitch && <p className="mt-1 text-[10px] font-black text-rose-200">{battleUiText.staminaInsufficient}</p>}
        </motion.button>

        <motion.button
          type="button"
          disabled={actionBlocked || !canRest}
          onClick={onRest}
          className="h-full rounded-2xl border border-sky-300/35 bg-sky-300/10 px-3 text-left transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-white">{battleUiText.rest}</p>
            <BatteryCharging className="text-cyan-100" size={18} />
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-400">{battleUiText.restHint}</p>
          {!canRest && <p className="mt-1 text-[10px] font-black text-rose-200">{activeCard.currentStamina >= activeCard.maxStamina ? "體力已滿" : battleUiText.staminaInsufficient}</p>}
        </motion.button>
      </div>

      <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-3 overflow-visible">
          {playerSkills.slice(0, 4).map((skill, index) => {
            const tooltipHorizontalClass = index % 2 === 0 ? "left-0" : "right-0";
            const staminaCost = getSkillStaminaCost(skill);
            const hasStamina = canUseSkill(activeCard, skill);

            return (
              <div key={skill.id} className="group relative min-h-0 overflow-visible">
                <motion.button
                  type="button"
                  disabled={!playerCanAct || Boolean(pendingAllySkill) || Boolean(pendingSwitchTarget) || !hasStamina}
                  onClick={() => onSkill(skill)}
                  className="h-full w-full rounded-2xl border border-slate-700/80 bg-slate-900/75 p-3 text-left transition hover:border-cyan-300/45 hover:shadow-[0_0_18px_rgba(34,211,238,0.16)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <p className="truncate text-sm font-black text-white">{skill.name_zh || skill.name}</p>
                  <p className="mt-4 truncate text-xs font-bold text-slate-500">
                    {battleUiText.power} {skill.power} / {battleUiText.stamina} {staminaCost}
                  </p>
                  {!hasStamina && <p className="mt-1 text-[10px] font-black text-rose-200">{battleUiText.staminaInsufficient}</p>}
                </motion.button>
                <div className={["pointer-events-none absolute bottom-[calc(100%+10px)] z-50 w-[270px] rounded-xl border border-cyan-300/35 bg-slate-950/95 p-3 text-left opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100", tooltipHorizontalClass].join(" ")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{skill.name_zh || skill.name}</p>
                      <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{skill.name}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black text-cyan-100">{getTypeLabel(skill.type)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-300">
                    <span>{battleUiText.power} {skill.power}</span>
                    <span>{battleUiText.accuracy} {skill.accuracy}</span>
                    <span>{battleUiText.stamina} {staminaCost}</span>
                    <span>{getSkillCategoryLabel(skill)}</span>
                  </div>
                  <p className="mt-3 text-xs font-black leading-5 text-cyan-100">{getSkillEffectLabel(skill)}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-5 text-slate-400">{skill.description_zh || battleUiText.skillFallback}</p>
                </div>
              </div>
            );
          })}
          {playerSkills.length === 0 && <p className="col-span-2 row-span-2 grid place-items-center rounded-2xl border border-slate-700/80 bg-slate-950/70 text-xs font-black text-slate-500">沒有可用技能</p>}
      </div>

      <div className="grid min-h-0 grid-rows-2 gap-3 overflow-visible">
        <motion.button
          type="button"
          disabled={actionBlocked || !canUseBasicAttack}
          onClick={onBasicAttack}
          className="h-full rounded-2xl border border-orange-300/35 bg-orange-300/10 px-3 text-left transition hover:border-orange-200/60 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-white">普通攻擊</p>
            <Swords className="text-orange-100" size={18} />
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
            威力 {BASIC_ATTACK_POWER} / 體力 {BASIC_ATTACK_STAMINA_COST}
          </p>
          {!canUseBasicAttack && <p className="mt-1 text-[10px] font-black text-rose-200">{battleUiText.staminaInsufficient}</p>}
        </motion.button>

        <motion.button
          type="button"
          disabled={!playerCanAct || (!pendingAllySkill && !pendingSwitchTarget && (playerShielded || !canUseShield))}
          onClick={pendingAllySkill ? onCancelAllyTarget : onShield}
          className="h-full rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-3 text-left transition hover:border-cyan-200/60 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-white">{pendingAllySkill ? battleUiText.cancelTarget : pendingSwitchTarget ? battleUiText.cancelSwitch : battleUiText.shield}</p>
            <Shield className="text-cyan-100" size={18} />
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-400">{pendingAllySkill ? battleUiText.chooseAllyHint : pendingSwitchTarget ? (pendingSwitchTarget.forced ? battleUiText.chooseForcedSwitchTarget : battleUiText.chooseSwitchHint) : `下次受傷降低 40% / ${battleUiText.stamina} ${SHIELD_STAMINA_COST}`}</p>
          {!pendingAllySkill && !pendingSwitchTarget && !canUseShield && <p className="mt-1 text-[10px] font-black text-rose-200">{battleUiText.staminaInsufficient}</p>}
        </motion.button>
      </div>
    </div>
  );
}

function AllyTargetOverlay({
  participant,
  activeIndex,
  skill,
  onSelect,
  onCancel,
}: {
  participant: BattleParticipant;
  activeIndex: number;
  skill: Skill;
  onSelect: (index: number) => void;
  onCancel: () => void;
}) {
  const selectableCards = participant.team
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => index !== activeIndex && card.currentHp > 0);
  const skillName = skill.name_zh || skill.name;

  return (
    <AnimatePresence>
      <motion.div
        key="ally-target-overlay"
        className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/58 px-6 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <motion.div
          className="w-full max-w-[660px] text-center"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-100">Select Target</p>
          <h2 className="mt-3 text-3xl font-black text-white">{skillName}</h2>
          <p className="mt-2 text-sm font-bold text-slate-300">{battleUiText.chooseAllyHint}</p>

          <div className="mt-7 flex justify-center gap-5">
            {selectableCards.map(({ card, index }) => {
              const imageSrc = getPokemonImage(card.pokemon);
              return (
                <motion.button
                  key={card.pokemon.id}
                  type="button"
                  whileHover={{ y: -8, scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelect(index)}
                  style={{ width: 190, flex: "0 0 190px" }}
                  className="relative text-left"
                >
                  <div className="relative" style={{ aspectRatio: "1 / 1.45" }}>
                    {(card.shieldTurns ?? 0) > 0 && (
                      <div className="pointer-events-none absolute -inset-2 z-10 rounded-[24px] border border-cyan-200/55 bg-cyan-300/8 shadow-[0_0_24px_rgba(103,232,249,0.28),inset_0_0_18px_rgba(103,232,249,0.12)]" />
                    )}
                    <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} selected tone="player" />
                  </div>
                  <div className="mt-2 min-h-7">
                    <CardEffectBadges card={card} />
                  </div>
                </motion.button>
              );
            })}
          </div>

          {selectableCards.length === 0 && <p className="mt-8 text-base font-black text-slate-300">沒有可選擇的隊友。</p>}

          <button
            type="button"
            onClick={onCancel}
            className="mt-8 min-h-11 rounded-2xl border border-slate-600/80 bg-slate-950/80 px-5 text-sm font-black text-slate-200 transition hover:border-cyan-300/45"
          >
            {battleUiText.cancelTarget}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SwitchTargetOverlay({
  participant,
  activeIndex,
  forced = false,
  onSelect,
  onCancel,
}: {
  participant: BattleParticipant;
  activeIndex: number;
  forced?: boolean;
  onSelect: (index: number) => void;
  onCancel: () => void;
}) {
  const selectableCards = participant.team
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => index !== activeIndex && card.currentHp > 0);

  return (
    <AnimatePresence>
      <motion.div
        key="switch-target-overlay"
        className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/58 px-6 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <motion.div
          className="w-full max-w-[660px] text-center"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-100">Switch Target</p>
          <h2 className="mt-3 text-3xl font-black text-white">{battleUiText.chooseSwitchTarget}</h2>
          <p className="mt-2 text-sm font-bold text-slate-300">{forced ? battleUiText.chooseForcedSwitchTarget : battleUiText.chooseSwitchHint}</p>

          <div className="mt-7 flex justify-center gap-5">
            {selectableCards.map(({ card, index }) => {
              const imageSrc = getPokemonImage(card.pokemon);
              const hpPercent = Math.max(0, (card.currentHp / card.pokemon.max_hp) * 100);
              const staminaPercent = getStaminaPercent(card);
              return (
                <motion.button
                  key={card.pokemon.id}
                  type="button"
                  whileHover={{ y: -8, scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSelect(index)}
                  style={{ width: 190, flex: "0 0 190px" }}
                  className="relative text-left"
                >
                  <div className="relative" style={{ aspectRatio: "1 / 1.45" }}>
                    {(card.shieldTurns ?? 0) > 0 && (
                      <div className="pointer-events-none absolute -inset-2 z-10 rounded-[24px] border border-cyan-200/55 bg-cyan-300/8 shadow-[0_0_24px_rgba(103,232,249,0.28),inset_0_0_18px_rgba(103,232,249,0.12)]" />
                    )}
                    <PokemonDisplayCard pokemon={card.pokemon} imageSrc={imageSrc} selected tone="player" />
                  </div>
                  <div className="mt-3 rounded-2xl border border-slate-700/75 bg-slate-950/70 p-3">
                    <div className="flex items-center justify-between text-[11px] font-black text-slate-300">
                      <span>HP</span>
                      <span>{card.currentHp}/{card.pokemon.max_hp}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                      <span className={["block h-full rounded-full", getHpBarClass(hpPercent)].join(" ")} style={{ width: `${hpPercent}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] font-black text-slate-300">
                      <span>{battleUiText.stamina}</span>
                      <span>{card.currentStamina}/{card.maxStamina}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                      <span className="block h-full rounded-full bg-gradient-to-r from-sky-300 to-cyan-100" style={{ width: `${staminaPercent}%` }} />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {selectableCards.length === 0 && <p className="mt-8 text-base font-black text-slate-300">沒有可更換的備戰夥伴。</p>}

          {!forced && (
            <button
              type="button"
              onClick={onCancel}
              className="mt-8 min-h-11 rounded-2xl border border-slate-600/80 bg-slate-950/80 px-5 text-sm font-black text-slate-200 transition hover:border-cyan-300/45"
            >
              {battleUiText.cancelSwitch}
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function NormalBattlePage({
  onBack,
  appliedTrainingModel,
}: {
  onBack: () => void;
  appliedTrainingModel: AppliedTrainingModel | null;
}) {
  const availablePokemon = useMemo(() => getBattleEnabledPokemon(), []);
  const [phase, setPhase] = useState<NormalBattlePhase>("normalBattleRoom");
  const [currentPicker, setCurrentPicker] = useState<DraftPickSide>("player");
  const [matchDraftFirstPicker, setMatchDraftFirstPicker] = useState<DraftPickSide>("player");
  const [draftPool, setDraftPool] = useState<PokemonStats[]>(() => shufflePokemon(availablePokemon));
  const [playerDraftIds, setPlayerDraftIds] = useState<number[]>([]);
  const [computerDraftIds, setComputerDraftIds] = useState<number[]>([]);
  const [globalPickedIds, setGlobalPickedIds] = useState<number[]>([]);
  const [pendingPlayerPickId, setPendingPlayerPickId] = useState<number | null>(null);
  const [pendingComputerPickId, setPendingComputerPickId] = useState<number | null>(null);
  const [selectedDraftTypeFilters, setSelectedDraftTypeFilters] = useState<PokemonType[]>([]);
  const [pendingDraftTypeFilters, setPendingDraftTypeFilters] = useState<PokemonType[]>([]);
  const [isDraftTypeFilterOpen, setIsDraftTypeFilterOpen] = useState(false);
  const [selectedDraftRoleFilter, setSelectedDraftRoleFilter] = useState<PokedexRoleFilter>("all");
  const [draftSecondsLeft, setDraftSecondsLeft] = useState(DRAFT_SECONDS);
  const [battleReadySecondsLeft, setBattleReadySecondsLeft] = useState(BATTLE_READY_SECONDS);
  const [participants, setParticipants] = useState<BattleParticipants | null>(null);
  const [turn, setTurn] = useState<BattleTurnState>({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "請準備開始對戰。" });
  const [winner, setWinner] = useState<BattleSide | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundWins, setRoundWins] = useState<RoundWins>({ player: 0, computer: 0 });
  const [roundWinner, setRoundWinner] = useState<BattleSide | null>(null);
  const [matchWinner, setMatchWinner] = useState<BattleSide | null>(null);
  const [interRoundSecondsLeft, setInterRoundSecondsLeft] = useState(INTER_ROUND_SECONDS);
  const [, setPlayerShielded] = useState(false);
  const [pendingAllySkill, setPendingAllySkill] = useState<PendingAllySkill | null>(null);
  const [pendingSwitchTarget, setPendingSwitchTarget] = useState<PendingSwitchTarget | null>(null);
  const [hasComputerOpponent, setHasComputerOpponent] = useState(false);
  const [battleAnimation, setBattleAnimation] = useState<BattleAnimationState | null>(null);
  const [battleStartIntro, setBattleStartIntro] = useState<BattleStartIntroPhase | null>(null);
  const [leadSelectionSecondsLeft, setLeadSelectionSecondsLeft] = useState(LEAD_SELECTION_SECONDS);
  const [leadSelection, setLeadSelection] = useState<LeadSelectionState>({
    playerIndex: null,
    computerIndex: null,
    playerLocked: false,
    computerLocked: false,
    revealed: false,
  });
  const cpuPickPreviewTimerRef = useRef<number | null>(null);
  const cpuDraftTimerRef = useRef<number | null>(null);
  const battleStartTimerRef = useRef<number | null>(null);
  const battleAnimationTimerRefs = useRef<number[]>([]);
  const battleStartIntroTimerRefs = useRef<number[]>([]);
  const cpuLeadLockTimerRef = useRef<number | null>(null);
  const leadRevealTimerRef = useRef<number | null>(null);
  const appliedModelAgentRef = useRef<LearningAgent | null>(null);
  const [appliedModelLoadStatus, setAppliedModelLoadStatus] = useState<AppliedModelLoadStatus>("idle");
  const scoreText = `玩家 ${roundWins.player} - ${roundWins.computer} 電腦`;
  const roundText = `第 ${currentRound} 局`;

  const filteredDraftPool = useMemo(() => {
    const hasActiveFilter = selectedDraftTypeFilters.length > 0 || selectedDraftRoleFilter !== "all";

    if (!hasActiveFilter) return draftPool;

    return draftPool.filter((pokemon) => {
      const matchesType = selectedDraftTypeFilters.length === 0 || selectedDraftTypeFilters.every((type) => pokemon.types.includes(type));
      const matchesRole = selectedDraftRoleFilter === "all" || pokemon.role === selectedDraftRoleFilter;

      return matchesType && matchesRole;
    });
  }, [draftPool, selectedDraftRoleFilter, selectedDraftTypeFilters]);
  const playerDraft = playerDraftIds.flatMap((id) => (getPokemonById(id) ? [getPokemonById(id)!] : []));
  const computerDraft = computerDraftIds.flatMap((id) => (getPokemonById(id) ? [getPokemonById(id)!] : []));
  const teamsReady = playerDraftIds.length >= REQUIRED_TEAM_SIZE && computerDraftIds.length >= REQUIRED_TEAM_SIZE;
  const pendingPlayerPick = pendingPlayerPickId ? getPokemonById(pendingPlayerPickId) : undefined;
  const pendingComputerPick = pendingComputerPickId ? getPokemonById(pendingComputerPickId) : undefined;
  const computerBattleMode: ComputerBattleMode = appliedTrainingModel?.computerDifficulty ?? "random";

  useEffect(() => {
    let cancelled = false;

    async function loadAppliedModel() {
      if (!appliedTrainingModel) {
        appliedModelAgentRef.current = null;
        setAppliedModelLoadStatus("idle");
        return;
      }

      setAppliedModelLoadStatus("loading");
      try {
        const response = await fetch(`${TRAINING_API_BASE}/api/training/models/${encodeURIComponent(appliedTrainingModel.id)}/artifacts`);
        if (!response.ok) throw new Error("無法讀取已保存的訓練模型權重。");
        const payload = (await response.json()) as TrainingModelArtifactsPayload;
        const agent = new LearningAgent();
        await agent.importArtifacts({
          modelTopology: payload.modelTopology,
          weightSpecs: payload.weightSpecs,
          weightData: base64ToArrayBuffer(payload.weightDataBase64),
        } as tf.io.ModelArtifacts);
        agent.epsilon = 0;
        if (cancelled) return;
        appliedModelAgentRef.current = agent;
        setAppliedModelLoadStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.warn("[normal-battle] 訓練模型載入失敗，改用難度規則。", error);
        appliedModelAgentRef.current = null;
        setAppliedModelLoadStatus("error");
      }
    }

    void loadAppliedModel();
    return () => {
      cancelled = true;
    };
  }, [appliedTrainingModel]);

  const clearBattleAnimationTimers = useCallback(() => {
    battleAnimationTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    battleAnimationTimerRefs.current = [];
  }, []);

  const clearBattleStartIntroTimers = useCallback(() => {
    battleStartIntroTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    battleStartIntroTimerRefs.current = [];
  }, []);

  const clearLeadSelectionTimers = useCallback(() => {
    if (cpuLeadLockTimerRef.current) window.clearTimeout(cpuLeadLockTimerRef.current);
    if (leadRevealTimerRef.current) window.clearTimeout(leadRevealTimerRef.current);
    cpuLeadLockTimerRef.current = null;
    leadRevealTimerRef.current = null;
  }, []);

  const resetBattle = useCallback(() => {
    clearBattleAnimationTimers();
    clearBattleStartIntroTimers();
    clearLeadSelectionTimers();
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
    setSelectedDraftTypeFilters([]);
    setPendingDraftTypeFilters([]);
    setIsDraftTypeFilterOpen(false);
    setSelectedDraftRoleFilter("all");
    setDraftSecondsLeft(DRAFT_SECONDS);
    setBattleReadySecondsLeft(BATTLE_READY_SECONDS);
    setParticipants(null);
    setWinner(null);
    setCurrentRound(1);
    setRoundWins({ player: 0, computer: 0 });
    setRoundWinner(null);
    setMatchWinner(null);
    setInterRoundSecondsLeft(INTER_ROUND_SECONDS);
    setPlayerShielded(false);
    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setHasComputerOpponent(false);
    setBattleAnimation(null);
    setBattleStartIntro(null);
    setLeadSelectionSecondsLeft(LEAD_SELECTION_SECONDS);
    setLeadSelection({ playerIndex: null, computerIndex: null, playerLocked: false, computerLocked: false, revealed: false });
    setTurn({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "請準備開始對戰。" });
    setMatchDraftFirstPicker("player");
  }, [clearBattleAnimationTimers, clearBattleStartIntroTimers, clearLeadSelectionTimers]);

  function resetRoundSetup(firstPicker: DraftPickSide) {
    clearBattleAnimationTimers();
    clearBattleStartIntroTimers();
    clearLeadSelectionTimers();
    if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
    if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);
    if (battleStartTimerRef.current) window.clearTimeout(battleStartTimerRef.current);
    cpuPickPreviewTimerRef.current = null;
    cpuDraftTimerRef.current = null;
    battleStartTimerRef.current = null;
    setCurrentPicker(firstPicker);
    setDraftPool(shufflePokemon(availablePokemon));
    setPlayerDraftIds([]);
    setComputerDraftIds([]);
    setGlobalPickedIds([]);
    setPendingPlayerPickId(null);
    setPendingComputerPickId(null);
    setSelectedDraftTypeFilters([]);
    setPendingDraftTypeFilters([]);
    setIsDraftTypeFilterOpen(false);
    setSelectedDraftRoleFilter("all");
    setDraftSecondsLeft(DRAFT_SECONDS);
    setBattleReadySecondsLeft(BATTLE_READY_SECONDS);
    setParticipants(null);
    setWinner(null);
    setRoundWinner(null);
    setPlayerShielded(false);
    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setBattleAnimation(null);
    setBattleStartIntro(null);
    setLeadSelectionSecondsLeft(LEAD_SELECTION_SECONDS);
    setLeadSelection({ playerIndex: null, computerIndex: null, playerLocked: false, computerLocked: false, revealed: false });
    setTurn({ attacker: "player", secondsLeft: TURN_SECONDS, locked: false, message: "請準備開始對戰。" });
  }

  function enterDraftRoom() {
    const firstPicker: DraftPickSide = Math.random() < 0.5 ? "player" : "computer";
    setMatchDraftFirstPicker(firstPicker);
    resetRoundSetup(firstPicker);
    setCurrentRound(1);
    setRoundWins({ player: 0, computer: 0 });
    setMatchWinner(null);
    setInterRoundSecondsLeft(INTER_ROUND_SECONDS);
    setPhase("draftSelection");
  }

  function prepareNextRound() {
    const nextRound = Math.min(3, currentRound + 1);
    resetRoundSetup(getRoundFirstPicker(matchDraftFirstPicker, nextRound));
    setCurrentRound(nextRound);
    setInterRoundSecondsLeft(INTER_ROUND_SECONDS);
    setPhase("draftSelection");
  }

  function startBattle(playerIds: number[], computerIds: number[]) {
    const nextParticipants: BattleParticipants = {
      player: { activeIndex: 0, team: playerIds.flatMap((id) => (getPokemonById(id) ? [createBattleCard(getPokemonById(id)!)] : [])) },
      computer: { activeIndex: 0, team: computerIds.flatMap((id) => (getPokemonById(id) ? [createBattleCard(getPokemonById(id)!)] : [])) },
    };
    setParticipants(nextParticipants);
    setWinner(null);
    setPlayerShielded(false);
    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setTurn({
      attacker: "player",
      secondsLeft: TURN_SECONDS,
      locked: true,
      message: "請選擇第一位出戰夥伴。",
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

      setPlayerDraftIds(nextPlayerIds);
      setGlobalPickedIds(nextPickedIds);
      setPendingPlayerPickId(null);
      setPendingComputerPickId(null);
      setCurrentPicker("computer");
      setDraftSecondsLeft(DRAFT_SECONDS);
    },
    [currentPicker, globalPickedIds, pendingPlayerPickId, playerDraftIds],
  );

  const openDraftTypeFilterDialog = () => {
    setPendingDraftTypeFilters(selectedDraftTypeFilters);
    setIsDraftTypeFilterOpen(true);
  };

  const togglePendingDraftTypeFilter = (type: PokemonType) => {
    setPendingDraftTypeFilters((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      if (current.length >= 2) return current;
      return [...current, type];
    });
  };

  const applyDraftTypeFilter = () => {
    setSelectedDraftTypeFilters(pendingDraftTypeFilters);
    setIsDraftTypeFilterOpen(false);
  };

  function getFirstLivingLeadIndex(side: BattleSide) {
    if (!participants) return 0;
    const index = participants[side].team.findIndex((card) => card.currentHp > 0);
    return Math.max(0, index);
  }

  function chooseComputerLeadIndex() {
    if (!participants) return 0;
    const livingIndexes = participants.computer.team
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.currentHp > 0)
      .map(({ index }) => index);

    if (livingIndexes.length === 0) return 0;
    return livingIndexes[Math.floor(Math.random() * livingIndexes.length)];
  }

  function selectLeadCard(index: number) {
    if (!participants || leadSelection.playerLocked || leadSelection.revealed) return;
    const selected = participants.player.team[index];
    if (!selected || selected.currentHp <= 0) return;
    setLeadSelection((current) => ({ ...current, playerIndex: index }));
  }

  function lockPlayerLeadSelection() {
    if (!participants || leadSelection.playerLocked || leadSelection.revealed) return;
    const fallbackIndex = getFirstLivingLeadIndex("player");
    setLeadSelection((current) => ({
      ...current,
      playerIndex: current.playerIndex ?? fallbackIndex,
      playerLocked: true,
    }));
  }

  function completeLeadSelection(selection: LeadSelectionState) {
    if (!participants || selection.playerIndex === null || selection.computerIndex === null) return;

    const nextParticipants: BattleParticipants = {
      player: { ...participants.player, activeIndex: selection.playerIndex },
      computer: { ...participants.computer, activeIndex: selection.computerIndex },
    };
    const playerLead = nextParticipants.player.team[selection.playerIndex];
    const computerLead = nextParticipants.computer.team[selection.computerIndex];
    const openingAttacker =
      playerLead.pokemon.speed === computerLead.pokemon.speed
        ? Math.random() > 0.5 ? "player" : "computer"
        : playerLead.pokemon.speed > computerLead.pokemon.speed ? "player" : "computer";
    const openingMessage =
      playerLead.pokemon.speed === computerLead.pokemon.speed
        ? `雙方出戰夥伴已鎖定，速度相同，${getSideLabel(openingAttacker)}取得先攻。`
        : `雙方出戰夥伴已鎖定，${getSideLabel(openingAttacker)}速度較快，取得先攻。`;

    clearLeadSelectionTimers();
    clearBattleStartIntroTimers();
    setParticipants(nextParticipants);
    setTurn({
      attacker: openingAttacker,
      secondsLeft: TURN_SECONDS,
      locked: true,
      message: openingMessage,
    });
    setBattleStartIntro("start");
    setPhase("battleArena");

    const handoffTimer = window.setTimeout(() => {
      setBattleStartIntro("handoff");
    }, BATTLE_START_INTRO_START_MS);
    const clearIntroTimer = window.setTimeout(() => {
      setBattleStartIntro(null);
      battleStartIntroTimerRefs.current = [];
      setTurn((current) => ({ ...current, locked: false, message: openingMessage }));
    }, BATTLE_START_INTRO_START_MS + BATTLE_START_INTRO_HANDOFF_MS);

    battleStartIntroTimerRefs.current = [handoffTimer, clearIntroTimer];
  }

  useEffect(() => {
    if (phase !== "draftSelection" || teamsReady) return;
    const timer = window.setInterval(() => setDraftSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phase, teamsReady]);

  useEffect(() => {
    if (phase !== "draftSelection" || currentPicker !== "computer" || teamsReady || computerDraftIds.length >= REQUIRED_TEAM_SIZE) return;
    if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
    if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);

    const availableForCpu = draftPool.filter((pokemon) => !globalPickedIds.includes(pokemon.id));
    const selectedCpuPokemon = chooseComputerDraftPokemon(availableForCpu, computerBattleMode);

    cpuPickPreviewTimerRef.current = window.setTimeout(() => {
      if (selectedCpuPokemon) setPendingComputerPickId(selectedCpuPokemon.id);
    }, (DRAFT_SECONDS - CPU_PICK_PREVIEW_SECONDS) * 1000);

    cpuDraftTimerRef.current = window.setTimeout(() => {
      let nextComputerIds = [...computerDraftIds];
      let nextPickedIds = [...globalPickedIds];

      if (selectedCpuPokemon && !nextPickedIds.includes(selectedCpuPokemon.id)) {
        nextComputerIds = [...nextComputerIds, selectedCpuPokemon.id];
        nextPickedIds = [...nextPickedIds, selectedCpuPokemon.id];
      }

      setComputerDraftIds(nextComputerIds);
      setGlobalPickedIds(nextPickedIds);
      setPendingComputerPickId(null);
      setCurrentPicker("player");
      setDraftSecondsLeft(DRAFT_SECONDS);

      if (playerDraftIds.length >= REQUIRED_TEAM_SIZE && nextComputerIds.length >= REQUIRED_TEAM_SIZE) {
        setBattleReadySecondsLeft(BATTLE_READY_SECONDS);
      }
    }, (DRAFT_SECONDS - CPU_PICK_LOCK_SECONDS) * 1000);

    return () => {
      if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
      if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);
      cpuPickPreviewTimerRef.current = null;
      cpuDraftTimerRef.current = null;
    };
  }, [computerBattleMode, computerDraftIds, currentPicker, draftPool, globalPickedIds, phase, playerDraftIds.length, teamsReady]);

  useEffect(() => {
    return () => {
      clearBattleAnimationTimers();
      clearBattleStartIntroTimers();
      clearLeadSelectionTimers();
      if (cpuPickPreviewTimerRef.current) window.clearTimeout(cpuPickPreviewTimerRef.current);
      if (cpuDraftTimerRef.current) window.clearTimeout(cpuDraftTimerRef.current);
      if (battleStartTimerRef.current) window.clearTimeout(battleStartTimerRef.current);
    };
  }, [clearBattleAnimationTimers, clearBattleStartIntroTimers, clearLeadSelectionTimers]);

  useEffect(() => {
    if (phase !== "leadSelection" || !participants) return;

    clearLeadSelectionTimers();
    setLeadSelectionSecondsLeft(LEAD_SELECTION_SECONDS);
    setLeadSelection({ playerIndex: null, computerIndex: null, playerLocked: false, computerLocked: false, revealed: false });
    setTurn((current) => ({ ...current, locked: true, message: "請選擇第一位出戰夥伴。" }));

    cpuLeadLockTimerRef.current = window.setTimeout(() => {
      setLeadSelection((current) => {
        if (current.computerLocked) return current;
        return {
          ...current,
          computerIndex: current.computerIndex ?? chooseComputerLeadIndex(),
          computerLocked: true,
        };
      });
    }, CPU_LEAD_LOCK_DELAY_MS);

    return () => {
      clearLeadSelectionTimers();
    };
  }, [clearLeadSelectionTimers, participants, phase]);

  useEffect(() => {
    if (phase !== "leadSelection" || leadSelection.revealed) return;
    const timer = window.setTimeout(() => setLeadSelectionSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [leadSelection.revealed, leadSelectionSecondsLeft, phase]);

  useEffect(() => {
    if (phase !== "leadSelection" || leadSelection.revealed || leadSelection.playerLocked || leadSelectionSecondsLeft > 0) return;
    lockPlayerLeadSelection();
  }, [leadSelection.playerLocked, leadSelection.revealed, leadSelectionSecondsLeft, phase]);

  useEffect(() => {
    if (phase !== "leadSelection" || !participants || leadSelection.revealed || !leadSelection.playerLocked || !leadSelection.computerLocked) return;
    const nextSelection: LeadSelectionState = {
      ...leadSelection,
      playerIndex: leadSelection.playerIndex ?? getFirstLivingLeadIndex("player"),
      computerIndex: leadSelection.computerIndex ?? getFirstLivingLeadIndex("computer"),
      revealed: true,
    };

    setLeadSelection(nextSelection);
    leadRevealTimerRef.current = window.setTimeout(() => {
      completeLeadSelection(nextSelection);
    }, LEAD_SELECTION_REVEAL_MS);
  }, [leadSelection, participants, phase]);

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
    if (phase !== "roundResult") return;
    if (interRoundSecondsLeft > 0) {
      const timer = window.setTimeout(() => setInterRoundSecondsLeft((current) => Math.max(0, current - 1)), 1000);
      return () => window.clearTimeout(timer);
    }

    prepareNextRound();
  }, [interRoundSecondsLeft, phase]);

  useEffect(() => {
    if (phase !== "draftSelection" || currentPicker !== "player" || draftSecondsLeft > 0) return;
    const fallbackId = pendingPlayerPickId ?? draftPool.find((pokemon) => !globalPickedIds.includes(pokemon.id))?.id;
    if (fallbackId) lockDraftPick("timeout", fallbackId);
  }, [currentPicker, draftPool, draftSecondsLeft, globalPickedIds, lockDraftPick, pendingPlayerPickId, phase]);

  useEffect(() => {
    if (!pendingPlayerPickId) return;
    const pendingStillVisible = filteredDraftPool.some((pokemon) => pokemon.id === pendingPlayerPickId);
    if (!pendingStillVisible) setPendingPlayerPickId(null);
  }, [filteredDraftPool, pendingPlayerPickId]);

  useEffect(() => {
    if (phase !== "battleArena" || winner || turn.locked || turn.secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setTurn((current) => ({ ...current, secondsLeft: Math.max(0, current.secondsLeft - 1) })), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, turn.locked, turn.secondsLeft, winner]);

  useEffect(() => {
    if (phase !== "battleArena" || winner || turn.locked || turn.attacker !== "computer" || battleAnimation || !participants) return;
    if (appliedTrainingModel && appliedModelLoadStatus === "loading") return;
    const timer = window.setTimeout(() => {
      const active = participants.computer.team[participants.computer.activeIndex];
      const opponentActive = participants.player.team[participants.player.activeIndex];
      const modelAgent = appliedModelAgentRef.current;
      const modelState = buildComputerBattleState();
      if (modelAgent && modelState) {
        const legalActions = getLegalActions(modelState, "computer");
        const selectedAction = modelAgent.selectAction(modelState, legalActions);
        const legalAction = legalActions.find((action) => JSON.stringify(action) === JSON.stringify(selectedAction)) ?? legalActions[0];
        if (legalAction) {
          executeComputerModelAction(legalAction);
          return;
        }
      }

      const switchIndex = chooseComputerSwitchIndex(participants.computer, opponentActive, computerBattleMode);
      if (switchIndex >= 0) {
        switchComputerPokemon(switchIndex);
        return;
      }

      const skill = chooseComputerSkill(active, participants.computer.team, opponentActive, computerBattleMode);
      if (skill) {
        resolveSkill(skill, "computer");
        return;
      }
      restBattleTurn("computer");
    }, COMPUTER_ACTION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [appliedModelLoadStatus, appliedTrainingModel, battleAnimation, computerBattleMode, participants, phase, turn.attacker, turn.locked, winner]);

  useEffect(() => {
    if (phase !== "battleArena" || winner || turn.locked || turn.attacker !== "player" || turn.secondsLeft > 0 || !participants) return;
    if (pendingSwitchTarget?.forced) {
      const fallbackIndex = getLivingIndex(participants.player.team, participants.player.activeIndex);
      if (fallbackIndex >= 0) switchPlayerPokemon(fallbackIndex);
      return;
    }
    if (pendingSwitchTarget) {
      setPendingSwitchTarget(null);
      setTurn((current) => ({ ...current, secondsLeft: TURN_SECONDS, message: "更換逾時，請重新行動。" }));
      return;
    }
    const active = participants.player.team[participants.player.activeIndex];
    const playerSkills = getPokemonSkills(active.pokemon).filter((skill) => canUseSkill(active, skill));
    const skill = playerSkills.find((item) => item.category === "attack") ?? playerSkills[0];
    if (skill) {
      resolveSkill(skill, "manual");
      return;
    }
    restBattleTurn("player");
  });

  function finishRound(roundBattleWinner: BattleSide, message: string) {
    const nextRoundWins: RoundWins = {
      ...roundWins,
      [roundBattleWinner]: roundWins[roundBattleWinner] + 1,
    };
    const finalMessage = `${message} ${getSideLabel(roundBattleWinner)}拿下第 ${currentRound} 局。`;

    setRoundWins(nextRoundWins);
    setRoundWinner(roundBattleWinner);
    setTurn((current) => ({ ...current, locked: true, message: finalMessage }));

    if (nextRoundWins[roundBattleWinner] >= MATCH_WIN_TARGET) {
      setWinner(roundBattleWinner);
      setMatchWinner(roundBattleWinner);
      setPhase("battleResult");
      return;
    }

    setWinner(null);
    setMatchWinner(null);
    setInterRoundSecondsLeft(INTER_ROUND_SECONDS);
    setPhase("roundResult");
  }

  function completeSwitchEntry(nextParticipants: BattleParticipants, nextTurnSide: BattleSide, message: string) {
    if (isTeamDefeated(nextParticipants.player.team)) {
      finishRound("computer", message);
      return;
    }

    if (isTeamDefeated(nextParticipants.computer.team)) {
      finishRound("player", message);
      return;
    }

    if (queueForcedReplacement(nextParticipants, "player", nextTurnSide, message)) return;
    if (queueForcedReplacement(nextParticipants, "computer", nextTurnSide, message)) return;

    const nextTurnParticipant = nextParticipants[nextTurnSide];
    const nextTurnCard = nextTurnParticipant.team[nextTurnParticipant.activeIndex];
    let nextTurnSeconds = TURN_SECONDS;
    if ((nextTurnCard.speedBoostTurns ?? 0) > 0) {
      nextTurnSeconds = TURN_SECONDS + 5;
      nextTurnCard.speedBoostTurns = 0;
    }
    if ((nextTurnCard.speedDownTurns ?? 0) > 0) {
      nextTurnSeconds = Math.max(8, TURN_SECONDS - 5);
      nextTurnCard.speedDownTurns = 0;
    }
    const staminaRecovered = recoverStamina(nextTurnCard, TURN_STAMINA_RECOVERY);

    setParticipants(nextParticipants);
    setTurn({
      attacker: nextTurnSide,
      secondsLeft: nextTurnSeconds,
      locked: false,
      message: [
        message,
        staminaRecovered > 0 ? `${getPokemonLabel(nextTurnCard.pokemon)} 回復 ${staminaRecovered} 體力。` : "",
      ].filter(Boolean).join(" "),
    });
  }

  function startSwitchEntryTimeline({
    nextParticipants,
    side,
    previousCard,
    selectedIndex,
    nextTurnSide,
    message,
    abilityMessages = [],
    forced = false,
  }: {
    nextParticipants: BattleParticipants;
    side: BattleSide;
    previousCard: BattleCardState;
    selectedIndex: number;
    nextTurnSide: BattleSide;
    message: string;
    abilityMessages?: string[];
    forced?: boolean;
  }) {
    const selectedCard = nextParticipants[side].team[selectedIndex];
    const selectedName = getPokemonLabel(selectedCard.pokemon);
    const finalMessage = abilityMessages.length > 0 ? `${message} ${abilityMessages.join(" ")}` : message;

    startBattleActionTimeline({
      actionType: "switch",
      attackerSide: side,
      defenderSide: nextTurnSide,
      attackerName: getPokemonLabel(previousCard.pokemon),
      defenderName: selectedName,
      skill: createSwitchSkill(selectedCard),
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: battleUiText.chooseSwitchTarget,
      isHit: false,
      message,
      finalMessage,
      abilityMessages,
      nextParticipants,
      actionTitle: `${selectedName} 上場！`,
      actionSubtitle: forced ? "Next Entry" : "Switch Locked",
      effectLabel: forced ? "出場完成" : "更換完成",
      displayPokemon: selectedCard.pokemon,
      switchEntryPokemonId: selectedCard.pokemon.id,
      nextTurnSide,
    });
  }

  function queueForcedReplacement(nextParticipants: BattleParticipants, side: BattleSide, nextTurnSide: BattleSide, message: string) {
    const participant = nextParticipants[side];
    const activeCard = participant.team[participant.activeIndex];
    if (!activeCard || activeCard.currentHp > 0) return false;

    const nextIndex = getLivingIndex(participant.team, participant.activeIndex);
    if (nextIndex < 0) return false;

    const replacementMessage = `${message} ${getSideLabel(side)}需要派出下一位夥伴。`;
    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setPlayerShielded(false);

    if (side === "player") {
      setParticipants(nextParticipants);
      setPendingSwitchTarget({
        side: "player",
        forced: true,
        nextTurnSide,
        message: replacementMessage,
      });
      setTurn({
        attacker: nextTurnSide,
        secondsLeft: TURN_SECONDS,
        locked: true,
        message: battleUiText.chooseForcedSwitchTarget,
      });
      return true;
    }

    const switchedParticipants = cloneParticipants(nextParticipants);
    const previousCard = switchedParticipants.computer.team[switchedParticipants.computer.activeIndex];
    switchedParticipants.computer = { ...switchedParticipants.computer, activeIndex: nextIndex };
    startSwitchEntryTimeline({
      nextParticipants: switchedParticipants,
      side: "computer",
      previousCard,
      selectedIndex: nextIndex,
      nextTurnSide,
      message: replacementMessage,
      forced: true,
    });
    return true;
  }

  function startBattleActionTimeline(animation: Omit<BattleAnimationState, "phase">) {
    clearBattleAnimationTimers();
    setBattleAnimation({ ...animation, phase: "card" });
    const hasAbilityBroadcast = animation.abilityMessages.length > 0;
    const handoffDelayMs = hasAbilityBroadcast
      ? BATTLE_ANIMATION_HANDOFF_MS + BATTLE_ANIMATION_ABILITY_DURATION_MS
      : BATTLE_ANIMATION_HANDOFF_MS;
    const roundWillEnd = isTeamDefeated(animation.nextParticipants.player.team) || isTeamDefeated(animation.nextParticipants.computer.team);
    const shouldShowHandoff = !animation.skipHandoff && !roundWillEnd;
    const turnUpdateDelayMs = shouldShowHandoff
      ? handoffDelayMs + BATTLE_ANIMATION_HANDOFF_DURATION_MS
      : handoffDelayMs;

    const bannerTimer = window.setTimeout(() => {
      setBattleAnimation((current) => current ? { ...current, phase: "banner" } : current);
    }, BATTLE_ANIMATION_CARD_MS);

    const impactTimer = window.setTimeout(() => {
      setParticipants(animation.nextParticipants);
      if (animation.consumePlayerShield) setPlayerShielded(false);
      setTurn((current) => ({ ...current, locked: true, message: animation.message }));
      setBattleAnimation((current) => current ? { ...current, phase: "impact" } : current);
    }, BATTLE_ANIMATION_IMPACT_MS);

    const abilityTimer = window.setTimeout(() => {
      if (!hasAbilityBroadcast) return;
      setTurn((current) => ({ ...current, locked: true, message: animation.finalMessage }));
      setBattleAnimation((current) => current ? { ...current, phase: "ability" } : current);
    }, BATTLE_ANIMATION_HANDOFF_MS);

    const handoffTimer = shouldShowHandoff
      ? window.setTimeout(() => {
        setBattleAnimation((current) => current ? { ...current, phase: "handoff" } : current);
      }, handoffDelayMs)
      : null;

    const turnUpdateTimer = window.setTimeout(() => {
      if (animation.actionType === "switch" && animation.nextTurnSide) {
        completeSwitchEntry(animation.nextParticipants, animation.nextTurnSide, animation.finalMessage);
        return;
      }
      updateAfterDamage(animation.nextParticipants, animation.defenderSide, animation.attackerSide, animation.finalMessage);
    }, turnUpdateDelayMs);

    const clearTimer = window.setTimeout(() => {
      setBattleAnimation(null);
      battleAnimationTimerRefs.current = [];
    }, turnUpdateDelayMs + BATTLE_ANIMATION_CLEAR_DELAY_MS);

    battleAnimationTimerRefs.current = [bannerTimer, impactTimer, abilityTimer, turnUpdateTimer, clearTimer];
    if (handoffTimer) battleAnimationTimerRefs.current.push(handoffTimer);
  }

  function updateAfterDamage(nextParticipants: BattleParticipants, defenderSide: BattleSide, attackerSide: BattleSide, message: string) {
    const defender = nextParticipants[defenderSide];
    const attacker = nextParticipants[attackerSide];
    const nextIndex = getLivingIndex(defender.team, defender.activeIndex);
    if (isTeamDefeated(defender.team)) {
      const battleWinner = defenderSide === "player" ? "computer" : "player";
      setParticipants(nextParticipants);
      finishRound(battleWinner, message);
      return;
    }

    if (isTeamDefeated(attacker.team)) {
      const battleWinner = attackerSide === "player" ? "computer" : "player";
      setParticipants(nextParticipants);
      finishRound(battleWinner, message);
      return;
    }

    if (nextIndex !== defender.activeIndex && queueForcedReplacement(nextParticipants, defenderSide, defenderSide, message)) return;
    if (getLivingIndex(attacker.team, attacker.activeIndex) !== attacker.activeIndex && queueForcedReplacement(nextParticipants, attackerSide, defenderSide, message)) return;

    const nextTurnCard = nextParticipants[defenderSide].team[nextParticipants[defenderSide].activeIndex];
    let nextTurnSeconds = TURN_SECONDS;
    if ((nextTurnCard.speedBoostTurns ?? 0) > 0) {
      nextTurnSeconds = TURN_SECONDS + 5;
      nextTurnCard.speedBoostTurns = 0;
    }
    if ((nextTurnCard.speedDownTurns ?? 0) > 0) {
      nextTurnSeconds = Math.max(8, TURN_SECONDS - 5);
      nextTurnCard.speedDownTurns = 0;
    }
    const staminaRecovered = recoverStamina(nextTurnCard, TURN_STAMINA_RECOVERY);

    setParticipants(nextParticipants);
    setTurn({
      attacker: defenderSide,
      secondsLeft: nextTurnSeconds,
      locked: false,
      message: [
        message,
        staminaRecovered > 0 ? `${getPokemonLabel(nextTurnCard.pokemon)} 回復 ${staminaRecovered} 體力。` : "",
      ].filter(Boolean).join(" "),
    });
  }

  function resolveSkill(skill: Skill, source: "manual" | "computer", allyTargetIndex?: number, options?: { staminaCostOverride?: number }) {
    if (!participants || turn.locked || winner) return;
    const attackerSide = source === "computer" ? "computer" : turn.attacker;
    const defenderSide: BattleSide = attackerSide === "player" ? "computer" : "player";
    const attackerParticipant = participants[attackerSide];
    const defenderParticipant = participants[defenderSide];
    const attackerCard = attackerParticipant.team[attackerParticipant.activeIndex];
    const defenderCard = defenderParticipant.team[defenderParticipant.activeIndex];
    const staminaCost = options?.staminaCostOverride ?? getSkillStaminaCost(skill);

    if (attackerCard.currentHp <= 0 || attackerCard.currentStamina < staminaCost) {
      setTurn((current) => ({
        ...current,
        message: `${getPokemonLabel(attackerCard.pokemon)} 體力不足，無法使用 ${skill.name_zh || skill.name}（需要 ${staminaCost} 體力）。`,
      }));
      return;
    }

    if (source === "manual" && skill.target === "ally" && allyTargetIndex === undefined) {
      setPendingSwitchTarget(null);
      setPendingAllySkill({ skill, side: attackerSide });
      setTurn((current) => ({ ...current, message: `${getPokemonLabel(attackerCard.pokemon)} 準備使用 ${skill.name_zh || skill.name}，請選擇治療目標。` }));
      return;
    }

    const nextParticipants = cloneParticipants(participants);
    const nextAttacker = nextParticipants[attackerSide].team[attackerParticipant.activeIndex];
    const nextDefender = nextParticipants[defenderSide].team[defenderParticipant.activeIndex];
    const allyIndex = allyTargetIndex ?? findMostInjuredLivingIndex(nextParticipants[attackerSide].team);
    const nextAllyTarget = skill.target === "ally" && allyIndex >= 0
      ? nextParticipants[attackerSide].team[allyIndex]
      : nextAttacker;
    const actionBlockedMessage = consumeActionBlocker(nextAttacker);

    if (actionBlockedMessage) {
      setPendingAllySkill(null);
      setPendingSwitchTarget(null);
      setParticipants(nextParticipants);
      setTurn((current) => ({ ...current, locked: true }));
      window.setTimeout(() => updateAfterDamage(nextParticipants, defenderSide, attackerSide, `${getPokemonLabel(attackerCard.pokemon)} ${actionBlockedMessage}`), 450);
      return;
    }

    nextAttacker.currentStamina = Math.max(0, nextAttacker.currentStamina - staminaCost);

    const result = calculateDamage(attackerCard.pokemon, defenderCard.pokemon, skill);
    let damage = result.damage;
    const abilityMessages: string[] = [];
    const effectMessages: string[] = [];
    let healTarget: BattleAnimationState["healTarget"] | undefined;

    if (result.isHit && damage > 0) {
      const attackBoostStack = getAttackBoostStack(nextAttacker);
      if (attackBoostStack > 0) {
        const attackBoostMultiplier = getAttackBoostMultiplier(attackBoostStack);
        damage = Math.round(damage * attackBoostMultiplier);
        nextAttacker.attackBoostTurns = 0;
        effectMessages.push(`攻擊提升效果發動（x${attackBoostMultiplier.toFixed(2)}）。`);
      }

      if ((nextAttacker.attackDownTurns ?? 0) > 0) {
        damage = Math.max(1, Math.round(damage * 0.8));
        nextAttacker.attackDownTurns = 0;
        effectMessages.push("攻擊降低效果發動。");
      }

      if ((nextDefender.defenseDownTurns ?? 0) > 0) {
        damage = Math.round(damage * 1.15);
        nextDefender.defenseDownTurns = 0;
        effectMessages.push("防禦降低效果發動。");
      }

      const defenseBoostStack = getDefenseBoostStack(nextDefender);
      if (defenseBoostStack > 0) {
        const defenseBoostMultiplier = getDefenseBoostMultiplier(defenseBoostStack);
        damage = Math.max(1, Math.round(damage / defenseBoostMultiplier));
        nextDefender.defenseBoostTurns = 0;
        effectMessages.push(`防禦提升效果發動（x${defenseBoostMultiplier.toFixed(2)}）。`);
      }

      if ((nextDefender.shieldTurns ?? 0) > 0) {
        const shieldReduction = nextDefender.shieldDamageReduction ?? SKILL_SHIELD_DAMAGE_REDUCTION;
        damage = Math.max(1, Math.floor(damage * (1 - shieldReduction)));
        nextDefender.shieldTurns = 0;
        nextDefender.shieldDamageReduction = undefined;
        effectMessages.push("護盾吸收了部分傷害。");
      }

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

    const consumePlayerShield = false;

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

    if (result.isHit) {
      if (skill.effect === "heal_self") {
        const healAmount = healBattleCard(nextAllyTarget);
        if (healAmount > 0) {
          const healedIndex = nextParticipants[attackerSide].team.indexOf(nextAllyTarget);
          healTarget = healedIndex >= 0 ? { side: attackerSide, index: healedIndex, amount: healAmount } : undefined;
        }
        effectMessages.push(healAmount > 0 ? `${getPokemonLabel(nextAllyTarget.pokemon)} 回復 ${healAmount} HP。` : `${getPokemonLabel(nextAllyTarget.pokemon)} 的 HP 已經足夠。`);
      }

      if (skill.effect === "shield_self") {
        nextAttacker.shieldTurns = 1;
        nextAttacker.shieldDamageReduction = SKILL_SHIELD_DAMAGE_REDUCTION;
        effectMessages.push(`${getPokemonLabel(nextAttacker.pokemon)} 展開護盾。`);
      }

      if (skill.effect === "raise_attack") {
        const attackBoostStack = Math.min(3, getAttackBoostStack(nextAttacker) + 1);
        const attackBoostMultiplier = getAttackBoostMultiplier(attackBoostStack);
        nextAttacker.attackBoostTurns = attackBoostStack;
        effectMessages.push(`${getPokemonLabel(nextAttacker.pokemon)} 攻擊提升至 ${attackBoostStack} 層（x${attackBoostMultiplier.toFixed(2)}）。`);
      }

      if (skill.effect === "raise_defense") {
        const defenseBoostStack = Math.min(2, getDefenseBoostStack(nextAttacker) + 1);
        const defenseBoostMultiplier = getDefenseBoostMultiplier(defenseBoostStack);
        nextAttacker.defenseBoostTurns = defenseBoostStack;
        effectMessages.push(`${getPokemonLabel(nextAttacker.pokemon)} 防禦提升至 ${defenseBoostStack} 層（x${defenseBoostMultiplier.toFixed(2)}）。`);
      }

      if (skill.effect === "raise_speed") {
        nextAttacker.speedBoostTurns = 1;
        effectMessages.push(`${getPokemonLabel(nextAttacker.pokemon)} 速度提升，下一回合更有餘裕。`);
      }

      if (skill.effect === "lower_attack") {
        nextDefender.attackDownTurns = 1;
        effectMessages.push(`${getPokemonLabel(nextDefender.pokemon)} 下一次攻擊降低。`);
      }

      if (skill.effect === "lower_defense") {
        nextDefender.defenseDownTurns = 1;
        effectMessages.push(`${getPokemonLabel(nextDefender.pokemon)} 下一次受傷增加。`);
      }

      if (skill.effect === "lower_speed") {
        nextDefender.speedDownTurns = 1;
        effectMessages.push(`${getPokemonLabel(nextDefender.pokemon)} 速度降低。`);
      }

      if (skill.effect === "burn" && nextDefender.currentHp > 0) {
        const burnDamage = Math.min(nextDefender.currentHp, getBurnDamage(nextDefender));
        nextDefender.currentHp = Math.max(0, nextDefender.currentHp - burnDamage);
        effectMessages.push(`${getPokemonLabel(nextDefender.pokemon)} 受到灼傷，追加 ${burnDamage} 傷害。`);
      }

      if (skill.effect === "paralyze" && nextDefender.currentHp > 0) {
        nextDefender.paralyzedTurns = 1;
        effectMessages.push(`${getPokemonLabel(nextDefender.pokemon)} 陷入麻痺。`);
      }

      if (skill.effect === "sleep" && nextDefender.currentHp > 0) {
        nextDefender.asleepTurns = 1;
        effectMessages.push(`${getPokemonLabel(nextDefender.pokemon)} 睡著了。`);
      }
    }

    if (result.isHit && damage > 0 && defenderCard.pokemon.ability_id === "synchronize" && damage > defenderCard.pokemon.max_hp * 0.15 && nextAttacker.currentHp > 0) {
      const recoilDamage = Math.max(1, Math.round(damage * 0.08));
      nextAttacker.currentHp = Math.max(0, nextAttacker.currentHp - recoilDamage);
      abilityMessages.push(`特性「${getAbilityLabel(defenderCard.pokemon)}」發動，反彈 ${recoilDamage} 點傷害。`);
    }

    if (result.isHit && attackerCard.pokemon.ability_id === "natural_cure" && nextAttacker.currentHp > 0 && nextAttacker.currentHp <= nextAttacker.pokemon.max_hp / 2) {
      const healAmount = healBattleCard(nextAttacker, 0.06);
      if (healAmount > 0) abilityMessages.push(`特性「${getAbilityLabel(attackerCard.pokemon)}」發動，回復 ${healAmount} HP。`);
    }

    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setTurn((current) => ({ ...current, locked: true }));
    const staminaSuffix = ` 消耗 ${staminaCost} 體力。`;
    const effectSuffix = `${staminaSuffix}${effectMessages.length > 0 ? ` ${effectMessages.join(" ")}` : ""}`;
    const message = result.isHit
      ? skill.category === "attack"
        ? `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，造成 ${damage} 傷害（${getEffectText(result.typeMultiplier, result.isHit)}）。${effectSuffix}`
        : `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，技能成功。${effectSuffix}`
      : `${getPokemonLabel(attackerCard.pokemon)} 使用 ${skill.name_zh || skill.name}，但沒有命中。`;
    const finalMessage = abilityMessages.length > 0 ? `${message} ${abilityMessages.join(" ")}` : message;
    const timelineEffectText = result.isHit
      ? skill.category === "attack"
        ? getEffectText(result.typeMultiplier, result.isHit)
        : effectMessages[0] ?? "技能成功"
      : "沒有命中！";

    startBattleActionTimeline({
      attackerSide,
      defenderSide,
      attackerName: getPokemonLabel(attackerCard.pokemon),
      defenderName: getPokemonLabel(defenderCard.pokemon),
      skill,
      damage,
      typeMultiplier: result.typeMultiplier,
      effectivenessText: timelineEffectText,
      isHit: result.isHit,
      message,
      finalMessage,
      abilityMessages,
      nextParticipants,
      consumePlayerShield,
      healTarget,
    });
  }

  function resolveBasicAttack() {
    if (!participants || turn.attacker !== "player" || turn.locked || winner) return;
    const active = participants.player.team[participants.player.activeIndex];
    resolveSkill(createBasicAttackSkill(active), "manual", undefined, { staminaCostOverride: BASIC_ATTACK_STAMINA_COST });
  }

  function switchComputerPokemon(index: number) {
    if (!participants || turn.attacker !== "computer" || turn.locked || winner) return;
    const active = participants.computer.team[participants.computer.activeIndex];
    if (active.currentStamina < SWITCH_STAMINA_COST) {
      restBattleTurn("computer");
      return;
    }
    const selected = participants.computer.team[index];
    if (!selected || selected.currentHp <= 0 || index === participants.computer.activeIndex) {
      restBattleTurn("computer");
      return;
    }

    const nextParticipants = cloneParticipants(participants);
    const nextComputer = nextParticipants.computer;
    const previousActive = nextComputer.team[participants.computer.activeIndex];
    const selectedNext = nextComputer.team[index];
    const abilityMessages: string[] = [];

    previousActive.currentStamina = Math.max(0, previousActive.currentStamina - SWITCH_STAMINA_COST);
    if (previousActive.currentHp > 0 && previousActive.pokemon.ability_id === "regenerator" && !previousActive.regeneratorUsed) {
      const healAmount = healBattleCard(previousActive, 0.1);
      if (healAmount > 0) abilityMessages.push(`特性「${getAbilityLabel(previousActive.pokemon)}」發動，回復 ${healAmount} HP。`);
      previousActive.regeneratorUsed = true;
    }

    clearPositiveBattleBuffs(previousActive);
    nextParticipants.computer = { ...nextComputer, activeIndex: index };
    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setTurn((current) => ({ ...current, locked: true }));

    startSwitchEntryTimeline({
      nextParticipants,
      side: "computer",
      previousCard: previousActive,
      selectedIndex: index,
      nextTurnSide: "player",
      message: `電腦更換為 ${getPokemonLabel(selectedNext.pokemon)}，消耗 ${SWITCH_STAMINA_COST} 體力。`,
      abilityMessages,
    });
  }

  function buildComputerBattleState(): BattleEnvState | null {
    if (!participants) return null;
    return {
      participants: cloneParticipants(participants),
      turn: "computer",
      turnNumber: currentRound,
    };
  }

  function executeComputerModelAction(action: BattleAction) {
    if (action.type === "switch") {
      switchComputerPokemon(action.targetIndex);
      return;
    }

    if (action.type === "rest") {
      restBattleTurn("computer");
      return;
    }

    if (action.type === "basic_attack") {
      const active = participants?.computer.team[participants.computer.activeIndex];
      if (!active) {
        restBattleTurn("computer");
        return;
      }
      resolveSkill(createBasicAttackSkill(active), "computer", undefined, { staminaCostOverride: BASIC_ATTACK_STAMINA_COST });
      return;
    }

    if (action.type === "shield") {
      activateComputerShield();
      return;
    }

    const skill = getSkillById(action.skillId);
    if (!skill) {
      restBattleTurn("computer");
      return;
    }
    resolveSkill(skill, "computer", action.targetIndex);
  }

  function activateComputerShield() {
    if (!participants || turn.attacker !== "computer" || turn.locked || winner) return;
    const nextParticipants = cloneParticipants(participants);
    const computerActive = nextParticipants.computer.team[nextParticipants.computer.activeIndex];
    if ((computerActive.shieldTurns ?? 0) > 0 || computerActive.currentStamina < SHIELD_STAMINA_COST) {
      restBattleTurn("computer");
      return;
    }
    computerActive.currentStamina = Math.max(0, computerActive.currentStamina - SHIELD_STAMINA_COST);
    computerActive.shieldTurns = 1;
    computerActive.shieldDamageReduction = GENERIC_SHIELD_DAMAGE_REDUCTION;
    const shieldSkill: Skill = {
      id: "computer_shield_action",
      name: "Shield",
      name_zh: battleUiText.shield,
      type: computerActive.pokemon.types[0],
      category: "shield",
      power: 0,
      accuracy: 100,
      effect: "shield_self",
      target: "self",
      description_zh: "下次受傷降低 40%",
    };
    const message = `電腦的 ${getPokemonLabel(computerActive.pokemon)} 啟動護盾，消耗 ${SHIELD_STAMINA_COST} 體力。`;

    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setTurn((current) => ({ ...current, locked: true, message }));
    startBattleActionTimeline({
      actionType: "shield",
      attackerSide: "computer",
      defenderSide: "player",
      attackerName: getPokemonLabel(computerActive.pokemon),
      defenderName: getPokemonLabel(nextParticipants.player.team[nextParticipants.player.activeIndex].pokemon),
      skill: shieldSkill,
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: "下次受傷降低 40%",
      isHit: true,
      message,
      finalMessage: message,
      abilityMessages: [],
      nextParticipants,
      actionTitle: `${getPokemonLabel(computerActive.pokemon)} 啟動護盾！`,
      actionSubtitle: "Defense Ready",
      effectLabel: "下次受傷降低 40%",
    });
  }

  function restBattleTurn(side: BattleSide) {
    if (!participants || turn.locked || winner) return;
    const defenderSide: BattleSide = side === "player" ? "computer" : "player";
    const nextParticipants = cloneParticipants(participants);
    const restingParticipant = nextParticipants[side];
    const restingCard = restingParticipant.team[restingParticipant.activeIndex];
    const actionBlockedMessage = consumeActionBlocker(restingCard);
    if (actionBlockedMessage) {
      setPendingAllySkill(null);
      setPendingSwitchTarget(null);
      setTurn((current) => ({ ...current, locked: true }));
      startBattleActionTimeline({
        actionType: "rest",
        attackerSide: side,
        defenderSide,
        attackerName: getPokemonLabel(restingCard.pokemon),
        defenderName: getPokemonLabel(nextParticipants[defenderSide].team[nextParticipants[defenderSide].activeIndex].pokemon),
        skill: createRestSkill(restingCard),
        damage: 0,
        typeMultiplier: 1,
        effectivenessText: "行動失敗",
        isHit: true,
        message: `${getPokemonLabel(restingCard.pokemon)} ${actionBlockedMessage}`,
        finalMessage: `${getPokemonLabel(restingCard.pokemon)} ${actionBlockedMessage}`,
        abilityMessages: [],
        nextParticipants,
        actionTitle: `${getPokemonLabel(restingCard.pokemon)} 行動失敗`,
        actionSubtitle: "Blocked",
        effectLabel: "行動失敗",
      });
      return;
    }
    if (restingCard.currentStamina >= restingCard.maxStamina) {
      setTurn((current) => ({ ...current, message: `${getPokemonLabel(restingCard.pokemon)} 體力已滿，無法休息。` }));
      return;
    }
    const restRecovered = recoverStamina(restingCard, REST_STAMINA_RECOVERY);
    const message = `${getPokemonLabel(restingCard.pokemon)} 選擇休息，回復 ${restRecovered} 體力。`;

    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setTurn((current) => ({ ...current, locked: true }));

    startBattleActionTimeline({
      actionType: "rest",
      attackerSide: side,
      defenderSide,
      attackerName: getPokemonLabel(restingCard.pokemon),
      defenderName: getPokemonLabel(nextParticipants[defenderSide].team[nextParticipants[defenderSide].activeIndex].pokemon),
      skill: createRestSkill(restingCard),
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: `回復 ${restRecovered} 體力`,
      isHit: true,
      message,
      finalMessage: message,
      abilityMessages: [],
      nextParticipants,
      actionTitle: `${getPokemonLabel(restingCard.pokemon)} 休息！`,
      actionSubtitle: "Rest",
      effectLabel: `回復 ${restRecovered} 體力`,
    });
  }

  function openSwitchTargetOverlay() {
    if (!participants || turn.attacker !== "player" || turn.locked || winner || pendingAllySkill) return;
    const active = participants.player.team[participants.player.activeIndex];
    if (active.currentStamina < SWITCH_STAMINA_COST) {
      setTurn((current) => ({ ...current, message: `${getPokemonLabel(active.pokemon)} 體力不足，無法更換夥伴（需要 ${SWITCH_STAMINA_COST} 體力）。` }));
      return;
    }
    const hasSwitchTarget = participants.player.team.some((card, index) => index !== participants.player.activeIndex && card.currentHp > 0);
    if (!hasSwitchTarget) {
      setTurn((current) => ({ ...current, message: "沒有可更換的備戰夥伴。" }));
      return;
    }
    setPendingSwitchTarget({ side: "player" });
    setTurn((current) => ({ ...current, message: battleUiText.switchPrompt }));
  }

  function switchPlayerPokemon(index: number) {
    const forcedSwitch = pendingSwitchTarget?.forced;
    if (!participants || (!forcedSwitch && (turn.attacker !== "player" || turn.locked))) return;
    if (pendingAllySkill) return;
    const selected = participants.player.team[index];
    if (!selected || selected.currentHp <= 0 || index === participants.player.activeIndex) return;
    const nextParticipants = cloneParticipants(participants);
    const nextPlayer = nextParticipants.player;
    const previousActive = nextPlayer.team[participants.player.activeIndex];
    const selectedNext = nextPlayer.team[index];
    const abilityMessages: string[] = [];

    if (!forcedSwitch && previousActive.currentStamina < SWITCH_STAMINA_COST) {
      setTurn((current) => ({ ...current, message: `${getPokemonLabel(previousActive.pokemon)} 體力不足，無法更換夥伴（需要 ${SWITCH_STAMINA_COST} 體力）。` }));
      return;
    }

    if (!forcedSwitch) previousActive.currentStamina = Math.max(0, previousActive.currentStamina - SWITCH_STAMINA_COST);

    if (!forcedSwitch && previousActive.currentHp > 0 && previousActive.pokemon.ability_id === "regenerator" && !previousActive.regeneratorUsed) {
      const healAmount = healBattleCard(previousActive, 0.1);
      if (healAmount > 0) abilityMessages.push(`特性「${getAbilityLabel(previousActive.pokemon)}」發動，回復 ${healAmount} HP。`);
      previousActive.regeneratorUsed = true;
    }

    clearPositiveBattleBuffs(previousActive);
    nextParticipants.player = { ...nextPlayer, activeIndex: index };
    setPendingAllySkill(null);
    setPendingSwitchTarget(null);
    setPlayerShielded(false);
    setTurn((current) => ({ ...current, locked: true }));

    const selectedName = getPokemonLabel(selectedNext.pokemon);
    const message = forcedSwitch
      ? `${pendingSwitchTarget?.message ?? "你派出下一位夥伴。"} 你選擇 ${selectedName} 出場。`
      : `你更換為 ${selectedName}，消耗 ${SWITCH_STAMINA_COST} 體力。`;
    const nextTurnSide = pendingSwitchTarget?.nextTurnSide ?? "computer";

    startSwitchEntryTimeline({
      nextParticipants,
      side: "player",
      previousCard: previousActive,
      selectedIndex: index,
      nextTurnSide,
      message,
      abilityMessages,
      forced: forcedSwitch,
    });
  }

  function activatePlayerShield() {
    if (!participants || turn.attacker !== "player" || turn.locked) return;
    const currentPlayerActive = participants.player.team[participants.player.activeIndex];
    if ((currentPlayerActive.shieldTurns ?? 0) > 0) return;
    if (pendingSwitchTarget) {
      setPendingSwitchTarget(null);
      setTurn((current) => ({ ...current, message: "已取消更換。" }));
      return;
    }
    if (pendingAllySkill) {
      setPendingAllySkill(null);
      setTurn((current) => ({ ...current, message: "已取消選擇治療目標。" }));
      return;
    }
    const nextParticipants = cloneParticipants(participants);
    const playerActive = nextParticipants.player.team[nextParticipants.player.activeIndex];
    if (playerActive.currentHp <= 0 || playerActive.currentStamina < SHIELD_STAMINA_COST) {
      setTurn((current) => ({
        ...current,
        message: `${getPokemonLabel(playerActive.pokemon)} 體力不足，無法啟動護盾（需要 ${SHIELD_STAMINA_COST} 體力）。`,
      }));
      return;
    }
    playerActive.currentStamina = Math.max(0, playerActive.currentStamina - SHIELD_STAMINA_COST);
    playerActive.shieldTurns = 1;
    playerActive.shieldDamageReduction = GENERIC_SHIELD_DAMAGE_REDUCTION;
    const shieldSkill: Skill = {
      id: "player_shield_action",
      name: "Shield",
      name_zh: battleUiText.shield,
      type: playerActive.pokemon.types[0],
      category: "shield",
      power: 0,
      accuracy: 100,
      effect: "shield_self",
      target: "self",
      description_zh: "下次受傷降低 40%",
    };
    const message = `玩家啟動護盾，消耗 ${SHIELD_STAMINA_COST} 體力，下一次受傷降低 40%。`;

    setPlayerShielded(false);
    setTurn((current) => ({ ...current, locked: true, message }));
    startBattleActionTimeline({
      actionType: "shield",
      attackerSide: "player",
      defenderSide: "computer",
      attackerName: "玩家",
      defenderName: "電腦",
      skill: shieldSkill,
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: "下次受傷降低 40%",
      isHit: true,
      message,
      finalMessage: message,
      abilityMessages: [],
      nextParticipants,
      actionTitle: "玩家啟動護盾！",
      actionSubtitle: "Defense Ready",
      effectLabel: "下次受傷降低 40%",
    });
  }

  if (phase === "battleLoading") {
    return (
      <BattleLoadingPage
        playerTeam={participants?.player.team}
        enemyTeam={participants?.computer.team}
        roundLabel={getRoundLoadingLabel(currentRound)}
        playerWins={roundWins.player}
        computerWins={roundWins.computer}
        onComplete={() => setPhase("leadSelection")}
      />
    );
  }

  if (phase === "leadSelection" && participants) {
    return (
      <LeadSelectionPage
        participants={participants}
        selection={leadSelection}
        secondsLeft={leadSelectionSecondsLeft}
        roundText={roundText}
        scoreText={scoreText}
        onSelect={selectLeadCard}
        onLock={lockPlayerLeadSelection}
        onBack={resetBattle}
      />
    );
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
                  <p className="mb-2 text-sm font-black text-cyan-100">{roundText}　{scoreText}</p>
                  <p className="text-3xl font-black text-white">{draftHeaderText}</p>
                  <p className="mt-2 text-3xl font-black text-white">{draftHeaderSeconds}</p>
                </div>
                <div />
              </div>
              <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[612px] flex-col 2xl:max-w-[672px]">
                <div className="mb-3 flex min-h-10 items-center justify-between gap-3 overflow-hidden">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {pokedexRoleFilterOptions.map((role) => {
                      const isActive = selectedDraftRoleFilter === role;
                      const label = role === "all" ? "全部" : roleDefinitions[role].name;

                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={teamsReady}
                          onClick={() => setSelectedDraftRoleFilter(role)}
                          className={[
                            "min-h-10 rounded-full px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45",
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
                    disabled={teamsReady}
                    onClick={openDraftTypeFilterDialog}
                    className="flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-transparent text-sm font-black text-slate-400 transition hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {selectedDraftTypeFilters.length > 0 ? (
                      selectedDraftTypeFilters.map((type) => (
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
                    <ChevronRight size={15} className={["transition", isDraftTypeFilterOpen ? "rotate-90" : ""].join(" ")} />
                  </button>
                </div>

                <AnimatePresence>
                  {isDraftTypeFilterOpen && (
                    <motion.div
                      role="dialog"
                      aria-label="選擇選角屬性"
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.18 }}
                      className="absolute left-0 right-0 top-12 z-30 h-[260px] overflow-hidden rounded-[24px] border border-cyan-300/30 bg-[#06121f]/95 shadow-[0_18px_60px_rgba(0,0,0,0.48),0_0_30px_rgba(56,189,248,0.14)] backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 px-5 py-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Type Filter</p>
                          <p className="mt-1 text-sm font-bold text-slate-400">最多選擇兩個屬性</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingDraftTypeFilters([])}
                            className="rounded-full px-4 py-2 text-xs font-black text-slate-300 transition hover:text-cyan-100"
                          >
                            全部屬性
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsDraftTypeFilterOpen(false)}
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
                            const isActive = pendingDraftTypeFilters.includes(type);
                            const isDisabled = !isActive && pendingDraftTypeFilters.length >= 2;

                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => togglePendingDraftTypeFilter(type)}
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
                            onClick={() => setIsDraftTypeFilterOpen(false)}
                            className="min-h-10 rounded-2xl px-5 text-sm font-black text-slate-300 transition hover:text-white"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={applyDraftTypeFilter}
                            className="min-h-10 rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.26)] transition hover:bg-cyan-200"
                          >
                            確定
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-slate-500">
                  <span>顯示 {filteredDraftPool.length} / {draftPool.length}</span>
                  <span>{selectedDraftRoleFilter === "all" ? "全部職業" : roleDefinitions[selectedDraftRoleFilter].name}</span>
                </div>

                <div className="no-scrollbar grid h-[430px] max-h-full min-h-0 w-full self-end auto-rows-max grid-cols-[repeat(4,minmax(0,116px))] justify-center justify-items-center gap-x-2 gap-y-2.5 overflow-y-auto overscroll-contain xl:grid-cols-[repeat(5,minmax(0,116px))] 2xl:grid-cols-[repeat(5,minmax(0,128px))]">
                  {filteredDraftPool.length > 0 ? (
                    filteredDraftPool.map((pokemon) => {
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
                    })
                  ) : (
                    <div className="col-span-full grid min-h-[320px] w-full place-items-center text-center">
                      <div>
                        <p className="text-lg font-black text-white">沒有符合條件的角色</p>
                        <p className="mt-2 text-sm font-semibold text-slate-500">調整職業或屬性後再選擇夥伴。</p>
                      </div>
                    </div>
                  )}
                </div>
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
    const playerCanAct = turn.attacker === "player" && !turn.locked && !battleStartIntro && playerActive.currentHp > 0;
    const playerShielded = (playerActive.shieldTurns ?? 0) > 0;
    const timelineActive = Boolean(battleAnimation) || Boolean(battleStartIntro);
    const battleArenaAura =
      turn.attacker === "computer"
        ? "bg-[linear-gradient(90deg,transparent_0%,rgba(206,0,0,0.06)_34%,rgba(206,0,0,0.18)_72%,rgba(206,0,0,0.30)_100%)]"
        : "bg-[linear-gradient(90deg,rgba(0,0,206,0.30)_0%,rgba(0,0,206,0.18)_28%,rgba(0,0,206,0.06)_66%,transparent_100%)]";

    return (
      <div className="relative h-screen overflow-y-auto overflow-x-hidden bg-slate-950 text-white">
        <section className="relative z-10 flex h-screen min-h-[900px] flex-col overflow-hidden p-0">
          <motion.div
            key={turn.attacker}
            className={["pointer-events-none absolute inset-0 z-[1] blur-xl", battleArenaAura].join(" ")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
          <div className="arena-grid pointer-events-none absolute inset-0 opacity-35" />
          <BattleHealthHud label={"\u6211\u65b9 HP"} participant={participants.player} side="player" />
          <BattleHealthHud label={"\u6575\u65b9 HP"} participant={participants.computer} side="computer" />
          <BattleCenterHUD turn={turn} playerShielded={playerShielded} />
          <BattleStandbyBroadcast
            message={pendingAllySkill ? battleUiText.chooseAllyHint : pendingSwitchTarget ? (pendingSwitchTarget.forced ? battleUiText.chooseForcedSwitchTarget : battleUiText.chooseSwitchHint) : turn.message}
            hidden={timelineActive}
          />
          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-slate-800/80 px-6">
              <div>
                <p className="text-xs font-black text-cyan-100">{roundText}　{scoreText}</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{battleUiText.title}</h1>
              </div>
              <button type="button" onClick={resetBattle} className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
                <ArrowLeft size={18} />
                {battleUiText.back}
              </button>
            </header>

            <main className="min-h-0 flex-1 overflow-hidden">
              <section className="relative h-[68%] shrink-0 overflow-hidden pt-[136px]">
                <div className="grid h-full grid-cols-[360px_minmax(0,1fr)_360px] items-start gap-8 overflow-visible px-8 pb-3">
                  <div className="grid h-full min-h-0 place-items-start justify-self-start overflow-visible">
                    <CompactActiveBattleCard
                      card={playerActive}
                      side="player"
                      shielded={playerShielded}
                      isHitTarget={shouldShowAttackImpact(battleAnimation, "player")}
                      isHealTarget={isHealingImpactTarget(battleAnimation, "player", participants.player.activeIndex)}
                      healAmount={battleAnimation?.healTarget?.side === "player" ? battleAnimation.healTarget.amount : 0}
                      battleAnimation={battleAnimation}
                    />
                  </div>
                  <div />
                  <div className="grid h-full min-h-0 place-items-start justify-self-end overflow-visible">
                    <CompactActiveBattleCard
                      card={computerActive}
                      side="computer"
                      isHitTarget={shouldShowAttackImpact(battleAnimation, "computer")}
                      isHealTarget={isHealingImpactTarget(battleAnimation, "computer", participants.computer.activeIndex)}
                      healAmount={battleAnimation?.healTarget?.side === "computer" ? battleAnimation.healTarget.amount : 0}
                      battleAnimation={battleAnimation}
                    />
                  </div>
                </div>
              </section>

              <section className="h-[32%] shrink-0 overflow-visible px-6 pb-5">
                <div className="relative grid h-full min-h-0 w-full grid-cols-[minmax(440px,0.95fr)_minmax(560px,1.2fr)_minmax(440px,0.95fr)] items-end gap-4 overflow-visible">
                  <BattleCardDeck
                    participant={participants.player}
                    activeIndex={participants.player.activeIndex}
                    side="player"
                    battleAnimation={battleAnimation}
                    canSwitch={playerCanAct && playerActive.currentStamina >= SWITCH_STAMINA_COST && !pendingAllySkill && !pendingSwitchTarget}
                    canTargetAlly={false}
                    activeShielded={playerShielded}
                  />
                  <CenterActionPanel
                    activeCard={playerActive}
                    playerSkills={playerSkills}
                    playerCanAct={playerCanAct}
                    playerShielded={playerShielded}
                    pendingAllySkill={pendingAllySkill}
                    pendingSwitchTarget={pendingSwitchTarget}
                    onSkill={(skill) => resolveSkill(skill, "manual")}
                    onBasicAttack={resolveBasicAttack}
                    onShield={activatePlayerShield}
                    onRest={() => restBattleTurn("player")}
                    onSwitchPrompt={openSwitchTargetOverlay}
                    onCancelAllyTarget={() => {
                      setPendingAllySkill(null);
                      setTurn((current) => ({ ...current, message: "已取消選擇治療目標。" }));
                    }}
                  />
                  <BattleCardDeck
                    participant={participants.computer}
                    activeIndex={participants.computer.activeIndex}
                    side="computer"
                    battleAnimation={battleAnimation}
                  />
                </div>
              </section>
            </main>
          </div>
        </section>
        <BattleStartIntroOverlay phase={battleStartIntro} attacker={turn.attacker} />
        <BattleActionTimelineOverlay animation={battleAnimation} />
        {pendingAllySkill && participants && (
          <AllyTargetOverlay
            participant={participants.player}
            activeIndex={participants.player.activeIndex}
            skill={pendingAllySkill.skill}
            onSelect={(index) => resolveSkill(pendingAllySkill.skill, "manual", index)}
            onCancel={() => {
              setPendingAllySkill(null);
              setTurn((current) => ({ ...current, message: "已取消選擇治療目標。" }));
            }}
          />
        )}
        {pendingSwitchTarget && participants && (
          <SwitchTargetOverlay
            participant={participants.player}
            activeIndex={participants.player.activeIndex}
            forced={Boolean(pendingSwitchTarget.forced)}
            onSelect={switchPlayerPokemon}
            onCancel={() => {
              if (pendingSwitchTarget.forced) return;
              setPendingSwitchTarget(null);
              setTurn((current) => ({ ...current, message: "已取消更換。" }));
            }}
          />
        )}
      </div>
    );
  }

  if (phase === "roundResult") {
    const nextRound = Math.min(3, currentRound + 1);
    const playerWonRound = roundWinner === "player";
    const resultTone = playerWonRound
      ? "from-cyan-500/30 via-blue-500/18 to-slate-950"
      : "from-rose-500/32 via-red-500/18 to-slate-950";
    const resultTextClass = playerWonRound
      ? "text-cyan-100 drop-shadow-[0_0_30px_rgba(34,211,238,0.62)]"
      : "text-rose-100 drop-shadow-[0_0_30px_rgba(244,63,94,0.62)]";

    return (
      <div className="relative h-screen overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 scale-110 bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.9),rgba(2,6,23,1)_70%)] blur-2xl" />
        <motion.div
          className={["absolute inset-0 bg-gradient-to-br", resultTone].join(" ")}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: INTER_ROUND_SECONDS, times: [0, 0.16, 0.78, 1], ease: "easeInOut" }}
        />
        <div className="arena-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative z-10 grid h-full place-items-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -12], scale: [0.96, 1, 1, 1.03] }}
            transition={{ duration: INTER_ROUND_SECONDS, times: [0, 0.16, 0.78, 1], ease: "easeInOut" }}
          >
            <p className="text-sm font-black uppercase tracking-[0.34em] text-slate-300">第 {currentRound} 局結果</p>
            <h1 className={["mt-5 text-[clamp(3rem,8vw,8rem)] font-black leading-none", resultTextClass].join(" ")}>
              {playerWonRound ? "回合勝利" : "回合失敗"}
            </h1>
            <p className="mt-7 text-3xl font-black text-white">準備進入下一回合</p>
            <p className="mt-5 text-xl font-black text-slate-300">{scoreText}</p>
            <p className="mt-3 text-base font-bold text-slate-400">即將進入第 {nextRound} 局</p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (phase === "battleResult") {
    const resolvedMatchWinner = matchWinner ?? winner;

    return (
      <BattlePageShell eyebrow="最終結果" title={resolvedMatchWinner === "player" ? "玩家勝利" : "電腦勝利"} onBack={resetBattle}>
        <div className="grid flex-1 place-items-center py-16">
          <div className="w-full max-w-xl rounded-[28px] border border-cyan-300/25 bg-slate-950/65 p-8 text-center shadow-glow">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-100">Match Result</p>
            <p className="mt-4 text-5xl font-black text-white">{resolvedMatchWinner === "player" ? "你贏了" : "電腦勝利"}</p>
            <p className="mt-4 text-2xl font-black text-white">{scoreText}</p>
            <p className="mt-4 text-base font-semibold leading-7 text-slate-400">{turn.message}</p>
            <div className="mt-8 flex justify-center gap-3">
              <button type="button" onClick={resetBattle} className="min-h-12 rounded-2xl border border-cyan-300/40 bg-cyan-300 px-5 text-sm font-black text-slate-950">重新匹配</button>
              <button type="button" onClick={resetBattle} className="min-h-12 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-5 text-sm font-black text-slate-200">返回一般模式</button>
            </div>
          </div>
        </div>
      </BattlePageShell>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-35" />
      <main className="relative z-10 flex h-full min-h-0 flex-col px-6 py-5">
        <header className="grid h-[96px] shrink-0 grid-cols-[180px_minmax(0,1fr)_180px] items-center border-b border-slate-800/80">
          <button type="button" onClick={onBack} className="flex min-h-12 w-fit items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/50 px-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/45">
            <ArrowLeft size={18} />
            返回
          </button>
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-200">Normal Battle</p>
            <h1 className="mt-1 text-3xl font-black text-white">一般模式</h1>
          </div>
          <div className="text-right text-xs font-black text-slate-500">三局兩勝</div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] gap-6 pt-6">
          <section className="flex min-h-0 flex-col border-r border-slate-800/80 pr-6">
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-center gap-5">
              <div className="min-w-0 justify-self-center text-center">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Player 1</p>
                <div className="mt-6 grid justify-items-center gap-4">
                  <div className="grid size-24 place-items-center rounded-full border border-cyan-300/50 bg-cyan-300/15 text-4xl font-black text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
                    {player.avatarInitial}
                  </div>
                  <h2 className="max-w-48 truncate text-3xl font-black text-white">{player.name}</h2>
                </div>
              </div>

              <div className="grid place-items-center">
                <div className="grid size-16 place-items-center rounded-full border border-slate-700/80 bg-slate-950/55 text-xl font-black text-white shadow-[0_0_24px_rgba(255,255,255,0.06)]">
                  VS
                </div>
              </div>

              <div className="min-w-0 justify-self-center text-center">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Player 2</p>
                <div className="mt-6 grid justify-items-center gap-4">
                  <div className={["grid size-24 place-items-center rounded-full border text-3xl font-black", hasComputerOpponent ? "border-rose-400/50 bg-rose-400/15 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.18)]" : "border-slate-700 bg-slate-900/70 text-slate-500"].join(" ")}>
                    {hasComputerOpponent ? <Cpu size={34} /> : "?"}
                  </div>
                  <h2 className="max-w-56 truncate text-3xl font-black text-white">{hasComputerOpponent ? "電腦訓練員" : "等待對手"}</h2>
                </div>
              </div>
            </div>

            <div className="flex min-h-[148px] shrink-0 items-end justify-between gap-5 border-t border-slate-800/80 pb-2 pt-5">
              <AnimatePresence initial={false}>
                {hasComputerOpponent && (
                  <motion.div
                    key="computer-difficulty"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="min-w-0 flex-1"
                  >
                    <div className="mb-3 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-200">CPU Model</p>
                        <h3 className="mt-1 text-lg font-black text-white">{appliedTrainingModel ? "已套用訓練模型" : "未套用模型"}</h3>
                        <p className="mt-1 truncate text-xs font-black text-cyan-200">{appliedTrainingModel ? appliedTrainingModel.name : "電腦將維持隨機打法"}</p>
                        {appliedTrainingModel && (
                          <p className={["mt-1 text-xs font-black", appliedModelLoadStatus === "ready" ? "text-emerald-200" : appliedModelLoadStatus === "error" ? "text-amber-200" : "text-slate-400"].join(" ")}>
                            {appliedModelLoadStatus === "ready" ? "模型權重已載入" : appliedModelLoadStatus === "error" ? "權重載入失敗，暫用難度規則" : "正在載入模型權重"}
                          </p>
                        )}
                      </div>
                      <p className="hidden max-w-md text-right text-xs font-bold leading-5 text-slate-500 lg:block">
                        {appliedTrainingModel ? computerDifficultyOptions[appliedTrainingModel.computerDifficulty].description : "未套用訓練模型時，電腦會維持隨機選角與隨機出招。"}
                      </p>
                    </div>
                    <div className="grid max-w-3xl grid-cols-5 gap-2">
                      {(Object.keys(computerDifficultyOptions) as ComputerDifficulty[]).map((difficulty) => {
                        const option = computerDifficultyOptions[difficulty];
                        const selected = computerBattleMode === difficulty;

                        return (
                          <button
                            key={difficulty}
                            type="button"
                            disabled
                            className={[
                              "min-h-11 rounded-2xl border px-4 text-sm font-black transition",
                              selected ? option.selectedClassName : option.className,
                            ].join(" ")}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="button"
                disabled={hasComputerOpponent}
                onClick={() => setHasComputerOpponent(true)}
                className="flex min-h-14 w-[220px] items-center justify-center gap-2 rounded-2xl border border-cyan-300/45 bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-default disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
              >
                <Cpu size={18} />
                {hasComputerOpponent ? "電腦已加入" : "加入電腦"}
              </button>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 border-b border-slate-800/80 pb-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Friends</p>
                  <h2 className="mt-1 text-2xl font-black text-white">好友列表</h2>
                </div>
                <span className="rounded-full border border-slate-700/80 px-3 py-1 text-[11px] font-black text-slate-400">0 online</span>
              </div>
              <div className="grid h-full min-h-[280px] place-items-center text-center">
                <div>
                  <div className="mx-auto grid size-14 place-items-center rounded-full bg-slate-900 text-slate-500">
                    <UserPlus size={24} />
                  </div>
                  <p className="mt-5 text-xl font-black text-white">目前沒有可邀請好友</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">多人功能尚未開放，先加入電腦開始一般模式。</p>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                disabled={!hasComputerOpponent}
                onClick={enterDraftRoom}
                className="min-h-14 w-full rounded-2xl border border-cyan-300/45 bg-cyan-300 px-6 text-base font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
              >
                準備
              </button>
              <p className="mt-3 text-center text-xs font-bold text-slate-500">{hasComputerOpponent ? "準備後進入第一局選角。" : "請先加入電腦。"}</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
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
      const matchesRole = selectedRoleFilter === "all" || battlePokemon.role === selectedRoleFilter;

      return matchesType && matchesRole;
    });
  }, [selectedRoleFilter, selectedTypeFilters]);
  const selectedBattlePokemon = selectedPokemon ? getPokemonById(selectedPokemon.id) : undefined;
  const selectedSkills = selectedBattlePokemon ? getPokemonSkills(selectedBattlePokemon) : [];
  const selectedProfile = getPokedexProfile(selectedBattlePokemon);
  const selectedAdvantages = selectedBattlePokemon ? getAdvantageTypes(selectedBattlePokemon.types) : [];
  const selectedSuperEffectiveCombos = selectedBattlePokemon ? getSuperEffectiveCombos(selectedBattlePokemon.types) : [];
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
                      <div className="grid h-full content-start gap-5 overflow-y-auto pr-1">
                        <div>
                          <p className="text-xs font-black tracking-[0.2em] text-slate-500">屬性</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedBattlePokemon.types.map((type) => (
                              <span key={type} className={["w-20 rounded-full border px-0 py-2 text-center text-sm font-black", getTypeChipClass(type)].join(" ")}>{getTypeLabel(type)}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.2em] text-slate-500">剋制</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedAdvantages.length > 0 ? selectedAdvantages.map((type) => (
                              <span key={type} className={["w-20 rounded-full border px-0 py-2 text-center text-sm font-black", getTypeChipClass(type)].join(" ")}>{getTypeLabel(type)}</span>
                            )) : <span className="text-sm font-bold text-slate-400">無明顯剋制</span>}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.2em] text-slate-500">超級克制</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedSuperEffectiveCombos.length > 0 ? selectedSuperEffectiveCombos.map((combo) => (
                              <span key={`${combo.attackType}-${combo.defenderTypes.join("-")}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-orange-200/55 bg-orange-300/12 px-2.5 py-1 text-xs font-black text-orange-100">
                                <span className={["rounded-full border px-2 py-0.5", getTypeChipClass(combo.attackType)].join(" ")}>{getTypeLabel(combo.attackType)}</span>
                                <span>x4</span>
                                <span>{combo.defenderTypes.map(getTypeLabel).join("／")}</span>
                              </span>
                            )) : <span className="text-sm font-bold text-slate-400">無超級克制組合</span>}
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
