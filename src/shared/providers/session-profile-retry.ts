const JWT_CLOCK_SKEW_RETRY_DELAY_MS = 2_000;

type ErrorResult = {
  error: { code?: string; message?: string } | null;
};

function isJwtIssuedInFuture(error: ErrorResult["error"]) {
  return (
    error?.code === "PGRST303" && error.message === "JWT issued at future"
  );
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function retryJwtIssuedInFutureOnce<T extends ErrorResult>(
  request: () => PromiseLike<T>,
  delay: (delayMs: number) => Promise<void> = wait,
) {
  const result = await request();

  if (!isJwtIssuedInFuture(result.error)) return result;

  await delay(JWT_CLOCK_SKEW_RETRY_DELAY_MS);
  return request();
}
