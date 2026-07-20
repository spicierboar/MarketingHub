import "server-only";

/** Capture one wall-clock value for a dynamic server render. */
export function serverRenderTimestamp(): number {
  return Date.now();
}
