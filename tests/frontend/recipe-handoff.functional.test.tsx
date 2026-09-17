import { fireEvent, render, screen } from "@testing-library/react-native";

import RecipeHandoffsScreen from "@/app/household/recipe-handoffs";

const mockMutate = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  DefaultTheme: { colors: {} },
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));

jest.mock("@/shared/providers/session-providers", () => ({
  useSession: () => ({ session: { access_token: "token" } }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      {
        id: "handoff-id",
        departed_user_display_name: "Tara",
        created_at: "2026-09-16T00:00:00Z",
        items: [
          {
            id: "item-id",
            snapshot_schema_version: 1,
            image_path: null,
            image_url: null,
            snapshot: {
              title: "Tomato soup",
              description: null,
              ingredients: [],
              instructions: [],
              servings: 2,
              nutrition_per_serving: null,
              prep_time_minutes: 5,
              cook_time_minutes: 20,
              total_time_minutes: 25,
              additional_time_label: null,
              additional_time_minutes: null,
              source_type: "my_recipe",
              source_person_name: null,
              source_url: null,
            },
          },
        ],
      },
    ],
    isError: false,
    isPending: false,
    refetch: jest.fn(),
  }),
  useMutation: () => ({
    isError: false,
    isPending: false,
    mutate: mockMutate,
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@/shared/ui", () => ({
  toast: { success: jest.fn() },
}));

jest.mock("@/shared/components/recipe/recipe-detail-view", () => {
  const { Pressable, Text, View } = jest.requireActual("react-native");
  return {
    RecipeDetailView: ({ onBack, recipe }: { onBack: () => void; recipe: { title: string } }) => (
      <View>
        <Pressable onPress={onBack}><Text>Back from snapshot</Text></Pressable>
        <Text>{recipe.title}</Text>
      </View>
    ),
  };
});

describe("recipe handoff review", () => {
  beforeEach(() => mockMutate.mockClear());

  it("opens an isolated snapshot and submits an individual decision", async () => {
    await render(<RecipeHandoffsScreen />);

    expect(screen.getByText("From Tara")).toBeTruthy();
    await fireEvent.press(screen.getByText("Review recipe"));
    expect(screen.getByText("Tomato soup")).toBeTruthy();

    await fireEvent.press(screen.getByText("Keep"));
    expect(mockMutate).toHaveBeenCalledWith({
      handoffId: "handoff-id",
      decision: "keep",
      itemIds: ["item-id"],
    });
  });
});
