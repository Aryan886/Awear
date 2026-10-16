import { describe, expect, it } from 'vitest';
import { BUNDLED_ROUTES, RouteRequest, validateRoutes } from './routeService';

const destination: [number, number] = [73.8636, 18.5018];
function response() {
  return {
    code: 'Ok',
    routes: [
      {
        duration: 1000,
        distance: 5000,
        geometry: { coordinates: [[73.8682, 18.4636], destination] },
        legs: [{ steps: [{ name: 'Satara Road', distance: 5000 }] }],
      },
    ],
  };
}
describe('road requests', () => {
  it('validates geometry, endpoint, nonempty steps and durations', () => {
    expect(validateRoutes(response(), destination)).toHaveLength(1);
    expect(() => validateRoutes({ code: 'Ok', routes: [] }, destination)).toThrow();
    const invalid = response();
    invalid.routes[0].duration = NaN;
    expect(() => validateRoutes(invalid, destination)).toThrow();
    const empty = response();
    empty.routes[0].legs[0].steps = [];
    expect(() => validateRoutes(empty, destination)).toThrow();
    const far = response();
    far.routes[0].geometry.coordinates[1] = [1, 1];
    expect(() => validateRoutes(far, destination)).toThrow();
  });
  it('rejects a late reply for a previous destination', async () => {
    const request = new RouteRequest();
    let resolveFirst!: (routes: typeof BUNDLED_ROUTES) => void;
    const first = request.load(
      'swargate',
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = request.load('katraj', async () => BUNDLED_ROUTES.slice(0, 2));
    expect(await second).toHaveLength(2);
    resolveFirst(BUNDLED_ROUTES);
    expect(await first).toBeNull();
  });
  it('gives separate requests distinct route identifiers when their geometry differs', () => {
    const first = response();
    const second = response();
    second.routes[0].geometry.coordinates.splice(1, 0, [73.87, 18.48]);
    expect(validateRoutes(first, destination)[0].id).not.toBe(
      validateRoutes(second, destination)[0].id,
    );
  });
  it('ignores a response cancelled when a ride locks its route', async () => {
    const request = new RouteRequest();
    let finish!: (routes: typeof BUNDLED_ROUTES) => void;
    const pending = request.load(
      'swargate',
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    request.cancel();
    finish(BUNDLED_ROUTES);
    expect(await pending).toBeNull();
  });
});
