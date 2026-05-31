import * as tf from "@tensorflow/tfjs";
import { getPokemonSkills, getSkillStaminaCost, getTypeMultiplier } from "../utils/battleCalculator";
import type { BattleAction, BattleEnvState, PokemonRole, PokemonStats, PokemonType } from "../types/battle";
import type { MatchStrategyDecision, MatchStrategyMode } from "./matchStrategyPolicy";

export const MATCH_STRATEGY_MODEL_VERSION = "match-strategy-v1";
export const MATCH_STRATEGY_CANDIDATE_SIZE = 24;
export const MATCH_STRATEGY_TEAM_SIZE = 3;
export const MATCH_STRATEGY_INPUT_SIZE = 128;
export const MATCH_STRATEGY_OUTPUT_SIZE = MATCH_STRATEGY_CANDIDATE_SIZE + MATCH_STRATEGY_TEAM_SIZE + 3 + 5;

const LEARNING_RATE = 0.00025;
const REWARD_SCALE = 120;
const ACTION_BIAS_SCALE = 0.12;

const modeOrder: MatchStrategyMode[] = ["aggressive", "balanced", "defensive"];
const actionBiasOrder: Array<BattleAction["type"]> = ["skill", "basic_attack", "switch", "shield", "rest"];
const roleOrder: PokemonRole[] = ["vanguard", "fighter", "mage", "support", "tank"];
const typeOrder: PokemonType[] = [
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

export interface MatchStrategyDraftPick {
  side: "player" | "computer";
  pokemonId: number;
  pokemonName: string;
  turn: number;
}

export interface MatchStrategyDraftContext {
  candidateIds: number[];
  candidateNames: string[];
  picks: MatchStrategyDraftPick[];
  playerDraftIds: number[];
  computerDraftIds: number[];
  playerLeadId?: number;
  computerLeadId?: number;
}

export interface MatchStrategyEpisodeMemory {
  vector: number[];
  outputIndexes: number[];
}

function normalize(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function softmax(values: number[]) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return sum > 0 ? exps.map((value) => value / sum) : values.map(() => 1 / Math.max(1, values.length));
}

function pokemonCompactFeatures(pokemon?: PokemonStats) {
  if (!pokemon) return [0, 0, 0, 0, 0, 0, 0, 0];
  const attackSkills = getPokemonSkills(pokemon).filter((skill) => skill.category === "attack");
  const bestPower = attackSkills.reduce((best, skill) => Math.max(best, skill.power), 0);
  const cheapestSkill = getPokemonSkills(pokemon).reduce((best, skill) => Math.min(best, getSkillStaminaCost(skill)), 99);
  return [
    normalize(pokemon.max_hp, 260),
    normalize(pokemon.attack, 180),
    normalize(pokemon.defense, 180),
    normalize(pokemon.speed, 180),
    normalize(pokemon.power, 680),
    normalize(pokemon.rarity, 5),
    normalize(bestPower, 140),
    normalize(cheapestSkill === 99 ? 0 : cheapestSkill, 60),
  ];
}

function teamSummaryFeatures(team: PokemonStats[]) {
  if (team.length === 0) return new Array(16).fill(0);
  const avg = (selector: (pokemon: PokemonStats) => number, max: number) => normalize(team.reduce((sum, pokemon) => sum + selector(pokemon), 0) / team.length, max);
  const roleCoverage = roleOrder.map((role) => (team.some((pokemon) => pokemon.role === role) ? 1 : 0));
  const typeCoverage = typeOrder.slice(0, 6).map((type) => (team.some((pokemon) => pokemon.types.includes(type)) ? 1 : 0));
  return [
    normalize(team.length, MATCH_STRATEGY_TEAM_SIZE),
    avg((pokemon) => pokemon.max_hp, 260),
    avg((pokemon) => pokemon.attack, 180),
    avg((pokemon) => pokemon.defense, 180),
    avg((pokemon) => pokemon.speed, 180),
    ...roleCoverage,
    ...typeCoverage,
  ].slice(0, 16);
}

function matchupFeature(ownTeam: PokemonStats[], opponentTeam: PokemonStats[]) {
  if (ownTeam.length === 0 || opponentTeam.length === 0) return 0.5;
  let total = 0;
  let count = 0;
  for (const own of ownTeam) {
    for (const opponent of opponentTeam) {
      const bestOwn = getPokemonSkills(own)
        .filter((skill) => skill.category === "attack")
        .reduce((best, skill) => Math.max(best, skill.power * getTypeMultiplier(skill.type, opponent.types)), 0);
      const bestOpponent = getPokemonSkills(opponent)
        .filter((skill) => skill.category === "attack")
        .reduce((best, skill) => Math.max(best, skill.power * getTypeMultiplier(skill.type, own.types)), 0);
      total += normalize(bestOwn - bestOpponent + 140, 280);
      count += 1;
    }
  }
  return count > 0 ? total / count : 0.5;
}

export function createMatchStrategyVector(params: {
  candidates: PokemonStats[];
  playerTeam: PokemonStats[];
  computerTeam: PokemonStats[];
  currentPickSide: "player" | "computer";
  pickTurn: number;
  state?: BattleEnvState;
}) {
  const vector: number[] = [];
  vector.push(normalize(params.pickTurn, MATCH_STRATEGY_TEAM_SIZE * 2));
  vector.push(params.currentPickSide === "player" ? 1 : 0);
  vector.push(normalize(params.candidates.length, MATCH_STRATEGY_CANDIDATE_SIZE));
  vector.push(matchupFeature(params.playerTeam, params.computerTeam));
  vector.push(...teamSummaryFeatures(params.playerTeam));
  vector.push(...teamSummaryFeatures(params.computerTeam));

  for (let index = 0; index < 5; index += 1) vector.push(...pokemonCompactFeatures(params.playerTeam[index]));
  for (let index = 0; index < 5; index += 1) vector.push(...pokemonCompactFeatures(params.computerTeam[index]));

  if (params.state) {
    const playerHp = params.state.participants.player.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
    const playerMaxHp = params.state.participants.player.team.reduce((sum, card) => sum + card.pokemon.max_hp, 0);
    const computerHp = params.state.participants.computer.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
    const computerMaxHp = params.state.participants.computer.team.reduce((sum, card) => sum + card.pokemon.max_hp, 0);
    vector.push(normalize(playerHp, playerMaxHp));
    vector.push(normalize(computerHp, computerMaxHp));
    vector.push(normalize(params.state.turnNumber, 80));
    vector.push(playerHp > computerHp ? 1 : 0);
    vector.push(playerHp < computerHp ? 1 : 0);
  }

  while (vector.length < MATCH_STRATEGY_INPUT_SIZE) vector.push(0);
  return vector.slice(0, MATCH_STRATEGY_INPUT_SIZE);
}

function createModel() {
  const input = tf.input({ shape: [MATCH_STRATEGY_INPUT_SIZE] });
  const hiddenA = tf.layers.dense({ units: 96, activation: "relu" }).apply(input) as tf.SymbolicTensor;
  const hiddenB = tf.layers.dense({ units: 64, activation: "relu" }).apply(hiddenA) as tf.SymbolicTensor;
  const output = tf.layers.dense({ units: MATCH_STRATEGY_OUTPUT_SIZE, activation: "linear" }).apply(hiddenB) as tf.SymbolicTensor;
  const model = tf.model({ inputs: input, outputs: output, name: MATCH_STRATEGY_MODEL_VERSION });
  model.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: "meanSquaredError" });
  return model;
}

