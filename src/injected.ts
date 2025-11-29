// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CanvasMetadata {
    id: string;                     // unique id
    createdAt: number;              // tracking start timestamp
    inDOM: boolean;                 // canvas rendered in DOM
    visible: boolean;               // canvas visible to user
    extracted: boolean;             // toDataURL called
    extractedAt: number | null;     // extraction timestamp
    operations: DrawOperation[];    // drawing operations performed
    susScore: number;               // total suspicion of canvas operation
};

interface DrawOperation {
    method: string;                 // method call name
    args: any[];                    // method arguments
    timestamp: number;              // operation timestamp
};


// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const SUS_VALS = {
    CANVAS_NOT_IN_DOM: 5,           // canvas not rendered in DOM
    CANVAS_NOT_VISIBLE: 4,          // canvas not visible
    CANVAS_QUICK_EXTRACT: 3,        // canvas extracted within 100ms of canvas creation
    CANVAS_FEW_OPS: 2,              // canvas uses less than 3 drawing ops
    CANVAS_SUS_TEXT: 3,             // canvas prompt includes common fingerprinting test str
    CANVAS_DETECT_THRESHOLD: 7,     // score needed to flag canvas call as likely fingerprinting attempt
} as const;

const CANVAS_SUS_TEXT_PATTERNS: string[] = [
    // from FingerprintJS and similar libraries
    'cwm', 'fjordbank', 
    'glyph', 'vext', 'quiz',

    // canvas font testing string
    'mmmmmmmmmmlli',                // test font width/kerning

    // unicode and emoji test patterns
    'ðŸ˜ðŸ˜‚ðŸ˜ƒ',                  // emoji rendering test
    'â˜ºâ™«â™ª',                    // special character test

    //foreign languages
    'é…·çƒˆãªæ—¥æœ¬èªž',            // Chinese/Japanese chars
    'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©',               // Arabic
] as const;


const CANVAS_2D_DRAWING_METHODS: string[] = [
    'fillText', 'strokeText', 'fillRect', 'strokeRect',
]

