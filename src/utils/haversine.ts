interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface StoreBranch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const calculateDistance = (coords1: Coordinate, coords2: Coordinate): number => {
  const EARTH_RADIUS_KM = 6371; // Jari-jari bumi dalam kilometer

  const dLat = (coords2.latitude - coords1.latitude) * (Math.PI / 180);
  const dLng = (coords2.longitude - coords1.longitude) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1.latitude * (Math.PI / 180)) *
      Math.cos(coords2.latitude * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_KM * c;
};

export const findNearestStore = (userCoords: Coordinate, stores: StoreBranch[]): StoreBranch | null => {
  if (stores.length === 0) return null;

  let nearestStore: StoreBranch | null = null;
  let shortestDistance = Infinity;

  stores.forEach((store) => {
    const distance = calculateDistance(userCoords, {
      latitude: store.latitude,
      longitude: store.longitude,
    });

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestStore = store;
    }
  });

  return nearestStore;
};