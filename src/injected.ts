// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CanvasMetadata {
    id: string;                     // seqential id
    createdAt: number;              // tracking start timestamp
    hadContext: boolean;            // .getContext called
    wasInDOM: boolean;              // Canvas placed in DOM
    wasVisible: boolean;            // Canvas was ever visible to user
    wasExtracted: boolean;          // .toDataURL | .getImageData | .toBlob() called
    extractedAt: number | null;     // extraction timestamp
    drawOpsEntropic: DrawOperation[];       // entropic drawing operations performed
    numDrawOps: number;             // total number of drawing operations performed
    hasSusText: boolean;            // contains suspicious text
    susScore: number;               // total suspicion of canvas lifecycle
};

interface DrawOperation {
    method: string;                 // method call name
    args: any[];                    // method arguments
    timestamp: number;              // operation timestamp
};


// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CANVAS_SUS_VALS = {
    NO_CONTEXT: 5,              // never placed into Context           
    NEVER_IN_DOM: 5,            // never placed in DOM
    NEVER_VISIBLE: 4,           // never visible to user
    QUICK_EXTRACT: 3,           // extracted within 100ms of creation
    FEW_DRAW_OPS: 2,            // less than 3 drawing ops
    CONTAINS_SUS_TEXT: 3,       // canvas prompt includes common fingerprinting test str
    DETECTION_THRESHOLD: 7,     // score needed to flag canvas call as possible fingerprinting attempt
    FLAG_THRESHOLD: 10,
} as const;

const CANVAS_SUS_TEXT_PATTERNS: string[] = [
    // from FingerprintJS and similar libraries
    'cwm', 
    'fjord', 
    'glyph', 
    'vext', 
    'quiz',

    // Canvas font testing string
    'mmmmmmmmmmlli',                // test font width/kerning
    'mmmmmmm',
    'iiiiiii',

    // unicode and emoji test patterns
    'ðŸ˜ðŸ˜‚ðŸ˜ƒ',                  // emoji rendering test
    'â˜ºâ™«â™ª',                    // special character test
    `${/[\p{Emoji}].*[\p{Emoji}]/u}`,

    //foreign languages
    'é…·çƒˆãªæ—¥æœ¬èªž',            // Chinese/Japanese chars
    'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©',               // Arabic

    // very long
    `${/.{100,}/}`
] as const;


const CANVAS_DRAW_OPS_ENTROPIC: string[] = [
    // text rendering (PRIMARY fingerprinting vector)
    'fillText',
    'strokeText',
    'measureText',
    
    // complex paths (minor but real entropy source)
    'bezierCurveTo',
    'quadraticCurveTo',
    'arcTo',
    'ellipse',
    
    // gradients (color interpolation varies)
    'createLinearGradient',
    'createRadialGradient',
    'createConicGradient'
] as const;

const CANVAS_DRAW_OPS_GENERIC: string[] = [
    'fillRect',
    'strokeRect',
    'clearRect',
    'rect',
    'arc',          
    'drawImage',
    'putImageData',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'fill',
    'stroke'
] as const;

// original API methods called
const ORIGINAL_APIS = {
    getContext: HTMLCanvasElement.prototype.getContext,
    toDataURL: HTMLCanvasElement.prototype.toDataURL,
    getImageData: CanvasRenderingContext2D.prototype.getImageData,
    toBlob: HTMLCanvasElement.prototype.toBlob,
} as const;


// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// canvas id counter
let canvasIdCounter: number = 0;

// canvas state tracker - maps each canvas element to metadata
const canvasTracker: Map<HTMLCanvasElement, CanvasMetadata> = 
    new Map<HTMLCanvasElement, CanvasMetadata>();


// ============================================================================
// DISPLAY/FORMATTING FUNCTIONS
// ============================================================================

/**
 * Formats CanvasMetadata for logging.
 * 
 * @param medatada CanvasMetadata
 * @returns object: console log format for metadata
 */
function formatCanvasMetadataLog(medatada: CanvasMetadata): object {
    return {
        canvas_id: medatada.id,
        suspicion_score: medatada.susScore,
        had_context: medatada.hadContext,
        was_ever_in_DOM: medatada.wasInDOM,
        was_ever_visible: medatada.wasVisible,
        num_draw_ops: medatada.drawOpsEntropic.length,
        contains_suspicious_text: medatada.hasSusText,
        was_extracted: medatada.wasExtracted,
        extraction_time: medatada.extractedAt ? 
            `${medatada.extractedAt - medatada.createdAt}ms`
            : 'N/A',
    };
};


// ============================================================================
// CANVAS UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a unique sequential ID for tracking canvas elements.
 * 
 * @returns string: "canvas_00X"
 */
function generateCanvasId(): string {
    const paddedId: string = String(++canvasIdCounter).padStart(3, '0');
    return `canvas_${paddedId}`
};

/**
 * Checks if Canvas in DOM.
 * 
 * @param canvas HTMLCanvasElement
 * @returns boolean: true if canvas in DOM
 */
