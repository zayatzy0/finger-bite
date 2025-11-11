// runs in the MAIN world (page context), not isolated extension context
console.log('🔧 Fingerprint detector injected in page context');

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

// Intercept getContext
HTMLCanvasElement.prototype.getContext = function(
  contextId: string, 
  options?: any
): any {
  console.log('🚨 getContext called:', contextId);
  return originalGetContext.call(this, contextId, options);
};

// Intercept toDataURL
// Intercept toDataURL with suspicion scoring
HTMLCanvasElement.prototype.toDataURL = function(
  type?: string, 
  quality?: any
): string {
  // Check if canvas is visible and legitimate-looking
  const isInDOM = document.contains(this);
  const isVisible = this.offsetParent !== null;
  const isSmall = this.width < 10 || this.height < 10;
  const isEmpty = this.width === 0 || this.height === 0;
  
  // Calculate suspicion
  const suspicious = !isInDOM || !isVisible || isSmall || isEmpty;
  
  if (suspicious) {
    console.warn('🔴 HIGH SUSPICION: Hidden/tiny canvas toDataURL', {
      inDOM: isInDOM,
      visible: isVisible,
      size: `${this.width}x${this.height}`
    });
  } else {
    console.log('🟡 LOW SUSPICION: Visible canvas toDataURL (may be legitimate)', {
      size: `${this.width}x${this.height}`
    });
  }
  
  return originalToDataURL.call(this, type, quality);
};
// Intercept getImageData (alternative fingerprinting method)
CanvasRenderingContext2D.prototype.getImageData = function(
  sx: number,
  sy: number, 
  sw: number,
  sh: number,
  settings?: ImageDataSettings
): ImageData {
  console.warn('🔴 getImageData called - possible fingerprinting');
  return originalGetImageData.call(this, sx, sy, sw, sh, settings);
};
// Intercept toBlob (another extraction method)
HTMLCanvasElement.prototype.toBlob = function(
  callback: BlobCallback,
  type?: string,
  quality?: any
): void {
  console.warn('🔴 toBlob called - possible fingerprinting');
  return originalToBlob.call(this, callback, type, quality);
};

console.log('✅ Canvas methods intercepted successfully');