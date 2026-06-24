import worker from "../src/index";

type PagesEnv = {
  DB: D1Database;
};

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const env = {
    ...context.env,
    ASSETS: {
      fetch: () => context.next(),
    },
  };

  return worker.fetch(context.request, env as never);
};
