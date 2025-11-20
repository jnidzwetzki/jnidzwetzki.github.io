/**
 * Generic Comments Lazy Loader
 * Loads comment widgets (Cusdis, Disqus, Giscus, Utterances) only when they're about to become visible
 * This prevents blocking Mermaid and other critical scripts
 */
(function() {
  'use strict';

  /**
   * Generic lazy loader for any comment system
   * @param {string} containerId - The ID of the container element
   * @param {function} loadCallback - Function to call when loading should happen
   */
  function createLazyLoader(containerId, loadCallback) {
    const container = document.getElementById(containerId);
    if (!container || container.getAttribute('data-lazy-load') !== 'true') return;

    let loaded = false;

    function load() {
      if (loaded) return;
      loaded = true;
      loadCallback(container);
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            load();
            observer.unobserve(container);
          }
        });
      }, {
        rootMargin: '400px' // Load 400px before it comes into view
      });
      
      observer.observe(container);
    } else {
      // Fallback for browsers without IntersectionObserver
      if (document.readyState === 'complete') {
        load();
      } else {
        window.addEventListener('load', load);
      }
    }
  }

  // Cusdis loader
  createLazyLoader('cusdis_thread', function(container) {
    const lang = container.getAttribute('data-lang');
    
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
  });

})();

