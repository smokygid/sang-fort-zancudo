(() => {
  const mountFooter = async () => {
    const slots = document.querySelectorAll('[data-sang-footer]');
    if (!slots.length) return;

    try {
      const response = await fetch('/footer.html', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Footer request failed: ' + response.status);
      const markup = await response.text();

      slots.forEach(slot => {
        slot.insertAdjacentHTML('beforebegin', markup);
        slot.remove();
      });

      const year = String(new Date().getFullYear());
      document.querySelectorAll('[data-sang-year]').forEach(node => {
        node.textContent = year;
      });
    } catch (error) {
      console.error('[SANG footer]', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFooter, { once: true });
  } else {
    mountFooter();
  }
})();
