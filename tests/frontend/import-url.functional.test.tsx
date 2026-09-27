import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

import ImportRecipeUrlRoute from "@/app/recipe/import-url";
import { prepareImportedRecipeImage } from "@/shared/components/recipe/recipe-image-import";

const mockPush = jest.fn();
const mockRecipeCreateScreen = jest.fn();
const fetchMock = jest.fn();

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    push: mockPush,
    replace: jest.fn(),
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({ session: { access_token: "access-token" } }),
}));

jest.mock("@/shared/components/recipe/recipe-image-import", () => ({
  cleanupImportedRecipeImage: jest.fn(),
  prepareImportedRecipeImage: jest.fn(),
}));

jest.mock("@/shared/components/recipe/recipe-create-screen", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    RecipeCreateScreen: (props: unknown) => {
      mockRecipeCreateScreen(props);
      return <Text>Recipe review</Text>;
    },
  };
});

function response(body: unknown, status = 200) {
  return {
    json: jest.fn().mockResolvedValue(body),
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

function importedRecipe(imageUrl: string | null = null) {
  return {
    title: "Soup",
    description: null,
    ingredients: [
      {
        title: null,
        items: [{ name: "stock", note: null, quantity: 1, unit: "cup" }],
      },
    ],
    instructions: [{ title: null, steps: [{ text: "Simmer." }] }],
    servings: null,
    prep_time_minutes: 5,
    cook_time_minutes: null,
    total_time_minutes: null,
    additional_time_label: null,
    additional_time_minutes: null,
    nutrition_per_serving: null,
    image_url: imageUrl,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImportRecipeUrlRoute />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  globalThis.fetch = fetchMock;
});

beforeEach(() => {
  jest.spyOn(console, "debug").mockImplementation(() => undefined);
  fetchMock.mockReset();
  mockPush.mockReset();
  mockRecipeCreateScreen.mockReset();
  jest.mocked(prepareImportedRecipeImage).mockReset();
});

describe("import from website route", () => {
  it.each([
    [
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      "The import took too long. Your link is still here. Check your connection and try again.",
    ],
    [
      new TypeError("Network request failed"),
      "Couldn’t import the recipe. Your link is still here. Check your internet connection and try again.",
    ],
  ])(
    "keeps the link after a recoverable request failure",
    async (error, message) => {
      fetchMock.mockRejectedValue(error);
      await renderRoute();

      const input = screen.getByLabelText("Recipe link");
      await fireEvent.changeText(input, "https://example.com/soup");
      await fireEvent.press(
        screen.getByRole("button", { name: "Import recipe" }),
      );

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(message),
      );
      expect(input.props.value).toBe("https://example.com/soup");
    },
  );

  it("offers text import when the website times out", async () => {
    fetchMock.mockResolvedValue(response({ detail: "fetch_timeout" }, 504));
    await renderRoute();

    await fireEvent.changeText(
      screen.getByLabelText("Recipe link"),
      "https://example.com/soup",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Import recipe" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This page took too long to respond. Try again, or paste the recipe text instead.",
      ),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Paste recipe text instead" }),
    );
    expect(mockPush).toHaveBeenCalledWith("/recipe/import-text");
  });

  it("opens review with a clear notice when only the photo import fails", async () => {
    fetchMock.mockResolvedValue(
      response(importedRecipe("https://example.com/soup.jpg")),
    );
    jest
      .mocked(prepareImportedRecipeImage)
      .mockRejectedValue(new TypeError("Network request failed"));
    await renderRoute();

    await fireEvent.changeText(
      screen.getByLabelText("Recipe link"),
      "https://example.com/soup",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Import recipe" }),
    );

    await waitFor(() => expect(screen.getByText("Recipe review")).toBeTruthy());
    expect(mockRecipeCreateScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        initialNotice:
          "Recipe imported without its photo. You can choose a photo before saving.",
      }),
    );
  });

  it("explains when a website import is taking longer than usual", async () => {
    jest.useFakeTimers();
    try {
      const pending = deferred<Response>();
      fetchMock.mockReturnValue(pending.promise);
      await renderRoute();

      await fireEvent.changeText(
        screen.getByLabelText("Recipe link"),
        "https://example.com/soup",
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "Import recipe" }),
      );

      await act(async () => jest.advanceTimersByTime(4_000));
      expect(
        screen.getByText(
          "Still importing. Some websites respond slowly. Your link will stay here if the import fails.",
        ),
      ).toBeTruthy();

      pending.resolve(response(importedRecipe()));
      await act(async () => undefined);
      expect(screen.getByText("Recipe review")).toBeTruthy();
      expect(
        screen.queryByText(
          "Still importing. Some websites respond slowly. Your link will stay here if the import fails.",
        ),
      ).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
