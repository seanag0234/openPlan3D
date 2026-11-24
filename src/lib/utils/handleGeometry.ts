/** Screen px: how far outside the corner, drawn radius, how far a press may be. */
export interface HandleGeometry { outset: number; radius: number; reach: number }
/** Handles for a mouse or pen. */
export const FINE_HANDLE: HandleGeometry = { outset: 0, radius: 5, reach: 8 };
/** Handles for a finger. */
export const COARSE_HANDLE: HandleGeometry = { outset: 10, radius: 9, reach: 28 };
export const handleGeometry = (coarse: boolean | undefined): HandleGeometry => (coarse ? COARSE_HANDLE : FINE_HANDLE);
