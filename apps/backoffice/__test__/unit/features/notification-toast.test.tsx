import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TOAST_AUTO_CLOSE_MS,
  buildToastOptions,
  getToastColor,
  showToastNotification,
} from "@/features/notifications/notification-toast";

const showMock = vi.hoisted(() => vi.fn());

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: showMock,
  },
}));

describe("notification toast wrapper", () => {
  it("maps supported types to Mantine colors", () => {
    expect(getToastColor("info")).toBe("blue");
    expect(getToastColor("success")).toBe("green");
    expect(getToastColor("warning")).toBe("yellow");
    expect(getToastColor("error")).toBe("red");
  });

  it("uses a 5s default auto-dismiss", () => {
    const options = buildToastOptions({ title: "Saved", message: "Done", type: "success" });
    expect(options.autoClose).toBe(DEFAULT_TOAST_AUTO_CLOSE_MS);
    expect(options.title).toBe("Saved");
    expect(options.message).toBe("Done");
    expect(options.color).toBe("green");
  });

  it("delegates to Mantine notifications", () => {
    showMock.mockClear();
    showToastNotification({ title: "Failed", message: "Try again", type: "error" }, 1234);
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Failed",
      message: "Try again",
      color: "red",
      autoClose: 1234,
    }));
  });
});
