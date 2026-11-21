export const BRAZIL_TZ = 'America/Sao_Paulo'

// Dia-calendário ("YYYY-MM-DD") em Brasília em que um instante UTC cai.
export function toBrazilDateString(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: BRAZIL_TZ })
}

// Início e fim do dia em Brasília, a partir de "YYYY-MM-DD".
export function brazilDayRange(dateString: string) {
  return {
    dayStart: new Date(`${dateString}T00:00:00-03:00`),
    dayEnd: new Date(`${dateString}T23:59:59.999-03:00`),
  }
}

// Minutos desde 00:00 no horário de Brasília (09:30 -> 570).
export function brazilMinutesOfDay(date: Date) {
  const time = date.toLocaleTimeString('en-GB', {
    timeZone: BRAZIL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}