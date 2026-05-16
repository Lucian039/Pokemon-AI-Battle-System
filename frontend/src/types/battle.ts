export type PokemonType =
  | "Normal"
  | "Electric"
  | "Fire"
  | "Water"
  | "Grass"
  | "Poison"
  | "Ghost"
  | "Fighting"
  | "Steel"
  | "Dragon"
  | "Flying"
  | "Psychic"
  | "Fairy"
  | "Rock"
  | "Ground"
  | "Ice";

export type SkillCategory =
  | "attack"
  | "buff"
  | "debuff"
  | "heal"
  | "shield";

export type SkillEffect =
  | "none"
  | "lower_attack"
  | "lower_defense"
  | "lower_speed"
  | "raise_attack"
  | "raise_defense"
  | "raise_speed"
  | "heal_self"
  | "shield_self"
  | "burn"
  | "paralyze"
  | "sleep";

export interface Skill {
  id: string;
  name: string;
  name_zh: string;
  type: PokemonType;
  category: SkillCategory;
  power: number;
  accuracy: number;
  effect: SkillEffect;
  target: "enemy" | "self";
  description_zh: string;
}

export interface PokemonStats {
  id: number;
  name: string;
  name_zh: string;
  types: PokemonType[];
  role: string;
  level: number;
  rarity: number;
  hp: number;
  max_hp: number;
  attack: number;
  defense: number;
  speed: number;
  power: number;
  enabled_battle: boolean;
  card_image: string;
  battle_image: string;
  reference_image: string;
  skill_ids: string[];
}

export interface DamageResult {
  damage: number;
  typeMultiplier: number;
  effectivenessText: string;
  isHit: boolean;
}

export type BattleSide = "player" | "computer";

export type DraftPickSide = BattleSide;

export type DraftPhase =
  | "matching"
  | "playerPick"
  | "computerPick"
  | "preBattle"
  | "completed";

export type DraftLockSource =
  | "manual"
  | "timeout"
  | "computer";

export interface DraftState {
  phase: DraftPhase;
  firstPicker: DraftPickSide;
  currentPicker: DraftPickSide;
  round: number;
  playerDraftIds: number[];
  computerDraftIds: number[];
  globalPickedIds: number[];
  secondsLeft: number;
  message: string;
}

export interface BattleCardState {
  pokemon: PokemonStats;
  currentHp: number;
}

export interface BattleParticipant {
  team: BattleCardState[];
  activeIndex: number;
}

export interface BattleTurnState {
  attacker: BattleSide;
  secondsLeft: number;
  locked: boolean;
  message: string;
}
