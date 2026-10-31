import { describe, expect, it } from 'vitest';
import { algCubingUrl } from './links';

describe('algCubingUrl', () => {
  it("encodes spaces, primes, comments and newlines the way alg.cubing.net expects", () => {
    expect(algCubingUrl("R U R'", "y' U R U' R' // pair\nU2", 'My solve')).toBe(
      'https://alg.cubing.net/?setup=R_U_R-&alg=y-_U_R_U-_R-_%2F%2F_pair%0AU2&title=My%20solve',
    );
  });
});
