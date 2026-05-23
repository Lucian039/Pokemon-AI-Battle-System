import {
  calculateDamage,
  canUseSkill,
  DEFAULT_STAMINA,
  getBattleEnabledPokemon,
  getBurnDamage,
  getPokemonSkills,
  getSkillById,
  getSkillStaminaCost,
  healBattleCard,
  recoverStamina,
  REST_STAMINA_RECOVERY,
  TURN_STAMINA_RECOVERY,
} from "./battleCalculator";
import type {
  BattleAction,
  BattleAgent,
  BattleCardState,
  BattleEnvState,
  BattleParticipant,
  BattleReplayEvent,
  BattleSide,
  PokemonStats,
  Skill,
} from "../types/battle";

export const AI_BATTLE_TEAM_SIZE = 3;
export const AI_BATTLE_MAX_TURNS = 80;
export const BASIC_ATTACK_POWER = 30;
export const BASIC_ATTACK_STAMINA_COST = 10;

function getPokemonLabel(pokemon: PokemonStats) {
  return pokemon.name_zh || pokemon.name;
}

function getSkillLabel(skill: Skill) {
  return skill.name_zh || skill.name;
}

function createBattleCard(pokemon: PokemonStats): BattleCardState {
  return {
    pokemon,
    currentHp: pokemon.max_hp,
    currentStamina: DEFAULT_STAMINA,
    maxStamina: DEFAULT_STAMINA,
  };
}

export function createBasicAttackSkill(card: BattleCardState): Skill {
  return {
    id: "basic_attack",
    name: "Basic Attack",
    name_zh: "普通攻擊",
    type: card.pokemon.types[0] ?? "Normal",
    category: "attack",
    power: BASIC_ATTACK_POWER,
    accuracy: 100,
    effect: "none",
    target: "enemy",
    description_zh: "以目前出戰寶可夢的主要屬性進行基礎攻擊。",
  };
}

export function createShieldActionSkill(card: BattleCardState): Skill {
  return {
    id: "shield_action",
    name: "Shield",
    name_zh: "護盾",
    type: card.pokemon.types[0] ?? "Normal",
    category: "shield",
    power: 0,
    accuracy: 100,
    effect: "shield_self",
    target: "self",
    description_zh: "本次啟動護盾，下一次受到傷害降低 50%。",
  };
}

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  return {
    activeIndex: participant.activeIndex,
    team: participant.team.map((card) => ({ ...card })),
  };
}

export function cloneBattleState(state: BattleEnvState): BattleEnvState {
  return {
    ...state,
    participants: {
      player: cloneParticipant(state.participants.player),
      computer: cloneParticipant(state.participants.computer),
    },
  };
}

function getLivingIndexes(participant: BattleParticipant) {
  return participant.team.flatMap((card, index) => (card.currentHp > 0 ? [index] : []));
}

function getActiveCard(state: BattleEnvState, side: BattleSide) {
  const participant = state.participants[side];
  return participant.team[participant.activeIndex];
}

function getOpponentSide(side: BattleSide): BattleSide {
  return side === "player" ? "computer" : "player";
}

function getTeamHp(participant: BattleParticipant) {
  return participant.team.reduce((sum, card) => sum + Math.max(0, card.currentHp), 0);
}

function isTeamDefeated(participant: BattleParticipant) {
  return participant.team.every((card) => card.currentHp <= 0);
}

function clearPositiveBattleBuffs(card: BattleCardState) {
  card.attackBoostTurns = 0;
  card.defenseBoostTurns = 0;
  card.speedBoostTurns = 0;
}

function consumeActionBlocker(card: BattleCardState) {
  if ((card.asleepTurns ?? 0) > 0) {
    card.asleepTurns = 0;
    return "睡眠中，這次行動失敗。";
  }

  if ((card.paralyzedTurns ?? 0) > 0) {
    card.paralyzedTurns = 0;
    if (Math.random() < 0.25) return "受到麻痺影響，這次行動失敗。";
  }

  return "";
}

function getAttackBoostStack(card: BattleCardState) {
  return Math.max(0, Math.min(3, card.attackBoostTurns ?? 0));
}

function getAttackBoostMultiplier(stack: number) {
  if (stack >= 3) return 1.8;
  if (stack === 2) return 1.65;
  if (stack === 1) return 1.5;
  return 1;
}

function getDefenseBoostStack(card: BattleCardState) {
  return Math.max(0, Math.min(2, card.defenseBoostTurns ?? 0));
}

