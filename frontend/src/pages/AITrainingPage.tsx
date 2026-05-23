import { Activity, AlertTriangle, Bot, BrainCircuit, CheckCircle2, ChevronLeft, Clock3, Database, Gauge, Pause, Play, Plus, RefreshCw, Shield, Swords, Trash2, Trophy, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createInitialTrainingState } from "../training/trainingLoop";
import { createAiBattleState } from "../utils/battleEngine";
import type { BattleCardState, BattleParticipant, BattleReplayEvent, BattleSide, PokemonStats, TrainingState, TrainingWorkerState } from "../types/battle";

type TrainingScreen = "modeSelect" | "tacticsList" | "trainingRun";
type DifficultyLevel = "beginner" | "normal" | "hard" | "master" | "hell";
type TrainingGoalMode = "time" | "winRate";

export interface TrainingModelApplyPayload {
  id: string;
  name: string;
  difficulty: DifficultyLevel;
  computerDifficulty: DifficultyLevel;
}

interface ModelTrainingSummary {
  episodes: number;
  winRate: number;
  recentResultCount?: number;
  recentWinRate100?: number;
  recentWinRate500?: number;
  recentWinRate1000?: number;
  averageTurns: number;
  loss: number;
  epsilon: number;
  switchCount?: number;
  shieldCount?: number;
  beneficialSwitchCount?: number;
  effectiveShieldCount?: number;
  updatedAt: string;
  trainingSeconds?: number;
}

interface TacticsModelRecord {
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
  summary?: ModelTrainingSummary;
}

interface NewModelSettings {
  name: string;
  difficulty: DifficultyLevel;
  goalMode: TrainingGoalMode;
  targetTrainingMinutes: number;
  targetWinRate: number;
}

interface BackendTrainingPayload {
  model: TacticsModelRecord;
  trainingState: TrainingState;
  workerState: TrainingWorkerState;
  completed: boolean;
}

interface MetricsReportSummary {
  modelName: string;
  completed: boolean;
  episodes: number;
  winRate: number;
  recentResultCount: number;
  recentWinRate100: number;
  recentWinRate500: number;
  recentWinRate1000: number;
  wins: number;
  losses: number;
  draws: number;
  averageTurns: number;
  loss: number;
  epsilon: number;
  switchCount: number;
  shieldCount: number;
  beneficialSwitchCount: number;
  effectiveShieldCount: number;
  trainingSeconds: number;
  trainingDuration: string;
  difficulty: DifficultyLevel;
  difficultyLabel: string;
  goalMode: TrainingGoalMode;
  targetEpisodes: number;
  targetWinRate: number;
  targetTrainingMinutes: number;
  targetText: string;
  updatedAt: string;
}

interface MetricsReportPayload {
  chartSvg: string;
  summary: MetricsReportSummary;
}

const ACTIVE_MODEL_STORAGE_KEY = "pokemon-ai-active-tactics-model-v2";
const TRAINING_API_BASE = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TRAINING_API_BASE ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const initialWorkerState: TrainingWorkerState = { training: false, saving: false, loading: false, hasSavedModel: false, saveStatus: "unsaved" };

const difficultyOptions: Record<DifficultyLevel, { label: string; className: string; selectedClassName: string; unselectedClassName: string; targetEpisodes: number }> = {
  beginner: {
    label: "入門",
    className: "border-emerald-200 bg-emerald-400/40 text-white shadow-[0_0_18px_rgba(52,211,153,0.34)]",
    selectedClassName: "border-emerald-100 bg-emerald-400 text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.55)] ring-2 ring-emerald-100/75",
    unselectedClassName: "border-emerald-400/80 bg-emerald-500/16 text-emerald-100 hover:border-emerald-200 hover:bg-emerald-400/28",
    targetEpisodes: 150,
  },
  normal: {
    label: "中等",
    className: "border-sky-200 bg-sky-400/42 text-white shadow-[0_0_18px_rgba(56,189,248,0.35)]",
    selectedClassName: "border-sky-100 bg-sky-400 text-slate-950 shadow-[0_0_24px_rgba(56,189,248,0.58)] ring-2 ring-sky-100/75",
    unselectedClassName: "border-sky-400/80 bg-sky-500/16 text-sky-100 hover:border-sky-200 hover:bg-sky-400/28",
    targetEpisodes: 300,
  },
  hard: {
    label: "困難",
    className: "border-violet-200 bg-violet-400/44 text-white shadow-[0_0_18px_rgba(167,139,250,0.36)]",
    selectedClassName: "border-violet-100 bg-violet-400 text-slate-950 shadow-[0_0_24px_rgba(167,139,250,0.58)] ring-2 ring-violet-100/75",
    unselectedClassName: "border-violet-400/80 bg-violet-500/16 text-violet-100 hover:border-violet-200 hover:bg-violet-400/28",
    targetEpisodes: 500,
  },
  master: {
    label: "大師",
    className: "border-orange-200 bg-orange-400/44 text-white shadow-[0_0_18px_rgba(251,146,60,0.38)]",
    selectedClassName: "border-orange-100 bg-orange-400 text-slate-950 shadow-[0_0_24px_rgba(251,146,60,0.6)] ring-2 ring-orange-100/75",
    unselectedClassName: "border-orange-400/80 bg-orange-500/16 text-orange-100 hover:border-orange-200 hover:bg-orange-400/28",
    targetEpisodes: 800,
  },
  hell: {
    label: "地獄",
    className: "border-red-200 bg-red-500/46 text-white shadow-[0_0_18px_rgba(248,113,113,0.4)]",
    selectedClassName: "border-red-100 bg-red-500 text-white shadow-[0_0_26px_rgba(248,113,113,0.62)] ring-2 ring-red-100/75",
    unselectedClassName: "border-red-400/85 bg-red-500/18 text-red-100 hover:border-red-200 hover:bg-red-500/30",
    targetEpisodes: 1200,
  },
};

