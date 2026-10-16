/** "1 registo aprovado" / "3 registos aprovados": o número com o nome (e o particípio) concordantes. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
