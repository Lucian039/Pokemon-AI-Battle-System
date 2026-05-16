export type PokedexCard = {
  id: number;
  name: string;
  filename: string;
  imagePath: string;
};

export const pokedexPreviewCards: PokedexCard[] = Array.from({ length: 721 }, (_, index) => {
  const id = index + 1;

  return {
    id,
    name: `Pokemon ${id}`,
    filename: `${id}.jpg`,
    imagePath: `/pokemon-cutout/${id}.png`,
  };
});

export const pokedexTotalCount = pokedexPreviewCards.length;
