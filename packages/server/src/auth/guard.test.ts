import express from "express";
import { describe, expect, it } from "vitest";

import { allow, listRoutes, requireEveryRouteDeclared } from "./guard.ts";

const ok: express.RequestHandler = (_request, response) => {
  response.end();
};

describe("listRoutes", () => {
  it("finds routes inside mounted routers, with their full paths and declarations", () => {
    const staff = express.Router();
    staff.get("/", allow("owner"), ok);
    staff.patch("/:id", allow("owner"), ok);
    const api = express.Router();
    api.use("/staff", staff);
    api.post("/auth/sign-in", allow("anyone"), ok);
    const app = express();
    app.use("/api", api);

    expect(listRoutes(app)).toEqual([
      { method: "GET", path: "/api/staff", access: ["owner"] },
      { method: "PATCH", path: "/api/staff/:id", access: ["owner"] },
      { method: "POST", path: "/api/auth/sign-in", access: ["anyone"] },
    ]);
  });

  it("checks each method of a route on its own", () => {
    const app = express();
    app.route("/members").get(allow("owner", "staff"), ok).post(ok);

    expect(listRoutes(app)).toEqual([
      { method: "GET", path: "/members", access: ["owner", "staff"] },
      { method: "POST", path: "/members", access: null },
    ]);
  });

  it("counts allow() only when it runs first", () => {
    const app = express();
    app.get("/late", ok, allow("owner"));

    expect(listRoutes(app)).toEqual([{ method: "GET", path: "/late", access: null }]);
  });
});

describe("requireEveryRouteDeclared", () => {
  it("refuses an app with a route that has no allow()", () => {
    const api = express.Router();
    api.get("/payments", ok);
    const app = express();
    app.use("/api", api);

    expect(() => requireEveryRouteDeclared(app)).toThrow("GET /api/payments");
  });

  it("accepts an app whose routes all declare", () => {
    const app = express();
    app.get("/", allow("anyone"), ok);

    expect(() => requireEveryRouteDeclared(app)).not.toThrow();
  });
});
