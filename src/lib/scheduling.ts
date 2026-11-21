import { brazilDayRange, brazilMinutesOfDay } from './time.js'

export interface Interval {
  start: Date
  end: Date
}

// Dois intervalos se cruzam se cada um começa antes de o outro terminar.
export function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && a.end > b.start
}

// "09:30" -> 570
export function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// O atendimento inteiro (início + duração) cabe dentro do expediente?
export function isWithinWorkHours(
  start: Date,
  durationMin: number,
  workStart: string,
  workEnd: string,
) {
  const startMinutes = brazilMinutesOfDay(start)
  return startMinutes >= toMinutes(workStart) && startMinutes + durationMin <= toMinutes(workEnd)
}

interface SlotParams {
  dateString: string
  workStart: string
  workEnd: string
  durationMin: number
  busy: Interval[]
  now: Date
  stepMin?: number
}

// Horários livres de um dia: percorre o expediente de stepMin em stepMin,
// descartando o que já passou e o que bate com um horário ocupado.
export function computeSlots({
  dateString,
  workStart,
  workEnd,
  durationMin,
  busy,
  now,
  stepMin = 30,
}: SlotParams) {
  const { dayStart } = brazilDayRange(dateString)
  const slots: Date[] = []

  for (let minute = toMinutes(workStart); minute + durationMin <= toMinutes(workEnd); minute += stepMin) {
    const start = new Date(dayStart.getTime() + minute * 60000)
    const end = new Date(start.getTime() + durationMin * 60000)

    if (start <= now) continue
    if (busy.some((interval) => overlaps({ start, end }, interval))) continue

    slots.push(start)
  }

  return slots
}

// Dias da semana em que o salão não abre (0 = domingo ... 6 = sábado).
// Configurável por CLOSED_WEEKDAYS="0,1" no .env; padrão: só domingo.
export function closedWeekdays() {
  const raw = process.env.CLOSED_WEEKDAYS ?? '0'

  return raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
}

// "YYYY-MM-DD" cai em um dia em que o salão está fechado?
export function isClosedDay(dateString: string) {
  // Meio-dia em Brasília cai no mesmo dia-calendário em UTC.
  const weekday = new Date(`${dateString}T12:00:00-03:00`).getUTCDay()
  return closedWeekdays().includes(weekday)
}
