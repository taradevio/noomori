import { render } from "@testing-library/react-native";

import { SplashScreenController } from "@/shared/components/splash-screen-controller";

const mockHide = jest.fn();
let mockSessionState = "loading";

jest.mock("expo-splash-screen", () => ({ hide: () => mockHide() }));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({ state: mockSessionState }),
}));

it("hides the native splash once initial session loading finishes", async () => {
  const view = await render(<SplashScreenController />);
  expect(mockHide).not.toHaveBeenCalled();

  mockSessionState = "ready";
  await view.rerender(<SplashScreenController />);
  expect(mockHide).toHaveBeenCalledTimes(1);

  mockSessionState = "error";
  await view.rerender(<SplashScreenController />);
  expect(mockHide).toHaveBeenCalledTimes(1);
});
