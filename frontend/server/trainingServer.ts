import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RandomAgent, RuleBasedAgent } from "../src/utils/battleAgents";
import { LearningAgent } from "../src/training/learningAgent";
import { MatchStrategyNetwork, MATCH_STRATEGY_CANDIDATE_SIZE, MATCH_STRATEGY_TEAM_SIZE, MATCH_STRATEGY_MODEL_VERSION, createMatchStrategyVector, type MatchStrategyDraftContext, type MatchStrategyEpisodeMemory } from "../src/training/matchStrategyNetwork";
import { createInitialTrainingState, reduceTrainingState, runTrainingEpisode } from "../src/training/trainingLoop";
import { AI_BATTLE_MAX_TURNS, cloneBattleState, createAiBattleStateFromTeams, getLegalActions, stepBattle } from "../src/utils/battleEngine";
import { getBattleEnabledPokemon, getPokemonSkills, getTypeMultiplier } from "../src/utils/battleCalculator";
import type { MatchStrategyDecision, MatchStrategyMode } from "../src/training/matchStrategyPolicy";
import type { BattleReplayEvent, PokemonStats, TrainingReplaySample, TrainingState } from "../src/types/battle";

type DifficultyLevel = "beginner" | "normal" | "hard" | "master" | "hell";
type TrainingGoalMode = "time" | "winRate";
type SaveStatus = "unsaved" | "saved" | "loaded" | "failed";

interface TrainingModelSummary {
  episodes: number;
  winRate: number;
  recentResultCount: number;
  recentWinRate100: number;
  recentWinRate500: number;
  recentWinRate1000: number;
  averageTurns: number;
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
  updatedAt: string;
  trainingSeconds: number;
}

interface TrainingModelRecord {
  id: string;
  name: string;
  description: string;
  difficulty: DifficultyLevel;
  goalMode: TrainingGoalMode;
  targetTrainingMinutes: number;
  targetWinRate: number;
  targetEpisodes: number;
  createdAt: string;
  manuallyCompleted?: boolean;
  completedAt?: string;
  summary?: TrainingModelSummary;
}

interface PersistedModel {
  modelVersion?: "battle-tactics-v1" | "battle-tactics-v2" | "battle-tactics-v3-rules";
  model: TrainingModelRecord;
  trainingState: TrainingState;
  epsilon: number;
  trainingSeconds: number;
  savedAt: string;
  currentReplay: BattleReplayEvent[];
  replayBuffer?: TrainingReplaySample[];
}

interface CloneModelRequest {
  name?: string;
  difficulty?: DifficultyLevel;
  goalMode?: TrainingGoalMode;
  targetTrainingMinutes?: number;
  targetWinRate?: number;
}

interface UpdateModelRequest {
  name?: string;
  difficulty?: DifficultyLevel;
}

interface ModelRuntime {
  record: TrainingModelRecord;
  learningAgent: LearningAgent;
  trainingState: TrainingState;
  trainingSeconds: number;
  training: boolean;
  saving: boolean;
  loading: boolean;
  hasSavedModel: boolean;
  saveStatus: SaveStatus;
  runningEpisode: boolean;
  controlVersion: number;
  lastTickAt?: number;
  clients: Set<ServerResponse>;
}

interface StrategyModeStats {
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  reward: number;
}

interface MatchStrategyTrainingConfig {
  trainDraft: boolean;
  trainLead: boolean;
  trainMode: boolean;
  actionBiasStrength: number;
}

interface MatchStrategySummary {
  episodes: number;
  winRate: number;
  recentResultCount: number;
  recentWinRate500: number;
  averageReward: number;
  strategyLoss: number;
  strategyEpsilon: number;
  draftWinRate: number;
  leadWinRate: number;
  aggressiveWinRate: number;
  balancedWinRate: number;
  defensiveWinRate: number;
  comebackWinRate: number;
  holdLeadWinRate: number;
  updatedAt: string;
  trainingSeconds: number;
}

interface MatchStrategyTrainingState {
  episodes: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageReward: number;
  strategyLoss: number;
  strategyEpsilon: number;
  strategyWeights: Record<MatchStrategyMode, number>;
  strategyStats: Record<MatchStrategyMode, StrategyModeStats>;
  draftWins: number;
  draftAttempts: number;
  leadWins: number;
  leadAttempts: number;
  comebackWins: number;
  comebackAttempts: number;
  holdLeadWins: number;
  holdLeadAttempts: number;
  recentResults: Array<"win" | "loss" | "draw">;
  metricHistory: Array<{ episode: number; winRate: number; recentWinRate500: number; averageReward: number }>;
  currentReplay: BattleReplayEvent[];
  currentDraftContext?: MatchStrategyDraftContext;
  currentMode: MatchStrategyMode;
  currentActionBias: MatchStrategyDecision["actionBias"];
  status: "idle" | "training" | "paused";
}

interface MatchStrategyModelRecord {
  id: string;
  name: string;
  description: string;
  targetEpisodes: number;
  strategyConfig?: MatchStrategyTrainingConfig;
  createdAt: string;
  manuallyCompleted?: boolean;
  completedAt?: string;
  summary?: MatchStrategySummary;
}

interface PersistedMatchStrategy {
  modelVersion?: "match-strategy-v1";
  model: MatchStrategyModelRecord;
  trainingState: MatchStrategyTrainingState;
  epsilon?: number;
  trainingSeconds: number;
  savedAt: string;
}

interface MatchStrategyRuntime {
  record: MatchStrategyModelRecord;
  strategyAgent: MatchStrategyNetwork;
  trainingState: MatchStrategyTrainingState;
  trainingSeconds: number;
  training: boolean;
  saving: boolean;
  loading: boolean;
  hasSavedModel: boolean;
  saveStatus: SaveStatus;
  runningEpisode: boolean;
  controlVersion: number;
  lastTickAt?: number;
  clients: Set<ServerResponse>;
}

const difficultyOptions: Record<DifficultyLevel, { label: string; targetEpisodes: number }> = {
  beginner: { label: "入門", targetEpisodes: 150 },
  normal: { label: "中等", targetEpisodes: 300 },
  hard: { label: "困難", targetEpisodes: 500 },
  master: { label: "大師", targetEpisodes: 800 },
  hell: { label: "地獄", targetEpisodes: 1200 },
};

const PORT = Number(process.env.TRAINING_SERVER_PORT ?? 18053);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = path.join(ROOT_DIR, "training_data", "models");
const STRATEGY_DATA_DIR = path.join(ROOT_DIR, "training_data", "match-strategies");
const WRITE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const models = new Map<string, ModelRuntime>();
const matchStrategies = new Map<string, MatchStrategyRuntime>();

const DEFAULT_MATCH_STRATEGY_CONFIG: MatchStrategyTrainingConfig = {
  trainDraft: true,
  trainLead: true,
  trainMode: true,
  actionBiasStrength: 0.12,
};

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { ...WRITE_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function notFound(res: ServerResponse) {
  json(res, 404, { error: "找不到指定資源。" });
}

function modelDir(modelId: string) {
  return path.join(DATA_DIR, modelId);
}

function metadataPath(modelId: string) {
  return path.join(modelDir(modelId), "metadata.json");
}

function summaryPath(modelId: string) {
  return path.join(modelDir(modelId), "summary.json");
}

function replayPath(modelId: string) {
  return path.join(modelDir(modelId), "latest-replay.json");
}

function modelJsonPath(modelId: string) {
  return path.join(modelDir(modelId), "model.json");
}

function weightsPath(modelId: string) {
  return path.join(modelDir(modelId), "weights.bin");
}

function strategyDir(strategyId: string) {
  return path.join(STRATEGY_DATA_DIR, strategyId);
}

function strategyMetadataPath(strategyId: string) {
  return path.join(strategyDir(strategyId), "metadata.json");
}

function strategySummaryPath(strategyId: string) {
  return path.join(strategyDir(strategyId), "summary.json");
}

function strategyReplayPath(strategyId: string) {
  return path.join(strategyDir(strategyId), "latest-replay.json");
}

function strategyModelJsonPath(strategyId: string) {
  return path.join(strategyDir(strategyId), "model.json");
}

function strategyWeightsPath(strategyId: string) {
  return path.join(strategyDir(strategyId), "weights.bin");
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function nowIso() {
  return new Date().toISOString();
}

function createModelId(prefix = "battle-tactics") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeStrategyConfig(config?: Partial<MatchStrategyTrainingConfig>): MatchStrategyTrainingConfig {
  return {
    trainDraft: config?.trainDraft ?? DEFAULT_MATCH_STRATEGY_CONFIG.trainDraft,
    trainLead: config?.trainLead ?? DEFAULT_MATCH_STRATEGY_CONFIG.trainLead,
    trainMode: config?.trainMode ?? DEFAULT_MATCH_STRATEGY_CONFIG.trainMode,
    actionBiasStrength: Math.max(0, Math.min(0.2, Number(config?.actionBiasStrength ?? DEFAULT_MATCH_STRATEGY_CONFIG.actionBiasStrength))),
  };
}

function compareModelsByCreatedAtAsc(left: TrainingModelRecord, right: TrainingModelRecord) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER;
  const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER;
  if (normalizedLeftTime !== normalizedRightTime) return normalizedLeftTime - normalizedRightTime;
  return left.id.localeCompare(right.id);
}

function listModelsByCreatedAtAsc() {
  return [...models.values()].map((runtime) => runtime.record).sort(compareModelsByCreatedAtAsc);
}

function compareStrategiesByCreatedAtAsc(left: MatchStrategyModelRecord, right: MatchStrategyModelRecord) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER;
  const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER;
  if (normalizedLeftTime !== normalizedRightTime) return normalizedLeftTime - normalizedRightTime;
  return left.id.localeCompare(right.id);
}

function listStrategiesByCreatedAtAsc() {
  return [...matchStrategies.values()].map((runtime) => runtime.record).sort(compareStrategiesByCreatedAtAsc);
}

function calculateRecentWinRate(results: Array<"win" | "loss" | "draw"> | undefined, windowSize: number) {
  const window = (results ?? []).slice(-windowSize);
  if (window.length === 0) return 0;
  return (window.filter((result) => result === "win").length / window.length) * 100;
}

