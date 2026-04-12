import { test, expect } from "vitest";
import { isDangerousCommand } from "../../resources/extensions/glm-policy/index.js";

const rmVariants = [
  "rm -rf /tmp/demo",
  "rm -fr /tmp/demo",
  "rm -r -f /tmp/demo",
  "rm -f -r /tmp/demo",
  "sudo rm -fr /tmp/demo",
];

test.each(rmVariants)(
  "marks '%s' as dangerous even in yolo mode",
  (command) => {
    expect(isDangerousCommand(command)).toBe(true);
  },
);
