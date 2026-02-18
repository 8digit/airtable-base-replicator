#!/usr/bin/env node

/**
 * generate-html.js
 *
 * Reads a processed schema JSON and generates self-contained HTML install pages.
 * Produces:
 *   - install-all.html (entire base)
 *   - install-{TableName}.html (per-table, including dependency tables for linked fields)
 *
 * Usage:
 *   node generate-html.js --schema ./output/schema.json
 *   node generate-html.js --schema ./output/schema.json --proxy https://your-worker.workers.dev
 *   node generate-html.js --schema ./output/schema.json --output ./output --proxy https://your-worker.workers.dev
 */

import { program } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

program
  .requiredOption("--schema <path>", "Path to the processed schema JSON file")
  .option("--output <dir>", "Output directory for HTML files", join(__dirname, "..", "output"))
  .option("--proxy <url>", "CORS proxy URL (Cloudflare Worker)", "https://YOUR-WORKER.workers.dev")
  .option("--per-table", "Also generate per-table install files", false)
  .parse();

const opts = program.opts();

function loadTemplate() {
  const templatePath = join(__dirname, "..", "template", "install.html");
  return readFileSync(templatePath, "utf-8");
}

function generateHtml(template, schema, proxyUrl) {
  // Inject the schema JSON and proxy URL into the template
  const schemaJson = JSON.stringify(schema);
  let html = template.replace("__SCHEMA_DATA_PLACEHOLDER__", schemaJson);
  html = html.replace("__PROXY_URL_PLACEHOLDER__", proxyUrl);
  return html;
}

function getTableDependencies(table, allTables) {
  // For a single-table install, find all tables that this table's link fields reference
  const deps = new Set();
  for (const linkField of table.linkFields) {
    if (linkField.linkedTableName && linkField.linkedTableName !== table.name) {
      deps.add(linkField.linkedTableName);
    }
  }
  // Also include tables that link TO this table (inverse links need both sides to exist)
  for (const t of allTables) {
    for (const lf of t.linkFields) {
      if (lf.linkedTableName === table.name && t.name !== table.name) {
        deps.add(t.name);
      }
    }
  }
  return deps;
}

function createPerTableSchema(table, fullSchema) {
  const deps = getTableDependencies(table, fullSchema.tables);
  const includedTables = [table];

  for (const depName of deps) {
    const depTable = fullSchema.tables.find((t) => t.name === depName);
    if (depTable) {
      includedTables.push(depTable);
    }
  }

  return {
    name: `${fullSchema.name} — ${table.name}`,
    exportedAt: fullSchema.exportedAt,
    tableCount: includedTables.length,
    tables: includedTables,
    primaryTable: table.name,
  };
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

function main() {
  const schemaPath = resolve(opts.schema);
  const fullSchema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const template = loadTemplate();
  const outputDir = resolve(opts.output);
  mkdirSync(outputDir, { recursive: true });

  // Generate full-base install page (filename includes course name)
  const fullHtml = generateHtml(template, fullSchema, opts.proxy);
  const baseName = sanitizeFilename(fullSchema.name || "all");
  const fullFilename = `install-${baseName}.html`;
  const fullPath = join(outputDir, fullFilename);
  writeFileSync(fullPath, fullHtml);
  console.log(`Generated: ${fullPath} (${fullSchema.tableCount} tables)`);

  // Generate per-table install pages
  if (opts.perTable) {
    for (const table of fullSchema.tables) {
      const tableSchema = createPerTableSchema(table, fullSchema);
      const tableHtml = generateHtml(template, tableSchema, opts.proxy);
      const filename = `install-${sanitizeFilename(table.name)}.html`;
      const tablePath = join(outputDir, filename);
      writeFileSync(tablePath, tableHtml);
      const depCount = tableSchema.tableCount - 1;
      const depNote = depCount > 0 ? ` (+${depCount} dependency table(s))` : "";
      console.log(`Generated: ${tablePath}${depNote}`);
    }
  }

  console.log(`\nDone! Distribute the HTML files to your students.`);
  if (opts.proxy.includes("YOUR-WORKER")) {
    console.log(`\n⚠️  You used the default proxy URL. Update it with your actual Cloudflare Worker URL:`);
    console.log(`   node generate-html.js --schema ${opts.schema} --proxy https://your-actual-worker.workers.dev`);
  }
}

main();
