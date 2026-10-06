export const requireArg = (index: number, name: string): string => {
  const value = process.argv[index + 2]
  if (!value) throw new Error(`missing argument <${name}>`)
  return value
}
