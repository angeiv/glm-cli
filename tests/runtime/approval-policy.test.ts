import { test, expect } from "vitest";
import { isDangerousCommand } from "../../resources/extensions/glm-policy/index.js";

test("marks rm -rf as dangerous even in yolo mode", () => {
  expect(isDangerousCommand("rm -rf /tmp/demo")).toBe(true);
});
