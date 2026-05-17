import type { PokemonAbilityId, PokemonType } from "../types/battle";

export interface AbilityDefinition {
  id: PokemonAbilityId;
  name: string;
  description: string;
}

export const abilityDefinitions: Record<PokemonAbilityId, AbilityDefinition> = {
  overgrow: {
    id: "overgrow",
    name: "茂盛",
    description: "HP 低於或等於 1/3 且使用草屬性招式時，傷害提高 20%。",
  },
  blaze: {
    id: "blaze",
    name: "猛火",
    description: "HP 低於或等於 1/3 且使用火屬性招式時，傷害提高 20%。",
  },
  torrent: {
    id: "torrent",
    name: "激流",
    description: "HP 低於或等於 1/3 且使用水屬性招式時，傷害提高 20%。",
  },
  static: {
    id: "static",
    name: "靜電",
    description: "電屬性招式命中，且自身速度高於目標時，追加 8 點固定傷害。",
  },
  cute_charm: {
    id: "cute_charm",
    name: "迷人之軀",
    description: "攻擊方攻擊力高於自身防禦時，受到傷害降低 8%。",
  },
  intimidate: {
    id: "intimidate",
    name: "威嚇",
    description: "攻擊方攻擊力高於自身攻擊力時，受到傷害降低 10%。",
  },
  synchronize: {
    id: "synchronize",
    name: "同步",
    description: "本次實際傷害超過最大 HP 的 15% 時，反彈實際傷害的 8%。",
  },
  guts: {
    id: "guts",
    name: "毅力",
    description: "HP 低於或等於 50% 時，造成傷害提高 12%。",
  },
  sturdy: {
    id: "sturdy",
    name: "結實",
    description: "滿 HP 時若會被擊倒，保留 1 HP；每場每隻只觸發一次。",
  },
  regenerator: {
    id: "regenerator",
    name: "再生力",
    description: "替換下場且 HP 未滿時，回復最大 HP 的 10%。",
  },
  cursed_body: {
    id: "cursed_body",
    name: "詛咒之軀",
    description: "受到攻擊時，有 20% 機率讓本次傷害降低 25%。",
  },
  natural_cure: {
    id: "natural_cure",
    name: "自然回復",
    description: "自己行動結束後，若 HP 低於或等於 50%，回復最大 HP 的 6%。",
  },
  thick_fat: {
    id: "thick_fat",
    name: "厚脂肪",
    description: "受到火、冰屬性招式時，傷害降低 20%。",
  },
  adaptability: {
    id: "adaptability",
    name: "適應力",
    description: "使用自身屬性招式時，傷害提高 12%。",
  },
  inner_focus: {
    id: "inner_focus",
    name: "精神力",
    description: "HP 高於或等於 50% 時，攻擊傷害提高 8%。",
  },
  pressure: {
    id: "pressure",
    name: "壓迫感",
    description: "攻擊方目前 HP 高於自身目前 HP 時，受到傷害降低 8%。",
  },
  sand_stream: {
    id: "sand_stream",
    name: "揚沙",
    description: "HP 高於或等於 50% 且使用岩石或惡屬性招式時，傷害提高 10%。",
  },
  technician: {
    id: "technician",
    name: "技術高手",
    description: "技能威力低於或等於 50 時，傷害提高 20%。",
  },
  sand_veil: {
    id: "sand_veil",
    name: "沙隱",
    description: "HP 低於或等於 50% 時，受到傷害降低 8%。",
  },
};

export const lowHpBoostAbilityTypes: Partial<Record<PokemonAbilityId, PokemonType>> = {
  overgrow: "Grass",
  blaze: "Fire",
  torrent: "Water",
};

export function getAbilityDefinition(abilityId: PokemonAbilityId) {
  return abilityDefinitions[abilityId];
}
