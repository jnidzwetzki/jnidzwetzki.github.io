/**
 * Cusdis Lazy Loader
 * Loads Cusdis comments only when they're about to become visible
 * This prevents blocking Mermaid and other critical scripts
 */
(function() {
  'use strict';
  
  const cusdisThread = document.getElementById('cusdis_thread');
  if (!cusdisThread || cusdisThread.getAttribute('data-lazy-load') !== 'true') return;

  let cusdisLoaded = false;

  function loadCusdis() {
    if (cusdisLoaded) return;
    cusdisLoaded = true;

    const lang = cusdisThread.getAttribute('data-lang');
    
    if (lang) {
      const langScript = document.createElement('script');
      langScript.src = 'https://cusdis.com/js/widget/lang/' + lang + '.js';
      langScript.async = true;
      document.body.appendChild(langScript);
    }

    const mainScript = document.createElement('script');
    mainScript.src = 'https://cusdis.com/js/cusdis.es.js';
    mainScript.async = true;
    document.body.appendChild(mainScript);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          loadCusdis();
          observer.unobserve(cusdisThread);
        }
      });
    }, {
      rootMargin: '400px' // Load 400px before it comes into view
    });
    
    observer.observe(cusdisThread);
  } else {
    if (document.readyState === 'complete') {
      loadCusdis();
    } else {
      window.addEventListener('load', loadCusdis);
    }
  }
})();

