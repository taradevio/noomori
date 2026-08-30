import { retryJwtIssuedInFutureOnce } from "./session-profile-retry";

type Result = {
  data: string | null;
  error: { code?: string; message?: string } | null;
};

const success: Result = { data: "profile", error: null };
const jwtIssuedInFuture: Result = {
  data: null,
  error: { code: "PGRST303", message: "JWT issued at future" },
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run(
  results: Result[],
  errorMessage: string,
  expectedRequests: number,
  expectedDelays: number[],
) {
  let requests = 0;
  const delays: number[] = [];
  const result = await retryJwtIssuedInFutureOnce(
    async () => results[requests++]!,
    async (delayMs) => {
      delays.push(delayMs);
    },
  );

  assert(requests === expectedRequests, `${errorMessage}: request count`);
  assert(
    delays.join(",") === expectedDelays.join(","),
    `${errorMessage}: delay sequence`,
  );
  return result;
}

const immediate = await run([success], "immediate success", 1, []);
assert(immediate === success, "Immediate success should be returned unchanged.");

const recovered = await run(
  [jwtIssuedInFuture, success],
  "clock-skew recovery",
  2,
  [2_000],
);
assert(recovered === success, "The retry success should be returned.");

for (const error of [
  { code: "PGRST301", message: "Invalid JWT" },
  { message: "Network request failed" },
]) {
  const failure: Result = { data: null, error };
  const unchanged = await run([failure], "unrelated failure", 1, []);
  assert(unchanged === failure, "Unrelated errors should not be retried.");
}

const repeated = await run(
  [jwtIssuedInFuture, jwtIssuedInFuture],
  "repeated clock skew",
  2,
  [2_000],
);
assert(repeated === jwtIssuedInFuture, "The second failure should be returned.");