function toSummary(runtime: ModelRuntime): TrainingModelSummary {
  return {
    episodes: runtime.trainingState.episodes,
    winRate: runtime.trainingState.winRate,
    recentResultCount: runtime.trainingState.recentResults?.length ?? 0,
    recentWinRate100: calculateRecentWinRate(runtime.trainingState.recentResults, 100),
    recentWinRate500: calculateRecentWinRate(runtime.trainingState.recentResults, 500),
    recentWinRate1000: calculateRecentWinRate(runtime.trainingState.recentResults, 1000),
    averageTurns: runtime.trainingState.averageTurns,
    loss: runtime.trainingState.loss,
    epsilon: runtime.trainingState.epsilon,
    switchCount: runtime.trainingState.switchCount ?? 0,
    shieldCount: runtime.trainingState.shieldCount ?? 0,
    basicAttackCount: runtime.trainingState.basicAttackCount ?? 0,
    restCount: runtime.trainingState.restCount ?? 0,
    matchWinCount: runtime.trainingState.matchWinCount ?? 0,
    matchLossCount: runtime.trainingState.matchLossCount ?? 0,
    matchDrawCount: runtime.trainingState.matchDrawCount ?? 0,
    comebackWinCount: runtime.trainingState.comebackWinCount ?? 0,
    leadPickWinCount: runtime.trainingState.leadPickWinCount ?? 0,
    beneficialSwitchCount: runtime.trainingState.beneficialSwitchCount ?? 0,
    effectiveShieldCount: runtime.trainingState.effectiveShieldCount ?? 0,
    updatedAt: nowIso(),
    trainingSeconds: Math.floor(runtime.trainingSeconds),
  };
}

function createEmptyModeStats(): StrategyModeStats {
  return { plays: 0, wins: 0, losses: 0, draws: 0, reward: 0 };
}

function createInitialMatchStrategyState(): MatchStrategyTrainingState {
  return {
    episodes: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    averageReward: 0,
    strategyLoss: 0,
    strategyEpsilon: 0.18,
    strategyWeights: { aggressive: 1, balanced: 1, defensive: 1 },
    strategyStats: { aggressive: createEmptyModeStats(), balanced: createEmptyModeStats(), defensive: createEmptyModeStats() },
    draftWins: 0,
    draftAttempts: 0,
    leadWins: 0,
    leadAttempts: 0,
    comebackWins: 0,
    comebackAttempts: 0,
    holdLeadWins: 0,
    holdLeadAttempts: 0,
    recentResults: [],
    metricHistory: [],
    currentReplay: [],
    currentDraftContext: undefined,
    currentMode: "balanced",
    currentActionBias: { skill: 0.04, basic_attack: 0.04, switch: 0.04, shield: 0.04, rest: 0.02 },
    status: "idle",
  };
}

function calculateModeWinRate(stats: StrategyModeStats) {
  return stats.plays > 0 ? (stats.wins / stats.plays) * 100 : 0;
}

function toStrategySummary(runtime: MatchStrategyRuntime): MatchStrategySummary {
  const state = runtime.trainingState;
  return {
    episodes: state.episodes,
    winRate: state.winRate,
    recentResultCount: state.recentResults.length,
    recentWinRate500: calculateRecentWinRate(state.recentResults, 500),
    averageReward: state.averageReward,
    strategyLoss: state.strategyLoss,
    strategyEpsilon: state.strategyEpsilon,
    draftWinRate: state.draftAttempts > 0 ? (state.draftWins / state.draftAttempts) * 100 : 0,
    leadWinRate: state.leadAttempts > 0 ? (state.leadWins / state.leadAttempts) * 100 : 0,
    aggressiveWinRate: calculateModeWinRate(state.strategyStats.aggressive),
    balancedWinRate: calculateModeWinRate(state.strategyStats.balanced),
    defensiveWinRate: calculateModeWinRate(state.strategyStats.defensive),
    comebackWinRate: state.comebackAttempts > 0 ? (state.comebackWins / state.comebackAttempts) * 100 : 0,
    holdLeadWinRate: state.holdLeadAttempts > 0 ? (state.holdLeadWins / state.holdLeadAttempts) * 100 : 0,
    updatedAt: nowIso(),
    trainingSeconds: Math.floor(runtime.trainingSeconds),
  };
}

function syncRecordSummary(runtime: ModelRuntime) {
  runtime.record.summary = toSummary(runtime);
}

function syncStrategyRecordSummary(runtime: MatchStrategyRuntime) {
  runtime.record.summary = toStrategySummary(runtime);
}

function normalizeTrainingState(state: TrainingState): TrainingState {
  return {
    ...state,
    switchCount: state.switchCount ?? 0,
    shieldCount: state.shieldCount ?? 0,
    basicAttackCount: state.basicAttackCount ?? 0,
    restCount: state.restCount ?? 0,
    matchWinCount: state.matchWinCount ?? 0,
    matchLossCount: state.matchLossCount ?? 0,
    matchDrawCount: state.matchDrawCount ?? 0,
    comebackWinCount: state.comebackWinCount ?? 0,
    leadPickWinCount: state.leadPickWinCount ?? 0,
    beneficialSwitchCount: state.beneficialSwitchCount ?? 0,
    effectiveShieldCount: state.effectiveShieldCount ?? 0,
    recentResults: state.recentResults ?? [],
    metricHistory: state.metricHistory ?? [],
    currentReplay: state.currentReplay ?? [],
  };
}

function isCompleted(runtime: ModelRuntime) {
  if (runtime.record.manuallyCompleted) return true;
  const summary = runtime.record.summary;
  if (!summary) return false;
  if (runtime.record.goalMode === "time") return summary.trainingSeconds >= runtime.record.targetTrainingMinutes * 60;
  return summary.episodes >= runtime.record.targetEpisodes && summary.winRate >= runtime.record.targetWinRate;
}

function runtimePayload(runtime: ModelRuntime) {
  syncRecordSummary(runtime);
  return {
    model: runtime.record,
    trainingState: runtime.trainingState,
    workerState: {
      training: runtime.training,
      saving: runtime.saving,
      loading: runtime.loading,
      hasSavedModel: runtime.hasSavedModel,
      saveStatus: runtime.saveStatus,
    },
    completed: isCompleted(runtime),
  };
}

function isStrategyCompleted(runtime: MatchStrategyRuntime) {
  if (runtime.record.manuallyCompleted) return true;
  return runtime.trainingState.episodes >= runtime.record.targetEpisodes;
}

function strategyPayload(runtime: MatchStrategyRuntime) {
  syncStrategyRecordSummary(runtime);
  return {
    model: runtime.record,
    trainingState: runtime.trainingState,
    workerState: {
      training: runtime.training,
      saving: runtime.saving,
      loading: runtime.loading,
      hasSavedModel: runtime.hasSavedModel,
      saveStatus: runtime.saveStatus,
    },
    completed: isStrategyCompleted(runtime),
  };
}

function broadcast(runtime: ModelRuntime, event = "progress") {
  const payload = `event: ${event}\ndata: ${JSON.stringify(runtimePayload(runtime))}\n\n`;
  for (const client of runtime.clients) client.write(payload);
}

function broadcastStrategy(runtime: MatchStrategyRuntime, event = "progress") {
  const payload = `event: ${event}\ndata: ${JSON.stringify(strategyPayload(runtime))}\n\n`;
  for (const client of runtime.clients) client.write(payload);
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function renderMetricsChartSvg(runtime: ModelRuntime) {
  const history = runtime.trainingState.metricHistory ?? [];
  const width = 1180;
  const height = 680;
  const padding = { left: 82, right: 86, top: 172, bottom: 84 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const latest = history[history.length - 1];
  const lossMax = Math.max(0.001, ...history.map((point) => point.loss));
  const epsilonMax = 1;
  const epsilonInset = 18;
  const getX = (index: number) => padding.left + (history.length <= 1 ? plotWidth : (index / (history.length - 1)) * plotWidth);
  const getLossY = (loss: number) => padding.top + plotHeight - (loss / lossMax) * plotHeight;
  const getEpsilonY = (epsilon: number) => {
    const normalized = Math.max(0, Math.min(1, epsilon / epsilonMax));
    return padding.top + epsilonInset + (1 - normalized) * (plotHeight - epsilonInset * 2);
  };
  const getRateY = (rate: number) => padding.top + plotHeight - (Math.max(0, Math.min(100, rate)) / 100) * plotHeight;
  const toPath = (getY: (index: number) => number) => history.map((_, index) => `${index === 0 ? "M" : "L"} ${getX(index).toFixed(2)} ${getY(index).toFixed(2)}`).join(" ");
  const firstEpisode = history[0]?.episode ?? 0;
  const lastEpisode = history[history.length - 1]?.episode ?? runtime.trainingState.episodes;
  const sampleText = history.length < runtime.trainingState.episodes
    ? `${history.length.toLocaleString()} sampled points / ${runtime.trainingState.episodes.toLocaleString()} episodes`
    : `${history.length.toLocaleString()} points / ${runtime.trainingState.episodes.toLocaleString()} episodes`;

  if (history.length === 0) {
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="訓練曲線圖">
  <rect width="${width}" height="${height}" rx="30" fill="#020617"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#08111f" stroke="#1e293b"/>
  <text x="${width / 2}" y="292" text-anchor="middle" fill="#e2e8f0" font-size="34" font-weight="900">尚無曲線資料</text>
  <text x="${width / 2}" y="338" text-anchor="middle" fill="#94a3b8" font-size="20" font-weight="700">模型已完成，但 metricHistory 目前沒有可繪製的 episode 點。</text>
</svg>`.trim();
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Loss 與 Epsilon 訓練曲線圖">
  <defs>
    <linearGradient id="lossLine" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#fda4af"/><stop offset="1" stop-color="#fb7185"/></linearGradient>
    <linearGradient id="epsilonLine" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#c4b5fd"/><stop offset="1" stop-color="#818cf8"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${width}" height="${height}" rx="30" fill="#020617"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#08111f" stroke="#1e293b"/>
  <text x="58" y="70" fill="#67e8f9" font-size="16" font-weight="900" letter-spacing="5">TRAINING METRICS</text>
  <text x="${width - 58}" y="78" fill="#cbd5e1" font-size="18" font-weight="800" text-anchor="end">Episode ${lastEpisode.toLocaleString()}</text>
  <text x="${width - 58}" y="108" fill="#94a3b8" font-size="15" font-weight="700" text-anchor="end">Loss ${latest.loss.toFixed(4)} / Epsilon ${latest.epsilon.toFixed(3)}</text>
  <text x="${padding.left}" y="${padding.top - 18}" fill="#94a3b8" font-size="14" font-weight="800">${escapeXml(sampleText)}</text>
  ${[0, 0.25, 0.5, 0.75, 1].map((tick) => {
    const y = padding.top + tick * plotHeight;
    return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="#334155" stroke-opacity="0.68" stroke-dasharray="5 10"/>`;
  }).join("\n  ")}
  <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}" stroke="#475569"/>
  <line x1="${padding.left}" x2="${padding.left}" y1="${padding.top}" y2="${padding.top + plotHeight}" stroke="#334155"/>
  <line x1="${width - padding.right}" x2="${width - padding.right}" y1="${padding.top}" y2="${padding.top + plotHeight}" stroke="#334155"/>
  <text x="${padding.left}" y="${height - 42}" fill="#64748b" font-size="16" font-weight="800">Ep ${firstEpisode.toLocaleString()}</text>
  <text x="${width - padding.right}" y="${height - 42}" fill="#64748b" font-size="16" font-weight="800" text-anchor="end">Ep ${lastEpisode.toLocaleString()}</text>
  <text x="34" y="${padding.top + 8}" fill="#fda4af" font-size="16" font-weight="900">Loss</text>
  <text x="${width - 36}" y="${padding.top + 8}" fill="#c4b5fd" font-size="16" font-weight="900" text-anchor="end">Epsilon 0-1</text>
  ${history.length === 1 ? `
  <circle cx="${getX(0)}" cy="${getLossY(history[0].loss)}" r="7" fill="#fb7185" stroke="#ffe4e6" stroke-width="3"/>
  <circle cx="${getX(0)}" cy="${getEpsilonY(history[0].epsilon)}" r="7" fill="#8b5cf6" stroke="#ede9fe" stroke-width="3"/>` : `
  <path d="${toPath((index) => getLossY(history[index].loss))}" fill="none" stroke="url(#lossLine)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <path d="${toPath((index) => getEpsilonY(history[index].epsilon))}" fill="none" stroke="url(#epsilonLine)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>`}
  <circle cx="${getX(history.length - 1)}" cy="${getLossY(latest.loss)}" r="7" fill="#fb7185" stroke="#ffe4e6" stroke-width="3"/>
  <circle cx="${getX(history.length - 1)}" cy="${getEpsilonY(latest.epsilon)}" r="7" fill="#8b5cf6" stroke="#ede9fe" stroke-width="3"/>
  <rect x="58" y="${height - 34}" width="12" height="12" rx="6" fill="#fb7185"/><text x="78" y="${height - 23}" fill="#e2e8f0" font-size="14" font-weight="800">Loss</text>
  <rect x="142" y="${height - 34}" width="12" height="12" rx="6" fill="#8b5cf6"/><text x="162" y="${height - 23}" fill="#e2e8f0" font-size="14" font-weight="800">Epsilon</text>
