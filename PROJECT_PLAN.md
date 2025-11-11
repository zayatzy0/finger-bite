# Project Synthesis: Browser Fingerprinting Detection Extension

## 🎯 Core Concept

**A browser extension that detects fingerprinting attempts in real-time and gives users control over how to respond.**

**What makes this novel:**
- Most extensions either block everything (breaks sites) or nothing (no protection)
- Your extension **detects when fingerprinting happens** and lets users decide
- Tracks **where fingerprint data is sent** (third-party trackers vs. internal security)
- Addresses the ethical dilemma from your paper: fingerprinting has legitimate uses (fraud detection) AND invasive uses (tracking)

---

## 💡 Major Ideas from Our Discussion

### 1. **Detection-First Approach**
Instead of blindly randomizing everything, detect fingerprinting attempts using behavioral heuristics:
- Canvas created but never displayed
- Immediate data extraction after minimal drawing
- Known fingerprinting test strings ("Cwm fjordbank glyphs")
- Hidden/off-screen positioning
- Tiny canvas dimensions

### 2. **Network Activity Tracking**
Track where fingerprint data goes:
- Intercept fetch/XMLHttpRequest calls
- Detect canvas data URLs in request bodies
- Identify third-party destinations
- Flag known tracking domains
- **Correlate canvas extraction with network requests** (high-confidence detection)

### 3. **User Control Model**
Give users visibility and choice:
- Pop-up notification when fingerprinting detected
- Show what was collected and where it's being sent
- User decides: Allow / Randomize / Block
- Remember preferences per domain
- Balance privacy vs. functionality

### 4. **Suspicion Scoring System**
Accumulate evidence across multiple signals:
- Canvas visibility: 5 points
- Suspicious text strings: 3 points
- Quick extraction: 3 points
- Third-party transmission: 4 points
- Known tracker destination: 5 points
- **Threshold: 7+ points = likely fingerprinting**

---

## 📋 Implementation Architecture

### Core Components

```
fingerprint-detector/
├── src/
│   ├── content.ts           # Main detection logic (runs on every page)
│   ├── background.ts        # Message relay, background tasks
│   └── popup.ts             # UI logic for popup
├── dist/                    # Compiled JavaScript (auto-generated)
│   ├── content.js
│   ├── background.js
│   └── popup.js
├── manifest.json            # Extension configuration
├── popup.html               # User interface
├── popup.css                # UI styling (optional)
├── tsconfig.json            # TypeScript configuration
├── package.json             # Node dependencies and scripts
└── node_modules/            # Dependencies (auto-generated)
```

### Detection Flow

```
1. Page loads → content.ts injected
2. Intercept Canvas API calls
   ├── Track canvas lifecycle
   ├── Monitor drawing operations
   └── Check visibility
3. Intercept network requests
   ├── Detect fingerprint data
   └── Track destinations
4. Calculate suspicion score
5. If score >= 7 → Send message to background.ts
6. Background relays to popup.ts
7. User sees notification → chooses action
8. Store preference in chrome.storage
9. Apply choice (allow/randomize/block)
```

### TypeScript Benefits in This Project

**Type Safety:**
- Canvas metadata is strongly typed (no typos, wrong types caught at compile time)
- Chrome API methods have full autocomplete
- Network request types are clear and consistent

**Better Development Experience:**
- Your IDE will catch errors before runtime
- Autocomplete for all Canvas/Chrome APIs
- Refactoring is much safer

**Compile Command:**
```bash
npm run watch   # Auto-recompile on save (recommended during development)
npm run build   # One-time compilation
```

---

## 🚀 Proactive First Steps (Day-by-Day Plan)

### **Day 1: Foundation (COMPLETED)**

**Goal: Get a working extension that detects canvas fingerprinting**

**What We Built:**
- TypeScript-based Chrome extension
- Canvas API interception in page context
- Real-time fingerprinting detection

**Step-by-Step Implementation:**

1. **Create project and initialize:**
   ```bash
   mkdir fingerprint-detector
   cd fingerprint-detector
   npm init -y
   ```

2. **Install TypeScript and Chrome types:**
   ```bash
   npm install --save-dev typescript @types/chrome
   ```

