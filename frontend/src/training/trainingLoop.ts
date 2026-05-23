import { AI_BATTLE_MAX_TURNS, BASIC_ATTACK_STAMINA_COST, cloneBattleState, createAiBattleState, createBasicAttackSkill, getLegalActions, stepBattle } from "../utils/battleEngine";
import { calculateDamage, canUseSkill, getPokemonSkills, REST_STAMINA_RECOVERY } from "../utils/battleCalculator";
import type { BattleAction, BattleAgent, BattleEnvState, BattleReplayEvent, BattleSide, TrainingEpisodeResult, TrainingState } from "../types/battle";
import { LearningAgent, scoreActionForReward } from "./learningAgent";

export const MAX_TRAINING_METRIC_POINTS = 720;
export const MAX_RECENT_RESULT_POINTS = 1000;

interface PendingTransition {
  state: BattleEnvState;
  action: BattleAction;
  reward: number;
  actionTags: ActionRewardTags;
}

interface ActionRewardTags {
  switchCount: number;
  shieldCount: number;
  basicAttackCount: number;
  restCount: number;
  beneficialSwitchCount: number;
  effectiveShieldCount: number;
}

function emptyActionTags(): ActionRewardTags {
  return { switchCount: 0, shieldCount: 0, basicAttackCount: 0, restCount: 0, beneficialSwitchCount: 0, effectiveShieldCount: 0 };
}

function getTeamHp(state: BattleEnvState, side: BattleSide) {
  return state.participants[side].team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
}

function getTeamMaxHp(state: BattleEnvState, side: BattleSide) {
  return state.participants[side].team.reduce((sum, card) => sum + card.pokemon.max_hp, 0);
}

function getDefeatedCount(state: BattleEnvState, side: BattleSide) {
  return state.participants[side].team.filter((card) => card.currentHp <= 0).length;
}

function getOpponentSide(side: BattleSide): BattleSide {
  return side === "player" ? "computer" : "player";
}

function getActiveCard(state: BattleEnvState, side: BattleSide) {
  const participant = state.participants[side];
  return participant.team[participant.activeIndex];
}

function getBestAttackScore(attacker = undefined as ReturnType<typeof getActiveCard> | undefined, defender = undefined as ReturnType<typeof getActiveCard> | undefined) {
  if (!attacker || !defender || attacker.currentHp <= 0) return 0;
  return getPokemonSkills(attacker.pokemon)
    .filter((skill) => skill.category === "attack" && canUseSkill(attacker, skill))
    .map((skill) => {
      const result = calculateDamage(attacker.pokemon, defender.pokemon, skill);
      return result.isHit ? result.damage * result.typeMultiplier : 0;
    })
    .reduce((best, score) => Math.max(best, score), 0);
}

function matchupScore(state: BattleEnvState, side: BattleSide) {
  const opponentSide = getOpponentSide(side);
  const active = getActiveCard(state, side);
  const opponent = getActiveCard(state, opponentSide);
  const hpRatio = active.currentHp / active.pokemon.max_hp;
  return getBestAttackScore(active, opponent) - getBestAttackScore(opponent, active) * 0.55 + hpRatio * 28;
}