export class MatchStrategyNetwork {
  epsilon = 0.18;
  minEpsilon = 0.03;
  epsilonDecay = 0.996;
  private model = createModel();

  reset() {
    this.model.dispose();
    this.model = createModel();
    this.epsilon = 0.18;
  }

  decayExploration() {
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
  }

  predict(vector: number[]) {
    const input = tf.tensor2d([vector]);
    const prediction = this.model.predict(input) as tf.Tensor;
    const values = Array.from(prediction.dataSync());
    input.dispose();
    prediction.dispose();
    return values;
  }

  selectDraftPick(vector: number[], candidates: PokemonStats[], unavailableIds: Set<number>) {
    const legalIndexes = candidates.flatMap((pokemon, index) => (!unavailableIds.has(pokemon.id) ? [index] : []));
    if (legalIndexes.length === 0) return 0;
    if (Math.random() < this.epsilon) return legalIndexes[Math.floor(Math.random() * legalIndexes.length)];
    const logits = this.predict(vector).slice(0, MATCH_STRATEGY_CANDIDATE_SIZE);
    return legalIndexes.reduce((best, index) => (logits[index] > logits[best] ? index : best), legalIndexes[0]);
  }

  selectLead(vector: number[], team: PokemonStats[]) {
    const legalIndexes = team.map((_, index) => index);
    if (legalIndexes.length === 0) return 0;
    if (Math.random() < this.epsilon) return legalIndexes[Math.floor(Math.random() * legalIndexes.length)];
    const logits = this.predict(vector).slice(MATCH_STRATEGY_CANDIDATE_SIZE, MATCH_STRATEGY_CANDIDATE_SIZE + MATCH_STRATEGY_TEAM_SIZE);
    return legalIndexes.reduce((best, index) => (logits[index] > logits[best] ? index : best), legalIndexes[0]);
  }