function getDefenseBoostMultiplier(stack: number) {
  if (stack >= 2) return 1.65;
  if (stack === 1) return 1.5;
  return 1;
}

function pickTeam(pool: PokemonStats[], startIndex: number) {
  const uniquePool = pool.filter((pokemon) => pokemon.skill_ids.length > 0);
  return Array.from({ length: AI_BATTLE_TEAM_SIZE }, (_, offset) => uniquePool[(startIndex + offset) % uniquePool.length]).map(createBattleCard);
}

export function createAiBattleState(seed = Date.now()): BattleEnvState {
  const pool = getBattleEnabledPokemon().sort((a, b) => a.id - b.id);
  const playerStart = Math.abs(seed) % Math.max(1, pool.length - AI_BATTLE_TEAM_SIZE);
  const computerStart = (playerStart + 17) % Math.max(1, pool.length - AI_BATTLE_TEAM_SIZE);

  return {
    participants: {
      player: { team: pickTeam(pool, playerStart), activeIndex: 0 },
      computer: { team: pickTeam(pool, computerStart), activeIndex: 0 },
    },
    turn: "player",
    turnNumber: 1,
  };
}

export function getLegalActions(state: BattleEnvState, side = state.turn): BattleAction[] {
  if (state.winner || state.isDraw) return [];

  const participant = state.participants[side];
  const active = participant.team[participant.activeIndex];
  if (!active || active.currentHp <= 0) return [];

  const skillActions = getPokemonSkills(active.pokemon)
    .filter((skill) => canUseSkill(active, skill))
    .flatMap<BattleAction>((skill) => {
      if (skill.target === "ally") {
        return participant.team.flatMap((card, index) => (card.currentHp > 0 ? [{ type: "skill", skillId: skill.id, targetSide: side, targetIndex: index }] : []));
      }

      return [{ type: "skill", skillId: skill.id }];
    });

  const tacticalActions: BattleAction[] = [];
  if (active.currentStamina >= BASIC_ATTACK_STAMINA_COST) tacticalActions.push({ type: "basic_attack" });
  if ((active.shieldTurns ?? 0) <= 0) tacticalActions.push({ type: "shield" });
  const switchActions = participant.team.flatMap<BattleAction>((card, index) => (index !== participant.activeIndex && card.currentHp > 0 ? [{ type: "switch", targetIndex: index }] : []));
  return [...skillActions, ...tacticalActions, { type: "rest" }, ...switchActions];
}

function applySimpleEffect(skill: Skill, attacker: BattleCardState, defender: BattleCardState, messageParts: string[]) {
  if (skill.effect === "shield_self") {
    attacker.shieldTurns = Math.max(attacker.shieldTurns ?? 0, 1);
    messageParts.push(`${getPokemonLabel(attacker.pokemon)} 展開護盾`);
  }
  if (skill.effect === "raise_attack") {
    attacker.attackBoostTurns = Math.min(3, getAttackBoostStack(attacker) + 1);
    messageParts.push(`${getPokemonLabel(attacker.pokemon)} 攻擊提升`);
  }
  if (skill.effect === "raise_defense") {
    attacker.defenseBoostTurns = Math.min(2, getDefenseBoostStack(attacker) + 1);
    messageParts.push(`${getPokemonLabel(attacker.pokemon)} 防禦提升`);
  }
  if (skill.effect === "raise_speed") {
    attacker.speedBoostTurns = 1;
    messageParts.push(`${getPokemonLabel(attacker.pokemon)} 速度提升`);
  }
  if (skill.effect === "lower_attack") {
    defender.attackDownTurns = 1;
    messageParts.push(`${getPokemonLabel(defender.pokemon)} 攻擊降低`);
  }
  if (skill.effect === "lower_defense") {
    defender.defenseDownTurns = 1;
    messageParts.push(`${getPokemonLabel(defender.pokemon)} 防禦降低`);
  }
  if (skill.effect === "lower_speed") {
    defender.speedDownTurns = 1;
    messageParts.push(`${getPokemonLabel(defender.pokemon)} 速度降低`);
  }
  if (skill.effect === "paralyze" && defender.currentHp > 0) {
    defender.paralyzedTurns = 1;
    messageParts.push(`${getPokemonLabel(defender.pokemon)} 陷入麻痺`);
  }
  if (skill.effect === "sleep" && defender.currentHp > 0) {
    defender.asleepTurns = 1;
    messageParts.push(`${getPokemonLabel(defender.pokemon)} 睡著了`);
  }
}