function shapeLearningActionReward(before: BattleEnvState, after: BattleEnvState, action: BattleAction, learningSide: BattleSide, previousAction?: BattleAction) {
  const tags = emptyActionTags();
  const opponentSide = getOpponentSide(learningSide);
  let reward = 0;
  const active = getActiveCard(before, learningSide);
  const opponent = getActiveCard(before, opponentSide);
  const opponentBestAttack = getBestAttackScore(opponent, active);
  const activeBestAttack = getBestAttackScore(active, opponent);
  const canKillWithBestSkill = activeBestAttack >= opponent.currentHp;

  if (action.type === "switch") {
    tags.switchCount = 1;
    const beforeActive = getActiveCard(before, learningSide);
    const afterActive = getActiveCard(after, learningSide);
    const beforeScore = matchupScore(before, learningSide);
    const afterScore = matchupScore(after, learningSide);
    const beforeHpRatio = beforeActive.currentHp / beforeActive.pokemon.max_hp;
    const afterHpRatio = afterActive.currentHp / afterActive.pokemon.max_hp;
    const improvement = afterScore - beforeScore;

    if (beforeHpRatio <= 0.35 && afterHpRatio > beforeHpRatio + 0.18) reward += 10;
    if (improvement >= 18) reward += Math.min(18, improvement * 0.45);
    if (improvement >= 10 || beforeHpRatio <= 0.35) tags.beneficialSwitchCount = 1;
    if (beforeHpRatio > 0.72 && improvement < 8) reward -= 12;
    if (previousAction?.type === "switch") reward -= 14;
  }

  if (action.type === "rest") {
    tags.restCount = 1;
    const missingStamina = Math.max(0, active.maxStamina - active.currentStamina);
    const noEffectiveAttack = activeBestAttack < Math.max(18, opponent.currentHp * 0.22);
    if (active.currentStamina <= 24 || (missingStamina >= REST_STAMINA_RECOVERY * 0.65 && noEffectiveAttack)) reward += 7;
    if (active.currentStamina >= 72) reward -= 8;
    if (canKillWithBestSkill) reward -= 14;
    if (previousAction?.type === "rest") reward -= 8;
  }

  if (action.type === "basic_attack") {
    tags.basicAttackCount = 1;
    const basicAttack = createBasicAttackSkill(active);
    const basicResult = calculateDamage(active.pokemon, opponent.pokemon, basicAttack);
    const basicScore = basicResult.isHit ? basicResult.damage : 0;
    if (active.currentStamina <= 24 && basicScore >= 10) reward += 7;
    if (basicScore >= opponent.currentHp) reward += 10;
    if (canKillWithBestSkill && basicScore < opponent.currentHp) reward -= 10;
    if (active.currentStamina >= BASIC_ATTACK_STAMINA_COST && activeBestAttack >= basicScore + 22) reward -= 5;
  }

  if (action.type === "shield" || action.type === "skill") {
    const skill = action.type === "skill" ? getPokemonSkills(active.pokemon).find((item) => item.id === action.skillId) : undefined;
    if (skill?.category === "attack") {
      const result = calculateDamage(active.pokemon, opponent.pokemon, skill);
      const expectedDamage = result.isHit ? result.damage : 0;
      reward += Math.min(14, expectedDamage * 0.08);
      if (expectedDamage >= opponent.currentHp) reward += 18;
      if (result.typeMultiplier >= 2) reward += 5;
      if (result.typeMultiplier < 1) reward -= 7;
      if (activeBestAttack >= expectedDamage + 24) reward -= 6;
    }
    if (skill?.category === "heal") {
      const targetIndex = action.type === "skill" ? action.targetIndex : undefined;
      const target = before.participants[learningSide].team[targetIndex ?? before.participants[learningSide].activeIndex];
      const missingHp = target.pokemon.max_hp - target.currentHp;
      if (missingHp >= target.pokemon.max_hp * 0.22) reward += Math.min(14, missingHp * 0.1);
      else reward -= 6;
    }
    if ((skill?.category === "buff" || skill?.category === "debuff") && canKillWithBestSkill) reward -= 10;
    if (action.type === "shield" || skill?.category === "shield") {
      tags.shieldCount = 1;
      const hpRatio = active.currentHp / active.pokemon.max_hp;
      if ((active.shieldTurns ?? 0) > 0) reward -= 16;
      else if (hpRatio <= 0.55 || opponentBestAttack >= active.currentHp * 0.35) reward += 9;
      else if (opponentBestAttack < active.pokemon.max_hp * 0.16) reward -= 8;
      if (previousAction?.type === "shield") reward -= 10;
    }
  }

  return { reward, tags };
}

function shapeOpponentResponseReward(before: BattleEnvState, after: BattleEnvState, learningSide: BattleSide, pending: PendingTransition) {
  const activeBefore = getActiveCard(before, learningSide);
  const activeAfter = getActiveCard(after, learningSide);
  const shieldConsumed = (activeBefore.shieldTurns ?? 0) > (activeAfter.shieldTurns ?? 0);
  const hpLost = Math.max(0, activeBefore.currentHp - activeAfter.currentHp);
  if ((pending.action.type === "shield" || pending.action.type === "skill") && shieldConsumed && hpLost > 0) {
    pending.actionTags.effectiveShieldCount = 1;
    return Math.min(22, 8 + hpLost * 0.16);
  }
  return 0;
}

