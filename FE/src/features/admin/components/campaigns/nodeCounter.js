// Shared mutable counter used to disambiguate auto-generated node/edge IDs.
// Not a hook because uniqueness only needs to be within a single browser tab.
let counter = 1;

export function nextCounter() {
  return counter++;
}

export function resetCounter() {
  counter = 1;
}
