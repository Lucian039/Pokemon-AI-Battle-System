import { motion } from "framer-motion";

export function BattleLoadingBar({ progress }: { progress: number }) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="w-[min(560px,calc(100vw-48px))]">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-lg font-black text-white">準備戰鬥中...</p>
          <p className="mt-1 text-xs font-bold text-slate-400">載入隊伍資料與戰場狀態</p>
        </div>
        <span className="text-2xl font-black text-cyan-100">{safeProgress}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full border border-cyan-300/25 bg-slate-950/80 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-blue-500 to-rose-500" initial={{ width: "0%" }} animate={{ width: `${safeProgress}%` }} transition={{ duration: 0.35, ease: "easeOut" }} />
      </div>
    </div>
  );
}