function delayedReward(before: BattleEnvState, after: BattleEnvState, learningSide: BattleSide) {
  const opponentSide = getOpponentSide(learningSide);
  return (getDefeatedCount(after, opponentSide) - getDefeatedCount(before, opponentSide)) * 24 - (getTeamHp(before, learningSide) - getTeamHp(after, learningSide)) * 0.18 - (getDefeatedCount(after, learningSide) - getDefeatedCount(before, learningSide)) * 18;
}

function terminalReward(state: BattleEnvState, learningSide: BattleSide) {
  const opponentSide = getOpponentSide(learningSide);
  const hpLeadRatio = (getTeamHp(state, learningSide) - getTeamHp(state, opponentSide)) / Math.max(1, getTeamMaxHp(state, learningSide));
  const marginReward = Math.max(-24, Math.min(24, hpLeadRatio * 36));
  if (state.isDraw) return -12 + marginReward;
  if (state.winner === learningSide) return 120 + Math.max(0, marginReward);
  if (state.winner) return -120 + Math.min(0, marginReward);
  return 0;
}

function isLegalAction(action: BattleAction, legalActions: BattleAction[]) {
  return legalActions.some((legalAction) => JSON.stringify(legalAction) === JSON.stringify(action));
}

function applyCurriculumState(state: BattleEnvState, episodeSeed: number, learningSide: BattleSide) {
  const mode = Math.abs(episodeSeed) % 5;
  const opponentSide = getOpponentSide(learningSide);
  const learning = state.participants[learningSide];
  const opponent = state.participants[opponentSide];
  const active = learning.team[learning.activeIndex];
  const opponentActive = opponent.team[opponent.activeIndex];

  if (mode === 1) active.currentHp = Math.max(1, Math.round(active.pokemon.max_hp * 0.28));
  if (mode === 2) active.currentStamina = Math.min(active.currentStamina, 18);
  if (mode === 3) {
    const bestIndex = learning.team.reduce((best, card, index) => {
      const bestScore = getBestAttackScore(learning.team[best], opponentActive) - getBestAttackScore(opponentActive, learning.team[best]) * 0.55;
      const score = getBestAttackScore(card, opponentActive) - getBestAttackScore(opponentActive, card) * 0.55;
      return score > bestScore ? index : best;
    }, learning.activeIndex);
    const weakIndex = learning.team.reduce((weak, card, index) => {
      const weakScore = getBestAttackScore(card, opponentActive) - getBestAttackScore(opponentActive, card) * 0.55;
      const currentWeakScore = getBestAttackScore(learning.team[weak], opponentActive) - getBestAttackScore(opponentActive, learning.team[weak]) * 0.55;
      return scoreFinite(weakScore) < scoreFinite(currentWeakScore) ? index : weak;
    }, learning.activeIndex);
    learning.activeIndex = weakIndex === bestIndex ? learning.activeIndex : weakIndex;
  }
  if (mode === 4) opponentActive.currentStamina = Math.max(opponentActive.currentStamina, 90);
}

function scoreFinite(value: number) {
  return Number.isFinite(value) ? value : -9999;
}

function getEpisodeOutcome(result: TrainingEpisodeResult, learningSide: BattleSide): "win" | "loss" | "draw" {
  if (result.isDraw) return "draw";
  return result.winner === learningSide ? "win" : "loss";
}

export function calculateRecentWinRate(results: Array<"win" | "loss" | "draw">, windowSize: number) {
  const window = results.slice(-windowSize);
  if (window.length === 0) return 0;
  return (window.filter((result) => result === "win").length / window.length) * 100;
}

