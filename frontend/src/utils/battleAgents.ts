import { canUseSkill, getPokemonSkills, getSkillById, getTypeMultiplier } from "./battleCalculator";
import { createBasicAttackSkill } from "./battleEngine";
import type { BattleAction, BattleAgent, BattleCardState, BattleEnvState, BattleSide, Skill } from "../types/battle";

function getOpponentSide(side: BattleSide): BattleSide {
  return side === "player" ? "computer" : "player";
}

function getActiveCard(state: BattleEnvState, side: BattleSide) {
  const participant = state.participants[side];
  return participant.team[participant.activeIndex];
}

function getActionSkill(action: BattleAction): Skill | undefined {
  return action.type === "skill" ? getSkillById(action.skillId) : undefined;
}

function getExpectedDamageScore(active: BattleCardState, defender: BattleCardState, skill: Skill) {
  if (skill.category !== "attack") return 0;
  return skill.power * (active.pokemon.attack / defender.pokemon.defense) * getTypeMultiplier(skill.type, defender.pokemon.types) * (skill.accuracy / 100);
}

function getBestAttackScore(active: BattleCardState, defender: BattleCardState) {
  return getPokemonSkills(active.pokemon)
    .filter((skill) => skill.category === "attack" && canUseSkill(active, skill))
    .map((skill) => getExpectedDamageScore(active, defender, skill))
    .reduce((best, score) => Math.max(best, score), 0);
}

function getSwitchCandidate(participantTeam: BattleCardState[], activeIndex: number, opponent: BattleCardState) {
  const active = participantTeam[activeIndex];
  const activeHpRatio = active.currentHp / active.pokemon.max_hp;
  const activeScore = getBestAttackScore(active, opponent) - getBestAttackScore(opponent, active) * 0.55 + activeHpRatio * 24;

  return participantTeam
    .map((card, index) => {
      const hpRatio = card.currentHp / card.pokemon.max_hp;
      return {
        index,
        score: getBestAttackScore(card, opponent) - getBestAttackScore(opponent, card) * 0.55 + hpRatio * 24,
        hpRatio,
      };
    })
    .filter((candidate) => candidate.index !== activeIndex && participantTeam[candidate.index].currentHp > 0)
    .sort((left, right) => right.score - left.score)
    .find((candidate) => activeHpRatio <= 0.34 || candidate.score >= activeScore + 18);
}

export const RandomAgent: BattleAgent = {
  name: "RandomAgent",
  selectAction: (_state, legalActions) => legalActions[Math.floor(Math.random() * legalActions.length)] ?? { type: "rest" },
};

export const RuleBasedAgent: BattleAgent = {
  name: "RuleBasedAgent",
  selectAction: (state, legalActions) => {
    const side = state.turn;
    const opponentSide = getOpponentSide(side);
    const participant = state.participants[side];
    const active = getActiveCard(state, side);
    const opponent = getActiveCard(state, opponentSide);
    const skillActions = legalActions.filter((action) => action.type === "skill");
    const switchActions = legalActions.filter((action) => action.type === "switch");
    const shieldAction = legalActions.find((action) => action.type === "shield");
    const basicAttackAction = legalActions.find((action) => action.type === "basic_attack");
    const restAction = legalActions.find((action) => action.type === "rest") ?? { type: "rest" as const };

    const switchCandidate = getSwitchCandidate(participant.team, participant.activeIndex, opponent);
    const switchAction = switchCandidate ? switchActions.find((action) => action.targetIndex === switchCandidate.index) : undefined;
    if (switchAction && (active.currentHp <= active.pokemon.max_hp * 0.34 || switchCandidate!.score > 28)) return switchAction;

    const healAction = skillActions.find((action) => {
      const skill = getActionSkill(action);
      if (!skill || skill.category !== "heal") return false;
      const target = participant.team[action.targetIndex ?? participant.activeIndex];
      return target.currentHp > 0 && target.pokemon.max_hp - target.currentHp >= Math.round(target.pokemon.max_hp * 0.18);
    });
    if (healAction) return healAction;

    const skillShieldAction = skillActions.find((action) => {
      const skill = getActionSkill(action);
      const incomingThreat = getBestAttackScore(opponent, active);
      return skill?.category === "shield" && (active.currentHp <= active.pokemon.max_hp * 0.58 || incomingThreat >= active.currentHp * 0.42) && (active.shieldTurns ?? 0) <= 0;
    });
    const incomingThreat = getBestAttackScore(opponent, active);
    if (shieldAction && (active.currentHp <= active.pokemon.max_hp * 0.5 || incomingThreat >= active.currentHp * 0.38) && (active.shieldTurns ?? 0) <= 0) return shieldAction;
    if (skillShieldAction) return skillShieldAction;

    const attackCandidates: Array<{ action: BattleAction; skill: Skill }> = [];
    skillActions.forEach((action) => {
      const skill = getActionSkill(action);
      if (skill?.category === "attack" && canUseSkill(active, skill)) attackCandidates.push({ action, skill });
    });
    const bestAttack = attackCandidates.sort((a, b) => getExpectedDamageScore(active, opponent, b.skill) - getExpectedDamageScore(active, opponent, a.skill))[0];
    if (bestAttack) return bestAttack.action;

    if (basicAttackAction) {
      const basicScore = getExpectedDamageScore(active, opponent, createBasicAttackSkill(active));
      if (basicScore >= 10 || active.currentStamina < 30) return basicAttackAction;
    }

    const setupAction = skillActions.find((action) => {
      const skill = getActionSkill(action);
      return skill?.category === "buff" || skill?.category === "debuff";
    });
    if (setupAction) return setupAction;

    if (active.currentStamina < 30) return restAction;
    return switchActions[0] ?? restAction;
  },
};
