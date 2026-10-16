export type Coordinate = [number, number];
export const METERS_PER_LATITUDE = 111320;
export const METERS_PER_LONGITUDE = 105550;
export function distance(first: Coordinate, second: Coordinate) {
  return Math.hypot(
    (second[0] - first[0]) * METERS_PER_LONGITUDE,
    (second[1] - first[1]) * METERS_PER_LATITUDE,
  );
}
export function offset(position: Coordinate, east: number, north: number): Coordinate {
  return [position[0] + east / METERS_PER_LONGITUDE, position[1] + north / METERS_PER_LATITUDE];
}
export function routeLengths(coordinates: Coordinate[]) {
  const lengths = [0];
  for (let index = 1; index < coordinates.length; index += 1)
    lengths.push(lengths[index - 1] + distance(coordinates[index - 1], coordinates[index]));
  return lengths;
}
export function positionAlong(
  coordinates: Coordinate[],
  lengths: number[],
  meters: number,
): Coordinate {
  if (coordinates.length === 0) throw new Error('Cannot interpolate an empty route');
  if (coordinates.length === 1 || meters <= 0) return coordinates[0];
  const last = lengths.length - 1;
  if (meters >= lengths[last]) return coordinates[last];
  let low = 1;
  let high = last;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lengths[middle] < meters) low = middle + 1;
    else high = middle;
  }
  const segment = lengths[low] - lengths[low - 1];
  const fraction = segment > 0 ? (meters - lengths[low - 1]) / segment : 0;
  return [
    coordinates[low - 1][0] + (coordinates[low][0] - coordinates[low - 1][0]) * fraction,
    coordinates[low - 1][1] + (coordinates[low][1] - coordinates[low - 1][1]) * fraction,
  ];
}
export function distanceToSegment(position: Coordinate, start: Coordinate, end: Coordinate) {
  const x = (position[0] - start[0]) * METERS_PER_LONGITUDE;
  const y = (position[1] - start[1]) * METERS_PER_LATITUDE;
  const dx = (end[0] - start[0]) * METERS_PER_LONGITUDE;
  const dy = (end[1] - start[1]) * METERS_PER_LATITUDE;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared)) : 0;
  return Math.hypot(x - fraction * dx, y - fraction * dy);
}
export function nearestDistanceOnRoute(
  coordinates: Coordinate[],
  lengths: number[],
  position: Coordinate,
) {
  let bestDistance = Infinity;
  let routeDistance = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const candidate = distanceToSegment(position, coordinates[index - 1], coordinates[index]);
    if (candidate < bestDistance) {
      bestDistance = candidate;
      routeDistance = lengths[index - 1];
    }
  }
  return routeDistance;
}
