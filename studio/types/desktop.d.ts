// Optional compatibility hook for embedding the studio in a desktop shell.
// The standalone browser uses IndexedDB; no desktop bridge is required.
export {};
declare global { interface Window { reproclipDesktop?: unknown; } }
