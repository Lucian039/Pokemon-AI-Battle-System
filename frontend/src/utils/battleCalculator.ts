import pokemonStatsData from "../data/pokemon_stats.json";
import skillsData from "../data/skills.json";
import typeChartData from "../data/type_chart.json";
import type { BattleCardState, DamageResult, PokemonStats, PokemonType, Skill } from "../types/battle";

type PokemonStatsMap = Record<string, PokemonStats>;
type SkillMap = Record<string, Skill>;
type TypeChart = Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>>;

const pokemonStats = pokemonStatsData as PokemonStatsMap;
const skills = skillsData as SkillMap;
const typeChart = typeChartData as TypeChart;

export const HEAL_RATIO = 0.18;
export const BURN_DAMAGE_RATIO = 0.06;
export const DEFAULT_STAMINA = 100;
export const TURN_STAMINA_RECOVERY = 20;
export const REST_STAMINA_RECOVERY = 40;
export const SHIELD_STAMINA_COST = 35;
export const SWITCH_STAMINA_COST = 20;
export const GENERIC_SHIELD_DAMAGE_REDUCTION = 0.4;
export const SKILL_SHIELD_DAMAGE_REDUCTION = 0.5;

export function getPokemonById(id: number | string): PokemonStats | undefined {
  return pokemonStats[String(id)];
}

export function getBattleEnabledPokemon(): PokemonStats[] {
  return Object.values(pokemonStats).filter((pokemon) => pokemon.enabled_battle);
}

export function getSkillById(skillId: string): Skill | undefined {
  return skills[skillId];
}

export function getPokemonSkills(pokemon: PokemonStats): Skill[] {
  return pokemon.skill_ids.flatMap((skillId) => {
    const skill = getSkillById(skillId);

    if (!skill) {
      console.warn(`找不到技能資料：${skillId}`);
      return [];
    }

    return [skill];
  });
}

export function getSkillStaminaCost(skill: Skill) {
  if (skill.category === "attack") {
    return Math.min(50, Math.max(10, Math.ceil(skill.power / 2)));
  }

  if (skill.category === "heal") return 30;
  if (skill.category === "shield") return SHIELD_STAMINA_COST;
  return 20;
}

export function canUseSkill(card: BattleCardState, skill: Skill) {
  return card.currentHp > 0 && card.currentStamina >= getSkillStaminaCost(skill);
}

export function recoverStamina(card: BattleCardState, amount: number) {
  if (card.currentHp <= 0) return 0;
  const nextStamina = Math.min(card.maxStamina, card.currentStamina + amount);
  const recovered = nextStamina - card.currentStamina;
  card.currentStamina = nextStamina;
  return recovered;
}

export function getTypeMultiplier(moveType: PokemonType, defenderTypes: PokemonType[]): number {
  return defenderTypes.reduce((multiplier, defenderType) => {
    return multiplier * (typeChart[moveType]?.[defenderType] ?? 1);
  }, 1);
}

export function getEffectivenessText(multiplier: number): string {
  if (multiplier >= 4) return "超級克制";
  if (multiplier >= 2) return "效果絕佳";
  if (multiplier === 0) return "沒有效果";
  if (multiplier < 1) return "效果不好";
  return "效果普通";
}

export function calculateDamage(attacker: PokemonStats, defender: PokemonStats, skill: Skill): DamageResult {
  const hitRandom = Math.random() * 100;

  if (hitRandom > skill.accuracy) {
    return {
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: "沒有命中",
      isHit: false,
    };
  }

  if (skill.category !== "attack") {
    return {
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: "技能成功",
      isHit: true,
    };
  }

  const typeMultiplier = getTypeMultiplier(skill.type, defender.types);
  const baseDamage = skill.power * (attacker.attack / defender.defense);
  const randomFactor = 0.9 + Math.random() * 0.2;
  const calculatedDamage = Math.round(baseDamage * typeMultiplier * randomFactor);
  const damage = typeMultiplier === 0 ? 0 : Math.max(1, calculatedDamage);

  return {
    damage,
    typeMultiplier,
    effectivenessText: getEffectivenessText(typeMultiplier),
    isHit: true,
  };
}

export function healBattleCard(card: BattleCardState, ratio = HEAL_RATIO) {
  if (card.currentHp <= 0 || card.currentHp >= card.pokemon.max_hp) return 0;
  const healAmount = Math.max(1, Math.round(card.pokemon.max_hp * ratio));
  const nextHp = Math.min(card.pokemon.max_hp, card.currentHp + healAmount);
  const actualHeal = nextHp - card.currentHp;
  card.currentHp = nextHp;
  return actualHeal;
}

export function getBurnDamage(card: BattleCardState) {
  if (card.currentHp <= 0) return 0;
  return Math.max(1, Math.round(card.pokemon.max_hp * BURN_DAMAGE_RATIO));
}
