console.log('FingerBite loaded!');

// Test: detect any canvas creation
const originalCreateElement = document.createElement.bind(document);
document.createElement = function<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementCreationOptions
): HTMLElementTagNameMap[K] {
  const element = originalCreateElement(tagName, options);

  if (String(tagName).toLowerCase() === 'canvas') {
    console.log('Canvas created!');
  }

  return element;
};
