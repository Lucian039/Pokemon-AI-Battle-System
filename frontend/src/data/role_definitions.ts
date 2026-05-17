import type { PokemonRole } from "../types/battle";

export interface RoleDefinition {
  id: PokemonRole;
  name: string;
  subtitle: string;
  description: string;
  relation: string;
  accentClass: string;
  chipClass: string;
}

export const roleDefinitions: Record<PokemonRole, RoleDefinition> = {
  vanguard: {
    id: "vanguard",
    name: "先鋒",
    subtitle: "高速刺客",
    description: "高速度、收頭、先手，適合在關鍵回合切入壓低敵方核心。",
    relation: "適合針對法師，但定位不提供任何傷害倍率。",
    accentClass: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100",
    chipClass: "border-yellow-300/35 bg-yellow-300/12 text-yellow-100",
  },
  fighter: {
    id: "fighter",
    name: "鬥士",
    subtitle: "物理輸出",
    description: "穩定輸出、正面對打，負責中場換血與持續壓制。",
    relation: "萬用定位，依靠基礎數值與技能組處理戰局。",
    accentClass: "border-red-300/35 bg-red-300/10 text-red-100",
    chipClass: "border-red-300/35 bg-red-300/12 text-red-100",
  },
  mage: {
    id: "mage",
    name: "法師",
    subtitle: "特攻爆發",
    description: "技能傷害型，擅長用高威力招式打穿高物防對手。",
    relation: "適合處理坦克，但定位不提供任何傷害倍率。",
    accentClass: "border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100",
    chipClass: "border-fuchsia-300/35 bg-fuchsia-300/12 text-fuchsia-100",
  },
  support: {
    id: "support",
    name: "輔助",
    subtitle: "治療 / Buff / 控制",
    description: "改變戰局，透過治療、護盾、控場或弱化效果拉開節奏。",
    relation: "萬用定位，負責隊伍續航與回合調度。",
    accentClass: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    chipClass: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
  },
  tank: {
    id: "tank",
    name: "坦克",
    subtitle: "承傷",
    description: "高血高防、拖回合，適合吸收攻勢並保護隊伍節奏。",
    relation: "適合牽制先鋒，但定位不提供任何減傷倍率。",
    accentClass: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    chipClass: "border-sky-300/35 bg-sky-300/12 text-sky-100",
  },
};

export const roleOrder: PokemonRole[] = ["vanguard", "fighter", "mage", "support", "tank"];

export function getRoleDefinition(role: PokemonRole) {
  return roleDefinitions[role];
}
