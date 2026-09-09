import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

import ImportRecipeTextRoute from "@/app/recipe/import-text";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRecipeCreateScreen = jest.fn();
const fetchMock = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => true,
    replace: mockReplace,
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({ session: { access_token: "access-token" } }),
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

function importedRecipe() {
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
    image_url: null,
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
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImportRecipeTextRoute />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  globalThis.fetch = fetchMock;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRecipeCreateScreen.mockReset();
});

describe("import from text route", () => {
  it("disables blank and duplicate pending submissions", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    renderRoute();

    const input = screen.getByLabelText("Recipe text");
    const submit = screen.getByRole("button", { name: "Import recipe" });
    expect(submit).toBeDisabled();

    fireEvent.changeText(input, "Soup\nIngredients\n1 cup stock");
    expect(submit).not.toBeDisabled();
    fireEvent.press(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const pendingSubmit = screen.getByRole("button", { name: "Importing…" });
    expect(pendingSubmit).toBeDisabled();
    fireEvent.press(pendingSubmit);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending.resolve(response(importedRecipe()));
    await waitFor(() => expect(screen.getByText("Recipe review")).toBeTruthy());
  });

  it.each([
    [
      "insufficient_structure",
      "We couldn’t identify enough recipe information. Edit the text and try again.",
    ],
    [
      "multiple_recipes",
      "We found more than one recipe. Paste one recipe at a time.",
    ],
    [
      "ambiguous_structure",
      "We couldn’t safely separate this recipe. Adjust the pasted text and try again.",
    ],
  ])("maps %s and preserves editable input", async (code, message) => {
    fetchMock.mockResolvedValue(response({ detail: code }, 422));
    renderRoute();

    const input = screen.getByLabelText("Recipe text");
    fireEvent.changeText(input, "Original pasted recipe");
    fireEvent.press(screen.getByRole("button", { name: "Import recipe" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(message),
    );
    expect(screen.getByLabelText("Recipe text").props.value).toBe(
      "Original pasted recipe",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

    fireEvent.changeText(input, "Edited pasted recipe");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("maps network and timeout failures to recoverable messages", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fetchMock
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(new Error("offline"));
    renderRoute();

    const input = screen.getByLabelText("Recipe text");
    fireEvent.changeText(input, "Soup recipe");
    fireEvent.press(screen.getByRole("button", { name: "Import recipe" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This import took too long. Try again.",
      ),
    );

    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn’t connect to Noomori. Check your connection and try again.",
      ),
    );
  });

  it("sends the authenticated request and opens review with adapted defaults", async () => {
    fetchMock.mockResolvedValue(response(importedRecipe()));
    renderRoute();

    fireEvent.changeText(
      screen.getByLabelText("Recipe text"),
      "Soup\nIngredients\n1 cup stock\nInstructions\nSimmer.",
    );
    fireEvent.press(screen.getByRole("button", { name: "Import recipe" }));

    await waitFor(() => expect(mockRecipeCreateScreen).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/recipes\/import\/text$/),
      expect.objectContaining({
        body: JSON.stringify({
          text: "Soup\nIngredients\n1 cup stock\nInstructions\nSimmer.",
        }),
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockRecipeCreateScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        initiallyDirty: true,
        initialDraft: expect.objectContaining({
          photo: null,
          servings: null,
          source: expect.objectContaining({ type: null }),
        }),
      }),
    );
  });
});
