// Inject script directly into page context to intercept BEFORE any page scripts run
const script = document.createElement('script');
script.textContent = `
  (function() {
    console.log('🔧 Injected script running IN PAGE CONTEXT');
    
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    
    // Intercept getContext
    HTMLCanvasElement.prototype.getContext = function(contextId, options) {
      console.log('🚨 getContext called:', contextId);
      return originalGetContext.call(this, contextId, options);
    };
    
    // Intercept toDataURL - THIS IS THE KEY ONE
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      console.warn('🔴🔴🔴 toDataURL CALLED - FINGERPRINTING DETECTED!');
      console.log('Canvas size:', this.width, 'x', this.height);
      console.log('In DOM:', document.contains(this));
      
      return originalToDataURL.call(this, type, quality);
    };
    
    console.log('✅ Canvas methods intercepted in page context');
  })();
`;

// Insert BEFORE any other scripts run
const target = document.head || document.documentElement;
target.insertBefore(script, target.firstChild);
script.remove(); // Clean up

console.log('🔍 Fingerprint Detector content script loaded!');