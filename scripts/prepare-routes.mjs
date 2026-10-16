import { readFile, writeFile } from 'node:fs/promises';

const origin = [73.8682, 18.4636];
const destination = [73.8636, 18.5018];
const baseUrl = 'https://router.project-osrm.org/route/v1/driving/';
const query = '?overview=full&geometries=geojson&steps=true';
const primaryUrl = `${baseUrl}${origin.join(',')};${destination.join(',')}${query}&alternatives=3`;
// This via-point makes the third alternative follow a separate road corridor.
const viaUrl = `${baseUrl}${origin.join(',')};73.8663,18.4858;${destination.join(',')}${query}&alternatives=false`;

async function readRoutes(file, url) {
  const response = process.argv.includes('--from-files')
    ? JSON.parse(await readFile(file, 'utf8'))
    : await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json();
  if (response.code !== 'Ok' || !response.routes?.length) throw new Error(`No routes from ${url}`);
  return response.routes;
}

const primary = await readRoutes('route-preparation.json', primaryUrl);
const via = await readRoutes('route-preparation-via.json', viaUrl);
const estimates = [18, 21, 19];
const routes = [primary[0], primary[1], via[0]].map((route, index) => {
  if (!route?.geometry?.coordinates?.length) throw new Error(`Missing geometry for route ${index}`);
  let distance = 0;
  const steps = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      distance += step.distance;
      steps.push({ name: step.name || 'Bibwewadi Road', endMeters: Math.round(distance) });
    }
  }
  const namedSteps = route.legs.flatMap((leg) => leg.steps).filter((step) => step.name);
  namedSteps.sort((first, second) => second.distance - first.distance);
  return {
    id: `swargate-${index + 1}`,
    name: namedSteps[0]?.name || 'Bibwewadi Road',
    coordinates: route.geometry.coordinates,
    steps,
    durationSec: estimates[index] * 60,
    osrmDurationSec: route.duration,
    distanceMeters: route.distance,
    source: 'bundled',
  };
});
const result = {
  preparedAt: new Date().toISOString(),
  provider: 'OSRM / OpenStreetMap contributors',
  geometryLicense: 'ODbL 1.0',
  requests: [primaryUrl, viaUrl],
  durationNote:
    '18 / 21 / 19 minutes are modelled demo estimates; original OSRM estimates retained separately.',
  routes,
};
await writeFile('src/routes/swargate.json', `${JSON.stringify(result)}\n`);
console.log(
  `Bundled ${routes.length} OSRM road routes (${routes.map((route) => route.coordinates.length).join(', ')} vertices).`,
);
