// 
//              #                                         #                 
//     ######                                    #####.          #          
//     #                                         #   :#          #          
//     #      ###    #:##:   ## #   ###    #:##: #    # ###    #####   ###  
//     #        #    #  :#  #   #     :#   ##  # #   :#   #      #       :# 
//     ######   #    #   #  #   #  #   #   #     #####.   #      #    #   #   
//     #        #    #   #  #   #  #####   #     #   :#   #      #    ##### 
//     #        #    #   #  #   #  #       #     #    #   #      #    #     
//     #        #    #   #  #   #      #   #     #   :#   #      #.       # 
//     #      #####  #   #   ##:#   ###:   #     #####. #####    :##   ###: 
//                              #                                           
//                             :#                                           
//                           :##.                                           
// 
// ============================================================================
// A chromium extension for detecting website fingerprinting attempts 
// Design stage: console output 
//       ____        _      __   _____ __             __ 
//      / __ \__  __(_)____/ /__/ ___// /_____ ______/ /_
//     / / / / / / / / ___/ //_/\__ \/ __/ __ `/ ___/ __/
//    / /_/ / /_/ / / /__/ ,<  ___/ / /_/ /_/ / /  / /_  
//    \___\_\__,_/_/\___/_/|_|/____/\__/\__,_/_/   \__/  
// 
//    1. run `npm run build` in extension directory 
//    2. chrome -> extensions -> developer mode -> load unpacked 
//                                              -> select extension direcory 
//    3. rebuild project and refresh extension to see changes 
// ============================================================================

// ============================================================================
//     ______              ___      ____      _ __  _             
//    /_  __/_ _____  ___ / _ \___ / _(_)__  (_) /_(_)__  ___  ___
//     / / / // / _ \/ -_) // / -_) _/ / _ \/ / __/ / _ \/ _ \(_-<
//    /_/  \_, / .__/\__/____/\__/_//_/_//_/_/\__/_/\___/_//_/___/
//        /___/_/                                                 
//    Custom object interfaces used 
// ============================================================================

// used to store intercepted Canvas metadata 
interface CanvasMetadata {
    id: string;                         // sequential id
    createdAt: number;                  // tracking start timestamp

    hadContext: boolean;                // .getContext called
    wasInDOM: boolean;                  // Canvas placed in DOM
    wasVisible: boolean;                // Canvas was ever visible to user

    numDrawOps: number;                 // total num of drawing ops performed
    drawOpsEntropic: DrawOperation[];   // entropic drawing ops performed
    hasSusText: boolean;                // contains suspicious text

    wasExtracted: boolean;              // extraction method call
    extractedAt: number | null;         // extraction timestamp
    extractions: CanvasExtraction[];    // extractions performed with sample

    networkRequests: NetworkRequest[];  // network requests to extraction
    thirdPartyDest: boolean;    // has network request to known tracker

    susScore: number;                   // total suspicion of canvas lifecycle
}

// used to capture intercepted Canvas drawing operations
interface DrawOperation {
    canvasId: string;                   // Canvas id
    method: string;                     // method call name
    args: any[];                        // method arguments
    timestamp: number;                  // operation timestamp
}

// used to track Canvas extractions
// -> captures extraction sample for network request mapping
interface CanvasExtraction {
    canvasId: string;                   // Canvas id
    dataSample: string;                 // sample of extracted value 100 char
    timestamp: number;                  // extraction timestamp
}

// used to track network requests associated with tracked Canvas elements
interface NetworkRequest {
    canvasId: string;                   // Canvas id
    url: string;                        // request url destination
    body: string | null;                // request body
    isThirdParty: boolean;              // request has 3rd party origin
    domain: string;                     // request domain
}

// ============================================================================
//      _____              __            __    
//     / ___/__  ___  ___ / /____ ____  / /____
//    / /__/ _ \/ _ \(_-</ __/ _ `/ _ \/ __(_-<
//    \___/\___/_//_/___/\__/\_,_/_//_/\__/___/
//    Constants referenced throughout project - Tune to increase coverage
// ============================================================================

