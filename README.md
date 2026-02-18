# Airtable Base Replicator

Lets students replicate your Airtable table structures into their own bases. No data is copied — only tables, fields, and field configurations. Designed for classrooms where everyone needs identical base schemas (e.g., for n8n automations).

## How it works

**Your side (teacher) — two options:**

**Option A: Admin Web UI (no terminal needed)**
1. Open `admin.html` in your browser
2. Enter your API key, proxy URL, Base ID, and Course Name
3. Click "Fetch Schema & Generate HTML"
4. Download the generated HTML file
5. Upload it to GitHub Pages (or any host) and share the link

**Option B: CLI (terminal)**
1. Run `export-schema.js` to read your base schema
2. Run `generate-html.js` to produce the install HTML file
3. Share the HTML file with students

**Student side:**
1. Click the install link you shared (or open the HTML file)
2. Enter their Airtable API key and Base ID
3. Click "Start" — tables and fields are created automatically

## Setup

### 1. Install dependencies

```bash
cd cli
npm install
```

### 2. Deploy the CORS proxy

The Airtable API blocks browser requests (CORS). A tiny Cloudflare Worker acts as a pass-through proxy.

```bash
# Install wrangler if you don't have it
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy the worker
cd worker
npx wrangler deploy
```

After deploying, you'll get a URL like `https://airtable-replicator-proxy.YOUR-ACCOUNT.workers.dev`. Save this — you'll need it in step 4.

**Free tier:** 100,000 requests/day (more than enough for a classroom).

### 3. Export your base schema

```bash
cd cli
node export-schema.js --base appYOUR_BASE_ID --key patYOUR_API_KEY --name "My Course Base"
```

This creates `output/schema.json` with the processed schema. Your API key and Base ID are **not** embedded in the output.

**Options:**
- `--output ./path/to/file.json` — custom output path
- `--name "Human Readable Name"` — name shown to students

### 4. Generate install pages

```bash
cd cli
node generate-html.js --schema ../output/schema.json --proxy https://airtable-replicator-proxy.YOUR-ACCOUNT.workers.dev
```

This creates `output/install-all.html`.

**Options:**
- `--per-table` — also generate one HTML file per table
- `--output ./path/to/dir` — custom output directory

### 5. Share with students

Upload the HTML files to:
- GitHub Pages
- Your LMS (Canvas, Moodle, etc.)
- Google Drive (as a downloadable file)
- Or email them directly

## Student instructions

Give your students these steps:

1. **Create a Personal Access Token** at [airtable.com/create/tokens](https://airtable.com/create/tokens)
   - Scopes needed: `schema.bases:write` and `data.records:write`
   - Add access to the base they want to set up

2. **Create an empty base** in Airtable (or use an existing empty one)

3. **Get the Base ID** from the URL: `airtable.com/appXXXXXXXXXX/...`

4. **Open the install page** you shared with them

5. **Enter their token and Base ID**, then click Start

## Field handling

| Field Type | Behavior |
|---|---|
| Text, number, checkbox, select, date, etc. | Created automatically |
| Linked records | Created automatically (two-pass: tables first, then links) |
| Formula, rollup, lookup, count | Created as "Long Text" placeholders with setup instructions in the field description and in a special instruction row |
| Inverse link fields | Skipped (Airtable auto-creates these) |

For formula/rollup/lookup/count fields, the tool:
- Creates the field as Long Text with the original name
- Adds the formula/config to the field description
- Creates an instruction row in the table with step-by-step setup instructions
- Students change the field type manually and paste the formula/config

## Security

- **Your API key and Base ID** are only used locally during schema export. They are never embedded in any output file.
- **Student API keys** are sent over HTTPS to the Cloudflare Worker, which forwards them to Airtable. The Worker never stores or logs keys.
- **The Worker** only forwards requests to `https://api.airtable.com/*`.

## Project structure

```
airtable-base-replicator/
├── cli/
│   ├── export-schema.js     # Fetches and processes base schema
│   ├── generate-html.js     # Generates install HTML files
│   └── package.json
├── template/
│   └── install.html         # Student UI template
├── worker/
│   ├── index.js             # Cloudflare Worker CORS proxy
│   └── wrangler.toml
├── admin.html               # Teacher admin UI (no terminal needed)
├── output/                  # Generated files (gitignored)
└── README.md
```

## Updating a schema

If you change your base structure, re-run the export and generate steps:

```bash
cd cli
node export-schema.js --base appYOUR_BASE_ID --key patYOUR_API_KEY --name "My Course Base"
node generate-html.js --schema ../output/schema.json --proxy https://your-worker.workers.dev
```

Then redistribute the updated HTML files.

## Hosting for students

The easiest way to share install pages is via **GitHub Pages** (free):

1. Create a GitHub repo (e.g., `my-course-installers`)
2. Upload your generated HTML files to the repo
3. Go to **Settings → Pages → Source: main branch**
4. Students access the install page at: `https://yourusername.github.io/my-course-installers/install-ai-video-b-roll-agent.html`

Other options: Netlify drop (drag & drop), your LMS file manager, Google Drive (share link → student downloads), or email the HTML file directly.
