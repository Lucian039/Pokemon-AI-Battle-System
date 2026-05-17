import { motion } from "framer-motion";
import { pokedexPreviewCards } from "../../data/pokedexMock";
import type { BattleCardState, BattleSide, PokemonStats, PokemonType } from "../../types/battle";

function getPokemonLabel(pokemon: PokemonStats) {
  return pokemon.name_zh || pokemon.name;
}

function getPokemonImage(pokemon: PokemonStats) {
  return pokedexPreviewCards.find((card) => card.id === pokemon.id)?.imagePath ?? pokemon.reference_image;
}

function getTypeLabel(type: PokemonType) {
  const labels: Record<PokemonType, string> = {
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
    Bug: "蟲",
    Dark: "惡",
  };

  return labels[type] ?? type;
}

function getTypeChipClass(type: PokemonType) {
  const classes: Record<PokemonType, string> = {
    Normal: "border-slate-300/50 bg-slate-300/80 text-slate-950",
    Electric: "border-yellow-200/70 bg-yellow-300/90 text-slate-950",
    Fire: "border-orange-200/70 bg-orange-400/90 text-white",
    Water: "border-sky-200/70 bg-sky-400/90 text-slate-950",
    Grass: "border-lime-200/70 bg-lime-500/90 text-white",
    Poison: "border-fuchsia-200/70 bg-fuchsia-500/80 text-white",
    Ghost: "border-violet-200/70 bg-violet-500/80 text-white",
    Fighting: "border-red-200/70 bg-red-500/85 text-white",
    Steel: "border-slate-200/70 bg-slate-400/90 text-slate-950",
    Dragon: "border-indigo-200/70 bg-indigo-500/85 text-white",
    Flying: "border-cyan-200/70 bg-cyan-300/85 text-slate-950",
    Psychic: "border-pink-200/70 bg-pink-400/85 text-white",
    Fairy: "border-rose-200/70 bg-rose-300/90 text-slate-950",
    Rock: "border-stone-200/70 bg-stone-500/90 text-white",
    Ground: "border-amber-200/70 bg-amber-600/90 text-white",
    Ice: "border-cyan-100/80 bg-cyan-200/90 text-slate-950",
    Bug: "border-green-200/70 bg-green-500/85 text-white",
    Dark: "border-zinc-300/70 bg-zinc-700/90 text-white",
  };

  return classes[type];
}

function LoadingPokemonCard({ pokemon, imageSrc }: { pokemon: PokemonStats; imageSrc: string }) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[20px] border border-sky-300/55 bg-[#061622] text-left shadow-[0_0_18px_rgba(125,190,255,0.18)]">
      <div className="relative grid min-h-0 flex-[1.25] place-items-center overflow-hidden p-2">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(83,166,202,0.32),rgba(7,22,34,0.86)_56%,rgba(3,11,18,0.98)_78%)]" />
        <div className="absolute aspect-square w-[78%] rounded-full bg-[radial-gradient(circle_at_42%_34%,rgba(201,241,238,0.24),rgba(71,131,150,0.22)_48%,rgba(3,12,19,0.48)_76%)] shadow-[inset_0_18px_28px_rgba(255,255,255,0.06),inset_0_-24px_34px_rgba(0,0,0,0.52),0_0_26px_rgba(119,216,241,0.18)]" />
        <img
          src="/pokeball-icon-sm.png"
          alt=""
          aria-hidden="true"
          className="absolute z-0 aspect-square w-[84%] object-contain opacity-30 mix-blend-screen [filter:invert(84%)_sepia(23%)_saturate(720%)_hue-rotate(158deg)_brightness(103%)_contrast(92%)]"
          loading="lazy"
        />
        <div className="absolute aspect-square w-[64%] rounded-full bg-[radial-gradient(circle_at_center,rgba(137,221,239,0.10),rgba(137,221,239,0.02)_54%,transparent_70%)] blur-sm" />
        <img src={imageSrc} alt={getPokemonLabel(pokemon)} className="relative z-10 h-[72%] w-[72%] object-contain object-center drop-shadow-[0_0_3px_rgba(255,255,255,0.95)] transition duration-200" loading="lazy" />
      </div>

      <div className="relative flex flex-[0.85] flex-col border-t border-sky-100/70 bg-[linear-gradient(180deg,rgba(11,30,45,0.98),rgba(8,19,29,0.98))] px-4 pb-4 pt-3 shadow-[inset_0_14px_28px_rgba(93,169,215,0.12)]">
        <div className="absolute -top-px left-[34%] h-4 w-[32%] rounded-b-full border-b border-l border-r border-sky-100/70 bg-[#061622]" />
        <p className="text-sm font-black leading-none text-sky-200">{pokemon.id.toString().padStart(4, "0")}</p>
        <h3 className="mt-2 truncate text-base font-black leading-tight text-white">{getPokemonLabel(pokemon)}</h3>
        <div className="mt-auto flex items-center justify-center gap-3">
          {pokemon.types.map((type) => (
            <span key={type} className={["min-w-14 rounded-full border px-3 py-1 text-center text-xs font-black shadow-[0_0_10px_rgba(255,255,255,0.22)]", getTypeChipClass(type)].join(" ")}>
              {getTypeLabel(type)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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
      className={["relative aspect-[1/1.45] w-48 text-left xl:w-56 2xl:w-60", offsets[index]].join(" ")}
    >
      <LoadingPokemonCard pokemon={card.pokemon} imageSrc={imageSrc} />
    </motion.article>
  );
}
