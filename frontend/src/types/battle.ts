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
  target: "enemy" | "self" | "ally";
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
  currentStamina: number;
  maxStamina: number;
  abilityUsed?: boolean;
  attackBoostTurns?: number;
  defenseBoostTurns?: number;
  speedBoostTurns?: number;
  attackDownTurns?: number;
  defenseDownTurns?: number;
  speedDownTurns?: number;
  shieldTurns?: number;
  shieldDamageReduction?: number;
  asleepTurns?: number;
  paralyzedTurns?: number;
  regeneratorUsed?: boolean;
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

export type BattleAction =
  | {
      type: "skill";
      skillId: string;
      targetSide?: BattleSide;
      targetIndex?: number;
    }
  | {
      type: "basic_attack";
    }
  | {
      type: "shield";
    }
  | {
      type: "rest";
    }
  | {
      type: "switch";
      targetIndex: number;
    };

export interface BattleEnvState {
  participants: Record<BattleSide, BattleParticipant>;
  turn: BattleSide;
  turnNumber: number;
  winner?: BattleSide;
  isDraw?: boolean;
}

export interface BattleReplaySnapshot {
  participants: Record<BattleSide, BattleParticipant>;
  turn: BattleSide;
  turnNumber: number;
}

export interface BattleReplayEvent {
  id: string;
  turnNumber: number;
  actor: BattleSide;
  action: BattleAction;
  actionLabel: string;
  message: string;
  damage: number;
  healing: number;
  skillName?: string;
  winner?: BattleSide;
  isDraw?: boolean;
  snapshot: BattleReplaySnapshot;
}

export interface BattleAgent {
  name: string;
  selectAction: (state: BattleEnvState, legalActions: BattleAction[]) => BattleAction;
}

export interface TrainingMockStats {
  episodes: number;
  winRate: number;
  averageTurns: number;
  loss: number;
  epsilon: number;
  status: "idle" | "watching" | "mock-training";
}

export interface TrainingEpisodeResult {
  winner?: BattleSide;
  isDraw?: boolean;
  aborted?: boolean;
  turns: number;
  totalReward: number;
  loss: number;
  events: BattleReplayEvent[];
  switchCount?: number;
  shieldCount?: number;
  basicAttackCount?: number;
  restCount?: number;
  matchWinCount?: number;
  matchLossCount?: number;
  matchDrawCount?: number;
  comebackWinCount?: number;
  leadPickWinCount?: number;
  beneficialSwitchCount?: number;
  effectiveShieldCount?: number;
}

export interface TrainingMetricPoint {
  episode: number;
  loss: number;
  epsilon: number;
  recentWinRate100?: number;
  recentWinRate500?: number;
}

export interface TrainingState {
  episodes: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageTurns: number;
  averageReward: number;
  loss: number;
  epsilon: number;
  switchCount: number;
  shieldCount: number;
  basicAttackCount: number;
  restCount: number;
  matchWinCount: number;
  matchLossCount: number;
  matchDrawCount: number;
  comebackWinCount: number;
  leadPickWinCount: number;
  beneficialSwitchCount: number;
  effectiveShieldCount: number;
  recentResults: Array<"win" | "loss" | "draw">;
  metricHistory: TrainingMetricPoint[];
  status: "idle" | "training" | "paused";
  currentReplay: BattleReplayEvent[];
}

export interface TrainingModelMetadata {
  version: "battle-tactics-v1" | "battle-tactics-v2" | "battle-tactics-v3-rules";
  savedAt: string;
  trainingState: TrainingState;
  epsilon: number;
  replayBuffer?: TrainingReplaySample[];
}

export interface TrainingReplaySample {
  stateVector: number[];
  actionIndex: number;
  reward: number;
  nextStateVector: number[];
  done: boolean;
  priority?: number;
}

export interface TrainingWorkerState {
  training: boolean;
  saving: boolean;
  loading: boolean;
  hasSavedModel: boolean;
  saveStatus: "unsaved" | "saved" | "loaded" | "failed";
}

export type TrainingWorkerRequest =
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "save" }
  | { type: "load" }
  | { type: "status" };

export type TrainingWorkerResponse =
  | { type: "ready"; state: TrainingState; workerState: TrainingWorkerState }
  | { type: "progress"; state: TrainingState; workerState: TrainingWorkerState }
  | { type: "paused"; state: TrainingState; workerState: TrainingWorkerState }
  | { type: "saved"; state: TrainingState; workerState: TrainingWorkerState }
  | { type: "loaded"; state: TrainingState; workerState: TrainingWorkerState }
  | { type: "reset"; state: TrainingState; workerState: TrainingWorkerState }
  | { type: "error"; message: string; state?: TrainingState; workerState?: TrainingWorkerState };
