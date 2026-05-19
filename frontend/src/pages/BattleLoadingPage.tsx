import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { BattleLoadingBar } from "../components/battle-loading/BattleLoadingBar";
import { BattleTeamCard } from "../components/battle-loading/BattleTeamCard";
import { VersusCore } from "../components/battle-loading/VersusCore";
import type { BattleCardState, BattleParticipant } from "../types/battle";
import { DEFAULT_STAMINA, getBattleEnabledPokemon } from "../utils/battleCalculator";

function createFallbackTeam(offset = 0): BattleCardState[] {
  return getBattleEnabledPokemon()
    .slice(offset, offset + 3)
    .map((pokemon) => ({
      pokemon,
      currentHp: pokemon.max_hp,
      currentStamina: DEFAULT_STAMINA,
      maxStamina: DEFAULT_STAMINA,
    }));
}

function TeamFan({
  title,
  subtitle,
  team,
  side,
}: {
  title: string;
  subtitle: string;
  team: BattleCardState[];
  side: "player" | "computer";
}) {
  const positionClass =
    side === "player"
      ? "left-4 top-1/2 origin-left -translate-y-1/2 scale-[0.78] md:left-8 md:scale-[0.86] xl:left-12 xl:scale-100"
      : "right-4 top-1/2 origin-right -translate-y-1/2 scale-[0.78] md:right-8 md:scale-[0.86] xl:right-12 xl:scale-100";

  return (
    <section className={["absolute z-10", positionClass].join(" ")}>
      <motion.div initial={{ opacity: 0, x: side === "player" ? -24 : 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }} className={side === "player" ? "text-left" : "text-right"}>
        <p className={["text-3xl font-black text-white", side === "player" ? "drop-shadow-[0_0_24px_rgba(34,211,238,0.65)]" : "drop-shadow-[0_0_24px_rgba(244,63,94,0.65)]"].join(" ")}>
          {title}
        </p>
        <p className={["mt-1 text-xs font-black uppercase tracking-[0.32em]", side === "player" ? "text-cyan-100" : "text-rose-100"].join(" ")}>
          {subtitle}
        </p>
      </motion.div>

      <div className={["mt-6 flex items-center -space-x-10", side === "player" ? "" : "flex-row-reverse space-x-reverse"].join(" ")}>
        {team.map((card, index) => (
          <BattleTeamCard key={`${side}-${card.pokemon.id}`} card={card} side={side === "player" ? "player" : "computer"} index={index} />
        ))}
      </div>
    </section>
  );
}

export default function BattleLoadingPage({
  playerTeam,
  enemyTeam,
  roundLabel = "一般模式",
  playerWins = 0,
  computerWins = 0,
  onComplete,
}: {
  playerTeam?: BattleParticipant["team"];
  enemyTeam?: BattleParticipant["team"];
  roundLabel?: string;
  playerWins?: number;
  computerWins?: number;
  onComplete?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const resolvedPlayerTeam = useMemo(() => (playerTeam?.length ? playerTeam : createFallbackTeam(0)), [playerTeam]);
  const resolvedEnemyTeam = useMemo(() => (enemyTeam?.length ? enemyTeam : createFallbackTeam(3)), [enemyTeam]);

  useEffect(() => {
    if (progress >= 100) {
      const completeTimer = window.setTimeout(() => {
        onComplete?.();
      }, 700);
      return () => window.clearTimeout(completeTimer);
    }

    const timer = window.setTimeout(() => {
      setProgress((current) => Math.min(100, current + Math.max(2, Math.round((100 - current) * 0.12))));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [onComplete, progress]);

  return (
    <motion.main className="relative h-screen overflow-hidden bg-slate-950 text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }}>
      <div className="arena-grid pointer-events-none absolute inset-0 opacity-45" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,206,0.26)_0%,rgba(2,6,23,0.58)_43%,rgba(206,0,0,0.26)_100%)]" />
      <div className="pointer-events-none absolute -left-28 -top-32 h-[560px] w-[560px] rounded-full bg-cyan-400/22 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-36 -right-24 h-[620px] w-[620px] rounded-full bg-rose-600/24 blur-3xl" />

      <div className="absolute left-8 top-8 z-30 text-5xl font-black leading-none text-cyan-100 drop-shadow-[0_0_22px_rgba(34,211,238,0.5)]">
        {playerWins}
      </div>
      <div className="absolute right-8 top-8 z-30 text-5xl font-black leading-none text-rose-100 drop-shadow-[0_0_22px_rgba(244,63,94,0.5)]">
        {computerWins}
      </div>

      <motion.div className="absolute inset-x-0 top-8 z-30 mx-auto w-full max-w-xl text-center" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Normal Battle</p>
        <h1 className="mt-2 text-4xl font-black text-white drop-shadow-[0_0_28px_rgba(255,255,255,0.28)]">{roundLabel}</h1>
      </motion.div>

      <TeamFan title="玩家隊伍" subtitle="PLAYER TEAM" team={resolvedPlayerTeam.slice(0, 3)} side="player" />
      <TeamFan title="敵方隊伍" subtitle="ENEMY TEAM" team={resolvedEnemyTeam.slice(0, 3)} side="computer" />

      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <VersusCore />
      </div>

      <div className="absolute bottom-10 left-1/2 z-30 -translate-x-1/2">
        <BattleLoadingBar progress={progress} />
      </div>
    </motion.main>
  );
}
