#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const root = __dirname;
const suppliedInput = process.argv[2];
const inputDir = suppliedInput
  ? path.resolve(process.cwd(), suppliedInput)
  : path.join(root, "placeholder-frames");
const outputDir = path.join(root, "sprites");
const fps = 16;
const frameInterval = 30;
const frameCount = 64;
const columns = 8;
const rows = 8;
const cellWidth = 320;
const cellHeight = 240;

const palette = [
  ["#f2ca52", "#662e2e"],
  ["#ef8354", "#2d3142"],
  ["#81c3d7", "#16425b"],
  ["#cdb4db", "#4a315c"],
  ["#95d5b2", "#1b4332"],
  ["#ffafcc", "#4b244a"],
  ["#a8dadc", "#1d3557"],
  ["#ffd6a5", "#6d4534"],
];

function placeholderSvg(index, frame) {
  const [background, foreground] = palette[index % palette.length];
  const seconds = (frame / fps).toFixed(1);
  return Buffer.from(`
    <svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${background}"/>
      <circle cx="${40 + (index % columns) * 34}" cy="54" r="26" fill="${foreground}" opacity=".22"/>
      <path d="M0 150 L${70 + index * 4} 82 L320 142 L320 180 L0 180Z" fill="${foreground}" opacity=".18"/>
      <text x="22" y="43" fill="${foreground}" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="2">COMBINED STILL</text>
      <text x="20" y="103" fill="${foreground}" font-family="Arial, sans-serif" font-size="38" font-weight="700">FRAME ${String(frame).padStart(6, "0")}</text>
      <text x="22" y="137" fill="${foreground}" font-family="Arial, sans-serif" font-size="18">${seconds}s · placeholder ${index + 1}</text>
    </svg>
  `);
}

async function createPlaceholders() {
  await fs.mkdir(inputDir, { recursive: true });
  await Promise.all(
    Array.from({ length: frameCount }, async (_, index) => {
      const frame = index * frameInterval;
      const filename = `combined-frame-${String(frame).padStart(6, "0")}.webp`;
      await sharp(placeholderSvg(index, frame)).webp({ quality: 84 }).toFile(path.join(inputDir, filename));
    })
  );
}

async function buildSprites() {
  const filenames = (await fs.readdir(inputDir))
    .map((filename) => ({ filename, match: filename.match(/frame[\s_-]*(\d+)/i) }))
    .filter(({ match }) => match)
    .map(({ filename, match }) => ({ filename, frame: Number(match[1]) }))
    .sort((a, b) => a.frame - b.frame);

  if (!filenames.length) throw new Error(`No filenames containing frame numbers found in ${inputDir}`);

  await fs.mkdir(outputDir, { recursive: true });
  const framesPerSheet = columns * rows;
  const sheets = [];

  for (let start = 0; start < filenames.length; start += framesPerSheet) {
    const group = filenames.slice(start, start + framesPerSheet);
    const usedRows = Math.ceil(group.length / columns);
    const sheetIndex = Math.floor(start / framesPerSheet);
    const sheetName = `sheet-${String(sheetIndex).padStart(3, "0")}.webp`;
    const composites = await Promise.all(
      group.map(async (item, index) => ({
        input: await sharp(path.join(inputDir, item.filename))
          .resize(cellWidth, cellHeight, { fit: "cover" })
          .webp()
          .toBuffer(),
        left: (index % columns) * cellWidth,
        top: Math.floor(index / columns) * cellHeight,
      }))
    );

    await sharp({
      create: {
        width: columns * cellWidth,
        height: usedRows * cellHeight,
        channels: 3,
        background: "#111111",
      },
    })
      .composite(composites)
      .webp({ quality: 82 })
      .toFile(path.join(outputDir, sheetName));

    sheets.push({
      src: `sprites/${sheetName}`,
      frames: group.map((item, index) => ({
        frame: item.frame,
        column: index % columns,
        row: Math.floor(index / columns),
      })),
    });
  }

  const manifest = { fps, cellWidth, cellHeight, columns, rows, sheets };
  const manifestJson = JSON.stringify(manifest, null, 2);
  await fs.writeFile(path.join(root, "manifest.json"), `${manifestJson}\n`);
  await fs.writeFile(
    path.join(root, "manifest.js"),
    `window.SPRITE_MANIFEST = ${manifestJson};\n`
  );
  console.log(`Packed ${filenames.length} images into ${sheets.length} sprite sheet(s).`);
}

const prepareInput = suppliedInput ? Promise.resolve() : createPlaceholders();

prepareInput.then(buildSprites).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
