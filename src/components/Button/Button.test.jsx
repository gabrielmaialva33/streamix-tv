import Button from "./Button";
import { describe, expect, it } from "vitest";

describe("Button", () => {
  it("exports a component", () => {
    expect(Button).toBeTypeOf("function");
  });
});
