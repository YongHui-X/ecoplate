export function getEcoPlateUrl(path: string = "/marketplace"): string {
  const token = localStorage.getItem("ecolocker_token");
  if (token) {
    return `${path}?token=${token}`;
  }
  return path;
}
