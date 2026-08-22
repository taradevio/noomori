export type RecipeCardModel = {
  id: string;
  title: string;
  imageUrl?: string | null;
  cookingTimeMinutes?: number | null;
  isShared?: boolean;
  sharedLabel?: string | null;
  cookbookName?: string | null;
};

export type CookbookCardModel = {
  id: string;
  title: string;
  recipeCount: number;
  coverImageUrls?: readonly string[];
};

export type LibraryResource<T> =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; data: readonly T[] };

export type LibrarySection = "recipes" | "cookbooks";

export type RecipesLibraryViewProps = {
  recipes: LibraryResource<RecipeCardModel>;
  cookbooks: LibraryResource<CookbookCardModel>;
  initialSection?: LibrarySection;
  onAddRecipe?: () => void;
  onCookbookPress?: (cookbookId: string) => void;
  onCreateCookbook?: () => void;
  onProfilePress?: () => void;
  onRecipePress?: (recipeId: string) => void;
  onRetryCookbooks?: () => void;
  onRetryRecipes?: () => void;
  onSearchQueryChange?: (section: LibrarySection, query: string) => void;
};

export type RecipeFormMode = "create" | "edit";

// NOTE: These types describe the client-side Add/Edit draft only. They are not
// an API payload or database schema; persistence mapping is intentionally deferred.
export type RecipeIngredient = {
  id: string;
  amount: string;
  unit: string;
  name: string;
  note: string;
};

export type RecipeIngredientGroup = {
  id: string;
  title: string | null;
  ingredients: RecipeIngredient[];
};

export type RecipeInstructionStep = {
  id: string;
  text: string;
};

export type RecipeInstructionGroup = {
  id: string;
  title: string | null;
  steps: RecipeInstructionStep[];
};

export type RecipeSourceType = "my-recipe" | "family-friend" | "website";

export type RecipeSource = {
  type: RecipeSourceType | null;
  name: string;
  url: string;
};

export type RecipeDraft = {
  title: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number;
  ingredientGroups: RecipeIngredientGroup[];
  instructionGroups: RecipeInstructionGroup[];
  notes: string;
  source: RecipeSource;
};