function applyAttackDamage(attacker: BattleCardState, defender: BattleCardState, skill: Skill, messageParts: string[]) {
  const result = calculateDamage(attacker.pokemon, defender.pokemon, skill);
  let damage = result.damage;

  if (!result.isHit) {
    messageParts.push("沒有命中");
    return { damage: 0, isHit: false, typeMultiplier: result.typeMultiplier };
  }

  if (damage > 0) {
    const attackBoostStack = getAttackBoostStack(attacker);
    if (attackBoostStack > 0) {
      damage = Math.round(damage * getAttackBoostMultiplier(attackBoostStack));
      attacker.attackBoostTurns = 0;
      messageParts.push("攻擊提升效果發動");
    }

    if ((attacker.attackDownTurns ?? 0) > 0) {
      damage = Math.max(1, Math.round(damage * 0.8));
      attacker.attackDownTurns = 0;
      messageParts.push("攻擊降低效果發動");
    }

    if ((defender.defenseDownTurns ?? 0) > 0) {
      damage = Math.round(damage * 1.15);
      defender.defenseDownTurns = 0;
      messageParts.push("防禦降低效果發動");
    }

    const defenseBoostStack = getDefenseBoostStack(defender);
    if (defenseBoostStack > 0) {
      damage = Math.max(1, Math.round(damage / getDefenseBoostMultiplier(defenseBoostStack)));
      defender.defenseBoostTurns = 0;
      messageParts.push("防禦提升效果發動");
    }

    if ((defender.shieldTurns ?? 0) > 0) {
      damage = Math.max(1, Math.floor(damage * 0.5));
      defender.shieldTurns = 0;
      messageParts.push("護盾吸收了部分傷害");
    }

    const lowHpBoostTypes: Partial<Record<string, Skill["type"]>> = { overgrow: "Grass", blaze: "Fire", torrent: "Water" };
    const lowHpBoostType = lowHpBoostTypes[attacker.pokemon.ability_id];
    if (lowHpBoostType && skill.type === lowHpBoostType && attacker.currentHp <= attacker.pokemon.max_hp / 3) damage = Math.round(damage * 1.2);
    if (attacker.pokemon.ability_id === "adaptability" && attacker.pokemon.types.includes(skill.type)) damage = Math.round(damage * 1.12);
    if (attacker.pokemon.ability_id === "technician" && skill.power <= 50) damage = Math.round(damage * 1.2);
    if (attacker.pokemon.ability_id === "guts" && attacker.currentHp <= attacker.pokemon.max_hp / 2) damage = Math.round(damage * 1.12);
    if (attacker.pokemon.ability_id === "inner_focus" && attacker.currentHp >= attacker.pokemon.max_hp / 2) damage = Math.round(damage * 1.08);
    if (attacker.pokemon.ability_id === "sand_stream" && attacker.currentHp >= attacker.pokemon.max_hp / 2 && (skill.type === "Rock" || skill.type === "Dark")) damage = Math.round(damage * 1.1);
    if (attacker.pokemon.ability_id === "static" && skill.type === "Electric" && attacker.pokemon.speed > defender.pokemon.speed) damage += 8;

    if (defender.pokemon.ability_id === "cute_charm" && attacker.pokemon.attack > defender.pokemon.defense) damage = Math.max(1, Math.round(damage * 0.92));
    if (defender.pokemon.ability_id === "intimidate" && attacker.pokemon.attack > defender.pokemon.attack) damage = Math.max(1, Math.round(damage * 0.9));
    if (defender.pokemon.ability_id === "thick_fat" && (skill.type === "Fire" || skill.type === "Ice")) damage = Math.max(1, Math.round(damage * 0.8));
    if (defender.pokemon.ability_id === "pressure" && attacker.currentHp > defender.currentHp) damage = Math.max(1, Math.round(damage * 0.92));
    if (defender.pokemon.ability_id === "sand_veil" && defender.currentHp <= defender.pokemon.max_hp / 2) damage = Math.max(1, Math.round(damage * 0.92));
    if (defender.pokemon.ability_id === "cursed_body" && Math.random() < 0.2) damage = Math.max(1, Math.round(damage * 0.75));

    if (defender.pokemon.ability_id === "sturdy" && !defender.abilityUsed && defender.currentHp === defender.pokemon.max_hp && damage >= defender.currentHp) {
      damage = Math.max(0, defender.currentHp - 1);
      defender.abilityUsed = true;
    }
  }

  defender.currentHp = Math.max(0, defender.currentHp - damage);
  applySimpleEffect(skill, attacker, defender, messageParts);

  if (skill.effect === "burn" && defender.currentHp > 0) {
    const burnDamage = Math.min(defender.currentHp, getBurnDamage(defender));
    defender.currentHp = Math.max(0, defender.currentHp - burnDamage);
    messageParts.push(`灼傷追加 ${burnDamage} 傷害`);
  }

  if (damage > 0 && defender.pokemon.ability_id === "synchronize" && damage > defender.pokemon.max_hp * 0.15 && attacker.currentHp > 0) {
    const recoilDamage = Math.max(1, Math.round(damage * 0.08));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoilDamage);
    messageParts.push(`同步反彈 ${recoilDamage} 傷害`);
  }

  if (attacker.pokemon.ability_id === "natural_cure" && attacker.currentHp > 0 && attacker.currentHp <= attacker.pokemon.max_hp / 2) {
    const healAmount = healBattleCard(attacker, 0.06);
    if (healAmount > 0) messageParts.push(`自然回復 ${healAmount} HP`);
  }

  messageParts.push(`造成 ${damage} 傷害`);
  return { damage, isHit: true, typeMultiplier: result.typeMultiplier };
}

