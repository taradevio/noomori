export type RecipeCardModel = {
  id: string;
  title: string;
  imagePath?: string | null;
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
export type LibraryMode = "personal" | "household";

export type RecipesLibraryViewProps = {
  recipes: LibraryResource<RecipeCardModel>;
  cookbooks: LibraryResource<CookbookCardModel>;
  householdName?: string;
  mode?: LibraryMode;
  onAddRecipe?: () => void;
  onCookbookPress?: (cookbookId: string) => void;
  onCreateCookbook?: () => void;
  onRecipeImageError?: (imagePath: string) => void;
  onRecipePress?: (recipeId: string) => void;
  onRetryCookbooks?: () => void;
  onRetryRecipes?: () => void;
  onSectionChange?: (section: LibrarySection) => void;
  onSearchQueryChange?: (section: LibrarySection, query: string) => void;
  onShareRecipe?: () => void;
  section?: LibrarySection;
};

export type RecipeFormMode = "create" | "edit";

// NOTE: These types describe the client-side Add/Edit draft only. The create
// route maps them to the canonical API payload before persistence.
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

export type RecipePhotoDraft = {
  uri: string;
  width: number;
  height: number;
  fileName: string | null;
  mimeType: string | null;
  imagePath?: string | null;
};

export type RecipeNutrition = {
  calories: string;
  fatGrams: string;
  saturatedFatGrams: string;
  cholesterolMilligrams: string;
  sodiumMilligrams: string;
  carbohydrateGrams: string;
  dietaryFiberGrams: string;
  sugarGrams: string;
  proteinGrams: string;
};

export type RecipeDraft = {
  title: string;
  photo: RecipePhotoDraft | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number;
  ingredientGroups: RecipeIngredientGroup[];
  instructionGroups: RecipeInstructionGroup[];
  notes: string;
  nutrition: RecipeNutrition;
  source: RecipeSource;
};

export type RecipeDetailModel = Omit<RecipeDraft, "photo"> & {
  id: string;
  imagePath: string | null;
  imageUrl: string | null;
  isShared: boolean;
};