</svg>`.trim();
}

function renderMetricsChartSvgWhite(runtime: ModelRuntime) {
  const history = runtime.trainingState.metricHistory ?? [];
  const width = 1180;
  const height = 680;
  const padding = { left: 82, right: 86, top: 172, bottom: 84 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const latest = history[history.length - 1];
  const lossMax = Math.max(0.001, ...history.map((point) => point.loss));
  const hasRecentWinRate = history.some((point) => typeof point.recentWinRate500 === "number");
  const getX = (index: number) => padding.left + (history.length <= 1 ? plotWidth : (index / (history.length - 1)) * plotWidth);
  const getLossY = (loss: number) => padding.top + plotHeight - (loss / lossMax) * plotHeight;
  const getEpsilonY = (epsilon: number) => padding.top + 18 + (1 - Math.max(0, Math.min(1, epsilon))) * (plotHeight - 36);
  const getRateY = (rate: number) => padding.top + plotHeight - (Math.max(0, Math.min(100, rate)) / 100) * plotHeight;
  const toPath = (getY: (index: number) => number) => history.map((_, index) => `${index === 0 ? "M" : "L"} ${getX(index).toFixed(2)} ${getY(index).toFixed(2)}`).join(" ");
  const firstEpisode = history[0]?.episode ?? 0;
  const lastEpisode = history[history.length - 1]?.episode ?? runtime.trainingState.episodes;
  const sampleText = history.length < runtime.trainingState.episodes
    ? `${history.length.toLocaleString()} sampled points / ${runtime.trainingState.episodes.toLocaleString()} episodes`
    : `${history.length.toLocaleString()} points / ${runtime.trainingState.episodes.toLocaleString()} episodes`;

  if (history.length === 0) {
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Training metrics">
  <rect width="${width}" height="${height}" rx="30" fill="#ffffff"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="${width / 2}" y="292" text-anchor="middle" fill="#0f172a" font-size="34" font-weight="900">尚無曲線資料</text>
  <text x="${width / 2}" y="338" text-anchor="middle" fill="#475569" font-size="20" font-weight="700">模型已完成，但 metricHistory 目前沒有可繪製的 episode 點。</text>
</svg>`.trim();
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Loss, Epsilon and recent win rate training metrics">
  <defs>
    <linearGradient id="lossLine" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#e11d48"/><stop offset="1" stop-color="#fb7185"/></linearGradient>
    <linearGradient id="epsilonLine" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#7c3aed"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>
    <linearGradient id="recentWinLine" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#059669"/><stop offset="1" stop-color="#10b981"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="30" fill="#ffffff"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="58" y="70" fill="#0f766e" font-size="16" font-weight="900" letter-spacing="5">TRAINING METRICS</text>
  <text x="${width - 58}" y="78" fill="#0f172a" font-size="18" font-weight="800" text-anchor="end">Episode ${lastEpisode.toLocaleString()}</text>
  <text x="${width - 58}" y="108" fill="#475569" font-size="15" font-weight="700" text-anchor="end">Loss ${latest.loss.toFixed(4)} / Epsilon ${latest.epsilon.toFixed(3)}${typeof latest.recentWinRate500 === "number" ? ` / Recent500 ${latest.recentWinRate500.toFixed(2)}%` : ""}</text>
  <text x="${padding.left}" y="${padding.top - 18}" fill="#475569" font-size="14" font-weight="800">${escapeXml(sampleText)}</text>
  ${[0, 0.25, 0.5, 0.75, 1].map((tick) => {
    const y = padding.top + tick * plotHeight;
    return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="#cbd5e1" stroke-opacity="0.86" stroke-dasharray="5 10"/>`;
  }).join("\n  ")}
  <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}" stroke="#94a3b8"/>
  <line x1="${padding.left}" x2="${padding.left}" y1="${padding.top}" y2="${padding.top + plotHeight}" stroke="#94a3b8"/>
  <line x1="${width - padding.right}" x2="${width - padding.right}" y1="${padding.top}" y2="${padding.top + plotHeight}" stroke="#94a3b8"/>
  <text x="${padding.left}" y="${height - 42}" fill="#475569" font-size="16" font-weight="800">Ep ${firstEpisode.toLocaleString()}</text>
  <text x="${width - padding.right}" y="${height - 42}" fill="#475569" font-size="16" font-weight="800" text-anchor="end">Ep ${lastEpisode.toLocaleString()}</text>
  <text x="34" y="${padding.top + 8}" fill="#be123c" font-size="16" font-weight="900">Loss</text>
  <text x="${width - 36}" y="${padding.top + 8}" fill="#4f46e5" font-size="16" font-weight="900" text-anchor="end">Epsilon / Recent%</text>
  ${history.length === 1 ? `
  <circle cx="${getX(0)}" cy="${getLossY(history[0].loss)}" r="7" fill="#fb7185" stroke="#ffe4e6" stroke-width="3"/>
  <circle cx="${getX(0)}" cy="${getEpsilonY(history[0].epsilon)}" r="7" fill="#8b5cf6" stroke="#ede9fe" stroke-width="3"/>` : `
  <path d="${toPath((index) => getLossY(history[index].loss))}" fill="none" stroke="url(#lossLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${toPath((index) => getEpsilonY(history[index].epsilon))}" fill="none" stroke="url(#epsilonLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  ${hasRecentWinRate ? `<path d="${toPath((index) => getRateY(history[index].recentWinRate500 ?? 0))}" fill="none" stroke="url(#recentWinLine)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ""}`}
  <circle cx="${getX(history.length - 1)}" cy="${getLossY(latest.loss)}" r="7" fill="#fb7185" stroke="#ffe4e6" stroke-width="3"/>
  <circle cx="${getX(history.length - 1)}" cy="${getEpsilonY(latest.epsilon)}" r="7" fill="#8b5cf6" stroke="#ede9fe" stroke-width="3"/>
  ${hasRecentWinRate ? `<circle cx="${getX(history.length - 1)}" cy="${getRateY(latest.recentWinRate500 ?? 0)}" r="7" fill="#10b981" stroke="#d1fae5" stroke-width="3"/>` : ""}
  <rect x="58" y="${height - 34}" width="12" height="12" rx="6" fill="#fb7185"/><text x="78" y="${height - 23}" fill="#334155" font-size="14" font-weight="800">Loss</text>
  <rect x="142" y="${height - 34}" width="12" height="12" rx="6" fill="#8b5cf6"/><text x="162" y="${height - 23}" fill="#334155" font-size="14" font-weight="800">Epsilon</text>
  ${hasRecentWinRate ? `<rect x="242" y="${height - 34}" width="12" height="12" rx="6" fill="#10b981"/><text x="262" y="${height - 23}" fill="#334155" font-size="14" font-weight="800">Recent 500 Win Rate</text>` : ""}
</svg>`.trim();
}

function metricsReportPayload(runtime: ModelRuntime) {
  syncRecordSummary(runtime);
  const summary = runtime.record.summary;
  const targetText = runtime.record.goalMode === "time" ? `${runtime.record.targetTrainingMinutes} 分鐘` : `${runtime.record.targetEpisodes.toLocaleString()} 場 / 勝率 ${runtime.record.targetWinRate}%`;
  return {
    chartSvg: renderMetricsChartSvgWhite(runtime),
    summary: {
      modelName: runtime.record.name,
      completed: isCompleted(runtime),
      episodes: runtime.trainingState.episodes,
      winRate: runtime.trainingState.winRate,
      recentResultCount: runtime.trainingState.recentResults?.length ?? 0,
      recentWinRate100: calculateRecentWinRate(runtime.trainingState.recentResults, 100),
      recentWinRate500: calculateRecentWinRate(runtime.trainingState.recentResults, 500),
      recentWinRate1000: calculateRecentWinRate(runtime.trainingState.recentResults, 1000),
      wins: runtime.trainingState.wins,
      losses: runtime.trainingState.losses,
      draws: runtime.trainingState.draws,
      averageTurns: runtime.trainingState.averageTurns,
      loss: runtime.trainingState.loss,
      epsilon: runtime.trainingState.epsilon,
      switchCount: runtime.trainingState.switchCount ?? 0,
      shieldCount: runtime.trainingState.shieldCount ?? 0,
      basicAttackCount: runtime.trainingState.basicAttackCount ?? 0,
      restCount: runtime.trainingState.restCount ?? 0,
      matchWinCount: runtime.trainingState.matchWinCount ?? 0,
      matchLossCount: runtime.trainingState.matchLossCount ?? 0,
      matchDrawCount: runtime.trainingState.matchDrawCount ?? 0,
      comebackWinCount: runtime.trainingState.comebackWinCount ?? 0,
      leadPickWinCount: runtime.trainingState.leadPickWinCount ?? 0,
      beneficialSwitchCount: runtime.trainingState.beneficialSwitchCount ?? 0,
      effectiveShieldCount: runtime.trainingState.effectiveShieldCount ?? 0,
      trainingSeconds: summary?.trainingSeconds ?? Math.floor(runtime.trainingSeconds),
      trainingDuration: formatDuration(summary?.trainingSeconds ?? Math.floor(runtime.trainingSeconds)),
      difficulty: runtime.record.difficulty,
      difficultyLabel: difficultyOptions[runtime.record.difficulty].label,
      goalMode: runtime.record.goalMode,
      targetEpisodes: runtime.record.targetEpisodes,
      targetWinRate: runtime.record.targetWinRate,
      targetTrainingMinutes: runtime.record.targetTrainingMinutes,
      targetText,
      updatedAt: summary?.updatedAt ?? nowIso(),
    },
  };
}

function updateStrategyWeight(weight: number, reward: number) {
  return Math.max(0.2, Math.min(3, weight + reward * 0.004));
}

function getStrategyCandidatePool(seed: number) {
  const pool = getBattleEnabledPokemon()
    .filter((pokemon) => pokemon.enabled_battle && pokemon.skill_ids.length > 0)
    .sort((a, b) => a.id - b.id);
  if (pool.length <= MATCH_STRATEGY_CANDIDATE_SIZE) return pool;
  const start = Math.abs(seed) % pool.length;
  return Array.from({ length: MATCH_STRATEGY_CANDIDATE_SIZE }, (_, index) => pool[(start + index) % pool.length]);
}

function pokemonLabel(pokemon: PokemonStats) {
  return pokemon.name_zh || pokemon.name;
}

function bestAttackAgainst(attacker: PokemonStats, defender: PokemonStats) {
  return getPokemonSkills(attacker)
    .filter((skill) => skill.category === "attack")
    .reduce((best, skill) => Math.max(best, skill.power * getTypeMultiplier(skill.type, defender.types)), 0);
}

function draftPickScore(candidate: PokemonStats, ownTeam: PokemonStats[], opponentTeam: PokemonStats[]) {
  const rolePenalty = ownTeam.some((pokemon) => pokemon.role === candidate.role) ? -10 : 8;
  const typeCoverageBonus = candidate.types.filter((type) => !ownTeam.some((pokemon) => pokemon.types.includes(type))).length * 5;
  const matchupBonus = opponentTeam.length === 0
    ? 0
    : opponentTeam.reduce((sum, opponent) => sum + bestAttackAgainst(candidate, opponent) - bestAttackAgainst(opponent, candidate) * 0.62, 0) / opponentTeam.length;
  return candidate.power * 0.045 + candidate.max_hp * 0.035 + candidate.speed * 0.05 + rolePenalty + typeCoverageBonus + matchupBonus * 0.08;
}

function selectBaselineDraftPick(candidates: PokemonStats[], unavailableIds: Set<number>, ownTeam: PokemonStats[], opponentTeam: PokemonStats[]) {
  const legal = candidates.filter((pokemon) => !unavailableIds.has(pokemon.id));
  if (legal.length === 0) return candidates[0];
  if (Math.random() < 0.12) return legal[Math.floor(Math.random() * legal.length)];
  return legal.reduce((best, pokemon) => (draftPickScore(pokemon, ownTeam, opponentTeam) > draftPickScore(best, ownTeam, opponentTeam) ? pokemon : best), legal[0]);
}

function selectBaselineLead(team: PokemonStats[], opponentLead?: PokemonStats) {
  if (team.length === 0) return 0;
  if (!opponentLead) return team.reduce((bestIndex, pokemon, index) => (pokemon.speed + pokemon.max_hp * 0.2 > team[bestIndex].speed + team[bestIndex].max_hp * 0.2 ? index : bestIndex), 0);
  return team.reduce((bestIndex, pokemon, index) => {
    const score = bestAttackAgainst(pokemon, opponentLead) - bestAttackAgainst(opponentLead, pokemon) * 0.65 + pokemon.speed * 0.05;
    const best = team[bestIndex];
    const bestScore = bestAttackAgainst(best, opponentLead) - bestAttackAgainst(opponentLead, best) * 0.65 + best.speed * 0.05;
    return score > bestScore ? index : bestIndex;
  }, 0);
}

async function runMatchStrategyEpisode(runtime: MatchStrategyRuntime, shouldStop?: () => boolean) {
  const seed = Date.now() + runtime.trainingState.episodes;
  const candidates = getStrategyCandidatePool(seed);
  const config = normalizeStrategyConfig(runtime.record.strategyConfig);
  const playerTeam: PokemonStats[] = [];
  const computerTeam: PokemonStats[] = [];
  const unavailableIds = new Set<number>();
  const picks: MatchStrategyDraftContext["picks"] = [];
  const memory: MatchStrategyEpisodeMemory[] = [];

  for (let pickTurn = 0; pickTurn < MATCH_STRATEGY_TEAM_SIZE * 2; pickTurn += 1) {
    const side = pickTurn % 2 === 0 ? "player" : "computer";
    if (side === "player") {
      const vector = createMatchStrategyVector({ candidates, playerTeam, computerTeam, currentPickSide: "player", pickTurn });
      const selectedIndex = runtime.strategyAgent.selectDraftPick(vector, candidates, unavailableIds);
      const selected = candidates[selectedIndex] ?? selectBaselineDraftPick(candidates, unavailableIds, playerTeam, computerTeam);
      playerTeam.push(selected);
      unavailableIds.add(selected.id);
      if (config.trainDraft) memory.push({ vector, outputIndexes: [selectedIndex] });
      picks.push({ side, pokemonId: selected.id, pokemonName: pokemonLabel(selected), turn: pickTurn + 1 });
    } else {
      const selected = selectBaselineDraftPick(candidates, unavailableIds, computerTeam, playerTeam);
      computerTeam.push(selected);
      unavailableIds.add(selected.id);
      picks.push({ side, pokemonId: selected.id, pokemonName: pokemonLabel(selected), turn: pickTurn + 1 });
    }
  }

  const computerLeadIndex = selectBaselineLead(computerTeam, playerTeam[0]);
  const leadVector = createMatchStrategyVector({ candidates, playerTeam, computerTeam, currentPickSide: "player", pickTurn: MATCH_STRATEGY_TEAM_SIZE * 2 });
  const playerLeadIndex = runtime.strategyAgent.selectLead(leadVector, playerTeam);
  if (config.trainLead) memory.push({ vector: leadVector, outputIndexes: [MATCH_STRATEGY_CANDIDATE_SIZE + playerLeadIndex] });

  const state = createAiBattleStateFromTeams({
    playerTeam,
    computerTeam,
    playerLeadIndex,
    computerLeadIndex,
  });
  const learningAgent = new LearningAgent();
  learningAgent.epsilon = 0.04;
  const battleVector = createMatchStrategyVector({ candidates, playerTeam, computerTeam, currentPickSide: "player", pickTurn: MATCH_STRATEGY_TEAM_SIZE * 2, state });
  const strategyDecision = runtime.strategyAgent.decideBattleStrategy(battleVector);
  strategyDecision.actionBias = Object.fromEntries(
    Object.entries(strategyDecision.actionBias).map(([action, value]) => [action, Number(value) * (config.actionBiasStrength / 0.12)]),
  ) as MatchStrategyDecision["actionBias"];
  if (config.trainMode) {
    memory.push({
      vector: battleVector,
      outputIndexes: [MATCH_STRATEGY_CANDIDATE_SIZE + MATCH_STRATEGY_TEAM_SIZE + strategyDecision.modeIndex, ...strategyDecision.actionBiasIndexes],
    });
  }
  const mode = strategyDecision.mode;
  const events: BattleReplayEvent[] = [];
  const initialOwnHp = state.participants.player.team.reduce((sum, card) => sum + card.currentHp, 0);
  const initialOpponentHp = state.participants.computer.team.reduce((sum, card) => sum + card.currentHp, 0);
  const comebackAttempt = initialOwnHp < initialOpponentHp * 0.92;
  const holdLeadAttempt = initialOwnHp > initialOpponentHp * 1.08;
  let earlyOwnHp = initialOwnHp;
  let earlyOpponentHp = initialOpponentHp;

  while (!state.winner && !state.isDraw && state.turnNumber <= AI_BATTLE_MAX_TURNS) {
    if (shouldStop?.()) return { aborted: true, events, mode, reward: 0, strategyLoss: 0, strategyEpsilon: runtime.strategyAgent.epsilon, comebackAttempt, holdLeadAttempt };
    const legalActions = getLegalActions(state);
    const action = state.turn === "player"
      ? learningAgent.selectAction(cloneBattleState(state), legalActions, strategyDecision)
      : RuleBasedAgent.selectAction(cloneBattleState(state), legalActions);
    const selectedAction = legalActions.some((legalAction) => JSON.stringify(legalAction) === JSON.stringify(action)) ? action : legalActions[0] ?? { type: "rest" as const };
    const result = stepBattle(state, selectedAction, AI_BATTLE_MAX_TURNS);
    Object.assign(state, result.state);
    events.push(result.event);
    if (state.turnNumber <= 5) {
      earlyOwnHp = state.participants.player.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
      earlyOpponentHp = state.participants.computer.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
    }
  }

  const finalOwnHp = state.participants.player.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
  const finalOpponentHp = state.participants.computer.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
  const hpMarginReward = Math.max(-24, Math.min(24, ((finalOwnHp - finalOpponentHp) / Math.max(1, initialOwnHp)) * 36));
  const won = state.winner === "player";
  const leadAdvantage = earlyOwnHp >= earlyOpponentHp;
  const draftAdvantage = finalOwnHp >= finalOpponentHp;
  const reward = (won ? 100 : state.isDraw ? -8 : -100) + hpMarginReward + (leadAdvantage ? 8 : -5) + (draftAdvantage ? 8 : -5) + (won && comebackAttempt ? 18 : 0) + (won && holdLeadAttempt ? 12 : 0);
  const strategyLoss = await runtime.strategyAgent.trainEpisode(memory, reward);
  const currentDraftContext: MatchStrategyDraftContext = {
    candidateIds: candidates.map((pokemon) => pokemon.id),
    candidateNames: candidates.map(pokemonLabel),
    picks,
    playerDraftIds: playerTeam.map((pokemon) => pokemon.id),
    computerDraftIds: computerTeam.map((pokemon) => pokemon.id),
    playerLeadId: playerTeam[playerLeadIndex]?.id,
    computerLeadId: computerTeam[computerLeadIndex]?.id,
  };
  return {
    aborted: false,
    winner: state.winner,
    isDraw: state.isDraw,
    events,
    mode,
    actionBias: strategyDecision.actionBias,
    reward,
    strategyLoss,
    strategyEpsilon: runtime.strategyAgent.epsilon,
    comebackAttempt,
    holdLeadAttempt,
    draftAdvantage,
    leadAdvantage,
    currentDraftContext,
  };
}

function reduceMatchStrategyState(
  previous: MatchStrategyTrainingState,
  result: Awaited<ReturnType<typeof runMatchStrategyEpisode>>,
): MatchStrategyTrainingState {
  if (result.aborted) return { ...previous, currentReplay: result.events, status: previous.status };
  const episodes = previous.episodes + 1;
  const won = result.winner === "player";
  const isDraw = Boolean(result.isDraw);
  const wins = previous.wins + (won ? 1 : 0);
  const losses = previous.losses + (result.winner && !won ? 1 : 0);
  const draws = previous.draws + (isDraw ? 1 : 0);
  const outcome: "win" | "loss" | "draw" = won ? "win" : isDraw ? "draw" : "loss";
  const recentResults = [...previous.recentResults, outcome].slice(-1000);
  const modeStats = { ...previous.strategyStats[result.mode] };
  modeStats.plays += 1;
  modeStats.wins += won ? 1 : 0;
  modeStats.losses += result.winner && !won ? 1 : 0;
  modeStats.draws += isDraw ? 1 : 0;
  modeStats.reward += result.reward;
  const strategyStats = { ...previous.strategyStats, [result.mode]: modeStats };
  const strategyWeights = {
    ...previous.strategyWeights,
    [result.mode]: updateStrategyWeight(previous.strategyWeights[result.mode], result.reward),
  };
  const averageReward = previous.averageReward + (result.reward - previous.averageReward) / episodes;
  const winRate = (wins / episodes) * 100;
  const metricHistory = [
    ...previous.metricHistory,
    { episode: episodes, winRate, recentWinRate500: calculateRecentWinRate(recentResults, 500), averageReward },
  ].slice(-720);
  return {
    ...previous,
    episodes,
    wins,
    losses,
    draws,
    winRate,
    averageReward,
    strategyLoss: result.strategyLoss ?? previous.strategyLoss,
    strategyEpsilon: result.strategyEpsilon ?? previous.strategyEpsilon,
    strategyWeights,
    strategyStats,
    draftAttempts: previous.draftAttempts + 1,
    draftWins: previous.draftWins + (result.draftAdvantage || won ? 1 : 0),
    leadAttempts: previous.leadAttempts + 1,
    leadWins: previous.leadWins + (result.leadAdvantage || won ? 1 : 0),
    comebackAttempts: previous.comebackAttempts + (result.comebackAttempt ? 1 : 0),
    comebackWins: previous.comebackWins + (result.comebackAttempt && won ? 1 : 0),
    holdLeadAttempts: previous.holdLeadAttempts + (result.holdLeadAttempt ? 1 : 0),
    holdLeadWins: previous.holdLeadWins + (result.holdLeadAttempt && won ? 1 : 0),
    recentResults,
    metricHistory,
    currentReplay: result.events,
    currentDraftContext: result.currentDraftContext,
    currentMode: result.mode,
    currentActionBias: result.actionBias ?? previous.currentActionBias,
  };
}

function renderStrategyMetricsChartSvg(runtime: MatchStrategyRuntime) {
  const history = runtime.trainingState.metricHistory;
  const width = 1180;
  const height = 680;
  const padding = { left: 82, right: 86, top: 150, bottom: 84 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const getX = (index: number) => padding.left + (history.length <= 1 ? plotWidth : (index / (history.length - 1)) * plotWidth);
  const getRateY = (rate: number) => padding.top + plotHeight - (Math.max(0, Math.min(100, rate)) / 100) * plotHeight;
  const toPath = (key: "winRate" | "recentWinRate500") => history.map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index).toFixed(2)} ${getRateY(point[key]).toFixed(2)}`).join(" ");
  const latest = history[history.length - 1];
  if (history.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="30" fill="#ffffff"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#0f172a" font-size="32" font-weight="900">尚無賽局策略訓練資料</text></svg>`;
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Match strategy metrics">
  <defs>
    <linearGradient id="winLine" x1="0" x2="1"><stop stop-color="#059669"/><stop offset="1" stop-color="#34d399"/></linearGradient>
    <linearGradient id="recentLine" x1="0" x2="1"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="30" fill="#ffffff"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#f8fafc" stroke="#cbd5e1"/>
  <text x="58" y="72" fill="#0f766e" font-size="16" font-weight="900" letter-spacing="5">MATCH STRATEGY</text>
  <text x="${width - 58}" y="78" fill="#0f172a" font-size="18" font-weight="800" text-anchor="end">Episode ${runtime.trainingState.episodes.toLocaleString()}</text>
  <text x="${width - 58}" y="108" fill="#475569" font-size="15" font-weight="700" text-anchor="end">Win ${latest.winRate.toFixed(2)}% / Recent500 ${latest.recentWinRate500.toFixed(2)}%</text>
  ${[0, 0.25, 0.5, 0.75, 1].map((tick) => {
    const y = padding.top + tick * plotHeight;
    return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="#cbd5e1" stroke-dasharray="5 10"/>`;
  }).join("\n  ")}
  <line x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}" stroke="#94a3b8"/>
  <path d="${toPath("winRate")}" fill="none" stroke="url(#winLine)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${toPath("recentWinRate500")}" fill="none" stroke="url(#recentLine)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="58" y="${height - 38}" width="12" height="12" rx="6" fill="#10b981"/><text x="78" y="${height - 27}" fill="#0f172a" font-size="14" font-weight="800">Total Win Rate</text>
  <rect x="202" y="${height - 38}" width="12" height="12" rx="6" fill="#38bdf8"/><text x="222" y="${height - 27}" fill="#0f172a" font-size="14" font-weight="800">Recent 500</text>
</svg>`.trim();
}

function strategyMetricsReportPayload(runtime: MatchStrategyRuntime) {
  syncStrategyRecordSummary(runtime);
  const summary = runtime.record.summary ?? toStrategySummary(runtime);
  return {
    chartSvg: renderStrategyMetricsChartSvg(runtime),
    summary: {
      modelName: runtime.record.name,
      completed: isStrategyCompleted(runtime),
      episodes: runtime.trainingState.episodes,
      winRate: runtime.trainingState.winRate,
      recentResultCount: runtime.trainingState.recentResults.length,
      recentWinRate500: calculateRecentWinRate(runtime.trainingState.recentResults, 500),
      wins: runtime.trainingState.wins,
      losses: runtime.trainingState.losses,
      draws: runtime.trainingState.draws,
      averageReward: runtime.trainingState.averageReward,
      strategyLoss: summary.strategyLoss,
      strategyEpsilon: summary.strategyEpsilon,
      draftWinRate: summary.draftWinRate,
      leadWinRate: summary.leadWinRate,
      aggressiveWinRate: summary.aggressiveWinRate,
      balancedWinRate: summary.balancedWinRate,
      defensiveWinRate: summary.defensiveWinRate,
      comebackWinRate: summary.comebackWinRate,
      holdLeadWinRate: summary.holdLeadWinRate,
      trainingSeconds: summary.trainingSeconds,
      trainingDuration: formatDuration(summary.trainingSeconds),
      targetEpisodes: runtime.record.targetEpisodes,
      updatedAt: summary.updatedAt,
    },
  };
}

async function persistRuntime(runtime: ModelRuntime) {
  syncRecordSummary(runtime);
  await mkdir(modelDir(runtime.record.id), { recursive: true });
  const persisted: PersistedModel = {
    modelVersion: "battle-tactics-v3-rules",
    model: runtime.record,
    trainingState: runtime.trainingState,
    epsilon: runtime.learningAgent.epsilon,
    trainingSeconds: Math.floor(runtime.trainingSeconds),
    savedAt: nowIso(),
    currentReplay: runtime.trainingState.currentReplay,
    replayBuffer: runtime.learningAgent.exportReplayBuffer(),
  };
  await writeFile(metadataPath(runtime.record.id), JSON.stringify(persisted, null, 2), "utf-8");
  await writeFile(summaryPath(runtime.record.id), JSON.stringify(runtime.record.summary, null, 2), "utf-8");
  await writeFile(replayPath(runtime.record.id), JSON.stringify(runtime.trainingState.currentReplay, null, 2), "utf-8");
}

async function persistStrategyRuntime(runtime: MatchStrategyRuntime) {
  syncStrategyRecordSummary(runtime);
  await mkdir(strategyDir(runtime.record.id), { recursive: true });
  const persisted: PersistedMatchStrategy = {
    modelVersion: MATCH_STRATEGY_MODEL_VERSION,
    model: runtime.record,
    trainingState: runtime.trainingState,
    epsilon: runtime.strategyAgent.epsilon,
    trainingSeconds: Math.floor(runtime.trainingSeconds),
    savedAt: nowIso(),
  };
  await writeFile(strategyMetadataPath(runtime.record.id), JSON.stringify(persisted, null, 2), "utf-8");
  await writeFile(strategySummaryPath(runtime.record.id), JSON.stringify(runtime.record.summary, null, 2), "utf-8");
  await writeFile(strategyReplayPath(runtime.record.id), JSON.stringify(runtime.trainingState.currentReplay, null, 2), "utf-8");
}

async function saveStrategyWeights(runtime: MatchStrategyRuntime) {
  await mkdir(strategyDir(runtime.record.id), { recursive: true });
  const artifacts = await runtime.strategyAgent.exportArtifacts();
  await writeFile(
    strategyModelJsonPath(runtime.record.id),
    JSON.stringify({ modelTopology: artifacts.modelTopology, weightSpecs: artifacts.weightSpecs ?? [] }, null, 2),
    "utf-8",
  );
  await writeFile(strategyWeightsPath(runtime.record.id), Buffer.from(artifacts.weightData ?? new ArrayBuffer(0)));
  runtime.hasSavedModel = true;
  runtime.saveStatus = "saved";
}

async function loadStrategyWeights(runtime: MatchStrategyRuntime) {
  if (!existsSync(strategyModelJsonPath(runtime.record.id)) || !existsSync(strategyWeightsPath(runtime.record.id))) return false;
  const modelJson = JSON.parse(await readFile(strategyModelJsonPath(runtime.record.id), "utf-8")) as { modelTopology: unknown; weightSpecs: unknown[] };
  const weightData = toArrayBuffer(await readFile(strategyWeightsPath(runtime.record.id)));
  try {
    await runtime.strategyAgent.importArtifacts({ modelTopology: modelJson.modelTopology, weightSpecs: modelJson.weightSpecs, weightData });
  } catch (error) {
    console.warn(`[training-server] ${runtime.record.name} 賽局策略模型載入失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    runtime.hasSavedModel = false;
    runtime.saveStatus = "failed";
    return false;
  }
  runtime.hasSavedModel = true;
  runtime.saveStatus = "loaded";
  return true;
}

async function saveModelWeights(runtime: ModelRuntime) {
  await mkdir(modelDir(runtime.record.id), { recursive: true });
  const artifacts = await runtime.learningAgent.exportArtifacts();
  await writeFile(
    modelJsonPath(runtime.record.id),
    JSON.stringify({ modelTopology: artifacts.modelTopology, weightSpecs: artifacts.weightSpecs ?? [] }, null, 2),
    "utf-8",
  );
  await writeFile(weightsPath(runtime.record.id), Buffer.from(artifacts.weightData ?? new ArrayBuffer(0)));
  runtime.hasSavedModel = true;
  runtime.saveStatus = "saved";
}

async function loadModelWeights(runtime: ModelRuntime) {
  if (!existsSync(modelJsonPath(runtime.record.id)) || !existsSync(weightsPath(runtime.record.id))) return false;
  const modelJson = JSON.parse(await readFile(modelJsonPath(runtime.record.id), "utf-8")) as { modelTopology: unknown; weightSpecs: unknown[] };
  const weightData = toArrayBuffer(await readFile(weightsPath(runtime.record.id)));
  try {
    await runtime.learningAgent.importArtifacts({ modelTopology: modelJson.modelTopology, weightSpecs: modelJson.weightSpecs, weightData });
  } catch (error) {
    console.warn(`[training-server] ${runtime.record.name} 權重載入略過：${error instanceof Error ? error.message : "未知錯誤"}`);
    runtime.hasSavedModel = false;
    runtime.saveStatus = "failed";
    return false;
  }
  runtime.hasSavedModel = true;
  runtime.saveStatus = "loaded";
  return true;
}

async function copyModelWeights(source: ModelRuntime, target: ModelRuntime) {
  if (!existsSync(modelJsonPath(source.record.id)) || !existsSync(weightsPath(source.record.id))) {
    await saveModelWeights(source);
  }
  await mkdir(modelDir(target.record.id), { recursive: true });
  await copyFile(modelJsonPath(source.record.id), modelJsonPath(target.record.id));
  await copyFile(weightsPath(source.record.id), weightsPath(target.record.id));
  target.hasSavedModel = true;
  target.saveStatus = "loaded";
  await loadModelWeights(target);
}

function createRuntime(record: TrainingModelRecord, state = createInitialTrainingState(), trainingSeconds = 0, epsilon = 0.85): ModelRuntime {
  const learningAgent = new LearningAgent();
  learningAgent.epsilon = epsilon;
  const runtime: ModelRuntime = {
    record,
    learningAgent,
    trainingState: state,
    trainingSeconds,
    training: false,
    saving: false,
    loading: false,
    hasSavedModel: existsSync(modelJsonPath(record.id)) && existsSync(weightsPath(record.id)),
    saveStatus: "unsaved",
    runningEpisode: false,
    controlVersion: 0,
    clients: new Set(),
  };
  syncRecordSummary(runtime);
  return runtime;
}

function createStrategyRuntime(record: MatchStrategyModelRecord, state = createInitialMatchStrategyState(), trainingSeconds = 0): MatchStrategyRuntime {
  record.strategyConfig = normalizeStrategyConfig(record.strategyConfig);
  const strategyAgent = new MatchStrategyNetwork();
  strategyAgent.epsilon = state.strategyEpsilon ?? strategyAgent.epsilon;
  const runtime: MatchStrategyRuntime = {
    record,
    strategyAgent,
    trainingState: state,
    trainingSeconds,
    training: false,
    saving: false,
    loading: false,
    hasSavedModel: existsSync(strategyModelJsonPath(record.id)) && existsSync(strategyWeightsPath(record.id)),
    saveStatus: "unsaved",
    runningEpisode: false,
    controlVersion: 0,
    clients: new Set(),
  };
  syncStrategyRecordSummary(runtime);
  return runtime;
}

async function loadPersistedModels() {
  await mkdir(DATA_DIR, { recursive: true });
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = metadataPath(entry.name);
    if (!existsSync(file)) continue;
    try {
      const persisted = JSON.parse(await readFile(file, "utf-8")) as PersistedModel;
      const runtime = createRuntime(
        persisted.model,
        normalizeTrainingState({ ...persisted.trainingState, status: "paused", currentReplay: persisted.currentReplay ?? persisted.trainingState.currentReplay ?? [] }),
        persisted.trainingSeconds ?? persisted.model.summary?.trainingSeconds ?? 0,
        persisted.epsilon ?? persisted.trainingState.epsilon,
      );
      runtime.trainingState.epsilon = runtime.learningAgent.epsilon;
      runtime.learningAgent.importReplayBuffer(persisted.replayBuffer);
      await loadModelWeights(runtime);
      models.set(runtime.record.id, runtime);
    } catch (error) {
      console.error(`[training] 無法載入模型 ${entry.name}:`, error);
    }
  }
}

async function loadPersistedStrategies() {
  await mkdir(STRATEGY_DATA_DIR, { recursive: true });
  const entries = await readdir(STRATEGY_DATA_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = strategyMetadataPath(entry.name);
    if (!existsSync(file)) continue;
    try {
      const persisted = JSON.parse(await readFile(file, "utf-8")) as PersistedMatchStrategy;
      const runtime = createStrategyRuntime(
        persisted.model,
        { ...createInitialMatchStrategyState(), ...persisted.trainingState, strategyEpsilon: persisted.epsilon ?? persisted.trainingState.strategyEpsilon ?? 0.18, status: "paused", currentReplay: persisted.trainingState.currentReplay ?? [] },
        persisted.trainingSeconds ?? persisted.model.summary?.trainingSeconds ?? 0,
      );
      runtime.strategyAgent.epsilon = persisted.epsilon ?? runtime.trainingState.strategyEpsilon;
      await loadStrategyWeights(runtime);
      matchStrategies.set(runtime.record.id, runtime);
    } catch (error) {
      console.error(`[training] 無法載入賽局策略 ${entry.name}:`, error);
    }
  }
}

function tickTrainingSeconds(runtime: ModelRuntime) {
  if (!runtime.lastTickAt) {
    runtime.lastTickAt = Date.now();
    return;
  }
  const now = Date.now();
  runtime.trainingSeconds += Math.max(0, (now - runtime.lastTickAt) / 1000);
  runtime.lastTickAt = now;
}

function tickStrategyTrainingSeconds(runtime: MatchStrategyRuntime) {
  if (!runtime.lastTickAt) {
    runtime.lastTickAt = Date.now();
    return;
  }
  const now = Date.now();
  runtime.trainingSeconds += Math.max(0, (now - runtime.lastTickAt) / 1000);
  runtime.lastTickAt = now;
}

async function runNextEpisode(runtime: ModelRuntime) {
  if (!runtime.training || runtime.runningEpisode) return;
  runtime.runningEpisode = true;
  const runVersion = runtime.controlVersion;
  try {
    tickTrainingSeconds(runtime);
    const episodeCount = runtime.trainingState.episodes;
    const result = await runTrainingEpisode({
      learningAgent: runtime.learningAgent,
      opponentAgent: episodeCount < 50 ? RandomAgent : RuleBasedAgent,
      learningSide: "player",
      seed: Date.now() + episodeCount,
      playerWins: runtime.trainingState.wins,
      computerWins: runtime.trainingState.losses,
      round: ((runtime.trainingState.episodes % 3) + 1) as 1 | 2 | 3,
      shouldStop: () => !runtime.training || runtime.controlVersion !== runVersion,
    });

    tickTrainingSeconds(runtime);
    if (result.aborted || !runtime.training || runtime.controlVersion !== runVersion) {
      const isStaleEpisode = runtime.controlVersion !== runVersion;
      if (!isStaleEpisode) runtime.training = false;
      runtime.trainingState = {
        ...runtime.trainingState,
        status: runtime.training ? "training" : "paused",
        currentReplay: [],
      };
      await persistRuntime(runtime);
      broadcast(runtime, runtime.training ? "progress" : "paused");
      return;
    }

    runtime.trainingState = { ...reduceTrainingState(runtime.trainingState, result, runtime.learningAgent.epsilon, "player"), status: runtime.training ? "training" : "paused" };
    syncRecordSummary(runtime);
    await persistRuntime(runtime);
    if (runtime.trainingState.episodes > 0 && runtime.trainingState.episodes % 25 === 0) await saveModelWeights(runtime);
    broadcast(runtime, "progress");

    if (isCompleted(runtime)) {
      runtime.training = false;
      runtime.trainingState = { ...runtime.trainingState, status: "paused" };
      await saveModelWeights(runtime);
      await persistRuntime(runtime);
      broadcast(runtime, "completed");
    }
  } catch (error) {
    runtime.training = false;
    runtime.saveStatus = "failed";
    runtime.trainingState = { ...runtime.trainingState, status: "paused" };
    broadcast(runtime, "error");
    console.error(`[training] ${runtime.record.id} 訓練失敗:`, error);
  } finally {
    runtime.runningEpisode = false;
    if (runtime.training) setTimeout(() => void runNextEpisode(runtime), 20);
  }
}

async function runNextStrategyEpisode(runtime: MatchStrategyRuntime) {
  if (!runtime.training || runtime.runningEpisode) return;
  runtime.runningEpisode = true;
  const runVersion = runtime.controlVersion;
  try {
    tickStrategyTrainingSeconds(runtime);
    const result = await runMatchStrategyEpisode(runtime, () => !runtime.training || runtime.controlVersion !== runVersion);
    tickStrategyTrainingSeconds(runtime);
    if (result.aborted || !runtime.training || runtime.controlVersion !== runVersion) {
      const isStaleEpisode = runtime.controlVersion !== runVersion;
      if (!isStaleEpisode) runtime.training = false;
      runtime.trainingState = { ...runtime.trainingState, status: runtime.training ? "training" : "paused", currentReplay: result.events };
      await persistStrategyRuntime(runtime);
      broadcastStrategy(runtime, runtime.training ? "progress" : "paused");
      return;
    }

    runtime.trainingState = { ...reduceMatchStrategyState(runtime.trainingState, result), status: runtime.training ? "training" : "paused" };
    syncStrategyRecordSummary(runtime);
    await persistStrategyRuntime(runtime);
    if (runtime.trainingState.episodes > 0 && runtime.trainingState.episodes % 25 === 0) await saveStrategyWeights(runtime);
    broadcastStrategy(runtime, "progress");

    if (isStrategyCompleted(runtime)) {
      runtime.training = false;
      runtime.trainingState = { ...runtime.trainingState, status: "paused" };
      await saveStrategyWeights(runtime);
      await persistStrategyRuntime(runtime);
      broadcastStrategy(runtime, "completed");
    }
  } catch (error) {
    runtime.training = false;
    runtime.saveStatus = "failed";
    runtime.trainingState = { ...runtime.trainingState, status: "paused" };
    broadcastStrategy(runtime, "error");
    console.error(`[training] ${runtime.record.id} 賽局策略訓練失敗:`, error);
  } finally {
    runtime.runningEpisode = false;
    if (runtime.training) setTimeout(() => void runNextStrategyEpisode(runtime), 20);
  }
}

async function parseBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function getModelFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/training\/models\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return undefined;
  return { id: decodeURIComponent(match[1]), action: match[2] };
}

function getStrategyFromPath(pathname: string) {
  const match = pathname.match(/^\/api\/training\/match-strategies\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return undefined;
  return { id: decodeURIComponent(match[1]), action: match[2] };
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, models: models.size, matchStrategies: matchStrategies.size });

  if (url.pathname === "/api/training/models" && req.method === "GET") {
    return json(res, 200, { models: listModelsByCreatedAtAsc() });
  }

  if (url.pathname === "/api/training/match-strategies" && req.method === "GET") {
    return json(res, 200, { models: listStrategiesByCreatedAtAsc() });
  }

  if (url.pathname === "/api/training/match-strategies" && req.method === "POST") {
    const body = (await parseBody(req)) as Partial<MatchStrategyModelRecord>;
    const id = body.id ?? createModelId("match-strategy");
    const record: MatchStrategyModelRecord = {
      id,
      name: body.name?.trim() || `MatchStrategyAgent ${matchStrategies.size + 1}`,
      description: "單獨訓練 aggressive / balanced / defensive 策略層。",
      targetEpisodes: Number(body.targetEpisodes ?? 300),
      strategyConfig: normalizeStrategyConfig(body.strategyConfig),
      createdAt: nowIso(),
    };
    const runtime = createStrategyRuntime(record);
    matchStrategies.set(record.id, runtime);
    await persistStrategyRuntime(runtime);
    return json(res, 201, strategyPayload(runtime));
  }

  if (url.pathname === "/api/training/models" && req.method === "POST") {
    const body = (await parseBody(req)) as Partial<TrainingModelRecord>;
    const difficulty = body.difficulty ?? "normal";
    const id = body.id ?? `battle-tactics-${Date.now()}`;
    const record: TrainingModelRecord = {
      id,
      name: body.name?.trim() || `BattleTacticsAgent ${models.size + 1}`,
      description: `${difficultyOptions[difficulty].label}難度，目標以${body.goalMode === "time" ? "訓練時間" : "勝率與最低場次"}完成。`,
      difficulty,
      goalMode: body.goalMode ?? "winRate",
      targetTrainingMinutes: Number(body.targetTrainingMinutes ?? 30),
      targetWinRate: Number(body.targetWinRate ?? 65),
      targetEpisodes: difficultyOptions[difficulty].targetEpisodes,
      createdAt: nowIso(),
    };
    const runtime = createRuntime(record);
    models.set(record.id, runtime);
    await persistRuntime(runtime);
    return json(res, 201, runtimePayload(runtime));
  }

  const strategyTarget = getStrategyFromPath(url.pathname);
  if (strategyTarget) {
    const runtime = matchStrategies.get(strategyTarget.id);
    if (!runtime) return notFound(res);

    if (!strategyTarget.action && req.method === "GET") return json(res, 200, strategyPayload(runtime));

    if (!strategyTarget.action && req.method === "PATCH") {
      const body = (await parseBody(req)) as Partial<MatchStrategyModelRecord>;
      const nextName = body.name?.trim();
      if (nextName) runtime.record.name = nextName;
      if (typeof body.targetEpisodes === "number" && Number.isFinite(body.targetEpisodes)) {
        runtime.record.targetEpisodes = Math.max(1, Math.floor(body.targetEpisodes));
      }
      if (body.strategyConfig) runtime.record.strategyConfig = normalizeStrategyConfig(body.strategyConfig);
      syncStrategyRecordSummary(runtime);
      await persistStrategyRuntime(runtime);
      broadcastStrategy(runtime, "updated");
      return json(res, 200, strategyPayload(runtime));
    }

    if (!strategyTarget.action && req.method === "DELETE") {
      runtime.training = false;
      runtime.controlVersion += 1;
      matchStrategies.delete(runtime.record.id);
      await rm(strategyDir(runtime.record.id), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }

    if (strategyTarget.action === "events" && req.method === "GET") {
      res.writeHead(200, {
        ...WRITE_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      runtime.clients.add(res);
      res.write(`event: ready\ndata: ${JSON.stringify(strategyPayload(runtime))}\n\n`);
      req.on("close", () => runtime.clients.delete(res));
      return;
    }

    if (strategyTarget.action === "metrics-report" && req.method === "GET") {
      syncStrategyRecordSummary(runtime);
      if (!isStrategyCompleted(runtime)) return json(res, 409, { error: "策略訓練尚未完成，完成目標 episode 後才能產生曲線報表。" });
      return json(res, 200, strategyMetricsReportPayload(runtime));
    }

    if (strategyTarget.action === "clone" && req.method === "POST") {
      const body = (await parseBody(req)) as Partial<MatchStrategyModelRecord>;
      const id = createModelId("match-strategy-clone");
      const record: MatchStrategyModelRecord = {
        ...cloneJson(runtime.record),
        id,
        name: body.name?.trim() || `${runtime.record.name} 複製`,
        description: "由既有賽局策略模型複製，沿用策略權重與統計資料。",
        targetEpisodes: Number(body.targetEpisodes ?? runtime.record.targetEpisodes),
        strategyConfig: normalizeStrategyConfig(body.strategyConfig ?? runtime.record.strategyConfig),
        createdAt: nowIso(),
        manuallyCompleted: false,
        completedAt: undefined,
      };
      const clonedRuntime = createStrategyRuntime(
        record,
        { ...cloneJson(runtime.trainingState), status: "paused", currentReplay: [] },
        runtime.trainingSeconds,
      );
      if (existsSync(strategyModelJsonPath(runtime.record.id)) && existsSync(strategyWeightsPath(runtime.record.id))) {
        await mkdir(strategyDir(clonedRuntime.record.id), { recursive: true });
        await copyFile(strategyModelJsonPath(runtime.record.id), strategyModelJsonPath(clonedRuntime.record.id));
        await copyFile(strategyWeightsPath(runtime.record.id), strategyWeightsPath(clonedRuntime.record.id));
        await loadStrategyWeights(clonedRuntime);
      }
      matchStrategies.set(record.id, clonedRuntime);
      await persistStrategyRuntime(clonedRuntime);
      return json(res, 201, strategyPayload(clonedRuntime));
    }

    if (strategyTarget.action === "start" && req.method === "POST") {
      if (isStrategyCompleted(runtime)) {
        runtime.training = false;
        runtime.trainingState = { ...runtime.trainingState, status: "paused" };
        await persistStrategyRuntime(runtime);
        broadcastStrategy(runtime, "completed");
        return json(res, 200, strategyPayload(runtime));
      }
      if (!runtime.training) {
        runtime.training = true;
        runtime.controlVersion += 1;
        runtime.lastTickAt = Date.now();
        runtime.trainingState = { ...runtime.trainingState, status: "training" };
        broadcastStrategy(runtime, "progress");
        void runNextStrategyEpisode(runtime);
      }
      return json(res, 200, strategyPayload(runtime));
    }

    if (strategyTarget.action === "pause" && req.method === "POST") {
      runtime.training = false;
      runtime.controlVersion += 1;
      tickStrategyTrainingSeconds(runtime);
      runtime.trainingState = { ...runtime.trainingState, status: "paused", currentReplay: [] };
      runtime.hasSavedModel = true;
      runtime.saveStatus = "saved";
      await persistStrategyRuntime(runtime);
      broadcastStrategy(runtime, "paused");
      return json(res, 200, strategyPayload(runtime));
    }

    if (strategyTarget.action === "reset" && req.method === "POST") {
      runtime.training = false;
      runtime.controlVersion += 1;
      runtime.record.manuallyCompleted = false;
      runtime.record.completedAt = undefined;
      runtime.trainingState = createInitialMatchStrategyState();
      runtime.strategyAgent.reset();
      runtime.trainingSeconds = 0;
      runtime.lastTickAt = undefined;
      runtime.hasSavedModel = false;
      runtime.saveStatus = "unsaved";
      await persistStrategyRuntime(runtime);
      broadcastStrategy(runtime, "reset");
      return json(res, 200, strategyPayload(runtime));
    }

    if (strategyTarget.action === "save" && req.method === "POST") {
      runtime.training = false;
      runtime.controlVersion += 1;
      tickStrategyTrainingSeconds(runtime);
      runtime.trainingState = { ...runtime.trainingState, status: "paused", currentReplay: [] };
      runtime.record.manuallyCompleted = true;
      runtime.record.completedAt = nowIso();
      runtime.saving = true;
      broadcastStrategy(runtime, "progress");
      try {
        await saveStrategyWeights(runtime);
        await persistStrategyRuntime(runtime);
        runtime.saving = false;
        broadcastStrategy(runtime, "completed");
        return json(res, 200, strategyPayload(runtime));
      } catch (error) {
        runtime.saving = false;
        runtime.saveStatus = "failed";
        broadcastStrategy(runtime, "error");
        return json(res, 500, { error: error instanceof Error ? error.message : "策略模型保存失敗。" });
      }
    }

    if (strategyTarget.action === "load" && req.method === "POST") {
      runtime.loading = true;
      broadcastStrategy(runtime, "progress");
      try {
        if (!existsSync(strategyMetadataPath(runtime.record.id))) {
          runtime.loading = false;
          return json(res, 404, { error: "找不到已保存的策略模型。" });
        }
        const persisted = JSON.parse(await readFile(strategyMetadataPath(runtime.record.id), "utf-8")) as PersistedMatchStrategy;
        runtime.record = persisted.model;
        runtime.trainingState = { ...createInitialMatchStrategyState(), ...persisted.trainingState, strategyEpsilon: persisted.epsilon ?? persisted.trainingState.strategyEpsilon ?? 0.18, status: "paused", currentReplay: persisted.trainingState.currentReplay ?? [] };
        runtime.strategyAgent.epsilon = persisted.epsilon ?? runtime.trainingState.strategyEpsilon;
        await loadStrategyWeights(runtime);
        runtime.trainingSeconds = persisted.trainingSeconds ?? persisted.model.summary?.trainingSeconds ?? 0;
        runtime.loading = false;
        await persistStrategyRuntime(runtime);
        broadcastStrategy(runtime, "loaded");
        return json(res, 200, strategyPayload(runtime));
      } catch (error) {
        runtime.loading = false;
        runtime.saveStatus = "failed";
        broadcastStrategy(runtime, "error");
        return json(res, 500, { error: error instanceof Error ? error.message : "策略模型載入失敗。" });
      }
    }

    return notFound(res);
  }

  const target = getModelFromPath(url.pathname);
  if (!target) return notFound(res);
  const runtime = models.get(target.id);
  if (!runtime) return notFound(res);

  if (!target.action && req.method === "GET") return json(res, 200, runtimePayload(runtime));

  if (!target.action && req.method === "PATCH") {
    const body = (await parseBody(req)) as UpdateModelRequest;
    const nextName = body.name?.trim();
    if (nextName) runtime.record.name = nextName;
    if (body.difficulty && body.difficulty in difficultyOptions) {
      runtime.record.difficulty = body.difficulty;
      runtime.record.targetEpisodes = difficultyOptions[body.difficulty].targetEpisodes;
    }
    syncRecordSummary(runtime);
    await persistRuntime(runtime);
    broadcast(runtime, "updated");
    return json(res, 200, runtimePayload(runtime));
  }

  if (!target.action && req.method === "DELETE") {
    runtime.training = false;
    models.delete(runtime.record.id);
    await rm(modelDir(runtime.record.id), { recursive: true, force: true });
    return json(res, 200, { ok: true });
  }

  if (target.action === "events" && req.method === "GET") {
    res.writeHead(200, {
      ...WRITE_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    runtime.clients.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify(runtimePayload(runtime))}\n\n`);
    req.on("close", () => runtime.clients.delete(res));
    return;
  }

  if (target.action === "metrics-report" && req.method === "GET") {
    syncRecordSummary(runtime);
    if (!isCompleted(runtime)) return json(res, 409, { error: "模型尚未達成訓練目標，完成後才能查看曲線圖報告。" });
    return json(res, 200, metricsReportPayload(runtime));
  }

  if (target.action === "artifacts" && req.method === "GET") {
    if (!existsSync(modelJsonPath(runtime.record.id)) || !existsSync(weightsPath(runtime.record.id))) {
      return json(res, 404, { error: "尚未找到已保存的模型權重。" });
    }
    const modelJson = JSON.parse(await readFile(modelJsonPath(runtime.record.id), "utf-8")) as { modelTopology: unknown; weightSpecs: unknown[] };
    const weightData = await readFile(weightsPath(runtime.record.id));
    return json(res, 200, {
      modelId: runtime.record.id,
      modelName: runtime.record.name,
      difficulty: runtime.record.difficulty,
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightSpecs,
      weightDataBase64: weightData.toString("base64"),
    });
  }

  if (target.action === "clone" && req.method === "POST") {
    syncRecordSummary(runtime);
    if (!isCompleted(runtime)) return json(res, 409, { error: "模型尚未完成訓練，完成後才能複製續訓。" });

    const body = (await parseBody(req)) as CloneModelRequest;
    const difficulty = body.difficulty ?? runtime.record.difficulty;
    const goalMode = body.goalMode ?? "winRate";
    const id = createModelId("battle-tactics-clone");
    const targetWinRate = Number(body.targetWinRate ?? Math.ceil(runtime.record.summary?.winRate ?? runtime.record.targetWinRate));
    const targetTrainingMinutes = Number(body.targetTrainingMinutes ?? runtime.record.targetTrainingMinutes);
    const record: TrainingModelRecord = {
      ...cloneJson(runtime.record),
      id,
      name: body.name?.trim() || `${runtime.record.name} 複本`,
      description: `${runtime.record.name} 的完整分支續訓模型，保留原權重、統計與 replay buffer，目標可重新調整。`,
      difficulty,
      goalMode,
      targetTrainingMinutes,
      targetWinRate,
      targetEpisodes: difficultyOptions[difficulty].targetEpisodes,
      createdAt: nowIso(),
      manuallyCompleted: false,
      completedAt: undefined,
    };
    const clonedRuntime = createRuntime(
      record,
      { ...cloneJson(runtime.trainingState), status: "paused", currentReplay: [] },
      runtime.trainingSeconds,
      runtime.learningAgent.epsilon,
    );
    clonedRuntime.learningAgent.importReplayBuffer(runtime.learningAgent.exportReplayBuffer());
    await copyModelWeights(runtime, clonedRuntime);
    syncRecordSummary(clonedRuntime);
    models.set(record.id, clonedRuntime);
    await persistRuntime(clonedRuntime);
    return json(res, 201, runtimePayload(clonedRuntime));
  }

  if (target.action === "start" && req.method === "POST") {
    if (isCompleted(runtime)) {
      runtime.training = false;
      runtime.trainingState = { ...runtime.trainingState, status: "paused" };
      await persistRuntime(runtime);
      broadcast(runtime, "completed");
      return json(res, 200, runtimePayload(runtime));
    }
    if (!runtime.training) {
      runtime.training = true;
      runtime.controlVersion += 1;
      runtime.lastTickAt = Date.now();
      runtime.trainingState = { ...runtime.trainingState, status: "training" };
      broadcast(runtime, "progress");
      void runNextEpisode(runtime);
    }
    return json(res, 200, runtimePayload(runtime));
  }

  if (target.action === "pause" && req.method === "POST") {
    runtime.training = false;
    runtime.controlVersion += 1;
    tickTrainingSeconds(runtime);
    runtime.trainingState = { ...runtime.trainingState, status: "paused", currentReplay: [] };
    await saveModelWeights(runtime);
    await persistRuntime(runtime);
    broadcast(runtime, "paused");
    return json(res, 200, runtimePayload(runtime));
  }

  if (target.action === "reset" && req.method === "POST") {
    runtime.training = false;
    runtime.controlVersion += 1;
    runtime.record.manuallyCompleted = false;
    runtime.record.completedAt = undefined;
    runtime.learningAgent.reset();
    runtime.trainingState = createInitialTrainingState();
    runtime.trainingSeconds = 0;
    runtime.lastTickAt = undefined;
    runtime.saveStatus = "unsaved";
    await persistRuntime(runtime);
    broadcast(runtime, "reset");
    return json(res, 200, runtimePayload(runtime));
  }

  if (target.action === "save" && req.method === "POST") {
    runtime.training = false;
    runtime.controlVersion += 1;
    tickTrainingSeconds(runtime);
    runtime.trainingState = { ...runtime.trainingState, status: "paused", currentReplay: [] };
    runtime.record.manuallyCompleted = true;
    runtime.record.completedAt = nowIso();
    runtime.saving = true;
    broadcast(runtime, "progress");
    try {
      await saveModelWeights(runtime);
      await persistRuntime(runtime);
      runtime.saving = false;
      broadcast(runtime, "completed");
      return json(res, 200, runtimePayload(runtime));
    } catch (error) {
      runtime.saving = false;
      runtime.saveStatus = "failed";
      broadcast(runtime, "error");
      return json(res, 500, { error: error instanceof Error ? error.message : "模型保存失敗。" });
    }
  }

  if (target.action === "load" && req.method === "POST") {
    runtime.loading = true;
    broadcast(runtime, "progress");
    try {
      const loaded = await loadModelWeights(runtime);
      runtime.loading = false;
      if (!loaded) return json(res, 404, { error: "找不到已保存的模型權重。" });
      await persistRuntime(runtime);
      broadcast(runtime, "loaded");
      return json(res, 200, runtimePayload(runtime));
    } catch (error) {
      runtime.loading = false;
      runtime.saveStatus = "failed";
      broadcast(runtime, "error");
      return json(res, 500, { error: error instanceof Error ? error.message : "模型載入失敗。" });
    }
  }

  return notFound(res);
}

await loadPersistedModels();
await loadPersistedStrategies();

createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    console.error("[training] request error:", error);
    json(res, 500, { error: error instanceof Error ? error.message : "訓練服務發生錯誤。" });
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[training] Node 訓練服務已啟動：http://127.0.0.1:${PORT}`);
  console.log(`[training] 已載入 ${models.size} 個模型。資料夾：${DATA_DIR}`);
});
