// Shareable reconstruction links.

/** alg.cubing.net encodes spaces as _ and primes as -. */
function encode(alg: string): string {
  return encodeURIComponent(alg).replace(/%20/g, '_').replace(/'/g, '-');
}

export function algCubingUrl(setup: string, alg: string, title?: string): string {
  const params = [`setup=${encode(setup)}`, `alg=${encode(alg)}`];
  if (title) params.push(`title=${encodeURIComponent(title)}`);
  return `https://alg.cubing.net/?${params.join('&')}`;
}