// original versions of intercepted API methods -> hand off when done
const ORIGINAL_APIS = {
    getContext: HTMLCanvasElement.prototype.getContext,
    toDataURL: HTMLCanvasElement.prototype.toDataURL,
    getImageData: CanvasRenderingContext2D.prototype.getImageData,
    toBlob: HTMLCanvasElement.prototype.toBlob,
    fetch: window.fetch.bind(window),
    xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send,
} as const;

// Canvas suspicion scoring values
const CANVAS_SUS_VALS = {
    NO_CONTEXT: 5,              // never placed into Context           
    NEVER_IN_DOM: 5,            // never placed in DOM
    NEVER_VISIBLE: 4,           // never visible to user
    QUICK_EXTRACT: 3,           // extracted within 100ms of creation
    FEW_DRAW_OPS: 2,            // less than 3 drawing ops
    CONTAINS_SUS_TEXT: 3,       // canvas prompt includes suspicious str
    // network activity
    THIRD_PARTY_DESTINATION: 4,     // sent to any third-party
    KNOWN_TRACKER_DESTINATION: 5,   // sent to known tracker (doesn't stack) 
    // thresholds 
    DETECTION_THRESHOLD: 7,     // possible fingerprinting attempt threshold
    FLAG_THRESHOLD: 10,         // likely fingerprinting attempt threshold
} as const;

// suspicious text patterns in text-based drawing operations
const CANVAS_SUS_TEXT_PATTERNS: string[] = [
    // from FingerprintJS and similar libs
    `cwm`,                      
    `fjord`, 
    `glyph`, 
    `vext`, 
    `quiz`,
    // test font width/kerning
    `mmmmmmmmmmlli`,            
    `mmmmmmm`,
    `iiiiiii`,
    // unicode and emoji test patterns
    `ðŸ˜ðŸ˜‚ðŸ˜ƒ`,                      
    `â˜ºâ™«â™ª`,                        
    // foreign language patterns
    `é…·çƒˆãªæ—¥æœ¬èªž`,
    `Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©`,         
] as const;

const CANVAS_SUS_TEXT_REGEX: RegExp[] = [
    /[\p{Emoji}].*[\p{Emoji}]/u,
    /.{100,}/,
] as const;

// entropic drawing operations 
const CANVAS_DRAW_OPS_ENTROPIC: string[] = [
    // text rendering -> PRIMARY fingerprinting vector
    `fillText`,
    `strokeText`,
    `measureText`,
    // complex paths -> minor vector but real entropy source
    `bezierCurveTo`,
    `quadraticCurveTo`,
    `arcTo`,
    `ellipse`,
    // gradients -> minor vector but color interpolation varies
    `createLinearGradient`,
    `createRadialGradient`,
    `createConicGradient`,
] as const;

// generic drawing operations
const CANVAS_DRAW_OPS_GENERIC: string[] = [
    `fillRect`,
    `strokeRect`,
    `clearRect`,
    `rect`,
    `arc`,   
    `drawImage`,
    `putImageData`,
    `beginPath`,
    `closePath`,
    `moveTo`,
    `lineTo`,
    `fill`,
    `stroke`,
] as const;

// domains known to belong to common trackers
const KNOWN_TRACKER_DOMAINS: string[] = [
    `google-analytics.com`, 
    `doubleclick.net`, 
    `facebook.com`,
    `fingerprint.com`, 
    `fingerprintjs.com`, 
    `amplitude.com`,
    `mixpanel.com`, 
    `segment.com`, 
    `fullstory.com`,
] as const;

const ASCII_APP_NAME: string = (                                                           
"   #   #   # #   # ##### ##### ####  ####  #   # ##### ##### \n" +
"  ###  #  ## #   # #   # #     #   #  #    #  ##   #   #     \n" +
" # # # # # # ##### #     ####  ####   #### # # #   #   ####  \n" +
"  ###  ##  # #   # #     #     #      #  # ##  #   #   #     \n" +
"   #   #   # #   # #     ##### #     ##### #   #   #   ##### \n"                                                                                                           
);                        

// ============================================================================
//       ______       __     
//      / __/ /____ _/ /____ 
//     _\ \/ __/ _ `/ __/ -_)
//    /___/\__/\_,_/\__/\__/                    
//    Everything actually getting tracked, initiated, updated        
// ============================================================================