export async function runTrainingEpisode(params: { learningAgent: LearningAgent; opponentAgent: BattleAgent; learningSide?: BattleSide; seed?: number; maxTurns?: number; shouldStop?: () => boolean }): Promise<TrainingEpisodeResult> {
  const learningSide = params.learningSide ?? "player";
  const maxTurns = params.maxTurns ?? AI_BATTLE_MAX_TURNS;
  const episodeSeed = params.seed ?? Date.now();
  let state = createAiBattleState(episodeSeed);
  applyCurriculumState(state, episodeSeed, learningSide);
  const events: BattleReplayEvent[] = [];
  let totalReward = 0;
  let totalLoss = 0;
  let trainCount = 0;
  let pendingTransition: PendingTransition | null = null;
  const episodeTags = emptyActionTags();

  while (!state.winner && !state.isDraw && state.turnNumber <= maxTurns) {
    if (params.shouldStop?.()) return { turns: events.length, totalReward, loss: trainCount > 0 ? totalLoss / trainCount : 0, events, aborted: true, ...episodeTags };

    const beforeState = cloneBattleState(state);
    const legalActions = getLegalActions(state);
    const actingAgent = state.turn === learningSide ? params.learningAgent : params.opponentAgent;
    const proposedAction = actingAgent.selectAction(cloneBattleState(state), legalActions);
    const action = isLegalAction(proposedAction, legalActions) ? proposedAction : legalActions[0] ?? { type: "rest" as const };
    const result = stepBattle(state, action, maxTurns);
    state = result.state;
    events.push(result.event);

    if (beforeState.turn === learningSide) {
      if (pendingTransition) {
        if (params.shouldStop?.()) return { turns: events.length, totalReward, loss: trainCount > 0 ? totalLoss / trainCount : 0, events, aborted: true, ...episodeTags };
        const loss = await params.learningAgent.trainTransition({ ...pendingTransition, nextState: beforeState, done: false, side: learningSide });
        totalLoss += loss;
        trainCount += 1;
        totalReward += pendingTransition.reward;
        episodeTags.switchCount += pendingTransition.actionTags.switchCount;
        episodeTags.shieldCount += pendingTransition.actionTags.shieldCount;
        episodeTags.basicAttackCount += pendingTransition.actionTags.basicAttackCount;
        episodeTags.restCount += pendingTransition.actionTags.restCount;
        episodeTags.beneficialSwitchCount += pendingTransition.actionTags.beneficialSwitchCount;
        episodeTags.effectiveShieldCount += pendingTransition.actionTags.effectiveShieldCount;
      }
      const shaped = shapeLearningActionReward(beforeState, state, action, learningSide, pendingTransition?.action);
      pendingTransition = { state: beforeState, action, reward: scoreActionForReward(result.event.damage, result.event.healing) + terminalReward(state, learningSide) + shaped.reward, actionTags: shaped.tags };
    } else if (pendingTransition) {
      pendingTransition.reward += delayedReward(beforeState, state, learningSide) + terminalReward(state, learningSide) + shapeOpponentResponseReward(beforeState, state, learningSide, pendingTransition);
    }

    if ((state.winner || state.isDraw) && pendingTransition) {
      if (params.shouldStop?.()) return { turns: events.length, totalReward, loss: trainCount > 0 ? totalLoss / trainCount : 0, events, aborted: true, ...episodeTags };
      const loss = await params.learningAgent.trainTransition({ ...pendingTransition, nextState: state, done: true, side: learningSide });
      totalLoss += loss;
      trainCount += 1;
      totalReward += pendingTransition.reward;
      episodeTags.switchCount += pendingTransition.actionTags.switchCount;
      episodeTags.shieldCount += pendingTransition.actionTags.shieldCount;
      episodeTags.basicAttackCount += pendingTransition.actionTags.basicAttackCount;
      episodeTags.restCount += pendingTransition.actionTags.restCount;
      episodeTags.beneficialSwitchCount += pendingTransition.actionTags.beneficialSwitchCount;
      episodeTags.effectiveShieldCount += pendingTransition.actionTags.effectiveShieldCount;
      pendingTransition = null;
    }
  }

  if (params.shouldStop?.()) return { turns: events.length, totalReward, loss: trainCount > 0 ? totalLoss / trainCount : 0, events, aborted: true, ...episodeTags };
  params.learningAgent.decayExploration();
  return { winner: state.winner, isDraw: state.isDraw, aborted: false, turns: events.length, totalReward, loss: trainCount > 0 ? totalLoss / trainCount : 0, events, ...episodeTags };
}

