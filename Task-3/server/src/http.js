export function Router() {
  const routes = [];
  const register = (method) => (path, ...handlers) => {
    const names = [];
    const pattern = path.replace(/:([A-Za-z0-9_]+)/g, (_match, name) => {
      names.push(name);
      return "([^/]+)";
    });
    routes.push({ method, regex: new RegExp(`^${pattern}$`), names, handlers });
  };

  return {
    get: register("GET"),
    post: register("POST"),
    patch: register("PATCH"),
    delete: register("DELETE"),
    async handle(req, res) {
      const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/api/, "") || "/";
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = pathname.match(route.regex);
        if (!match) continue;
        req.params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
        const run = async (index) => {
          const handler = route.handlers[index];
          if (!handler || res.writableEnded) return;
          await handler(req, res, () => run(index + 1));
        };
        await run(0);
        return true;
      }
      return false;
    },
  };
}

export function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.statusCode) res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}
