#!/usr/bin/env node
/**
 * Replays Medusa's product-import CSV chunking + JSON.stringify/parse.
 *
 *   node scripts/verify_medusa_product_import_csv.js syzmik_medusa_import_medusa_files.csv
 */
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..", "backend");
const pnpmDir = path.join(backendRoot, "node_modules", ".pnpm");
function findPackageDir(prefix) {
  const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
  const hit = entries.find((e) => e.isDirectory() && e.name.startsWith(prefix));
  if (!hit) {
    throw new Error(`Could not find ${prefix}* under ${pnpmDir} (run pnpm install in backend/)`);
  }
  return path.join(pnpmDir, hit.name, "node_modules");
}

const csvParseRoot = findPackageDir("csv-parse@");
const medusaUtilsRoot = findPackageDir("@medusajs+utils@");

const { parse } = require(path.join(csvParseRoot, "csv-parse"));
const { CSVNormalizer, productValidators } = require(
  path.join(medusaUtilsRoot, "@medusajs", "utils", "dist", "product")
);

const csvPath = path.resolve(process.argv[2] || "syzmik_medusa_import_medusa_files.csv");
const content = fs.readFileSync(csvPath, "utf8");

function processChunk(rows, label) {
  const normalizer = new CSVNormalizer(rows);
  const products = normalizer.proccess(0);
  const create = Object.keys(products.toCreate).map((h) =>
    productValidators.CreateProduct.parse(products.toCreate[h])
  );
  const update = Object.keys(products.toUpdate).map((id) =>
    productValidators.UpdateProduct.parse(products.toUpdate[id])
  );
  const json = JSON.stringify({ create, update });
  JSON.parse(json);
  console.log(`${label}: OK (${rows.length} rows, json ${json.length} bytes)`);
}

const allRows = [];
let rowNum = 0;
const parser = parse({ columns: true, skip_empty_lines: true });
parser.on("readable", () => {
  let r;
  while ((r = parser.read()) !== null) {
    rowNum++;
    allRows.push(CSVNormalizer.preProcess(r, rowNum));
  }
});
parser.on("end", () => {
  const rowsToRead = 1000;
  let rowsReadSoFar = 0;
  let rows = [];
  let currentRowUniqueValue;
  let chunkIdx = 0;

  for (const normalizedRow of allRows) {
    rowsReadSoFar++;
    const rowValueValue =
      normalizedRow["product id"] || normalizedRow["product handle"];
    if (rowsReadSoFar > rowsToRead) {
      if (rowValueValue !== currentRowUniqueValue) {
        chunkIdx++;
        processChunk(rows, `chunk ${chunkIdx}`);
        rows = [normalizedRow];
        rowsReadSoFar = 0;
      } else {
        rows.push(normalizedRow);
      }
    } else {
      rows.push(normalizedRow);
    }
    currentRowUniqueValue = rowValueValue;
  }
  if (rows.length) {
    chunkIdx++;
    processChunk(rows, `chunk ${chunkIdx}`);
  }
  console.log(`All ${chunkIdx} chunks parse as JSON OK.`);
});
parser.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
parser.write(content);
parser.end();
