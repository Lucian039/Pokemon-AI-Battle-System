import * as tf from "@tensorflow/tfjs";
import { canUseSkill, getPokemonSkills, getSkillById, getSkillStaminaCost, getTypeMultiplier, REST_STAMINA_RECOVERY } from "../utils/battleCalculator";
import { BASIC_ATTACK_STAMINA_COST, createBasicAttackSkill } from "../utils/battleEngine";
import type { BattleAction, BattleAgent, BattleCardState, BattleEnvState, BattleSide, Skill, TrainingModelMetadata, TrainingReplaySample } from "../types/battle";

export const STATE_VECTOR_SIZE = 96;
export const ACTION_VECTOR_SIZE = 10;
const LEARNING_RATE = 0.0003;
const REWARD_CLIP = 140;
const Q_VALUE_CLIP = 180;
const REPORTED_LOSS_CLIP = 250;
const REPLAY_BUFFER_LIMIT = 5000;
const REPLAY_BATCH_SIZE = 12;
const REPLAY_TRAINING_WEIGHT = 0.45;
const TARGET_SYNC_INTERVAL = 200;
const PRIORITY_ALPHA = 0.6;
const PRIORITY_EPSILON = 0.01;
const TACTICAL_POLICY_WEIGHT = 0.72;

function getOpponentSide(side: BattleSide): BattleSide {
  return side === "player" ? "computer" : "player";
}

