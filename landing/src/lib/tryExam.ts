import { DEMO_URL } from '@/lib/constants';

/** Open the standalone static demo (no app runtime, no auth). */
export function tryExamAsGuest() {
  window.location.href = DEMO_URL;
}