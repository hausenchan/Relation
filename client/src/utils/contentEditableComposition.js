export const COMPOSITION_CONFIRM_ENTER_GUARD_MS = 150;

export function isContentEditableComposing(event, active = false) {
  const nativeEvent = event?.nativeEvent || event;
  return Boolean(
    active
    || event?.isComposing
    || nativeEvent?.isComposing
    || event?.keyCode === 229
    || event?.which === 229
    || nativeEvent?.keyCode === 229
    || nativeEvent?.which === 229
  );
}

export function shouldSuppressEnterAfterComposition(
  event,
  compositionEndedAt,
  now = Date.now(),
) {
  if (event?.key !== 'Enter' || event?.shiftKey || event?.metaKey || event?.ctrlKey || event?.altKey) {
    return false;
  }
  const endedAt = Number(compositionEndedAt);
  const elapsed = Number(now) - endedAt;
  return endedAt > 0 && elapsed >= 0 && elapsed <= COMPOSITION_CONFIRM_ENTER_GUARD_MS;
}