function normalize(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

class DuelingQMergeLayer extends tf.layers.Layer {
  static className = "DuelingQMergeLayer";

  computeOutputShape(inputShape: tf.Shape | tf.Shape[]) {
    const shapes = inputShape as tf.Shape[];
    return shapes[1];
  }

  call(inputs: tf.Tensor | tf.Tensor[], kwargs: unknown) {
    void kwargs;
    const [value, advantage] = inputs as tf.Tensor[];
    return tf.tidy(() => {
      const centeredAdvantage = advantage.sub(advantage.mean(1, true));
      return value.add(centeredAdvantage);
    });
  }

  getConfig() {
    return {};
  }
}

tf.serialization.registerClass(DuelingQMergeLayer);

function cardFeatures(card: BattleCardState, activeIndex: number, index: number) {
  return [
    normalize(card.currentHp, card.pokemon.max_hp),
    normalize(card.currentStamina, card.maxStamina),
    normalize(card.pokemon.attack, 180),
    normalize(card.pokemon.defense, 180),
    normalize(card.pokemon.speed, 180),
    activeIndex === index ? 1 : 0,
    card.currentHp > 0 ? 1 : 0,
    normalize(card.attackBoostTurns ?? 0, 3),
    normalize(card.defenseBoostTurns ?? 0, 2),
    normalize(card.speedBoostTurns ?? 0, 1),
    normalize(card.attackDownTurns ?? 0, 1),
    normalize(card.defenseDownTurns ?? 0, 1),
    normalize(card.speedDownTurns ?? 0, 1),
    normalize(card.shieldTurns ?? 0, 1),
    normalize((card.asleepTurns ?? 0) + (card.paralyzedTurns ?? 0), 2),
  ];
}

function skillCategoryValue(skill: Skill) {
  if (skill.category === "attack") return 1;
  if (skill.category === "heal") return 0.75;
  if (skill.category === "shield") return 0.55;
  if (skill.category === "buff") return 0.35;
  if (skill.category === "debuff") return 0.2;
  return 0;
}

function expectedDamageRatio(attacker: BattleCardState, defender: BattleCardState, skill: Skill) {
  if (skill.category !== "attack") return 0;
  const multiplier = getTypeMultiplier(skill.type, defender.pokemon.types);
  const expected = skill.power * (attacker.pokemon.attack / defender.pokemon.defense) * multiplier * (skill.accuracy / 100);
  return normalize(expected, defender.pokemon.max_hp);
}

function expectedDamageScore(attacker: BattleCardState, defender: BattleCardState, skill: Skill) {
  if (skill.category !== "attack") return 0;
  return skill.power * (attacker.pokemon.attack / defender.pokemon.defense) * getTypeMultiplier(skill.type, defender.pokemon.types) * (skill.accuracy / 100);
}

function bestAttackScore(attacker: BattleCardState, defender: BattleCardState) {
  return getPokemonSkills(attacker.pokemon)
    .filter((skill) => skill.category === "attack" && canUseSkill(attacker, skill))
    .map((skill) => expectedDamageScore(attacker, defender, skill))
    .reduce((best, score) => Math.max(best, score), 0);
}

function matchupScore(card: BattleCardState, opponent: BattleCardState) {
  const hpRatio = card.currentHp / card.pokemon.max_hp;
  return bestAttackScore(card, opponent) - bestAttackScore(opponent, card) * 0.58 + hpRatio * 28;
}

function getActionSkillForState(state: BattleEnvState, side: BattleSide, action: BattleAction) {
  if (action.type !== "skill") return undefined;
  const active = state.participants[side].team[state.participants[side].activeIndex];
  return getPokemonSkills(active.pokemon).find((skill) => skill.id === action.skillId) ?? getSkillById(action.skillId);
}

function tacticalActionScore(state: BattleEnvState, side: BattleSide, action: BattleAction) {
  const opponentSide = getOpponentSide(side);
  const participant = state.participants[side];
  const active = participant.team[participant.activeIndex];
  const opponent = state.participants[opponentSide].team[state.participants[opponentSide].activeIndex];
  const activeHpRatio = active.currentHp / active.pokemon.max_hp;
  const activeBestAttack = bestAttackScore(active, opponent);
  const opponentBestAttack = bestAttackScore(opponent, active);
  const canFinishWithBestAttack = activeBestAttack >= opponent.currentHp;

  if (action.type === "skill") {
    const skill = getActionSkillForState(state, side, action);
    if (!skill) return -10;
    if (skill.category === "attack") {
      const damage = expectedDamageScore(active, opponent, skill);
      const multiplier = getTypeMultiplier(skill.type, opponent.pokemon.types);
      let score = Math.min(30, damage * 0.18);
      if (damage >= opponent.currentHp) score += 18;
      if (multiplier >= 2) score += 6;
      if (multiplier < 1) score -= 7;
      if (activeBestAttack >= damage + 24) score -= 8;
      return score;
    }
    if (skill.category === "heal") {
      const target = participant.team[action.targetIndex ?? participant.activeIndex];
      const missingHp = target ? target.pokemon.max_hp - target.currentHp : 0;
      return missingHp >= active.pokemon.max_hp * 0.18 ? Math.min(18, missingHp * 0.12) : -8;
    }
    if (skill.category === "shield") {
      if ((active.shieldTurns ?? 0) > 0) return -18;
      return activeHpRatio <= 0.52 || opponentBestAttack >= active.currentHp * 0.36 ? 14 : -8;
    }
    return canFinishWithBestAttack ? -10 : 3;
  }

  if (action.type === "basic_attack") {
    const damage = expectedDamageScore(active, opponent, createBasicAttackSkill(active));
    let score = damage >= opponent.currentHp ? 14 : Math.min(9, damage * 0.12);
    if (active.currentStamina <= 24 && damage >= 10) score += 5;
    if (canFinishWithBestAttack && damage < opponent.currentHp) score -= 10;
    if (activeBestAttack >= damage + 24) score -= 6;
    return score;
  }

  if (action.type === "shield") {
    if ((active.shieldTurns ?? 0) > 0) return -20;
    return activeHpRatio <= 0.5 || opponentBestAttack >= active.currentHp * 0.36 ? 16 : -10;
  }

  if (action.type === "rest") {
    const missingStamina = active.maxStamina - active.currentStamina;
    let score = active.currentStamina <= 22 ? 10 : missingStamina >= REST_STAMINA_RECOVERY * 0.7 ? 4 : -6;
    if (canFinishWithBestAttack) score -= 16;
    if (active.currentStamina >= 72) score -= 8;
    return score;
  }

  if (action.type === "switch") {
    const target = participant.team[action.targetIndex];
    if (!target || target.currentHp <= 0) return -20;
    const improvement = matchupScore(target, opponent) - matchupScore(active, opponent);
    let score = improvement * 0.55;
    if (activeHpRatio <= 0.34 && target.currentHp / target.pokemon.max_hp > activeHpRatio + 0.16) score += 12;
    if (activeHpRatio > 0.72 && improvement < 8) score -= 14;
    return Math.max(-18, Math.min(24, score));
  }

  return 0;
}

export function stateToVector(state: BattleEnvState, learningSide: BattleSide): number[] {
  const opponentSide = getOpponentSide(learningSide);
  const learning = state.participants[learningSide];
  const opponent = state.participants[opponentSide];
  const learningActive = learning.team[learning.activeIndex];
  const opponentActive = opponent.team[opponent.activeIndex];
  const vector: number[] = [];

  learning.team.forEach((card, index) => vector.push(...cardFeatures(card, learning.activeIndex, index)));
  opponent.team.forEach((card, index) => vector.push(...cardFeatures(card, opponent.activeIndex, index)));
  getPokemonSkills(learningActive.pokemon).slice(0, 4).forEach((skill) => {
    vector.push(skillCategoryValue(skill));
    vector.push(normalize(skill.power, 120));
    vector.push(normalize(getSkillStaminaCost(skill), 50));
    vector.push(canUseSkill(learningActive, skill) ? 1 : 0);
    vector.push(skill.category === "attack" ? normalize(getTypeMultiplier(skill.type, opponentActive.pokemon.types), 4) : 0);
    vector.push(expectedDamageRatio(learningActive, opponentActive, skill));
  });
  const basicAttack = createBasicAttackSkill(learningActive);
  const bestSkillDamage = getPokemonSkills(learningActive.pokemon).reduce((best, skill) => Math.max(best, expectedDamageRatio(learningActive, opponentActive, skill)), 0);
  const bestOpponentDamage = getPokemonSkills(opponentActive.pokemon).reduce((best, skill) => Math.max(best, expectedDamageRatio(opponentActive, learningActive, skill)), 0);
  const teamHp = learning.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
  const opponentTeamHp = opponent.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
  vector.push(learningActive.currentStamina >= BASIC_ATTACK_STAMINA_COST ? 1 : 0);
  vector.push(expectedDamageRatio(learningActive, opponentActive, basicAttack));
  vector.push(bestSkillDamage);
  vector.push(bestOpponentDamage);
  vector.push(normalize(Math.min(REST_STAMINA_RECOVERY, learningActive.maxStamina - learningActive.currentStamina), REST_STAMINA_RECOVERY));
  vector.push((learningActive.shieldTurns ?? 0) > 0 ? 1 : 0);
  vector.push(bestOpponentDamage >= normalize(learningActive.currentHp, learningActive.pokemon.max_hp) * 0.35 ? 1 : 0);
  vector.push(normalize(teamHp, learning.team.reduce((sum, card) => sum + card.pokemon.max_hp, 0)));
  vector.push(normalize(opponentTeamHp, opponent.team.reduce((sum, card) => sum + card.pokemon.max_hp, 0)));
  vector.push(normalize(state.turnNumber, 80));

  while (vector.length < STATE_VECTOR_SIZE) vector.push(0);
  return vector.slice(0, STATE_VECTOR_SIZE);
}

export function getActionIndex(state: BattleEnvState, side: BattleSide, action: BattleAction) {
  if (action.type === "rest") return 4;
  if (action.type === "basic_attack") return 5;
  if (action.type === "shield") return 6;
  if (action.type === "switch") return Math.min(9, 7 + action.targetIndex);
  const active = state.participants[side].team[state.participants[side].activeIndex];
  const skillIndex = action.type === "skill" ? getPokemonSkills(active.pokemon).findIndex((skill) => skill.id === action.skillId) : -1;
  return Math.max(0, Math.min(3, skillIndex));
}

function createModel() {
  const input = tf.input({ shape: [STATE_VECTOR_SIZE] });
  const trunk = tf.layers.dense({ units: 64, activation: "relu" }).apply(input) as tf.SymbolicTensor;
  const hidden = tf.layers.dense({ units: 48, activation: "relu" }).apply(trunk) as tf.SymbolicTensor;
  const valueHidden = tf.layers.dense({ units: 32, activation: "relu" }).apply(hidden) as tf.SymbolicTensor;
  const advantageHidden = tf.layers.dense({ units: 32, activation: "relu" }).apply(hidden) as tf.SymbolicTensor;
  const value = tf.layers.dense({ units: 1, activation: "linear" }).apply(valueHidden) as tf.SymbolicTensor;
  const advantage = tf.layers.dense({ units: ACTION_VECTOR_SIZE, activation: "linear" }).apply(advantageHidden) as tf.SymbolicTensor;
  const qValues = new DuelingQMergeLayer({ name: "dueling_q_values" }).apply([value, advantage]) as tf.SymbolicTensor;
  const model = tf.model({ inputs: input, outputs: qValues, name: "battle_tactics_v3_rules_dueling_dqn" });
  model.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: "meanSquaredError" });
  return model;
}