3. **Create `tsconfig.json`:**
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "ES2020",
       "lib": ["ES2020", "DOM"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "moduleResolution": "node"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules"]
   }
   ```

4. **Update `package.json` with build scripts:**
   ```json
   {
     "scripts": {
       "build": "tsc",
       "watch": "tsc --watch"
     }
   }
   ```

5. **Create folder structure:**
   ```bash
   mkdir src
   mkdir dist
   ```

6. **Create `manifest.json` (in root):**
   ```json
   {
     "manifest_version": 3,
     "name": "Fingerprint Detector",
     "version": "0.1",
     "description": "Detects and controls browser fingerprinting",
     "permissions": ["storage", "activeTab"],
     "content_scripts": [{
       "matches": ["<all_urls>"],
       "js": ["dist/injected.js"],
       "run_at": "document_start",
       "world": "MAIN"
     }]
   }
   ```
   
   **CRITICAL: `"world": "MAIN"`** - This runs the script in the page's JavaScript context, not the isolated extension context. This is essential for intercepting Canvas APIs that the page uses.

7. **Create `src/injected.ts`:**
   ```typescript
   // This runs in the MAIN world (page context), not isolated extension context
   console.log('🔧 Fingerprint detector injected in page context');

   const originalGetContext = HTMLCanvasElement.prototype.getContext;
   const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

   // Intercept getContext
   HTMLCanvasElement.prototype.getContext = function(
     contextId: string, 
     options?: any
   ): any {
     console.log('🚨 getContext called:', contextId);
     return originalGetContext.call(this, contextId, options);
   };

   // Intercept toDataURL - THIS IS THE KEY METHOD FOR FINGERPRINTING
   HTMLCanvasElement.prototype.toDataURL = function(
     type?: string, 
     quality?: any
   ): string {
     console.warn('🔴 toDataURL CALLED - FINGERPRINTING DETECTED!');
     console.log('Canvas size:', this.width, 'x', this.height);
     console.log('In DOM:', document.contains(this));
     
     return originalToDataURL.call(this, type, quality);
   };

   console.log('✅ Canvas methods intercepted successfully');
   ```

8. **Compile TypeScript:**
   ```bash
   npm run build
   # Or use watch mode (auto-recompiles on save):
   npm run watch
   ```

9. **Load extension in Chrome:**
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select your `fingerprint-detector` folder (root directory)
   - Extension should load without errors

10. **Test it works:**
    - Visit https://amiunique.org
    - Open DevTools console (F12)
    - You should see: "🔴 toDataURL CALLED - FINGERPRINTING DETECTED!"
    - Also test on a simple HTML file with canvas to verify legitimate detection

**✅ Success metric:** Extension detects `toDataURL()` calls on AmIUnique.org and shows console warnings

**Key Lessons Learned:**

**Context Isolation Issue:**
- Initial attempts to intercept Canvas APIs in content scripts failed
- Content scripts run in an **isolated context** - modifications don't affect the page
- Solution: Use `"world": "MAIN"` to run in the page's JavaScript context

**Timing is Critical:**
- Canvas fingerprinting happens in <100ms after page load
- Must intercept BEFORE any page scripts run
- Requires `"run_at": "document_start"` in manifest

**CSP Restrictions:**
- Cannot inject inline scripts due to Content Security Policy
- Must use manifest-declared script files
- Modern security constraints shape implementation approaches

**Why This Approach Works:**
1. Script loads in page context via `"world": "MAIN"`
2. Runs at `document_start` before page scripts
3. Modifies Canvas prototype that page actually uses
4. All subsequent canvas operations are intercepted

**Development workflow going forward:**
- Keep `npm run watch` running in a terminal
- Edit TypeScript files in `src/`
- Changes auto-compile to `dist/`
- Reload extension in Chrome to test (click reload icon at `chrome://extensions/`)

---

### **Days 2-3: Core Canvas Detection**

**Goal: Track canvas lifecycle and detect suspicious behavior**

1. **Create type definitions** (add to top of `src/content.ts`):
   ```typescript
   interface CanvasMetadata {
     id: string;
     createdAt: number;
     inDOM: boolean;
     visible: boolean;
     extracted: boolean;
     extractedAt: number | null;
     operations: DrawOperation[];
     suspicionScore: number;
   }
   
   interface DrawOperation {
     method: string;
     args: any[];
     timestamp: number;
   }
   ```

