import {
  Backpack,
  Bell,
  BookOpen,
  CalendarDays,
  Coins,
  Crosshair,
  Dumbbell,
  HeartPulse,
  Mail,
  Map,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: string;
};

export const player = {
  name: "玩家",
  rank: "Bronze III",
  stamina: 80,
  maxStamina: 100,
  coins: 12580,
  avatarInitial: "P",
};

export const topActions: NavAction[] = [
  { id: "mail", label: "郵件", icon: Mail, accent: "text-sky-300" },
  { id: "settings", label: "設定", icon: Settings, accent: "text-slate-200" },
];

export const leftNav: NavAction[] = [
  { id: "shop", label: "商店", icon: ShoppingBag, accent: "text-rose-300" },
  { id: "bag", label: "背包", icon: Backpack, accent: "text-amber-300" },
  { id: "dex", label: "圖鑑", icon: BookOpen, accent: "text-cyan-300" },
  { id: "training", label: "訓練", icon: Dumbbell, accent: "text-emerald-300" },
];

export const rightNav: NavAction[] = [
  { id: "event", label: "活動", icon: CalendarDays, accent: "text-violet-300" },
  { id: "typeGuide", label: "屬性表", icon: Zap, accent: "text-yellow-300" },
  { id: "quest", label: "任務", icon: Trophy, accent: "text-amber-300" },
  { id: "friend", label: "好友", icon: Users, accent: "text-sky-300" },
];

export const quickStats = [
  { label: "圖鑑收集", value: "819", icon: BookOpen, accent: "text-cyan-300" },
  { label: "連勝紀錄", value: "07", icon: Zap, accent: "text-amber-300" },
  { label: "戰鬥積分", value: "2,480", icon: Shield, accent: "text-rose-300" },
];

export const squadCards = [
  { name: "Pikachu", role: "Speed Attacker", type: "Electric", power: 86, accent: "from-amber-300/30 to-yellow-500/10" },
  { name: "Charizard", role: "Aerial Striker", type: "Fire", power: 91, accent: "from-rose-400/30 to-orange-500/10" },
  { name: "Lucario", role: "Arena Fighter", type: "Fighting", power: 88, accent: "from-cyan-300/25 to-blue-500/10" },
];

export const lobbyContent = {
  dex: {
    title: "寶可夢圖鑑",
    subtitle: "查看目前資料集中可用的寶可夢卡牌與戰鬥資料。",
    status: "Feature database ready",
    icon: Crosshair,
  },
  battle: {
    title: "一般對戰",
    subtitle: "輪抽三隻寶可夢後進入一般技能戰鬥。",
    status: "Battle module ready",
    icon: Swords,
  },
  adventure: {
    title: "冒險",
    subtitle: "路線與關卡仍為展示資料。",
    status: "Adventure route locked",
    icon: Map,
  },
  shop: {
    title: "商店",
    subtitle: "商店功能目前使用展示資料。",
    status: "Store mock data",
    icon: ShoppingBag,
  },
  bag: {
    title: "背包",
    subtitle: "道具與卡牌庫存展示。",
    status: "Inventory ready",
    icon: Backpack,
  },
  training: {
    title: "訓練",
    subtitle: "強化與練習模式尚未開放。",
    status: "Training slot open",
    icon: HeartPulse,
  },
  event: {
    title: "活動",
    subtitle: "限時活動頻道展示。",
    status: "Event channel online",
    icon: Sparkles,
  },
  typeGuide: {
    title: "屬性克制",
    subtitle: "選擇攻擊屬性，快速查看超級克制、克制與被剋關係。",
    status: "Type chart ready",
    icon: Zap,
  },
  quest: {
    title: "任務",
    subtitle: "每日任務與獎勵展示。",
    status: "3 missions active",
    icon: Trophy,
  },
  friend: {
    title: "好友",
    subtitle: "好友與社交功能尚未開放。",
    status: "Social module planned",
    icon: Users,
  },
  mail: {
    title: "郵件",
    subtitle: "系統信箱展示。",
    status: "No unread mail",
    icon: Bell,
  },
  settings: {
    title: "設定",
    subtitle: "本機原型設定頁。",
    status: "Local prototype",
    icon: Settings,
  },
} as const;

export type LobbyContentKey = keyof typeof lobbyContent;

export const bottomActions: NavAction[] = [
  { id: "adventure", label: "冒險", icon: Map, accent: "text-emerald-300" },
  { id: "battle", label: "對戰", icon: Shield, accent: "text-rose-300" },
];

export const currencyIcon = Coins;