function isDuelingModel(model: tf.LayersModel) {
  return model.name === "battle_tactics_v3_rules_dueling_dqn" || (model.name === "battle_tactics_dueling_dqn" && model.outputs[0]?.shape?.[1] === ACTION_VECTOR_SIZE);
}

export class LearningAgent implements BattleAgent {
  name = "LearningAgent";
  epsilon = 0.85;
  minEpsilon = 0.02;
  epsilonDecay = 0.994;
  gamma = 0.92;
  private policyModel = createModel();
  private targetModel = createModel();
  private metadata?: TrainingModelMetadata;
  private replayBuffer: TrainingReplaySample[] = [];
  private trainSteps = 0;

  constructor() {
    this.syncTargetNetwork();
  }

  reset() {
    this.policyModel.dispose();
    this.targetModel.dispose();
    this.policyModel = createModel();
    this.targetModel = createModel();
    this.epsilon = 0.85;
    this.metadata = undefined;
    this.replayBuffer = [];
    this.trainSteps = 0;
    this.syncTargetNetwork();
  }

  decayExploration() {
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
  }

  selectAction(state: BattleEnvState, legalActions: BattleAction[]) {
    if (legalActions.length === 0) return { type: "rest" as const };
    if (Math.random() < this.epsilon) return legalActions[Math.floor(Math.random() * legalActions.length)];

    const input = tf.tensor2d([stateToVector(state, state.turn)]);
    const prediction = this.policyModel.predict(input) as tf.Tensor;
    const qValues = Array.from(prediction.dataSync());
    input.dispose();
    prediction.dispose();
    return [...legalActions].sort((a, b) => {
      const scoreA = qValues[getActionIndex(state, state.turn, a)] + tacticalActionScore(state, state.turn, a) * TACTICAL_POLICY_WEIGHT;
      const scoreB = qValues[getActionIndex(state, state.turn, b)] + tacticalActionScore(state, state.turn, b) * TACTICAL_POLICY_WEIGHT;
      return scoreB - scoreA;
    })[0];
  }

