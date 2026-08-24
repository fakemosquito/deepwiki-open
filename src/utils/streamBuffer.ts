type Timer = ReturnType<typeof setTimeout>;

/**
 * Coalesce high-frequency stream updates onto one UI flush per interval.
 * Call flush() when the stream ends so the last tokens are not delayed.
 */
export function createStreamBuffer(
  onFlush: (value: string) => void,
  intervalMs = 80,
) {
  let latest = '';
  let timer: Timer | null = null;

  const emit = () => {
    timer = null;
    onFlush(latest);
  };

  return {
    push(value: string) {
      latest = value;
      if (timer == null) {
        timer = setTimeout(emit, intervalMs);
      }
    },
    flush() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      onFlush(latest);
    },
    reset() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      latest = '';
    },
  };
}
