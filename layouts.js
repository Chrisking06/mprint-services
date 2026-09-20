// Paper sizes and packing rules for print-ready layouts.
// Sizes are in inches; PDF points are only used when drawing.

const PAPERS = {
  "2r": { id: "2r", name: "2R / Wallet (2.5×3.5)", width: 2.5, height: 3.5, margin: 0 },
  "3r": { id: "3r", name: "3R (3.5×5)", width: 3.5, height: 5, margin: 0 },
  "4r": { id: "4r", name: "4R (4×6)", width: 4, height: 6, margin: 0 },
  "5r": { id: "5r", name: "5R (5×7)", width: 5, height: 7, margin: 0 },
  "6r": { id: "6r", name: "6R (6×8)", width: 6, height: 8, margin: 0 },
  a5: { id: "a5", name: "A5 (5.8×8.3)", width: 5.83, height: 8.27, margin: 0.12 },
  a4: { id: "a4", name: "A4 (8.3×11.7)", width: 8.27, height: 11.69, margin: 0.12 }
};

function usableArea(paper, landscape) {
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  return { width: width - paper.margin * 2, height: height - paper.margin * 2 };
}

function expandPieces(spec, units, area) {
  if (spec.fill) return Array.from({ length: units }, () => ({ width: area.width, height: area.height }));
  const items = [];
  for (let unit = 0; unit < units; unit++) {
    for (const piece of spec.pieces) {
      for (let copy = 0; copy < piece.count; copy++) items.push({ width: piece.width, height: piece.height });
    }
  }
  return items;
}

// Shelf packing: tallest pieces first, filled left to right in rows.
// Pieces are never rotated, so faces stay upright; the sheet is what we turn.
function shelfPack(area, items) {
  const slack = 1e-6;
  const sorted = [...items].sort((a, b) => b.height - a.height || b.width - a.width);
  const sheets = [];
  let sheet = null;
  let x = 0;
  let top = 0;
  let rowHeight = 0;

  const startSheet = () => {
    sheet = [];
    sheets.push(sheet);
    x = 0;
    top = 0;
    rowHeight = 0;
  };

  for (const item of sorted) {
    if (item.width > area.width + slack || item.height > area.height + slack) return null;
    if (!sheet) startSheet();
    if (x + item.width > area.width + slack) {
      top += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    if (top + item.height > area.height + slack) startSheet();
    sheet.push({ x, top, width: item.width, height: item.height });
    x += item.width;
    rowHeight = Math.max(rowHeight, item.height);
  }

  return sheets;
}

function resolvePaper(spec, paperId) {
  const allowed = spec.papers || Object.keys(PAPERS);
  const wanted = allowed.includes(paperId) ? paperId : spec.paper || allowed[0];
  const paper = PAPERS[wanted];
  if (!paper) throw new Error("Unknown paper size.");
  return paper;
}

// How many pieces fit on one sheet, using the better sheet orientation.
function piecesPerSheet(spec, paper) {
  if (spec.fill) return 1;
  if (spec.pieces.length !== 1) return null;
  const piece = spec.pieces[0];
  return [false, true].reduce((best, landscape) => {
    const area = usableArea(paper, landscape);
    const fit = Math.floor(area.width / piece.width) * Math.floor(area.height / piece.height);
    return Math.max(best, fit);
  }, 0) || null;
}

function plan(spec, paperId, units) {
  const paper = resolvePaper(spec, paperId);
  const options = [];

  for (const landscape of [false, true]) {
    const area = usableArea(paper, landscape);
    const sheets = shelfPack(area, expandPieces(spec, units, area));
    if (sheets) options.push({ landscape, area, sheets });
  }

  if (!options.length) {
    throw new Error(`This size does not fit on ${paper.name}. Please choose a bigger paper size.`);
  }

  const best = options.sort((a, b) => a.sheets.length - b.sheets.length || Number(a.landscape) - Number(b.landscape))[0];
  return {
    paper,
    landscape: best.landscape,
    sheets: best.sheets,
    sheetCount: best.sheets.length,
    pieceCount: best.sheets.reduce((total, sheet) => total + sheet.length, 0),
    pageWidth: best.landscape ? paper.height : paper.width,
    pageHeight: best.landscape ? paper.width : paper.height,
    margin: paper.margin,
    perSheet: piecesPerSheet(spec, paper)
  };
}

function paperChoices(spec) {
  const allowed = spec.papers || [];
  return allowed
    .filter(id => PAPERS[id])
    .map(id => ({
      id,
      name: PAPERS[id].name,
      perSheet: piecesPerSheet(spec, PAPERS[id])
    }));
}

module.exports = { PAPERS, plan, paperChoices, piecesPerSheet, resolvePaper };