function normalizeModel(model: Partial<TacticsModelRecord>, index: number): TacticsModelRecord {
  const difficulty = model.difficulty ?? "normal";
  return {
    id: model.id ?? `battle-tactics-${Date.now()}-${index}`,
    name: model.name ?? `BattleTacticsAgent ${index + 1}`,
    description: model.description ?? "單局戰術模型，訓練技能選擇、休息、換人與屬性克制。",
    difficulty,
    goalMode: model.goalMode ?? "winRate",
    targetTrainingMinutes: model.targetTrainingMinutes ?? 30,
    targetWinRate: model.targetWinRate ?? 65,
    targetEpisodes: model.targetEpisodes ?? difficultyOptions[difficulty].targetEpisodes,
    createdAt: model.createdAt ?? new Date().toISOString(),
    manuallyCompleted: model.manuallyCompleted ?? false,
    completedAt: model.completedAt,
    summary: model.summary,
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${TRAINING_API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("無法連線到後端訓練服務，請先執行 start_training.bat 或確認 8787 port 已啟動。");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "後端訓練服務回傳錯誤。");
  return payload as T;
}

async function fetchModels() {
  const payload = await apiFetch<{ models: TacticsModelRecord[] }>("/api/training/models");
  return payload.models.map((model, index) => normalizeModel(model, index));
}

async function fetchModel(modelId: string) {
  const payload = await apiFetch<BackendTrainingPayload>(`/api/training/models/${encodeURIComponent(modelId)}`);
  return { ...payload, model: normalizeModel(payload.model, 0) };
}

async function createBackendModel(index: number, settings: NewModelSettings) {
  const payload = await apiFetch<BackendTrainingPayload>("/api/training/models", {
    method: "POST",
    body: JSON.stringify({
      name: settings.name.trim() || `BattleTacticsAgent ${index + 1}`,
      difficulty: settings.difficulty,
      goalMode: settings.goalMode,
      targetTrainingMinutes: settings.targetTrainingMinutes,
      targetWinRate: settings.targetWinRate,
    }),
  });
  return { ...payload, model: normalizeModel(payload.model, 0) };
}

async function cloneBackendModel(sourceModelId: string, settings: NewModelSettings) {
  const payload = await apiFetch<BackendTrainingPayload>(`/api/training/models/${encodeURIComponent(sourceModelId)}/clone`, {
    method: "POST",
    body: JSON.stringify({
      name: settings.name.trim(),
      difficulty: settings.difficulty,
      goalMode: settings.goalMode,
      targetTrainingMinutes: settings.targetTrainingMinutes,
      targetWinRate: settings.targetWinRate,
    }),
  });
  return { ...payload, model: normalizeModel(payload.model, 0) };
}

async function postModelAction(modelId: string, action: "start" | "pause" | "reset" | "save" | "load") {
  const payload = await apiFetch<BackendTrainingPayload>(`/api/training/models/${encodeURIComponent(modelId)}/${action}`, { method: "POST" });
  return { ...payload, model: normalizeModel(payload.model, 0) };
}

async function fetchMetricsReport(modelId: string) {
  return apiFetch<MetricsReportPayload>(`/api/training/models/${encodeURIComponent(modelId)}/metrics-report`);
}

function isModelCompleted(model: TacticsModelRecord) {
  if (model.manuallyCompleted) return true;
  if (!model.summary) return false;
  if (model.goalMode === "time") return (model.summary.trainingSeconds ?? 0) >= model.targetTrainingMinutes * 60;
  return model.summary.episodes >= model.targetEpisodes && model.summary.winRate >= model.targetWinRate;
}

function formatRate(count = 0, total = 0) {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
}

function formatRecentWinRate(rate = 0, samples = 0) {
  return samples > 0 ? `${rate.toFixed(2)}%` : "--";
}

function getLearningTurnTotal(episodes = 0, averageTurns = 0) {
  return Math.max(0, (episodes * averageTurns) / 2);
}

function formatLearningActionRate(count = 0, episodes = 0, averageTurns = 0) {
  return formatRate(count, getLearningTurnTotal(episodes, averageTurns));
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function formatShortDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Activity; accent: string }) {
  return (
    <div className="grid min-h-[96px] rounded-[18px] border border-slate-700/70 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <Icon className={accent} size={18} />
      </div>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function DifficultyPill({ difficulty }: { difficulty: DifficultyLevel }) {
  const option = difficultyOptions[difficulty];
  return <span className={["inline-flex min-w-14 items-center justify-center rounded-full border px-3 py-1 text-xs font-black", option.className].join(" ")}>{option.label}</span>;
}

function getPokemonLabel(pokemon: PokemonStats) {
  return pokemon.name_zh || pokemon.name;
}

function getPokemonImage(pokemon: PokemonStats) {
  return `/pokemon-cutout/${pokemon.id}.png`;
}

function getSideName(side: BattleSide) {
  return side === "player" ? "LearningAgent" : "Baseline";
}

function Meter({ label, value, tone }: { label: string; value: number; tone: "cyan" | "rose" | "violet" }) {
  const toneClass = tone === "cyan" ? "from-cyan-300 to-blue-400" : tone === "rose" ? "from-rose-300 to-red-400" : "from-sky-300 to-violet-300";
  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)_36px] items-center gap-2">
      <span className="text-[10px] font-black text-slate-500">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-950">
        <div className={["h-full rounded-full bg-gradient-to-r transition-all duration-500", toneClass].join(" ")} style={{ width: `${value}%` }} />
      </div>
      <span className="text-right text-[10px] font-black text-slate-400">{value}%</span>
    </div>
  );
}

function ActiveFighter({ card, side, active }: { card: BattleCardState; side: BattleSide; active: boolean }) {
  void active;
  const hpPercent = Math.max(0, Math.round((card.currentHp / card.pokemon.max_hp) * 100));
  const staminaPercent = Math.max(0, Math.round((card.currentStamina / card.maxStamina) * 100));
  return (
    <div className={["relative mx-auto grid aspect-[1/1.42] w-[min(20vw,250px)] min-w-[210px] overflow-hidden rounded-[26px] border p-4", side === "player" ? "border-cyan-300/45 bg-[radial-gradient(circle_at_40%_25%,rgba(103,232,249,0.24),rgba(8,19,34,0.92)_58%,rgba(2,6,23,0.98))] shadow-[0_0_44px_rgba(34,211,238,0.18)]" : "border-rose-300/45 bg-[radial-gradient(circle_at_58%_25%,rgba(251,113,133,0.22),rgba(30,10,24,0.92)_58%,rgba(2,6,23,0.98))] shadow-[0_0_44px_rgba(244,63,94,0.16)]"].join(" ")}>
      <div className="pointer-events-none absolute inset-0 arena-grid opacity-25" />
      <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.16),transparent_42%)]" />
      <div className="relative z-10 max-w-[78%]">
        <p className={["text-[11px] font-black uppercase tracking-[0.2em]", side === "player" ? "text-cyan-200" : "text-rose-200"].join(" ")}>{side === "player" ? "Learning" : "Opponent"}</p>
        <h3 className="mt-1 truncate text-2xl font-black text-white">{getPokemonLabel(card.pokemon)}</h3>
      </div>
      <div className="relative z-10 grid min-h-0 flex-1 place-items-center">
        <img src={getPokemonImage(card.pokemon)} alt={getPokemonLabel(card.pokemon)} className="h-[min(25vh,220px)] w-[92%] object-contain drop-shadow-[0_24px_38px_rgba(0,0,0,0.72)]" />
      </div>
      <div className="relative z-10 rounded-[16px] border border-slate-700/70 bg-slate-950/82 p-3 shadow-[0_14px_28px_rgba(0,0,0,0.32)]">
        <div className="grid gap-2">
          <Meter label="HP" value={hpPercent} tone={side === "player" ? "cyan" : "rose"} />
          <Meter label="SP" value={staminaPercent} tone="violet" />
        </div>
      </div>
    </div>
  );
}

