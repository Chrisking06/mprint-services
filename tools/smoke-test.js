// End-to-end check against a running server: submit orders and inspect the PDF pages.
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const base = process.env.BASE_URL || "http://localhost:3000";
const admin = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "mprint123"
};
const photo = fs.readFileSync(path.join(__dirname, "..", "public", "img", "logo.png"));

async function submit(serviceId, paper, quantity) {
  const form = new FormData();
  form.set("serviceId", serviceId);
  form.set("paper", paper);
  form.set("quantity", String(quantity));
  form.set("customerName", "Layout check");
  form.set("image", new File([photo], "photo.png", { type: "image/png" }));
  const response = await fetch(`${base}/api/orders`, { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(`${serviceId} ${paper}: ${result.error}`);
  return result;
}

(async () => {
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(admin)
  });
  if (!login.ok) throw new Error("Admin login failed.");
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");

  const cases = [
    ["photo-1x1", "3r", 15],
    ["photo-2x2", "3r", 2],
    ["photo-2x2", "4r", 6],
    ["rush-a", "4r", 1],
    ["instax-mini", "a4", 1]
  ];

  for (const [serviceId, paper, quantity] of cases) {
    const order = await submit(serviceId, paper, quantity);
    const pdfResponse = await fetch(`${base}/api/admin/orders/${order.id}/layout.pdf`, { headers: { cookie } });
    if (!pdfResponse.ok) throw new Error(`PDF failed for ${serviceId}`);
    const pdf = await PDFDocument.load(await pdfResponse.arrayBuffer());
    const page = pdf.getPage(0);
    const size = `${(page.getWidth() / 72).toFixed(2)}×${(page.getHeight() / 72).toFixed(2)} in`;
    console.log(
      `${serviceId.padEnd(13)} ${paper} qty=${String(quantity).padEnd(3)} ` +
      `sheets=${order.sheets} pages=${pdf.getPageCount()} page=${size} (${order.paperName})`
    );
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
