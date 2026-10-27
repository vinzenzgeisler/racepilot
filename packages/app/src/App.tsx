import { healthResponseSchema } from '@racepilot/contracts';

const status = healthResponseSchema.parse({ status: 'ok', version: '0.0.0' });

export function App() {
  return (
    <main>
      <h1>RacePilot</h1>
      <p>Product workspace is ready.</p>
      <small>Service status: {status.status}</small>
    </main>
  );
}
