// Prints how many pieces fit per paper size, for a quick sanity check.
const { plan, piecesPerSheet, PAPERS } = require("../layouts");

const specs = {
  "1×1": { pieces: [{ width: 1, height: 1, count: 1 }], papers: ["2r", "3r", "4r", "5r", "a5", "a4"] },
  "2×2": { pieces: [{ width: 2, height: 2, count: 1 }], papers: ["3r", "4r", "5r", "a5", "a4"] },
  Passport: { pieces: [{ width: 1.38, height: 1.77, count: 1 }], papers: ["3r", "4r", "5r", "a5", "a4"] }
};

for (const [label, spec] of Object.entries(specs)) {
  const line = spec.papers.map(id => `${id.toUpperCase()}=${piecesPerSheet(spec, PAPERS[id])}`).join("  ");
  console.log(`${label.padEnd(9)} ${line}`);
}

const sets = {
  "SET A (2×2 x2 + 1×1 x4)": {
    pieces: [{ width: 2, height: 2, count: 2 }, { width: 1, height: 1, count: 4 }],
    papers: ["3r", "4r", "5r", "a5", "a4"],
    paper: "4r"
  },
  "SET C (2×2 x6)": { pieces: [{ width: 2, height: 2, count: 6 }], papers: ["4r", "5r", "a5", "a4"], paper: "4r" },
  "Instax Mini x10": { pieces: [{ width: 2.13, height: 3.39, count: 10 }], papers: ["a4", "a5", "5r"], paper: "a4" }
};

console.log();
for (const [label, spec] of Object.entries(sets)) {
  const line = spec.papers
    .map(id => {
      const layout = plan(spec, id, 1);
      return `${id.toUpperCase()}=${layout.sheetCount} sheet${layout.landscape ? " (landscape)" : ""}`;
    })
    .join("  ");
  console.log(`${label.padEnd(24)} ${line}`);
}