// canvas id counter
let canvasIdCounter: number = 0;

// canvas state tracker - map of canvas elements to corresponding metadata
const canvasTracker: Map<HTMLCanvasElement, CanvasMetadata> = 
    new Map<HTMLCanvasElement, CanvasMetadata>();

/**
 * Initializes CanvasMetadata for HTMLCanvasElement and maps former to latter 
 * in canvasTracker.
 * 
 * @param canvas HTMLCanvasElement
 * @returns CanvasMetadata
 */
function initCanvas(canvas: HTMLCanvasElement): CanvasMetadata {
    const metadata: CanvasMetadata = {
        id: _generateCanvasId(),
        createdAt: Date.now(),
        wasInDOM: isInDOM(canvas),
        wasVisible: isVisible(canvas),
        wasExtracted: false,
        extractedAt: null,
        drawOpsEntropic: [],
        susScore: 0,
        hadContext: false,
        numDrawOps: 0,
        hasSusText: false,
        extractions: [],
        networkRequests: [],
        thirdPartyDest: false,
    }
    
    canvasTracker.set(canvas, metadata);
    console.log(`~ FingerBite -> 👉 Canvas tracked: ${metadata.id}`);

    return metadata;
}

/**
 * Update Canvas flags.
 * Updates: metadata.wasInDOM, metadata.wasVisible
 * 
 * @param canvas HTMLCanvasElement
 * @returns CanvasMetadata
 */
function updateCanvas(canvas: HTMLCanvasElement): CanvasMetadata {
    let metadata: CanvasMetadata | undefined = canvasTracker.get(canvas);
    if (!metadata) {
        metadata = initCanvas(canvas); 
        return metadata;
    }

    if (!metadata.wasInDOM) metadata.wasInDOM = isInDOM(canvas);
    if (!metadata.wasVisible) metadata.wasVisible = isVisible(canvas);

    return metadata;
}

/**
 * Create CanvasExtraction and add it to metadata.
 * 
 * @param metadata CanvasMetadata
 * @param extractedData string: extracted canvas data
 */
function recordCanvasExtraction(
    metadata: CanvasMetadata, 
    extractedData: string): void {
    const extraction: CanvasExtraction = {
        canvasId: metadata.id,
        dataSample: extractedData?.substring(0, 100),
        timestamp: Date.now(),
    };
    
    metadata.extractions.push(extraction);
}

// ============================================================================
//       __ __    __               
//      / // /__ / /__  ___ _______
//     / _  / -_) / _ \/ -_) __(_-<
//    /_//_/\__/_/ .__/\__/_/ /___/
//              /_/           
//    Canvas helper functions        
// ============================================================================

/**
 * Generates a unique sequential ID for tracking canvas elements.
 * 
 * @returns string: "canvas_00X"
 */
function _generateCanvasId(): string {
    const paddedId: string = String(++canvasIdCounter).padStart(3, '0');
    return `canvas_${paddedId}`
};

/**
 * Checks if Canvas in DOM.
 * 
 * @param canvas HTMLCanvasElement
 * @returns boolean: true if canvas in DOM
 */
function isInDOM(canvas: HTMLCanvasElement): boolean {
    return document.contains(canvas);
};

/**
 * Checks Canvas visibility.
 * Criteria considered: 
 * - canvas dimensions >= 10 pixels
 * - canvas CSS styling not hiding canvas
 * - canvas not placed at extreme page offset
 * 
 * @param canvas HTMLCanvasElement
 * @returns boolean: true if canvas visible
 */
function isVisible(canvas: HTMLCanvasElement): boolean {
    if (!isInDOM(canvas)) return false;

    // rectangle dimensions
    const rectDim: DOMRect = canvas.getBoundingClientRect();
    // computed CSS
    const style: CSSStyleDeclaration = window.getComputedStyle(canvas);

    // canvas dimensions visible
    const visSize: number = 10;
    const hasVisibleDimensions: boolean = (
        (rectDim.width >= visSize) &&
        (rectDim.height >= visSize)
    );

    // canvas CSS styling visible
    const hasVisibleStyling: boolean = (
        (style.display !== 'none') &&
        (style.visibility !== 'hidden') &&
        (parseFloat(style.opacity) > 0)
    )

    // canvas has extreme page offset
    const offset: number = 1000
    const hasExtremeOffset: boolean = (
        (rectDim.left < (-1 * offset)) ||
        (rectDim.top < (-1 * offset)) ||
        (rectDim.left > (window.innerWidth + offset)) ||
        (rectDim.top > (window.innerHeight + offset))
    );

    return (
        hasVisibleDimensions &&
        hasVisibleStyling &&
        (!hasExtremeOffset)
    );
};