function StandbyDeckCard({ card, active, side, pulse }: { card: BattleCardState; active: boolean; side: BattleSide; pulse: boolean }) {
  void pulse;
  const hpPercent = Math.max(0, Math.round((card.currentHp / card.pokemon.max_hp) * 100));
  return (
    <article className={["relative grid min-h-[92px] grid-cols-[78px_minmax(0,1fr)] gap-3 overflow-hidden rounded-[16px] border p-2", active ? (side === "player" ? "border-cyan-300/70 bg-cyan-300/14" : "border-rose-300/70 bg-rose-300/14") : "border-slate-800 bg-slate-950/72", card.currentHp <= 0 ? "grayscale opacity-50" : ""].join(" ")}>
      {active && <span className="absolute right-2 top-2 z-10 rounded-full border border-white/20 bg-slate-950/80 px-2 py-0.5 text-[9px] font-black text-white">ACTIVE</span>}
      <div className="grid min-h-0 place-items-center rounded-[14px] bg-slate-900/72">
        <img src={getPokemonImage(card.pokemon)} alt={getPokemonLabel(card.pokemon)} className="h-[76px] w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]" />
      </div>
      <div className="grid min-w-0 content-center">
        <p className="truncate pr-14 text-sm font-black text-white">{getPokemonLabel(card.pokemon)}</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-900">
          <div className={["h-full rounded-full bg-gradient-to-r", side === "player" ? "from-cyan-300 to-blue-400" : "from-rose-300 to-red-400"].join(" ")} style={{ width: `${hpPercent}%` }} />
        </div>
      </div>
    </article>
  );
}

function StandbyDeck({ participant, side, activeEvent }: { participant: BattleParticipant; side: BattleSide; activeEvent?: BattleReplayEvent }) {
  return (
    <div className="grid gap-2">
      {participant.team.map((card, index) => (
        <StandbyDeckCard key={`${side}-standby-${card.pokemon.id}-${index}`} card={card} active={participant.activeIndex === index} side={side} pulse={activeEvent?.actor === side && participant.activeIndex === index} />
      ))}
    </div>
  );
}

function SideStandbyArea({ title, participant, side, activeEvent }: { title: string; participant: BattleParticipant; side: BattleSide; activeEvent?: BattleReplayEvent }) {
  return (
    <section className="grid min-h-[430px] content-center">
      <div className="translate-y-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={["text-[11px] font-black uppercase tracking-[0.2em]", side === "player" ? "text-cyan-200" : "text-rose-200"].join(" ")}>{title}</p>
            <h2 className="mt-1 truncate text-lg font-black text-white">{getSideName(side)}</h2>
          </div>
          <Bot className={side === "player" ? "text-cyan-200" : "text-rose-200"} size={22} />
        </div>
        <StandbyDeck participant={participant} side={side} activeEvent={activeEvent} />
      </div>
    </section>
  );
}

function ReplayStage({ event, initialParticipants, training, elapsedSeconds, completed }: { event?: BattleReplayEvent; initialParticipants: Record<BattleSide, BattleParticipant>; training: TrainingState; elapsedSeconds: number; completed: boolean }) {
  const participants = event?.snapshot.participants ?? initialParticipants;
  const playerActive = participants.player.team[participants.player.activeIndex];
  const computerActive = participants.computer.team[participants.computer.activeIndex];
  return (
    <section className="relative min-h-0 overflow-hidden rounded-[28px] border border-slate-700/70 bg-[#07111f] shadow-[0_28px_92px_rgba(0,0,0,0.42)]">
      <div className="arena-grid absolute inset-0 opacity-45" />
      <div className={["relative z-10 grid h-full min-h-[430px] grid-rows-[auto_minmax(0,1fr)_auto] p-5 transition duration-300", completed ? "blur-sm opacity-50" : ""].join(" ")}>
        <div className="relative flex min-h-16 items-start justify-end gap-3">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">訓練時間</p>
            <p className="mt-1 w-40 font-mono text-3xl font-black tabular-nums text-white">{formatDuration(elapsedSeconds)}</p>
          </div>
          <div className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100">Episode {training.episodes.toLocaleString()}</div>
        </div>
        <div className="grid min-h-0 grid-cols-[minmax(230px,1fr)_96px_minmax(230px,1fr)] items-center gap-5">
          <ActiveFighter card={playerActive} side="player" active={event?.actor === "player"} />
          <div className="grid justify-items-center gap-3">
            <div className="grid size-18 place-items-center rounded-full border border-slate-600 bg-slate-950/75 text-xl font-black text-white shadow-[0_0_42px_rgba(255,255,255,0.08)]">VS</div>
            <Swords className="text-slate-400" size={22} />
          </div>
          <ActiveFighter card={computerActive} side="computer" active={event?.actor === "computer"} />
        </div>
        <div className="grid min-h-[76px] content-center justify-items-center text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Battle Log</p>
          <p className="mt-2 min-h-7 text-base font-black text-white">{event?.message ?? "等待後端訓練服務回傳 replay。"}</p>
        </div>
      </div>
      {completed && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/34 backdrop-blur-[2px]">
          <div className="rounded-[24px] border border-emerald-300/45 bg-slate-950/72 px-10 py-8 text-center shadow-[0_0_52px_rgba(52,211,153,0.22)]">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-200">Training Complete</p>
            <h2 className="mt-2 text-4xl font-black text-white">已完成</h2>
            <p className="mt-3 text-sm font-bold text-slate-300">模型已達成目前訓練目標。</p>
          </div>
        </div>
      )}
    </section>
  );
}

