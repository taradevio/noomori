import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert, Keyboard } from "react-native";

import { apiConfig } from "@/config/api";
import { RecipeCreateScreen } from "@/shared/components/recipe/recipe-create-screen";
import type { PreparedRecipePhoto } from "@/shared/components/recipe/recipe-image";
import { attachRecipeImage } from "@/shared/components/recipe/recipe-image-storage";
import type { ApiRecipe } from "@/shared/components/recipe/recipe-response";
import {
  toImportedRecipeDraft,
  type ImportedRecipeTextDraft,
} from "@/shared/components/recipe/recipe-text-import";
import type { RecipeDraft } from "@/shared/types";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "22222222-2222-4222-8222-222222222222"),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => false,
    replace: jest.fn(),
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({
    session: {
      access_token: "access-token",
      user: { id: "11111111-1111-4111-8111-111111111111" },
    },
  }),
}));

jest.mock("@/shared/components/recipe/recipe-image-storage", () => ({
  attachRecipeImage: jest.fn(),
}));

const fetchMock = jest.fn();

const draft: RecipeDraft = {
  title: "Original soup",
  photo: null,
  prepMinutes: null,
  cookMinutes: null,
  servings: 2,
  ingredientGroups: [],
  instructionGroups: [],
  notes: "",
  nutrition: {
    calories: "",
    fatGrams: "",
    saturatedFatGrams: "",
    cholesterolMilligrams: "",
    sodiumMilligrams: "",
    carbohydrateGrams: "",
    dietaryFiberGrams: "",
    sugarGrams: "",
    proteinGrams: "",
  },
  source: { type: "my-recipe", name: "", url: "" },
};

function apiRecipe(title: string): ApiRecipe {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    is_shared: false,
    title,
    description: null,
    image_path: null,
    image_url: null,
    ingredients: [],
    instructions: [],
    servings: 2,
    prep_time_minutes: null,
    cook_time_minutes: null,
    nutrition_per_serving: null,
    source_type: "my_recipe",
    source_person_name: null,
    source_url: null,
  };
}

function response(recipe: ApiRecipe) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(recipe),
  } as unknown as Response;
}

function renderScreen(
  initialDraft = draft,
  initialPreparedPhoto: PreparedRecipePhoto | null = null,
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RecipeCreateScreen
        initialDraft={initialDraft}
        initialPreparedPhoto={initialPreparedPhoto}
      />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  globalThis.fetch = fetchMock;
});

beforeEach(() => {
  fetchMock.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest.spyOn(console, "debug").mockImplementation(() => undefined);
});

describe("recipe creation identity", () => {
  it("uses the configured timeout signal for the create request", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = jest.fn(() => timeoutSignal);
    const originalTimeout = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: timeout,
    });
    try {
      fetchMock.mockResolvedValueOnce(response(apiRecipe("Original soup")));
      await renderScreen();

      await fireEvent.press(screen.getByTestId("save-recipe-placeholder"));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      expect(timeout).toHaveBeenCalledWith(apiConfig.timeout);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        signal: timeoutSignal,
      });
    } finally {
      Object.defineProperty(AbortSignal, "timeout", {
        configurable: true,
        value: originalTimeout,
      });
    }
  });

  it("reuses one creation ID when an edited draft is retried", async () => {
    const photo = {
      uri: "file:///original.webp",
      width: 800,
      height: 600,
      fileName: "original.webp",
      mimeType: "image/webp",
    };
    const preparedPhoto: PreparedRecipePhoto = {
      uri: photo.uri,
      width: photo.width,
      height: photo.height,
      bytes: new ArrayBuffer(1),
    };
    fetchMock
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(response(apiRecipe("Edited soup")));
    await renderScreen({ ...draft, photo }, preparedPhoto);

    await fireEvent.press(screen.getByTestId("save-recipe-placeholder"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("save-recipe-placeholder")).toBeEnabled(),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      "Save interrupted",
      "Your changes are still here. Check your connection and try again.",
    );
    expect(screen.getByLabelText("Recipe title")).toHaveProp(
      "value",
      "Original soup",
    );
    expect(screen.getByText("Remove photo")).toBeTruthy();
    expect(attachRecipeImage).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Remove photo"));
    await fireEvent.changeText(
      screen.getByLabelText("Recipe title"),
      "Edited soup",
    );
    await fireEvent.press(screen.getByTestId("save-recipe-placeholder"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstRequest = fetchMock.mock.calls[0][1] as RequestInit;
    const secondRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(firstRequest.headers).toMatchObject({
      "Recipe-Creation-Id": "22222222-2222-4222-8222-222222222222",
    });
    expect(secondRequest.headers).toMatchObject({
      "Recipe-Creation-Id": "22222222-2222-4222-8222-222222222222",
    });
    expect(JSON.parse(firstRequest.body as string).title).toBe("Original soup");
    expect(JSON.parse(secondRequest.body as string).title).toBe("Edited soup");
  });

  it("keeps rapid Save presses to one in-flight request", async () => {
    let completeRequest!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        completeRequest = resolve;
      }),
    );
    await renderScreen();

    const save = screen.getByTestId("save-recipe-placeholder");
    const firstPress = fireEvent.press(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await fireEvent.press(save);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      completeRequest(response(apiRecipe("Original soup")));
    });
    await firstPress;
  });

  it("blocks an over-limit imported initial draft until it is corrected", async () => {
    const imported: ImportedRecipeTextDraft = {
      title: "Imported soup",
      description: null,
      ingredients: [
        {
          title: null,
          items: [
            {
              name: "x".repeat(301),
              quantity: 1,
              unit: "cup",
              note: null,
            },
          ],
        },
      ],
      instructions: [],
      servings: 2,
      prep_time_minutes: null,
      cook_time_minutes: null,
      nutrition_per_serving: null,
      image_url: null,
    };
    const importedDraft: RecipeDraft = {
      ...toImportedRecipeDraft(imported),
      source: { type: "my-recipe", name: "", url: "" },
    };
    await renderScreen(importedDraft);

    const ingredientName = screen.getByDisplayValue("x".repeat(301));
    expect(ingredientName).toHaveProp("value", "x".repeat(301));

    await fireEvent.press(screen.getByTestId("save-recipe-placeholder"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Use 300 characters or fewer.")).toHaveProp(
      "accessibilityRole",
      "alert",
    );

    fetchMock.mockResolvedValueOnce(response(apiRecipe("Imported soup")));
    await fireEvent.changeText(ingredientName, "stock");
    await fireEvent.press(screen.getByTestId("save-recipe-placeholder"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("delegates recipe input visibility to keyboard-aware scrolling", async () => {
    const addKeyboardListener = jest.spyOn(Keyboard, "addListener");
    await renderScreen();

    expect(screen.getByTestId("recipe-form-scroll")).toHaveProp(
      "bottomOffset",
      24,
    );
    expect(screen.getByTestId("recipe-form-scroll")).toHaveProp(
      "mode",
      "insets",
    );
    expect(screen.getByTestId("recipe-form-scroll")).toHaveProp(
      "keyboardDismissMode",
      "interactive",
    );
    expect(screen.getByTestId("recipe-form-scroll")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );

    await fireEvent(screen.getByLabelText("Recipe notes"), "focus");
    expect(addKeyboardListener).not.toHaveBeenCalled();
  });
});
