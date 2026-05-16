"""
共用工具函式。

包含資料夾建立、圖片掃描、JSON 讀寫、cosine similarity 與寶可夢名稱清理。
"""

import json
import re
from pathlib import Path
from typing import Iterable, List

import numpy as np


POKEMON_NAMES = [
    "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard",
    "Squirtle", "Wartortle", "Blastoise", "Caterpie", "Metapod", "Butterfree",
    "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata",
    "Raticate", "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu",
    "Sandshrew", "Sandslash", "Nidoran Female", "Nidorina", "Nidoqueen",
    "Nidoran Male", "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix",
    "Ninetales", "Jigglypuff", "Wigglytuff", "Zubat", "Golbat", "Oddish",
    "Gloom", "Vileplume", "Paras", "Parasect", "Venonat", "Venomoth",
    "Diglett", "Dugtrio", "Meowth", "Persian", "Psyduck", "Golduck", "Mankey",
    "Primeape", "Growlithe", "Arcanine", "Poliwag", "Poliwhirl", "Poliwrath",
    "Abra", "Kadabra", "Alakazam", "Machop", "Machoke", "Machamp", "Bellsprout",
    "Weepinbell", "Victreebel", "Tentacool", "Tentacruel", "Geodude", "Graveler",
    "Golem", "Ponyta", "Rapidash", "Slowpoke", "Slowbro", "Magnemite",
    "Magneton", "Farfetchd", "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer",
    "Muk", "Shellder", "Cloyster", "Gastly", "Haunter", "Gengar", "Onix",
    "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", "Electrode",
    "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", "Hitmonchan",
    "Lickitung", "Koffing", "Weezing", "Rhyhorn", "Rhydon", "Chansey",
    "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu",
    "Starmie", "Mr Mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir",
    "Tauros", "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", "Vaporeon",
    "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", "Kabutops",
    "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dratini",
    "Dragonair", "Dragonite", "Mewtwo", "Mew", "Chikorita", "Bayleef",
    "Meganium", "Cyndaquil", "Quilava", "Typhlosion", "Totodile", "Croconaw",
    "Feraligatr", "Sentret", "Furret", "Hoothoot", "Noctowl", "Ledyba",
    "Ledian", "Spinarak", "Ariados", "Crobat", "Chinchou", "Lanturn", "Pichu",
    "Cleffa", "Igglybuff", "Togepi", "Togetic", "Natu", "Xatu", "Mareep",
    "Flaaffy", "Ampharos", "Bellossom", "Marill", "Azumarill", "Sudowoodo",
    "Politoed", "Hoppip", "Skiploom", "Jumpluff", "Aipom", "Sunkern",
    "Sunflora", "Yanma", "Wooper", "Quagsire", "Espeon", "Umbreon", "Murkrow",
    "Slowking", "Misdreavus", "Unown", "Wobbuffet", "Girafarig", "Pineco",
    "Forretress", "Dunsparce", "Gligar", "Steelix", "Snubbull", "Granbull",
    "Qwilfish", "Scizor", "Shuckle", "Heracross", "Sneasel", "Teddiursa",
    "Ursaring", "Slugma", "Magcargo", "Swinub", "Piloswine", "Corsola",
    "Remoraid", "Octillery", "Delibird", "Mantine", "Skarmory", "Houndour",
    "Houndoom", "Kingdra", "Phanpy", "Donphan", "Porygon2", "Stantler",
    "Smeargle", "Tyrogue", "Hitmontop", "Smoochum", "Elekid", "Magby",
    "Miltank", "Blissey", "Raikou", "Entei", "Suicune", "Larvitar", "Pupitar",
    "Tyranitar", "Lugia", "Ho Oh", "Celebi", "Treecko", "Grovyle", "Sceptile",
    "Torchic", "Combusken", "Blaziken", "Mudkip", "Marshtomp", "Swampert",
    "Poochyena", "Mightyena", "Zigzagoon", "Linoone", "Wurmple", "Silcoon",
    "Beautifly", "Cascoon", "Dustox", "Lotad", "Lombre", "Ludicolo", "Seedot",
    "Nuzleaf", "Shiftry", "Taillow", "Swellow", "Wingull", "Pelipper", "Ralts",
    "Kirlia", "Gardevoir", "Surskit", "Masquerain", "Shroomish", "Breloom",
    "Slakoth", "Vigoroth", "Slaking", "Nincada", "Ninjask", "Shedinja",
    "Whismur", "Loudred", "Exploud", "Makuhita", "Hariyama", "Azurill",
    "Nosepass", "Skitty", "Delcatty", "Sableye", "Mawile", "Aron", "Lairon",
    "Aggron", "Meditite", "Medicham", "Electrike", "Manectric", "Plusle",
    "Minun", "Volbeat", "Illumise", "Roselia", "Gulpin", "Swalot", "Carvanha",
    "Sharpedo", "Wailmer", "Wailord", "Numel", "Camerupt", "Torkoal", "Spoink",
    "Grumpig", "Spinda", "Trapinch", "Vibrava", "Flygon", "Cacnea", "Cacturne",
    "Swablu", "Altaria", "Zangoose", "Seviper", "Lunatone", "Solrock",
    "Barboach", "Whiscash", "Corphish", "Crawdaunt", "Baltoy", "Claydol",
    "Lileep", "Cradily", "Anorith", "Armaldo", "Feebas", "Milotic", "Castform",
    "Kecleon", "Shuppet", "Banette", "Duskull", "Dusclops", "Tropius",
    "Chimecho", "Absol", "Wynaut", "Snorunt", "Glalie", "Spheal", "Sealeo",
    "Walrein", "Clamperl", "Huntail", "Gorebyss", "Relicanth", "Luvdisc",
    "Bagon", "Shelgon", "Salamence", "Beldum", "Metang", "Metagross",
    "Regirock", "Regice", "Registeel", "Latias", "Latios", "Kyogre", "Groudon",
    "Rayquaza", "Jirachi", "Deoxys", "Turtwig", "Grotle", "Torterra",
    "Chimchar", "Monferno", "Infernape", "Piplup", "Prinplup", "Empoleon",
    "Starly", "Staravia", "Staraptor", "Bidoof", "Bibarel", "Kricketot",
    "Kricketune", "Shinx", "Luxio", "Luxray", "Budew", "Roserade", "Cranidos",
    "Rampardos", "Shieldon", "Bastiodon", "Burmy", "Wormadam", "Mothim",
    "Combee", "Vespiquen", "Pachirisu", "Buizel", "Floatzel", "Cherubi",
    "Cherrim", "Shellos", "Gastrodon", "Ambipom", "Drifloon", "Drifblim",
    "Buneary", "Lopunny", "Mismagius", "Honchkrow", "Glameow", "Purugly",
    "Chingling", "Stunky", "Skuntank", "Bronzor", "Bronzong", "Bonsly",
    "Mime Jr", "Happiny", "Chatot", "Spiritomb", "Gible", "Gabite", "Garchomp",
    "Munchlax", "Riolu", "Lucario", "Hippopotas", "Hippowdon", "Skorupi",
    "Drapion", "Croagunk", "Toxicroak", "Carnivine", "Finneon", "Lumineon",
    "Mantyke", "Snover", "Abomasnow", "Weavile", "Magnezone", "Lickilicky",
    "Rhyperior", "Tangrowth", "Electivire", "Magmortar", "Togekiss", "Yanmega",
    "Leafeon", "Glaceon", "Gliscor", "Mamoswine", "Porygon Z", "Gallade",
    "Probopass", "Dusknoir", "Froslass", "Rotom", "Uxie", "Mesprit", "Azelf",
    "Dialga", "Palkia", "Heatran", "Regigigas", "Giratina", "Cresselia",
    "Phione", "Manaphy", "Darkrai", "Shaymin", "Arceus", "Victini", "Snivy",
    "Servine", "Serperior", "Tepig", "Pignite", "Emboar", "Oshawott", "Dewott",
    "Samurott", "Patrat", "Watchog", "Lillipup", "Herdier", "Stoutland",
    "Purrloin", "Liepard", "Pansage", "Simisage", "Pansear", "Simisear",
    "Panpour", "Simipour", "Munna", "Musharna", "Pidove", "Tranquill",
    "Unfezant", "Blitzle", "Zebstrika", "Roggenrola", "Boldore", "Gigalith",
    "Woobat", "Swoobat", "Drilbur", "Excadrill", "Audino", "Timburr",
    "Gurdurr", "Conkeldurr", "Tympole", "Palpitoad", "Seismitoad", "Throh",
    "Sawk", "Sewaddle", "Swadloon", "Leavanny", "Venipede", "Whirlipede",
    "Scolipede", "Cottonee", "Whimsicott", "Petilil", "Lilligant", "Basculin",
    "Sandile", "Krokorok", "Krookodile", "Darumaka", "Darmanitan", "Maractus",
    "Dwebble", "Crustle", "Scraggy", "Scrafty", "Sigilyph", "Yamask",
    "Cofagrigus", "Tirtouga", "Carracosta", "Archen", "Archeops", "Trubbish",
    "Garbodor", "Zorua", "Zoroark", "Minccino", "Cinccino", "Gothita",
    "Gothorita", "Gothitelle", "Solosis", "Duosion", "Reuniclus", "Ducklett",
    "Swanna", "Vanillite", "Vanillish", "Vanilluxe", "Deerling", "Sawsbuck",
    "Emolga", "Karrablast", "Escavalier", "Foongus", "Amoonguss", "Frillish",
    "Jellicent", "Alomomola", "Joltik", "Galvantula", "Ferroseed", "Ferrothorn",
    "Klink", "Klang", "Klinklang", "Tynamo", "Eelektrik", "Eelektross",
    "Elgyem", "Beheeyem", "Litwick", "Lampent", "Chandelure", "Axew", "Fraxure",
    "Haxorus", "Cubchoo", "Beartic", "Cryogonal", "Shelmet", "Accelgor",
    "Stunfisk", "Mienfoo", "Mienshao", "Druddigon", "Golett", "Golurk",
    "Pawniard", "Bisharp", "Bouffalant", "Rufflet", "Braviary", "Vullaby",
    "Mandibuzz", "Heatmor", "Durant", "Deino", "Zweilous", "Hydreigon",
    "Larvesta", "Volcarona", "Cobalion", "Terrakion", "Virizion", "Tornadus",
    "Thundurus", "Reshiram", "Zekrom", "Landorus", "Kyurem", "Keldeo",
    "Meloetta", "Genesect", "Chespin", "Quilladin", "Chesnaught", "Fennekin",
    "Braixen", "Delphox", "Froakie", "Frogadier", "Greninja", "Bunnelby",
    "Diggersby", "Fletchling", "Fletchinder", "Talonflame", "Scatterbug",
    "Spewpa", "Vivillon", "Litleo", "Pyroar", "Flabebe", "Floette", "Florges",
    "Skiddo", "Gogoat", "Pancham", "Pangoro", "Furfrou", "Espurr", "Meowstic",
    "Honedge", "Doublade", "Aegislash", "Spritzee", "Aromatisse", "Swirlix",
    "Slurpuff", "Inkay", "Malamar", "Binacle", "Barbaracle", "Skrelp",
    "Dragalge", "Clauncher", "Clawitzer", "Helioptile", "Heliolisk", "Tyrunt",
    "Tyrantrum", "Amaura", "Aurorus", "Sylveon", "Hawlucha", "Dedenne",
    "Carbink", "Goomy", "Sliggoo", "Goodra", "Klefki", "Phantump", "Trevenant",
    "Pumpkaboo", "Gourgeist", "Bergmite", "Avalugg", "Noibat", "Noivern",
    "Xerneas", "Yveltal", "Zygarde", "Diancie", "Hoopa", "Volcanion",
]

