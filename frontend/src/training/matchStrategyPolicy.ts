import type { BattleAction, BattleEnvState, BattleSide } from "../types/battle";

export type MatchStrategyMode = "aggressive" | "balanced" | "defensive";

export interface MatchStrategyContext {
  playerWins: number;
  computerWins: number;
  round: 1 | 2 | 3;
  side: BattleSide;
  ownTeamHpRatio?: number;
  opponentTeamHpRatio?: number;
  leading?: boolean;
  behind?: boolean;
}

export interface MatchStrategyDecision {
  mode: MatchStrategyMode;
  actionBias: Partial<Record<BattleAction["type"], number>>;
}

function getOpponentSide(side: BattleSide): BattleSide {
  return side === "player" ? "computer" : "player";
}

function teamHpRatio(state: BattleEnvState, side: BattleSide) {
  const team = state.participants[side].team;
  const current = team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
  const max = team.reduce((sum, card) => sum + card.pokemon.max_hp, 0);
  return max > 0 ? current / max : 0;
}

export function createMatchStrategyContext(state: BattleEnvState, context: MatchStrategyContext): MatchStrategyContext {
  const opponentSide = getOpponentSide(context.side);
  const ownTeamHpRatio = teamHpRatio(state, context.side);
  const opponentTeamHpRatio = teamHpRatio(state, opponentSide);
  const leading = context.side === "player" ? context.playerWins > context.computerWins : context.computerWins > context.playerWins;
  const behind = context.side === "player" ? context.playerWins < context.computerWins : context.computerWins < context.playerWins;
  return { ...context, ownTeamHpRatio, opponentTeamHpRatio, leading, behind };
}

export function decideMatchStrategy(state: BattleEnvState, context: MatchStrategyContext): MatchStrategyDecision {
  const opponentSide = getOpponentSide(context.side);
  const ownHpRatio = context.ownTeamHpRatio ?? teamHpRatio(state, context.side);
  const opponentHpRatio = context.opponentTeamHpRatio ?? teamHpRatio(state, opponentSide);
  const leading = context.leading ?? (context.side === "player" ? context.playerWins > context.computerWins : context.computerWins > context.playerWins);
  const behind = context.behind ?? (context.side === "player" ? context.playerWins < context.computerWins : context.computerWins < context.playerWins);

  if (leading && ownHpRatio >= opponentHpRatio * 0.85) {
    return {
      mode: "defensive",
      actionBias: { shield: 0.12, switch: 0.1, rest: 0.08, skill: -0.04 },
    };
  }

  if (behind || opponentHpRatio <= 0.42) {
    return {
      mode: "aggressive",
      actionBias: { skill: 0.12, basic_attack: 0.08, rest: -0.08, shield: -0.04 },
    };
  }

  return {
    mode: "balanced",
    actionBias: { skill: 0.04, basic_attack: 0.04, switch: 0.04, shield: 0.04, rest: 0.02 },
  };
}