function isCanvasInDOM(canvas: HTMLCanvasElement): boolean {
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
function isCanvasVisible(canvas: HTMLCanvasElement): boolean {
    if (!isCanvasInDOM(canvas)) return false;

    const rectDim: DOMRect = canvas.getBoundingClientRect();                // rectangle dimensions
    const style: CSSStyleDeclaration = window.getComputedStyle(canvas);     // computed CSS

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

/**
 * Returns true if canvas contains common suspicious fingerpringing text patterns.
 * 
 * @param text string: argument to text-based drawing operation
 * @returns boolean: true if text contains suspicious patterns
 */
function canvasContainsSusStr(text: string): boolean {
    const lowText: string = text.toLowerCase();
    return CANVAS_SUS_TEXT_PATTERNS.some(pattern => lowText.includes(pattern));
}


// ============================================================================
// CANVAS TRACKING
// ============================================================================

/**
 * Initializes CanvasMetadata for HTMLCanvasElement and maps former to latter 
 * in canvasTracker.
 * 
 * @param canvas HTMLCanvasElement
 * @returns CanvasMetadata
 */
function initCanvas(canvas: HTMLCanvasElement): CanvasMetadata {
    const metadata: CanvasMetadata = {
        id: generateCanvasId(),
        createdAt: Date.now(),
        wasInDOM: isCanvasInDOM(canvas),
        wasVisible: isCanvasVisible(canvas),
        wasExtracted: false,
        extractedAt: null,
        drawOpsEntropic: [],
        susScore: 0,
        hadContext: false,
        numDrawOps: 0,
        hasSusText: false,
    }
    
    canvasTracker.set(canvas, metadata);
    console.log('~ FingerBite -> 🔵 Canvas tracked: ', metadata.id);

    return metadata;
};

/**
 * Update Canvas visibility flags.
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

    if (!metadata.wasInDOM) metadata.wasInDOM = isCanvasInDOM(canvas);
    if (!metadata.wasVisible) metadata.wasVisible = isCanvasVisible(canvas);

    return metadata;
}


// ============================================================================
// SUSPICION SCORING
// ============================================================================

/**
 * Calculates canvas metadata suspicion score
 * Suspicon scores and parameters set in SUS_VALS constant
 * @param canvas 
 * @returns number - canvas suspicion score, also updates canvas medatada
 */
function scoreCanvas(canvas: HTMLCanvasElement): number {
    let score: number = 0;
    const metadata: CanvasMetadata | undefined = canvasTracker.get(canvas);
    updateCanvas(canvas);
    const reasons: string[] = [];

    if (!metadata || !metadata.wasExtracted) return score;

    // extracted + not rendered
    if (!metadata.wasInDOM) {
        score += CANVAS_SUS_VALS.NEVER_VISIBLE;
        reasons.push('Canvas never in DOM');
    };

    // extracted + not visible
    if (!metadata.wasVisible) {
        score += CANVAS_SUS_VALS.NEVER_VISIBLE;
        reasons.push('Canvas never visible');
    };

    // extracted fast
    if (metadata.extractedAt) {
        const timeToExtract: number = metadata.extractedAt - metadata.createdAt;
        const timeThreshold: number = 100;

        if (timeToExtract < timeThreshold) {
            score += CANVAS_SUS_VALS.QUICK_EXTRACT;
            reasons.push(`Canvas quick extract (${timeToExtract}ms)`);
        };
    };

    // num drawing ops
    const numDrawOpsThreshold: number = 3;
    if (metadata.numDrawOps < numDrawOpsThreshold) {
        score += CANVAS_SUS_VALS.FEW_DRAW_OPS;
        reasons.push(`Canvas few operations (${metadata.numDrawOps})`);
    };

    // check for sus text in drawing ops
    if (metadata.hasSusText) {
        score += CANVAS_SUS_VALS.CONTAINS_SUS_TEXT;
        reasons.push('Canvas contains suspicious text strings')
    }

    metadata.susScore = score;

    const pad: string = '~~~~~~~~~~~~ -> ' + metadata.id + ':';

    console.log(`~ FingerBite -> Canvas: ${metadata.id}`);
    console.log(pad, 'Status:', formatCanvasMetadataLog(metadata));
    
    if (score >= CANVAS_SUS_VALS.FLAG_THRESHOLD) {
        console.log(pad, '🔴 LIKELY FINGERPRINTING DETECTED');
    } else if (score >= CANVAS_SUS_VALS.DETECTION_THRESHOLD) {
        console.log(pad, '🟠 Possible fingerprinting detected');
    } else {
        console.log(pad, '🟢 Unlikely to be fingerprinting');
    };
    if (reasons.length > 0) {
        console.log(pad, 'Suspicious behaviors detected:', reasons);    
    }

    return score;
}


// ============================================================================
// DRAWING OPERATION INTERCEPTION
// ============================================================================

/**
 * Intercepts canvas 2D context drawing methods.
 * Intercepts draw method call -> if entropic method -> push call to metadata.drawOps
 * Updates: metadate.numDrawOps, metadata.numDrawOpsEntropic, metadata.hasSusText
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
                if (canvasContainsSusStr(text)) metadata.hasSusText = true; // check contains suspicious text
            } 

            // intercept operations
            metadata.drawOpsEntropic.push({
                method: method,
                args: args,
                timestamp: Date.now(),
            });
            
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
// CANVAS API INTERCEPTION
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
        metadata.extractedAt = Date.now();
        updateCanvas(this);

        scoreCanvas(this);
        
        // call original method to return actual data
        return ORIGINAL_APIS.toDataURL.call(this, type, quality);
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
        metadata.extractedAt = Date.now();
        updateCanvas(this.canvas);

        scoreCanvas(this.canvas);

        // call original method to return actual data
        return ORIGINAL_APIS.getImageData.call(this, sx, sy, sw, sh, settings);
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
        metadata.extractedAt = Date.now();
        updateCanvas(this);

        scoreCanvas(this);

        return ORIGINAL_APIS.toBlob.call(this, callback, type, quality);
    };
};


// ============================================================================
// INITIALIZATION
// ============================================================================

// runs in the MAIN world (page context), not isolated extension context

/**
 * Main initizalization function
 * Sets up all API interceptions
 * Runs immediately when script loads
 */
function initialize(): void {
    console.log('~ FingerBite -> 🔵 Fingerpring detector injected in page context');

    // intercept all canvas methods
    interceptGetContext();
    interceptToDataURL();
    interceptGetImageData();
    interceptToBlob();
};

initialize();