// Canvas drawing operations helpers

/**
 * Determines whether Canvas text-based drawing operations include suspicious
 * text patters.
 *
 * @param text string: argument to text-based drawing operation
 * @returns boolean: true if text contains suspicious patterns
 */
function drawOpsContSusText(text: string): boolean {
    const lowText: string = text.toLowerCase();

    // Check pattern matches
    if (CANVAS_SUS_TEXT_PATTERNS.some(pattern => lowText.includes(pattern))) {
        return true;
    }

    // Check regex patterns
    if (CANVAS_SUS_TEXT_REGEX.some(regex => regex.test(text))) {
        return true;
    }

    // Check for suspiciously long text (over 100 chars for fingerprinting)
    if (text.length > 100) {
        return true;
    }

    return false;
}

// Canvas NetworkRequest helpers

/**
 * Extracts domain string from url.
 * 
 * @param url string: request destination url
 * @returns string: request destination domain
 */
function extractDomain(url: string): string {
    try {
        return new URL(url, window.location.origin).hostname;
    } catch {
        return '';
    }
}

/**
 * Extracts root domain from domain.
 * 
 * @param domain string: url 
 * @returns string: root domain
 */
function getRootDomain(domain: string): string {
    const parts: string[] = domain.split(`.`);
    return parts.length >= 2 ? parts.slice(-2).join(`.`): domain;
}

/**
 * Determines whether or not Canvas data sent to third party.
 * 
 * @param url string: does not need to be trimmed
 * @returns boolean: true if 3rd party dest
 */
function hasThirdPartyDest(url: string): boolean {
    const requestDomain = extractDomain(url);
    const currentDomain = window.location.hostname;
    return getRootDomain(requestDomain) !== getRootDomain(currentDomain);
}


/**
 * Determines whether or not Canvas data sent to known tracker.
 * 
 * @param domain string: destination domain
 * @returns boolean: true if destination known tracker
 */
function hasKnownTrackerDest(domain: string): boolean {
    const rootDomain = getRootDomain(domain);
    return KNOWN_TRACKER_DOMAINS.some(tracker =>
        rootDomain.includes(tracker) || tracker.includes(rootDomain)
    );
}

// ============================================================================
//       ___  _          __         
//      / _ \(_)__ ___  / /__ ___ __
//     / // / (_-</ _ \/ / _ `/ // /
//    /____/_/___/ .__/_/\_,_/\_, / 
//              /_/          /___/  
//    Prettier formatting
// ============================================================================

/**
 * Formats CanvasMetadata into string for display
 * 
 * @param medatada CanvasMetadata
 * @returns string: console log format for metadata
 */
function formatMetadataToStr(medatada: CanvasMetadata): string {
    return `- [canvas_id]: ${medatada.id},
    - [suspicion_score]: ${medatada.susScore},
    - [created_at]: ${medatada.createdAt},
    - [had_context]: ${medatada.hadContext},
    - [was_ever_in_DOM]: ${medatada.wasInDOM},
    - [was_ever_visible]: ${medatada.wasVisible},
    - [num_draw_ops]: ${medatada.numDrawOps},
    - [num_entropic_draw_ops]: ${medatada.drawOpsEntropic.length},
    - [contains_suspicious_text]: ${medatada.hasSusText},
    - [was_extracted]: ${medatada.wasExtracted},
    - [extraction_time]: ${medatada.extractedAt ?
            medatada.extractedAt - medatada.createdAt + 'ms'
            : 'N/A'},
    - [num_extractions]: ${medatada.extractions.length},
    - [num_network_requests]: ${medatada.networkRequests.length},
    - [has_third_party_destination]: ${medatada.thirdPartyDest}
    `;
}

