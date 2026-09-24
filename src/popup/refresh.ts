import type { RuntimeResponse } from '../shared/messages';

export function refreshErrorMessage(result: RuntimeResponse): string | undefined {
  return 'ok' in result && result.ok === false ? result.error : undefined;
}
