globalThis.fetch = async () => {
  throw new Error("Live network access is disabled in unit tests.");
};
