import { execFile, spawn } from "node:child_process";

const GLM_NOTIFY_SUPPRESSION = Symbol.for("glm.notifySuppression");

function getSuppressionStore() {
  const store = globalThis;
  const existing = store[GLM_NOTIFY_SUPPRESSION];
  if (existing instanceof Map) {
    return existing;
  }

  const next = new Map();
  store[GLM_NOTIFY_SUPPRESSION] = next;
  return next;
}

function parseBoolean(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
}

export function readNotificationRuntimeConfig(env = process.env) {
  return {
    enabled: parseBoolean(env.GLM_NOTIFY_ENABLED, false),
    onTurnEnd: parseBoolean(env.GLM_NOTIFY_ON_TURN_END, true),
    onLoopResult: parseBoolean(env.GLM_NOTIFY_ON_LOOP_RESULT, true),
  };
}

export function shouldNotifyForEvent(config, event) {
  if (!config.enabled) {
    return false;
  }

  if (event === "turnEnd") {
    return config.onTurnEnd;
  }

  if (event === "loopResult") {
    return config.onLoopResult;
  }

  return false;
}

function wrapForTmux(sequence) {
  if (!process.env.TMUX) {
    return sequence;
  }

  const escaped = sequence.split("\x1b").join("\x1b\x1b");
  return `\x1bPtmux;${escaped}\x1b\\`;
}

function notifyOSC777(title, body) {
  const sequence = `\x1b]777;notify;${title};${body}\x07`;
  process.stdout.write(wrapForTmux(sequence));
}

function notifyOSC9(message) {
  const sequence = `\x1b]9;${message}\x07`;
  process.stdout.write(wrapForTmux(sequence));
}

function notifyOSC99(title, body) {
  process.stdout.write(wrapForTmux(`\x1b]99;i=1:d=0;${title}\x1b\\`));
  process.stdout.write(wrapForTmux(`\x1b]99;i=1:p=body;${body}\x1b\\`));
}

function escapePowerShellLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function windowsToastScript(title, body) {
  const type = "Windows.UI.Notifications";
  const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
  const template = `[${type}.ToastTemplateType]::ToastText01`;
  const toast = `[${type}.ToastNotification]::new($xml)`;
  return [
    `${mgr} > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${escapePowerShellLiteral(body)}')) > $null`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('${escapePowerShellLiteral(title)}').Show(${toast})`,
  ].join("; ");
}

function notifyWindows(title, body) {
  execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
}

function runSoundHook() {
  const command = process.env.GLM_NOTIFY_SOUND_CMD?.trim() || process.env.PI_NOTIFY_SOUND_CMD?.trim();
  if (!command) {
    return;
  }

  try {
    const child = spawn(command, {
      shell: true,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Ignore hook failures to keep notifications best-effort.
  }
}

export function sendSystemNotification(title, body) {
  const isIterm2 = process.env.TERM_PROGRAM === "iTerm.app" || Boolean(process.env.ITERM_SESSION_ID);

  if (process.env.WT_SESSION) {
    notifyWindows(title, body);
  } else if (process.env.KITTY_WINDOW_ID) {
    notifyOSC99(title, body);
  } else if (isIterm2) {
    notifyOSC9(`${title}: ${body}`);
  } else {
    notifyOSC777(title, body);
  }

  runSoundHook();
}

export function markTurnEndNotificationSuppressed(sessionId) {
  if (!sessionId) {
    return;
  }

  getSuppressionStore().set(sessionId, true);
}

export function consumeTurnEndNotificationSuppression(sessionId) {
  if (!sessionId) {
    return false;
  }

  const store = getSuppressionStore();
  const present = store.get(sessionId) === true;
  store.delete(sessionId);
  return present;
}

export function notifyTurnComplete(sessionId) {
  const config = readNotificationRuntimeConfig();
  if (!shouldNotifyForEvent(config, "turnEnd")) {
    return false;
  }

  if (consumeTurnEndNotificationSuppression(sessionId)) {
    return false;
  }

  sendSystemNotification("glm", "Ready for input");
  return true;
}

export function notifyLoopResult(sessionId, args) {
  const config = readNotificationRuntimeConfig();
  if (!shouldNotifyForEvent(config, "loopResult")) {
    return false;
  }

  markTurnEndNotificationSuppressed(sessionId);
  const statusLabel =
    args.status === "succeeded"
      ? "succeeded"
      : args.status === "failed"
        ? "failed"
        : "needs handoff";
  sendSystemNotification(
    `glm loop ${statusLabel}`,
    `${args.task} | rounds ${args.rounds}`,
  );
  return true;
}
