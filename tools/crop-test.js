// Checks that layouts keep the top of the photo. Writes sample PDFs to data/.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const base = process.env.BASE_URL || "http://localhost:3000";
const admin = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "mprint123"
};

// A tall portrait test photo: red band on top (the "hair"), blue at the bottom.
async function testPhoto() {
  const width = 900;
  const height = 1600;
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 80, b: 200 } }
  })
    .composite([
      {
        input: await sharp({ create: { width, height: 240, channels: 3, background: { r: 220, g: 40, b: 40 } } }).png().toBuffer(),
        top: 0,
        left: 0
      }
    ])
    .jpeg()
    .toBuffer();
}

async function submit(photo, serviceId, paper, quantity, cropMode) {
  const form = new FormData();
  form.set("serviceId", serviceId);
  form.set("paper", paper);
  form.set("quantity", String(quantity));
  form.set("cropMode", cropMode);
  form.set("customerName", `crop-${cropMode}`);
  form.set("image", new File([photo], "photo.jpg", { type: "image/jpeg" }));
  const response = await fetch(`${base}/api/orders`, { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(`${serviceId} ${paper} ${cropMode}: ${result.error}`);
  return result;
}

(async () => {
  const photo = await testPhoto();
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(admin)
  });
  if (!login.ok) throw new Error("Admin login failed.");
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");

  const cases = [
    ["photo-2x2", "a5", 8, "whole"],
    ["photo-2x2", "a5", 8, "fill"],
    ["photo-1x1", "a5", 40, "whole"],
    ["rush-a", "a5", 1, "whole"]
  ];

  for (const [serviceId, paper, quantity, cropMode] of cases) {
    const order = await submit(photo, serviceId, paper, quantity, cropMode);
    const pdfResponse = await fetch(`${base}/api/admin/orders/${order.id}/layout.pdf`, { headers: { cookie } });
    if (!pdfResponse.ok) throw new Error(`PDF failed for ${serviceId} ${cropMode}`);
    const file = path.join(__dirname, "..", "data", `sample-${serviceId}-${paper}-${cropMode}.pdf`);
    fs.writeFileSync(file, Buffer.from(await pdfResponse.arrayBuffer()));
    console.log(`${serviceId} ${paper} ${cropMode}: sheets=${order.sheets} -> ${path.basename(file)}`);
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
