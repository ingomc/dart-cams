export const prerender = true;
export const ssr = false; // Since we are using browser APIs like navigator.mediaDevices, it's safer to disable SSR for this app or handle it carefully. Given it's a tool, SPA mode (ssr=false) is often easier.
