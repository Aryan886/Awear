import { BUNDLED_ROUTES, scoreRoutes } from '../src/routes/routeService';
import { DEFAULT_FIELD, fieldPm25 } from '../src/model/simulation';
import { getAir } from '../src/model/air';
import { ZONES } from '../src/config';

for (const hour of [8, 12, 15, 18, 20]) {
  const date = new Date(2026, 9, 16, hour);
  const result = scoreRoutes(BUNDLED_ROUTES, date, DEFAULT_FIELD);
  console.log(hour, {
    selected: result.selectedId,
    routes: result.routes.map((route) => ({
      id: route.id,
      pm25: Math.round(route.averagePm25),
      cleaner: Math.round(route.cleaner),
    })),
    school: getAir(fieldPm25(ZONES[0].center, date, DEFAULT_FIELD)),
  });
}
