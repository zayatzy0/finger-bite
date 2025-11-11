# Fingerprint Detector

A browser extension that detects canvas fingerprinting attempts in real-time and gives users control over how to respond.

## What Makes This Novel

Unlike existing anti-fingerprinting extensions that either block everything (breaking websites) or randomize blindly (potentially making you more unique), this extension:

- **Detects fingerprinting attempts** using behavioral heuristics
- **Tracks where data is sent** (third-party trackers vs. internal security)
- **Gives users control** - allow legitimate uses, block invasive tracking
- **Preserves functionality** - only intervenes when actual fingerprinting is detected

## Current Features (v0.1 - MVP)

✅ Canvas API interception in page context  
✅ Real-time detection of `toDataURL()` calls  
✅ Console logging of suspicious canvas activity  
⚠️ User notification UI (in progress)  
⚠️ Network activity tracking (planned)  
⚠️ User preference storage (planned)  

## Planned Features

**Phase 1 (Current):**
- Canvas lifecycle tracking
- Behavioral suspicion scoring
- Detection of fingerprinting patterns vs. legitimate use

**Phase 2:**
- Network activity monitoring
- Correlation between canvas extraction and data transmission
- User notification popup

**Phase 3:**
- Per-domain user preferences (allow/randomize/block)
- Additional fingerprinting vector detection (WebGL, fonts)
- Comprehensive testing and accuracy metrics

## Technical Implementation

**Architecture:**
- TypeScript-based Chrome extension (Manifest V3)
- Runs in page context (`"world": "MAIN"`) to intercept Canvas APIs
- Prototype-level interception of `toDataURL()` and `getContext()`

**Key Innovation:**
Uses `"world": "MAIN"` to inject into the page's JavaScript context before page scripts load, enabling true API interception rather than isolated content script monitoring.

## Installation & Development

### Prerequisites
- Node.js (v14 or higher)
- npm
- Chrome/Chromium browser

### Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd fingerprint-detector
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```
   
   Or use watch mode during development:
   ```bash
   npm run watch
   ```

4. **Load in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `fingerprint-detector` directory
   - Extension should load successfully

### Testing

**Quick Test:**
1. Visit https://amiunique.org
2. Open DevTools console (F12)
3. Look for: `🔴 toDataURL CALLED - FINGERPRINTING DETECTED!`

**Test Sites:**
- **Fingerprinting sites:** AmIUnique.org, BrowserLeaks.com, Pixelscan.net
- **Legitimate canvas use:** News sites with charts, online games, data visualization sites

### Development Workflow

1. Edit TypeScript files in `src/`
2. Code auto-compiles to `dist/` (if watch mode running)
3. Reload extension at `chrome://extensions/` (click reload icon)
4. Refresh test page to see changes

## Project Structure

```
fingerprint-detector/
├── src/
│   └── injected.ts          # Canvas interception logic
├── dist/                    # Compiled JavaScript (auto-generated)
│   └── injected.js
├── manifest.json            # Extension configuration
├── tsconfig.json            # TypeScript configuration
├── package.json             # Dependencies and scripts
└── README.md
```

## Research Context

This extension is part of a security research project investigating:
- Behavioral detection of fingerprinting vs. legitimate API use
- Effectiveness of user-controlled privacy tools
- The balance between privacy protection and website functionality

**Research Question:**  
*"Can behavioral heuristics reliably distinguish fingerprinting attempts from legitimate Canvas/WebGL API use, and does tracking data transmission destinations improve detection confidence?"*

## Contributing

This is currently an academic research project. Issues and pull requests are welcome for:
- Bug fixes
- Detection accuracy improvements  
- Additional fingerprinting vector support
- Documentation improvements

## Known Limitations

- Currently only detects canvas fingerprinting (not WebGL, fonts, etc.)
- Console logging only (no user-facing UI yet)
- No automatic blocking or randomization (detection only)
- May have false positives on legitimate canvas-heavy sites

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built as part of COMP 2500 (Security Principles) coursework, exploring practical applications of browser security and privacy concepts.

## Contact

For questions about this project, please open an issue on GitHub.