2. **Implement canvas tracker** (add to `src/content.ts`):
   ```typescript
   const canvasTracker = new Map<HTMLCanvasElement, CanvasMetadata>();
   
   function trackCanvas(canvas: HTMLCanvasElement): void {
     const metadata: CanvasMetadata = {
       id: Math.random().toString(36).substring(7),
       createdAt: Date.now(),
       inDOM: false,
       visible: false,
       extracted: false,
       extractedAt: null,
       operations: [],
       suspicionScore: 0
     };
     
     canvasTracker.set(canvas, metadata);
     console.log('Canvas tracked:', metadata.id);
     
     // Intercept toDataURL with proper typing
     const originalToDataURL = canvas.toDataURL.bind(canvas);
     canvas.toDataURL = function(type?: string, quality?: any): string {
       metadata.extracted = true;
       metadata.extractedAt = Date.now();
       console.log('Canvas extracted!', metadata.id);
       checkSuspicion(canvas, metadata);
       return originalToDataURL(type, quality);
     };
   }
   ```

3. **Implement visibility checker:**
   ```typescript
   function isCanvasVisible(canvas: HTMLCanvasElement): boolean {
     if (!document.contains(canvas)) return false;
     
     const rect = canvas.getBoundingClientRect();
     const style = window.getComputedStyle(canvas);
     
     return (
       style.display !== 'none' &&
       style.visibility !== 'hidden' &&
       parseFloat(style.opacity) > 0 &&
       rect.width >= 10 && rect.height >= 10
     );
   }
   ```

4. **Implement suspicion checker:**
   ```typescript
   function checkSuspicion(canvas: HTMLCanvasElement, metadata: CanvasMetadata): void {
     let score = 0;
     
     if (metadata.extracted && !document.contains(canvas)) {
       score += 5;
       console.warn('🚨 Suspicious: Canvas not in DOM');
     }
     
     if (metadata.extracted && !isCanvasVisible(canvas)) {
       score += 4;
       console.warn('🚨 Suspicious: Canvas not visible');
     }
     
     metadata.suspicionScore = score;
     
     if (score >= 7) {
       console.error('⚠️ FINGERPRINTING DETECTED!');
     }
   }
   ```

5. **Test on fingerprinting sites:**
   - Run `npm run watch` (if not already running)
   - Visit https://amiunique.org
   - Check console - should see fingerprinting warnings
   - Visit a legitimate site with charts
   - Should NOT see warnings

**✅ Success metric:** Detects fingerprinting on AmIUnique, doesn't flag chart libraries

---

### **Days 4-5: Add More Detection Signals**

**Goal: Improve detection accuracy**

1. **Detect suspicious text strings:**
   ```typescript
   function containsSuspiciousStrings(text: string): boolean {
     const patterns = ['cwm', 'fjord', 'glyph', 'vext', 'quiz'];
     return patterns.some(p => text.toLowerCase().includes(p));
   }
   ```

2. **Track drawing operations** (add to your canvas interception):
   ```typescript
   function interceptDrawingOperations(
     ctx: CanvasRenderingContext2D, 
     metadata: CanvasMetadata
   ): void {
     const drawingMethods = ['fillText', 'strokeText', 'fillRect', 'strokeRect'];
     
     drawingMethods.forEach(method => {
       const original = (ctx as any)[method];
       if (original) {
         (ctx as any)[method] = function(...args: any[]) {
           metadata.operations.push({
             method,
             args,
             timestamp: Date.now()
           });
           
           // Check for suspicious text
           if ((method === 'fillText' || method === 'strokeText') && args[0]) {
             const text = String(args[0]);
             if (containsSuspiciousStrings(text)) {
               metadata.suspicionScore += 3;
               console.warn('🚨 Suspicious text detected:', text);
             }
           }
           
           return original.apply(this, args);
         };
       }
     });
   }
   
   // Update trackCanvas to call this when context is created
   function trackCanvas(canvas: HTMLCanvasElement): void {
     // ... existing code ...
     
     // Intercept getContext
     const originalGetContext = canvas.getContext.bind(canvas);
     canvas.getContext = function(
       contextId: string,
       options?: any
     ): RenderingContext | null {
       const context = originalGetContext(contextId, options);
       
       if (context && contextId === '2d') {
         interceptDrawingOperations(context as CanvasRenderingContext2D, metadata);
       }
       
       return context;
     };
   }
   ```