// ============================================================================
//       ____         ____                
//      / __/_ _____ / __/______  _______ 
//     _\ \/ // (_-<_\ \/ __/ _ \/ __/ -_)
//    /___/\_,_/___/___/\__/\___/_/  \__/ 
//    Calculate suspiscion score for Canvas                          
// ============================================================================

/**
 * Calculates canvas metadata suspicion score
 * Suspicon scores and parameters set in SUS_VALS constant
 * @param canvas 
 * @returns number - canvas suspicion score, also updates canvas medatada
 */
function scoreCanvas(metadata: CanvasMetadata): { 
    score: number; 
    reasons: string[];
} {
    let score: number = 0;
    const reasons: string[] = [];

    // pass if not extracted yet
    if (!metadata || !metadata.wasExtracted) return { score, reasons };

    // no context
    if (!metadata.hadContext) {
        score += CANVAS_SUS_VALS.NO_CONTEXT;
        reasons.push('Canvas extracted without context');
    }

    // not rendered
    if (!metadata.wasInDOM) {
        score += CANVAS_SUS_VALS.NEVER_IN_DOM;
        reasons.push(`Canvas never in DOM`);
    };

    // not visible
    if (!metadata.wasVisible) {
        score += CANVAS_SUS_VALS.NEVER_VISIBLE;
        reasons.push(`Canvas never visible`);
    };

    // extracted fast
    if (metadata.extractedAt) {
        const timeToExtract: number = 
            metadata.extractedAt - metadata.createdAt;
        const timeThreshold: number = 100;

        if (timeToExtract < timeThreshold) {
            score += CANVAS_SUS_VALS.QUICK_EXTRACT;
            reasons.push(`Quick extract (${timeToExtract}ms)`);
        };
    };

    // num drawing ops
    const numDrawOpsThreshold: number = 3;
    if (metadata.numDrawOps < numDrawOpsThreshold) {
        score += CANVAS_SUS_VALS.FEW_DRAW_OPS;
        reasons.push(`Few drawing operations (${metadata.numDrawOps})`);
    };

    // check for sus text in drawing ops
    if (metadata.hasSusText) {
        score += CANVAS_SUS_VALS.CONTAINS_SUS_TEXT;
        reasons.push(`Suspicious text petterns`);
    }

    // network activity scoring
    if (metadata.networkRequests.length > 0) {

        const hasThirdPartyDest = metadata.networkRequests.some(
            req => req.isThirdParty && !hasKnownTrackerDest(req.domain)
        );
        if (hasThirdPartyDest) {
            score += CANVAS_SUS_VALS.THIRD_PARTY_DESTINATION;
            reasons.push(`Sent to third-party domain`);
        }
    
        const hasTrackerDest = metadata.networkRequests.some(
            req => hasKnownTrackerDest(req.domain)
        );
        if (hasTrackerDest) {
            score += CANVAS_SUS_VALS.KNOWN_TRACKER_DESTINATION;
            reasons.push(`Sent to known tracker`);
        }
    }

    return { score, reasons };
}

function printCanvasSusScore(
    metadata: CanvasMetadata, 
    score: number, 
    reasons: string[]
): void {
    
    const pad: string = `~~~~~~~~~~~~ -> ${metadata.id}:`;

    let scoreText: string = ``;
    if (score >= CANVAS_SUS_VALS.FLAG_THRESHOLD) {
        scoreText = `${pad} 🔴 LIKELY FINGERPRINTING DETECTED`;
    } else if (score >= CANVAS_SUS_VALS.DETECTION_THRESHOLD) {
        scoreText = `${pad} 🟠 Possible fingerprinting detected`;
    } else {
        scoreText = `${pad} 🟢 Unlikely to be fingerprinting`;
    }

    let reasonsText = ``;
    if (reasons.length > 0) {
        reasonsText = `${pad} Suspicious behaviors detected: 
            ${reasons.join(', ')}`;    
    }

    let networkReqText = ``;
    if (metadata.networkRequests.length > 0) {
        networkReqText = `${pad} Network destinations:\n`;
        metadata.networkRequests.forEach(req => {
            networkReqText += `       - ${req.domain} ` + 
            `(${req.isThirdParty ? 'third-party' : 'same-origin'})\n`;
        });
    }

    let output = `~ FingerBite -> Canvas: ${metadata.id}\n` + 
        `    ${pad} Status: ${formatMetadataToStr(metadata)}\n` + 
        `    ${scoreText}`;
    
    if (reasonsText.length > 0) {
        output += `\n    ${reasonsText}`;
    }
    
    if (networkReqText.length > 0) {
        output += `\n    ${networkReqText}`;
    }

    console.log(output);
}

