import { describe, expect, it } from 'vitest';
import { playbackErrorMessage } from '../audio/useSnippetPlayer';

function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

describe('playbackErrorMessage', () => {
  // Re-triggering a snippet aborts the previous play(); that rejection is routine bookkeeping,
  // not a broken clip, and showing it puts a red error under a button that plays perfectly well.
  it('swallows an AbortError from an interrupted play()', () => {
    expect(
      playbackErrorMessage(namedError('AbortError', 'The play() request was interrupted')),
    ).toBeUndefined();
  });

  it('explains an autoplay block in terms of what to do about it', () => {
    const message = playbackErrorMessage(
      namedError('NotAllowedError', "play() failed because the user didn't interact"),
    );

    expect(message).toContain('Press Play again');
  });

  it('passes any other failure through as-is', () => {
    expect(playbackErrorMessage(namedError('NotSupportedError', 'Format not supported'))).toBe(
      'Format not supported',
    );
  });
});