3. **Add timing checks** (update checkSuspicion):
   ```typescript
   function checkSuspicion(canvas: HTMLCanvasElement, metadata: CanvasMetadata): void {
     let score = metadata.suspicionScore; // Start with existing score
     
     if (metadata.extracted && !document.contains(canvas)) {
       score += 5;
       console.warn('🚨 Suspicious: Canvas not in DOM');
     }
     
     if (metadata.extracted && !isCanvasVisible(canvas)) {
       score += 4;
       console.warn('🚨 Suspicious: Canvas not visible');
     }
     
     // Check timing
     if (metadata.extracted && metadata.extractedAt) {
       const timeToExtraction = metadata.extractedAt - metadata.createdAt;
       if (timeToExtraction < 100) {
         score += 3;
         console.warn(`🚨 Suspicious: Very quick extraction (${timeToExtraction}ms)`);
       }
     }
     
     // Check number of operations
     if (metadata.extracted && metadata.operations.length < 3) {
       score += 2;
       console.warn(`🚨 Suspicious: Few operations (${metadata.operations.length})`);
     }
     
     metadata.suspicionScore = score;
     
     if (score >= 7) {
       console.error('⚠️ FINGERPRINTING DETECTED! Score:', score);
     }
   }
   ```

4. **Test and refine threshold:**
   - Test on 5-10 different websites
   - Adjust scoring weights
   - Document false positives/negatives
   - Compile with `npm run build` after changes

**✅ Success metric:** Can distinguish fingerprinting from legitimate use with reasonable accuracy

---

### **Days 6-7: Network Activity Tracking**

**Goal: See where fingerprint data is sent**

1. **Create types for network tracking** (add to top of `src/content.ts`):
   ```typescript
   interface NetworkRequest {
     url: string;
     timestamp: number;
     suspicionScore: number;
     reasons: string[];
   }
   
   interface FingerprintingActivity {
     canvasExtractions: Array<{
       timestamp: number;
       canvasId: string;
       suspicionScore: number;
     }>;
     networkRequests: NetworkRequest[];
   }
   ```

2. **Initialize activity tracker:**
   ```typescript
   const fingerprintingActivity: FingerprintingActivity = {
     canvasExtractions: [],
     networkRequests: []
   };
   ```

3. **Intercept fetch:**
   ```typescript
   const originalFetch = window.fetch.bind(window);
   window.fetch = function(
     input: RequestInfo | URL,
     init?: RequestInit
   ): Promise<Response> {
     if (init?.body) {
       const url = typeof input === 'string' ? input : input.toString();
       checkRequestForFingerprint(url, init.body);
     }
     return originalFetch(input, init);
   };
   ```

4. **Detect fingerprint data in requests:**
   ```typescript
   function checkRequestForFingerprint(url: string, body: BodyInit): void {
     const bodyStr = String(body);
     let score = 0;
     const reasons: string[] = [];
     
     // Check for canvas data URL
     if (bodyStr.includes('data:image/png;base64')) {
       score += 4;
       reasons.push('Contains canvas data URL');
     }
     
     // Check for base64 encoded data
     if (/[A-Za-z0-9+\/]{100,}={0,2}/.test(bodyStr)) {
       score += 2;
       reasons.push('Contains long base64 string');
     }
     
     // Check for fingerprinting parameter names
     const fingerprintParams = [
       'canvas', 'fingerprint', 'fp', 'browser_id',
       'webgl', 'fonts', 'screen_resolution'
     ];
     
     const foundParams = fingerprintParams.filter(param =>
       bodyStr.toLowerCase().includes(param)
     );
     
     if (foundParams.length >= 3) {
       score += 3;
       reasons.push(`Multiple fingerprint params: ${foundParams.join(', ')}`);
     }
     
     // Analyze destination
     const currentDomain = window.location.hostname;
     const urlObj = new URL(url, window.location.origin);
     const targetDomain = urlObj.hostname;
     
     if (!isSameDomain(currentDomain, targetDomain)) {
       score += 3;
       reasons.push(`Sending to third-party: ${targetDomain}`);
     }
     
     if (score >= 5) {
       console.warn('🚨 Fingerprint data being sent!', {
         url,
         score,
         reasons
       });
       
       fingerprintingActivity.networkRequests.push({
         url,
         timestamp: Date.now(),
         suspicionScore: score,
         reasons
       });
     }
   }
   
   function isSameDomain(domain1: string, domain2: string): boolean {
     const getRootDomain = (domain: string): string => {
       const parts = domain.split('.');
       if (parts.length >= 2) {
         return parts.slice(-2).join('.');
       }
       return domain;
     };
     
     return getRootDomain(domain1) === getRootDomain(domain2);
   }
   ```

