export function intoSecondsFromNow(seconds: number): number {
  return Math.floor((Date.now() + seconds * 1000) / 1000);
}
