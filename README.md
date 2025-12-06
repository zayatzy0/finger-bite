# FingerBite

Real-time canvas fingerprinting detection for Chromium browsers.

## What It Does

FingerBite detects when websites attempt to fingerprint your browser using Canvas elements. It tracks Canvas lifecycle behavior (visibility, drawing operations, extraction timing, network transmission) and scores each Canvas for likelihood of fingerprinting.

Detection results appear in the browser console with color-coded warnings:
- 🟢 **Unlikely** (0-6 points): Legitimate Canvas use
- 🟠 **Possible** (7-9 points): Suspicious behavior
- 🔴 **Likely** (10+ points): Probable fingerprinting attempt

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/fingerbite.git
   cd fingerbite
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load in Chromium:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `fingerbite` directory

4. Open the browser console (F12) to see extension output.

## Testing

Open the included `test.html` in your browser to run the test suite, or visit known fingerprinting sites like:
- https://amiunique.org/fingerprint
- https://fingerprint.com/

Note: `test.html` was generated for the project using Claude Sonnet 4.5.

## How It Works

FingerBite injects into the page's JavaScript context (Chrome MV3 `world: MAIN`) to intercept Canvas API calls before page scripts execute. It tracks:

- **Creation**: Canvas element creation and context initialization
- **Drawing**: Operations performed (especially text rendering)
- **Extraction**: toDataURL(), getImageData(), toBlob() calls
- **Network**: Correlation between extracted data and network requests

Suspicion scoring uses weighted behavioral heuristics:
- Never in DOM (+5)
- Never visible (+4)
- No context (+5)
- Quick extraction <100ms (+3)
- Few drawing operations <3 (+2)
- Suspicious text patterns (+3)
- Third-party destination (+4)
- Known tracker domain (+5)

## Technical Details

- **TypeScript** implementation
- **Chrome Manifest V3**
- **Injection strategy**: `world: MAIN` at `document_start`
- **Network correlation**: Matches canvas extractions with fetch/XMLHttpRequest bodies

## Current Limitations

- Detection only (no data obfuscation)
- Canvas-specific (doesn't track WebGL, fonts, audio)
- May flag legitimate off-screen image processing
- Console output only (no UI yet)
- Will miss sophisticated attempts - low hanging fruit only

## Project Status

Academic project for COMP-2500 Security Principles. Successfully detects canvas fingerprinting on live sites with low false positive rate.