5. **Test:**
   - Visit sites that fingerprint (AmIUnique, BrowserLeaks)
   - Check console for network warnings
   - Note which domains receive data
   - Compile and reload extension after changes

**✅ Success metric:** Can see where fingerprint data is transmitted

---

### **Days 8-9: User Interface**

**Goal: Show notifications to user**

1. **Create `popup.html` (in root directory):**
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="UTF-8">
     <link rel="stylesheet" href="popup.css">
   </head>
   <body>
     <div id="notification">
       <h3>Fingerprinting Detector</h3>
       <div id="status">Monitoring...</div>
       <div id="details"></div>
       <div id="actions" style="display:none;">
         <button id="allow">Allow</button>
         <button id="randomize">Randomize</button>
         <button id="block">Block</button>
       </div>
     </div>
     <script src="dist/popup.js"></script>
   </body>
   </html>
   ```

2. **Create `src/popup.ts`:**
   ```typescript
   interface DetectionMessage {
     type: string;
     domain: string;
     score: number;
     reasons: string[];
   }
   
   document.addEventListener('DOMContentLoaded', () => {
     const statusDiv = document.getElementById('status')!;
     const detailsDiv = document.getElementById('details')!;
     const actionsDiv = document.getElementById('actions')!;
     
     const allowBtn = document.getElementById('allow')!;
     const randomizeBtn = document.getElementById('randomize')!;
     const blockBtn = document.getElementById('block')!;
     
     // Listen for detection messages
     chrome.runtime.onMessage.addListener(
       (message: DetectionMessage, sender, sendResponse) => {
         if (message.type === 'FINGERPRINT_DETECTED') {
           showDetection(message);
         }
       }
     );
     
     function showDetection(message: DetectionMessage): void {
       statusDiv.textContent = '⚠️ Fingerprinting Detected!';
       statusDiv.style.color = 'red';
       
       detailsDiv.innerHTML = `
         <p><strong>Domain:</strong> ${message.domain}</p>
         <p><strong>Confidence:</strong> ${message.score}/10</p>
         <p><strong>Reasons:</strong></p>
         <ul>
           ${message.reasons.map(r => `<li>${r}</li>`).join('')}
         </ul>
       `;
       
       actionsDiv.style.display = 'block';
     }
     
     allowBtn.addEventListener('click', () => {
       handleChoice('allow');
     });
     
     randomizeBtn.addEventListener('click', () => {
       handleChoice('randomize');
     });
     
     blockBtn.addEventListener('click', () => {
       handleChoice('block');
     });
     
     function handleChoice(choice: string): void {
       chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (tabs[0]?.id) {
           chrome.tabs.sendMessage(tabs[0].id, {
             type: 'USER_CHOICE',
             choice: choice
           });
         }
       });
       
       statusDiv.textContent = `Choice applied: ${choice}`;
       actionsDiv.style.display = 'none';
     }
   });
   ```

3. **Update manifest.json to include popup:**
   ```json
   {
     "manifest_version": 3,
     "name": "Fingerprint Detector",
     "version": "0.1",
     "description": "Detects and controls browser fingerprinting",
     "permissions": ["storage", "activeTab", "tabs"],
     "action": {
       "default_popup": "popup.html",
       "default_icon": {
         "16": "icon16.png",
         "48": "icon48.png",
         "128": "icon128.png"
       }
     },
     "content_scripts": [{
       "matches": ["<all_urls>"],
       "js": ["dist/content.js"],
       "run_at": "document_start"
     }],
     "background": {
       "service_worker": "dist/background.js"
     }
   }
   ```

4. **Create `src/background.ts` (simple message relay):**
   ```typescript
   chrome.runtime.onMessage.addListener(
     (message, sender, sendResponse) => {
       // Relay messages between content script and popup
       if (message.type === 'FINGERPRINT_DETECTED') {
         chrome.runtime.sendMessage(message);
       }
       return true;
     }
   );
   ```

5. **Update content.ts to send messages:**
   ```typescript
   function checkSuspicion(canvas: HTMLCanvasElement, metadata: CanvasMetadata): void {
     // ... existing suspicion checking code ...
     
     if (score >= 7) {
       console.error('⚠️ FINGERPRINTING DETECTED! Score:', score);
       
       // Send message to background/popup
       chrome.runtime.sendMessage({
         type: 'FINGERPRINT_DETECTED',
         domain: window.location.hostname,
         score: score,
         reasons: [
           metadata.extracted && !document.contains(canvas) ? 'Canvas not in DOM' : '',
           metadata.extracted && !isCanvasVisible(canvas) ? 'Canvas not visible' : '',
           // Add other reasons based on your checks
         ].filter(Boolean)
       });
     }
   }
   ```

6. **Store user preferences:**
   ```typescript
   // In content.ts, listen for user choices
   chrome.runtime.onMessage.addListener(
     (message, sender, sendResponse) => {
       if (message.type === 'USER_CHOICE') {
         const domain = window.location.hostname;
         
         chrome.storage.local.set({
           [domain]: message.choice
         }, () => {
           console.log(`Saved preference for ${domain}: ${message.choice}`);
         });
       }
     }
   );
   ```

7. **Compile and test:**
   ```bash
   npm run build
   # Reload extension in Chrome
   # Click extension icon to see popup
   ```

**✅ Success metric:** User sees notification and can make choices

---

### **Days 10-11: Testing & Documentation**

**Goal: Prepare progress report**

1. **Comprehensive testing:**
   - Test on 10+ websites
   - Document true/false positives
   - Take screenshots

2. **Measure effectiveness:**
   - Your entropy before: 18.17 bits
   - Your entropy with randomization: ?
   - Test on AmIUnique with extension enabled

3. **Write progress report:**
   - What you've implemented
   - Detection accuracy results
   - Example screenshots
   - Known limitations
   - Future work

**✅ Success metric:** Complete, working demo + documented results

---

## 📊 What to Include in Progress Report

### Implemented Features
- ✅ Canvas lifecycle tracking
- ✅ Behavioral fingerprinting detection
- ✅ Network activity monitoring
- ✅ Suspicion scoring system
- ⚠️ User notification UI (in progress)

### Results
- Detection accuracy: X true positives, Y false positives
- Example: Detected fingerprinting on AmIUnique, BrowserLeaks
- Example: Did NOT flag Chart.js visualizations
- Where data was sent: List of third-party domains

### Novel Contribution
"Unlike existing extensions that blindly block or randomize, this extension **detects fingerprinting attempts using behavioral heuristics** and **tracks where data is sent**, giving users informed control over legitimate vs. invasive tracking."

### Future Work
- Correlation between canvas and network activity
- Additional fingerprinting vectors (WebGL, fonts)
- Machine learning for pattern recognition
- Browser compatibility (Firefox support)

---

## 🎓 Academic Framing

**Research Question:**
"Can behavioral heuristics reliably distinguish fingerprinting attempts from legitimate Canvas/WebGL API use, and does tracking data transmission destinations improve detection confidence?"

**Hypothesis:**
"A detection-first approach with user control can balance privacy protection and website functionality better than blanket blocking or randomization."

**Methodology:**
- Implemented heuristic-based detection system
- Tested on N websites (fingerprinting and legitimate)
- Measured true/false positive rates
- Compared user control model to existing approaches

**Expected Contribution:**
First extension to combine behavioral detection with transmission tracking and user agency.

---

## 🚦 Success Criteria

**Minimum Viable Product (for progress report):**
- Extension detects canvas fingerprinting
- Shows console warnings
- Can distinguish some fingerprinting from legitimate use
- Basic documentation of approach

**Stretch Goals (if time permits):**
- User notification UI working
- Network tracking fully integrated
- Preference storage implemented
- Tested on 20+ sites

**Final Version (end of semester):**
- Polished UI
- High detection accuracy
- Correlation between canvas and network
- Comprehensive evaluation
- Possible user study

---

## 💪 You've Got This!

**Your advantages:**
1. Strong understanding of fingerprinting from your paper
2. Clear novel contribution (detection + user control)
3. Measurable outcomes (accuracy, entropy reduction)
4. Doable scope for 11 days

**Start RIGHT NOW:**
1. Create the three files (manifest.json, content.js, popup.html)
2. Load extension in Chrome
3. See "Hello World" in console
4. Build from there!

**When you get stuck:**
- Check Chrome extension docs
- Test frequently (reload extension after changes)
- Console.log everything to see what's happening
- Start simple, add complexity gradually

Ready to build? Start with Day 1 and let me know once you have the basic extension loading! 🚀