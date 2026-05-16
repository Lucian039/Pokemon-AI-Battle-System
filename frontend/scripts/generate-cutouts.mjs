import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDir = path.resolve("public", "pokemon");
const outputDir = path.resolve("public", "pokemon-cutout");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createCutout(sourcePath, outputPath) {
  const image = sharp(sourcePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    if (red >= 238 && green >= 238 && blue >= 238) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(outputPath);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const files = await fs.readdir(sourceDir);
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) continue;

    const outputPath = path.join(outputDir, `${path.parse(file).name}.png`);
    if (await fileExists(outputPath)) {
      skipped += 1;
      continue;
    }

    await createCutout(sourcePath, outputPath);
    created += 1;
  }

  const total = (await fs.readdir(outputDir)).filter((file) => file.endsWith(".png")).length;
  console.log(`created=${created}`);
  console.log(`skipped=${skipped}`);
  console.log(`total=${total}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
