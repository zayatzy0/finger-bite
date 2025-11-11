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

// Intercept toDataURL - THIS IS THE KEY ONE
HTMLCanvasElement.prototype.toDataURL = function(
  type?: string, 
  quality?: any
): string {
  console.warn('🔴🔴🔴 toDataURL CALLED - FINGERPRINTING DETECTED!');
  console.log('Canvas size:', this.width, 'x', this.height);
  console.log('In DOM:', document.contains(this));
  
  return originalToDataURL.call(this, type, quality);
};

console.log('✅ Canvas methods intercepted successfully');