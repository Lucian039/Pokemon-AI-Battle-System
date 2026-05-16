import { motion } from "framer-motion";
import { pokedexPreviewCards } from "../../data/pokedexMock";
import type { BattleCardState, BattleSide, PokemonStats } from "../../types/battle";

function getPokemonLabel(pokemon: PokemonStats) {
  return pokemon.name_zh || pokemon.name;
}

function getPokemonImage(pokemon: PokemonStats) {
  return pokedexPreviewCards.find((card) => card.id === pokemon.id)?.imagePath ?? pokemon.reference_image;
}

function getTypeLabel(type: PokemonStats["types"][number]) {
  const labels: Record<PokemonStats["types"][number], string> = {
    Normal: "一般",
    Electric: "電",
    Fire: "火",
    Water: "水",
    Grass: "草",
    Poison: "毒",
    Ghost: "幽靈",
    Fighting: "格鬥",
    Steel: "鋼",
    Dragon: "龍",
    Flying: "飛行",
    Psychic: "超能力",
    Fairy: "妖精",
    Rock: "岩石",
    Ground: "地面",
    Ice: "冰",
  };

  return labels[type] ?? type;
}

export function BattleTeamCard({
  card,
  side,
  index,
}: {
  card: BattleCardState;
  side: BattleSide;
  index: number;
}) {
  const imageSrc = getPokemonImage(card.pokemon);
  const hpPercent = Math.max(0, (card.currentHp / card.pokemon.max_hp) * 100);
  const playerSide = side === "player";
  const rotations = playerSide ? [-9, 1, 10] : [9, -1, -10];
  const offsets = playerSide ? ["translate-y-10", "translate-y-0", "translate-y-12"] : ["-translate-y-12", "translate-y-0", "-translate-y-10"];

  return (
    <motion.article
      initial={{ opacity: 0, y: playerSide ? -24 : 24, rotate: rotations[index] - 4 }}
      animate={{ opacity: 1, y: [0, playerSide ? -7 : 7, 0], rotate: rotations[index] }}
      transition={{
        opacity: { delay: index * 0.12, duration: 0.38 },
        rotate: { delay: index * 0.12, duration: 0.38 },
        y: { delay: index * 0.1, duration: 3.8, repeat: Infinity, ease: "easeInOut" },
      }}
      className={[
        "relative grid aspect-[1/1.45] w-48 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[28px] border p-3.5 text-left backdrop-blur xl:w-56 2xl:w-60",
        offsets[index],
        playerSide
          ? "border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_38px_rgba(34,211,238,0.26)]"
          : "border-rose-400/70 bg-rose-400/10 shadow-[0_0_38px_rgba(244,63,94,0.26)]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-950/35" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{playerSide ? "PLAYER" : "ENEMY"}</p>
          <h3 className="mt-1 truncate text-lg font-black text-white">{getPokemonLabel(card.pokemon)}</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] font-black text-white">
          Lv.{card.pokemon.level}
        </span>
      </div>

      <div className="relative z-10 my-3 grid min-h-0 place-items-center rounded-[20px] border border-white/10 bg-slate-950/50 p-2">
        {imageSrc ? (
          <img src={imageSrc} alt={getPokemonLabel(card.pokemon)} className="max-h-full max-w-full object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.62)]" loading="lazy" />
        ) : (
          <div className="h-full w-full rounded-2xl bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950" />
        )}
      </div>

      <div className="relative z-10">
        <div className="mb-2 flex flex-wrap gap-1">
          {card.pokemon.types.map((type) => (
            <span key={type} className={["rounded-full px-2 py-0.5 text-[10px] font-black", playerSide ? "bg-cyan-300/18 text-cyan-100" : "bg-rose-400/18 text-rose-100"].join(" ")}>
              {getTypeLabel(type)}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] font-black text-slate-400">
          <span>HP</span>
          <span>
            {card.currentHp}/{card.pokemon.max_hp}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-950/80">
          <div className={["h-full rounded-full", playerSide ? "bg-gradient-to-r from-cyan-200 to-blue-500" : "bg-gradient-to-r from-rose-300 to-red-600"].join(" ")} style={{ width: `${hpPercent}%` }} />
        </div>
      </div>
    </motion.article>
  );
}
