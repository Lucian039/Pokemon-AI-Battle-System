import pokemonStatsData from "../data/pokemon_stats.json";
import skillsData from "../data/skills.json";
import typeChartData from "../data/type_chart.json";
import type { DamageResult, PokemonStats, PokemonType, Skill } from "../types/battle";

type PokemonStatsMap = Record<string, PokemonStats>;
type SkillMap = Record<string, Skill>;
type TypeChart = Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>>;

const pokemonStats = pokemonStatsData as PokemonStatsMap;
const skills = skillsData as SkillMap;
const typeChart = typeChartData as TypeChart;

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

export function getTypeMultiplier(moveType: PokemonType, defenderTypes: PokemonType[]): number {
  return defenderTypes.reduce((multiplier, defenderType) => {
    return multiplier * (typeChart[moveType]?.[defenderType] ?? 1);
  }, 1);
}

export function getEffectivenessText(multiplier: number): string {
  if (multiplier >= 2) {
    return "效果絕佳";
  }

  if (multiplier === 0) {
    return "沒有效果";
  }

  if (multiplier < 1) {
    return "效果不好";
  }

  return "普通效果";
}

export function calculateDamage(attacker: PokemonStats, defender: PokemonStats, skill: Skill): DamageResult {
  const hitRandom = Math.random() * 100;

  if (hitRandom > skill.accuracy) {
    return {
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: "攻擊落空",
      isHit: false,
    };
  }

  if (skill.category !== "attack") {
    return {
      damage: 0,
      typeMultiplier: 1,
      effectivenessText: "非攻擊技能",
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
