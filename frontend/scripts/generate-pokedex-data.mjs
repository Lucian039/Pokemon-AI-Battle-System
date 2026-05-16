import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve("..");
const indexPath = path.join(projectRoot, "outputs", "pokemon_index.json");
const sourceDir = path.join(projectRoot, "dataset", "reference");
const publicPokemonDir = path.resolve("public", "pokemon");
const publicCutoutDir = path.resolve("public", "pokemon-cutout");
const outputPath = path.resolve("src", "data", "pokedexMock.ts");

const suffixZh = new Map([
  ["mega", "超級"],
  ["mega-x", "超級X"],
  ["mega-y", "超級Y"],
  ["primal", "原始回歸"],
  ["attack", "攻擊形態"],
  ["defense", "防禦形態"],
  ["speed", "速度形態"],
  ["normal", "普通形態"],
  ["altered", "別種形態"],
  ["origin", "起源形態"],
  ["land", "陸上形態"],
  ["sky", "天空形態"],
  ["incarnate", "化身形態"],
  ["therian", "靈獸形態"],
  ["black", "暗黑形態"],
  ["white", "焰白形態"],
  ["ordinary", "普通形態"],
  ["resolute", "覺悟形態"],
  ["pirouette", "舞步形態"],
  ["unbound", "解放形態"],
  ["blade", "刀劍形態"],
  ["shield", "盾牌形態"],
  ["plant", "草木蓑衣"],
  ["sandy", "砂土蓑衣"],
  ["trash", "垃圾蓑衣"],
  ["overcast", "陰天形態"],
  ["sunshine", "晴天形態"],
  ["east", "東海形態"],
  ["west", "西海形態"],
  ["fan", "旋轉形態"],
  ["frost", "結冰形態"],
  ["heat", "加熱形態"],
  ["mow", "切割形態"],
  ["wash", "清洗形態"],
  ["blue-striped", "藍條紋"],
  ["red-striped", "紅條紋"],
  ["standard", "普通模式"],
  ["autumn", "秋天形態"],
  ["spring", "春天形態"],
  ["summer", "夏天形態"],
  ["winter", "冬天形態"],
  ["elegant", "優雅花紋"],
  ["diamond", "鑽石造型"],
  ["heart", "愛心造型"],
  ["star", "星星造型"],
  ["belle", "貴婦裝"],
  ["libre", "面罩摔角手"],
  ["phd", "博士裝"],
  ["pop-star", "偶像歌手"],
  ["rock-star", "硬搖滾手"],
]);

const manualZh = new Map([
  [29, "尼多蘭♀"],
  [32, "尼多蘭♂"],
  [83, "大蔥鴨"],
  [122, "魔牆人偶"],
  [250, "鳳王"],
  [439, "魔尼尼"],
  [474, "多邊獸Ｚ"],
]);

function parseDexId(filename) {
  const match = filename.match(/^(\d+)/);
  if (!match) return 0;
  return Number(match[1]);
}

function parseSuffix(filename) {
  const stem = path.parse(filename).name;
  const match = stem.match(/^\d+(?:[-_](.+)|([A-Za-z].*))?$/);
  if (!match) return "";
  return match[1] ?? match[2] ?? "";
}

function formatSuffixZh(suffix) {
  if (!suffix) return "";
  const normalized = suffix.toLowerCase();
  if (suffixZh.has(normalized)) return suffixZh.get(normalized);
  if (/^f$/i.test(normalized)) return "雌性";
  return normalized
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => suffixZh.get(part) ?? part)
    .join(" ");
}

async function fetchZhName(id) {
  if (manualZh.has(id)) return manualZh.get(id);

  const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`);
  if (!response.ok) {
    throw new Error(`PokeAPI ${id}: ${response.status}`);
  }
  const data = await response.json();
  const zhHant = data.names.find((entry) => entry.language.name.toLowerCase() === "zh-hant");
  const zhHans = data.names.find((entry) => entry.language.name.toLowerCase() === "zh-hans");
  const ja = data.names.find((entry) => entry.language.name === "ja-Hrkt");
  return zhHant?.name ?? zhHans?.name ?? ja?.name ?? `寶可夢 #${String(id).padStart(3, "0")}`;
}

async function main() {
  const indexData = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  fs.mkdirSync(publicPokemonDir, { recursive: true });
  fs.mkdirSync(publicCutoutDir, { recursive: true });

  const uniqueIds = [...new Set(indexData.map((item) => parseDexId(item.filename)).filter(Boolean))];
  const zhNameById = new Map();

  const concurrency = 16;
  let cursor = 0;
  async function worker() {
    while (cursor < uniqueIds.length) {
      const id = uniqueIds[cursor++];
      try {
        zhNameById.set(id, await fetchZhName(id));
      } catch (error) {
        console.warn(`Warning: ${error.message}`);
        zhNameById.set(id, `寶可夢 #${String(id).padStart(3, "0")}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const cards = indexData.map((item) => {
    const id = parseDexId(item.filename);
    const suffix = formatSuffixZh(parseSuffix(item.filename));
    const baseName = zhNameById.get(id) ?? `寶可夢 #${String(id).padStart(3, "0")}`;
    const sourcePath = path.join(sourceDir, item.filename);
    const targetPath = path.join(publicPokemonDir, item.filename);
    const cutoutFilename = `${path.parse(item.filename).name}.png`;

    if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }

    return {
      id,
      name: suffix ? `${baseName} ${suffix}` : baseName,
      filename: item.filename,
      imagePath: `/pokemon-cutout/${cutoutFilename}`,
    };
  }).sort((a, b) => {
    if (a.id !== b.id) return a.id - b.id;
    return a.filename.localeCompare(b.filename, "en", { numeric: true });
  });

  const output = `export type PokedexCard = {
  id: number;
  name: string;
  filename: string;
  imagePath: string;
};

export const pokedexPreviewCards: PokedexCard[] = ${JSON.stringify(cards, null, 2)};

export const pokedexTotalCount = ${cards.length};
`;

  fs.writeFileSync(outputPath, output, "utf8");
  console.log(`Generated ${cards.length} cards at ${outputPath}`);
  console.log(`Copied images to ${publicPokemonDir}`);
  console.log(`Cutout images should exist at ${publicCutoutDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
