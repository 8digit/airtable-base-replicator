#!/usr/bin/env node

/**
 * export-schema.js
 *
 * Fetches the full schema from an Airtable base and outputs a processed JSON file
 * ready for the student install HTML generator.
 *
 * Usage:
 *   node export-schema.js --base appXXXXXXXXXX --key patXXXXXXXXXX
 *   node export-schema.js --base appXXXXXXXXXX --key patXXXXXXXXXX --output ./schemas/my-base.json
 */

import { program } from "commander";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Field types that CANNOT be created via the Airtable API.
// These will be created as Long Text placeholders with instructions.
const NON_CREATABLE_TYPES = new Set([
  "formula",
  "rollup",
  "multipleLookupValues", // This is how "lookup" fields appear in the API
  "count",
]);

// Field types that the API refuses to create, but need NO manual config.
// Students can add these themselves with one click — they auto-populate.
// We skip them entirely and just warn the student.
const AUTO_SYSTEM_TYPES = new Set([
  "autoNumber",
  "createdTime",
  "lastModifiedTime",
  "createdBy",
  "lastModifiedBy",
]);

// Field types that need special handling (created in a second pass)
const LINK_TYPE = "multipleRecordLinks";

program
  .requiredOption("--base <baseId>", "Airtable Base ID (starts with app)")
  .requiredOption("--key <apiKey>", "Airtable Personal Access Token (starts with pat)")
  .option("--output <path>", "Output JSON file path", join(__dirname, "..", "output", "schema.json"))
  .option("--name <name>", "Human-readable name for this base schema")
  .parse();

const opts = program.opts();

async function fetchSchema(baseId, apiKey) {
  const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable API error ${res.status}: ${body}`);
  }

  return res.json();
}

function classifyField(field) {
  if (NON_CREATABLE_TYPES.has(field.type)) {
    return "manual";
  }
  if (AUTO_SYSTEM_TYPES.has(field.type)) {
    return "autoSystem";
  }
  if (field.type === LINK_TYPE) {
    // Skip inverse link fields — Airtable auto-creates these when the primary side is created
    if (field.options?.isReversed) {
      return "inverseLink";
    }
    return "link";
  }
  return "creatable";
}

function buildManualInstructions(field) {
  const typeLabel = field.type === "multipleLookupValues" ? "Lookup" : capitalize(field.type);
  let configSummary = "";

  switch (field.type) {
    case "formula":
      configSummary = field.options?.formula
        ? `Formula: ${field.options.formula}`
        : "Formula: (not available — check the original base)";
      break;
    case "rollup":
      configSummary = [
        field.options?.fieldIdInLinkedTable
          ? `Summarize field: ${field.options.fieldIdInLinkedTable}`
          : null,
        field.options?.recordLinkFieldId
          ? `From linked record field: ${field.options.recordLinkFieldId}`
          : null,
        field.options?.result?.formula
          ? `Aggregation: ${field.options.result.formula}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      if (!configSummary) configSummary = "(check the original base for rollup configuration)";
      break;
    case "multipleLookupValues":
      configSummary = [
        field.options?.fieldIdInLinkedTable
          ? `Lookup field: ${field.options.fieldIdInLinkedTable}`
          : null,
        field.options?.recordLinkFieldId
          ? `From linked record field: ${field.options.recordLinkFieldId}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      if (!configSummary) configSummary = "(check the original base for lookup configuration)";
      break;
    case "count":
      configSummary = field.options?.recordLinkFieldId
        ? `Count records from linked field: ${field.options.recordLinkFieldId}`
        : "(check the original base for count configuration)";
      break;
    default:
      configSummary = "(check the original base for configuration)";
  }

  // Short description for the field description (Airtable allows up to 20k chars)
  const description = `⚠️ MANUAL SETUP REQUIRED — ${typeLabel}: ${configSummary.split("\n")[0]}`;

  // Full instructions for the cell content in the instruction record
  const cellInstructions = [
    `⚠️ MANUAL SETUP REQUIRED`,
    ``,
    `Field type: ${typeLabel} (currently Long Text — you must change it)`,
    ``,
    configSummary,
    ``,
    `Steps:`,
    `1. Click this field's column header`,
    `2. Select "Customize field type"`,
    `3. Change the type from "Long text" to "${typeLabel}"`,
    `4. Configure using the information above`,
    `5. Click "Save"`,
    `6. Delete this instruction row when you're done with ALL fields in this table`,
  ].join("\n");

  return { description, cellInstructions };
}

