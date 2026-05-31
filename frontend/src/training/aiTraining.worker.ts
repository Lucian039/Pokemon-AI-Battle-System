import { RandomAgent, RuleBasedAgent } from "../utils/battleAgents";
import { LearningAgent } from "./learningAgent";
import { createInitialTrainingState, reduceTrainingState, runTrainingEpisode } from "./trainingLoop";
import type { TrainingModelMetadata, TrainingState, TrainingWorkerRequest, TrainingWorkerResponse, TrainingWorkerState } from "../types/battle";

const MODEL_KEY = "indexeddb://pokemon-battle-tactics-v1";
const METADATA_DB_NAME = "pokemon-ai-training";
const METADATA_STORE_NAME = "metadata";
const METADATA_KEY = "battle-tactics-v1";

let learningAgent = new LearningAgent();
let trainingState: TrainingState = createInitialTrainingState();
let workerState: TrainingWorkerState = { training: false, saving: false, loading: false, hasSavedModel: false, saveStatus: "unsaved" };
let runningEpisode = false;

function post(message: TrainingWorkerResponse) {
  self.postMessage(message);
}

function updateWorkerState(next: Partial<TrainingWorkerState>) {
  workerState = { ...workerState, ...next };
}

function openMetadataDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(METADATA_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) db.createObjectStore(METADATA_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("無法開啟訓練 metadata IndexedDB。"));
  });
}

async function saveMetadata(metadata: TrainingModelMetadata) {
  const db = await openMetadataDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(METADATA_STORE_NAME, "readwrite");
    tx.objectStore(METADATA_STORE_NAME).put(metadata, METADATA_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("metadata 保存失敗。"));
  });
  db.close();
}

async function loadMetadata(): Promise<TrainingModelMetadata | undefined> {
  const db = await openMetadataDb();
  const result = await new Promise<TrainingModelMetadata | undefined>((resolve, reject) => {
    const tx = db.transaction(METADATA_STORE_NAME, "readonly");
    const request = tx.objectStore(METADATA_STORE_NAME).get(METADATA_KEY);
    request.onsuccess = () => resolve(request.result as TrainingModelMetadata | undefined);
    request.onerror = () => reject(request.error ?? new Error("metadata 載入失敗。"));
  });
  db.close();
  return result;
}

async function refreshSavedModelStatus() {
  try {
    updateWorkerState({ hasSavedModel: await learningAgent.hasSavedModel(MODEL_KEY) });
  } catch {
    updateWorkerState({ hasSavedModel: false });
  }
}

async function runNextEpisode() {
  if (!workerState.training || runningEpisode) return;
  runningEpisode = true;
  try {
    const episodeCount = trainingState.episodes;
    const result = await runTrainingEpisode({
      learningAgent,
      opponentAgent: episodeCount < 50 ? RandomAgent : RuleBasedAgent,
      learningSide: "player",
      seed: Date.now() + episodeCount,
      playerWins: trainingState.wins,
      computerWins: trainingState.losses,
      round: ((trainingState.episodes % 3) + 1) as 1 | 2 | 3,
      shouldStop: () => !workerState.training,
    });

    if (result.aborted) {
      trainingState = { ...trainingState, status: "paused", currentReplay: result.events.length > 0 ? result.events : trainingState.currentReplay };
      updateWorkerState({ training: false });
      post({ type: "paused", state: trainingState, workerState });
      return;
    }

    trainingState = { ...reduceTrainingState(trainingState, result, learningAgent.epsilon, "player"), status: workerState.training ? "training" : "paused" };
    post({ type: "progress", state: trainingState, workerState });
  } catch (error) {
    updateWorkerState({ training: false });
    trainingState = { ...trainingState, status: "paused" };
    post({ type: "error", message: error instanceof Error ? error.message : "背景訓練失敗。", state: trainingState, workerState });
  } finally {
    runningEpisode = false;
    if (workerState.training) setTimeout(() => void runNextEpisode(), 20);
  }
}

async function startTraining() {
  updateWorkerState({ training: true });
  trainingState = { ...trainingState, status: "training" };
  post({ type: "progress", state: trainingState, workerState });
  await runNextEpisode();
}

function pauseTraining() {
  updateWorkerState({ training: false });
  trainingState = { ...trainingState, status: "paused" };
  post({ type: "paused", state: trainingState, workerState });
}

function resetTraining() {
  updateWorkerState({ training: false, saving: false, loading: false });
  learningAgent.reset();
  trainingState = createInitialTrainingState();
  post({ type: "reset", state: trainingState, workerState });
}

async function saveTraining() {
  updateWorkerState({ saving: true });
  post({ type: "progress", state: trainingState, workerState });
  try {
    const metadata: TrainingModelMetadata = { version: "battle-tactics-v3-rules", savedAt: new Date().toISOString(), trainingState, epsilon: learningAgent.epsilon, replayBuffer: learningAgent.exportReplayBuffer() };
    await learningAgent.saveModel(MODEL_KEY);
    learningAgent.setMetadata(metadata);
    await saveMetadata(metadata);
    updateWorkerState({ saving: false, hasSavedModel: true, saveStatus: "saved" });
    post({ type: "saved", state: trainingState, workerState });
  } catch (error) {
    updateWorkerState({ saving: false, saveStatus: "failed" });
    post({ type: "error", message: error instanceof Error ? error.message : "模型保存失敗。", state: trainingState, workerState });
  }
}

async function loadTraining() {
  updateWorkerState({ loading: true });
  post({ type: "progress", state: trainingState, workerState });
  try {
    await learningAgent.loadModel(MODEL_KEY);
    const metadata = await loadMetadata();
    if (metadata) {
      learningAgent.setMetadata(metadata);
      learningAgent.importReplayBuffer(metadata.replayBuffer);
      trainingState = { ...metadata.trainingState, status: "paused" };
    }
    updateWorkerState({ loading: false, hasSavedModel: true, saveStatus: "loaded", training: false });
    post({ type: "loaded", state: trainingState, workerState });
  } catch (error) {
    updateWorkerState({ loading: false, saveStatus: "failed" });
    post({ type: "error", message: error instanceof Error ? error.message : "模型載入失敗。", state: trainingState, workerState });
  }
}

self.onmessage = (event: MessageEvent<TrainingWorkerRequest>) => {
  const message = event.data;
  if (message.type === "start") void startTraining();
  if (message.type === "pause") pauseTraining();
  if (message.type === "reset") resetTraining();
  if (message.type === "save") void saveTraining();
  if (message.type === "load") void loadTraining();
  if (message.type === "status") post({ type: "ready", state: trainingState, workerState });
};

void refreshSavedModelStatus().then(() => {
  post({ type: "ready", state: trainingState, workerState });
});
