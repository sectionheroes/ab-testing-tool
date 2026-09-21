// Render health check – no DB call by design.
export const loader = () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
