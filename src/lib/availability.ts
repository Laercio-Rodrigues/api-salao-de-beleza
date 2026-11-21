import { prisma } from './prisma.js'
import { notDeletedFilter } from './filters.js'
import { overlaps, type Interval } from './scheduling.js'
import { brazilDayRange, toBrazilDateString } from './time.js'

// Intervalos já ocupados de um profissional em um dia (ignora cancelados e removidos).
export async function findBusyIntervals(professionalId: string, dateString: string) {
  const { dayStart, dayEnd } = brazilDayRange(dateString)

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      date: { gte: dayStart, lte: dayEnd },
      status: { not: 'CANCELED' },
      ...notDeletedFilter,
    },
    include: { service: true },
  })

  return appointments.map((appointment: (typeof appointments)[number]): Interval => ({
    start: appointment.date,
    end: new Date(appointment.date.getTime() + appointment.service.durationMin * 60000),
  }))
}

export async function hasConflict(professionalId: string, start: Date, end: Date) {
  const busy = await findBusyIntervals(professionalId, toBrazilDateString(start))
  return busy.some((interval: Interval) => overlaps(interval, { start, end }))
}