  decideBattleStrategy(vector: number[]): MatchStrategyDecision & { modeIndex: number; actionBiasIndexes: number[] } {
    const output = this.predict(vector);
    const modeOffset = MATCH_STRATEGY_CANDIDATE_SIZE + MATCH_STRATEGY_TEAM_SIZE;
    const biasOffset = modeOffset + modeOrder.length;
    const modeLogits = output.slice(modeOffset, biasOffset);
    const modeIndex = Math.random() < this.epsilon
      ? Math.floor(Math.random() * modeOrder.length)
      : modeLogits.reduce((best, value, index) => (value > modeLogits[best] ? index : best), 0);
    const biasValues = softmax(output.slice(biasOffset, biasOffset + actionBiasOrder.length));
    const actionBias: MatchStrategyDecision["actionBias"] = {};
    actionBiasOrder.forEach((action, index) => {
      actionBias[action] = clamp((biasValues[index] - 0.2) * ACTION_BIAS_SCALE * 5, -ACTION_BIAS_SCALE, ACTION_BIAS_SCALE);
    });
    return {
      mode: modeOrder[modeIndex],
      modeIndex,
      actionBias,
      actionBiasIndexes: actionBiasOrder.map((_, index) => biasOffset + index),
    };
  }

  async trainEpisode(memory: MatchStrategyEpisodeMemory[], reward: number) {
    if (memory.length === 0) return 0;
    const scaledReward = clamp(reward / REWARD_SCALE, -1, 1);
    let totalLoss = 0;
    for (const sample of memory) {
      const current = this.predict(sample.vector);
      for (const outputIndex of sample.outputIndexes) {
        current[outputIndex] = clamp((current[outputIndex] ?? 0) + scaledReward, -2, 2);
      }
      const input = tf.tensor2d([sample.vector]);
      const target = tf.tensor2d([current]);
      const result = await this.model.fit(input, target, { epochs: 1, verbose: 0 });
      const loss = Array.isArray(result.history.loss) ? Number(result.history.loss[0] ?? 0) : Number(result.history.loss ?? 0);
      totalLoss += Number.isFinite(loss) ? loss : 0;
      input.dispose();
      target.dispose();
    }
    this.decayExploration();
    return totalLoss / memory.length;
  }

  async exportArtifacts() {
    let artifacts: tf.io.ModelArtifacts | undefined;
    await this.model.save(
      tf.io.withSaveHandler(async (modelArtifacts) => {
        artifacts = modelArtifacts;
        return {
          modelArtifactsInfo: {
            dateSaved: new Date(),
            modelTopologyType: "JSON",
            weightDataBytes: Array.isArray(modelArtifacts.weightData) ? modelArtifacts.weightData.reduce((total, buffer) => total + buffer.byteLength, 0) : (modelArtifacts.weightData?.byteLength ?? 0),
          },
        };
      }),
    );
    if (!artifacts) throw new Error("賽局策略模型匯出失敗");
    return artifacts;
  }

  async importArtifacts(artifacts: tf.io.ModelArtifacts) {
    const loaded = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
    if (loaded.outputs[0]?.shape?.[1] !== MATCH_STRATEGY_OUTPUT_SIZE) {
      loaded.dispose();
      throw new Error("match-strategy-v1 輸出維度不相容");
    }
    this.model.dispose();
    this.model = loaded;
    this.model.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: "meanSquaredError" });
  }
}