// ============================================================================
//       ___                  _           ____         
//      / _ \_______ __    __(_)__  ___ _/ __ \___  ___
//     / // / __/ _ `/ |/|/ / / _ \/ _ `/ /_/ / _ \(_-<
//    /____/_/  \_,_/|__,__/_/_//_/\_, /\____/ .__/___/
//                                /___/     /_/        
//    Drawing operations interception
// ============================================================================

/**
 * Intercepts canvas 2D context drawing methods.
 * Intercepts draw method call -> if entropic method -> push call to 
 * metadata.drawOps
 * Updates: metadate.numDrawOps, metadata.numDrawOpsEntropic, 
 * metadata.hasSusText
 * @param ctx 
 * @returns void
 */
function interceptDrawingOps(
    ctx: CanvasRenderingContext2D, 
    metadata: CanvasMetadata): void {

    CANVAS_DRAW_OPS_ENTROPIC.forEach(method => {
        const original = (ctx as any)[method];
        if (!original) return;

        // replace with interceptor
        (ctx as any)[method] = function(...args: any[]) {
            
            metadata.numDrawOps++;  // increment drawOps counter

            if (method.includes('Text')) {
                const text: string = String(args[0])
                // check contains suspicious text
                if (drawOpsContSusText(text)) metadata.hasSusText = true; 
            } 

            // intercept operations
            const newOp: DrawOperation = {
                method: method,
                args: args,
                timestamp: Date.now(),
                canvasId: metadata.id,
            }
            
            metadata.drawOpsEntropic.push(newOp);

            //UNCOMMENT TO BUGFIX
            //console.warn(`NEW DRAWING OPERATION ADDED:`, newOp);
            
            // actually perform drawing operations
            return original.apply(this, args);
        }
    });

    CANVAS_DRAW_OPS_GENERIC.forEach(method => {
        const original = (ctx as any)[method];
        if (!original) return;

        // replace with interceptor
        (ctx as any)[method] = function(...args: any[]) {
            metadata.numDrawOps++;  // increment drawOps counter

            // actually perform drawing operations
            return original.apply(this, args);
        }
    });
}
// ============================================================================
//       _  __    __                  __    ___          
//      / |/ /__ / /__    _____  ____/ /__ / _ \___ ___ _
//     /    / -_) __/ |/|/ / _ \/ __/  '_// , _/ -_) _ `/
//    /_/|_/\__/\__/|__,__/\___/_/ /_/\_\/_/|_|\__/\_, / 
//                                                  /_/  
//    Network request correlation
// ============================================================================

function correlateNetworkRequest(url: string, body: string | null): void {
    if (!body) return;
    
    const domain = extractDomain(url);
    const isThirdParty = hasThirdPartyDest(url);

    //console.warn(`NETWORK REQUEST INTERCEPTED, DOMAIN:`, domain);
    
    // check each Canvas in canvasTracker for matching extractions
    for (const [canvas, metadata] of canvasTracker.entries()) {
        for (const extraction of metadata.extractions) {
            if (body.includes(extraction.dataSample)) {

                // match found -> record this network request
                const request: NetworkRequest = {
                    canvasId: metadata.id,
                    url,
                    body,
                    isThirdParty,
                    domain,
                };
                metadata.networkRequests.push(request);

                //console.warn(
                // `NETWORK REQUEST MATCHED TO CAPTURED CANVAS:`, request);
                
                if (isThirdParty) { 
                    metadata.thirdPartyDest = true; 
                }

                const scoreOut: { score: number, reasons: string[] } = 
                    scoreCanvas(metadata);
                metadata.susScore = scoreOut.score;
                
                // Print updated score with network activity included
                console.log(`~ FingerBite -> 👉 SCORE UPDATED network ` + 
                    `detected:`);
                printCanvasSusScore(metadata, scoreOut.score, 
                    scoreOut.reasons);
            }
        }
    }
}