// original API methods called
const originalAPIs = {
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
 * Formats CanvasMetadata for logging
 * @param medatada 
 * @returns object
 */
function formatCanvasMetadataLog(medatada: CanvasMetadata): object {
    return {
        canvasId: medatada.id,
        score: medatada.susScore,
        inDom: medatada.inDOM,
        visible: medatada.visible,
        numOperations: medatada.operations.length,
        extracted: medatada.extracted,
        extractionTime: medatada.extractedAt ? 
            `${medatada.extractedAt - medatada.createdAt}ms`
            : 'N/A',
    };
};


// ============================================================================
// CANVAS UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a unique sequential ID for tracking canvas elements
 * Example: canvas_001, canvas_002, etc
 * @returns canvas id string
 */
function generateCanvasId(): string {
    const paddedId: string = String(++canvasIdCounter).padStart(3, '0');
    return `canvas_${paddedId}`
};

/**
 * Returns true if canvas rendered in DOM, false otherwise
 * @param canvas 
 * @returns bool - true if rendered in DOM
 */
function isCanvasInDOM(canvas: HTMLCanvasElement): boolean {
    return document.contains(canvas);
};

/**
 * Returns true if canvas rendered visibly in DOM
 * Visibility criteria considered: 
 * - canvas dimensions >= 10 pixels
 * - canvas CSS styling not hiding canvas
 * - canvas not placed at extreme page offset
 * @param canvas 
 * @returns bool - true is rendered visibly in DOM
 */
function isCanvasVisible(canvas: HTMLCanvasElement): boolean {
    if (!isCanvasInDOM(canvas)) return false;

    const rectDim: DOMRect = canvas.getBoundingClientRect();         // rectangle dimensions
    const style: CSSStyleDeclaration = window.getComputedStyle(canvas);          // computed CSS

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
 * Returns true if canvas contains common suspicious fingerpringing patterns
 * @param text 
 * @returns bool - true if contains suspicious patterns
 */
function canvasContainsSusStr(text: string): boolean {
    const lowText: string = text.toLowerCase();
    return CANVAS_SUS_TEXT_PATTERNS.some(pattern => lowText.includes(pattern));
};


// ============================================================================
// CANVAS TRACKING
// ============================================================================

/**
 * Initializes CanvasMetadata for newly captured canvas
 * @param canvas 
 * @returns CanvasMetadata object
 */
function initCanvas(canvas: HTMLCanvasElement): CanvasMetadata {
    const metadata: CanvasMetadata = {
        id: generateCanvasId(),
        createdAt: Date.now(),
        inDOM: isCanvasInDOM(canvas),
        visible: isCanvasVisible(canvas),
        extracted: false,
        extractedAt: null,
        operations: [],
        susScore: 0,
    };
    return metadata;
};

/**
 * Calls to initialize then tracks newly captured canvas in canvasTracker
 * @param canvas 
 * @returns CanvasMetadata object
 */
function trackCanvas(canvas: HTMLCanvasElement): CanvasMetadata {
    const metadata: CanvasMetadata = initCanvas(canvas);

    canvasTracker.set(canvas, metadata);
    console.log('~ FingerBite -> 🔵 Canvas tracked: ', metadata.id, {
        inDOM: metadata.inDOM,
        visible: metadata.visible,
    });
    return metadata;
};

function updateCanvas(canvas: HTMLCanvasElement): void {
    const metadata: CanvasMetadata | undefined = canvasTracker.get(canvas);
    if (!metadata) {
        console.warn('~ FingerBite -> 🟡 Attempted to update untracked canvas');
        return;
    };

    metadata.inDOM = isCanvasInDOM(canvas);
    metadata.visible = isCanvasVisible(canvas);
    console.log('~ FingerBite -> 🔵 Canvas updated: ', metadata.id, {
        inDOM: metadata.inDOM,
        visible: metadata.visible,
    });
};


// ============================================================================
// SUSPICION SCORING
// ============================================================================

/**
 * Calculates canvas metadata suspicion score
 * Suspicon scores and parameters set in SUS_VALS constant
 * @param canvas 
 * @returns number - canvas suspicion score, also updates canvas medatada
 */
function getCanvasSusScore(canvas: HTMLCanvasElement): number {
    let score: number = 0;
    const metadata: CanvasMetadata | undefined = canvasTracker.get(canvas);
    const reasons: string[] = [];

    if (!metadata) return score;
    if (!metadata.extracted) return score;

    // extracted + not rendered
    if (!metadata.inDOM) {
        score += SUS_VALS.CANVAS_NOT_VISIBLE;
        reasons.push('Canvas not in DOM');
    };

    // extracted + not visible
    if (!metadata.visible) {
        score += SUS_VALS.CANVAS_NOT_VISIBLE;
        reasons.push('Canvas not visible');
    };

    // extracted fast
    if (metadata.extractedAt) {
        const timeToExtract: number = metadata.extractedAt - metadata.createdAt;
        const timeThreshold: number = 100;

        if (timeToExtract < timeThreshold) {
            score += SUS_VALS.CANVAS_QUICK_EXTRACT;
            reasons.push(`Canvas quick extract (${timeToExtract}ms)`);
        };
    };

    // num drawing ops
    const numOpsThreshold: number = 3;
    const opLength: number = metadata.operations.length;
    if (opLength < numOpsThreshold) {
        score += SUS_VALS.CANVAS_FEW_OPS;
        reasons.push(`Canvas few operations (${opLength})`);
    };

    // check for sus text in drawing ops
    if (opLength > 0) {
        // array of text based drawing operations
        const textOps: DrawOperation[] = metadata.operations.filter(op =>
            op.method.toLowerCase().includes('text') && op.args[0]
        );

        // determine if drawing text prompts contain sus text
        const hasSusText = textOps.some(op => {
            const text = String(op.args[0]);
            return canvasContainsSusStr(text);
        });

        if (hasSusText) {
            score += SUS_VALS.CANVAS_SUS_TEXT;
            reasons.push('Canvas contains suspicious text strings')
        }
    }

    if (reasons.length > 0) {
        console.warn(`~ FingerBite -> 🟠 Canvas flagged: ${metadata.id}: suspicious behaviors detected: `, reasons);
    };
    return score;
}

/**
 * Updates canvas suspicion score, flags if above threshold
 * @param canvas 
 * @return bool - true if canvas suspicion above threshold
 */
function updateCanvasSusScore(canvas: HTMLCanvasElement): boolean {
    const metadata: CanvasMetadata | undefined = canvasTracker.get(canvas);
    const score: number = getCanvasSusScore(canvas);

    if (!metadata) return false;
    metadata.susScore = score; 

    console.log(`\n~ FingerBite -> Canvas: ${metadata.id}`);
    console.log('\t~ FingerBite -> Status:', formatCanvasMetadataLog(metadata));

    if (metadata.susScore >= SUS_VALS.CANVAS_DETECT_THRESHOLD) {
        console.log('\t~ FingerBite -> 🔴 FINGERPRINTING DETECTED');
    } else if (metadata.susScore > 0) {
        console.log('\t~ FingerBite -> 🟠 Flagged as possible fingerprinting attempt');
    } else {
        console.log('\t~ FingerBite -> 🔵 Appears legitimate');
    };

    return true;
};

// ============================================================================
// DRAWING OPERATION INTERCEPTION
// ============================================================================

/**
 * Intercepts canvas 2D context drawing methods
 * @param ctx 
 * @returns void
 */
function interceptDrawingOps(ctx: CanvasRenderingContext2D): void {
    const canvas = ctx.canvas;
    const metadata = canvasTracker.get(canvas);

    if (!metadata) {
        console.warn('~ FingerBite -> 🟡 Attempted to intercept drawing operations for untracked canvas');
        return;
    };

    CANVAS_2D_DRAWING_METHODS.forEach(methodName => {
        const original = (ctx as any)[methodName];
        if (!original) return;

        // replace with interceptor
        (ctx as any)[methodName] = function(...args: any[]) {
            // intercept operations
            metadata.operations.push({
                method: methodName,
                args: args,
                timestamp: Date.now(),
            });
            // actually perform drawing operations
            return original.apply(this, args);
        };
    });
};


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
        console.log('~ FingerBite -> 🔵 getContext called:', contextId);

        // get or create canvas metadata
        let metadata = canvasTracker.get(this);
        if (!metadata) {
            metadata = trackCanvas(this);
        }
        
        // call original method to get actual context
        const context = originalAPIs.getContext.call(this, contextId, options);

        // if 2D context creates, intercept drawing ops
        if (context && contextId == '2d') {
            interceptDrawingOps(context as CanvasRenderingContext2D);
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
            metadata = trackCanvas(this);
        }

        // update canvas extraction status
        metadata.extracted = true;
        metadata.extractedAt = Date.now();
        updateCanvas(this);

        console.warn('~ FingerBite -> 🔴 toDataURL CALLED', formatCanvasMetadataLog(metadata));
        updateCanvasSusScore(this);
        
        // call original method to return actual data
        return originalAPIs.toDataURL.call(this, type, quality);
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
        console.warn('~ FingerBite -> 🔴 getImageData called - possible fingerprinting', {
            region: `${sx},${sy} ${sw}x${sh}`
        });
        
        //TODO: ADD FULL TRACKING

        // call original method to return actual data
        return originalAPIs.getImageData.call(this, sx, sy, sw, sh, settings);
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
        console.warn('~ FingerBite -> 🔴 toBlob called - possible fingerprinting');

        //TODO: ADD FULL TRACKING

        return originalAPIs.toBlob.call(this, callback, type, quality);
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
    /*
    setTimeout(() => {
        console.log('~ FingerBite -> 🔵 Detection threshold:', SUS_VALS.CANVAS_DETECT_THRESHOLD, 'points');
        console.log('~ FingerBite -> 🔵 Total Canvases tracked:', canvasTracker.size);

        canvasTracker.forEach((metadata, canvas) => {
            updateCanvasSusScore(canvas);

            console.log(`\n~ FingerBite -> Canvas: ${metadata.id}`);
            console.log('\t~ FingerBite -> Status:', formatCanvasMetadataLog(metadata));

            if (metadata.susScore >= SUS_VALS.CANVAS_DETECT_THRESHOLD) {
                console.log('\t~ FingerBite -> 🔴 FINGERPRINTING DETECTED');
            } else if (metadata.susScore > 0) {
                console.log('\t~ FingerBite -> 🟠 Flagged as possible fingerprinting attempt');
            } else {
                console.log('\t~ FingerBite -> 🔵 Appears legitimate');
            }
        })
    }, 2000);
    */
};

initialize();
