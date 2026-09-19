// Generates transparent logo variants from public/img/logo.png (white-background source).
const path = require("path");
const sharp = require("sharp");

const publicImg = path.join(__dirname, "..", "public", "img");
const source = path.join(publicImg, "logo.png");

async function removeWhite(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 242 && g > 242 && b > 242) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

(async () => {
  const transparent = await removeWhite(source);

  await sharp(transparent).trim().png().toFile(path.join(publicImg, "logo-full.png"));

  // Monogram only: top ~55% of the square artwork, above the wordmark.
  // trim() runs early in a sharp pipeline, so crop and trim in separate passes.
  const { width, height } = await sharp(transparent).metadata();
  const monogram = await sharp(transparent)
    .extract({ left: 0, top: 0, width, height: Math.round(height * 0.55) })
    .png()
    .toBuffer();

  await sharp(monogram)
    .trim()
    .resize({ height: 256, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicImg, "icon.png"));

  console.log("Created logo-full.png and icon.png");
})();