// ============================================================================
//      _____                       ____     __                       __ 
//     / ___/__ ____ _  _____ ____ /  _/__  / /____ ___________ ___  / /_
//    / /__/ _ `/ _ \ |/ / _ `(_-<_/ // _ \/ __/ -_) __/ __/ -_) _ \/ __/
//    \___/\_,_/_//_/___/\_,_/___/___/_//_/\__/\__/_/  \__/\__/ .__/\__/ 
//                                                           /_/         
//    Where the real action happens - intercepting Canvas API calls 
//    and inserting our own code in the middle
// ============================================================================

/**
 * Intercepts HTMLCanvasElement.prototype.getContext
 * Called when page creates a canvas drawing context
 * First method call for using canvas: interception allows for immediate 
 * tracking
 */
function interceptGetContext(): void {
    HTMLCanvasElement.prototype.getContext = function(
        contextId: string, 
        options?: any
    ): any {

        // get or create canvas metadata
        let metadata = canvasTracker.get(this);
        if (!metadata) {
            metadata = initCanvas(this);
        }
        metadata.hadContext = true;
        
        // call original method to get actual context
        const context = ORIGINAL_APIS.getContext.call(this, contextId, options);

        // if 2D context created, intercept drawing ops
        if (context && contextId == '2d') {
            interceptDrawingOps(context as CanvasRenderingContext2D, metadata);
        };
        
        return context;
    };
};

/**
 * Intercepts HTMLCanvasElement.prototype.toDataURL
 * Key method for canvas fingerprinting
 * Converts canvas to base64 image data
 */
function interceptToDataURL(): void {
    HTMLCanvasElement.prototype.toDataURL = function(
        type?: string, 
        quality?: any
    ): string {

        // get or create metadata
        let metadata = canvasTracker.get(this);
        if (!metadata) {
            metadata = initCanvas(this);
        }

        // update canvas extraction status
        metadata.wasExtracted = true;
        if (!metadata.extractedAt) {
            metadata.extractedAt = Date.now();
        }

        const extractedData = ORIGINAL_APIS.toDataURL.call(this, type, quality);
        
        updateCanvas(this);
        recordCanvasExtraction(metadata, extractedData);

        const scoreOut: { score: number, reasons: string[]} = scoreCanvas(metadata);
        metadata.susScore = scoreOut.score;
        printCanvasSusScore(metadata, scoreOut.score, scoreOut.reasons);
        
        // call original method to return actual data
        return extractedData;
    };
};

/**
 * Intercepts HTMLCanvasElement.prototype.getImageData
 * Alternative method for extracting pixel data from canvas
 */
function interceptGetImageData(): void {
    CanvasRenderingContext2D.prototype.getImageData = function(
        sx: number,
        sy: number, 
        sw: number,
        sh: number,
        settings?: ImageDataSettings
    ): ImageData {
        
        // get or create metadata
        let metadata = canvasTracker.get(this.canvas);
        if (!metadata) {
            metadata = initCanvas(this.canvas);
        }

        // update canvas extraction status
        metadata.wasExtracted = true;
        if (!metadata.extractedAt) {
            metadata.extractedAt = Date.now();
        }

        updateCanvas(this.canvas);
        const imageData = ORIGINAL_APIS.getImageData.call(this, sx, sy, sw, sh, settings);
        // convert imageData to string for correlation
        const dataStr = Array.from(imageData.data.slice(0, 100)).join(',');
        recordCanvasExtraction(metadata, dataStr);

        const scoreOut: { score: number, reasons: string[]} = scoreCanvas(metadata);
        metadata.susScore = scoreOut.score;
        printCanvasSusScore(metadata, scoreOut.score, scoreOut.reasons);

        // call original method to return actual data
        return imageData;
    };
};

/**
 * Interpects HTMLCanvasElement.prototype.toBlob
 * Alternative extraction method that converts canvas to Blob
 */