function processSchema(rawSchema, baseName) {
  const tables = rawSchema.tables.map((table) => {
    const creatableFields = [];
    const linkFields = [];
    const manualFields = [];
    const inverseLinkFields = [];
    const autoSystemFields = [];

    for (const field of table.fields) {
      const category = classifyField(field);

      // Build a clean field object (strip IDs that are base-specific)
      const cleanField = {
        originalId: field.id,
        name: field.name,
        type: field.type,
        description: field.description || "",
      };

      // Preserve options that are needed for field creation
      if (field.options) {
        cleanField.options = JSON.parse(JSON.stringify(field.options));
        // Strip auto-generated IDs from select choices
        if (cleanField.options.choices) {
          cleanField.options.choices = cleanField.options.choices.map(({ name, color }) => {
            const c = { name };
            if (color) c.color = color;
            return c;
          });
        }
      }

      switch (category) {
        case "creatable":
          creatableFields.push(cleanField);
          break;
        case "link":
          cleanField.linkedTableId = field.options?.linkedTableId;
          cleanField.prefersSingleRecordLink = field.options?.prefersSingleRecordLink || false;
          linkFields.push(cleanField);
          break;
        case "manual": {
          const instructions = buildManualInstructions(field);
          cleanField.manualType = field.type === "multipleLookupValues" ? "Lookup" : capitalize(field.type);
          cleanField.manualDescription = instructions.description;
          cleanField.manualCellInstructions = instructions.cellInstructions;
          // Store original options for reference
          cleanField.originalOptions = field.options || {};
          manualFields.push(cleanField);
          break;
        }
        case "autoSystem":
          autoSystemFields.push(cleanField);
          break;
        case "inverseLink":
          inverseLinkFields.push(cleanField);
          break;
      }
    }

    return {
      originalId: table.id,
      name: table.name,
      description: table.description || "",
      primaryFieldId: table.primaryFieldId,
      creatableFields,
      linkFields,
      manualFields,
      autoSystemFields,
      inverseLinkFields,
    };
  });

  // Resolve linked table references: replace table IDs with table names
  // so the install script can map by name after creating tables
  const tableIdToName = {};
  for (const table of tables) {
    tableIdToName[table.originalId] = table.name;
  }

  for (const table of tables) {
    for (const linkField of table.linkFields) {
      linkField.linkedTableName = tableIdToName[linkField.linkedTableId] || linkField.linkedTableId;
    }
    // Also resolve references in manual field instructions (rollup/lookup reference linked fields)
    for (const manualField of table.manualFields) {
      if (manualField.originalOptions?.recordLinkFieldId) {
        // Find which table+field this references
        for (const t of tables) {
          for (const f of [...t.creatableFields, ...t.linkFields]) {
            if (f.originalId === manualField.originalOptions.recordLinkFieldId) {
              manualField.manualCellInstructions = manualField.manualCellInstructions.replace(
                manualField.originalOptions.recordLinkFieldId,
                `"${f.name}" field`
              );
              manualField.manualDescription = manualField.manualDescription.replace(
                manualField.originalOptions.recordLinkFieldId,
                `"${f.name}" field`
              );
            }
          }
        }
      }
      if (manualField.originalOptions?.fieldIdInLinkedTable) {
        // Try to resolve the field name in the linked table
        const linkedTableId = manualField.originalOptions?.recordLinkFieldId;
        // Find the link field to know which table it points to
        for (const t of tables) {
          for (const f of [...t.linkFields, ...t.inverseLinkFields]) {
            if (f.originalId === linkedTableId && f.linkedTableId) {
              const linkedTable = tables.find((tt) => tt.originalId === f.linkedTableId);
              if (linkedTable) {
                const linkedField = [
                  ...linkedTable.creatableFields,
                  ...linkedTable.linkFields,
                  ...linkedTable.manualFields,
                ].find((ff) => ff.originalId === manualField.originalOptions.fieldIdInLinkedTable);
                if (linkedField) {
                  manualField.manualCellInstructions = manualField.manualCellInstructions.replace(
                    manualField.originalOptions.fieldIdInLinkedTable,
                    `"${linkedField.name}" in "${linkedTable.name}"`
                  );
                  manualField.manualDescription = manualField.manualDescription.replace(
                    manualField.originalOptions.fieldIdInLinkedTable,
                    `"${linkedField.name}" in "${linkedTable.name}"`
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    name: baseName || "Airtable Base",
    exportedAt: new Date().toISOString(),
    tableCount: tables.length,
    tables,
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function main() {
  console.log(`Fetching schema for base ${opts.base}...`);
  const rawSchema = await fetchSchema(opts.base, opts.key);
  console.log(`Found ${rawSchema.tables.length} table(s).`);

  const processed = processSchema(rawSchema, opts.name);

  // Summary
  for (const table of processed.tables) {
    const parts = [`  ${table.name}:`];
    parts.push(`${table.creatableFields.length} fields`);
    if (table.linkFields.length > 0) parts.push(`${table.linkFields.length} link(s)`);
    if (table.manualFields.length > 0) parts.push(`${table.manualFields.length} manual-setup`);
    if (table.autoSystemFields.length > 0) parts.push(`${table.autoSystemFields.length} auto-system skipped`);
    if (table.inverseLinkFields.length > 0) parts.push(`${table.inverseLinkFields.length} inverse-link(s) skipped`);
    console.log(parts.join(", "));
  }

  // Write output
  const outputPath = resolve(opts.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(processed, null, 2));
  console.log(`\nSchema written to ${outputPath}`);
  console.log(`\nNext step: run generate-html.js to create student install pages.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
