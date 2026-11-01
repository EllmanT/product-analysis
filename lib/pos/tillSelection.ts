/**
 * Which till (cash desk) this browser is. Chosen once on the terminal and remembered here, per branch,
 * so it survives reloads and works offline. localStorage can be blocked, so every access is guarded.
 */
const key = (branchId: string) => `pos:till:${branchId}`;

export function getSelectedTillId(branchId: string): string | null {
  try {
    return window.localStorage.getItem(key(branchId));
  } catch {
    return null;
  }
}

export function setSelectedTillId(branchId: string, tillId: string | null): void {
  try {
    if (tillId) window.localStorage.setItem(key(branchId), tillId);
    else window.localStorage.removeItem(key(branchId));
  } catch {
    /* blocked: the cashier is asked again next time */
  }
}