  async trainTransition(params: { state: BattleEnvState; action: BattleAction; reward: number; nextState: BattleEnvState; done: boolean; side: BattleSide }) {
    const sample: TrainingReplaySample = {
      stateVector: stateToVector(params.state, params.side),
      actionIndex: getActionIndex(params.state, params.side, params.action),
      reward: clamp(finiteOrZero(params.reward), -REWARD_CLIP, REWARD_CLIP),
      nextStateVector: stateToVector(params.nextState, params.side),
      done: params.done,
    };
    this.remember(sample);
    const onlineLoss = await this.trainSample(sample);
    const replayLoss = await this.trainReplayBatch();
    return replayLoss > 0 ? onlineLoss * (1 - REPLAY_TRAINING_WEIGHT) + replayLoss * REPLAY_TRAINING_WEIGHT : onlineLoss;
  }

  private remember(sample: TrainingReplaySample) {
    const maxPriority = this.replayBuffer.reduce((max, item) => Math.max(max, item.priority ?? 1), 1);
    sample.priority = maxPriority;
    this.replayBuffer.push(sample);
    if (this.replayBuffer.length > REPLAY_BUFFER_LIMIT) this.replayBuffer.splice(0, this.replayBuffer.length - REPLAY_BUFFER_LIMIT);
  }

  private async trainReplayBatch() {
    if (this.replayBuffer.length < 8) return 0;
    const batchSize = Math.min(REPLAY_BATCH_SIZE, this.replayBuffer.length);
    let totalLoss = 0;
    for (let index = 0; index < batchSize; index += 1) {
      const sample = this.samplePrioritizedReplay();
      totalLoss += await this.trainSample(sample);
    }
    return totalLoss / batchSize;
  }

  private samplePrioritizedReplay() {
    const weightedPriorities = this.replayBuffer.map((sample) => Math.pow(Math.max(sample.priority ?? 1, PRIORITY_EPSILON), PRIORITY_ALPHA));
    const totalPriority = weightedPriorities.reduce((sum, value) => sum + value, 0);
    if (totalPriority <= 0) return this.replayBuffer[Math.floor(Math.random() * this.replayBuffer.length)];
    let cursor = Math.random() * totalPriority;
    for (let index = 0; index < this.replayBuffer.length; index += 1) {
      cursor -= weightedPriorities[index];
      if (cursor <= 0) return this.replayBuffer[index];
    }
    return this.replayBuffer[this.replayBuffer.length - 1];
  }