export function createInitialTrainingState(): TrainingState {
  return {
    episodes: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    averageTurns: 0,
    averageReward: 0,
    loss: 0,
    epsilon: 0.85,
    switchCount: 0,
    shieldCount: 0,
    basicAttackCount: 0,
    restCount: 0,
    matchWinCount: 0,
    matchLossCount: 0,
    matchDrawCount: 0,
    comebackWinCount: 0,
    leadPickWinCount: 0,
    beneficialSwitchCount: 0,
    effectiveShieldCount: 0,
    recentResults: [],
    metricHistory: [],
    status: "idle",
    currentReplay: [],
  };
}

export function downsampleMetricHistory(points: TrainingState["metricHistory"], maxPoints = MAX_TRAINING_METRIC_POINTS): TrainingState["metricHistory"] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 3) return points.slice(-maxPoints);

  const byEpisode = new Map<number, TrainingState["metricHistory"][number]>();
  for (const point of points) byEpisode.set(point.episode, point);

  const sorted = [...byEpisode.values()].sort((left, right) => left.episode - right.episode);
  if (sorted.length <= maxPoints) return sorted;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const interior = sorted.slice(1, -1);
  const bucketCount = maxPoints - 2;
  const bucketSize = interior.length / bucketCount;
  const sampled = [first];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.min(interior.length, Math.floor((bucket + 1) * bucketSize));
    const bucketPoints = interior.slice(start, Math.max(start + 1, end));
    sampled.push(bucketPoints[bucketPoints.length - 1]);
  }

  sampled.push(last);
  return sampled.filter((point, index, list) => index === 0 || point.episode !== list[index - 1].episode);
}

export function reduceTrainingState(previous: TrainingState, result: TrainingEpisodeResult, epsilon: number, learningSide: BattleSide): TrainingState {
  if (result.aborted) return { ...previous, epsilon, currentReplay: [] };
  const episodes = previous.episodes + 1;
  const wins = previous.wins + (result.winner === learningSide ? 1 : 0);
  const draws = previous.draws + (result.isDraw ? 1 : 0);
  const losses = previous.losses + (result.winner && result.winner !== learningSide ? 1 : 0);
  const episodeLoss = Number.isFinite(result.loss) ? Math.max(0, result.loss) : 0;
  const loss = episodes === 1 ? episodeLoss : previous.loss * 0.94 + episodeLoss * 0.06;
  const recentResults = [...(previous.recentResults ?? []), getEpisodeOutcome(result, learningSide)].slice(-MAX_RECENT_RESULT_POINTS);
  const metricHistory = downsampleMetricHistory([
    ...(previous.metricHistory ?? []),
    {
      episode: episodes,
      loss,
      epsilon,
      recentWinRate100: calculateRecentWinRate(recentResults, 100),
      recentWinRate500: calculateRecentWinRate(recentResults, 500),
    },
  ]);
  return {
    episodes,
    wins,
    losses,
    draws,
    winRate: episodes > 0 ? (wins / episodes) * 100 : 0,
    averageTurns: previous.averageTurns + (result.turns - previous.averageTurns) / episodes,
    averageReward: previous.averageReward + (result.totalReward - previous.averageReward) / episodes,
    loss,
    epsilon,
    switchCount: (previous.switchCount ?? 0) + (result.switchCount ?? 0),
    shieldCount: (previous.shieldCount ?? 0) + (result.shieldCount ?? 0),
    basicAttackCount: (previous.basicAttackCount ?? 0) + (result.basicAttackCount ?? 0),
    restCount: (previous.restCount ?? 0) + (result.restCount ?? 0),
    matchWinCount: previous.matchWinCount ?? 0,
    matchLossCount: previous.matchLossCount ?? 0,
    matchDrawCount: previous.matchDrawCount ?? 0,
    comebackWinCount: previous.comebackWinCount ?? 0,
    leadPickWinCount: previous.leadPickWinCount ?? 0,
    beneficialSwitchCount: (previous.beneficialSwitchCount ?? 0) + (result.beneficialSwitchCount ?? 0),
    effectiveShieldCount: (previous.effectiveShieldCount ?? 0) + (result.effectiveShieldCount ?? 0),
    recentResults,
    metricHistory,
    status: previous.status,
    currentReplay: result.events,
  };
}
