import { describe, expect, it } from "vitest";
import { allowedOrigin } from "./worker.js";

const environment = {
  ALLOWED_ORIGINS: "https://play.example, http://127.0.0.1:8787",
};

describe("relay origin policy", () => {
  it("allows credential-authenticated appliance requests without a browser origin", () => {
    expect(
      allowedOrigin(
        {
          headers: new Headers({
            connection: "upgrade",
            upgrade: "websocket",
          }),
        },
        environment,
      ),
    ).toBe(true);
  });

  it("allows configured browser origins and rejects unconfigured origins", () => {
    expect(
      allowedOrigin(
        { headers: new Headers({ origin: "http://127.0.0.1:8787" }) },
        environment,
      ),
    ).toBe(true);
    expect(
      allowedOrigin(
        { headers: new Headers({ origin: "https://attacker.example" }) },
        environment,
      ),
    ).toBe(false);
  });
});
