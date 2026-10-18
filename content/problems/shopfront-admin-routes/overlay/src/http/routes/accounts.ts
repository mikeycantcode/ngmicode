import { toPublic } from "../../domain/customer";
import type { RegisterInput } from "../../accounts/account-service";
import type { Services } from "../../app";
import { requireAuth, validateBody } from "../middleware";
import type { Router } from "../router";
import { json } from "../types";

export function registerAccountRoutes(router: Router, s: Services) {
  router.post(
    "/accounts/register",
    validateBody({
      email: { type: "string", required: true },
      password: { type: "string", required: true, min: 8 },
      name: { type: "string", required: true, min: 1 },
      region: { type: "string", required: true },
    }),
    (req) => {
      const customer = s.accounts.register(req.body as RegisterInput);
      return json(201, toPublic(customer));
    },
  );

  router.post(
    "/accounts/login",
    validateBody({ email: { type: "string", required: true }, password: { type: "string", required: true } }),
    (req) => {
      const b = req.body as { email: string; password: string };
      const session = s.accounts.login(b.email, b.password);
      return json(200, { token: session.token, expiresAt: session.expiresAt });
    },
  );

  router.get("/accounts/me", requireAuth, (req) => {
    return json(200, toPublic(s.repos.customers.require(req.user!.id)));
  });
}
