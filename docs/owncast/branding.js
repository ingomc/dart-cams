/* SCO browser icons. Paste into Owncast → General → Custom Scripting. */
(() => {
  const version = '20261017';
  function updateLink(rel, attributes) {
    const link = document.querySelector(`link[rel="${rel}"]`) || document.createElement('link');
    link.rel = rel;
    for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
    if (!link.isConnected) document.head.append(link);
  }
  function updateMeta(name, content) {
    const meta = document.querySelector(`meta[name="${name}"]`) || document.createElement('meta');
    meta.name = name;
    meta.content = content;
    if (!meta.isConnected) document.head.append(meta);
  }
  function applyBranding() {
    updateLink('icon', { href: `/favicon.ico?sco-brand=${version}`, type: 'image/x-icon' });
    updateLink('apple-touch-icon', { href: `/logo?sco-brand=${version}`, sizes: '512x512' });
    updateMeta('application-name', 'SCO Darts Live');
    updateMeta('apple-mobile-web-app-title', 'SCO Darts Live');
    updateMeta('theme-color', '#b91c1c');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  } else {
    applyBranding();
  }
})();
