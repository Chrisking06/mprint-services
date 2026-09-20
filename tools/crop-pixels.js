// Verifies the top of the photo survives both fitting modes.
// The test photo has a red band across the top; it must still be there after layout.
const sharp = require("sharp");

const WIDTH = 900;
const HEIGHT = 1600;
const BAND = 240;

async function testPhoto() {
  const band = await sharp({
    create: { width: WIDTH, height: BAND, channels: 3, background: { r: 220, g: 40, b: 40 } }
  }).png().toBuffer();
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 30, g: 80, b: 200 } } })
    .composite([{ input: band, top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
}

async function render(photo, widthInches, heightInches, mode) {
  const width = Math.round(widthInches * 300);
  const height = Math.round(heightInches * 300);
  return sharp(photo)
    .rotate()
    .resize({
      width,
      height,
      fit: mode === "fill" ? "cover" : "contain",
      position: "top",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function describeRow({ data, info }, row) {
  const middle = Math.floor(info.width / 2);
  const index = (row * info.width + middle) * info.channels;
  return `rgb(${data[index]},${data[index + 1]},${data[index + 2]})`;
}

function redRows({ data, info }) {
  const middle = Math.floor(info.width / 2);
  let rows = 0;
  for (let row = 0; row < info.height; row++) {
    const index = (row * info.width + middle) * info.channels;
    if (data[index] > 150 && data[index + 1] < 110 && data[index + 2] < 110) rows++;
  }
  return rows;
}

(async () => {
  const photo = await testPhoto();
  for (const [label, width, height] of [["2×2", 2, 2], ["1×1", 1, 1], ["passport", 1.38, 1.77]]) {
    for (const mode of ["whole", "fill"]) {
      const image = await render(photo, width, height, mode);
      const band = redRows(image);
      console.log(
        `${label.padEnd(9)} ${mode.padEnd(6)} top row=${describeRow(image, 0)} ` +
        `red band rows=${band} (${((band / image.info.height) * 100).toFixed(0)}% of piece) ` +
        `${band > 0 ? "OK top kept" : "TOP CUT"}`
      );
    }
  }
})();
