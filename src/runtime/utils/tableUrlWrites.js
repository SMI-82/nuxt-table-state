// Routers are scoped to a Nuxt app/request. Tables on one router share a queue,
// and each write merges into the URL only after the preceding write has settled.
const routers = new WeakMap();

function forRouter(router) {
  if (!routers.has(router)) routers.set(router, { tail: Promise.resolve(), prefixes: new Set() });
  return routers.get(router);
}

export function queueTableUrlWrite(router, write) {
  const queue = forRouter(router);
  const result = queue.tail.then(async () => {
    try {
      return await write((method, location) => {
        queue.target = router.resolve(location).fullPath;
        return router[method](location);
      });
    } finally {
      queue.target = null;
    }
  });
  queue.tail = result.catch(() => {});
  return result;
}

export function isTableUrlNavigation(router, route) {
  return forRouter(router).target === route.fullPath;
}

export function registerTableUrlPrefix(router, path, prefix) {
  const { prefixes } = forRouter(router);
  const key = JSON.stringify([path, prefix]);
  if (prefixes.has(key)) throw new Error(`Duplicate table URL prefix "${prefix}" on ${path}`);
  prefixes.add(key);
  return () => prefixes.delete(key);
}
