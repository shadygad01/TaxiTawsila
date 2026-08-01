import { SystemHealthPage } from './SystemHealthPage';

/**
 * Layout shell (Folder Structure §4). Phase 2 has exactly one route — system
 * health — because no other admin feature (riders, trips, trust review,
 * rewards, merchants, campaigns, configuration, audit logs) has a backend to
 * call yet. Routing (`react-router-dom` is a dependency) is added when the
 * first real feature is.
 */
export function App() {
  return (
    <main>
      <h1>Taxi Alexandria — Admin</h1>
      <SystemHealthPage />
    </main>
  );
}
