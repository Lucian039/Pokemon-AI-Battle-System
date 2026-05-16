import { motion } from "framer-motion";

export function VersusCore() {
  return (
    <div className="relative grid h-72 w-72 place-items-center">
      <motion.div
        className="absolute inset-0 rounded-full border border-cyan-300/25"
        animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.35, 0.85, 0.35] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-8 rounded-full border border-rose-400/25"
        animate={{ scale: [1.08, 0.92, 1.08], opacity: [0.75, 0.3, 0.75] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute h-px w-[520px] rotate-[-28deg] bg-gradient-to-r from-cyan-300/0 via-cyan-300/55 to-rose-500/0" />
      <div className="absolute h-px w-[520px] rotate-[-28deg] translate-y-3 bg-gradient-to-r from-cyan-300/0 via-rose-500/55 to-rose-500/0" />
      <motion.div
        className="relative grid h-40 w-40 place-items-center rounded-full border border-white/10 bg-slate-950/55 shadow-[0_0_80px_rgba(34,211,238,0.22)] backdrop-blur-xl"
        animate={{
          boxShadow: [
            "0 0 54px rgba(34,211,238,0.26), 0 0 80px rgba(244,63,94,0.10)",
            "0 0 74px rgba(244,63,94,0.24), 0 0 96px rgba(34,211,238,0.15)",
            "0 0 54px rgba(34,211,238,0.26), 0 0 80px rgba(244,63,94,0.10)",
          ],
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <p className="bg-gradient-to-r from-cyan-100 via-white to-rose-100 bg-clip-text text-6xl font-black tracking-[0.04em] text-transparent">
          VS
        </p>
      </motion.div>
    </div>
  );
}
