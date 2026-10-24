# Virasat (विरासत)

> *“Every tradition deserves a tomorrow.”*

**Virasat** is an open, AI-assisted cultural heritage repository engineered to preserve traditional oral narratives, indigenous recipes, folk practices, ancestral festivals, artisanal crafts, and living cultural memory.

---

## Highlights & Accessibility

- **Zero Local AI Friction**: All AI curation features run instantly via cloud curation. No background daemons or local model downloads required.
- **Oral Accessibility (Listen Aloud)**: Integrated text-to-speech audio narration lets visitors listen to stories and translations read aloud with natural cadence.
- **Preserve Verbatim**: Oral accounts are preserved unchanged in their indigenous tongue, paired with faithful English translations.
- **Strict Archival Grounding**: "Ask the Archive" answers strictly using documented community records, cites accession entries (`[VIR-2026-001]`), and refuses to fabricate out-of-scope facts.
- **Open Data & Export**: Instant one-click JSON export of the entire cultural dataset for researchers, community custodians, and offline archiving.

---

## Quick Start (Run Locally in Seconds)

### Option 1: Full-Stack Web App (Recommended)

```bash
# 1. Install dependencies
npm install

# 2. Start the interactive server
npm run dev
```

Open **`http://localhost:3000`** in your browser. All AI curation and search features work immediately!

---

### Option 2: Python Flask Backend

```bash
# 1. Install Python packages
pip install -r requirements.txt

# 2. Run Flask API
python app.py
```

The Flask API will listen at **`http://127.0.0.1:5000`**.

---

## Automated Verification Tests

Run the test suite to verify all core preservation and query endpoints:

```bash
python -m unittest test_virasat.py
```

---

## Static Demonstration Deployment (GitHub Pages)

To host a static demonstration of the archive catalog on GitHub Pages:

```bash
# 1. Build optimized static distribution
npm run build

# 2. Deploy dist directory to GitHub Pages
npx gh-pages -d dist
```

Your showcase will be live at `https://YOUR_USERNAME.github.io/virasat/`.

---

## Archival Integrity & Fair Use

- **Community Consent**: Contributors affirm cultural consent to preserve stories under public fair use.
- **Unverified Heritage Label**: Records are preserved verbatim as living oral memories and are not claimed as peer-reviewed historical certifications.
- **Original Linguistic Custody**: Original scripts and words are preserved without modification.

---

© 2026 Virasat Cultural Heritage Archive.
