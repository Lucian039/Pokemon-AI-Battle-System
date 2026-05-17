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
  | "Ice"
  | "Bug"
  | "Dark";

export type PokemonRole =
  | "vanguard"
  | "fighter"
  | "mage"
  | "support"
  | "tank";

export type PokemonAbilityId =
  | "overgrow"
  | "blaze"
  | "torrent"
  | "static"
  | "cute_charm"
  | "intimidate"
  | "synchronize"
  | "guts"
  | "sturdy"
  | "regenerator"
  | "cursed_body"
  | "natural_cure"
  | "thick_fat"
  | "adaptability"
  | "inner_focus"
  | "pressure"
  | "sand_stream"
  | "technician"
  | "sand_veil";

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
  role: PokemonRole;
  role_zh: string;
  role_description_zh: string;
  secondary_roles?: PokemonRole[];
  ability_id: PokemonAbilityId;
  ability_zh: string;
  ability_description_zh: string;
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
  abilityUsed?: boolean;
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
