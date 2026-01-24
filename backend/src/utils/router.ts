export type RouteHandler = (
  req: Request,
  params: Record<string, string>
) => Promise<Response> | Response;

export type Middleware = (
  req: Request,
  next: () => Promise<Response>
) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  private addRoute(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    const pattern = new RegExp(`^${patternStr}$`);
    this.routes.push({ method, pattern, paramNames, handler });
  }

  get(path: string, handler: RouteHandler) {
    this.addRoute("GET", path, handler);
  }

  post(path: string, handler: RouteHandler) {
    this.addRoute("POST", path, handler);
  }

  patch(path: string, handler: RouteHandler) {
    this.addRoute("PATCH", path, handler);
  }

  put(path: string, handler: RouteHandler) {
    this.addRoute("PUT", path, handler);
  }

  delete(path: string, handler: RouteHandler) {
    this.addRoute("DELETE", path, handler);
  }

  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = path.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        let index = 0;
        const next = async (): Promise<Response> => {
          if (index < this.middlewares.length) {
            const middleware = this.middlewares[index++];
            return middleware(req, next);
          }
          return route.handler(req, params);
        };

        return next();
      }
    }
    return null;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function parseBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  return JSON.parse(text) as T;
}