function buildSnapshot(state: BattleEnvState) {
  return {
    participants: {
      player: cloneParticipant(state.participants.player),
      computer: cloneParticipant(state.participants.computer),
    },
    turn: state.turn,
    turnNumber: state.turnNumber,
  };
}

function resolveWinner(state: BattleEnvState, maxTurns: number) {
  const playerDefeated = isTeamDefeated(state.participants.player);
  const computerDefeated = isTeamDefeated(state.participants.computer);
  if (playerDefeated && computerDefeated) return { isDraw: true };
  if (playerDefeated) return { winner: "computer" as BattleSide };
  if (computerDefeated) return { winner: "player" as BattleSide };

  if (state.turnNumber > maxTurns) {
    const playerHp = getTeamHp(state.participants.player);
    const computerHp = getTeamHp(state.participants.computer);
    if (playerHp === computerHp) return { isDraw: true };
    return { winner: playerHp > computerHp ? ("player" as BattleSide) : ("computer" as BattleSide) };
  }

  return {};
}

export function stepBattle(state: BattleEnvState, action: BattleAction, maxTurns = AI_BATTLE_MAX_TURNS): { state: BattleEnvState; event: BattleReplayEvent } {
  const nextState = cloneBattleState(state);
  const actor = nextState.turn;
  const opponent = getOpponentSide(actor);
  const actorParticipant = nextState.participants[actor];
  const opponentParticipant = nextState.participants[opponent];
  let actorCard = getActiveCard(nextState, actor);
  let opponentCard = getActiveCard(nextState, opponent);
  let actionLabel = "休息";
  let message = "";
  let damage = 0;
  let healing = 0;
  let skillName: string | undefined;
  let skipHandoff = false;

  if (action.type !== "switch" && action.type !== "rest") {
    const blockedMessage = consumeActionBlocker(actorCard);
    if (blockedMessage) {
      actionLabel = "行動失敗";
      message = `${getPokemonLabel(actorCard.pokemon)} ${blockedMessage}`;
    }
  }

  if (!message && action.type === "switch") {
    const targetCard = actorParticipant.team[action.targetIndex];
    if (targetCard?.currentHp > 0 && action.targetIndex !== actorParticipant.activeIndex) {
      const previousActive = actorCard;
      if (previousActive.currentHp > 0 && previousActive.pokemon.ability_id === "regenerator") healBattleCard(previousActive, 0.1);
      clearPositiveBattleBuffs(previousActive);
      actorParticipant.activeIndex = action.targetIndex;
      actorCard = targetCard;
      actionLabel = "換牌";
      message = `${actor === "player" ? "LearningAgent" : "Baseline"} 換上 ${getPokemonLabel(targetCard.pokemon)}。`;
    } else {
      const recovered = recoverStamina(actorCard, REST_STAMINA_RECOVERY);
      actionLabel = "無效換牌";
      message = `${getPokemonLabel(actorCard.pokemon)} 無法換牌，改為休息並回復 ${recovered} 體力。`;
    }
  } else if (!message && action.type === "rest") {
    const recovered = recoverStamina(actorCard, REST_STAMINA_RECOVERY);
    actionLabel = "休息";
    message = `${getPokemonLabel(actorCard.pokemon)} 選擇休息，回復 ${recovered} 體力。`;
  } else if (!message && action.type === "shield") {
    actorCard.shieldTurns = Math.max(actorCard.shieldTurns ?? 0, 1);
    const shieldSkill = createShieldActionSkill(actorCard);
    actionLabel = "護盾";
    skillName = shieldSkill.name_zh;
    skipHandoff = true;
    message = `${getPokemonLabel(actorCard.pokemon)} 啟動護盾，下一次受到傷害降低。`;
  } else if (!message) {
    const skillAction = action.type === "skill" ? action : undefined;
    const skill = action.type === "basic_attack" ? createBasicAttackSkill(actorCard) : skillAction ? getSkillById(skillAction.skillId) : undefined;
    const staminaCost = action.type === "basic_attack" ? BASIC_ATTACK_STAMINA_COST : skill ? getSkillStaminaCost(skill) : REST_STAMINA_RECOVERY;
    if (!skill || actorCard.currentStamina < staminaCost || (skillAction && !canUseSkill(actorCard, skill))) {
      const recovered = recoverStamina(actorCard, REST_STAMINA_RECOVERY);
      actionLabel = "體力不足";
      message = `${getPokemonLabel(actorCard.pokemon)} 體力不足，改為休息並回復 ${recovered} 體力。`;
    } else {
      actorCard.currentStamina = Math.max(0, actorCard.currentStamina - staminaCost);
      actionLabel = getSkillLabel(skill);
      skillName = getSkillLabel(skill);

      const targetSide = skill.target === "ally" || skill.target === "self" ? actor : opponent;
      const targetParticipant = nextState.participants[targetSide];
      const targetIndex = skillAction ? skillAction.targetIndex ?? targetParticipant.activeIndex : targetParticipant.activeIndex;
      const targetCard = targetParticipant.team[targetIndex] ?? targetParticipant.team[targetParticipant.activeIndex];
      const messageParts: string[] = [];

      if (skill.category === "heal") {
        healing = healBattleCard(targetCard);
        messageParts.push(healing > 0 ? `${getPokemonLabel(targetCard.pokemon)} 回復 ${healing} HP` : `${getPokemonLabel(targetCard.pokemon)} 的 HP 已經足夠`);
      } else if (skill.category === "attack") {
        const result = applyAttackDamage(actorCard, opponentCard, skill, messageParts);
        damage = result.damage;
      } else {
        applySimpleEffect(skill, actorCard, opponentCard, messageParts);
      }
      message = `${getPokemonLabel(actorCard.pokemon)} 使用 ${getSkillLabel(skill)}，${messageParts.join("，")}。`;
    }
  }

  if (!skipHandoff) {
    recoverStamina(opponentCard, TURN_STAMINA_RECOVERY);
    nextState.turn = opponent;
    nextState.turnNumber += 1;
  }

  const actorLiving = getLivingIndexes(actorParticipant);
  if (actorCard.currentHp <= 0 && actorLiving.length > 0) actorParticipant.activeIndex = actorLiving[0];
  const opponentLiving = getLivingIndexes(opponentParticipant);
  if (opponentCard.currentHp <= 0 && opponentLiving.length > 0) opponentParticipant.activeIndex = opponentLiving[0];

  const result = resolveWinner(nextState, maxTurns);
  nextState.winner = result.winner;
  nextState.isDraw = result.isDraw;

  return {
    state: nextState,
    event: {
      id: `${state.turnNumber}-${actor}-${actionLabel}-${Math.random().toString(36).slice(2, 8)}`,
      turnNumber: state.turnNumber,
      actor,
      action,
      actionLabel,
      message,
      damage,
      healing,
      skillName,
      winner: nextState.winner,
      isDraw: nextState.isDraw,
      snapshot: buildSnapshot(nextState),
    },
  };
}

export function generateAiBattleReplay(playerAgent: BattleAgent, computerAgent: BattleAgent, options?: { seed?: number; maxTurns?: number }) {
  const maxTurns = options?.maxTurns ?? AI_BATTLE_MAX_TURNS;
  let state = createAiBattleState(options?.seed);
  const initialState = cloneBattleState(state);
  const events: BattleReplayEvent[] = [];

  while (!state.winner && !state.isDraw && state.turnNumber <= maxTurns) {
    const legalActions = getLegalActions(state);
    const agent = state.turn === "player" ? playerAgent : computerAgent;
    const action = agent.selectAction(cloneBattleState(state), legalActions);
    const selectedAction = legalActions.some((legalAction) => JSON.stringify(legalAction) === JSON.stringify(action)) ? action : legalActions[0] ?? { type: "rest" as const };
    const result = stepBattle(state, selectedAction, maxTurns);
    state = result.state;
    events.push(result.event);
  }

  return { initialState, finalState: state, events };
}