POKEMON_NAME_BY_ID = {str(index): name for index, name in enumerate(POKEMON_NAMES, start=1)}


def ensure_dir(path: Path) -> None:
    """確保資料夾存在。"""
    path.mkdir(parents=True, exist_ok=True)


def get_image_files(directory: Path, supported_extensions: Iterable[str]) -> List[Path]:
    """取得資料夾內所有支援格式圖片，依檔名排序以保持索引穩定。"""
    extensions = {ext.lower() for ext in supported_extensions}
    if not directory.exists():
        return []
    return sorted(
        [path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in extensions],
        key=lambda path: path.name.lower(),
    )


def save_json(data, path: Path) -> None:
    """以 UTF-8 JSON 格式儲存資料。"""
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def load_json(path: Path):
    """讀取 UTF-8 JSON 檔案。"""
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def cosine_similarity(query_vector: np.ndarray, feature_matrix: np.ndarray) -> np.ndarray:
    """
    計算 query vector 與 feature matrix 的 cosine similarity。

    所有 feature 已在提取階段做 L2 normalize，因此 dot product 即為 cosine similarity。
    """
    query = np.asarray(query_vector, dtype=np.float32).reshape(-1)
    features = np.asarray(feature_matrix, dtype=np.float32)
    return features @ query


def _format_suffix(suffix: str) -> str:
    """將檔名中的型態後綴轉成較易讀文字。"""
    cleaned = suffix.strip("-_ ")
    if not cleaned:
        return ""
    return " ".join(part.capitalize() for part in re.split(r"[-_]+", cleaned) if part)


def clean_pokemon_name(filename: str) -> str:
    """
    由檔名推測寶可夢名稱。

    支援 Pikachu.png 這類名稱檔，也支援 25.jpg、115-mega.jpg 這類 National Dex 編號檔。
    """
    stem = Path(filename).stem
    match = re.match(r"^(?P<number>\d+)(?P<suffix>[-_].+|[A-Za-z].*)?$", stem)
    if match:
        base_name = POKEMON_NAME_BY_ID.get(match.group("number"))
        suffix = _format_suffix(match.group("suffix") or "")
        if base_name and suffix:
            return f"{base_name} {suffix}"
        if base_name:
            return base_name

    return " ".join(part.capitalize() for part in re.split(r"[-_]+", stem) if part) or stem
