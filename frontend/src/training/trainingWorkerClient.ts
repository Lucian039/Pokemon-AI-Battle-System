import type { TrainingWorkerRequest, TrainingWorkerResponse } from "../types/battle";

type TrainingWorkerListener = (message: TrainingWorkerResponse) => void;

let worker: Worker | null = null;
let latestMessage: TrainingWorkerResponse | null = null;
const listeners = new Set<TrainingWorkerListener>();

function notify(message: TrainingWorkerResponse) {
  latestMessage = message;
  listeners.forEach((listener) => listener(message));
}

export function ensureTrainingWorker() {
  if (worker) return worker;

  worker = new Worker(new URL("./aiTraining.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<TrainingWorkerResponse>) => {
    notify(event.data);
  };
  worker.onerror = (event) => {
    notify({ type: "error", message: event.message || "背景訓練 Worker 發生錯誤" });
  };
  return worker;
}

export function postTrainingWorkerMessage(message: TrainingWorkerRequest) {
  ensureTrainingWorker().postMessage(message);
}

export function subscribeTrainingWorker(listener: TrainingWorkerListener) {
  listeners.add(listener);
  ensureTrainingWorker();

  if (latestMessage) listener(latestMessage);
  postTrainingWorkerMessage({ type: "status" });

  return () => {
    listeners.delete(listener);
  };
}