function interceptToBlob(): void {
    HTMLCanvasElement.prototype.toBlob = function(
        callback: BlobCallback,
        type?: string,
        quality?: any
    ): void {

        // get or create metadata
        let metadata = canvasTracker.get(this);
        if (!metadata) {
            metadata = initCanvas(this);
        }

        // update canvas extraction status
        metadata.wasExtracted = true;
        if (!metadata.extractedAt) {
            metadata.extractedAt = Date.now();
        }

        updateCanvas(this);

        const wrappedCallback: BlobCallback = (blob: Blob | null) => {
            if (blob) {
                blob.text().then(text => {
                    recordCanvasExtraction(metadata!, text.substring(0, 100));
                });
            }
            callback(blob);
        };

        const scoreOut: { score: number, reasons: string[]} = scoreCanvas(metadata)
        metadata.susScore = scoreOut.score;
        printCanvasSusScore(metadata, scoreOut.score, scoreOut.reasons);

        return ORIGINAL_APIS.toBlob.call(this, callback, type, quality);
    };
};

// ============================================================================
//       _  __    __                  __    ____     __                       __ 
//      / |/ /__ / /__    _____  ____/ /__ /  _/__  / /____ ___________ ___  / /_
//     /    / -_) __/ |/|/ / _ \/ __/  '_/_/ // _ \/ __/ -_) __/ __/ -_) _ \/ __/
//    /_/|_/\__/\__/|__,__/\___/_/ /_/\_\/___/_//_/\__/\__/_/  \__/\__/ .__/\__/ 
//                                                                   /_/         
//    Where the real action happens - intercepting network requests and 
//    checking them for Canvas data
// ============================================================================

/**
 * Intercepts window.fetch to track network requests
 */
function interceptFetch(): void {
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === 'string' ? input : input.toString();
        const body = init?.body ? String(init.body) : null;

        //UNCOMMENT TO BUGFIX
        //console.warn(`FETCH INTERCEPTED:`, url, body);
        
        correlateNetworkRequest(url, body);
        
        return ORIGINAL_APIS.fetch(input, init);
    };
}

/**
 * Intercepts XMLHttpRequest to track network requests
 */
function interceptXHR(): void {
    const xhrData = new WeakMap<XMLHttpRequest, { url: string }>();
    
    XMLHttpRequest.prototype.open = function(
        method: string,
        url: string | URL,
        async: boolean = true,
        username?: string | null,
        password?: string | null
    ): void {
        const urlStr = typeof url === 'string' ? url : url.toString();
        xhrData.set(this, { url: urlStr });

        //UNCOMMENT TO BUGFIX
        //console.warn(`XMLHTTPREQUEST.OPEN INTERCEPTED:`, urlStr);

        return ORIGINAL_APIS.xhrOpen.call(this, method, url, async, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
        const data = xhrData.get(this);
        if (data) {
            const bodyStr = body ? String(body) : null;
            correlateNetworkRequest(data.url, bodyStr);
        }
        
        //UNCOMMENT TO BUGFIX
        //console.warn(`XMLHTTPREQUEST.SEND INTERCEPTED:`, body);

        return ORIGINAL_APIS.xhrSend.call(this, body);
    };
}

// ============================================================================
//       ____     _ __  _      ___          __  _         
//      /  _/__  (_) /_(_)__ _/ (_)__ ___ _/ /_(_)__  ___ 
//     _/ // _ \/ / __/ / _ `/ / /_ // _ `/ __/ / _ \/ _ \
//    /___/_//_/_/\__/_/\_,_/_/_//__/\_,_/\__/_/\___/_//_/
//    The main function of this program                                                   
// ============================================================================

// runs in the MAIN world (page context), not isolated extension context

/**
 * Main initizalization function
 * Sets up all API interceptions
 * Runs immediately when script loads
 */
function initialize(): void {
    console.log(ASCII_APP_NAME);
    console.log(`~ FingerBite -> 👉 Fingerpring detector injected in page context`);

    // intercept all canvas methods
    interceptGetContext();
    interceptToDataURL();
    interceptGetImageData();
    interceptToBlob();

    // intercept network methods
    interceptFetch();
    interceptXHR();
};

initialize();