function MetricsReportModal({ report, onClose }: { report: MetricsReportPayload; onClose: () => void }) {
  const summary = report.summary;
  const rows: Array<[string, string]> = [
    ["Episodes", summary.episodes.toLocaleString()],
    ["勝率", `${summary.winRate.toFixed(2)}%`],
    ["近 100 場", formatRecentWinRate(summary.recentWinRate100, summary.recentResultCount)],
    ["近 500 場", formatRecentWinRate(summary.recentWinRate500, summary.recentResultCount)],
    ["近 1000 場", formatRecentWinRate(summary.recentWinRate1000, summary.recentResultCount)],
    ["勝 / 敗 / 平", `${summary.wins.toLocaleString()} / ${summary.losses.toLocaleString()} / ${summary.draws.toLocaleString()}`],
    ["平均回合", summary.averageTurns.toFixed(1)],
    ["Loss", summary.loss.toFixed(3)],
    ["Epsilon", summary.epsilon.toFixed(2)],
    ["換牌率", formatLearningActionRate(summary.switchCount, summary.episodes, summary.averageTurns)],
    ["有效換牌率", formatRate(summary.beneficialSwitchCount, summary.switchCount)],
    ["護盾率", formatLearningActionRate(summary.shieldCount, summary.episodes, summary.averageTurns)],
    ["有效護盾率", formatRate(summary.effectiveShieldCount, summary.shieldCount)],
    ["訓練時間", summary.trainingDuration],
    ["難度", summary.difficultyLabel],
    ["目標", summary.targetText],
    ["更新時間", new Date(summary.updatedAt).toLocaleString()],
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/82 p-5 backdrop-blur-sm">
      <section className="grid max-h-[92vh] w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[26px] border border-slate-700 bg-slate-950 shadow-[0_32px_110px_rgba(0,0,0,0.62)]">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">Metrics Report</p>
            <h2 className="mt-1 truncate text-2xl font-black text-white">{summary.modelName}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100" aria-label="關閉曲線圖報告">
            <XCircle size={20} />
          </button>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(0,7fr)_minmax(280px,3fr)] gap-4 overflow-y-auto p-5">
          <div className="min-h-0 rounded-[22px] border border-slate-800 bg-slate-900/36 p-3">
            <div className="overflow-hidden rounded-[18px] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: report.chartSvg }} />
          </div>

          <aside className="rounded-[22px] border border-slate-800 bg-slate-900/52 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Status</p>
                <h3 className="mt-1 text-xl font-black text-emerald-100">{summary.completed ? "訓練完成" : "尚未完成"}</h3>
              </div>
              <CheckCircle2 className="text-emerald-200" size={24} />
            </div>

            <div className="mt-5 grid gap-3">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 rounded-[14px] border border-slate-800 bg-slate-950/62 px-4 py-3">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
                  <span className="max-w-[58%] truncate text-right text-sm font-black text-white">{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function ModeSelect({ onBack, onSelectTactics }: { onBack: () => void; onSelectTactics: () => void }) {
  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative grid h-full grid-rows-[72px_minmax(0,1fr)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(16,185,129,0.14),transparent_30%)]" />
        <header className="relative z-10 flex items-center justify-between border-b border-slate-800 px-6">
          <div className="flex items-center gap-4">
            <button type="button" onClick={onBack} className="grid size-11 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100" aria-label="返回">
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">AI Training Lab</p>
              <h1 className="text-2xl font-black">模型訓練中心</h1>
            </div>
          </div>
        </header>
        <main className="relative z-10 grid min-h-0 place-items-center p-6">
          <div className="grid w-full max-w-5xl grid-cols-2 gap-5">
            <button type="button" onClick={onSelectTactics} className="group min-h-[360px] rounded-[26px] border border-cyan-300/35 bg-slate-950/72 p-8 text-left shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition hover:border-cyan-200 hover:bg-cyan-300/10">
              <BrainCircuit className="text-cyan-100" size={42} />
              <p className="mt-8 text-[12px] font-black uppercase tracking-[0.28em] text-cyan-200">Layer 1</p>
              <h2 className="mt-2 text-4xl font-black text-white">單局戰術模型</h2>
              <p className="mt-4 max-w-md text-sm font-bold leading-7 text-slate-300">訓練技能選擇、休息、換人與屬性克制，作為未來賽局策略的底層決策器。</p>
            </button>
            <div className="min-h-[360px] rounded-[26px] border border-slate-700 bg-slate-950/52 p-8 text-left opacity-70 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
              <Trophy className="text-slate-400" size={42} />
              <p className="mt-8 text-[12px] font-black uppercase tracking-[0.28em] text-slate-500">Layer 2</p>
              <h2 className="mt-2 text-4xl font-black text-slate-300">賽局策略模型</h2>
              <p className="mt-4 max-w-md text-sm font-bold leading-7 text-slate-400">保留後續擴充點，未來再訓練選角、禁用、資源配置與連局策略。</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function NewModelDialog({
  nextIndex,
  initialSettings,
  mode = "create",
  sourceModel,
  onCancel,
  onConfirm,
}: {
  nextIndex: number;
  initialSettings?: NewModelSettings;
  mode?: "create" | "clone";
  sourceModel?: TacticsModelRecord;
  onCancel: () => void;
  onConfirm: (settings: NewModelSettings) => Promise<void>;
}) {
  const [settings, setSettings] = useState<NewModelSettings>(initialSettings ?? { name: `BattleTacticsAgent ${nextIndex + 1}`, difficulty: "normal", goalMode: "winRate", targetTrainingMinutes: 30, targetWinRate: 65 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isCloneMode = mode === "clone";

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await onConfirm(settings);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : isCloneMode ? "複製模型失敗，請確認後端訓練服務是否已啟動。" : "新增模型失敗，請確認後端訓練服務是否已啟動。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/78 p-5 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-[24px] border border-slate-700 bg-slate-950 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">{isCloneMode ? "Clone Model Setup" : "New Model Setup"}</p>
            <h2 className="mt-1 text-2xl font-black text-white">{isCloneMode ? "複製續訓設定" : "新增模型設定"}</h2>
            {isCloneMode && sourceModel && (
              <p className="mt-2 text-sm font-bold text-slate-400">
                來源：{sourceModel.name}，目前勝率 {sourceModel.summary?.winRate.toFixed(2) ?? "0.00"}%
              </p>
            )}
          </div>
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="rounded-full border border-slate-700 px-4 py-2 text-sm font-black text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50">
            取消
          </button>
        </div>

        <div className="mt-6 grid gap-5">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">名稱</span>
            <input value={settings.name} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} className="min-h-12 rounded-[14px] border border-slate-700 bg-slate-900 px-4 text-sm font-black text-white outline-none transition focus:border-cyan-300" />
          </label>

          <div className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">難度</span>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(difficultyOptions) as DifficultyLevel[]).map((difficulty) => (
                <button key={difficulty} type="button" onClick={() => setSettings((current) => ({ ...current, difficulty }))} className={["min-h-12 rounded-[14px] border text-sm font-black transition", settings.difficulty === difficulty ? difficultyOptions[difficulty].selectedClassName : difficultyOptions[difficulty].unselectedClassName].join(" ")}>
                  {difficultyOptions[difficulty].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">目標擇一</span>
              <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-slate-700 bg-slate-900 p-1">
                <button type="button" onClick={() => setSettings((current) => ({ ...current, goalMode: "time" }))} className={["min-h-11 rounded-[12px] text-sm font-black transition", settings.goalMode === "time" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"].join(" ")}>
                  訓練時間
                </button>
                <button type="button" onClick={() => setSettings((current) => ({ ...current, goalMode: "winRate" }))} className={["min-h-11 rounded-[12px] text-sm font-black transition", settings.goalMode === "winRate" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"].join(" ")}>
                  勝率
                </button>
              </div>
            </div>

            {settings.goalMode === "time" ? (
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">訓練時間（分鐘）</span>
                <input type="number" min={5} max={720} step={5} value={settings.targetTrainingMinutes} onChange={(event) => setSettings((current) => ({ ...current, targetTrainingMinutes: Number(event.target.value) }))} className="min-h-12 rounded-[14px] border border-slate-700 bg-slate-900 px-4 text-sm font-black text-white outline-none transition focus:border-cyan-300" />
              </label>
            ) : (
              <label className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">目標勝率（%）</span>
                <input type="number" min={1} max={100} value={settings.targetWinRate} onChange={(event) => setSettings((current) => ({ ...current, targetWinRate: Number(event.target.value) }))} className="min-h-12 rounded-[14px] border border-slate-700 bg-slate-900 px-4 text-sm font-black text-white outline-none transition focus:border-cyan-300" />
              </label>
            )}
          </div>

          <div className="rounded-[16px] border border-slate-700 bg-slate-900/72 p-4 text-sm font-bold leading-6 text-slate-300">
            {isCloneMode
              ? "複製會完整保留來源模型的權重、訓練統計、epsilon 與 replay buffer，只調整這個新分支的訓練目標。"
              : `勝率目標會同時套用難度的最低場次門檻。例如中等難度需至少 ${difficultyOptions.normal.targetEpisodes} 場，且勝率達標後才會判定完成。`}
          </div>
        </div>

        {errorMessage && <p className="mt-5 rounded-[14px] border border-rose-300/35 bg-rose-300/10 px-4 py-3 text-sm font-black text-rose-100">{errorMessage}</p>}
        <button type="button" onClick={() => void handleConfirm()} disabled={isSubmitting} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-cyan-300/40 bg-cyan-300 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-65">
          <Play size={18} />
          {isSubmitting ? (isCloneMode ? "複製模型中" : "建立模型中") : (isCloneMode ? "確認複製並續訓" : "確認並開始訓練")}
        </button>
      </section>
    </div>
  );
}

function TacticsModelList({
  models,
  selectedId,
  appliedModelId,
  onSelect,
  onAdd,
  onClone,
  onApply,
  onRemoveApplied,
}: {
  models: TacticsModelRecord[];
  selectedId?: string;
  appliedModelId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClone: (model: TacticsModelRecord) => void;
  onApply: (model: TacticsModelRecord) => void;
  onRemoveApplied: () => void;
}) {
  return (
    <section className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] rounded-[24px] border border-slate-700/70 bg-slate-950/64 p-5 shadow-[0_24px_76px_rgba(0,0,0,0.28)]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">Model Registry</p>
          <h2 className="mt-1 text-2xl font-black text-white">訓練模型列表</h2>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black text-slate-300">{models.length} 個模型</span>
      </div>

      <div className="mt-5 grid grid-cols-[76px_minmax(150px,1fr)_92px_84px_76px_78px_86px_86px] gap-2 border-b border-slate-800 px-4 pb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
        <span>狀態</span>
        <span>名稱</span>
        <span className="text-right">訓練時間</span>
        <span className="text-center">難度</span>
        <span className="text-right">場次</span>
        <span className="text-right">勝率</span>
        <span className="text-right">複製</span>
        <span className="text-right">套用</span>
      </div>

      <div className="mt-3 min-h-0 overflow-y-auto pr-1">
        {models.length === 0 ? (
          <div className="grid h-full min-h-[420px] place-items-center rounded-[22px] border border-dashed border-slate-700 bg-slate-900/42 p-8 text-center">
            <div>
              <Bot className="mx-auto text-slate-500" size={42} />
              <h3 className="mt-4 text-2xl font-black text-white">尚未建立訓練模型</h3>
              <p className="mt-2 text-sm font-bold text-slate-400">按下新增模型後設定目標，確認後會建立後端訓練 job。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {models.map((model) => {
              const completed = isModelCompleted(model);
              const applied = appliedModelId === model.id;
              const trainingSeconds = model.summary?.trainingSeconds ?? 0;
              return (
                <div
                  key={model.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(model.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(model.id);
                    }
                  }}
                  className={["grid cursor-pointer grid-cols-[76px_minmax(150px,1fr)_92px_84px_76px_78px_86px_86px] items-center gap-2 rounded-[18px] border p-4 text-left transition", selectedId === model.id ? "border-cyan-300/60 bg-cyan-300/10" : "border-slate-800 bg-slate-900/55 hover:border-slate-600"].join(" ")}
                >
                  <div className={["flex items-center gap-2 text-sm font-black", applied ? "text-cyan-200" : completed ? "text-emerald-200" : "text-amber-200"].join(" ")}>
                    {applied || completed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    {applied ? "套用中" : completed ? "完成" : "未完成"}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-white">{model.name}</h3>
                    <p className="mt-1 truncate text-xs font-bold text-slate-400">{model.goalMode === "time" ? `時間目標 ${model.targetTrainingMinutes} 分鐘` : `勝率目標 ${model.targetWinRate}%，最低 ${model.targetEpisodes.toLocaleString()} 場`}</p>
                  </div>
                  <span className="text-right text-sm font-black text-slate-300">{formatShortDuration(trainingSeconds)}</span>
                  <span className="text-center"><DifficultyPill difficulty={model.difficulty} /></span>
                  <span className="text-right text-sm font-black text-slate-300">{model.summary ? model.summary.episodes.toLocaleString() : "0"}</span>
                  <span className="text-right text-sm font-black text-slate-300">{model.summary ? `${model.summary.winRate.toFixed(2)}%` : "0.00%"}</span>
                  <button
                    type="button"
                    disabled={!completed}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClone(model);
                    }}
                    className={[
                      "min-h-10 rounded-2xl border px-3 text-sm font-black transition",
                      completed
                        ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:border-emerald-200/70"
                        : "cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500",
                    ].join(" ")}
                  >
                    複製
                  </button>
                  <button
                    type="button"
                    disabled={!completed && !applied}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (applied) {
                        onRemoveApplied();
                        return;
                      }
                      onApply(model);
                    }}
                    className={[
                      "min-h-10 rounded-2xl border px-3 text-sm font-black transition",
                      applied
                        ? "border-rose-300/40 bg-rose-300/10 text-rose-100 hover:border-rose-200/70"
                        : completed
                          ? "border-cyan-300/40 bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                          : "cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500",
                    ].join(" ")}
                  >
                    {applied ? "移除" : "套用"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button type="button" onClick={onAdd} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-emerald-300/35 bg-emerald-300/10 text-sm font-black text-emerald-100 transition hover:border-emerald-200/70">
        <Plus size={18} />
        新增模型
      </button>
    </section>
  );
}

function ModelInfoPanel({ model, onDelete, onTrain }: { model?: TacticsModelRecord; onDelete: () => void; onTrain: () => void }) {
  if (!model) {
    return (
      <aside className="grid min-h-0 place-items-center rounded-[24px] border border-slate-700/70 bg-slate-950/64 p-6 text-center">
        <div>
          <Activity className="mx-auto text-slate-500" size={42} />
          <h2 className="mt-4 text-2xl font-black text-white">選擇模型</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-400">建立或選擇一個模型後，這裡會顯示完整訓練資訊。</p>
        </div>
      </aside>
    );
  }

  const completed = isModelCompleted(model);
  const summary = model.summary;

  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-[24px] border border-slate-700/70 bg-slate-950/64 p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Model Status</p>
            <h2 className="mt-1 truncate text-2xl font-black text-white">{model.name}</h2>
          </div>
          <span className={["shrink-0 rounded-full border px-3 py-1 text-xs font-black", completed ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-amber-300/40 bg-amber-300/10 text-amber-100"].join(" ")}>{completed ? "完成" : "未完成"}</span>
        </div>
        <p className="mt-3 text-sm font-bold leading-6 text-slate-400">{model.description}</p>
      </div>

      <div className="grid gap-3 pt-5">
        <div className="grid grid-cols-2 grid-rows-3 gap-3">
          <StatCard label="Episodes" value={(summary?.episodes ?? 0).toLocaleString()} icon={Activity} accent="text-cyan-200" />
          <StatCard label="近500場" value={formatRecentWinRate(summary?.recentWinRate500, summary?.recentResultCount)} icon={Trophy} accent="text-emerald-200" />
          <StatCard label="勝率" value={`${(summary?.winRate ?? 0).toFixed(2)}%`} icon={Gauge} accent="text-emerald-200" />
          <StatCard label="平均回合" value={(summary?.averageTurns ?? 0).toFixed(1)} icon={Swords} accent="text-amber-200" />
          <StatCard label="Loss" value={(summary?.loss ?? 0).toFixed(3)} icon={BrainCircuit} accent="text-rose-200" />
          <StatCard label="換牌率" value={formatLearningActionRate(summary?.switchCount ?? 0, summary?.episodes ?? 0, summary?.averageTurns ?? 0)} icon={RefreshCw} accent="text-violet-200" />
          <StatCard label="訓練時間" value={formatShortDuration(summary?.trainingSeconds ?? 0)} icon={Clock3} accent="text-sky-200" />
        </div>
        <div className="grid gap-3 rounded-[18px] border border-slate-800 bg-slate-900/52 p-4 text-sm font-bold leading-6 text-slate-400">
          <div className="flex items-center justify-between gap-3"><span>難度</span><DifficultyPill difficulty={model.difficulty} /></div>
          <div className="flex items-center justify-between gap-3"><span>目標</span><span className="text-right text-white">{model.goalMode === "time" ? `${model.targetTrainingMinutes} 分鐘` : `勝率 ${model.targetWinRate}% 且達最低場次`}</span></div>
          <div className="flex items-center justify-between gap-3"><span>最低場次</span><span className="text-white">{model.targetEpisodes.toLocaleString()} 場</span></div>
          <div className="flex items-center justify-between gap-3"><span>護盾率</span><span className="text-white">{formatLearningActionRate(summary?.shieldCount ?? 0, summary?.episodes ?? 0, summary?.averageTurns ?? 0)}</span></div>
          <div className="flex items-center justify-between gap-3"><span>更新時間</span><span className="text-right text-white">{summary ? new Date(summary.updatedAt).toLocaleString() : "尚未訓練"}</span></div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onDelete} className="flex min-h-14 items-center justify-center gap-2 rounded-[16px] border border-rose-300/35 bg-rose-300/10 text-sm font-black text-rose-100 transition hover:border-rose-200/70">
          <Trash2 size={18} />
          刪除
        </button>
        <button type="button" onClick={onTrain} className={["flex min-h-14 items-center justify-center gap-2 rounded-[16px] border text-sm font-black transition", completed ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:border-emerald-200/70" : "border-cyan-300/40 bg-cyan-300 text-slate-950 hover:bg-cyan-200"].join(" ")}>
          {completed ? <CheckCircle2 size={18} /> : <Play size={18} />}
          {completed ? "進入" : "訓練"}
        </button>
      </div>
    </aside>
  );
}

function DeleteModelDialog({
  model,
  onCancel,
  onConfirm,
}: {
  model: TacticsModelRecord;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/78 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] border border-rose-300/35 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-rose-300/35 bg-rose-300/10 text-rose-100">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-200">Delete Model</p>
            <h2 className="mt-1 text-2xl font-black text-white">確定要刪除嗎？</h2>
            <p className="mt-3 text-sm font-bold leading-6 text-slate-400">
              將永久刪除「<span className="text-white">{model.name}</span>」與其訓練資料，刪除後無法復原。
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex min-h-12 items-center justify-center rounded-[16px] border border-slate-700 bg-slate-900/70 text-sm font-black text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
            className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-rose-300/45 bg-rose-300/12 text-sm font-black text-rose-100 transition hover:border-rose-200/75 disabled:cursor-wait disabled:opacity-65"
          >
            <Trash2 size={18} />
            {isDeleting ? "刪除中" : "確定刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TacticsListPage({
  onBack,
  onTrain,
  appliedModelId,
  onApplyTrainingModel,
  onRemoveAppliedTrainingModel,
}: {
  onBack: () => void;
  onTrain: (id: string) => void;
  appliedModelId?: string;
  onApplyTrainingModel?: (payload: TrainingModelApplyPayload) => void;
  onRemoveAppliedTrainingModel?: () => void;
}) {
  const [models, setModels] = useState<TacticsModelRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [isNewModelOpen, setIsNewModelOpen] = useState(false);
  const [cloneSourceModel, setCloneSourceModel] = useState<TacticsModelRecord | null>(null);
  const [deleteTargetModel, setDeleteTargetModel] = useState<TacticsModelRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const selectedModel = useMemo(() => models.find((model) => model.id === selectedId), [models, selectedId]);

  useEffect(() => {
    let active = true;
    void fetchModels()
      .then((nextModels) => {
        if (!active) return;
        setModels(nextModels);
        setSelectedId((current) => current ?? nextModels[0]?.id);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "讀取模型列表失敗。");
      });
    return () => {
      active = false;
    };
  }, []);

  const confirmNewModel = async (settings: NewModelSettings) => {
    try {
      const payload = await createBackendModel(models.length, settings);
      setModels((current) => [...current, payload.model]);
      setSelectedId(payload.model.id);
      setIsNewModelOpen(false);
      localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, payload.model.id);
      setErrorMessage("");
      onTrain(payload.model.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "新增模型失敗。";
      setErrorMessage(message);
      throw new Error(message);
    }
  };

  const openCloneModel = (model: TacticsModelRecord) => {
    const nextWinRate = Math.min(100, Math.max(model.targetWinRate, Math.ceil(model.summary?.winRate ?? model.targetWinRate)));
    setCloneSourceModel({
      ...model,
      targetWinRate: nextWinRate,
    });
  };

  const confirmCloneModel = async (settings: NewModelSettings) => {
    if (!cloneSourceModel) return;
    try {
      const payload = await cloneBackendModel(cloneSourceModel.id, settings);
      setModels((current) => [...current, payload.model]);
      setSelectedId(payload.model.id);
      setCloneSourceModel(null);
      localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, payload.model.id);
      setErrorMessage("");
      onTrain(payload.model.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "複製模型失敗。";
      setErrorMessage(message);
      throw new Error(message);
    }
  };

  const deleteModel = async (modelToDelete: TacticsModelRecord) => {
    try {
      await apiFetch(`/api/training/models/${encodeURIComponent(modelToDelete.id)}`, { method: "DELETE" });
      const nextModels = models.filter((model) => model.id !== modelToDelete.id);
      setModels(nextModels);
      setSelectedId(nextModels[0]?.id);
      setDeleteTargetModel(null);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "刪除模型失敗。");
      throw error;
    }
  };

  const trainModel = () => {
    if (!selectedModel) return;
    localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, selectedModel.id);
    onTrain(selectedModel.id);
  };

  const applyModel = (model: TacticsModelRecord) => {
    onApplyTrainingModel?.({
      id: model.id,
      name: model.name,
      difficulty: model.difficulty,
      computerDifficulty: model.difficulty,
    });
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative grid h-full min-h-0 grid-rows-[72px_minmax(0,1fr)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_80%_22%,rgba(16,185,129,0.13),transparent_28%)]" />
        <header className="relative z-10 flex items-center justify-between border-b border-slate-800/80 px-6">
          <div className="flex items-center gap-4">
            <button type="button" onClick={onBack} className="grid size-11 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" aria-label="返回">
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">Layer 1 / Battle Tactics</p>
              <h1 className="text-2xl font-black leading-tight">單局戰術模型</h1>
            </div>
          </div>
        </header>

        <main className="relative z-10 grid min-h-0 grid-cols-[minmax(0,1fr)_520px] gap-4 p-4">
          <TacticsModelList
            models={models}
            selectedId={selectedId}
            appliedModelId={appliedModelId}
            onSelect={setSelectedId}
            onAdd={() => setIsNewModelOpen(true)}
            onClone={openCloneModel}
            onApply={applyModel}
            onRemoveApplied={() => onRemoveAppliedTrainingModel?.()}
          />
          <ModelInfoPanel model={selectedModel} onDelete={() => selectedModel && setDeleteTargetModel(selectedModel)} onTrain={trainModel} />
        </main>
        {errorMessage && <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-[16px] border border-rose-300/35 bg-rose-300/10 px-4 py-3 text-sm font-black text-rose-100">{errorMessage}</div>}
      </div>
      {isNewModelOpen && <NewModelDialog nextIndex={models.length} onCancel={() => setIsNewModelOpen(false)} onConfirm={confirmNewModel} />}
      {deleteTargetModel && <DeleteModelDialog model={deleteTargetModel} onCancel={() => setDeleteTargetModel(null)} onConfirm={() => deleteModel(deleteTargetModel)} />}
      {cloneSourceModel && (
        <NewModelDialog
          nextIndex={models.length}
          mode="clone"
          sourceModel={cloneSourceModel}
          initialSettings={{
            name: `${cloneSourceModel.name} 複本`,
            difficulty: cloneSourceModel.difficulty,
            goalMode: "winRate",
            targetTrainingMinutes: cloneSourceModel.targetTrainingMinutes,
            targetWinRate: cloneSourceModel.targetWinRate,
          }}
          onCancel={() => setCloneSourceModel(null)}
          onConfirm={confirmCloneModel}
        />
      )}
    </div>
  );
}

function TrainingRunPage({ modelId, onBackToList }: { modelId: string; onBackToList: () => void }) {
  const [training, setTraining] = useState<TrainingState>(() => createInitialTrainingState());
  const [workerState, setWorkerState] = useState<TrainingWorkerState>(initialWorkerState);
  const [model, setModel] = useState<TacticsModelRecord | null>(null);
  const [completed, setCompleted] = useState(false);
  const [metricsReport, setMetricsReport] = useState<MetricsReportPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [eventIndex, setEventIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const initialState = useRef(createAiBattleState(1));
  const replayEvents = workerState.training ? training.currentReplay ?? [] : [];
  const currentEvent = replayEvents[Math.min(eventIndex, Math.max(0, replayEvents.length - 1))];
  const currentParticipants = currentEvent?.snapshot.participants ?? initialState.current.participants;

  const applyBackendPayload = (payload: BackendTrainingPayload) => {
    const backendSeconds = payload.model.summary?.trainingSeconds ?? 0;
    const isResetPayload = payload.trainingState.episodes === 0 && backendSeconds === 0 && payload.trainingState.status !== "training";
    setModel(payload.model);
    setTraining(payload.trainingState);
    setWorkerState(payload.workerState);
    setCompleted(payload.completed);
    setElapsedSeconds((current) => {
      if (isResetPayload) return 0;
      return payload.workerState.training ? Math.max(current, backendSeconds) : backendSeconds;
    });
    setEventIndex(0);
  };

  useEffect(() => {
    localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, modelId);
    let active = true;
    void fetchModel(modelId)
      .then((payload) => {
        if (!active) return;
        applyBackendPayload(payload);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "讀取訓練狀態失敗。");
      });

    const events = new EventSource(`${TRAINING_API_BASE}/api/training/models/${encodeURIComponent(modelId)}/events`);
    const handleEvent = (event: Event) => {
      if (!active) return;
      applyBackendPayload(JSON.parse((event as MessageEvent).data) as BackendTrainingPayload);
      setErrorMessage("");
    };
    events.onmessage = handleEvent;
    events.addEventListener("ready", handleEvent);
    events.addEventListener("progress", handleEvent);
    events.addEventListener("paused", handleEvent);
    events.addEventListener("saved", handleEvent);
    events.addEventListener("loaded", handleEvent);
    events.addEventListener("reset", handleEvent);
    events.addEventListener("completed", handleEvent);
    events.onerror = () => {
      if (active) setErrorMessage("訓練 SSE 連線中斷，請確認後端 PowerShell 視窗仍在執行。");
    };

    return () => {
      active = false;
      events.close();
    };
  }, [modelId]);

  useEffect(() => {
    if (!workerState.training || completed || replayEvents.length === 0) return;
    const timer = window.setInterval(() => {
      setEventIndex((current) => (current >= replayEvents.length - 1 ? current : current + 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, [completed, replayEvents, workerState.training]);

  useEffect(() => {
    if (!workerState.training) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [workerState.training]);

  const runAction = async (action: "start" | "pause" | "reset" | "save" | "load") => {
    try {
      const payload = await postModelAction(modelId, action);
      applyBackendPayload(payload);
      if (action === "reset") setMetricsReport(null);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "訓練操作失敗。");
    }
  };

  const openMetricsReport = async () => {
    try {
      const report = await fetchMetricsReport(modelId);
      setMetricsReport(report);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "曲線圖報告載入失敗。");
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative grid h-full min-h-0 grid-rows-[72px_minmax(0,1fr)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(244,63,94,0.16),transparent_32%)]" />
        <header className="relative z-10 flex items-center justify-between border-b border-slate-800/80 px-6">
          <div className="flex items-center gap-4">
            <button type="button" onClick={onBackToList} className="grid size-11 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100" aria-label="返回列表">
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">Training Run</p>
              <h1 className="text-2xl font-black leading-tight">{model?.name ?? "單局模型訓練監控"}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {workerState.training ? (
              <button type="button" onClick={() => void runAction("pause")} className="flex min-h-11 items-center gap-2 rounded-[14px] border border-amber-300/40 bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200"><Pause size={17} />暫停</button>
            ) : (
              <button type="button" onClick={() => void runAction("start")} disabled={completed} className="flex min-h-11 items-center gap-2 rounded-[14px] border border-cyan-300/40 bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-emerald-300/35 disabled:bg-emerald-300/10 disabled:text-emerald-100"><Play size={17} />{completed ? "已完成" : "開始"}</button>
            )}
            <button type="button" onClick={() => void runAction("save")} disabled={completed || workerState.saving || training.episodes <= 0} className="flex min-h-11 items-center gap-2 rounded-[14px] border border-emerald-300/35 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 transition hover:border-emerald-200/70 disabled:cursor-not-allowed disabled:opacity-45"><CheckCircle2 size={17} />完成</button>
            <button type="button" onClick={() => void openMetricsReport()} disabled={!completed} className="flex min-h-11 items-center gap-2 rounded-[14px] border border-violet-300/35 bg-violet-300/10 px-4 text-sm font-black text-violet-100 transition hover:border-violet-200/70 disabled:cursor-not-allowed disabled:opacity-45"><Activity size={17} />曲線圖</button>
            <button type="button" onClick={() => void runAction("load")} disabled={workerState.loading || !workerState.hasSavedModel} className="flex min-h-11 items-center gap-2 rounded-[14px] border border-sky-300/35 bg-sky-300/10 px-4 text-sm font-black text-sky-100 transition hover:border-sky-200/70 disabled:cursor-not-allowed disabled:opacity-45"><Database size={17} />載入</button>
            <button type="button" onClick={() => void runAction("reset")} className="flex min-h-11 items-center gap-2 rounded-[14px] border border-rose-300/35 bg-rose-300/10 px-4 text-sm font-black text-rose-100 transition hover:border-rose-200/70"><RefreshCw size={17} />重置</button>
          </div>
        </header>

        <main className="relative z-10 grid min-h-0 grid-cols-[300px_minmax(0,1fr)_300px] gap-4 p-4">
          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
            <SideStandbyArea title="Learning Side" participant={currentParticipants.player} side="player" activeEvent={currentEvent} />
            <section className="grid min-h-0 content-start rounded-[22px] border border-slate-700/70 bg-slate-950/62 p-4 shadow-[0_20px_56px_rgba(0,0,0,0.26)]">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Model Goal</p>
              <h2 className="mt-1 truncate text-xl font-black text-white">{model?.name ?? "讀取中"}</h2>
              <div className="mt-4 grid gap-3 text-sm font-bold text-slate-400">
                <div className="flex items-center justify-between gap-3"><span>難度</span>{model ? <DifficultyPill difficulty={model.difficulty} /> : <span>--</span>}</div>
                <div className="flex items-center justify-between gap-3"><span>目標</span><span className="text-right text-white">{model ? (model.goalMode === "time" ? `${model.targetTrainingMinutes} 分鐘` : `勝率 ${model.targetWinRate}%`) : "--"}</span></div>
                <div className="flex items-center justify-between gap-3"><span>最低場次</span><span className="text-white">{model?.targetEpisodes.toLocaleString() ?? "--"}</span></div>
              </div>
            </section>
          </section>

          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
            <ReplayStage event={currentEvent} initialParticipants={initialState.current.participants} training={training} elapsedSeconds={elapsedSeconds} completed={completed} />
            <div className="grid grid-cols-8 gap-3">
              <StatCard label="Episodes" value={training.episodes.toLocaleString()} icon={Activity} accent="text-cyan-200" />
              <StatCard label="近500場" value={formatRecentWinRate(training.metricHistory[training.metricHistory.length - 1]?.recentWinRate500, training.recentResults.length)} icon={Trophy} accent="text-emerald-200" />
              <StatCard label="勝率" value={`${training.winRate.toFixed(2)}%`} icon={Gauge} accent="text-emerald-200" />
              <StatCard label="平均回合" value={training.averageTurns.toFixed(1)} icon={Swords} accent="text-amber-200" />
              <StatCard label="Loss" value={training.loss.toFixed(3)} icon={BrainCircuit} accent="text-rose-200" />
              <StatCard label="Epsilon" value={training.epsilon.toFixed(2)} icon={Bot} accent="text-violet-200" />
              <StatCard label="換牌率" value={formatLearningActionRate(training.switchCount ?? 0, training.episodes, training.averageTurns)} icon={RefreshCw} accent="text-cyan-200" />
              <StatCard label="護盾率" value={formatLearningActionRate(training.shieldCount ?? 0, training.episodes, training.averageTurns)} icon={Shield} accent="text-sky-200" />
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
            <SideStandbyArea title={training.episodes < 50 ? "RandomAgent" : "RuleBasedAgent"} participant={currentParticipants.computer} side="computer" activeEvent={currentEvent} />
            <section className="grid min-h-0 content-start rounded-[22px] border border-slate-700/70 bg-slate-950/62 p-4 shadow-[0_20px_56px_rgba(0,0,0,0.26)]">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Training Summary</p>
              <h2 className="mt-1 truncate text-xl font-black text-white">訓練統計</h2>
              <div className="mt-4 grid gap-3 text-sm font-bold text-slate-400">
                <div className="flex items-center justify-between gap-3"><span>勝場</span><span className="text-right text-white">{training.wins.toLocaleString()}</span></div>
                <div className="flex items-center justify-between gap-3"><span>敗場</span><span className="text-right text-white">{training.losses.toLocaleString()}</span></div>
                <div className="flex items-center justify-between gap-3"><span>平手</span><span className="text-right text-white">{training.draws.toLocaleString()}</span></div>
              </div>
            </section>
            {errorMessage && <p className="rounded-[18px] border border-rose-300/35 bg-rose-300/10 p-4 text-sm font-black leading-6 text-rose-100">{errorMessage}</p>}
          </section>
        </main>
      </div>
      {metricsReport && <MetricsReportModal report={metricsReport} onClose={() => setMetricsReport(null)} />}
    </div>
  );
}

export default function AITrainingPage({
  onBack,
  initialScreen = "tacticsList",
  appliedModelId,
  onApplyTrainingModel,
  onRemoveAppliedTrainingModel,
}: {
  onBack: () => void;
  initialScreen?: TrainingScreen;
  appliedModelId?: string;
  onApplyTrainingModel?: (payload: TrainingModelApplyPayload) => void;
  onRemoveAppliedTrainingModel?: () => void;
}) {
  const [screen, setScreen] = useState<TrainingScreen>(initialScreen);
  const [trainingModelId, setTrainingModelId] = useState("");

  if (screen === "modeSelect") return <ModeSelect onBack={onBack} onSelectTactics={() => setScreen("tacticsList")} />;
  if (screen === "trainingRun") return <TrainingRunPage modelId={trainingModelId} onBackToList={() => setScreen("tacticsList")} />;
  return (
    <TacticsListPage
      onBack={onBack}
      appliedModelId={appliedModelId}
      onApplyTrainingModel={onApplyTrainingModel}
      onRemoveAppliedTrainingModel={onRemoveAppliedTrainingModel}
      onTrain={(id) => {
        setTrainingModelId(id);
        setScreen("trainingRun");
      }}
    />
  );
}