  private async trainSample(sample: TrainingReplaySample) {
    const stateTensor = tf.tensor2d([sample.stateVector]);
    const nextStateTensor = tf.tensor2d([sample.nextStateVector]);
    const currentPrediction = this.policyModel.predict(stateTensor) as tf.Tensor;
    const nextPolicyPrediction = this.policyModel.predict(nextStateTensor) as tf.Tensor;
    const nextTargetPrediction = this.targetModel.predict(nextStateTensor) as tf.Tensor;
    const currentQ = Array.from(currentPrediction.dataSync()).map((value) => clamp(finiteOrZero(value), -Q_VALUE_CLIP, Q_VALUE_CLIP));
    const nextPolicyQ = Array.from(nextPolicyPrediction.dataSync()).map((value) => clamp(finiteOrZero(value), -Q_VALUE_CLIP, Q_VALUE_CLIP));
    const nextTargetQ = Array.from(nextTargetPrediction.dataSync()).map((value) => clamp(finiteOrZero(value), -Q_VALUE_CLIP, Q_VALUE_CLIP));
    const nextActionIndex = nextPolicyQ.reduce((bestIndex, value, index) => (value > nextPolicyQ[bestIndex] ? index : bestIndex), 0);
    const nextBestQ = nextTargetQ[nextActionIndex] ?? 0;
    const previousActionQ = currentQ[sample.actionIndex] ?? 0;
    const targetActionQ = clamp(sample.reward + (sample.done ? 0 : this.gamma * nextBestQ), -Q_VALUE_CLIP, Q_VALUE_CLIP);
    currentQ[sample.actionIndex] = targetActionQ;
    const tdError = targetActionQ - previousActionQ;
    sample.priority = Math.abs(tdError) + PRIORITY_EPSILON;

    const targetTensor = tf.tensor2d([currentQ]);
    const result = await this.policyModel.fit(stateTensor, targetTensor, { epochs: 1, verbose: 0 });
    const lossValue = Array.isArray(result.history.loss) ? Number(result.history.loss[0] ?? 0) : Number(result.history.loss ?? 0);
    this.trainSteps += 1;
    if (this.trainSteps % TARGET_SYNC_INTERVAL === 0) this.syncTargetNetwork();

    stateTensor.dispose();
    nextStateTensor.dispose();
    currentPrediction.dispose();
    nextPolicyPrediction.dispose();
    nextTargetPrediction.dispose();
    targetTensor.dispose();
    return Number.isFinite(lossValue) ? Math.min(lossValue, REPORTED_LOSS_CLIP) : 0;
  }

  private syncTargetNetwork() {
    const weights = this.policyModel.getWeights().map((weight) => weight.clone());
    this.targetModel.setWeights(weights);
    weights.forEach((weight) => weight.dispose());
  }

  async saveModel(modelKey: string) {
    await this.policyModel.save(modelKey);
  }

  async exportArtifacts() {
    let artifacts: tf.io.ModelArtifacts | undefined;
    await this.policyModel.save(
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
    if (!artifacts) throw new Error("模型權重匯出失敗。");
    return artifacts;
  }

  async importArtifacts(artifacts: tf.io.ModelArtifacts) {
    const loadedModel = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
    if (!isDuelingModel(loadedModel)) {
      loadedModel.dispose();
      throw new Error("此模型權重不符合 v3 規則一致化模型，請新建 v3 模型重新訓練。");
    }
    this.policyModel.dispose();
    this.policyModel = loadedModel;
    this.policyModel.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: "meanSquaredError" });
    this.syncTargetNetwork();
  }

  async loadModel(modelKey: string) {
    const loadedModel = await tf.loadLayersModel(modelKey);
    if (!isDuelingModel(loadedModel)) {
      loadedModel.dispose();
      throw new Error("此模型權重不符合 v3 規則一致化模型，請新建 v3 模型重新訓練。");
    }
    this.policyModel.dispose();
    this.policyModel = loadedModel;
    this.policyModel.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: "meanSquaredError" });
    this.syncTargetNetwork();
  }

  async hasSavedModel(modelKey: string) {
    const models = await tf.io.listModels();
    return Boolean(models[modelKey]);
  }

  getMetadata() {
    return this.metadata;
  }

  setMetadata(metadata: TrainingModelMetadata) {
    this.metadata = metadata;
    this.epsilon = metadata.epsilon;
    this.replayBuffer = metadata.replayBuffer?.slice(-REPLAY_BUFFER_LIMIT) ?? [];
    this.trainSteps = 0;
    this.syncTargetNetwork();
  }

  exportReplayBuffer() {
    return this.replayBuffer.slice(-REPLAY_BUFFER_LIMIT);
  }

  importReplayBuffer(samples?: TrainingReplaySample[]) {
    this.replayBuffer = samples?.slice(-REPLAY_BUFFER_LIMIT) ?? [];
  }
}

export function scoreActionForReward(eventDamage: number, eventHealing: number) {
  return eventDamage * 0.2 + eventHealing * 0.08;
}
