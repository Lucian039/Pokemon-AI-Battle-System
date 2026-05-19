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
    subtitle: "高速切入 / 收頭",
    description: "以速度、先手壓力與收尾能力為核心，適合優先壓低敵方關鍵角色。",
    relation: "適合搭配鬥士或法師建立輸出節奏，但不提供任何額外戰鬥倍率。",
    accentClass: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100",
    chipClass: "border-yellow-300/35 bg-yellow-300/12 text-yellow-100",
  },
  fighter: {
    id: "fighter",
    name: "鬥士",
    subtitle: "正面輸出 / 換血",
    description: "以穩定攻擊與正面突破為核心，適合承擔主要單體輸出任務。",
    relation: "適合搭配輔助延長輸出時間，職業本身不影響傷害公式。",
    accentClass: "border-red-300/35 bg-red-300/10 text-red-100",
    chipClass: "border-red-300/35 bg-red-300/12 text-red-100",
  },
  mage: {
    id: "mage",
    name: "法師",
    subtitle: "技能爆發 / 屬性壓制",
    description: "以高技能傷害與屬性輸出為核心，適合快速打出爆發或壓制特定目標。",
    relation: "適合搭配先鋒創造擊倒窗口，職業只作為策略標籤。",
    accentClass: "border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100",
    chipClass: "border-fuchsia-300/35 bg-fuchsia-300/12 text-fuchsia-100",
  },
  support: {
    id: "support",
    name: "輔助",
    subtitle: "治療 / 控場 / 護盾",
    description: "以治療、護盾、干擾與回合節奏為核心，負責提高隊伍穩定度。",
    relation: "適合保護鬥士與法師，職業不提供被動增益。",
    accentClass: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    chipClass: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
  },
  tank: {
    id: "tank",
    name: "坦克",
    subtitle: "承傷 / 拖回合",
    description: "以高 HP、防禦與保命能力為核心，負責吸收攻擊並維持戰線。",
    relation: "適合搭配輔助形成續航隊形，職業不改變減傷倍率。",
    accentClass: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    chipClass: "border-sky-300/35 bg-sky-300/12 text-sky-100",
  },
};

export const roleOrder: PokemonRole[] = ["vanguard", "fighter", "mage", "support", "tank"];

export function getRoleDefinition(role: PokemonRole) {
  return roleDefinitions[role];
}
